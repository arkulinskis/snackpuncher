from anvil import *

from ._anvil_designer import PlayTemplate


class Play(PlayTemplate):
    """#play/training, #play/<land>-<1..5>: the battle, full screen with no header or footer (a JavaScript engine in
    Components/Battle, theme/assets/sp-play.js). The router sends signed-out visitors of a territory to sign in first."""

    waits = True  # router: the engine sets UI_READY itself once the world and three.js have loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.battle.mount(list(args) or ["training"])

    def leave(self):
        self.battle.destroy()
