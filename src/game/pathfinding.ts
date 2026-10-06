import { TILE } from '../config';
import type { Cell, GameMap, MoveClass } from '../map';

export interface Point {
  x: number;
  z: number;
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    const a = this.items;
    const pr = this.prio;
    a.push(item);
    pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }

  pop(): number {
    const a = this.items;
    const pr = this.prio;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastPrio = pr.pop()!;
    if (a.length > 0) {
      a[0] = lastItem;
      pr[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}

/** A* over the tile grid. Returns world-space waypoints (smoothed), excluding the start. */
export function findPath(map: GameMap, sx: number, sz: number, gx: number, gz: number, cls: MoveClass = 'vehicle'): Point[] {
  const N = map.size;
  const startC = { cx: map.cellOf(sx), cz: map.cellOf(sz) };
  let goalC: Cell | null = { cx: map.cellOf(gx), cz: map.cellOf(gz) };
  let exactGoal = true;
  if (!map.canEnter(goalC.cx, goalC.cz, cls)) {
    goalC = map.nearestCell(goalC.cx, goalC.cz, (x, z) => map.canEnter(x, z, cls), 16, startC.cx, startC.cz);
    exactGoal = false;
    if (!goalC) return [];
  }
  if (!map.inBounds(startC.cx, startC.cz)) return [];

  const start = map.idx(startC.cx, startC.cz);
  const goal = map.idx(goalC.cx, goalC.cz);
  if (start === goal) return [exactGoal ? { x: gx, z: gz } : { x: map.center(goalC.cx), z: map.center(goalC.cz) }];

  const g = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = new MinHeap();
  const heur = (i: number) => {
    const dx = Math.abs((i % N) - goalC!.cx);
    const dz = Math.abs(((i / N) | 0) - goalC!.cz);
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
  };

  g[start] = 0;
  heap.push(start, heur(start));
  let best = start;
  let bestH = heur(start);

  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      best = cur;
      break;
    }
    const h = heur(cur);
    if (h < bestH) {
      bestH = h;
      best = cur;
    }
    const cx = cur % N;
    const cz = (cur / N) | 0;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!map.inBounds(nx, nz) || !map.canStep(cx, cz, nx, nz, cls)) continue;
      const ni = map.idx(nx, nz);
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + heur(ni));
      }
    }
  }

  const cells: Point[] = [];
  for (let i = best; i !== -1 && i !== start; i = came[i]) {
    cells.push({ x: map.center(i % N), z: map.center((i / N) | 0) });
  }
  cells.reverse();
  if (cells.length && best === goal && exactGoal) cells[cells.length - 1] = { x: gx, z: gz };
  return smooth(map, { x: sx, z: sz }, cells, cls);
}

/** True if a straight segment stays on cells this class can cross (with a little clearance), never jumping a level edge. */
export function lineClear(map: GameMap, a: Point, b: Point, cls: MoveClass = 'vehicle'): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / (TILE * 0.25));
  const nx = d > 0 ? -(b.z - a.z) / d : 0;
  const nz = d > 0 ? (b.x - a.x) / d : 0;
  const clearance = TILE * 0.35;
  const offsets = [-clearance, 0, clearance];
  const prev = offsets.map((o) => ({ cx: map.cellOf(a.x + nx * o), cz: map.cellOf(a.z + nz * o) }));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    for (let k = 0; k < offsets.length; k++) {
      const cx = map.cellOf(x + nx * offsets[k]);
      const cz = map.cellOf(z + nz * offsets[k]);
      const p = prev[k];
      if (cx === p.cx && cz === p.cz) {
        if (i === 0 && !map.canEnter(cx, cz, cls)) return false;
        continue;
      }
      if (!map.inBounds(cx, cz) || !map.canStep(p.cx, p.cz, cx, cz, cls)) return false;
      prev[k] = { cx, cz };
    }
  }
  return true;
}

function smooth(map: GameMap, start: Point, cells: Point[], cls: MoveClass): Point[] {
  if (cells.length <= 1) return cells;
  const out: Point[] = [];
  let anchor = start;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !lineClear(map, anchor, cells[j], cls)) j--;
    out.push(cells[j]);
    anchor = cells[j];
    i = j + 1;
  }
  return out;
}

/** Up to `count` distinct passable cells around a target, nearest first (BFS, so all reachable by `cls`). */
export function cellsAround(map: GameMap, cx: number, cz: number, count: number, cls: MoveClass = 'vehicle'): Cell[] {
  const startCell = map.nearestPassable(cx, cz);
  if (!startCell) return [];
  const out: Cell[] = [];
  const seen = new Set<number>([map.idx(startCell.cx, startCell.cz)]);
  const queue: Cell[] = [startCell];
  while (queue.length && out.length < count) {
    const c = queue.shift()!;
    out.push(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = c.cx + dx;
      const z = c.cz + dz;
      if (!map.inBounds(x, z) || !map.canStep(c.cx, c.cz, x, z, cls)) continue;
      const k = map.idx(x, z);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ cx: x, cz: z });
    }
  }
  return out;
}
