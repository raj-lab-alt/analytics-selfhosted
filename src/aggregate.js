const db = require('./db');

async function aggregateHourly() {
  const heure = new Date();
  heure.setMinutes(0, 0, 0);
  heure.setHours(heure.getHours() - 1);
  const heureStr = heure.toISOString().slice(0, 19).replace('T', ' ');
  const heureSuiv = new Date(heure.getTime() + 3600000).toISOString().slice(0, 19).replace('T', ' ');

  try {
    const sites = await db.query('SELECT id FROM sites');
    for (const site of sites) {
      const stats = await db.query(
        `SELECT COUNT(*) as pages_vues, COUNT(DISTINCT session_id) as sessions,
                COUNT(DISTINCT ip_hash) as visiteurs
         FROM raw_events WHERE site_id = ? AND event_type='pageview'
         AND created_at >= ? AND created_at < ?`,
        [site.id, heureStr, heureSuiv]
      );

      const topPages = await db.query(
        `SELECT page, COUNT(*) as vues FROM raw_events
         WHERE site_id = ? AND event_type='pageview' AND created_at >= ? AND created_at < ?
         GROUP BY page ORDER BY vues DESC LIMIT 10`,
        [site.id, heureStr, heureSuiv]
      );

      const topSources = await db.query(
        `SELECT referrer, COUNT(*) as vues FROM raw_events
         WHERE site_id = ? AND event_type='pageview' AND created_at >= ? AND created_at < ?
         GROUP BY referrer ORDER BY vues DESC LIMIT 10`,
        [site.id, heureStr, heureSuiv]
      );

      const s = stats[0] || { pages_vues: 0, sessions: 0, visiteurs: 0 };
      await db.query(
        `INSERT INTO stats_hourly (site_id, heure, pages_vues, visiteurs, sessions, top_pages, top_sources)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pages_vues=VALUES(pages_vues), visiteurs=VALUES(visiteurs),
         sessions=VALUES(sessions), top_pages=VALUES(top_pages), top_sources=VALUES(top_sources)`,
        [site.id, heureStr, s.pages_vues, s.visiteurs, s.sessions,
         JSON.stringify(topPages), JSON.stringify(topSources)]
      );
    }
    console.log(`Hourly aggregation done for ${heureStr}`);
  } catch (err) {
    console.error('Hourly aggregation error:', err.message);
  }
}

async function aggregateDaily() {
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const jourStr = hier.toISOString().slice(0, 10);
  const jourSuiv = new Date(hier.getTime() + 86400000).toISOString().slice(0, 10);

  try {
    const sites = await db.query('SELECT id FROM sites');
    for (const site of sites) {
      const stats = await db.query(
        `SELECT COUNT(*) as pages_vues, COUNT(DISTINCT session_id) as sessions,
                COUNT(DISTINCT ip_hash) as visiteurs
         FROM raw_events WHERE site_id = ? AND event_type='pageview'
         AND created_at >= ? AND created_at < ?`,
        [site.id, jourStr, jourSuiv]
      );

      const topPages = await db.query(
        `SELECT page, COUNT(*) as vues FROM raw_events
         WHERE site_id = ? AND event_type='pageview' AND created_at >= ? AND created_at < ?
         GROUP BY page ORDER BY vues DESC LIMIT 10`,
        [site.id, jourStr, jourSuiv]
      );

      const topSources = await db.query(
        `SELECT referrer, COUNT(*) as vues FROM raw_events
         WHERE site_id = ? AND event_type='pageview' AND created_at >= ? AND created_at < ?
         GROUP BY referrer ORDER BY vues DESC LIMIT 10`,
        [site.id, jourStr, jourSuiv]
      );

      const s = stats[0] || { pages_vues: 0, sessions: 0, visiteurs: 0 };
      await db.query(
        `INSERT INTO stats_daily (site_id, jour, pages_vues, visiteurs, sessions, top_pages, top_sources)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pages_vues=VALUES(pages_vues), visiteurs=VALUES(visiteurs),
         sessions=VALUES(sessions), top_pages=VALUES(top_pages), top_sources=VALUES(top_sources)`,
        [site.id, jourStr, s.pages_vues, s.visiteurs, s.sessions,
         JSON.stringify(topPages), JSON.stringify(topSources)]
      );
    }
    console.log(`Daily aggregation done for ${jourStr}`);
  } catch (err) {
    console.error('Daily aggregation error:', err.message);
  }
}

async function cleanup() {
  try {
    await db.query('DELETE FROM raw_events WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)');
    await db.query('DELETE FROM heatmap_events WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
    await db.query('DELETE FROM active_sessions WHERE last_ping < DATE_SUB(NOW(), INTERVAL 1 HOUR)');
  } catch (e) {}
}

module.exports = { aggregateHourly, aggregateDaily, cleanup };
