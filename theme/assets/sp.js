/* sp.js: window.SP, the shared game kit (data cache + lookups, battle charts, lazy three.js, the 3D snacks,
   the lands, procedural music). Moved unchanged from the JavaScript version's web/pages/_sp.html. */
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
  /* Python pages load the game themselves (client_code/sp.py) and hand it over, so the battle starts without a second call. */
  SP.prime = function (d) { cacheFor = UI.me ? UI.me.id : 'guest'; cache = d; pending = null; index(d.content); };
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
