import { FACTION_LIST, MAP_SIZES, type Faction, type MapSize, type Side, type Team } from '../config';
import type { AI } from '../game/ai';
import { createAI } from '../game/brutal';
import type { Difficulty, Game } from '../game/game';
import { Lockstep, TICK, type RecordedCommand } from './lockstep';

/** Replays store a state checksum this often (in ticks: every 10 s), so playback can tell if it has drifted. */
export const REPLAY_HASH_EVERY = 200;

/**
 * A recorded match. The game is deterministic, so a match is its map, its sides and the commands the people gave:
 * the computer players are run again from the same state and make the same moves. An AI-against-AI game has no
 * commands at all.
 */
export interface Replay {
  v: 1;
  seed: number;
  size: MapSize;
  factions: Faction[];
  /** Each team's side (a 2v2: [0, 1, 0, 1]). Missing in older replays, which were all 1v1. */
  sides?: Side[];
  /** Each team's computer player (its difficulty), or null for a person. */
  ai: (Difficulty | null)[];
  /** Computer players that took over for people who left, from a tick on. */
  takeovers?: Takeover[];
  names: string[];
  commands: RecordedCommand[];
  /** `game.hash()` at ticks 0, REPLAY_HASH_EVERY, 2 × REPLAY_HASH_EVERY, … */
  hashes: number[];
  /** How long the match ran, and how it ended. */
  ticks: number;
  /** The side that won. */
  winner: Side | null;
  surrendered: Team | null;
  /** When it was played (ISO date), for the file list. */
  date: string;
}

/** A computer player taking a team over from a tick on (its person left). */
export interface Takeover {
  team: Team;
  tick: number;
  ai: Difficulty;
}

/**
 * Runs a match's simulation: the lockstep, the computer players and a recording of it. The browser, the sims and
 * replay playback all go through this, so a replay is played back exactly as it was recorded.
 */
export class Match {
  readonly lockstep: Lockstep;
  readonly ais: (AI | null)[];
  /** Takeovers so far, and ones scheduled for a tick still to come. */
  readonly takeovers: Takeover[] = [];
  readonly hashes: number[] = [];
  /** Playback: the first tick at which the game no longer matches the recording, if it has drifted. */
  driftedAt: number | null = null;
  /** Playback: called once when the game drifts from the recording. */
  onDrift: (tick: number) => void = () => {};
  private expected: number[] | null = null;
  /** The tick count when the game was decided. */
  private endedAt: number | null = null;

  /**
   * `ai`: each team's computer player, or null for a person. `team`: the side this screen plays (online: whose
   * commands it sends). With `net`, it's an online match.
   */
  /** `remotes`: online, the other people's teams. */
  constructor(
    readonly game: Game, readonly ai: (Difficulty | null)[], team: Team = 0, net: ConstructorParameters<typeof Lockstep>[2] = null,
    remotes: Team[] = [],
  ) {
    this.lockstep = new Lockstep(game, team, net, remotes);
    this.ais = ai.map((d, t) => (d ? createAI(game, t as Team, d) : null));
    ai.forEach((d, t) => (game.teams[t].human = !d));
    // When a computer player offers to surrender to another computer player, it's accepted (a person answers with
    // the 'acceptSurrender' command instead).
    const offer = game.onSurrenderOffer;
    game.onSurrenderOffer = (t) => {
      if (game.teams.every((o) => !game.hostile(o.team, t) || this.ais[o.team])) game.acceptSurrender(t);
      else offer(t);
    };
    // A frame can run a tick or two past the end before the screen notices: the recording stops at the end.
    this.lockstep.onStepped = () => {
      if (game.winner !== null) this.endedAt ??= game.ticks;
    };
    this.lockstep.onTick = () => {
      if (this.endedAt === null && game.ticks % REPLAY_HASH_EVERY === 0) this.checkpoint();
      for (const k of this.takeovers) {
        if (k.tick !== game.ticks) continue;
        this.ais[k.team] = createAI(game, k.team, k.ai);
        game.teams[k.team].human = false;
      }
      for (const a of this.ais) a?.update(TICK);
    };
  }

  /** Sets the match up to play back a replay. */
  static playback(game: Game, replay: Replay): Match {
    const m = new Match(game, replay.ai);
    m.expected = replay.hashes;
    m.lockstep.play(replay.commands);
    for (const k of replay.takeovers ?? []) m.takeOver(k.team, k.ai, k.tick);
    return m;
  }

  /**
   * A computer player takes a team over from `tick` on (online: its person left; every machine schedules the same
   * tick, see `Lockstep.drop`).
   */
  takeOver(team: Team, ai: Difficulty, tick: number): void {
    this.takeovers.push({ team, tick, ai });
  }

  /** Runs one tick (offline). */
  step(): void {
    this.lockstep.step();
  }

  /** The match so far, as a replay. */
  replay(names: string[]): Replay {
    const g = this.game;
    return {
      v: 1, seed: g.map.seed, size: g.map.size as MapSize, factions: g.teams.map((t) => t.faction), sides: g.teams.map((t) => t.side), ai: this.ai,
      takeovers: this.takeovers.filter((k) => k.tick < (this.endedAt ?? Infinity)), names,
      commands: this.lockstep.record.filter((c) => c.tick < (this.endedAt ?? Infinity)), hashes: this.hashes, ticks: this.endedAt ?? g.ticks, winner: g.winner, surrendered: g.surrendered,
      date: new Date().toISOString(),
    };
  }

  private checkpoint(): void {
    const h = this.game.hash();
    const i = this.hashes.length;
    this.hashes.push(h);
    if (this.expected && this.driftedAt === null && i < this.expected.length && this.expected[i] !== h) {
      this.driftedAt = this.game.ticks;
      this.onDrift(this.game.ticks);
    }
  }
}

/** Reads a replay file, or throws with what's wrong with it. */
export function parseReplay(text: string): Replay {
  const r = JSON.parse(text) as Replay;
  const ok = r && r.v === 1 && Number.isInteger(r.seed) && (MAP_SIZES as readonly number[]).includes(r.size)
    && Array.isArray(r.factions) && (r.factions.length === 2 || r.factions.length === 4) && r.factions.every((f) => FACTION_LIST.includes(f))
    && Array.isArray(r.ai) && r.ai.length === r.factions.length && r.ai.every((d) => d === null || d === 'normal' || d === 'hard' || d === 'brutal')
    && (r.sides === undefined || (Array.isArray(r.sides) && r.sides.length === r.factions.length && r.sides.every((s) => s === 0 || s === 1)))
    && Array.isArray(r.commands) && Array.isArray(r.hashes) && Number.isInteger(r.ticks);
  if (!ok) throw new Error('Not a replay file');
  r.names = Array.isArray(r.names) ? r.names.map(String) : r.factions.map(() => '');
  r.sides ??= r.factions.map((_, i) => (i % 2) as Side);
  return r;
}

/** A short file name for a replay: e.g. strat-fremen-vs-corrino-2026-10-09.json. */
export function replayFileName(r: Replay): string {
  const side = (s: Side) => r.factions.filter((_, i) => (r.sides?.[i] ?? i % 2) === s).join('-');
  return `strat-${side(0)}-vs-${side(1)}-${r.date.slice(0, 10)}.json`;
}
