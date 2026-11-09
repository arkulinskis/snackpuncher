/* Smoke test (python -I tools/ui_test.py --only smoke.js): every page address opens without a JS/Python error and
   without an empty page, signed out, then as a new member, then as the admin (the ADMIN_EMAILS address, which becomes
   admin in the local database). Also starts a flat-screen Training Yard battle and lets the test robot win it.
   Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 30000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  const seenErrors = () => $$('.anvil-error, .error-popup, #error-indicator:not([style*="none"])').filter((e) => e.offsetParent);
  async function visit(hash, minText) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    try {
      await until(() => window.UI_READY && location.hash === hash, hash, 40000);
    } catch (e) { bad.push(hash + ': never ready (now ' + location.hash + ')'); log.push('FAIL ' + hash); return; }
    await sleep(700);
    const main = $('.ui-main') || $('.sp-play-page') || document.body;
    const text = (main.innerText || '').trim().length;
    const errs = errors.splice(0).concat(seenErrors().map((e) => e.textContent.slice(0, 120)));
    if (errs.length) bad.push(hash + ': ' + errs.join(' / '));
    if (text < (minText || 80)) bad.push(hash + ': almost empty (' + text + ' characters)');
    log.push((errs.length || text < (minText || 80) ? 'FAIL ' : 'ok   ') + hash + ' (' + text + ' chars)');
  }
  async function signOut() {
    $('.anvil-role-avatar button').click();
    await sleep(300);
    $$('.ui-menu button').find((b) => /Sign out/.test(b.textContent)).click();
    await until(() => !$('.ui-shell.signed-in') && window.UI_READY, 'signed out');
    await sleep(800);
  }
  const fields = () => $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]').filter((i) => i.offsetParent);
  try {
    // ---- signed out
    for (const h of ['#landing', '#auth', '#auth/signup']) await visit(h);
    await visit('#play/training', 20);
    // a flat-screen Training Yard battle, won by the test robot
    window.SP_TEST = { autoplay: true, speed: 10 };
    await until(() => $('[data-flat]'), 'the battle menu');
    $('[data-flat]').click();
    await until(() => window.SP_GAME && /result/.test(String(window.SP_GAME.state())), 'the battle to finish', 120000);
    log.push('ok   training battle finished as a guest (' + window.SP_GAME.state() + ')');
    window.SP_TEST = null;
    await visit('#journey');  // a member page: goes to sign in
    if (!/^#auth/.test(location.hash) && !$('.au-card')) bad.push('#journey opened while signed out');

    // ---- a new member
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && fields().length >= 3, 'sign-up form');
    const f = fields();
    type(f[0], 'Smoke Tester'); type(f[1], 'smoke' + Date.now() + '@example.com'); type(f[2], 'Hb-' + Math.random().toString(36).slice(2) + '-Kq7');
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    $$('.anvil-role-btn-block button').find((b) => /Create account/.test(b.textContent)).click();
    await until(() => window.UI_READY && $('.ui-shell.signed-in'), 'signed in', 40000);
    for (const h of ['#journey', '#journey/ember', '#village', '#satchel', '#satchel/herbs', '#workout', '#profile', '#landing']) await visit(h);
    // a treasure card and the territory map
    location.hash = '#satchel'; await until(() => window.UI_READY && $('.sc-item'), 'treasures');
    $('.sc-item').click(); await until(() => $('.sc-card'), 'treasure card');
    log.push('ok   treasure card opens');
    $$('.sc-card button').find((b) => /Close/.test(b.textContent)).click(); await sleep(600);
    await visit('#play/meadow-1', 20);
    await visit('#admin');  // not an admin: sent home
    if (location.hash === '#admin' && $('.ad-stats')) bad.push('#admin opened for a member');
    await signOut();

    // ---- the admin
    location.hash = '#auth'; await until(() => window.UI_READY && fields().length >= 2, 'sign-in form');
    const pw = 'Hb-local-admin-Kq7-2026';
    type(fields()[0], 'arkulinskis@gmail.com'); type(fields()[1], pw);
    $$('.anvil-role-btn-block button').find((b) => /Sign in/.test(b.textContent)).click();
    await sleep(3500);
    if (!$('.ui-shell.signed-in')) {
      $$('.ui-seg button, .anvil-role-seg button').find((b) => /Create account/.test(b.textContent)).click();
      await sleep(600);
      const i = fields(); type(i[0], 'Local Admin'); type(i[1], 'arkulinskis@gmail.com'); type(i[2], pw);
      const t2 = $('.au-card input[type=checkbox]'); if (t2 && !t2.checked) t2.click();
      $$('.anvil-role-btn-block button').find((b) => /Create account/.test(b.textContent)).click();
    }
    await until(() => window.UI_READY && $('.ui-shell.signed-in'), 'signed in as admin', 40000);
    for (const h of ['#admin/overview', '#admin/players', '#admin/feedback', '#admin/users', '#admin/demo', '#journey']) await visit(h);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log };
  }
})();
