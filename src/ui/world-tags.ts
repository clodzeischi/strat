import * as THREE from 'three';
import { PRODUCERS, type Producer, type UnitType } from '../config';
import type { Building } from '../entities';
import type { Game } from '../game/game';
import { SPICE } from '../map';
import { icon, type IconKey } from './icons';
import type { Input } from './input';

/** The cursor rests on a spice field this long (seconds) before its tooltip shows. */
const SPICE_TIP_DELAY = 0.3;

interface Tag {
  el: HTMLElement;
  /** What the tag shows, so it's only rebuilt when that changes. */
  key: string;
  /** Progress strip of the unit being made. */
  fill: HTMLElement | null;
}

/**
 * Little cards under the health bars of the player's and allies' buildings: the unit each production building is
 * making, with its progress, and the infantry in a bunker. Also the spice left in the field under the cursor.
 */
export class WorldTags {
  private tags = new Map<number, Tag>();
  private v = new THREE.Vector3();
  private tip: HTMLElement;
  private tipWait = 0;

  constructor(private game: Game, private camera: THREE.Camera, private input: Input, private layer: HTMLElement) {
    this.tip = document.createElement('div');
    this.tip.className = 'spice-tip';
    this.tip.hidden = true;
    layer.appendChild(this.tip);
  }

  update(dt: number): void {
    const g = this.game;
    const w = this.layer.clientWidth;
    const h = this.layer.clientHeight;
    const seen = new Set<number>();
    for (const b of g.buildings) {
      if (b.dead || !g.allied(b.team, g.localTeam)) continue;
      const key = this.contents(b);
      if (!key) continue;
      const p = this.v.set(b.x, b.y + b.bar.position.y, b.z).project(this.camera);
      if (p.z >= 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      seen.add(b.id);
      let tag = this.tags.get(b.id);
      if (!tag) {
        const el = document.createElement('div');
        el.className = 'world-tag';
        this.layer.insertBefore(el, this.tip);
        tag = { el, key: '', fill: null };
        this.tags.set(b.id, tag);
      }
      if (tag.key !== key) this.draw(b, tag, key);
      if (tag.fill) tag.fill.style.width = `${Math.round(this.making(b)!.progress * 100)}%`;
      tag.el.style.transform = `translate(${((p.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    }
    for (const [id, tag] of this.tags) {
      if (seen.has(id)) continue;
      tag.el.remove();
      this.tags.delete(id);
    }
    this.updateSpiceTip(dt);
  }

  /** The queue item a production building is working on. */
  private making(b: Building): { type: UnitType; progress: number } | undefined {
    if (!PRODUCERS.includes(b.type as Producer)) return undefined;
    return this.game.teams[b.team].queues[b.type as Producer].find((q) => q.site === b);
  }

  /** A short description of what the tag shows ('' for none). */
  private contents(b: Building): string {
    const garrison = b.def.garrison ?? 0;
    if (garrison) return b.occupants.length ? `in:${b.occupants.map((u) => u.type).join(',')}/${garrison}` : '';
    const q = this.making(b);
    return q ? `make:${q.type}` : '';
  }

  private draw(b: Building, tag: Tag, key: string): void {
    tag.key = key;
    const card = (type: UnitType) => `<div class="card">${icon(type as IconKey, b.team)}</div>`;
    if (b.def.garrison) {
      tag.el.innerHTML = b.occupants.map((u) => card(u.type)).join('') + '<div class="card empty"></div>'.repeat(Math.max(0, b.room));
      tag.fill = null;
    } else {
      tag.el.innerHTML = `<div class="card">${icon(this.making(b)!.type as IconKey, b.team)}<i></i></div>`;
      tag.fill = tag.el.querySelector('i');
    }
  }

  /** The spice left in the field under the cursor, once it has rested there a moment. */
  private updateSpiceTip(dt: number): void {
    const g = this.game;
    const map = g.map;
    const at = this.input.hoverPoint();
    const cx = at ? map.cellOf(at.x) : -1;
    const cz = at ? map.cellOf(at.z) : -1;
    const inside = cx >= 0 && cz >= 0 && cx < map.size && cz < map.size;
    const i = inside ? map.idx(cx, cz) : -1;
    if (!at || i < 0 || map.tiles[i] !== SPICE || !(g.revealAll || g.vision.explored[g.localTeam][i])) {
      this.tipWait = 0;
      this.tip.hidden = true;
      return;
    }
    this.tipWait += dt;
    if (this.tipWait < SPICE_TIP_DELAY) return;
    this.tip.textContent = `Spice left: ${Math.round(this.fieldSpice(i)).toLocaleString('en-US')}`;
    this.tip.style.transform = `translate(${at.sx + 14}px, ${at.sy + 18}px)`;
    this.tip.hidden = false;
  }

  /** The spice on the tiles joined to cell `start`, diagonals too: its field (fields keep sand between them). */
  private fieldSpice(start: number): number {
    const map = this.game.map;
    const N = map.size;
    const cells = new Set<number>([start]);
    const open = [start];
    let total = 0;
    while (open.length) {
      const i = open.pop()!;
      total += map.spice[i];
      const x = i % N;
      const z = (i - x) / N;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const j = nz * N + nx;
          if (cells.has(j) || map.tiles[j] !== SPICE) continue;
          cells.add(j);
          open.push(j);
        }
      }
    }
    return total;
  }
}
