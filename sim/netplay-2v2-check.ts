// End-to-end check of an online 2v2: starts the game server, and three headless players fill a room through the
// lobby (the host, one with the host, one against), with a computer player in the fourth place. They play in
// lockstep, each person's commands from a simple scripted player and the computer player run on every machine alike.
// Halfway, the host's ally leaves: the computer takes their base over, on every machine from the same tick. Checks
// that nobody drifts apart, and that the match's replay (takeover included) rebuilds the same game.
// Usage: npx tsx sim/netplay-2v2-check.ts [minutes]
import * as THREE from 'three';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { BUILDINGS, FACTIONS, UNITS, type BuildingType, type Team, type UnitType } from '../src/config';
import { Game } from '../src/game/game';
import type { Lockstep } from '../src/net/lockstep';
import { PROTOCOL_VERSION, type ClientMsg, type MatchInfo, type ServerMsg } from '../src/net/protocol';
import { Match } from '../src/net/replay';

const minutes = Number(process.argv[2] ?? 3);
const TICKS = minutes * 60 * 20;
const LEAVE_AT = Math.round(TICKS / 2);
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

// ---- Lobby: host a 2v2, two join (one each side), the host starts, all "reload" and resume ------

const [ada, bo, cy] = [new Conn(), new Conn(), new Conn()];
await Promise.all([ada, bo, cy].map((c) => c.open()));
ada.send({ t: 'host', name: 'Ada', size: 96, faction: 'atreides', mode: '2v2', difficulty: 'normal', version: PROTOCOL_VERSION });
const { code } = await ada.next('hosted');
bo.send({ t: 'list' });
const listed = (await bo.next('rooms')).rooms.find((r) => r.code === code);
check(listed?.mode === '2v2' && listed.open.with && listed.open.against, 'the 2v2 shows in the lobby with room on both sides');
bo.send({ t: 'join', code, name: 'Bo', faction: 'fremen', side: 'with', version: PROTOCOL_VERSION });
cy.send({ t: 'join', code, name: 'Cy', faction: 'corrino', side: 'against', version: PROTOCOL_VERSION });
// The host sees both arrive before starting.
for (;;) {
  const room = await ada.next('room');
  if (room.slots.filter(Boolean).length === 3) {
    check(room.slots[2]?.name === 'Bo' && room.slots[1]?.name === 'Cy' && room.slots[3] === null, 'Bo joins on the host\'s side, Cy against');
    break;
  }
}
ada.send({ t: 'start' });
const matches: MatchInfo[] = await Promise.all([ada, bo, cy].map(async (c) => (await c.next('match')).match));
const m0 = matches[0];
check(matches.every((m) => m.seed === m0.seed && m.ai?.join() === m0.ai?.join()) && matches.map((m) => m.team).join() === '0,2,1',
  'everyone gets the same match, in their own place', `teams ${matches.map((m) => m.team).join(', ')}; ai ${m0.ai?.map((d) => d ?? '-').join(', ')}`);
check(m0.ai?.[3] === 'normal' && m0.sides?.join() === '0,1,0,1', 'the computer takes the empty place, teams alternate sides');

for (const c of [ada, bo, cy]) c.ws.close();
const conns = [new Conn(), new Conn(), new Conn()];
await Promise.all(conns.map((c) => c.open()));
conns.forEach((c, i) => c.send({ t: 'resume', code: matches[i].code, token: matches[i].token }));
await Promise.all(conns.map((c) => c.next('go')));
check(true, 'all three resume and get the go');

// ---- The match --------------------------------------------------------------------

/** Plays one team by sending commands, deciding from its own copy of the game. */
function scripted(g: Game, ls: Lockstep, team: Team): () => void {
  const f = FACTIONS[g.teams[team].faction];
  const plan: BuildingType[] = f.camps ? ['barracks'] : ['refinery', 'barracks'];
  const army: UnitType[] = f.camps ? ['warrior'] : g.teams[team].faction === 'corrino' ? ['trooper'] : ['infantry'];
  return () => {
    const t = g.ticks;
    const ts = g.teams[team];
    if (t % 10 !== 0 || !ts.human) return;
    const hub = g.buildings.find((b) => b.team === team && b.type === f.hub);
    if (hub && ts.building?.ready) {
      let best: { cx: number; cz: number } | null = null;
      for (let r = 2; r < 10 && !best; r++) {
        for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r && !best; dx++) {
          if (g.canPlace(ts.building.type, team, hub.cx + dx, hub.cz + dz)) best = { cx: hub.cx + dx, cz: hub.cz + dz };
        }
      }
      if (best) ls.issue({ c: 'place', ...best });
    } else if (!ts.building) {
      const next = plan.find((p) => g.count(team, p) < 1);
      if (next && g.canBuild(team, next) && ts.credits >= BUILDINGS[next].cost) ls.issue({ c: 'build', type: next });
    }
    const unit = army[0];
    if (g.canTrain(team, unit) && ts.credits > UNITS[unit].cost + 300) ls.issue({ c: 'train', type: unit });
    if (t % 800 === 400) {
      const foe = g.buildings.find((b) => g.hostile(b.team, team));
      const units = g.units.filter((u) => u.team === team && u.def.weapon && !u.carrier).map((u) => u.id);
      if (foe && units.length) ls.issue({ c: 'go', units, x: foe.x, z: foe.z, target: null, attack: true });
    }
  };
}

const people = matches.map((m) => m.team);
const sides = matches.map((m, i) => {
  const g = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), m.size, m.seed, m.factions, m.sides);
  g.localTeam = m.team;
  const match = new Match(g, m.ai!, m.team, conns[i], people.filter((t) => t !== m.team));
  const ls = match.lockstep;
  let takeoverAt = -1;
  conns[i].onGame = (msg) => {
    if (msg.t === 'cmds') ls.receive(msg.team, msg.tick, msg.cmds);
    else if (msg.t === 'hash') ls.receiveHash(msg.team, msg.tick, msg.hash);
    else if (msg.t === 'left') {
      takeoverAt = ls.drop(msg.team, msg.tick);
      match.takeOver(msg.team, m.takeover ?? 'normal', takeoverAt);
    }
  };
  let desync = -1;
  ls.onDesync = (tick) => (desync = tick);
  const ai = ls.onTick;
  const bot = scripted(g, ls, m.team);
  ls.onTick = () => {
    ai();
    bot();
  };
  return { g, ls, match, gone: false, get desync() {
    return desync;
  }, get takeoverAt() {
    return takeoverAt;
  } };
});

const start = Date.now();
while (sides.some((s) => !s.gone && s.g.ticks < TICKS && s.g.winner === null)) {
  let progressed = false;
  for (const [i, s] of sides.entries()) {
    if (s.gone) continue;
    // Bo (the host's ally) leaves halfway.
    if (i === 1 && s.g.ticks >= LEAVE_AT) {
      conns[1].send({ t: 'leave' });
      s.gone = true;
      continue;
    }
    for (let n = 0; n < 50 && s.g.ticks < TICKS && s.g.winner === null && s.ls.step(); n++) progressed = true;
  }
  await new Promise((res) => setTimeout(res, progressed ? 0 : 1));
}
await new Promise((res) => setTimeout(res, 200));
const [a, , c] = sides;
const secs = (Date.now() - start) / 1000;
check(a.desync < 0 && c.desync < 0, 'no desync between the players still in', `${a.g.ticks} ticks in ${secs.toFixed(1)} s`);
check(a.g.ticks === c.g.ticks && a.g.hash() === c.g.hash(), 'their copies end in the same state', `${a.g.units.length} units`);
check(a.takeoverAt > 0 && a.takeoverAt === c.takeoverAt && !a.g.teams[2].human, 'the computer took Bo\'s base over on both machines from the same tick', `tick ${a.takeoverAt}`);
check(a.ls.record.some((r) => r.team === 2 && r.tick < a.takeoverAt) && a.ls.record.some((r) => r.team === 1), 'commands from all three people went through', `${a.ls.record.length} commands`);
check(a.g.units.some((u) => u.team === 3) || a.g.teams[3].stats.unitsBuilt > 0, 'the computer player in the fourth place plays');

// The replay: a fresh game played back from the recording (takeover included) ends in the same state.
const rec = a.match.replay(m0.names);
const r = new Game(new THREE.Scene(), new THREE.PerspectiveCamera(), rec.size, rec.seed, rec.factions, rec.sides);
const playback = Match.playback(r, rec);
while (r.ticks < a.g.ticks) playback.step();
check(r.hash() === a.g.hash(), 'the replay, takeover and all, rebuilds the same game');

for (const conn of conns) conn.ws.close();
server.kill();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
