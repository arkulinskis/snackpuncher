from anvil import *

from ._anvil_designer import BadgeTemplate


class Badge(BadgeTemplate):
    """A muscle badge on a move card. item = {text, brand}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["brand"] = bool(self.item.get("brand"))
