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
    if (error) console.error('Flush error:', error.message);
  } catch (err) {
    console.error('Flush error:', err.message);
  }
}

async function collect(req, res) {
  const { site_id, url, referrer, screen_w, screen_h, session_id, event_type, started_at, x, y, viewport_w, viewport_h, scroll_y } = req.body;
  if (!site_id || !session_id) return res.json({ ok: false, error: 'missing fields' });

  const rawIp = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
  const ip = rawIp.split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const ipHash = hashIP(ip);

  const geo = await geoip.lookup(ip);
  const now = new Date().toISOString();
  const sessionStarted = started_at ? new Date(parseInt(started_at)).toISOString() : now;

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
      started_at: sessionStarted,
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
  });
  bufferSize++;
  if (bufferSize >= FLUSH_THRESHOLD || event_type === 'exit') flushBuffer();

  res.json({ ok: true });
}

module.exports = { collect };
