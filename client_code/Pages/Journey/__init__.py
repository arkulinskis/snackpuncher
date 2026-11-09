import datetime

from anvil import *
import anvil.js

from ._anvil_designer import JourneyTemplate
from ... import router, sp, state

BANTER = [
    ("pickles", "Remember: green ring, left fist. Red ring, right fist. Gold, whatever you like."),
    ("brocco", "Today I shall be extremely brave. From back here."),
    ("pickles", "Duck with your back straight. Your knees will thank you. Mine would, if I had knees."),
    ("brocco", "A true knight stretches before battle. I have stretched. I am now four and a quarter inches."),
    ("pickles", "If your arms are tired, pick a land with more ducking. Variety, hero. Variety."),
    ("brocco", "Have you considered a bigger sword? No? Just fists? Bold."),
    ("pickles", "Water. Drink some. I am mostly brine, so I know these things."),
    ("brocco", "I have composed a ballad about our victories. It is mostly about me."),
]


class Journey(JourneyTemplate):
    """#journey, #journey/<land> (Operate; the home page for players): the current quest + Continue, the party's
    quip, quest items, the map of the ten lands (Components/LandMap), the chosen land's five territories, the
    Training Yard and the village, and the Chronicle (every story scene seen so far)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.sel = args[0] if args else None
        state.heading(self.title, 1)
        self.land_map.add_event_handler("land_picked", self._picked)
        self.g = sp.game(force=True)
        self._draw()

    def _draw(self):
        g = self.g
        c, p = g["content"], g["progress"]
        me = state.me() or {}
        cur_land = p["current"].split("-")[0] if p.get("current") else "citadel"
        if not self.sel or not sp.land(g, self.sel):
            self.sel = cur_land
        L = sp.land(g, self.sel)
        is_open = L["territories"][0]["id"] in p["unlocked"]

        self.title.text = "%s's journey" % ((me.get("name") or "Hero").split(" ")[0])
        self.sprouts.text = sp.sprouts_text(p["sprouts"])
        self.c_stars.text = "★ %d / 150" % p["stars_total"]
        self.c_items.text = "🎒 %d / 100" % len(p["items"])
        self.c_people.text = "🏘️ %d / 41" % len(p["villagers"])

        # the quest
        self.objective.text = "📜 " + p["objective"]
        b = BANTER[(datetime.date.today().day + p["stars_total"]) % len(BANTER)]
        w = sp.who(g, b[0])
        self.who_emoji.text, self.who_name.text, self.who_line.text = w["emoji"], w["name"], b[1]
        self.keys_box.visible = bool(p["keys"])
        self.keys_panel.items = [{"text": c["key_items"][k]["emoji"] + " " + c["key_items"][k]["name"],
                                  "title": c["key_items"][k]["blurb"]} for k in p["keys"]]
        cur_t, _ = sp.terr(g, p["current"]) if p.get("current") else (None, None)
        if not p.get("training"):
            self.quest_go_text.text, href = "🥊 Start with training", router.href("play", "training")
        elif cur_t:
            self.quest_go_text.text, href = "⚔ " + cur_t["name"], router.href("play", p["current"])
        else:
            self.quest_go_text.text, href = "🎒 Chase the last treasures", "#satchel"
        state.set_attr(self.quest_go, "href", href)

        # the map + the chosen land
        self.land_map.draw(c, p, self.sel)
        self.land_emoji.text = L["emoji"]
        self.land_name.text = L["name"]
        self.land_meta.text = "Land %d of 10 · %s" % (L["index"] + 1, L["element"])
        self.moves_panel.items = [{"text": c["moves"][m]["icon"] + " " + c["moves"][m]["name"], "title": c["moves"][m]["how"],
                                   "gold": m in L["emphasis"]} for m in L["moves"]]
        self.land_blurb.text = L["blurb"]
        self.terrs_box.visible = is_open
        self.shroud.visible = not is_open
        if is_open:
            self.terrs_panel.items = [self._row(t, L, p, c) for t in L["territories"]]
        elif L["index"] > 0:
            prev = c["lands"][L["index"] - 1]
            self.shroud_text.text = "Defeat %s to open %s." % (prev["boss"]["name"], L["name"])

        self.village_text.text = "%s home. Spend sprouts at the market%s" % (
            state.plural(len(p["villagers"]), "villager is", "villagers are"),
            " and Granny's forge." if p.get("forge") else ". The forge opens once Granny Marrow is free.")

        seen = [k for k in c["scenes"] if k in p["scenes"]]
        self.scenes_panel.items = [{"title": c["scenes"][k]["title"], "lines": sp.scene_lines(g, k)} for k in seen]
        self.no_scenes.visible = not seen

    def _row(self, t, L, p, c):
        vil = c["villagers"].get(t["villager"]) if t.get("villager") else None
        loot = []
        for n, item_id in enumerate(t["items"]):
            it, has = c["items"][item_id], item_id in p["items"]
            loot.append({"emoji": it["emoji"], "has": has,
                         "title": (it["name"] if has else "???") + (" (3 stars)" if n else " (first clear)")})
        e = p["terr"].get(t["id"]) or {}
        return {"t": t, "land": L, "unlocked": t["id"] in p["unlocked"], "stars": sp.stars_of(p, t["id"]),
                "current": p.get("current") == t["id"], "bounty": p.get("bounty") == t["id"] and not p.get("bounty_claimed"),
                "villager": vil, "saved": bool(vil) and t["villager"] in p["villagers"], "loot": loot, "best": e.get("best") or 0}

    def _picked(self, key, **event_args):
        self.sel = key
        router.replace("journey", key)
        self._draw()
        node = anvil.js.get_dom_node(self.land_card)
        if node.scrollIntoView:
            node.scrollIntoView({"behavior": "smooth", "block": "start"})
