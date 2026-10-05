// Prints generated maps as ASCII and checks basic properties. Usage: [SIZE=96] npx tsx sim/maps.ts [seed...]
import { GameMap, CLIFF, SPICE, ROCK, NARROW, NORMAL, LARGE } from '../src/map';

const seeds = process.argv.slice(2).map(Number);
const SIZE = Number(process.env.SIZE ?? 64);
for (const seed of seeds.length ? seeds : [7]) {
  const m = new GameMap(SIZE, seed);
  const N = m.size;
  const ramps: Record<number, number> = { [NARROW]: 0, [NORMAL]: 0, [LARGE]: 0 };
  let high = 0;
  let symmetric = true;
  for (let i = 0; i < N * N; i++) {
    if (m.ramp[i]) ramps[m.ramp[i]]++;
    if (m.level[i] && m.tiles[i] !== CLIFF) high++;
    const j = m.idx(N - 1 - (i % N), N - 1 - ((i / N) | 0));
    if (m.tiles[i] !== m.tiles[j] || m.level[i] !== m.level[j] || m.ramp[i] !== m.ramp[j]) symmetric = false;
  }
  console.log(`seed ${seed}: high ground ${Math.round((100 * high) / (N * N))}%, ramp cells narrow/normal/large ${ramps[NARROW]}/${ramps[NORMAL]}/${ramps[LARGE]}, symmetric ${symmetric}`);
  if (process.env.QUIET) continue;
  // Legend: . sand, , rock, # cliff, ~ spice; uppercase-ish on high ground: : sand, ; rock, * spice; ramps n/m/L; bases B
  for (let z = 0; z < N; z++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      const i = m.idx(x, z);
      const t = m.tiles[i];
      if (m.bases.some((b) => b.cx === x && b.cz === z)) row += 'B';
      else if (m.ramp[i]) row += m.ramp[i] === NARROW ? 'n' : m.ramp[i] === NORMAL ? 'm' : 'L';
      else if (t === CLIFF) row += '#';
      else if (m.level[i]) row += t === SPICE ? '*' : t === ROCK ? ';' : ':';
      else row += t === SPICE ? '~' : t === ROCK ? ',' : '.';
    }
    console.log(row);
  }
}

// Quick validity check over many seeds: vehicles can drive base to base.
if (process.env.CHECK) {
  const { findPath } = await import('../src/pathfinding');
  let bad = 0;
  for (let seed = 1; seed <= Number(process.env.CHECK); seed++) {
    const m = new GameMap(SIZE, seed);
    const [a, b] = m.bases;
    const path = findPath(m, m.center(a.cx), m.center(a.cz), m.center(b.cx), m.center(b.cz), 'vehicle');
    const end = path[path.length - 1];
    if (!end || Math.hypot(end.x - m.center(b.cx), end.z - m.center(b.cz)) > 4) { bad++; console.log('no vehicle route on seed', seed); }
  }
  console.log(`${bad} bad maps`);
}
