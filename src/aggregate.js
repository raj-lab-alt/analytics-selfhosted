const db = require('./db');

async function aggregateHourly() {
  const heure = new Date();
  heure.setMinutes(0, 0, 0);
  heure.setHours(heure.getHours() - 1);
  const heureStr = heure.toISOString();
  const heureSuiv = new Date(heure.getTime() + 3600000).toISOString();

  try {
    const supabase = db.getClient();
    const { data: sites } = await supabase.from('sites').select('id');
    if (!sites) return;

    for (const site of sites) {
      const { data: events } = await supabase
        .from('raw_events')
        .select('session_id, ip_hash')
        .eq('site_id', site.id)
        .eq('event_type', 'pageview')
        .gte('created_at', heureStr)
        .lt('created_at', heureSuiv);

      if (!events) continue;

      const sessions = new Set();
      const visitors = new Set();
      events.forEach(e => { sessions.add(e.session_id); visitors.add(e.ip_hash); });

      const { data: topPages } = await supabase
        .from('raw_events')
        .select('page')
        .eq('site_id', site.id)
        .eq('event_type', 'pageview')
        .gte('created_at', heureStr)
        .lt('created_at', heureSuiv);

      const pageCounts = {};
      (topPages || []).forEach(e => { pageCounts[e.page] = (pageCounts[e.page] || 0) + 1; });
      const topPagesArr = Object.entries(pageCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([page, vues]) => ({ page, vues }));

      const { data: topSources } = await supabase
        .from('raw_events')
        .select('referrer')
        .eq('site_id', site.id)
        .eq('event_type', 'pageview')
        .neq('referrer', '')
        .gte('created_at', heureStr)
        .lt('created_at', heureSuiv);

      const sourceCounts = {};
      (topSources || []).forEach(e => { sourceCounts[e.referrer] = (sourceCounts[e.referrer] || 0) + 1; });
      const topSourcesArr = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([referrer, vues]) => ({ referrer, vues }));

      const s = { pages_vues: events.length, sessions: sessions.size, visiteurs: visitors.size };
      await supabase.from('stats_hourly').upsert({
        site_id: site.id,
        heure: heureStr,
        pages_vues: s.pages_vues,
        visiteurs: s.visiteurs,
        sessions: s.sessions,
        top_pages: topPagesArr,
        top_sources: topSourcesArr,
      }, { onConflict: 'site_id, heure' });
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
  const jourSuiv = new Date(hier.getTime() + 86400000).toISOString();

  try {
    const supabase = db.getClient();
    const { data: sites } = await supabase.from('sites').select('id');
    if (!sites) return;

    for (const site of sites) {
      const { data: events } = await supabase
        .from('raw_events')
        .select('session_id, ip_hash')
        .eq('site_id', site.id)
        .eq('event_type', 'pageview')
        .gte('created_at', jourStr)
        .lt('created_at', jourSuiv);

      if (!events) continue;

      const sessions = new Set();
      const visitors = new Set();
      events.forEach(e => { sessions.add(e.session_id); visitors.add(e.ip_hash); });

      const { data: topPages } = await supabase
        .from('raw_events')
        .select('page')
        .eq('site_id', site.id)
        .eq('event_type', 'pageview')
        .gte('created_at', jourStr)
        .lt('created_at', jourSuiv);

      const pageCounts = {};
      (topPages || []).forEach(e => { pageCounts[e.page] = (pageCounts[e.page] || 0) + 1; });
      const topPagesArr = Object.entries(pageCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([page, vues]) => ({ page, vues }));

      const { data: topSources } = await supabase
        .from('raw_events')
        .select('referrer')
        .eq('site_id', site.id)
        .eq('event_type', 'pageview')
        .neq('referrer', '')
        .gte('created_at', jourStr)
        .lt('created_at', jourSuiv);

      const sourceCounts = {};
      (topSources || []).forEach(e => { sourceCounts[e.referrer] = (sourceCounts[e.referrer] || 0) + 1; });
      const topSourcesArr = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([referrer, vues]) => ({ referrer, vues }));

      const s = { pages_vues: events.length, sessions: sessions.size, visiteurs: visitors.size };
      await supabase.from('stats_daily').upsert({
        site_id: site.id,
        jour: jourStr,
        pages_vues: s.pages_vues,
        visiteurs: s.visiteurs,
        sessions: s.sessions,
        top_pages: topPagesArr,
        top_sources: topSourcesArr,
      }, { onConflict: 'site_id, jour' });
    }
    console.log(`Daily aggregation done for ${jourStr}`);
  } catch (err) {
    console.error('Daily aggregation error:', err.message);
  }
}

async function cleanup() {
  try {
    const supabase = db.getClient();
    const oldRaw = new Date(Date.now() - 90 * 86400000).toISOString();
    const oldHeat = new Date(Date.now() - 30 * 86400000).toISOString();
    const oldSession = new Date(Date.now() - 3600000).toISOString();
    await supabase.from('raw_events').delete().lt('created_at', oldRaw);
    await supabase.from('heatmap_events').delete().lt('created_at', oldHeat);
    await supabase.from('active_sessions').delete().lt('last_ping', oldSession);
  } catch (e) {}
}

module.exports = { aggregateHourly, aggregateDaily, cleanup };
