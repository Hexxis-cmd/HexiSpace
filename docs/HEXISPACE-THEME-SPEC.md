# HexiSpace theme spec

HexiSpace uses one mythology throughout: Greek deities. A theme is named for one Greek deity, and its colors are a modern interface interpretation of documented domains, attributes, plants, animals, and materials—not a claim that ancient Greeks assigned these exact UI colors to the deity. The deity associations below were checked against the cited mythology references; the palette translations are explicit design choices.

## Static themes

| Theme | Deity and documented association | Palette and gradient rule |
| --- | --- | --- |
| Helios | Sun deity, represented with a radiant crown and solar chariot. [Theoi: Helios](https://www.theoi.com/Titan/Helios.html) | Light warm-white canvas, sun gold, and restrained red-clay highlights. Static ivory-to-warm-sand page gradient; gold is used for emphasis, not body text. |
| Athena | Wisdom, crafts, and strategic defense; associated with the owl and olive tree. [Theoi: Athena](https://www.theoi.com/Olympios/Athena.html) | Deep olive-black, leaf green, and aged bronze. Static charcoal-to-olive gradient. |
| Poseidon | Sea and earthquakes; the trident and marine creatures are defining attributes. [Theoi: Poseidon](https://www.theoi.com/Olympios/Poseidon.html) | Deep ocean blue, marine teal, and pale sea-glass highlights. Static abyss-to-shelf-water gradient. |
| Demeter | Grain, bread, agriculture, and harvest; sheaf of grain and cornucopia are symbols. [Theoi: Demeter](https://www.theoi.com/Olympios/Demeter.html) | Dark fertile soil, wheat gold, and field green. Static earth-to-harvest gradient. |
| Artemis | Hunt, wilderness, and wild animals; a later tradition associates her with the moon. [Theoi: Artemis](https://www.theoi.com/Olympios/Artemis.html) | Forest slate, cool moon-silver, and restrained pine green. Static woodland-night gradient; lunar imagery is not presented as her only or earliest role. |
| Hestia | Hearth, home, and the altar flame. [Theoi: Hestia](https://www.theoi.com/Ouranios/Hestia.html) | Charcoal, hearth umber, and warm ember. Static dark-to-copper gradient. |

## Animated themes

| Theme | Deity and documented association | Palette and gradient rule |
| --- | --- | --- |
| Hermes | Messenger, travel, roads, trade, language, and writing; associated with a herald's wand and winged footwear. [Theoi: Hermes](https://www.theoi.com/Olympios/Hermes.html) | Dusk-blue and quicksilver with courier gold. A low-contrast sky band glides slowly across the background. |
| Hephaestus | Fire, smiths, crafts, and metalworking; hammer and tongs are attributes. [Theoi: Hephaestus](https://www.theoi.com/Olympios/Hephaistos.html) | Forged iron, copper, and furnace amber. A warm forge glow gently swells and recedes. |
| Dionysus | Wine, vegetation, festivity, and transformation; grapevine, ivy, and the thyrsus are attributes. [Theoi: Dionysus](https://www.theoi.com/Olympios/Dionysos.html) | Grape-plum and ivy green. Two subdued organic glows drift in opposite directions. |
| Aphrodite | Love and beauty; rose, myrtle, dove, and sea-born imagery appear in her attributes and traditions. [Theoi: Aphrodite](https://www.theoi.com/Olympios/Aphrodite.html) | The animated light theme: pearl, blush, rose, and a small sea-glass accent. A soft petal-like wash moves slowly without reducing text contrast. |
| Hera | Queen of the gods and goddess of marriage; diadem, sceptre, and peacock are attributes. [Theoi: Hera](https://www.theoi.com/Olympios/Hera.html) | Midnight-violet, royal gold, and peacock teal. Sparse radial glows drift like distant light, without flashing stars. |
| Ares | War and battle; helmet, shield, spear, and bronze-tipped weaponry are associated attributes. [Theoi: Ares](https://www.theoi.com/Olympios/Ares.html) | Iron-black, oxblood, and muted bronze. A narrow red-amber horizon glow moves slowly; no strobing or combat imagery. |

## Shared behavior

- There are six static and six animated themes. Helios is the static light theme and Aphrodite is the animated light theme; the other ten use dark surfaces.
- Every theme defines the same semantic tokens: page, surface, raised surface, border, text, muted text, primary accent and its contrast-tested foreground, secondary accent, warm accent, danger and its contrast-tested foreground, and page gradient.
- Palette values are centralized in `src/lib/theme-system.ts`; CSS supplies layout and the six restrained animated treatments. The SQL migration contains the accepted profile-theme IDs and is checked against the TypeScript registry in tests.
- Gradient color is decorative only. Text and controls use solid semantic tokens; accent-filled controls and danger badges use paired foreground tokens, and animated glows stay behind the interface. The automated contrast test applies the WCAG relative-luminance calculation and requires at least 4.5:1 for normal text, muted text, semantic accents/status colors on each of the three surfaces, and text on accent/danger fills. That test does not replace visual checks for images, browser rendering, or every state in the UI.
- Animated themes use low-cost CSS backgrounds, never WebGL. They stop under `prefers-reduced-motion: reduce`; no theme flashes or moves content.
- Profile themes use the selected deity palette inside the profile space without changing the reader's app-wide theme.
- Existing generic theme IDs are mapped to the closest Greek theme when read. The migration accepts both the new IDs and old IDs so existing rows are not rewritten or lost; newly created profiles default to Hestia, and the next profile save stores the selected Greek theme.

## Research trail

The deity/domain and attribute summaries in the theme tables link to Theoi's deity references, a secondary mythology resource. For readers who want to inspect ancient texts directly, the [Tufts Perseus Digital Library's Homeric Hymns catalog](https://atlas.perseus.tufts.edu/library/urn:cts:greekLit:tlg0013/) lists the relevant hymns: Helios 31; Athena 11 and 28; Poseidon 22; Demeter 2; Artemis 9 and 27; Hestia 24 and 29; Hermes 4 and 18; Hephaestus 20; Dionysus 1, 7, and 26; Aphrodite 5, 6, and 10; Hera 12; Ares 8. The surviving traditions vary across works and periods. The palettes and motion treatments are contemporary design interpretations, not claims about ancient Greek color symbolism.
