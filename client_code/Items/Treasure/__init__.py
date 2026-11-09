from anvil import *

from ._anvil_designer import TreasureTemplate


class Treasure(TreasureTemplate):
    """Satchel: one treasure (found or ???). item = {id, emoji, name, land, cls}. Raises x-item on its panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.pick.classes[self.item["cls"]] = True

    def pick_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-item", id=self.item["id"])
