(function () {
  var scripts = document.getElementsByTagName('script');
  var script;
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src && scripts[i].src.indexOf('/tracker.js') > -1) { script = scripts[i]; break; }
  }
  if (!script) return;
  var siteId = script.getAttribute('data-site');
  var heatmap = script.getAttribute('data-heatmap') === 'true';
  if (!siteId) return;

  var apiUrl = script.getAttribute('data-api') || script.src.replace('/tracker.js', '/collect');
  var sessionId = sessionStorage.getItem('as_sid');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2) + Date.now().toString(36);
    sessionStorage.setItem('as_sid', sessionId);
    sessionStorage.setItem('as_started', Date.now());
  }

  function cleanUrl(u) {
    try { var p = new URL(u); var params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','fbclid','gclid','gclsrc','msclkid']; var q = new URLSearchParams(p.search); params.forEach(function(k) { q.delete(k); }); var s = q.toString(); return s ? p.origin + p.pathname + '?' + s : p.origin + p.pathname; } catch(e) { return u; }
  }

  function send(data) {
    data.site_id = parseInt(siteId);
    data.session_id = sessionId;
    data.started_at = parseInt(sessionStorage.getItem('as_started')) || Date.now();
    data.url = cleanUrl(window.location.href);
    data.referrer = document.referrer || '';
    data.screen_w = screen.width;
    data.screen_h = screen.height;
    data.ts = Date.now();
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(apiUrl, new Blob([JSON.stringify(data)], { type: 'text/plain' }));
      } else {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', apiUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(data));
      }
    } catch (e) {}
  }

  send({ event_type: 'pageview' });
  window.addEventListener('beforeunload', function () { send({ event_type: 'exit' }); });
  var heartbeatTimer = setInterval(function () { send({ event_type: 'heartbeat' }); }, 30000);

  if (heatmap) {
    var moveTimer;
    document.addEventListener('click', function (e) {
      send({ event_type: 'click', x: e.clientX, y: e.clientY, viewport_w: window.innerWidth, viewport_h: window.innerHeight, scroll_y: window.scrollY });
    });
    document.addEventListener('mousemove', function (e) {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(function () {
        send({ event_type: 'move', x: e.clientX, y: e.clientY, viewport_w: window.innerWidth, viewport_h: window.innerHeight, scroll_y: window.scrollY });
      }, 250);
    });
    document.addEventListener('scroll', function () {
      send({ event_type: 'scroll', x: 0, y: 0, viewport_w: window.innerWidth, viewport_h: window.innerHeight, scroll_y: window.scrollY });
    });
  }

  var lastUrl = location.href;
  var origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    trackPageChange();
  };
  window.addEventListener('popstate', trackPageChange);
  function trackPageChange() {
    var newUrl = location.href;
    if (newUrl !== lastUrl) { lastUrl = newUrl; send({ event_type: 'pageview' }); }
  }
})();
