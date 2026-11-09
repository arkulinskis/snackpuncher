from anvil import *
import anvil.js

from ._anvil_designer import LandMapTemplate
from ... import sp

# Where each land sits on the 1000 x 600 map (the road runs through them in order).
PTS = [(90, 470), (230, 520), (380, 445), (520, 520), (660, 440), (810, 505), (895, 370), (740, 250), (540, 215), (320, 150)]


def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


class LandMap(LandMapTemplate):
    """The map of Nourra on the Journey page: an SVG drawing (a picture, so it is drawn as one piece of markup)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        host = self.dom_nodes["host"]
        host.addEventListener("click", anvil.js.report_exceptions(self._click))
        host.addEventListener("keydown", anvil.js.report_exceptions(self._key))

    def draw(self, c, p, sel):
        road = "M" + " L ".join("%d %d" % q for q in PTS)
        parts = ['<svg viewBox="0 0 1000 600" role="group" aria-label="Map of Nourra">',
                 '<path class="road" d="%s"/>' % road, '<text class="compass" x="930" y="80" aria-hidden="true">🧭</text>']
        for i, L in enumerate(c["lands"]):
            x, y = PTS[i]
            terrs = L["territories"]
            cleared = len([t for t in terrs if sp.stars_of(p, t["id"]) > 0])
            is_open = terrs[0]["id"] in p["unlocked"]
            cur = bool(p.get("current")) and p["current"].startswith(L["key"] + "-")
            stars = sum(sp.stars_of(p, t["id"]) for t in terrs)
            cls = "node" + ("" if is_open else " locked") + (" done" if cleared == 5 else "") + (" cur" if cur else "") + \
                (" sel" if sel == L["key"] else "")
            label = L["name"] + ("" if is_open else " (locked)") + (", %d of 15 stars" % stars if is_open else "")
            parts.append('<g class="%s" data-land="%s" tabindex="0" role="button" aria-label="%s"%s>' % (
                cls, _esc(L["key"]), _esc(label), ' aria-pressed="true"' if sel == L["key"] else ' aria-pressed="false"'))
            parts.append('<circle class="ring" cx="%d" cy="%d" r="54"/><circle class="bg" cx="%d" cy="%d" r="44"/>' % (x, y, x, y))
            parts.append('<text class="em" x="%d" y="%d" aria-hidden="true">%s</text>' % (x, y + 2, L["emoji"] if is_open else "☁️"))
            parts.append('<text class="nm" x="%d" y="%d" aria-hidden="true">%s</text>' % (x, y + 76, _esc(L["name"].replace("The ", ""))))
            if is_open:
                parts.append('<text class="st" x="%d" y="%d" aria-hidden="true">★ %d/15</text>' % (x, y - 56, stars))
            parts.append("</g>")
        parts.append("</svg>")
        self.dom_nodes["host"].innerHTML = "".join(parts)

    def _pick(self, event):
        node = event.target.closest("[data-land]") if event.target and getattr(event.target, "closest", None) else None
        if node:
            self.raise_event("land_picked", key=str(node.getAttribute("data-land")))
            return True
        return False

    def _click(self, event):
        self._pick(event)

    def _key(self, event):
        if event.key in ("Enter", " ") and self._pick(event):
            event.preventDefault()
