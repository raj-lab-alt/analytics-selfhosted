const db = require('./db');

const clients = new Map();

function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const siteId = new URL(req.url, 'http://localhost').searchParams.get('site_id') || 1;
    clients.set(ws, siteId);
    ws.on('close', () => clients.delete(ws));
  });

  setInterval(async () => {
    if (clients.size === 0) return;
    try {
      const siteIds = [...new Set(clients.values())];
      const rows = await db.query(
        `SELECT site_id, COUNT(*) as count FROM active_sessions WHERE last_ping > DATE_SUB(NOW(), INTERVAL 5 MINUTE) GROUP BY site_id`
      );
      const counts = {};
      rows.forEach(r => counts[r.site_id] = r.count);
      for (const [ws, sid] of clients) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ active: counts[sid] || 0 }));
        }
      }
    } catch (e) {}
  }, 5000);
}

async function getActiveSessions(req, res) {
  const siteId = req.query.site_id || 1;
  const rows = await db.query(
    `SELECT session_id, page, referrer, country, last_ping FROM active_sessions
     WHERE site_id = ? AND last_ping > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     ORDER BY last_ping DESC`,
    [siteId]
  );
  res.json({ sessions: rows, total: rows.length });
}

module.exports = { setupWebSocket, getActiveSessions };
