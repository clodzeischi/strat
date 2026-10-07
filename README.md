# Strat

A Dune-style real-time strategy game in the browser, built with Three.js and TypeScript. Harvest spice, build a base, and fight a computer opponent across a randomly generated desert. You can also drop paratroopers on top of its base.

![Carryalls parachuting infantry and trikes onto an enemy base](docs/screenshots/airdrop.jpg)

## Features

- **Classic Dune economy.** Harvesters collect spice and bring it to Refineries for credits. Spice fields shimmer and run out as they're harvested.
- **Procedural maps.** Every game gets a new, point-symmetric map in one of three sizes. The desert has dunes, scattered mesas and rock shelves with cliffs on one edge. Spawns are random, and the end screen shows the seed so you can replay a map with `?seed=N`.
- **Elevation that matters.** Units only climb to high ground by ramps, and they shoot further downhill than up. A base on a rock shelf has a cliff flank that only rocket launchers can hit from below.
- **Bunkers.** Fill one with three infantry: they shoot out from cover, Infantry Rockets included, and can't be hit inside. Tanks and rocket launchers outrange them.
- **Counter-based combat.** Units have StarCraft-style tags (light, armored, biological, mechanical) with bonus damage against them. Tanks and rocket launchers can fire on the move, and vehicles tilt with the ground.
- **Tech and upgrades.** Level-2 Construction Yard and Factory, two tiers each of Weapons and Armor, Infantry Rockets, Trike Nitro and Harvesting. Each upgrade shows on the unit models.
- **Carryalls and airborne drops.** The Hi-Tech Factory builds Carryalls. Each can lift a heavy vehicle, two trikes or six infantry and drop them anywhere:
  - Heavy vehicles are set down in a touch-and-go landing.
  - Infantry and trikes parachute out on a fly-by.
  - A Carryall assigned to a harvester ferries it between field and refinery, and flies it home if it comes under attack.
- **Anti-air.** Infantry and rocket launchers can shoot Carryalls down. Troopers aboard a downed Carryall bail out by parachute.
- **Repair.** Repair Vehicles fix vehicles, aircraft and buildings for credits. Infantry heal on their own once out of combat.
- **Online 1v1.** Host a game on your own server (a Raspberry Pi is plenty) and play a friend on your network. See [Multiplayer](#multiplayer).
- **A computer opponent** that defends in proportion to the attack, rebuilds its economy after losses, and offers to surrender when it's beaten (you can refuse and keep playing). On Hard it runs a bigger economy, attacks when it's stronger, raids your harvesters, repairs its vehicles after defending and pulls back from fights it's losing. Brutal is coming. End-of-game stats screen.

## Screenshots

| | |
|---|---|
| ![The main menu over a fly-over of the desert](docs/screenshots/menu.jpg) | ![A built-up blue base with the sidebar](docs/screenshots/gameplay.jpg) |
| The main menu, over a fly-over of the generated map. | A built-up base. A Carryall ferries the harvester. |
| ![Blue and red armies clashing on a spice field](docs/screenshots/battle.jpg) | ![A Carryall setting a tank down on a spice field, kicking up red dust](docs/screenshots/landing.jpg) |
| Armies clash over a spice field. | A touch-and-go drop: the Carryall's downwash raises red dust over spice. |

## Getting started

You need [Node.js](https://nodejs.org/) 20.19 or newer (or 22.12+).

```sh
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). `npm run build` makes a production build in `dist/`.

## Multiplayer

Online games are 1v1 between two browsers, through a small game server you run yourself. The server only pairs players and passes their commands along. Each browser runs the whole game, in lockstep (see [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md)), so the server needs almost no CPU.

On the machine that will host (your PC, or a Raspberry Pi):

```sh
npm install
npm run build
npm run serve
```

It prints addresses like `http://192.168.1.20:8080`. Both players open that address, pick **Multiplayer** and enter a name. One clicks **Host game**, and the other clicks the game under **Open games**.

- `PORT=9000 npm run serve` uses another port.
- During development, run `npm run serve` and `npm run dev` side by side. The dev page reaches the server through Vite.
- Both players need the same build. After you update, rebuild and restart the server, and both players reload the page.

**Raspberry Pi.** Install Node.js 22, for example from [NodeSource](https://github.com/nodesource/distributions); Raspberry Pi OS's own package is too old to build. Then run the commands above in a clone of this repository. To keep the server running after you log out, run it as a systemd service or under `tmux`. If the Pi is slow to build, run `npm run build` on your PC and copy `dist/` over. The server serves whatever is in `dist/`.

## Controls

| Input | Action |
|---|---|
| Left click / drag | Select units, or box-select |
| Double click | Select every unit of that type on screen |
| Right click | Move, attack, harvest, set a rally point, repair (Repair Vehicle), pick up (Carryall) |
| **A**, then click | Attack-move |
| **S** | Stop |
| **D**, then click | Carryall drop |
| **F** | Unload a selected bunker |
| **Ctrl+1-9** / **1-9** | Set / select a control group (double-tap to jump to it) |
| **Space** | Jump to your base |
| **`** (left of 1) | Pause (not in online games) |
| Arrow keys, screen edges, middle-drag | Pan the camera |
| **Esc** | Cancel, or open the menu |

Hotkeys all sit under the left hand, as in Stormgate.

Production is in the sidebar on the right. Click a card to build or train, and right-click it to cancel. A finished structure waits on its card until you click the card again and place the building on rock near your base.

## Units and buildings

| Building | Notes |
|---|---|
| Construction Yard | Builds structures. Upgrades to HQ Level 2. |
| Refinery | Turns spice into credits. Comes with a free Harvester. |
| Barracks | Trains infantry. |
| Bunker | Holds three infantry, who shoot from it and can't be hurt while inside. Right-click it with infantry to fill it, F to unload. |
| Factory | Builds vehicles. Upgrades to Level 2 for Rocket Launchers and tier-2 upgrades. |
| Hi-Tech Factory | Builds Carryalls. |

| Unit | Role |
|---|---|
| Harvester | Collects spice. |
| Infantry | Cheap and strong against infantry. Devastating against armor with the Rockets upgrade. Can hit aircraft. |
| Trike | Fast raider for harassing harvesters. |
| Tank | Main battle tank. Fires on the move. |
| Rocket Launcher | Long-range artillery and anti-air. Can't fire up close. |
| Repair Vehicle | Repairs vehicles, aircraft and buildings. |
| Carryall | Airlifts and drops units, and ferries harvesters. |

## Development

- `npm run typecheck`: type-check the game and the server.
- `sim/`: headless simulations and checks that run the real game code without a browser. For example:
  - `npx tsx sim/air-repair-check.ts`: Carryall, paradrop and repair behavior.
  - `npx tsx sim/ai-check.ts`: AI defense, economy recovery and surrender (`DIFFICULTY=hard` for Hard).
  - `MAPS=random sim/run.sh 10 4 hard`: a profile from `sim/variants.ts` against Normal, 40 games on random maps.
  - `sim/gauntlet.sh 20`: Normal and Hard against scripted player strategies (rush, turtle, harass, rockets, drop).
  - `npx tsx sim/side-bias.ts`: spawn fairness, the same AI on both sides of each map.
  - `npx tsx sim/matchups.ts`: re-measure unit matchups for the AI after changing unit stats; `npx tsx sim/duel.ts` for quick duels.
  - `npx tsx sim/terrain-check.ts 3`: AI matches, checked for illegal moves and stuck units.
  - `CHECK=60 QUIET=1 npx tsx sim/maps.ts`: generate 60 maps and validate them.
  - `npx tsx sim/determinism.ts`: the simulation is deterministic (same seed and commands, same game), which online play depends on.
  - `npx tsx sim/netplay-check.ts`: an online match between two headless players through the real server, checked for desyncs, and replayed from its command log.
- [docs/CODE_LAYOUT.md](docs/CODE_LAYOUT.md): where everything lives in `src/`.
- [docs/PLAN.md](docs/PLAN.md): the roadmap and design decisions.

## License

[MIT](LICENSE)
