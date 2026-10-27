# Atreides

[Manual](README.md) · **Atreides** · [Corrino](corrino.md) · [Fremen](fremen.md)

## Overview

House Atreides fights with speed and reach. Its units are cheap and quick to build, and its air wing moves the army around: Carryalls lift tanks and drop infantry anywhere on the map, and ferry Harvesters between field and Refinery. There are no shields and no self-repair, so Atreides keeps its army alive by pulling back, healing and coming again.

**Strengths:** mobility (Trikes, Carryall drops), long-range firepower (MLRS, Tanks), cheap mass infantry that heal on their own, Bunkers for a cheap hold.

**Weaknesses:** nothing is very tough, vehicles need a Repair Vehicle to heal, and the MLRS is helpless up close.

### How it plays

- **Start:** a Construction Yard, a Trike and three Infantry. Build a Refinery and a Barracks, then a Factory.
- **Economy:** Harvesters and Refineries. A Carryall assigned to a Harvester flies it between field and Refinery, and lifts it out of trouble.
- **Army:** Infantry and Trikes early, Tanks as the backbone, MLRS behind them once the Factory is at Level 2. Infantry Rockets turn Infantry into anti-armor; Trike Nitro makes Trikes the best harvester raiders in the game.
- **Healing:** Infantry heal on their own once they've been out of combat for 5 seconds. Repair Vehicles mend vehicles, aircraft and structures for credits.
- **Air:** the Hi-Tech Factory builds Carryalls. Each lifts a Tank or MLRS, two Trikes, or six Infantry. Heavy vehicles are set down in a touch-and-go landing; Infantry and Trikes parachute out on a fly-by.
- **Upgrades:** Weapons I and Armor I after a Factory, then HQ Level 2 for Weapons II, Armor II and Harvesting.

## Specs

<!-- specs -->
<!-- Generated from src/config by sim/manual.ts: edit the config, then rerun it. -->

### Tech tree

Structures (boxes), their level-ups (rounded) and the units they unlock (pills). Dotted arrows are Fremen rites.

```mermaid
flowchart LR
  conyard["Construction Yard"]
  conyard2("HQ Level 2")
  conyard --> conyard2
  refinery["Refinery"]
  conyard --> refinery
  barracks["Barracks"]
  conyard --> barracks
  factory["Factory"]
  refinery --> factory
  barracks --> factory
  factory2("Factory Level 2")
  factory --> factory2
  hitech["Hi-Tech Factory"]
  factory --> hitech
  bunker["Bunker"]
  barracks --> bunker
  u_infantry(["Infantry"])
  barracks --> u_infantry
  u_trike(["Trike"])
  factory --> u_trike
  u_tank(["Tank"])
  factory --> u_tank
  u_rocket(["MLRS"])
  factory --> u_rocket
  factory2 --> u_rocket
  u_harvester(["Harvester"])
  factory --> u_harvester
  refinery --> u_harvester
  u_repair(["Repair Vehicle"])
  factory --> u_repair
  u_carryall(["Carryall"])
  hitech --> u_carryall
  classDef unit fill:#f3e2c0,stroke:#a4782f,color:#3a2a10
  class u_infantry,u_trike,u_tank,u_rocket,u_harvester,u_repair,u_carryall unit
```

### Units

Cost in credits; speed and sight in tiles (per second for speed). Shields absorb damage before health and recover on their own.

| Unit | Cost | Build | Made at | Requires | Health | Shields | Armor | Speed | Sight | Tags |
|---|---|---|---|---|---|---|---|---|---|---|
| Infantry | 80 | 4.5 s | Barracks | Barracks | 120 | – | 0 | 1.2 | 5 | biological, light |
| Trike | 110 | 4.5 s | Factory | Factory | 200 | – | 1 | 3.75 | 6 | mechanical, light |
| Tank | 425 | 9 s | Factory | Factory | 725 | – | 2 | 1.9 | 6.5 | mechanical, armored |
| MLRS | 510 | 13 s | Factory | Factory Level 2 | 265 | – | 1 | 1.7 | 9 | mechanical, light |
| Harvester | 800 | 10 s | Factory | Factory, Refinery | 600 | – | 2 | 1.5 | 4 | mechanical, armored |
| Repair Vehicle | 450 | 8 s | Factory | Factory | 300 | – | 1 | 2.1 | 5 | mechanical, light |
| Carryall | 400 | 8 s | Hi-Tech Factory | Hi-Tech Factory | 380 | – | 1 | 4.5 | 6 | mechanical, air |

### Weapons

Damage per hit, before armor, plus its bonus against targets with that tag. DPS is the base damage over the cooldown. Range in tiles.

| Weapon | Damage | Cooldown (s) | DPS | Range | Notes |
|---|---|---|---|---|---|
| Infantry | 7 (+3 vs biological) | 0.6 | 11.67 | 3 | hits aircraft |
| Infantry: rockets vs Armored (Infantry Rockets) | 14 (+12 vs armored) | 1.5 | 9.33 | 4.5 | hits aircraft |
| Trike | 5 (+3 vs light) | 0.3 | 16.67 | 3.5 | ground only |
| Tank | 22 (+22 vs mechanical) | 1.4 | 15.71 | 4.5 | ground only |
| MLRS | 44 (+30 vs structure) | 2.8 | 15.71 | 3–7.5 | hits aircraft for 60; splash 2 tiles; unguided: falls where the target stood |

### Unit notes

**Infantry.** Cheap rifle squad. Strong vs infantry. With Infantry Rockets, devastating vs armor. Can shoot at aircraft.
- Carryall space: 1 of 6.

**Trike.** Fast raider with a machine gun. Strong vs infantry and MLRS, good for harassing harvesters. With Trike Nitro, faster still and firing faster.
- Carryall space: 3 of 6.

**Tank.** Main battle tank. Crushes vehicles, decent vs buildings, weak vs infantry with Infantry Rockets.
- Carryall space: 6 of 6.

**MLRS.** Long-range rocket artillery with a wide blast. Devastating vs massed troops and buildings, and shoots down aircraft. Rockets fly at where the target was, so moving units can dodge them; Lock On (D) makes them home in on one target for a while. Lightly armored and can't fire up close: trikes that get in tear it apart.
- Lock On: its rockets home in on one target for 8 s; recharges in 20 s.
- Carryall space: 6 of 6.

**Harvester.** Collects spice and brings it to a Refinery.
- Carryall space: 6 of 6.

**Repair Vehicle.** Repairs vehicles, aircraft and buildings for credits. Right-click something damaged; repairs anything nearby when idle.
- Repairs vehicles, aircraft and structures: 30 HP/s within 1.25 tiles, for credits.
- Carryall space: 6 of 6.

**Carryall.** Airlifts a heavy vehicle, two trikes or six infantry. Right-click a unit to pick it up, D to drop. Assigned to a harvester, it ferries it between spice and refinery.
- Flies: crosses any terrain; only anti-air weapons can hit it.

### Structures

Level-ups (↳) upgrade a building of that type in place. Structures have armor 5 unless listed otherwise.

| Structure | Cost | Build | Requires | Health | Shields | Armor | Size | Notes |
|---|---|---|---|---|---|---|---|---|
| Construction Yard | 2500 | 25 s | – | 1600 | – | 5 | 3×3 | Builds structures, one at a time. Lose all of these and you cannot build. |
| ↳ HQ Level 2 | 1500 | 45 s | Construction Yard | | | | | Upgrades a Construction Yard. Unlocks Harvesting, Weapons II and Armor II. |
| Refinery | 1200 | 14 s | – | 1000 | – | 5 | 3×3 | Processes spice into credits. Comes with a free Harvester. |
| Barracks | 400 | 10 s | – | 800 | – | 5 | 2×2 | Trains infantry. Each Barracks adds a production line. |
| Factory | 1000 | 14 s | Refinery, Barracks | 1100 | – | 5 | 3×3 | Builds vehicles. Each Factory adds a production line. |
| ↳ Factory Level 2 | 1500 | 40 s | Factory | | | | | Upgrades a Factory. Unlocks the MLRS. |
| Hi-Tech Factory | 800 | 11 s | Factory | 1000 | – | 5 | 3×3 | Builds aircraft: the Carryall. Each one adds a production line. |
| Bunker | 400 | 10 s | Barracks | 1400 | – | 5 | 2×2 | Holds three infantry, who shoot from it and can't be hurt while inside. Right-click it with infantry selected; Unload on the command card lets them out. |

### Research

Researched one at a time, from the Upgrade tab. Weapons levels add 15% of each hit (bonus included); Armor levels take one more point off every hit.

| Upgrade | Cost | Time | Requires | Effect |
|---|---|---|---|---|
| Weapons I | 700 | 25 s | Factory | Every weapon hits 15% harder, bonus damage included (armor still comes off each hit). |
| Weapons II | 1200 | 45 s | Weapons I, HQ Level 2 | Every weapon hits 30% harder in all, bonus damage included. |
| Armor I | 700 | 25 s | Factory | +1 armor for all units and buildings: one less damage from every hit. |
| Armor II | 1200 | 45 s | Armor I, HQ Level 2 | +2 armor in all for units and buildings. |
| Infantry Rockets | 800 | 25 s | Barracks, Factory | Infantry switch to rocket launchers against Armored targets. |
| Trike Nitro | 500 | 20 s | Factory | Trikes move 50% faster and fire 50% faster. |
| Harvesting | 600 | 20 s | HQ Level 2, Refinery | Harvesters carry 25% more, move 25% faster and pick up spice 50% faster. |

<!-- /specs -->
