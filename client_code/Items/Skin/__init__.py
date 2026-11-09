from anvil import *

from ._anvil_designer import SkinTemplate
from ... import state


class Skin(SkinTemplate):
    """Village: a glove trim. item = {key, label, color, has, on}. Picking raises x-skin on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.pick.classes["on"] = bool(i["on"])
        self.swatch.style["background"] = i["color"]
        state.set_attr(self.pick, "aria-pressed", "true" if i["on"] else "false")
        if not i["has"]:
            state.set_attr(self.pick, "disabled", "")
            state.set_attr(self.pick, "title", "Finish this collection to unlock")

    def pick_click(self, event):
        if self.item["has"] and self.parent is not None:
            self.parent.raise_event("x-skin", key=self.item["key"])
