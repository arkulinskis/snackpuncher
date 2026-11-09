from anvil import *

from ._anvil_designer import MoveCardTemplate


class MoveCard(MoveCardTemplate):
    """Landing: a move and the muscles it works. item = {icon, name, how, muscles: [{text, brand}]}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.muscles_panel.items = self.item["muscles"]
