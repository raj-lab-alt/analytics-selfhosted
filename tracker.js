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
  var visitorId = localStorage.getItem('hm_visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2) + Date.now().toString(36);
    localStorage.setItem('hm_visitor_id', visitorId);
  }

  var docHeight = Math.max(
    document.documentElement.scrollHeight, document.body.scrollHeight,
    document.documentElement.offsetHeight, document.body.offsetHeight,
    document.documentElement.clientHeight, document.body.clientHeight
  );
  var maxScrollPercent = 0;
  var pageStartTime = Date.now();
  var lastClick = null;
  var rageClickCount = 0;

  function getDeviceType() {
    var w = window.innerWidth;
    if (w <= 767) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  function getDocSize() {
    return {
      w: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      h: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    };
  }

  function getCtaName(el) {
    var cta = el.closest ? el.closest('[data-heatmap-cta]') : null;
    if (cta) return cta.getAttribute('data-heatmap-cta');
    if (isClickable(el)) {
      var text = (el.innerText || el.value || '').trim().slice(0, 40);
      if (text) return text;
      if (el.id) return '#' + el.id;
      var href = el.getAttribute ? el.getAttribute('href') : null;
      if (href && href !== '#') return href;
      return el.tagName ? el.tagName.toLowerCase() : 'clickable';
    }
    return null;
  }

  function isClickable(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('a, button, input, select, textarea, [role="button"]');
  }

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

  var heatBuffer = [];
  function flushHeat() {
    if (heatBuffer.length === 0) return;
    var batch = heatBuffer.splice(0);
    var size = getDocSize();
    maxScrollPercent = Math.max(maxScrollPercent, Math.min(100, ((window.scrollY + window.innerHeight) / (size.h || 1)) * 100));
    batch.push({
      event_type: 'scroll',
      max_scroll_percent: maxScrollPercent,
      max_scroll_y: Math.round(window.scrollY),
      viewport_h: window.innerHeight,
      document_h: size.h,
      time_on_page_seconds: Math.round((Date.now() - pageStartTime) / 1000),
      device_type: getDeviceType(),
      visitor_id: visitorId,
      site_id: parseInt(siteId),
      session_id: sessionId,
      url: cleanUrl(window.location.href),
      referrer: document.referrer || '',
      ts: Date.now(),
    });
    try {
      var blob = new Blob([JSON.stringify(batch)], { type: 'text/plain' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(apiUrl, blob)) {
        fetch(apiUrl, { method: 'POST', body: blob, keepalive: true }).catch(function() {});
      }
    } catch(e) {}
  }

  function addHeatEvent(data) {
    data.visitor_id = visitorId;
    data.device_type = getDeviceType();
    heatBuffer.push(data);
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
    setInterval(flushHeat, 3000);

    document.addEventListener('click', function (e) {
      var target = e.target;
      var size = getDocSize();
      var x = e.pageX || (e.clientX + window.scrollX);
      var y = e.pageY || (e.clientY + window.scrollY);
      var ctaName = getCtaName(target);
      var now = Date.now();
      var isRage = false;
      if (lastClick && now - lastClick.time < 900 && Math.abs(x - lastClick.x) < 40 && Math.abs(y - lastClick.y) < 40) {
        rageClickCount++;
        if (rageClickCount >= 3) isRage = true;
      } else {
        rageClickCount = 0;
      }
      lastClick = { x: x, y: y, time: now };
      var text = (target.innerText || target.value || '').trim().slice(0, 80);
      var textHash = null;
      if (text && crypto.subtle) {
        try {
          var encoder = new TextEncoder();
          crypto.subtle.digest('SHA-256', encoder.encode(text)).then(function(buf) {
            var arr = Array.from(new Uint8Array(buf));
            finish(arr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join(''));
          }).catch(function(){ finish(null); });
        } catch(e) { finish(null); }
      } else { finish(null); }
      function finish(hash) {
        addHeatEvent({
          event_type: 'click',
          x: Math.round(x), y: Math.round(y),
          x_ratio: x / (size.w || 1),
          y_ratio: y / (size.h || 1),
          viewport_w: window.innerWidth, viewport_h: window.innerHeight,
          scroll_y: Math.round(window.scrollY),
          document_w: size.w, document_h: size.h,
          element_tag: target.tagName ? target.tagName.toLowerCase() : null,
          element_id: target.id || null,
          element_class: target.className ? String(target.className).slice(0, 500) : null,
          element_text_hash: hash,
          cta_name: ctaName,
          is_cta: !!ctaName,
          is_dead_click: !isClickable(target),
          is_rage_click: isRage,
        });
        if (ctaName) {
          addHeatEvent({
            event_type: 'cta_click',
            x: Math.round(x), y: Math.round(y),
            x_ratio: x / (size.w || 1),
            y_ratio: y / (size.h || 1),
            viewport_w: window.innerWidth, viewport_h: window.innerHeight,
            scroll_y: Math.round(window.scrollY),
            document_w: size.w, document_h: size.h,
            cta_name: ctaName,
            device_type: getDeviceType(),
            visitor_id: visitorId,
          });
        }
      }
    }, true);

    var movePending = false;
    var lastMoveTs = 0;
    document.addEventListener('mousemove', function (e) {
      if (movePending) return;
      var now = Date.now();
      if (now - lastMoveTs < 100) return;
      lastMoveTs = now;
      movePending = true;
      requestAnimationFrame(function () {
        addHeatEvent({
          event_type: 'move',
          x: e.clientX, y: e.clientY,
          x_ratio: e.clientX / (window.innerWidth || 1),
          y_ratio: (e.clientY + window.scrollY) / (docHeight || 1),
          viewport_w: window.innerWidth, viewport_h: window.innerHeight,
          scroll_y: Math.round(window.scrollY),
        });
        movePending = false;
      });
    });

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
        addHeatEvent({ event_type: 'touch', x: t.clientX, y: t.clientY, x_ratio: t.clientX / (window.innerWidth || 1), y_ratio: (t.clientY + window.scrollY) / (docHeight || 1), viewport_w: window.innerWidth, viewport_h: window.innerHeight, scroll_y: Math.round(window.scrollY) });
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
        addHeatEvent({ event_type: 'touch', x: t.clientX, y: t.clientY, x_ratio: t.clientX / (window.innerWidth || 1), y_ratio: (t.clientY + window.scrollY) / (docHeight || 1), viewport_w: window.innerWidth, viewport_h: window.innerHeight, scroll_y: Math.round(window.scrollY) });
        touchPending = false;
      });
    });

    window.addEventListener('scroll', function () {
      var size = getDocSize();
      var current = ((window.scrollY + window.innerHeight) / (size.h || 1)) * 100;
      maxScrollPercent = Math.max(maxScrollPercent, Math.min(100, current));
    }, { passive: true });

    // Form tracking
    document.querySelectorAll('form').forEach(function(f, fi) {
      var formName = f.getAttribute('data-heatmap-form') || f.getAttribute('name') || f.id || 'form_' + fi;
      var started = false;
      f.addEventListener('focusin', function(ev) {
        var field = ev.target;
        if (!field || (!field.name && !field.id)) return;
        if (!started) {
          started = true;
          addHeatEvent({
            event_type: 'form_event',
            event_name: 'form_start',
            form_name: formName,
            url: cleanUrl(window.location.href),
          });
        }
        addHeatEvent({
          event_type: 'form_event',
          event_name: 'field_focus',
          form_name: formName,
          field_name: field.name || field.id,
          field_type: field.type || field.tagName.toLowerCase(),
          field_order: Array.from(f.elements).indexOf(field),
          url: cleanUrl(window.location.href),
        });
      }, true);
      f.addEventListener('submit', function() {
        addHeatEvent({
          event_type: 'form_event',
          event_name: 'submit_click',
          form_name: formName,
          url: cleanUrl(window.location.href),
        });
        flushHeat();
      });
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
