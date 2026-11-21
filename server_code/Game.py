"""The game: the world + your progress, finishing a battle (rewards are worked out here, not in the browser),
the market and forge, settings, the workout log and the realm-wide counters on the landing page.

A player's progress is one JSON document in `saves.data` (see new_save). Every battle also adds a row to
`battles` (the workout log). Guests can play the Training Yard; nothing is stored for them.
"""
import datetime as dt
import hashlib

import anvil.server
from anvil.tables import app_tables

from . import common as C
from . import content as W
from . import DemoData

DEFAULT_SETTINGS = {"intensity": "steady", "seated": False, "nofail": False, "weight": None, "music": 0.7, "sfx": 0.9,
                    "skin": "classic", "passthrough": False}
MAX_SPROUTS = 10 ** 7
MIN_ACCURACY = 0.5   # below this a territory is not freed, even in no-fail mode


def new_save():
    return {"v": 1, "terr": {}, "items": [], "villagers": [], "keys": [], "scenes": [], "sprouts": 0, "upgrades": {},
            "skins": ["classic"], "settings": dict(DEFAULT_SETTINGS), "story": 0, "bounty_day": None, "training": 0,
            "totals": {"battles": 0, "punches": 0, "kcal": 0.0, "seconds": 0}}


def _row(user, create=True):
    r = app_tables.saves.get(user=user)
    if r is None and create:
        r = app_tables.saves.add_row(user=user, data=new_save(), updated=C.now(), is_demo=bool(user["is_demo"]))
    return r


def _load(user):
    data = dict(new_save(), **(_row(user)["data"] or {}))
    data["settings"] = dict(DEFAULT_SETTINGS, **(data.get("settings") or {}))
    return data


def _store(user, save):
    r = _row(user)
    r.update(data=save, updated=C.now())


# ------------------------------------------------------------------------------------------- rules
def stars_of(save, tid):
    return int((save["terr"].get(tid) or {}).get("stars") or 0)


def is_unlocked(save, tid):
    if tid == W.TRAINING:
        return True
    sp = W.split_tid(tid)
    if sp is None:
        return False
    li, n = sp
    if li > 0 and stars_of(save, W.LAND_KEYS[li - 1] + "-5") < 1:
        return False
    if n > 1 and stars_of(save, "%s-%d" % (W.LAND_KEYS[li], n - 1)) < 1:
        return False
    return True


def current_tid(save):
    """The next territory on the journey (the first unlocked one not yet cleared), or None when all are cleared."""
    for tid in W.territory_ids():
        if is_unlocked(save, tid) and stars_of(save, tid) < 1:
            return tid
    return None


def forge_open(save):
    return "frost-5" in save["villagers"]


def bounty_for(save, user_id, day):
    """Today's bounty: one territory you've already cleared (not a boss) pays double sprouts once."""
    cleared = [t for t in W.territory_ids() if stars_of(save, t) >= 1 and not t.endswith("-5")]
    if not cleared:
        return None
    h = int(hashlib.sha1(("%s|%s" % (user_id, day)).encode()).hexdigest(), 16)
    return cleared[h % len(cleared)]


def public_progress(save, user_id=""):
    day = C.now().date().isoformat()
    bounty = bounty_for(save, user_id, day)
    return {
        "terr": save["terr"], "items": save["items"], "villagers": save["villagers"], "keys": save["keys"],
        "scenes": save["scenes"], "sprouts": save["sprouts"], "upgrades": save["upgrades"], "skins": save["skins"],
        "settings": save["settings"], "story": save["story"], "totals": save["totals"], "training": save.get("training", 0),
        "unlocked": [t for t in W.territory_ids() if is_unlocked(save, t)], "current": current_tid(save),
        "forge": forge_open(save), "objective": W.OBJECTIVES[min(save["story"], len(W.OBJECTIVES) - 1)],
        "bounty": bounty, "bounty_claimed": save.get("bounty_day") == day,
        "stars_total": sum(stars_of(save, t) for t in W.territory_ids()),
    }


def clean_stats(stats):
    s = stats if isinstance(stats, dict) else {}

    def num(k, lo, hi, cast=int):
        try:
            v = cast(s.get(k) or 0)
        except (TypeError, ValueError):
            v = 0
        return max(lo, min(hi, v))
    total = num("total", 0, 2000)
    hits = num("hits", 0, total)
    weak = num("weak", 0, total - hits)
    moves = {}
    for k, v in (s.get("moves") or {}).items() if isinstance(s.get("moves"), dict) else []:
        if k in W.MOVES:
            try:
                moves[k] = max(0, min(2000, int(v)))
            except (TypeError, ValueError):
                pass
    intensity = s.get("intensity") if s.get("intensity") in W.INTENSITY else "steady"
    return {"follow": bool(s.get("follow")), "total": total, "hits": hits, "weak": weak, "misses": total - hits - weak, "max_combo": num("max_combo", 0, total),
            "score": num("score", 0, 10 ** 7), "seconds": num("seconds", 5, 1500), "flurry": num("flurry", 0, 400),
            "moves": moves, "failed": bool(s.get("failed")), "boss_down": bool(s.get("boss_down")), "intensity": intensity}


def grade(st, is_boss):
    acc = (st["hits"] + 0.5 * st["weak"]) / max(1, st["total"])
    cleared = not st["failed"] and (st["boss_down"] or not is_boss) and st["total"] > 0 and acc >= MIN_ACCURACY
    stars = 0 if not cleared else 1 + (acc >= 0.75) + (acc >= 0.9)
    return round(acc, 4), cleared, int(stars)


def kcal_of(st, weight):
    try:
        kg = float(weight) if weight else 70.0
    except (TypeError, ValueError):
        kg = 70.0
    kg = max(30.0, min(250.0, kg))
    met = W.INTENSITY[st["intensity"]]["met"]
    return round(met * kg * st["seconds"] / 3600.0, 1)


def apply_result(save, tid, st, user_id="", day=None):
    """Update `save` with a finished battle. Returns (rewards, grade info). Pure: no table access."""
    day = day or C.now().date().isoformat()
    is_boss = tid.endswith("-5")
    acc, cleared, stars = grade(st, is_boss)
    kcal = kcal_of(st, save["settings"].get("weight"))
    punches = sum(v for k, v in st["moves"].items() if k not in ("duck", "lean", "block")) + st["flurry"]
    tot = save["totals"]
    tot.update(battles=tot["battles"] + 1, punches=tot["punches"] + punches, kcal=round(tot["kcal"] + kcal, 1),
               seconds=tot["seconds"] + st["seconds"])
    rewards = []
    pouch = 1 + 0.15 * int(save["upgrades"].get("pouch", 0))

    if tid == W.TRAINING:
        first = save.get("training", 0) == 0 and cleared
        sprouts = int((30 if first else 6) * pouch) if cleared else 3
        save["training"] = save.get("training", 0) + (1 if cleared else 0)
        save["sprouts"] = min(MAX_SPROUTS, save["sprouts"] + sprouts)
        rewards.append({"kind": "sprouts", "n": sprouts})
        return rewards, {"acc": acc, "cleared": cleared, "stars": stars, "kcal": kcal, "punches": punches, "first": first}

    li, n = W.split_tid(tid)
    prev = dict(save["terr"].get(tid) or {})
    first_clear = cleared and int(prev.get("stars") or 0) < 1
    entry = {"stars": max(int(prev.get("stars") or 0), stars), "best": max(int(prev.get("best") or 0), st["score"]),
             "acc": max(float(prev.get("acc") or 0), acc), "plays": int(prev.get("plays") or 0) + 1,
             "cleared_at": prev.get("cleared_at") or (C.iso(C.now()) if cleared else None)}
    save["terr"] = dict(save["terr"], **{tid: entry})

    if cleared:
        sprouts = 20 + 6 * li + 8 * stars + min(st["flurry"], 40)
        if is_boss:
            sprouts *= 2
        if not first_clear:
            sprouts //= 2
        bounty = bounty_for(save, user_id, day)
        if bounty == tid and save.get("bounty_day") != day and not first_clear:
            sprouts *= 2
            save["bounty_day"] = day
            rewards.append({"kind": "bounty"})
    else:
        sprouts = 5
    sprouts = int(sprouts * pouch)
    save["sprouts"] = min(MAX_SPROUTS, save["sprouts"] + sprouts)
    rewards.insert(0, {"kind": "sprouts", "n": sprouts})

    a, b = W.items_for(tid)
    if cleared and a not in save["items"]:
        save["items"] = save["items"] + [a]
        rewards.append({"kind": "item", "id": a})
    if stars >= 3 and b not in save["items"]:
        save["items"] = save["items"] + [b]
        rewards.append({"kind": "item", "id": b})
    if first_clear and tid in W.VILLAGERS and tid not in save["villagers"]:
        save["villagers"] = save["villagers"] + [tid]
        rewards.append({"kind": "villager", "id": tid})
    if first_clear and is_boss:
        save["story"] = max(save["story"], li + 1)
        for k in W.BOSS_KEY_ITEMS[li]:
            if k not in save["keys"]:
                save["keys"] = save["keys"] + [k]
                rewards.append({"kind": "key", "id": k})
        rewards.append({"kind": "scene", "id": "boss-" + W.LAND_KEYS[li]})
        if li + 1 < len(W.LANDS):
            rewards.append({"kind": "land", "id": W.LAND_KEYS[li + 1]})
        else:
            rewards.append({"kind": "victory"})
        if tid == "frost-5":
            rewards.append({"kind": "forge"})
    for c in W.CAT_KEYS:  # a finished category unlocks a glove skin
        if c not in save["skins"] and all(("%s-%s" % (L, c)) in save["items"] for L in W.LAND_KEYS):
            save["skins"] = save["skins"] + [c]
            rewards.append({"kind": "skin", "id": c})
    return rewards, {"acc": acc, "cleared": cleared, "stars": stars, "kcal": kcal, "punches": punches,
                     "first": first_clear, "best": st["score"] > int(prev.get("best") or 0) and int(prev.get("plays") or 0) > 0}


# ------------------------------------------------------------------------------------------- callables
@anvil.server.callable
def get_game():
    """The whole world, plus your progress when signed in (None for guests)."""
    DemoData.ensure_loaded()
    user = C.me()
    out = {"content": W.public(), "progress": None}
    if user is not None:
        out["progress"] = public_progress(_load(user), user.get_id())
    return out


@anvil.server.callable
def finish_battle(tid, stats):
    """Record a finished battle and hand out rewards. Guests may finish the Training Yard (nothing is stored)."""
    if not isinstance(tid, str) or (tid != W.TRAINING and W.split_tid(tid) is None):
        return C.fail("That territory doesn't exist.")
    user = C.me()
    st = clean_stats(stats)
    if user is None:
        if tid != W.TRAINING:
            raise anvil.server.PermissionDenied("Please sign in to save your journey.")
        if st["follow"]:
            return C.ok(guest=True, follow=True, acc=0, cleared=False, stars=0, kcal=kcal_of(st, None), rewards=[], progress=None)
        acc, cleared, stars = grade(st, False)
        return C.ok(guest=True, acc=acc, cleared=cleared, stars=stars, kcal=kcal_of(st, None), rewards=[], progress=None)
    if C.rate_limited("battle", 240, 3600):
        return C.fail("That's a lot of battles for one hour. Drink some water and rest a little!")
    save = _load(user)
    if not is_unlocked(save, tid):
        return C.fail("That territory is still held by the Horde. Clear the one before it first.")
    if st["follow"]:
        return _finish_follow(user, save, tid, st)
    rewards, g = apply_result(save, tid, st, user.get_id())
    _store(user, save)
    app_tables.battles.add_row(user=user, territory=tid, stars=g["stars"], score=st["score"], accuracy=g["acc"],
                               seconds=st["seconds"], kcal=g["kcal"], punches=g["punches"], moves=st["moves"],
                               intensity=st["intensity"], created=C.now(), is_demo=False)
    return C.ok(rewards=rewards, progress=public_progress(save, user.get_id()), **g)


def _finish_follow(user, save, tid, st):
    """Follow-along (no headset): the snacks played themselves while you shadowboxed. The minutes go into the
    workout log (a battles row, intensity "follow", no stars); the save, unlocks, rewards and realm counters stay."""
    kcal = kcal_of(st, save["settings"].get("weight"))
    punches = sum(v for k, v in st["moves"].items() if k not in ("duck", "lean", "block")) + st["flurry"]
    app_tables.battles.add_row(user=user, territory=tid, stars=0, score=0, accuracy=0.0, seconds=st["seconds"],
                               kcal=kcal, punches=punches, moves=st["moves"], intensity="follow", created=C.now(),
                               is_demo=False)
    return C.ok(follow=True, acc=0, cleared=False, stars=0, kcal=kcal, punches=punches, rewards=[],
                progress=public_progress(save, user.get_id()))


@anvil.server.callable(require_user=True)
def buy_upgrade(key):
    user = C.require_user()
    up = next((u for u in W.UPGRADES if u["key"] == key), None)
    if up is None:
        return C.fail("There's no such upgrade.")
    save = _load(user)
    if up["shop"] == "forge" and not forge_open(save):
        return C.fail("The forge is cold. Free Granny Marrow in Frostfjord first.")
    level = int(save["upgrades"].get(key, 0))
    if level >= len(up["costs"]):
        return C.fail("That's already as good as it gets.")
    cost = up["costs"][level]
    if save["sprouts"] < cost:
        return C.fail("You need %d sprouts for that (you have %d)." % (cost, save["sprouts"]))
    save["sprouts"] -= cost
    save["upgrades"] = dict(save["upgrades"], **{key: level + 1})
    _store(user, save)
    return C.ok(level=level + 1, progress=public_progress(save, user.get_id()))


@anvil.server.callable(require_user=True)
def save_settings(settings):
    user = C.require_user()
    if not isinstance(settings, dict):
        return C.fail("Those settings didn't make sense.")
    save = _load(user)
    s = dict(save["settings"])
    if settings.get("intensity") in W.INTENSITY:
        s["intensity"] = settings["intensity"]
    for k in ("seated", "nofail", "passthrough"):
        if k in settings:
            s[k] = bool(settings[k])
    for k in ("music", "sfx"):
        if k in settings:
            try:
                s[k] = max(0.0, min(1.0, round(float(settings[k]), 2)))
            except (TypeError, ValueError):
                return C.fail("Volume must be a number between 0 and 1.")
    if "weight" in settings:
        w = settings["weight"]
        if w in (None, ""):
            s["weight"] = None
        else:
            try:
                w = round(float(w), 1)
            except (TypeError, ValueError):
                return C.fail("Body weight must be a number of kilograms (or empty).")
            if not 30 <= w <= 250:
                return C.fail("Body weight should be between 30 and 250 kg (or leave it empty).")
            s["weight"] = w
    if "skin" in settings:
        if settings["skin"] not in save["skins"]:
            return C.fail("Finish that collection first to unlock those gloves.")
        s["skin"] = settings["skin"]
    save["settings"] = s
    _store(user, save)
    return C.ok(settings=s)


@anvil.server.callable(require_user=True)
def mark_scene(key):
    user = C.require_user()
    if key not in W.SCENES:
        return C.fail("No such scene.")
    save = _load(user)
    if key not in save["scenes"]:
        save["scenes"] = save["scenes"] + [key]
        _store(user, save)
    return C.ok()


@anvil.server.callable(require_user=True)
def reset_progress(confirm):
    """Start a brand-new journey. Your workout log stays."""
    user = C.require_user()
    if confirm != "NEW JOURNEY":
        return C.fail("Type NEW JOURNEY to confirm.")
    save = _load(user)
    fresh = new_save()
    fresh["settings"] = save["settings"]
    fresh["settings"]["skin"] = "classic"
    _store(user, fresh)
    return C.ok(progress=public_progress(fresh, user.get_id()))


def _muscles(moves):
    out = {k: 0.0 for k, _ in W.MUSCLES}
    for m, n in (moves or {}).items():
        for mus, share in W.MOVES.get(m, {}).get("muscles", {}).items():
            out[mus] += n * share
    return out


TIP_LAND = {"legs": "frost", "core": "storm", "chest": "salt", "back": "cheddar", "arms": "ember", "shoulders": "meadow"}


def _balance(mus, any_rows):
    """Muscle shares (0-1) and the tip: the least-worked muscle and the land that works it most."""
    tot_mus = sum(mus.values()) or 1.0
    shares: dict = {k: round(v / tot_mus, 3) for k, v in mus.items()}
    low = min(shares, key=lambda k: shares[k]) if any_rows else None
    return shares, ({"muscle": low, "land": TIP_LAND[low]} if low else None)


@anvil.server.callable(require_user=True)
def workout_stats():
    """Your workout log: totals, the last 14 days, muscle balance, streak and recent sessions."""
    user = C.require_user()
    rows = sorted(app_tables.battles.search(user=user), key=lambda r: r["created"], reverse=True)
    today = C.now().date()
    days = {(today - dt.timedelta(days=i)).isoformat(): {"minutes": 0.0, "kcal": 0.0, "battles": 0} for i in range(14)}
    mus, total_moves = {k: 0.0 for k, _ in W.MUSCLES}, {}
    for r in rows:
        d = r["created"].date().isoformat()
        if d in days:
            days[d]["minutes"] = round(days[d]["minutes"] + (r["seconds"] or 0) / 60.0, 1)
            days[d]["kcal"] = round(days[d]["kcal"] + (r["kcal"] or 0), 1)
            days[d]["battles"] += 1
        for k, v in _muscles(r["moves"]).items():
            mus[k] += v
        for k, v in (r["moves"] or {}).items():
            total_moves[k] = total_moves.get(k, 0) + v
    played = {r["created"].date() for r in rows}
    streak, d = 0, today
    if d not in played:
        d -= dt.timedelta(days=1)
    while d in played:
        streak += 1
        d -= dt.timedelta(days=1)
    shares, tip = _balance(mus, bool(rows))
    return {
        "totals": {"battles": len(rows), "minutes": round(sum((r["seconds"] or 0) for r in rows) / 60.0, 1),
                   "kcal": round(sum((r["kcal"] or 0) for r in rows), 1), "punches": int(sum((r["punches"] or 0) for r in rows)),
                   "stars": sum(int(r["stars"] or 0) for r in rows)},
        "days": [dict(day=k, **v) for k, v in sorted(days.items())],
        "muscles": shares, "moves": total_moves, "streak": streak, "tip": tip,
        "recent": [{"territory": r["territory"], "stars": r["stars"], "score": r["score"], "accuracy": r["accuracy"],
                    "seconds": r["seconds"], "kcal": r["kcal"], "when": C.iso(r["created"]), "intensity": r["intensity"]} for r in rows[:12]],
    }


# ------------------------------------------------------------------------------------------- workout runs
RUN_MINUTES = (10, 20, 30)
REST_SECONDS = 25     # "Breathe" between battles
SWEAT_SECONDS = 45    # every ~10 minutes: lift the headset, wipe the face pad
SWEAT_EVERY = 570


def battle_seconds(tid):
    """About how long a battle takes, count-in and cage flurry included (the same formula as SP.chart in sp.js)."""
    if tid == W.TRAINING:
        return 105
    li, n = W.split_tid(tid)
    secs = 72 + li * 7 + (n - 1) * 4 + (40 if n == 5 else 0)
    return secs + (8 if tid in W.VILLAGERS else 2)


def _run_pool(save, user_id, rows, day):
    """Territories for a run, best first, as (tid, why): what you need next, today's bounty, then cleared
    territories of the land that works your least-used muscle, then the rest of what you've cleared."""
    pool = []
    if not save.get("training"):
        pool.append((W.TRAINING, "Learn every move"))
    cur = current_tid(save)
    if cur:
        pool.append((cur, "Next on your journey"))
    bounty = bounty_for(save, user_id, day)
    if bounty and save.get("bounty_day") != day:
        pool.append((bounty, "Today's bounty: double sprouts"))
    cleared = [t for t in W.territory_ids() if stars_of(save, t) >= 1]
    mus = {k: 0.0 for k, _ in W.MUSCLES}
    for r in rows:
        for k, v in _muscles(r["moves"]).items():
            mus[k] += v
    _, tip = _balance(mus, bool(rows))
    if tip:
        name = dict(W.MUSCLES)[tip["muscle"]]
        pool += [(t, "%s day: they need it most" % name) for t in cleared if t.startswith(tip["land"] + "-")]
    if cleared:  # the rest, starting at a different place each day for variety
        k = int(hashlib.sha1(("%s|run|%s" % (user_id, day)).encode()).hexdigest(), 16) % len(cleared)
        pool += [(t, "Replay for the workout") for t in cleared[k:] + cleared[:k]]
    pool.append((W.TRAINING, "Training lap"))
    seen, out = set(), []
    for tid, why in pool:
        if tid not in seen and is_unlocked(save, tid):
            seen.add(tid)
            out.append((tid, why))
    return out


def plan_steps(save, user_id, rows, minutes, day):
    """The run: battles chained with breathers until about `minutes` (pure, no table access)."""
    pool = _run_pool(save, user_id, rows, day)
    target = minutes * 60
    steps: list = []
    total, last_break, i = 0, 0, 0
    while len(steps) < 40:
        tid, why = pool[i % len(pool)]
        i += 1
        if steps and steps[-1]["tid"] == tid:
            continue
        secs = battle_seconds(tid)
        sweat = bool(steps) and total - last_break >= SWEAT_EVERY
        gap = (SWEAT_SECONDS if sweat else REST_SECONDS) if steps else 0
        if steps and total + gap + secs / 2.0 > target:
            break
        if sweat:
            steps[-1]["sweat"] = True
            last_break = total
        total += gap + secs
        if tid == W.TRAINING:
            name, emoji, land = "The Training Yard", "🥊", "Lesson zero"
        else:
            li, n = W.split_tid(tid)
            L = W.LANDS[li]
            name, emoji, land = L["territories"][n - 1][0], L["emoji"], L["name"]
        steps.append({"tid": tid, "name": name, "emoji": emoji, "land": land, "why": why, "seconds": secs,
                      "boss": tid.endswith("-5"), "sweat": False})
    return {"steps": steps, "seconds": total, "breaks": sum(1 for s in steps if s["sweat"])}


@anvil.server.callable(require_user=True)
def plan_run(minutes):
    """Workout run: pick 10, 20 or 30 minutes; battles from your journey chained with breathers and sweat breaks."""
    user = C.require_user()
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        minutes = 0
    if minutes not in RUN_MINUTES:
        return C.fail("Pick 10, 20 or 30 minutes.")
    save = _load(user)
    cutoff = C.now() - dt.timedelta(days=30)
    rows = [r for r in app_tables.battles.search(user=user) if r["created"] and r["created"] >= cutoff]
    plan = plan_steps(save, user.get_id(), rows, minutes, C.now().date().isoformat())
    return C.ok(minutes=minutes, started=C.iso(C.now()), **plan)


@anvil.server.callable(require_user=True)
def run_summary(since_iso):
    """What you did since a run started: only your own battles."""
    user = C.require_user()
    try:
        since = dt.datetime.fromisoformat(str(since_iso).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return C.fail("That run's start time didn't make sense.")
    if since.tzinfo is None:
        since = since.replace(tzinfo=dt.timezone.utc)
    if since < C.now() - dt.timedelta(days=2):
        return C.fail("That run is too old to sum up.")
    rows = sorted((r for r in app_tables.battles.search(user=user) if r["created"] and r["created"] >= since),
                  key=lambda r: r["created"])
    mus = {k: 0.0 for k, _ in W.MUSCLES}
    for r in rows:
        for k, v in _muscles(r["moves"]).items():
            mus[k] += v
    shares, _ = _balance(mus, bool(rows))
    return C.ok(
        battles=len(rows), minutes=round(sum((r["seconds"] or 0) for r in rows) / 60.0, 1),
        kcal=round(sum((r["kcal"] or 0) for r in rows), 1), punches=int(sum((r["punches"] or 0) for r in rows)),
        stars=sum(int(r["stars"] or 0) for r in rows), muscles=shares,
        follow=sum(1 for r in rows if r["intensity"] == "follow"),
        list=[{"territory": r["territory"], "stars": r["stars"], "seconds": r["seconds"], "kcal": r["kcal"],
               "accuracy": r["accuracy"], "intensity": r["intensity"], "when": C.iso(r["created"])} for r in rows])


@anvil.server.callable
def realm_stats():
    """Counters for the landing page: everyone's progress together (no names)."""
    DemoData.ensure_loaded()
    heroes = punches = rescued = lands = 0
    kcal = 0.0
    for r in app_tables.saves.search():
        d = r["data"] or {}
        heroes += 1
        punches += int((d.get("totals") or {}).get("punches") or 0)
        kcal += float((d.get("totals") or {}).get("kcal") or 0)
        rescued += len(d.get("villagers") or [])
        lands += int(d.get("story") or 0)
    return {"heroes": heroes, "punches": punches, "kcal": round(kcal), "rescued": rescued, "lands": lands}


def player_summary(u):
    """One row for Admin -> Players."""
    r = _row(u, create=False)
    save = dict(new_save(), **((r["data"] if r else None) or {}))
    li = min(save["story"], len(W.LANDS) - 1)
    return {"id": u.get_id(), "name": C.name_of(u), "email": u["email"], "land": W.LANDS[li]["name"], "story": save["story"],
            "stars": sum(stars_of(save, t) for t in W.territory_ids()), "items": len(save["items"]),
            "villagers": len(save["villagers"]), "battles": save["totals"]["battles"], "kcal": round(save["totals"]["kcal"]),
            "updated": C.iso(r["updated"]) if r else None, "demo": bool(u["is_demo"])}
