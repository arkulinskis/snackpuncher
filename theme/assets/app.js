/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
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
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback (footer + menu)
     All feedback goes to Prepsto. The widget tag in head.html (data-prepsto="CODE") slides its panel in;
     any [data-feedback] or [data-prepsto-open] element opens it. If the widget hasn't loaded, the panel opens in a new tab.
     There is no in-app feedback form any more: Admin -> Feedback only lists older messages (and app requests). */
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    var tag = document.querySelector('script[data-prepsto]');
    var code = tag && tag.getAttribute('data-prepsto');
    if (code && code.indexOf('__') !== 0) window.open('https://prepsto.com/#f/' + encodeURIComponent(code), '_blank', 'noopener');
    else UI.toast('Feedback is not set up yet.', 'error');
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'Snackpuncher',
    key: 'snackpuncher',          // prefix for this app's browser storage
    tagline: 'Punch the fast food. Save the realm.',   // footer line
    home: 'journey',             // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (me ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Get started</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<a href="https://prepsto.com/#f/j9t8eqs" target="_blank" rel="noopener" data-prepsto-open>Submit feedback</a>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _arkmusic.html ===== */
/* ark-music.js: the shared background-music player for Arkvital apps (canonical copy:
   APP_MAKER/media/public/ark-music.js; tools/music_sync.py copies it into each app).
   The music files are on Firebase Hosting: https://arkvital-media.web.app/music/<slug>.mp3
   (track list and which app uses what: APP_MAKER/media/manifest.json). Set window.ARK_MEDIA_BASE first to move them.

   ArkMusic.play('dont-stress-out')            loop one track
   ArkMusic.play(['cosmic', 'high-notes'])     playlist, loops the list
   ArkMusic.play(list, {shuffle: true, volume: 0.5, fade: 2, from: 'random'})
   ArkMusic.stop(fadeSeconds)                  fade out and stop
   ArkMusic.volume(0..1)                       app's music volume (slider)
   ArkMusic.duck(0..1)                         extra dip, e.g. 0.3 while a voice speaks; duck(1) to undo
   ArkMusic.enabled(bool)                      off = silent and nothing loads; on = resumes the last request
   ArkMusic.pause() / ArkMusic.resume()        hold the track where it is (a paused session), then carry on
   ArkMusic.onfail(fn)                         fn(slug) when a file can't load (play your synth music instead)
   ArkMusic.current()                          slug playing now, or null
   ArkMusic.state()                            {slug, time, paused, list, ...} for tests

   Volume goes through Web Audio when it can (iPhones ignore <audio>.volume), so the files are served with CORS.
   Browsers block sound until the first tap or key press; requests made before that start on the first gesture. */
(function () {
  if (window.ArkMusic) return;
  var BASE = (window.ARK_MEDIA_BASE || 'https://arkvital-media.web.app/') + 'music/';
  var ctx = null, master = null, useGraph = true;
  var vol = 0.6, duckLvl = 1, on = true, held = false, failFns = [];
  var want = null;          // last request {list, opts}
  var cur = null;           // {el, gain, slug}
  var unlocked = false, pendingStart = false, idx = 0, order = [];

  function graph() {
    if (ctx || !useGraph) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    } catch (e) { useGraph = false; ctx = null; }
    return ctx;
  }
  function level() { return on ? vol * duckLvl : 0; }
  function applyMaster(t) {
    t = t == null ? 0.25 : t;
    if (master) { var now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(level(), now, t / 3); }
    else if (cur) cur.el.volume = Math.max(0, Math.min(1, level() * cur.mix));
  }

  function makeVoice(slug) {
    var el = new Audio();
    el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.src = BASE + slug + '.mp3';
    var v = { el: el, slug: slug, gain: null, mix: 0 };
    if (graph()) {
      try { var src = ctx.createMediaElementSource(el); v.gain = ctx.createGain(); v.gain.gain.value = 0; src.connect(v.gain); v.gain.connect(master); }
      catch (e) { v.gain = null; }
    }
    el.addEventListener('error', function () { if (cur === v) { failFns.forEach(function (f) { try { f(slug); } catch (e) {} }); cur = null; } });
    el.addEventListener('ended', function () { if (cur === v) advance(); });
    return v;
  }
  function fadeVoice(v, to, sec, then) {
    if (v.gain) {
      var now = ctx.currentTime; v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now); v.gain.gain.linearRampToValueAtTime(to, now + Math.max(0.01, sec));
      v.mix = to; if (then) setTimeout(then, sec * 1000 + 30);
      return;
    }
    var from = v.mix, t0 = Date.now(), dur = Math.max(10, sec * 1000);
    (function step() {
      var k = Math.min(1, (Date.now() - t0) / dur); v.mix = from + (to - from) * k;
      v.el.volume = Math.max(0, Math.min(1, level() * v.mix));
      if (k < 1) setTimeout(step, 40); else if (then) then();
    })();
  }
  function retire(v, sec) { fadeVoice(v, 0, sec, function () { try { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); } catch (e) {} }); }

  function startSlug(slug, opts) {
    var old = cur, fade = opts.fade == null ? 1.5 : opts.fade;
    var v = makeVoice(slug); cur = v;
    v.el.loop = order.length === 1 && opts.loop !== false;
    if (opts.from === 'random' && !old) {
      v.el.addEventListener('loadedmetadata', function once() { v.el.removeEventListener('loadedmetadata', once); if (v.el.duration > 60) v.el.currentTime = Math.random() * v.el.duration * 0.6; });
    }
    if (old) retire(old, fade);
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    var p = v.el.play();
    if (p && p.catch) p.catch(function (e) { if (e && e.name === 'NotAllowedError') { pendingStart = true; } });
    applyMaster(0); fadeVoice(v, 1, old ? fade : Math.min(fade, 1));
  }
  function advance() {
    if (!want || !order.length) return;
    idx = (idx + 1) % order.length;
    if (idx === 0 && want.opts.shuffle) order = shuffled(order);
    startSlug(order[idx], want.opts);
  }
  function shuffled(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function same(a, b) { return a && b && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

  function gesture() {
    unlocked = true;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    if (pendingStart && cur && on && !held) { pendingStart = false; var p = cur.el.play(); if (p && p.catch) p.catch(function () { pendingStart = true; }); }
  }
  ['pointerdown', 'keydown', 'touchend', 'click'].forEach(function (ev) { window.addEventListener(ev, gesture, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', function () {
    if (!cur) return;
    if (document.hidden) { cur.el.pause(); } else if (on && want && !held) { var p = cur.el.play(); if (p && p.catch) p.catch(function () { pendingStart = true; }); }
  });

  window.ArkMusic = {
    base: BASE,
    url: function (slug) { return BASE + slug + '.mp3'; },
    play: function (list, opts) {
      opts = opts || {}; list = [].concat(list || []).filter(Boolean);
      if (opts.volume != null) vol = +opts.volume;
      if (!list.length) return this.stop(opts.fade);
      if (want && same(want.list, list) && cur) { if (held) this.resume(); applyMaster(); return this; }  // already playing this
      held = false;
      want = { list: list, opts: opts };
      order = opts.shuffle ? shuffled(list) : list.slice(); idx = 0;
      if (on) startSlug(order[0], opts);
      return this;
    },
    pause: function () {
      if (!cur || held) return this;
      held = true; var v = cur;
      fadeVoice(v, 0, 0.5, function () { if (held && cur === v) v.el.pause(); });
      return this;
    },
    resume: function () {
      if (!held) return this;
      held = false;
      if (cur && on) { var p = cur.el.play(); if (p && p.catch) p.catch(function () { pendingStart = true; }); fadeVoice(cur, 1, 0.8); }
      return this;
    },
    stop: function (fade) {
      want = null; pendingStart = false; held = false;
      if (cur) { retire(cur, fade == null ? 1 : fade); cur = null; }
      return this;
    },
    volume: function (v) { if (v == null) return vol; vol = Math.max(0, Math.min(1, +v)); applyMaster(); return this; },
    duck: function (k, sec) { duckLvl = Math.max(0, Math.min(1, k == null ? 1 : +k)); applyMaster(sec == null ? 0.4 : sec); return this; },
    enabled: function (b) {
      if (b == null) return on;
      b = !!b; if (b === on) return this; on = b;
      if (!on) { if (cur) { var c = cur; cur = null; retire(c, 0.6); } }
      else if (want) { var w = want; want = null; this.play(w.list, w.opts); }
      return this;
    },
    onfail: function (fn) { failFns.push(fn); return this; },
    current: function () { return cur ? cur.slug : null; },
    state: function () {  // for tests: what is playing and how far in
      return { slug: cur ? cur.slug : null, time: cur ? cur.el.currentTime : 0, paused: cur ? cur.el.paused : true, held: held,
        on: on, volume: vol, duck: duckLvl, list: want ? want.list.slice() : [], webAudio: !!(cur && cur.gain) };
    },
    unlocked: function () { return unlocked; }
  };
})();

/* ===== _sp.html ===== */
(function () {
  'use strict';
  var SP = window.SP = {};
  var esc = UI.esc;

  /* ------------------------------------------------------------------ data */
  var cache = null, cacheFor = null, pending = null;
  SP.load = function (force) {
    var who = UI.me ? UI.me.id : 'guest';
    if (cache && cacheFor === who && !force) return Promise.resolve(cache);
    if (pending && cacheFor === who && !force) return pending;
    cacheFor = who;
    pending = UI.api('get_game').then(function (d) { cache = d; pending = null; index(d.content); return d; },
      function (e) { pending = null; throw e; });
    return pending;
  };
  SP.data = function () { return cache; };
  SP.setProgress = function (p) { if (cache && p) cache.progress = p; };
  SP.forget = function () { cache = null; };
  var LANDS = {}, TERR = {};
  function index(c) {
    LANDS = {}; TERR = {};
    c.lands.forEach(function (L) { LANDS[L.key] = L; L.territories.forEach(function (t) { TERR[t.id] = { t: t, land: L }; }); });
  }
  SP.land = function (key) { return LANDS[key]; };
  SP.terr = function (tid) {
    if (tid === 'training') return { t: { id: 'training', n: 0, name: 'The Training Yard', boss: false, villager: null, items: [] }, land: LANDS.meadow, training: true };
    return TERR[tid] || null;
  };
  SP.order = function () { return cache ? [].concat.apply([], cache.content.lands.map(function (L) { return L.territories.map(function (t) { return t.id; }); })) : []; };
  SP.next = function (tid) { var o = SP.order(), i = o.indexOf(tid); return tid === 'training' ? o[0] : (i >= 0 && i < o.length - 1 ? o[i + 1] : null); };
  SP.prog = function () { return cache && cache.progress; };
  SP.starsOf = function (tid) { var p = SP.prog(); return p && p.terr[tid] ? (p.terr[tid].stars || 0) : 0; };
  SP.unlocked = function (tid) { var p = SP.prog(); return tid === 'training' || !!(p && p.unlocked.indexOf(tid) >= 0); };
  SP.GUEST_SETTINGS = { intensity: 'steady', seated: false, nofail: false, weight: null, music: 0.7, sfx: 0.9, skin: 'classic', passthrough: false };
  SP.settings = function () {
    var p = SP.prog();
    return p ? p.settings : Object.assign({}, SP.GUEST_SETTINGS, UI.store.get('guest_settings', {}));
  };
  SP.stars = function (n, max) {
    max = max || 3; var s = '';
    for (var i = 0; i < max; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return '<span class="sp-stars" aria-label="' + n + ' of ' + max + ' stars">' + s + '</span>';
  };
  SP.sprouts = function (n) { return '<span class="sp-sprouts" title="Sprouts">🌱 ' + Number(n || 0).toLocaleString() + '</span>'; };
  SP.who = function (key) { var c = cache && cache.content.cast[key]; return c || { name: key, emoji: '❔' }; };
  SP.sceneHtml = function (key) {
    var s = cache && cache.content.scenes[key];
    if (!s) return '';
    return '<div class="sp-scene">' + s.lines.map(function (l) {
      var c = SP.who(l[0]);
      return '<div class="sp-line ' + (l[0] === 'narrator' ? 'narrator' : l[0] === 'king' ? 'villain' : '') + '"><span class="sp-portrait" aria-hidden="true">' + c.emoji + '</span>' +
        '<div class="sp-bubble">' + (l[0] === 'narrator' ? '' : '<b>' + esc(c.name) + '</b>') + esc(l[1]) + '</div></div>';
    }).join('') + '</div>';
  };
  SP.markScene = function (key) {
    var p = SP.prog();
    if (!p || p.scenes.indexOf(key) >= 0) return;
    p.scenes.push(key);
    UI.apiQuiet('mark_scene', key).catch(function () {});
  };
  SP.muscleShares = function (moves) {
    var c = cache.content, out = {}, tot = 0;
    c.muscles.forEach(function (m) { out[m[0]] = 0; });
    Object.keys(moves || {}).forEach(function (k) {
      var mv = c.moves[k]; if (!mv) return;
      Object.keys(mv.muscles).forEach(function (m) { out[m] += moves[k] * mv.muscles[m]; tot += moves[k] * mv.muscles[m]; });
    });
    Object.keys(out).forEach(function (m) { out[m] = tot ? out[m] / tot : 0; });
    return out;
  };

  /* ------------------------------------------------------------------ randomness */
  SP.hash = function (s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  SP.rng = function (seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  /* ------------------------------------------------------------------ the battle pattern
     Beats are spread over warm-up, peak and cool-down, with a breather every 32 beats. Each move works certain
     muscles (content.moves); the generator keeps a decaying "load" per muscle and favours moves whose muscles
     are fresh, never repeats a move more than twice in a row, and alternates hands. */
  var BODY = { duck: 1, lean: 1, block: 1 };
  SP.isBody = function (m) { return !!BODY[m]; };
  SP.chart = function (tid, settings) {
    var c = cache.content, info = SP.terr(tid), land = info.land, isTraining = !!info.training;
    var inten = c.intensity[settings.intensity] || c.intensity.steady;
    var rnd = SP.rng(SP.hash(tid + '|' + settings.intensity + '|' + (settings.seated ? 's' : 'u')));
    var n = info.t.n || 1, li = land.index, boss = !!info.t.boss;
    var bpm = isTraining ? 92 : land.bpm + (n - 1) * 2;
    var secs = isTraining ? 84 : 72 + li * 7 + (n - 1) * 4 + (boss ? 40 : 0);
    var spb = 60 / bpm, beats = Math.floor(secs / spb), intro = 8;
    var events = [];
    var allowed = (isTraining ? ['jab', 'duck', 'lean', 'uppercut', 'hook', 'hammer', 'lunge', 'block'] : land.moves).filter(function (m) {
      return !(settings.seated && (m === 'duck' || m === 'lunge'));
    });
    var enemies = land.enemies;
    function enemy() { return enemies[Math.floor(rnd() * enemies.length)]; }
    var lastHand = 'R';
    function hand(m) {
      if (m === 'lunge' || m === 'hook' || BODY[m]) { lastHand = rnd() < 0.5 ? 'L' : 'R'; return lastHand; }
      if (rnd() < 0.12) return 'A';
      lastHand = rnd() < 0.82 ? (lastHand === 'L' ? 'R' : 'L') : lastHand;
      return lastHand;
    }
    function push(b, m, extra) {
      var e = { b: b, move: m, hand: hand(m), enemy: enemy() };
      if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
      events.push(e);
      return e;
    }

    if (isTraining) {  // a scripted lesson: each move on its own, then a little of everything
      var b = intro + 4;
      var lessons = [['jab', 8, 1], ['duck', 4, 2], ['lean', 4, 2], ['uppercut', 6, 1], ['hook', 6, 1], ['hammer', 6, 1], ['lunge', 4, 2], ['block', 3, 2]];
      lessons.forEach(function (L) {
        if (allowed.indexOf(L[0]) < 0) return;
        events.push({ b: b - 2, tip: L[0] });
        for (var i = 0; i < L[1]; i++) { push(b, L[0]); b += L[2] + (i % 2 ? 1 : 0); }
        b += 4;
      });
      events.push({ b: b - 2, tip: 'mix' });
      var mixMoves = allowed;
      for (var k = 0; k < 18 && b < beats - 2; k++) { var mm = mixMoves[k % mixMoves.length]; push(b, mm); b += BODY[mm] ? 2 : 1.5; }
      beats = Math.ceil(b + 4);
      return { bpm: bpm, spb: spb, beats: beats, intro: intro, events: events, lead: inten.lead + 0.2, boss: false, secs: beats * spb };
    }

    var load = {}; c.muscles.forEach(function (m) { load[m[0]] = 0; });
    var last = null, run = 0, lastB = -9, lastBody = -9;
    var base = { jab: 1.3, hook: 1.1, uppercut: 1.1, hammer: 1, lunge: 0.85, duck: 1.2, lean: 1.2, block: 0.8 };
    for (var bt = intro; bt < beats - 3; bt += 1) {
      Object.keys(load).forEach(function (m) { load[m] *= 0.9; });
      var ph = bt / beats;
      if ((bt - intro) % 32 >= 29) continue;                       // a breather every 32 beats
      var dens = ph < 0.12 ? 0.5 : ph > 0.9 ? 0.45 : inten.density;
      if (boss && ph > 0.4 && ph < 0.85) dens = Math.min(1, dens + 0.1);
      if (rnd() > dens) continue;
      if (bt - lastBody < 2) continue;                              // room around ducks, leans and blocks
      var weights = allowed.map(function (m) {
        var mv = c.moves[m], w = base[m] || 1;
        if (land.emphasis.indexOf(m) >= 0) w *= BODY[m] ? 3 : 2;
        var tired = 0; Object.keys(mv.muscles).forEach(function (mu) { tired += mv.muscles[mu] * load[mu]; });
        w /= 1 + 1.4 * tired;
        if (m === last && run >= 2) w = 0;
        if (BODY[m] && bt - lastB < 2) w = 0;
        if (ph < 0.12 && (m === 'lunge' || m === 'block')) w *= 0.3;
        return w;
      });
      var sum = weights.reduce(function (a, x) { return a + x; }, 0), r = rnd() * sum, pick = allowed[0];
      for (var i = 0; i < allowed.length; i++) { r -= weights[i]; if (r <= 0) { pick = allowed[i]; break; } }
      Object.keys(c.moves[pick].muscles).forEach(function (mu) { load[mu] += c.moves[pick].muscles[mu]; });
      run = pick === last ? run + 1 : 1; last = pick;
      var e = push(bt, pick);
      lastB = bt;
      if (BODY[pick]) { lastBody = bt; bt += 1; continue; }
      // a quick 1-2 with the other hand at the peak
      if ((pick === 'jab' || pick === 'uppercut' || pick === 'hook') && ph > 0.2 && ph < 0.85 && rnd() < inten.density * 0.35) {
        var other = e.hand === 'L' ? 'R' : 'L';
        events.push({ b: bt + 0.5, move: pick, hand: other, enemy: enemy() });
      }
    }
    return { bpm: bpm, spb: spb, beats: beats, intro: intro, events: events, lead: inten.lead, boss: boss, secs: beats * spb };
  };

  /* ------------------------------------------------------------------ three.js on demand */
  var threeP = null;
  SP.three = function () {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeP) return threeP;
    threeP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '_/theme/three.min.js'; s.async = true;
      s.onload = function () { window.THREE ? resolve(window.THREE) : reject(new Error('3D engine missing')); };
      s.onerror = function () { threeP = null; reject(new Error('Could not load the 3D engine. Check your connection.')); };
      document.head.appendChild(s);
    });
    return threeP;
  };

  /* ------------------------------------------------------------------ canvas textures (signs, cards, labels) */
  SP.fontsReady = function () {
    try { return Promise.race([Promise.all([document.fonts.load('700 40px Cinzel'), document.fonts.load('700 30px "Alegreya Sans"')]), new Promise(function (r) { setTimeout(r, 1500); })]); }
    catch (e) { return Promise.resolve(); }
  };
  SP.wrap = function (ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  };
  SP.parchment = function (ctx, w, h, opts) {
    opts = opts || {};
    var r = opts.r || 26;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, opts.top || '#fff6e2'); g.addColorStop(1, opts.bottom || '#efdcb4');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = opts.line || 8; ctx.strokeStyle = opts.border || '#8a6a3c'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(138,106,60,.45)';
    ctx.strokeRect(18, 18, w - 36, h - 36);
  };

  /* ------------------------------------------------------------------ the 3D kit: snacks, targets, gloves, cages */
  SP.Kit = function (T) {
    var mats = {}, geos = {};
    function mat(color, o) {
      var k = color + (o ? JSON.stringify(o) : '');
      if (!mats[k]) mats[k] = new T.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, o || {}));
      return mats[k];
    }
    function geo(k, make) { return geos[k] || (geos[k] = make()); }
    var G = {
      box: function (w, h, d) { return geo('b' + [w, h, d], function () { return new T.BoxGeometry(w, h, d); }); },
      cyl: function (a, b, h, s, open, ts, tl) { return geo('c' + [a, b, h, s, open, ts, tl], function () { return new T.CylinderGeometry(a, b, h, s || 10, 1, !!open, ts || 0, tl || Math.PI * 2); }); },
      sph: function (r, w, h) { return geo('s' + [r, w, h], function () { return new T.SphereGeometry(r, w || 12, h || 9); }); },
      hemi: function (r) { return geo('h' + r, function () { return new T.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); }); },
      cone: function (r, h, s) { return geo('k' + [r, h, s], function () { return new T.ConeGeometry(r, h, s || 8); }); },
      tor: function (r, t, arc) { return geo('t' + [r, t, arc], function () { return new T.TorusGeometry(r, t, 8, 18, arc || Math.PI * 2); }); },
      cap: function (r, l) { return geo('p' + [r, l], function () { return new T.CapsuleGeometry(r, l, 4, 10); }); },
      ico: function (r, d) { return geo('i' + [r, d], function () { return new T.IcosahedronGeometry(r, d || 0); }); },
      dod: function (r) { return geo('d' + r, function () { return new T.DodecahedronGeometry(r, 0); }); },
      oct: function (r) { return geo('o' + r, function () { return new T.OctahedronGeometry(r, 0); }); },
      knot: function () { return geo('knot', function () { return new T.TorusKnotGeometry(0.075, 0.026, 56, 6, 2, 3); }); }
    };
    function add(g, geom, color, p, r, s, o) {
      var m = new T.Mesh(geom, typeof color === 'object' ? color : mat(color, o));
      if (p) m.position.set(p[0], p[1], p[2]);
      if (r) m.rotation.set(r[0], r[1], r[2]);
      if (s) m.scale.set(s[0], s[1], s[2]);
      g.add(m);
      return m;
    }
    // googly eyes + angry brows, facing +z (towards the player)
    function eyes(g, y, z, spread, size, opts) {
      opts = opts || {};
      size = size || 0.04; spread = spread || 0.055;
      g.userData.pupils = g.userData.pupils || [];
      [-1, 1].forEach(function (s) {
        var sz = opts.odd && s > 0 ? size * 1.35 : size;
        add(g, G.sph(sz, 10, 8), '#ffffff', [s * spread, y, z], null, [1, 1, 0.55]);
        var p = add(g, G.sph(sz * 0.52, 8, 6), opts.glow ? '#ff3b1f' : '#1b130c', [s * spread, y - sz * 0.1, z + sz * 0.42], null, null, opts.glow ? { emissive: '#ff2200' } : null);
        p.userData.base = p.position.clone();
        g.userData.pupils.push(p);
        add(g, G.box(sz * 2.1, sz * 0.45, sz * 0.4), '#2b1d12', [s * spread * 1.05, y + sz * 1.25, z + 0.005], [0, 0, s * -0.42]);
      });
    }
    var FOOD = {
      fries: function (g) {
        add(g, G.cyl(0.13, 0.085, 0.19, 4), '#d23a2a', [0, -0.06, 0], [0, Math.PI / 4, 0]);
        add(g, G.box(0.13, 0.03, 0.005), '#ffd36a', [0, -0.02, 0.092]);
        for (var i = 0; i < 9; i++) add(g, G.box(0.026, 0.22, 0.026), '#f4c542', [-0.07 + (i % 5) * 0.035, 0.07 + (i % 3) * 0.02, -0.04 + Math.floor(i / 5) * 0.05], [0, 0, (i % 3 - 1) * 0.12]);
        eyes(g, -0.07, 0.09, 0.045, 0.032);
      },
      burger: function (g, dark) {
        add(g, G.cyl(0.15, 0.14, 0.05, 14), dark ? '#4a2e1a' : '#d79b52', [0, -0.08, 0]);
        add(g, G.cyl(0.158, 0.158, 0.045, 14), dark ? '#1e120b' : '#6b3a1f', [0, -0.035, 0]);
        add(g, G.box(0.24, 0.012, 0.24), dark ? '#7a6a2a' : '#ffc93c', [0, -0.008, 0], [0, Math.PI / 4, 0]);
        add(g, G.cyl(0.165, 0.165, 0.016, 14), dark ? '#3a4a20' : '#6fbf4a', [0, 0.006, 0]);
        add(g, G.hemi(0.15), dark ? '#5a3a22' : '#e0a458', [0, 0.012, 0], null, [1, 0.62, 1]);
        if (!dark) for (var i = 0; i < 7; i++) add(g, G.sph(0.012, 6, 4), '#fff6dc', [Math.cos(i * 2.4) * 0.07, 0.085 + (i % 2) * 0.006, Math.sin(i * 2.4) * 0.07], null, [1, 0.5, 1.6]);
        eyes(g, 0.055, 0.115, 0.05, 0.034, { glow: dark });
      },
      nugget: function (g) { add(g, G.dod(0.13), '#d9a441', null, [0.3, 0.4, 0], [1.2, 0.85, 0.75]); eyes(g, 0.02, 0.085, 0.05, 0.034); },
      wing: function (g) {
        add(g, G.sph(0.12, 10, 8), '#c5612a', [-0.03, 0, 0], null, [1.1, 0.85, 0.85]);
        add(g, G.cyl(0.024, 0.024, 0.13, 6), '#fff6e6', [0.13, 0, 0], [0, 0, Math.PI / 2]);
        add(g, G.sph(0.032, 6, 5), '#fff6e6', [0.2, 0.022, 0]); add(g, G.sph(0.032, 6, 5), '#fff6e6', [0.2, -0.022, 0]);
        eyes(g, 0.03, 0.09, 0.05, 0.034);
      },
      hotdog: function (g) {
        add(g, G.cap(0.068, 0.24), '#e0a458', [0, -0.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.85]);
        add(g, G.cap(0.045, 0.3), '#b44a2c', [0, 0.035, 0.01], [0, 0, Math.PI / 2]);
        for (var i = 0; i < 4; i++) add(g, G.box(0.06, 0.012, 0.012), '#ffd23f', [-0.09 + i * 0.06, 0.082, 0.02], [0, 0, i % 2 ? 0.5 : -0.5]);
        eyes(g, 0.04, 0.06, 0.05, 0.03);
      },
      chip: function (g) { add(g, G.cyl(0.17, 0.17, 0.025, 3), '#e9b53a', null, [Math.PI / 2, 0, Math.PI / 2]); eyes(g, 0.0, 0.02, 0.05, 0.034); },
      shake: function (g) {
        add(g, G.cyl(0.11, 0.08, 0.22, 12), '#f4a6c0', [0, -0.04, 0]);
        add(g, G.cyl(0.115, 0.115, 0.03, 12), '#fff6f0', [0, -0.13, 0]);
        add(g, G.sph(0.11, 10, 8), '#fffaf3', [0, 0.09, 0], null, [1, 0.7, 1]);
        add(g, G.sph(0.034, 8, 6), '#d2232a', [0, 0.17, 0]);
        add(g, G.cyl(0.012, 0.012, 0.22, 6), '#e94b4b', [0.05, 0.16, -0.02], [0, 0, -0.3]);
        eyes(g, -0.02, 0.1, 0.045, 0.032);
      },
      cone: function (g) {
        add(g, G.cone(0.085, 0.22, 10), '#d9a35c', [0, -0.08, 0], [Math.PI, 0, 0]);
        add(g, G.sph(0.11, 12, 9), '#9fe0c6', [0, 0.06, 0]);
        add(g, G.sph(0.05, 8, 6), '#ffe8f0', [0.03, 0.15, 0.02]);
        eyes(g, 0.06, 0.095, 0.045, 0.032);
      },
      slush: function (g) {
        add(g, G.cyl(0.1, 0.075, 0.22, 12), '#5aa7ef', [0, -0.03, 0]);
        add(g, G.hemi(0.1), '#dff3ff', [0, 0.08, 0], null, [1, 0.6, 1], { transparent: true, opacity: 0.8 });
        add(g, G.cyl(0.012, 0.012, 0.2, 6), '#ffffff', [-0.03, 0.15, 0], [0, 0, 0.25]);
        eyes(g, -0.01, 0.095, 0.042, 0.03);
      },
      fishstick: function (g) {
        add(g, G.box(0.3, 0.085, 0.1), '#d2913c', null, null, null);
        add(g, G.box(0.31, 0.02, 0.105), '#b9762a', [0, -0.03, 0]);
        eyes(g, 0.01, 0.055, 0.055, 0.03);
      },
      shrimp: function (g) {
        add(g, G.tor(0.085, 0.045, Math.PI * 1.35), '#f08a5d', null, [0, 0, 0.3]);
        add(g, G.cone(0.05, 0.08, 5), '#e0603a', [0.07, -0.09, 0], [0, 0, 2.4]);
        eyes(g, 0.07, 0.05, 0.04, 0.028);
      },
      pretzel: function (g) {
        add(g, G.knot(), '#8a5a2b', null, null, [1.1, 1.1, 0.8]);
        for (var i = 0; i < 6; i++) add(g, G.box(0.014, 0.014, 0.014), '#ffffff', [Math.cos(i) * 0.08, Math.sin(i * 1.7) * 0.07, 0.05]);
        eyes(g, 0.03, 0.07, 0.045, 0.03);
      },
      can: function (g) {
        add(g, G.cyl(0.08, 0.08, 0.25, 14), '#3a8fd9');
        add(g, G.cyl(0.081, 0.081, 0.06, 14), '#ffd23f', [0, -0.05, 0]);
        add(g, G.cyl(0.07, 0.08, 0.02, 14), '#cfd6dd', [0, 0.135, 0]);
        eyes(g, 0.05, 0.075, 0.035, 0.026);
      },
      cola: function (g) {
        add(g, G.cyl(0.11, 0.085, 0.24, 12), '#d23a2a', [0, -0.03, 0]);
        add(g, G.cyl(0.115, 0.115, 0.02, 12), '#ffffff', [0, 0.095, 0]);
        add(g, G.cyl(0.011, 0.011, 0.2, 6), '#ffffff', [0.03, 0.18, 0], [0, 0, -0.2]);
        add(g, G.box(0.12, 0.03, 0.005), '#ffffff', [0, -0.06, 0.1]);
        eyes(g, 0.02, 0.1, 0.045, 0.03);
      },
      popcorn: function (g) {
        add(g, G.cyl(0.11, 0.08, 0.2, 8), '#d23a2a', [0, -0.05, 0]);
        add(g, G.cyl(0.112, 0.112, 0.04, 8), '#ffffff', [0, 0.02, 0]);
        for (var i = 0; i < 8; i++) add(g, G.ico(0.042, 0), '#fff4d6', [Math.cos(i * 0.8) * 0.06, 0.08 + (i % 3) * 0.03, Math.sin(i * 0.8) * 0.06]);
        eyes(g, -0.05, 0.1, 0.045, 0.03);
      },
      nacho: function (g) {
        add(g, G.cyl(0.17, 0.17, 0.025, 3), '#f2b632', null, [Math.PI / 2, 0, Math.PI / 2]);
        add(g, G.sph(0.06, 8, 6), '#ff9d1a', [0, 0.06, 0.01], null, [1.4, 0.6, 0.7]);
        eyes(g, -0.02, 0.025, 0.05, 0.034);
      },
      cheesewheel: function (g) {
        add(g, G.cyl(0.15, 0.15, 0.1, 14), '#f2c14e', null, [Math.PI / 2, 0, 0]);
        [[-0.07, -0.06], [0.08, -0.04], [0.02, -0.1], [-0.09, 0.05]].forEach(function (h) { add(g, G.cyl(0.02, 0.02, 0.01, 8), '#c99528', [h[0], h[1], 0.051], [Math.PI / 2, 0, 0]); });
        eyes(g, 0.04, 0.06, 0.05, 0.034);
      },
      quesadilla: function (g) {
        add(g, G.cyl(0.16, 0.16, 0.045, 12, false, 0, Math.PI), '#e7b864', null, [Math.PI / 2, 0, Math.PI / 2]);
        add(g, G.box(0.28, 0.02, 0.03), '#ffb21a', [0, 0, 0.012]);
        eyes(g, -0.05, 0.03, 0.045, 0.03);
      },
      donut: function (g) {
        add(g, G.tor(0.1, 0.05), '#d89a52');
        add(g, G.tor(0.1, 0.052), '#f48cb6', [0, 0, 0.014], null, [1, 1, 0.6]);
        for (var i = 0; i < 10; i++) add(g, G.box(0.022, 0.008, 0.008), ['#ffffff', '#5ad1ff', '#ffe04a', '#7ce06a'][i % 4], [Math.cos(i * 0.63) * 0.1, Math.sin(i * 0.63) * 0.1, 0.05], [0, 0, i]);
        eyes(g, 0.1, 0.05, 0.045, 0.03);
      },
      churro: function (g) { add(g, G.cyl(0.042, 0.042, 0.36, 8), '#c98a3a', null, [0, 0, 0.5]); eyes(g, 0.03, 0.04, 0.035, 0.026); },
      cotton: function (g) {
        add(g, G.cyl(0.01, 0.01, 0.22, 6), '#ffffff', [0, -0.13, 0]);
        add(g, G.ico(0.11, 1), '#f7a8d0', [0, 0.02, 0]); add(g, G.ico(0.07, 1), '#bfe3ff', [0.07, 0.07, -0.02]); add(g, G.ico(0.07, 1), '#f7a8d0', [-0.08, 0.06, 0]);
        eyes(g, 0.02, 0.09, 0.045, 0.03);
      },
      corndog: function (g) {
        add(g, G.cap(0.07, 0.17), '#d79a3c');
        add(g, G.cyl(0.01, 0.01, 0.16, 6), '#e9d4a8', [0, -0.19, 0]);
        eyes(g, 0.04, 0.06, 0.04, 0.03);
      },
      onionring: function (g) { add(g, G.tor(0.1, 0.045), '#e2b04a'); eyes(g, 0.1, 0.045, 0.045, 0.03); },
      mozz: function (g) {
        add(g, G.box(0.09, 0.27, 0.09), '#d9a441');
        add(g, G.box(0.07, 0.03, 0.07), '#fff6e6', [0, 0.145, 0]);
        eyes(g, 0.05, 0.05, 0.03, 0.024);
      },
      burnt: function (g) { FOOD.burger(g, true); },
      mystery: function (g) {
        add(g, G.dod(0.13), '#8a6f5f', null, [0.4, 0.2, 0.1], [1.1, 0.9, 0.8]);
        add(g, G.ico(0.06, 0), '#a2836e', [0.09, 0.07, 0.02]); add(g, G.ico(0.05, 0), '#6f5546', [-0.1, -0.05, 0.03]);
        eyes(g, 0.02, 0.095, 0.05, 0.032, { odd: true, glow: true });
      },
      taco: function (g) {
        add(g, G.cyl(0.15, 0.15, 0.08, 12, true, 0, Math.PI), new T.MeshLambertMaterial({ color: '#f0c04a', side: T.DoubleSide, flatShading: true }), [0, 0.04, 0], [Math.PI / 2, 0, Math.PI / 2]);
        add(g, G.box(0.2, 0.04, 0.05), '#6fbf4a', [0, 0.04, 0]);
        add(g, G.sph(0.03, 6, 5), '#d2232a', [-0.05, 0.07, 0.01]); add(g, G.sph(0.03, 6, 5), '#d2232a', [0.05, 0.07, 0.01]);
        eyes(g, -0.06, 0.045, 0.045, 0.03);
      },
      pizza: function (g) {
        add(g, G.cyl(0.24, 0.24, 0.025, 6, false, -Math.PI / 6, Math.PI / 3), '#f6c453', [0, -0.12, 0], [Math.PI / 2, 0, 0]);
        add(g, G.box(0.25, 0.04, 0.035), '#c98a3a', [0, 0.085, 0]);
        [[0, 0.0], [-0.04, 0.05], [0.045, 0.04]].forEach(function (p) { add(g, G.cyl(0.025, 0.025, 0.01, 10), '#c0392b', [p[0], p[1], 0.016], [Math.PI / 2, 0, 0]); });
        eyes(g, -0.06, 0.025, 0.035, 0.026);
      },
      king: function (g) {
        FOOD.burger(g);
        add(g, G.cyl(0.11, 0.11, 0.07, 10, true), new T.MeshLambertMaterial({ color: '#ffcc33', side: T.DoubleSide, flatShading: true }), [0, 0.13, 0]);
        for (var i = 0; i < 6; i++) add(g, G.cone(0.025, 0.06, 4), '#ffcc33', [Math.cos(i) * 0.1, 0.19, Math.sin(i) * 0.1]);
        add(g, G.sph(0.018, 6, 5), '#d2232a', [0, 0.14, 0.11]);
      }
    };
    SP.FOODS = Object.keys(FOOD);
    function food(kind) {
      var g = new T.Group();
      (FOOD[kind] || FOOD.burger)(g);
      g.userData.kind = kind;
      return g;
    }
    function boss(kind) {
      var g = food(kind);
      if (kind !== 'king') {  // horns and glowing eyes for every boss but the King (he has his crown)
        add(g, G.cone(0.03, 0.09, 5), '#3a2a1a', [-0.06, 0.16, 0], [0, 0, 0.4]);
        add(g, G.cone(0.03, 0.09, 5), '#3a2a1a', [0.06, 0.16, 0], [0, 0, -0.4]);
      }
      (g.userData.pupils || []).forEach(function (p) { p.material = mat('#ff3b1f', { emissive: '#ff2200' }); });
      return g;
    }
    var HAND = { L: '#4fb35f', R: '#e2483a', A: '#f2c14e' };
    // marker ring + arrow showing which glove and which way to punch
    function marker(move, hand, dir) {
      var g = new T.Group(), col = HAND[hand] || HAND.A;
      var big = move === 'lunge';
      add(g, G.tor(big ? 0.24 : 0.2, 0.014), col, null, null, null, { emissive: col, emissiveIntensity: 0.6 });
      if (dir) {
        var a = add(g, G.cone(0.06, 0.12, 4), '#fffaf0', [0, 0, 0.16], null, null, { emissive: '#ffffff', emissiveIntensity: 0.3 });
        var rz = { up: 0, down: Math.PI, right: -Math.PI / 2, left: Math.PI / 2 }[dir];
        a.rotation.set(0, 0, rz);
        var off = 0.24;
        a.position.set({ right: -off, left: off }[dir] || 0, { up: -off, down: off }[dir] || 0, 0.04);
      } else {
        add(g, G.sph(0.03, 8, 6), col, [0, 0, 0.16], null, null, { emissive: col, emissiveIntensity: 0.8 });
      }
      return g;
    }
    function glove(color, trim) {
      var g = new T.Group();
      var c = mat(color, { emissive: color, emissiveIntensity: 0.12 });
      add(g, G.sph(0.06, 14, 10), c, [0, 0, -0.02], null, [1, 0.92, 1.25]);
      add(g, G.sph(0.028, 8, 6), c, [0.045, -0.01, -0.035], null, [1, 1, 1.4]);
      add(g, G.cyl(0.045, 0.05, 0.08, 12), '#fffaf0', [0, 0, 0.07], [Math.PI / 2, 0, 0]);
      add(g, G.cyl(0.052, 0.052, 0.018, 12), trim || color, [0, 0, 0.11], [Math.PI / 2, 0, 0]);
      var tip = new T.Object3D(); tip.position.set(0, 0, -0.06); g.add(tip); g.userData.tip = tip;
      return g;
    }
    function cage() {
      var g = new T.Group();
      add(g, G.cyl(0.3, 0.3, 0.05, 12), '#6b4a2b', [0, -0.28, 0]);
      add(g, G.cyl(0.3, 0.3, 0.05, 12), '#6b4a2b', [0, 0.28, 0]);
      for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; add(g, G.cyl(0.012, 0.012, 0.56, 5), '#8a8f96', [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28]); }
      add(g, G.cone(0.33, 0.18, 12), '#d23a2a', [0, 0.39, 0]);
      return g;
    }
    return { T: T, G: G, mat: mat, add: add, food: food, boss: boss, marker: marker, glove: glove, cage: cage, eyes: eyes, HAND: HAND };
  };

  /* ------------------------------------------------------------------ the land around you */
  SP.World = function (T, kit, land, opts) {
    opts = opts || {};
    var G = kit.G, group = new T.Group(), rnd = SP.rng(SP.hash(land.key + '#world'));
    var sky = (function () {
      var cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
      var cx = cv.getContext('2d'), gr = cx.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, land.sky[0]); gr.addColorStop(0.55, land.sky[1]); gr.addColorStop(1, land.fog);
      cx.fillStyle = gr; cx.fillRect(0, 0, 4, 256);
      var tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      var m = new T.Mesh(new T.SphereGeometry(160, 24, 12), new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false }));
      m.renderOrder = -10;
      return m;
    })();
    group.add(sky);
    var ground = new T.Mesh(new T.CircleGeometry(150, 40), new T.MeshLambertMaterial({ color: land.ground }));
    ground.rotation.x = -Math.PI / 2; group.add(ground);
    var path = new T.Mesh(new T.PlaneGeometry(2.6, 70), new T.MeshLambertMaterial({ color: land.path }));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.006, -34); group.add(path);
    for (var i = 0; i < 18; i++) {  // stepping stones along the path edges
      [-1, 1].forEach(function (s) {
        var st = new T.Mesh(G.cyl(0.18, 0.22, 0.08, 6), kit.mat('#a39074'));
        st.position.set(s * 1.45, 0.03, -2 - i * 3.6); group.add(st);
      });
    }
    var circle = new T.Mesh(new T.RingGeometry(0.42, 0.5, 40), new T.MeshBasicMaterial({ color: land.accent, transparent: true, opacity: 0.85 }));
    circle.rotation.x = -Math.PI / 2; circle.position.y = 0.012; group.add(circle);

    var hemi = new T.HemisphereLight(land.sky[1], land.ground, 1.0);
    var sun = new T.DirectionalLight('#fff3dc', 0.85); sun.position.set(6, 12, 5);
    group.add(hemi); group.add(sun);

    // props: each kind is a few parts; every part becomes one InstancedMesh (few draw calls for the Quest)
    var P = {
      tree: [[G.cyl(0.12, 0.18, 1.2, 6), '#7a5230', 0.6], [G.cone(0.95, 2.2, 7), '#4f8f3a', 2.0]],
      pine: [[G.cyl(0.1, 0.15, 0.8, 6), '#6b4a2b', 0.4], [G.cone(0.9, 1.6, 7), '#2f6d4a', 1.4], [G.cone(0.65, 1.3, 7), '#3f7f5a', 2.3], [G.cone(0.35, 0.6, 7), '#f4fbff', 3.0]],
      snowpine: [[G.cyl(0.1, 0.15, 0.8, 6), '#6b4a2b', 0.4], [G.cone(0.9, 1.6, 7), '#e8f4fb', 1.4], [G.cone(0.65, 1.3, 7), '#cfe6f2', 2.3]],
      bush: [[G.ico(0.7, 0), '#5f9e45', 0.35]],
      rock: [[G.dod(0.7), '#8f8a80', 0.25]],
      darkrock: [[G.dod(0.8), '#3b2a24', 0.3]],
      hay: [[G.cyl(0.7, 0.85, 0.9, 10), '#e4c15a', 0.45], [G.cone(0.72, 0.5, 10), '#d8b24a', 1.15]],
      hill: [[G.sph(7, 12, 6), '#6f9a4c', -2.5]],
      mountain: [[G.cone(12, 24, 7), '#7d8a99', 11]],
      snowmount: [[G.cone(12, 24, 7), '#c9dceb', 11], [G.cone(5.1, 10, 7), '#ffffff', 18.6]],
      volcano: [[G.cone(11, 16, 9), '#3a2620', 7.5], [G.cyl(2.2, 2.2, 0.4, 9), '#ff7a2f', 15.3, { emissive: '#ff5a1a', emissiveIntensity: 0.9 }]],
      lava: [[G.cyl(1.1, 1.1, 0.04, 12), '#ff7a2f', 0.02, { emissive: '#ff5a1a', emissiveIntensity: 0.8 }]],
      deadtree: [[G.cyl(0.08, 0.2, 2.6, 5), '#3e2c22', 1.3], [G.cyl(0.04, 0.07, 1.2, 4), '#3e2c22', 2.1]],
      spike: [[G.cone(0.4, 2.6, 5), '#a9d8f5', 1.3, { emissive: '#7cc3ef', emissiveIntensity: 0.25 }]],
      mound: [[G.sph(1.4, 10, 6), '#f4fbff', -0.6]],
      dune: [[G.sph(5, 12, 6), '#e3cf9f', -3.2]],
      stone: [[G.box(0.7, 2.6, 0.5), '#8a8a7a', 1.3]],
      tuft: [[G.cone(0.2, 0.7, 4), '#a6b06a', 0.35]],
      cloud: [[G.ico(3, 1), '#ffffff', 22, { transparent: true, opacity: 0.92, emissive: '#ffffff', emissiveIntensity: 0.35 }, 0, [1.8, 0.55, 1.2]]],
      stormcloud: [[G.ico(3.5, 1), '#5a5f86', 17, null, 0, [1.8, 0.5, 1.2]]],
      stalag: [[G.cone(0.6, 3.2, 6), '#7a6248', 1.6]],
      stalac: [[G.cone(0.7, 4, 6), '#5a4836', 12, null, Math.PI]],
      cheesecrystal: [[G.oct(0.6), '#ffcc33', 0.7, { emissive: '#f2a900', emissiveIntensity: 0.5 }]],
      lolly: [[G.cyl(0.05, 0.05, 2.2, 6), '#ffffff', 1.1], [G.cyl(0.65, 0.65, 0.14, 18), '#ef6fa8', 2.4, null, Math.PI / 2]],
      candytree: [[G.cyl(0.06, 0.08, 1.6, 6), '#fff0f6', 0.8], [G.ico(0.9, 1), '#ffb3d6', 2.2]],
      island: [[G.cone(2.6, 4.5, 7), '#c9a6d8', 9, null, Math.PI], [G.cyl(2.6, 2.6, 0.5, 7), '#a8e0b4', 11.4]],
      pinkcloud: [[G.ico(2.6, 1), '#ffe3f1', 16, { transparent: true, opacity: 0.92, emissive: '#ffd6ea', emissiveIntensity: 0.3 }, 0, [1.8, 0.55, 1.2]]],
      lily: [[G.cyl(0.55, 0.55, 0.03, 10), '#5a8a3a', 0.03]],
      mushroom: [[G.cyl(0.08, 0.12, 0.5, 6), '#f3ead8', 0.25], [G.hemi(0.32), '#9b3fbf', 0.48]],
      grave: [[G.box(0.6, 0.85, 0.18), '#6f6a7a', 0.42]],
      lantern: [[G.cyl(0.04, 0.04, 1.6, 5), '#2a2230', 0.8], [G.box(0.2, 0.26, 0.2), '#ffcf6a', 1.7, { emissive: '#ffb33a', emissiveIntensity: 1 }]],
      gloomtree: [[G.cyl(0.1, 0.22, 2.2, 5), '#231c2c', 1.1], [G.cone(1.0, 2.8, 5), '#3a2f52', 2.9]],
      tower: [[G.cyl(1.6, 1.9, 10, 10), '#b9a07a', 5], [G.cone(2.2, 3.4, 10), '#c0392b', 11.7]],
      wall: [[G.box(9, 4.5, 1.2), '#a88e68', 2.25]],
      brazier: [[G.cyl(0.25, 0.12, 0.8, 8), '#5a4632', 0.4], [G.cone(0.25, 0.6, 6), '#ffcc33', 1.05, { emissive: '#ff9900', emissiveIntensity: 1 }]],
      reed: [[G.cyl(0.03, 0.03, 1.3, 4), '#6f7a3a', 0.65], [G.cap(0.06, 0.18), '#5a3a22', 1.35]]
    };
    function scatter(kind, count, rmin, rmax, smin, smax, sector) {
      var parts = P[kind]; if (!parts) return;
      var mats = [];
      var spots = [];
      var tries = 0;
      while (spots.length < count && tries++ < count * 20) {
        var a = sector ? sector[0] + rnd() * (sector[1] - sector[0]) : rnd() * Math.PI * 2;
        var r = rmin + rnd() * (rmax - rmin);
        var x = Math.sin(a) * r, z = -Math.cos(a) * r;
        if (Math.abs(x) < 3.2 && z < 2.5 && z > -75) continue;   // keep the lane clear
        if (Math.abs(x) < 1.5 && Math.abs(z) < 1.5) continue;
        spots.push([x, z, smin + rnd() * (smax - smin), rnd() * Math.PI * 2]);
      }
      parts.forEach(function (pt) {
        var o = pt[3] ? Object.assign({ color: pt[1], flatShading: true }, pt[3]) : { color: pt[1], flatShading: true };
        var im = new T.InstancedMesh(pt[0], new T.MeshLambertMaterial(o), spots.length);
        var m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
        spots.forEach(function (s, i) {
          e.set(pt[4] || 0, s[3], 0);
          q.setFromEuler(e);
          var k = pt[5] || [1, 1, 1];
          m4.compose(new T.Vector3(s[0], pt[2] * s[2], s[1]), q, new T.Vector3(s[2] * k[0], s[2] * k[1], s[2] * k[2]));
          im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
        group.add(im); mats.push(im);
      });
    }
    function water(color, x, z, w, d, op) {
      var m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshLambertMaterial({ color: color, transparent: true, opacity: op || 0.9 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); group.add(m); return m;
    }
    var fx = { color: '#ffffff', size: 0.05, vy: 0, sway: 0.2, count: 220, glow: false };
    var flash = false;
    switch (land.props) {
      case 'meadow':
        scatter('hill', 12, 45, 90, 0.8, 1.5); scatter('tree', 36, 7, 40, 0.8, 1.4); scatter('bush', 30, 5, 30, 0.6, 1.2);
        scatter('hay', 8, 8, 25, 0.8, 1.1); scatter('rock', 10, 6, 30, 0.4, 0.9); scatter('cloud', 9, 60, 110, 0.8, 1.4);
        fx = { color: '#fff6a8', size: 0.04, vy: 0.05, sway: 0.4, count: 160, glow: true }; break;
      case 'ember':
        scatter('volcano', 6, 55, 100, 0.9, 1.4); scatter('darkrock', 40, 5, 40, 0.5, 1.4); scatter('lava', 14, 5, 30, 0.6, 1.4);
        scatter('deadtree', 18, 6, 35, 0.8, 1.3);
        fx = { color: '#ffab4a', size: 0.05, vy: 0.5, sway: 0.3, count: 260, glow: true }; break;
      case 'frost':
        scatter('snowmount', 12, 55, 100, 0.8, 1.4); scatter('pine', 20, 8, 40, 0.8, 1.4); scatter('snowpine', 26, 8, 40, 0.8, 1.3);
        scatter('spike', 22, 5, 30, 0.6, 1.5); scatter('mound', 18, 5, 30, 0.6, 1.3);
        fx = { color: '#ffffff', size: 0.05, vy: -0.6, sway: 0.5, count: 320 }; break;
      case 'salt':
        water('#2f9fb8', -60, -20, 100, 160, 0.92); scatter('dune', 14, 25, 70, 0.8, 1.3, [0.2, 2.9]); scatter('rock', 22, 5, 30, 0.5, 1.3);
        scatter('tuft', 50, 4, 20, 0.6, 1.2); scatter('cloud', 8, 60, 110, 0.8, 1.3);
        (function () { var lh = new T.Group(); kit.add(lh, G.cyl(0.8, 1.1, 7, 12), '#ffffff', [0, 3.5, 0]); kit.add(lh, G.cyl(0.85, 0.95, 1.2, 12), '#d23a2a', [0, 4.6, 0]); kit.add(lh, G.sph(0.7, 10, 8), '#ffe9a0', [0, 7.6, 0], null, null, { emissive: '#ffd36a', emissiveIntensity: 1 }); lh.position.set(-14, 0, -30); group.add(lh); })();
        fx = { color: '#ffffff', size: 0.035, vy: 0.08, sway: 0.6, count: 140 }; break;
      case 'storm':
        scatter('stone', 24, 6, 40, 0.7, 1.4); scatter('tuft', 90, 4, 30, 0.6, 1.4); scatter('stormcloud', 18, 30, 90, 0.8, 1.5);
        fx = { color: '#fff27a', size: 0.04, vy: 0.2, sway: 1.2, count: 160, glow: true }; flash = true; break;
      case 'cheddar':
        scatter('stalag', 60, 5, 45, 0.6, 1.6); scatter('stalac', 70, 5, 45, 0.6, 1.5); scatter('cheesecrystal', 22, 5, 30, 0.5, 1.4); scatter('rock', 25, 5, 35, 0.5, 1.4);
        fx = { color: '#ffd36a', size: 0.035, vy: 0.04, sway: 0.2, count: 160, glow: true }; break;
      case 'sugar':
        scatter('lolly', 20, 6, 35, 0.7, 1.3); scatter('candytree', 30, 6, 40, 0.7, 1.4); scatter('island', 10, 25, 70, 0.7, 1.4); scatter('pinkcloud', 14, 40, 100, 0.8, 1.5);
        fx = { color: '#ffffff', size: 0.04, vy: 0.1, sway: 0.8, count: 220, glow: true }; break;
      case 'bog':
        water('#4f5a30', 0, -20, 200, 200, 0.55); scatter('deadtree', 30, 6, 40, 0.8, 1.4); scatter('mushroom', 22, 4, 25, 0.8, 1.8);
        scatter('lily', 30, 4, 25, 0.6, 1.3); scatter('reed', 60, 4, 25, 0.7, 1.3);
        fx = { color: '#c9e06a', size: 0.06, vy: 0.3, sway: 0.15, count: 160 }; break;
      case 'gloom':
        scatter('gloomtree', 50, 6, 45, 0.8, 1.5); scatter('grave', 24, 4, 25, 0.8, 1.3); scatter('lantern', 12, 4, 22, 0.9, 1.2);
        (function () { var moon = new T.Mesh(G.sph(6, 16, 12), new T.MeshBasicMaterial({ color: '#e9e4ff', fog: false })); moon.position.set(30, 45, -110); group.add(moon); })();
        fx = { color: '#d6ff7a', size: 0.05, vy: 0.05, sway: 0.7, count: 140, glow: true }; break;
      case 'citadel':
        scatter('tower', 12, 40, 55, 0.9, 1.2); scatter('wall', 22, 46, 50, 1, 1.2); scatter('brazier', 16, 5, 20, 0.9, 1.1); scatter('rock', 12, 6, 25, 0.5, 1);
        fx = { color: '#ffd36a', size: 0.04, vy: 0.15, sway: 0.4, count: 200, glow: true }; break;
    }
    // drifting particles around the player (snow, embers, fireflies...)
    var N = fx.count, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
    for (var k = 0; k < N; k++) { pos[k * 3] = (rnd() - 0.5) * 24; pos[k * 3 + 1] = rnd() * 6; pos[k * 3 + 2] = -rnd() * 26 + 4; seeds[k] = rnd() * 10; }
    var pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    var pts = new T.Points(pg, new T.PointsMaterial({ color: fx.color, size: fx.size, transparent: true, opacity: 0.9, depthWrite: false,
      blending: fx.glow ? T.AdditiveBlending : T.NormalBlending }));
    group.add(pts);

    var bossSpot = new T.Vector3(0, 0, -16);
    return {
      group: group, hemi: hemi, sun: sun, bossSpot: bossSpot, fog: land.fog,
      setAR: function (on) { sky.visible = ground.visible = path.visible = !on; group.children.forEach(function (c) { if (c.isInstancedMesh || (c.isMesh && c !== circle && c !== sky)) c.visible = !on; }); },
      update: function (dt, t) {
        var a = pg.attributes.position.array;
        for (var i = 0; i < N; i++) {
          var j = i * 3;
          a[j + 1] += fx.vy * dt;
          a[j] += Math.sin(t * 0.7 + seeds[i]) * fx.sway * dt;
          if (a[j + 1] > 6) a[j + 1] = 0; if (a[j + 1] < 0) a[j + 1] = 6;
        }
        pg.attributes.position.needsUpdate = true;
        if (flash) hemi.intensity = (Math.sin(t * 0.37) > 0.995 || Math.sin(t * 0.53 + 1) > 0.997) ? 2.6 : 1.0;
      }
    };
  };

  /* ------------------------------------------------------------------ music + sound */
  var SCALES = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10], dorian: [0, 2, 3, 7, 9], phryg: [0, 1, 5, 7, 8], lydian: [0, 4, 6, 7, 11] };
  var LAND_MUSIC = {
    meadow: ['major', 57], ember: ['phryg', 52], frost: ['dorian', 59], salt: ['major', 55], storm: ['minor', 53],
    cheddar: ['dorian', 50], sugar: ['lydian', 60], bog: ['minor', 51], gloom: ['phryg', 49], citadel: ['minor', 55]
  };
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  SP.Audio = function () {
    var A = this, ctx = null, master = null, musicBus = null, sfxBus = null, timer = null, noiseBuf = null;
    A.ok = false;
    A.init = function () {   // call from a click/tap (browsers only start audio after a gesture)
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { return; }
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.ok = true;
      A.volumes(A._mv == null ? 0.7 : A._mv, A._sv == null ? 0.9 : A._sv);
    };
    A.volumes = function (m, s) { A._mv = m; A._sv = s; if (musicBus) { musicBus.gain.value = m * 0.55; sfxBus.gain.value = s * 0.8; } };
    A.now = function () { return ctx ? ctx.currentTime : performance.now() / 1000; };
    A.running = function () { return !!(ctx && ctx.state === 'running'); };
    A.suspend = function () { if (ctx && ctx.state === 'running') ctx.suspend(); };
    A.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };
    function env(node, t, a, d, peak) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function tone(bus, type, f, t, a, d, peak, f2) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
      env(g, t, a, d, peak); o.connect(g); g.connect(bus); o.start(t); o.stop(t + a + d + 0.05);
    }
    function noise(bus, t, d, peak, ftype, ffreq) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = ftype || 'highpass'; f.frequency.value = ffreq || 6000;
      env(g, t, 0.003, d, peak); s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + d + 0.05);
    }
    function pluck(f, t, peak) {  // a lute-ish pluck: sawtooth through a closing low-pass
      var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 6, t); fl.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.35);
      env(g, t, 0.004, 0.42, peak); o.connect(fl); fl.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
    }
    // music: kick/snare/hat + bass + a lute melody in the land's mode
    A.startMusic = function (bpm, landKey, t0, beats) {
      A.stopMusic();
      if (!ctx) return;
      var spb = 60 / bpm, mode = LAND_MUSIC[landKey] || LAND_MUSIC.meadow, sc = SCALES[mode[0]], root = mode[1];
      var r = SP.rng(SP.hash(landKey + bpm)), melody = [];
      for (var i = 0; i < 16; i++) melody.push(r() < 0.72 ? sc[Math.floor(r() * sc.length)] + (r() < 0.25 ? 12 : 0) : null);
      var prog = [0, 0, sc[3] || 7, sc[1] || 2];
      var next = 0;   // next 8th-note step to schedule
      timer = setInterval(function () {
        var horizon = ctx.currentTime + 0.15;
        while (true) {
          var t = t0 + next * spb / 2;
          if (t > horizon) break;
          if (next / 2 > beats + 4) { A.stopMusic(); return; }
          if (t >= ctx.currentTime - 0.02) {
            var beat = Math.floor(next / 2), half = next % 2, bar = Math.floor(beat / 4), inBar = beat % 4;
            var chord = prog[bar % 4];
            if (!half && (inBar === 0 || inBar === 2)) tone(musicBus, 'sine', 140, t, 0.002, 0.28, 0.9, 42);
            if (!half && (inBar === 1 || inBar === 3)) { noise(musicBus, t, 0.16, 0.35, 'bandpass', 1800); tone(musicBus, 'triangle', 190, t, 0.002, 0.08, 0.18, 120); }
            noise(musicBus, t, half ? 0.03 : 0.05, half ? 0.07 : 0.11);
            if (!half) tone(musicBus, 'triangle', hz(root - 12 + chord), t, 0.01, spb * 0.8, 0.28);
            var m = melody[(next) % 16];
            if (m != null && beat >= 4) pluck(hz(root + 12 + chord + m), t, 0.16);
          }
          next++;
        }
      }, 25);
    };
    A.stopMusic = function () { if (timer) { clearInterval(timer); timer = null; } };
    A.hit = function (power, weak) {
      if (!ctx) return; var t = ctx.currentTime;
      noise(sfxBus, t, 0.12, 0.5 + 0.4 * power, 'lowpass', weak ? 900 : 2200);
      tone(sfxBus, 'square', weak ? 220 : 330 + power * 200, t, 0.002, 0.09, 0.12, weak ? 140 : 160);
    };
    A.squish = function () { if (!ctx) return; var t = ctx.currentTime; tone(sfxBus, 'sine', 600, t, 0.005, 0.18, 0.25, 90); };
    A.miss = function () { if (!ctx) return; var t = ctx.currentTime; tone(sfxBus, 'sawtooth', 160, t, 0.01, 0.25, 0.12, 70); };
    A.whoosh = function () { if (!ctx) return; noise(sfxBus, ctx.currentTime, 0.3, 0.25, 'bandpass', 900); };
    A.chime = function () {
      if (!ctx) return; var t = ctx.currentTime;
      [0, 4, 7, 12].forEach(function (n, i) { tone(sfxBus, 'triangle', hz(72 + n), t + i * 0.08, 0.005, 0.5, 0.22); });
    };
    A.boom = function () { if (!ctx) return; var t = ctx.currentTime; tone(sfxBus, 'sine', 90, t, 0.005, 0.6, 1, 30); noise(sfxBus, t, 0.5, 0.6, 'lowpass', 600); };
    A.tick = function () { if (!ctx) return; tone(sfxBus, 'triangle', 880, ctx.currentTime, 0.002, 0.08, 0.2); };
    A.close = function () { A.stopMusic(); if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; A.ok = false; } };
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['players', 'Players', 'map'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.players, 'players with a save', 'players') + stat(d.battles, 'battles fought', 'players') +
          stat(Number(d.kcal).toLocaleString(), 'kcal burned (est.)', 'players') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>New feedback goes to Prepsto (prepsto.com). Older messages and requests from the app show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function players(query) {
      return UI.api('admin_players', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-psearch style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'player') + '</span></form>' +
          (d.players.length ? '<table class="ad-users ad-players"><thead><tr><th>Player</th><th>Reached</th><th>Stars</th><th>Treasures</th><th>Villagers</th><th>Battles</th><th>Last played</th></tr></thead><tbody>' +
          d.players.map(function (p) {
            return '<tr><td><b>' + esc(p.name) + '</b>' + (p.demo ? ' <span class="ui-badge">Demo</span>' : '') + '<div class="small muted email">' + esc(p.email) + '</div></td>' +
              '<td>' + esc(p.land) + (p.story >= 10 ? ' ✓' : '') + '</td><td>★ ' + p.stars + '</td><td>' + p.items + '/100</td><td>' + p.villagers + '/41</td>' +
              '<td>' + p.battles + ' · ' + p.kcal + ' kcal</td><td class="joined muted">' + esc(p.updated ? UI.ago(p.updated) : '') + '</td></tr>';
          }).join('') + '</tbody></table>' : '<div class="ui-empty">' + UI.icon('map') + '<h3>No players yet</h3><p>Players appear here after their first visit to the journey.</p></div>');
      });
    }

    var DRAW = { overview: overview, players: players, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
      if (e.target.matches('[data-psearch]')) { e.preventDefault(); players(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  var GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        (mode !== 'reset' ? '<div class="au-or">or</div><button type="button" class="ui-btn block au-google" data-google>' + GOOGLE_G + 'Continue with Google</button>' : '') +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var g = e.target.closest('[data-google]');
      if (g) { google(g); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    // Sign-up asks for the Privacy & Terms tick here too (ticking it is remembered for the new account).
    function google(btn) {
      var form = view.querySelector('form'), v = mode === 'signup' ? UI.formData(form) : {};
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;
      UI.busy(btn, UI.auth('google', { name: (v.name || '').trim() })).then(function () {
        UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    }
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== journey.html ===== */
(function () {
  var esc = UI.esc;
  var BANTER = [
    ['pickles', 'Remember: green ring, left fist. Red ring, right fist. Gold, whatever you like.'],
    ['brocco', 'Today I shall be extremely brave. From back here.'],
    ['pickles', 'Duck with your back straight. Your knees will thank you. Mine would, if I had knees.'],
    ['brocco', 'A true knight stretches before battle. I have stretched. I am now four and a quarter inches.'],
    ['pickles', 'If your arms are tired, pick a land with more ducking. Variety, hero. Variety.'],
    ['brocco', 'Have you considered a bigger sword? No? Just fists? Bold.'],
    ['pickles', 'Water. Drink some. I am mostly brine, so I know these things.'],
    ['brocco', 'I have composed a ballad about our victories. It is mostly about me.']
  ];
  var PTS = [[90, 470], [230, 520], [380, 445], [520, 520], [660, 440], [810, 505], [895, 370], [740, 250], [540, 215], [320, 150]];

  function mapSvg(c, p, sel) {
    var d = 'M' + PTS.map(function (q) { return q.join(' '); }).join(' L ');
    return '<svg viewBox="0 0 1000 600" role="img" aria-label="Map of Nourra">' +
      '<path class="road" d="' + d + '"/>' +
      '<text class="compass" x="930" y="80">🧭</text>' +
      c.lands.map(function (L, i) {
        var q = PTS[i], cleared = L.territories.filter(function (t) { return SP.starsOf(t.id) > 0; }).length;
        var open = p.unlocked.indexOf(L.territories[0].id) >= 0;
        var cur = p.current && p.current.indexOf(L.key + '-') === 0;
        var stars = L.territories.reduce(function (a, t) { return a + SP.starsOf(t.id); }, 0);
        return '<g class="node' + (open ? '' : ' locked') + (cleared === 5 ? ' done' : '') + (cur ? ' cur' : '') + (sel === L.key ? ' sel' : '') + '" data-land="' + L.key + '" tabindex="0" role="button" aria-label="' + esc(L.name) + (open ? '' : ' (locked)') + '">' +
          '<circle class="ring" cx="' + q[0] + '" cy="' + q[1] + '" r="54"/>' +
          '<circle class="bg" cx="' + q[0] + '" cy="' + q[1] + '" r="44"/>' +
          '<text class="em" x="' + q[0] + '" y="' + (q[1] + 2) + '">' + (open ? L.emoji : '☁️') + '</text>' +
          '<text class="nm" x="' + q[0] + '" y="' + (q[1] + 76) + '">' + esc(L.name.replace('The ', '')) + '</text>' +
          (open ? '<text class="st" x="' + q[0] + '" y="' + (q[1] - 56) + '">★ ' + stars + '/15</text>' : '') + '</g>';
      }).join('') + '</svg>';
  }

  function terrRow(t, L, p, c) {
    var unlocked = p.unlocked.indexOf(t.id) >= 0, st = SP.starsOf(t.id), cur = p.current === t.id;
    var vil = t.villager && c.villagers[t.villager], saved = vil && p.villagers.indexOf(t.villager) >= 0;
    var loot = t.items.map(function (id, i) { var it = c.items[id], has = p.items.indexOf(id) >= 0; return '<span class="' + (has ? '' : 'no') + '" title="' + esc((has ? it.name : '???') + (i ? ' (3 stars)' : ' (first clear)')) + '">' + it.emoji + '</span>'; }).join('');
    var e = p.terr[t.id];
    return '<div class="jr-terr' + (unlocked ? '' : ' locked') + (cur ? ' cur' : '') + '">' +
      '<span class="ui-seal ' + (t.boss ? '' : st ? 'green' : 'gold') + '" aria-hidden="true">' + (t.boss ? '☠' : t.n) + '</span>' +
      '<div><h3>' + esc(t.name) + (p.bounty === t.id && !p.bounty_claimed ? ' <span class="ui-badge gold">🎯 Bounty</span>' : '') + '</h3><div class="meta">' + SP.stars(st) +
      (t.boss ? '<span>Boss: ' + esc(L.boss.name) + '</span>' : '') +
      (vil ? '<span>' + (saved ? '✓ ' : 'Rescue ') + esc(vil.emoji + ' ' + vil.name) + '</span>' : '') +
      '<span class="loot">' + loot + '</span>' + (e && e.best ? '<span>Best ' + Number(e.best).toLocaleString() + '</span>' : '') + '</div></div>' +
      '<div class="act">' + (unlocked ? '<a class="ui-btn ' + (st ? '' : 'primary') + '" href="#play/' + t.id + '" data-go="play/' + t.id + '">' + (st ? (st < 3 ? '↻ Go for ★★★' : '↻ Replay') : '⚔ Fight') + '</a>'
        : '<span class="ui-badge">🔒 Free the one before</span>') + '</div></div>';
  }

  UI.page('journey', { title: 'Your journey', nav: 'Journey', icon: 'map', auth: 'user', order: 10 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:180px"></div><div class="ui-skel" style="height:360px;margin-top:16px"></div></div>';
    var sel = ctx.args[0] || null;
    function draw(d) {
      var c = d.content, p = d.progress;
      var curLand = p.current ? p.current.split('-')[0] : 'citadel';
      if (!sel || !SP.land(sel)) sel = curLand;
      var L = SP.land(sel), open = p.unlocked.indexOf(L.territories[0].id) >= 0;
      var cur = p.current && SP.terr(p.current);
      var b = BANTER[(new Date().getDate() + p.stars_total) % BANTER.length], who = SP.who(b[0]);
      var training = !p.training;
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ui-page-head"><div><div class="eyebrow">The realm of Nourra</div><h1>' + esc(ctx.me.name.split(' ')[0]) + '\'s journey</h1></div>' +
        '<div class="jr-top">' + SP.sprouts(p.sprouts) + '<span class="sp-chip">★ ' + p.stars_total + ' / 150</span><span class="sp-chip">🎒 ' + p.items.length + ' / 100</span><span class="sp-chip">🏘️ ' + p.villagers.length + ' / 41</span></div></div>' +
        '<section class="ui-card ornate jr-quest"><div><div class="eyebrow">📜 Current quest</div><h2>' + esc(p.objective) + '</h2>' +
        '<div class="jr-party"><span class="sp-portrait" aria-hidden="true">' + who.emoji + '</span><div class="sp-bubble"><b>' + esc(who.name) + '</b>' + esc(b[1]) + '</div></div>' +
        (p.keys.length ? '<div class="jr-keys">' + p.keys.map(function (k) { var it = c.key_items[k]; return '<span class="sp-chip" title="' + esc(it.blurb) + '">' + it.emoji + ' ' + esc(it.name) + '</span>'; }).join('') + '</div>' : '') + '</div>' +
        '<div>' + (training ? '<a class="ui-btn gold lg" href="#play/training" data-go="play/training">🥊 Start with training</a>' :
          cur ? '<a class="ui-btn gold lg" href="#play/' + p.current + '" data-go="play/' + p.current + '">⚔ ' + esc(cur.t.name) + '</a>' :
          '<a class="ui-btn gold lg" href="#satchel" data-go="satchel">🎒 Chase the last treasures</a>') + '</div></section>' +
        '<div class="jr-map">' + mapSvg(c, p, sel) + '</div>' +
        '<section class="ui-card jr-land"><div class="jr-land-head"><span class="em">' + L.emoji + '</span><div style="flex:1;min-width:200px"><div class="eyebrow">Land ' + (L.index + 1) + ' of 10 · ' + esc(L.element) + '</div><h2>' + esc(L.name) + '</h2></div>' +
        '<div class="pl-moves">' + L.moves.map(function (m) { var mv = c.moves[m]; return '<span class="sp-chip" title="' + esc(mv.how) + '" style="' + (L.emphasis.indexOf(m) >= 0 ? 'background:var(--c-gold-soft);border-color:var(--c-gold)' : '') + '">' + mv.icon + ' ' + esc(mv.name) + '</span>'; }).join('') + '</div></div>' +
        '<p class="muted" style="margin:10px 0 0">' + esc(L.blurb) + '</p>' +
        (open ? '<div class="jr-terrs">' + L.territories.map(function (t) { return terrRow(t, L, p, c); }).join('') + '</div>'
          : '<div class="ui-empty" style="margin-top:16px"><div style="font-size:2rem">☁️</div><h3>Shrouded in grease</h3><p>Defeat ' + esc(c.lands[L.index - 1].boss.name) + ' to open ' + esc(L.name) + '.</p></div>') + '</section>' +
        '<div class="jr-side"><div class="ui-card"><h3>🥊 The Training Yard</h3><p class="muted">Sir Broccolot teaches every move, one at a time. Good as a warm-up any day.</p>' +
        '<a class="ui-btn" href="#play/training" data-go="play/training">Train</a></div>' +
        '<div class="ui-card"><h3>🏘️ Hearthstead</h3><p class="muted">' + p.villagers.length + ' villagers are home. Spend sprouts at the market' + (p.forge ? ' and Granny\'s forge.' : '. The forge opens once Granny Marrow is free.') + '</p>' +
        '<a class="ui-btn" href="#village" data-go="village">Visit the village</a></div></div>' +
        '<div class="ui-divider">The Chronicle</div><div class="jr-chron">' +
        (p.scenes.length ? Object.keys(c.scenes).filter(function (k) { return p.scenes.indexOf(k) >= 0; }).map(function (k) {
          return '<details><summary>' + esc(c.scenes[k].title) + '</summary>' + SP.sceneHtml(k) + '</details>';
        }).join('') : '<p class="muted" style="text-align:center">The story begins in Meadowmere. Every scene you see is kept here.</p>') + '</div></div>';
    }
    view.addEventListener('click', function (e) {
      var n = e.target.closest('[data-land]');
      if (n) { sel = n.getAttribute('data-land'); draw(SP.data()); var el = view.querySelector('.jr-land'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    view.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-land]')) { e.preventDefault(); e.target.closest('[data-land]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    return SP.load(true).then(draw);
  });
})();

/* ===== landing.html ===== */
// Watch section: swap the video's cover for YouTube's player (privacy-enhanced) only when it's pressed.
  if (!window.__ytFilm) {
    window.__ytFilm = true;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-yt-film]') : null;
      if (!b) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + b.getAttribute('data-yt-film') + '?autoplay=1&rel=0&playsinline=1';
      f.title = b.getAttribute('data-yt-title') || 'Video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      b.parentNode.replaceChild(f, b);
    });
  }
(function () {
  var esc = UI.esc;
  var COPY = {
    eyebrow: 'A VR punching quest',
    title: 'Punch the fast food. <em>Save the realm.</em>',
    lead: 'The Greasy Horde has overrun Nourra. Put on your headset, raise your fists and fight burgers, fries and milkshakes across ten lands. You free villagers, collect treasures and get a full-body workout along the way.',
    cta: 'Start your journey, free',
    proof: ['Meta Quest and other WebXR headsets', 'Passthrough mode', 'Plays on a screen too'],
    steps: [['🥽', 'Open it in your headset', 'Go to this page in Meta Quest Browser (or any WebXR browser) and press Enter VR. Nothing to install.'],
            ['🥊', 'Punch, duck, lean, block', 'Snacks march at you to the beat. Green ring: left fist. Red: right. Arrows show hooks, uppercuts and hammer fists.'],
            ['🏰', 'Free the realm', 'Clear territories, rescue villagers, fill your satchel and upgrade your gauntlets. Your progress is saved to your account.']],
    features: [['🗺️', 'A long journey', '10 lands, 50 territories and 10 bosses, from the meadows of Meadowmere to the Deep-Fried King\'s Drive-Thru Citadel.'],
               ['🏘️', '41 villagers to rescue', 'Punch open their cages in a finishing flurry. They move into Hearthstead, your growing village.'],
               ['🎒', '100 treasures', '10 collections: seeds, herbs, fruits, spices, recipe scrolls, runes, banners, critters, legendary utensils and bard\'s verses.'],
               ['⚒️', 'Upgrades', 'Pickles\' market and Granny Marrow\'s forge: gauntlets, hearty stew, a pot-lid guard, combo charms and Spice Rage.'],
               ['💪', 'Balanced on purpose', 'Every move works different muscles. The battle patterns rotate between them so no one motion gets overworked.'],
               ['📈', 'A workout ledger', 'Minutes, estimated calories, streaks, and a muscle-balance chart that tells you which land to visit next.'],
               ['🏠', 'Passthrough', 'On headsets that support it, fight in your own living room with the snacks right in front of you.'],
               ['🪑', 'Play your way', 'Gentle, Steady or Beast intensity, a seated mode with no ducks or lunges, and a no-fail option.']],
    faq: [['Which headsets does it work on?', 'Meta Quest 2, 3, 3S and Pro in Meta Quest Browser, plus most headsets with a WebXR browser. Without a headset you can still play on a computer, tablet or phone with mouse, touch or keyboard.'],
          ['Do I need to install anything?', 'No. It runs in the headset\'s web browser. Open the page, press Enter VR, and start punching.'],
          ['How does passthrough work?', 'If your headset can show your room (like Quest 3), you\'ll see a "VR with passthrough" button. The snacks, rings and cages appear in your real room instead of a fantasy land.'],
          ['Is it a real workout?', 'It\'s real movement: jabs, hooks, uppercuts, hammer fists, lunges, squats, leans and blocks, at 96 to 140 beats per minute. Calorie numbers are rough estimates. If you have a health condition, check with a doctor first, warm up, and take breaks.'],
          ['Can I play sitting down?', 'Yes. Seated mode removes ducks and lunges and keeps everything within arm\'s reach.'],
          ['Is my progress saved?', 'Yes, once you have a free account. The Training Yard works without one, so you can try it first.'],
          ['Is it free?', 'Yes. There are no ads and nothing to buy. Sprouts, treasures and upgrades are earned only by playing.']]
  };

  // A wide battle scene: the fist meets the burger while the rest of the Greasy Horde waits its turn
  function heroArt() {
    return '<div class="lp-art lp-scene" aria-hidden="true"><svg viewBox="0 0 1200 340" preserveAspectRatio="xMidYMax slice">' +
      '<path class="hill1" d="M0 250 Q160 170 340 230 T720 215 T1200 200 V340 H0 Z"/>' +
      '<path class="hill2" d="M0 290 Q220 240 420 285 T860 270 T1200 262 V340 H0 Z"/>' +
      '<path d="M560 340 Q610 300 640 270 L680 270 Q690 305 740 340 Z" fill="#e7d5a5" opacity=".9"/>' +
      '<g transform="translate(60 150)"><path d="M0 50 L36 0 L72 50 Z" fill="#2f6d4a"/><rect x="31" y="50" width="10" height="18" fill="#7a5230"/></g>' +
      '<g transform="translate(1090 128)"><path d="M0 56 L32 0 L64 56 Z" fill="#3f7f5a"/><rect x="27" y="56" width="10" height="16" fill="#7a5230"/></g>' +
      '<g transform="translate(330 -28)">' +
        '<g class="wob"><ellipse cx="360" cy="320" rx="92" ry="12" fill="rgba(0,0,0,.12)"/>' +
        '<path d="M272 290 Q272 310 290 312 H430 Q448 310 448 290 Z" fill="#d79b52" stroke="#2b1d12" stroke-width="4"/>' +
        '<rect x="266" y="262" width="188" height="30" rx="14" fill="#6b3a1f" stroke="#2b1d12" stroke-width="4"/>' +
        '<path d="M268 262 L300 278 L330 258 L362 280 L394 258 L424 278 L452 260 L452 256 L268 256 Z" fill="#ffc93c" stroke="#2b1d12" stroke-width="3"/>' +
        '<path d="M262 252 Q270 236 290 248 Q310 232 330 248 Q350 234 370 248 Q390 232 410 248 Q430 234 450 248 Q462 240 458 256 H262 Z" fill="#6fbf4a" stroke="#2b1d12" stroke-width="3"/>' +
        '<path d="M266 248 Q266 150 360 148 Q454 150 454 248 Z" fill="#e0a458" stroke="#2b1d12" stroke-width="4"/>' +
        '<g fill="#fff6dc"><ellipse cx="320" cy="176" rx="6" ry="3"/><ellipse cx="370" cy="166" rx="6" ry="3"/><ellipse cx="412" cy="186" rx="6" ry="3"/><ellipse cx="340" cy="210" rx="6" ry="3"/></g>' +
        '<circle cx="334" cy="212" r="20" fill="#fff" stroke="#2b1d12" stroke-width="3"/><circle cx="388" cy="212" r="20" fill="#fff" stroke="#2b1d12" stroke-width="3"/>' +
        '<circle cx="330" cy="216" r="9" fill="#1b130c"/><circle cx="392" cy="218" r="9" fill="#1b130c"/>' +
        '<path d="M312 186 L350 196" stroke="#2b1d12" stroke-width="7" stroke-linecap="round"/><path d="M410 186 L372 196" stroke="#2b1d12" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M344 238 Q362 228 378 238" stroke="#2b1d12" stroke-width="4" fill="none" stroke-linecap="round"/></g>' +
        '<g class="pow"><path d="M300 200 L312 222 L338 214 L322 236 L344 252 L316 254 L314 280 L298 260 L276 274 L284 250 L260 240 L286 232 L276 210 Z" fill="#ffd36a" stroke="#d23a2a" stroke-width="4"/></g>' +
        '<g class="fist"><rect x="-60" y="214" width="240" height="44" rx="10" fill="#d23a2a" stroke="#2b1d12" stroke-width="4"/>' +
        '<rect x="160" y="196" width="104" height="82" rx="26" fill="#fffaf0" stroke="#2b1d12" stroke-width="4"/>' +
        '<path d="M238 200 V222 M238 236 V254 M238 268 V276" stroke="#2b1d12" stroke-width="3" stroke-linecap="round"/>' +
        '<rect x="168" y="236" width="56" height="24" rx="12" fill="#f3e2c2" stroke="#2b1d12" stroke-width="4"/>' +
        '<path d="M60 214 V258 M100 214 V258" stroke="#ffd36a" stroke-width="6"/></g>' +
      '</g>' +
      // the rest of the Horde: fries and a milkshake, waiting their turn
      '<g transform="translate(905 196)"><g class="foe"><ellipse cx="34" cy="86" rx="34" ry="6" fill="rgba(0,0,0,.12)"/>' +
        '<g stroke="#2b1d12" stroke-width="3"><rect x="10" y="0" width="9" height="40" fill="#ffd36a"/><rect x="22" y="-8" width="9" height="46" fill="#ffd36a"/><rect x="34" y="-4" width="9" height="44" fill="#ffd36a"/><rect x="46" y="2" width="9" height="38" fill="#ffd36a"/></g>' +
        '<path d="M2 30 H66 L58 84 H10 Z" fill="#d23a2a" stroke="#2b1d12" stroke-width="3.5"/>' +
        '<circle cx="24" cy="52" r="7" fill="#fff" stroke="#2b1d12" stroke-width="2"/><circle cx="44" cy="52" r="7" fill="#fff" stroke="#2b1d12" stroke-width="2"/>' +
        '<circle cx="25" cy="54" r="3" fill="#1b130c"/><circle cx="43" cy="54" r="3" fill="#1b130c"/><path d="M16 42 L30 46 M52 42 L38 46" stroke="#2b1d12" stroke-width="3.5" stroke-linecap="round"/></g></g>' +
      '<g transform="translate(1010 176)"><g class="foe b"><ellipse cx="32" cy="106" rx="30" ry="6" fill="rgba(0,0,0,.12)"/>' +
        '<path d="M40 -10 L48 -34" stroke="#d23a2a" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M2 14 Q32 -8 62 14 Z" fill="#fff6dc" stroke="#2b1d12" stroke-width="3"/><circle cx="32" cy="-2" r="6" fill="#d23a2a" stroke="#2b1d12" stroke-width="2"/>' +
        '<path d="M0 14 H64 L54 104 H10 Z" fill="#f2a7c0" stroke="#2b1d12" stroke-width="3.5"/>' +
        '<circle cx="22" cy="46" r="7" fill="#fff" stroke="#2b1d12" stroke-width="2"/><circle cx="42" cy="46" r="7" fill="#fff" stroke="#2b1d12" stroke-width="2"/>' +
        '<circle cx="23" cy="48" r="3" fill="#1b130c"/><circle cx="41" cy="48" r="3" fill="#1b130c"/><path d="M24 66 Q32 60 40 66" stroke="#2b1d12" stroke-width="3" fill="none"/></g></g>' +
      // Pickles and Sir Broccolot, cheering from the hill
      '<g transform="translate(150 222)"><ellipse cx="34" cy="58" rx="30" ry="6" fill="rgba(0,0,0,.12)"/><rect x="10" y="0" width="48" height="60" rx="24" fill="#6f9a3a" stroke="#2b1d12" stroke-width="3"/>' +
        '<g fill="#8fbf55"><circle cx="22" cy="18" r="3"/><circle cx="44" cy="34" r="3"/><circle cx="24" cy="46" r="3"/></g>' +
        '<circle cx="26" cy="22" r="8" fill="#fff" stroke="#2b1d12" stroke-width="2"/><circle cx="44" cy="22" r="8" fill="#fff" stroke="#2b1d12" stroke-width="2"/>' +
        '<circle cx="28" cy="24" r="3.5" fill="#1b130c"/><circle cx="46" cy="24" r="3.5" fill="#1b130c"/><path d="M28 40 Q35 36 42 40" stroke="#2b1d12" stroke-width="2.5" fill="none"/></g>' +
      '<g transform="translate(236 236)"><ellipse cx="30" cy="54" rx="24" ry="5" fill="rgba(0,0,0,.12)"/><rect x="22" y="26" width="16" height="28" rx="5" fill="#9cc27a" stroke="#2b1d12" stroke-width="3"/>' +
        '<g fill="#3f8f3a" stroke="#2b1d12" stroke-width="3"><circle cx="18" cy="20" r="13"/><circle cx="42" cy="20" r="13"/><circle cx="30" cy="8" r="14"/></g>' +
        '<circle cx="25" cy="20" r="5" fill="#fff" stroke="#2b1d12" stroke-width="1.5"/><circle cx="36" cy="20" r="5" fill="#fff" stroke="#2b1d12" stroke-width="1.5"/>' +
        '<circle cx="26" cy="21" r="2" fill="#1b130c"/><circle cx="37" cy="21" r="2" fill="#1b130c"/>' +
        '<path d="M44 40 L66 14" stroke="#8f9aa6" stroke-width="4" stroke-linecap="round"/><path d="M42 36 L50 44" stroke="#c48d26" stroke-width="4" stroke-linecap="round"/></g>' +
      '</svg></div>';
  }

  UI.page('landing', { title: 'Punch the fast food, save the realm' }, function (view, ctx) {
    var me = ctx.me, C = COPY;
    var primary = me ? '<a class="ui-btn primary lg" href="#journey" data-go="journey">Continue your journey ' + UI.icon('arrow') + '</a><a class="ui-btn lg" href="#play/training" data-go="play/training">🥊 Training Yard</a>'
      : '<a class="ui-btn primary lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + ' ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn gold lg" href="#play/training" data-go="play/training">🥊 Try the Training Yard</a>';
    view.innerHTML =
      '<section class="lp-hero lp-title"><span class="cloud" style="top:92px;width:120px;animation-delay:-6s"></span><span class="cloud" style="top:26px;width:80px;animation-delay:-19s"></span>' +
        '<div class="ui-wrap"><div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
        (me ? '' : '<p class="lp-note">The Training Yard needs no account. Sign up when you want your progress saved.</p>') +
        '</div>' + heroArt() +
        '<div class="lp-hud"><div class="ui-wrap"><div class="lp-realm" data-realm>' +
        ['Heroes', 'Snacks punched', 'Villagers freed', 'Kcal burned'].map(function (l) { return '<div><b>–</b><span>' + l + '</span></div>'; }).join('') + '</div></div></div></section>' +
      '<section class="lp-section ytf" id="watch"><div class="ui-wrap"><div class="ytf-in"><div class="ytf-copy"><div class="eyebrow"><svg viewBox="0 0 28 20" width="20" height="14" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#FF0033"/><path d="M11.2 5.8v8.4l7.3-4.2z" fill="#fff"/></svg>Watch</div><h2>See Snackpuncher in about a minute</h2><p>A short video tour of what Snackpuncher does and how it works.</p><a class="ytf-link" href="https://www.youtube.com/watch?v=YsGjeRjVZMY" target="_blank" rel="noopener">Watch on YouTube &#8599;</a></div><div><div class="ytf-frame"><button type="button" class="ytf-cover" data-yt-film="YsGjeRjVZMY" data-yt-title="Snackpuncher video" aria-label="Play the Snackpuncher video (1:14)"><img src="_/theme/yt-cover.jpg" alt="" loading="lazy" decoding="async" width="960" height="540"><span class="ytf-play" aria-hidden="true"><svg viewBox="0 0 68 48" width="68" height="48"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.3.3 34 .3 34 .3s-21.3 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6c5.2 1.4 26.5 1.4 26.5 1.4s21.3 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#FF0033"/><path d="M45 24 27 14v20z" fill="#fff"/></svg></span><span class="ytf-len">1:14</span></button></div><p class="ytf-note">The video loads from YouTube when you press play.</p></div></div></div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>How it works</h2><p>Think rhythm boxing meets a fantasy quest. The snacks arrive on the beat, and the story carries you through ten lands.</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s, i) { return '<div class="ui-card lp-step"><span class="ui-seal ' + ['green', '', 'gold'][i] + '">' + s[0] + '</span><h3>' + esc(s[1]) + '</h3><p class="muted">' + esc(s[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Ten lands to free</h2><p>Each land has its own music, its own snacks, its own boss, and a move it leans on.</p></div><div class="lp-lands" data-lands></div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Every move works something different</h2><p>Battles rotate between these, so your shoulders rest while your legs work, and the other way round.</p></div><div class="lp-moves" data-moves></div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Your travelling companions</h2></div><div class="lp-cast">' +
        '<div class="ui-card"><span class="sp-portrait">🥒</span><div><h3>Pickles</h3><p class="muted">Escaped from a burger. Has seen things. Sarcastic, cowardly and somehow always right about which way to duck.</p></div></div>' +
        '<div class="ui-card"><span class="sp-portrait">🥦</span><div><h3>Sir Broccolot</h3><p class="muted">Knight of the Crisp Order. Four inches tall. Absolutely convinced he is the hero of this story.</p></div></div></div>' +
        '<p class="muted" style="text-align:center;margin-top:18px">Together you\'ll find the broken Ladle of Plenty, free the smith who can mend it, gather what she needs, and wake it with a song.</p></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>What\'s inside</h2></div>' +
        '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature"><span class="em">' + f[0] + '</span><h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>The Horde won\'t punch itself.</h2><p>Free account, nothing to install. Try the Training Yard first if you like.</p></div>' +
        (me ? '<a class="ui-btn gold lg" href="#journey" data-go="journey">Continue your journey</a>' : '<a class="ui-btn gold lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + '</a>') +
      '</div></div></section>';

    var stats = UI.apiQuiet('realm_stats').then(function (r) {
      var el = view.querySelector('[data-realm]');
      if (el) el.innerHTML = [[r.heroes, 'Heroes'], [r.punches, 'Snacks punched'], [r.rescued, 'Villagers freed'], [r.kcal, 'Kcal burned']].map(function (x) {
        return '<div><b>' + Number(x[0]).toLocaleString() + '</b><span>' + x[1] + '</span></div>';
      }).join('');
    }).catch(function () {});
    var world = SP.load().then(function (d) {
      var c = d.content;
      view.querySelector('[data-lands]').innerHTML = c.lands.map(function (L) {
        return '<div class="ui-card lp-land"><div class="em">' + L.emoji + '</div><h3>' + esc(L.name) + '</h3><p>' + esc(L.element) + (L.emphasis.length ? ' · ' + esc(L.emphasis.map(function (m) { return c.moves[m].name; }).join(', ')) : ' · everything') + '</p></div>';
      }).join('');
      var mus = {}; c.muscles.forEach(function (m) { mus[m[0]] = m[1]; });
      view.querySelector('[data-moves]').innerHTML = Object.keys(c.moves).filter(function (k) { return k !== 'flurry'; }).map(function (k) {
        var m = c.moves[k];
        return '<div class="ui-card lp-move"><span class="em">' + m.icon + '</span><h3>' + esc(m.name) + '</h3><p>' + esc(m.how) + '</p><div class="mus">' +
          Object.keys(m.muscles).map(function (x) { return '<span class="ui-badge ' + (m.muscles[x] >= 0.45 ? 'brand' : '') + '">' + esc(mus[x]) + '</span>'; }).join('') + '</div></div>';
      }).join('');
    });
    return Promise.all([stats, world]);
  });
})();

/* ===== play.html ===== */
(function () {
  'use strict';
  var esc = UI.esc;
  var Z_HIT = -0.55, TRAVEL = 14;
  var TIPS = ['Breathe out on every punch.', 'Keep your guard up between punches.', 'Turn your hips into hooks.', 'Soft knees: it saves your back.',
    'Drink some water between battles.', 'Shake out your arms when you rest.', 'Squat with your back straight, knees over toes.'];
  var POS = {  // [x, y] relative to your centre and head height; s = -1 left, +1 right
    jab: function (s) { return [s * 0.18, -0.24]; },
    hook: function (s) { return [s * 0.5, -0.2]; },
    uppercut: function (s) { return [s * 0.16, -0.46]; },
    hammer: function (s) { return [s * 0.2, 0.1]; },
    lunge: function (s) { return [s * 0.78, -0.72]; }
  };
  function dirOf(move, s) { return move === 'uppercut' ? 'up' : move === 'hammer' ? 'down' : move === 'hook' ? (s < 0 ? 'right' : 'left') : null; }
  var DIRV = { up: [0, 1, 0], down: [0, -1, 0], right: [1, 0, 0], left: [-1, 0, 0] };

  UI.page('play', { title: function (a) { return a[0] === 'training' || !a[0] ? 'Training Yard' : 'Battle'; }, chrome: false }, function (view, ctx) {
    var tid = ctx.args[0] || 'training';
    if (tid !== 'training' && !ctx.me) { UI.after = '#play/' + tid; UI.go('auth'); return Promise.resolve(); }

    view.innerHTML = '<div class="pl" data-play><canvas data-cv></canvas><div class="pl-flash" data-flash></div>' +
      '<div class="pl-hud" data-hud hidden><div class="pl-hud-l"><button class="pl-icon" data-pause aria-label="Pause">❚❚</button>' +
      '<div class="pl-score"><b data-score>0</b><span data-combo></span></div></div>' +
      '<div class="pl-hud-c"><div class="pl-bar gold"><i data-prog></i></div><div class="pl-tname" data-tname></div></div>' +
      '<div class="pl-hud-r"><span>Vigor</span><div class="pl-bar red"><i data-vigor></i></div><div data-rage hidden><span>🌶️ Rage</span><div class="pl-bar gold"><i data-ragebar></i></div></div></div></div>' +
      '<div class="pl-callout" data-callout></div>' +
      '<div class="pl-pad" data-pad hidden><div><button data-key="left" aria-label="Lean left"><b>⟵</b>Lean</button><button data-key="duck" aria-label="Duck"><b>⤓</b>Duck</button></div>' +
      '<div><button data-key="rage" data-ragebtn hidden aria-label="Spice rage"><b>🌶️</b>Rage</button><button data-key="block" aria-label="Block"><b>🛡️</b>Block</button><button data-key="right" aria-label="Lean right"><b>⟶</b>Lean</button></div></div>' +
      '<div class="pl-wrap" data-panelwrap><div class="pl-loading">Opening the gates…</div></div></div>';
    var $ = function (s) { return view.querySelector(s); };
    var cv = $('[data-cv]'), panelWrap = $('[data-panelwrap]');

    var alive = true, T, kit, renderer, scene, camera, world, audio = new SP.Audio();
    var info, land, content, xr = { vr: false, ar: false }, mode = 'flat', session = null;
    var state = 'loading', B = null, cal = { x: 0, z: 0, h: 1.6 };
    var gloves = [], flatGloves = [], keys = {}, body = { duck: 0, lean: 0, block: 0 };
    var popups = [], parts = null, vr = { items: [], orbs: [], hud: null, tip: null, lastOrb: 0, waitHead: 0, waited: 0, redo: null };
    var test = window.SP_TEST || null;
    var tmpV = null, tmpV2 = null, headV = null;
    var sessionStart = Date.now();
    var listeners = [];
    function on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); listeners.push([target, ev, fn, opt]); }

    function settings() { return SP.settings(); }
    /* Menu + results music: a real track per land (ArkMusic, web/pages/_arkmusic.html). Battles keep the
       procedural music from SP.Audio, because it is generated on the beat of the punch chart. */
    var LAND_TRACKS = { meadow: 'midwest-western', ember: 'spellbound', frost: 'divine-light', salt: 'waves', storm: 'high-notes',
      cheddar: 'spiralis', sugar: 'small-and-grand-wonder', bog: 'cosmic', gloom: 'dark-terrain', citadel: 'as-we-ascended' };
    function menuMusic() {
      if (!window.ArkMusic || !alive || !land) return;
      var v = settings().music;
      if (v == null) v = 0.7;
      if (!(v > 0)) { ArkMusic.stop(); return; }
      ArkMusic.play(info && info.training ? 'detroit' : (LAND_TRACKS[land.key] || 'as-we-ascended'), { volume: v * 0.6 });
    }
    function stopMenuMusic(fade) { if (window.ArkMusic) ArkMusic.stop(fade == null ? 0.6 : fade); }
    function upLevel(k) { var p = SP.prog(); return p ? (p.upgrades[k] || 0) : 0; }

    /* ---------------------------------------------------------------- 3D setup */
    function init3D() {
      renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      try { renderer.xr.setFoveation(0.6); } catch (e) {}
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(62, 1, 0.05, 400);
      scene.add(camera);
      kit = SP.Kit(T);
      tmpV = new T.Vector3(); tmpV2 = new T.Vector3(); headV = new T.Vector3();
      buildLand(info.land);
      // flat-screen gloves ride on the camera
      var sk = skinColor();
      ['L', 'R'].forEach(function (h, i) {
        var g = kit.glove(kit.HAND[h], sk);
        var rest = new T.Vector3(i ? 0.26 : -0.26, -0.3, -0.72);
        g.position.copy(rest); g.rotation.set(-0.25, i ? -0.15 : 0.15, 0); g.scale.setScalar(0.85);
        camera.add(g);
        flatGloves.push({ hand: h, mesh: g, rest: rest, anim: 0, target: new T.Vector3(), pos: new T.Vector3(), tracked: true, speed: 0 });
      });
      parts = makeParts();
      resize();
      on(window, 'resize', resize);
      renderer.setAnimationLoop(frame);
    }
    function skinColor() {
      var s = settings().skin, sk = (content.skins || []).filter(function (x) { return x.key === s; })[0];
      return sk ? sk.color : '#d23a2a';
    }
    function buildLand(L) {
      if (world) { scene.remove(world.group); }
      land = L;
      world = SP.World(T, kit, L);
      scene.add(world.group);
      applyMode();
    }
    function applyMode() {
      var ar = mode === 'ar';
      world.setAR(ar);
      scene.fog = ar ? null : new T.Fog(land.fog, 28, 150);
      renderer.setClearColor(0x000000, ar ? 0 : 1);
      scene.background = ar ? null : new T.Color(land.fog);
    }
    function resize() {
      if (!renderer || renderer.xr.isPresenting) return;
      var w = view.clientWidth || window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 78 : 62;
      camera.updateProjectionMatrix();
    }

    /* ---------------------------------------------------------------- effects: crumbs + floating words */
    function makeParts() {
      var N = 320, mesh = new T.InstancedMesh(kit.G.ico(0.022, 0), new T.MeshBasicMaterial({ color: '#ffffff' }), N);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      var col = new T.Color(), m4 = new T.Matrix4();
      for (var i = 0; i < N; i++) { mesh.setColorAt(i, col.set('#ffffff')); m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); }
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { mesh: mesh, N: N, next: 0, life: new Float32Array(N), p: new Float32Array(N * 3), v: new Float32Array(N * 3), m4: m4, col: col };
    }
    function burst(pos, colors, n) {
      n = n || 16;
      for (var k = 0; k < n; k++) {
        var i = parts.next; parts.next = (parts.next + 1) % parts.N;
        parts.life[i] = 0.7 + Math.random() * 0.3;
        parts.p[i * 3] = pos.x; parts.p[i * 3 + 1] = pos.y; parts.p[i * 3 + 2] = pos.z;
        parts.v[i * 3] = (Math.random() - 0.5) * 3; parts.v[i * 3 + 1] = Math.random() * 2.6; parts.v[i * 3 + 2] = (Math.random() - 0.3) * 2.5;
        parts.mesh.setColorAt(i, parts.col.set(colors[k % colors.length]));
      }
      parts.mesh.instanceColor.needsUpdate = true;
    }
    function stepParts(dt) {
      var any = false;
      for (var i = 0; i < parts.N; i++) {
        if (parts.life[i] <= 0) continue;
        any = true;
        parts.life[i] -= dt;
        var j = i * 3;
        parts.v[j + 1] -= 6 * dt;
        parts.p[j] += parts.v[j] * dt; parts.p[j + 1] += parts.v[j + 1] * dt; parts.p[j + 2] += parts.v[j + 2] * dt;
        var s = Math.max(0, parts.life[i]) * 1.3;
        parts.m4.makeScale(s, s, s); parts.m4.setPosition(parts.p[j], parts.p[j + 1], parts.p[j + 2]);
        parts.mesh.setMatrixAt(i, parts.m4);
      }
      if (any) parts.mesh.instanceMatrix.needsUpdate = true;
    }
    var labelTex = {};
    function label(text, color) {
      var k = text + color;
      if (!labelTex[k]) {
        var c = document.createElement('canvas'); c.width = 512; c.height = 160;
        var x = c.getContext('2d');
        x.font = '900 92px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 14; x.strokeStyle = '#2b1d12'; x.strokeText(text, 256, 84);
        x.fillStyle = color || '#ffd36a'; x.fillText(text, 256, 84);
        labelTex[k] = new T.CanvasTexture(c); labelTex[k].colorSpace = T.SRGBColorSpace;
      }
      return labelTex[k];
    }
    function popup(text, pos, color, size) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: label(text, color), transparent: true, depthTest: false }));
      sp.renderOrder = 10;
      var s = size || 0.42; sp.scale.set(s, s * 0.31, 1);
      sp.position.copy(pos); sp.position.y += 0.12;
      scene.add(sp);
      popups.push({ sp: sp, life: 0.75 });
    }
    function stepPopups(dt) {
      for (var i = popups.length - 1; i >= 0; i--) {
        var p = popups[i]; p.life -= dt;
        p.sp.position.y += dt * 0.5; p.sp.material.opacity = Math.max(0, p.life / 0.75);
        if (p.life <= 0) { scene.remove(p.sp); p.sp.material.dispose(); popups.splice(i, 1); }
      }
    }
    var flashT = 0;
    function flash() { var f = $('[data-flash]'); f.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(function () { f.classList.remove('on'); }, 90); }
    var calloutT = 0;
    function callout(html, ms) {
      var el = $('[data-callout]');
      el.innerHTML = html; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      clearTimeout(calloutT);
      if (ms) calloutT = setTimeout(function () { el.innerHTML = ''; }, ms);
      if (mode !== 'flat') vrTip(html.replace(/<small>/, '\n').replace(/<[^>]+>/g, ''), ms);
    }

    /* ---------------------------------------------------------------- VR cards (punchable) */
    function vrCanvasPlane(wM, hM, draw) {
      var c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * hM / wM);
      draw(c.getContext('2d'), c.width, c.height);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      var m = new T.Mesh(new T.PlaneGeometry(wM, hM), new T.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
      m.userData.redraw = function (d) { d(c.getContext('2d'), c.width, c.height); tex.needsUpdate = true; };
      return m;
    }
    function drawCard(o) {
      return function (x, w, h) {
        SP.parchment(x, w, h);
        x.textAlign = 'center'; x.textBaseline = 'alphabetic';
        var y = 86;
        if (o.emoji) { x.font = '96px serif'; x.fillText(o.emoji, w / 2, y + 30); y += 120; }
        if (o.eyebrow) { x.font = '700 34px Cinzel, serif'; x.fillStyle = '#b8322a'; x.fillText(o.eyebrow.toUpperCase(), w / 2, y); y += 66; }
        if (o.title) { x.font = '700 60px Cinzel, serif'; x.fillStyle = '#2b1d12'; SP.wrap(x, o.title, w - 140).forEach(function (l) { x.fillText(l, w / 2, y); y += 70; }); y += 6; }
        x.font = '500 40px "Alegreya Sans", sans-serif'; x.fillStyle = '#4a3826';
        (o.body || []).forEach(function (para) { SP.wrap(x, para, w - 150).forEach(function (l) { x.fillText(l, w / 2, y); y += 50; }); y += 10; });
        if (o.foot) { x.font = 'italic 500 34px "Alegreya Sans", sans-serif'; x.fillStyle = '#8a6a3c'; x.fillText(o.foot, w / 2, h - 50); }
      };
    }
    function drawLine(line) {
      return function (x, w, h) {
        var who = SP.who(line[0]);
        SP.parchment(x, w, h);
        x.font = '120px serif'; x.textAlign = 'center'; x.fillText(who.emoji, 130, 190);
        x.textAlign = 'left';
        if (line[0] !== 'narrator') { x.font = '700 40px Cinzel, serif'; x.fillStyle = line[0] === 'king' ? '#b8322a' : '#2f6d3a'; x.fillText(who.name, 240, 100); }
        x.font = (line[0] === 'narrator' ? 'italic ' : '') + '500 42px "Alegreya Sans", sans-serif'; x.fillStyle = '#2b1d12';
        var y = line[0] === 'narrator' ? 110 : 160;
        SP.wrap(x, line[1], w - 300).forEach(function (l) { x.fillText(l, 240, y); y += 52; });
      };
    }
    function vrAdd(obj, x, y, z) {
      obj.position.set(x, y, z);
      obj.lookAt(cal.x, obj.position.y, cal.z + 1);
      scene.add(obj); vr.items.push(obj);
      return obj;
    }
    function vrClear() {
      vr.items.forEach(function (o) { scene.remove(o); });
      vr.items = []; vr.orbs = []; vr.redo = null;
    }
    function vrOrb(text, x, y, z, action, color) {
      var g = new T.Group();
      kit.add(g, kit.G.sph(0.085, 16, 12), color || '#f2c14e', null, null, null, { emissive: color || '#f2c14e', emissiveIntensity: 0.35 });
      kit.add(g, kit.G.tor(0.12, 0.012), '#fffaf0', null, null, null, { emissive: '#ffffff', emissiveIntensity: 0.4 });
      var lab = vrCanvasPlane(0.34, 0.1, function (c, w, h) {
        c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(28,22,16,.82)'; c.beginPath(); c.roundRect ? c.roundRect(0, 0, w, h, 60) : c.rect(0, 0, w, h); c.fill();
        c.font = '800 120px "Alegreya Sans", sans-serif'; c.fillStyle = '#fffaf0'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 6);
      });
      lab.position.set(0, 0.17, 0); g.add(lab);
      vrAdd(g, x, y, z);
      vr.orbs.push({ obj: g, action: action, r: 0.12 });
      return g;
    }
    function vrTip(text, ms) {
      if (vr.tip) { scene.remove(vr.tip); vr.tip = null; }
      if (!text) return;
      var parts2 = text.split('\n');
      vr.tip = vrCanvasPlane(1.1, 0.34, drawCard({ title: parts2[0], body: parts2.slice(1) }));
      vr.tip.position.set(cal.x, cal.h + 0.55, cal.z - 2.6);
      scene.add(vr.tip);
      var mine = vr.tip;
      if (ms) setTimeout(function () { if (vr.tip === mine) { scene.remove(mine); vr.tip = null; } }, ms);
    }
    function vrHud() {
      if (vr.hud) scene.remove(vr.hud);
      vr.hud = vrCanvasPlane(0.62, 0.17, function () {});
      vr.hud.position.set(cal.x, cal.h - 0.62, cal.z - 0.85);
      vr.hud.lookAt(cal.x, cal.h, cal.z);
      scene.add(vr.hud);
    }
    function drawHud() {
      if (!vr.hud || !B) return;
      vr.hud.userData.redraw(function (x, w, h) {
        x.clearRect(0, 0, w, h);
        x.fillStyle = 'rgba(28,22,16,.78)'; x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, 40) : x.rect(0, 0, w, h); x.fill();
        x.fillStyle = '#fffaf0'; x.font = '900 86px Cinzel, serif'; x.textAlign = 'left'; x.fillText(B.score.toLocaleString(), 40, 110);
        x.fillStyle = '#ffd36a'; x.font = '800 54px "Alegreya Sans", sans-serif'; x.fillText(B.combo > 2 ? B.combo + ' combo  ×' + B.mult : '', 40, 200);
        function bar(y, f, c1) { x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(560, y, 420, 30); x.fillStyle = c1; x.fillRect(560, y, 420 * Math.max(0, Math.min(1, f)), 30); }
        x.font = '800 30px "Alegreya Sans", sans-serif'; x.fillStyle = '#fffaf0'; x.fillText('VIGOR', 560, 60); bar(72, B.vigor / B.maxVigor, '#ff7a5a');
        x.fillText('JOURNEY', 560, 150); bar(162, B.progress, '#ffd36a');
        if (B.hasRage) { x.fillText(B.rageOn ? 'RAGE! ×2' : 'RAGE (fists up when full)', 560, 236); bar(248, B.rage, '#ff9d1a'); }
      });
    }

    /* ---------------------------------------------------------------- the battle */
    function newBattle() {
      test = window.SP_TEST || null;
      var st = settings(), inten = content.intensity[st.intensity] || content.intensity.steady;
      var chart = SP.chart(tid, st);
      var punches = chart.events.filter(function (e) { return e.move && !SP.isBody(e.move); }).length;
      var total = chart.events.filter(function (e) { return e.move; }).length;
      var hpFrac = inten.boss_hp;
      B = {
        chart: chart, spb: chart.spb, speed: TRAVEL / chart.lead, lead: chart.lead, total: total, idx: 0, live: [],
        score: 0, hits: 0, weak: 0, misses: 0, combo: 0, maxCombo: 0, mult: 1, cap: 4 + 2 * upLevel('charm'),
        gaunt: 1 + 0.1 * upLevel('gauntlets'), reach: 0.075 * (1 + 0.06 * upLevel('gauntlets')),
        maxVigor: 100 + 20 * upLevel('stew'), vigor: 100 + 20 * upLevel('stew'), lid: upLevel('lid'),
        hasRage: upLevel('rage') > 0, rage: 0, rageOn: false, rageUntil: 0, rageLen: upLevel('rage') > 1 ? 12 : 8,
        minSpeed: inten.speed * (test ? 0 : 1), duckNeed: 0.24 - 0.04 * upLevel('boots') + (st.intensity === 'beast' ? 0.05 : 0),
        leanNeed: 0.16 - 0.03 * upLevel('boots'), nofail: !!st.nofail, intensity: st.intensity,
        moves: {}, flurry: 0, failed: false, bossDown: false, boss: null, bossHp: 0, bossMax: Math.max(1, Math.ceil(punches * hpFrac)),
        // no running audio clock (blocked or failed): the game keeps its own time, without music
        useAudio: audio.running() && !test, clock: 0, tscale: test && test.speed ? test.speed : 1, t0: 0, lastT: 0, progress: 0,
        paused: false, ended: false, beatShown: -1
      };
      var lastB = chart.events.length ? chart.events[chart.events.length - 1].b : chart.beats;
      B.endB = lastB;
      return B;
    }
    function now() { return B ? (B.useAudio ? audio.now() : B.clock) : 0; }
    function headPos() {
      if (mode === 'flat') return headV.copy(camera.position);
      camera.getWorldPosition(headV);
      return headV;
    }

    function startBattle() {
      vrClear(); vrTip(null);
      panelWrap.hidden = true;
      newBattle();
      if (mode === 'flat') cal = { x: 0, z: 0, h: 1.6 };   // in VR, cal was measured while you read the start card
      else vrHud();
      $('[data-hud]').hidden = false;
      $('[data-tname]').textContent = info.t.name;
      $('[data-rage]').hidden = !B.hasRage;
      $('[data-pad]').hidden = mode !== 'flat';
      $('[data-ragebtn]').hidden = !B.hasRage;
      if (info.t.boss) spawnBoss();
      B.t0 = now() + 0.6;
      stopMenuMusic(0.5);
      if (B.useAudio) audio.startMusic(B.chart.bpm, land.key, B.t0, B.chart.beats);
      state = 'battle';
      if (SP.prog() && info.t.n === 1 && !info.training) SP.markScene('arrive-' + land.key);
    }
    function spawnBoss() {
      var g = kit.boss(land.boss.model);
      g.scale.setScalar(10);
      g.position.set(cal.x, 2.3, cal.z + world.bossSpot.z - 2);
      scene.add(g);
      var bar = vrCanvasPlane(2.4, 0.42, function () {});
      bar.position.set(0, 0.36, 0); bar.scale.setScalar(1 / 10);
      g.add(bar);
      B.boss = { obj: g, bar: bar, shake: 0 };
      B.bossHp = B.bossMax;
      drawBossBar();
    }
    function drawBossBar() {
      if (!B.boss) return;
      B.boss.bar.userData.redraw(function (x, w, h) {
        x.clearRect(0, 0, w, h);
        x.fillStyle = 'rgba(28,22,16,.85)'; x.fillRect(0, 0, w, h);
        x.font = '700 64px Cinzel, serif'; x.fillStyle = '#ffd36a'; x.textAlign = 'center'; x.fillText(land.boss.name, w / 2, 80);
        x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(40, 112, w - 80, 46);
        x.fillStyle = '#e2483a'; x.fillRect(40, 112, (w - 80) * Math.max(0, B.bossHp / B.bossMax), 46);
      });
    }
    function spawn(ev) {
      var o = { ev: ev, t: B.t0 + ev.b * B.spb, move: ev.move, hand: ev.hand, done: false };
      var s = ev.hand === 'L' ? -1 : ev.hand === 'R' ? 1 : (SP.hash(String(ev.b)) % 2 ? 1 : -1);
      var g = new T.Group();
      if (!SP.isBody(ev.move)) {
        var p = POS[ev.move](s);
        o.x = cal.x + p[0]; o.y = cal.h + p[1]; o.arrZ = cal.z + Z_HIT;
        o.dirName = dirOf(ev.move, s); o.dir = o.dirName ? DIRV[o.dirName] : [0, 0, -1];
        o.r = ev.move === 'lunge' ? 0.2 : 0.17;
        var f = kit.food(ev.enemy); f.scale.setScalar(1.05); g.add(f); o.food = f;
        var mk = kit.marker(ev.move, ev.hand, o.dirName); mk.position.z = 0.02; g.add(mk);
      } else if (ev.move === 'duck') {
        o.x = cal.x; o.y = cal.h - 0.06; o.arrZ = cal.z - 0.1;
        kit.add(g, kit.G.cyl(0.075, 0.075, 3.2, 10), '#d9a35c', null, [0, 0, Math.PI / 2]);
        for (var i = -3; i <= 3; i++) kit.add(g, kit.G.cyl(0.078, 0.078, 0.05, 10), '#a8743a', [i * 0.42, 0, 0], [0, 0, Math.PI / 2]);
        var sp = new T.Sprite(new T.SpriteMaterial({ map: label('DUCK', '#ffd36a'), transparent: true })); sp.scale.set(0.6, 0.19, 1); sp.position.y = 0.28; g.add(sp);
      } else if (ev.move === 'lean') {
        o.side = s; o.x = cal.x + s * 0.08; o.y = cal.h - 0.04; o.arrZ = cal.z - 0.1;
        kit.add(g, kit.G.sph(0.16, 14, 10), land.key === 'storm' ? '#7a3b1e' : '#d23a2a', null, null, [1, 1, 1.3], { emissive: '#3a0a00', emissiveIntensity: 0.3 });
        var sp2 = new T.Sprite(new T.SpriteMaterial({ map: label(s > 0 ? '⟵ LEAN' : 'LEAN ⟶', '#ffffff'), transparent: true })); sp2.scale.set(0.6, 0.19, 1); sp2.position.y = 0.3; g.add(sp2);
      } else if (ev.move === 'block') {
        o.x = cal.x; o.y = cal.h - 0.1; o.arrZ = cal.z - 0.35;
        kit.add(g, kit.G.ico(0.22, 1), '#b8322a', null, null, null, { emissive: '#5a0a00', emissiveIntensity: 0.4 });
        var sp3 = new T.Sprite(new T.SpriteMaterial({ map: label('BLOCK', '#ffd36a'), transparent: true })); sp3.scale.set(0.6, 0.19, 1); sp3.position.y = 0.36; g.add(sp3);
      }
      o.obj = g;
      g.position.set(o.x, o.y, o.arrZ - (o.t - now()) * B.speed);
      scene.add(g);
      B.live.push(o);
    }
    function addMove(m) { B.moves[m] = (B.moves[m] || 0) + 1; }
    function scoreHit(o, glove, quality, power) {
      if (o.done) return;
      o.done = true; o.hitAt = now();
      var wrongHand = glove && glove.hand && o.hand !== 'A' && glove.hand !== o.hand;
      var weak = quality < 0.3 || wrongHand;
      B.combo++; B.maxCombo = Math.max(B.maxCombo, B.combo); B.mult = Math.min(B.cap, 1 + Math.floor(B.combo / 8));
      var pts = Math.round(100 * (0.7 + 0.3 * power) * (weak ? 0.5 : 1) * B.mult * B.gaunt * (B.rageOn ? 2 : 1));
      B.score += pts;
      if (weak) B.weak++; else B.hits++;
      addMove(o.move);
      B.vigor = Math.min(B.maxVigor, B.vigor + 1.5);
      if (B.hasRage && !B.rageOn) B.rage = Math.min(1, B.rage + 1 / 30);
      var p = o.obj.position;
      burst(p, o.food ? colorsOf(o.food) : ['#ffd36a'], 18);
      popup(weak ? (wrongHand ? 'WRONG FIST' : 'WEAK') : power > 0.65 ? 'SMASH!' : 'HIT', p, weak ? '#fffaf0' : power > 0.65 ? '#ffd36a' : '#b6e07a', weak ? 0.36 : 0.44);
      audio.hit(power, weak);
      if (glove) buzz(glove, weak ? 0.3 : 0.5 + power * 0.5, 45);
      if (B.boss) { B.bossHp = Math.max(0, B.bossHp - 1); B.boss.shake = 0.25; drawBossBar(); if (B.bossHp === 0 && !B.bossDown) { B.bossDown = true; popup('BOSS DOWN!', B.boss.obj.position.clone().setY(3), '#ffd36a', 2.2); audio.boom(); } }
    }
    function scoreBody(o) {
      if (o.done) return;
      o.done = true; o.hitAt = now();
      B.combo++; B.maxCombo = Math.max(B.maxCombo, B.combo); B.mult = Math.min(B.cap, 1 + Math.floor(B.combo / 8));
      B.score += Math.round(100 * B.mult * B.gaunt * (B.rageOn ? 2 : 1));
      B.hits++; addMove(o.move);
      B.vigor = Math.min(B.maxVigor, B.vigor + 1.5);
      var p = headPos().clone(); p.z -= 0.6; p.y += 0.1;
      popup(o.move === 'duck' ? 'NICE DUCK' : o.move === 'lean' ? 'NICE LEAN' : 'BLOCKED!', p, '#b6e07a', 0.4);
      if (o.move === 'block') { burst(o.obj.position, ['#d23a2a', '#ff7a5a', '#ffd36a'], 22); audio.hit(0.8, false); gloves.forEach(function (g) { buzz(g, 0.7, 60); }); }
      else audio.whoosh();
    }
    function miss(o) {
      if (o.done) return;
      o.done = true; o.missed = true;
      B.combo = 0; B.mult = 1; B.misses++;
      var p = SP.isBody(o.move) ? headPos().clone().setZ(headPos().z - 0.6) : o.obj.position;
      if (B.lid > 0) { B.lid--; popup('POT LID!', p, '#ffd36a'); audio.tick(); return; }
      B.vigor -= 9;
      popup('MISS', p, '#ff8a78', 0.36);
      audio.miss(); flash();
      gloves.forEach(function (g) { buzz(g, 0.25, 25); });
      if (B.vigor <= 0) {
        if (B.nofail) { B.vigor = 0; }
        else { B.failed = true; endBattle(); }
      }
    }
    function colorsOf(food) {
      var out = [];
      food.traverse(function (m) { if (m.isMesh && out.length < 4 && m.material && m.material.color) { var c = '#' + m.material.color.getHexString(); if (c !== '#ffffff' && c !== '#1b130c' && out.indexOf(c) < 0) out.push(c); } });
      return out.length ? out : ['#ffd36a'];
    }
    function buzz(g, s, ms) {
      try { var gp = g.source && g.source.gamepad, h = gp && gp.hapticActuators && gp.hapticActuators[0]; if (h && h.pulse) h.pulse(s, ms); } catch (e) {}
    }

    function stepBattle(dt) {
      var t = now();
      var ev = B.chart.events;
      // count-in
      var beat = Math.floor((t - B.t0) / B.spb);
      if (beat !== B.beatShown && beat >= 0 && beat < B.chart.intro) {
        B.beatShown = beat;
        var left = B.chart.intro - beat;
        if (left <= 4) callout(left > 1 ? String(left - 1) : 'Punch!', 700);
        else if (beat === 0) callout(esc(info.t.name) + '<small>' + (info.t.boss ? esc(land.boss.name) + ' awaits' : 'Get your guard up') + '</small>', 1600);
      }
      // spawn what is about to arrive
      while (B.idx < ev.length && B.t0 + ev[B.idx].b * B.spb - B.lead <= t) {
        var e = ev[B.idx++];
        if (e.tip) { var mv = content.moves[e.tip]; callout(e.tip === 'mix' ? 'Now all together!<small>Watch the colours: green ring = left fist, red ring = right, gold = either.</small>' : mv.icon + ' ' + esc(mv.name) + '<small>' + esc(mv.how) + '</small>', 3200); continue; }
        spawn(e);
      }
      if (test && test.autoplay) autoplay(t);
      // move + judge
      var head = headPos();
      for (var i = B.live.length - 1; i >= 0; i--) {
        var o = B.live[i];
        var z = o.arrZ - (o.t - t) * B.speed;
        if (o.done && !o.missed && !SP.isBody(o.move)) {  // popped: grow and vanish
          var k = (t - o.hitAt) / 0.18;
          o.obj.scale.setScalar(1 + k * 0.6); o.obj.visible = k < 1;
          if (k > 1) { scene.remove(o.obj); B.live.splice(i, 1); }
          continue;
        }
        o.obj.position.set(o.x, o.y + (o.food ? Math.sin(t * 5 + o.ev.b) * 0.012 : 0), z);
        if (o.food) { o.food.rotation.y = Math.sin(t * 2 + o.ev.b) * 0.25; (o.food.userData.pupils || []).forEach(function (pp, n) { pp.position.x = pp.userData.base.x + Math.sin(t * 9 + n * 2 + o.ev.b) * 0.008; }); }
        if (!o.done) {
          if (!SP.isBody(o.move)) {
            if (t > o.t + 0.32) miss(o);
          } else if (t > o.t - (o.move === 'block' ? 0.25 : 0.13)) {   // judged on the frames around arrival (a dropped frame can't skip it)
            var okBody = o.move === 'duck' ? head.y < cal.h - B.duckNeed : o.move === 'lean' ? (head.x - cal.x) * -o.side > B.leanNeed : guarding(head);
            if (okBody) scoreBody(o);
            else if (t > o.t + (o.move === 'block' ? 0.06 : 0.13)) miss(o);
          }
        }
        var gone = z > cal.z + 2.5 || (o.done && o.move === 'block' && !o.missed) || (o.done && SP.isBody(o.move) && t > o.t + 0.6);
        if (gone) { scene.remove(o.obj); B.live.splice(i, 1); }
      }
      // VR fists
      if (mode !== 'flat') {
        gloves.forEach(function (g) {
          if (!g.tracked || g.speed < B.minSpeed) return;
          for (var j = 0; j < B.live.length; j++) {
            var o = B.live[j];
            if (o.done || SP.isBody(o.move) || Math.abs(o.t - t) > 0.45) continue;
            if (g.pos.distanceTo(o.obj.position) < o.r + B.reach) {
              var q = (g.vel.x * o.dir[0] + g.vel.y * o.dir[1] + g.vel.z * o.dir[2]) / Math.max(0.001, g.speed);
              scoreHit(o, g, q, Math.min(1, (g.speed - B.minSpeed) / 2.2));
            }
          }
        });
        // spice rage: both fists above your head
        if (B.hasRage && B.rage >= 1 && !B.rageOn && gloves.length === 2 && gloves.every(function (g) { return g.tracked && g.pos.y > head.y + 0.05; })) rage();
      }
      if (B.rageOn && t > B.rageUntil) { B.rageOn = false; B.rage = 0; }
      // the end
      B.progress = Math.min(1, Math.max(0, (t - B.t0) / (B.endB * B.spb + 1)));
      if (B.boss) { var bo = B.boss.obj; bo.rotation.y = Math.sin(t * 0.8) * 0.3; if (B.boss.shake > 0) { B.boss.shake -= dt; bo.position.x = cal.x + Math.sin(t * 60) * 0.15; } else bo.position.x = cal.x; if (B.bossDown) { bo.scale.multiplyScalar(Math.max(0.9, 1 - dt * 1.5)); bo.rotation.z += dt * 3; } }
      if (B.idx >= ev.length && !B.live.some(function (o) { return !o.done; }) && t > B.t0 + B.endB * B.spb + 0.8) endBattle();
    }
    function guarding(head) {
      var gs = mode === 'flat' ? flatGloves : gloves;
      if (gs.length < 2) return false;
      return gs.every(function (g) {
        return g.tracked && Math.abs(g.pos.x - head.x) < 0.3 && g.pos.y > head.y - 0.32 && g.pos.y < head.y + 0.2 && g.pos.distanceTo(head) < 0.45;
      });
    }
    function rage() {
      if (!B.hasRage || B.rage < 1 || B.rageOn) return;
      B.rageOn = true; B.rageUntil = now() + B.rageLen;
      callout('🌶️ SPICE RAGE!<small>Double points for ' + B.rageLen + ' seconds</small>', 1500);
      audio.boom();
    }
    function autoplay(t) {
      keys = {};
      B.live.forEach(function (o) {
        if (o.done) return;
        var dtm = o.t - t;
        if (!SP.isBody(o.move)) { if (dtm < 0.06) { flatPunch(o.hand === 'L' ? 0 : 1, o.obj.position); scoreHit(o, null, 1, 0.9); } }
        else if (dtm < 0.45) { if (o.move === 'duck') keys.duck = 1; if (o.move === 'lean') keys[o.side > 0 ? 'left' : 'right'] = 1; if (o.move === 'block') keys.block = 1; }
      });
      if (B.hasRage && B.rage >= 1) rage();
      if (mode === 'flat') stepFlat(0);   // take the pose now, not next frame
    }

    function endBattle() {
      if (B.ended) return;
      B.ended = true;
      B.live.forEach(function (o) { if (!o.done) { o.done = true; } scene.remove(o.obj); });
      B.live = [];
      $('[data-pad]').hidden = true;
      var acc = (B.hits + 0.5 * B.weak) / Math.max(1, B.total);
      var villager = info.t.villager && content.villagers[info.t.villager];
      if (!B.failed && acc >= 0.5 && !info.t.boss && (villager || info.training)) return startFlurry(villager);
      if (info.t.boss && B.bossDown && villager) return startFlurry(villager);
      if (B.failed) callout('Out of vigor!<small>Catch your breath. You can try again.</small>', 2600);
      else if (info.t.boss && !B.bossDown) callout(esc(land.boss.name) + ' escapes!<small>Hit more snacks to wear the boss down.</small>', 2600);
      else if (acc < 0.5) callout('The Horde holds…<small>Hit at least half the snacks to free this territory.</small>', 2600);
      else if (info.t.boss) callout('Victory!<small>' + esc(land.boss.name) + ' is defeated.</small>', 2400);
      audio.stopMusic();
      state = 'ending';
      setTimeout(finish, test ? 300 : 2200);
    }
    function startFlurry(villager) {
      state = 'flurry';
      audio.stopMusic();
      var g = kit.cage();
      var who = villager || { name: 'Sir Broccolot', emoji: '🥦' };
      var face = vrCanvasPlane(0.4, 0.4, function (x, w, h) { x.clearRect(0, 0, w, h); x.font = (w * 0.7) + 'px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(who.emoji, w / 2, h / 2 + 20); });
      g.add(face);
      g.position.set(cal.x, cal.h - 0.3, cal.z + Z_HIT - 0.12);
      scene.add(g);
      B.cage = { obj: g, end: now() + 7, face: face, who: who, nextAuto: now() + 0.25 };
      if (mode !== 'flat') face.lookAt(headPos());
      callout('Free ' + esc(who.name) + '!<small>Punch the cage as fast as you can!</small>', 2000);
      audio.chime();
    }
    function stepFlurry(dt) {
      var t = now(), c = B.cage;
      c.obj.rotation.y = Math.sin(t * 3) * 0.08;
      if (mode !== 'flat') {
        gloves.forEach(function (g) {
          if (!g.tracked) return;
          var d = g.pos.distanceTo(c.obj.position);
          if (d < 0.38 && !g.inCage && g.speed > B.minSpeed * 0.6) { g.inCage = true; flurryHit(g); }
          else if (d > 0.46) g.inCage = false;
        });
      }
      // the test robot punches 4 times a second of game time, catching up when frames are slow
      if (test && test.autoplay) {
        if (t > c.nextAuto) flatPunch(B.flurry % 2, c.obj.position);
        while (t > c.nextAuto && c.nextAuto < c.end) { c.nextAuto += 0.25; flurryHit(null); }
      }
      if (t > c.end) {
        burst(c.obj.position, ['#8a8f96', '#d23a2a', '#ffd36a', '#fffaf0'], 40);
        scene.remove(c.obj);
        audio.chime();
        var p = c.obj.position.clone(); p.y += 0.3;
        popup('FREED!', p, '#b6e07a', 0.6);
        callout(esc(c.who.name) + ' is free!<small>' + B.flurry + ' punches in the flurry</small>', 2200);
        state = 'ending';
        setTimeout(finish, test ? 300 : 1900);
      }
    }
    function flurryHit(g) {
      B.flurry++;
      B.score += 25 * B.mult;
      addMove('flurry');
      B.cage.obj.position.x = cal.x + (Math.random() - 0.5) * 0.04;
      burst(B.cage.obj.position, ['#ffd36a', '#fffaf0'], 5);
      audio.hit(0.5, false);
      if (g) buzz(g, 0.6, 35);
    }

    function stats() {
      var moves = Object.assign({}, B.moves);
      var flurry = moves.flurry || 0; delete moves.flurry;
      return { total: B.total, hits: B.hits, weak: B.weak, max_combo: B.maxCombo, score: B.score,
        seconds: Math.max(5, Math.round(now() - B.t0)), flurry: flurry, moves: moves, failed: B.failed, boss_down: B.bossDown, intensity: B.intensity };
    }
    function finish() {
      if (!alive) return;
      state = 'saving';
      $('[data-hud]').hidden = true; if (vr.hud) { scene.remove(vr.hud); vr.hud = null; }
      if (B.boss) { scene.remove(B.boss.obj); }
      var st = stats();
      var out = UI.apiQuiet('finish_battle', tid, st).then(function (r) {
        if (r.progress) SP.setProgress(r.progress);
        return r;
      }, function (e) { return { error: e.message || 'Your result could not be saved.' }; });
      out.then(function (r) { if (alive) showResults(r, st); });
    }

    /* ---------------------------------------------------------------- results */
    function rewardRows(r) {
      return (r.rewards || []).map(function (w) {
        var em = '🎁', title = '', sub = '', cls = '';
        if (w.kind === 'sprouts') { em = '🌱'; title = '+' + w.n + ' sprouts'; sub = 'Spend them at the market' + (SP.prog() && SP.prog().forge ? ' and the forge' : ''); }
        else if (w.kind === 'item') { var it = content.items[w.id]; em = it.emoji; title = it.name; sub = it.type + ' · ' + catName(it.cat) + (it.rarity !== 'common' ? ' · ' + it.rarity : ''); cls = it.rarity === 'legendary' ? 'legendary' : ''; }
        else if (w.kind === 'villager') { var v = content.villagers[w.id]; em = v.emoji; title = v.name + ' is free!'; sub = '“' + v.quip + '”'; }
        else if (w.kind === 'key') { var k = content.key_items[w.id]; em = k.emoji; title = k.name; sub = k.blurb; cls = 'legendary'; }
        else if (w.kind === 'land') { var L = SP.land(w.id); em = L.emoji; title = L.name + ' is open'; sub = L.blurb; }
        else if (w.kind === 'forge') { em = '⚒️'; title = 'Granny\'s forge is open'; sub = 'Gauntlets, guards and charms in the Village'; }
        else if (w.kind === 'skin') { var c = content.categories.filter(function (x) { return x.key === w.id; })[0]; em = '🥊'; title = c.skin + ' gloves unlocked'; sub = 'You finished ' + c.name + '!'; cls = 'legendary'; }
        else if (w.kind === 'bounty') { em = '🎯'; title = 'Daily bounty!'; sub = 'Double sprouts for this territory today'; }
        else if (w.kind === 'victory') { em = '🍲'; title = 'The Everpot bubbles again!'; sub = 'You saved Nourra. Now find everyone you missed.'; cls = 'legendary'; }
        else return null;
        return { em: em, title: title, sub: sub, cls: cls };
      }).filter(Boolean);
    }
    function catName(k) { var c = content.categories.filter(function (x) { return x.key === k; })[0]; return c ? c.name : k; }
    function resultTitle(r) {
      if (r.error) return 'Saved? Not quite.';
      if (info.training) return r.cleared ? 'Training complete!' : 'Keep practising!';
      if (r.cleared) return info.t.boss ? land.boss.name + ' is defeated!' : info.t.name + ' is free!';
      return B.failed ? 'Out of vigor' : 'The Horde holds… for now';
    }
    function showResults(r, st) {
      state = 'results';
      menuMusic();
      var sceneKey = (r.rewards || []).filter(function (w) { return w.kind === 'scene'; }).map(function (w) { return w.id; })[0];
      if (mode !== 'flat') return vrResults(r, st, sceneKey);
      panelWrap.hidden = false;
      var stars = r.stars || 0, acc = Math.round((r.acc != null ? r.acc : (B.hits + 0.5 * B.weak) / Math.max(1, B.total)) * 100);
      var next = SP.next(tid), canNext = next && SP.unlocked(next) && (r.cleared || info.training);
      var sh = SP.muscleShares(st.moves), mus = content.muscles.map(function (m) { return [m[1], sh[m[0]] || 0]; }).sort(function (a, b) { return b[1] - a[1]; });
      var tip = (Date.now() - sessionStart) > 20 * 60000 ? 'You\'ve played over 20 minutes. Pickles insists: water break! 💧' : TIPS[Math.floor(Math.random() * TIPS.length)];
      panelWrap.innerHTML = '<div class="pl-panel" data-results data-cleared="' + (r.cleared ? 1 : 0) + '">' +
        '<div class="pl-res-head"><div class="eyebrow">' + esc(info.training ? 'The Training Yard' : land.emoji + ' ' + land.name) + '</div><h2>' + esc(resultTitle(r)) + '</h2>' +
        '<div class="big-stars">' + [0, 1, 2].map(function (i) { return i < stars ? '★' : '<span class="off">★</span>'; }).join('') + '</div>' +
        (r.best ? '<span class="ui-badge gold">New best score!</span>' : '') + '</div>' +
        (r.error ? '<div class="ui-error" style="margin-top:12px">' + esc(r.error) + '</div>' : '') +
        '<div class="pl-nums"><div><b>' + B.score.toLocaleString() + '</b><span>score</span></div><div><b>' + acc + '%</b><span>hits</span></div>' +
        '<div><b>' + B.maxCombo + '</b><span>best combo</span></div><div><b>' + (r.kcal != null ? Math.round(r.kcal) : '–') + '</b><span>kcal (est.)</span></div></div>' +
        (r.guest ? '<div class="ui-note">Nice punching! <b>Sign up</b> to save your progress and start the journey across Nourra.</div>' : '') +
        (rewardRows(r).length ? '<div class="ui-divider">Spoils</div><div class="pl-rewards">' + rewardRows(r).map(function (w, i) {
          return '<div class="pl-reward ' + w.cls + '" style="animation-delay:' + (i * 0.12) + 's"><span class="em">' + w.em + '</span><div><b>' + esc(w.title) + '</b><span>' + esc(w.sub) + '</span></div></div>';
        }).join('') + '</div>' : '') +
        (sceneKey ? '<div class="ui-divider">' + esc(content.scenes[sceneKey].title) + '</div>' + SP.sceneHtml(sceneKey) : '') +
        '<div class="ui-divider">What you worked</div><div class="pl-mus">' + mus.map(function (m) {
          return '<div><span>' + esc(m[0]) + '</span><div class="ui-meter"><i style="width:' + Math.round(m[1] * 100) + '%"></i></div><span>' + Math.round(m[1] * 100) + '%</span></div>';
        }).join('') + '</div><p class="pl-note">💡 ' + esc(tip) + '</p>' +
        '<div class="pl-go">' +
        (r.guest ? '<a class="ui-btn primary lg" href="#auth/signup" data-go="auth/signup">Sign up and start the journey</a>' : '') +
        (canNext && !r.guest ? '<button class="ui-btn primary lg" data-next>Onward: ' + esc(SP.terr(next).t.name) + ' ▶</button>' : '') +
        '<button class="ui-btn lg" data-again>↻ Fight again</button>' +
        '<a class="ui-btn ghost" href="#journey" data-go="' + (ctx.me ? 'journey' : 'landing') + '">' + (ctx.me ? '⌂ Back to the map' : 'Back to the front page') + '</a></div></div>';
      if (sceneKey) SP.markScene(sceneKey);
      panelWrap.scrollTop = 0;
    }
    function vrResults(r, st, sceneKey) {
      vrClear();
      var h = { x: cal.x, y: cal.h, z: cal.z };
      function card() {
        vrClear();
        h = { x: cal.x, y: cal.h, z: cal.z };
        var rows = rewardRows(r).slice(0, 5).map(function (w) { return w.em + '  ' + w.title; });
        var acc = Math.round((r.acc || 0) * 100);
        var c = vrCanvasPlane(1.0, 0.9, drawCard({ eyebrow: info.training ? 'Training Yard' : land.name, title: resultTitle(r),
          body: ['★'.repeat(r.stars || 0) + '☆'.repeat(3 - (r.stars || 0)) + '   ' + B.score.toLocaleString() + ' pts · ' + acc + '% · ' + Math.round(r.kcal || 0) + ' kcal'].concat(rows),
          foot: 'Punch an orb to choose' }));
        vrAdd(c, h.x, h.y + 0.05, h.z - 1.25);
        vr.redo = card;
        var next = SP.next(tid), canNext = next && SP.unlocked(next) && (r.cleared || info.training) && !r.guest;
        if (canNext) vrOrb('NEXT ▶', h.x - 0.32, h.y - 0.42, h.z - 0.55, function () { goTerritory(next); });
        vrOrb('AGAIN', canNext ? h.x : h.x - 0.18, h.y - 0.42, h.z - 0.55, function () { vrStartCard(); }, '#6aa84f');
        vrOrb('EXIT VR', canNext ? h.x + 0.32 : h.x + 0.18, h.y - 0.42, h.z - 0.55, function () { if (session) session.end(); }, '#c9b8a0');
      }
      if (sceneKey) { SP.markScene(sceneKey); vrStory(sceneKey, card); } else card();
    }

    /* ---------------------------------------------------------------- VR: start card + story */
    function vrStory(key, done) {
      var s = content.scenes[key], i = 0;
      function show() {
        vrClear();
        if (i >= s.lines.length) return done();
        var c = vrCanvasPlane(1.1, 0.42, drawLine(s.lines[i]));
        vrAdd(c, cal.x, cal.h + 0.05, cal.z - 1.2);
        vr.redo = show;
        vrOrb(i < s.lines.length - 1 ? '▶ NEXT' : '▶ DONE', cal.x + 0.25, cal.h - 0.38, cal.z - 0.55, function () { i++; show(); });
      }
      show();
    }
    function vrStartCard() {
      vrClear(); vrTip(null);
      menuMusic();
      $('[data-hud]').hidden = true;
      var h = headPos();
      cal = { x: h.x, z: h.z, h: Math.max(0.9, h.y) };
      var arrive = 'arrive-' + land.key;
      var p = SP.prog();
      if (!info.training && info.t.n === 1 && p && p.scenes.indexOf(arrive) < 0) { SP.markScene(arrive); return vrStory(arrive, vrStartCard); }
      var st = settings(), chart = SP.chart(tid, st), counts = {};
      chart.events.forEach(function (e) { if (e.move) counts[e.move] = (counts[e.move] || 0) + 1; });
      var movesLine = Object.keys(counts).map(function (m) { return content.moves[m].icon + ' ' + content.moves[m].name; }).join('  ');
      var c = vrCanvasPlane(1.0, 0.56, drawCard({ eyebrow: info.training ? 'Lesson' : land.name + ' · ' + land.element, title: info.t.name,
        body: [info.t.boss ? 'Boss: ' + land.boss.name : info.t.villager ? 'Rescue: ' + content.villagers[info.t.villager].name : 'Learn every move', movesLine,
          'Green ring = left fist · red = right · gold = either'],
        foot: 'Punch the golden orb to begin · trigger = bring cards to you' }));
      vrAdd(c, cal.x, cal.h + 0.12, cal.z - 1.3);
      vr.redo = vrStartCard;
      vrOrb('START', cal.x, cal.h - 0.32, cal.z - 0.5, function () { startBattle(); });
      vrOrb('EXIT VR', cal.x + 0.55, cal.h - 0.5, cal.z - 0.6, function () { if (session) session.end(); }, '#c9b8a0');
    }
    function goTerritory(next) {
      tid = next;
      info = SP.terr(tid);
      try { history.replaceState(null, '', '#play/' + tid); } catch (e) {}
      if (info.land.key !== land.key) buildLand(info.land);
      B = null; state = 'menu';
      if (mode === 'flat') showMenu(); else vrStartCard();
    }
    function vrOrbs() {
      if (!vr.orbs.length) return;
      var t = performance.now() / 1000;
      vr.orbs.forEach(function (o) { o.obj.children[0].scale.setScalar(1 + Math.sin(t * 4) * 0.06); });
      if (t - vr.lastOrb < 0.6) return;
      gloves.forEach(function (g) {
        if (!g.tracked || g.speed < 0.5) return;
        for (var i = 0; i < vr.orbs.length; i++) {
          var o = vr.orbs[i];
          if (g.pos.distanceTo(o.obj.position) < o.r + 0.07) {
            vr.lastOrb = t; buzz(g, 0.8, 60); audio.hit(0.6, false);
            burst(o.obj.position, ['#ffd36a', '#fffaf0'], 14);
            o.action();
            return;
          }
        }
      });
    }

    /* ---------------------------------------------------------------- entering + leaving VR */
    function setupXRGloves() {
      if (gloves.length) return;
      for (var i = 0; i < 2; i++) (function (i) {
        var grip = renderer.xr.getControllerGrip(i);
        scene.add(grip);
        var g = { i: i, grip: grip, mesh: null, hand: null, source: null, pos: new T.Vector3(), prev: new T.Vector3(), vel: new T.Vector3(), speed: 0, tracked: false, has: false };
        grip.addEventListener('connected', function (e) {
          g.source = e.data; g.hand = e.data.handedness === 'left' ? 'L' : 'R';
          if (g.mesh) grip.remove(g.mesh);
          g.mesh = kit.glove(kit.HAND[g.hand], skinColor()); grip.add(g.mesh);
        });
        grip.addEventListener('disconnected', function () { g.source = null; g.tracked = false; if (g.mesh) { grip.remove(g.mesh); g.mesh = null; } });
        // trigger (or a pinch with hand tracking) brings the current card back in front of you
        var ctl = renderer.xr.getController(i);
        scene.add(ctl);
        ctl.addEventListener('select', recenterCards);
        gloves.push(g);
      })(i);
    }
    function recenterCards() {
      if (mode === 'flat' || !vr.redo || vr.waitHead) return;
      var h = headPos();
      cal = { x: h.x, z: h.z, h: Math.max(0.9, h.y) };
      audio.tick && audio.tick();
      vr.redo();
    }
    // The headset only reports where your head is once it has drawn a frame or two,
    // so cards are placed after that (before, the camera still sits at the flat-screen spot).
    function waitForHead() {
      if (!vr.waitHead || mode === 'flat') return;
      vr.waited++;
      var ready = renderer.xr.isPresenting && headPos().y > 0.3;
      if (ready) vr.waitHead--;
      if (vr.waitHead <= 0 || vr.waited > 90) { vr.waitHead = 0; vrStartCard(); }
    }
    function trackGloves(dt) {
      gloves.forEach(function (g) {
        g.tracked = !!(g.mesh && g.grip.visible);
        if (!g.tracked) { g.has = false; g.speed = 0; return; }
        g.mesh.userData.tip.getWorldPosition(tmpV);
        if (g.has && dt > 0) {
          tmpV2.copy(tmpV).sub(g.prev).divideScalar(dt);
          g.vel.lerp(tmpV2, 0.6);
          g.speed = g.vel.length();
        }
        g.prev.copy(tmpV); g.pos.copy(tmpV); g.has = true;
      });
    }
    function enterXR(kind) {
      audio.init(); audio.volumes(settings().music, settings().sfx);
      var init = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
      navigator.xr.requestSession(kind === 'ar' ? 'immersive-ar' : 'immersive-vr', init).then(function (s) {
        if (!alive) { s.end(); return; }
        session = s;
        setupXRGloves();
        renderer.xr.setSession(s).then(function () {
          mode = kind; applyMode();
          flatGloves.forEach(function (g) { g.mesh.visible = false; });
          panelWrap.hidden = false;
          panelWrap.innerHTML = '<div class="pl-vrnote">You\'re in the headset. Take it off or press the menu button to come back.</div>';
          // park the camera below the floor: the first real head pose from the headset replaces it
          camera.position.set(0, -5, 0); camera.updateMatrixWorld(true);
          vrClear(); vr.waited = 0; vr.waitHead = 3;
        });
        s.addEventListener('end', onXREnd);
        s.addEventListener('visibilitychange', function () {
          if (!B || state !== 'battle') return;
          if (s.visibilityState === 'visible') resume(); else pause(true);
        });
      }, function (e) { UI.toast('Couldn\'t start VR: ' + (e && e.message || 'the headset said no'), 'error'); });
    }
    function onXREnd() {
      session = null; vr.waitHead = 0;
      if (!alive) return;
      mode = 'flat'; applyMode(); vrClear(); vrTip(null);
      if (vr.hud) { scene.remove(vr.hud); vr.hud = null; }
      flatGloves.forEach(function (g) { g.mesh.visible = true; });
      resize();
      if (B && (state === 'battle' || state === 'flurry' || state === 'paused')) { abort(); showMenu('The battle stopped when you left VR.'); }
      else if (state !== 'results' && state !== 'saving') showMenu();
      else if (state === 'results') showMenu();
    }
    function abort() {
      if (!B) return;
      audio.stopMusic();
      B.live.forEach(function (o) { scene.remove(o.obj); });
      if (B.boss) scene.remove(B.boss.obj);
      if (B.cage) scene.remove(B.cage.obj);
      B = null; state = 'menu';
      $('[data-hud]').hidden = true; $('[data-pad]').hidden = true; $('[data-callout]').innerHTML = '';
    }

    /* ---------------------------------------------------------------- flat-screen play */
    function flatPunch(i, worldPos) {
      var g = flatGloves[i]; if (!g) return;
      g.anim = 0.2;
      g.target.copy(worldPos); camera.worldToLocal(g.target);
      g.target.multiplyScalar(0.7);
    }
    function stepFlat(dt) {
      var k = test && test.autoplay ? 1 : 1 - Math.exp(-dt * 14);   // the test robot moves instantly
      body.duck += ((keys.duck ? 1 : 0) - body.duck) * k;
      body.lean += (((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) - body.lean) * k;
      body.block += ((keys.block ? 1 : 0) - body.block) * k;
      var bx = cal.x + body.lean * 0.42, by = 1.6 - body.duck * 0.5;
      camera.position.set(bx, by, 1.25);
      camera.lookAt(bx, by - 0.32, -3);
      flatGloves.forEach(function (g, i) {
        var guard = tmpV.set(i ? 0.08 : -0.08, -0.06, -0.34);
        var pos = tmpV2.copy(g.rest).lerp(guard, body.block);
        if (g.anim > 0) { g.anim -= dt; var a = Math.sin(Math.max(0, g.anim) / 0.2 * Math.PI); pos.lerp(g.target, a); }
        g.mesh.position.copy(pos);
        g.mesh.getWorldPosition(g.pos);
      });
      view.querySelectorAll('[data-key]').forEach(function (b) { b.classList.toggle('on', !!keys[b.getAttribute('data-key')]); });
    }
    var down = null;
    function pick(px, py) {
      var rect = cv.getBoundingClientRect(), best = null, bestD = 1e9, t = now();
      B.live.forEach(function (o) {
        if (o.done || SP.isBody(o.move)) return;
        var dtm = o.t - t;
        if (dtm > 0.95 || dtm < -0.32) return;
        tmpV.copy(o.obj.position).project(camera);
        var sx = (tmpV.x + 1) / 2 * rect.width + rect.left, sy = (1 - tmpV.y) / 2 * rect.height + rect.top;
        var d = Math.hypot(sx - px, sy - py);
        var lim = Math.max(70, rect.width * 0.09);
        if (d < lim && d < bestD) { bestD = d; best = o; }
      });
      return best;
    }
    function pointerDown(e) {
      if (mode !== 'flat' || !B) return;
      audio.init();
      if (state === 'flurry') { flatPunch(B.flurry % 2, B.cage.obj.position); flurryHit(null); return; }
      if (state !== 'battle') return;
      var o = pick(e.clientX, e.clientY);
      down = { x: e.clientX, y: e.clientY, o: o };
      if (o && !o.dirName) { flatPunch(o.hand === 'L' ? 0 : o.hand === 'R' ? 1 : (e.clientX < innerWidth / 2 ? 0 : 1), o.obj.position); scoreHit(o, null, 1, 0.75); down = null; }
    }
    function pointerUp(e) {
      if (!down || !B || state !== 'battle') { down = null; return; }
      var o = down.o, dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (!o || o.done) return;
      var dir = Math.hypot(dx, dy) < 22 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down');
      flatPunch(o.hand === 'L' ? 0 : 1, o.obj.position);
      scoreHit(o, null, dir === o.dirName ? 1 : 0.1, 0.75);
    }
    var KEYMAP = { ArrowDown: 'duck', KeyS: 'duck', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'block', ArrowUp: 'block', KeyW: 'block' };
    function keyDown(e) {
      if (state !== 'battle' && state !== 'flurry' && state !== 'paused') return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); return state === 'paused' ? resume() : pause(); }
      if (e.code === 'KeyR') return B && rage();
      if (KEYMAP[e.code]) { e.preventDefault(); keys[KEYMAP[e.code]] = 1; }
    }
    function keyUp(e) { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = 0; }
    function padDown(e) {
      var b = e.target.closest('[data-key]'); if (!b) return;
      e.preventDefault(); audio.init();
      var k = b.getAttribute('data-key');
      if (k === 'rage') return rage();
      keys[k] = 1;
      try { b.setPointerCapture(e.pointerId); } catch (x) {}
    }
    function padUp(e) { var b = e.target.closest('[data-key]'); if (b && b.getAttribute('data-key') !== 'rage') keys[b.getAttribute('data-key')] = 0; }

    function pause(fromXR) {
      if (!B || state !== 'battle') return;
      state = 'paused'; B.paused = true; audio.suspend();
      if (fromXR || mode !== 'flat') return;
      panelWrap.hidden = false;
      panelWrap.innerHTML = '<div class="pl-panel" style="text-align:center"><h2>Paused</h2><p class="muted">Catch your breath. The snacks will wait.</p>' +
        '<div class="pl-go"><button class="ui-btn primary lg" data-resume>▶ Keep fighting</button><button class="ui-btn" data-restart>↻ Start over</button>' +
        '<button class="ui-btn ghost" data-quitbattle>⌂ Leave the battle</button></div></div>';
    }
    function resume() {
      if (!B || state !== 'paused') return;
      panelWrap.hidden = true; B.paused = false; state = 'battle'; audio.resume();
    }

    /* ---------------------------------------------------------------- the pre-battle panel */
    function showMenu(note) {
      state = 'menu';
      menuMusic();
      $('[data-hud]').hidden = true; $('[data-pad]').hidden = true;
      panelWrap.hidden = false;
      var st = settings(), chart = SP.chart(tid, st), counts = {};
      chart.events.forEach(function (e) { if (e.move) counts[e.move] = (counts[e.move] || 0) + 1; });
      var p = SP.prog(), arrive = 'arrive-' + land.key;
      var showScene = !info.training && info.t.n === 1 && (!p || p.scenes.indexOf(arrive) < 0);
      var vil = info.t.villager && content.villagers[info.t.villager];
      var best = p && p.terr[tid];
      var bounty = p && p.bounty === tid && !p.bounty_claimed;
      panelWrap.innerHTML = '<div class="pl-panel" data-menu-panel>' +
        '<div class="pl-top"><a class="ui-btn ghost sm" href="#journey" data-go="' + (ctx.me ? 'journey' : 'landing') + '">← ' + (ctx.me ? 'Map' : 'Back') + '</a>' +
        (best ? SP.stars(best.stars) : '') + '</div>' +
        '<div class="eyebrow">' + esc(info.training ? 'Lesson zero' : land.emoji + ' ' + land.name + ' · ' + land.element) + '</div>' +
        '<h2>' + esc(info.t.name) + '</h2>' +
        '<p class="muted" style="margin:0">' + esc(info.training ? 'Sir Broccolot will teach you every move, one at a time: jabs, ducks, leans, uppercuts, hooks, hammer fists, lunges and blocks. Then a little of everything.' :
          info.t.boss ? land.boss.blurb : land.blurb) + '</p>' +
        '<div class="pl-meta">' + (info.t.boss ? '<span class="ui-badge bad">Boss: ' + esc(land.boss.name) + '</span>' : '') +
        (vil ? '<span class="ui-badge good">Rescue ' + esc(vil.emoji + ' ' + vil.name) + '</span>' : '') +
        (bounty ? '<span class="ui-badge gold">🎯 Today\'s bounty: double sprouts</span>' : '') +
        '<span class="ui-badge">♩ ' + chart.bpm + ' bpm</span><span class="ui-badge">⏱ about ' + Math.round(chart.secs / 60 + 0.4) + ' min</span>' +
        (best ? '<span class="ui-badge">Best ' + Number(best.best || 0).toLocaleString() + '</span>' : '') + '</div>' +
        (note ? '<div class="ui-note" style="margin-bottom:12px">' + esc(note) + '</div>' : '') +
        (showScene ? '<div class="ui-divider">' + esc(content.scenes[arrive].title) + '</div>' + SP.sceneHtml(arrive) + '<div style="height:6px"></div>' : '') +
        '<div class="ui-divider">Moves in this battle</div><div class="pl-moves">' + Object.keys(counts).map(function (m) {
          var mv = content.moves[m];
          return '<span class="sp-chip ' + (land.emphasis.indexOf(m) >= 0 && !info.training ? 'em' : '') + '" title="' + esc(mv.how) + '">' + mv.icon + ' ' + esc(mv.name) + ' ×' + counts[m] + '</span>';
        }).join('') + '</div>' +
        '<div class="pl-row"><div class="ui-seg" role="group" aria-label="Intensity">' + ['gentle', 'steady', 'beast'].map(function (k) {
          return '<button type="button" data-int="' + k + '" class="' + (st.intensity === k ? 'on' : '') + '">' + content.intensity[k].name + '</button>';
        }).join('') + '</div><label class="ui-check"><input type="checkbox" data-seated' + (st.seated ? ' checked' : '') + '> Seated (no ducks or lunges)</label></div>' +
        '<div class="pl-go">' +
        (xr.vr ? '<button class="ui-btn gold lg" data-xr="vr">🥽 Enter VR</button>' : '') +
        (xr.ar ? '<button class="ui-btn lg" data-xr="ar">🏠 VR with passthrough <small>(see your room)</small></button>' : '') +
        '<button class="ui-btn ' + (xr.vr ? '' : 'primary') + ' lg" data-flat>🖥️ Play on this screen</button></div>' +
        '<p class="pl-note">' + (xr.vr ? '🛡️ Clear about 2 × 2 m around you, tighten the wrist straps, and keep water nearby.'
          : '🥽 To play in VR, open this page in your headset\'s browser (Meta Quest Browser). On this screen: click or tap the snacks; drag up, down or sideways for uppercuts, hammer fists and hooks; ←/→ lean, ↓ duck, space blocks.') + '</p></div>';
      panelWrap.scrollTop = 0;
    }
    function saveQuick(change) {
      var p = SP.prog();
      if (p) {
        Object.assign(p.settings, change);
        UI.apiQuiet('save_settings', change).then(function (r) { if (r && r.settings && SP.prog()) SP.prog().settings = r.settings; }).catch(function () {});
      } else {
        UI.store.set('guest_settings', Object.assign({}, UI.store.get('guest_settings', {}), change));
      }
      showMenu();
    }
    function startFlat() {
      audio.init(); audio.volumes(settings().music, settings().sfx);
      mode = 'flat'; applyMode();
      startBattle();
    }

    on(panelWrap, 'click', function (e) {
      var t = e.target.closest('[data-int],[data-xr],[data-flat],[data-next],[data-again],[data-resume],[data-restart],[data-quitbattle]');
      if (!t) return;
      if (t.hasAttribute('data-int')) return saveQuick({ intensity: t.getAttribute('data-int') });
      if (t.hasAttribute('data-xr')) return enterXR(t.getAttribute('data-xr'));
      if (t.hasAttribute('data-flat')) return startFlat();
      if (t.hasAttribute('data-next')) return goTerritory(SP.next(tid));
      if (t.hasAttribute('data-again')) { B = null; return showMenu(); }
      if (t.hasAttribute('data-resume')) return resume();
      if (t.hasAttribute('data-restart')) { abort(); return startFlat(); }
      if (t.hasAttribute('data-quitbattle')) { abort(); return UI.go(ctx.me ? 'journey' : 'landing'); }
    });
    on(panelWrap, 'change', function (e) { if (e.target.matches('[data-seated]')) saveQuick({ seated: e.target.checked }); });
    on(cv, 'pointerdown', pointerDown);
    on(window, 'pointerup', pointerUp);
    on(window, 'keydown', keyDown);
    on(window, 'keyup', keyUp);
    on(view, 'pointerdown', padDown);
    on(view, 'pointerup', padUp);
    on(view, 'pointercancel', padUp);
    on(view, 'click', function (e) { if (e.target.closest('[data-pause]')) { if (state === 'paused') resume(); else pause(); } });
    on(document, 'visibilitychange', function () { if (document.hidden && mode === 'flat') pause(); });

    /* ---------------------------------------------------------------- the loop */
    var lastT = performance.now(), hudTick = 0;
    var hudCache = {};
    function setText(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; var el = $(sel); if (el) el.textContent = v; } }
    function setWidth(sel, f) { var v = Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10 + '%'; if (hudCache[sel] !== v) { hudCache[sel] = v; var el = $(sel); if (el) el.style.width = v; } }
    function frame(ts) {
      if (!alive) return;
      var nowMs = performance.now(), dt = Math.min(0.05, (nowMs - lastT) / 1000); lastT = nowMs;
      var tt = nowMs / 1000;
      if (B && !B.useAudio && !B.paused) B.clock += dt * B.tscale;
      if (mode === 'flat') stepFlat(dt); else trackGloves(dt);
      if (B && state === 'battle') stepBattle(dt);
      else if (B && state === 'flurry') stepFlurry(dt);
      else if (state === 'menu' && mode === 'flat') { camera.position.set(Math.sin(tt * 0.1) * 0.6, 1.7, 1.6); camera.lookAt(0, 1.3, -6); }
      if (mode !== 'flat') { waitForHead(); vrOrbs(); }
      world.update(dt, tt);
      stepParts(dt); stepPopups(dt);
      if (B && (state === 'battle' || state === 'flurry')) {
        setText('[data-score]', B.score.toLocaleString());
        setText('[data-combo]', B.combo > 2 ? B.combo + ' combo ×' + B.mult : '');
        setWidth('[data-vigor]', B.vigor / B.maxVigor); setWidth('[data-prog]', B.progress); setWidth('[data-ragebar]', B.rage);
        if (mode !== 'flat' && (hudTick += dt) > 0.15) { hudTick = 0; drawHud(); }
      }
      renderer.render(scene, camera);
    }

    /* ---------------------------------------------------------------- start */
    var ready = Promise.all([SP.load(), SP.three(), SP.fontsReady()]).then(function (res) {
      if (!alive) return;
      T = res[1]; content = res[0].content;
      info = SP.terr(tid);
      if (!info) { UI.toast('There\'s no such territory.', 'error'); return UI.go(ctx.me ? 'journey' : 'landing'); }
      if (!SP.unlocked(tid)) { UI.toast('That territory is still held by the Horde. Free the one before it first.', 'error'); return UI.go('journey'); }
      land = info.land;
      init3D();
      showMenu();
      if (navigator.xr && navigator.xr.isSessionSupported) {
        Promise.all([navigator.xr.isSessionSupported('immersive-vr').catch(function () { return false; }),
                     navigator.xr.isSessionSupported('immersive-ar').catch(function () { return false; })]).then(function (s) {
          xr = { vr: !!s[0], ar: !!s[1] };
          if (alive && state === 'menu' && (xr.vr || xr.ar)) showMenu();
        });
      }
    });
    window.SP_GAME = { state: function () { return state; }, battle: function () { return B; }, mode: function () { return mode; },
      // preview the in-headset cards on a flat screen (tests and design checks)
      vrPreview: function (what) { panelWrap.hidden = true; state = 'preview'; stepFlat(0); if (what === 'story') vrStory('arrive-meadow', function () {}); else vrStartCard(); } };
    return {
      ready: ready,
      destroy: function () {
        alive = false;
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        try { if (session) session.end(); } catch (e) {}
        if (renderer) { renderer.setAnimationLoop(null); renderer.dispose(); }
        audio.close();
        stopMenuMusic();
        clearTimeout(calloutT); clearTimeout(flashT);
      }
    };
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== satchel.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('satchel', { title: 'Satchel', nav: 'Satchel', icon: 'star', auth: 'user', order: 30 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:300px"></div></div>';
    var cat = ctx.args[0] || 'all';
    function draw(d) {
      var c = d.content, p = d.progress, owned = {};
      p.items.forEach(function (id) { owned[id] = true; });
      var cats = c.categories.filter(function (x) { return cat === 'all' || x.key === cat; });
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Your satchel</div><h1>Treasures of Nourra</h1>' +
        '<p class="muted">One treasure for freeing a territory, another for three stars. A full collection unlocks a glove trim.</p></div></div>' +
        '<div class="sc-head"><b style="font-family:var(--font-display);font-size:1.4rem">' + p.items.length + ' / 100</b><div class="ui-meter gold"><i style="width:' + p.items.length + '%"></i></div></div>' +
        (p.keys.length ? '<div class="ui-divider">Quest items</div><div class="sc-keys">' + p.keys.map(function (k) { var it = c.key_items[k]; return '<span class="sp-chip" title="' + esc(it.blurb) + '">' + it.emoji + ' ' + esc(it.name) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="sc-cats" role="tablist"><button data-cat="all" class="' + (cat === 'all' ? 'on' : '') + '">All</button>' + c.categories.map(function (x) {
          var n = c.lands.filter(function (L) { return owned[L.key + '-' + x.key]; }).length;
          return '<button data-cat="' + x.key + '" class="' + (cat === x.key ? 'on' : '') + '">' + x.emoji + ' ' + esc(x.name) + ' <span class="n">' + n + '/10</span></button>';
        }).join('') + '</div>' +
        cats.map(function (x) {
          var n = c.lands.filter(function (L) { return owned[L.key + '-' + x.key]; }).length;
          return '<section class="sc-cat"><div class="sc-cat-head"><span class="ui-seal ' + (n === 10 ? 'gold' : 'green') + '">' + x.emoji + '</span><div style="flex:1;min-width:180px"><h2>' + esc(x.name) + '</h2><span class="muted small">' + esc(x.blurb) + '</span></div>' +
            (n === 10 ? '<span class="ui-badge gold">Complete · ' + esc(x.skin) + ' trim</span>' : '<span class="ui-badge">' + n + ' / 10</span>') + '</div>' +
            '<div class="sc-grid">' + c.lands.map(function (L) {
              var id = L.key + '-' + x.key, it = c.items[id], has = owned[id];
              return '<button class="sc-item ' + (has ? it.rarity : 'missing') + '" data-item="' + id + '"><span class="em" aria-hidden="true">' + it.emoji + '</span>' +
                '<b>' + esc(has ? it.name : '???') + '</b><small>' + esc(L.name.replace('The ', '')) + '</small></button>';
            }).join('') + '</div></section>';
        }).join('') + '</div>';
    }
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (b) { cat = b.getAttribute('data-cat'); try { history.replaceState(null, '', '#satchel' + (cat === 'all' ? '' : '/' + cat)); } catch (x) {} draw(SP.data()); return; }
      var it = e.target.closest('[data-item]');
      if (!it) return;
      var d = SP.data(), id = it.getAttribute('data-item'), item = d.content.items[id], has = d.progress.items.indexOf(id) >= 0, src = SP.terr(item.from);
      var catObj = d.content.categories.filter(function (x) { return x.key === item.cat; })[0];
      UI.modal('<div class="sc-card"><div class="em">' + (has ? item.emoji : '❔') + '</div><h2>' + esc(has ? item.name : 'Not found yet') + '</h2>' +
        '<p><span class="ui-badge ' + (item.rarity === 'legendary' ? 'gold' : item.rarity === 'rare' ? 'brand' : '') + '">' + esc(item.rarity) + '</span> <span class="ui-badge">' + esc(catObj.name) + '</span>' + (has ? ' <span class="ui-badge">' + esc(item.type) + '</span>' : '') + '</p>' +
        (has ? '<p style="font-size:1.1rem"><i>' + esc(item.flavour) + '</i></p>' : '') +
        '<p class="muted">' + (item.stars === 3 ? 'Earn three stars at ' : 'Free ') + '<b>' + esc(src.t.name) + '</b> in ' + esc(src.land.name) + (item.stars === 3 ? '.' : ' to find it.') + '</p>' +
        (SP.unlocked(item.from) && !has ? '<a class="ui-btn primary" href="#play/' + item.from + '" data-go="play/' + item.from + '" data-close>⚔ Go there</a>' : '') + '</div>');
    });
    return SP.load(true).then(draw);
  });
})();

/* ===== village.html ===== */
(function () {
  var esc = UI.esc;
  function level(levels, n) {
    var cur = levels[0], nxt = null;
    levels.forEach(function (l, i) { if (n >= l[0]) { cur = l; nxt = levels[i + 1] || null; } });
    return { cur: cur, next: nxt };
  }
  function upCard(u, p) {
    var lv = p.upgrades[u.key] || 0, max = u.costs.length, cost = u.costs[lv];
    var name = u.tiers ? u.tiers[lv] + (lv < max ? ' → ' + u.tiers[lv + 1] : '') : u.name;
    return '<div class="vl-up"><span class="em" aria-hidden="true">' + u.emoji + '</span><div><h3>' + esc(name) + '</h3><p>' + esc(u.blurb) + '</p>' +
      '<div class="vl-pips" aria-label="Level ' + lv + ' of ' + max + '">' + u.costs.map(function (c, i) { return '<i class="' + (i < lv ? 'on' : '') + '"></i>'; }).join('') + '</div></div>' +
      (lv >= max ? '<span class="ui-badge good">Maxed</span>' :
        '<button class="ui-btn ' + (p.sprouts >= cost ? 'primary' : '') + ' sm" data-buy="' + u.key + '"' + (p.sprouts >= cost ? '' : ' disabled') + '>🌱 ' + cost + '</button>') + '</div>';
  }
  UI.page('village', { title: 'Hearthstead', nav: 'Village', icon: 'home', auth: 'user', order: 20 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:210px"></div></div>';
    function draw(d) {
      var c = d.content, p = d.progress, n = p.villagers.length, L = level(c.village_levels, n);
      var houses = Math.min(14, 1 + Math.floor(n / 3)), people = p.villagers.slice(-16).map(function (v) { return c.villagers[v].emoji; });
      var market = c.upgrades.filter(function (u) { return u.shop === 'market'; }), forge = c.upgrades.filter(function (u) { return u.shop === 'forge'; });
      var held = {};
      c.lands.forEach(function (Ld) { Ld.territories.forEach(function (t) { if (t.villager) held[t.villager] = { t: t, land: Ld }; }); });
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ui-page-head"><div><div class="eyebrow">Your village</div><h1>Hearthstead</h1><p class="muted">Everyone you free comes to live here.</p></div>' + SP.sprouts(p.sprouts) + '</div>' +
        '<div class="vl-scene" aria-hidden="true"><span class="sun">' + (n >= 38 ? '🌈' : '☀️') + '</span><div class="hill h1"></div><div class="hill h2"></div>' +
        '<div class="row">' + (n === 0 ? '<span>🔥</span>' : '') + Array.apply(null, Array(n === 0 ? 0 : houses)).map(function (x, i) { return '<span>' + (i === 0 && n >= 10 ? '🏰' : i % 4 === 3 ? '🌳' : n >= 18 ? '🏡' : n >= 4 ? '🏠' : '⛺') + '</span>'; }).join('') + '</div>' +
        '<div class="row people">' + people.map(function (e) { return '<span>' + e + '</span>'; }).join('') + '</div></div>' +
        '<div class="vl-level"><div><b style="font-family:var(--font-display)">' + esc(L.cur[1]) + '</b><div class="muted small">' + n + ' of 41 villagers home</div></div>' +
        '<div class="ui-meter gold"><i style="width:' + Math.round(n / 41 * 100) + '%"></i></div>' +
        (L.next ? '<span class="small muted">' + (L.next[0] - n) + ' more to become ' + esc(L.next[1].toLowerCase()) + '</span>' : '<span class="ui-badge gold">Complete!</span>') + '</div>' +
        '<div class="vl-shops">' +
        '<section class="ui-card vl-shop"><h2><span>🥒</span>Pickles\' Market</h2><p class="muted">"Everything\'s fresh. Mostly. Don\'t ask about the jar."</p><div class="vl-ups">' + market.map(function (u) { return upCard(u, p); }).join('') + '</div></section>' +
        '<section class="ui-card vl-shop"><h2><span>⚒️</span>Granny\'s Forge</h2>' +
        (p.forge ? '<p class="muted">"Bring me sprouts, I\'ll bring you fists of legend."</p><div class="vl-ups">' + forge.map(function (u) { return upCard(u, p); }).join('') + '</div>'
          : '<div class="vl-cold"><div class="em">🧊</div><h3>The forge is cold</h3><p>Free Granny Marrow from the Behemoth\'s Freezer in Frostfjord, and she\'ll forge you gauntlets, guards and charms.</p></div>') + '</section></div>' +
        '<section class="ui-card" style="margin-top:16px"><h2>🥊 Glove trims</h2><p class="muted">Finish a whole collection in your Satchel to unlock its trim. Your gloves stay green (left) and red (right) so you can read the targets.</p>' +
        '<div class="vl-skins">' + c.skins.map(function (s) {
          var has = p.skins.indexOf(s.key) >= 0;
          return '<button class="vl-skin' + (p.settings.skin === s.key ? ' on' : '') + '" data-skin="' + s.key + '"' + (has ? '' : ' disabled title="Finish this collection to unlock"') + '><i style="background:' + s.color + '"></i>' + esc(s.name) + (has ? '' : ' 🔒') + '</button>';
        }).join('') + '</div></section>' +
        '<div class="ui-divider">The villagers</div><div class="vl-people">' + Object.keys(c.villagers).map(function (k) {
          var v = c.villagers[k], h = held[k];
          if (p.villagers.indexOf(k) >= 0) return '<div class="vl-person"><span class="sp-portrait" aria-hidden="true">' + v.emoji + '</span><div><div class="role">' + esc(v.role) + '</div><h3>' + esc(v.name) + '</h3><p>“' + esc(v.quip) + '”</p></div></div>';
          return '<div class="vl-person held"><span class="sp-portrait" aria-hidden="true">❔</span><div><div class="role">Still captive</div><h3>Someone in ' + esc(h.land.name) + '</h3><p>Held at ' + esc(h.t.name) + '.</p></div></div>';
        }).join('') + '</div></div>';
    }
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-buy]');
      if (b) {
        UI.busy(b, UI.api('buy_upgrade', b.getAttribute('data-buy'))).then(function (r) {
          SP.setProgress(r.progress); draw(SP.data());
          UI.toast('Upgraded! Level ' + r.level + '.', 'ok');
        });
        return;
      }
      var s = e.target.closest('[data-skin]');
      if (s && !s.disabled) {
        UI.api('save_settings', { skin: s.getAttribute('data-skin') }).then(function (r) { SP.prog().settings = r.settings; draw(SP.data()); UI.toast('New trim on your gloves.', 'ok'); });
      }
    });
    return SP.load(true).then(draw);
  });
})();

/* ===== workout.html ===== */
(function () {
  var esc = UI.esc;
  var DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var LOVE = { legs: 'Your legs could use some love', core: 'Your core is under-worked', chest: 'Your chest could use more hooks',
    back: 'Your back wants some hammer fists', arms: 'Your arms want more uppercuts', shoulders: 'Your shoulders want more jabs' };
  UI.page('workout', { title: 'Workout', nav: 'Workout', icon: 'heart', auth: 'user', order: 40 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:120px"></div><div class="ui-skel" style="height:260px;margin-top:16px"></div></div>';
    function draw(d, w) {
      var c = d.content, p = d.progress, s = p.settings;
      var maxMin = Math.max.apply(null, w.days.map(function (x) { return x.minutes; }).concat([1]));
      var top = w.days.reduce(function (a, x) { return x.minutes > a.minutes ? x : a; }, w.days[0]);
      var mus = c.muscles.map(function (m) { return [m[0], m[1], w.muscles[m[0]] || 0]; }).sort(function (a, b) { return b[2] - a[2]; });
      var tipLand = w.tip && SP.land(w.tip.land);
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ui-page-head"><div><div class="eyebrow">The fitness ledger</div><h1>Your workout</h1><p class="muted">Every battle is exercise. Here\'s what you\'ve put in.</p></div>' +
        (w.streak ? '<span class="sp-chip" style="font-size:1rem">🔥 ' + UI.plural(w.streak, 'day') + ' in a row</span>' : '') + '</div>' +
        '<div class="wk-tiles">' + [[w.totals.minutes, 'minutes'], [Math.round(w.totals.kcal), 'kcal (est.)'], [w.totals.battles, 'battles'], [w.totals.punches.toLocaleString(), 'punches'], [w.totals.stars, 'stars earned']].map(function (t) {
          return '<div class="ui-card wk-tile"><b>' + t[0] + '</b><span>' + t[1] + '</span></div>';
        }).join('') + '</div>' +
        '<div class="wk-two"><section class="ui-card"><h3>Minutes per day</h3><p class="muted small" style="margin:0">The last 14 days.</p>' +
        '<div class="wk-chart" role="img" aria-label="Minutes played per day over the last 14 days">' + w.days.map(function (x) {
          var h = Math.round(x.minutes / maxMin * 100), dd = new Date(x.day + 'T12:00:00');
          return '<div class="wk-col' + (x.minutes ? '' : ' zero') + '" tabindex="0"><i style="height:' + h + '%"></i>' +
            (x === top && x.minutes ? '<span class="val" style="bottom:calc(' + h + '% + 4px)">' + Math.round(x.minutes) + '</span>' : '') +
            '<span class="tip">' + esc(UI.fmtDate(x.day, { weekday: 'short', day: 'numeric', month: 'short' })) + ': ' + x.minutes + ' min · ' + Math.round(x.kcal) + ' kcal · ' + UI.plural(x.battles, 'battle') + '</span></div>';
        }).join('') + '</div><div class="wk-days">' + w.days.map(function (x) { return '<span>' + DOW[new Date(x.day + 'T12:00:00').getDay()] + '</span>'; }).join('') + '</div>' +
        '<table class="ui-sr" style="position:absolute;left:-9999px"><caption>Minutes per day</caption>' + w.days.map(function (x) { return '<tr><td>' + x.day + '</td><td>' + x.minutes + '</td></tr>'; }).join('') + '</table></section>' +
        '<section class="ui-card"><h3>Muscle balance</h3><p class="muted small" style="margin:0">Share of the work each muscle group has done, from every move you\'ve made.</p>' +
        '<div class="wk-mus">' + mus.map(function (m) {
          return '<div title="' + esc(m[1]) + ': ' + Math.round(m[2] * 100) + '%"><span>' + esc(m[1]) + '</span><div class="ui-meter"><i style="width:' + Math.round(m[2] * 100) + '%"></i></div><span class="pct">' + Math.round(m[2] * 100) + '%</span></div>';
        }).join('') + '</div>' +
        (w.tip && w.totals.battles ? '<div class="ui-note wk-tipbox">💡 <b>' + esc(LOVE[w.tip.muscle]) + '.</b> ' + esc(tipLand.name) + ' (' + tipLand.emoji + ') leans on ' + esc(tipLand.emphasis.map(function (m) { return c.moves[m].name.toLowerCase(); }).join(' and ') || 'everything') + '.</div>' : '') +
        '</section></div>' +
        '<div class="wk-two"><section class="ui-card"><h3>Moves so far</h3><div class="wk-moves">' + (Object.keys(w.moves).length ? Object.keys(c.moves).filter(function (m) { return w.moves[m]; }).map(function (m) {
          return '<span class="sp-chip" title="' + esc(c.moves[m].how) + '">' + c.moves[m].icon + ' ' + esc(c.moves[m].name) + ' ×' + w.moves[m].toLocaleString() + '</span>';
        }).join('') : '<span class="muted">Nothing yet: go and punch something!</span>') + '</div>' +
        '<h3 style="margin-top:22px">Recent battles</h3><div class="wk-recent">' + (w.recent.length ? w.recent.map(function (r) {
          var t = SP.terr(r.territory);
          return '<div class="row"><div><b>' + esc(t ? t.t.name : r.territory) + '</b><span>' + esc(UI.ago(r.when)) + ' · ' + Math.round(r.seconds / 6) / 10 + ' min · ' + Math.round(r.kcal) + ' kcal · ' + Math.round(r.accuracy * 100) + '% · ' + esc(r.intensity) + '</span></div>' + SP.stars(r.stars) + '</div>';
        }).join('') : '<div class="ui-empty" style="padding:24px">No battles yet. Start with the Training Yard.</div>') + '</div></section>' +
        '<section class="ui-card"><h3>Battle settings</h3><form class="wk-set" data-settings>' +
        '<div><span class="small muted" style="font-weight:700">Intensity</span><div class="ui-choices" style="margin-top:6px">' + ['gentle', 'steady', 'beast'].map(function (k) {
          var it = c.intensity[k];
          return '<label class="ui-choice"><input type="radio" name="intensity" value="' + k + '"' + (s.intensity === k ? ' checked' : '') + '><span>' + (k === 'gentle' ? '🌿' : k === 'steady' ? '🔥' : '🐗') + ' ' + esc(it.name) + '</span></label>';
        }).join('') + '</div><p class="ui-hint">Gentle: slower snacks, softer punches count. Beast: fast, dense, punch hard.</p></div>' +
        '<label class="ui-check"><input type="checkbox" name="seated"' + (s.seated ? ' checked' : '') + '> <span><b>Seated mode</b><br><span class="small muted">No ducks or lunges. Great for a chair or a sore knee.</span></span></label>' +
        '<label class="ui-check"><input type="checkbox" name="nofail"' + (s.nofail ? ' checked' : '') + '> <span><b>No-fail</b><br><span class="small muted">Vigor never runs out. You still need half the hits to free a territory.</span></span></label>' +
        '<label class="ui-field"><span>Body weight <em>(optional, kg: only for the calorie estimate)</em></span><input type="number" name="weight" min="30" max="250" step="0.5" value="' + (s.weight || '') + '" placeholder="70"></label>' +
        '<div class="wk-range"><span>🎵 Music</span><input type="range" name="music" min="0" max="1" step="0.05" value="' + s.music + '"><span>' + Math.round(s.music * 100) + '</span></div>' +
        '<div class="wk-range"><span>💥 Effects</span><input type="range" name="sfx" min="0" max="1" step="0.05" value="' + s.sfx + '"><span>' + Math.round(s.sfx * 100) + '</span></div>' +
        '<button class="ui-btn primary" type="submit">Save settings</button></form>' +
        '<div class="ui-divider">Start over</div><p class="muted small">Begin a brand-new journey from Meadowmere. Your workout log and settings stay; your progress, treasures and sprouts start again.</p>' +
        '<button class="ui-btn danger sm" data-reset>Start a new journey…</button></section></div></div>';
    }
    function load() { return Promise.all([SP.load(true), UI.api('workout_stats')]).then(function (r) { draw(r[0], r[1]); }); }
    view.addEventListener('input', function (e) { if (e.target.type === 'range') e.target.nextElementSibling.textContent = Math.round(e.target.value * 100); });
    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-settings]')) return;
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('save_settings', { intensity: v.intensity, seated: v.seated, nofail: v.nofail, weight: v.weight, music: v.music, sfx: v.sfx }))
        .then(function (r) { SP.prog().settings = r.settings; UI.toast('Settings saved', 'ok'); });
    });
    view.addEventListener('click', function (e) {
      if (!e.target.closest('[data-reset]')) return;
      var m = UI.modal('<h2>Start a new journey?</h2><p class="muted">Your territories, treasures, villagers, upgrades and sprouts go back to zero. Your workout log stays. This can\'t be undone.</p>' +
        '<form class="ui-stack" data-confirm><label class="ui-field"><span>Type <b>NEW JOURNEY</b> to confirm</span><input type="text" name="c" autocomplete="off"></label>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn danger solid" type="submit">Start over</button></div></form>');
      m.el.querySelector('[data-confirm]').addEventListener('submit', function (ev) {
        ev.preventDefault();
        UI.busy(ev.target.querySelector('[type=submit]'), UI.api('reset_progress', UI.formData(ev.target).c.trim().toUpperCase())).then(function () {
          m.close(); SP.forget(); UI.toast('A new journey begins in Meadowmere.', 'ok'); UI.go('journey');
        });
      });
    });
    return load();
  });
})();
