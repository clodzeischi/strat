import { FACTION_LIST, FACTIONS, MAP_SIZE_NAMES, MAP_SIZES, UNITS, type Faction, type MapSize, type Side, type Team } from '../config';
import type { RoomInfo, SlotInfo } from '../net/protocol';
import type { Difficulty, Game, TeamStats } from '../game/game';
import { heroTitle } from '../game/heroes';

export interface MenuHandlers {
  /** Start a game against the computer: in a 2v2, `ally` is the computer ally's faction, `enemy` both enemies'. */
  onPlay: (difficulty: Difficulty, size: MapSize, faction: Faction, enemy: EnemyChoice, mode: MatchMode, ally: EnemyChoice) => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onFps: (show: boolean) => void;
  /** A volume slider moved (`done` once it's let go). */
  onVolume: (channel: Channel, level: number, done: boolean) => void;
  /** The player's answer to the enemy's surrender offer. */
  onSurrenderAnswer: (accept: boolean) => void;
  /** Multiplayer page opened (connect and list games) or closed. */
  onLobby: (open: boolean) => void;
  /** Host a game: in a 2v2, `difficulty` is the computer players' in the empty places. */
  onHost: (name: string, size: MapSize, faction: Faction, mode: MatchMode, difficulty: Difficulty) => void;
  /** Join an open game; in a 2v2, on the host's side or against it. */
  onJoin: (code: string, name: string, faction: Faction, side: 'with' | 'against') => void;
  /** The host starts a 2v2 that isn't full yet. */
  onStart: () => void;
  onCancelHost: () => void;
  /** Online: give up the match. */
  onSurrender: () => void;
  /** Replays page opened: list what there is to watch. */
  onReplays: () => void;
  /** Watch a replay: one from the list (by key), or a file the player picked (its text). */
  onWatch: (from: { key: string } | { text: string }) => void;
  /** End screen: download the match just played. */
  onSaveReplay: () => void;
}

/** A replay on the Replays page. */
export interface ReplayEntry {
  key: string;
  title: string;
  detail: string;
}

const FPS_KEY = 'strat.showFps';
const VOLUME_KEY = 'strat.volume';
const SIZE_KEY = 'strat.mapSize';
const NAME_KEY = 'strat.name';
const FACTION_KEY = 'strat.faction';
const ENEMY_KEY = 'strat.enemy';
const MODE_KEY = 'strat.mode';
const ALLY_KEY = 'strat.ally';
const MP_DIFF_KEY = 'strat.mpDifficulty';

/** A computer player's faction, or a random one each game. */
export type EnemyChoice = Faction | 'random';
/** One against one, or two (you and a computer ally) against two. */
export type MatchMode = '1v1' | '2v2';

function loadChoice(key: string, fallback: EnemyChoice): EnemyChoice {
  try {
    const v = localStorage.getItem(key);
    return v === 'random' || FACTION_LIST.includes(v as Faction) ? (v as EnemyChoice) : fallback;
  } catch {
    return fallback;
  }
}

/** Remembers a menu choice (if storage is unavailable, it just won't persist). */
function save(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
}

export function loadEnemy(): EnemyChoice {
  return loadChoice(ENEMY_KEY, 'atreides');
}

export function loadAlly(): EnemyChoice {
  return loadChoice(ALLY_KEY, 'random');
}

function loadMpDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem(MP_DIFF_KEY);
    return v === 'hard' || v === 'brutal' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function loadMode(): MatchMode {
  try {
    return localStorage.getItem(MODE_KEY) === '2v2' ? '2v2' : '1v1';
  } catch {
    return '1v1';
  }
}

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
  save(FACTION_KEY, v);
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

/** What the player sets the volume of. */
export type Channel = 'effects' | 'units' | 'announcer' | 'music';
const CHANNELS: { key: Channel; name: string }[] = [
  { key: 'effects', name: 'Effects' },
  { key: 'units', name: 'Units' },
  { key: 'announcer', name: 'Announcer' },
  { key: 'music', name: 'Music' },
];
export type Volumes = Record<Channel, number>;

/** The volumes set last time, 0 to 1 (all full at first). */
export function loadVolumes(): Volumes {
  const v: Volumes = { effects: 1, units: 1, announcer: 1, music: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}') as Partial<Volumes>;
    for (const { key } of CHANNELS) {
      const x = saved[key];
      if (typeof x === 'number' && x >= 0 && x <= 1) v[key] = x;
    }
  } catch {
    // Storage unavailable or garbled: full volume.
  }
  return v;
}

function saveVolumes(v: Volumes): void {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(v));
  } catch {
    // Storage unavailable: the settings just won't persist.
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
  private replayFile = document.getElementById('replay-file') as HTMLInputElement;
  showFps = loadFps();
  mapSize = loadMapSize();
  faction = loadFaction();
  enemy = loadEnemy();
  mode = loadMode();
  ally = loadAlly();
  /** Online 2v2: the computer players' difficulty. */
  mpDifficulty = loadMpDifficulty();
  volumes = loadVolumes();

  constructor(private h: MenuHandlers) {
    this.showMapSize();
    this.showFaction();
    this.nameInput.value = loadName();
    this.nameInput.addEventListener('change', () => saveName(this.playerName));
    for (const box of document.querySelectorAll<HTMLInputElement>('.fps-check')) {
      box.checked = this.showFps;
      box.addEventListener('change', () => this.setFps(box.checked));
    }
    for (const el of document.querySelectorAll<HTMLElement>('.volumes')) this.buildVolumes(el);

    this.title.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || btn.disabled) return;
      if (btn.dataset.size) {
        this.mapSize = Number(btn.dataset.size) as MapSize;
        saveMapSize(this.mapSize);
        // A 2v2 needs four spawn spots: Small has two.
        if (this.mapSize < 96 && this.mode === '2v2') this.setMode('1v1');
        this.showMapSize();
      } else if (btn.dataset.faction) {
        this.faction = btn.dataset.faction as Faction;
        saveFaction(this.faction);
        this.showFaction();
      } else if (btn.dataset.enemy) {
        this.enemy = btn.dataset.enemy as EnemyChoice;
        save(ENEMY_KEY, this.enemy);
        this.showFaction();
      } else if (btn.dataset.ally) {
        this.ally = btn.dataset.ally as EnemyChoice;
        save(ALLY_KEY, this.ally);
        this.showFaction();
      } else if (btn.dataset.mode) {
        this.setMode(btn.dataset.mode as MatchMode);
        if (this.mode === '2v2' && this.mapSize < 96) {
          this.mapSize = 96;
          saveMapSize(this.mapSize);
          this.showMapSize();
        }
      } else if (btn.dataset.difficulty) this.h.onPlay(btn.dataset.difficulty as Difficulty, this.mapSize, this.faction, this.enemy, this.mode, this.ally);
      else if (btn.dataset.mpdiff) {
        this.mpDifficulty = btn.dataset.mpdiff as Difficulty;
        save(MP_DIFF_KEY, this.mpDifficulty);
        this.showFaction();
      } else if (btn.dataset.join) this.h.onJoin(btn.dataset.join, this.playerName, this.faction, btn.dataset.side === 'with' ? 'with' : 'against');
      else if (btn.dataset.action === 'start') this.h.onStart();
      else if (btn.dataset.action === 'play') this.page('difficulty');
      else if (btn.dataset.action === 'multiplayer') {
        this.page('multiplayer');
        this.h.onLobby(true);
      } else if (btn.dataset.action === 'host') this.h.onHost(this.playerName, this.mapSize, this.faction, this.mode, this.mpDifficulty);
      else if (btn.dataset.action === 'cancel-host') this.h.onCancelHost();
      else if (btn.dataset.watch) this.h.onWatch({ key: btn.dataset.watch });
      else if (btn.dataset.action === 'replays') {
        this.page('replays');
        this.setReplayStatus('');
        this.h.onReplays();
      } else if (btn.dataset.action === 'open-replay') this.replayFile.click();
      else if (btn.dataset.action === 'settings') this.page('settings');
      else if (btn.dataset.action === 'controls') this.page('controls');
      else if (btn.dataset.action === 'back') {
        if (this.currentPage === 'multiplayer') this.h.onLobby(false);
        this.page('main');
      }
    });
    this.replayFile.addEventListener('change', () => {
      const file = this.replayFile.files?.[0];
      this.replayFile.value = '';
      if (file) void file.text().then((text) => this.h.onWatch({ text }));
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
        else if (action === 'save-replay') this.h.onSaveReplay();
      });
    }
  }

  /** The volume sliders (on the title's Settings page and in the pause menu, kept in step). */
  private buildVolumes(el: HTMLElement): void {
    for (const { key, name } of CHANNELS) {
      const row = document.createElement('label');
      row.className = 'volume';
      row.innerHTML = `<span class="volume-name">${name}</span><input type="range" min="0" max="100" step="5" /><span class="volume-value"></span>`;
      const slider = row.querySelector('input')!;
      slider.dataset.channel = key;
      slider.value = String(Math.round(this.volumes[key] * 100));
      row.querySelector('.volume-value')!.textContent = `${slider.value}%`;
      slider.addEventListener('input', () => this.setVolume(key, Number(slider.value) / 100, false));
      slider.addEventListener('change', () => {
        this.setVolume(key, Number(slider.value) / 100, true);
        // Let go of it, so the arrow keys pan the map again rather than move it.
        slider.blur();
      });
      el.appendChild(row);
    }
  }

  private setVolume(channel: Channel, level: number, done: boolean): void {
    this.volumes[channel] = level;
    for (const s of document.querySelectorAll<HTMLInputElement>(`.volumes input[data-channel="${channel}"]`)) {
      s.value = String(Math.round(level * 100));
      s.parentElement!.querySelector('.volume-value')!.textContent = `${s.value}%`;
    }
    if (done) saveVolumes(this.volumes);
    this.h.onVolume(channel, level, done);
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
    for (const b of this.title.querySelectorAll<HTMLButtonElement>('[data-enemy]')) b.classList.toggle('picked', b.dataset.enemy === this.enemy);
    for (const b of this.title.querySelectorAll<HTMLButtonElement>('[data-ally]')) b.classList.toggle('picked', b.dataset.ally === this.ally);
    for (const b of this.title.querySelectorAll<HTMLButtonElement>('[data-mode]')) b.classList.toggle('picked', b.dataset.mode === this.mode);
    for (const el of this.title.querySelectorAll<HTMLElement>('.ally-pick, .mp-ai-pick')) el.hidden = this.mode !== '2v2';
    for (const b of this.title.querySelectorAll<HTMLButtonElement>('[data-mpdiff]')) b.classList.toggle('picked', b.dataset.mpdiff === this.mpDifficulty);
  }

  private setMode(mode: MatchMode): void {
    this.mode = mode;
    save(MODE_KEY, mode);
    this.showFaction();
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
    const entry = (r: RoomInfo): string => {
      const what = `${FACTIONS[r.faction]?.name ?? ''} · ${MAP_SIZE_NAMES[r.size]} map · ${r.mode === '2v2' ? '2 vs 2' : '1 vs 1'} · ${r.code}`;
      if (r.mode !== '2v2') return `<button class="mbtn diff" data-join="${r.code}">${escapeHtml(r.host)} <span>${what}</span></button>`;
      // A 2v2: a button per side with room left.
      const sides = [r.open.with && ['with', `With ${escapeHtml(r.host)}`], r.open.against && ['against', `Against ${escapeHtml(r.host)}`]].filter(Boolean) as string[][];
      return sides.map(([side, label]) => `<button class="mbtn diff" data-join="${r.code}" data-side="${side}">${label} <span>${what}</span></button>`).join('');
    };
    this.rooms.innerHTML = rooms.length ? rooms.map(entry).join('') : '<p class="note">No open games yet. Host one, or wait for someone to.</p>';
  }

  /** In a room being filled (hosting it or joined): who's in, and for the host of a 2v2, the Start button. */
  showRoom(room: { code: string; mode: '1v1' | '2v2'; slots: (SlotInfo | null)[]; you: number; host: boolean }): void {
    const team = room.mode === '2v2';
    document.getElementById('mp-wait-head')!.textContent = team ? 'Gathering players' : 'Waiting for an opponent';
    document.getElementById('mp-wait-note')!.innerHTML = !room.host
      ? 'Waiting for the host to start the game.'
      : team
        ? `Your game <b>${room.code}</b> is listed under Open games. Start it whenever you like: the computer takes the empty places. It starts by itself once all four are taken.`
        : `Your game <b>${room.code}</b> is listed under Open games for anyone on this server. It starts as soon as someone joins.`;
    const side = (s: number) => room.slots.map((x, t) => ({ x, t })).filter(({ t }) => t % 2 === s);
    const line = ({ x, t }: { x: SlotInfo | null; t: number }) =>
      x ? `${escapeHtml(x.name)}${t === room.you ? ' (you)' : ''} <span>${FACTIONS[x.faction].name}</span>` : '<em>Open (computer)</em>';
    document.getElementById('mp-slots')!.innerHTML = team
      ? [0, 1].map((s) => `<div class="mp-side"><div class="mp-side-head">${s === room.you % 2 ? 'Your side' : 'Against'}</div>${side(s).map((e) => `<div class="mp-slot">${line(e)}</div>`).join('')}</div>`).join('')
      : '';
    const start = this.title.querySelector<HTMLElement>('[data-action="start"]')!;
    start.hidden = !(team && room.host);
    (start as HTMLButtonElement).disabled = room.slots.filter(Boolean).length < 2;
    this.page('hosting');
  }

  /** A line under the multiplayer page (connection trouble, errors). */
  setLobbyStatus(text: string): void {
    this.status.textContent = text;
  }

  /** Hosting: waiting for someone to join. */
  showHosting(code: string): void {
    // (Gone once a room update has rewritten the note, which names the code itself.)
    const el = document.getElementById('mp-code');
    if (el) el.textContent = code;
    this.page('hosting');
  }

  /** Replays page: the replays to watch. */
  showReplays(list: ReplayEntry[]): void {
    document.getElementById('replay-list')!.innerHTML = list.length
      ? list.map((r) => `<button class="mbtn diff stack" data-watch="${escapeHtml(r.key)}">${escapeHtml(r.title)} <span>${escapeHtml(r.detail)}</span></button>`).join('')
      : '<p class="note">No replays yet. Finish a game and it shows up here.</p>';
  }

  /** A line under the Replays page (a file that couldn't be read). */
  setReplayStatus(text: string): void {
    document.getElementById('replay-status')!.textContent = text;
  }

  setSurrenderOffer(open: boolean): void {
    this.surrender.hidden = !open;
  }

  /**
   * `names`: what to call each team in the table (online: the players' names; offline: You, Ally, Enemy). `online`:
   * the match was against people, so there's no Play again.
   */
  showEnd(game: Game, apm: number, names: string[], online = false, note = '', canSave = true): void {
    const PLAYER = game.localTeam;
    const side = game.sideOf(PLAYER);
    const won = game.winner === side;
    const result = this.end.querySelector('.result')!;
    result.textContent = won ? 'Victory' : 'Defeat';
    result.className = `result ${won ? 'victory' : 'defeat'}`;
    const s = game.surrendered;
    const how = note ? `${note}  ·  ` : s === PLAYER ? 'You surrendered  ·  ' : s !== null && game.allied(s, PLAYER) ? 'Your ally surrendered  ·  ' : s !== null ? 'Enemy surrendered  ·  ' : '';
    // You first, then your allies, then the enemies.
    const order = [PLAYER, ...game.teamsOn(side).filter((t) => t !== PLAYER), ...game.teamsOn((1 - side) as Side)];
    const sideNames = (x: Side) => game.teamsOn(x).map((t) => FACTIONS[game.teams[t].faction].name).join(' & ');
    const vs = `${sideNames(side)} vs ${sideNames((1 - side) as Side)}`;
    const others = order.slice(1).filter((t) => game.hostile(t, PLAYER)).map((t) => names[t]);
    const against = `${online ? `Online vs ${others.join(' & ')}` : `${DIFFICULTY_NAMES[game.difficulty]} AI`}  ·  ${vs}`;
    this.end.querySelector<HTMLElement>('[data-action="restart"]')!.hidden = online;
    this.end.querySelector<HTMLElement>('[data-action="save-replay"]')!.hidden = !canSave;
    this.end.querySelector('.sub')!.textContent = `${how}${formatTime(game.time)}  ·  ${against}  ·  ${MAP_SIZE_NAMES[game.map.size as MapSize]} map  ·  seed ${game.map.seed}`;

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
    const cls = (t: Team) => (t === PLAYER ? 'you' : game.allied(t, PLAYER) ? 'ally' : 'foe');
    this.end.querySelector('.stats')!.innerHTML =
      `<tr><th></th>${order.map((t) => `<th class="${cls(t)}">${escapeHtml(names[t])}</th>`).join('')}</tr>` +
      rows.map(([label, f]) => `<tr><td>${label}</td>${order.map((t) => `<td>${f(game.teams[t].stats, t)}</td>`).join('')}</tr>`).join('');

    const card = (team: Team, label: string, cls: string): string => {
      const u = game.teams[team].hero;
      if (!u) return `<div class="hero ${cls}"><div class="label">${label}</div><div class="detail">No one distinguished themselves.</div></div>`;
      const t = heroTitle(u);
      const fate = u.dead ? 'Fell in battle' : 'Survived';
      return `<div class="hero ${cls}"><div class="label">${label}</div><div class="name">${t.rank} ${t.name}</div>` +
        `<div class="epithet">"${t.epithet}"</div><div class="detail">${UNITS[u.type].name} · ${u.kills} kill${u.kills === 1 ? '' : 's'} · ${fate}</div></div>`;
    };
    // The enemy's hero: whichever enemy unit made the most kills.
    const foes = game.teamsOn((1 - side) as Side);
    const nemesis = foes.reduce((a, t) => ((game.teams[t].hero?.kills ?? -1) > (game.teams[a].hero?.kills ?? -1) ? t : a), foes[0]);
    const nemesisLabel = online ? `${escapeHtml(names[nemesis])}'s nemesis` : 'Enemy nemesis';
    this.end.querySelector('.heroes')!.innerHTML = card(PLAYER, 'Hero of the battle', 'you') + card(nemesis, nemesisLabel, 'foe');
    this.end.hidden = false;
  }
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
