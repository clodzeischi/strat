import * as THREE from 'three';
import { AI } from './ai';
import { RTSCamera } from './camera';
import { ENEMY, MAP_SIZES, PLAYER, TILE, type MapSize } from './config';
import { Game, type Difficulty } from './game';
import { Input } from './input';
import { loadMapSize, Menus } from './menu';
import { ViewShadows } from './shadows';
import { Sidebar } from './ui';
import './style.css';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const view = document.getElementById('view')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

// Restart and changing map size reload the page; the next game's settings ride along in session storage.
const AUTOSTART_KEY = 'strat.autostart';
interface Autostart { difficulty: Difficulty; size: MapSize }
function readAutostart(): Autostart | null {
  try {
    const raw = sessionStorage.getItem(AUTOSTART_KEY);
    sessionStorage.removeItem(AUTOSTART_KEY);
    const [difficulty, size] = (raw ?? '').split(':');
    const okDifficulty = difficulty === 'normal' || difficulty === 'hard' || difficulty === 'brutal';
    const okSize = (MAP_SIZES as readonly number[]).includes(Number(size));
    return okDifficulty && okSize ? { difficulty, size: Number(size) as MapSize } : null;
  } catch {
    return null;
  }
}
const autostart = readAutostart();
const mapSize = autostart?.size ?? loadMapSize();

const rts = new RTSCamera(mapSize * TILE);
const game = new Game(scene, rts.camera, mapSize);

// The sun's shadow map follows whatever the active camera is looking at.
const shadows = new ViewShadows(sun);

const input = new Input(game, rts, canvas, document.getElementById('selbox')!, document.getElementById('info')!);
const sidebar = new Sidebar(game, input, rts);
game.onMessage = (t) => sidebar.showMessage(t);
const ai = new AI(game, ENEMY);
if (import.meta.env.DEV) Object.assign(window, { game, ai, input, rts });

const home = game.buildings.find((b) => b.team === PLAYER)!;
rts.lookAt(home.x + 6, home.z - 6);

// Cinematic camera for the title screen: drifts low over sand, rock and spice.
const titleCam = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
const world = game.map.worldSize();
let titleTime = Math.random() * 100;
function flightPoint(t: number): THREE.Vector3 {
  const x = world * (0.5 + 0.34 * Math.sin(t * 0.021));
  const z = world * (0.5 + 0.34 * Math.sin(t * 0.034 + 1.3));
  return new THREE.Vector3(x, game.map.heightAt(x, z), z);
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

type Mode = 'title' | 'playing' | 'paused' | 'ended';
let mode: Mode = 'title';
const fpsEl = document.getElementById('fps')!;

function startGame(difficulty: Difficulty): void {
  game.difficulty = difficulty;
  mode = 'playing';
  menus.hideTitle();
  document.body.classList.remove('in-menu');
  scene.fog = gameFog;
  sidebar.showMessage('Build a Refinery and a Barracks, then a Factory. Destroy the red base.');
}

/** Restart, Quit and a new map size reload the page for a clean match; with `next` set, the title is skipped. */
function reload(next: Autostart | null): void {
  try {
    if (next) sessionStorage.setItem(AUTOSTART_KEY, `${next.difficulty}:${next.size}`);
  } catch {
    // Without session storage, Restart falls back to the title screen.
  }
  location.reload();
}

function setPaused(paused: boolean): void {
  if (mode !== 'playing' && mode !== 'paused') return;
  mode = paused ? 'paused' : 'playing';
  menus.setPaused(paused);
}

const menus = new Menus({
  onPlay: (difficulty, size) => (size === game.map.size ? startGame(difficulty) : reload({ difficulty, size })),
  onResume: () => setPaused(false),
  onRestart: () => reload({ difficulty: game.difficulty, size: mapSize }),
  onQuit: () => reload(null),
  onFps: (show) => (fpsEl.hidden = !show),
});
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

if (autostart) startGame(autostart.difficulty);
else menus.showTitle();

// ---- Main loop -------------------------------------------------------------------

let fpsFrames = 0;
let fpsTime = 0;
let last = performance.now();
function frame(now: number): void {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;

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
    if (mode === 'playing') {
      input.update(dt);
      if (!input.paused) {
        game.update(dt);
        ai.update(dt);
      }
      if (game.winner !== null) {
        mode = 'ended';
        menus.showEnd(game, input.actions / Math.max(1, game.time / 60));
      }
    } else if (mode === 'ended') {
      game.update(dt); // let the last explosions play out behind the stats
    }
    sidebar.update(dt);
    shadows.fit(rts.camera, gameFog.far);
    renderer.render(scene, rts.camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
