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

## 8. Decisions for you

1. **Flat armor per unit** (recommended), or keep armor as a tag only and just cap bonuses? Without armor stats we
   lose SC2's "small fast hits are weak against heavy units" and need some negative bonuses back.
2. **Flat upgrades** (recommended) or percentages? Flat ones change matchups as in SC2. Percentages are simpler but
   only make an army stronger.
3. **Fremen tags:** keep all-infantry (recommended, relying on the floor), or make Fedaykin and Sandriders armored
   so anti-armor units have targets?
4. **The Warrior loses its triple damage to shields,** per your rule. Fremen vs Corrino will need another lever if
   it drops; most likely Fedaykin piercing does the job.
