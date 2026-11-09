from anvil import *

from ._anvil_designer import CatButtonTemplate
from ... import state


class CatButton(CatButtonTemplate):
    """Satchel: a category filter. item = {key, label, count, on}. Raises x-cat on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.pick.classes["on"] = bool(self.item["on"])
        state.set_attr(self.pick, "aria-pressed", "true" if self.item["on"] else "false")
        self.count.visible = bool(self.item.get("count"))

    def pick_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-cat", key=self.item["key"])
