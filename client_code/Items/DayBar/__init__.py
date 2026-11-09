from anvil import *

from ._anvil_designer import DayBarTemplate


class DayBar(DayBarTemplate):
    """Workout: one day's minutes in the 14-day chart. item = {pct, minutes, top, tip}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.classes["zero"] = not i["minutes"]
        self.bar.style["height"] = "%d%%" % i["pct"]
        self.val_box.visible = bool(i["top"] and i["minutes"])
        self.val.text = str(int(round(i["minutes"])))
        self.val_box.style["bottom"] = "calc(%d%% + 4px)" % i["pct"]
