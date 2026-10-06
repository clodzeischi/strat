# Strat roadmap

Living plan for upcoming features and the AI difficulty work. Decisions are marked **Decided**; everything else is a proposal.

## Order of work

1. Elevation and ramps, with per-unit-class pathfinding
2. Elevation range modifier
3. Procedural maps: sizes, up to 4 players, validation
4. Expansion mechanic (MCV, home fields that run out)
5. Hard AI (economy, recovery, harassment, chokepoint awareness), tuned across many generated maps
6. Brutal AI, once units and numbers have settled

Brutal waits because timing builds and micro depend on exact numbers (speeds, ranges, build times), so every balance change would break them. Hard's general systems (rebuilding, value-based spending) read costs and stats from `config.ts`, so they survive changes.

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

To check in the fairness work: side 1 won 25 of 40 Normal-vs-Normal games on the 64 map, and all 4 audited games on 96 and 128. The terrain is symmetric, but other things aren't: every building's exit faces south, so team 0's units come out facing the map edge while team 1's face the center, and building placement scans in a fixed order.

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

## AI difficulty plan

| Level | Intent |
|---|---|
| Normal | Plays steadily: builds an army and sends small waves. Keeps new players engaged but not stressed. This is today's AI and stays as the baseline. |
| Hard | Strong economy, recovers from setbacks, small harassment, practices army compositions, starts taking the initiative. |
| Brutal | Optimized timing builds, constant harassment, fast reactions, micro (rotating damaged units, picking squads to counter the player's formations), forcing the player to split attention. |

**Structure:** one AI driven by a per-difficulty `AIProfile` (settings and feature switches), not three separate AIs. The profile type exists in `src/ai.ts`; `NORMAL_PROFILE` reproduces the original behavior.

**Spending decisions use value estimation (utility AI)**, scored in credits rather than vague weights. Example: a harvester is worth income per minute × expected lifetime × survival odds, minus its cost. This covers a small set of choices: harvester, army unit, tech, refinery, backup Construction Yard. Movement and combat stay scripted.

**Reaction time instead of APM:** each level gets a reaction delay (around 2 s / 1 s / 0.3 s).

**Open:** should Brutal get resource bonuses? Current recommendation: no. Should the AI only see what its units can see? Today it sees the whole map.

## Simulation findings (single map, seed 7)

Harness in `sim/`: the game runs headless in Node at about 600× real time.

- At the old price of 300, harvesters paid for themselves in under a minute, so more was always better (12+). **Harvester price raised to 800** (decided). Tests at 900 showed counts from 4 to 10 all viable, which gives a real trade-off.
- A refinery adds no income: several harvesters unload at one refinery at the same time. One vs two refineries at equal harvester counts gave the same income.
- Builds with a second refinery still won matches. Not yet explained: the likely cause is that the experiment also changed when tech spending starts. This needs re-testing.
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
