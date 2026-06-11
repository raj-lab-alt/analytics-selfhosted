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

async function loadOverview(days) {
  document.querySelectorAll('.chart-controls button').forEach(b => b.classList.toggle('active', b.dataset.days == days));

  const overview = await (await api('/api/overview?site_id=' + siteId + '&days=' + days)).json();

  if (chart) chart.destroy();
  const ctx = document.getElementById('overviewChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: overview.map(r => r.jour?.slice(5)),
      datasets: [
        { label: 'Page Views', data: overview.map(r => r.pages_vues), backgroundColor: '#4e73df' },
        { label: 'Visitors', data: overview.map(r => r.visiteurs), backgroundColor: '#1cc88a' }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
  });

  const today = overview[overview.length - 1] || {};
  document.getElementById('todayViews').textContent = today.pages_vues || 0;

  const total7 = overview.slice(-7).reduce((s, r) => s + r.pages_vues, 0);
  document.getElementById('weekViews').textContent = total7;

  const total30 = overview.slice(-30).reduce((s, r) => s + r.pages_vues, 0);
  document.getElementById('monthViews').textContent = total30;

  const stats = await (await api('/api/stats?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('avgVisit').textContent = stats.avgDuration + 's';

  const topCities = await (await api('/api/top-cities?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('topCity').textContent = topCities[0] ? topCities[0].location : '-';

  const topPages = await (await api('/api/top-pages?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('topPages').innerHTML =
    '<table><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>' +
    topPages.map(p => '<tr><td>' + p.page + '</td><td>' + p.vues + '</td></tr>').join('') + '</tbody></table>';

  const topSources = await (await api('/api/top-sources?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('topSources').innerHTML =
    '<table><thead><tr><th>Source</th><th>Views</th></tr></thead><tbody>' +
    topSources.map(s => '<tr><td>' + (s.referrer || '(direct)') + '</td><td>' + s.vues + '</td></tr>').join('') + '</tbody></table>';

  const traffic = await (await api('/api/traffic-sources?site_id=' + siteId + '&days=' + days)).json();
  const colors = { direct: '#858796', organic: '#1cc88a', social: '#4e73df', paid: '#e74a3b', referral: '#f6c23e' };
  document.getElementById('trafficGrid').innerHTML = traffic.map(t =>
    '<div class="traffic-card" style="border-left:4px solid ' + (colors[t.source] || '#858796') + '">' +
      '<h3>' + t.source.charAt(0).toUpperCase() + t.source.slice(1) + '</h3>' +
      '<p class="traffic-count">' + t.count + '</p>' +
      '<p class="traffic-pct">' + t.pct + '%</p>' +
    '</div>'
  ).join('');

  const platforms = await (await api('/api/platforms?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('platformDevices').innerHTML = '<table>' + platforms.devices.map(d =>
    '<tr><td>' + d.label.charAt(0).toUpperCase() + d.label.slice(1) + '</td><td>' + d.pct + '%</td></tr>'
  ).join('') + '</table>';
  document.getElementById('platformBrowsers').innerHTML = '<table>' + platforms.browsers.map(b =>
    '<tr><td>' + b.label + '</td><td>' + b.pct + '%</td></tr>'
  ).join('') + '</table>';
  document.getElementById('platformOS').innerHTML = '<table>' + platforms.os.map(o =>
    '<tr><td>' + o.label + '</td><td>' + o.pct + '%</td></tr>'
  ).join('') + '</table>';
}

document.addEventListener('DOMContentLoaded', function() {
  loadSites();
  loadOverview(7);
  document.querySelectorAll('.chart-controls button').forEach(b => {
    b.addEventListener('click', function() { loadOverview(parseInt(this.dataset.days)); });
  });
  setInterval(function() {
    api('/api/realtime?site_id=' + siteId).then(r => r.json()).then(d => {
      document.getElementById('activeCount').textContent = d.active;
    });
  }, 10000);
});
