# Fremen mirror balance (branch `fvf-balance`)

Goal (the user's, as for docs/balance-atreides.md and docs/balance-corrino.md): every unit relevant all game, upgrades
worth their price, no single strategy that beats everything.

## Tools

`FACTION=fremen sim/ava.sh <games-per-pair>` runs a round robin of the Fremen build orders in `sim/ava-strats.ts`
(`FREMEN_STRATS`); the summary now also prints Sandworms called per plan and what they ate, and the tech table has
Sietch III. `FACTION=fremen npx tsx sim/ava-duels.ts` runs equal-cost duels (Mortars set up as the AI sets them up).
`FACTION=fremen npx tsx sim/mirror-trace.ts <a> <b> [seed]` prints one game every minute (units, structures, waves out,
upgrades). `<plan>-no-<upgrade>` plays a plan without one research (e.g. `std-no-fWeapons`), to see what it's worth.

| plan | what it does |
|---|---|
| std | stock Brutal (counter-picks from `src/game/matchups.ts`) |
| rush | three Barracks, Warriors only, attacks from 1:40, no tech, two crews |
| swarm | Warriors only, all upgrades (Sandwalk first), six-Warrior raids every 30 s |
| fed | Great Sietch first, Fedaykin with Warriors |
| mortar | Great Sietch first, a Mortar line (one per two units, up to 14) behind Warriors |
| rider | Fedaykin and up to eight Sandriders, Ambush first at Sietch III |
| mass | Spice Mining and Sandwalk only, no Great Sietch, every other credit into Warriors (added in round 6) |
| turtle | four bunkers, everything researched, no attack before 14:00, Fedaykin, Mortars, Sandriders |

Every fixed plan techs once it has 8 units (stock Brutal's `techArmy`); see round 3.

## Log

### 0. Baseline (cvc-balance @ 32efcbd), 40 games per pair

| row vs col | std | rush | swarm | fed | mortar | rider | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 85 | 64 | 89 | 91 | 96 | 89 | **86** |
| rush | 15 | . | 29 | 16 | 15 | 24 | 15 | 19 |
| swarm | 36 | 71 | . | 60 | 50 | 61 | 49 | 55 |
| fed | 11 | 84 | 40 | . | 65 | 39 | 90 | 55 |
| mortar | 9 | 85 | 50 | 35 | . | 43 | 91 | 52 |
| rider | 4 | 76 | 39 | 61 | 58 | . | 90 | 55 |
| turtle | 11 | 85 | 51 | 10 | 9 | 10 | . | 29 |

Games 18.8 min, **30% timeouts** (swarm vs swarm 90%). Warriors did 70% of the killing (kill ratio 1.03); Fedaykin
0.84. Worms 0.55 a game for std, 1.2 for the rider plan. Duels (equal cost): Warriors beat everything (+0.65 to +0.79);
Fedaykin and Mortars lost to everything but each other. In the mirror every Fremen unit is infantry, and the Fedaykin
(-3 vs biological) and the Mortar (-10, splash 1.5) are anti-vehicle units with nothing to shoot.

### 1. AI: Fremen waves (two bugs, every matchup)

A trace of swarm vs swarm: 300+ Warriors a side and not one wave in 30 minutes.
- **Hunting raids kept every Warrior home.** Brutal's raids hunt, and hunting raiders stay out of waves by type; the
  Fremen raider is the Warrior, their line infantry. Each raid also took every Warrior at home. Now, where the raider
  is also the faction's fallback unit, only a raid's worth is kept back (`raidReserve`).
- **Spice Camps counted as the base.** Camps stand on the shared fields, near the enemy's troops all game, so the base
  was "under attack" all game and no wave ever left. Camps are now guarded like harvesters (`findThreats`).

Atreides and Corrino play exactly as before (the same games, checked game by game). Round robin (40 per pair): games
10.9 min, timeouts 7%; std 80, swarm 68, rush 67, fed 47, rider 40, mortar 34, turtle 13. Warrior plans dominate now.

### 2. Fedaykin sonic cone; wider Mortar splash; Warriors weak against structures

Duel sweeps: a cone on the weirding module (`cone`, as the Razor's flame: hits everything in a narrow arc) at 0.35
made Fedaykin beat Warriors -0.82; at 0.25, +0.59 for the Fedaykin, and they still lose to Sandriders (-0.63). Mortar
splash 1.5 → 3, -10 → -4 vs biological: Mortars about even with Warriors (+0.13). In games: Fedaykin kill ratio 1.08,
Mortar 1.81; rush still 59 and std 82. Warrior damage vs structures -2 → -3.5 (a Warrior mob can't raze a base on its
own): rush vs the tech plans ~50 → 22 (30 games per pair).

The cone draws as a pale ripple of sound kicking up sand rather than fire (any cone weapon that pierces).

### 3. The plans tech after 8 units, not 3

std still won 73-98% against every fixed plan, all at ~8 min. A trace: the plans sat on 1,300+ credits at 4:00 saving
for tech with an army of 10. The Fedaykin plan with `techArmy: 8` (std's) beat std 67% instead of 27% (30 games);
with std's counter-picking (`counterFocus: 8`) it lost more (17%). Every fixed plan now uses 8. Round robin (30 per
pair): mortar 75, fed 73, std 67, rush 41, rider 41, swarm 27, turtle 25.

### 4. Sandriders (and an AI fix for their Thumpers)

The rider plan (41) lost to the plans its Sandriders should eat (fed 17, mortar 27). Isolated: the Fedaykin plan plus
four Sandriders = 50% against itself (neutral); rushing Sietch III with an army of 8 instead of 16 cost the rider
plan ~30 points (`riderrush`); Ambush first, -9. Tried on fed + four Sandriders vs fed (40 games): 360 HP 61, a faster
knife with a longer charge 54, a cheaper Thumper 50, **a 200 / 8 s rite 66**. AI fixes on the way:
- Thumpers had to be 15+ tiles clear of the planter's own structures on the sand, which in the mirror ruled out most
  spots by the shared fields. A ridden worm never bites its own side; now only the eruption's reach is kept clear.
- Sandriders charge the most valuable infantry about (cost counts as distance in target choice), not the Warrior
  screen in front.

Written in with round 2: Sandrider rite 300 → 220, 12 → 10 s; 260 → 320 HP (later 280); Ambush +50% → +75%,
700 → 500 (later 400); Mortar bonus vs biological -7 (not -4: -4 made the Mortar plan top, 74). Counter table
regenerated. Round robin (40 per pair): std 71, mortar 66, fed 62, rider 50, rush 46, swarm 30, turtle 25. Kill
ratios: Mortar 1.48, Sandrider 1.36, Fedaykin 1.23, Warrior 0.85.

### 5. Upgrades: what they're worth

Each upgrade taken out of std's research, std against itself (40 games): skipping Spice Mining 33, Sandwalk 35 (both
pay), but Weapons 63 (!), Armor 53, Stillsuits 58, Ambush 51, Weapons +2 53, Armor +2 53. Taking one out only brings
the next ones forward, so the real test is the whole set: std with only Spice Mining and Sandwalk beat std **61%**
(no research at all: 29%). For comparison, the Atreides mirror: std without Weapons I 38, without Armor I 25, with
no research 18. Fremen combat upgrades didn't pay for themselves.

Also found: std with no combat research skipped the Great Sietch altogether (the AI only levelled up for trained
units, not rites; fixed: it levels up for any unit it means to field) and fielded 330 Warriors, which beat everything:
the `mass` plan. Against it (40 games, mass vs fed / mortar / std / rider):

| change | | | | |
|---|---|---|---|---|
| none | 58 | 56 | 61 | 60 |
| upgrades cheaper and x1.5 (`UpgradeDef.scale`) | 36 | 31 | 44 | 45 |
| ... and Fedaykin cone 0.35 | 28 | 34 | 33 | 26 |
| ... and Great Sietch 700 / 25 s | 10 | 13 | 8 | 8 |
| ... and Mortar splash 3.5 | 30 | 30 | 35 | 38 |

Taken: the first. Fremen Weapons and Armor steps count 1.5 standard steps (+30% damage, 22% less damage taken per
level), 550 / 25 s and 800 / 35 s; Stillsuits 400 / 20 s; Ambush 400. With them, combat upgrades are worth having
(std with eco upgrades only vs std: 44).

### 6. Sandrider 280 HP

With the upgrades the rider plan led (72; 80 vs fed, 57 vs std). 280 HP: 65 / 55 / 53 / 54 vs fed / mortar / std /
mass; a 270 rite or a slower knife did no better. Ambush isn't it (Ambush-first fed vs fed 45); the Sandriders are.
Taken: 280 HP.

### 7. Committed config, 40 games per pair (1,440 games)

| row vs col | std | rush | swarm | fed | mortar | rider | mass | turtle | avg |
|---|---|---|---|---|---|---|---|---|---|
| std | . | 54 | 95 | 63 | 45 | 45 | 58 | 93 | 64 |
| rush | 46 | . | 46 | 46 | 46 | 46 | 50 | 45 | 47 |
| swarm | 5 | 54 | . | 5 | 4 | 10 | 35 | 65 | 25 |
| fed | 38 | 54 | 95 | . | 48 | 35 | 64 | 88 | 60 |
| mortar | 55 | 54 | 96 | 53 | . | 45 | 69 | 98 | 67 |
| rider | 55 | 54 | 90 | 65 | 55 | . | 54 | 100 | 68 |
| mass | 43 | 50 | 65 | 36 | 31 | 46 | . | 35 | 44 |
| turtle | 8 | 55 | 35 | 13 | 3 | 0 | 65 | . | 25 |

Games 10.7 min (median 8.4), timeouts 6% (baseline 18.8 min, 30%). The four real plans sit at 60-68 (baseline: std 86,
the rest 19-55); no plan's worst matchup is above 55 (rider: 54-55 everywhere, within noise; it was 47 vs std in the
30-game round). Std loses to mortar and rider, mortar to rider, fed to std and rider; the fed and mortar plans beat
mass, which beats the warrior swarm and the turtle. Pure Warriors (swarm) and turtling lose, as in the other mirrors.

Kill ratios (credits killed / lost): Mortar 1.67, Sandrider 1.36, Fedaykin 1.34, Warrior 0.86 (baseline: Mortar 1.20,
Warrior 1.03, Sandrider 0.99, Fedaykin 0.84). Per game, Warriors still kill the most (14k: the screen and the
numbers), Fedaykin 4.9k, Mortars 3.4k, Sandriders 1.3k plus worms (0.7-1.0 a game for plans with Sandriders, ~800
credits eaten each game). Every plan that can field them builds Fedaykin, Mortars and Sandriders.

Duels (equal cost, 3,000; row's score, early / late): Fedaykin beat Warriors +0.59 / +0.49, Sandriders beat Fedaykin
+0.64 / +0.69 and Mortars +0.79 / +0.83, Warriors beat Sandriders +0.74 / +0.73; Mortars are even with Warriors in the
open (+0.03 / -0.11) and win as a line in the games.

### Cross-faction (Hard vs Hard, 100 games): to be settled next

| Fremen vs | before (log of 2026-10-24) | AI fixes only | committed |
|---|---|---|---|
| Atreides | 51% | 79% | **93%** |
| Corrino | 28% | 47% | **75%** |

The AI fixes (round 1) are most of it: Fremen waves now include their Warriors. The Fedaykin cone and the stronger
upgrades add the rest. Atreides vs Corrino is still 1% (docs/balance-corrino.md). All three need a cross-faction pass.
