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

### Razor (`razor`)

An enclosed half-track: oppressive and effective, a little bigger than the Atreides Trike (about 2.0 × 1.36 m). Big wheels up front, tracks with road wheels at the back.
- **Hull (`armor0`):** slab-sided dark grey with a sloped glacis and a thin purple trim along the sponson edge (purple stands in for the concept's gold). Tops stay dark grey: light tops made it read Atreides. A dark grille with a team crest between purple bars, cyan headlamp slits. A raised armored cockpit with slit windows, a team stripe on the roof and team panels on its sides.
- **`armor1`:** skirts over the tracks (with team panels), a dozer ram and cockpit cheek plates.
- **Dreadflame:** one emitter centred on the glacis, since the flame comes from one `muzzle`. `weapons0` has two nozzles, a pilot light and two purple fuel tanks on the rear deck; `weapons1` has five nozzles and a third tank.

### Soulcrusher (`artillery`)

A long-range howitzer, purely: not a brawler like StarCraft's siege tank. The concept's Mk II "Brutalist" slab hull with Mk I touches, at the Atreides tank's footprint (about 2.5 × 1.5 m) with a long barrel (about 2.2 m from the trunnion).
- **Hull (`armor0`):** slab sides with a chamfered top edge, sloped glacis and rear, purple inlay along the top, team panels on the flanks. `armor1` adds skirts over the tracks, a glacis plate, and spaced cheek plates on the turret (`armor1_turret`).
- **Turret:** a big wedge casemate with a purple inlay, team panels, a team roof stripe, cupola and sight block. The `gun` (mantlet) raises the barrel: `weapons0` is plain with a box muzzle brake; `weapons1` is thicker with a fume extractor, plus an ammo bustle on the turret's back (`weapons1_rack`).
- **Legs:** four stabilizer struts (`leg_1`–`leg_4`) with rams, purple strips and spiked spades. They don't hide: mobile, they lie along the flanks, the front pair folded back and the rear pair forward. The `deploy` action swings them out to the corners, drops them onto their spades, then raises the gun to about 45°.

### Devastator (`devastator`)

The scariest thing on the field, and rare: a Sardaukar siege engine about 1.5× the Atreides tank each way (3.6 × 2.24 m), but low. Slick and angled, not boxy.
- **Running gear:** four independent track pods, exposed on `armor0` (road wheels, sprocket or idler, mudguards).
- **Hull:** flares out over the tracks, then the flanks slope in to the deck, with a long sloped glacis. Team panels on the sloped flanks, purple inlay along the deck edge. A massive turbine exhaust at the back (dark intake, pink-hot ring, steel core) between louvred vent stacks.
- **`armor1`:** ERA bricks with purple tops over the track pods and on the glacis; ERA along the turret cheeks (`armor1_turret`).
- **Turret:** an arrowhead casemate with angled cheeks to a nose round the mantlet, sloped sides with team panels, a lower bustle. One huge-bore gun (thermal sleeve, fume extractor, box muzzle brake); `weapons1` thickens it and adds recoil cylinders.
- **CROW:** a remote weapon station on the roof (`crow`, with `muzzle2`) that the game turns onto infantry on its own.

### Harkonnen Trooper (`trooper`)

Former masters, now imperial levy: a slow, heavily armoured giant about 0.9 m tall (1.2× the Atreides trooper) and much broader, so he reads bigger at RTS zoom. Hand-shaped by the user over a generated block-out.
- **Body:** dark power armour, a small helmet sunk into the shoulders with a team crest, a dark chest with a team stripe, purple on the arms and legs, a team-coloured banner hanging from the belt.
- **`armor1`:** only the shoulder pads, in a subdued team colour.
- **Weapons:** a fat hand-held rocket launcher carried two-handed at the waist (`weapons0`); `weapons1` adds a top housing and a cyan optic. Skinned to `hand.R`, `muzzle` at the tube tip.
- **Animation:** a hunched idle, a heavy 10-frame stomp, a big kick on firing, and a death that drops him to his knees and onto his face. `fit.py` in the .blend refits the rig and weights after mesh edits; `anim.py` re-solves both hands onto the launcher wherever it sits.

### Sardaukar (`sardaukar`)

The Emperor's elite: tall and lean, about 0.82 m, between the Atreides and the Harkonnen trooper. Neutral and disciplined, never showy. The concept art gives him a blade; in game he's a close-range gunner that also shoots aircraft, so he carries a carbine and the blade stays sheathed. The first character built to [low-poly-style.md](low-poly-style.md) (about 410 tris with every tier): welded shells, then hand-tweaked by the user.
- **Body:** battle-worn light plate over a dark undersuit, a tall helmet with a dark T visor and a purple crown, a scarf, short cape and ragged tabard in the dark team shade, a sheathed blade on the left hip.
- **`armor1`:** layered pauldrons with a team rim, and knee guards.
- **Weapons:** a compact carbine (`weapons0`); `weapons1` adds a cyan optic, a fore grip and a purple barrel shroud. Skinned to `hand.R`, `muzzle` at the barrel tip.
- **Animation:** each action was directed by the user one at a time.
  - Idle: an athletic stance with the carbine one-handed, muzzle up, the other arm at his side.
  - Walk: an 8-frame range walk, carbine at low ready, torso forward.
  - Shoot: bladed, with the carbine shouldered.
  - Die: drops to his knees and leans on the planted carbine, holds a beat, then collapses.

  The scripts are `idle.py`, `walk.py`, `shoot.py` and `die.py` in the .blend. Don't rerun them over hand edits.

### Sky Raider (`raider`)

The Skyraider Mk IV "Vulture's Talon": a wasp, not a dragonfly, about 3.1 m long with a 2.5 m wingspan.
- **Head and thorax:** a wedge nose with a raised dark canopy, cyan sensor eyes and two dark mandible prongs; a chunky chamfered thorax with team panels, a purple inlay and a hump carrying the wing roots.
- **Abdomen:** behind a narrow waist, six telescoping plates that droop a little toward the tail, each rising out of the one before it (no gaps to see the sand through), ending in twin nozzles with a pink glow. It is the jet: in fast flight the game flares the `jet_N` empties.
- **Wings:** two pairs (`wing_1`–`wing_4`, fore pair first), swept back, light grey with dark spars. Hovering, the game beats them hard and the body drifts like a wasp's; in fast flight they lie back along the abdomen.
- **Legs:** three pairs folded tight against the body, the front pair forward under the head.
- **Missile racks:** exposed rails on pylons off the thorax flanks, pink warheads: `weapons0` two missiles a side, `weapons1` three and a purple rail.
- **`armor1`:** a purple band at every plate joint (`armor0` has two), an armored spine ridge, cockpit cheek armor and flank plates.

## Fremen: living off the land

The Fremen don't bring a base or raise one; they dig into what is already there. Their buildings are rock and sand first, with what they built tucked into it: cut stone, cave mouths, and cloth stretched over ledges. Where Atreides bolt containers together and Corrino raise monuments, a Fremen base could pass for an outcrop until you see the banners.

- **Shapes:** faceted rock (convex hulls of jittered points: big hard facets, no smooth curves), sheer cliff faces leaning back, flat shelves. Built parts are few and small next to the rock.
- **Colors:**
  - Rock: Atreides earth tones, as the land rather than a faction surface. Sides `A0987D`, shaded sides `776A3B`, sand-covered tops `D1CBB6`.
  - Cut stone (gates, balconies, towers): `D1CBB6`, tops `C5C5C5`.
  - Cloth (tarps, awnings, jars): Fremen `555B63`. This is where the faction color lives.
  - Openings and poles: `1D1616`; wood and crates `515151`.
- **Team color:** banners hanging flat on the cliff faces, and flags on masts.

### Sietch (`sietch`)

A small mountain with a base carved into its cliff, after the concept's cliffside sietch. It is bare (no concrete slab: the rock is its own base) and isn't turned 45°; the cliff faces the camera (−Y).
- **Level 1:** a massif behind a sheer cliff, framed by two rock shoulders so the face reads as a bay cut into the mountain; boulders soften the back into the sand. A rock shelf in front, with a ramp down to the sand, carries the yard: a tarp-roofed workshop, crates and water jars. In the cliff, a stone-framed cave gate with a balcony above it (parapet, doorways, a tarp), a stair cut up to the balcony, window slits higher up, and a team banner on the face.
- **Level 2 (Great Sietch):** a round stone watchtower built into the right shoulder with a team banner, and a second cave mouth under a tarp on the left.
- **Level 3 (Sietch III):** a higher two-tooth crag on the summit with a tarp-roofed watch post and a tall flag mast.

Built by the `build.py` text block in the .blend.
