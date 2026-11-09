"""Snackpuncher's game, seen from Python: the world + your progress (one get_game call, cached), lookups the pages use,
and the bridge to the JavaScript engines (theme/assets/sp.js = window.SP, sp-play.js = the battle screen).

    sp.setup()               once at start-up: UI.api for the engines (window.SP_BRIDGE) and SP.host (toast, go)
    sp.game(force=False)     {"content": the world, "progress": your save or None}; also handed to the engines (SP.prime)
    sp.land(g, key)          a land dict;  sp.terr(g, tid) -> (territory, land) or (None, None)
    sp.stars_of(p, tid)      your stars on a territory (0-3)
    sp.set_progress(p)       after a server call returned a new save (buy_upgrade)
    sp.forget()              after reset_progress / sign-in changes
    sp.stars_text(n)         '★★☆' for Labels;  sp.sprouts_text(n) '🌱 1,234'
"""
import json

import anvil.js
import anvil.server
from anvil.js import window

from . import state

_cache: dict = {"game": None, "who": None}


def js_value(x):
    """Python -> a real JS object (not a proxy of a Python dict)."""
    return window.JSON.parse(json.dumps(x))


def _who():
    me = state.me()
    return me["id"] if me else "guest"


def game(force=False):
    if force or _cache["game"] is None or _cache["who"] != _who():
        g = anvil.server.call("get_game")
        _cache["game"], _cache["who"] = g, _who()
        window.SP.prime(js_value(g))
    return _cache["game"]


def forget():
    _cache["game"] = None
    window.SP.forget()


def set_progress(p):
    g = _cache["game"]
    if g is not None and p:
        g["progress"] = p
        window.SP.setProgress(js_value(p))


def set_settings(settings):
    g = _cache["game"]
    if g is not None and g.get("progress") and settings:
        g["progress"]["settings"] = settings
        window.SP.setProgress(js_value(g["progress"]))


def land(g, key):
    for L in g["content"]["lands"]:
        if L["key"] == key:
            return L
    return None


def terr(g, tid):
    for L in g["content"]["lands"]:
        for t in L["territories"]:
            if t["id"] == tid:
                return t, L
    return None, None


def stars_of(p, tid):
    e = (p or {}).get("terr", {}).get(tid)
    return (e or {}).get("stars", 0) or 0


def stars_text(n, most=3):
    n = int(n or 0)
    return "★" * n + "☆" * max(0, most - n)


def number(n):
    """1234 -> '1,234'."""
    return "{:,}".format(int(round(n or 0)))


def sprouts_text(n):
    return "🌱 " + number(n)


def who(g, key):
    return g["content"]["cast"].get(key) or {"name": key, "emoji": "❔"}


def scene_lines(g, key):
    """A story scene as rows for Items/SceneLine."""
    s = g["content"]["scenes"].get(key)
    if not s:
        return []
    out = []
    for speaker, text in s["lines"]:
        c = who(g, speaker)
        out.append({"emoji": c["emoji"], "name": "" if speaker == "narrator" else c["name"], "text": text,
                    "kind": "narrator" if speaker == "narrator" else "villain" if speaker == "king" else ""})
    return out


# ---------------------------------------------------------------- server calls for the engines (UI.api)
def _bridge(payload_json):
    """Called from JS. Always returns a JSON string: {"result": ...} or {"error": ...}."""
    p = json.loads(payload_json) if payload_json else {}
    try:
        call = anvil.server.call_s if p.get("quiet") else anvil.server.call
        result = call(p["fn"], *(p.get("args") or []))
        if p["fn"] in ("finish_battle", "save_settings", "mark_scene"):
            _cache["game"] = None  # the battle changed your save: pages load it again
        return json.dumps({"result": result})
    except Exception as e:
        kind_of = type(e).__name__  # (some of Anvil's exception classes aren't in the validator's stubs)
        if kind_of == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again.", "reload": True})
        if kind_of == "AppOfflineError":
            return json.dumps({"error": "You seem to be offline. Check your connection and try again."})
        if kind_of == "PermissionDenied":
            return json.dumps({"error": str(e) or "You don't have access to that."})
        print("bridge %s failed: %r" % (p.get("fn", ""), e))
        return json.dumps({"error": "Something went wrong. Please try again.", "detail": repr(e)[:300]})


def _toast(message, kind=""):
    state.toast(message, kind or None)


def _go(target_hash):
    """UI.go from an engine: the same address again reopens the page."""
    if window.location.hash == target_hash:
        from . import router  # (router imports this module)
        router.show()
    else:
        window.location.hash = target_hash


def setup():
    window.SP_BRIDGE = _bridge
    window.SP.host = js_value({})
    window.SP.host["toast"] = _toast
    window.SP.host["go"] = _go


def sync_me():
    """The engines read UI.me (who is playing): kept in step on every page change."""
    window.UI.me = js_value(state.me()) if state.me() else None
