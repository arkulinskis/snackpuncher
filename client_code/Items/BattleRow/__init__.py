from anvil import *

from ._anvil_designer import BattleRowTemplate
from ... import state


class BattleRow(BattleRowTemplate):
    """Workout: a recent battle. item = {name, meta, stars ('★★☆'), n}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_attr(self.stars, "aria-label", "%d of 3 stars" % self.item["n"])
