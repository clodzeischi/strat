import type { Unit } from './entities';

// Desert-warrior flavored names and ranks for the end-of-game "hero of the battle".

const FIRST = [
  'Idris', 'Kael', 'Sorrel', 'Vashti', 'Orin', 'Tamsin', 'Malik', 'Ysolde', 'Darian', 'Jessa', 'Corvan', 'Esmar',
  'Faroukh', 'Rhiannon', 'Tariq', 'Zahra', 'Bastien', 'Nadira', 'Hesper', 'Kasim', 'Lirael', 'Osric', 'Seren', 'Yusef',
];
const LAST = [
  'Varrus', 'Kesh', 'Ordane', 'Thalmar', 'Desh', 'Morrow', 'Sarn', 'Quell', 'Harrow', 'Vex', 'Alcazar', 'Dunmore',
  'Ibarra', 'Korrin', 'Maelor', 'Navarre', 'Ostrand', 'Rask', 'Sabri', 'Tolland',
];
const EPITHETS = [
  'Sandstorm', 'the Unburied', 'Spice-Eyes', 'Duneshaker', 'the Patient Blade', 'Sietch-Born', 'Old Thunder',
  'the Dry Wind', 'Wormcaller', 'the Last Shade', 'Ironwill', 'Red Dawn',
];

/** Rank by kill count, from rank-and-file up to Supreme Bashar. */
function rank(kills: number): string {
  if (kills >= 25) return 'Supreme Bashar';
  if (kills >= 15) return 'Bashar';
  if (kills >= 10) return 'Captain';
  if (kills >= 6) return 'Levenbrech';
  if (kills >= 3) return 'Sergeant';
  return 'Trooper';
}

/** Deterministic per unit, so the same unit always gets the same name. */
export function heroTitle(u: Unit): { rank: string; name: string; epithet: string } {
  const h = (u.id * 2654435761) >>> 0;
  return {
    rank: rank(u.kills),
    name: `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`,
    epithet: EPITHETS[(h >>> 16) % EPITHETS.length],
  };
}
