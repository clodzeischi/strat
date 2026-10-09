import * as THREE from 'three';
import type { AI } from './game/ai';
import { createAI } from './game/brutal';
import { RTSCamera } from './render/camera';
import { FACTION_LIST, MAP_SIZES, TILE, type Faction, type MapSize, type Team } from './config';
import { Game, type Difficulty } from './game/game';
import { Input } from './ui/input';
import { loadEnemy, loadFaction, loadMapSize, Menus, type EnemyChoice } from './ui/menu';
import { ViewShadows } from './render/shadows';
import { CommandCard } from './ui/command-card';
import { Hud } from './ui/hud';
import { Lockstep, TICK } from './net/lockstep';
import { NetClient } from './net/client';
import { PROTOCOL_VERSION, type MatchInfo, type ServerMsg } from './net/protocol';
import './style.css';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const view = document.getElementById('view')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8c99a);
const gameFog = new THREE.Fog(0xe8c99a, 120, 260);
const titleFog = new THREE.Fog(0xe8c99a, 35, 130); // closer haze for the low fly-over
scene.fog = titleFog;

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a48, 1.4));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// Restart and changing map size reload the page; the next game's settings ride along in session storage. So does
// an online match: the page reloads into it once the server has paired two players.
const AUTOSTART_KEY = 'strat.autostart';
const MATCH_KEY = 'strat.match';
interface Autostart { difficulty: Difficulty; size: MapSize; seed: number; faction: Faction; enemy: Faction }
function readAutostart(): Autostart | null {
  try {
    const raw = sessionStorage.getItem(AUTOSTART_KEY);
    sessionStorage.removeItem(AUTOSTART_KEY);
    const [difficulty, size, seed, faction, enemy] = (raw ?? '').split(':');
    const okDifficulty = difficulty === 'normal' || difficulty === 'hard' || difficulty === 'brutal';
    const okSize = (MAP_SIZES as readonly number[]).includes(Number(size));
    const okSeed = seed !== '' && Number.isInteger(Number(seed));
    const okFaction = FACTION_LIST.includes(faction as Faction) && FACTION_LIST.includes(enemy as Faction);
    return okDifficulty && okSize && okSeed && okFaction
      ? { difficulty, size: Number(size) as MapSize, seed: Number(seed), faction: faction as Faction, enemy: enemy as Faction }
      : null;
  } catch {
    return null;
  }
}
function readMatch(): MatchInfo | null {
  try {
    const raw = sessionStorage.getItem(MATCH_KEY);
    sessionStorage.removeItem(MATCH_KEY);
    return raw ? (JSON.parse(raw) as MatchInfo) : null;
  } catch {
    return null;
  }
}
const randomSeed = () => Math.floor(Math.random() * 1_000_000);
/** `?seed=123` in the address replays a map. */
function urlSeed(): number | null {
  const v = new URLSearchParams(location.search).get('seed');
  return v !== null && /^\d+$/.test(v) ? Number(v) : null;
}
const match = readMatch();
const autostart = match ? null : readAutostart();
const mapSize = match?.size ?? autostart?.size ?? loadMapSize();
// Every visit gets a new map; Restart keeps the seed so the same map comes back.
const mapSeed = match?.seed ?? autostart?.seed ?? urlSeed() ?? randomSeed();

// The player's faction and the computer opponent's ('random' is rolled once per page, so Restart keeps it).
const playerFaction = autostart?.faction ?? loadFaction();
const rollEnemy = (c: EnemyChoice): Faction => (c === 'random' ? FACTION_LIST[Math.floor(Math.random() * FACTION_LIST.length)] : c);
const enemyFaction = autostart?.enemy ?? rollEnemy(loadEnemy());
const factions: Faction[] = match?.factions ?? [playerFaction, enemyFaction];

const rts = new RTSCamera(mapSize * TILE);
const game = new Game(scene, rts.camera, mapSize, mapSeed, factions);
game.localTeam = match?.team ?? 0;
// `?reveal` lifts the fog of war on screen, offline only (for testing). The title fly-over shows the whole map.
const revealParam = !match && new URLSearchParams(location.search).has('reveal');
game.revealAll = true;
const ENEMY = (1 - game.localTeam) as Team;

// The sun's shadow map follows whatever the active camera is looking at.
const shadows = new ViewShadows(sun);

const input = new Input(game, rts, canvas, document.getElementById('selbox')!, document.getElementById('info')!);
const hud = new Hud(game, rts);
const card = new CommandCard(game, input, document.getElementById('command-card')!);
hud.onClick = (x, z, button) => input.minimapClick(x, z, button);
game.onMessage = (t) => hud.showMessage(t);
// Created when the game starts: the computer opponent (offline) and the lockstep that runs the simulation.
let ai: AI | null = null;
let lockstep: Lockstep | null = null;
if (import.meta.env.DEV) Object.assign(window, { game, input, rts, renderer, card });

// Start looking at the home base, nudged toward the middle of the map where the action will come from.
const home = game.buildings.find((b) => b.team === game.localTeam)!;
const toMid = new THREE.Vector2(game.map.worldSize() / 2 - home.x, game.map.worldSize() / 2 - home.z).normalize().multiplyScalar(8);
rts.lookAt(home.x + toMid.x, home.z + toMid.y);

// Cinematic camera for the title screen: drifts low over sand, rock and spice.
const titleCam = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
const world = game.map.worldSize();
let titleTime = Math.random() * 100;
function flightPoint(t: number): THREE.Vector3 {
  const x = world * (0.5 + 0.34 * Math.sin(t * 0.021));
  const z = world * (0.5 + 0.34 * Math.sin(t * 0.034 + 1.3));
  return new THREE.Vector3(x, game.map.surfaceAt(x, z), z);
}
let titleAlt = -1;
function updateTitleCam(dt: number): void {
  titleTime += dt;
  const p = flightPoint(titleTime);
  const ahead = flightPoint(titleTime + 14);
  // Terrain is stepped per tile, so ease altitude toward the highest ground just ahead.
  let ground = 0;
  for (let k = 0; k <= 4; k++) ground = Math.max(ground, flightPoint(titleTime + k * 2).y);
  const target = ground + 15;
  titleAlt = titleAlt < 0 ? target : titleAlt + (target - titleAlt) * Math.min(1, dt * 0.8);
  titleCam.position.set(p.x, titleAlt + Math.sin(titleTime * 0.3) * 0.6, p.z);
  titleCam.lookAt(ahead.x, titleAlt - 6, ahead.z);
}

function resize(): void {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h, false);
  rts.setAspect(w / h);
  titleCam.aspect = w / h;
  titleCam.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();

// ---- Screens and game flow -------------------------------------------------------

type Mode = 'title' | 'connecting' | 'playing' | 'paused' | 'offer' | 'ended';
let mode: Mode = 'title';
const fpsEl = document.getElementById('fps')!;
const netWaitEl = document.getElementById('netwait')!;
/** Online: the connection to the game server (also used by the multiplayer menu). */
let net: NetClient | null = null;
const online = match !== null;
const opponentName = match ? match.names[ENEMY] : null;

/** The opening build hint for the local player's faction. */
function firstSteps(): string {
  const f = game.teams[game.localTeam].faction;
  if (f === 'fremen') return 'Walk your Spice Crew onto a spice field and Set Up Camp (D). Then a Barracks for more crews and warriors.';
  return `Build a Refinery and a Barracks, then a ${f === 'corrino' ? 'Fab' : 'Factory'}.`;
}

function beginPlay(): void {
  mode = 'playing';
  game.revealAll = revealParam;
  menus.hideTitle();
  document.body.classList.remove('in-menu');
  scene.fog = gameFog;
  input.issue = (cmd) => lockstep?.issue(cmd);
  if (import.meta.env.DEV) Object.assign(window, { ai, lockstep });
}

function startGame(difficulty: Difficulty): void {
  game.difficulty = difficulty;
  ai = createAI(game, ENEMY, difficulty);
  lockstep = new Lockstep(game, game.localTeam);
  const opponent = ai;
  lockstep.onTick = () => opponent.update(TICK);
  beginPlay();
  hud.showMessage(`${firstSteps()} Destroy the red base.`);
}

/** Online: the page has reloaded into a match; reconnect, and start when both players are back. */
function startOnline(m: MatchInfo): void {
  mode = 'connecting';
  game.revealAll = false;
  menus.hideTitle();
  input.pausable = false;
  showNetWait('Connecting to the game server…');
  net = new NetClient();
  const client = net;
  client.onMessage = (msg) => onMatchMessage(msg);
  client.onClose = () => {
    if (mode === 'ended') return;
    endGame('Connection to the server lost');
  };
  client.connect().then(
    () => {
      showNetWait(`Waiting for ${opponentName}…`);
      client.send({ t: 'resume', code: m.code, token: m.token });
    },
    () => endGame("Couldn't reach the game server"),
  );
}

function onMatchMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case 'go': {
      if (lockstep) return;
      lockstep = new Lockstep(game, game.localTeam, net);
      const ls = lockstep;
      ls.onDesync = (tick) => {
        console.error(`Desync with ${opponentName} at tick ${tick}`);
        hud.showMessage(`Out of sync with ${opponentName} (tick ${tick}): your screens may no longer show the same game.`);
      };
      showNetWait('');
      beginPlay();
      hud.showMessage(`Online against ${opponentName}. ${firstSteps()}`);
      break;
    }
    case 'cmds':
      lockstep?.receive(msg.team, msg.tick, msg.cmds);
      break;
    case 'hash':
      lockstep?.receiveHash(msg.tick, msg.hash);
      break;
    case 'left':
      if (mode !== 'ended') endGame(`${opponentName} left the game`);
      break;
    case 'error':
      if (mode !== 'ended') endGame(msg.text);
      break;
  }
}

function showNetWait(text: string): void {
  netWaitEl.textContent = text;
  netWaitEl.hidden = !text;
}

/** Online games end early when the other player leaves or the connection drops: whoever's still here wins. */
function endGame(note: string): void {
  showNetWait('');
  if (game.winner === null && mode !== 'connecting') game.winner = game.localTeam;
  mode = 'ended';
  game.revealAll = true;
  menus.setPaused(false);
  menus.showEnd(game, input.actions / Math.max(1, game.time / 60), opponentName, note);
  net?.close();
}

/** Restart, Quit and a new map size reload the page for a clean match; with `next` set, the title is skipped. */
function reload(next: Autostart | null): void {
  try {
    if (next) sessionStorage.setItem(AUTOSTART_KEY, `${next.difficulty}:${next.size}:${next.seed}:${next.faction}:${next.enemy}`);
  } catch {
    // Without session storage, Restart falls back to the title screen.
  }
  location.reload();
}

function setPaused(paused: boolean): void {
  if (mode !== 'playing' && mode !== 'paused') return;
  mode = paused ? 'paused' : 'playing';
  menus.setPaused(paused, online);
}

// ---- Multiplayer lobby (title screen) -----------------------------------------------

function lobbyMessage(msg: ServerMsg): void {
  if (msg.t === 'rooms') menus.showRooms(msg.rooms);
  else if (msg.t === 'hosted') menus.showHosting(msg.code);
  else if (msg.t === 'error') menus.setLobbyStatus(msg.text);
  else if (msg.t === 'match') {
    // Paired: reload into the match (a fresh page builds the agreed map).
    try {
      sessionStorage.setItem(MATCH_KEY, JSON.stringify(msg.match));
    } catch {
      menus.setLobbyStatus('This browser blocks session storage, which online games need.');
      return;
    }
    location.reload();
  }
}

function openLobby(): void {
  menus.setLobbyStatus('');
  if (net?.connected) {
    net.send({ t: 'list' });
    return;
  }
  net = new NetClient();
  const client = net;
  client.onMessage = lobbyMessage;
  client.onClose = () => menus.setLobbyStatus('Disconnected from the game server.');
  client.connect().then(
    () => client.send({ t: 'list' }),
    () => {
      menus.showRooms([]);
      menus.setLobbyStatus('No game server here. Start one with "npm run serve" (see the README) and open the page it prints.');
    },
  );
}

const menus = new Menus({
  // A different map size or faction needs a fresh page (the map and starting units are built at load).
  onPlay: (difficulty, size, faction, enemy) => {
    // 'random' accepts whichever faction this page rolled.
    const same = size === game.map.size && faction === playerFaction && (enemy === 'random' || enemy === enemyFaction);
    if (same) startGame(difficulty);
    else reload({ difficulty, size, seed: urlSeed() ?? randomSeed(), faction, enemy: rollEnemy(enemy) });
  },
  onResume: () => setPaused(false),
  onRestart: () => reload({ difficulty: game.difficulty, size: mapSize, seed: mapSeed, faction: playerFaction, enemy: enemyFaction }),
  onQuit: () => {
    net?.send({ t: 'leave' });
    reload(null);
  },
  onFps: (show) => (fpsEl.hidden = !show),
  onSurrenderAnswer: (accept) => {
    if (mode !== 'offer') return;
    menus.setSurrenderOffer(false);
    mode = 'playing';
    if (accept) game.acceptSurrender(ENEMY);
    else hud.showMessage('Surrender refused. The enemy fights on.');
  },
  onLobby: (open) => {
    if (open) openLobby();
    else {
      net?.close();
      net = null;
    }
  },
  onHost: (name, size, faction) => net?.send({ t: 'host', name, size, faction, version: PROTOCOL_VERSION }),
  onJoin: (code, name, faction) => net?.send({ t: 'join', code, name, faction, version: PROTOCOL_VERSION }),
  onCancelHost: () => {
    net?.send({ t: 'cancel' });
    menus.page('multiplayer');
    net?.send({ t: 'list' });
  },
  onSurrender: () => {
    lockstep?.issue({ c: 'surrender' });
    setPaused(false);
  },
});
// The game waits for the player's answer, like the pause menu.
game.onSurrenderOffer = (team) => {
  if (team !== ENEMY || mode !== 'playing') return;
  mode = 'offer';
  menus.setSurrenderOffer(true);
};
fpsEl.hidden = !menus.showFps;
input.onMenu = () => setPaused(mode === 'playing');
document.getElementById('menu-btn')!.addEventListener('click', () => setPaused(true));
window.addEventListener('keydown', (e) => {
  // Esc closes the menu (opening it goes through Input so Esc still cancels placement first).
  if (e.key === 'Escape' && mode === 'paused') {
    e.stopImmediatePropagation();
    setPaused(false);
  }
}, { capture: true });
// Online, a hidden tab still has to keep its side of the game going, or the other player stalls. Browsers stop
// drawing hidden tabs and slow their timers to about once a second, so each timer call runs the ticks it missed.
let hiddenAt = 0;
setInterval(() => {
  if (!online || !document.hidden || !lockstep || (mode !== 'playing' && mode !== 'paused')) return;
  const now = performance.now();
  lockstep.advance((now - (hiddenAt || now)) / 1000, 5);
  hiddenAt = now;
}, 250);
document.addEventListener('visibilitychange', () => {
  hiddenAt = document.hidden ? performance.now() : 0;
  last = performance.now();
});
// Closing the tab mid-match tells the other player straight away.
window.addEventListener('pagehide', () => net?.send({ t: 'leave' }));

if (match) startOnline(match);
else if (autostart) startGame(autostart.difficulty);
else menus.showTitle();

// ---- Main loop -------------------------------------------------------------------

let fpsFrames = 0;
let fpsTime = 0;
let last = performance.now();
/** After the game ends, the simulation runs on locally so the last explosions play out behind the stats. */
let afterAcc = 0;
function frame(now: number): void {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  game.terrain.animate(now / 1000);

  fpsFrames++;
  fpsTime += rawDt;
  if (fpsTime >= 0.5) {
    if (menus.showFps) fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} FPS`;
    fpsFrames = 0;
    fpsTime = 0;
  }

  if (mode === 'title') {
    updateTitleCam(dt);
    shadows.fit(titleCam, titleFog.far);
    renderer.render(scene, titleCam);
  } else {
    let alpha = 1;
    // Online, the menu doesn't stop the game: the other player is still playing.
    const running = mode === 'playing' || (online && mode === 'paused');
    if (running && lockstep) {
      input.update(dt);
      if (!input.paused) alpha = lockstep.advance(Math.min(rawDt, 0.25));
      if (online) showNetWait(lockstep.waiting > 0.5 ? `Waiting for ${opponentName}…` : '');
      if (game.winner !== null) {
        if (online) endGame(game.surrendered === null ? '' : game.surrendered === game.localTeam ? 'You surrendered' : `${opponentName} surrendered`);
        else {
          mode = 'ended';
          game.revealAll = true;
          menus.showEnd(game, input.actions / Math.max(1, game.time / 60));
        }
      }
    } else if (mode === 'ended') {
      afterAcc = Math.min(afterAcc + rawDt, 0.25);
      while (afterAcc >= TICK) {
        game.update(TICK);
        afterAcc -= TICK;
      }
      alpha = afterAcc / TICK;
    }
    game.frame(dt, alpha);
    hud.update(dt);
    card.update();
    shadows.fit(rts.camera, gameFog.far);
    renderer.render(scene, rts.camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
