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
      const supabase = db.getClient();
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('active_sessions')
        .select('site_id')
        .gte('last_ping', fiveMinAgo);
      if (error) return;
      const counts = {};
      data.forEach(r => { counts[r.site_id] = (counts[r.site_id] || 0) + 1; });
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
  const supabase = db.getClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('active_sessions')
    .select('session_id, page, referrer, country, last_ping')
    .eq('site_id', siteId)
    .gte('last_ping', fiveMinAgo)
    .order('last_ping', { ascending: false });
  if (error) return res.json({ sessions: [], total: 0 });
  res.json({ sessions: data, total: data.length });
}

module.exports = { setupWebSocket, getActiveSessions };
