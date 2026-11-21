import anvil.server
from anvil import *

from ._anvil_designer import RunPickerTemplate
from ... import sp, state


def open_picker(minutes=20):
    """Show the picker; on Start keep the plan as the current run and open its first battle."""
    plan = alert(RunPicker(minutes=minutes), buttons=[], role="app-dialog", dismissible=True)
    if plan and plan.get("steps"):
        sp.start_run(plan)
        from ... import router  # (router imports the pages that import this)
        router.go("play", plan["steps"][0]["tid"])


class RunPicker(RunPickerTemplate):
    """Journey / Workout -> "Start a workout run": pick 10, 20 or 30 minutes and see the planned battles
    (Game.plan_run). Closes with the plan when the player presses Start, else None."""

    def __init__(self, minutes=20, **properties):
        super().__init__(**properties)
        self.plan = None
        self._buttons = {10: self.m10, 20: self.m20, 30: self.m30}
        for m, btn in self._buttons.items():
            btn.tag = m
            btn.add_event_handler("click", self._pick)
        self._first = minutes
        self.plan_box.visible = False
        self.start_button.enabled = False

    @handle("", "show")
    def form_show(self, **event_args):
        if self._first:  # plan once the dialog is on screen, so the "Planning your route" state shows
            m, self._first = self._first, 0
            self._load(m)

    def _pick(self, sender, **event_args):
        self._load(sender.tag)

    def _load(self, minutes):
        for m, btn in self._buttons.items():
            btn.role = ["seg", "on"] if m == minutes else ["seg"]
            state.set_attr(btn, "aria-pressed", "true" if m == minutes else "false")
        self.message.visible = False
        self.plan_box.visible = False
        self.loading_box.visible = True
        self.start_button.enabled = False
        try:
            r = anvil.server.call_s("plan_run", minutes)
        except anvil.server.AppOfflineError:
            r = {"ok": False, "error": "You seem to be offline. Check your connection and try again."}
        self.loading_box.visible = False
        if not (isinstance(r, dict) and r.get("ok")) or not r.get("steps"):
            self.message.text = (r or {}).get("error") or "The route couldn't be planned. Try again in a moment."
            self.message.visible = True
            return
        self.plan = r
        steps = r["steps"]
        self.total.text = "About %d minutes · %s" % (round(r["seconds"] / 60.0), state.plural(len(steps), "battle"))
        bits = ["breathers between battles"]
        if r.get("breaks"):
            bits.append(state.plural(r["breaks"], "sweat break"))
        self.detail.text = "Includes " + " and ".join(bits) + "."
        self.steps_panel.items = [{"n": str(i + 1), "emoji": s["emoji"], "name": s["name"] + (" (boss)" if s.get("boss") else ""),
                                   "meta": "%s · %s" % (s["land"], s["why"]), "mins": "%s min" % max(1, round(s["seconds"] / 60.0)),
                                   "sweat": s.get("sweat") and i < len(steps) - 1} for i, s in enumerate(steps)]
        self.plan_box.visible = True
        self.start_button.enabled = True

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("start_button", "click")
    def start_button_click(self, **event_args):
        if self.plan:
            self.raise_event("x-close-alert", value=self.plan)
