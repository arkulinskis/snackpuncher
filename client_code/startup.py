"""The app starts here (anvil.yaml: startup module). One server call to learn who is signed in (Anvil's loading
spinner shows meanwhile), the Privacy & Terms kit, the engines' bridge (sp.setup), then the page for the address in the browser bar."""
import anvil.server

from . import legal, router, sp, state

LEGAL_THEME = {"accent": "#2f6d3a"}  # colours for the Privacy & Terms page (match --c-brand in app.css)

legal.setup(LEGAL_THEME)
sp.setup()  # the engines' server bridge (UI.api) and SP.host
state.set_me(anvil.server.call("get_me"))
if state.me():
    legal.refresh_soon()
router.start()
