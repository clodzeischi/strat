import { FACTIONS, type Team } from '../config';
import type { Game } from '../game/game';
import { TICK } from '../net/lockstep';
import type { Match, Replay } from '../net/replay';

/** Whose eyes the replay is watched through: everything, or one side's fog of war. */
export type ReplayView = 'all' | Team;

const SPEEDS = [0.5, 1, 2, 4, 8, 16];
/** Real seconds per frame spent fast-forwarding to a seek target, so the page stays responsive. */
const SEEK_BUDGET = 0.03;

function clock(ticks: number): string {
  const s = Math.floor(ticks * TICK);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Plays a replay back: the controls in the command card's corner (pause, speed, a timeline to seek on, whose
 * vision to watch with) and both sides' numbers. Seeking forward runs the game fast to that moment; seeking back
 * needs a fresh game, so `onRestart` reloads the page into the replay at that tick.
 */
export class ReplayViewer {
  speed = 1;
  view: ReplayView = 'all';
  /** Called to watch from an earlier moment (in ticks): the game can't run backward, so it starts over. */
  onRestart: (tick: number) => void = () => {};
  /** Called when the view changes (whose units can be selected changes with it). */
  onView: () => void = () => {};
  private el = document.createElement('div');
  private timeline: HTMLInputElement;
  private timeEl: HTMLElement;
  private statsEl: HTMLElement;
  private noteEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  /** Fast-forwarding to this tick (null when playing normally). */
  private target: number | null = null;
  private acc = 0;
  private scrubbing = false;
  private statsAge = 1;
  private shownEnd = false;
  private drift = '';

  constructor(private game: Game, private match: Match, private replay: Replay, private isPaused: () => boolean, private setPausedFlag: (p: boolean) => void) {
    const f = replay.factions.map((x) => FACTIONS[x].name);
    const who = replay.names.map((n, t) => (n ? `${f[t]}: ${n}` : '')).filter(Boolean).join(' · ');
    this.el.id = 'replay-bar';
    this.el.innerHTML = `
      <div class="rp-head"><span class="rp-tag">REPLAY</span> ${f[0]} <span class="rp-vs">vs</span> ${f[1]}</div>
      <div class="rp-who">${esc(who)}</div>
      <div class="rp-row">
        <button class="rp-btn rp-play" title="Pause / play (P)">❚❚</button>
        <input class="rp-timeline" type="range" min="0" max="${replay.ticks}" step="20" value="0" />
        <span class="rp-time"></span>
      </div>
      <div class="rp-row rp-speeds">${SPEEDS.map((s) => `<button class="rp-btn" data-speed="${s}">${s === 0.5 ? '½' : s}×</button>`).join('')}</div>
      <div class="rp-row rp-views">
        <button class="rp-btn" data-view="all">Both</button>
        <button class="rp-btn" data-view="0">${f[0]}</button>
        <button class="rp-btn" data-view="1">${f[1]}</button>
      </div>
      <table class="rp-stats"></table>
      <div class="rp-note"></div>`;
    document.getElementById('hud')!.appendChild(this.el);
    this.timeline = this.el.querySelector('.rp-timeline')!;
    this.timeEl = this.el.querySelector('.rp-time')!;
    this.statsEl = this.el.querySelector('.rp-stats')!;
    this.noteEl = this.el.querySelector('.rp-note')!;
    this.playBtn = this.el.querySelector('.rp-play')!;

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b === this.playBtn) this.setPausedFlag(!this.isPaused());
      else if (b.dataset.speed) this.setSpeed(Number(b.dataset.speed));
      else if (b.dataset.view) this.setView(b.dataset.view === 'all' ? 'all' : (Number(b.dataset.view) as Team));
      b.blur();
    });
    this.timeline.addEventListener('input', () => {
      this.scrubbing = true;
      this.timeEl.textContent = `${clock(Number(this.timeline.value))} / ${clock(replay.ticks)}`;
    });
    this.timeline.addEventListener('change', () => {
      this.scrubbing = false;
      this.seek(Number(this.timeline.value));
      this.timeline.blur();
    });
    match.onDrift = (tick) => {
      this.drift = `This replay no longer matches the game from ${clock(tick)} on: it was recorded on a different version, so what follows may differ from what happened.`;
      console.warn(`Replay drifted at tick ${tick}`);
    };
    this.setSpeed(1);
    this.setView('all');
  }

  /** Whether the replay has reached its end. */
  get done(): boolean {
    return this.game.winner !== null || this.game.ticks >= this.replay.ticks;
  }

  setSpeed(s: number): void {
    this.speed = s;
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === s);
  }

  setView(v: ReplayView): void {
    this.view = v;
    this.game.revealAll = v === 'all';
    this.game.localTeam = v === 'all' ? 0 : v;
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-view]')) b.classList.toggle('on', b.dataset.view === String(v));
    this.onView();
  }

  /** Jumps to a tick: forward by running the game fast, back by starting over. */
  seek(tick: number): void {
    tick = Math.max(0, Math.min(this.replay.ticks, Math.round(tick)));
    if (tick < this.game.ticks) this.onRestart(tick);
    else this.target = tick;
  }

  /** Called every frame with the real time passed; runs the ticks due. Returns how far into the next tick (0-1). */
  advance(dt: number): number {
    if (this.target !== null) {
      const start = performance.now();
      while (!this.done && this.game.ticks < this.target && performance.now() - start < SEEK_BUDGET * 1000) this.match.step();
      if (this.done || this.game.ticks >= this.target) this.target = null;
      this.acc = 0;
    } else if (!this.isPaused() && !this.done) {
      // At most a quarter second of game per frame at 1×, so a slow frame doesn't snowball.
      this.acc = Math.min(this.acc + dt * this.speed, Math.max(0.25, this.speed * 0.1));
      while (this.acc >= TICK && !this.done) {
        this.match.step();
        this.acc -= TICK;
      }
    }
    this.show(dt);
    return this.done || this.target !== null ? 1 : this.acc / TICK;
  }

  private show(dt: number): void {
    const g = this.game;
    if (!this.scrubbing) {
      this.timeline.value = String(g.ticks);
      this.timeEl.textContent = `${clock(g.ticks)} / ${clock(this.replay.ticks)}`;
    }
    this.playBtn.textContent = this.isPaused() || this.done ? '▶' : '❚❚';
    this.el.classList.toggle('seeking', this.target !== null);
    let note = '';
    if (this.target !== null) note = `Fast-forwarding to ${clock(this.target)}…`;
    else if (g.winner !== null) {
      const win = FACTIONS[g.teams[g.winner].faction].name;
      note = g.surrendered !== null ? `${FACTIONS[g.teams[g.surrendered].faction].name} surrendered. ${win} win.` : `${win} win.`;
    } else if (this.done) note = 'End of the recording.';
    this.noteEl.textContent = [note, this.drift].filter(Boolean).join(' ');

    // Four times a second, and once more at the end so the final numbers show.
    this.statsAge += dt;
    if (this.statsAge < 0.25 && this.target === null && !(this.done && !this.shownEnd)) return;
    this.statsAge = 0;
    this.shownEnd = this.done;
    const gatherer = (type: string) => type === 'harvester' || type === 'crew';
    const army = (t: Team) => g.units.filter((u) => u.team === t && !u.dead && !gatherer(u.type) && !u.def.air).length;
    const workers = (t: Team) => g.units.filter((u) => u.team === t && !u.dead && gatherer(u.type)).length;
    const rows: [string, (t: Team) => string | number][] = [
      ['Credits', (t) => Math.floor(g.teams[t].credits).toLocaleString()],
      ['Army', army],
      ['Harvesters', workers],
      ['Structures', (t) => g.buildings.filter((b) => b.team === t && !b.dead).length],
      ['Spice mined', (t) => Math.round(g.teams[t].stats.spiceHarvested).toLocaleString()],
      ['Kills', (t) => g.teams[t].stats.unitsKilled],
      ['Upgrades', (t) => g.teams[t].upgrades.size],
    ];
    const head = this.replay.factions.map((f, t) => `<th class="t${t}">${FACTIONS[f].name}</th>`).join('');
    this.statsEl.innerHTML = `<tr><th></th>${head}</tr>` + rows.map(([l, f]) => `<tr><td>${l}</td><td>${f(0)}</td><td>${f(1)}</td></tr>`).join('');
  }
}

function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
