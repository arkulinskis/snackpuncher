from anvil import *

from ._anvil_designer import RunStepTemplate


class RunStep(RunStepTemplate):
    """Dialogs/RunPicker: one battle of a planned workout run.
    item = {n, emoji, name, meta ('Meadowmere · Next on your journey'), mins ('2 min'), sweat (a sweat break follows)}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.sweat.visible = bool(self.item.get("sweat"))
