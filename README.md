# Snackpuncher

A single-player VR punching quest: the Greasy Horde (cartoon fast food with googly eyes) has overrun the realm of Nourra,
and you punch your way across ten lands, free 41 villagers, collect 100 treasures and restore the Everpot. It plays in
a VR headset through WebXR (Meta Quest Browser and other WebXR browsers), with an optional passthrough mode, and also on
an ordinary screen with mouse, touch or keyboard. Every battle is a workout: the moves rotate between muscle groups and a
workout ledger keeps score. Built on [Anvil](https://anvil.works) and three.js.

- **App repo:** github.com/arkulinskis/snackpuncher (branch `master`). Anvil pulls `master`.
- **Live:** not published yet.

## What it does

**For everyone (no account needed):**
- **Landing page:** the promise, a storybook hero picture, realm-wide counters (heroes, snacks punched, villagers freed,
  calories), how it works, the ten lands, every move and the muscles it works, the companions, features, FAQ.
- **The Training Yard** (`#play/training`): a scripted lesson teaching every move one at a time, playable as a guest
  (nothing is saved; the results invite you to sign up).
- Sign-up / sign-in, feedback form, Privacy & Terms.

**For players:**
- **Journey** (`#journey`, home): the current quest objective, a quip from Pickles or Sir Broccolot, quest items, a
  parchment map of the ten lands (locked lands are clouded), the chosen land's five territories (stars, villager to
  rescue, the two treasures, best score, Fight / Go for ★★★ / locked), the daily bounty, the Chronicle (every story scene seen).
- **Battles** (`#play/<land>-<1..5>`): pre-battle panel (arrival scene for a land's first territory, moves in this
  battle, intensity, seated mode) then **Enter VR**, **VR with passthrough** (when the headset supports it) or
  **Play on this screen**. Snacks march down a path to the land's own procedural music; you punch (jab, hook,
  uppercut, hammer fist, lunge punch), duck breadstick logs, lean away from soda splashes and block sauce balls.
  Green ring = left fist, red = right, gold = either; arrows show hooks, uppercuts and hammer fists. Combos, multiplier,
  vigor, Spice Rage. Territories 1-4 end with a cage flurry that frees a villager; territory 5 is the land's boss
  (with a health bar). Results: stars, score, accuracy, best combo, estimated kcal, rewards, story scene, muscles worked,
  next / again / map. In VR the whole loop (start card, story, results, next territory) happens on punchable cards.
- **Village** (`#village`): Hearthstead grows with every rescue (a little diorama and village level); Pickles' Market
  (Hearty Stew, Sprout Pouch, Bounce Boots) and Granny Marrow's Forge (Gauntlets x5 tiers, Pot-Lid Guard, Combo Charm,
  Spice Rage), which opens once Granny is freed in Frostfjord; glove trims; every villager's card.
- **Satchel** (`#satchel`): 10 collections x 10 treasures (one per land), quest items, a card per treasure; a finished
  collection unlocks a glove trim.
- **Workout** (`#workout`): totals, streak, minutes per day (14 days), muscle balance with a tip for the least-worked
  muscle, move counts, recent battles, battle settings (intensity, seated, no-fail, optional body weight, volumes),
  start a new journey.

**The story:** Pickles (a pickle who escaped a burger) and Sir Broccolot (a four-inch knight) guide you. You find the
broken Ladle of Plenty (Meadowmere) and the Everburning Coal (Ember Hollow), free Granny Marrow the smith (Frostfjord),
gather Tidal Sea Salt, Storm Honey and Cheddar Iron so she can mend it, find Olive the Bard's fiddle (Sugarspire), free
Olive (Grease Bog), fetch a Moonlemon to restore her voice (Gloomfry), wake the Ladle with her song and beat the
Deep-Fried King (the Drive-Thru Citadel).

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview:** people, players, battles, kcal, new feedback.
- **Players:** everyone's journey at a glance (land reached, stars, treasures, villagers, battles, last played).
- **Feedback inbox**, **Users** (make admin, disable), **Demo data** (five demo heroes at different stages, which feed
  the realm counters; remove or reload).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/snackpuncher`.
2. **Users** service: email + password, sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain). VR needs HTTPS, which Anvil provides.

## Working on it

See `.claude/skills/snackpuncher/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#journey, ?as=admin#admin)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            the interface: core.js/core.css (shared engine + design tokens), app.js (header, footer), pages/*.html
                pages/_sp.html = the game kit (data, battle patterns, 3D snacks, lands, music); pages/play.html = the battle + VR
client_code/    Main.py (the only Anvil form: bridge to the server, sign-in), legal.py
server_code/    content.py (the whole world: lands, items, story, upgrades), Game.py (progress + rewards), common.py,
                Accounts.py, Feedback.py, Admin.py, DemoData.py, legal_server.py
assets/         icon.svg + generated PNG icons, three.min.js (r158, served at _/theme/three.min.js)
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, preview/ (dev server, UI tests, screenshots), testing/
```
