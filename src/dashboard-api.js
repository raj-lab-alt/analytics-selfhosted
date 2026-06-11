const db = require('./db');

async function getOverview(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const rows = await db.query(
    `SELECT jour, pages_vues, visiteurs, sessions FROM stats_daily
     WHERE site_id = ? AND jour >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY jour ASC`,
    [siteId, days]
  );
  res.json(rows);
}

async function getTopPages(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const rows = await db.query(
    `SELECT page, COUNT(*) as vues FROM raw_events
     WHERE site_id = ? AND event_type='pageview' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY page ORDER BY vues DESC LIMIT 20`,
    [siteId, days]
  );
  res.json(rows);
}

async function getTopSources(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const rows = await db.query(
    `SELECT referrer, COUNT(*) as vues FROM raw_events
     WHERE site_id = ? AND event_type='pageview' AND referrer != '' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY referrer ORDER BY vues DESC LIMIT 20`,
    [siteId, days]
  );
  res.json(rows);
}

async function getRealtimeCount(req, res) {
  const siteId = req.query.site_id || 1;
  const rows = await db.query(
    `SELECT COUNT(*) as count FROM active_sessions WHERE site_id = ? AND last_ping > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
    [siteId]
  );
  res.json({ active: rows[0]?.count || 0 });
}

async function getHeatmapData(req, res) {
  const siteId = req.query.site_id || 1;
  const pageUrl = req.query.page || '/';
  const rows = await db.query(
    `SELECT x, y, COUNT(*) as count FROM heatmap_events
     WHERE site_id = ? AND page_url = ? AND event_type = 'click'
     GROUP BY x, y ORDER BY count DESC LIMIT 5000`,
    [siteId, pageUrl]
  );
  res.json(rows);
}

module.exports = { getOverview, getTopPages, getTopSources, getRealtimeCount, getHeatmapData };
