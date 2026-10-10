# Code layout

`src/main.ts` is the entry point: it creates the renderer, scene, game, camera and screens, starts single-player and online matches, and runs the frame loop (the simulation ticks at a fixed 20 per second; frames draw in between).

| Folder | What lives there |
|---|---|
| `config/` | Game data. `types.ts` (shared types), `rules.ts` (tile size, teams, upgrade effects, economy), one table each for `units.ts`, `buildings.ts`, `upgrades.ts`, `factions.ts` (what each faction builds, trains and researches, its command card layout, starting units, shields), and `audio.ts` (the announcer's lines, the units' acknowledgements and the sound effects; the files are in `src/public/audio/`). |
| `game/` | Game logic: `game.ts` (the match: entities, production, combat, projectiles), `commands.ts` (everything a player can order, as data, and how the game applies it), `ai.ts` (the AI, tuned per difficulty by a profile), `brutal.ts` (Brutal: a subclass of the AI with Carryall operations, retreats and wave marching) with `micro.ts` (kiting and focus fire), `pathfinding.ts`, `heroes.ts`, `rng.ts` (seeded random numbers and state checksums), `hypot.ts`, `vision.ts` (fog of war on the tile grid), `intel.ts` (what an AI knows of the enemy: only what its side has seen). |
| `net/` | Running the simulation and online play: `lockstep.ts` (fixed-rate ticks, command scheduling, replays, desync checks), `protocol.ts` (messages between browser and server), `client.ts` (the WebSocket). The server itself is `server/server.ts`, outside `src/`. |
| `entities/` | Things on the map: `entity.ts` (base class, health bar, selection ring), `building.ts`, `unit.ts` (movement, combat, harvesting, repair, parachute falls, vehicle tilt), `carryall.ts` (the aircraft: flight, pickups, drops, harvester ferrying), `distance.ts`. |
| `map/` | The map and its generator: `game-map.ts` (`GameMap`: tiles, levels, ramps, generation, the smooth ground surface), `tiles.ts` (tile and ramp kinds), `noise.ts`. |
| `models/` | 3D models, one file per model: `units/` (with each unit's upgrade parts), `buildings/` (with each building's level-2 parts), shared `parts.ts`, `parachute.ts`, and `index.ts`, which the game calls. |
| `materials/` | Colors and materials: model `palette.ts`, the shared `lambert.ts` cache, `ground.ts` (ground colors), `overlays.ts` (health bars, selection rings), `upgrade-fx.ts` (lasers, nitro flames). |
| `shaders/` | Shader patches: `ground.ts` (sand, rock, outcrops, cliff walls, spice and its shimmer), `instance-alpha.ts` and `dithered-shadow.ts` (particles). |
| `render/` | Drawing: `terrain.ts` (ground mesh), `camera.ts`, `shadows.ts`, `rally-lines.ts` (the selected buildings' rally points), `effects/` (one file per effect pool, plus `effects.ts`). |
| `ui/` | Player-facing: `input.ts` (mouse and keys, turned into commands; the selection and its subgroups), `command-card.ts` (the 4×3 grid of tabs and buttons; its Command tab follows the selection's lead subgroup) with `keys.ts` (hotkeys by key position) and `icons.ts`, `hud.ts` (credits, minimap, messages), `audio.ts` (loading and mixing audio) with `voice.ts` (the announcer and unit voice lines), `sounds.ts` (shots, blasts and clicks) and `music.ts` (the title music), `menu.ts`, `placement.ts` (building placement grid). |

Folders that are split into several files have an `index.ts`, so the rest of the code imports `../config`, `../map`, `../entities` or `../models` without caring which file something is in.

Kept in one file on purpose: `GameMap`, `Unit` and `Game` are each one class; splitting a class across files would make it harder to follow. Shader code stays in TypeScript strings rather than `.glsl` files, because the headless sims in `sim/` load the terrain code and can't import raw shader files the way the browser build can.
