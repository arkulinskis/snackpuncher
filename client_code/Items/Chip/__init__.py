from anvil import *

from ._anvil_designer import ChipTemplate
from ... import state


class Chip(ChipTemplate):
    """A small rounded chip (key items, moves). item = {text, title?, gold?}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        if self.item.get("title"):
            state.set_attr(self, "title", self.item["title"])
        self.classes["gold"] = bool(self.item.get("gold"))
