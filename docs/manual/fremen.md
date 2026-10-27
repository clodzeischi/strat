# Fremen

[Manual](README.md) · [Atreides](atreides.md) · [Corrino](corrino.md) · **Fremen**

## Overview

The Fremen are the desert itself: cheap, fast infantry that dig into the sand and vanish, heal on their own, and call Sandworms down on the enemy. They have no vehicles and no harvesters. Their warriors grow into elite units through rites, in the field.

**Strengths:** cheap units, hiding and ambushes, speed on sand, healing without repairs, Sandworms, and an economy that sets up wherever the spice is.

**Weaknesses:** infantry only, so splash damage and flamethrowers hurt; nothing is very tough; slow against structures until Mortars and worms arrive.

### How it plays

- **Start:** a Sietch, three Warriors and a Spice Crew. Walk the Crew onto a spice field and Set Up Camp (D), then build a Barracks for more crews and Warriors.
- **Economy:** Spice Camps turn the spice around them into credits, fastest with plenty of spice in reach. Move them on (Pack Up, D) when the field runs low. More Crews mean more income.
- **Rites:** Warriors become Fedaykin or Fremen Mortars, and Fedaykin become Sandriders, right where they stand: select them, pick the rite on the Command tab, and they dig in for a few seconds. It costs credits and can't be undone. The rites unlock with the Sietch's levels (Great Sietch, then Sietch III).
- **Hiding:** a Fremen unit standing still on sand for 3 seconds digs in, out of the enemy's sight unless they come right up to it. Dig In (V) does it at once and holds fire. With Ambush, units striking out of hiding deal 75% more damage for 4 seconds.
- **Healing:** Fremen units heal 1.5% of their health per second after 6 seconds unhurt, twice as fast dug in or near a High Perch. Stillsuits double it again and start it sooner. Structures heal slowly on their own too.
- **Speed:** Fremen infantry move 20% faster on sand and spice, and Sandwalk adds 25% on top.
- **Sandworms:** a Sandrider plants a Thumper (250 credits; then 60 seconds before that rider can plant another). If the Sandrider is close when the worm comes, they ride it. Send the worm into the enemy, and Release Worm lets it go. See [Sandworms](README.md#sandworms).
- **Air:** the High Perch launches Wind Gliders, fast unarmed scouts that never stop moving.
- **Upgrades:** two levels each of Weapons and Armor (one per Sietch level), plus Stillsuits, Sandwalk, Ambush and Spice Mining. They're cheap: the Sietch levels carry the cost.

## Specs

<!-- specs -->
<!-- Generated from src/config by sim/manual.ts: edit the config, then rerun it. -->

### Tech tree

Structures (boxes), their level-ups (rounded) and the units they unlock (pills). Dotted arrows are Fremen rites.

```mermaid
flowchart LR
  sietch["Sietch"]
  sietch2("Great Sietch")
  sietch --> sietch2
  barracks --> sietch2
  sietch3("Sietch III")
  sietch2 --> sietch3
  barracks["Barracks"]
  sietch --> barracks
  perch["High Perch"]
  sietch --> perch
  bunker["Bunker"]
  barracks --> bunker
  u_warrior(["Fremen Warrior"])
  barracks --> u_warrior
  u_crew(["Spice Crew"])
  barracks --> u_crew
  u_glider(["Wind Glider"])
  perch --> u_glider
  u_fedaykin(["Fedaykin"])
  sietch2 --> u_fedaykin
  u_warrior -. rite .-> u_fedaykin
  u_mortar(["Fremen Mortar"])
  sietch2 --> u_mortar
  u_warrior -. rite .-> u_mortar
  u_sandrider(["Sandrider"])
  sietch3 --> u_sandrider
  u_fedaykin -. rite .-> u_sandrider
  classDef unit fill:#f3e2c0,stroke:#a4782f,color:#3a2a10
  class u_warrior,u_crew,u_glider,u_fedaykin,u_mortar,u_sandrider unit
```

### Units

Cost in credits; speed and sight in tiles (per second for speed). Shields absorb damage before health and recover on their own.

| Unit | Cost | Build | Made at | Requires | Health | Shields | Armor | Speed | Sight | Tags |
|---|---|---|---|---|---|---|---|---|---|---|
| Fremen Warrior | 80 | 3.5 s | Barracks | Barracks | 70 | – | 0 | 1.5 | 5.5 | biological, light |
| Spice Crew | 450 | 12 s | Barracks | Barracks | 120 | – | 0 | 1.3 | 4.5 | biological, light |
| Wind Glider | 100 | 6 s | High Perch | High Perch | 60 | – | 0 | 5 | 8 | light, air |
| Fedaykin | rite (115) | 6.5 s | – | Great Sietch | 230 | – | 1 | 1.5 | 5.5 | biological, light |
| Fremen Mortar | rite (160) | 8.5 s | – | Great Sietch | 120 | – | 0 | 1.4 | 6 | biological, light |
| Sandrider | rite (220) | 10 s | – | Sietch III | 280 | – | 1 | 1.6 | 5.5 | biological, light |

### Weapons

Damage per hit, before armor, plus its bonus against targets with that tag. DPS is the base damage over the cooldown. Range in tiles.

| Weapon | Damage | Cooldown (s) | DPS | Range | Notes |
|---|---|---|---|---|---|
| Fremen Warrior | 7 (+3 vs biological) | 0.55 | 12.73 | 2.25 | hits aircraft |
| Fedaykin | 14 (+12 vs armored) | 1 | 14 | 3.5 | hits aircraft; cone ±14°; ignores shields |
| Fremen Mortar (mobile) | 6 | 0.8 | 7.5 | 2.25 | ground only |
| Fremen Mortar (set up) | 28 (+26 vs structure) | 1.4 | 20 | 2–6 | ground only; splash 1.5 tiles |
| Sandrider | 400 | 1.6 | 250 | 0.45 | ground only; ignores shields; only hits biological targets; Weapons upgrades don't change it |

### Unit notes

**Fremen Warrior.** Cheap, fast desert fighter with a maula pistol and a crysknife. Strong vs infantry, can shoot at aircraft. Weak vs vehicles, flamers and structures. Goes through rites to become a Fedaykin or a Fremen Mortar.
- Digs into the sand when it stands still on it, out of sight (see [Hiding](README.md#hiding-fremen)).

**Spice Crew.** Unarmed spice hunters. Walk them onto a spice field and Set Up Camp (D): the Spice Camp turns the spice around it into credits. Pack it up again when the spice runs out.
- Sets up a Spice Camp on a spice field, and packs it up again.
- Digs into the sand when it stands still on it, out of sight (see [Hiding](README.md#hiding-fremen)).

**Wind Glider.** A Fremen rider on a cloth wing, riding the desert winds. The fastest thing in the sky and sees far, but unarmed and frail. It can't hover: with nowhere to go, it circles.
- Flies: crosses any terrain; only anti-air weapons can hit it.

**Fedaykin.** Elite fighters with weirding modules: sonic blasts that hit everything in a narrow cone, crack armor and pass straight through shields. Strong vs tanks and massed infantry, fair vs light vehicles, can shoot at aircraft. Weak vs Sandriders and slow against structures. With Sietch III, can go through the rite of the Sandrider.
- Rite: a Fremen Warrior becomes one in 6.5 s for 115 credits (one way).
- Digs into the sand when it stands still on it, out of sight (see [Hiding](README.md#hiding-fremen)).

**Fremen Mortar.** A Fremen with a heavy rocket mortar on his back and a pistol in his belt. On the move he barely fights; set up (D, 1.5 s), he lobs guided rockets at anything your side can see out to 6 tiles: strong vs vehicles, structures and packed infantry. Can't fire up close, and in the sand he digs in like any Fremen.
- Rite: a Fremen Warrior becomes one in 8.5 s for 160 credits (one way).
- Sets up in 1.5 s (as long to pack up); set up, it can't move and fires its long-range weapon.
- Digs into the sand when it stands still on it, out of sight (see [Hiding](README.md#hiding-fremen)).

**Sandrider.** A Fremen who has ridden Shai-Hulud. Plants a Thumper and rides the worm it calls until you let it go: the worm goes where you send it and swallows the enemy on the sand (vehicles most of all), never your own. On foot, a zealot: rushes the most valuable enemy infantry about and kills it with one stroke of the crysknife, a slow blade that passes any shield. Can't hurt vehicles, structures or aircraft on foot.
- Rite: a Fedaykin becomes one in 10 s for 220 credits (one way).
- Charges: closing on a target within 3 tiles, it runs 2× as fast.
- Plants Thumpers and rides the Sandworm that comes (see [Sandworms](README.md#sandworms)).
- Digs into the sand when it stands still on it, out of sight (see [Hiding](README.md#hiding-fremen)).

### Structures

Level-ups (↳) upgrade a building of that type in place. Structures have armor 5 unless listed otherwise.

| Structure | Cost | Build | Requires | Health | Shields | Armor | Size | Notes |
|---|---|---|---|---|---|---|---|---|
| Sietch | 2000 | 25 s | – | 1600 | – | 5 | 3×3 | A Fremen stronghold, and their hub: builds structures, one at a time. Lose all of these and you cannot build. |
| ↳ Great Sietch | 1000 | 35 s | Sietch, Barracks | | | | | Upgrades a Sietch. Unlocks Fedaykin, Fremen Mortars, Thumpers, Weapons +1, Armor +1 and Stillsuits. |
| ↳ Sietch III | 1500 | 45 s | Great Sietch | | | | | Upgrades a Great Sietch. Unlocks the Sandrider, Weapons +2, Armor +2 and Ambush. |
| Barracks | 400 | 10 s | – | 800 | – | 5 | 2×2 | Trains infantry. Each Barracks adds a production line. |
| High Perch | 600 | 12 s | – | 700 | – | 5 | 2×2 | A glider roost on a rock spur: Fremen engineers build and launch Wind Gliders here (each High Perch adds a production line). Its cisterns water the troops: Fremen units and structures near it heal twice as fast. Heals 2× as fast within 5 tiles. |
| Bunker | 400 | 10 s | Barracks | 1400 | – | 5 | 2×2 | Holds three infantry, who shoot from it and can't be hurt while inside. Right-click it with infantry selected; Unload on the command card lets them out. |
| Spice Camp | – (the crew) | set up by a unit | – | 500 | – | 5 | 2×2 | Set up by a Spice Crew on a spice field: turns the spice around it into credits. Packs up into a crew again (D) when the field runs dry. Up to 7.2 credits/s from the spice within 3.5 tiles. |
| Thumper | 250 | set up by a unit | Great Sietch | 150 | – | 5 | 1×1 | Planted in the sand by a Sandrider, it drums until a Sandworm comes: the Sandrider climbs on if it is close by; otherwise the worm comes wild and swallows anything on the sand around it, whoever it belongs to. Destroy it before then and no worm comes. Goes on open sand or spice only. |

### Research

Researched one at a time, from the Upgrade tab. Weapons levels add 15% of each hit (bonus included); Armor levels take one more point off every hit.

| Upgrade | Cost | Time | Requires | Effect |
|---|---|---|---|---|
| Weapons +1 | 350 | 20 s | Great Sietch | Every weapon hits 15% harder, bonus damage included (armor still comes off each hit). |
| Weapons +2 | 550 | 30 s | Weapons +1, Sietch III | Every weapon hits 30% harder in all, bonus damage included. |
| Armor +1 | 350 | 20 s | Great Sietch | +1 armor for all units and buildings: one less damage from every hit. |
| Armor +2 | 550 | 30 s | Armor +1, Sietch III | +2 armor in all for units and buildings. |
| Ambush | 400 | 30 s | Sietch III | Units striking out of hiding deal +75% damage for 4 s. |
| Stillsuits | 400 | 20 s | Great Sietch | Fremen units heal twice as fast, and start sooner after being hurt. |
| Sandwalk | 500 | 20 s | – | Fremen infantry move a further 25% faster on sand and spice. |
| Spice Mining | 600 | 20 s | – | Spice Camps turn spice into credits 25% faster. |

<!-- /specs -->
