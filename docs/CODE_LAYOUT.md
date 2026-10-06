# Code layout

`src/main.ts` is the entry point: it creates the renderer, scene, game, camera and screens, and runs the frame loop.

| Folder | What lives there |
|---|---|
| `config/` | Game data. `types.ts` (shared types), `rules.ts` (tile size, teams, upgrade effects, economy), and one table each for `units.ts`, `buildings.ts`, `upgrades.ts`. |
| `game/` | Game logic: `game.ts` (the match: entities, production, combat, projectiles), `ai.ts`, `pathfinding.ts`, `heroes.ts`. |
| `entities/` | Things on the map: `entity.ts` (base class, health bar, selection ring), `building.ts`, `unit.ts` (movement, combat, harvesting, repair, parachute falls, vehicle tilt), `carryall.ts` (the aircraft: flight, pickups, drops, harvester ferrying), `distance.ts`. |
| `map/` | The map and its generator: `game-map.ts` (`GameMap`: tiles, levels, ramps, generation, the smooth ground surface), `tiles.ts` (tile and ramp kinds), `noise.ts`. |
| `models/` | 3D models, one file per model: `units/` (with each unit's upgrade parts), `buildings/` (with each building's level-2 parts), shared `parts.ts`, `parachute.ts`, and `index.ts`, which the game calls. |
| `materials/` | Colors and materials: model `palette.ts`, the shared `lambert.ts` cache, `ground.ts` (ground colors), `overlays.ts` (health bars, selection rings), `upgrade-fx.ts` (lasers, nitro flames). |
| `shaders/` | Shader patches: `ground.ts` (sand, rock, outcrops, cliff walls, spice and its shimmer), `instance-alpha.ts` and `dithered-shadow.ts` (particles). |
| `render/` | Drawing: `terrain.ts` (ground mesh), `camera.ts`, `shadows.ts`, `effects/` (one file per effect pool, plus `effects.ts`). |
| `ui/` | Player-facing: `input.ts` (mouse, keys, commands), `sidebar.ts` and its `icons.ts`, `menu.ts`, `placement.ts` (building placement grid). |

Folders that are split into several files have an `index.ts`, so the rest of the code imports `../config`, `../map`, `../entities` or `../models` without caring which file something is in.

Kept in one file on purpose: `GameMap`, `Unit` and `Game` are each one class; splitting a class across files would make it harder to follow. Shader code stays in TypeScript strings rather than `.glsl` files, because the headless sims in `sim/` load the terrain code and can't import raw shader files the way the browser build can.
