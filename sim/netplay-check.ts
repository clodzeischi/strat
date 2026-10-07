// End-to-end check of online play: starts the game server, connects two headless players to it, pairs them through
// the lobby, and plays a match in lockstep, each side's commands coming from a simple scripted player that decides
// from its own copy of the game (as a person at the keyboard would). Checks that the two copies never drift apart
// (the checksums both sides exchange), and that replaying one side's command log rebuilds the same game.
// Usage: npx tsx sim/netplay-check.ts [minutes]
import * as THREE from 'three';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { BUILDINGS, UNITS, type BuildingType, type Team, type UnitType } from '../src/config';
import { Game } from '../src/game/game';
import { Lockstep } from '../src/net/lockstep';
import { PROTOCOL_VERSION, type ClientMsg, type MatchInfo, type ServerMsg } from '../src/net/protocol';

const minutes = Number(process.argv[2] ?? 4);
const TICKS = minutes * 60 * 20;
const PORT = 8000 + Math.floor(Math.random() * 900);

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const server = spawn('npx', ['tsx', 'server/server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise<void>((res) => server.stdout!.on('data', (d) => String(d).includes('server on port') && res()));

/** A connection that queues incoming messages, so a test can wait for a given kind. */
class Conn {
  ws: WebSocket;
  inbox: ServerMsg[] = [];
  waiters: (() => void)[] = [];
  onGame: ((m: ServerMsg) => void) | null = null;
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      if (this.onGame && (m.t === 'cmds' || m.t === 'hash' || m.t === 'left')) this.onGame(m);
      else this.inbox.push(m);
      for (const w of this.waiters.splice(0)) w();
    });
  }
  open(): Promise<void> {
    return new Promise((res) => this.ws.once('open', () => res()));
  }
  send(m: ClientMsg): void {
    this.ws.send(JSON.stringify(m));
  }
  async next<T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> {
    for (;;) {
      const i = this.inbox.findIndex((m) => m.t === t);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise<void>((res) => this.waiters.push(res));
    }
  }
}

// ---- Lobby: host, list, join, then both "reload" and resume ---------------------------

const host = new Conn();
const guest = new Conn();
await Promise.all([host.open(), guest.open()]);
host.send({ t: 'host', name: 'Ada', size: 64, version: PROTOCOL_VERSION });
const { code } = await host.next('hosted');
guest.send({ t: 'list' });
const { rooms } = await guest.next('rooms');
check(rooms.some((r) => r.code === code && r.host === 'Ada'), 'the hosted game shows in the lobby', `${rooms.length} open`);
guest.send({ t: 'join', code, name: 'Bo', version: PROTOCOL_VERSION });
const matches: MatchInfo[] = [(await host.next('match')).match, (await guest.next('match')).match];
check(matches[0].seed === matches[1].seed && matches[0].team === 0 && matches[1].team === 1, 'both get the same map and different sides', `seed ${matches[0].seed}`);

// The pages reload: new connections, resumed with the tokens.
host.ws.close();
guest.ws.close();
const conns = [new Conn(), new Conn()];
await Promise.all(conns.map((c) => c.open()));
conns.forEach((c, i) => c.send({ t: 'resume', code: matches[i].code, token: matches[i].token }));
await Promise.all(conns.map((c) => c.next('go')));
check(true, 'both resume and get the go');

// ---- The match --------------------------------------------------------------------

/** Plays one side by sending commands, deciding from its own copy of the game. */
function scripted(g: Game, ls: Lockstep, team: Team): () => void {
  const plan: BuildingType[] = ['refinery', 'barracks', 'factory', 'refinery', 'bunker'];
  const army: UnitType[] = ['infantry', 'trike', 'infantry', 'tank', 'rocket'];
  let k = 0;
  return () => {
    const t = g.ticks;
    const ts = g.teams[team];
    if (t % 10 !== 0) return;
    const yard = g.buildings.find((b) => b.team === team && b.type === 'conyard');
    if (yard && ts.building?.ready) {
      // Nearest legal spot to the yard.
      let best: { cx: number; cz: number } | null = null;
      for (let r = 2; r < 10 && !best; r++) {
        for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r && !best; dx++) {
          if (g.canPlace(ts.building.type, team, yard.cx + dx, yard.cz + dz)) best = { cx: yard.cx + dx, cz: yard.cz + dz };
        }
      }
      if (best) ls.issue({ c: 'place', ...best });
    } else if (!ts.building) {
      const next = plan.find((p, i) => g.count(team, p) < plan.slice(0, i + 1).filter((q) => q === p).length);
      if (next && g.canBuild(team, next) && ts.credits >= BUILDINGS[next].cost) ls.issue({ c: 'build', type: next });
    }
    const unit = army[k % army.length];
    if (g.canTrain(team, unit) && ts.credits > UNITS[unit].cost + 300) {
      ls.issue({ c: 'train', type: unit });
      k++;
    }
    // Every 40 s, everyone with a gun attack-moves on the enemy yard; now and then a stop, to mix things up.
    if (t % 800 === 400) {
      const foe = g.buildings.find((b) => b.team !== team && b.type === 'conyard') ?? g.buildings.find((b) => b.team !== team);
      const units = g.units.filter((u) => u.team === team && u.def.weapon && !u.carrier).map((u) => u.id);
      if (foe && units.length) ls.issue({ c: 'go', units, x: foe.x, z: foe.z, target: null, attack: true });
    }
    if (t % 800 === 600) {
      const units = g.units.filter((u) => u.team === team && u.type === 'infantry').slice(0, 2).map((u) => u.id);
      if (units.length) ls.issue({ c: 'stop', units });
    }
  };
}

const sides = matches.map((m, i) => {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), m.size, m.seed);
  g.localTeam = m.team;
  const ls = new Lockstep(g, m.team, conns[i]);
  conns[i].onGame = (msg) => {
    if (msg.t === 'cmds') ls.receive(msg.team, msg.tick, msg.cmds);
    else if (msg.t === 'hash') ls.receiveHash(msg.tick, msg.hash);
  };
  let desync = -1;
  ls.onDesync = (tick) => (desync = tick);
  const bot = scripted(g, ls, m.team);
  ls.onTick = bot;
  return { g, ls, get desync() {
    return desync;
  } };
});

const start = Date.now();
let stalls = 0;
// Each side runs whatever ticks it can, then lets the network deliver.
while (sides.some((s) => s.g.ticks < TICKS && s.g.winner === null)) {
  let progressed = false;
  for (const s of sides) {
    for (let n = 0; n < 50 && s.g.ticks < TICKS && s.g.winner === null && s.ls.step(); n++) progressed = true;
  }
  if (!progressed) stalls++;
  await new Promise((res) => setTimeout(res, progressed ? 0 : 1));
}
// Let the last checksums arrive.
await new Promise((res) => setTimeout(res, 200));
const [a, b] = sides;
const secs = (Date.now() - start) / 1000;
const ticks = Math.min(a.g.ticks, b.g.ticks);
check(a.desync < 0 && b.desync < 0, 'no desync reported by either side', `${ticks} ticks (${Math.round(ticks / 20)} s of game) in ${secs.toFixed(1)} s`);
check(a.g.ticks === b.g.ticks && a.g.hash() === b.g.hash(), 'both copies end in the same state', `${a.g.units.length} units, credits ${Math.round(a.g.teams[0].credits)} / ${Math.round(a.g.teams[1].credits)}`);
const cmds = a.ls.record.length;
check(cmds > 10 && a.ls.record.some((r) => r.team === 0) && a.ls.record.some((r) => r.team === 1), 'commands from both sides went through', `${cmds} commands`);
const st = a.g.teams.map((t) => t.stats);
check(minutes < 3 || st.every((x) => x.structuresBuilt >= 2 && x.unitsBuilt >= 3), 'both sides built a base and an army', `structures ${st.map((x) => x.structuresBuilt).join('/')}, units ${st.map((x) => x.unitsBuilt).join('/')}, ${st[0].unitsKilled + st[1].unitsKilled} kills`);

// Replay: a fresh game fed the recorded commands ends in the same state.
const r = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), matches[0].size, matches[0].seed);
const replay = new Lockstep(r, 0);
replay.play(a.ls.record);
while (r.ticks < a.g.ticks) replay.step();
check(r.hash() === a.g.hash(), 'replaying the command log rebuilds the same game');

// Leaving: the other side is told.
const left = new Promise<ServerMsg>((res) => (conns[1].onGame = res));
conns[0].send({ t: 'leave' });
const msg = await Promise.race([left, new Promise<null>((res) => setTimeout(() => res(null), 2000))]);
check(msg?.t === 'left' && msg.team === 0, 'when one player leaves, the other hears about it');

for (const c of conns) c.ws.close();
server.kill();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
