# Strat roadmap

Living plan for upcoming features and the AI difficulty work. Decisions are marked **Decided**; everything else is a proposal.

## Order of work

1. Elevation and ramps, with per-unit-class pathfinding
2. Elevation range modifier
3. Procedural maps: sizes, up to 4 players, validation
4. Expansion mechanic (MCV, home fields that run out)
5. Hard AI (economy, recovery, harassment, chokepoint awareness), tuned across many generated maps
6. Brutal AI, once units and numbers have settled. **Status: first version done** (micro, harassment and Carryall drops; see [AI difficulty plan](#ai-difficulty-plan))
7. Online multiplayer, so balance can be tested by people instead of only sims. **Status: 1v1 lockstep done** (self-hosted server, LAN or Raspberry Pi); see [MULTIPLAYER.md](MULTIPLAYER.md) for the design, the rules game code must now follow, and next steps (reconnect, replays, VPS).
8. Factions: Atreides (today's roster) and Corrino. See [Factions](#6-factions).

Brutal waits because timing builds and micro depend on exact numbers (speeds, ranges, build times), so every balance change would break them. Hard's general systems (rebuilding, value-based spending) read costs and stats from `src/config/`, so they survive changes.

## 1. Elevation and ramps

**Decided**
- Two levels: low ground and high ground. High ground is only slightly raised, not a StarCraft cliff, so it still makes sense that a tank below can see and shoot up.
- Buildings can be built on high ground.
- Three ramp types: narrow (infantry only), normal (vehicles in single file) and large (several vehicles side by side). Ramps are generous: Dune-style games have no drops and little need to expand, so a plateau must not be a fortress you can hold forever.

**Status: done.** Ramp widths are narrow 1, normal 2, large 8 tiles; high ground is 1.1 units up. Ramps are carved into plateau edges in mirrored pairs, about one per 6 edge cells with a 1-tile gap, so plateaus are reachable from many sides. Wide ramps are the norm (about 80%), with occasional single-file (13%) and infantry-only (7%) ones; a plateau's first two ramps are always wide. Revised after playtesting: with sparse ramps the map had too many chokepoints. About 59% of plateau edge length is now ramp, up from 30%.

**Revised again (branch `elevation-rework`, on trial):** StarCraft-style plateaus and chokepoints felt out of place in a Dune setting. High ground now comes from two sources only. Sizeable rock areas, both bases included, are raised shelves: one unbroken stretch of 30-45% of the edge stays cliff (a flank only rocket launchers can hit from below), and the rest opens with frequent wide ramps. The open desert gets a few small mesas (mirrored pairs, about 2 on the 64 map and 8 on the 128) with one ramp each, mostly obstacles to route and kite around. Spice keeps a tile of sand from rock and from cliff edges. Checks: `npx tsx sim/maps.ts <seed>` (ASCII map), `CHECK=60 QUIET=1 npx tsx sim/maps.ts` (vehicle route on 60 seeds), `npx tsx sim/terrain-check.ts 3` (illegal steps, stuck units).

Follow-ups: the AI still uses straight-line distance (`pickTarget`) and knows nothing about chokepoints; jams on normal ramps haven't shown up in sims, but sims don't stress them.

**Design**
- `GameMap` gets a `level` per cell (0 low, 1 high) and ramp cells that join the two levels.
- Movement between cells of different levels is only allowed through a ramp. This check is about the edge between two cells, not the cell itself, so the cliff edge needs no wall tiles.
- Units get a movement class, `foot` or `vehicle`. Narrow ramps are foot-only. Normal and large ramps differ only in width (about 2 tiles vs 4+), so single-file vs side-by-side movement emerges from the geometry.
- A*, path smoothing, unit separation, spawn spots and building placement all respect level edges. Buildings need flat footprints: one level, no ramp cells.
- Risk: units only push each other apart and don't steer around each other, so vehicles may jam on a single-file ramp. Watch for this; local avoidance may be needed.

## 2. Elevation range modifier

**Decided:** shooting down gives +10% range, shooting up gives -10% range.

- Based on the two discrete levels, not raw height, so players can read it at a glance. A unit on a ramp counts as being on neither level.
- Minimum range is unaffected.
- **Status: done** (`Game.rangeFor`, `HIGH_GROUND_RANGE` in `config.ts`; check with `npx tsx sim/range-check.ts`). The visual cue is still to do.
- Needs a visual cue (for example, a range ring or an icon on units with the advantage); otherwise players won't understand why they lose a fight.

## 2b. Fog of war and grid combat

**Decided:** StarCraft-style vision. Low ground can't see onto high ground unless something of yours is up there or it shoots at you. High cells block low ground's view past them, so mesas hide what's behind them. Combat checks run on the tile grid, using tile levels instead of 3D geometry.

**Status: done.**
- `game/vision.ts`: per-team visible, in-range and explored grids, recomputed every 4 ticks.
- Sight is measured from the unit's position to cell centers.
- Sight lines are Bresenham lines over tile heights (low, ramp, high), which keeps them point-symmetric for mirrored bases.
- Buildings see 8 units past their walls.
- Aircraft and parachutists see from above. Aircraft are seen by anyone with the cell in range.
- An attacker is revealed to the side it hit for 2 s.
- Units only target what their team sees. An attack order on something that slips into the fog becomes an attack-move to where it was last seen.
- A command clicked on something no longer visible attacks a structure where it stands, or attack-moves to the spot.
- Shells and rockets fly on the ground grid (flat distance, impact at the target's tile position). The 3D muzzle-to-target arc is only drawn.
- Drawing: a fog texture on the ground shader, enemies out of sight hidden, last-seen ghosts of enemy structures, effects in the fog suppressed, and fog on the minimap.

Balance effect: rocket launchers below a cliff now need a spotter (a unit up top, a Carryall overhead, or being shot at). The AI still sees everything when it plans; only its units' targeting respects the fog.

**AI without map knowledge (done).** The AI plays under the fog like a person. `game/intel.ts` keeps what its side has seen:
- **Units:** where each was last seen and how strong it was. A unit's position is trusted for 60 s, or until its spot is seen empty. It still counts toward the enemy army for 3 minutes, unless the AI saw it die or killed it.
- **Structures:** remembered until their spot is seen empty.
- **What it plans from:** strength, counters, threats, raids, wave targets and surrender judgments all use only this memory.
- **Locating the enemy:** before it has seen anything, it assumes the enemy base is the mirror image of its own start (maps are point-symmetric). Once it has looked there and found nothing, it searches the map region it has gone longest without seeing.
- **Scouting runs:** a trike, or infantry if there's no trike, visits the enemy base, then the spice field the enemy harvests, then the stalest region. Normal first scouts at 30 s, then every 150 s. Hard first scouts at 40 s, then every 75 s, twice as often in the first 4 minutes.
- **Watch post (Hard):** after its look, Hard's scout parks 16 tiles outside the enemy base and watches for the army moving out.
- **Reading a rush:** two barracks, or a barracks and no refinery a minute in, is read as an early attack, and the AI braces for it.
- **Rush fix:** the rush response no longer cancels its own bunker.

Cost of playing fair (gauntlet, 20 games each, Hard / Normal win %):

| Opponent | Hard | Normal |
|---|---|---|
| Airdrop | 95 | 30 |
| Harass | 75 | 10 |
| Rockets | 65 | 5 |
| Rush | 50 | 25 |
| Turtle | 60 | 5 |

The rush is the biggest loss: the AI used to watch it build at home. Tried and dropped: holding the factory until the scout reports (Hard 3/20 against the rush), and keeping a harvester's price while rushed (7/20, no better). A dead economy with a few infantry holding a bunker is now surrendered after 3 minutes, instead of stalemating.

## 3. Procedural maps

**Decided:** sizes 64, 96 and 128. Plan for up to 4 players.

**Status: sizes done.** Picked on the difficulty page (Small 64 / Medium 96 / Large 128), remembered between visits and kept on Restart. A different size from the one on screen reloads the page into the new map. Check with `SIZE=128 QUIET=1 CHECK=40 npx tsx sim/maps.ts` and `SIZE=128 npx tsx sim/terrain-check.ts 2`. **Random maps done:** every visit gets a random seed (Restart keeps it, `?seed=N` replays one, the end screen shows it). Spawns come from the seed: base 0 at a random angle and distance from the middle, base 1 mirrored through it, from about two thirds of the map width apart up to nearly corner to corner. Sims keep seed 7 unless run with `MAPS=random` (`sim/match.ts`). Check with `npx tsx sim/spawn-check.ts`. Still to do: the validation checks below, 4 players.

Side bias: fixed, see the AI section (spawn side decided mirror matches).

- `MAP_SIZE` becomes a per-game value instead of a constant.
- Fairness by symmetry: point symmetry for 2 players, 4-fold rotational symmetry for 3-4 players (with 3 players, one slot is left empty). With symmetry, no player can get an elevation advantage.
- Generate, then validate, then retry with the next seed. Checks:
  - base plateau big enough to build on
  - minimum *path* distance between bases
  - enough spice within a set path distance of each base
  - every base has at least one vehicle ramp out
  - no spice reachable only by narrow ramps
- Show the seed so a map can be replayed.
- Fairness test with the sim harness: across a few hundred seeds, each side should win about 50%.

## 4. Expansion mechanic (proposal)

Problem: in a Dune-style game nothing forces players to leave their base, so a defended plateau could turtle forever.

Suggestion: rather than making harvesters slower overall, make home fields run out.
- Home spice fields are sized to last roughly 8-10 minutes at a normal harvester count. Richer fields sit in contested ground.
- Harvest income already drops with trip distance, so once home fields run dry, a far field earns much less. The sims can measure exactly how much.
- Add an MCV unit that deploys into a Construction Yard. Buildings must already be placed near your own structures, so an MCV is the way to put a refinery next to a remote field.
- This also settles the second-refinery question: a second refinery pays off when it is *remote*, not next to the first.
- Harvester speed stays a tuning knob. Slowing all harvesters is a tax on the whole game; running out of spice is what actually pushes players outward.

## 5. Repair and airlift

**Status: done (branch `air-and-repair`).** Check with `npx tsx sim/air-repair-check.ts`.

- **Repair Vehicle** (Factory, $450): mends vehicles, aircraft and buildings at 30 HP/s, paying as it goes (a full repair costs 40% of the target's price, `REPAIR_COST`). Right-click something damaged; when idle it repairs anything damaged within sight. A Carryall that's being repaired parks low over the truck.
- **Infantry** heal 2% of their health per second after 5 seconds without taking damage (`INFANTRY_REGEN`).
- **Hi-Tech Factory** ($1200, needs a Factory) builds the **Carryall** ($700). A new Carryall circles over its factory (or the rally point).
  - Right-click one of your units with Carryalls selected to pick it up, plus nearby units of the same kind until it's full: one heavy vehicle (harvester, tank, rocket launcher, repair vehicle), two trikes or six infantry (lift space 6; infantry 1, trikes 3, the rest 6). Ground units that right-click their own Carryall call it over.
  - **D**, then left-click: drop. A heavy vehicle aboard means a fast touch-and-go: it dives in over the last ten units at no less than half speed, touches down for an instant, and climbs out straight ahead at full speed before turning home (a Carryall low and slow over enemy infantry doesn't last; it spends under a second below 3 units). Picking up vehicles works the same way, trikes first gathering so one pass takes both. Infantry and trikes: a fly-by at full speed, everyone parachuting out one after another around the point (trikes on bigger, slower canopies; nobody can act until they land). Either way it then flies back to where it was when given the order. Seat lights on the spine and a troop pod show infantry aboard.
  - Flying low raises downwash dust: thick over sand, red over spice, a little brown over rock.
  - Picking up a harvester assigns the Carryall to it: whenever the harvester would set off on a trip longer than 10 tiles (to spice or back to a refinery), it waits to be lifted and is set down at the far end. A ferried harvester that comes under fire heads home and calls its Carryall, which flies it to the refinery whatever the distance. In the sim ferrying doubles a harvester's income from a field 40 tiles away. Giving the Carryall another order ends the assignment.
  - **Anti-air:** infantry (rifles and rockets) and rocket launchers can shoot aircraft (rockets get +25 against them); nothing else can. A Carryall that's shot down loses vehicles aboard (hanging trikes included), while infantry bail out by parachute. Drops landing within 22 tiles of the other side's buildings warn its owner.

- **Repair Vehicles in an attack-move** (or sent with a group to attack something) don't charge in: they keep station a cell behind the group's longest-range unit, on the side away from the fight, mending anything that comes within reach. Once no armed enemy is near, they drive to damaged members of the group (then anything damaged nearby) and fall back in behind. Check with `npx tsx sim/escort-check.ts`.

Follow-ups: the AI doesn't build Repair Vehicles, the Hi-Tech Factory or Carryalls yet (its units do shoot at enemy aircraft). Carryalls ignore threats when choosing a path.

## 6. Factions

Setting: after *Dune Messiah*. House Harkonnen is broken; House Corrino is still plotting. There is no Harkonnen faction.

### Atreides (today's roster) **Decided**

The Terran of the game: mid cost, fast, moderate APM. Relies on scouting, conventional weapons and mobility (Carryalls). The introductory faction.

### Corrino **Decided** (numbers are proposals until the sims settle them)

The Protoss of the game: slower, more expensive, stronger, and every loss hurts.

- **Health and shields like Protoss.** A unit's health alone exceeds its Atreides counterpart's; shields come on top. Damage hits shields first, then health. Shields recover on their own after a few seconds without taking damage; health never does. Health is only restored at a **Repair Pad**. The Atreides Repair Vehicle and infantry regeneration don't apply to Corrino.
- **No hidden units.** Mines are visible area denial.
- **No Carryalls and no fast transport.** Mobility is the Atreides advantage. Corrino's answer is **drop pods**: after the Barracks upgrade, infantry can be dropped anywhere in the visible area.

**Units**

| Unit | Built at | Requires | Role | Counters | Countered by |
|---|---|---|---|---|---|
| Harkonnen Trooper | Barracks | Barracks | Imperial levy (Harkonnen remnants) with anti-vehicle weapons | Vehicles. Beats trikes by numbers, about 1.3:1 (like Zealots against Roaches) | Trikes in small numbers, Rocket Launchers |
| Sardaukar | Barracks | Barracks upgrade (late game) | Close-quarters specialist, well rounded | Infantry, aircraft | Trikes, Rocket Launchers |
| Razor | Fab | Fab | Dune buggy with a flamethrower | Infantry | Tanks |
| Devastator | Fab | Tleilaxu Research, Fab upgrade | Slow heavy tank. Its machine gun fires while moving; the main gun doesn't. Can self-destruct in a big explosion | Armor; infantry up close | Aircraft, Rocket Launchers |
| Sky Raider | Fab | Tleilaxu Research | Light ornithopter for scouting and disruption. Lays visible mines that wreck infantry and wear down harvesters | Armor | Anti-air |
| Soulcrusher (artillery) | Fab | Tleilaxu Research | Self-propelled howitzer. Can't fire while moving; a short-range gun with modest damage. Deployed (static), it fires long-range, high-damage shells at a spot on the ground. Shells aren't guided, so a trike can drive out of the impact zone | Buildings, static defenses | Tanks |

Corrino builds the same **Harvester** (with shields) at the Fab.

**Buildings:** Construction Yard, Refinery, Barracks (Harkonnen Troopers), Fab (Razors), Tleilaxu Research (needed for Devastators, Sky Raiders and Artillery), Repair Pad, and a small **auto turret** for defense (Corrino has no Bunker).

- Buildings have shields too. A damaged building gets a **Repair** action on its command card while its owner has a Construction Yard; health comes back slowly and costs credits.
- The **Repair Pad** restores units' health two at a time, as long as there are credits to pay for it (the same 40% share of the price as Atreides repairs).

**Upgrades**

| Upgrade | Requires | Effect |
|---|---|---|
| Armor +1 (Fab) | | Less damage to health |
| Shields +1 (Tleilaxu Research) | | Less damage to shields |
| Weapons +1 (Fab) | | More damage |
| Barracks upgrade | Tleilaxu Research | Sardaukar, drop pods: newly trained infantry land by pod at the Barracks' rally point, anywhere the player can see |
| Fab upgrade | Tleilaxu Research | Devastators |
| Harvester speed | | Faster harvesters |
| Razor flame range | | Longer flamethrower |

### Order of work

**Status: stages 1-3 done.** Check with `npx tsx sim/corrino-check.ts` (tech tree, shields, Repair Pad, self-repair, turret, Sky Raider flight, every stage 2 ability, determinism) and `npx tsx sim/faction-duels.ts` (balance). The computer opponent can play either faction (menu: Enemy Atreides / Corrino / Random); AI-vs-AI between factions: `sim/faction-match.sh <games> <corrinoLevel> <atreidesLevel>`.

Stage 2 abilities, as built:
- **Soulcrusher (Artillery): Deploy** (D). Digs in like a siege tank: stabilizer legs swing down, the hull settles, the barrel runs out and rises (3 s; packing up plays it backward). Dug in, it turns its turret rather than its hull, and other units can't push it. Deployed, it ignores move orders and shells anything its side can see from 8 to 26 units (13 tiles): slow shells, aimed at the ground where the target stood, with a red marker where they'll land. Two deployed Artillery destroy a manned Bunker in about 19 s from outside its reach, four in 9 s.
- **Razor flamethrower:** burns every enemy in a 40-degree cone within reach, not just its target.
- **Devastator:** the machine gun fires at any ground enemy within 5, also on the move; the main gun only fires standing still. **Self-Destruct** (V): blows up 2.5 s later (blinking, and the enemy is told if it sees it), hitting every enemy within 9 units (500 damage at the center, half at the edge, +300 vs structures).
- **Drop pods:** with an Imperial Barracks, new infantry land by pod on the Barracks' rally point when your side can see it (otherwise they walk out as usual). The enemy gets the airdrop warning near its base.
- **Atreides MLRS: unguided rockets and Lock On** (D). Rockets fly at where the target was when fired (with the same red impact marker), so moving units can dodge; a rocket landing within 0.8 of something hits it squarely, and the rest of the blast takes the usual splash share. Against aircraft they always home in. Lock On, then click an enemy: the MLRS attacks it and its rockets home in on it for 8 s; recharges in 20 s. The AI (all levels) locks on to whatever unit its MLRS shoot at as soon as it can, and so do the duels behind the counter table. Check with `npx tsx sim/mlrs-check.ts`. Brutal vs Hard and Corrino vs Atreides win rates didn't change.
- **Sky Raider mines** (D): one every 15 s, at most 12 per side (the oldest goes). Visible to everyone; armed after 1 s; an enemy on the ground within 2.2 sets it off: 30 damage (+90 vs infantry, -10 vs armor) in a 4-unit blast.

Equal-cost duels after stage 2 ($4500 a side; +1 Corrino wins untouched, -1 Atreides does). Artillery here fights mobile; deployed, see above:

| Corrino \\ Atreides | Infantry | Trike | Tank | Rocket Launcher |
|---|---|---|---|---|
| Harkonnen Trooper | 0.18 | 0.10 | 0.79 | -0.17 |
| Sardaukar | 0.31 | -0.56 | 0.66 | -0.90 |
| Razor | 0.77 | 0.28 | -0.58 | 0.00 |
| Devastator | 0.51 | 0.47 | 0.23 | 0.47 |
| Sky Raider (range 8, before the cut) | -0.78 | 1.00 | 0.96 | -0.23 |
| Artillery | -0.15 | -0.43 | -0.60 | -0.51 |

Open point: the Devastator beats Rocket Launchers in a straight fight; they only win by kiting with their longer range (17 against 10).

**Stage 3: the AI plays Corrino.** The AI's plans are written in Atreides terms; a per-faction kit in `ai.ts` translates them (Fab for Factory, Auto Turret for Bunker, Razors raid and scout, a Repair Pad instead of Repair Vehicles, Tleilaxu Research before levelling up the Barracks and Fab, Corrino's research order). On top of that, Corrino-only behavior: damaged units at home park at a Repair Pad, damaged structures repair themselves, Artillery travels with the army (one per ten units, up to three) and deploys when there's something to shell, a Devastator about to die among enemies self-destructs, Sky Raiders mine harvester routes and enemy troops, and with an Imperial Barracks new infantry drop by pod next to a wave that's out and join it. The counter table (`src/game/matchups.ts`, from `sim/matchups.ts`) now covers all ten combat units of both factions, each fighting for its own side; refreshing it moved the Atreides numbers by at most 0.03 (Brutal vs Hard: 85% with it, 80% with the old one over 40 games, within noise).

AI vs AI between the factions, 40 games each on random maps from both sides (Corrino win rate):

| Corrino AI | Atreides AI | Corrino wins |
|---|---|---|
| Hard | Hard | 55% |
| Brutal | Hard | 82% |
| Hard | Brutal | 20% |
| Brutal | Brutal | 30% |
| Brutal | Brutal without micro | 80% |
| Brutal without micro | Brutal without micro | 60% |

For reference, Atreides Brutal beats Atreides Hard 85% of the time. So at equal skill without micro the factions are close, with Corrino a little ahead; Brutal's micro (kiting and focus fire) is worth far more to Atreides against slow Corrino armies than the other way round. That fits Atreides as the faction that rewards APM, but the size of the swing (60% to 30%) is worth a decision: make Corrino tougher, give it ways to punish kiting (longer ranges, faster Razors), or teach the Corrino AI to stop chasing kiters. Carryalls are not the reason: Brutal Atreides without them does the same.

**Resolved.** Switching Brutal's micro off piece by piece showed it was Atreides kiting (25% -> 60% for Corrino without it; focus fire and Corrino's own micro barely mattered), and nearly all of it was tanks kiting Harkonnen Troopers: tanks reached 10 against the Troopers' 7 and are much faster, so they backed off and shot forever. Fix: Trooper range 7 -> 9 (Brutal only kites what it outranges by more than one unit) with base damage 9 -> 8 to keep Hard even; and Brutal no longer kites Devastators and Soulcrushers, whose main guns only fire standing still. Now, 40 games each: Brutal vs Brutal 50%, Hard vs Hard 47% Corrino wins; MLRS still outrange and beat Troopers.

1. **Plumbing:** a faction per player (menu, lobby, AI), a roster per faction (units, buildings, upgrades, tech tree), shields and their regeneration, the Repair Pad. The six units go in using today's mechanics. Run the matchup sims for a first balance pass.
2. **Special mechanics,** one at a time, re-running the matchup sims after each: drop pods, deployed Artillery firing at the ground, the flamethrower, the Devastator firing while moving and self-destructing, Sky Raider mines.
3. **AI that can play Corrino** (Brutal is tuned for Atreides).

### Fremen **Proposal, built** (numbers from the sims, open to playtesting)

The Zerg of the game: cheap, fast infantry that live in the open desert. Low tech, speed, surprise, violence of action. Every Fremen unit is infantry except the Wind Glider. Their reach across the map is the wild Sandworm: they can't bring armies across it fast, but they can call down a disaster on the enemy's fields.

- **No harvesters, no refinery.** A **Spice Crew** (infantry, 450 credits, trained at the Barracks) walks to a spice field and **sets up camp** (D) on the spot. The **Spice Camp** turns the spice within 3.5 tiles into credits (8.5/s with 12 or more spice tiles in reach, less on a field's edge), with no trips to make. Camps sit out on the fields where everyone can find them; when the spice in reach runs out, a camp **packs up** (D) into a crew again and moves on. The other AIs raid camps as they would harvesters.
- **Build on sand.** Fremen structures go on sand as well as rock (not on spice). Other factions are bound to rock.
- **Hide in the sand.** Fremen infantry that stand still on sand or spice for 3 s dig in (they sink into the sand on their owner's screen): the enemy can't see or target them unless one of its units or structures is within 2 tiles. Firing or being hit brings them out; they dig in again 3 s later. Hidden, they don't go after enemies in sight, only shoot what walks into range. Rock gives no cover. Mines still go off under them.
- **Sand walking.** Fremen infantry move 20% faster on sand and spice (45% with Sandwalk).
- **Water discipline.** Fremen units heal 1.5% of their health a second, and structures 0.6%, once unhurt for 6 s (twice as fast, after 3 s, with Stillsuits). No repairs.
- **Thumpers and the wild Sandworm.** Warriors and Fedaykin plant Thumpers (D, then click open sand or spice; needs a Sietch): 250 credits, one at a time, every 60 s. The Thumper drums for 8 s; then a wild Sandworm erupts where it stands, swallowing it and anything around it. For 20 s the worm hunts within 15 of that spot: whatever **moves** on sand or spice (units still for 1.5 s don't draw it), **harvesters even standing still** (their machinery never stops), and **structures on the sand** (so Fremen can raid each other's camps). A bite every 2.5 s hits everything on the sand within 4: 400 damage (+400 vs vehicles, -100 vs structures), straight through shields. It belongs to nobody, can't be hurt, eats the caller's units as readily as the enemy's, and can't reach anything on rock or ramps. Counterplay: enemies with anything within 30 of a drumming Thumper hear it (it's revealed to them every second, with a "Thumper detected!" alert and a minimap ping), and a Thumper destroyed in time (150 HP) calls nothing.

**Alerts and pings** (every faction): alerts with a place ping the minimap (rings rippling out, then a marker that fades): attacks on the base, Spice Camps, harvesters and crews, and the army (only when that fight is off screen), each at most every 15 s unless it's somewhere else; structures lost, airdrops, Devastators about to self-destruct (red); Thumpers detected, planted or lost, and wormsign (orange); camps run dry (yellow). Space jumps to the latest alert from the last 15 s, once; otherwise to the base.

**Hold Position** (F, every faction): armed ground units stay put, shoot only what is within reach, don't chase or back off, and aren't pushed aside. It's how to stand still in front of a worm.

**Units**

| Unit | Cost | Built at | Requires | Stats | Role |
|---|---|---|---|---|---|
| Fremen Warrior | 80 | Barracks | | 70 HP, speed 3, range 4.5 | The Zergling: cheap and fast, shoots aircraft, plants Thumpers. Beats infantry and Troopers, loses to vehicles, flamers and MLRS |
| Fedaykin | 200 | Barracks | Sietch | 230 HP, range 7, +20 vs mechanical, **sonic: ignores shields** | Anti-vehicle infantry, plants Thumpers. Beats tanks, Devastators, Razors, MLRS; loses to infantry |
| Wind Glider | 100 | Barracks | Sietch | 60 HP, speed 10, sight 16, unarmed, flies | Recon. The fastest thing in the sky. Can't hover: it flies to where it's sent and circles there (radius 8) |
| Fremen Mortar | 250 | Barracks | Great Sietch | 120 HP, speed 2.8; pistol on the move (range 4.5); set up (D, 1.5 s): guided rockets 4-12, 24 (+16 vehicles, +30 structures, -10 infantry) every 1.4 s, small splash | Siege and anti-vehicle from range. Hides like any Fremen while set up |
| Spice Crew | 450 | Barracks | | 120 HP, unarmed | Sets up a Spice Camp |

**Buildings:** Construction Yard, Barracks, **Sietch** (1000: Fedaykin, Gliders, Thumpers, research; levels up to the **Great Sietch**, 1200: Mortars, Ambush), Bunker, the **Spice Camp** (from a crew) and the **Thumper** (planted by infantry).

**Upgrades:** Great Sietch, Weapons +1, Armor +1, Ambush (units striking out of hiding deal +50% for 4 s; needs the Great Sietch), Stillsuits, Sandwalk, Spice Mining (camps +25%).

**AI.** Plants Thumpers where a worm will catch the most enemy economy it knows of (harvesters seen in the last 20 s, camps), never near its own camps or structures on the sand; the planter walks clear and holds still until the worm is gone. Every faction's AI: units on the sand near a worm (or a Thumper about to bring one) hold still; harvesters working near a Thumper it can hear or see park at a refinery and go back once the worm is gone; up to three nearby units go after an enemy Thumper it sees. Fremen keep one Glider to scout with, and one Mortar per five combat units (up to five) as siege, like Corrino's Artillery.

**Status: built** (branch `fremen-mobility`). Check with `npx tsx sim/fremen-check.ts`. AI vs AI: `FACTIONS=fremen,corrino sim/faction-match.sh <games> <fremenLevel> <otherLevel>` (prints worm stats). Also `sim/unit-row.ts` and `sim/kill-tally.ts`. The counter table (`src/game/matchups.ts`) still has the old numbers with the Commando and Sandworm taken out; it hasn't been regenerated with the Mortar.

**Balance, AI vs AI (Fremen win rate):** Hard vs Hard, 60 games each: 60% against Atreides, 50% against Corrino (with the worm at 8 s; 58% / 41% at 10 s). Brutal vs Brutal, 30 games: 66% and 60%. Fremen mirror: 26% of games time out at 30 minutes (66% before). Worms are called about twice a game and eat 1000-1300 credits of the enemy's (200-600 of the caller's own).

What it took (this round), in order:
- **Bug, also on main: the Fremen AI never researched or levelled up anything.** Production held credits at the tech reserve, tech waited for the reserve plus the 800 harvester fund, and camp income trickles in rather than arriving by the harvester load, so it never got there (which is also why the old Sandworm "hardly ever appeared"). Fremen keep no harvester fund now; they reach the Great Sietch around 3:00.
- With tech, worms and Mortars: 96% vs Atreides, 90% vs Corrino. Without worms 70% / 63%; without Mortars 93% / 86%. So the worm was worth about 25 points and the Mortar little, the rest coming from the AI finally teching.
- Harvesters only started running 3 s before the worm came, too late to outrun it. Now they leave as soon as the Thumper is heard and wait at the refinery: worms ate half as much (3100 to 1500 vs Atreides), 86% / 63%.
- Warriors 90, a dearer Great Sietch, pricier upgrades and slower Thumpers alone each stayed within noise. Camps at 9/s took Atreides to 76%. Settled at camps 8.5/s and Thumpers 250 every 60 s (9/s with those Thumpers: 73% / 41%).

Earlier rounds (Atreides and Corrino AIs then never faced a teching Fremen):
- Camps first earned 12/s for a 300-credit crew: 84 credits/s by 2:00 against Atreides' 17; then 9/s for 400 was too little (15% wins). Crews 450 and 12 s to train.
- Nothing Fremen beat trikes or MLRS (15%): Fedaykin became the anti-vehicle unit (+20 vs mechanical) rather than anti-armor.
- Against Corrino, Razors burned through everything (25-30%). Fedaykin weirding modules are sonic, and sound passes through a Holtzman shield: their shots ignore shields. That moved Fremen vs Corrino from 30% to 60% and left Atreides alone. (Shield-piercing Warriors were tried too: full piercing let them beat Sardaukar, and half piercing does nothing at all, since when health exceeds shields the total damage to kill is the same.)
- Warriors first beat tanks (+0.51) and Sardaukar (+0.60): range 5.5 to 4.5, weaker vs armor, 70 HP (two Sardaukar shots).
- Death Commandos (suicide bombers) and a 1500-credit Sandworm unit from a Thumper building were cut: the Commando was too like the Devastator's self-destruct, and the worm unit almost never came into play.

`sim/fremen-variants.ts` (`FREMEN_VARIANT=<name>`) keeps the makeups compared: `noworm`, `nomortar`, `ghosts` (faster, harder-to-find hiding), `drums` (more worms), `host` (fewer, sturdier units) and the balance candidates above.

## AI difficulty plan

| Level | Intent |
|---|---|
| Normal | Plays steadily: builds an army and sends small waves. Keeps new players engaged but not stressed. This is today's AI and stays as the baseline. |
| Hard | Strong economy, recovers from setbacks, small harassment, practices army compositions, starts taking the initiative. |
| Brutal | Optimized timing builds, constant harassment, fast reactions, micro (rotating damaged units, picking squads to counter the player's formations), forcing the player to split attention. |

**Normal, revised after playtesting** (it used to fizzle out after the first serious attack). Check with `npx tsx sim/ai-check.ts`.
- **Defense sized to the attack.** Enemy combat units near our buildings (14 tiles) or harvesters (10 tiles) are grouped into attacks, each scored by strength (cost × health left). Each attack gets about 1.5× its strength in defenders, nearest first: a lone trike draws a few units, a real attack draws everyone at home. Waves out in the field are only called back when the base itself is hit. When an attack has been gone for 4 seconds, its defenders return to a rally point in front of the base.
- **Income first.** Below 2 harvesters, or with no refinery, getting income back comes before army and tech. Without a factory, it builds a refinery (which comes with a harvester) instead of a factory plus a harvester. Lost opening buildings are rebuilt before more units. Once the base is up, it keeps one harvester's price (800) in reserve so it can always replace one.
- **Waves.** Unchanged in size and timing, plus: a wave that loses 70% of its strength falls back instead of trickling in, survivors push on to the next target, and if a full wave hasn't formed 90 s after one was due, a half-size wave goes so the pressure keeps up.
- **Surrender.** When it has no income and no way to buy it back (or nothing left to build units with), and its army is under half the enemy's, for 15 seconds, it offers to surrender, once. The game pauses for the answer. Declining plays on to the end.
- Against the old Normal it won 17 of 32 games (random maps), so it's about as strong; wave size and timing, the knobs that set its pressure, are unchanged. 14 of its 15 losses ended in a surrender rather than being wiped out. In 16 games against itself every game was decided (no stalemates), 15 by surrender.

**Hard, first version (done).** `HARD_PROFILE` in `src/game/ai.ts`, picked from the menu. Tuned on random maps (`MAPS=random sim/run.sh`, 40-80 games per row, against Normal):

| Variant | Win % vs Normal | What it adds |
|---|---|---|
| 6 harvesters, second refinery right away | 83 | economy |
| + attack when 1.2x stronger, fall back at half strength | 88 | initiative |
| + hit-and-run trike raids | 76-87 | harassment (neutral against Normal, kept for feel) |
| + build toward a target mix of counters | lost 30-40% head to head | dropped |

The final profile wins 73-76% against Normal (60-80 games); Normal against itself, 47%.

What Hard does on top of Normal:
- **Economy:** 6 harvesters and both refineries early (Normal: one harvester per refinery).
- **Initiative:** besides Normal's wave timer, it attacks as soon as its army at home is 1.2x the enemy's whole army, and those waves go for refineries and harvesters first. Waves fall back at half strength (Normal: 30%).
- **Harassment:** 3-trike raids from 2:30, every minute, on the least protected harvester; on to the next one after a kill; home as soon as defenders close in or half the group is lost. It keeps 3 trikes for raids while there's a harvester worth hitting, and they stay out of waves.
- **Repairs at home:** one Repair Vehicle per 6 combat vehicles (up to 3), kept at the rally point. Damaged vehicles that are home and idle (back from defending, or from a wave that fell back) drive over to be repaired; nobody leaves a fight for it (decided: Repair Vehicles have a purely defensive role). Infantry heal on their own.
- **Re-assessing fights:** a wave pulls back (and waits 30 s to regroup) when the enemy strength around it is 1.3x its own, re-checked every second.
- Defense, income recovery and surrender as on Normal (`DIFFICULTY=hard npx tsx sim/ai-check.ts`, which also checks repairs at home and pulling back).

Raids barely matter against Normal, whose defense now answers them in seconds; they are aimed at a human, who reacts slower. Repairs and pulling back were neutral in win rate too (measured with an earlier version that also pulled units below 35% health out of fights: 49-51% against Hard without them over 80 games; K/D 1.00 vs 0.95 against Normal), for the reason below. Next for Hard: chokepoint and high-ground awareness, Carryalls, and a reaction delay per difficulty.

**Spawn side decided mirror matches (fixed).** Hard against Hard, each of 20 maps played 6 times: on 15 maps one spawn won all 6, though overall the two teams won equally (mean deviation from 50% per map 0.44, chance level 0.16). Causes found and fixed: every building's door faced south (now toward the map's middle, with the model turned and the exit/dock cell on that side); the AI searched for building spots from the yard's corner in scan order (now scored from its center, ties broken in the base's own frame); `nearestCell` and `cellsAround` broke ties by scan order, so even the starting units stood on non-mirrored cells and blocked different building spots (ties now go to the cell nearer the middle, then by side); units always acted in creation order (now alternating each tick). After: both economies match to the credit for the first minutes, mean deviation 0.17, team 0 won 62 of 120. Check with `npx tsx sim/side-bias.ts` (a few maps still go 6-0, slightly more than chance would).

**Hardening against player strategies (in progress).** `sim/bots.ts` has scripted "players" built on the AI's own economy code: a Barracks-first infantry **rush**, a **turtle** (tanks and rocket launchers at home, one all-in at 14:00), a trike **harass**er (4-trike hit-and-run raids every 25 s), a **rockets** tech rush and an airdrop (**drop**) player. They run Hard's economy, so they're strong opponents. `sim/gauntlet.sh 20` plays each against Normal and Hard on paired random maps. What it found and what changed (all in `src/game/ai.ts`):
- **Stacked savings:** the harvester fund (800) was added on top of the second-refinery reserve (800), so the AI built nothing for its army until 1,600 credits had piled up; an early rush walked in. Savings no longer stack. When the enemy army is 1.5x ours, only income-critical savings remain; when an attack on the base is stronger than everything we could send, nothing is saved.
- **Early rush:** in the first five minutes, with the enemy army 1.5x ours, the AI calls off non-essential construction (full refund), skips harvesters past the first, research and level-ups, and builds up to three barracks and units.
- **No room to build:** on a cramped rock shelf the AI started a building, couldn't place it, got a refund and retried every second, sitting on 20,000+ credits. It now checks for room before starting, falls back to a spot touching other buildings, and otherwise doesn't try that type again for 90 s.
- **Counters from measured duels:** `sim/matchups.ts` plays equal-cost duels of every unit pair (with and without Infantry Rockets) and writes `src/game/matchups.ts`; the AI scores each unit type against the enemy's army from it. Bad matchups count double (a hard counter in their army kills the unit before it does its job), and a combined-arms base mix (tanks and rocket launchers at the core) with a diversity factor keeps the army from turning into one blob. Rerun `npx tsx sim/matchups.ts` after any change to unit stats. `sim/duel.ts` prints quick equal-cost duels.
- **Lines:** Hard waits for the line of the unit it wants instead of filling idle barracks with infantry (before, cheap infantry made up most of its army whatever it faced).
- **Waves:** a wave sets out only when it's at least 0.6x (Normal) / 0.9x (Hard) the enemy army, counting enemy units within 20 tiles of their own buildings 1.5x.
- **Leash:** units at home or defending that get more than 22 tiles from the rally point come straight back with a plain move. A kiting trike used to drag a defender 40 tiles out (`sim/ai-check.ts` checks it).


**Balance pass (after the gauntlet).** Equal-cost duels (`sim/matchups.ts` prints them; -1 to +1) and the gauntlet, 20 games per row:
- **Infantry 60 -> 90 credits, build time 3 -> 4.5 s** (decided). At 60 nothing early beat massed infantry (even with trikes, +0.18 against tanks), so a Barracks-first rush beat any economic opening. At 90 infantry lose to trikes (-0.52) and tanks (-0.48) without Infantry Rockets, and still beat tanks with them (+0.65). 75 credits plays the same in the gauntlet and keeps infantry closer to even with trikes (-0.28), if that's preferred.
- **Splash falls off** (`SPLASH_SHARE` in `game.ts`): the unit aimed at takes the full hit, others in the blast half, less toward the edge. Before, every unit within reach took full damage: one rocket volley into a column of tanks did 4-5x its damage, and tanks, the counter to rocket launchers, only broke even (+0.13; now +0.31).
- Looked at and left alone: Infantry Rockets' anti-armor bonus (cutting it from 22 to 10 barely moves infantry vs tanks; tanks lack splash and are weak against infantry by design), rocket launcher range (14-15 instead of 17: +0.03), tagging rocket launchers light (lets trikes kill them, beyond the trike's raider role), refinery price (a second refinery earns about what one extra harvester does and costs 400 more: fair).
- Hard vs bots after the pass: drop 100%, harass 70%, rockets 70% (was 10-15%), turtle 70% (was 15%), rush 25% (was 0%, and it now kills 3.8 units per unit lost). Hard vs Normal 88%.
- **Bunker** (decided; `sim/bunker-check.ts`): 400 credits, 2x2, 1,400 HP, needs a Barracks. Holds three infantry, who shoot from it with their own weapons and range (measured from its walls), including Infantry Rockets against armor, and can't be hurt inside; they get out with F, or alive when it falls. Tanks (range 10) still outrange infantry rockets (8), and rocket launchers (17) outrange everything, so a bunker line has an answer. Players right-click a bunker with infantry to fill it.
- **Hotkeys on the left hand** (decided, as in Stormgate): A attack-move, S stop, D drop, F unload, Space base, ` pause. The camera pans with arrows, screen edges and middle-drag (WASD panning dropped, since those keys are commands now). Q W E R and Z X C V are free for production hotkeys later.
- The AI keeps one (Normal) or two (Hard) bunkers at the front of its base and fills them with idle infantry. Under pressure (an early rush, or an enemy army well ahead of its own) it builds a bunker first, keeps only its minimum harvesters, and spends on the best unit a free production line can start right away instead of saving for an ideal one.
- With bunkers, Hard beats the infantry rush 65% (was 25%) and Normal 50% (was 20%); the other matchups held (drop 100%, rockets 70%, harass 65%, turtle 55%), and Hard beats Normal 93%.

**Brutal, first version (done).** `BrutalAI` in `src/game/brutal.ts` (a subclass of the AI, with Hard's economy and planning) and `Micro` in `src/game/micro.ts`. It adds what a strong player does with their hands:
- **Kiting** (`Micro`): a turreted unit that outranges the enemies closing on it (tanks against infantry, rocket launchers against tanks, anything against a manned bunker it outranges) backs off while its turret keeps firing. Only against enemies it can keep away from (not trikes).
- **Focus fire:** units shoot the target in range that dies to the fewest shots, dangerous ones first, and spread out once a target already has enough fire on it.
- **Rotating damaged units out:** a unit under 35% health that's still being hit leaves the fight (vehicles to a Repair Vehicle, infantry home to heal) and rejoins the next wave. Only when nothing faster than it is chasing it and two healthy friends are nearby to take its place; otherwise it would just be shot in the back.
- **Marching:** until a wave makes contact, units that get 7 tiles ahead of the slowest stop and wait, so trikes don't arrive alone.
- **Harvesters run** for the refinery when they're down a third of their health and there's more enemy strength around them than ours (fleeing at every bullet cost more income than raids did).
- **Two-front attacks:** a wave of 8 or more sends its fastest units, up to a third of its strength, at a refinery or harvester away from the main target. Trike raids are bigger and more frequent (4 trikes from 2:00, every 45 s).
- **Carryall operations,** once it has a Hi-Tech Factory (from 10:00, or 6:00 on Large maps, with 10 combat units, an army 1.2x the enemy's and 1,600 credits to spare). Two Carryalls:
  - *Sniping drops:* a rocket launcher is set down about 13 tiles from an enemy harvester, on the side away from their base, kites anything it outranges, and is lifted out as soon as more than it can handle closes in (or it's hurt, or there's nothing left to shoot), then goes on to the next harvester. A second Carryall with another launcher joins in on the same harvester from another side.
  - *Troop strikes:* six infantry dropped on a harvester guarded by less than half their strength, lifted out the same way. If the Carryall is hit on the way in, the troopers jump right there and draw the fire while it gets away.
  - Flights avoid known anti-air: if the straight line passes near infantry, rocket launchers or bunkers it has seen, the Carryall detours through a waypoint to one side; with no safe way in, it doesn't go. Idle Carryalls ferry the harvester with the longest trips and wait behind the base, not over the rally point (where they got shot down).
- Faster reactions: it thinks every 0.5 s (Hard: 1 s), and runs micro, retreats and Carryall operations every 0.2 s.
- Economy tweaks: the army gathers 10 tiles out instead of 7 (in a cramped base the waiting army blocked harvester lanes) and a second Factory comes at 1,200 credits banked instead of 2,500.

How it was measured (`sim/brutal.sh`, Brutal against Hard on paired random maps; `SEEDS=2000` for fresh maps; `sim/micro-check.ts` for equal-cost battles with micro on one side; `sim/snap.sh` runs a batch from a snapshot of the code so edits made meanwhile don't leak into it):
- Equal-cost battles, micro against plain attack-move (value left, own / enemy): tanks against infantry with Infantry Rockets 0% / 84% → 58% / 72%; rocket launchers against tanks 0% / 62% → 18% / 13%; tanks against infantry behind two bunkers 28% → 62% left.
- Against Hard on 100 fresh small maps (200 games each): Hard through the Brutal class with every switch off 50% (the harness is fair); Hard plus micro only 60%; Brutal without air 72% (kill/death 1.56); without mending 60%; marching, the flank split and harvester retreat ±2% each (kept: they matter more against a person, who reacts slower than Hard's instant defense).
- **Overfitting:** the first round of tuning used maps 1000-1039, where Brutal reached 80%; on maps 1040-1079 the same AI won 55%. Games are deterministic, so replaying the same maps doesn't average anything out. Check decisions on a fresh seed range.
- **Air pays poorly against Hard.** A Hi-Tech Factory and two Carryalls cost 2,600 credits, and Hard answers anything near a harvester within seconds; a harvester takes 43 s to kill with one rocket launcher. Hi-Tech at 6:00: 63% on small maps (−9 against no air), 65% on medium (−11); from 10:00: 70% and 73% (no air: 72%, 76%). Large maps are the exception, where Carryalls cross distances ground units take long to: 80% with Hi-Tech at 6:00, 75% from 10:00, 70% without air (80 games each). So air comes at 10:00 on Small and Medium maps and 6:00 on Large ones. Things that didn't help: tanks instead of rocket launchers for sniping, timing troop strikes with waves (−2 to −4%), a unit mix leaning toward turreted units (neutral), holding outmatched fights longer (−7%), diving under rocket launchers' minimum range. Air is kept, from 10:00, for the pressure it puts on a person's attention, which the sims can't measure.
- **Final:** Brutal beats Hard 71% (kill/death 1.55) on 100 small maps never used in tuning (`SEEDS=3000`, 200 games).
- Against the scripted bots (`sim/gauntlet.sh 20 hard brutal`, measured with Hi-Tech at 6:00), Brutal / Hard: rush 65% / 50%, turtle 75% / 65%, harass 75% / 70%, rockets 65% / 65%, drop 90% / 95%; Brutal beats Normal 90%.

Next for Brutal: rocket-launcher armies and turtles are its weakest matchups (kill/death below 1), and the early game (before tanks, where micro has little to work with) decides most of its losses.

**Structure:** one AI driven by a per-difficulty `AIProfile` (settings and feature switches), not three separate AIs. The profile type exists in `src/game/ai.ts`; `NORMAL_PROFILE` reproduces the original behavior.

**Spending decisions use value estimation (utility AI)**, scored in credits rather than vague weights. Example: a harvester is worth income per minute × expected lifetime × survival odds, minus its cost. This covers a small set of choices: harvester, army unit, tech, refinery, backup Construction Yard. Movement and combat stay scripted.

**Reaction time instead of APM:** each level gets a reaction delay (around 2 s / 1 s / 0.3 s).

**Open:** should Brutal get resource bonuses? Current recommendation: no. Should the AI only see what its units can see? Today it sees the whole map.

## Simulation findings (single map, seed 7)

Harness in `sim/`: the game runs headless in Node at about 600× real time.

- At the old price of 300, harvesters paid for themselves in under a minute, so more was always better (12+). **Harvester price raised to 800** (decided). Tests at 900 showed counts from 4 to 10 all viable, which gives a real trade-off.
- A refinery adds no income: several harvesters unload at one refinery at the same time. One vs two refineries at equal harvester counts gave the same income.
- Builds with a second refinery still won matches. Not yet explained: the likely cause is that the experiment also changed when tech spending starts. This needs re-testing.
- **Re-tested on random maps (with the revised Normal):** building the second refinery right away beats building it only under threat or never, at every harvester count: 4 harvesters 85% vs 73%, 6 harvesters 83% vs 73% (threat) and 58% (never). Spice at 5 minutes jumps from about 8k to 11k. The free harvester that comes with it is the likely reason. Two factories instead lost badly (28%).
- **Open:** a refinery still includes a free harvester. At 800 that makes a refinery a 400-credit building plus a harvester. Options: raise the refinery to about 1,800-1,900, or drop the free harvester.
- Normal loses to an early mass-infantry rush. Worth fixing in Normal, or worth using as an early aggression option for Hard.
- All of this was measured on one map. Re-run after procedural maps and the expansion changes.

### Running the sims

```sh
sim/run.sh 10 4                        # every variant in sim/variants.ts vs Normal, 40 games each
sim/roundrobin.sh 20 h6-always h8-always h10-always   # variants vs each other
HARV_COST=900 sim/roundrobin.sh 20 ...                # balance experiment with a price override
npx tsx sim/economy.ts                 # economy only, no enemy
```
