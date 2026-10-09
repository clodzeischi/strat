import { TEAM_CSS, type Team, type BuildingType, type UnitType, type UpgradeType } from '../config';

// Command card icons: small inline SVGs, team-colored through currentColor.

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
  bunker: `<rect x="3" y="28" width="34" height="6" fill="#9c968a"/><rect x="7" y="13" width="26" height="16" fill="${SAND}"/><rect x="5" y="10" width="30" height="4" fill="${SAND}"/><rect x="8" y="9" width="24" height="2" fill="${C}"/><rect x="11" y="18" width="18" height="2.5" fill="${DARK}"/><rect x="17" y="23" width="6" height="6" fill="${DARK}"/><rect x="4" y="27" width="8" height="4" rx="2" fill="#a89060"/><rect x="28" y="27" width="8" height="4" rx="2" fill="#a89060"/>`,
  conyard: `<rect x="3" y="24" width="34" height="10" fill="#9c968a"/><rect x="6" y="14" width="18" height="11" fill="${SAND}"/><rect x="6" y="12" width="18" height="3" fill="${C}"/><rect x="28" y="5" width="2.5" height="20" fill="#e0b030"/><rect x="17" y="5" width="20" height="2.5" fill="#e0b030"/><rect x="35" y="7" width="1" height="8" fill="${DARK}"/>`,
  refinery: `<rect x="3" y="26" width="34" height="8" fill="#9c968a"/><rect x="5" y="15" width="16" height="12" fill="${SAND}"/><rect x="5" y="13" width="16" height="3" fill="${C}"/><rect x="24" y="8" width="8" height="19" fill="${METAL}"/><rect x="24" y="7" width="8" height="3" fill="${C}"/><rect x="33" y="14" width="5" height="13" fill="${METAL}"/>`,
  factory: `<rect x="2" y="26" width="36" height="8" fill="#9c968a"/><rect x="5" y="16" width="30" height="11" fill="${SAND}"/><polygon points="5,16 20,8 35,16" fill="${C}"/><rect x="14" y="19" width="12" height="8" fill="${DARK}"/>`,
  hitech: `<rect x="2" y="27" width="36" height="7" fill="#9c968a"/><path d="M4 27 Q4 11 20 11 Q36 11 36 27 Z" fill="${SAND}"/><rect x="12" y="19" width="16" height="8" fill="${DARK}"/><path d="M8 15 Q20 8 32 15" stroke="${C}" stroke-width="2.5" fill="none"/><rect x="31" y="4" width="5" height="12" fill="${SAND}"/><rect x="30" y="3" width="7" height="3" fill="${C}"/>`,
  repair: `<circle cx="9" cy="30" r="4" fill="${DARK}"/><circle cx="19" cy="30" r="4" fill="${DARK}"/><circle cx="31" cy="30" r="4" fill="${DARK}"/><rect x="4" y="22" width="32" height="5" fill="${METAL}"/><rect x="26" y="13" width="9" height="10" fill="${C}"/><rect x="29" y="10" width="3" height="3" fill="#ffa020"/><line x1="10" y1="22" x2="24" y2="7" stroke="${C}" stroke-width="2.5"/><circle cx="25" cy="7" r="2.5" fill="#ffe080"/>`,
  carryall: `<rect x="6" y="17" width="28" height="6" fill="${METAL}"/><rect x="8" y="16" width="20" height="2" fill="${C}"/><rect x="31" y="17" width="5" height="5" fill="#223344"/><rect x="11" y="8" width="3" height="24" fill="#6c6a64"/><rect x="24" y="8" width="3" height="24" fill="#6c6a64"/><rect x="8" y="5" width="9" height="5" rx="2" fill="${DARK}"/><rect x="21" y="5" width="9" height="5" rx="2" fill="${DARK}"/><rect x="8" y="30" width="9" height="5" rx="2" fill="${DARK}"/><rect x="21" y="30" width="9" height="5" rx="2" fill="${DARK}"/>`,
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
/** Unit commands on the command card. */
const COMMANDS = {
  attack: `<circle cx="20" cy="20" r="11" fill="none" stroke="#e05a40" stroke-width="3"/><circle cx="20" cy="20" r="2.5" fill="#e05a40"/><rect x="18.5" y="3" width="3" height="9" fill="#e05a40"/><rect x="18.5" y="28" width="3" height="9" fill="#e05a40"/><rect x="3" y="18.5" width="9" height="3" fill="#e05a40"/><rect x="28" y="18.5" width="9" height="3" fill="#e05a40"/>`,
  stop: `<polygon points="14,4 26,4 36,14 36,26 26,36 14,36 4,26 4,14" fill="#b8402e" stroke="#e9dcc6" stroke-width="2"/><rect x="11" y="18" width="18" height="4" fill="#e9dcc6"/>`,
  drop: `<rect x="6" y="6" width="28" height="5" fill="${METAL}"/><rect x="8" y="5" width="20" height="2" fill="${C}"/><rect x="17" y="13" width="6" height="10" fill="#e0b030"/><polygon points="11,22 29,22 20,32" fill="#e0b030"/><rect x="5" y="34" width="30" height="3" fill="#9c968a"/>`,
  rally: `<rect x="6" y="30" width="28" height="4" fill="#9c968a"/><path d="M8 31 Q14 22 22 26" stroke="#7cff7c" stroke-width="2" stroke-dasharray="3 2" fill="none"/><rect x="23" y="6" width="2.5" height="26" fill="${DARK}"/><polygon points="25.5,6 36,10.5 25.5,15" fill="#7cff7c"/>`,
  salvage: `<rect x="3" y="28" width="34" height="6" fill="#9c968a"/><rect x="6" y="15" width="20" height="14" fill="${SAND}"/><rect x="5" y="12" width="22" height="4" fill="${C}"/><circle cx="29" cy="14" r="8" fill="#e0b030" stroke="${DARK}" stroke-width="1.5"/><text x="29" y="18.5" font-size="12" font-weight="bold" text-anchor="middle" fill="${DARK}" font-family="sans-serif">$</text>`,
  unload: `<rect x="3" y="28" width="34" height="6" fill="#9c968a"/><rect x="5" y="13" width="18" height="16" fill="${SAND}"/><rect x="4" y="10" width="20" height="4" fill="${C}"/><rect x="11" y="20" width="6" height="9" fill="${DARK}"/><rect x="24" y="18" width="7" height="5" fill="#e0b030"/><polygon points="30,13 38,20.5 30,28" fill="#e0b030"/>`,
};

export const ALL_ICONS = { ...ICONS, ...COMMANDS, conyard2: ICONS.conyard + CHEVRON, factory2: ICONS.factory + CHEVRON };
export type IconKey = keyof typeof ALL_ICONS;

/** A card icon as an SVG element string, in the player's team color. */
export function icon(key: IconKey, team: Team): string {
  return `<svg viewBox="0 0 40 40" style="color:${TEAM_CSS[team]}">${ALL_ICONS[key]}</svg>`;
}
