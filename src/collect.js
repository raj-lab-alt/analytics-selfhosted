const db = require('./db');
const crypto = require('crypto');
const geoip = require('./geoip');

const SECRET = process.env.HASH_SECRET || 'analytics-salt-2024';

function hashIP(ip) {
  return crypto.createHash('sha256').update(ip + ':' + SECRET).digest('hex').substring(0, 16);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value + ':' + SECRET).digest('hex');
}

// raw_events buffer
let buffer = [];
let bufferSize = 0;
const FLUSH_THRESHOLD = 50;
const FLUSH_INTERVAL = 5000;

let heatBuffer = [];
const HEAT_FLUSH_THRESHOLD = 20;
const HEAT_FLUSH_INTERVAL = 3000;

let formBuffer = [];

setInterval(() => flushBuffer(), FLUSH_INTERVAL);
setInterval(() => flushHeatBuffer(), HEAT_FLUSH_INTERVAL);
setInterval(() => flushFormBuffer(), HEAT_FLUSH_INTERVAL);

async function flushBuffer() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  bufferSize = 0;
  try {
    const supabase = db.getClient();
    const { error } = await supabase.from('raw_events').insert(batch);
    if (error) {
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

async function flushHeatBuffer() {
  if (heatBuffer.length === 0) return;
  const batch = heatBuffer.splice(0);
  try {
    const supabase = db.getClient();
    const { error } = await supabase.from('heatmap_events').insert(batch);
    if (error) console.error('Heat flush error:', error.message);
  } catch (err) {
    console.error('Heat flush error:', err.message);
  }
}

async function flushFormBuffer() {
  if (formBuffer.length === 0) return;
  const batch = formBuffer.splice(0);
  try {
    const supabase = db.getClient();
    const { error } = await supabase.from('form_events').insert(batch);
    if (error) console.error('Form flush error:', error.message);
  } catch (err) {
    console.error('Form flush error:', err.message);
  }
}

function classifyTraffic(referrer, utmSource, utmMedium) {
  const url = (referrer || '').toLowerCase();
  const utmSrc = (utmSource || '').toLowerCase();
  const utmMed = (utmMedium || '').toLowerCase();
  if (!url && !utmSrc) return { type: 'direct', source: 'Direct' };
  if (utmMed === 'cpc' || utmMed === 'ppc' || utmMed === 'paid' || utmMed === 'cpm' || utmMed === 'display' || utmMed === 'social') return { type: 'paid', source: utmSrc ? utmSrc.charAt(0).toUpperCase() + utmSrc.slice(1) : 'Paid' };
  const social = { facebook: 'Facebook', twitter: 'Twitter', instagram: 'Instagram', linkedin: 'LinkedIn', pinterest: 'Pinterest', tiktok: 'TikTok', snapchat: 'Snapchat', youtube: 'YouTube', reddit: 'Reddit', whatsapp: 'WhatsApp', telegram: 'Telegram' };
  for (const [d, n] of Object.entries(social)) { if (url.includes(d)) return { type: 'social', source: n }; }
  const search = { google: 'Google', bing: 'Bing', yahoo: 'Yahoo', duckduckgo: 'DuckDuckGo', yandex: 'Yandex', baidu: 'Baidu', ecosia: 'Ecosia', qwant: 'Qwant' };
  for (const [d, n] of Object.entries(search)) { if (url.includes(d)) return { type: 'organic', source: n }; }
  try { const host = new URL(referrer).hostname.replace('www.', ''); return { type: 'referral', source: host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1) }; } catch (e) {}
  return { type: 'referral', source: 'Referral' };
}

async function processEvent(req) {
  const b = req.body;
  const { site_id, url, referrer, session_id, event_type, started_at, utm_source, utm_medium, utm_campaign } = b;
  if (!site_id || !session_id) return;

  // Validate event_type
  const validTypes = ['pageview','exit','heartbeat','click','move','touch','scroll','cta_click','form_event'];
  if (!validTypes.includes(event_type || '')) return;

  const rawIp = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
  const ip = rawIp.split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const ipHash = hashIP(ip);
  const uaHash = sha256(ua);

  const geo = await geoip.lookup(ip);
  const now = new Date().toISOString();
  const sessionStarted = started_at ? new Date(parseInt(started_at)).toISOString() : now;
  const traffic = classifyTraffic(referrer || '', utm_source, utm_medium);
  const trafficSource = traffic.type;

  const supabase = db.getClient();

  // Upsert session
  const sessionData = {
    session_id,
    site_id,
    page: url || '/',
    referrer: referrer || '',
    country: geo.country,
    city: geo.city,
    lat: geo.lat,
    lon: geo.lon,
    ua,
    visitor_id: b.visitor_id || '',
    device_type: b.device_type || '',
    utm_source: utm_source || '',
    utm_medium: utm_medium || '',
    utm_campaign: utm_campaign || '',
    last_ping: now,
  };
  try {
    await supabase.from('active_sessions').upsert(sessionData, { onConflict: 'session_id' });
  } catch (e) {}

  // Route to appropriate table based on event_type
  if (event_type === 'click' || event_type === 'cta_click') {
    try {
      const size = getDocSize(b);
      await supabase.from('heatmap_clicks').insert({
        site_id,
        session_id,
        visitor_id: b.visitor_id || '',
        page_url: url || '/',
        page_path: getPath(url),
        x_pixel: b.x || 0,
        y_pixel: b.y || 0,
        x_percent: b.x_ratio ? b.x_ratio * 100 : ((b.x || 0) / (size.w || 1)) * 100,
        y_percent: b.y_ratio ? b.y_ratio * 100 : ((b.y || 0) / (size.h || 1)) * 100,
        scroll_y: b.scroll_y || 0,
        viewport_w: b.viewport_w || 0,
        viewport_h: b.viewport_h || 0,
        document_w: b.document_w || 0,
        document_h: b.document_h || 0,
        element_tag: b.element_tag || '',
        element_id: b.element_id || '',
        element_class: b.element_class || '',
        element_text_hash: b.element_text_hash || '',
        cta_name: b.cta_name || '',
        is_cta: !!b.is_cta,
        is_dead_click: !!b.is_dead_click,
        is_rage_click: !!b.is_rage_click,
        device_type: b.device_type || '',
        utm_source: utm_source || '',
        utm_medium: utm_medium || '',
        utm_campaign: utm_campaign || '',
      });
    } catch (e) { console.error('Click insert error:', e.message); }
  }

  if (event_type === 'scroll' && b.max_scroll_percent !== undefined) {
    try {
      const existing = await supabase
        .from('heatmap_scrolls')
        .select('id, max_scroll_percent')
        .eq('session_id', session_id)
        .eq('page_url', url || '/')
        .maybeSingle();
      if (existing.data) {
        if (b.max_scroll_percent > existing.data.max_scroll_percent) {
          await supabase.from('heatmap_scrolls').update({
            max_scroll_percent: b.max_scroll_percent,
            max_scroll_y: b.max_scroll_y || 0,
            viewport_h: b.viewport_h || 0,
            document_h: b.document_h || 0,
            time_on_page_seconds: b.time_on_page_seconds || 0,
            device_type: b.device_type || '',
          }).eq('id', existing.data.id);
        }
      } else {
        await supabase.from('heatmap_scrolls').insert({
          site_id,
          session_id,
          visitor_id: b.visitor_id || '',
          page_url: url || '/',
          page_path: getPath(url),
          max_scroll_percent: b.max_scroll_percent,
          max_scroll_y: b.max_scroll_y || 0,
          viewport_h: b.viewport_h || 0,
          document_h: b.document_h || 0,
          time_on_page_seconds: b.time_on_page_seconds || 0,
          device_type: b.device_type || '',
          utm_source: utm_source || '',
          utm_medium: utm_medium || '',
          utm_campaign: utm_campaign || '',
        });
      }
    } catch (e) { console.error('Scroll upsert error:', e.message); }
  }

  if (event_type === 'form_event') {
    formBuffer.push({
      site_id,
      session_id,
      visitor_id: b.visitor_id || '',
      page_url: url || '/',
      page_path: getPath(url),
      event_name: b.event_name || '',
      form_name: b.form_name || '',
      field_name: b.field_name || '',
      field_type: b.field_type || '',
      field_order: b.field_order || 0,
      device_type: b.device_type || '',
    });
  }

  if (event_type === 'move' || event_type === 'touch' || (event_type === 'scroll' && b.max_scroll_percent === undefined)) {
    heatBuffer.push({
      site_id,
      page_url: url || '/',
      x: b.x || 0, y: b.y || 0,
      x_ratio: b.x_ratio || 0, y_ratio: b.y_ratio || 0,
      doc_height: b.doc_height || 0,
      viewport_w: b.viewport_w || 0, viewport_h: b.viewport_h || 0,
      scroll_y: b.scroll_y || 0, event_type,
      session_id,
    });
    if (heatBuffer.length >= HEAT_FLUSH_THRESHOLD) flushHeatBuffer();
  }

  buffer.push({
    site_id, api_key: '', page: url || '/', referrer: referrer || '', ua, ip_hash: ipHash,
    country: geo.country, city: geo.city,
    screen_w: b.screen_w || 0, screen_h: b.screen_h || 0,
    session_id, event_type: event_type || 'pageview', created_at: now,
    traffic_source: trafficSource,
    utm_source: utm_source || '', utm_medium: utm_medium || '', utm_campaign: utm_campaign || '',
  });
  bufferSize++;
  if (bufferSize >= FLUSH_THRESHOLD || event_type === 'exit') flushBuffer();
}

function getDocSize(b) {
  return { w: b.document_w || 1920, h: b.document_h || 1080 };
}

function getPath(url) {
  if (!url) return '/';
  try { return new URL(url).pathname; } catch(e) { return url; }
}

async function collect(req, res) {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const evt of events) {
    req.body = evt;
    await processEvent(req);
  }
  res.json({ ok: true });
}

module.exports = { collect, processEvent };
