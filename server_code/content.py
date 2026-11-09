"""The world of Snackpuncher: lands, territories, villagers, collectibles, moves, upgrades and the story.

Plain data, the single source of truth. Game.py sends it to the browser (get_game) and uses it to work out
rewards. Ids are stable: territory "<land>-<1..5>" (5 = the land's boss), item "<land>-<category>".
Change names and text freely; don't rename ids once players have progress.
"""

# ------------------------------------------------------------------------------------------- moves + muscles
MUSCLES = [("shoulders", "Shoulders"), ("arms", "Arms"), ("chest", "Chest"), ("back", "Back"), ("core", "Core"), ("legs", "Legs")]

MOVES: dict = {
    "jab": {"name": "Jab", "icon": "👊", "muscles": {"shoulders": .5, "arms": .3, "core": .2},
            "how": "Punch straight through the snack. Snap it back to your guard."},
    "hook": {"name": "Hook", "icon": "🪝", "muscles": {"chest": .45, "core": .35, "shoulders": .2},
             "how": "Swing in from the side, turning your hips, like slamming a gate."},
    "uppercut": {"name": "Uppercut", "icon": "⤴️", "muscles": {"arms": .45, "core": .35, "legs": .2},
                 "how": "Bend your knees a little and drive up from the hips."},
    "hammer": {"name": "Hammer fist", "icon": "🔨", "muscles": {"back": .5, "shoulders": .3, "core": .2},
               "how": "Raise your fist and bring it down like a smith's hammer."},
    "lunge": {"name": "Lunge punch", "icon": "🦵", "muscles": {"legs": .6, "core": .25, "shoulders": .15},
              "how": "Step out wide, bend the knee, punch the low snack."},
    "duck": {"name": "Duck", "icon": "⬇️", "muscles": {"legs": .8, "core": .2},
             "how": "Squat under the breadstick log. Back straight, knees over toes."},
    "lean": {"name": "Lean", "icon": "↔️", "muscles": {"core": .8, "legs": .2},
             "how": "Lean your head away from the soda splash. Feet stay put."},
    "block": {"name": "Block", "icon": "🛡️", "muscles": {"shoulders": .5, "core": .3, "arms": .2},
              "how": "Both fists up in front of your face until the sauce ball bursts."},
    "flurry": {"name": "Flurry", "icon": "💥", "muscles": {"arms": .4, "shoulders": .4, "core": .2},
               "how": "Punch the cage as fast as you can to free the villager."},
}

INTENSITY: dict = {  # chart density, snack speed (lead seconds), punch speed needed, MET for the calorie estimate
    "gentle": {"name": "Gentle", "density": .55, "lead": 2.3, "speed": 1.0, "met": 5.0, "boss_hp": .6},
    "steady": {"name": "Steady", "density": .8, "lead": 1.9, "speed": 1.35, "met": 7.0, "boss_hp": .7},
    "beast": {"name": "Beast", "density": 1.0, "lead": 1.55, "speed": 1.7, "met": 9.0, "boss_hp": .8},
}

# ------------------------------------------------------------------------------------------- collectibles
CATEGORIES = [
    {"key": "seeds", "name": "Heirloom Seeds", "emoji": "🌱", "skin": "Sprout", "color": "#5a9b3c",
     "blurb": "Every seed the Horde paved over. Plant them and real food grows back."},
    {"key": "herbs", "name": "Wild Herbs", "emoji": "🌿", "skin": "Herbwarden", "color": "#3f8f6b",
     "blurb": "The smells of a proper kitchen: green, sharp and alive."},
    {"key": "fruits", "name": "Orchard Fruits", "emoji": "🍎", "skin": "Orchard", "color": "#c8452f",
     "blurb": "Sweet things that never went near a fryer."},
    {"key": "spices", "name": "Spices & Salts", "emoji": "🧂", "skin": "Saffron", "color": "#d89a2b",
     "blurb": "A pinch of the real thing beats a bucket of seasoning dust."},
    {"key": "scrolls", "name": "Recipe Scrolls", "emoji": "📜", "skin": "Scribe", "color": "#a07a4a",
     "blurb": "Lost recipes of Nourra, rescued page by page."},
    {"key": "runes", "name": "Element Runes", "emoji": "💠", "skin": "Runic", "color": "#4a76c4",
     "blurb": "Stones that hum with each land's element."},
    {"key": "banners", "name": "Territory Banners", "emoji": "🚩", "skin": "Banneret", "color": "#b8323a",
     "blurb": "Raised over every territory you take back from the Horde."},
    {"key": "critters", "name": "Rescued Critters", "emoji": "🐾", "skin": "Wildfriend", "color": "#8a6a3c",
     "blurb": "Small friends who hid from the grease and came out for you."},
    {"key": "utensils", "name": "Legendary Utensils", "emoji": "🥄", "skin": "Silverware", "color": "#8f9aa6",
     "blurb": "Each boss guarded a utensil of legend. Now they hang in your hall."},
    {"key": "verses", "name": "Bard's Verses", "emoji": "🎵", "skin": "Minstrel", "color": "#7b4fa0",
     "blurb": "The Song of the Everpot, one verse per land. Olive knows the tune."},
]
CAT_KEYS = [c["key"] for c in CATEGORIES]

# ------------------------------------------------------------------------------------------- the ten lands
# Each land: territories 1-4 rescue a villager; 5 is the boss. Items: one per category, in CAT_KEYS order
# (name, emoji, type, flavour). Territory n gives CAT_KEYS[2n-2] on first clear and CAT_KEYS[2n-1] at 3 stars.
LANDS: list = [
    {"key": "meadow", "name": "Meadowmere", "element": "Earth", "emoji": "🌾", "bpm": 96,
     "blurb": "Rolling green fields where fries now grow in rows. A gentle start: jabs, ducks and leans.",
     "sky": ["#8ec9e8", "#fdf0cf"], "ground": "#7fa65a", "path": "#e7d5a5", "accent": "#e8b93a", "fog": "#e9f1dc",
     "props": "meadow", "moves": ["jab", "duck", "lean"], "emphasis": ["jab"],
     "enemies": ["fries", "nugget", "burger"],
     "boss": {"name": "The Fry Golem", "model": "fries", "blurb": "A walking fryer basket, ten feet of salted wedges."},
     "territories": [
         ("Buttercup Lane", ("Farmer Hettie", "Carrot farmer", "👩‍🌾", "My carrots were swapped for crinkle-cut fries. CRINKLE-CUT!")),
         ("Old Mill Crossing", ("Bran the Miller", "Miller", "🧔", "Flour, not fryer oil. Was that so hard?")),
         ("Hedgehog Hollow", ("Little Tumble", "Very brave child", "🧒", "I punched a nugget once. It said 'ow' in a tiny voice.")),
         ("Thistledown Farm", ("Goodwife Sorrel", "Beekeeper", "👵", "Bless your knuckles, dear. Have a honey cake.")),
         ("The Golem's Fryer", None),
     ],
     "items": [
         ("Sunny Bean", "🫘", "Bean", "Grows a beanstalk exactly one hero tall."),
         ("Meadow Mint", "🌿", "Herb", "Smells like the first morning of spring."),
         ("Buttercup Apple", "🍏", "Apple", "Crunchy enough to scare a fry."),
         ("Clover Salt", "🧂", "Salt", "Harvested from the dew on four-leaf clovers."),
         ("Garden Soup Scroll", "📜", "Recipe", "Grandmother's soup. Serves a village."),
         ("Rune of Roots", "🟢", "Earth rune", "Warm to the touch, like soil in June."),
         ("Buttercup Banner", "🚩", "Banner", "Yellow as butter, flown over Meadowmere."),
         ("Pip the Hedgehog", "🦔", "Hedgehog", "Rolls into a ball when fries walk by."),
         ("Wooden Spoon of Courage", "🥄", "Spoon", "Every hero starts with a wooden spoon."),
         ("Verse I: The Everpot", "🎵", "Verse", "'Once a pot in Nourra's heart, fed us all, both whole and part...'"),
     ]},
    {"key": "ember", "name": "Ember Hollow", "element": "Fire", "emoji": "🔥", "bpm": 102,
     "blurb": "Volcanic forges overrun by hot wings. Uppercuts from the hips.",
     "sky": ["#3b1d18", "#f19a52"], "ground": "#5c3a2c", "path": "#8a5a3c", "accent": "#ff7a2f", "fog": "#6b3424",
     "props": "ember", "moves": ["jab", "uppercut", "duck", "lean"], "emphasis": ["uppercut"],
     "enemies": ["wing", "hotdog", "chip"],
     "boss": {"name": "Blazewing the Wyvern", "model": "wing", "blurb": "A dragon-sized buffalo wing with a temper to match."},
     "territories": [
         ("Cinder Steps", ("Ash the Charcoal-Burner", "Charcoal burner", "🧑‍🏭", "Smoke I can live with. Smoke that tastes of ranch? No.")),
         ("Smokebarrel Forge", ("Pip and Pim Pepper", "Pepper twins", "👯", "We'd like to file a complaint about the wings. All of them.")),
         ("Charcoal Chapel", ("Sister Cinder", "Bell-ringer", "👩‍🦰", "They deep-fried the bells. Now they go bong-CRUNCH.")),
         ("Pepperflame Pass", ("Old Tom Tinder", "Retired fire-eater", "👴", "Took you long enough! Kidding. My knees are just stiff.")),
         ("The Wyvern's Grill", None),
     ],
     "items": [
         ("Flamepod Seed", "🌰", "Pod", "Sprouts only in warm ash."),
         ("Smoky Thyme", "🌿", "Herb", "Thyme that remembers every campfire."),
         ("Ember Plum", "🍑", "Plum", "Glows faintly in the dark. Delicious."),
         ("Dragon Peppercorn", "🌶️", "Pepper", "One grain warms a whole stew."),
         ("Firepit Bread Scroll", "📜", "Recipe", "Flatbread baked on a hot stone."),
         ("Rune of Flame", "🔴", "Fire rune", "Hot enough to toast a marshmallow."),
         ("Cinder Banner", "🚩", "Banner", "Singed at the edges, proudly."),
         ("Sparky the Salamander", "🦎", "Salamander", "Eats cold embers. Loves cuddles."),
         ("Tongs of the First Fire", "🥢", "Tongs", "Never dropped a coal in a thousand years."),
         ("Verse II: The Fire", "🎵", "Verse", "'...lit with ember, stoked with care, steam of plenty in the air...'"),
     ]},
    {"key": "frost", "name": "Frostfjord", "element": "Ice", "emoji": "❄️", "bpm": 106,
     "blurb": "A frozen fjord of milkshakes and soft-serve. Lots of ducking: your legs will feel it.",
     "sky": ["#a9d3ee", "#f4fbff"], "ground": "#e3eef5", "path": "#bcd6e6", "accent": "#7cc3ef", "fog": "#e8f4fb",
     "props": "frost", "moves": ["jab", "uppercut", "duck", "lean", "block"], "emphasis": ["duck", "block"],
     "enemies": ["shake", "cone", "slush"],
     "boss": {"name": "The Brain-Freeze Behemoth", "model": "shake", "blurb": "A milkshake the size of a longhouse. Do not drink."},
     "territories": [
         ("Glacier Gate", ("Captain Floe", "Ship's captain", "🧑‍✈️", "A milkshake stole my ship. Nobody believes me.")),
         ("Icicle Docks", ("Mittens", "Yak herder", "🧑", "The yaks like you. Yaks are excellent judges.")),
         ("Snowdrift Abbey", ("Brother Hush", "Silent monk", "🧑‍🦲", "...(He has taken a vow of silence. He bows very deeply.)")),
         ("Frozen Falls", ("Yrsa the Ice-Cutter", "Ice cutter", "👩", "Three weeks of brain freeze. Never again.")),
         ("The Behemoth's Freezer", ("Granny Marrow", "Legendary smith-cook", "👵", "Put me down, I can walk! Now, where's my anvil?")),
     ],
     "items": [
         ("Frostbarley", "🌾", "Grain", "Grows under snow, sweet as porridge."),
         ("Snowmint", "🌿", "Herb", "So cool it fogs your breath."),
         ("Cloudberry", "🫐", "Berry", "Picked at midnight under the aurora."),
         ("Glacier Salt", "🧂", "Salt", "Ten thousand years old. Still salty."),
         ("Fjord Porridge Scroll", "📜", "Recipe", "Oats, cloudberries, a lot of stirring."),
         ("Rune of Ice", "🔵", "Ice rune", "Keeps your lunch cold forever."),
         ("Glacier Banner", "🚩", "Banner", "Stiff with frost, flying anyway."),
         ("Snoot the Arctic Fox", "🦊", "Fox", "Sneezes snowflakes."),
         ("The Frost Whisk", "🥄", "Whisk", "Whips cream in one turn."),
         ("Verse III: The Cold", "🎵", "Verse", "'...cold it slept when grease came in, the ladle cracked, the pot ran thin...'"),
     ]},
    {"key": "salt", "name": "Saltmarsh Coast", "element": "Water", "emoji": "🌊", "bpm": 110,
     "blurb": "A salty coast where the fish sticks are not fish. Hooks from the side.",
     "sky": ["#86c6dc", "#eaf6f1"], "ground": "#dcc79c", "path": "#efe2c2", "accent": "#2f9fb8", "fog": "#d8ece9",
     "props": "salt", "moves": ["jab", "hook", "uppercut", "duck", "lean", "block"], "emphasis": ["hook"],
     "enemies": ["fishstick", "shrimp", "pretzel"],
     "boss": {"name": "Admiral Fishstick", "model": "fishstick", "blurb": "Commands a fleet of frozen rectangles."},
     "territories": [
         ("Brinewater Pier", ("Net-mender Wendle", "Fisher", "🧓", "The fish sticks are not fish. I checked. Twice.")),
         ("Shellbone Beach", ("Pearl", "Shell collector", "👧", "I found 400 shells and one shrimp who would not stop yelling.")),
         ("Lighthouse of Tides", ("Keeper Lumen", "Lighthouse keeper", "👨‍🦳", "They made my lighthouse a heat lamp. Ships came in for nuggets.")),
         ("The Sunken Galley", ("Cook Brine", "Ship's cook", "🧑‍🍳", "I'm a cook. A REAL one. Let me at a kitchen.")),
         ("The Admiral's Flagship", None),
     ],
     "items": [
         ("Sea Kelp Spore", "🟤", "Spore", "Becomes a kelp forest. Eventually."),
         ("Samphire", "🌿", "Herb", "The salty green the sea grows for itself."),
         ("Tidepool Grape", "🍇", "Grape", "Grows on rocks, tastes like summer."),
         ("Tidal Flake Salt", "🧂", "Salt", "Crunchy flakes from the high-tide line."),
         ("Chowder Scroll", "📜", "Recipe", "Thick, creamy, not one fish stick."),
         ("Rune of Tides", "🔷", "Water rune", "Hums like a shell held to your ear."),
         ("Lighthouse Banner", "🚩", "Banner", "Seen from three bays away."),
         ("Captain Claws", "🦀", "Crab", "Walks sideways, judges forwards."),
         ("The Mariner's Ladle", "🥄", "Ladle", "Ladled soup in forty storms. Spilled none."),
         ("Verse IV: The Sea", "🎵", "Verse", "'...salt of sea to temper true, honey of storm to bind it through...'"),
     ]},
    {"key": "storm", "name": "Thunder Steppes", "element": "Lightning", "emoji": "⚡", "bpm": 114,
     "blurb": "Endless prairie and fizzing soda storms. Lean, lean, lean.",
     "sky": ["#3f4675", "#aab6e3"], "ground": "#8c9a68", "path": "#c9c29a", "accent": "#ffd23f", "fog": "#7d86ad",
     "props": "storm", "moves": ["jab", "hook", "uppercut", "duck", "lean", "block"], "emphasis": ["lean", "hook"],
     "enemies": ["can", "cola", "popcorn"],
     "boss": {"name": "The Fizzlord", "model": "can", "blurb": "A soda can so shaken it is mostly lightning."},
     "territories": [
         ("Rumble Ridge", ("Rider Gale", "Horse rider", "🏇", "My horse drank an energy soda. She is still running. Somewhere.")),
         ("Static Prairie", ("Ozzy", "Weathervane fixer", "🧑‍🔧", "Hold this. No, the other end. Sorry, that end's live.")),
         ("Sparkwind Tower", ("Professor Volta", "Scientist", "🧑‍🔬", "Fascinating! The cans fizz at 47 bubbles a second!")),
         ("Hive of the Bee Queen", ("Queen Melisandra", "Queen of the Bees", "🐝", "Bzz. You have my thanks, hero. My honey is yours once the Fizzlord falls.")),
         ("The Fizzlord's Spire", None),
     ],
     "items": [
         ("Thunderwheat", "🌾", "Grain", "Grows taller every time it thunders."),
         ("Storm Sage", "🌿", "Herb", "Crackles when you crush it."),
         ("Lightning Lemon", "🍋", "Lemon", "So sour it makes your hair stand up."),
         ("Spark Pepper", "🌶️", "Pepper", "Tingles. Then tingles more."),
         ("Prairie Pie Scroll", "📜", "Recipe", "Wheat crust, wild berries, one thunderclap."),
         ("Rune of Storms", "🟡", "Storm rune", "Never touch it with wet hands."),
         ("Sparkwind Banner", "🚩", "Banner", "Lightning hit it twice. Still flying."),
         ("Zip the Hare", "🐇", "Hare", "Fastest thing on the steppes. Second: you."),
         ("The Thunder Grater", "🧀", "Grater", "Grates cheese at the speed of light."),
         ("Verse V: The Storm", "🎵", "Verse", "'...iron of cheese to hold the grip, mend the ladle, tip to tip...'"),
     ]},
    {"key": "cheddar", "name": "Cheddar Caverns", "element": "Stone", "emoji": "🧀", "bpm": 118,
     "blurb": "Deep caves of very rude cheese. Hammer fists for a strong back.",
     "sky": ["#2a2119", "#6d5640"], "ground": "#6a5743", "path": "#8f7655", "accent": "#f2b632", "fog": "#3a2f25",
     "props": "cheddar", "moves": ["jab", "hook", "uppercut", "hammer", "duck", "lean", "block"], "emphasis": ["hammer"],
     "enemies": ["nacho", "cheesewheel", "quesadilla"],
     "boss": {"name": "The Nacho Colossus", "model": "nacho", "blurb": "A mountain of chips glued together with angry cheese."},
     "territories": [
         ("Rindstone Mines", ("Miner Gruff", "Miner", "⛏️", "Forty years down here and I've never met cheese this rude.")),
         ("Gouda Galleries", ("Gertrude", "Cave painter", "👩‍🎨", "The galleries are art. The nachos are graffiti.")),
         ("Crystal Curd Lake", ("Skipper Curd", "Ferry skipper", "🛶", "The lake squeaks when you row. That's normal for curd.")),
         ("Molten Queso Falls", ("Fondue", "Firewatcher", "🧑‍🚒", "Molten queso is not a bath. I learned that the hard way.")),
         ("The Colossus Quarry", None),
     ],
     "items": [
         ("Cave Mushroom Spore", "🍄", "Mushroom", "Grows in the dark, tastes like the forest."),
         ("Rock Rosemary", "🌿", "Herb", "Tough as stone, smells like Sunday."),
         ("Glowpear", "🍐", "Pear", "Lights up a cave tunnel. Then you eat it."),
         ("Crystal Rock Salt", "🧂", "Salt", "Pink, sparkly, sensible."),
         ("Miner's Pie Scroll", "📜", "Recipe", "Fits in a pocket. Lasts a shift."),
         ("Rune of Stone", "🟫", "Stone rune", "Heavy. Very heavy. Don't drop it."),
         ("Rindstone Banner", "🚩", "Banner", "Stitched by miners by lamplight."),
         ("Boulder the Mole", "🐹", "Mole", "Digs tunnels in the shape of hearts."),
         ("The Cheddar Cleaver", "🔪", "Cleaver", "Cuts any cheese. Even the rude ones."),
         ("Verse VI: The Stone", "🎵", "Verse", "'...mended whole yet fast asleep, a ladle needs a song to keep...'"),
     ]},
    {"key": "sugar", "name": "Sugarspire Peaks", "element": "Air", "emoji": "🍩", "bpm": 122,
     "blurb": "Floating peaks of spun sugar. Block the sprinkle cannons, hammer down hard.",
     "sky": ["#f7c6dc", "#dbeaff"], "ground": "#f2dfe9", "path": "#fff3e0", "accent": "#ef6fa8", "fog": "#f6e6f0",
     "props": "sugar", "moves": ["jab", "hook", "uppercut", "hammer", "duck", "lean", "block"], "emphasis": ["block", "hammer"],
     "enemies": ["donut", "churro", "cotton"],
     "boss": {"name": "Duchess Donutella", "model": "donut", "blurb": "Glazed, sprinkled and absolutely furious."},
     "territories": [
         ("Sprinkle Stairs", ("Sprinkle", "A kid", "🧒", "I ate ONE donut. One. And I ended up in a cage.")),
         ("Meringue Monastery", ("Abbot Meringue", "Abbot", "🧙", "We meditate on lightness. The donuts meditate on frying.")),
         ("Windmill of Whirls", ("Windmiller Whirl", "Windmiller", "🧑‍🌾", "My windmill spun cotton candy. My beard will never recover.")),
         ("Caramel Cliffs", ("Kestrel", "Cliff climber", "🧗", "Caramel cliffs: great grip, terrible for gloves.")),
         ("Donutella's Palace", None),
     ],
     "items": [
         ("Cloudcorn Seed", "🌽", "Corn", "Grows sideways in the wind."),
         ("Sky Lavender", "💐", "Herb", "Smells like flying."),
         ("Peak Peach", "🍑", "Peach", "Fuzzy, sweet, slightly airborne."),
         ("Wind Cinnamon", "🟠", "Spice", "Curls of bark from the windward trees."),
         ("Cloud Pancake Scroll", "📜", "Recipe", "So fluffy you need a paperweight."),
         ("Rune of Winds", "⚪", "Wind rune", "Whistles a tune nobody taught it."),
         ("Monastery Banner", "🚩", "Banner", "Embroidered by very patient monks."),
         ("Puff the Owlet", "🦉", "Owlet", "A ball of feathers with opinions."),
         ("The Sky Rolling Pin", "🪵", "Rolling pin", "Rolls dough thin enough to see through."),
         ("Verse VII: The Wind", "🎵", "Verse", "'...wind to carry, voice to wake, one clear note for Nourra's sake...'"),
     ]},
    {"key": "bog", "name": "Grease Bog", "element": "Poison", "emoji": "🫧", "bpm": 126,
     "blurb": "A swamp of deep-fried everything. Wide lunges keep you out of the batter.",
     "sky": ["#2f3a22", "#93a656"], "ground": "#4d4e2c", "path": "#7a744a", "accent": "#b6d14a", "fog": "#55613a",
     "props": "bog", "moves": ["jab", "hook", "uppercut", "hammer", "lunge", "duck", "lean", "block"], "emphasis": ["lunge"],
     "enemies": ["corndog", "onionring", "mozz"],
     "boss": {"name": "The Deep-Fryer Hag", "model": "corndog", "blurb": "She battered the whole bog. Then she battered herself."},
     "territories": [
         ("Oilslick Ford", ("Ferrywoman Mire", "Ferrywoman", "🚣", "Batter on the oars. Batter on the ferry. Batter in my HAIR.")),
         ("Battered Bayou", ("Toadbert", "A toad", "🐸", "Ribbit. (Toadbert says thank you. Toadbert is a toad.)")),
         ("Croaking Cauldrons", ("Witch Wendolyn", "Good witch", "🧙‍♀️", "Good witch. Real cauldrons. Soup only, I swear.")),
         ("Willow of Lost Recipes", ("Olive the Bard", "Bard", "🎻", "*croak* ...my voice... the fumes took it... *croak*")),
         ("The Hag's Vat", None),
     ],
     "items": [
         ("Bog Rice", "🍚", "Rice", "Loves wet feet. Hates batter."),
         ("Marsh Dill", "🌿", "Herb", "Feathery, fresh, fries-proof."),
         ("Swamp Fig", "🟣", "Fig", "Ugly outside, glorious inside."),
         ("Witch's Mustard Seed", "🟡", "Mustard", "A spell in every grain."),
         ("Cauldron Stew Scroll", "📜", "Recipe", "Wendolyn's own. Soup only."),
         ("Rune of Mire", "🟩", "Mire rune", "Bubbles quietly. Smells fine."),
         ("Bayou Banner", "🚩", "Banner", "Waterproof, battered-proof."),
         ("Croak the Frog Prince", "🐸", "Frog", "Not actually a prince. Doesn't know that."),
         ("The Skimmer of Truth", "🥄", "Skimmer", "Skims the grease off any lie."),
         ("Verse VIII: The Bog", "🎵", "Verse", "'...lemon bright to clear the throat, sing the ladle back afloat...'"),
     ]},
    {"key": "gloom", "name": "Gloomfry Woods", "element": "Shadow", "emoji": "🌑", "bpm": 130,
     "blurb": "A dark wood of burnt burgers and mystery meat. Everything at once, in the dark.",
     "sky": ["#14122a", "#4a3d6c"], "ground": "#2a2539", "path": "#4a4160", "accent": "#b58cff", "fog": "#221d36",
     "props": "gloom", "moves": ["jab", "hook", "uppercut", "hammer", "lunge", "duck", "lean", "block"], "emphasis": ["block", "lean"],
     "enemies": ["burnt", "mystery", "taco"],
     "boss": {"name": "The Mystery Meat Wraith", "model": "mystery", "blurb": "Nobody knows what it is. Not even it."},
     "territories": [
         ("Moonless Path", ("Lamplighter Wick", "Lamplighter", "🕯️", "Every lantern was a heat lamp. Every. Single. One.")),
         ("Owl-Eyed Grove", ("Owlessa", "Wise owl", "🦉", "Hoo saved me? You did. Hoo-ray.")),
         ("Lantern Graveyard", ("Gravedigger Moss", "Gravedigger", "🧑‍🌾", "Buried twelve burnt burgers today. They keep climbing out.")),
         ("Thornwood Labyrinth", ("Sir Thorn", "Lost knight", "🤺", "I've been lost in this maze for a year. Is it Tuesday?")),
         ("The Wraith's Hollow", None),
     ],
     "items": [
         ("Nightshade Bean", "⚫", "Bean", "Only sprouts by moonlight. Totally safe."),
         ("Shadow Basil", "🌿", "Herb", "Darker leaves, brighter flavour."),
         ("Moonlemon", "🍋", "Lemon", "Glows silver. Clears any throat."),
         ("Midnight Pepper", "⚫", "Pepper", "You can't see it, but you can taste it."),
         ("Lantern Soup Scroll", "📜", "Recipe", "Best eaten by candlelight."),
         ("Rune of Shadow", "🟣", "Shadow rune", "Hides in its own shadow."),
         ("Grove Banner", "🚩", "Banner", "Woven from moonlight and owl feathers."),
         ("Wisp the Bat", "🦇", "Bat", "Hangs upside down. Thinks you're upside down."),
         ("The Lantern Spatula", "🍳", "Spatula", "Flips pancakes in total darkness."),
         ("Verse IX: The Night", "🎵", "Verse", "'...through the dark the ladle stirs, the Everpot awakes and purrs...'"),
     ]},
    {"key": "citadel", "name": "The Drive-Thru Citadel", "element": "Gold", "emoji": "👑", "bpm": 134,
     "blurb": "The Deep-Fried King's drive-thru fortress. The final feast.",
     "sky": ["#2b1a12", "#e7ad4a"], "ground": "#6b4a2b", "path": "#a37b48", "accent": "#ffcc33", "fog": "#4a3020",
     "props": "citadel", "moves": ["jab", "hook", "uppercut", "hammer", "lunge", "duck", "lean", "block"], "emphasis": [],
     "enemies": ["burger", "fries", "shake", "pizza"],
     "boss": {"name": "The Deep-Fried King", "model": "king", "blurb": "Triple-stacked, extra cheese, no mercy."},
     "territories": [
         ("Speaker-Box Gate", ("Drive-Thru Dora", "Order taker", "👩‍💼", "Ten years of taking orders. Now I give one: GET HIM.")),
         ("Conveyor Courtyard", ("Fennel", "Fry cook", "🧑‍🍳", "I quit. Effective immediately. Thank you so much.")),
         ("Heat-Lamp Hall", ("Muffin", "Former mascot", "🧸", "They made me wear the costume. Please burn the costume.")),
         ("Toppings Vault", ("Prince Parsnip", "Royal heir", "🤴", "Locked in the toppings vault. I'm allergic to toppings.")),
         ("Throne of Ten Toppings", None),
     ],
     "items": [
         ("Golden Wheat", "🌾", "Grain", "The last true grain in the King's vault."),
         ("Royal Parsley", "🌿", "Herb", "Finally, a garnish that gets eaten."),
         ("Sun Orange", "🍊", "Orange", "Peels itself out of joy."),
         ("Crown Saffron", "🟧", "Saffron", "Worth more than the crown it came from."),
         ("Everpot Feast Scroll", "📜", "Recipe", "The recipe that fed the whole realm."),
         ("Rune of Plenty", "🌟", "Gold rune", "Warm, bright, and always full."),
         ("Banner of Nourra", "🚩", "Banner", "The realm's own flag, back on the tower."),
         ("Sir Waddles the Goose", "🪿", "Goose", "Honks at fast food on sight."),
         ("The Ladle of Plenty", "🥄", "Ladle", "Whole, awake, and stirring."),
         ("Verse X: The Feast", "🎵", "Verse", "'...and every bowl in Nourra filled. The Everpot stirs. The grease is stilled.'"),
     ]},
]

LAND_KEYS = [L["key"] for L in LANDS]
TRAINING = "training"


def territory_ids():
    return [tid for L in LANDS for tid in (L["key"] + "-%d" % n for n in range(1, 6))]


def split_tid(tid):
    """'frost-3' -> (land index 2, territory number 3), or None."""
    if not isinstance(tid, str) or "-" not in tid:
        return None
    key, _, n = tid.rpartition("-")
    if key not in LAND_KEYS or n not in ("1", "2", "3", "4", "5"):
        return None
    return LAND_KEYS.index(key), int(n)


def items_for(tid):
    """(first-clear item id, three-star item id) for a territory."""
    li, n = split_tid(tid)
    land = LANDS[li]["key"]
    return "%s-%s" % (land, CAT_KEYS[2 * n - 2]), "%s-%s" % (land, CAT_KEYS[2 * n - 1])


ITEMS = {}
for _L in LANDS:
    for _i, (_name, _emoji, _type, _flavour) in enumerate(_L["items"]):
        _cat = CAT_KEYS[_i]
        _n = _i // 2 + 1
        ITEMS["%s-%s" % (_L["key"], _cat)] = {
            "name": _name, "emoji": _emoji, "type": _type, "flavour": _flavour, "cat": _cat, "land": _L["key"],
            "from": "%s-%d" % (_L["key"], _n), "stars": 3 if _i % 2 else 1,
            "rarity": "legendary" if _n == 5 else ("rare" if _i % 2 else "common")}

VILLAGERS = {}
for _L in LANDS:
    for _n, (_tname, _v) in enumerate(_L["territories"], 1):
        if _v:
            VILLAGERS["%s-%d" % (_L["key"], _n)] = {"name": _v[0], "role": _v[1], "emoji": _v[2], "quip": _v[3], "land": _L["key"]}

# ------------------------------------------------------------------------------------------- the cast + the story
CAST = {
    "pickles": {"name": "Pickles", "emoji": "🥒", "role": "A pickle who escaped from a burger. Has seen things."},
    "brocco": {"name": "Sir Broccolot", "emoji": "🥦", "role": "Knight of the Crisp Order. Four inches tall. Thinks he's the hero."},
    "granny": {"name": "Granny Marrow", "emoji": "👵", "role": "The last smith-cook who can mend the Ladle of Plenty."},
    "queen": {"name": "Queen Melisandra", "emoji": "🐝", "role": "Queen of the Thunder Bees, keeper of Storm Honey."},
    "olive": {"name": "Olive the Bard", "emoji": "🎻", "role": "Knows the Song of the Everpot. Lost her voice to the fumes."},
    "king": {"name": "The Deep-Fried King", "emoji": "🍔", "role": "Triple-stacked tyrant of the Greasy Horde."},
    "narrator": {"name": "The Storyteller", "emoji": "📖", "role": ""},
}

KEY_ITEMS = {
    "ladle_broken": {"name": "Broken Ladle of Plenty", "emoji": "🥄", "blurb": "Snapped in three. Still faintly warm."},
    "coal": {"name": "Everburning Coal", "emoji": "🔥", "blurb": "Granny's forge will need it. It never goes out."},
    "salt": {"name": "Tidal Sea Salt", "emoji": "🧂", "blurb": "Tempers metal. Also great on chips. Real chips."},
    "honey": {"name": "Storm Honey", "emoji": "🍯", "blurb": "Binds anything. Crackles faintly."},
    "iron": {"name": "Cheddar Iron", "emoji": "⛓️", "blurb": "Iron from the cheese caves. Strong, slightly smelly."},
    "ladle_mended": {"name": "Mended Ladle (asleep)", "emoji": "🥄", "blurb": "Whole again, but cold and silent."},
    "fiddle": {"name": "Olive's Wind Fiddle", "emoji": "🎻", "blurb": "Plays itself when the wind is right."},
    "moonlemon": {"name": "A Moonlemon", "emoji": "🍋", "blurb": "Clears any throat. Glows silver."},
    "ladle": {"name": "Ladle of Plenty (awake)", "emoji": "✨", "blurb": "Humming, glowing, ready to stir."},
    "everpot": {"name": "The Everpot, restored", "emoji": "🍲", "blurb": "Bubbling again for every village in Nourra."},
}

# What clearing each land's boss adds to your key items (by land index), and the quest that follows.
BOSS_KEY_ITEMS = [["ladle_broken"], ["coal"], [], ["salt"], ["honey"], ["iron", "ladle_mended"], ["fiddle"], [], ["moonlemon", "ladle"], ["everpot"]]
OBJECTIVES = [
    "Free Meadowmere. Something glints inside the Fry Golem's basket.",
    "The Ladle of Plenty is broken. Cross Ember Hollow toward the old smith, Granny Marrow.",
    "Reach Frostfjord and free Granny Marrow from the Behemoth's Freezer.",
    "Granny needs Tidal Sea Salt, Storm Honey and Cheddar Iron. First stop: the Saltmarsh Coast.",
    "Two ingredients to go. The Storm Honey is with the Bee Queen in the Thunder Steppes.",
    "Last ingredient: Cheddar Iron, deep in the Cheddar Caverns.",
    "The Ladle is mended but asleep. It needs a song. Find Olive the Bard's Wind Fiddle in Sugarspire Peaks.",
    "Olive herself is trapped in the Grease Bog. Go and get her.",
    "Olive lost her voice to the fumes. Only a Moonlemon from Gloomfry Woods can bring it back.",
    "The Ladle is awake! Storm the Drive-Thru Citadel and face the Deep-Fried King.",
    "The Everpot bubbles again. Chase every star, free everyone, and fill your satchel.",
]

# Scenes: "arrive-<land>" plays before the land's first battle, "boss-<land>" after its boss falls.
SCENES = {
    "arrive-meadow": {"title": "The Pickle in the Hedge", "lines": [
        ("narrator", "Once, the Everpot of Nourra fed every village with good, honest food."),
        ("narrator", "Then the Deep-Fried King rolled in on a tide of grease, broke the Ladle of Plenty and set his Greasy Horde loose."),
        ("pickles", "Psst. Down here. The pickle. I just escaped from a burger. I have seen things."),
        ("brocco", "Fear not, citizens! Sir Broccolot of the Crisp Order is here! ...Who is the giant?"),
        ("pickles", "That's the hero, Broc. Look at those fists."),
        ("brocco", "Ah. Yes. Obviously. Hero, you may assist me."),
    ]},
    "boss-meadow": {"title": "Three Pieces of Trouble", "lines": [
        ("narrator", "The Fry Golem collapses into a pile of soggy wedges. In its basket, something glints."),
        ("pickles", "Is that... the Ladle of Plenty? It's in three pieces. That's the bad kind of three."),
        ("brocco", "I can fix it. With my sword. By hitting it."),
        ("pickles", "Please don't. Only Granny Marrow, the old smith, can mend it. The Horde dragged her north, past Ember Hollow."),
    ]},
    "arrive-ember": {"title": "Wings of Fire", "lines": [
        ("pickles", "It's hot. Pickles do not do well in heat. I am becoming a relish."),
        ("brocco", "A true knight fears no flame! (Hero, stand in front of me.)"),
        ("pickles", "Hot wings everywhere. Remember: uppercuts. Drive up from your hips."),
    ]},
    "boss-ember": {"title": "The Coal That Never Dies", "lines": [
        ("narrator", "Blazewing crashes down in a cloud of hot sauce. Its nest holds a coal that will not go out."),
        ("brocco", "I shall carry it! ...Ow. Ow ow ow. Hero, you carry it."),
        ("pickles", "An Everburning Coal. Granny's forge will need that. Onward to Frostfjord, before Broc melts."),
    ]},
    "arrive-frost": {"title": "Brain Freeze", "lines": [
        ("brocco", "Brrr! A knight's armour is not insulated!"),
        ("pickles", "You're not wearing armour. You're a broccoli."),
        ("pickles", "Milkshakes ahead, hero. They throw breadstick logs. Squat low and keep your back straight."),
    ]},
    "boss-frost": {"title": "Granny Marrow", "lines": [
        ("narrator", "The Behemoth melts into a sad puddle. Frozen inside its freezer: a small, very annoyed old woman."),
        ("granny", "Took your time, didn't you! Give me that Ladle... Hmm. Three pieces. And you brought the coal? Good lad. Good lass. Good fists."),
        ("granny", "To mend it I need Tidal Sea Salt to temper, Storm Honey to bind, and Cheddar Iron for the grip."),
        ("granny", "And while you fetch them, my forge is open. Bring me sprouts and I'll make you proper gauntlets."),
        ("brocco", "Could you forge me a bigger sword?"),
        ("granny", "Could you grow a bigger arm?"),
    ]},
    "arrive-salt": {"title": "Sea Legs", "lines": [
        ("pickles", "Ah, the sea. Salt water. My ancestors."),
        ("brocco", "The fish sticks here march in formation! Hook them from the side, hero, turn those hips."),
    ]},
    "boss-salt": {"title": "Salt of the Sea", "lines": [
        ("narrator", "Admiral Fishstick sinks with his flagship. The tide leaves a ring of glittering salt on the deck."),
        ("pickles", "Tidal Sea Salt. One down, two to go."),
        ("brocco", "I was going to defeat the Admiral myself, but I let you have him. You're welcome."),
    ]},
    "arrive-storm": {"title": "Fizz and Thunder", "lines": [
        ("brocco", "My florets are standing on end!"),
        ("pickles", "That's static. The Fizzlord shakes the soda clouds until they burst. When the splash comes, lean away."),
    ]},
    "boss-storm": {"title": "Storm Honey", "lines": [
        ("narrator", "The Fizzlord goes flat with a long, sad hiss."),
        ("queen", "Bzz. The skies are ours again. Take this Storm Honey, hero. It binds anything that was broken."),
        ("brocco", "Your Majesty, I too was very brave."),
        ("queen", "Bzz. You hid in a flower, little knight."),
    ]},
    "arrive-cheddar": {"title": "Rude Cheese", "lines": [
        ("pickles", "It smells like a cheese that has never apologised for anything."),
        ("brocco", "Hammer fists, hero! Raise high, strike down. Good for the back!"),
    ]},
    "boss-cheddar": {"title": "Mended, Not Mended", "lines": [
        ("narrator", "The Nacho Colossus crumbles. Under it lies a vein of Cheddar Iron."),
        ("granny", "Salt, honey, iron. Stand back. *CLANG* *CLANG* *hiss*"),
        ("granny", "There. Whole again. But feel it: cold. A ladle like this needs a song to wake it."),
        ("pickles", "The Song of the Everpot. Only Olive the Bard knows it. She was last seen playing her Wind Fiddle in Sugarspire."),
    ]},
    "arrive-sugar": {"title": "Sugar Rush", "lines": [
        ("brocco", "Everything here is sticky. My sword is stuck to my shield. My shield is stuck to my face."),
        ("pickles", "Sprinkle cannons ahead. Block with both fists up, and hammer the donuts down."),
    ]},
    "boss-sugar": {"title": "A Fiddle Without a Bard", "lines": [
        ("narrator", "Duchess Donutella topples off her throne. Behind it hangs a fiddle that plays itself in the wind."),
        ("pickles", "Olive's Wind Fiddle! But where's Olive?"),
        ("brocco", "A note tied to it: 'Taken to the bog. Bring snacks. Not those snacks.'"),
    ]},
    "arrive-bog": {"title": "Batter Up", "lines": [
        ("pickles", "Everything here is deep-fried. The mud is deep-fried."),
        ("brocco", "The batter gets everywhere, hero. Step wide and lunge to keep your feet out of it!"),
    ]},
    "boss-bog": {"title": "Olive's Voice", "lines": [
        ("narrator", "The Deep-Fryer Hag falls into her own vat. Olive the Bard tunes her fiddle and opens her mouth..."),
        ("olive", "*croak*"),
        ("pickles", "The fumes took her voice. Wendolyn the witch says only a Moonlemon can bring it back."),
        ("brocco", "And Moonlemons grow in Gloomfry Woods. Where it is very dark. And spooky. I'll guard the rear."),
    ]},
    "arrive-gloom": {"title": "Into the Dark", "lines": [
        ("brocco", "I'm not scared. This is my brave face. You can't see it because it's dark."),
        ("pickles", "Burnt burgers come from every side here. Keep your guard up and your eyes open."),
    ]},
    "boss-gloom": {"title": "The Song of the Everpot", "lines": [
        ("narrator", "The Wraith dissolves into a puff of mystery. A Moonlemon glows silver among the roots."),
        ("olive", "*sip* ...Ahem. La... LA! My voice! Now, the Song of the Everpot!"),
        ("narrator", "Olive sings. The Wind Fiddle plays. The Ladle of Plenty glows warm and gold in your hands."),
        ("granny", "That's my girl. Now go and stir some trouble at the Citadel."),
    ]},
    "arrive-citadel": {"title": "Welcome to the Drive-Thru", "lines": [
        ("king", "WELCOME TO THE CITADEL. CAN I TAKE YOUR ORDER?"),
        ("brocco", "Yes. One order of JUSTICE. Extra large."),
        ("pickles", "...Broc, that was actually good."),
        ("brocco", "I've been practising."),
    ]},
    "boss-citadel": {"title": "The Everpot Bubbles", "lines": [
        ("narrator", "The Deep-Fried King crumbles into a heap of soggy buns. The Ladle of Plenty stirs the Everpot once, twice..."),
        ("narrator", "...and good, honest food flows to every village in Nourra."),
        ("granny", "Not bad, hero. Not bad at all. Now go and rescue anyone you missed."),
        ("pickles", "I've decided I'm not going back in a burger. I'm going to be a pickle of leisure."),
        ("brocco", "And I shall write the ballad of how I saved Nourra. You're in it. Briefly."),
    ]},
}

# ------------------------------------------------------------------------------------------- upgrades
UPGRADES = [
    {"key": "stew", "name": "Hearty Stew", "emoji": "🍲", "shop": "market", "costs": [60, 140, 260],
     "blurb": "+20 vigor per level, so a few misses won't end your battle."},
    {"key": "pouch", "name": "Sprout Pouch", "emoji": "👝", "shop": "market", "costs": [80, 180, 320],
     "blurb": "+15% sprouts from every battle per level."},
    {"key": "boots", "name": "Bounce Boots", "emoji": "🥾", "shop": "market", "costs": [70, 160],
     "blurb": "A more forgiving window for ducks and leans."},
    {"key": "gauntlets", "name": "Gauntlets", "emoji": "🥊", "shop": "forge", "costs": [120, 220, 360, 520, 750],
     "tiers": ["Oak Mitts", "Copper Knuckles", "Iron Gauntlets", "Ember Gauntlets", "Frostforged Fists", "Ladle-forged Gauntlets"],
     "blurb": "Each tier hits 10% harder and has a slightly bigger strike zone."},
    {"key": "lid", "name": "Pot-Lid Guard", "emoji": "🛡️", "shop": "forge", "costs": [150, 300],
     "blurb": "Each level forgives one miss per battle."},
    {"key": "charm", "name": "Combo Charm", "emoji": "🧿", "shop": "forge", "costs": [200, 400],
     "blurb": "Raises the combo multiplier cap from x4 to x6, then x8."},
    {"key": "rage", "name": "Spice Rage", "emoji": "🌶️", "shop": "forge", "costs": [250, 450],
     "blurb": "Hits fill the rage jar. When it's full, raise both fists above your head: double points for 8 seconds (12 at level 2)."},
]
UPGRADE_KEYS = [u["key"] for u in UPGRADES]

GLOVE_SKINS = [{"key": "classic", "name": "Classic", "color": "#d23a2a", "cat": None}] + \
    [{"key": c["key"], "name": c["skin"], "color": c["color"], "cat": c["key"]} for c in CATEGORIES]

VILLAGE_LEVELS = [(0, "A campfire"), (4, "A few tents"), (10, "A hamlet"), (18, "A village"), (28, "A market town"), (38, "Hearthstead, the jewel of Nourra")]


def public():
    """Everything the browser needs to draw the world (sent by get_game)."""
    lands = []
    for li, L in enumerate(LANDS):
        terrs = []
        for n, (tname, v) in enumerate(L["territories"], 1):
            tid = "%s-%d" % (L["key"], n)
            a, b = items_for(tid)
            terrs.append({"id": tid, "n": n, "name": tname, "boss": n == 5, "villager": tid if tid in VILLAGERS else None,
                          "items": [a, b]})
        land = {k: L[k] for k in ("key", "name", "element", "emoji", "bpm", "blurb", "sky", "ground", "path", "accent",
                                  "fog", "props", "moves", "emphasis", "enemies", "boss")}
        land.update(index=li, territories=terrs)
        lands.append(land)
    return {
        "lands": lands, "categories": CATEGORIES, "items": ITEMS, "villagers": VILLAGERS, "moves": MOVES,
        "muscles": MUSCLES, "intensity": INTENSITY, "cast": CAST, "key_items": KEY_ITEMS,
        "objectives": OBJECTIVES, "scenes": {k: {"title": s["title"], "lines": [list(x) for x in s["lines"]]} for k, s in SCENES.items()},
        "upgrades": UPGRADES, "skins": GLOVE_SKINS, "village_levels": [list(x) for x in VILLAGE_LEVELS],
    }
