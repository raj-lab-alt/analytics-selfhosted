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

  const topPages = await (await api('/api/top-pages?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('topPages').innerHTML =
    '<table><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>' +
    topPages.map(p => '<tr><td>' + p.page + '</td><td>' + p.vues + '</td></tr>').join('') + '</tbody></table>';

  const topSources = await (await api('/api/top-sources?site_id=' + siteId + '&days=' + days)).json();
  document.getElementById('topSources').innerHTML =
    '<table><thead><tr><th>Source</th><th>Views</th></tr></thead><tbody>' +
    topSources.map(s => '<tr><td>' + (s.referrer || '(direct)') + '</td><td>' + s.vues + '</td></tr>').join('') + '</tbody></table>';
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
