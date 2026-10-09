import { TEAM_CSS, type Team, type BuildingType, type UnitType, type UpgradeType } from '../config';

// Command card icons: small inline SVGs, team-colored through currentColor.

const C = 'currentColor';
const SAND = '#c9b48a';
const DARK = '#3a3a3e';
const METAL = '#8a8a86';
const GOLD = '#c8a040';
const LACQ = '#2e2a30';
const ROBE = '#9a7a54';
const IBAD = '#3a7cff';
/** A hooded Fremen head and robe, the base of the faction's infantry icons. */
const FREMEN = (robe: string) => `<path d="M14 15 Q20 3 26 15 L27 27 L13 27 Z" fill="${robe}"/><rect x="13" y="19" width="14" height="3" fill="${C}"/><rect x="17" y="10" width="6" height="2" fill="${IBAD}"/><rect x="15" y="27" width="4" height="9" fill="#55504a"/><rect x="21" y="27" width="4" height="9" fill="#55504a"/>`;

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

  // ---- Corrino ----
  fab: `<rect x="2" y="26" width="36" height="8" fill="#9c968a"/><rect x="4" y="17" width="32" height="10" fill="${SAND}"/><path d="M6 17 Q14 5 22 17 Z" fill="${C}"/><rect x="24" y="14" width="11" height="3" fill="${LACQ}"/><rect x="14" y="20" width="12" height="7" fill="${DARK}"/><rect x="13" y="18.5" width="14" height="1.5" fill="${GOLD}"/>`,
  tleilaxu: `<rect x="3" y="28" width="34" height="6" fill="${SAND}"/><rect x="8" y="20" width="24" height="8" fill="${LACQ}"/><rect x="13" y="12" width="14" height="8" fill="${C}"/><rect x="13" y="11" width="14" height="1.5" fill="${GOLD}"/><polygon points="20,2 24,7 20,11 16,7" fill="#6cff9a"/><rect x="3" y="18" width="4" height="10" rx="2" fill="#6cff9a"/><rect x="33" y="18" width="4" height="10" rx="2" fill="#6cff9a"/>`,
  pad: `<rect x="3" y="27" width="34" height="6" fill="${LACQ}"/><rect x="8" y="29" width="24" height="1.5" fill="${GOLD}"/><rect x="4" y="25" width="4" height="3" fill="${C}"/><rect x="32" y="25" width="4" height="3" fill="${C}"/><rect x="5" y="6" width="2.5" height="20" fill="${METAL}"/><rect x="5" y="6" width="20" height="2.5" fill="${METAL}"/><rect x="22" y="8" width="1.5" height="8" fill="${DARK}"/><path d="M18 18 l5 -2 l5 2 l-1 4 l-8 0 Z" fill="#7cff7c"/>`,
  turret: `<rect x="9" y="27" width="22" height="8" fill="${SAND}"/><rect x="14" y="22" width="12" height="5" fill="${LACQ}"/><rect x="11" y="13" width="15" height="9" fill="${C}"/><rect x="11" y="12" width="15" height="1.5" fill="${GOLD}"/><rect x="25" y="15" width="12" height="2" fill="${METAL}"/><rect x="25" y="18.5" width="12" height="2" fill="${METAL}"/>`,
  trooper: `<circle cx="18" cy="10" r="4" fill="#d8b38a"/><rect x="14" y="5" width="8" height="3" fill="${DARK}"/><rect x="13" y="14" width="11" height="13" fill="${C}" opacity="0.75"/><rect x="14" y="27" width="4" height="9" fill="${DARK}"/><rect x="20" y="27" width="4" height="9" fill="${DARK}"/><rect x="8" y="14" width="26" height="4" rx="1.5" fill="#5d6234"/><rect x="33" y="14.5" width="3" height="3" fill="#e0902a"/>`,
  sardaukar: `<circle cx="20" cy="9" r="5" fill="${LACQ}"/><rect x="21" y="8" width="4" height="2" fill="${GOLD}"/><rect x="14" y="14" width="12" height="13" fill="${LACQ}"/><rect x="14" y="18" width="12" height="3" fill="${C}"/><rect x="15" y="27" width="4" height="9" fill="${DARK}"/><rect x="21" y="27" width="4" height="9" fill="${DARK}"/><rect x="24" y="17" width="10" height="2" fill="${DARK}"/><rect x="4" y="22" width="12" height="1.5" fill="${METAL}"/>`,
  razor: `<circle cx="9" cy="29" r="4.5" fill="${DARK}"/><circle cx="30" cy="29" r="4.5" fill="${DARK}"/><rect x="5" y="20" width="30" height="6" fill="${C}"/><rect x="13" y="11" width="2" height="9" fill="${METAL}"/><rect x="13" y="11" width="10" height="2" fill="${METAL}"/><rect x="4" y="16" width="8" height="4" rx="2" fill="${GOLD}"/><rect x="28" y="17" width="7" height="2" fill="${DARK}"/><polygon points="35,15 40,18 35,21" fill="#ff8a2a"/>`,
  devastator: `<rect x="2" y="26" width="36" height="9" rx="3" fill="${DARK}"/><rect x="3" y="18" width="34" height="9" fill="${C}" opacity="0.6"/><rect x="2" y="16" width="6" height="5" fill="#7cf0ff"/><rect x="11" y="10" width="16" height="9" fill="${C}"/><rect x="11" y="9" width="16" height="1.5" fill="${GOLD}"/><rect x="26" y="11.5" width="13" height="2" fill="${METAL}"/><rect x="26" y="15" width="13" height="2" fill="${METAL}"/>`,
  raider: `<rect x="5" y="18" width="30" height="5" fill="${C}"/><rect x="28" y="16" width="7" height="5" fill="#223344"/><polygon points="12,18 22,18 14,5 10,5" fill="${METAL}"/><polygon points="12,23 22,23 14,36 10,36" fill="${METAL}"/><rect x="2" y="15" width="5" height="4" fill="${LACQ}"/><rect x="22" y="24" width="10" height="3" fill="${DARK}"/>`,
  artillery: `<rect x="3" y="27" width="34" height="7" rx="3" fill="${DARK}"/><rect x="5" y="21" width="30" height="7" fill="${C}" opacity="0.6"/><rect x="7" y="13" width="15" height="9" fill="${C}"/><rect x="7" y="12" width="15" height="1.5" fill="${GOLD}"/><g transform="rotate(-20 20 15)"><rect x="20" y="14" width="18" height="2.5" fill="${METAL}"/></g>`,
  cWeapons: STAR + tierMark(1),
  cArmor: SHIELD + tierMark(1),
  cShields: `<circle cx="20" cy="20" r="15" fill="#5ab8ff" opacity="0.35"/><circle cx="20" cy="20" r="15" fill="none" stroke="#5ab8ff" stroke-width="2.5"/><rect x="13" y="16" width="14" height="10" fill="${C}"/>` + tierMark(1),
  cHarvest: `<rect x="6" y="18" width="28" height="14" fill="#d08a3a"/><polygon points="20,4 30,16 24,16 24,22 16,22 16,16 10,16" fill="#7cff7c"/>`,
  // ---- Fremen ----
  warrior: FREMEN(ROBE) + `<rect x="22" y="17" width="14" height="2" fill="${DARK}"/><rect x="9" y="20" width="2" height="6" fill="#e8e0c8"/>`,
  fedaykin: FREMEN('#5c4a3a') + `<rect x="22" y="16" width="9" height="5" fill="#55504a"/><circle cx="33" cy="18.5" r="3" fill="#9ad8ff"/><path d="M36 14 Q39 18.5 36 23" stroke="#9ad8ff" stroke-width="1.5" fill="none"/>`,
  crew: FREMEN('#b08a5a') + `<rect x="4" y="13" width="9" height="5" rx="2" fill="#d88a3a"/><rect x="31" y="4" width="2" height="30" fill="${METAL}"/><rect x="29" y="31" width="6" height="4" fill="#d08a3a"/>`,
  sietch: `<rect x="2" y="27" width="36" height="8" fill="#a89268"/><polygon points="4,27 9,13 18,10 26,6 33,14 36,27" fill="#a89268"/><polygon points="9,27 12,17 20,15 28,18 31,27" fill="#8e7a56"/><path d="M15 27 Q20 18 25 27 Z" fill="${DARK}"/><rect x="25" y="1" width="1.5" height="8" fill="${DARK}"/><rect x="26.5" y="1" width="6" height="4" fill="${C}"/>`,
  thumper: `<rect x="3" y="33" width="34" height="4" fill="${SAND}"/><line x1="12" y1="33" x2="20" y2="8" stroke="${ROBE}" stroke-width="2.5"/><line x1="28" y1="33" x2="20" y2="8" stroke="${ROBE}" stroke-width="2.5"/><rect x="18.5" y="10" width="3" height="20" fill="${METAL}"/><rect x="16" y="28" width="8" height="4" fill="${DARK}"/><rect x="16" y="6" width="8" height="3" fill="${C}"/><path d="M6 30 Q4 26 6 22 M34 30 Q36 26 34 22" stroke="#e0902a" stroke-width="1.5" fill="none"/>`,
  camp: `<rect x="2" y="30" width="36" height="6" fill="#d08a3a"/><polygon points="4,30 14,12 24,30" fill="${ROBE}"/><rect x="12" y="23" width="4" height="7" fill="${DARK}"/><rect x="28" y="8" width="3" height="22" fill="${METAL}"/><rect x="24" y="10" width="11" height="2" fill="${METAL}"/><rect x="5" y="28" width="18" height="2" fill="${C}"/>`,
  fWeapons: STAR + tierMark(1),
  fArmor: SHIELD + tierMark(1),
  fHarvest: `<rect x="2" y="26" width="36" height="8" fill="#d08a3a"/><polygon points="6,26 14,12 22,26" fill="${ROBE}"/><polygon points="29,4 37,14 32,14 32,22 26,22 26,14 21,14" fill="#7cff7c"/>`,
  stillsuit: FREMEN('#55504a') + `<path d="M31 6 Q36 13 31 16 Q26 13 31 6 Z" fill="#5ab8ff"/>`,
  sandwalk: `<rect x="2" y="30" width="36" height="6" fill="${SAND}"/><path d="M4 30 Q10 26 16 30 Q22 26 28 30 Q34 26 38 30" stroke="#a89268" stroke-width="1.5" fill="none"/>` + `<g transform="translate(-4 -4)">${FREMEN(ROBE)}</g><polygon points="28,12 38,16 28,20" fill="#e0b030"/>`,
  ambush: `<rect x="2" y="24" width="36" height="12" fill="${SAND}"/><path d="M14 24 Q20 14 26 24 Z" fill="${ROBE}"/><rect x="17" y="18" width="6" height="2" fill="${IBAD}"/><polygon points="20,2 24,12 34,10 26,16 30,22 20,17 10,22 14,16 6,10 16,12" fill="#e05a40" opacity="0.85"/>`,
  flame: `<circle cx="9" cy="30" r="4" fill="${DARK}"/><rect x="5" y="22" width="16" height="5" fill="${C}"/><rect x="19" y="21" width="5" height="2" fill="${DARK}"/><path d="M24 22 Q30 12 38 16 Q32 18 36 24 Q30 22 24 22 Z" fill="#ff8a2a"/><path d="M24 22 Q29 17 33 19 Q29 20 24 22 Z" fill="#ffe080"/>`,
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
  deploy: `<rect x="3" y="30" width="34" height="4" fill="#9c968a"/><rect x="9" y="20" width="18" height="8" fill="${C}"/><rect x="8" y="19" width="20" height="1.5" fill="${GOLD}"/><g transform="rotate(-35 22 20)"><rect x="22" y="18.5" width="17" height="3" fill="${METAL}"/></g><polygon points="6,28 2,33 9,33" fill="${DARK}"/><polygon points="30,28 27,33 34,33" fill="${DARK}"/>`,
  detonate: `<circle cx="20" cy="22" r="12" fill="#e0902a"/><circle cx="20" cy="22" r="7" fill="#ffe080"/><polygon points="20,2 23,12 17,12" fill="#e05a40"/><polygon points="36,10 29,17 26,13" fill="#e05a40"/><polygon points="4,10 14,13 11,17" fill="#e05a40"/><rect x="18" y="16" width="4" height="9" fill="${DARK}"/><rect x="18" y="27" width="4" height="3" fill="${DARK}"/>`,
  lock: `<circle cx="20" cy="20" r="13" fill="none" stroke="#e0902a" stroke-width="2.5"/><circle cx="20" cy="20" r="6" fill="none" stroke="#e0902a" stroke-width="2"/><rect x="18.5" y="2" width="3" height="8" fill="#e0902a"/><rect x="18.5" y="30" width="3" height="8" fill="#e0902a"/><rect x="2" y="18.5" width="8" height="3" fill="#e0902a"/><rect x="30" y="18.5" width="8" height="3" fill="#e0902a"/><circle cx="20" cy="20" r="2" fill="#e05a40"/>`,
  mine: `<rect x="3" y="31" width="34" height="3" fill="#9c968a"/><ellipse cx="20" cy="27" rx="11" ry="4" fill="${C}"/><rect x="9" y="22" width="22" height="5" fill="${C}"/><ellipse cx="20" cy="22" rx="11" ry="4" fill="${LACQ}"/><circle cx="20" cy="21" r="2" fill="#e05a40"/><line x1="12" y1="10" x2="16" y2="16" stroke="#e05a40" stroke-width="2"/><line x1="28" y1="10" x2="24" y2="16" stroke="#e05a40" stroke-width="2"/><line x1="20" y1="7" x2="20" y2="14" stroke="#e05a40" stroke-width="2"/>`,
  mend: `<rect x="3" y="28" width="34" height="6" fill="#9c968a"/><rect x="6" y="15" width="20" height="14" fill="${SAND}"/><rect x="5" y="12" width="22" height="4" fill="${C}"/><g transform="rotate(40 29 15)"><rect x="27" y="8" width="4" height="16" fill="${METAL}"/><rect x="24" y="4" width="10" height="6" rx="2" fill="${METAL}"/><rect x="27.5" y="3" width="3" height="4" fill="#3a3a3e"/></g>`,
  setup: `<rect x="2" y="30" width="36" height="6" fill="#d08a3a"/><polygon points="6,30 16,12 26,30" fill="${ROBE}"/><rect x="14" y="23" width="4" height="7" fill="${DARK}"/><polygon points="30,4 36,10 33,10 33,18 27,18 27,10 24,10" fill="#7cff7c" transform="rotate(180 30 11)"/>`,
  pack: `<rect x="2" y="30" width="36" height="6" fill="#d08a3a"/><rect x="6" y="20" width="18" height="8" rx="3" fill="${ROBE}"/><rect x="6" y="23" width="18" height="2" fill="${C}"/><polygon points="30,4 36,10 33,10 33,18 27,18 27,10 24,10" fill="#7cff7c"/>`,
  hold: `<rect x="5" y="31" width="30" height="4" fill="#9c968a"/><path d="M12 30 L12 13 Q12 9 15 9 L15 22 L15 7 Q15 4 18 4 Q21 4 21 7 L21 21 L21 6 Q21 3 24 3 Q27 3 27 7 L27 22 L27 10 Q27 7 30 8 L30 24 Q30 30 24 30 Z" fill="#e9dcc6" stroke="${DARK}" stroke-width="1.2"/>`,
  thump: `<rect x="2" y="32" width="36" height="5" fill="#d08a3a"/><line x1="11" y1="32" x2="18" y2="9" stroke="${ROBE}" stroke-width="2.5"/><line x1="25" y1="32" x2="18" y2="9" stroke="${ROBE}" stroke-width="2.5"/><rect x="16.5" y="11" width="3" height="18" fill="${METAL}"/><rect x="14" y="27" width="8" height="4" fill="${DARK}"/><path d="M26 18 Q31 22 26 26 M30 15 Q37 22 30 29" stroke="#e0902a" stroke-width="2" fill="none"/><rect x="14" y="7" width="8" height="3" fill="${C}"/>`,
  unload: `<rect x="3" y="28" width="34" height="6" fill="#9c968a"/><rect x="5" y="13" width="18" height="16" fill="${SAND}"/><rect x="4" y="10" width="20" height="4" fill="${C}"/><rect x="11" y="20" width="6" height="9" fill="${DARK}"/><rect x="24" y="18" width="7" height="5" fill="#e0b030"/><polygon points="30,13 38,20.5 30,28" fill="#e0b030"/>`,
};

export const ALL_ICONS = {
  ...ICONS, ...COMMANDS,
  conyard2: ICONS.conyard + CHEVRON, factory2: ICONS.factory + CHEVRON, barracks2: ICONS.barracks + CHEVRON, fab2: ICONS.fab + CHEVRON,
  sietch2: ICONS.sietch + CHEVRON,
};
export type IconKey = keyof typeof ALL_ICONS;

/** A card icon as an SVG element string, in the player's team color. */
export function icon(key: IconKey, team: Team): string {
  return `<svg viewBox="0 0 40 40" style="color:${TEAM_CSS[team]}">${ALL_ICONS[key]}</svg>`;
}
