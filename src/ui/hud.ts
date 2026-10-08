import * as THREE from 'three';
import type { RTSCamera } from '../render/camera';
import { TEAM_CSS, TILE } from '../config';
import type { Game } from '../game/game';
import { tileColor } from '../materials/ground';

/** The HUD around the view: credits along the top, the minimap bottom right, and messages. */
export class Hud {
  private creditsEl: HTMLElement;
  private shownCredits = -1;
  private minimap: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private terrainImg: HTMLCanvasElement;
  private terrainVersion = -1;
  /** Fog of war over the minimap, one pixel per tile, drawn scaled up. */
  private fogImg: HTMLCanvasElement;
  private minimapTimer = 0;
  private messages: HTMLElement;

  constructor(private game: Game, private cam: RTSCamera) {
    this.creditsEl = document.getElementById('credits')!;
    this.messages = document.getElementById('messages')!;
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.mctx = this.minimap.getContext('2d')!;
    this.terrainImg = document.createElement('canvas');
    this.terrainImg.width = game.map.size;
    this.terrainImg.height = game.map.size;
    this.fogImg = document.createElement('canvas');
    this.fogImg.width = game.map.size;
    this.fogImg.height = game.map.size;
    this.setupMinimapInput();
  }

  showMessage(text: string): void {
    const el = document.createElement('div');
    el.className = 'msg';
    el.textContent = text;
    this.messages.appendChild(el);
    while (this.messages.children.length > 4) this.messages.firstChild!.remove();
    setTimeout(() => el.classList.add('fade'), 3500);
    setTimeout(() => el.remove(), 4200);
  }

  update(dt: number): void {
    const credits = Math.floor(this.game.teams[this.game.localTeam].credits);
    if (credits !== this.shownCredits) {
      this.shownCredits = credits;
      this.creditsEl.textContent = credits.toString();
    }
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.1;
      this.drawMinimap();
    }
  }

  // ---- Minimap -------------------------------------------------------------------

  private setupMinimapInput(): void {
    let down = false;
    const move = (e: MouseEvent) => {
      const r = this.minimap.getBoundingClientRect();
      const world = this.game.map.worldSize();
      this.cam.lookAt(((e.clientX - r.left) / r.width) * world, ((e.clientY - r.top) / r.height) * world);
    };
    this.minimap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      down = true;
      move(e);
    });
    window.addEventListener('mousemove', (e) => down && move(e));
    window.addEventListener('mouseup', () => (down = false));
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Darkens what the player can't see, like the ground in the view. */
  private drawFog(ctx: CanvasRenderingContext2D, W: number): void {
    const g = this.game;
    if (g.revealAll) return;
    const N = g.map.size;
    const fctx = this.fogImg.getContext('2d')!;
    const img = fctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) img.data[i * 4 + 3] = Math.round((1 - g.terrain.fogAt(i)) * 255 * 0.9);
    fctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogImg, 0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
  }

  private drawMinimap(): void {
    const g = this.game;
    const map = g.map;
    const N = map.size;
    if (map.version !== this.terrainVersion) {
      this.terrainVersion = map.version;
      const tctx = this.terrainImg.getContext('2d')!;
      const img = tctx.createImageData(N, N);
      const col = new THREE.Color();
      for (let cz = 0; cz < N; cz++) {
        for (let cx = 0; cx < N; cx++) {
          tileColor(map, cx, cz, col);
          const o = (cz * N + cx) * 4;
          img.data[o] = col.r * 255;
          img.data[o + 1] = col.g * 255;
          img.data[o + 2] = col.b * 255;
          img.data[o + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
    }
    const ctx = this.mctx;
    const W = this.minimap.width;
    const s = W / N; // px per tile
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainImg, 0, 0, W, W);
    this.drawFog(ctx, W);

    for (const b of g.buildings) {
      if (!b.known) continue;
      ctx.fillStyle = TEAM_CSS[b.team];
      ctx.fillRect(b.cx * s, b.cz * s, b.size * s, b.size * s);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeRect(b.cx * s + 0.5, b.cz * s + 0.5, b.size * s - 1, b.size * s - 1);
    }
    for (const u of g.units) {
      if (u.carrier || !g.shown(u)) continue;
      ctx.fillStyle = u.selected ? '#ffffff' : TEAM_CSS[u.team];
      const px = (u.x / TILE) * s;
      const pz = (u.z / TILE) * s;
      ctx.fillRect(px - 1.5, pz - 1.5, 3, 3);
    }

    // Camera footprint: where the four screen corners hit the ground.
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pts: THREE.Vector3[] = [];
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      ray.setFromCamera(new THREE.Vector2(x, y), this.cam.camera);
      const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (p) pts.push(p);
    }
    if (pts.length === 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = (p.x / TILE) * s;
        const y = (p.z / TILE) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
}
