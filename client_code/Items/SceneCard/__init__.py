from anvil import *

from ._anvil_designer import SceneCardTemplate


class SceneCard(SceneCardTemplate):
    """Journey -> the Chronicle: one scene you have seen, folded. item = {title, lines}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.lines_panel.items = self.item["lines"]
