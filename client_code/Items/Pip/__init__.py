from anvil import *

from ._anvil_designer import PipTemplate


class Pip(PipTemplate):
    """One level pip on an upgrade. item = {on}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["on"] = bool(self.item.get("on"))
