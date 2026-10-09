import { TILE, type Team } from '../config';
import { Building, type Entity, type Unit } from '../entities';
import type { GameMap } from '../map';

/** Vision is recomputed this often (ticks): 5 times a second. */
export const VISION_EVERY = 4;
/** Buildings see this far past their walls (world units). */
export const BUILDING_SIGHT = 8;
/** How long a unit that attacks stays visible to the side it hit, in ticks (2 s). */
const REVEAL_TICKS = 40;

/** Heights for sight, per cell: low ground, ramp, high ground. Aircraft see from above everything. */
const LOW = 0;
const RAMP = 1;
const HIGH = 2;
const AIR = 3;

/**
 * Fog of war, on the tile grid. Each team sees the cells within sight range of its units and buildings, with
 * elevation from the tiles alone (no 3D sight lines):
 * - from low ground or a ramp, high ground can't be seen, and high cells block the view past them (a mesa hides
 *   what's behind it);
 * - from high ground or the air, everything in range is visible.
 * Aircraft are seen by anyone with the cell in range, cliffs or not: they're up in the sky. A unit that attacks is
 * revealed to the side it hit for a moment, so units below a cliff can shoot back. Fremen hidden in the sand are
 * only seen by a side with a unit or structure right next to them (`Unit.hidden`, `Unit.detected`, set by the game).
 *
 * This is game state: units only target what their team sees, so it's computed in the simulation for every team
 * on every machine. What the local player's screen shows is a separate, drawing-only matter (see Game.frame).
 */
export class Vision {
  /** Per team, per cell: seen as of the last update. */
  readonly visible: Uint8Array[];
  /** Per team, per cell: within sight range of something, cliffs ignored (aircraft there are seen). */
  readonly inRange: Uint8Array[];
  /** Per team, per cell: seen at some point this game. */
  readonly explored: Uint8Array[];
  /** Bumped on every update, so the screen knows when to refresh. */
  version = 0;
  private readonly heights: Uint8Array;
  private readonly N: number;
  private reveals: { team: Team; cx: number; cz: number; until: number }[] = [];

  constructor(private map: GameMap, teams: number) {
    const N = (this.N = map.size);
    const grid = () => Array.from({ length: teams }, () => new Uint8Array(N * N));
    this.visible = grid();
    this.inRange = grid();
    this.explored = grid();
    this.heights = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) this.heights[i] = map.ramp[i] ? RAMP : map.level[i] ? HIGH : LOW;
  }

  /** Whether `team` can see the entity now. A team always sees its own. */
  sees(team: Team, e: Entity): boolean {
    if (e.team === team) return true;
    if (e instanceof Building) {
      for (let z = e.cz; z < e.cz + e.size; z++) for (let x = e.cx; x < e.cx + e.size; x++) if (this.visible[team][z * this.N + x]) return true;
      return false;
    }
    const u = e as Unit;
    if (u.carrier) return false;
    // Fremen dug into the sand: only seen by a side with something right next to them.
    if (u.hidden && !(u.detected & (1 << team))) return false;
    const i = this.cellIndex(u.x, u.z);
    if (i < 0) return false;
    return (u.def.air ? this.inRange : this.visible)[team][i] === 1;
  }

  /** Whether `team` sees the cell under a world point. */
  seesAt(team: Team, x: number, z: number): boolean {
    const i = this.cellIndex(x, z);
    return i >= 0 && this.visible[team][i] === 1;
  }

  /** The attacker stands out to the side it hit for a moment. */
  reveal(team: Team, x: number, z: number, tick: number): void {
    const cx = Math.floor(x / TILE);
    const cz = Math.floor(z / TILE);
    const r = this.reveals.find((v) => v.team === team && v.cx === cx && v.cz === cz);
    if (r) r.until = tick + REVEAL_TICKS;
    else this.reveals.push({ team, cx, cz, until: tick + REVEAL_TICKS });
  }

  /** Recomputes every team's sight from its units and buildings. */
  update(units: readonly Unit[], buildings: readonly Building[], tick: number): void {
    this.version++;
    for (const v of this.visible) v.fill(0);
    for (const v of this.inRange) v.fill(0);
    for (const u of units) {
      // Riders see nothing of their own: infantry in a bunker see with the bunker, cargo with its Carryall.
      if (u.dead || u.carrier) continue;
      const cx = Math.floor(u.x / TILE);
      const cz = Math.floor(u.z / TILE);
      if (!this.map.inBounds(cx, cz)) continue;
      const eye = u.def.air || u.falling ? AIR : this.heights[cz * this.N + cx];
      this.look(u.team, u.x / TILE, u.z / TILE, u.def.sight / TILE, eye, cx, cz, cx, cz);
    }
    for (const b of buildings) {
      if (b.dead) continue;
      // Range from the middle of the footprint; sight lines from the footprint cell nearest each target.
      const c = b.size / 2;
      this.look(b.team, b.cx + c, b.cz + c, c + BUILDING_SIGHT / TILE, this.heights[b.cz * this.N + b.cx], b.cx, b.cz, b.cx + b.size - 1, b.cz + b.size - 1);
    }
    this.reveals = this.reveals.filter((r) => r.until > tick);
    for (const r of this.reveals) {
      for (let z = r.cz - 1; z <= r.cz + 1; z++) {
        for (let x = r.cx - 1; x <= r.cx + 1; x++) {
          if (!this.map.inBounds(x, z)) continue;
          this.visible[r.team][z * this.N + x] = 1;
          this.inRange[r.team][z * this.N + x] = 1;
        }
      }
    }
    for (let t = 0; t < this.visible.length; t++) {
      const v = this.visible[t];
      const e = this.explored[t];
      for (let i = 0; i < v.length; i++) if (v[i]) e[i] = 1;
    }
  }

  private cellIndex(x: number, z: number): number {
    const cx = Math.floor(x / TILE);
    const cz = Math.floor(z / TILE);
    return this.map.inBounds(cx, cz) ? cz * this.N + cx : -1;
  }

  /**
   * Marks what one viewer can see: cells whose middle is within `radius` cells of (fx, fz) (in cell units), seen
   * from height `eye`, with sight lines from the nearest cell of the viewer's footprint (x0, z0)-(x1, z1).
   */
  private look(team: Team, fx: number, fz: number, radius: number, eye: number, x0: number, z0: number, x1: number, z1: number): void {
    const N = this.N;
    const vis = this.visible[team];
    const near = this.inRange[team];
    const h = this.heights;
    const r2 = radius * radius;
    const zLo = Math.max(0, Math.floor(fz - radius));
    const zHi = Math.min(N - 1, Math.floor(fz + radius));
    const xLo = Math.max(0, Math.floor(fx - radius));
    const xHi = Math.min(N - 1, Math.floor(fx + radius));
    for (let z = zLo; z <= zHi; z++) {
      const dz = z + 0.5 - fz;
      for (let x = xLo; x <= xHi; x++) {
        const dx = x + 0.5 - fx;
        if (dx * dx + dz * dz > r2) continue;
        const i = z * N + x;
        near[i] = 1;
        if (vis[i]) continue;
        if (eye < HIGH && (h[i] === HIGH || this.blocked(clamp(x, x0, x1), clamp(z, z0, z1), x, z))) continue;
        vis[i] = 1;
      }
    }
  }

  /** Whether a high cell stands between two cells (Bresenham line, ends excluded). */
  private blocked(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let x = x0;
    let z = z0;
    if (dx === 0 && dz === 0) return false;
    for (;;) {
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        z += sz;
      }
      if (x === x1 && z === z1) return false;
      if (this.heights[z * this.N + x] === HIGH) return true;
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
