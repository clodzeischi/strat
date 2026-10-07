# Multiplayer

How online play works, what it relies on, and what's left to do.

## The model: deterministic lockstep

This is how StarCraft, Age of Empires and most RTS games do it. Players never send each other unit positions. They send **commands** ("these six units attack-move to x, z"), and every browser runs the full simulation itself. If both start from the same map seed and apply the same commands at the same ticks, both games stay identical without ever comparing positions.

This is a good fit for an RTS:
- **Little traffic.** A 200-unit battle costs the same bandwidth as a 5-unit one: about 20 small messages a second per player.
- **A tiny server.** The server only pairs players and relays commands, so it runs no game logic.
- **Replays come almost free.** A replay is the seed plus the command log.

The cost is that the simulation must be **exactly** deterministic. If one machine computes a single number differently, the two games drift apart (a *desync*) and never recover.

## How the code does it

| Piece | Where | What it does |
|---|---|---|
| Fixed tick | `net/lockstep.ts`, `TICK` | The simulation steps 20 times a second whatever the frame rate. Frames draw units between their last two tick positions (`Unit.interpolate`, `Game.frame`). |
| Seeded randomness | `game/rng.ts`, `Game.random` | All game logic draws random numbers from the game's own generator, seeded from the map seed. `Math.random` is only for visuals (sparks, smoke). |
| Exact maths | `game/hypot.ts` | Simulation code uses `Math.sqrt` instead of `Math.hypot`, because browsers may round `hypot` differently. |
| Commands | `game/commands.ts` | Clicks and keys become plain-data commands (`go`, `train`, `place`, ...). The game applies them by unit id. Input never touches units directly. |
| Scheduling | `Lockstep.step` | Online, a command runs `NET_DELAY` (4) ticks after it's given, about 0.2 s. Each tick, each player sends its batch for 4 ticks ahead, even when it's empty. A tick only runs once the other player's batch for it has arrived. |
| Desync check | `Game.hash`, `HASH_EVERY` | Every second both players send a checksum of the game state. A mismatch shows a message and logs the tick to the console. |
| Server | `server/server.ts` | Serves `dist/` and a WebSocket at `/ws`. It runs the lobby (host, list, join), gives both players the same seed, and relays commands and checksums. |

### A match, step by step

1. Both players open the Multiplayer page, and the page connects to `/ws`.
2. One hosts and the other joins. The server picks a seed and sends each player a `match` with its team and a token.
3. Both pages reload into the match, so the game is built fresh from the agreed seed. They reconnect with their tokens (`resume`).
4. When both are back, the server sends `go` and both start ticking.
5. If a player leaves, closes the tab or loses the connection, the other is told and wins.

## Rules for game code from now on

Anything that changes game state must be deterministic:
- **Never use `Math.random()` in game logic.** Use `game.random()` instead.
- **Never use `Math.hypot`** in `game/`, `entities/` or `map/`. Use `hypot` from `game/hypot.ts`.
- **No frame time, `performance.now()` or `Date.now()` in game logic.** Use `game.time` or `game.ticks`.
- **No camera or screen state in game logic.** Selection, the camera and hover live in the UI only.
- **Player actions go through a command.** To add a new action, add a `Command` variant, apply it in `applyCommand`, and send it from the UI with `input.issue(...)`. Don't call game methods from `input.ts` or `sidebar.ts`.
- **Messages for the player** go through `game.notifyTeam(team, text)`, which only shows them on that player's screen.
- **After changing simulation code**, run `npx tsx sim/determinism.ts` and `npx tsx sim/netplay-check.ts`. If you change messages or the simulation in a way that would split two builds apart, bump `PROTOCOL_VERSION`.

## Known limits and next steps

- **Different browsers might desync.** Chrome, Edge and Firefox share the same maths library for `sin`, `cos` and `atan2`, but Safari may differ in the last digit. The checksum catches it if it happens. The fix would be our own trig functions in the simulation.
- **No reconnect.** A dropped connection ends the match. Resuming needs the server to keep the command log and the rejoining page to replay it, which the replay code already makes possible.
- **No fog of war,** so a modified client could see everything (true of lockstep generally until there's fog). That's fine between friends.
- **Fixed input delay** of 4 ticks (0.2 s). Fine on a home network or a VPS in the same country. It could adapt to the measured round trip.
- **1v1 only.** The lockstep code handles any number of teams, but the server and lobby pair two players.
- **Against the computer online** (co-op or 2v2 with AI) would work: the AI is deterministic, so every browser can run it.
- **Replays:** `lockstep.record` already holds every command. Saving it and adding a viewer is the next easy win.
- **Public hosting (VPS):** put the server behind HTTPS (Caddy or nginx), and the page will use `wss://` automatically. Add a game password if strangers can reach the server.
