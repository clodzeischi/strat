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
  - Walls and roofs: `515151` dark grey. Top surfaces not covered by a roof ledge: `9A9A9A`.
  - Trim bands: Corrino purple, on the sides of the ledges only. Purple roofs drown out the team banners.
  - Slits, doors, crane steel: `1D1616` near-black.
- **Team color:** banners. They hang down the sloped faces rather than straight down, so the steep game camera sees them; swallowtail ends, a dark rod across the top.

### Construction Yard (`conyard`)

A regional palace that doubles as the command center. Unlike the other factions' buildings it isn't turned 45°: it sits square to the slab and fills it. On the slab, laid out like a keypad as seen from the game camera:
- **Center:** a two-tier ziggurat with a central spire (banners on all four faces) and pinnacles on the tier corners. Two flanking spires frame the portal. The main spire has a crown of pinnacles and a mast on its tip.
- **2 (front):** grand stairs from the slab edge up to a portal in the upper tier.
- **4:** the tall tower crane, the `spinner`. Its jib is short and high enough to swing clear of the spires.
- **9 and 3:** tower cranes with their jibs along the back and front edges.

The Corrino conyard doesn't level up, so it has no `level2`. Built by the `build.py` text block in the .blend.

### Refinery (`refinery`)

Ecological disaster: an industrial cathedral that poisons the ground around it. Square to the slab like the palace.
- **Center:** a sloped processing core with a spire on each corner and a central tower.
- **2, 4, 6, 8:** four harvester bays, long sheds with dark open mouths, one in the middle of each side, where the game docks harvesters.
- **1, 3, 7, 9:** tall smokestacks with sooted tops, each with a `smoke` empty so it belches black smoke in game. Storage tanks pipe into the core.
- **The mess:** one big toxic green pool (accent `41FE73`) at 3, fed by a broken drain, with toxic waste drums (grey, green lids) dumped around and in it. Black goo slicks in the other corners, each a different size. Keep it to one pool: repeated spills look cheap.

### Barracks (`barracks`)

A temple more than a barracks: worship first, berthing second. Back to the usual 45° turn, on a cross plan whose arms point at the slab's corners after the turn, so they can reach almost to them (inside |x| + |y| ≤ 3.7 m before the turn) and the building fills the slab. No baked-in plaza: it stands on the game's slab.
- **Level 1:** a sloped nave front to back and two long wings across it, towers at the wing ends and along the nave, a crossing tower with pinnacles, and a grand stair up to a portal at the front corner. Banners on the nave sides and the wings.
- **Level 2 (Imperial Barracks):** the indoctrination spire rises from the crossing tower (crown of pinnacles, a banner on each face), two hooded Sardaukar statues flank the stair, and six free-standing banner pylons stand between the arms.

### Fab (`fab`)

A factory, not a temple: they really build vehicles here, and it poisons the ground like the refinery. The usual 45° turn on a cross plan, like the barracks (inside |x| + |y| ≤ 5.7 m before the turn).
- **Level 1:** a long assembly hall front to back (pitched roof with a glazed ridge, buttress fins, a huge dark vehicle door with a welding glow at the front), foundry wings across it with a glowing furnace mouth and a press shop, and a tower over the crossing with the rotating beacon, the `spinner`. Four smokestacks of different heights, each with a `smoke` empty. Between the arms: an outfall pouring green sludge into a lake of black oil with drums dumped around it, scrap and crates, tanks piped into the walls, and a hull in its cradle in the assembly yard.
- **Level 2 (Heavy Fab):** a gantry crane over the yard lifting a heavy hull, and a press tower on the right wing.

Clutter (drums, crates) is built 1/0.707 larger so it ends up the refinery's size after the squash. Keep all of it on the slab and clear of the walls.

### Tleilaxu Research (`tleilaxu`)

A swarm of geodesic domes with Jetsons verticality. The 45° turn on a cross plan, kept to a few big shapes: an earlier pass with corner domes and antennas everywhere read as clutter.
- **Hub:** a big geodesic dome (panels in two greys, a glowing cyan cap) on a drum with a team band.
- **Arms:** four pods on splayed legs (saucer body with a team rim, small geodesic dome), joined to the hub by walkway tubes; a ramp at the front pod.
- **Verticality:** a needle tower at the back on tripod legs, with two saucer decks and banners; its crown of antennas is the `spinner`. A column at the front left lifts a saucer deck with the data-relay dish.
- **Bio:** glowing axlotl tanks (accent cyan) at the front right, a cyan bio-waste pool at the back left.

### Repair Pad (`pad`)

Outer works: low and wide, the 45° turn on a cross plan (inside |x| + |y| ≤ 3.7 m before the turn).
- **Center:** a big round service deck, dark with a team ring and a light service circle. Keep it clear: nothing on it, so the pad reads at a glance.
- **Arms:** four fat, short vehicle ramps down to the slab, dark with light tread stripes between purple-topped curbs. (Damaged units park around the pad, not on it.)
- **Between the ramps:** a workshop shed, a parts store, a fuel stand (tanks, pump, oil slick) and two banner pylons. Stadium lights (a bank of cyan lamps facing the deck) stand at the sides and back, never at the front, where they'd hide the deck.

### Auto Turret (`turret`)

A fortified plinth with sloped walls, turned 45°, with four buttress arms to the slab corners, a purple trim ledge and a banner on each face. The gun head (the `spinner`) is built at final size, facing +X and not turned, since the game sets its heading: four raised autocannon barrels in a mantlet between two tall missile pods (launch hatches on top, a team panel on each outer side), a sensor block at the back and a radar mast. The `muzzle` empty sits at the barrel tips.

## Fremen

To be defined.
