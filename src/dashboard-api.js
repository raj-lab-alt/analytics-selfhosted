const db = require('./db');

async function getOverview(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Get aggregated daily data (yesterday and older)
  const { data: daily } = await supabase
    .from('stats_daily')
    .select('jour, pages_vues, visiteurs, sessions')
    .eq('site_id', siteId)
    .gte('jour', startDate)
    .order('jour', { ascending: true });

  // Get today's raw data
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { data: todayEvents } = await supabase
    .from('raw_events')
    .select('session_id, ip_hash')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', today)
    .lt('created_at', tomorrow);

  const result = daily || [];

  if (todayEvents && todayEvents.length > 0) {
    const sessions = new Set();
    const visitors = new Set();
    todayEvents.forEach(e => { sessions.add(e.session_id); visitors.add(e.ip_hash); });
    result.push({
      jour: today,
      pages_vues: todayEvents.length,
      visiteurs: visitors.size,
      sessions: sessions.size,
    });
  }

  res.json(result);
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

async function getVisitorLocations(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('active_sessions')
    .select('session_id, page, referrer, country, city, lat, lon')
    .eq('site_id', siteId)
    .gte('last_ping', fiveMinAgo);
  if (error) return res.json([]);
  res.json(data || []);
}

async function getSites(req, res) {
  const supabase = db.getClient();
  const { data } = await supabase.from('sites').select('id, name, domain, api_key, created_at').order('id', { ascending: true });
  res.json(data || []);
}

async function createSite(req, res) {
  const { name, domain } = req.body;
  if (!name || !domain) return res.status(400).json({ error: 'name and domain required' });
  const apiKey = require('crypto').randomBytes(16).toString('hex');
  const supabase = db.getClient();
  const { data: maxSite } = await supabase.from('sites').select('id').order('id', { ascending: false }).limit(1);
  const nextId = (maxSite?.[0]?.id || 0) + 1;
  const { data, error } = await supabase.from('sites').insert({ id: nextId, name, domain, api_key: apiKey }).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
}

async function getTopCities(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('raw_events')
    .select('country, city')
    .eq('site_id', siteId)
    .neq('country', '')
    .gte('created_at', startDate);
  const counts = {};
  (data || []).forEach(e => {
    const key = (e.city || '') + ', ' + (e.country || '');
    counts[key] = (counts[key] || 0) + 1;
  });
  const result = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([location, count]) => ({ location, count }));
  res.json(result);
}

async function getStats(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();

  // Compute avg session duration from raw_events per-session first/last timestamps
  let avgDuration = 0;
  try {
    const { data: events } = await supabase
      .from('raw_events')
      .select('session_id, created_at')
      .eq('site_id', siteId)
      .gte('created_at', startDate);
    if (events && events.length > 0) {
      const sessions = {};
      events.forEach(e => {
        if (!sessions[e.session_id]) sessions[e.session_id] = { first: e.created_at, last: e.created_at };
        else {
          if (e.created_at < sessions[e.session_id].first) sessions[e.session_id].first = e.created_at;
          if (e.created_at > sessions[e.session_id].last) sessions[e.session_id].last = e.created_at;
        }
      });
      const totalMs = Object.values(sessions).reduce((sum, s) => {
        return sum + (new Date(s.last).getTime() - new Date(s.first).getTime());
      }, 0);
      avgDuration = Math.round(totalMs / Object.keys(sessions).length / 1000);
    }
  } catch (e) {}

  // Referrer breakdown
  const { data: referrers } = await supabase
    .from('raw_events')
    .select('referrer')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .neq('referrer', '')
    .gte('created_at', startDate);
  const refCounts = {};
  (referrers || []).forEach(e => {
    const ref = e.referrer || '(direct)';
    refCounts[ref] = (refCounts[ref] || 0) + 1;
  });
  const topReferrers = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([referrer, count]) => ({ referrer, count }));

  res.json({ avgDuration, topReferrers });
}

async function getTrafficSources(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const { data } = await supabase
      .from('raw_events')
      .select('traffic_source, referrer')
      .eq('site_id', siteId)
      .eq('event_type', 'pageview')
      .gte('created_at', startDate);
    const counts = { direct: 0, organic: 0, social: 0, paid: 0, referral: 0 };
    (data || []).forEach(e => {
      const src = e.traffic_source;
      if (src && counts[src] !== undefined) counts[src]++;
      else {
        // Fallback classification for rows without traffic_source (pre-migration)
        if (!e.referrer) counts.direct++;
        else if (['facebook','twitter','instagram','linkedin','pinterest','tiktok','snapchat','youtube','reddit','whatsapp','telegram'].some(d => e.referrer.toLowerCase().includes(d))) counts.social++;
        else if (['google','bing','yahoo','duckduckgo','yandex','baidu','ecosia','qwant'].some(s => e.referrer.toLowerCase().includes(s))) counts.organic++;
        else counts.referral++;
      }
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const result = Object.entries(counts).map(([source, count]) => ({ source, count, pct: Math.round(count / total * 100) })).sort((a, b) => b.count - a.count);
    res.json(result);
  } catch (e) {
    res.json([]);
  }
}

module.exports = { getOverview, getTopPages, getTopSources, getRealtimeCount, getHeatmapData, getVisitorLocations, getSites, createSite, getTopCities, getStats, getTrafficSources };
