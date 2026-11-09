from anvil import *

from ._anvil_designer import SceneLineTemplate


class SceneLine(SceneLineTemplate):
    """One line of a story scene. item = {emoji, name ('' for the narrator), text, kind: '' | narrator | villain}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.name.visible = bool(self.item.get("name"))
        if self.item.get("kind"):
            self.classes[self.item["kind"]] = True
