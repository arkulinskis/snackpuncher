from anvil import *
import anvil.server

from ._anvil_designer import LandingTemplate
from ... import sp, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "YsGjeRjVZMY"


class Landing(LandingTemplate):
    """#landing (Persuade; also "About" for members): the title-screen hero (inline SVG battle), realm counters
    (realm_stats), the Watch section, how it works, the ten lands and every move with its muscles (from get_game),
    the companions, features, questions. Static copy lives in the template."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = self.guest_note.visible = self.band_guest.visible = not me
        self.member_cta.visible = self.band_member.visible = bool(me)
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        self._realm()
        self._world()

    def _realm(self):
        r = state.call_quiet("realm_stats")
        if not r:
            return
        for label, key in ((self.n_heroes, "heroes"), (self.n_punches, "punches"), (self.n_rescued, "rescued"),
                           (self.n_kcal, "kcal")):
            label.text = sp.number(r.get(key))

    def _world(self):
        c = sp.game()["content"]
        moves = c["moves"]
        self.lands_panel.items = [{"emoji": L["emoji"], "name": L["name"],
                                   "sub": L["element"] + " · " + (", ".join(moves[m]["name"] for m in L["emphasis"]) or "everything")}
                                  for L in c["lands"]]
        names = {m[0]: m[1] for m in c["muscles"]}
        self.moves_panel.items = [{"icon": m["icon"], "name": m["name"], "how": m["how"],
                                   "muscles": [{"text": names.get(k, k), "brand": share >= 0.45} for k, share in m["muscles"].items()]}
                                  for key, m in moves.items() if key != "flurry"]

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Snackpuncher video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
