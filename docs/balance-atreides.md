# Atreides mirror balance (branch `ava-balance`)

Goal: Atreides vs Atreides that plays tight. In order: (1) units counter each other (rock-paper-scissors, no best
unit); (2) no single strategy wins on every map; (3) teching is costly but pays; (4) control beats a turtled deathball;
(5) every unit stays relevant all game (Infantry Rockets, Trike Nitro); (6) reorder the tech tree if it helps.

## Tools

- `sim/ava-strats.ts`: Atreides build orders, each Brutal (micro, mending, Carryalls) playing a fixed plan:
  `std` (stock Brutal, counters what it sees), `rush` (2 Barracks, infantry, first wave at 1:40), `bio` (infantry,
  HQ Level 2 and Infantry Rockets first), `mech` (tanks and trikes, Weapons/Armor), `trike` (trikes, Nitro first,
  6-trike raids every 30 s), `tech` (Factory Level 2 first, MLRS and tanks), `turtle` (3 bunkers, everything
  researched, no attack before 14:00). Fixed plans use `counterFocus: 1`, so they barely react.
- `sim/ava.ts <a> <b> <games> [offset]`: one JSON line per game (random maps from `SEEDS`, default 1000, each map
  from both sides): result, length, units built, kills and losses by unit type (credits), tech timings.
- `sim/ava.sh <games-per-pair> [strat...]`: round robin on every core, then `sim/ava-summary.ts`. Long batches:
  `OUT=<file> sim/snap.sh <name> sim/ava.sh 40`.
- AI change for this: `AIProfile.kit` overrides the tech path / research order, so a profile can play a build order.

## Log

### 0. Baseline (main @ 91648f7)

`OUT=... sim/snap.sh base sim/ava.sh 40` — 7 strategies, 40 games per pair (1,120 games, small random maps from
seed 1000). Avg 10.3 min, median 9.7, 27% under 8 min, 2% over 20, no timeouts.

| row vs col | std | rush | bio | mech | trike | tech | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 73 | 93 | 33 | 88 | 28 | 65 | 63 |
| rush | 28 | . | 30 | 28 | 30 | 28 | 25 | 28 |
| bio | 8 | 70 | . | 5 | 15 | 5 | 20 | 20 |
| mech | 68 | 73 | 95 | . | 90 | 30 | 68 | 70 |
| trike | 13 | 70 | 85 | 10 | . | 13 | 45 | 39 |
| tech | 73 | 73 | 95 | 70 | 88 | . | 90 | **81** |
| turtle | 35 | 75 | 80 | 33 | 55 | 10 | . | 48 |

Killed / lost per game (credits): tank 20.0k / 13.3k (1.50), MLRS 9.3k / 2.3k (**4.06**), infantry 3.5k / 7.1k
(0.49), trike 2.8k / 6.3k (0.45). Win% for the side that got a tech step a minute+ earlier: Factory Lv 2 **86%**,
Weapons II 84%, HQ Level 2 46%, Infantry Rockets 46%, Nitro 54%.

Counter table, equal cost (3,000), Brutal micro on both sides (`sim/ava-duels.ts`; row's score vs column, -1..+1):

| early | inf | trike | tank | MLRS |   | late (all upgrades) | inf | trike | tank | MLRS |
|---|---|---|---|---|---|---|---|---|---|---|
| infantry | . | -0.65 | -0.85 | -0.87 | | infantry (Rockets) | . | -0.79 | +0.22 | -0.86 |
| trike | +0.65 | . | -0.74 | -0.46 | | trike (Nitro) | +0.79 | . | -0.70 | -0.10 |
| tank | +0.85 | +0.74 | . | +0.15 | | tank | -0.22 | +0.70 | . | +0.18 |
| MLRS | +0.87 | +0.46 | -0.15 | . | | MLRS | +0.86 | +0.10 | -0.18 | . |

Conclusions: the tank beats everything early and everything but rocket infantry late; the MLRS beats everything
but tanks and almost never dies; together (Factory Lv 2 first) they are the one best plan. Trikes only beat
bare infantry, infantry only beats tanks and only after 2,100 credits of tech. HQ Level 2 / Rockets don't pay.

### 1. MLRS light, tanks and trikes softer on infantry, Rockets off HQ Level 2

`TUNE` (sim/tune.ts overrides): MLRS tagged light instead of armored (trikes and rifles hurt it, Infantry Rockets
don't swap in); tank vs biological -6 → -10; trike vs biological +4 → +2; Infantry Rockets need Barracks + Factory
(not HQ Level 2), 600 → 800. 30 games per pair (840).

Duels (micro both sides): trikes now beat MLRS (+0.33 early, +0.50 with Nitro), infantry vs trikes -0.65 → -0.49.
Round robin avg: tech 83, mech 76, std 57, turtle 46, trike 40, rush 25, bio 22. Kill ratios: tank 1.55, MLRS 4.09,
infantry 0.58, trike 0.46. Factory Lv 2 a minute early still wins 85%.

Conclusion: the duel changes barely reach the games. bio vs mech breakdown: mech's tanks kill 16.6k per game, bio's
infantry 1.6k; bio only has Weapons I / Armor I while mech has II (gated on Factory Lv 2), and tanks (range 10)
kite rocket infantry (range 8). Infantry needs to really win against tanks, and the tank needs a second counter.

### 2. Tanks 450 / range 9, infantry 80 HP and Rockets range 9, MLRS anti-armor

On top of round 1: tank 400 → 450 credits, range 10 → 9; infantry 70 → 80 HP, Infantry Rockets range 8 → 9; MLRS
vs biological +35 → +25, vs armored +20 (new). 30 games per pair.

Duels late: infantry (Rockets) vs tank +0.22 → +0.77; tank vs MLRS +0.18 → -0.04; early infantry vs tank -0.85 → -0.43.
Round robin avg: tech 81, mech 61, std 54, trike 46, turtle 44, bio 37 (was 22), rush 27. Kill ratios: tank 1.20,
MLRS **4.40**, infantry 0.80, trike 0.56.

Conclusion: infantry and tanks are closer, but the MLRS is the problem now: it kills infantry and tanks from behind
the tank line and almost never dies (killer x victim: MLRS killed 4.5k per game, lost ~0.1k). Factory Lv 2 = MLRS
is the best plan whatever the opponent does.

### 3. MLRS 600 credits, 180 HP, range 15; Factory Lv 2 1,500

On top of round 2: MLRS 500 → 600, build 11 → 13 s, 200 → 180 HP, range 17 → 15; Factory Level 2 1,200 → 1,500.
Round robin avg: tech 75, mech 68, std 56, trike 44, bio 43, turtle 36, rush 28. Kill ratios: tank 1.30, MLRS 3.49,
infantry 0.81, trike 0.58. Killer x victim (credits/game): MLRS → tank 3.8k, MLRS → infantry 2.1k; tank → tank 9.6k.

Conclusion: MLRS cheaper to lose now but its +20 vs armored (round 2) made it the tank killer too; and the bio
plan was paying 1,500 for HQ Level 2 that, with Rockets moved off it, only gave Harvesting. Next: HQ Level 2 gets
Weapons II / Armor II (a tech step every plan wants; Factory Lv 2 is then purely the MLRS), MLRS loses the armor
bonus again.

### 4. Weapons II / Armor II move to HQ Level 2; MLRS back to no armor bonus

On top of round 3: Weapons II and Armor II need HQ Level 2 (was Factory Lv 2), so HQ Level 2 is the upgrade step
for every plan and Factory Lv 2 is only the MLRS; MLRS vs armored +20 → 0. Plans: mech and trike now go HQ Level 2,
tech goes Factory Lv 2 then HQ Level 2.

| row vs col | std | rush | bio | mech | trike | tech | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 72 | 53 | 37 | 73 | 60 | 70 | 61 |
| rush | 28 | . | 27 | 28 | 35 | 27 | 23 | 28 |
| bio | 47 | 73 | . | **62** | 57 | 47 | 60 | 58 |
| mech | 63 | 72 | 38 | . | 80 | **67** | 83 | 67 |
| trike | 27 | 65 | 43 | 20 | . | 23 | 53 | 39 |
| tech | 40 | 73 | 53 | 33 | 77 | . | 67 | 57 |
| turtle | 30 | 77 | 40 | 17 | 47 | 33 | . | 41 |

Kill ratios: tank 1.45, MLRS 2.77, infantry 0.87, trike 0.59. Tech a minute+ early: Factory Lv 2 66%, HQ Lv 2 67%,
Infantry Rockets 70%, Weapons II 81%, Nitro 57%.

Conclusion: first real cycle: bio beats mech (62%), mech beats tech (67%), tech/std hold bio about even, and the
spread of averages shrank from 20-81 to 28-67. Turtle is a losing plan (41%), as wanted. Weak: trikes (39%) and
the rush (28%). Tanks still the most efficient unit.

### 5. Trikes 130 credits, 4.5 s; Nitro +50% speed

On top of round 4: trike 150 → 130, build 5 → 4.5 s; Nitro speed x1.4 → x1.5.
Round robin avg: mech 66, std 61, tech 61, bio 57, trike 48 (was 39), turtle 39, rush 18 (was 28).
Kill ratios: tank 1.41, MLRS 2.72, infantry 0.83, trike 0.67.

Conclusion: trikes are a real plan now (even with bio and tech), and they eat the infantry rush. Mech is still top
(beats std, trike, turtle; loses to bio 43%); tanks are still the most cost-efficient unit. Next: tank 450 → 420 HP;
infantry 4.5 → 4 s so a Barracks start has more punch.

### 6. Tank 420 HP, infantry 4 s (rejected)

On top of round 5. Avg: mech 70, std 66, tech 63, bio 51, trike 48, turtle 38, rush 15; tank kill ratio unchanged
(1.42). Within noise of round 5 (30 games a pair is about ±9% per cell, ±4% per average) and no better: reverted.

### 7. Round 5 written into src/config, counter table regenerated

Committed values: infantry 80 HP, Rockets range 9; Infantry Rockets 800, need Barracks + Factory; trike 130 /
4.5 s, +2 vs biological; tank 450, range 9, -10 vs biological; MLRS 600 / 13 s / 180 HP / range 15, light,
+25 vs biological; Factory Lv 2 1,500, unlocks only the MLRS; HQ Level 2 unlocks Harvesting, Weapons II, Armor II;
Nitro x1.5 speed. `npx tsx sim/matchups.ts` regenerated `src/game/matchups.ts` (stock AI counters from it).
Plain attack-move duels now (`--` key): infantry vs tank +0.11 (micro: -0.43, so tanks have to kite), trike vs
MLRS +0.39, MLRS vs infantry +0.76, tank vs trike +0.54, tank vs MLRS +0.38; with Rockets infantry vs tank +0.70.

Round robin on the committed config (40 games per pair, 1,120 games; avg 12.0 min, median 10.9):

| row vs col | std | rush | bio | mech | trike | tech | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 88 | 78 | 45 | 63 | 35 | 78 | 64 |
| rush | 13 | . | 13 | 13 | 23 | 13 | 18 | 15 |
| bio | 23 | 88 | . | 58 | 48 | 68 | 69 | 59 |
| mech | 55 | 88 | 43 | . | 95 | 70 | 76 | **71** |
| trike | 38 | 78 | 53 | 5 | . | 43 | 68 | 47 |
| tech | 65 | 88 | 33 | 30 | 58 | . | 73 | 58 |
| turtle | 23 | 83 | 31 | 24 | 33 | 28 | . | 37 |

Kill ratios: tank 1.38, MLRS 2.60, infantry 0.88, trike 0.74. A cycle: bio > mech 58, mech > tech 70, tech > std
65, std > bio 78. But mech (tanks) is still top and crushes trikes (95%), and the rush is dead (15%).
Next: give the MLRS a little anti-armor (+10) so it, too, answers tanks (the tech plan should beat mech).

### 8. MLRS +10 vs armored

TUNE on the committed config. Avg: mech 69, std 66, tech 62, bio 54, trike 44, turtle 39, rush 16. tech vs mech
30 → 43. MLRS kill ratio 2.97. Small step the right way; kept for the next round. Mech still tops (97% vs trike).
Next: tank 450 → 500 credits; Barracks 500 → 400 (cheaper infantry start, for the rush).

### 9. Tank 500 credits, Barracks 400

On top of round 8. Avg: mech 65, bio 64, tech 59, std 54, trike 49, turtle 37, rush 22 (spread 22-65, was 16-69).
bio > mech 73, mech > tech 72 and > trike 80, tech > std 67, trike ≈ std/tech. Kill ratios: tank 1.35, MLRS 2.82,
infantry 0.89, trike 0.78. Kept. Odd one out: bio beats tech 60%, though the MLRS is meant to be the infantry
answer. Next: MLRS splash 2.5 → 3.

### 10. MLRS splash 2.5 → 3

On top of round 9. Avg: tech 64, mech 64, bio 60, std 54, trike 45, turtle 41, rush 22. bio vs tech 60 → 47.
Web now: bio > mech (73), mech > tech (65) and trike (80), tech > std (70), trike (63) and turtle (85), bio ≈ tech.
MLRS kill ratio 3.16, tank 1.32, infantry 0.88, trike 0.74. Kept.

Rounds 8-10 written into src/config (tank 500, Barracks 400, MLRS +10 vs armored, splash 3) and the counter table
regenerated. Plain attack-move duels: infantry vs tank +0.32 without Rockets, +0.73 with; tank vs trike +0.46;
tank vs MLRS +0.21; trike vs MLRS +0.33; MLRS vs infantry +0.81.

### 11. Committed config (rounds 1-10), 40 games per pair

| row vs col | std | rush | bio | mech | trike | tech | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 80 | 80 | 50 | 43 | 40 | 75 | 61 |
| rush | 20 | . | 23 | 20 | 25 | 28 | 13 | 21 |
| bio | 20 | 78 | . | **83** | 24 | 48 | 63 | 52 |
| mech | 50 | 80 | 18 | . | **83** | 70 | 63 | 60 |
| trike | 58 | 75 | **76** | 18 | . | 40 | 58 | 54 |
| tech | 60 | 73 | 53 | 30 | 60 | . | 85 | 60 |
| turtle | 25 | 88 | 38 | 38 | 43 | 15 | . | 41 |

1,120 games, avg 11.7 min, median 10.8. The five real plans sit at 52-61 (baseline: 20-81), with a clean
triangle: **bio beats mech 83%, mech beats trike 83%, trike beats bio 76%**; tech (MLRS) beats std, trike and turtle
and loses to mech; std (counter-picking) beats bio. Turtling loses (41%), the all-in rush loses (21%).
Kill ratios (killed / lost credits): tank 1.30, MLRS 2.2-3, infantry ~0.9, trike ~0.8 (all much closer than 1.50 /
4.06 / 0.49 / 0.45 at baseline). Tech a minute+ early wins 67-70% (Factory Lv 2 70, HQ Lv 2 67, Rockets 68, Nitro 70).

### 12. Infantry 90 → 80 credits (rejected)

Rush 21 → 24 (no real help), and it broke the triangle: trike 54 → 38 (trike vs bio 76 → 43), bio 52 → 63.
Not taken. The rush stays the weak plan: its counter (trikes) is in every opening now.

### 13. Control and map size (committed config)

- **Micro is worth more.** Stock Brutal against the same AI with micro off (`nomicro` in `EXTRA`), 80 games on fresh
  maps (`SEEDS=2000`): main 56% → branch **77%**. Tanks now have to kite rocket infantry (plain attack-move:
  infantry beats tanks +0.32 without Rockets; with micro the tank wins), and trikes have to dive MLRS. 8-9% timeouts
  in both, unchanged.
- **Medium maps** (`SIZE=96 SEEDS=3000`, 20 games per pair, fresh maps): tech 69, std 66, bio 60, mech 55, trike 54,
  turtle 41, rush 5; avg 16.3 min. A different best plan than on small maps (where std/mech/tech lead at 60-61):
  MLRS tech pays more with room, bio beats mech 88% and trike 70% there, the rush can't cross the distance.

### 14. Cross-faction check: Corrino got much stronger against the new Atreides

`FACTIONS=atreides,corrino sim/faction-match.sh 100 hard hard`: main 36-39% Atreides wins, branch **12-15%**
(Fremen unchanged, 53% → 53%). Bisected with `TUNE` (100 games each; ±5%):
- all of rounds 1-10 reverted: 48-52%; only unit changes reverted: 29%; only tech/price changes reverted: 32%.
- single reverts (60 games): Rockets back to HQ Lv 2/600: 22%; W2/A2 back to Factory Lv 2: 19%; Factory Lv 2 1,200:
  14%; MLRS back to 500/200 HP/range 17: 29%; trikes back: 15%. Using main's counter table: 7% (not the AI's picks).
- Every price rise on tanks and MLRS costs Atreides some raw power against Corrino. Relaxing them (tank 450, MLRS
  550/200 HP/16, Factory Lv 2 1,200, Rockets 600) gets Atreides back to 30% but brings the MLRS back in the mirror
  (tech 68 avg, MLRS kill ratio 3.44; round "r14"), and a middle set (tank 450, Factory Lv 2 1,200, Rockets 600,
  MLRS range 16) gives 25% vs Corrino, tech 66 / trike 41 in the mirror ("r15").
- A lever that can't touch the mirror or Fremen (neither has shields): Atreides weapons breaking shields.
  x1.5 on all: 21%; x2 on tank + MLRS: 30%; x2.5 on MLRS: 25%; **x2 on all five Atreides weapons: 41%**.

**Taken: every Atreides weapon (rifles, Infantry Rockets, trike MG, tank gun, MLRS) does x2 against shields**
(`shieldBreak: 2`, as the Fremen maula pistol has x3). 200 games: Atreides 35% vs Corrino (main 36%), Fremen vs
Atreides 48% / 52% over 100 games (main 53%). **Design call for the user:** it's the cleanest fix found, but it does
make shields count for less against Atreides; the alternative is the relaxed prices above at some cost to the mirror.

### 15. Final (committed config, counter table regenerated)

Mirror round robin, 40 games per pair, 1,120 games (identical to round 11: shields don't exist in the mirror):

| row vs col | std | rush | bio | mech | trike | tech | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 80 | 80 | 50 | 43 | 40 | 75 | 61 |
| rush | 20 | . | 23 | 20 | 25 | 28 | 13 | 21 |
| bio | 20 | 78 | . | 83 | 24 | 48 | 63 | 52 |
| mech | 50 | 80 | 18 | . | 83 | 70 | 63 | 60 |
| trike | 58 | 75 | 76 | 18 | . | 40 | 58 | 54 |
| tech | 60 | 73 | 53 | 30 | 60 | . | 85 | 60 |
| turtle | 25 | 88 | 38 | 38 | 43 | 15 | . | 41 |

Kill ratios (killed / lost credits per game): tank 20.2k / 16.1k = 1.25 (baseline 1.50), MLRS 8.5k / 2.8k = 2.99
(4.06), infantry 9.1k / 10.2k = 0.89 (0.49), trike 6.5k / 8.1k = 0.80 (0.45). Avg game 11.7 min, median 10.8,
4% over 20 min, no timeouts. Tech reached a minute+ before the opponent wins: Factory Lv 2 70%, HQ Lv 2 67%,
Weapons II 80%, Infantry Rockets 68%, Nitro 70% (baseline: Factory Lv 2 86%, HQ Lv 2 46%, Rockets 46%, Nitro 54%).

Checks: all `sim/*-check.ts` and `sim/smoke.ts` pass; `FACTIONS=atreides,atreides npx tsx sim/determinism.ts` all
deterministic. Two checks encoded the old ranges and were updated: `bunker-check` (a tank no longer outranges a
rocket bunker; an MLRS 12 out still does) and `mlrs-check` (the crossing target sits inside the new range 15).

### 16. Economy: slower harvesting, a Harvesting upgrade worth getting, cheaper Carryalls

Measured first with a scratch income sim: one Refinery placed as the AI places it, 1 or 3 harvesters, no enemy, 15 min,
6 maps per size. Before: a harvester brings ~1,000/min (an 800 harvester pays back in under a minute); Harvesting
(+20% load and speed) adds ~20% and pays its 600 back in 1.3-3 min (3.8-5 min counting HQ Lv 2); a Carryall adds 7-12%
at 15 min and almost nothing in the first 3 min (it skips trips under 10 tiles), paying back in 4.5-10 min (8.5-13
counting the Hi-Tech).

- Pickup rate 60 → 51 (the literal -15%) cut income only 4-7% early, 2% late: driving and unloading are most of a trip.
  **60 → 38** cuts it 13-17% at 3 min, 8-12% at 10 min.
- **Harvesting: +25% load, +25% speed, +50% pickup rate** (new `HARVEST_UPGRADE.rate`). It now adds 34-41%; an
  upgraded economy is about where the old upgraded one was. Pays back in under a minute with 3 harvesters, ~2.5 min
  counting HQ Lv 2. (Tried: +20/20/0 adds ~20%; +30/30/60 adds ~45%; +25/20/30 adds ~30%.)
- **Hi-Tech 1,200 / 16 s → 800 / 11 s; Carryall 700 / 12 s → 400 / 8 s; ferry trips from 6 tiles (was 10).** One Carryall
  then adds 6-10% at 15 min and pays back in ~4.5 min (~8 min with the Hi-Tech).

Against stock Brutal, 100 games each (win % of the plan; "old" is the pre-round economy):

| plan | small new | small old | medium new | medium old |
|---|---|---|---|---|
| eco: HQ Lv 2 and Harvesting first | 55 | 51 | 63 | 62 |
| air: Hi-Tech at 2:30, 2 Carryalls (Carryall 500) | 40 | 24 | 40 | 38 |
| air, Carryall 400 | 30 | | 46 | |
| nocarry: never builds Carryalls | 53 | | 51 | |

Carryalls as the AI uses them are worth about nothing (nocarry ~52%), and an early Hi-Tech still loses whatever the
price; the air plan also loses more harvesters (4.1 vs 3.2 a game on small maps). That's the AI's use of them (mostly
harvester snipes and troop drops; it only ferries trips over 12 tiles), not the price.

Cross-faction (Hard, both sides): Atreides vs Corrino fell to 23% (200 games) and Fremen vs Atreides rose to 75% (100):
Corrino's Harvesting needs no HQ Lv 2, so they get the much stronger upgrade sooner, and Spice Camps weren't slowed.
Fixed with **the Atreides AI researching Harvesting first** (as the eco plan, which beats stock) — Atreides 31% vs
Corrino — and **Spice Camps 8.5 → 7.2** — Fremen 49%.

Mirror round robin, 40 games per pair (r17):

| row vs col | std | rush | bio | mech | trike | tech | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 58 | 58 | 48 | 51 | 43 | 78 | 56 |
| rush | 43 | . | 48 | 40 | 50 | 40 | 45 | 44 |
| bio | 43 | 53 | . | 58 | 40 | 60 | 81 | 56 |
| mech | 53 | 60 | 43 | . | 88 | 53 | 85 | 63 |
| trike | 49 | 50 | 60 | 13 | . | 40 | 55 | 44 |
| tech | 58 | 60 | 40 | 48 | 60 | . | 76 | 57 |
| turtle | 23 | 55 | 19 | 15 | 45 | 24 | . | 30 |

Spread 44-63 except the turtle (30), from 21-61: the rush is back (21 → 44) on the slower start. Triangle bio > mech 58,
mech > trike 88, trike > bio 60 (it was 43 in r16, before the Harvesting-first order). Games 12.1 min (were 11.7).
Kill ratios unchanged: tank 1.38, MLRS 2.97, infantry 0.89, trike 0.81. A minute+ ahead on tech wins: Weapons II 86%,
Rockets 74%, HQ Lv 2 67%, Factory Lv 2 66%, Nitro 66%. Checks, smoke and determinism pass.

### 17. Carryalls: how the AI uses them

`sim/ava.ts` now logs Brutal's operation counters, what each side's Carryalls spend their time on, and how each
harvester died. 60-120 games per row against stock Brutal (small maps):

| plan | before | after the fixes below |
|---|---|---|
| nocarry: never builds Carryalls | 53-55 | 52 |
| air: Hi-Tech at 2:30 | 23-33 | |
| air5: Hi-Tech at 5:00 | 35 | |
| air7: Hi-Tech at 7:00 | 46 | 45 (47 with Hi-Tech 500 / Carryall 300) |
| airnf: Hi-Tech at 2:30, no ferrying | 12 | |
| nolift: stock without troop lifts | | 51 |

What was wrong, and what changed:
- **A ferried harvester froze when hit.** Any hit sent it home and stopped it dead until its Carryall swooped in; busy
  or far away, it sat there and was shot. Now the rescue only comes once it's below 2/3 health (`CARRYALL.rescueAt`,
  the threshold Brutal's own harvesters run at) and the harvester keeps driving while the Carryall picks it up on the
  move. (Game rule, so it applies to players' Carryalls too.)
- **The AI ferried only trips over 12 tiles** while Carryalls take them from 6: it now uses `CARRYALL.ferryMin`.
- **Snipes took a tank when no MLRS was home**, which spent half its op hovering and killed ~0.2 harvesters a game:
  snipes now take only a launcher.
- **New: troop lifts.** An idle Carryall (one lift at a time) flies a fresh tank or MLRS, two trikes or 3-6 infantry
  from home to the strongest wave more than 15 tiles out, sets them down behind it, and they join it. It flies
  straight in when no route is clear of anti-air (it's going to its own army). 2-5 lifts a game.

Findings: ferrying is what makes Carryalls pay (the 2:30 plan wins 33% with ferrying, 12% without, ~8,000 spice a game
apart). Harvester losses weren't the Carryalls' doing: 13 of 236 dead harvesters had one assigned; most died to tanks
within 10 tiles of their own Refinery, i.e. the losing side's base being overrun. In the AI's hands Carryalls are now
about neutral (stock with vs without: 48-52%), and an earlier Hi-Tech still costs ~5 points at any price tried: games
are decided around 10-12 minutes, before ~1,600 credits of air pays back. Their value to a player (drops, flanks,
rescues) isn't something these sims measure.

Mirror round robin (r18) is the same as r17 within noise (avg: std 56, rush 44, bio 55, mech 65, trike 43, tech 56,
turtle 31; triangle 55 / 90 / 59): every plan gets its Carryalls late. Checks, smoke and determinism pass.

## Summary of changes (vs main)

| | main | branch |
|---|---|---|
| Infantry | 70 HP, Rockets range 8 | 80 HP, Rockets range 9 |
| Infantry Rockets | 600, needs HQ Lv 2 | 800, needs Barracks + Factory |
| Trike | 150, 5 s, +4 vs bio | 130, 4.5 s, +2 vs bio |
| Trike Nitro | x1.4 speed | x1.5 speed (fire x1.5 as before) |
| Tank | 400, range 10, -6 vs bio | 500, range 9, -10 vs bio |
| MLRS | 500, 11 s, 200 HP, range 17, armored, +35 bio, splash 2.5 | 600, 13 s, 180 HP, range 15, **light**, +25 bio, +10 armored, splash 3 |
| Barracks | 500 | 400 |
| Factory Level 2 | 1,200: MLRS, Weapons II, Armor II | 1,500: MLRS only |
| HQ Level 2 | Harvesting, Infantry Rockets | Harvesting, **Weapons II, Armor II** |
| Atreides weapons vs shields | x1 | x2 |
| Harvester pickup rate (all factions) | 60/s | 38/s |
| Harvesting (Atreides and Corrino) | +20% load, +20% speed | +25% load, +25% speed, +50% pickup |
| Spice Camp (Fremen) | 8.5/s | 7.2/s |
| Hi-Tech Factory | 1,200, 16 s | 800, 11 s |
| Carryall | 700, 12 s; ferries trips from 10 tiles | 400, 8 s; from 6 tiles |
| Atreides AI research | Rockets first, Harvesting 5th | Harvesting first |
| Ferried harvester under fire | stops and waits for its Carryall on the first hit | flown out below 2/3 health, keeps driving |
| Brutal's Carryalls | ferry 12+ tile trips; snipe with MLRS or tank | ferry 6+; snipe with MLRS only; troop lifts to waves |

Open / not done:
- Carryalls are about neutral in the AI's hands (round 17); an earlier Hi-Tech costs ~5 points whatever its price.
- The infantry rush was the weak plan (21% small maps, 5% medium) until the slower economy (44%, round 16); the turtle is now the weakest (30%).
  Cheaper infantry (80) didn't help it and broke the trike > bio leg (round 12).
- Turtling loses (41%) — wanted — but nothing in the rules punishes a big army as such (no upkeep); the AI's waves
  cap at 16 units. A supply/upkeep rule would be a design decision.
- Weapons II is still the strongest single tech signal (80%), likely partly because the side ahead techs first.
- Corrino vs Atreides relies on the shield-break call above; Brutal-level cross-faction numbers not re-measured.
