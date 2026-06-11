async function getHeatmapPages(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const { data } = await supabase.from('heatmap_clicks').select('page_url').eq('site_id', siteId);
  const pages = [...new Set((data || []).map(d => d.page_url))].sort();
  res.json(pages);
}

async function getHeatmapCtas(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const page = req.query.page || '';
  let q = supabase.from('heatmap_clicks').select('cta_name, session_id').eq('site_id', siteId).eq('is_cta', true).neq('cta_name', '');
  if (page) q = q.eq('page_url', page);
  const { data } = await q;
  const groups = {};
  const sessionPerCta = {};
  (data || []).forEach(d => {
    if (!groups[d.cta_name]) { groups[d.cta_name] = 0; sessionPerCta[d.cta_name] = new Set(); }
    groups[d.cta_name]++;
    sessionPerCta[d.cta_name].add(d.session_id);
  });
  const result = Object.entries(groups).map(([name, clicks]) => {
    const sessions = sessionPerCta[name].size;
    return { cta_name: name, clicks, sessions, ctr: sessions > 0 ? Math.round(clicks / sessions * 100) / 100 : 0 };
  }).sort((a, b) => b.clicks - a.clicks);
  res.json(result);
}

async function getHeatmapForms(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const page = req.query.page || '';
  let q = supabase.from('form_events').select('event_name, form_name').eq('site_id', siteId);
  if (page) q = q.eq('page_url', page);
  const { data } = await q;
  const groups = {};
  (data || []).forEach(d => {
    const key = d.form_name + '|' + d.event_name;
    groups[key] = (groups[key] || 0) + 1;
  });
  const result = Object.entries(groups).map(([key, count]) => {
    const [form_name, event_name] = key.split('|');
    return { form_name, event_name, count };
  }).sort((a, b) => a.form_name.localeCompare(b.form_name) || b.count - a.count);
  res.json(result);
}

async function getHeatmapDeadClicks(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const page = req.query.page || '';
  let q = supabase.from('heatmap_clicks').select('x_percent, y_percent, session_id').eq('site_id', siteId).eq('is_dead_click', true);
  if (page) q = q.eq('page_url', page);
  const { data } = await q;
  const total = data ? data.length : 0;
  // Aggregate by 5% grid
  const grid = {};
  (data || []).forEach(d => {
    const bx = Math.floor(d.x_percent / 5) * 5;
    const by = Math.floor(d.y_percent / 5) * 5;
    const k = bx + ',' + by;
    if (!grid[k]) grid[k] = { x: bx, y: by, count: 0, sessions: new Set() };
    grid[k].count++;
    grid[k].sessions.add(d.session_id);
  });
  const zones = Object.values(grid).map(g => ({ x_bucket: g.x, y_bucket: g.y, count: g.count, sessions: g.sessions.size }));
  res.json({ total, zones });
}

async function getHeatmapRageClicks(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const page = req.query.page || '';
  let q = supabase.from('heatmap_clicks').select('x_percent, y_percent, session_id').eq('site_id', siteId).eq('is_rage_click', true);
  if (page) q = q.eq('page_url', page);
  const { data } = await q;
  const total = data ? data.length : 0;
  const grid = {};
  (data || []).forEach(d => {
    const bx = Math.floor(d.x_percent / 5) * 5;
    const by = Math.floor(d.y_percent / 5) * 5;
    const k = bx + ',' + by;
    if (!grid[k]) grid[k] = { x: bx, y: by, count: 0, sessions: new Set() };
    grid[k].count++;
    grid[k].sessions.add(d.session_id);
  });
  const zones = Object.values(grid).map(g => ({ x_bucket: g.x, y_bucket: g.y, count: g.count, sessions: g.sessions.size }));
  res.json({ total, zones });
}

async function getHeatmapScrollDistribution(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const page = req.query.page || '';
  let q = supabase.from('heatmap_scrolls').select('max_scroll_percent, session_id').eq('site_id', siteId);
  if (page) q = q.eq('page_url', page);
  const { data } = await q;
  const total = data ? data.length : 0;
  const ranges = [
    { range: '0-25', min: 0, max: 25 },
    { range: '25-50', min: 25, max: 50 },
    { range: '50-75', min: 50, max: 75 },
    { range: '75-90', min: 75, max: 90 },
    { range: '90-100', min: 90, max: 101 },
  ];
  const depth = ranges.map(r => {
    const count = (data || []).filter(d => d.max_scroll_percent >= r.min && d.max_scroll_percent < r.max).length;
    return { range: r.range, visitors: count, visitorsPercent: total > 0 ? Math.round(count / total * 100) : 0 };
  });
  res.json({ sessions: total, depth });
}

async function getHeatmapSummary(req, res) {
  const siteId = req.query.site_id || 1;
  const supabase = db.getClient();
  const page = req.query.page || '';
  function mkQuery(table) {
    let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('site_id', siteId);
    if (page) q = q.eq('page_url', page);
    return q;
  }
  const [clicks, ctaClicks, deadClicks, rageClicks, scrolls, forms] = await Promise.all([
    mkQuery('heatmap_clicks'), mkQuery('heatmap_clicks').eq('is_cta', true).neq('cta_name', ''),
    mkQuery('heatmap_clicks').eq('is_dead_click', true), mkQuery('heatmap_clicks').eq('is_rage_click', true),
    mkQuery('heatmap_scrolls'), mkQuery('form_events'),
  ]);
  const sessions = scrolls.count || 0;
  res.json({
    sessions,
    total_clicks: clicks.count || 0,
    cta_clicks: ctaClicks.count || 0,
    cta_ctr: sessions > 0 ? Math.round(((ctaClicks.count || 0) / sessions) * 100) / 100 : 0,
    dead_clicks: deadClicks.count || 0,
    rage_clicks: rageClicks.count || 0,
    scroll_sessions: scrolls.count || 0,
    form_events: forms.count || 0,
  });
}

module.exports = { getOverview, getTopPages, getTopSources, getRealtimeCount, getHeatmapData, getScrollDepth, getVisitorLocations, getSites, createSite, getTopCities, getStats, getTrafficSources, getPlatforms, getHeatmapPages, getHeatmapCtas, getHeatmapForms, getHeatmapDeadClicks, getHeatmapRageClicks, getHeatmapScrollDistribution, getHeatmapSummary };
