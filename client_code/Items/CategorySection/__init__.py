from anvil import *

from ._anvil_designer import CategorySectionTemplate


class CategorySection(CategorySectionTemplate):
    """Satchel: one collection (10 treasures, one per land). item = {emoji, name, blurb, count, skin, items, page}.
    A treasure click goes to the Satchel page (item['page'].show_item)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        done = i["count"] == 10
        self.seal.classes["gold" if done else "green"] = True
        self.status.text = ("Complete · %s trim" % i["skin"]) if done else "%d / 10" % i["count"]
        self.status.role = ["badge", "badge-gold"] if done else ["badge"]
        self.items_panel.items = i["items"]
        self.items_panel.add_event_handler("x-item", self._item)

    def _item(self, id, **event_args):
        self.item["page"].show_item(id)
