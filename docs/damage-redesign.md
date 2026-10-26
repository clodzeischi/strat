# Damage model redesign (branch `damage-redesign`)

**Goal (the user's, 2026-10-26):** a simpler damage matrix that plays more like StarCraft II.
- The right tool for the job is rewarded.
- Every unit stays viable to some extent: a mismatch must not be so punishing that, say, Atreides against Fremen
  skip most of their roster.
- Upgrades are noticeable but not an auto-win.
- No exceptions that only exist to fix odds (the Warrior's triple damage to shields). Exceptions that are real
  gameplay tools stay: the Sandrider's knife that only kills infantry, Fedaykin sound going through shields.

## 1. Our matrix today

Numbers from `npx tsx sim/matrix-report.ts` (main @ ceca5b6, no upgrades). DPS is per 1,000 credits against the
target's whole health + shields, with shield-breaking and piercing counted. Splash, cones and range are left out.

**How damage works now:** per hit, `weapon base + bonus for each tag the target has` (at least 1), × Weapons
upgrades (+20% a level, Fremen +30%), then shields, then health × (1 − 15% per Armor level; Fremen 22%). There is no
armor stat per unit: "armored" is only a tag that bonuses read.

**The numbers:**
- **21 weapons, 24 negative bonuses**, and 5 weapons with two or more positive bonuses (MLRS has four).
- **Best target vs worst target, per hit:**

| weapon | infantry | light vehicle | armored | structure | best / worst |
|---|---|---|---|---|---|
| Atreides infantry, Fremen Warrior | 10 | 5 | 1 | 2 | 10× |
| Trike | 6 | 4 | 1 | 2 | 6× |
| Razor | 12 | 4 | 2 | 2 | 6× |
| Tank | 8 | 40 | 40 | 18 | 5× |
| Fedaykin | 7 | 18 | 32 | 8 | 4.6× |
| Sardaukar | 36 | 12 | 12 | 8 | 4.5× |
| Trooper | 8 | 8 | 22 | 5 | 4.4× (14.7× counting its 2 vs aircraft) |
| Sky Raider | 12 | 12 | 36 | 8 | 3× |
| Devastator | 35 | 55 | 100 | 55 | 2.9× |
| MLRS | 65 | 40 | 50 | 75 | 1.9× |

- **Half the roster is crippled somewhere.** Counting pairs where a unit does under 40% of its own best DPS per
  credit: Trooper 11 of 14 targets, Sky Raider 10, Fedaykin 9, Tank 7, Sardaukar and Razor 6.
- **Against a whole faction** (its combat units, equally weighted; share of each unit's own best):
  - Atreides vs Fremen: Tank 20%.
  - Corrino vs Fremen: Trooper 36%, Sky Raider 33%.
  - Fremen vs Atreides: Warrior 39%, Fedaykin 38%, Sandrider 16%.
  - Fremen vs Fremen: Fedaykin 14%.
- **Every Fremen combat unit is `biological, light`.** So every anti-vehicle unit of the other factions sits on its
  worst row for the whole game: Tank 8 instead of 40, Trooper 8 instead of 22, Sky Raider 12 instead of 36,
  Devastator 35 instead of 100.
- **Toughness per credit swings 5×,** for reasons nobody chose: health + shields per 1,000 credits is MLRS 300,
  Mortar 480, Sandrider 560 … Trooper 1,600, Devastator 1,625.
- **Upgrades are percentages,** so they scale every matchup by the same factor and never change who beats whom. At
  +20% Fremen upgrades didn't pay for themselves; at +30% they do (docs/balance-fremen.md, round 5).

**Odds-fixing exceptions in the data today:**

| exception | why it exists | verdict |
|---|---|---|
| Warrior `shieldBreak: 3` | lifted Fremen vs Corrino | remove |
| Trooper −6.5 vs air | "potshots" at aircraft without beating them | replace with a proper anti-air value (rule 6) |
| 24 negative bonuses | make a unit bad at something | replace with armor and HP (rules 2, 4) |
| Fremen upgrade `scale: 1.5` | upgrades didn't pay at +20% | replace with one upgrade model for all (rule 5) |
| Damage floor of 1 | negative bonuses push hits to 0 | becomes rare; keep SC2's 0.5 |

**Gameplay tools to keep:** Fedaykin and worm `pierce`; the Sandrider knife `only` infantry; cone weapons (Razor
flame, Fedaykin sound); unguided shells you can dodge (MLRS, Soulcrusher); Infantry Rockets switching weapon vs armor;
Ambush; hiding.

## 2. How StarCraft II does it

From knowledge of Legacy of the Void-era values; individual numbers may be a patch off, but the shape is what matters.

**Per hit:** `(base + bonus vs one attribute + upgrade steps) − target armor`, at least 0.5. Multi-hit attacks
(Zealot 8×2, Thor 30×2) pay armor on every hit.

**Attributes:** Light, Armored, Biological, Mechanical, Massive, Psionic, Structure. A unit has two or three
(a Marine is Light + Biological, a Siege Tank Armored + Mechanical).

**Bonuses: one per weapon, always positive, rarely more than 2.5× the base hit.**

| unit | hit | spread |
|---|---|---|
| Marine | 6 | 1× |
| Stalker | 13 (+5 armored) | 1.4× |
| Hellion | 8 (+6 light), line splash | 1.75× |
| Siege Tank, sieged | 40 (+30 armored), splash | 1.75× |
| Marauder | 10 (+10 armored) | 2× |
| Baneling | 16 (+19 light), splash | 2.2× |
| Immortal | 20 (+30 armored) | 2.5× |

So in a mismatch a unit still does 40–100% of its best hit. That's why tanks stay worth building against Zerglings.

**Armor:** a small integer per unit, 0–2 (Ultralisk 2, +2 with Chitinous Plating). It subtracts from every hit, so
small, fast attacks lose the most against heavy units with no special rule. Five-damage Zerglings into a fully
plated Ultralisk do 1 a hit: the one place SC2 gets punishing, and it's on purpose (and upgrades soften it).

**Upgrades:** flat. Weapons add +1 a hit for small arms and more for big guns (each weapon has its own step), Armor
+1, Shields +1 shield armor. That makes upgrades **change matchups**: +1 matters most to a 5-damage weapon and against
a 1-armor target.

**Shields:** a separate pool that regenerates. Hull armor doesn't apply to it, shield armor does, and bonus damage
counts against it by the unit's attributes. No weapon ignores or multiplies against shields except a couple of
spells.

**The rest of a unit's value isn't damage:** toughness per cost (heavy units are tanky for their price), range,
speed, splash, abilities. And fights snowball (the side that kills faster loses fewer guns, so it kills faster
still): a 1.3× edge in damage per credit already wins most even fights. That's why SC2 doesn't need 5–10× bonuses to
make counters matter.

## 3. Why ours tilts compositions

1. **The spreads are 3–15× where SC2's are 1–2.5×.** A unit in a mismatch does 10–25% of its job; in SC2 it's 40–100%.
2. **Negative bonuses do the job armor does in SC2,** but per weapon instead of per target, so every pair has to be
   hand-set and nothing generalizes.
3. **No toughness lever.** A unit facing its counter has nothing left to offer: no armor to soak, often less health
   per credit than the unit it's meant to beat.
4. **One-tag Fremen.** With all bonuses steep, a faction made of one tag combination switches off half of every
   other roster.

Halving every bonus (keeping each weapon's average; `sim/flatten.ts`) barely moved the equal-cost duels: lopsided
duels went from 56% to 48%. Flattening the bonuses alone isn't enough. Armor, toughness per cost and the floor have
to change with them, and the duels can't be the only yardstick (section 6).

## 4. The new model

**Per hit:**

```
hit = max(0.5, base + bonus_if_tag + weapon_step × Weapons level − (armor + Armor level))
shields take the hit before health; shield armor = Shields level; armor applies to health only
```

**Rule 1: one bonus per weapon, positive only, sized by role.**
- Generalists: no bonus.
- Specialists: up to +100% (2× on their target).
- Heavy specialists (Devastator, Tank vs vehicles, Sky Raider): up to +150%.
- Bonuses target weight tags first (light, armored). `biological` is for anti-infantry specialists (Razor, Sardaukar),
  `structure` for siege (Mortar, Soulcrusher, MLRS).

**Rule 2: every unit gets an armor value, 0 to 3,** standing in for the 24 negative bonuses:

| armor | units |
|---|---|
| 0 | infantry |
| 1 | light vehicles, Fremen elites (Fedaykin, Sandrider), aircraft |
| 2 | tanks, harvesters |
| 3 | Devastator |
| 1–2 | structures |

Fast, small weapons lose damage to heavy targets, the way SC2's do, with nothing written per weapon.

**Rule 3: a floor, as a check, not a rule in the engine.** No unit does less than about 40% of its own best DPS per
credit against anything it can hit. `sim/matrix-report.ts` enforces it on every change.

**Rule 4: toughness per credit is a stat we set on purpose:**
- Heavy units (Tank, Devastator, Fedaykin) get the most health per credit: they soak in a mismatch.
- Artillery and glass cannons (MLRS, Mortar, Soulcrusher, Sky Raider) get the least.
- Line units sit in between.

**Rule 5: one upgrade model for every faction, as in SC2.**
- Weapons: a flat step per weapon (about 10–15% of its hit).
- Armor: +1 per level.
- Corrino Shields: +1 shield armor.
- Atreides and Fremen keep two levels, Corrino one, priced to match.
- Fremen `scale: 1.5` goes. The upgrades that are tools stay: Infantry Rockets, Nitro, Flame Range, Sandwalk,
  Ambush, Stillsuits.

**Rule 6: anti-air is its own number.** A weapon that can hit aircraft has an air damage value (default: its ground
damage), as SC2 units have separate ground and air attacks. The Trooper's weak potshots become `air damage 3` rather
than −6.5.

**Exceptions after the redesign (all gameplay tools):**
- Pierce: Fedaykin, the worm.
- The knife only hits infantry: Sandrider.
- Cones: Razor, Fedaykin.
- Unguided shells: MLRS, Soulcrusher.
- Weapon switch: Infantry Rockets.
- Hiding and Ambush; the worm; Devastator self-destruct; Sky Raider mines.

**Fremen stay `biological, light`.** With bonuses capped at 2–2.5× and Tank-type units keeping a solid base hit, a
Tank against Warriors does roughly 60% of its best instead of 20%. Retagging Fedaykin and Sandriders as armored is
the fallback if the floor can't be met otherwise.

**What the numbers could look like (Atreides, illustrative only; the sims set the real ones):**

| unit | armor | weapon | vs infantry | vs trike (armor 1) | vs tank (armor 2) | spread |
|---|---|---|---|---|---|---|
| Infantry | 0 | 6 (+3 biological) | 9 | 5 | 4 | 2.3× |
| ... with Rockets, vs armored | | 12 (+12 armored) | | | 22 | |
| Trike | 1 | 5 (+2 light) | 7 | 6 | 3 | 2.3× |
| Tank | 2 | 24 (+16 armored) | 24 | 23 | 38 | 1.6× |
| MLRS | 1 | 40 splash (+30 structure) | 40 | 39 | 38 | 1.05× (plus siege) |

Today the Tank does 8 to infantry and the Infantry 1 to a Tank. In the sketch they do 24 and 4, and each still does
best against its intended target.

## 5. Targets (what "done" means)

| goal | measure | target |
|---|---|---|
| Right tool rewarded | a unit's best vs worst DPS per credit (`matrix-report`) | 1.5–2.5× for specialists |
| Every unit viable | each unit's average vs each faction, as a share of its best | ≥ 40%, no exceptions |
| Every unit viable | mixed-army test (section 6): swapping 20% of an army for unit X | gains in at least ~2/3 of enemy compositions, never a big loss |
| Every unit used | AI vs AI cross-faction, stock Brutal counter-picking | no combat unit under ~5% of army value against any faction |
| Upgrades noticeable | std with no combat research vs std | 30–40% |
| Upgrades not an auto-win | a level a minute earlier | 55–65% |
| No single strategy | each mirror's round robin | every plan's worst matchup ≤ 55%, as now |
| Cross-faction | Hard vs Hard, 100 games each pair | 40–60% |

## 6. Tools

- `sim/matrix-report.ts` (done): the matrix, spreads, the floor check per faction pair, toughness per credit.
  Re-run after every change.
- **To build: a mixed-army relevance test.**
  - A reference army per faction (its usual composition at about 6,000 credits) against an enemy composition.
  - Swap 20% of the value for unit X; Brutal micro on both sides; maps from both sides.
  - Report the change in value left, X by enemy composition.
  - Duels only answer "who wins all-in", which snowballing always makes lopsided; this answers "is X worth having
    along".
- **To build: the upgrade test as a standing check:** `std-no-*`, `stdeco` and `stdbare` for every faction
  (`sim/ava-strats.ts` can already do this).
- Existing: mirror round robins (`sim/ava.sh` with `FACTION`), cross-faction (`sim/cross-detail.ts`,
  `sim/faction-match.sh`), time to kill (`sim/ttk.ts`), and the counter table (`sim/matchups.ts`), which the AI's
  counter-picking reads and which must be regenerated after every stat change.

## 7. Stages (each verified and committed on this branch)

1. **Tools:** the relevance test; the upgrade test for all factions; record the baseline for every metric above.
2. **Engine:**
   - Unit `armor`, flat weapon steps, Armor +1, shield armor, air damage, minimum 0.5.
   - Remove `shieldBreak` and `UpgradeDef.scale`.
   - A config check that fails on negative bonuses or more than one bonus per weapon.
   - No balance change yet: first pass with today's numbers translated as closely as the new rules allow.
3. **Numbers by role:**
   - A table of role, armor, toughness per credit, base hit and bonus for every unit, derived from section 4.
   - Iterate on `matrix-report` and the relevance test until the floor and spread targets hold.
4. **Upgrades:** weapon steps and prices until the upgrade targets hold.
5. **Mirrors:** AvA, CvC, FvF round robins with the existing plans; fix the plan-level problems the earlier logs
   solved (MLRS dominance, the turtle, the warrior mass) where they come back.
6. **Cross-faction:** Hard and Brutal, all three pairs, toward 40–60%.
7. **Text and docs:** unit descriptions, PLAN.md tables, a balance log for the redesign; merge when you've played it.

All three mirror balances will be redone: their numbers were tuned in the old model. Expect several days of sim
rounds. Stages 1–3 alone will tell us whether the model meets the viability target before any balance work.

## 8. Decisions (taken 2026-10-26)

1. **Flat armor per unit:** yes.
2. **Flat upgrades:** yes, one model for all factions.
3. **Fremen tags:** stay all `biological, light`; the floor has to hold without retagging.
4. **Warrior `shieldBreak`:** removed. Fremen vs Corrino relies on Fedaykin piercing.

## 9. Progress log (newest last; the resume point)

### Stage 1: tools and baseline (main @ ceca5b6 config)

**Tools:**
- `sim/relevance.sh` (runs `sim/relevance.ts`): the mixed-army relevance test, about 3 minutes for everything.
  - Reference armies of 6,000 credits (`REF` in sim/relevance.ts):
    - Atreides: infantry 30%, trike 20%, tank 30%, MLRS 20%.
    - Corrino: trooper 30%, Sardaukar 15%, Razor 15%, Devastator 20%, Sky Raider 10%, Soulcrusher 10%.
    - Fremen: Warrior 45%, Fedaykin 30%, Mortar 15%, Sandrider 10%.
  - Per unit X: the army with X at 25% against the army without X, against each enemy composition (their reference,
    and their reference skewed half to each of their units), 3 maps × both sides.
  - Delta > +0.02 counts as "worth it", < −0.1 as "big loss".
  - **Caveat:** it's an open-field battle. It can't see raiding (Trike, Razor, Sky Raider), hiding (Warriors) or worms
    (Sandrider). For those units the target is "no big losses", not "worth it".
- `sim/ava-strats.ts`: `<plan>-eco` researches only the Harvesting line, `<plan>-bare` nothing. Every faction.

**Relevance baseline** (share of enemy compositions where the unit is worth it; big losses in brackets):

| Atreides | | Corrino | | Fremen | |
|---|---|---|---|---|---|
| MLRS | 100% (0) | Devastator | 88% (0) | Mortar | 71% (2) |
| Infantry | 71% (2) | Trooper | 82% (0) | Fedaykin | 59% (2) |
| Tank | 47% (4) | Soulcrusher | 47% (4) | Sandrider | 35% (8) |
| Trike | 18% (9) | Sardaukar | 24% (4) | Warrior | 24% (7) |
| | | Razor | 18% (10) | | |
| | | Sky Raider | 0% (14) | | |

The Tank against Fremen: −0.06, −0.14, −0.19, −0.21, +0.03 across their five compositions.

**Upgrades** (std researching only Harvesting vs full std, 40 games; target 30–40%):
- Atreides 13% (no research at all: 18%).
- Corrino **70%**: their combat upgrades are a net loss (no research: 15%).
- Fremen 23% (no research: 10%).

**AI army value by unit in cross-faction games** (Hard vs Hard, 60 games):
- Atreides vs Fremen: infantry 37%, trike 36%, MLRS 25%, **tank 2%**.
- Corrino vs Fremen: Razor 37%, Devastator 21%, Trooper 20%, Sardaukar 17%, **Soulcrusher 4%, Sky Raider 1%**.
- Corrino vs Atreides: Devastator 42%, Razor 21%, Sky Raider 12%, Trooper 11%, Soulcrusher 8%, Sardaukar 6%.
- Atreides vs Corrino: infantry 30%, tank 27%, MLRS 24%, trike 19%.
- Fremen vs either: Fedaykin about 40%, Warrior 37–39%, Mortar 14%, Sandrider 6–8%.

Cross-faction win rates: Fremen beat Atreides 90% and Corrino 62–70%; Atreides beat Corrino 2%.

### Stage 2: engine (done)

- **Per hit** (`Game.damage`, rules.ts `MIN_HIT`):
  `(damage + bonus for the target's tags + step × Weapons level) × (Ambush, splash share)`.
  - Shields take it first, less one per Shields level.
  - What reaches health loses `armor + Armor level`.
  - At least 0.5.
- **New fields:**
  - `UnitDef.armor` and `BuildingDef.armor` (default 0); `armorOf(e)` in game.ts.
  - `WeaponDef.step`: damage per Weapons level, default a tenth of `damage`, at least 1; `weaponStep(w)`.
  - `WeaponDef.airDamage`: replaces damage and bonuses against aircraft.
- **Removed:** `WeaponDef.shieldBreak` (and the Warrior's ×3), `UpgradeDef.scale`, `WEAPONS_BONUS`, `ARMOR_BONUS`,
  `SHIELDS_BONUS`. `Game.expectedHit` is what targeting and Micro's focus fire use now.
- **Tools:**
  - `sim/config-check.ts` fails on negative bonuses or more than one bonus per weapon: 18 of 21 weapons break the
    rules until stage 3.
  - `sim/matrix-report.ts` uses the new formula.
  - `tsconfig.sim.json` typechecks sim/ too: `npx tsc --noEmit -p tsconfig.sim.json`. Seven errors in older checks
    (ai-check, brutal-match, bunker-check, netplay-check, saturation, vision-check) predate this work.
- fremen-check, corrino-check and sietch-check pass. The game runs on the old numbers with armor 0 and the default
  flat steps until stage 3.

### Stage 3: numbers by role

**First draft (round 3.1)**, before any sims. Fast, small weapons got a bigger hit with a longer cooldown where armor
would otherwise crush them (Razor). Health is unchanged for now: armor does the soaking. Structures default to armor 3
(`STRUCTURE_ARMOR`); the floor isn't applied to structures (hitting buildings is a siege job).

| unit | armor | weapon (cooldown) | was |
|---|---|---|---|
| Atreides infantry | 0 | 7 (+3 biological), 0.6 s | 5 (+5 bio, −4 armored, −3 structure) |
| ... Infantry Rockets | | 14 (+12 armored), 1.5 s | 6 (+22 armored, −2 structure) |
| Trike | 1 | 5 (+2 light), 0.3 s | 4 (+2 bio, −3 armored, −2 structure) |
| Tank | 2 | 20 (+20 mechanical), 1.4 s | 18 (+22 mechanical, −10 bio) |
| MLRS | 1 | 38 (+30 structure), air 60, 2.8 s | 40 (+25 bio, +10 armored, +35 structure, +25 air) |
| Repair Vehicle, Carryall | 1 | | |
| Harvester | 2 | | |
| Trooper | 0 | 10 (+10 armored), air 4, 0.7 s | 8 (+14 armored, −3 structure, −6.5 air) |
| Sardaukar | 1 | 16 (+16 biological), air 24, 0.75 s | 12 (+24 bio, +12 air, −4 structure) |
| Razor | 1 | 14 (+10 biological) cone, 0.6 s | 4 (+8 bio, −2 armored, −2 structure), 0.3 s |
| Devastator | 3 | 60 (+40 armored), 2 s; MG 8 (+4 biological), 0.2 s | 55 (+45 armored, −20 bio); MG 6 (+6 bio, −3, −3) |
| Sky Raider | 1 | 16 (+20 armored), 1.2 s; mines 40 (+60 biological) | 12 (+24 armored, −4 structure); mines 30 (+90 bio, −10 armored) |
| Soulcrusher | 2 | 14 (+12 structure); set up 70 (+110 structure), 4.5 s | set up 60 (+120 structure, +20 bio) |
| Auto Turret | | 14 (+6 mechanical), 0.9 s | 12 (+6 mechanical, −6 structure) |
| Fremen Warrior | 0 | 7 (+3 biological), 0.55 s | 5 (+5 bio, −4 armored, −3.5 structure), ×3 vs shields |
| Fedaykin | 1 | 14 (+12 armored) cone, pierce, 1 s | 10 (+8 mechanical, +14 armored, −2 structure, −3 bio) |
| Fremen Mortar | 0 | pistol 6, 0.8 s; set up 28 (+26 structure), 1.4 s | 5 (+3 bio, −4, −3); set up 24 (+16 mech, +30 structure, −7 bio) |
| Sandrider | 1 | knife 400 (infantry only), unchanged | |
| Sandworm | | 400 (+400 mechanical), no upgrade step | 400 (+400 mechanical, −100 structure) |

Upgrade steps are the default (a tenth of the hit, at least 1) until stage 4.

Already trimmed in the table above: Trooper 9 (+13) → 10 (+10) and Fedaykin 12 (+16) → 14 (+12) (spreads 6.3× → 5.7×
counting the Trooper's weak anti-air, 3.6× → 2.8×); MLRS 45 → 38 after the relevance run.

**Round 3.1 matrix** (`sim/matrix-report.ts`):
- Every weapon is within 1.0–2.9× of its best, apart from the Trooper's deliberately weak anti-air.
- Crippled units against a faction (under 40% of their best):
  - Atreides vs Fremen: none (the Tank was at 20%, now 50%).
  - Corrino vs Fremen: none (Trooper 36% → 51%, Sky Raider 33% → 45%).
  - Only the Sandrider's knife (infantry only, the agreed exception) and the Fedaykin against Fremen (37%) remain.
- `sim/config-check.ts`: all 22 weapons follow the rules.

**Relevance, round 3.1** (before the MLRS trim; worth it / big losses):

| unit | baseline | 3.1 |
|---|---|---|
| MLRS | 100% / 0 | 100% / 0 |
| Atreides infantry | 71% / 2 | 59% / 1 |
| Tank | 47% / 4 | 65% / 2 (vs Fremen: 1/5 → 4/5) |
| Trike | 18% / 9 | 35% / 6 |
| Trooper | 82% / 0 | 94% / 0 |
| Devastator | 88% / 0 | 94% / 0 |
| Soulcrusher | 47% / 4 | 41% / 4 |
| Sardaukar | 24% / 4 | 18% / 5 |
| Razor | 18% / 10 | 12% / 10 |
| Sky Raider | 0% / 14 | 6% / 15 |
| Fremen Warrior | 24% / 7 | 0% / 9 |
| Fedaykin | 59% / 2 | 82% / 2 |
| Fremen Mortar | 71% / 2 | 71% / 0 |
| Sandrider | 35% / 8 | 12% / 4 |

**Reading it:** the test compares a unit with the rest of its own army, so it can't put everyone above zero. With
every unit equal, deltas sit near 0 and "worth it" near 50%. The useful signal is the outliers:
- **Too strong in open battle:** MLRS (+0.38 on average), Devastator (+0.18), Trooper (+0.15).
- **Too weak:** Sky Raider (−0.27), Razor (−0.15), Warrior (−0.11, without its shield-breaking).

Targets revised accordingly: few big losses for every unit, and each one positive against what it's meant to counter.
Raiding units (Trike, Razor, Sky Raider), hiding (Warriors) and worms (Sandrider) are judged in real games, not here.

**Round 3.1 in games** (mirrors 30 games per pair; cross-faction Hard, 60 games):

| mirror | plan averages | games |
|---|---|---|
| Atreides | **trike 77**, std 65, mech 62, bio 41, rush 38, tech 34, turtle 33 | 12.5 min |
| Corrino | **razor 84**, turtle 63, air 51, std 46, dev 37, rush 34, sard 34 | 13.7 min |
| Fremen | **rush 87**, std 61, mortar 61, fed 57, rider 56, mass 50, turtle 23, swarm 6 | median 7.2 min, 61% under 8 min |

- Kill ratios: MLRS 1.96, trike 1.35, tank 1.07, infantry 0.91; Soulcrusher 1.55, Sky Raider 1.33, Devastator 1.25,
  Trooper 1.23, Sardaukar 0.78, Razor 0.71; Mortar 1.96, Fedaykin 1.85, Sandrider 1.08, Warrior 0.70.
- Cross-faction: Fremen vs Atreides 87%, Fremen vs Corrino **32%** (Warriors lost shield-breaking), Atreides vs Corrino 5%.
- Upgrades (eco-only std vs std): Atreides 16%, **Corrino 75%** (combat upgrades still worthless), Fremen 40%.

**Why:**
- **Milder counters make equal-cost fights closer,** so cheap fast units do better. Trikes now hit Tanks for 3
  (was 1): at equal cost, 7.7 trikes out-damage two Tanks.
- **Razors were raised to the floor against armor** (11 against a Devastator, was 2).
- **Warriors hit structures for 4 (was 1.5),** so the rush razes bases.
- **Lever:** toughness and cost (rule 4) and structure armor now have to do what steep bonuses did.

**Targeted tests after 3.1** (30 games per pair; `rules.STRUCTURE.armor` is TUNE-able now):
- **Fremen rush** vs std / fed / mortar: structure armor 3 → 88 / 88 / 88, **5 → 43 / 42 / 43**, 6 → 23.
- **Trikes beat everything in duels** with micro: tanks +0.29, infantry +0.56, MLRS +0.56 (old matrix: −0.51 vs
  tanks).
  - Trike 4 (+3 light) with Tank 24 (+24 mechanical), 520 HP: trike vs tank −0.39, though tank vs MLRS rises to
    +0.45.
  - In games, trike 4 (+3) with Tank 22 (+22), 500 HP: trike plan vs mech 37, vs std 70.
  - The tech plan collapsed with the MLRS at 38 (vs std 3–10%).
- **TUNE tests don't move stock Brutal's counter-picking** (it reads the generated table in src/game/matchups.ts),
  so std results under TUNE are biased: write values in and regenerate before judging std.
- **Razor:** duels already have it losing to the Devastator (−0.55). Its plan wins on raids and on structures
  (11 a hit, was 2). With Razor 12 (+10 bio) and 170 health: vs Devastator −0.67, vs Trooper −0.03.

**Round 3.2 (written in):** structure armor 5; trike 4 (+3 light); Tank 22 (+22 mechanical), 500 health; MLRS 44;
Razor 12 (+10 biological), 170 health. Counter table regenerated.

**Round 3.2 in games** (mirrors 30 per pair; cross-faction Hard 60):

| mirror | plan averages | games |
|---|---|---|
| Atreides | mech 68, trike 65, std 58, bio 46, tech 40, rush 38, turtle 36 | 12.5 min |
| Corrino | **razor 81**, turtle 56, air 52, std 45, dev 42, sard 38, rush 37 | 13.5 min |
| Fremen | std 72, mortar 69, rider 69, fed 68, rush 43, mass 34, turtle 34, swarm 12 | median 8.1 min |

- Atreides is back to a cycle: mech > trike 63, trike > bio 83.
- Cross-faction: Fremen vs Atreides 87%, vs Corrino 35%; Atreides vs Corrino 8%.
- **Razor plan:** it wins the economy. Opponents lose about 4,200–5,100 credits of harvesters a game, the Razor plan
  800. Pre-redesign it was 2,840 vs 3,000, and std then built 20.6 Sardaukar a game against it; now 2.7 (the counter
  table rates the Sardaukar low).

**Upgrade levels** (`<plan>-notier` = everything but Weapons/Armor/Shields, vs full std, 40 games; target 30–40%):

| step share | Atreides | Corrino | Fremen |
|---|---|---|---|
| 0.1 | 40 | 93 | 60 |
| 0.2 | 30 | 68 | 43 |
| 0.3 | 33 | 53 | 28 |

- **Skip tests are confounded by research order:** skipping one upgrade brings the next forward. The Corrino AI
  researched Harvesting fourth (Atreides and Fremen research theirs first), so every Corrino skip test measured
  "Harvesting sooner". Its eco-only plan also won 75–80% for that reason.
- With Harvesting first (Corrino kit changed), step 0.2, Weapons 600 / Armor 500 / Shields 500: no levels 18%; without
  Weapons 19%, without Armor 40%, without Shields 50%; eco-only 10%.
- Armor levels now also count against shields (they protect a Corrino unit's whole pool). Before that, Corrino Armor
  was a net loss even at 400.

**Round 3.3 (written in):**
- Weapons step share 0.2 (`WEAPON_STEP` in rules.ts).
- Armor levels count against shields too.
- Corrino AI researches Harvesting first.
- Corrino Weapons 900 / 35 s, Armor 600 / 25 s, Shields 400 / 20 s.
- Sardaukar 18 (+18 biological).
- Harvesters armor 3.
- Counter table regenerated.
- Upgrade descriptions still say percentages: to do in stage 7.

**Next step:** the round 3.3 batch; then `notier` tests for all factions on the written values.
