import * as THREE from 'three';
import type { RTSCamera } from '../render/camera';
import {
  BUILDING_ORDER, BUILDINGS, LEVEL_UP_ORDER, TEAM_CSS, TILE, UNIT_ORDER, UNITS, UPGRADE_ORDER, UPGRADES,
  reqName, type BuildingType, type LevelUpType, type Req, type UnitType, type UpgradeType, type WeaponDef,
} from '../config';
import type { Game } from '../game/game';
import type { Input } from './input';
import { tileColor } from '../materials/ground';
import { icon, type IconKey } from './icons';

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

function weaponLine(w: WeaponDef): string {
  const bonus = Object.entries(w.bonus).map(([t, v]) => `${v! > 0 ? '+' : ''}${v} vs ${cap(t)}`).join(', ');
  const range = w.minRange ? `${w.minRange / TILE}-${w.range / TILE}` : `${w.range / TILE}`;
  return `Damage ${w.damage}${bonus ? ` (${bonus})` : ''}  Range ${range} tiles`;
}

const reqList = (reqs: Req[]) => reqs.map(reqName).join(', ');

interface Card {
  el: HTMLElement;
  wipe: HTMLElement;
  badge: HTMLElement;
  status: HTMLElement;
  cost: HTMLElement;
  state: string;
}

/** Dune 2000 style right bar: credits, radar, structures column and units column (upgrades at the bottom). */
export class Sidebar {
  private cards = new Map<string, Card>();
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

  constructor(private game: Game, private input: Input, private cam: RTSCamera) {
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

    const buildCol = document.getElementById('col-build')!;
    const unitCol = document.getElementById('col-units')!;
    const upgradeCol = document.getElementById('col-upgrades')!;
    for (const t of BUILDING_ORDER) buildCol.appendChild(this.makeCard(`b:${t}`, t, BUILDINGS[t].short, BUILDINGS[t].cost, this.tooltipBuilding(t)));
    for (const t of UNIT_ORDER) unitCol.appendChild(this.makeCard(`u:${t}`, t, UNITS[t].name, UNITS[t].cost, this.tooltipUnit(t)));
    for (const t of LEVEL_UP_ORDER) {
      const up = BUILDINGS[t].levelUp!;
      upgradeCol.appendChild(this.makeCard(`l:${t}`, `${t}2`, up.short, up.cost, `${up.name} ($${up.cost})\n${up.desc}\nRight-click to cancel.`));
    }
    for (const t of UPGRADE_ORDER) upgradeCol.appendChild(this.makeCard(`g:${t}`, t, UPGRADES[t].short, UPGRADES[t].cost, this.tooltipUpgrade(t)));

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

  // ---- Cards -------------------------------------------------------------------

  private makeCard(key: string, type: IconKey, name: string, cost: number, tip: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'card';
    el.title = tip;
    el.innerHTML = `<div class="icon">${icon(type, this.game.localTeam)}</div><div class="meta"><div class="name">${name}</div><div class="cost">$${cost}</div></div><div class="wipe"></div><div class="badge"></div><div class="status"></div>`;
    const card: Card = {
      el,
      wipe: el.querySelector('.wipe')!,
      badge: el.querySelector('.badge')!,
      status: el.querySelector('.status')!,
      cost: el.querySelector('.cost')!,
      state: '',
    };
    this.cards.set(key, card);
    el.addEventListener('click', () => this.onCardClick(key));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onCardRightClick(key);
    });
    return el;
  }

  private onCardClick(key: string): void {
    this.input.actions++;
    const [kind, type] = key.split(':');
    const g = this.game;
    const team = g.localTeam;
    const ts = g.teams[team];
    const issue = this.input.issue;
    if (kind === 'b') {
      const t = type as BuildingType;
      if (ts.building) {
        if (ts.building.type === t && ts.building.ready) this.input.beginPlacement(t);
        else if (ts.building.type !== t) this.showMessage(`Already building ${BUILDINGS[ts.building.type].name}.`);
      } else if (g.canBuild(team, t)) {
        if (ts.credits < BUILDINGS[t].cost) this.showMessage('Insufficient funds.');
        else issue({ c: 'build', type: t });
      }
    } else if (kind === 'u') {
      issue({ c: 'train', type: type as UnitType });
    } else if (kind === 'g') {
      const t = type as UpgradeType;
      if (ts.research && ts.research.type !== t) this.showMessage(`Already researching ${UPGRADES[ts.research.type].name}.`);
      else if (!ts.research) issue({ c: 'research', type: t });
    } else if (kind === 'l') {
      const t = type as LevelUpType;
      if (!ts.levelUps[t]) issue({ c: 'levelUp', type: t });
    }
  }

  private onCardRightClick(key: string): void {
    const [kind, type] = key.split(':');
    const ts = this.game.teams[this.game.localTeam];
    const issue = this.input.issue;
    if (kind === 'b' && ts.building?.type === type) {
      issue({ c: 'cancelBuild' });
      this.input.placing = null;
    } else if (kind === 'u') {
      issue({ c: 'untrain', type: type as UnitType });
    } else if (kind === 'g' && ts.research?.type === type) {
      issue({ c: 'cancelResearch' });
    } else if (kind === 'l') {
      issue({ c: 'cancelLevelUp', type: type as LevelUpType });
    }
  }

  private tooltipBuilding(t: BuildingType): string {
    const d = BUILDINGS[t];
    const req = d.requires.length ? `\nRequires: ${reqList(d.requires)}` : '';
    return `${d.name} ($${d.cost})\n${d.desc}\nHP ${d.hp}${req}\nRight-click to cancel.`;
  }

  private tooltipUnit(t: UnitType): string {
    const d = UNITS[t];
    const w = d.weapon ? `\n${weaponLine(d.weapon)}` : '';
    const anti = d.antiArmor ? `\nRockets (upgrade): ${weaponLine(d.antiArmor)}` : '';
    const req = `\nBuilt at: ${BUILDINGS[d.producer].name}`;
    return `${d.name} ($${d.cost})  [${d.tags.map(cap).join(', ')}]\n${d.desc}\nHP ${d.hp}  Speed ${d.speed}${w}${anti}${req}\nRight-click to remove from queue.`;
  }

  private tooltipUpgrade(t: UpgradeType): string {
    const d = UPGRADES[t];
    const after = d.after ? `, ${UPGRADES[d.after].name}` : '';
    return `${d.name} upgrade ($${d.cost})\n${d.desc}\nRequires: ${reqList(d.requires)}${after}`;
  }

  /** Hidden cards are ones not yet unlocked or already finished. */
  private setCard(key: string, opts: { hidden: boolean; disabled: boolean; progress: number | null; badge: string; status: string; extra: string; cost: number }): void {
    const c = this.cards.get(key)!;
    const ts = this.game.teams[this.game.localTeam];
    const poor = ts.credits < opts.cost;
    const p = opts.progress === null ? -1 : Math.floor(opts.progress * 72);
    const state = `${opts.hidden}|${opts.disabled}|${p}|${opts.badge}|${opts.status}|${opts.extra}|${poor}`;
    if (state === c.state) return;
    c.state = state;
    c.el.className = `card${opts.disabled ? ' disabled' : ''}${opts.extra ? ` ${opts.extra}` : ''}`;
    c.el.style.display = opts.hidden ? 'none' : '';
    c.cost.classList.toggle('poor', poor);
    if (opts.progress === null) {
      c.wipe.style.display = 'none';
    } else {
      const deg = opts.progress * 360;
      c.wipe.style.display = 'block';
      c.wipe.style.background = `conic-gradient(transparent ${deg}deg, rgba(0,0,0,0.62) ${deg}deg)`;
    }
    c.badge.textContent = opts.badge;
    c.badge.style.display = opts.badge ? 'block' : 'none';
    c.status.textContent = opts.status;
    c.status.style.display = opts.status ? 'block' : 'none';
  }

  // ---- Per frame ---------------------------------------------------------------

  update(dt: number): void {
    const g = this.game;
    const team = g.localTeam;
    const ts = g.teams[team];
    const credits = Math.floor(ts.credits);
    if (credits !== this.shownCredits) {
      this.shownCredits = credits;
      this.creditsEl.textContent = credits.toString();
    }

    for (const t of BUILDING_ORDER) {
      const b = ts.building;
      const mine = b?.type === t;
      this.setCard(`b:${t}`, {
        hidden: !mine && !g.requirementsMet(team, BUILDINGS[t].requires),
        disabled: !g.canBuild(team, t) || (!!b && !mine),
        progress: mine && !b!.ready ? b!.progress : null,
        badge: '',
        status: mine && b!.ready ? (this.input.placing === t ? 'PLACING' : 'READY') : '',
        extra: mine && b!.ready ? 'ready' : '',
        cost: BUILDINGS[t].cost,
      });
    }
    for (const t of UNIT_ORDER) {
      const p = UNITS[t].producer;
      const queue = ts.queues[p];
      const lines = g.activeLines(team, p);
      const queued = queue.filter((q) => q.type === t).length;
      const building = queue.slice(0, lines).filter((q) => q.type === t);
      this.setCard(`u:${t}`, {
        hidden: !queued && !g.requirementsMet(team, UNITS[t].requires),
        disabled: !g.canTrain(team, t),
        progress: queued ? Math.max(0, ...building.map((q) => q.progress)) : null,
        badge: queued > 1 ? `${queued}` : '',
        status: '',
        extra: '',
        cost: UNITS[t].cost,
      });
    }
    for (const t of LEVEL_UP_ORDER) {
      const l = ts.levelUps[t];
      this.setCard(`l:${t}`, {
        hidden: !l && !g.canLevelUp(team, t),
        disabled: false,
        progress: l ? l.progress : null,
        badge: '',
        status: '',
        extra: '',
        cost: BUILDINGS[t].levelUp!.cost,
      });
    }
    for (const t of UPGRADE_ORDER) {
      const r = ts.research;
      const mine = r?.type === t;
      this.setCard(`g:${t}`, {
        hidden: !mine && !g.canResearch(team, t),
        disabled: !!r && !mine,
        progress: mine ? r!.progress : null,
        badge: '',
        status: '',
        extra: '',
        cost: UPGRADES[t].cost,
      });
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
