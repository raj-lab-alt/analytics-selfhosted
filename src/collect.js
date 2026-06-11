const db = require('./db');
const crypto = require('crypto');

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
    const values = [];
    const placeholders = batch.map((e, i) => {
      const off = i * 11;
      values.push(e.site_id, e.page, e.referrer, e.ua, e.ip_hash, e.country, e.city, e.screen_w, e.screen_h, e.session_id, e.event_type);
      return `($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7}, $${off + 8}, $${off + 9}, $${off + 10}, $${off + 11})`;
    }).join(',');
    await db.query(
      `INSERT INTO raw_events (site_id, page, referrer, ua, ip_hash, country, city, screen_w, screen_h, session_id, event_type) VALUES ${placeholders}`,
      values
    );
  } catch (err) {
    console.error('Flush error:', err.message);
  }
}

async function collect(req, res) {
  const { site_id, url, referrer, screen_w, screen_h, session_id, event_type, x, y, viewport_w, viewport_h, scroll_y } = req.body;
  if (!site_id || !session_id) return res.json({ ok: false, error: 'missing fields' });

  const ip = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
  const ua = req.headers['user-agent'] || '';
  const ipHash = hashIP(ip);
  const country = '';

  const event = {
    site_id, page: url || '/', referrer: referrer || '', ua, ip_hash: ipHash,
    country, city: '', screen_w: screen_w || 0, screen_h: screen_h || 0,
    session_id, event_type: event_type || 'pageview'
  };

  try {
    await db.query(
      `INSERT INTO active_sessions (session_id, site_id, page, referrer, country, ua, last_ping)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (session_id) DO UPDATE SET page=EXCLUDED.page, referrer=EXCLUDED.referrer, last_ping=NOW()`,
      [session_id, site_id, url || '/', referrer || '', country, ua]
    );
  } catch (e) {}

  if (event_type === 'click' || event_type === 'move' || event_type === 'scroll') {
    try {
      await db.query(
        `INSERT INTO heatmap_events (site_id, page_url, x, y, viewport_w, viewport_h, scroll_y, event_type, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [site_id, url || '/', x || 0, y || 0, viewport_w || 0, viewport_h || 0, scroll_y || 0, event_type, session_id]
      );
    } catch (e) {}
  }

  buffer.push(event);
  bufferSize++;
  if (bufferSize >= FLUSH_THRESHOLD) flushBuffer();

  res.json({ ok: true });
}

module.exports = { collect };
