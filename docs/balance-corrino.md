# Corrino mirror balance

Goal (the user's, as for Atreides in docs/balance-atreides.md): no clearly winning build, no end-game magic unit,
every unit relevant all game, upgrades worth their price; tech order, prices and times may change.

## Tools

The Atreides tools now take a faction: `FACTION=corrino sim/ava.sh <games-per-pair>` runs a round robin of the Corrino
build orders in `sim/ava-strats.ts` (`CORRINO_STRATS`), `sim/ava-summary.ts` summarises any faction,
`FACTION=corrino npx tsx sim/ava-duels.ts` runs the equal-cost duels. Long batches through `sim/snap.sh`.

Build orders (each is Brutal playing a fixed plan; `std` is stock Brutal, which counter-picks):

| plan | what it does |
|---|---|
| std | stock Brutal |
| rush | two Barracks first, troopers and some razors, attacks from 1:40, no tech |
| razor | razors with Flame Range first, big razor raids, no tech buildings |
| sard | Imperial Barracks first: Sardaukar and troopers |
| dev | Fab Level 2 first: Devastators and troopers |
| air | Tleilaxu early: Sky Raiders and troopers |
| turtle | four turrets, everything researched, no attack before 14:00; Devastators, Soulcrushers, Sardaukar |

## Tech tree at the start (main @ 7c23b7a)

```
Construction Yard (2500)
├─ Refinery (1200, free Harvester)
├─ Barracks (400) ── Harkonnen Trooper (100)
│   ├─ Auto Turret (350)
│   └─ Imperial Barracks (level 2: 1000, needs Tleilaxu) ── Sardaukar (300), drop pods
└─ Fab (1100, needs Refinery + Barracks) ── Razor (250), Harvester (800)
    ├─ Weapons +1 (900) · Armor +1 (900) · Razor Flame Range (500) · Harvesting (600, + Refinery)
    ├─ Repair Pad (700): the only healing Corrino units get
    ├─ Tleilaxu Research (1300) ── Sky Raider (500, air), Soulcrusher (650), Shields +1 (900)
    └─ Fab Level 2 (1200, needs Tleilaxu) ── Devastator (900)
```

Corrino units and structures carry shields (half their health for shared types) that recover after 7 s out of fire;
structures repair themselves for credits. One level each of Weapons and Armor (Atreides and Fremen have two).

| unit | cost | HP + shields | job |
|---|---|---|---|
| Trooper | 100 | 100 + 60 | shoulder rockets, range 9: anti-vehicle |
| Sardaukar | 300 | 220 + 120 | close-range anti-infantry, shoots aircraft |
| Razor | 250 | 200 + 100 | flamethrower buggy: anti-infantry |
| Devastator | 900 | 900 + 400 | heavy tank, main gun only standing still, coax MG, self-destruct |
| Sky Raider | 500 | 260 + 120 | air, rockets vs armor, lays anti-infantry mines |
| Soulcrusher | 650 | 260 + 140 | deployable artillery, range 26 |

## Log

### 0. AI fix: saving for tech

The stock Corrino AI never researched or levelled up in a 29-minute test game; the Devastator plan got Fab Level 2 at
20:00. Cause (all factions): a tech step needs its price plus the 800 harvester fund on hand (`manageTech`), but unit
production only held back the price, so credits hovered at 1,100-1,700 under a 2,000 bar. Production now keeps both
back. The same test game: all five upgrades by 9:00.

### 1. Baseline (with the AI fix), 40 games per pair, 1,120 games

| row vs col | std | rush | razor | sard | dev | air | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 78 | 93 | 68 | 94 | 50 | 85 | 78 |
| rush | 23 | . | 23 | 20 | 20 | 21 | 15 | 20 |
| razor | 8 | 78 | . | 13 | 26 | 5 | 18 | 24 |
| sard | 33 | 80 | 88 | . | 88 | 46 | 51 | 64 |
| dev | 6 | 80 | 74 | 13 | . | 28 | 31 | 39 |
| air | 50 | 79 | 95 | 54 | 73 | . | 69 | 70 |
| turtle | 15 | 85 | 83 | 49 | 69 | 31 | . | 55 |

Games 16.2 min, 24% over 20 min, 10% timeouts. Kill ratios (credits killed / lost): **Sky Raider 5.70**, Soulcrusher
1.72, trooper 1.11, razor 0.64, Sardaukar 0.59, **Devastator 0.41**. Only Sardaukar can shoot at aircraft: troopers,
razors and turrets can't.

Equal-cost duels (3,000 credits a side, Micro on both, +1 = row wins outright; Soulcrushers don't deploy in duels):

| row vs col | trooper | sardaukar | razor | devastator | raider |
|---|---|---|---|---|---|
| trooper | . | 0.33 | -0.31 | 0.88 | -1.00 |
| sardaukar | -0.33 | . | -0.74 | 0.41 | 0.93 |
| razor | 0.31 | 0.74 | . | -0.38 | -0.95 |
| devastator | -0.88 | -0.41 | 0.38 | . | -1.03 |
| raider | 1.00 | -0.93 | 0.95 | 1.03 | . |

The Sky Raider beats everything but Sardaukar; troopers beat the Sardaukar meant to hunt them; the Devastator's
machine gun (range 5) can't hold off infantry.

### 2. Troopers take potshots at aircraft; Sardaukar 260 / range 5.5; Devastator machine gun range 9, damage 6

Duel sweeps: trooper rockets at aircraft at 8 damage → troopers beat raiders +0.94; at 1.5 (bonus -6.5) +0.61, at 1
+0.14. Sardaukar range 5.5 and 260 credits: vs troopers -0.33 → +0.26, but vs Devastators +0.41 → +0.80, so the
Devastator's machine gun goes to range 9, damage 6: vs Sardaukar +0.23, vs razors +0.45, vs troopers still -0.79.

| row vs col | std | rush | razor | sard | dev | air | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 75 | 60 | 54 | 95 | 60 | 64 | 68 |
| rush | 25 | . | 23 | 25 | 23 | 20 | 15 | 22 |
| razor | 40 | 78 | . | 84 | 90 | 20 | 69 | 63 |
| sard | 46 | 75 | 16 | . | 64 | 56 | 23 | 47 |
| dev | 5 | 78 | 10 | 36 | . | 0 | 29 | 26 |
| air | 40 | 80 | 80 | 44 | 100 | . | 89 | 72 |
| turtle | 36 | 85 | 31 | 78 | 71 | 11 | . | 52 |

Games 15.2 min, 2% timeouts. Kill ratios: raider 2.54, Soulcrusher 1.55, trooper 1.14, Sardaukar 0.75, Devastator 0.72,
razor 0.67. A minute+ ahead wins: Harvesting 86%, Flame 80%, Armor 79%, Weapons 74%, Shields 74%, Tleilaxu 64%, but
Fab Lv 2 50% and Imperial Barracks 51%: the level-ups don't pay. The air plan beats the Devastator plan 100%.

### 3. Sky Raider 600 / 13 s, Devastator 800, Fab Lv 2 1,000, Imperial Barracks 800 (tune)

Plans 22-67: razor 67, turtle 67, std 59, air 59, sard 48, dev 28, rush 22. Raider ratio 2.54 → 1.89. The level-ups
still don't pay (Fab Lv 2 54%, Imperial Barracks 53%). The Devastator loses to every army because every Corrino army
is 70-110 troopers: in duels troopers beat it -0.66 whatever its health (1,300 HP: -0.62) or the troopers' damage
(armored bonus 14 → 5: -0.59). Its gun was built for armor (+65), and in the mirror only Devastators and Soulcrushers
are armored.

### 4. Devastator main gun 55 damage, +45 vs armored, -20 vs infantry, splash 1.5 (tune, then written in)

Duels: Devastator vs razor +0.82, vs Sardaukar +0.62, vs Soulcrusher +0.70, vs troopers -0.54 (troopers stay its
counter). Round robin (written into the config with rounds 2-3, counter table regenerated):

| row vs col | std | rush | razor | sard | dev | air | turtle | avg |
|---|---|---|---|---|---|---|---|---|
| std | . | 75 | 40 | 45 | 88 | 60 | 36 | 57 |
| rush | 25 | . | 23 | 25 | 23 | 20 | 15 | 22 |
| razor | 60 | 78 | . | 75 | 80 | 35 | 56 | 64 |
| sard | 55 | 75 | 25 | . | 34 | 68 | 11 | 45 |
| dev | 13 | 78 | 20 | 66 | . | 8 | 29 | 35 |
| air | 40 | 80 | 65 | 33 | 93 | . | 58 | 61 |
| turtle | 64 | 85 | 44 | 89 | 71 | 43 | . | 66 |

Kill ratios: raider 1.86, Soulcrusher 1.52, trooper 1.13, Devastator 1.04 (was 0.41), Sardaukar 0.86, razor 0.63.
Games 15.0 min, 2% timeouts.

**The turtle.** It wins 32 of 40 against stock Brutal, nearly all at 15-17 min, right after its 14:00 push; attackers
lose ~51k credits to its ~30k on the same income. 80 games per test, turtle vs std / vs sard:

| change | turtle vs std | turtle vs sard |
|---|---|---|
| none | 79 | 92 |
| turrets 450 HP, 450 credits | 71 | 85 |
| Repair Pad half as fast | 73 | 92 |
| shields recover after 14 s, over 20 s | 80 | 90 |
| all three | 71 (passive 84) | |
| no pad healing, no shield regeneration at all | (passive 76) | |
| Soulcrusher deployed range 20 | 64 | 88 |
| turtle without Soulcrushers (3 from the siege rule) | 74 | 86 |

`passive` (the turtle's army, no turrets, waits until 14:00) beats std 79%; `mixed` (the same army attacking as usual)
58%. Stock Brutal made more patient (`stdlate`: attacks only at 1.3x, not before 8:00) still loses to passive 86%;
stock Brutal's own army waiting until 14:00 (`stdpassive`) beats std 64% but loses to passive 88%. So: waiting helps
any army, and Devastators + Soulcrushers + Sardaukar + troopers, maxed out, beat the other armies late. Not the
defenses, not Corrino's healing.

### 5. More turtle and rush tests (no change kept)

Turtle, 80 games per cell: Soulcrushers without their +20 vs infantry: turtle vs std / sard / dev 68 / 84 / 70; with
splash 2 (not 3): 69 / 88 / 62. Stock Brutal with a heavier Soulcrusher share (`stdart`) beats the turtle 40%, the
passive plan 38%, std 50%: siege helps break it, but the AI keeps few (the siege rule, max 3).

Rush, 60 games per cell (rush vs std / air / sard): as is 20 / 18 / 22; turrets behind the Fab 15 / 13 / 13; troopers
85 credits, 4.5 s 7 / 7 / 13 (every plan gets them); a razor rush off two Fabs (`razorrush`) 5 / 3 / 8. Corrino
structures carry shields and repair themselves, and early Corrino units barely scratch them (troopers 5 damage,
razors 2), so a rush can't finish a base: it has to win on harvesters, and loses its economy trying.

### 6. Effect of the AI fix elsewhere, and cross-faction (Hard, both sides)

Atreides mirror with the fix (r19): std 62, rush 46, bio 44, mech 53, trike 46, tech 50, turtle 49 (was 43-65, turtle
31): tighter. Triangle bio > mech 73, mech > trike 88, trike > bio 55.

Fremen vs Atreides 51% (100 games; 49% before). Fremen vs Corrino 28% (main: 34%). Atreides vs Corrino 1% (main after
round 20 of the Atreides log: 5%).
