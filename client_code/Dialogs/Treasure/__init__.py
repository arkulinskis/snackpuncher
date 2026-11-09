from anvil import *

from ._anvil_designer import TreasureTemplate
from ... import sp


class Treasure(TreasureTemplate):
    """Satchel: a treasure's card (found: name, type, flavour; not yet: where to find it). Closes with the territory
    id when the player presses "Go there", else None."""

    def __init__(self, game, item_id, **properties):
        super().__init__(**properties)
        c, p = game["content"], game["progress"]
        item = c["items"][item_id]
        has = item_id in p["items"]
        self.src = item["from"]
        t, L = sp.terr(game, item["from"])
        cat = next((x for x in c["categories"] if x["key"] == item["cat"]), {"name": item["cat"]})
        self.emoji.text = item["emoji"] if has else "❔"
        self.title.text = item["name"] if has else "Not found yet"
        self.rarity.text = item["rarity"]
        self.rarity.role = ["badge", {"legendary": "badge-gold", "rare": "badge-brand"}.get(item["rarity"], "badge")]
        self.cat.text = cat["name"]
        self.kind.text = item.get("type") or ""
        self.kind.visible = has
        self.flavour.text = item.get("flavour") or ""
        self.flavour.visible = has
        name, land = (t or {}).get("name", "?"), (L or {}).get("name", "?")
        if item.get("stars") == 3:
            self.where.text = "Earn three stars at %s in %s." % (name, land)
        else:
            self.where.text = "Free %s in %s to find it." % (name, land)
        self.go_button.visible = (not has) and item["from"] in p["unlocked"]

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("go_button", "click")
    def go_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=self.src)
