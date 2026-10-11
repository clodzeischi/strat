# Art direction

Each faction has its own models and a look you can tell apart at a glance, as in StarCraft. Models are never shared between factions. Technical rules (scale, axes, names, materials, budgets) are in [model-spec.md](model-spec.md).

## Palette

`src/public/models/palette.png` is laid out in [model-spec.md](model-spec.md#palette). In short:
- Each faction has three colors (rows 1–3 of its column).
- Every faction shares the greys and near-black in row 0.
- Column 3 holds the light and screen accents.

## Atreides: expeditionary military

Containerized, modular, rough industrial: a force that arrived by lander and bolted its base together on site. Everything looks armored and rugged. The palette is flat dark earth, like US military vehicles in Iraq.

- **Shapes:** chamfered boxes, armor plates, ISO containers with ribbed sides, tracks, cranes, ladders, crates and supply stacks. No curves where a bevel will do.
- **Colors:**
  - Hull and top plates: `A0987D`.
  - Edge highlights: `D1CBB6`.
  - Secondary panels, ribs and crates: `776A3B`.
  - Tracks, vents, gaps, windows and crane steel: `1D1616` near-black.
  - Plain metal: `515151`.
  - Lights: accent column, sparingly.
- **Team color:** container sides, roof bands and markings, on the `team` material over `C5C5C5`.

### Construction Yard (`conyard`)

A huge tracked lander that has deployed into a base. The command vehicle sits along the diagonal, its nose facing SW, with container wings unfolded to the NW and SE. Together they make an X that fills the square footprint, the way StarCraft buildings do. The corners of the X are filled with containers, crates and construction supplies. A heavy crane rises from the body; it is the `spinner`.

**Level 2** turns the construction yard into a command center: radar dishes, antennas and comms boxes on the body.

In Blender it is laid out square first: the nose points −X, the wings extend along ±Y, and the layout fills the 5.7 m slab. Then it is turned +45° and scaled 0.707 (see [model-spec.md](model-spec.md#buildings)), which puts the nose SW and the wings NW and SE.

## Corrino: imperial permanence

Monumental and vertical: the Emperor doesn't deploy, he builds to stay. Stepped pyramids, tapering spires with buttress fins, pinnacles on every corner, tower cranes still at work on them. Where Atreides bolt containers together, Corrino raise stone.

- **Shapes:** sloped walls (ziggurat tiers), tapered spires, pointed pinnacles, slit windows. Symmetric around the front axis.
- **Colors:**
  - Walls: `515151`. Top surfaces: `9A9A9A`.
  - Ledges and trim bands: `C8B7D6` (pale Corrino stone).
  - Slits, doors, crane steel: `1D1616` near-black.
- **Team color:** banners. They hang down the sloped faces rather than straight down, so the steep game camera sees them; swallowtail ends, a dark rod across the top.

### Construction Yard (`conyard`)

A regional palace that doubles as the command center: a two-tier ziggurat with a central spire (banners on all four faces), a gatehouse and ramp at the front, pinnacles on the tier corners. Three tower cranes: a tall one on the west corner (the `spinner`), one on the east corner reaching over the palace, and a derrick on the upper tier. Built by the `build.py` text block in the .blend.

**Level 2** makes it the seat of power: two flanking spires with banners, a crown of pinnacles and a mast on the main spire, and a landing pad at the back.

## Fremen

To be defined.
