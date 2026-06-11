let siteId = parseInt(localStorage.getItem('analytics_site_id')) || 1;
let chart;

function getToken() { return localStorage.getItem('token'); }
function api(path) { return fetch(path, { headers: { 'Authorization': 'Bearer ' + getToken() }}); }

async function loadSites() {
  const r = await api('/api/sites');
  if (!r.ok) return;
  const sites = await r.json();
  const sel = document.getElementById('siteSelect');
  if (!sel) return;
  sel.innerHTML = sites.map(s => `<option value="${s.id}" ${s.id == siteId ? 'selected' : ''}>${s.name} (${s.domain})</option>`).join('');
}

function changeSite(val) {
  siteId = parseInt(val);
  localStorage.setItem('analytics_site_id', siteId);
  loadOverview(parseInt(document.querySelector('.chart-controls button.active')?.dataset?.days) || 7);
}

async function loadOverview(selectedDays) {
  document.querySelectorAll('.chart-controls button').forEach(b => b.classList.toggle('active', b.dataset.days == selectedDays));

  // Always fetch 90 days so totals are accurate regardless of chart selection
  var overview = await (await api('/api/overview?site_id=' + siteId + '&days=90')).json();
  if (!Array.isArray(overview) || !overview.length) overview = [{ jour: new Date().toISOString().slice(0, 10), pages_vues: 0, visiteurs: 0, sessions: 0 }];

  // Chart: show only selected period
  if (chart) chart.destroy();
  const chartData = overview.slice(-selectedDays);
  const ctx = document.getElementById('overviewChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.map(r => {
        var d = r.jour || '';
        return d.slice(5) + '/' + d.slice(2, 4);
      }),
      datasets: [
        { label: 'Pages vues', data: chartData.map(r => r.pages_vues), backgroundColor: '#4e73df' },
        { label: 'Visiteurs', data: chartData.map(r => r.visiteurs), backgroundColor: '#1cc88a' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });

  // Stats cards from full data
  var today = overview[overview.length - 1] || {};
  document.getElementById('todayViews').textContent = today.pages_vues || 0;

  var total7 = overview.slice(-7).reduce(function(s, r) { return s + r.pages_vues; }, 0);
  document.getElementById('weekViews').textContent = total7;

  var total30 = overview.slice(-30).reduce(function(s, r) { return s + r.pages_vues; }, 0);
  document.getElementById('monthViews').textContent = total30;

  // Avg visit duration & top city (use selectedDays for these)
  try {
    var stats = await (await api('/api/stats?site_id=' + siteId + '&days=' + selectedDays)).json();
    document.getElementById('avgVisit').textContent = stats.avgDuration > 0 ? stats.avgDuration + 's' : '—';
  } catch(e) { document.getElementById('avgVisit').textContent = '—'; }

  try {
    var topCities = await (await api('/api/top-cities?site_id=' + siteId + '&days=' + selectedDays)).json();
    document.getElementById('topCity').textContent = topCities[0] ? topCities[0].location : '—';
  } catch(e) { document.getElementById('topCity').textContent = '—'; }

  // Top Pages
  try {
    var topPages = await (await api('/api/top-pages?site_id=' + siteId + '&days=' + selectedDays)).json();
    document.getElementById('topPages').innerHTML =
      '<table><thead><tr><th>Page</th><th>Vues</th></tr></thead><tbody>' +
      (topPages.length ? topPages.map(function(p) { return '<tr><td>' + esc(p.page) + '</td><td>' + p.vues + '</td></tr>'; }).join('') : '<tr><td colspan="2" style="color:#888">Aucune donnée</td></tr>') +
      '</tbody></table>';
  } catch(e) { document.getElementById('topPages').innerHTML = '<p style="color:#888">Erreur de chargement</p>'; }

  // Top Sources
  try {
    var topSources = await (await api('/api/top-sources?site_id=' + siteId + '&days=' + selectedDays)).json();
    document.getElementById('topSources').innerHTML =
      '<table><thead><tr><th>Source</th><th>Vues</th></tr></thead><tbody>' +
      (topSources.length ? topSources.map(function(s) { return '<tr><td>' + esc(s.referrer || '(direct)') + '</td><td>' + s.vues + '</td></tr>'; }).join('') : '<tr><td colspan="2" style="color:#888">Aucune donnée</td></tr>') +
      '</tbody></table>';
  } catch(e) { document.getElementById('topSources').innerHTML = '<p style="color:#888">Erreur de chargement</p>'; }

  // Traffic sources
  try {
    var traffic = await (await api('/api/traffic-sources?site_id=' + siteId + '&days=' + selectedDays)).json();
    var typeColors = { direct: '#858796', organic: '#1cc88a', social: '#4e73df', paid: '#e74a3b', referral: '#f6c23e' };
    document.getElementById('trafficGrid').innerHTML = traffic.length ? traffic.map(function(t) {
      return '<div class="traffic-card" style="border-left:4px solid ' + (typeColors[t.type] || '#858796') + '" title="' + t.type + '">' +
        '<h3>' + esc(t.source) + '</h3>' +
        '<p class="traffic-count">' + t.count + '</p>' +
        '<p class="traffic-pct">' + t.pct + '%</p>' +
      '</div>';
    }).join('') : '<p style="color:#888;padding:12px">Aucune donnée de trafic</p>';
  } catch(e) { document.getElementById('trafficGrid').innerHTML = '<p style="color:#888">Erreur</p>'; }

  // Platforms
  try {
    var platforms = await (await api('/api/platforms?site_id=' + siteId + '&days=' + selectedDays)).json();
    document.getElementById('platformDevices').innerHTML = platforms.devices.length ? '<table>' + platforms.devices.map(function(d) {
      return '<tr><td>' + d.label.charAt(0).toUpperCase() + d.label.slice(1) + '</td><td>' + d.pct + '%</td></tr>';
    }).join('') + '</table>' : '<p style="color:#888">Aucune donnée</p>';
    document.getElementById('platformBrowsers').innerHTML = platforms.browsers.length ? '<table>' + platforms.browsers.map(function(b) {
      return '<tr><td>' + esc(b.label) + '</td><td>' + b.pct + '%</td></tr>';
    }).join('') + '</table>' : '<p style="color:#888">Aucune donnée</p>';
    document.getElementById('platformOS').innerHTML = platforms.os.length ? '<table>' + platforms.os.map(function(o) {
      return '<tr><td>' + esc(o.label) + '</td><td>' + o.pct + '%</td></tr>';
    }).join('') + '</table>' : '<p style="color:#888">Aucune donnée</p>';
  } catch(e) {
    document.getElementById('platformDevices').innerHTML = '<p style="color:#888">Erreur</p>';
    document.getElementById('platformBrowsers').innerHTML = '<p style="color:#888">Erreur</p>';
    document.getElementById('platformOS').innerHTML = '<p style="color:#888">Erreur</p>';
  }
}

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('DOMContentLoaded', function() {
  loadSites();
  loadOverview(7);
  document.querySelectorAll('.chart-controls button').forEach(function(b) {
    b.addEventListener('click', function() { loadOverview(parseInt(this.dataset.days)); });
  });
  // Active count polling
  setInterval(function() {
    api('/api/realtime?site_id=' + siteId).then(function(r) { return r.json(); }).then(function(d) {
      var el = document.getElementById('activeCount');
      if (el) el.textContent = d.active;
    });
  }, 10000);
});
