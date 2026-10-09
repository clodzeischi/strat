// Strat game server: serves the built game (dist/) and relays online matches over a WebSocket at /ws.
//
// It's a lobby plus a relay. It pairs two players, hands both the same map seed, then passes each player's
// commands and checksums to the other. It never runs the game itself (each browser runs the full simulation, in
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
import { FACTION_LIST, type Faction, type MapSize, type Team } from '../src/config';
import { PROTOCOL_VERSION, type ClientMsg, type MatchInfo, type RoomInfo, type ServerMsg } from '../src/net/protocol';

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

interface Room {
  code: string;
  size: MapSize;
  names: [string, string];
  factions: [Faction, Faction];
  state: 'open' | 'matched' | 'playing';
  seed: number;
  tokens: [string, string];
  /** Connected players by team (the host alone while open; empty while both pages reload). */
  players: [Client | null, Client | null];
  timer: NodeJS.Timeout | null;
}

const clients = new Set<Client>();
const rooms = new Map<string, Room>();

function send(c: Client | null, msg: ServerMsg): void {
  if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

function roomList(): RoomInfo[] {
  return [...rooms.values()].filter((r) => r.state === 'open').map((r) => ({ code: r.code, host: r.names[0], size: r.size, faction: r.factions[0] }));
}

function broadcastRooms(): void {
  const msg: ServerMsg = { t: 'rooms', rooms: roomList() };
  for (const c of clients) if (c.lobby) send(c, msg);
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

function closeRoom(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
  rooms.delete(room.code);
  for (const p of room.players) if (p) {
    p.room = null;
    p.team = null;
  }
  broadcastRooms();
}

/** A player is gone for good: the other one is told, and the room closes. */
function leave(c: Client): void {
  const room = c.room;
  if (!room) return;
  if (room.state !== 'open' && c.team !== null) send(room.players[(1 - c.team) as Team], { t: 'left', team: c.team });
  closeRoom(room);
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
      const room: Room = {
        code: newCode(), size: MAP_SIZES.includes(msg.size) ? msg.size : 64, names: [cleanName(msg.name), ''],
        factions: [cleanFaction(msg.faction), 'atreides'], state: 'open',
        seed: 0, tokens: ['', ''], players: [c, null], timer: null,
      };
      rooms.set(room.code, room);
      c.room = room;
      c.team = 0;
      send(c, { t: 'hosted', code: room.code });
      broadcastRooms();
      return;
    }
    case 'cancel':
      if (c.room?.state === 'open') closeRoom(c.room);
      return;
    case 'join': {
      if (msg.version !== PROTOCOL_VERSION) return send(c, { t: 'error', text: 'This page is out of date. Reload it to get the server\'s version of the game.' });
      const room = rooms.get(String(msg.code).toUpperCase());
      if (!room || room.state !== 'open') return send(c, { t: 'error', text: 'That game is no longer open.' });
      if (room.players[0] === c) return send(c, { t: 'error', text: 'That\'s your own game. Wait for someone else to join it.' });
      if (c.room) leave(c);
      room.names[1] = cleanName(msg.name);
      room.factions[1] = cleanFaction(msg.faction);
      room.state = 'matched';
      room.seed = randomInt(1_000_000);
      room.tokens = [randomBytes(12).toString('hex'), randomBytes(12).toString('hex')];
      const host = room.players[0]!;
      // Both pages reload into the match and come back with their token (see 'resume').
      room.players = [null, null];
      for (const [p, team] of [[host, 0], [c, 1]] as [Client, Team][]) {
        p.room = null;
        p.team = null;
        const match: MatchInfo = { code: room.code, token: room.tokens[team], team, seed: room.seed, size: room.size, names: room.names, factions: room.factions };
        send(p, { t: 'match', match });
      }
      room.timer = setTimeout(() => {
        for (const p of room.players) send(p, { t: 'error', text: 'The other player never arrived.' });
        closeRoom(room);
      }, RESUME_TIMEOUT);
      broadcastRooms();
      log(`${room.code}: ${room.names[0]} vs ${room.names[1]}, ${room.size} map, seed ${room.seed}`);
      return;
    }
    case 'resume': {
      const room = rooms.get(msg.code);
      const team = room ? room.tokens.indexOf(msg.token) : -1;
      if (!room || team < 0 || room.state !== 'matched') return send(c, { t: 'error', text: 'That match is over.' });
      room.players[team] = c;
      c.room = room;
      c.team = team as Team;
      if (room.players[0] && room.players[1]) {
        if (room.timer) clearTimeout(room.timer);
        room.timer = null;
        room.state = 'playing';
        for (const p of room.players) send(p, { t: 'go' });
      }
      return;
    }
    case 'cmds':
    case 'hash': {
      const room = c.room;
      if (!room || room.state !== 'playing' || c.team === null) return;
      const other = room.players[(1 - c.team) as Team];
      if (msg.t === 'cmds') send(other, { t: 'cmds', team: c.team, tick: msg.tick, cmds: msg.cmds });
      else send(other, { t: 'hash', team: c.team, tick: msg.tick, hash: msg.hash });
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
    else if (c.room && c.team !== null) c.room.players[c.team] = null;
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
