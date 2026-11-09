from anvil import *

from ._anvil_designer import LandCardTemplate


class LandCard(LandCardTemplate):
    """Landing: one of the ten lands. item = {emoji, name, sub}."""

    def __init__(self, **properties):
        super().__init__(**properties)
