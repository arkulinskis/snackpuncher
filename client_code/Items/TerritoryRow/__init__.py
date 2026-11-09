from anvil import *

from ._anvil_designer import TerritoryRowTemplate
from ... import router, sp, state


class TerritoryRow(TerritoryRowTemplate):
    """Journey: one of a land's five territories (fight / replay / locked).
    item = {t: territory, land, unlocked, stars, current, bounty, villager: {emoji, name} or None, saved, loot, best}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i, t = self.item, self.item["t"]
        st = i["stars"]
        self.classes.update({"locked": not i["unlocked"], "cur": bool(i["current"])})
        self.name.text = t["name"]
        self.seal_text.text = "☠" if t["boss"] else str(t["n"])
        self.seal.classes["green"] = not t["boss"] and bool(st)
        self.seal.classes["gold"] = not t["boss"] and not st
        self.bounty.visible = bool(i["bounty"])
        self.stars.text = sp.stars_text(st)
        state.set_attr(self.stars, "aria-label", "%d of 3 stars" % st)
        self.boss.text = ("Boss: " + i["land"]["boss"]["name"]) if t["boss"] else ""
        self.boss.visible = bool(t["boss"])
        v = i["villager"]
        self.villager.visible = bool(v)
        if v:
            self.villager.text = ("✓ " if i["saved"] else "Rescue ") + v["emoji"] + " " + v["name"]
        self.loot_panel.items = i["loot"]
        self.best.visible = bool(i["best"])
        self.best.text = "Best " + sp.number(i["best"]) if i["best"] else ""
        self.fight.visible = bool(i["unlocked"])
        self.locked.visible = not i["unlocked"]
        state.set_attr(self.fight, "href", router.href("play", t["id"]))
        self.fight.classes["primary"] = not st
        self.fight_text.text = "⚔ Fight" if not st else "↻ Go for ★★★" if st < 3 else "↻ Replay"
