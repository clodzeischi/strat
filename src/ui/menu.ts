import { FACTION_LIST, FACTIONS, MAP_SIZE_NAMES, MAP_SIZES, UNITS, type Faction, type MapSize, type Team } from '../config';
import type { RoomInfo } from '../net/protocol';
import type { Difficulty, Game, TeamStats } from '../game/game';
import { heroTitle } from '../game/heroes';

export interface MenuHandlers {
  onPlay: (difficulty: Difficulty, size: MapSize, faction: Faction) => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onFps: (show: boolean) => void;
  /** The player's answer to the enemy's surrender offer. */
  onSurrenderAnswer: (accept: boolean) => void;
  /** Multiplayer page opened (connect and list games) or closed. */
  onLobby: (open: boolean) => void;
  onHost: (name: string, size: MapSize, faction: Faction) => void;
  onJoin: (code: string, name: string, faction: Faction) => void;
  onCancelHost: () => void;
  /** Online: give up the match. */
  onSurrender: () => void;
}

const FPS_KEY = 'strat.showFps';
const SIZE_KEY = 'strat.mapSize';
const NAME_KEY = 'strat.name';
const FACTION_KEY = 'strat.faction';

/** The faction picked last time. */
export function loadFaction(): Faction {
  try {
    const v = localStorage.getItem(FACTION_KEY);
    return FACTION_LIST.includes(v as Faction) ? (v as Faction) : 'atreides';
  } catch {
    return 'atreides';
  }
}

function saveFaction(v: Faction): void {
  try {
    localStorage.setItem(FACTION_KEY, v);
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
}

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

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'Player';
  } catch {
    return 'Player';
  }
}

function saveName(v: string): void {
  try {
    localStorage.setItem(NAME_KEY, v);
  } catch {
    // Storage unavailable: the name just won't persist.
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
  private nameInput = document.getElementById('mp-name') as HTMLInputElement;
  private rooms = document.getElementById('mp-rooms')!;
  private status = document.getElementById('mp-status')!;
  showFps = loadFps();
  mapSize = loadMapSize();
  faction = loadFaction();

  constructor(private h: MenuHandlers) {
    this.showMapSize();
    this.showFaction();
    this.nameInput.value = loadName();
    this.nameInput.addEventListener('change', () => saveName(this.playerName));
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
      } else if (btn.dataset.faction) {
        this.faction = btn.dataset.faction as Faction;
        saveFaction(this.faction);
        this.showFaction();
      } else if (btn.dataset.difficulty) this.h.onPlay(btn.dataset.difficulty as Difficulty, this.mapSize, this.faction);
      else if (btn.dataset.join) this.h.onJoin(btn.dataset.join, this.playerName, this.faction);
      else if (btn.dataset.action === 'play') this.page('difficulty');
      else if (btn.dataset.action === 'multiplayer') {
        this.page('multiplayer');
        this.h.onLobby(true);
      } else if (btn.dataset.action === 'host') this.h.onHost(this.playerName, this.mapSize, this.faction);
      else if (btn.dataset.action === 'cancel-host') this.h.onCancelHost();
      else if (btn.dataset.action === 'controls') this.page('controls');
      else if (btn.dataset.action === 'back') {
        if (this.currentPage === 'multiplayer') this.h.onLobby(false);
        this.page('main');
      }
    });
    this.surrender.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('button')?.dataset.action;
      if (action === 'accept' || action === 'decline') this.h.onSurrenderAnswer(action === 'accept');
    });
    for (const screen of [this.pause, this.end]) {
      screen.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).closest('button')?.dataset.action;
        if (action === 'resume') this.h.onResume();
        else if (action === 'surrender') this.h.onSurrender();
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

  private showFaction(): void {
    for (const b of this.title.querySelectorAll<HTMLButtonElement>('[data-faction]')) b.classList.toggle('picked', b.dataset.faction === this.faction);
  }

  private currentPage = 'main';

  get playerName(): string {
    return this.nameInput.value.trim().slice(0, 16) || 'Player';
  }

  page(name: string): void {
    this.currentPage = name;
    for (const p of this.title.querySelectorAll<HTMLElement>('.menu-page')) p.hidden = p.dataset.page !== name;
  }

  showTitle(): void {
    this.page('main');
    this.title.hidden = false;
  }

  hideTitle(): void {
    this.title.hidden = true;
  }

  /** Opens or closes the in-game menu; online, it says the game goes on and offers Surrender instead of Restart. */
  setPaused(open: boolean, online = false): void {
    this.pause.hidden = !open;
    this.pause.querySelector('h2')!.textContent = online ? 'Menu' : 'Paused';
    this.pause.querySelector<HTMLElement>('.online-note')!.hidden = !online;
    this.pause.querySelector<HTMLElement>('[data-action="restart"]')!.hidden = online;
    this.pause.querySelector<HTMLElement>('[data-action="surrender"]')!.hidden = !online;
  }

  /** Multiplayer page: the open games on the server. */
  showRooms(rooms: RoomInfo[]): void {
    this.rooms.innerHTML = rooms.length
      ? rooms.map((r) => `<button class="mbtn diff" data-join="${r.code}">${escapeHtml(r.host)} <span>${FACTIONS[r.faction]?.name ?? ''} · ${MAP_SIZE_NAMES[r.size]} map · ${r.code}</span></button>`).join('')
      : '<p class="note">No open games yet. Host one, or wait for someone to.</p>';
  }

  /** A line under the multiplayer page (connection trouble, errors). */
  setLobbyStatus(text: string): void {
    this.status.textContent = text;
  }

  /** Hosting: waiting for someone to join. */
  showHosting(code: string): void {
    document.getElementById('mp-code')!.textContent = code;
    this.page('hosting');
  }

  setSurrenderOffer(open: boolean): void {
    this.surrender.hidden = !open;
  }

  /** `opponent`: the other player's name online, or null against the computer. */
  showEnd(game: Game, apm: number, opponent: string | null = null, note = ''): void {
    const PLAYER = game.localTeam;
    const ENEMY = (1 - PLAYER) as Team;
    const won = game.winner === PLAYER;
    const result = this.end.querySelector('.result')!;
    result.textContent = won ? 'Victory' : 'Defeat';
    result.className = `result ${won ? 'victory' : 'defeat'}`;
    const how = note ? `${note}  ·  ` : game.surrendered === ENEMY ? 'Enemy surrendered  ·  ' : game.surrendered === PLAYER ? 'You surrendered  ·  ' : '';
    const against = opponent === null ? DIFFICULTY_NAMES[game.difficulty] : `Online vs ${opponent}`;
    this.end.querySelector<HTMLElement>('[data-action="restart"]')!.hidden = opponent !== null;
    this.end.querySelector('.sub')!.textContent = `${how}${formatTime(game.time)}  ·  ${against}  ·  ${MAP_SIZE_NAMES[game.map.size as MapSize]} map  ·  seed ${game.map.seed}`;

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
      `<tr><th></th><th class="you">You</th><th class="foe">${opponent ? escapeHtml(opponent) : 'Enemy'}</th></tr>` +
      rows.map(([label, f]) => `<tr><td>${label}</td><td>${f(you.stats, PLAYER)}</td><td>${f(foe.stats, ENEMY)}</td></tr>`).join('');

    const card = (team: Team, label: string, cls: string): string => {
      const u = game.teams[team].hero;
      if (!u) return `<div class="hero ${cls}"><div class="label">${label}</div><div class="detail">No one distinguished themselves.</div></div>`;
      const t = heroTitle(u);
      const fate = u.dead ? 'Fell in battle' : 'Survived';
      return `<div class="hero ${cls}"><div class="label">${label}</div><div class="name">${t.rank} ${t.name}</div>` +
        `<div class="epithet">"${t.epithet}"</div><div class="detail">${UNITS[u.type].name} · ${u.kills} kill${u.kills === 1 ? '' : 's'} · ${fate}</div></div>`;
    };
    this.end.querySelector('.heroes')!.innerHTML = card(PLAYER, 'Hero of the battle', 'you') + card(ENEMY, opponent ? `${escapeHtml(opponent)}'s nemesis` : 'Enemy nemesis', 'foe');
    this.end.hidden = false;
  }
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
