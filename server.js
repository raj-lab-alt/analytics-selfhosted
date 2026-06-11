require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const https = require('https');

app.use((req, res, next) => {
  const origin = req.headers['origin'];
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50kb' }));
app.use('/collect', express.text({ type: 'text/plain', limit: '50kb' }));
app.use('/collect', (req, res, next) => {
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch(e) { req.body = {}; }
  }
  next();
});
app.use(express.static(path.join(__dirname, 'dashboard')));

// Proxy pour afficher les pages trackées dans l'iframe de la heatmap (contourne X-Frame-Options)
app.get('/page-preview', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url');
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return res.status(400).send('Invalid protocol');
    const fetcher = parsed.protocol === 'https:' ? https : http;
    fetcher.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (proxyRes) => {
      let html = '';
      proxyRes.on('data', chunk => html += chunk);
      proxyRes.on('end', () => {
        html = html.replace('<head>', `<head><base href="${parsed.origin}"><style>html,body{overflow:hidden !important;height:100% !important;margin:0;}</style>`);
        res.set('Content-Type', 'text/html');
        res.send(html);
      });
    }).on('error', () => res.status(502).send('Proxy error'));
  } catch (e) {
    res.status(400).send('Invalid URL');
  }
});

app.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (req.path.startsWith('/dashboard') || req.path.startsWith('/api/')) {
    if (!auth || auth !== 'Bearer ' + (process.env.ADMIN_PASSWORD || 'admin123')) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
      return res.redirect('/login.html');
    }
  }
  next();
});

const db = require('./src/db');
const { collect, processEvent } = require('./src/collect');
const { setupWebSocket, getActiveSessions } = require('./src/realtime');
const { aggregateHourly, aggregateDaily, cleanup } = require('./src/aggregate');
const dashboardApi = require('./src/dashboard-api');

app.post('/collect', collect);
app.get('/collect', async (req, res) => {
  req.body = req.query;
  await processEvent(req);
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});
app.get('/ping', (req, res) => res.json({ pong: true }));
app.get('/dbg', async (req, res) => { try { const s = db.getClient(); const { data, error } = await s.from('active_sessions').insert({ session_id: 'dbg-' + Date.now(), site_id: 2, page: '/dbg', ua: 'test', last_ping: new Date().toISOString() }).select(); res.json({ ok: !error, data, error: error?.message }); } catch(e) { res.json({ ok: false, error: e.message }); } });

app.get('/api/overview', dashboardApi.getOverview);
app.get('/api/top-pages', dashboardApi.getTopPages);
app.get('/api/top-sources', dashboardApi.getTopSources);
app.get('/api/realtime', dashboardApi.getRealtimeCount);
app.get('/api/active-sessions', getActiveSessions);
app.get('/api/heatmap', dashboardApi.getHeatmapData);
app.get('/api/scroll-depth', dashboardApi.getScrollDepth);
app.get('/api/visitor-locations', dashboardApi.getVisitorLocations);
app.get('/api/top-cities', dashboardApi.getTopCities);
app.get('/api/stats', dashboardApi.getStats);
app.get('/api/traffic-sources', dashboardApi.getTrafficSources);
app.get('/api/platforms', dashboardApi.getPlatforms);
app.get('/api/sites', dashboardApi.getSites);
app.post('/api/sites', dashboardApi.createSite);

// Tracker script served at multiple paths to evade adblockers
app.get(['/tracker.js', '/p.js', '/stat.js', '/a.js'], (req, res) => {
  res.sendFile(path.join(__dirname, 'tracker.js'));
});

app.get('/install', async (req, res) => {
  if (req.query.key !== (process.env.ADMIN_PASSWORD || 'admin123')) return res.status(403).send('forbidden');
  const fs = require('fs');
  const sql = fs.readFileSync(path.join(__dirname, 'install.sql'), 'utf8');
  const migrateSql = fs.readFileSync(path.join(__dirname, 'migrate.sql'), 'utf8');
  res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:800px;margin:2em auto">
    <h1>Installation Analytics</h1>
    <p>1. Va dans <a href="https://supabase.com/dashboard/project/aupxallaghkovsauwgcz" target="_blank">Supabase Dashboard</a></p>
    <p>2. Ouvre <strong>SQL Editor</strong> → <strong>New Query</strong></p>
    <p>3. Copie-colle le SQL ci-dessous et exécute-le</p>
    <p>4. Après exécution, ajoute un site dans Supabase → <strong>Table Editor</strong> → <strong>sites</strong> → Insert row</p>
    <pre style="background:#f4f4f4;padding:1em;overflow:auto;max-height:500px;border:1px solid #ddd">${sql.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <hr><h2>Migration (si tables existent déjà)</h2>
    <p>Exécute ceci si les tables <strong>raw_events</strong> existent déjà :</p>
    <pre style="background:#f4f4f4;padding:1em;overflow:auto;max-height:200px;border:1px solid #ddd">${migrateSql.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <p>5. <a href="/">Retour au dashboard</a></p>
  </body></html>`);
});

setupWebSocket(wss);

// Run aggregation on startup then periodically
aggregateDaily();
aggregateHourly();
setInterval(() => aggregateHourly(), 3600000);
setInterval(() => aggregateDaily(), 86400000);
setInterval(() => cleanup(), 3600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Analytics server running on port ${PORT}`);
});

module.exports = { app, server };
