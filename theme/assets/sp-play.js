/* sp-play.js: the battle screen (#play/...): three.js + WebXR + flat-screen controls + results + in-VR cards.
   Moved unchanged from web/pages/play.html; Components/Battle mounts it through UI.mountScreen('play', ...). */
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
        '<div class="pl-res-head"><h2>' + esc(resultTitle(r)) + '</h2><p class="pl-land">' + esc(info.training ? 'The Training Yard' : land.emoji + ' ' + land.name) + '</p>' +
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
        '<h2>' + esc(info.t.name) + '</h2>' +
        '<p class="pl-land">' + esc(info.training ? 'Lesson zero' : land.emoji + ' ' + land.name + ' · ' + land.element) + '</p>' +
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
