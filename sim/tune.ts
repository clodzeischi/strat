// Config overrides for balance sweeps without editing src/config: TUNE='{"units.tank.hp":500,"upgrades.nitro.cost":400}'
// sets each dotted path (from factions / units / buildings / upgrades / rules) before any game starts. A value of null deletes it.
import * as config from '../src/config';

export function applyTune(json = process.env.TUNE): void {
  if (!json) return;
  const roots: Record<string, any> = { factions: config.FACTIONS, units: config.UNITS, buildings: config.BUILDINGS, upgrades: config.UPGRADES, rules: config };
  for (const [path, value] of Object.entries(JSON.parse(json) as Record<string, unknown>)) {
    const keys = path.split('.');
    let o = roots[keys.shift()!];
    while (keys.length > 1) { const k = keys.shift()!; o = o[k] ??= {}; }
    if (value === null) delete o[keys[0]];
    else if (typeof value === 'object' && !Array.isArray(value) && typeof o[keys[0]] === 'object') Object.assign(o[keys[0]], value);
    else o[keys[0]] = value;
  }
}
applyTune();
