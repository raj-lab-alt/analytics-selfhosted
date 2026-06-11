(function () {
  var scripts = document.getElementsByTagName('script');
  var script;
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src && (scripts[i].src.indexOf('/tracker.js') > -1 || scripts[i].src.indexOf('/a.js') > -1 || scripts[i].src.indexOf('/p.js') > -1 || scripts[i].src.indexOf('/stat.js') > -1)) { script = scripts[i]; break; }
  }
  if (!script) return;
  var siteId = script.getAttribute('data-site');
  var heatmap = script.getAttribute('data-heatmap') === 'true';
  if (!siteId) return;

  var apiUrl = script.getAttribute('data-api') || script.src.replace(/\/[^\/]+\.js$/, '/collect');
  var sessionId = sessionStorage.getItem('as_sid');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2) + Date.now().toString(36);
    sessionStorage.setItem('as_sid', sessionId);
    sessionStorage.setItem('as_started', Date.now());
  }

  var docHeight = Math.max(
    document.documentElement.scrollHeight, document.body.scrollHeight,
    document.documentElement.offsetHeight, document.body.offsetHeight,
    document.documentElement.clientHeight, document.body.clientHeight
  );

  function cleanUrl(u) {
    try { var p = new URL(u); var params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','fbclid','gclid','gclsrc','msclkid']; var q = new URLSearchParams(p.search); params.forEach(function(k) { q.delete(k); }); var s = q.toString(); return s ? p.origin + p.pathname + '?' + s : p.origin + p.pathname; } catch(e) { return u; }
  }

  function send(data) {
    data.site_id = parseInt(siteId);
    data.session_id = sessionId;
    data.started_at = parseInt(sessionStorage.getItem('as_started')) || Date.now();
    try { var q = new URL(window.location.href).searchParams; var u = q.get('utm_source'); if (u) data.utm_source = u; u = q.get('utm_medium'); if (u) data.utm_medium = u; u = q.get('utm_campaign'); if (u) data.utm_campaign = u; } catch(e) {}
    data.url = cleanUrl(window.location.href);
    data.referrer = document.referrer || '';
    data.screen_w = screen.width;
    data.screen_h = screen.height;
    data.ts = Date.now();
    try {
      var blob = new Blob([JSON.stringify(data)], { type: 'text/plain' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(apiUrl, blob)) {
        fetch(apiUrl, { method: 'POST', body: blob, keepalive: true }).catch(function() {});
      }
    } catch (e) {}
  }

  // Heatmap buffer & batch sender
  var heatBuffer = [];
  function flushHeat() {
    if (heatBuffer.length === 0) return;
    var batch = heatBuffer.splice(0);
    try {
      var blob = new Blob([JSON.stringify(batch)], { type: 'text/plain' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(apiUrl, blob)) {
        fetch(apiUrl, { method: 'POST', body: blob, keepalive: true }).catch(function() {});
      }
    } catch(e) {}
  }

  function addHeatEvent(event_type, e) {
    heatBuffer.push({
      event_type: event_type,
      x_ratio: e.clientX / (window.innerWidth || 1),
      y_ratio: (e.clientY + window.scrollY) / (docHeight || 1),
      doc_height: docHeight,
      x: e.clientX, y: e.clientY,
      viewport_w: window.innerWidth, viewport_h: window.innerHeight,
      scroll_y: window.scrollY,
      site_id: parseInt(siteId),
      session_id: sessionId,
      url: cleanUrl(window.location.href),
      referrer: document.referrer || '',
      ts: Date.now(),
    });
  }

  send({ event_type: 'pageview' });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushHeat();
      send({ event_type: 'exit' });
    }
  });
  var heartbeatTimer = setInterval(function () { send({ event_type: 'heartbeat' }); }, 30000);

  if (heatmap) {
    // Flush buffer every 2s
    setInterval(flushHeat, 2000);

    // Clicks: immediate (via buffer)
    document.addEventListener('click', function (e) {
      addHeatEvent('click', e);
    });

    // Moves: rAF throttled (~100ms)
    var movePending = false;
    var lastMoveTs = 0;
    document.addEventListener('mousemove', function (e) {
      if (movePending) return;
      var now = Date.now();
      if (now - lastMoveTs < 100) return;
      lastMoveTs = now;
      movePending = true;
      requestAnimationFrame(function () {
        addHeatEvent('move', e);
        movePending = false;
      });
    });

    // Touch: throttled similarly
    var touchPending = false;
    var lastTouchTs = 0;
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      if (!t) return;
      var now = Date.now();
      if (now - lastTouchTs < 100) return;
      lastTouchTs = now;
      touchPending = true;
      requestAnimationFrame(function () {
        addHeatEvent('touch', { clientX: t.clientX, clientY: t.clientY });
        touchPending = false;
      });
    });
    document.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!t) return;
      var now = Date.now();
      if (now - lastTouchTs < 200) return;
      lastTouchTs = now;
      touchPending = true;
      requestAnimationFrame(function () {
        addHeatEvent('touch', { clientX: t.clientX, clientY: t.clientY });
        touchPending = false;
      });
    });

    // Scroll events (for pageHeight estimation, non-critical → immediate send, no buffer)
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
