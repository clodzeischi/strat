import { PLAYER, TEAM_CSS, type BuildingType, type UnitType, type UpgradeType } from '../config';

// Sidebar card icons: small inline SVGs, team-colored through currentColor.

const C = 'currentColor';
const SAND = '#c9b48a';
const DARK = '#3a3a3e';
const METAL = '#8a8a86';

const STAR = `<polygon points="20,4 24,16 36,16 26,23 30,35 20,27 10,35 14,23 4,16 16,16" fill="#e0902a"/>`;
const SHIELD = `<path d="M20 4 L34 9 L32 24 Q28 32 20 36 Q12 32 8 24 L6 9 Z" fill="${METAL}"/><path d="M20 9 L29 12 L28 23 Q25 29 20 31 Z" fill="${C}"/>`;
/** Roman-numeral pips in the corner for tiered upgrades. */
const tierMark = (n: number) => Array.from({ length: n }, (_, i) => `<rect x="${30 - i * 5}" y="30" width="3" height="8" fill="#fff" stroke="${DARK}" stroke-width="0.8"/>`).join('');

const ICONS: Record<BuildingType | UnitType | UpgradeType, string> = {
  barracks: `<rect x="3" y="27" width="34" height="7" fill="#9c968a"/><rect x="6" y="15" width="28" height="13" fill="${SAND}"/><rect x="5" y="12" width="30" height="4" fill="${C}"/><rect x="16" y="20" width="8" height="8" fill="${DARK}"/><rect x="31" y="3" width="1.5" height="10" fill="${DARK}"/><rect x="32.5" y="3" width="6" height="4" fill="${C}"/><rect x="3" y="29" width="7" height="4" rx="2" fill="#a89060"/><rect x="30" y="29" width="7" height="4" rx="2" fill="#a89060"/>`,
  conyard: `<rect x="3" y="24" width="34" height="10" fill="#9c968a"/><rect x="6" y="14" width="18" height="11" fill="${SAND}"/><rect x="6" y="12" width="18" height="3" fill="${C}"/><rect x="28" y="5" width="2.5" height="20" fill="#e0b030"/><rect x="17" y="5" width="20" height="2.5" fill="#e0b030"/><rect x="35" y="7" width="1" height="8" fill="${DARK}"/>`,
  refinery: `<rect x="3" y="26" width="34" height="8" fill="#9c968a"/><rect x="5" y="15" width="16" height="12" fill="${SAND}"/><rect x="5" y="13" width="16" height="3" fill="${C}"/><rect x="24" y="8" width="8" height="19" fill="${METAL}"/><rect x="24" y="7" width="8" height="3" fill="${C}"/><rect x="33" y="14" width="5" height="13" fill="${METAL}"/>`,
  factory: `<rect x="2" y="26" width="36" height="8" fill="#9c968a"/><rect x="5" y="16" width="30" height="11" fill="${SAND}"/><polygon points="5,16 20,8 35,16" fill="${C}"/><rect x="14" y="19" width="12" height="8" fill="${DARK}"/>`,
  harvester: `<rect x="4" y="26" width="32" height="5" fill="${DARK}"/><rect x="5" y="20" width="30" height="6" fill="${METAL}"/><rect x="6" y="11" width="17" height="10" fill="#d08a3a"/><rect x="25" y="12" width="9" height="9" fill="${C}"/>`,
  infantry: `<circle cx="20" cy="9" r="4" fill="#d8b38a"/><rect x="15" y="13" width="10" height="13" fill="${C}"/><rect x="15" y="26" width="4" height="9" fill="${DARK}"/><rect x="21" y="26" width="4" height="9" fill="${DARK}"/><rect x="22" y="17" width="13" height="2" fill="${DARK}"/>`,
  trike: `<circle cx="9" cy="28" r="5" fill="${DARK}"/><circle cx="31" cy="28" r="5" fill="${DARK}"/><rect x="8" y="19" width="24" height="6" fill="${C}"/><rect x="12" y="14" width="8" height="5" fill="${DARK}"/><rect x="22" y="15" width="13" height="2" fill="${DARK}"/>`,
  tank: `<rect x="3" y="25" width="34" height="8" rx="3" fill="${DARK}"/><rect x="5" y="19" width="30" height="7" fill="${C}" opacity="0.7"/><rect x="11" y="12" width="14" height="8" fill="${C}"/><rect x="24" y="14.5" width="14" height="2.5" fill="${METAL}"/>`,
  rocket: `<rect x="3" y="27" width="34" height="7" rx="3" fill="${DARK}"/><rect x="5" y="21" width="30" height="7" fill="${C}" opacity="0.7"/><g transform="rotate(-25 18 18)"><rect x="8" y="12" width="20" height="8" fill="${C}"/><circle cx="28" cy="14" r="1.6" fill="${DARK}"/><circle cx="28" cy="18" r="1.6" fill="${DARK}"/></g>`,
  rockets: `<rect x="6" y="17" width="22" height="6" rx="1" fill="${METAL}"/><polygon points="28,15 36,20 28,25" fill="#e0902a"/><rect x="2" y="18" width="5" height="4" fill="${DARK}"/><rect x="12" y="23" width="3" height="8" fill="${DARK}"/><circle cx="20" cy="9" r="4" fill="#d8b38a"/>`,
  weapons1: STAR + tierMark(1),
  weapons2: STAR + tierMark(2),
  armor1: SHIELD + tierMark(1),
  armor2: SHIELD + tierMark(2),
  nitro: `<circle cx="9" cy="29" r="5" fill="${DARK}"/><circle cx="29" cy="29" r="5" fill="${DARK}"/><rect x="8" y="20" width="22" height="6" fill="${C}"/><polygon points="2,12 14,12 10,16 22,16 8,22 11,17 2,17" fill="#e0b030"/><rect x="24" y="16" width="12" height="2" fill="${DARK}"/>`,
  harvest: `<rect x="6" y="18" width="28" height="14" fill="#d08a3a"/><polygon points="20,4 30,16 24,16 24,22 16,22 16,16 10,16" fill="#7cff7c"/>`,
};

/** Green chevrons over the building icon mark a level-2 upgrade. */
const CHEVRON = `<polyline points="26,14 32,8 38,14" fill="none" stroke="#7cff7c" stroke-width="2.5"/><polyline points="26,20 32,14 38,20" fill="none" stroke="#7cff7c" stroke-width="2.5"/>`;
export const ALL_ICONS = { ...ICONS, conyard2: ICONS.conyard + CHEVRON, factory2: ICONS.factory + CHEVRON };
export type IconKey = keyof typeof ALL_ICONS;

/** A card icon as an SVG element string, in the player's team color. */
export function icon(key: IconKey): string {
  return `<svg viewBox="0 0 40 40" style="color:${TEAM_CSS[PLAYER]}">${ALL_ICONS[key]}</svg>`;
}
