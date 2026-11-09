"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules.

Links in templates are plain <a href="#journey">; code calls router.go("item", id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header + phone tab bar, signed-in people): (page, label, icon). At most 4.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import sp, state

PAGES = {
    "landing": (None, "Punch the fast food, save the realm"),
    "auth": ("guest", "Sign in"),
    "journey": ("user", "Your journey"),
    "village": ("user", "Hearthstead"),
    "satchel": ("user", "Satchel"),
    "workout": ("user", "Workout"),
    "play": (None, "Battle"),  # the Training Yard is open to everyone; a territory needs an account (show())
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("journey", "Journey", "map"), ("village", "Village", "home"), ("satchel", "Satchel", "star"),
       ("workout", "Workout", "heart")]
HOME = "journey"  # the first page after signing in
APP_NAME = "Snackpuncher"
_r: dict = {"after": "", "listening": False, "page": None}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "journey":
        from .Pages.Journey import Journey
        return Journey
    if name == "village":
        from .Pages.Village import Village
        return Village
    if name == "satchel":
        from .Pages.Satchel import Satchel
        return Satchel
    if name == "workout":
        from .Pages.Workout import Workout
        return Workout
    if name == "play":
        from .Pages.Play import Play
        return Play
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return HOME if state.me() else "landing"


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if name == "play" and args and args[0] != "training":
        who = "user"  # territories save progress: sign in first, then come back here
    if who == "guest" and state.me():
        name, args = HOME, []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = HOME, []
    title = PAGES[name][1]
    if name == "play":
        title = "Training Yard" if not args or args[0] == "training" else "Battle"
    window.document.title = title + " · " + APP_NAME
    window.UI_READY = False
    sp.sync_me()  # the JavaScript engines read UI.me
    old = _r["page"]
    if old is not None and hasattr(old, "leave"):
        old.leave()
    page = _form(name)(args=args)
    _r["page"] = page
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    if not getattr(page, "waits", False):
        window.UI_READY = True  # tests and screenshots wait for this (an engine page sets it once it has loaded)


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or home."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go(HOME)


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
