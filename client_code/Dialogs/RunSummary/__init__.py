import anvil.server
from anvil import *

from ._anvil_designer import RunSummaryTemplate
from ... import sp, state


class RunSummary(RunSummaryTemplate):
    """The end of a workout run (opened by Pages/Workout at #workout/run): minutes, kcal, snacks punched, muscles and
    the battles logged since the run started (Game.run_summary reads only your own). Closes with "again" when the
    player wants another run, else None."""

    def __init__(self, game, run, **properties):
        super().__init__(**properties)
        self.g, self.run = game, run
        steps = run.get("steps") or []
        done = int(run.get("i") or 0)
        self.lead.text = "You planned %d minutes and %s. %s" % (
            run.get("minutes") or 0, state.plural(len(steps), "battle"),
            "Every one of them is done!" if done >= len(steps) else "You finished %d of them." % done)
        self.result_box.visible = False
        self._loaded = False

    @handle("", "show")
    def form_show(self, **event_args):
        if self._loaded:
            return
        self._loaded = True
        try:
            r = anvil.server.call_s("run_summary", self.run.get("started"))
        except anvil.server.AppOfflineError:
            r = {"ok": False, "error": "You seem to be offline. Your battles are saved; check the Workout page later."}
        self.loading_box.visible = False
        if not (isinstance(r, dict) and r.get("ok")):
            self.message.text = (r or {}).get("error") or "The summary couldn't be loaded."
            self.message.visible = True
            return
        self.n_minutes.text = str(r["minutes"])
        self.n_kcal.text = sp.number(r["kcal"])
        self.n_punches.text = sp.number(r["punches"])
        self.n_battles.text = str(r["battles"])
        c = self.g["content"]
        mus = sorted(((m[1], r["muscles"].get(m[0], 0)) for m in c["muscles"]), key=lambda x: -x[1])
        self.muscles_panel.items = [{"name": name, "share": int(round(v * 100)), "pct": "%d%%" % round(v * 100)}
                                    for name, v in mus] if r["battles"] else []
        self.battles_panel.items = [sp.battle_row(self.g, b) for b in r["list"]]
        self.empty_box.visible = not r["list"]
        self.result_box.visible = True

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="again")

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
