from anvil import *

from ._anvil_designer import LootTemplate
from ... import state


class Loot(LootTemplate):
    """A territory's treasure, greyed out until found. item = {emoji, has, title}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["no"] = not self.item.get("has")
        state.set_attr(self, "title", self.item.get("title"))
