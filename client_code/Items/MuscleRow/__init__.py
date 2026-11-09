from anvil import *

from ._anvil_designer import MuscleRowTemplate


class MuscleRow(MuscleRowTemplate):
    """Workout: one muscle group's share of the work. item = {name, share (0-100), pct ('42%')}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.bar.style["width"] = "%d%%" % self.item["share"]
