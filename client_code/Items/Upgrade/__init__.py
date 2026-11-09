from anvil import *

from ._anvil_designer import UpgradeTemplate
from ... import state


class Upgrade(UpgradeTemplate):
    """Village: one upgrade in a shop. item = {key, emoji, name, blurb, level, max, cost, can_buy}.
    Buy raises x-buy on the panel (the page does the server call and redraws)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.pips_panel.items = [{"on": n < i["level"]} for n in range(i["max"])]
        state.set_attr(self.pips, "aria-label", "Level %d of %d" % (i["level"], i["max"]))
        state.set_attr(self.pips, "role", "img")
        maxed = i["level"] >= i["max"]
        self.maxed.visible = maxed
        self.buy_button.visible = not maxed
        if not maxed:
            self.buy_button.text = "🌱 %d" % i["cost"]
            self.buy_button.enabled = bool(i["can_buy"])
            self.buy_button.role = ["btn", "btn-sm", "btn-primary"] if i["can_buy"] else ["btn", "btn-sm"]
            state.set_control_attr(self.buy_button, "aria-label", "Buy %s for %d sprouts" % (i["name"], i["cost"]))

    @handle("buy_button", "click")
    def buy_button_click(self, **event_args):
        self.parent.raise_event("x-buy", key=self.item["key"], button=self.buy_button)
