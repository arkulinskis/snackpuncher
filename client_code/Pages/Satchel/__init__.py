from anvil import *

from ._anvil_designer import SatchelTemplate
from ... import router, sp, state


class Satchel(SatchelTemplate):
    """#satchel, #satchel/<category> (Operate): 10 collections x 10 treasures (one per land) + quest items.
    Each territory gives one treasure on its first clear and one at three stars. Tap a treasure for its card
    (Dialogs/Treasure)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.cat = args[0] if args else "all"
        self.cats_panel.add_event_handler("x-cat", self._pick_cat)
        self.g = sp.game(force=True)
        self._draw()

    def _draw(self):
        c, p = self.g["content"], self.g["progress"]
        owned = set(p["items"])
        if self.cat != "all" and not any(x["key"] == self.cat for x in c["categories"]):
            self.cat = "all"
        n_all = len(p["items"])
        self.total.text = "%d / 100" % n_all
        self.total_bar.style["width"] = "%d%%" % n_all
        state.set_attr(self.total_meter, "aria-label", "%d of 100 treasures found" % n_all)
        self.keys_part.visible = bool(p["keys"])
        self.keys_panel.items = [{"text": c["key_items"][k]["emoji"] + " " + c["key_items"][k]["name"],
                                  "title": c["key_items"][k]["blurb"]} for k in p["keys"]]

        def count(x):
            return len([L for L in c["lands"] if L["key"] + "-" + x["key"] in owned])
        self.cats_panel.items = [{"key": "all", "label": "All", "count": "", "on": self.cat == "all"}] + [
            {"key": x["key"], "label": x["emoji"] + " " + x["name"], "count": "%d/10" % count(x), "on": self.cat == x["key"]}
            for x in c["categories"]]
        sections = []
        for x in c["categories"]:
            if self.cat not in ("all", x["key"]):
                continue
            items = []
            for L in c["lands"]:
                item_id = L["key"] + "-" + x["key"]
                it, has = c["items"][item_id], item_id in owned
                items.append({"id": item_id, "emoji": it["emoji"], "name": it["name"] if has else "???",
                              "land": L["name"].replace("The ", ""), "cls": it["rarity"] if has else "missing"})
            sections.append({"emoji": x["emoji"], "name": x["name"], "blurb": x["blurb"], "count": count(x),
                             "skin": x["skin"], "items": items, "page": self})
        self.sections_panel.items = sections

    def _pick_cat(self, key, **event_args):
        self.cat = key
        router.replace("satchel", "" if key == "all" else key)
        self._draw()

    def show_item(self, item_id):
        from ...Dialogs.Treasure import Treasure
        go = alert(Treasure(game=self.g, item_id=item_id), buttons=[], role="app-dialog", dismissible=True)
        if go:
            router.go("play", go)
