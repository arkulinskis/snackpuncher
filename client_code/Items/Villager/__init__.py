from anvil import *

from ._anvil_designer import VillagerTemplate


class Villager(VillagerTemplate):
    """Village: a freed villager (name + quip) or a captive (where they're held). item = {emoji, role, name, line, held}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.classes["held"] = bool(self.item.get("held"))
