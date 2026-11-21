from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import HeadsetHandoffTemplate
from ... import state


class HeadsetHandoff(HeadsetHandoffTemplate):
    """ "Send it to your Quest": most visitors arrive on a phone or a computer, so this card puts the address in big
    letters, a "Send to my Quest" button (Meta's Web Launch) and Copy link. It stays hidden where WebXR works
    (you're already in the headset). setup(hash) picks the page the headset opens (#play/training, #journey...)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.url = ""
        self.dom_nodes["copy"].addEventListener("click", anvil.js.report_exceptions(self._copy))
        self.setup("#play/training")
        window.SP.whenXR(anvil.js.report_exceptions(self._xr))  # (a JS Promise handed to Python would be waited on)

    def setup(self, target_hash, subtitle=None):
        link = window.SP.questLink(target_hash)
        self.url = str(link.url)
        self.dom_nodes["addr"].textContent = str(link.host)
        self.dom_nodes["send"].setAttribute("href", str(link.send))
        state.set_attr(self, "data-target", target_hash)
        if subtitle:
            self.dom_nodes["sub"].textContent = subtitle

    def _xr(self, supported):
        self.dom_nodes["card"].classList.toggle("is-hidden", bool(supported))

    def _copy(self, event):
        btn = self.dom_nodes["copy"]
        ok = window.SP.copy(self.url)  # a Promise: Anvil waits for it and hands back the result
        btn.textContent = "Copied ✓" if ok else "Copy failed"
        if ok:
            state.toast("Link copied. Paste it into Meta Quest Browser.", "ok")
        window.setTimeout(lambda: setattr(btn, "textContent", "Copy link"), 1800)
