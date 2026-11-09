import datetime

from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import WorkoutTemplate
from ... import router, sp, state

DOW = ["M", "T", "W", "T", "F", "S", "S"]  # date.weekday(): Monday first
LOVE = {"legs": "Your legs could use some love", "core": "Your core is under-worked",
        "chest": "Your chest could use more hooks", "back": "Your back wants some hammer fists",
        "arms": "Your arms want more uppercuts", "shoulders": "Your shoulders want more jabs"}
INTENSITIES = ["gentle", "steady", "beast"]


DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _weekday(iso):
    y, m, d = (int(x) for x in iso[:10].split("-"))
    return datetime.date(y, m, d).weekday()


def _day_name(iso):
    """'2026-11-08' -> 'Sun 8 Nov'."""
    return "%s %s" % (DAY_NAMES[_weekday(iso)], state.short_date(iso))


class Workout(WorkoutTemplate):
    """#workout (Operate): the fitness side. Totals, streak, the last 14 days, muscle balance with a tip, move counts,
    recent battles (workout_stats); battle settings (save_settings) and "start a new journey" (reset_progress)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._buttons = {"gentle": self.i_gentle, "steady": self.i_steady, "beast": self.i_beast}
        for key, btn in self._buttons.items():
            btn.tag = key
            btn.add_event_handler("click", self._intensity_click)
        for node, label in ((self.dom_nodes["music"], self.music_val), (self.dom_nodes["sfx"], self.sfx_val)):
            node.addEventListener("input", anvil.js.report_exceptions(lambda e, label=label: self._range(e, label)))
        state.set_control_attr(self.weight_box, "min", 30)
        state.set_control_attr(self.weight_box, "max", 250)
        state.set_control_attr(self.weight_box, "step", 0.5)
        self.g = sp.game(force=True)
        self.w = anvil.server.call("workout_stats")
        self._draw()
        self._settings()

    def _draw(self):
        c, w = self.g["content"], self.w
        self.streak.visible = bool(w["streak"])
        self.streak.text = "🔥 %s in a row" % state.plural(w["streak"], "day")
        t = w["totals"]
        self.t_minutes.text = str(t["minutes"])
        self.t_kcal.text = sp.number(t["kcal"])
        self.t_battles.text = str(t["battles"])
        self.t_punches.text = sp.number(t["punches"])
        self.t_stars.text = str(t["stars"])

        days = w["days"]
        top_min = max([d["minutes"] for d in days] + [1])
        top = max(days, key=lambda d: d["minutes"]) if days else None
        self.days_panel.items = [{"pct": int(round(d["minutes"] / top_min * 100)), "minutes": d["minutes"], "top": d is top,
                                  "tip": "%s: %s min · %d kcal · %s" % (_day_name(d["day"]), d["minutes"], round(d["kcal"]),
                                                                        state.plural(d["battles"], "battle"))} for d in days]
        self.dow_panel.items = [{"text": DOW[_weekday(d["day"])]} for d in days]
        self.days_sr.text = "; ".join("%s: %s minutes" % (_day_name(d["day"]), d["minutes"]) for d in days)

        mus = sorted(((m[1], w["muscles"].get(m[0], 0)) for m in c["muscles"]), key=lambda x: -x[1])
        self.muscles_panel.items = [{"name": name, "share": int(round(v * 100)), "pct": "%d%%" % round(v * 100)} for name, v in mus]
        tip = w.get("tip")
        self.tip.visible = bool(tip and t["battles"])
        if tip and t["battles"]:
            L = sp.land(self.g, tip["land"])
            leans = " and ".join(c["moves"][m]["name"].lower() for m in L["emphasis"]) or "everything"
            self.tip.text = "💡 %s. %s (%s) leans on %s." % (LOVE.get(tip["muscle"], ""), L["name"], L["emoji"], leans)

        used = [m for m in c["moves"] if w["moves"].get(m)]
        self.moves_panel.items = [{"text": "%s %s ×%s" % (c["moves"][m]["icon"], c["moves"][m]["name"], sp.number(w["moves"][m])),
                                   "title": c["moves"][m]["how"]} for m in used]
        self.no_moves.visible = not used
        rows = []
        for r in w["recent"]:
            tt, _ = sp.terr(self.g, r["territory"])
            name = tt["name"] if tt else ("The Training Yard" if r["territory"] == "training" else r["territory"])
            meta = "%s · %s min · %d kcal · %d%% · %s" % (state.ago(r["when"]), round((r["seconds"] or 0) / 6) / 10,
                                                        round(r["kcal"] or 0), round((r["accuracy"] or 0) * 100), r["intensity"])
            rows.append({"name": name, "meta": meta, "stars": sp.stars_text(r["stars"]), "n": int(r["stars"] or 0)})
        self.recent_panel.items = rows
        self.no_recent.visible = not rows

    def _settings(self):
        s = self.g["progress"]["settings"]
        self.intensity = s.get("intensity") or "steady"
        self._show_intensity()
        self.seated_box.checked = bool(s.get("seated"))
        self.nofail_box.checked = bool(s.get("nofail"))
        self.weight_box.text = s.get("weight") if s.get("weight") else ""
        for node, label, key in ((self.dom_nodes["music"], self.music_val, "music"), (self.dom_nodes["sfx"], self.sfx_val, "sfx")):
            v = s.get(key)
            node.value = str(0.7 if v is None else v)
            label.text = str(int(round(float(node.value) * 100)))
            node.setAttribute("aria-label", "Music volume" if key == "music" else "Effects volume")

    def _show_intensity(self):
        for key, btn in self._buttons.items():
            btn.role = ["seg", "on"] if key == self.intensity else ["seg"]

    def _intensity_click(self, sender, **event_args):
        self.intensity = sender.tag
        self._show_intensity()

    def _range(self, event, label):
        label.text = str(int(round(float(event.target.value) * 100)))

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        weight = self.weight_box.text
        r = state.call("save_settings", {"intensity": self.intensity, "seated": self.seated_box.checked,
                                         "nofail": self.nofail_box.checked, "weight": weight if weight not in (None, "") else None,
                                         "music": float(self.dom_nodes["music"].value), "sfx": float(self.dom_nodes["sfx"].value)})
        if r:
            sp.set_settings(r["settings"])
            state.toast("Settings saved", "ok")

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        from ...Dialogs.NewJourney import NewJourney
        if alert(NewJourney(), buttons=[], role="app-dialog", dismissible=True):
            sp.forget()
            state.toast("A new journey begins in Meadowmere.", "ok")
            router.go("journey")
