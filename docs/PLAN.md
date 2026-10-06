# Strat roadmap

Living plan for upcoming features and the AI difficulty work. Decisions are marked **Decided**; everything else is a proposal.

## Order of work

1. Elevation and ramps, with per-unit-class pathfinding
2. Elevation range modifier
3. Procedural maps: sizes, up to 4 players, validation
4. Expansion mechanic (MCV, home fields that run out)
5. Hard AI (economy, recovery, harassment, chokepoint awareness), tuned across many generated maps
6. Brutal AI, once units and numbers have settled

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
  - **E**, then left-click: drop. A heavy vehicle aboard means a touch-and-go: a long shallow approach, nose up as it brakes, the load set down, then a climb away. Infantry and trikes: a fly-by at full speed, everyone parachuting out one after another around the point (trikes on bigger, slower canopies; nobody can act until they land). Either way it then flies back to where it was when given the order. Seat lights on the spine and a troop pod show infantry aboard.
  - Flying low raises downwash dust: thick over sand, red over spice, a little brown over rock.
  - Picking up a harvester assigns the Carryall to it: whenever the harvester would set off on a trip longer than 10 tiles (to spice or back to a refinery), it waits to be lifted and is set down at the far end. A ferried harvester that comes under fire heads home and calls its Carryall, which flies it to the refinery whatever the distance. In the sim ferrying doubles a harvester's income from a field 40 tiles away. Giving the Carryall another order ends the assignment.
  - **Anti-air:** infantry (rifles and rockets) and rocket launchers can shoot aircraft (rockets get +25 against them); nothing else can. A Carryall that's shot down loses vehicles aboard (hanging trikes included), while infantry bail out by parachute. Drops landing within 22 tiles of the other side's buildings warn its owner.

Follow-ups: the AI doesn't build Repair Vehicles, the Hi-Tech Factory or Carryalls yet (its units do shoot at enemy aircraft). Carryalls ignore threats when choosing a path.

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

**Hard, first version (done).** `HARD_PROFILE` in `src/game/ai.ts`, picked from the menu. Brutal is on the menu as "coming soon". Tuned on random maps (`MAPS=random sim/run.sh`, 40-80 games per row, against Normal):

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
- Still open: the infantry rush beats Hard 3 games in 4 even though it trades badly; it wins by reaching the base before Hard's army does. There are no defensive structures, which is what usually stops this in RTS games.

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
