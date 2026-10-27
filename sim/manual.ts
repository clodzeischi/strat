// Writes the generated parts of the player manual (docs/manual/), Liquipedia style: each faction page's tech tree, a
// card per unit (portrait, infobox, weapons, abilities, and what it's strong and weak against, one unit from each
// faction), a card per structure, and the research table. Straight from src/config, between the page's
// `<!-- specs -->` and `<!-- /specs -->` markers; the prose around them is written by hand.
// Strong / weak against come from docs/manual/duels.json (equal-cost duels: OUT=docs/manual/duels.json npx tsx
// sim/matchups.ts); portraits from sim/portraits.cjs. Usage: npx tsx sim/manual.ts   (--check: exit 1 if out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import {
  BUILDINGS, FACTIONS, FACTION_LIST, MIN_HIT, STRUCTURE, TILE, UPGRADES, WEAPON_STEP, factionLevelUps, parseReq, reqName, shieldsFor, unitDef,
  type BuildingType, type Faction, type LevelUpType, type Req, type UnitType, type UpgradeType,
} from '../src/config';
import type { UnitDef, WeaponDef } from '../src/config/types';
import { weaponDamage } from '../src/game/game';

const tiles = (v: number) => +(v / TILE).toFixed(2);
const num = (v: number) => +v.toFixed(2);
const req = (r: Req[]) => (r.length ? r.map(reqName).join(', ') : '–');
/** GitHub's heading anchor for a name. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
const img = (f: Faction, t: string) => `img/${f}/${t}.png`;

/** The units a faction fields: trained ones, then the ones made by rites. */
function unitsOf(f: Faction): UnitType[] {
  const fd = FACTIONS[f];
  return [...fd.train.filter((t): t is UnitType => !!t), ...(fd.rites ?? [])];
}

/** Its structures: those on the build card, and those its units set up in the field. The hub first. */
function buildingsOf(f: Faction): BuildingType[] {
  const list = FACTIONS[f].build.filter((b): b is BuildingType => !!b);
  for (const t of unitsOf(f)) {
    const d = unitDef(f, t);
    if (d.camp && !list.includes(d.camp)) list.push(d.camp);
    if (d.thumper && !list.includes('thumper')) list.push('thumper');
  }
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

// ---- Strong and weak against -------------------------------------------------------------------------------------

const DUELS = JSON.parse(readFileSync('docs/manual/duels.json', 'utf8')) as { types: UnitType[]; table: Record<string, Record<string, number>> };
/** A clear win or loss in an equal-cost duel, not a coin flip. */
const CLEAR = 0.15;
/** Where the duels leave something out: the Sandrider fights them on foot, without its worm. */
const STRONG_EXTRA: Partial<Record<UnitType, Partial<Record<Faction, { unit: UnitType; note: string }>>>> = {
  sandrider: { atreides: { unit: 'tank', note: 'its worm' }, corrino: { unit: 'devastator', note: 'its worm' } },
};

/** Damage per second per 1,000 credits of `a` against `b`'s whole health and shields, as a share of it (0 if it can't hit it). */
function dpsShare(fa: Faction, a: UnitType, fb: Faction, b: UnitType): number {
  const da = unitDef(fa, a);
  const db = unitDef(fb, b);
  const sh = shieldsFor(fb, db);
  const w = da.deploy?.weapon ?? da.weapon;
  if (!w || (db.air && !w.air) || (w.only && !db.tags.some((t) => w.only!.includes(t)))) return 0;
  const hit = weaponDamage(w, db);
  const hits = (w.pierce ? 0 : sh / Math.max(MIN_HIT, hit)) + db.hp / Math.max(MIN_HIT, hit - (db.armor ?? 0));
  return 1000 / da.cost / (hits * w.cooldown);
}

interface Pick { unit: UnitType; faction: Faction; note?: string }

/** Per enemy faction: the unit it beats most clearly, and the one that beats it most clearly. */
function versus(f: Faction, t: UnitType): { strong: Pick[]; weak: Pick[] } {
  const strong: Pick[] = [];
  const weak: Pick[] = [];
  const fighter = DUELS.types.includes(t);
  for (const g of FACTION_LIST) {
    const others = unitsOf(g).filter((u) => u !== t && DUELS.types.includes(u));
    if (fighter) {
      const scored = others.map((u) => ({ u, s: DUELS.table[t][u] })).sort((a, b) => b.s - a.s);
      // Nothing counts as beating the Sandrider: it loses the duels on foot, but its worm is what it fights with.
      const beaten = scored.filter((x) => !STRONG_EXTRA[x.u]);
      const extra = STRONG_EXTRA[t]?.[g];
      if (extra) strong.push({ unit: extra.unit, faction: g, note: extra.note });
      else if (beaten[0] && beaten[0].s > CLEAR) strong.push({ unit: beaten[0].u, faction: g });
      const last = scored[scored.length - 1];
      if (last && last.s < -CLEAR) weak.push({ unit: last.u, faction: g });
    } else {
      // Support units don't fight: what kills them fastest for the money.
      const best = others.map((u) => ({ u, s: dpsShare(g, u, f, t) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s > 0) weak.push({ unit: best.u, faction: g });
    }
  }
  return { strong, weak };
}

function pickLine(picks: Pick[], here: Faction): string {
  if (!picks.length) return '–';
  return picks
    .map((p) => {
      const d = unitDef(p.faction, p.unit);
      const page = p.faction === here ? '' : `${p.faction}.md`;
      return `<img src="${img(p.faction, p.unit)}" width="32" align="absmiddle" alt=""> [${d.name}](${page}#${slug(d.name)})${p.note ? ` (${p.note})` : ''}`;
    })
    .join(' &nbsp; ');
}

// ---- Weapons -------------------------------------------------------------------------------------------------------

function damageText(w: WeaponDef): string {
  return `${w.damage}${Object.entries(w.bonus).map(([t, v]) => ` (+${v} vs ${t})`).join('')}`;
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
  if (w.step !== undefined) n.push(w.step ? `+${w.step} per Weapons level` : "Weapons upgrades don't change it");
  return n;
}

function weaponRow(name: string, w: WeaponDef): string {
  const range = w.minRange ? `${tiles(w.minRange)}–${tiles(w.range)}` : w.range ? `${tiles(w.range)}` : '–';
  const dps = w.cooldown ? num(w.damage / w.cooldown) : '–';
  return `| ${name} | ${damageText(w)} | ${w.cooldown || '–'} | ${dps} | ${range} | ${weaponNotes(w).join('; ')} |`;
}

function weaponsOf(d: UnitDef): [string, WeaponDef][] {
  const out: [string, WeaponDef][] = [];
  if (d.weapon) out.push([d.deploy ? 'Mobile' : d.secondary ? 'Main gun' : 'Main', d.weapon]);
  if (d.antiArmor) out.push(['Rockets vs Armored (Infantry Rockets)', d.antiArmor]);
  if (d.secondary) out.push(['Machine gun', d.secondary]);
  if (d.deploy) out.push(['Set up', d.deploy.weapon]);
  if (d.detonate) out.push(['Self-destruct', d.detonate.weapon]);
  if (d.mines) out.push(['Mine', d.mines.weapon]);
  return out;
}

function abilities(f: Faction, d: UnitDef): string[] {
  const a: string[] = [];
  if (d.rite) a.push(`**Rite:** a ${unitDef(f, d.rite.from).name} becomes one in ${d.rite.time} s for ${d.rite.cost} credits (one way).`);
  if (d.deploy) a.push(`**Set up** (D): ${d.deploy.time} s, and as long to pack up. Set up, it can't move and fires its long-range weapon.`);
  if (d.holdFire && d.secondary) a.push('The main gun only fires standing still; the machine gun fires on the move.');
  else if (d.holdFire) a.push("Can't fire on the move.");
  if (d.detonate) a.push(`**Self-destruct** (V): blows up ${d.detonate.delay} s after the order.`);
  if (d.lockOn) a.push(`**Lock On** (D): its rockets home in on one target for ${d.lockOn.duration} s; recharges in ${d.lockOn.cooldown} s.`);
  if (d.mines) a.push(`**Lay Mine** (D): one every ${d.mines.cooldown} s, at most ${d.mines.max} per side; an enemy on the ground within ${tiles(d.mines.trigger)} tiles sets it off.`);
  if (d.charge) a.push(`**Charge:** closing on a target within ${tiles(d.charge.range)} tiles, it runs ${d.charge.speed}× as fast.`);
  if (d.thumper) a.push('**Plant Thumper** (D) and ride the Sandworm that comes; **Release Worm** lets it go. See [Sandworms](README.md#sandworms).');
  if (d.camp) a.push(`**Set Up Camp** (D): becomes a ${BUILDINGS[d.camp].name} on a spice field, and packs up again.`);
  if (d.repair) a.push(`**Repair:** ${d.repair.rate} HP/s to vehicles, aircraft and structures within ${tiles(d.repair.range)} tiles, for credits.`);
  if (d.hides) a.push('**Hides:** digs into the sand standing still on it; **Dig In** (V) at once. See [Hiding](README.md#hiding-fremen).');
  if (d.air) a.push('**Flies:** crosses any terrain; only anti-air weapons can hit it.');
  return a;
}

// ---- Cards ---------------------------------------------------------------------------------------------------------

function infobox(rows: [string, string | number][]): string {
  return `<table>\n${rows.map(([k, v]) => `<tr><th align="left">${k}</th><td>${v}</td></tr>`).join('\n')}\n</table>`;
}

function card(picture: string, alt: string, box: string): string {
  return `<table><tr>\n<td width="220" align="center" valign="top"><img src="${picture}" width="200" alt="${alt}"></td>\n<td valign="top">\n\n${box}\n\n</td>\n</tr></table>`;
}

function unitCard(f: Faction, t: UnitType): string {
  const d = unitDef(f, t);
  const sh = shieldsFor(f, d);
  const rows: [string, string | number][] = [
    ['Cost', d.rite ? `${d.rite.cost} (rite, from a ${unitDef(f, d.rite.from).name})` : d.cost],
    [d.rite ? 'Rite time' : 'Build time', `${d.rite ? d.rite.time : d.buildTime} s`],
    ...(d.rite ? [] : [['Made at', BUILDINGS[d.producer].name] as [string, string]]),
    ['Requires', req(d.requires)],
    ['Health', d.hp],
    ...(sh ? [['Shields', sh] as [string, number]] : []),
    ['Armor', d.armor ?? 0],
    ['Attributes', d.tags.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')],
    ['Speed', `${tiles(d.speed)} tiles/s`],
    ['Sight', `${tiles(d.sight)} tiles`],
    ...(d.lift !== undefined && unitsOf(f).includes('carryall') ? [['Carryall space', `${d.lift} of 6`] as [string, string]] : []),
  ];
  const vs = versus(f, t);
  const weapons = weaponsOf(d);
  const parts = [
    `### ${d.name}`,
    '',
    card(img(f, t), d.name, infobox(rows)),
    '',
    d.desc,
  ];
  const ab = abilities(f, d);
  if (ab.length) parts.push('', ...ab.map((s) => `- ${s}`));
  if (weapons.length) {
    parts.push('', '| Weapon | Damage | Cooldown (s) | DPS | Range (tiles) | Notes |', '|---|---|---|---|---|---|', ...weapons.map(([n, w]) => weaponRow(n, w)));
  }
  parts.push('', `**Strong against:** ${pickLine(vs.strong, f)}`, '', `**Weak against:** ${pickLine(vs.weak, f)}`);
  return parts.join('\n');
}

function buildingCard(f: Faction, t: BuildingType): string {
  const b = BUILDINGS[t];
  const sh = shieldsFor(f, b);
  const fromCrew = unitsOf(f).some((u) => unitDef(f, u).camp === t);
  const rows: [string, string | number][] = [
    ['Cost', fromCrew ? '– (a Spice Crew sets it up)' : b.cost],
    ['Build time', b.deployed ? 'set up by a unit' : `${b.buildTime} s`],
    ['Requires', req(b.requires)],
    ['Health', b.hp],
    ...(sh ? [['Shields', sh] as [string, number]] : []),
    ['Armor', b.armor ?? STRUCTURE.armor],
    ['Size', `${b.size}×${b.size} tiles`],
  ];
  const extras: string[] = [];
  if (b.weapon) extras.push(`**Gun:** ${damageText(b.weapon)} every ${b.weapon.cooldown} s, range ${tiles(b.weapon.range)} tiles, ground only.`);
  if (b.pad) extras.push(`**Repairs** ${b.pad.slots} units at a time, ${b.pad.rate} HP/s each.`);
  if (b.extract) extras.push(`**Income:** up to ${b.extract.rate} credits/s from the spice within ${tiles(b.extract.radius)} tiles.`);
  if (b.heals) extras.push(`**Heals** Fremen units and structures ${b.heals.rate}× as fast within ${tiles(b.heals.radius)} tiles.`);
  if (b.garrison) extras.push(`**Garrison:** ${b.garrison} infantry.`);
  if (b.onSand) extras.push('Goes on open sand or spice only.');
  if (levelsUp(f, t)) {
    for (const [i, l] of (b.levels ?? []).entries()) {
      const needs = [...(i ? [`${t}${i + 1}` as Req] : []), ...(l.requires ?? [])];
      extras.push(`**${l.name}** (level-up): ${l.cost} credits, ${l.time} s${needs.length ? `, needs ${req(needs)}` : ''}. ${l.desc}`);
    }
  }
  return [`### ${b.name}`, '', card(img(f, t), b.name, infobox(rows)), '', b.desc, ...(extras.length ? ['', ...extras.map((s) => `- ${s}`)] : [])].join('\n');
}

function gallery(f: Faction, types: string[], name: (t: string) => string): string {
  const cells = types.map((t) => `<td align="center" width="96"><a href="#${slug(name(t))}"><img src="${img(f, t)}" width="72" alt=""><br><sub>${name(t)}</sub></a></td>`);
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  return `<table>\n${rows.join('\n')}\n</table>`;
}

// ---- Sections ------------------------------------------------------------------------------------------------------

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
    if (!levelsUp(f, t)) continue;
    for (const [i, l] of (b.levels ?? []).entries()) {
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
  return ['## Tech tree', '', 'Structures (boxes), their level-ups (rounded) and the units they unlock (pills). Dotted arrows are Fremen rites.', '', ...lines].join('\n');
}

function unitSection(f: Faction): string {
  const units = unitsOf(f);
  return [
    '## Units',
    '',
    gallery(f, units, (t) => unitDef(f, t as UnitType).name),
    '',
    'Speed and sight in tiles. Damage is per hit before armor, plus the bonus against targets with that attribute; DPS is base damage over the cooldown. ' +
      '**Strong / weak against** list, from each faction, the unit this one beats (or loses to) most clearly in equal-cost fights in the open ' +
      '(siege units set up first, Infantry Rockets researched). For units that don\'t fight, weak against is what kills them fastest for its price.',
    '',
    units.map((t) => unitCard(f, t)).join('\n\n---\n\n'),
  ].join('\n');
}

function buildingSection(f: Faction): string {
  const list = buildingsOf(f);
  return ['## Structures', '', gallery(f, list, (t) => BUILDINGS[t as BuildingType].name), '', list.map((t) => buildingCard(f, t)).join('\n\n---\n\n')].join('\n');
}

function upgradeSection(f: Faction): string {
  const rows = upgradesOf(f).map((t) => {
    const u = UPGRADES[t];
    const after = u.after ? `${UPGRADES[u.after].name}, ` : '';
    return `| ${u.name} | ${u.cost} | ${u.time} s | ${after}${req(u.requires)} | ${u.desc} |`;
  });
  return [
    '## Research',
    '',
    `Researched one at a time, from the Upgrade tab. Weapons levels add ${WEAPON_STEP.share * 100}% of each hit (bonus included); Armor levels take one more point off every hit.`,
    '',
    '| Upgrade | Cost | Time | Requires | Effect |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function specs(f: Faction): string {
  return [techTree(f), unitSection(f), buildingSection(f), upgradeSection(f)].join('\n\n');
}

const check = process.argv.includes('--check');
let stale = 0;
for (const f of FACTION_LIST) {
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
