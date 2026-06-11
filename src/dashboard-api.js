const db = require('./db');

function pageLikePattern(raw) {
  let path = raw || '/';
  try { const u = new URL(path); path = u.origin + u.pathname; } catch(e) {}
  return path.replace(/\*/g, '%').replace(/_/g, '\\_') + (path.includes('*') ? '' : '%');
}

function applyFilters(query, req, opts) {
  const deviceType = req.query.device_type;
  const utmSource = req.query.utm_source;
  const dateFrom = req.query.date_from;
  const dateTo = req.query.date_to;
  if (deviceType && opts && opts.device) query = query.eq('device_type', deviceType);
  if (utmSource && opts && opts.utm) query = query.eq('utm_source', utmSource);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  return query;
}

async function getOverview(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();

  let events;
  try {
    const r = await supabase
      .from('raw_events')
      .select('created_at, session_id, ip_hash')
      .eq('site_id', siteId)
      .eq('event_type', 'pageview')
      .gte('created_at', startDate);
    if (r.error) throw r.error;
    events = r.data || [];
  } catch (e) {
    // Fallback: event_type column may not exist yet (migrate.sql not run)
    const r = await supabase
      .from('raw_events')
      .select('created_at, session_id, ip_hash')
      .eq('site_id', siteId)
      .gte('created_at', startDate);
    events = r.data || [];
  }

  const byDay = {};
  (events || []).forEach(e => {
    const day = e.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { jour: day, pages_vues: 0, visiteurs: new Set(), sessions: new Set() };
    byDay[day].pages_vues++;
    byDay[day].visiteurs.add(e.ip_hash);
    byDay[day].sessions.add(e.session_id);
  });

  const result = Object.values(byDay)
    .map(d => ({ jour: d.jour, pages_vues: d.pages_vues, visiteurs: d.visiteurs.size, sessions: d.sessions.size }))
    .sort((a, b) => a.jour.localeCompare(b.jour));

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
  const rawPage = req.query.page || '/';
  const filterType = req.query.type || 'all';
  const viewportAccuracy = parseInt(req.query.viewport_accuracy) || 0;
  const supabase = db.getClient();
  const likePattern = pageLikePattern(rawPage);
  let query = supabase
    .from('heatmap_events')
    .select('x, y, viewport_w, viewport_h, scroll_y, x_ratio, y_ratio, doc_height')
    .eq('site_id', siteId)
    .like('page_url', likePattern);
  if (viewportAccuracy > 0) {
    // Include events from viewports within tolerance (width diff)
    const minW = Math.max(320, 1920 - viewportAccuracy * 100);
    const maxW = 1920 + viewportAccuracy * 100;
    query = query.gte('viewport_w', minW).lte('viewport_w', maxW);
  }
  if (filterType === 'all') {
    query = query.in('event_type', ['click', 'move', 'touch']);
  } else {
    query = query.eq('event_type', filterType);
  }
  query = applyFilters(query, req, { device: true });
  const { data } = await query;
  const items = (data || []).map(e => {
    if (e.x_ratio && e.y_ratio && e.doc_height) {
      return { fx: Math.round(e.x_ratio * 1000), fy: Math.round(e.y_ratio * 1000), doc_h: e.doc_height };
    }
    const vw = e.viewport_w || 1920, vh = e.viewport_h || 1080, sy = e.scroll_y || 0;
    const absY = e.y + sy;
    const estPageH = sy + vh;
    return { fx: Math.round((e.x / vw) * 1000), absY: absY, estPageH: estPageH, doc_h: 0 };
  });
  let pageHeight = 800;
  items.forEach(i => {
    if (i.doc_h > pageHeight) pageHeight = i.doc_h;
    if (i.estPageH && i.estPageH > pageHeight) pageHeight = i.estPageH;
  });
  const counts = {};
  items.forEach(i => {
    let fy;
    if (i.doc_h) {
      fy = i.fy;
    } else {
      fy = Math.round((i.absY / pageHeight) * 1000);
    }
    const k = i.fx + ',' + fy;
    counts[k] = (counts[k] || 0) + 1;
  });
  const points = Object.entries(counts).map(([k, count]) => {
    const [fx, fy] = k.split(',').map(Number);
    return { x: fx / 1000, y: fy / 1000, count };
  });
  res.json({ points, pageHeight });
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

  let avgDuration = 0;
  try {
    const { data: sessions } = await supabase
      .from('raw_events')
      .select('session_id, created_at')
      .eq('site_id', siteId)
      .gte('created_at', startDate);

    if (sessions && sessions.length > 0) {
      const map = {};
      sessions.forEach(e => {
        if (!map[e.session_id]) map[e.session_id] = { first: e.created_at, last: e.created_at };
        else {
          if (e.created_at < map[e.session_id].first) map[e.session_id].first = e.created_at;
          if (e.created_at > map[e.session_id].last) map[e.session_id].last = e.created_at;
        }
      });
      const totalMs = Object.values(map).reduce((sum, s) => sum + (new Date(s.last).getTime() - new Date(s.first).getTime()), 0);
      const count = Object.keys(map).length;
      avgDuration = count > 0 ? Math.round(totalMs / count / 1000) : 0;
    }
  } catch (e) {}

  // Referrer breakdown
  try {
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
    return res.json({ avgDuration, topReferrers });
  } catch (e) {
    return res.json({ avgDuration, topReferrers: [] });
  }
}

async function getTrafficSources(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('raw_events')
    .select('referrer')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', startDate);
  const counts = {};
  const social = { facebook: 'Facebook', twitter: 'Twitter', instagram: 'Instagram', linkedin: 'LinkedIn', pinterest: 'Pinterest', tiktok: 'TikTok', snapchat: 'Snapchat', youtube: 'YouTube', reddit: 'Reddit', whatsapp: 'WhatsApp', telegram: 'Telegram' };
  const search = { google: 'Google', bing: 'Bing', yahoo: 'Yahoo', duckduckgo: 'DuckDuckGo', yandex: 'Yandex', baidu: 'Baidu', ecosia: 'Ecosia', qwant: 'Qwant' };
  (data || []).forEach(e => {
    const url = (e.referrer || '').toLowerCase();
    if (!url) { counts['Direct'] = { source: 'Direct', type: 'direct', count: (counts['Direct']?.count || 0) + 1 }; return; }
    for (const [d, n] of Object.entries(social)) { if (url.includes(d)) { counts[n] = { source: n, type: 'social', count: (counts[n]?.count || 0) + 1 }; return; } }
    for (const [d, n] of Object.entries(search)) { if (url.includes(d)) { counts[n] = { source: n, type: 'organic', count: (counts[n]?.count || 0) + 1 }; return; } }
    let label = 'Referral';
    try { const host = new URL(e.referrer).hostname.replace('www.', ''); label = host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1); } catch (ex) {}
    counts[label] = { source: label, type: 'referral', count: (counts[label]?.count || 0) + 1 };
  });
  const total = Object.values(counts).reduce((a, b) => a + b.count, 0) || 1;
  const result = Object.values(counts).map(c => ({ source: c.source, type: c.type, count: c.count, pct: Math.round(c.count / total * 100) })).sort((a, b) => b.count - a.count);
  res.json(result);
}

async function getPlatforms(req, res) {
  const siteId = req.query.site_id || 1;
  const days = parseInt(req.query.days) || 7;
  const supabase = db.getClient();
  const startDate = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('raw_events')
    .select('ua')
    .eq('site_id', siteId)
    .eq('event_type', 'pageview')
    .gte('created_at', startDate);
  const devices = { desktop: 0, mobile: 0, tablet: 0 };
  const browsers = {};
  const os = {};
  (data || []).forEach(e => {
    const u = (e.ua || '').toLowerCase();
    if (/tablet|ipad/i.test(u)) devices.tablet++;
    else if (/mobile|iphone|ipod|android.*mobile/i.test(u)) devices.mobile++;
    else devices.desktop++;
    if (/edg/i.test(u)) browsers.Edge = (browsers.Edge || 0) + 1;
    else if (/chrome/i.test(u)) browsers.Chrome = (browsers.Chrome || 0) + 1;
    else if (/safari/i.test(u)) browsers.Safari = (browsers.Safari || 0) + 1;
    else if (/firefox/i.test(u)) browsers.Firefox = (browsers.Firefox || 0) + 1;
    else if (/opera|opr/i.test(u)) browsers.Opera = (browsers.Opera || 0) + 1;
    else if (/msie|trident/i.test(u)) browsers.IE = (browsers.IE || 0) + 1;
    else browsers.Other = (browsers.Other || 0) + 1;
    if (/iphone|ipad|ipod/i.test(u)) os.iOS = (os.iOS || 0) + 1;
    else if (/android/i.test(u)) os.Android = (os.Android || 0) + 1;
    else if (/macintosh|mac os x/i.test(u)) os.macOS = (os.macOS || 0) + 1;
    else if (/windows/i.test(u)) os.Windows = (os.Windows || 0) + 1;
    else if (/linux/i.test(u)) os.Linux = (os.Linux || 0) + 1;
    else os.Other = (os.Other || 0) + 1;
  });
  const total = Object.values(devices).reduce((a, b) => a + b, 0) || 1;
  const devicePct = Object.entries(devices).map(([k, v]) => ({ label: k, count: v, pct: Math.round(v / total * 100) }));
  const browserPct = Object.entries(browsers).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, count: v, pct: Math.round(v / total * 100) }));
  const osPct = Object.entries(os).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, count: v, pct: Math.round(v / total * 100) }));
  res.json({ devices: devicePct, browsers: browserPct, os: osPct });
}

async function getScrollDepth(req, res) {
  const siteId = req.query.site_id || 1;
  const rawPage = req.query.page || '/';
  const supabase = db.getClient();
  let path = rawPage;
  try { const u = new URL(rawPage); path = u.origin + u.pathname; } catch(e) {}
  const likePattern = path.replace(/\*/g, '%').replace(/_/g, '\\_') + (path.includes('*') ? '' : '%');
  const { data } = await supabase
    .from('heatmap_events')
    .select('scroll_y, viewport_h, session_id')
    .eq('site_id', siteId)
    .like('page_url', likePattern);
  const sessionDepths = {};
  (data || []).forEach(e => {
    const depth = (e.scroll_y || 0) + (e.viewport_h || 1080);
    const sid = e.session_id;
    if (!sessionDepths[sid] || depth > sessionDepths[sid]) sessionDepths[sid] = depth;
  });
  const depths = Object.values(sessionDepths);
  const pageHeight = depths.length ? Math.max(...depths, 800) : 800;
  const total = depths.length;
  const step = 50;
  const rows = [];
  for (let y = 0; y <= pageHeight; y += step) {
    rows.push({ y: y / pageHeight, visibility: depths.filter(d => d >= y).length / total });
  }
  res.json({ pageHeight, rows, total });
}

// === Heatmap enrichment endpoints ===

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
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true, utm: true });
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
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true });
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
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true, utm: true });
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
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true, utm: true });
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
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true, utm: true });
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
  function mkQuery(table, extra) {
    let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('site_id', siteId);
    if (page) q = q.like('page_url', pageLikePattern(page));
    if (extra) q = extra(q);
    const opts = table === 'form_events' ? { device: true } : { device: true, utm: true };
    q = applyFilters(q, req, opts);
    return q;
  }
  const [clicks, ctaClicks, deadClicks, rageClicks, scrolls, forms] = await Promise.all([
    mkQuery('heatmap_clicks'), mkQuery('heatmap_clicks', q => q.eq('is_cta', true).neq('cta_name', '')),
    mkQuery('heatmap_clicks', q => q.eq('is_dead_click', true)), mkQuery('heatmap_clicks', q => q.eq('is_rage_click', true)),
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

async function getHeatmapClickmap(req, res) {
  const siteId = req.query.site_id || 1;
  const page = req.query.page || '';
  const supabase = db.getClient();
  let q = supabase.from('heatmap_clicks').select('element_tag, element_id, element_class, cta_name, is_cta, is_dead_click, is_rage_click, x_percent, y_percent').eq('site_id', siteId);
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true, utm: true });
  const { data } = await q;
  const groups = {};
  (data || []).forEach(d => {
    const key = (d.element_tag || '') + '|' + (d.element_id || '') + '|' + (d.element_class || '');
    if (!groups[key]) groups[key] = { tag: d.element_tag, id: d.element_id, cls: d.element_class, clicks: 0, rage: 0, dead: 0, totalX: 0, totalY: 0, cta_name: d.cta_name || '', is_cta: d.is_cta || false };
    groups[key].clicks++;
    if (d.is_rage_click) groups[key].rage++;
    if (d.is_dead_click) groups[key].dead++;
    groups[key].totalX += d.x_percent || 0;
    groups[key].totalY += d.y_percent || 0;
  });
  const elements = Object.values(groups).map(g => ({
    selector: (g.tag || '') + (g.id ? '#' + g.id : '') + (g.cls ? '.' + g.cls.split(' ').join('.') : ''),
    tag: g.tag, id: g.id, cls: g.cls,
    clicks: g.clicks, rage_clicks: g.rage, dead_clicks: g.dead,
    cta_name: g.cta_name, is_cta: g.is_cta,
    avg_x: Math.round(g.totalX / g.clicks * 10) / 10,
    avg_y: Math.round(g.totalY / g.clicks * 10) / 10,
  })).sort((a, b) => b.clicks - a.clicks);
  res.json({ elements, total: data ? data.length : 0 });
}

async function getHeatmapFormFunnel(req, res) {
  const siteId = req.query.site_id || 1;
  const page = req.query.page || '';
  const supabase = db.getClient();
  let q = supabase.from('form_events').select('form_name, event_name, field_order, session_id').eq('site_id', siteId);
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true });
  const { data } = await q || {};
  const funnels = {};
  (data || []).forEach(d => {
    const key = d.form_name || 'unknown';
    if (!funnels[key]) funnels[key] = { form_name: key, steps: {}, sessions: new Set() };
    funnels[key].sessions.add(d.session_id);
    const stepKey = d.event_name + (d.field_order !== undefined && d.field_order !== null ? '_' + d.field_order : '');
    if (!funnels[key].steps[stepKey]) funnels[key].steps[stepKey] = { name: d.event_name, field_order: d.field_order, count: 0, sessions: new Set() };
    funnels[key].steps[stepKey].count++;
    funnels[key].steps[stepKey].sessions.add(d.session_id);
  });
  const result = Object.values(funnels).map(f => {
    const sortedSteps = Object.values(f.steps).sort((a, b) => {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return (a.field_order || 0) - (b.field_order || 0);
    });
    const totalSessions = f.sessions.size;
    return {
      form_name: f.form_name,
      total_sessions: totalSessions,
      steps: sortedSteps.map(s => ({
        event: s.name,
        field_order: s.field_order,
        count: s.count,
        sessions: s.sessions.size,
        dropoff_pct: totalSessions > 0 ? Math.round((1 - s.sessions.size / totalSessions) * 100) : 0,
      })),
    };
  });
  res.json(result);
}

async function getHeatmapProblemRanking(req, res) {
  const siteId = req.query.site_id || 1;
  const page = req.query.page || '';
  const supabase = db.getClient();
  let q = supabase.from('heatmap_clicks').select('element_tag, element_id, element_class, cta_name, is_cta, is_dead_click, is_rage_click, x_percent, y_percent').eq('site_id', siteId);
  if (page) q = q.like('page_url', pageLikePattern(page));
  q = applyFilters(q, req, { device: true, utm: true });
  const { data } = await q || {};
  const groups = {};
  (data || []).forEach(d => {
    const key = (d.element_tag || '') + '|' + (d.element_id || '') + '|' + (d.element_class || '');
    if (!groups[key]) groups[key] = { tag: d.element_tag, id: d.element_id, cls: d.element_class, clicks: 0, rage: 0, dead: 0, cta_name: d.cta_name || '', is_cta: d.is_cta };
    groups[key].clicks++;
    if (d.is_rage_click) groups[key].rage++;
    if (d.is_dead_click) groups[key].dead++;
  });
  const elements = Object.values(groups).map(g => ({
    selector: (g.tag || '') + (g.id ? '#' + g.id : '') + (g.cls ? '.' + g.cls.split(' ').join('.') : ''),
    clicks: g.clicks, rage: g.rage, dead: g.dead, rage_rate: g.clicks > 0 ? Math.round(g.rage / g.clicks * 100) : 0, dead_rate: g.clicks > 0 ? Math.round(g.dead / g.clicks * 100) : 0, is_cta: g.is_cta, cta_name: g.cta_name,
  }));
  const rageRanked = elements.filter(e => e.rage > 0).sort((a, b) => b.rage - a.rage);
  const deadRanked = elements.filter(e => e.dead > 0).sort((a, b) => b.dead - a.dead);
  res.json({ rage_ranked: rageRanked, dead_ranked: deadRanked });
}

async function getHeatmapEngagementZones(req, res) {
  const siteId = req.query.site_id || 1;
  const page = req.query.page || '';
  const gridSize = parseInt(req.query.grid) || 5; // grid cell size in percent
  const supabase = db.getClient();
  const likePattern = pageLikePattern(page);

  // Get click/move/touch events
  let eventsQuery = supabase
    .from('heatmap_events')
    .select('event_type, x_ratio, y_ratio, session_id')
    .eq('site_id', siteId)
    .like('page_url', likePattern);
  eventsQuery = applyFilters(eventsQuery, req, { device: true });
  const { data: events } = await eventsQuery;

  // Get enriched clicks
  let clicksQuery = supabase
    .from('heatmap_clicks')
    .select('x_percent, y_percent, session_id, is_dead_click, is_rage_click')
    .eq('site_id', siteId)
    .like('page_url', likePattern);
  clicksQuery = applyFilters(clicksQuery, req, { device: true, utm: true });
  const { data: clicks } = await clicksQuery;

  // Get scroll data
  let scrollsQuery = supabase
    .from('heatmap_scrolls')
    .select('max_scroll_percent, session_id')
    .eq('site_id', siteId)
    .like('page_url', likePattern);
  scrollsQuery = applyFilters(scrollsQuery, req, { device: true, utm: true });
  const { data: scrolls } = await scrollsQuery;

  const zones = {};
  function zoneKey(bx, by) { return bx + 'x' + by; }
  function addToZone(bx, by, type, sessionId) {
    const k = zoneKey(bx, by);
    if (!zones[k]) zones[k] = { x: bx, y: by, clicks: 0, moves: 0, touches: 0, sessions: new Set(), dead: 0, rage: 0 };
    if (type === 'click') zones[k].clicks++;
    else if (type === 'move') zones[k].moves++;
    else if (type === 'touch') zones[k].touches++;
    zones[k].sessions.add(sessionId);
  }

  (events || []).forEach(e => {
    const bx = Math.floor((e.x_ratio || 0) * 100 / gridSize) * gridSize;
    const by = Math.floor((e.y_ratio || 0) * 100 / gridSize) * gridSize;
    if (e.event_type === 'click') addToZone(bx, by, 'click', e.session_id);
    else if (e.event_type === 'move') addToZone(bx, by, 'move', e.session_id);
    else if (e.event_type === 'touch') addToZone(bx, by, 'touch', e.session_id);
  });

  (clicks || []).forEach(e => {
    const bx = Math.floor((e.x_percent || 0) / gridSize) * gridSize;
    const by = Math.floor((e.y_percent || 0) / gridSize) * gridSize;
    const k = zoneKey(bx, by);
    if (!zones[k]) zones[k] = { x: bx, y: by, clicks: 0, moves: 0, touches: 0, sessions: new Set(), dead: 0, rage: 0 };
    zones[k].clicks++;
    zones[k].sessions.add(e.session_id);
    if (e.is_dead_click) zones[k].dead++;
    if (e.is_rage_click) zones[k].rage++;
  });

  const allSessions = new Set();
  (events || []).forEach(e => allSessions.add(e.session_id));
  (clicks || []).forEach(e => allSessions.add(e.session_id));
  (scrolls || []).forEach(e => allSessions.add(e.session_id));
  const totalSessions = allSessions.size;

  const maxScroll = scrolls && scrolls.length > 0 ? Math.max(...scrolls.map(s => s.max_scroll_percent || 0)) : 0;

  const zoneList = Object.values(zones).map(z => {
    const interaction = z.clicks + z.moves + z.touches;
    const scrollFactor = (z.y / 100) <= (maxScroll / 100) ? 1 : 0.3;
    const engagement = Math.round(Math.min(100, interaction * scrollFactor * 5));
    return {
      x: z.x, y: z.y,
      clicks: z.clicks, moves: z.moves, touches: z.touches,
      dead: z.dead, rage: z.rage,
      sessions: z.sessions.size,
      interaction_total: interaction,
      engagement_score: engagement,
    };
  }).sort((a, b) => b.engagement_score - a.engagement_score);

  res.json({ zones: zoneList, grid_size: gridSize, total_sessions: totalSessions });
}

async function getHealth(req, res) {
  const supabase = db.getClient();
  const tables = ['heatmap_clicks', 'heatmap_scrolls', 'form_events'];
  const result = { ok: true, db: false, tables: {} };
  try {
    await supabase.from('raw_events').select('id', { count: 'exact', head: true }).limit(1);
    result.db = true;
    for (const t of tables) {
      try {
        await supabase.from(t).select('id', { count: 'exact', head: true }).limit(1);
        result.tables[t] = true;
      } catch (e) { result.tables[t] = false; result.ok = false; }
    }
  } catch (e) { result.ok = false; }
  res.json(result);
}

module.exports = { getOverview, getTopPages, getTopSources, getRealtimeCount, getHeatmapData, getScrollDepth, getVisitorLocations, getSites, createSite, getTopCities, getStats, getTrafficSources, getPlatforms, getHeatmapPages, getHeatmapCtas, getHeatmapForms, getHeatmapDeadClicks, getHeatmapRageClicks, getHeatmapScrollDistribution, getHeatmapSummary, getHeatmapClickmap, getHeatmapFormFunnel, getHeatmapProblemRanking, getHeatmapEngagementZones, getHealth };
