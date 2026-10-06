import { MAP_SIZE_NAMES, MAP_SIZES, PLAYER, ENEMY, UNITS, type MapSize, type Team } from '../config';
import type { Difficulty, Game, TeamStats } from '../game/game';
import { heroTitle } from '../game/heroes';

export interface MenuHandlers {
  onPlay: (difficulty: Difficulty, size: MapSize) => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onFps: (show: boolean) => void;
  /** The player's answer to the enemy's surrender offer. */
  onSurrenderAnswer: (accept: boolean) => void;
}

const FPS_KEY = 'strat.showFps';
const SIZE_KEY = 'strat.mapSize';

/** The map size picked last time, so the menu remembers it. */
export function loadMapSize(): MapSize {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return (MAP_SIZES as readonly number[]).includes(v) ? (v as MapSize) : 64;
  } catch {
    return 64;
  }
}

function saveMapSize(v: MapSize): void {
  try {
    localStorage.setItem(SIZE_KEY, String(v));
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
}

function loadFps(): boolean {
  try {
    return localStorage.getItem(FPS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveFps(v: boolean): void {
  try {
    localStorage.setItem(FPS_KEY, v ? '1' : '0');
  } catch {
    // Storage unavailable: the setting just won't persist.
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const DIFFICULTY_NAMES: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard', brutal: 'Brutal' };

/** Title screen, in-game pause menu and end-of-game stats. */
export class Menus {
  readonly title = document.getElementById('title')!;
  readonly pause = document.getElementById('pause')!;
  readonly end = document.getElementById('end')!;
  readonly surrender = document.getElementById('surrender')!;
  showFps = loadFps();
  mapSize = loadMapSize();

  constructor(private h: MenuHandlers) {
    this.showMapSize();
    for (const box of document.querySelectorAll<HTMLInputElement>('.fps-check')) {
      box.checked = this.showFps;
      box.addEventListener('change', () => this.setFps(box.checked));
    }

    this.title.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || btn.disabled) return;
      if (btn.dataset.size) {
        this.mapSize = Number(btn.dataset.size) as MapSize;
        saveMapSize(this.mapSize);
        this.showMapSize();
      } else if (btn.dataset.difficulty) this.h.onPlay(btn.dataset.difficulty as Difficulty, this.mapSize);
      else if (btn.dataset.action === 'play') this.page('difficulty');
      else if (btn.dataset.action === 'controls') this.page('controls');
      else if (btn.dataset.action === 'back') this.page('main');
    });
    this.surrender.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('button')?.dataset.action;
      if (action === 'accept' || action === 'decline') this.h.onSurrenderAnswer(action === 'accept');
    });
    for (const screen of [this.pause, this.end]) {
      screen.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).closest('button')?.dataset.action;
        if (action === 'resume') this.h.onResume();
        else if (action === 'restart') this.h.onRestart();
        else if (action === 'quit') this.h.onQuit();
      });
    }
  }

  private setFps(v: boolean): void {
    this.showFps = v;
    saveFps(v);
    for (const box of document.querySelectorAll<HTMLInputElement>('.fps-check')) box.checked = v;
    this.h.onFps(v);
  }

  private showMapSize(): void {
    for (const b of this.title.querySelectorAll<HTMLButtonElement>('[data-size]')) {
      b.classList.toggle('picked', Number(b.dataset.size) === this.mapSize);
    }
  }

  private page(name: string): void {
    for (const p of this.title.querySelectorAll<HTMLElement>('.menu-page')) p.hidden = p.dataset.page !== name;
  }

  showTitle(): void {
    this.page('main');
    this.title.hidden = false;
  }

  hideTitle(): void {
    this.title.hidden = true;
  }

  setPaused(open: boolean): void {
    this.pause.hidden = !open;
  }

  setSurrenderOffer(open: boolean): void {
    this.surrender.hidden = !open;
  }

  showEnd(game: Game, apm: number): void {
    const won = game.winner === PLAYER;
    const result = this.end.querySelector('.result')!;
    result.textContent = won ? 'Victory' : 'Defeat';
    result.className = `result ${won ? 'victory' : 'defeat'}`;
    const how = game.surrendered === ENEMY ? 'Enemy surrendered  ·  ' : '';
    this.end.querySelector('.sub')!.textContent = `${how}${formatTime(game.time)}  ·  ${DIFFICULTY_NAMES[game.difficulty]}  ·  ${MAP_SIZE_NAMES[game.map.size as MapSize]} map  ·  seed ${game.map.seed}`;

    const you = game.teams[PLAYER];
    const foe = game.teams[ENEMY];
    const rows: [string, (s: TeamStats, t: Team) => string | number][] = [
      ['Units built', (s) => s.unitsBuilt],
      ['Units lost', (s) => s.unitsLost],
      ['Enemy units killed', (s) => s.unitsKilled],
      ['Structures built', (s) => s.structuresBuilt],
      ['Structures lost', (s) => s.structuresLost],
      ['Structures destroyed', (s) => s.structuresDestroyed],
      ['Spice harvested', (s) => Math.round(s.spiceHarvested).toLocaleString()],
      ['Credits spent', (s) => Math.round(s.creditsSpent).toLocaleString()],
      ['Upgrades researched', (_, t) => game.teams[t].upgrades.size],
      ['APM', (_, t) => (t === PLAYER ? Math.round(apm) : '—')],
    ];
    this.end.querySelector('.stats')!.innerHTML =
      `<tr><th></th><th class="you">You</th><th class="foe">Enemy</th></tr>` +
      rows.map(([label, f]) => `<tr><td>${label}</td><td>${f(you.stats, PLAYER)}</td><td>${f(foe.stats, ENEMY)}</td></tr>`).join('');

    const card = (team: Team, label: string, cls: string): string => {
      const u = game.teams[team].hero;
      if (!u) return `<div class="hero ${cls}"><div class="label">${label}</div><div class="detail">No one distinguished themselves.</div></div>`;
      const t = heroTitle(u);
      const fate = u.dead ? 'Fell in battle' : 'Survived';
      return `<div class="hero ${cls}"><div class="label">${label}</div><div class="name">${t.rank} ${t.name}</div>` +
        `<div class="epithet">"${t.epithet}"</div><div class="detail">${UNITS[u.type].name} · ${u.kills} kill${u.kills === 1 ? '' : 's'} · ${fate}</div></div>`;
    };
    this.end.querySelector('.heroes')!.innerHTML = card(PLAYER, 'Hero of the battle', 'you') + card(ENEMY, 'Enemy nemesis', 'foe');
    this.end.hidden = false;
  }
}
