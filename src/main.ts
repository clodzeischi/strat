import * as THREE from 'three';
import { AI } from './ai';
import { RTSCamera } from './camera';
import { ENEMY, MAP_SIZE, PLAYER, TILE } from './config';
import { Game } from './game';
import { Input } from './input';
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
scene.fog = new THREE.Fog(0xe8c99a, 120, 260);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a48, 1.4));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const rts = new RTSCamera(MAP_SIZE * TILE);
const game = new Game(scene, rts.camera);

// The sun covers the whole map with one shadow camera.
const half = game.map.worldSize() / 2;
sun.position.set(half - 50, 90, half + 30);
sun.target.position.set(half, 0, half);
Object.assign(sun.shadow.camera, { left: -half * 1.3, right: half * 1.3, top: half * 1.3, bottom: -half * 1.3, near: 1, far: 260 });
sun.shadow.camera.updateProjectionMatrix();

const input = new Input(game, rts, canvas, document.getElementById('selbox')!, document.getElementById('info')!);
const sidebar = new Sidebar(game, input, rts);
game.onMessage = (t) => sidebar.showMessage(t);
const ai = new AI(game, ENEMY);
if (import.meta.env.DEV) Object.assign(window, { game, ai, input, rts });

const home = game.buildings.find((b) => b.team === PLAYER)!;
rts.lookAt(home.x + 6, home.z - 6);

function resize(): void {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h, false);
  rts.setAspect(w / h);
}
new ResizeObserver(resize).observe(view);
resize();

const overlay = document.getElementById('overlay')!;
document.getElementById('restart')!.addEventListener('click', () => location.reload());

sidebar.showMessage('Build a Refinery, then a Factory. Destroy the red base.');

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);
  if (!input.paused) {
    game.update(dt);
    ai.update(dt);
  }
  sidebar.update(dt);
  if (game.winner !== null && overlay.hidden) {
    overlay.hidden = false;
    overlay.querySelector('h1')!.textContent = game.winner === PLAYER ? 'VICTORY' : 'DEFEAT';
  }
  renderer.render(scene, rts.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
