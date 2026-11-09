"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data
as_user(None)
g = call("get_game")
assert M["DemoData"].state() == "loaded" and g["progress"] is None, "demo loads on first visit; guests have no progress"
W = M["content"]
assert len(g["content"]["lands"]) == 10 and len(g["content"]["items"]) == 100 and len(g["content"]["categories"]) == 10
assert len(W.territory_ids()) == 50 and len(W.VILLAGERS) == 41
assert all(it["from"] in W.territory_ids() for it in W.ITEMS.values())
assert all(len(L["items"]) == 10 and len(L["territories"]) == 5 for L in W.LANDS)
assert all(set(L["moves"]) <= set(W.MOVES) and set(L["emphasis"]) <= set(L["moves"]) for L in W.LANDS)
assert all(k in W.SCENES for L in W.LAND_KEYS for k in ("arrive-" + L, "boss-" + L))
assert all(sp in W.CAST for s in W.SCENES.values() for sp, _ in s["lines"])
lena = T.users.get(email="lena.demo@example.com")
lena_save = T.saves.get(user=lena)["data"]
assert lena_save["story"] == 10 and len(lena_save["villagers"]) == 41 and "everpot" in lena_save["keys"], "a demo hero finished the journey"
rs = call("realm_stats")
assert rs["heroes"] == 5 and rs["rescued"] > 41 and rs["punches"] > 0
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.users.search(is_demo=True) and not T.saves.search() and not T.battles.search()
as_user(None)
call("get_game")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert len(T.saves.search(is_demo=True)) == 5, "reloading replaces the demo instead of doubling it"


# ---------------------------------------------------------------------------------- the game
def battle(tid, hits=95, total=100, **kw):
    st = {"total": total, "hits": hits, "weak": 0, "max_combo": 30, "score": hits * 140, "seconds": 120, "flurry": 22,
          "moves": {"jab": 40, "duck": 20, "lean": 15, "uppercut": 20, "bogus": 99}, "intensity": "steady"}
    st.update(kw)
    return call("finish_battle", tid, st)


# guests: the Training Yard only, nothing stored
as_user(None)
r = ok(battle("training"))
assert r["guest"] and r["stars"] == 3 and r["progress"] is None
assert denied("finish_battle", "meadow-1", {})
bad(call("finish_battle", "nowhere-9", {}))
for fn, args in [("buy_upgrade", ("stew",)), ("save_settings", ({},)), ("mark_scene", ("arrive-meadow",)), ("workout_stats", ()),
                 ("reset_progress", ("NEW JOURNEY",))]:
    assert denied(fn, *args), fn

as_user(ana)
g = call("get_game")
p = g["progress"]
assert p["current"] == "meadow-1" and p["unlocked"] == ["meadow-1"] and p["sprouts"] == 0 and not p["forge"]
bad(battle("meadow-2"), "locked territory")
r = ok(battle("training"))
assert r["rewards"][0] == {"kind": "sprouts", "n": 30} and r["progress"]["training"] == 1
r = ok(battle("meadow-1", hits=80))
assert r["stars"] == 2 and r["cleared"] and r["first"]
kinds = [x["kind"] for x in r["rewards"]]
assert "villager" in kinds and {"kind": "item", "id": "meadow-seeds"} in r["rewards"] and {"kind": "item", "id": "meadow-herbs"} not in r["rewards"]
assert "meadow-2" in r["progress"]["unlocked"] and r["progress"]["current"] == "meadow-2"
first_sprouts = r["rewards"][0]["n"]
r = ok(battle("meadow-1", hits=98))
assert r["stars"] == 3 and {"kind": "item", "id": "meadow-herbs"} in r["rewards"] and "villager" not in [x["kind"] for x in r["rewards"]]
assert r["rewards"][0]["n"] < first_sprouts + 10, "replays pay about half"
r = ok(battle("meadow-2", hits=30))
assert r["stars"] == 0 and not r["cleared"] and "meadow-3" not in r["progress"]["unlocked"], "missing too much doesn't clear"
r = ok(battle("meadow-2", hits=90, failed=True))
assert not r["cleared"], "running out of vigor doesn't clear"
for t in ["meadow-2", "meadow-3", "meadow-4"]:
    ok(battle(t))
r = ok(battle("meadow-5", boss_down=False))
assert not r["cleared"], "a boss must go down"
r = ok(battle("meadow-5", boss_down=True))
assert r["cleared"] and {"kind": "key", "id": "ladle_broken"} in r["rewards"] and {"kind": "scene", "id": "boss-meadow"} in r["rewards"]
assert {"kind": "land", "id": "ember"} in r["rewards"] and r["progress"]["story"] == 1 and "ember-1" in r["progress"]["unlocked"]
assert r["progress"]["objective"] == W.OBJECTIVES[1]
assert len(T.battles.search(user=ana)) == 10, "every battle is logged"

# market + forge
bad(call("buy_upgrade", "nope"))
bad(call("buy_upgrade", "gauntlets"), "forge is cold before Granny")
sp = call("get_game")["progress"]["sprouts"]
r = ok(call("buy_upgrade", "stew"))
assert r["level"] == 1 and r["progress"]["sprouts"] == sp - 60 and r["progress"]["upgrades"]["stew"] == 1
save = T.saves.get(user=ana)["data"]
save["sprouts"] = 5
T.saves.get(user=ana)["data"] = save
bad(call("buy_upgrade", "pouch"), "not enough sprouts")

# settings
bad(call("save_settings", "x"))
bad(call("save_settings", {"weight": "heavy"}))
bad(call("save_settings", {"weight": 10}))
bad(call("save_settings", {"skin": "seeds"}), "skin not unlocked yet")
s = ok(call("save_settings", {"intensity": "beast", "seated": 1, "music": 3, "weight": "72.5", "evil": "x"}))["settings"]
assert s["intensity"] == "beast" and s["seated"] is True and s["music"] == 1.0 and s["weight"] == 72.5 and "evil" not in s
assert ok(call("save_settings", {"weight": ""}))["settings"]["weight"] is None

# scenes
bad(call("mark_scene", "nope"))
ok(call("mark_scene", "arrive-meadow"))
ok(call("mark_scene", "arrive-meadow"))
assert call("get_game")["progress"]["scenes"] == ["arrive-meadow"]

# a long way further: play out the journey with the real rules, then check the forge, skins and the ending
save = T.saves.get(user=ana)["data"]
import random as _r  # noqa: E402
M["DemoData"].play_out(save, 50, "steady", _r.Random(1), ana.get_id())
assert save["story"] == 10 and len(save["villagers"]) == 41 and "frost-5" in save["villagers"] and "everpot" in save["keys"]
for tid in W.territory_ids():  # three stars everywhere fills every collection
    M["Game"].apply_result(save, tid, M["Game"].clean_stats({"total": 100, "hits": 100, "seconds": 100, "boss_down": True}), ana.get_id())
assert len(save["items"]) == 100 and len(save["skins"]) == 11
save["sprouts"] = 5000
T.saves.get(user=ana)["data"] = save
assert ok(call("buy_upgrade", "gauntlets"))["level"] == 1, "the forge opens once Granny is free"
assert ok(call("save_settings", {"skin": "seeds"}))["settings"]["skin"] == "seeds"
p = call("get_game")["progress"]
assert p["current"] is None and p["forge"] and p["objective"] == W.OBJECTIVES[10] and p["stars_total"] == 150
assert p["bounty"] and not p["bounty"].endswith("-5")

# workout log
ws = call("workout_stats")
assert ws["totals"]["battles"] == 10 and ws["streak"] == 1 and len(ws["days"]) == 14 and abs(sum(ws["muscles"].values()) - 1) < 0.01
assert ws["tip"]["muscle"] in dict(W.MUSCLES) and len(ws["recent"]) == 10 and "bogus" not in ws["moves"]

# reset
bad(call("reset_progress", "yes"))
p = ok(call("reset_progress", "NEW JOURNEY"))["progress"]
assert p["story"] == 0 and p["unlocked"] == ["meadow-1"] and p["settings"]["intensity"] == "beast" and p["settings"]["skin"] == "classic"
assert call("workout_stats")["totals"]["battles"] == 10, "the workout log survives a new journey"

# ---------------------------------------------------------------------------------- admin: players
as_user(bob)
assert denied("admin_players")
as_user(admin)
pl = call("admin_players")
assert pl["total"] == 6 and any(x["email"] == "ana@example.com" for x in pl["players"])
assert call("admin_players", "lena")["players"][0]["story"] == 10
ov = call("admin_overview")
assert ov["players"] == 6 and ov["battles"] > 10

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "get_game", "finish_battle", "realm_stats", "legal_state", "legal_accept"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
