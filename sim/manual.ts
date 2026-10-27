// Writes the generated parts of the player manual (docs/manual/): each faction page's tech tree, units, weapons,
// structures and research, straight from src/config, between the page's `<!-- specs -->` and `<!-- /specs -->`
// markers. The prose around them is written by hand. Usage: npx tsx sim/manual.ts   (--check: exit 1 if out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import {
  BUILDINGS, FACTIONS, STRUCTURE, factionLevelUps, type LevelUpType, TILE, UPGRADES, WEAPON_STEP, parseReq, reqName, shieldsFor, unitDef,
  type BuildingType, type Faction, type Req, type UnitType, type UpgradeType,
} from '../src/config';
import type { BuildingDef, UnitDef, WeaponDef } from '../src/config/types';

const tiles = (v: number) => +(v / TILE).toFixed(2);
const num = (v: number) => +v.toFixed(2);
const req = (r: Req[]) => (r.length ? r.map(reqName).join(', ') : '–');

/** The units a faction fields: trained ones, then the ones made by rites. */
function unitsOf(f: Faction): UnitType[] {
  const fd = FACTIONS[f];
  return [...fd.train.filter((t): t is UnitType => !!t), ...(fd.rites ?? [])];
}

/** Its structures: those on the build card, and those its units set up in the field. */
function buildingsOf(f: Faction): BuildingType[] {
  const list = FACTIONS[f].build.filter((b): b is BuildingType => !!b);
  for (const t of unitsOf(f)) {
    const d = unitDef(f, t);
    if (d.camp && !list.includes(d.camp)) list.push(d.camp);
    if (d.thumper && !list.includes('thumper')) list.push('thumper');
  }
  // The hub first.
  const hub = FACTIONS[f].hub;
  return [hub, ...list.filter((b) => b !== hub)];
}

/** Whether this faction levels this building up (Corrino levels its Barracks and Fab, not its yard). */
function levelsUp(f: Faction, t: BuildingType): boolean {
  return factionLevelUps(f).has(t as LevelUpType);
}

function upgradesOf(f: Faction): UpgradeType[] {
  return FACTIONS[f].research.flatMap((s) => (s && 'upgrades' in s ? s.upgrades : []));
}

/** Damage text: base, bonus, and what it does against aircraft. */
function damageText(w: WeaponDef): string {
  const bonus = Object.entries(w.bonus).map(([t, v]) => ` (+${v} vs ${t})`).join('');
  return `${w.damage}${bonus}`;
}

function weaponNotes(w: WeaponDef): string[] {
  const n: string[] = [];
  if (w.air) n.push(w.airDamage !== undefined ? `hits aircraft for ${w.airDamage}` : 'hits aircraft');
  else n.push('ground only');
  if (w.splash) n.push(`splash ${tiles(w.splash)} tiles`);
  if (w.cone) n.push(`cone ±${Math.round((w.cone * 180) / Math.PI)}°`);
  if (w.pierce) n.push('ignores shields');
  if (w.only) n.push(`only hits ${w.only.join(', ')} targets`);
  if (w.unguided) n.push('unguided: falls where the target stood');
  if (w.step !== undefined) n.push(w.step ? `+${w.step} per Weapons level` : 'Weapons upgrades don\'t change it');
  return n;
}

function weaponRow(name: string, w: WeaponDef): string {
  const range = w.minRange ? `${tiles(w.minRange)}–${tiles(w.range)}` : w.range ? `${tiles(w.range)}` : '–';
  const dps = w.cooldown ? num(w.damage / w.cooldown) : '–';
  return `| ${name} | ${damageText(w)} | ${w.cooldown || '–'} | ${dps} | ${range} | ${weaponNotes(w).join('; ')} |`;
}

/** Every weapon a unit fights with, named. */
function weaponsOf(d: UnitDef): [string, WeaponDef][] {
  const out: [string, WeaponDef][] = [];
  if (d.weapon) out.push([d.deploy ? `${d.name} (mobile)` : d.name, d.weapon]);
  if (d.antiArmor) out.push([`${d.name}: rockets vs Armored (Infantry Rockets)`, d.antiArmor]);
  if (d.secondary) out.push([`${d.name}: machine gun`, d.secondary]);
  if (d.deploy) out.push([`${d.name} (set up)`, d.deploy.weapon]);
  if (d.detonate) out.push([`${d.name}: self-destruct`, d.detonate.weapon]);
  if (d.mines) out.push([`${d.name}: mine`, d.mines.weapon]);
  return out;
}

/** What a unit can do beyond moving and shooting. */
function abilities(f: Faction, d: UnitDef): string[] {
  const a: string[] = [];
  if (d.rite) a.push(`Rite: a ${unitDef(f, d.rite.from).name} becomes one in ${d.rite.time} s for ${d.rite.cost} credits (one way).`);
  if (d.deploy) a.push(`Sets up in ${d.deploy.time} s (as long to pack up); set up, it can't move and fires its long-range weapon.`);
  if (d.holdFire && d.secondary) a.push('The main gun only fires standing still; the machine gun fires on the move.');
  else if (d.holdFire) a.push("Can't fire on the move.");
  if (d.detonate) a.push(`Self-destruct: blows up ${d.detonate.delay} s after the order.`);
  if (d.lockOn) a.push(`Lock On: its rockets home in on one target for ${d.lockOn.duration} s; recharges in ${d.lockOn.cooldown} s.`);
  if (d.mines) a.push(`Lays a mine every ${d.mines.cooldown} s (at most ${d.mines.max} per side); an enemy on the ground within ${tiles(d.mines.trigger)} tiles sets it off.`);
  if (d.charge) a.push(`Charges: closing on a target within ${tiles(d.charge.range)} tiles, it runs ${d.charge.speed}× as fast.`);
  if (d.thumper) a.push('Plants Thumpers and rides the Sandworm that comes (see [Sandworms](README.md#sandworms)).');
  if (d.camp) a.push(`Sets up a ${BUILDINGS[d.camp].name} on a spice field, and packs it up again.`);
  if (d.repair) a.push(`Repairs vehicles, aircraft and structures: ${d.repair.rate} HP/s within ${tiles(d.repair.range)} tiles, for credits.`);
  if (d.hides) a.push('Digs into the sand when it stands still on it, out of sight (see [Hiding](README.md#hiding-fremen)).');
  if (d.air) a.push('Flies: crosses any terrain; only anti-air weapons can hit it.');
  if (d.lift !== undefined) a.push(`Carryall space: ${d.lift} of 6.`);
  return a;
}

function unitSection(f: Faction): string {
  const rows = unitsOf(f).map((t) => {
    const d = unitDef(f, t);
    const sh = shieldsFor(f, d);
    const made = d.rite ? `rite (${d.rite.cost})` : `${d.cost}`;
    const time = d.rite ? d.rite.time : d.buildTime;
    return `| ${d.name} | ${made} | ${time} s | ${d.rite ? '–' : BUILDINGS[d.producer].name} | ${req(d.requires)} | ${d.hp} | ${sh || '–'} | ${d.armor ?? 0} | ${tiles(d.speed)} | ${tiles(d.sight)} | ${d.tags.join(', ')} |`;
  });
  const weapons = unitsOf(f).flatMap((t) => weaponsOf(unitDef(f, t)).map(([n, w]) => weaponRow(n, w)));
  const notes = unitsOf(f).map((t) => {
    const d = unitDef(f, t);
    return `**${d.name}.** ${d.desc}\n${abilities(f, d).map((s) => `- ${s}`).join('\n')}`;
  });
  return [
    '### Units',
    '',
    'Cost in credits; speed and sight in tiles (per second for speed). Shields absorb damage before health and recover on their own.',
    '',
    '| Unit | Cost | Build | Made at | Requires | Health | Shields | Armor | Speed | Sight | Tags |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '### Weapons',
    '',
    'Damage per hit, before armor, plus its bonus against targets with that tag. DPS is the base damage over the cooldown. Range in tiles.',
    '',
    '| Weapon | Damage | Cooldown (s) | DPS | Range | Notes |',
    '|---|---|---|---|---|---|',
    ...weapons,
    '',
    '### Unit notes',
    '',
    notes.join('\n\n'),
  ].join('\n');
}

function buildingNotes(b: BuildingDef): string {
  const n: string[] = [b.desc];
  if (b.weapon) n.push(`Gun: ${damageText(b.weapon)} every ${b.weapon.cooldown} s, range ${tiles(b.weapon.range)} tiles, ground only.`);
  if (b.pad) n.push(`${b.pad.slots} at a time, ${b.pad.rate} HP/s each.`);
  if (b.extract) n.push(`Up to ${b.extract.rate} credits/s from the spice within ${tiles(b.extract.radius)} tiles.`);
  if (b.heals) n.push(`Heals ${b.heals.rate}× as fast within ${tiles(b.heals.radius)} tiles.`);
  if (b.onSand) n.push('Goes on open sand or spice only.');
  return n.join(' ');
}

function buildingSection(f: Faction): string {
  const rows: string[] = [];
  for (const t of buildingsOf(f)) {
    const b = BUILDINGS[t];
    const sh = shieldsFor(f, b);
    const how = b.deployed ? 'set up by a unit' : `${b.buildTime} s`;
    // A camp costs nothing on top of the crew that sets it up.
    const fromCrew = unitsOf(f).some((u) => unitDef(f, u).camp === t);
    rows.push(`| ${b.name} | ${fromCrew ? '– (the crew)' : b.cost} | ${how} | ${req(b.requires)} | ${b.hp} | ${sh || '–'} | ${b.armor ?? STRUCTURE.armor} | ${b.size}×${b.size} | ${buildingNotes(b).replace(/\|/g, '/')} |`);
    for (const [i, l] of (b.levels ?? []).entries()) {
      if (!levelsUp(f, t)) continue;
      rows.push(`| ↳ ${l.name} | ${l.cost} | ${l.time} s | ${req([...(i ? [`${t}${i + 1}` as Req] : [t]), ...(l.requires ?? [])])} | | | | | ${l.desc} |`);
    }
  }
  return [
    '### Structures',
    '',
    'Level-ups (↳) upgrade a building of that type in place. Structures have armor 5 unless listed otherwise.',
    '',
    '| Structure | Cost | Build | Requires | Health | Shields | Armor | Size | Notes |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function upgradeSection(f: Faction): string {
  const rows = upgradesOf(f).map((t) => {
    const u = UPGRADES[t];
    const after = u.after ? `${UPGRADES[u.after].name}, ` : '';
    return `| ${u.name} | ${u.cost} | ${u.time} s | ${after}${req(u.requires)} | ${u.desc} |`;
  });
  return [
    '### Research',
    '',
    `Researched one at a time, from the Upgrade tab. Weapons levels add ${WEAPON_STEP.share * 100}% of each hit (bonus included); Armor levels take one more point off every hit.`,
    '',
    '| Upgrade | Cost | Time | Requires | Effect |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** A Mermaid flowchart: structures, their level-ups, and the units each unlocks. */
function techTree(f: Faction): string {
  const id = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
  const lines = ['```mermaid', 'flowchart LR'];
  const hub = FACTIONS[f].hub;
  const node = (r: Req) => {
    const { type, level } = parseReq(r);
    return level > 1 ? `${id(type)}${level}` : id(type);
  };
  for (const t of buildingsOf(f)) {
    const b = BUILDINGS[t];
    if (b.deployed) continue;
    lines.push(`  ${id(t)}["${b.name}"]`);
    const reqs = b.requires.length ? b.requires : t === hub ? [] : [hub as Req];
    for (const r of reqs) lines.push(`  ${node(r)} --> ${id(t)}`);
    for (const [i, l] of (b.levels ?? []).entries()) {
      if (!levelsUp(f, t)) continue;
      lines.push(`  ${id(t)}${i + 2}("${l.name}")`);
      lines.push(`  ${i ? `${id(t)}${i + 1}` : id(t)} --> ${id(t)}${i + 2}`);
      for (const r of l.requires ?? []) lines.push(`  ${node(r)} --> ${id(t)}${i + 2}`);
    }
  }
  for (const t of unitsOf(f)) {
    const d = unitDef(f, t);
    lines.push(`  u_${t}(["${d.name}"])`);
    const reqs = d.rite ? d.requires : [...new Set([d.producer as Req, ...d.requires])];
    for (const r of reqs) lines.push(`  ${node(r)} --> u_${t}`);
    if (d.rite) lines.push(`  u_${d.rite.from} -. rite .-> u_${t}`);
  }
  lines.push('  classDef unit fill:#f3e2c0,stroke:#a4782f,color:#3a2a10');
  lines.push(`  class ${unitsOf(f).map((t) => `u_${t}`).join(',')} unit`);
  lines.push('```');
  return ['### Tech tree', '', 'Structures (boxes), their level-ups (rounded) and the units they unlock (pills). Dotted arrows are Fremen rites.', '', ...lines].join('\n');
}

function specs(f: Faction): string {
  return [techTree(f), unitSection(f), buildingSection(f), upgradeSection(f)].join('\n\n');
}

const check = process.argv.includes('--check');
let stale = 0;
for (const f of Object.keys(FACTIONS) as Faction[]) {
  const path = `docs/manual/${f}.md`;
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('<!-- specs -->');
  const end = text.indexOf('<!-- /specs -->');
  if (start < 0 || end < 0) throw new Error(`${path}: no specs markers`);
  const next = `${text.slice(0, start)}<!-- specs -->\n<!-- Generated from src/config by sim/manual.ts: edit the config, then rerun it. -->\n\n${specs(f)}\n\n${text.slice(end)}`;
  if (next !== text) {
    stale++;
    if (!check) writeFileSync(path, next);
  }
  console.log(`${path}: ${next === text ? 'up to date' : check ? 'out of date' : 'written'}`);
}
process.exit(check && stale ? 1 : 0);
