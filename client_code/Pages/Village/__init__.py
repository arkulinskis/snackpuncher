from anvil import *

from ._anvil_designer import VillageTemplate
from ... import sp, state


def _level(levels, n):
    cur, nxt = levels[0], None
    for i, lv in enumerate(levels):
        if n >= lv[0]:
            cur, nxt = lv, (levels[i + 1] if i + 1 < len(levels) else None)
    return cur, nxt


class Village(VillageTemplate):
    """#village (Operate): Hearthstead grows with everyone you free (a little diorama), Pickles' market and Granny
    Marrow's forge sell upgrades for sprouts (buy_upgrade), glove trims (save_settings skin), and every villager's slot."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        for panel in (self.market_panel, self.forge_panel):
            panel.add_event_handler("x-buy", self._buy)
        self.skins_panel.add_event_handler("x-skin", self._skin)
        self.g = sp.game(force=True)
        self._draw()

    def _draw(self):
        c, p = self.g["content"], self.g["progress"]
        n = len(p["villagers"])
        cur, nxt = _level(c["village_levels"], n)
        self.sprouts.text = sp.sprouts_text(p["sprouts"])

        # the diorama
        self.sun.text = "🌈" if n >= 38 else "☀️"
        houses = min(14, 1 + n // 3)
        if n == 0:
            row = ["🔥"]
        else:
            row = ["🏰" if i == 0 and n >= 10 else "🌳" if i % 4 == 3 else "🏡" if n >= 18 else "🏠" if n >= 4 else "⛺"
                   for i in range(houses)]
        self.houses_panel.items = [{"text": e} for e in row]
        self.people_panel.items = [{"text": c["villagers"][v]["emoji"]} for v in p["villagers"][-16:]]

        self.level_name.text = cur[1]
        self.level_count.text = "%d of 41 villagers home" % n
        self.level_bar.style["width"] = "%d%%" % round(n / 41 * 100)
        state.set_attr(self.level_meter, "aria-label", "%d of 41 villagers home" % n)
        self.level_next.visible = bool(nxt)
        self.level_done.visible = not nxt
        if nxt:
            self.level_next.text = "%d more to become %s" % (nxt[0] - n, nxt[1].lower())

        # the shops
        def card(u):
            lv, top = p["upgrades"].get(u["key"], 0), len(u["costs"])
            name = (u["tiers"][lv] + (" → " + u["tiers"][lv + 1] if lv < top else "")) if u.get("tiers") else u["name"]
            cost = u["costs"][lv] if lv < top else 0
            return {"key": u["key"], "emoji": u["emoji"], "name": name, "blurb": u["blurb"], "level": lv, "max": top,
                    "cost": cost, "can_buy": lv < top and p["sprouts"] >= cost}
        self.market_panel.items = [card(u) for u in c["upgrades"] if u["shop"] == "market"]
        self.forge_open.visible = bool(p.get("forge"))
        self.forge_cold.visible = not p.get("forge")
        if p.get("forge"):
            self.forge_panel.items = [card(u) for u in c["upgrades"] if u["shop"] == "forge"]

        self.skins_panel.items = [{"key": s["key"], "label": s["name"] + ("" if s["key"] in p["skins"] else " 🔒"),
                                   "color": s["color"], "has": s["key"] in p["skins"], "on": p["settings"].get("skin") == s["key"]}
                                  for s in c["skins"]]

        held = {}
        for L in c["lands"]:
            for t in L["territories"]:
                if t.get("villager"):
                    held[t["villager"]] = (t, L)
        people = []
        for k, v in c["villagers"].items():
            if k in p["villagers"]:
                people.append({"emoji": v["emoji"], "role": v["role"], "name": v["name"], "line": "“%s”" % v["quip"], "held": False})
            else:
                t, L = held.get(k, ({"name": "?"}, {"name": "?"}))
                people.append({"emoji": "❔", "role": "Still captive", "name": "Someone in " + L["name"],
                               "line": "Held at %s." % t["name"], "held": True})
        self.people_list.items = people

    def _buy(self, key, button, **event_args):
        r = state.call("buy_upgrade", key)
        if r:
            sp.set_progress(r["progress"])
            self._draw()
            state.toast("Upgraded! Level %d." % r["level"], "ok")

    def _skin(self, key, **event_args):
        r = state.call("save_settings", {"skin": key})
        if r:
            sp.set_settings(r["settings"])
            self._draw()
            state.toast("New trim on your gloves.", "ok")
