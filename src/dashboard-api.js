const db = require('./db');

async function getOverview(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('stats_daily')
    .select('jour, pages_vues, visiteurs, sessions')
    .eq('site_id', siteId)
    .gte('jour', startDate)
    .order('jour', { ascending: true });
  res.json(data || []);
}

async function getTopPages(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('raw_events')
    .select('page')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', startDate);
  const counts = {};
  (data || []).forEach(e => { counts[e.page] = (counts[e.page] || 0) + 1; });
  const result = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([page, vues]) => ({ page, vues }));
  res.json(result);
}

async function getTopSources(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('raw_events')
    .select('referrer')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .neq('referrer', '')
    .gte('created_at', startDate);
  const counts = {};
  (data || []).forEach(e => { counts[e.referrer] = (counts[e.referrer] || 0) + 1; });
  const result = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([referrer, vues]) => ({ referrer, vues }));
  res.json(result);
}

async function getRealtimeCount(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('active_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .gte('last_ping', fiveMinAgo);
  res.json({ active: error ? 0 : count });
}

async function getHeatmapData(req, res) {
  const siteId = req.query.site_id || 1;
  const pageUrl = req.query.page || '/';
  const supabase = db.getClient();
  const { data } = await supabase
    .from('heatmap_events')
    .select('x, y')
    .eq('site_id', siteId)
    .eq('page_url', pageUrl)
    .eq('event_type', 'click');
  const counts = {};
  (data || []).forEach(e => { const k = e.x + ',' + e.y; counts[k] = (counts[k] || 0) + 1; });
  const result = Object.entries(counts).map(([k, count]) => { const [x, y] = k.split(','); return { x: parseInt(x), y: parseInt(y), count }; });
  res.json(result);
}

module.exports = { getOverview, getTopPages, getTopSources, getRealtimeCount, getHeatmapData };
