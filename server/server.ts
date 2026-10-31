// Strat game server: serves the built game (dist/) and relays online matches over a WebSocket at /ws.
//
// It's a lobby plus a relay. It fills a room (two players, or four in a 2v2 with computer players in the empty
// places), hands everyone the same map seed, then passes each player's commands and checksums to the others. It never runs the game itself (each browser runs the full simulation, in
// lockstep), so it needs next to no CPU or memory: a Raspberry Pi is plenty.
//
// Usage: npm run build && npm run serve        (PORT=8080 by default)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { FACTION_LIST, type Faction, type MapSize, type Side, type Team } from '../src/config';
import type { Difficulty } from '../src/game/game';
import { PROTOCOL_VERSION, type ClientMsg, type MatchInfo, type RoomInfo, type RoomMode, type ServerMsg, type SlotInfo } from '../src/net/protocol';

const PORT = Number(process.env.PORT ?? 8080);
const DIST = resolve(process.env.DIST ?? fileURLToPath(new URL('../dist', import.meta.url)));
/** After pairing, both pages reload; a match neither side comes back to within this long is dropped. */
const RESUME_TIMEOUT = 60_000;
const MAP_SIZES: MapSize[] = [64, 96, 128];

interface Client {
  ws: WebSocket;
  /** Wants room list updates (on the multiplayer page). */
  lobby: boolean;
  /** The room it hosts or plays in. */
  room: Room | null;
  team: Team | null;
}

/** A place in a room: a team in the match. */
interface Slot {
  /** The person's connection (null for a computer player, a free place, or while the page reloads). */
  client: Client | null;
  human: boolean;
  name: string;
  faction: Faction;
  token: string;
  /** The last tick this player sent commands for. */
  lastTick: number;
  /** Left for good. */
  gone: boolean;
}

interface Room {
  code: string;
  size: MapSize;
  mode: RoomMode;
  /** Who plays the empty places of a 2v2, and takes over for a person who leaves it. */
  difficulty: Difficulty;
  state: 'open' | 'matched' | 'playing';
  seed: number;
  /** By team: 2 for a 1v1, 4 for a 2v2 (teams alternate sides: 0 and 2 against 1 and 3). */
  slots: Slot[];
  timer: NodeJS.Timeout | null;
}

const clients = new Set<Client>();
const rooms = new Map<string, Room>();

function send(c: Client | null, msg: ServerMsg): void {
  if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

const emptySlot = (): Slot => ({ client: null, human: false, name: '', faction: 'atreides', token: '', lastTick: -1, gone: false });
const sideOf = (team: number): Side => (team % 2) as Side;

/** The free place a joiner takes: in a 2v2, on the host's side (team 2) or against it (1, then 3). */
function freeSlot(room: Room, side: 'with' | 'against'): number {
  const order = room.mode === '1v1' ? [1] : side === 'with' ? [2] : [1, 3];
  return order.find((t) => !room.slots[t].human) ?? -1;
}

function roomList(): RoomInfo[] {
  return [...rooms.values()].filter((r) => r.state === 'open').map((r) => ({
    code: r.code, host: r.slots[0].name, size: r.size, faction: r.slots[0].faction, mode: r.mode,
    open: { with: freeSlot(r, 'with') >= 0, against: freeSlot(r, 'against') >= 0 },
  }));
}

function broadcastRooms(): void {
  const msg: ServerMsg = { t: 'rooms', rooms: roomList() };
  for (const c of clients) if (c.lobby) send(c, msg);
}

/** Tells everyone in an open room who's in it so far. */
function sendRoom(room: Room): void {
  const slots: (SlotInfo | null)[] = room.slots.map((s, t) => (s.human ? { name: s.name, faction: s.faction, human: true, side: sideOf(t) } : null));
  room.slots.forEach((s, t) => send(s.client, { t: 'room', code: room.code, mode: room.mode, slots, you: t as Team, host: t === 0 }));
}

/** Four letters, without ones that are easy to mix up. */
function newCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code: string;
  do code = Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) : '';
  return s || 'Player';
}

function cleanFaction(v: unknown): Faction {
  return FACTION_LIST.includes(v as Faction) ? (v as Faction) : 'atreides';
}

function cleanDifficulty(v: unknown): Difficulty {
  return v === 'medium' || v === 'hard' ? v : 'easy';
}

const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function closeRoom(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
  rooms.delete(room.code);
  for (const s of room.slots) if (s.client) {
    s.client.room = null;
    s.client.team = null;
  }
  broadcastRooms();
}

/**
 * Seats computer players in the empty places and hands every person the match. Their pages reload into it and
 * come back with their token (see 'resume').
 */
function startMatch(room: Room): void {
  room.state = 'matched';
  room.seed = randomInt(1_000_000);
  for (const s of room.slots) {
    if (s.human) s.token = randomBytes(12).toString('hex');
    else {
      s.name = `${DIFFICULTY_NAMES[room.difficulty]} AI`;
      s.faction = FACTION_LIST[randomInt(FACTION_LIST.length)];
    }
  }
  const names = room.slots.map((s) => s.name);
  const factions = room.slots.map((s) => s.faction);
  const sides = room.slots.map((_, t) => sideOf(t));
  const ai = room.slots.map((s) => (s.human ? null : room.difficulty));
  room.slots.forEach((s, t) => {
    if (!s.human) return;
    const p = s.client;
    s.client = null;
    if (p) {
      p.room = null;
      p.team = null;
    }
    const match: MatchInfo = { code: room.code, token: s.token, team: t as Team, seed: room.seed, size: room.size, names, factions, sides, ai, takeover: room.difficulty };
    send(p, { t: 'match', match });
  });
  room.timer = setTimeout(() => {
    for (const s of room.slots) send(s.client, { t: 'error', text: 'Not everyone arrived.' });
    closeRoom(room);
  }, RESUME_TIMEOUT);
  broadcastRooms();
  log(`${room.code}: ${room.slots.map((s) => s.name).join(' vs ')} (${room.mode}), ${room.size} map, seed ${room.seed}`);
}

/**
 * A player is gone for good. In an open room, the host leaving closes it and anyone else frees their place. In a
 * match, the others are told from which tick on they're gone; the room closes once no person is left.
 */
function leave(c: Client): void {
  const room = c.room;
  const team = c.team;
  c.room = null;
  c.team = null;
  if (!room || team === null) return;
  const slot = room.slots[team];
  if (room.state === 'open') {
    if (team === 0) {
      for (const s of room.slots) if (s.client && s.client !== c) send(s.client, { t: 'error', text: 'The host closed the game.' });
      closeRoom(room);
      return;
    }
    room.slots[team] = emptySlot();
    sendRoom(room);
    broadcastRooms();
    return;
  }
  slot.gone = true;
  slot.client = null;
  for (const s of room.slots) send(s.client, { t: 'left', team, tick: slot.lastTick });
  if (room.slots.every((s) => !s.human || s.gone)) closeRoom(room);
}

function onMessage(c: Client, msg: ClientMsg): void {
  switch (msg.t) {
    case 'list':
      c.lobby = true;
      send(c, { t: 'rooms', rooms: roomList() });
      return;
    case 'host': {
      if (msg.version !== PROTOCOL_VERSION) return send(c, { t: 'error', text: 'This page is out of date. Reload it to get the server\'s version of the game.' });
      if (c.room) leave(c);
      const size = MAP_SIZES.includes(msg.size) ? msg.size : 64;
      // A 2v2 needs four spawn spots: not on Small.
      const mode: RoomMode = msg.mode === '2v2' && size >= 96 ? '2v2' : '1v1';
      const room: Room = {
        code: newCode(), size, mode, difficulty: cleanDifficulty(msg.difficulty), state: 'open', seed: 0,
        slots: Array.from({ length: mode === '2v2' ? 4 : 2 }, emptySlot), timer: null,
      };
      room.slots[0] = { ...emptySlot(), client: c, human: true, name: cleanName(msg.name), faction: cleanFaction(msg.faction) };
      rooms.set(room.code, room);
      c.room = room;
      c.team = 0;
      send(c, { t: 'hosted', code: room.code });
      sendRoom(room);
      broadcastRooms();
      return;
    }
    case 'cancel':
      if (c.room?.state === 'open') leave(c);
      return;
    case 'join': {
      if (msg.version !== PROTOCOL_VERSION) return send(c, { t: 'error', text: 'This page is out of date. Reload it to get the server\'s version of the game.' });
      const room = rooms.get(String(msg.code).toUpperCase());
      if (!room || room.state !== 'open') return send(c, { t: 'error', text: 'That game is no longer open.' });
      if (room.slots.some((s) => s.client === c)) return send(c, { t: 'error', text: 'You\'re already in that game.' });
      const team = freeSlot(room, msg.side === 'with' ? 'with' : 'against');
      if (team < 0) return send(c, { t: 'error', text: 'That side is full.' });
      if (c.room) leave(c);
      room.slots[team] = { ...emptySlot(), client: c, human: true, name: cleanName(msg.name), faction: cleanFaction(msg.faction) };
      c.room = room;
      c.team = team as Team;
      // A 1v1 starts as soon as someone joins; a 2v2 when the host says so, or once every place has a person.
      if (room.mode === '1v1' || room.slots.every((s) => s.human)) startMatch(room);
      else {
        sendRoom(room);
        broadcastRooms();
      }
      return;
    }
    case 'start': {
      const room = c.room;
      if (!room || room.state !== 'open' || c.team !== 0) return;
      if (room.slots.filter((s) => s.human).length < 2) return send(c, { t: 'error', text: 'Wait for at least one other player to join.' });
      startMatch(room);
      return;
    }
    case 'resume': {
      const room = rooms.get(msg.code);
      const team = room ? room.slots.findIndex((s) => s.human && s.token === msg.token) : -1;
      if (!room || team < 0 || room.state !== 'matched') return send(c, { t: 'error', text: 'That match is over.' });
      room.slots[team].client = c;
      c.room = room;
      c.team = team as Team;
      if (room.slots.every((s) => !s.human || s.client)) {
        if (room.timer) clearTimeout(room.timer);
        room.timer = null;
        room.state = 'playing';
        for (const s of room.slots) send(s.client, { t: 'go' });
      }
      return;
    }
    case 'cmds':
    case 'hash': {
      const room = c.room;
      if (!room || room.state !== 'playing' || c.team === null) return;
      const team = c.team;
      if (msg.t === 'cmds') room.slots[team].lastTick = Math.max(room.slots[team].lastTick, msg.tick);
      const out: ServerMsg = msg.t === 'cmds' ? { t: 'cmds', team, tick: msg.tick, cmds: msg.cmds } : { t: 'hash', team, tick: msg.tick, hash: msg.hash };
      room.slots.forEach((s, t) => {
        if (t !== team) send(s.client, out);
      });
      return;
    }
    case 'leave':
      leave(c);
      return;
  }
}

// ---- Static files -----------------------------------------------------------------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const http = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('No build found. Run "npm run build" first.');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, path: '/ws' });
wss.on('connection', (ws) => {
  const c: Client = { ws, lobby: false, room: null, team: null };
  clients.add(c);
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    onMessage(c, msg);
  });
  ws.on('close', () => {
    clients.delete(c);
    // A matched player's page closes its socket to reload into the match: that's not leaving.
    if (c.room && c.room.state !== 'matched') leave(c);
    else if (c.room && c.team !== null) c.room.slots[c.team].client = null;
  });
});

function log(text: string): void {
  console.log(`${new Date().toISOString().slice(11, 19)}  ${text}`);
}

http.listen(PORT, () => {
  const addresses = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a!.address);
  log(`Strat server on port ${PORT}, serving ${DIST}`);
  for (const a of ['localhost', ...addresses]) log(`  open http://${a}:${PORT}`);
});
