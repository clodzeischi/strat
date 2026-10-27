# Corrino

[Manual](README.md) · [Atreides](atreides.md) · **Corrino** · [Fremen](fremen.md)

## Overview

The Emperor's forces are slow, expensive and hard to kill. Every Corrino unit and structure carries a shield that takes damage before health and recharges once out of combat, so a Corrino army that wins a fight keeps most of its strength. What's lost in health only comes back at a Repair Pad.

**Strengths:** shields that recharge between fights, the heaviest units in the game (Devastator, Soulcrusher), Auto Turrets, structures that repair themselves, and drop pods that put infantry anywhere you can see.

**Weaknesses:** slow and costly, so every loss hurts; units only heal at a Repair Pad; Razors are the only fast unit, and they're no good against harvesters.

### How it plays

- **Start:** a Construction Yard, a Razor and two Harkonnen Troopers. Build a Refinery and a Barracks, then a Fab.
- **Economy:** Harvesters and Refineries, like Atreides, but Corrino Harvesters come from the Fab.
- **Army:** Troopers are the cheap core and the anti-vehicle infantry, Razors burn infantry, Devastators anchor the late army. Tleilaxu Research unlocks Sky Raiders, Soulcrushers and the level-ups that bring Devastators and Sardaukar.
- **Shields:** units and structures that don't list their own get shields of half their health. Shields start recovering 7 seconds after the last hit and refill in 10.
- **Healing:** units park next to a Repair Pad (two at a time) to get their health back, for credits. Damaged structures repair themselves when told to (Mend, on the structure's command card), paid like repairs, while a Construction Yard stands.
- **Drop pods:** with the Imperial Barracks, new infantry land by pod at the Barracks' rally point, anywhere your side can see. Set the rally point on a unit and they land next to it.
- **Upgrades:** one level each of Weapons, Armor and Shields, plus Flame Range for Razors and Harvesting.

## Specs

<!-- specs -->
<!-- Generated from src/config by sim/manual.ts: edit the config, then rerun it. -->

### Tech tree

Structures (boxes), their level-ups (rounded) and the units they unlock (pills). Dotted arrows are Fremen rites.

```mermaid
flowchart LR
  conyard["Construction Yard"]
  refinery["Refinery"]
  conyard --> refinery
  barracks["Barracks"]
  conyard --> barracks
  barracks2("Imperial Barracks")
  barracks --> barracks2
  tleilaxu --> barracks2
  fab["Fab"]
  refinery --> fab
  barracks --> fab
  fab2("Fab Level 2")
  fab --> fab2
  tleilaxu --> fab2
  tleilaxu["Tleilaxu Research"]
  fab --> tleilaxu
  turret["Auto Turret"]
  barracks --> turret
  pad["Repair Pad"]
  fab --> pad
  u_trooper(["Harkonnen Trooper"])
  barracks --> u_trooper
  u_sardaukar(["Sardaukar"])
  barracks --> u_sardaukar
  barracks2 --> u_sardaukar
  u_razor(["Razor"])
  fab --> u_razor
  u_devastator(["Devastator"])
  fab --> u_devastator
  tleilaxu --> u_devastator
  fab2 --> u_devastator
  u_harvester(["Harvester"])
  fab --> u_harvester
  refinery --> u_harvester
  u_raider(["Sky Raider"])
  fab --> u_raider
  tleilaxu --> u_raider
  u_artillery(["Soulcrusher"])
  fab --> u_artillery
  tleilaxu --> u_artillery
  classDef unit fill:#f3e2c0,stroke:#a4782f,color:#3a2a10
  class u_trooper,u_sardaukar,u_razor,u_devastator,u_harvester,u_raider,u_artillery unit
```

### Units

Cost in credits; speed and sight in tiles (per second for speed). Shields absorb damage before health and recover on their own.

| Unit | Cost | Build | Made at | Requires | Health | Shields | Armor | Speed | Sight | Tags |
|---|---|---|---|---|---|---|---|---|---|---|
| Harkonnen Trooper | 110 | 6 s | Barracks | Barracks | 80 | 80 | 0 | 1.05 | 5 | biological, light |
| Sardaukar | 260 | 9 s | Barracks | Imperial Barracks | 180 | 100 | 1 | 1.3 | 5 | biological, light |
| Razor | 250 | 7 s | Fab | Fab | 135 | 80 | 1 | 3 | 5.5 | mechanical, light |
| Devastator | 800 | 16 s | Fab | Tleilaxu Research, Fab Level 2 | 720 | 320 | 3 | 1.2 | 6 | mechanical, armored |
| Harvester | 800 | 10 s | Fab | Fab, Refinery | 600 | 300 | 2 | 1.5 | 4 | mechanical, light |
| Sky Raider | 600 | 13 s | Fab | Tleilaxu Research | 200 | 100 | 1 | 4.5 | 7 | mechanical, air |
| Soulcrusher | 650 | 13 s | Fab | Tleilaxu Research | 200 | 110 | 2 | 1.4 | 6 | mechanical, armored |

### Weapons

Damage per hit, before armor, plus its bonus against targets with that tag. DPS is the base damage over the cooldown. Range in tiles.

| Weapon | Damage | Cooldown (s) | DPS | Range | Notes |
|---|---|---|---|---|---|
| Harkonnen Trooper | 10 (+10 vs armored) | 0.7 | 14.29 | 4.5 | hits aircraft for 10 |
| Sardaukar | 18 (+18 vs biological) | 0.75 | 24 | 2.75 | hits aircraft for 24 |
| Razor | 10 (+12 vs biological) | 0.6 | 16.67 | 2 | ground only; cone ±20° |
| Devastator | 60 (+40 vs armored) | 2 | 30 | 5 | ground only; splash 0.75 tiles |
| Devastator: machine gun | 8 (+4 vs biological) | 0.2 | 40 | 4.5 | ground only |
| Devastator: self-destruct | 500 (+300 vs structure) | – | – | – | ground only; splash 4.5 tiles; Weapons upgrades don't change it |
| Sky Raider | 16 (+20 vs armored) | 1.2 | 13.33 | 2.5 | ground only |
| Sky Raider: mine | 40 (+60 vs biological) | – | – | – | ground only; splash 2 tiles |
| Soulcrusher (mobile) | 14 (+12 vs structure) | 1.5 | 9.33 | 4 | ground only |
| Soulcrusher (set up) | 70 (+110 vs structure) | 4.5 | 15.56 | 4–13 | ground only; splash 2 tiles; unguided: falls where the target stood |

### Unit notes

**Harkonnen Trooper.** Imperial levy raised from the beaten Harkonnen. Shoulder rockets: strong vs vehicles, beats trikes by numbers, and shoots at aircraft. Weak vs MLRS.


**Sardaukar.** The Emperor's elite. Close-quarters fighters: tear through infantry and shoot down aircraft. Weak vs trikes and MLRS.


**Razor.** Dune buggy with a flamethrower that burns everything in front of it. Shreds infantry. Weak vs tanks.


**Devastator.** Slow heavy tank. Its heavy gun hits anything on the ground and crushes armor, but only fires standing still; its machine gun cuts down infantry, even on the move. Can self-destruct in a huge blast. Weak vs aircraft, MLRS and massed troopers.
- The main gun only fires standing still; the machine gun fires on the move.
- Self-destruct: blows up 2.5 s after the order.

**Harvester.** Collects spice and brings it to a Refinery.
- Carryall space: 6 of 6.

**Sky Raider.** Light ornithopter for scouting and raids. Rockets strong vs armor. Lays mines that wreck infantry and wear down harvesters. Weak vs anti-air.
- Lays a mine every 15 s (at most 12 per side); an enemy on the ground within 1.1 tiles sets it off.
- Flies: crosses any terrain; only anti-air weapons can hit it.

**Soulcrusher.** Self-propelled howitzer with a short gun, and can't fire on the move. Deployed, it shells anything your side can see at long range; the shells are slow and fall where the target was. Brutal on buildings and defenses. Weak vs tanks.
- Sets up in 3 s (as long to pack up); set up, it can't move and fires its long-range weapon.
- Can't fire on the move.

### Structures

Level-ups (↳) upgrade a building of that type in place. Structures have armor 5 unless listed otherwise.

| Structure | Cost | Build | Requires | Health | Shields | Armor | Size | Notes |
|---|---|---|---|---|---|---|---|---|
| Construction Yard | 2500 | 25 s | – | 1600 | 800 | 5 | 3×3 | Builds structures, one at a time. Lose all of these and you cannot build. |
| Refinery | 1200 | 14 s | – | 1000 | 500 | 5 | 3×3 | Processes spice into credits. Comes with a free Harvester. |
| Barracks | 400 | 10 s | – | 800 | 400 | 5 | 2×2 | Trains infantry. Each Barracks adds a production line. |
| ↳ Imperial Barracks | 800 | 40 s | Barracks, Tleilaxu Research | | | | | Upgrades a Barracks. Unlocks Sardaukar and drop pods: new infantry land by pod at the rally point, anywhere you can see. |
| Fab | 1100 | 15 s | Refinery, Barracks | 1200 | 600 | 5 | 3×3 | Builds vehicles and aircraft. Each Fab adds a production line. |
| ↳ Fab Level 2 | 1000 | 40 s | Fab, Tleilaxu Research | | | | | Upgrades a Fab. Unlocks Devastators. |
| Tleilaxu Research | 1300 | 18 s | Fab | 1000 | 500 | 5 | 3×3 | Tleilaxu biotech. Unlocks Sky Raiders, Soulcrushers, Devastators and Shields. |
| Auto Turret | 350 | 9 s | Barracks | 700 | 350 | 5 | 1×1 | Small automatic gun emplacement. Shoots ground targets in range. Gun: 14 (+6 vs mechanical) every 0.9 s, range 6 tiles, ground only. |
| Repair Pad | 700 | 12 s | Fab | 900 | 450 | 5 | 2×2 | Restores the health of units parked next to it, two at a time, for credits. Right-click it with units selected. Corrino units don't heal anywhere else. 2 at a time, 25 HP/s each. |

### Research

Researched one at a time, from the Upgrade tab. Weapons levels add 15% of each hit (bonus included); Armor levels take one more point off every hit.

| Upgrade | Cost | Time | Requires | Effect |
|---|---|---|---|---|
| Weapons +1 | 1100 | 40 s | Fab | Every weapon hits 15% harder, bonus damage included (armor still comes off each hit). |
| Armor +1 | 700 | 25 s | Fab | +1 armor for all units and buildings: one less damage from every hit (from shields too). |
| Shields +1 | 400 | 20 s | Tleilaxu Research | Shields take one less damage from every hit. |
| Razor Flame Range | 500 | 20 s | Fab | Razor flamethrowers reach one tile further. |
| Harvesting | 600 | 20 s | Refinery, Fab | Harvesters carry 25% more, move 25% faster and pick up spice 50% faster. |

<!-- /specs -->
