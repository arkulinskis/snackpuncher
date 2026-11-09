from anvil import *

from ._anvil_designer import EmojiTemplate


class Emoji(EmojiTemplate):
    """One emoji in the village diorama (a house, a tree, a villager). item = {text}."""

    def __init__(self, **properties):
        super().__init__(**properties)
