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
  const rawPage = req.query.page || '/';
  const supabase = db.getClient();
  let path = rawPage;
  try { const u = new URL(rawPage); path = u.origin + u.pathname; } catch(e) {}
  const escaped = path.replace(/[%_]/g, '\\$&');
  const { data } = await supabase
    .from('heatmap_events')
    .select('x, y')
    .eq('site_id', siteId)
    .like('page_url', escaped + '%')
    .in('event_type', ['click', 'move']);
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

module.exports = { getOverview, getTopPages, getTopSources, getRealtimeCount, getHeatmapData, getVisitorLocations, getSites, createSite, getTopCities, getStats, getTrafficSources, getPlatforms };
