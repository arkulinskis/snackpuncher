from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import BattleTemplate

NULL = anvil.js.call(window.Function("return null"))  # "no JS object yet", typed for the validator


class Battle(BattleTemplate):
    """The battle screen engine in a page: UI.mountScreen('play', element, args) on show, destroy() on hide.
    The engine draws its own markup, talks to the server through UI.api (client_code/sp.py) and sets UI_READY."""

    def __init__(self, **properties):
        self._args = []
        self.ctl = NULL
        super().__init__(**properties)

    def mount(self, args):
        self._args = [str(a) for a in (args or [])]

    @handle("", "show")
    def form_show(self, **event_args):
        self.destroy()
        self.ctl = window.UI.mountScreen("play", self.dom_nodes["host"], window.JSON.parse(window.JSON.stringify(self._args)))

    @handle("", "hide")
    def form_hide(self, **event_args):
        self.destroy()

    def destroy(self):
        if self.ctl is not None:
            self.ctl.destroy()
            self.ctl = NULL
