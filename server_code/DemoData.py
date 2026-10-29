"""Demo content, so the app never looks empty. Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row
is flagged is_demo=True, so remove() deletes exactly what load() added.

Snackpuncher is a personal journey, so demo heroes are only seen in Admin -> Players and in the realm-wide
counters on the landing page ("villagers saved so far"). Their progress is played out with the real rules
(Game.apply_result), so it is always consistent with the content.
"""
import datetime as dt
import random

from anvil.tables import app_tables

from . import common as C

# name, email, territories cleared, intensity
DEMO_USERS = [
    ("Maya Chen", "maya.demo@example.com", 7, "gentle"),
    ("Theo Martin", "theo.demo@example.com", 14, "steady"),
    ("Ines Ozola", "ines.demo@example.com", 23, "steady"),
    ("Kofi Mensah", "kofi.demo@example.com", 34, "beast"),
    ("Lena Novak", "lena.demo@example.com", 50, "beast"),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["battles", "saves"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def play_out(save, cleared, intensity, rng, user_id="demo", start=None, log=None):
    """Clear the first `cleared` territories of the journey with plausible battles. `log(tid, stats, g, when)` per battle."""
    from . import Game, content as W
    when = start or (C.now() - dt.timedelta(days=30))
    for tid in [W.TRAINING] + W.territory_ids()[:cleared]:
        total = rng.randint(70, 150)
        hits = int(total * rng.uniform(0.74, 0.97))
        moves = {}
        for _ in range(hits):
            m = rng.choice(["jab", "jab", "hook", "uppercut", "hammer", "duck", "lean", "block", "lunge"])
            moves[m] = moves.get(m, 0) + 1
        st = Game.clean_stats({"total": total, "hits": hits, "weak": 0, "max_combo": rng.randint(15, total // 2),
                               "score": hits * rng.randint(110, 180), "seconds": rng.randint(90, 200),
                               "flurry": rng.randint(12, 34), "moves": moves, "boss_down": True, "intensity": intensity})
        rewards, g = Game.apply_result(save, tid, st, user_id, day=when.date().isoformat())
        if log:
            log(tid, st, g, when)
        when += dt.timedelta(hours=rng.randint(5, 20))
    seen = ["arrive-" + W.LAND_KEYS[i] for i in range(min(save["story"] + 1, len(W.LANDS)))]
    seen += ["boss-" + W.LAND_KEYS[i] for i in range(save["story"])]
    save["scenes"] = sorted(set(save["scenes"]) | set(seen))
    return save


def load():
    from . import Game
    remove(remember=False)
    rng = random.Random(7)
    for name, email, cleared, intensity in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=40))
        save = Game.new_save()
        save["settings"]["intensity"] = intensity

        def log(tid, st, g, when, u=u, intensity=intensity):
            app_tables.battles.add_row(user=u, territory=tid, stars=g["stars"], score=st["score"], accuracy=g["acc"],
                                       seconds=st["seconds"], kcal=g["kcal"], punches=g["punches"], moves=st["moves"],
                                       intensity=intensity, created=when, is_demo=True)
        play_out(save, cleared, intensity, rng, u.get_id(), C.now() - dt.timedelta(days=cleared // 2 + 3), log)
        app_tables.saves.add_row(user=u, data=save, updated=C.now() - dt.timedelta(hours=rng.randint(2, 90)), is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
