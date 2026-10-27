# Strat manual

How the game plays, then a page per faction: its tech tree, a card for every unit (portrait, stats, weapons, and what it's strong and weak against) and structure, and its research.

- [Atreides](atreides.md): fast and mobile, with Carryalls, Repair Vehicles and the MLRS.
- [Corrino](corrino.md): slow, expensive and shielded, with Devastators, Sky Raiders and drop pods.
- [Fremen](fremen.md): cheap infantry that hide in the sand, live off spice camps and ride Sandworms.

The controls are in the [main README](../../README.md#controls).

## Winning

You start with a Construction Yard (Fremen: a Sietch), a few units and 2,500 credits. You win when the enemy has nothing left: no units and no structures. A computer opponent that's clearly beaten offers to surrender; you can accept or play on.

## Economy

Everything costs credits, and credits come from spice: the orange fields on the sand. Fields run out as they're harvested.

- **Atreides and Corrino** build a Refinery, which comes with a Harvester. Harvesters collect spice (up to 500 a load), drive it back and unload it as credits. More Harvesters and Refineries mean more income. Harvesters are slow and unarmed, so they're the first thing a raid goes for.
- **Fremen** have no Harvesters. A Spice Crew walks onto a field and sets up a Spice Camp, which turns the spice around it into credits on the spot. When the field runs dry, the camp packs up and moves on.

The credits readout estimates your income. Repairing costs credits too: 40% of the price for a full bar of health.

## Building

The hub (Construction Yard or Sietch) builds structures one at a time. When one is ready, its button waits until you place it on rock near your base. Fremen can also build on open sand. Lose every hub and you can't build any more.

Each structure unlocks more of the tech tree, and some level up in place to unlock more again (HQ Level 2, Factory Level 2, Great Sietch, and so on). Any structure but your last hub can be **salvaged** for half its price back (Bunkers: 75%).

## Units

Production buildings train units. Each building of a type adds a production line, so two Barracks train two infantry at once, and each type queues up to five. New units go to the building's **rally point**. Set it on the ground, or on one of your units to have new units follow that unit.

Right-click to move and attack. Right-clicking one of your own units makes the selection follow it. Attack-move (A) fights everything on the way; Hold Position (F) stands and only shoots what comes within reach; Shift queues orders.

## Combat

Every unit has **tags**: biological or mechanical, light or armored, plus air for aircraft and structure for buildings. Most weapons have one **bonus** against a tag (a Tank does extra damage to mechanical targets, a Razor's flamethrower to biological ones). The right unit for the job wins its fights, but every unit still deals real damage to everything it can hit.

What a hit does:

1. **Damage:** the weapon's damage, plus its bonus if the target has that tag. Each Weapons upgrade adds 15% of that.
2. **Shields** (Corrino) take the hit first, less one point per Shields and per Armor upgrade. They recover on their own after 7 seconds out of combat.
3. **Armor** comes off whatever reaches health: the unit's own armor (0 to 3; structures 5), plus one per Armor upgrade. A hit always does at least half a point.

Other things that matter:

- **Anti-air.** Aircraft can only be hit by weapons that shoot at aircraft (marked in the faction pages). Some weapons hit aircraft for a different amount than ground targets.
- **High ground.** Units only reach high ground by ramps. Shooting down reaches 10% further, shooting up 10% less far.
- **Splash and cones.** MLRS rockets, Soulcrusher shells and Mortar rockets hit everything in a blast. Unguided shells land where the target was when fired, so moving units can dodge them. Flamethrowers and weirding modules hit everything in a cone in front of them.
- **Fog of war.** You only see what your units and structures see. Low ground can't see up onto high ground, and mesas block the view. Anything that shoots at you shows itself for a moment.
- **Healing.** Each faction heals differently: Atreides infantry heal on their own and Repair Vehicles mend the rest; Corrino units heal only at a Repair Pad, while their structures can repair themselves; Fremen heal on their own, faster near a High Perch.

## Upgrades

The Upgrade tab researches one thing at a time: building level-ups, Weapons and Armor levels (Corrino also Shields), and faction upgrades such as Infantry Rockets, Flame Range or Ambush. Upgrades are noticeable but not decisive: a Weapons or Armor level wins close fights, not lopsided ones.

## Sandworms

Sandworms live under the sand and can't cross rock. Fremen Sandriders call them with Thumpers.

- A Thumper drums for a few seconds, and anyone near hears it. Destroy it in time and no worm comes.
- If the Sandrider is close when the worm surfaces, they ride it until you let it go or they're shot off. A ridden worm goes where you send it and swallows enemies on the sand, never its own side.
- Otherwise the worm is wild: for a while it swallows anything on the sand around the Thumper, whoever it belongs to.

Once a worm is up, the only safe ground is rock. Fremen units dug into the sand are never heard.

## Hiding (Fremen)

A Fremen unit that stands still on sand for 3 seconds digs in and disappears from the enemy's view, unless an enemy is right next to it. Dig In (V) does it at once and holds fire. Firing or being hit brings it out.
