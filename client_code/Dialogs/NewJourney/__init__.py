import anvil.server
from anvil import *

from ._anvil_designer import NewJourneyTemplate
from ... import state


class NewJourney(NewJourneyTemplate):
    """Workout -> Start over: type NEW JOURNEY to confirm (reset_progress). Closes with True once the journey is reset."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_control_attr(self.confirm_box, "autocomplete", "off")

    @handle("", "show")
    def form_show(self, **event_args):
        self.confirm_box.focus()

    @handle("confirm_box", "pressed_enter")
    def confirm_box_pressed_enter(self, **event_args):
        self.reset_button_click()

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=False)

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        self.reset_button.enabled = False
        try:
            r = anvil.server.call("reset_progress", (self.confirm_box.text or "").strip().upper())
        finally:
            self.reset_button.enabled = True
        if not (isinstance(r, dict) and r.get("ok")):
            self.message.text = (r or {}).get("error") or "That didn't work."
            self.message.visible = True
            return
        self.raise_event("x-close-alert", value=True)
