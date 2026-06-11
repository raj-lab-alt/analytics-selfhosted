const db = require('./db');
const crypto = require('crypto');
const geoip = require('./geoip');

function hashIP(ip) {
  return crypto.createHash('sha256').update(ip + 'analytics-salt-2024').digest('hex').substring(0, 16);
}

let buffer = [];
let bufferSize = 0;
const FLUSH_THRESHOLD = 50;
const FLUSH_INTERVAL = 5000;

setInterval(() => flushBuffer(), FLUSH_INTERVAL);

async function flushBuffer() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  bufferSize = 0;
  try {
    const supabase = db.getClient();
    const { error } = await supabase.from('raw_events').insert(batch);
    if (error) {
      // Fallback: strip unknown columns (migration not yet run)
      const fallback = batch.map(r => ({
        site_id: r.site_id, api_key: r.api_key, page: r.page, referrer: r.referrer,
        ua: r.ua, ip_hash: r.ip_hash, country: r.country, city: r.city,
        screen_w: r.screen_w, screen_h: r.screen_h,
        session_id: r.session_id, event_type: r.event_type, created_at: r.created_at,
      }));
      const { error: e2 } = await supabase.from('raw_events').insert(fallback);
      if (e2) console.error('Flush error:', e2.message);
    }
  } catch (err) {
    console.error('Flush error:', err.message);
  }
}

function classifyTraffic(referrer, utmSource, utmMedium) {
  if (!referrer) return 'direct';
  const url = referrer.toLowerCase();
  if (utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'paid' || utmMedium === 'cpm' || utmMedium === 'display') return 'paid';
  const social = ['facebook', 'twitter', 'instagram', 'linkedin', 'pinterest', 'tiktok', 'snapchat', 'youtube', 'reddit', 'whatsapp', 'telegram'];
  if (social.some(d => url.includes(d))) return 'social';
  const search = ['google', 'bing', 'yahoo', 'duckduckgo', 'yandex', 'baidu', 'ecosia', 'qwant'];
  if (search.some(e => url.includes(e))) return 'organic';
  if (utmSource && (utmMedium === 'cpc' || utmMedium === 'paid')) return 'paid';
  return 'referral';
}

async function collect(req, res) {
  const { site_id, url, referrer, screen_w, screen_h, session_id, event_type, started_at, utm_source, utm_medium, utm_campaign, x, y, viewport_w, viewport_h, scroll_y } = req.body;
  if (!site_id || !session_id) return res.json({ ok: false, error: 'missing fields' });

  const rawIp = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
  const ip = rawIp.split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const ipHash = hashIP(ip);

  const geo = await geoip.lookup(ip);
  const now = new Date().toISOString();
  const sessionStarted = started_at ? new Date(parseInt(started_at)).toISOString() : now;
  const trafficSource = classifyTraffic(referrer || '', utm_source, utm_medium);

  const supabase = db.getClient();

  try {
    await supabase.from('active_sessions').upsert({
      session_id,
      site_id,
      page: url || '/',
      referrer: referrer || '',
      country: geo.country,
      city: geo.city,
      lat: geo.lat,
      lon: geo.lon,
      ua,
      last_ping: now,
    }, { onConflict: 'session_id' });
  } catch (e) {}

  let apiKey = '';
  try {
    const { data: site } = await supabase.from('sites').select('api_key').eq('id', site_id).maybeSingle();
    if (site) apiKey = site.api_key;
  } catch (e) {}

  if (event_type === 'click' || event_type === 'move' || event_type === 'scroll') {
    try {
      await supabase.from('heatmap_events').insert({
        site_id,
        page_url: url || '/',
        x: x || 0, y: y || 0,
        viewport_w: viewport_w || 0, viewport_h: viewport_h || 0,
        scroll_y: scroll_y || 0, event_type,
        session_id,
      });
    } catch (e) {}
  }

  buffer.push({
    site_id, api_key: apiKey, page: url || '/', referrer: referrer || '', ua, ip_hash: ipHash,
    country: geo.country, city: geo.city,
    screen_w: screen_w || 0, screen_h: screen_h || 0,
    session_id, event_type: event_type || 'pageview', created_at: now,
    traffic_source: trafficSource,
    utm_source: utm_source || '', utm_medium: utm_medium || '', utm_campaign: utm_campaign || '',
  });
  bufferSize++;
  if (bufferSize >= FLUSH_THRESHOLD || event_type === 'exit') flushBuffer();

  res.json({ ok: true });
}

module.exports = { collect };
