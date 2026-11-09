from anvil import *

from ._anvil_designer import PlayerRowTemplate


class PlayerRow(PlayerRowTemplate):
    """Admin -> Players: one player's journey at a glance. item = the row admin_players returns, shaped by the page."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.demo.visible = bool(self.item.get("demo"))
