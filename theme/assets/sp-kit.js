/* sp-kit.js: the small window.UI helpers Snackpuncher's JavaScript engines (sp.js, sp-play.js) were written against,
   now that the app itself is Python Forms. Loaded after app-kit.js (UI.esc, UI.store, UI.icon, UI.plural, light/dark).

   Server:   UI.api(fn, ...args) / UI.apiQuiet go through window.SP_BRIDGE, a Python function set by client_code/sp.py
             (anvil.server.call there). A reply {ok: false, error} rejects; errors nobody catches become a toast.
   Host:     SP.host = Python functions (client_code/sp.py): toast, go, after. UI.toast / UI.go use them.
   Screens:  UI.page(name, opts, mount) keeps an engine screen in UI.pages; Components/Battle mounts the battle screen
             ('play' in sp-play.js) with UI.mountScreen.
   Also:     UI.me (set by Python on every page change), UI.busy, UI.fmtDate, UI.ago, and [data-go] links inside
             engine markup. */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  function host() { return (window.SP && window.SP.host) || {}; }  // sp.js replaces window.SP: look it up each time
  UI.pages = UI.pages || {};
  UI.me = UI.me || null;

  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  /* Mount an engine screen into el. Returns {ready: Promise, destroy()}; UI_READY turns true once it has loaded. */
  UI.mountScreen = function (name, el, args) {
    var p = UI.pages[name];
    if (!p) throw new Error('No screen called ' + name);
    var out = p.mount(el, { name: name, args: args || [], me: UI.me, page: p });
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    ready = Promise.resolve(ready).then(function (v) { window.UI_READY = true; return v; }, function (e) { window.UI_READY = true; throw e; });
    return { ready: ready, destroy: (out && out.destroy) || function () {} };
  };

  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString([], opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function () {
    var h = UI.hashFor.apply(null, arguments);
    if (host().go) { host().go(h); return; }
    location.hash = h;
  };
  UI.toast = function (msg, kind) {
    if (host().toast) { try { host().toast(String(msg), kind || ''); return; } catch (e) { /* fall through */ } }
    if (window.console) console.log('[toast]', msg);
  };

  /* ------------------------------------------------------------------ the server, through Python */
  function send(payload) {
    if (!window.SP_BRIDGE) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = window.SP_BRIDGE(JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true;
        if (r.detail) console.error(payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function expected(res) {
    if (res && typeof res === 'object' && res.ok === false) {
      var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
      throw err;
    }
    return res;
  }
  UI.api = function (fn) { return send({ fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: false }).then(expected); };
  UI.apiQuiet = function (fn) { return send({ fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: true }).then(expected); };
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* [data-go="page/arg"] inside engine markup (the battle's back buttons and results card) */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go]');
    if (!el) return;
    e.preventDefault();
    UI.go.apply(null, el.getAttribute('data-go').split('/'));
  });
})();
