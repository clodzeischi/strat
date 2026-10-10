import { FACTION_LIST, MAP_SIZES, type Faction, type MapSize, type Team } from '../config';
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
  /** Each team's computer player (its difficulty), or null for a person. */
  ai: (Difficulty | null)[];
  names: string[];
  commands: RecordedCommand[];
  /** `game.hash()` at ticks 0, REPLAY_HASH_EVERY, 2 × REPLAY_HASH_EVERY, … */
  hashes: number[];
  /** How long the match ran, and how it ended. */
  ticks: number;
  winner: Team | null;
  surrendered: Team | null;
  /** When it was played (ISO date), for the file list. */
  date: string;
}

/**
 * Runs a match's simulation: the lockstep, the computer players and a recording of it. The browser, the sims and
 * replay playback all go through this, so a replay is played back exactly as it was recorded.
 */
export class Match {
  readonly lockstep: Lockstep;
  readonly ais: (AI | null)[];
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
  constructor(readonly game: Game, readonly ai: (Difficulty | null)[], team: Team = 0, net: ConstructorParameters<typeof Lockstep>[2] = null) {
    this.lockstep = new Lockstep(game, team, net);
    this.ais = ai.map((d, t) => (d ? createAI(game, t as Team, d) : null));
    // When a computer player offers to surrender to another computer player, it's accepted (a person answers with
    // the 'acceptSurrender' command instead).
    const offer = game.onSurrenderOffer;
    game.onSurrenderOffer = (t) => {
      if (this.ais[1 - t]) game.acceptSurrender(t);
      else offer(t);
    };
    // A frame can run a tick or two past the end before the screen notices: the recording stops at the end.
    this.lockstep.onStepped = () => {
      if (game.winner !== null) this.endedAt ??= game.ticks;
    };
    this.lockstep.onTick = () => {
      if (this.endedAt === null && game.ticks % REPLAY_HASH_EVERY === 0) this.checkpoint();
      for (const a of this.ais) a?.update(TICK);
    };
  }

  /** Sets the match up to play back a replay. */
  static playback(game: Game, replay: Replay): Match {
    const m = new Match(game, replay.ai);
    m.expected = replay.hashes;
    m.lockstep.play(replay.commands);
    return m;
  }

  /** Runs one tick (offline). */
  step(): void {
    this.lockstep.step();
  }

  /** The match so far, as a replay. */
  replay(names: string[]): Replay {
    const g = this.game;
    return {
      v: 1, seed: g.map.seed, size: g.map.size as MapSize, factions: g.teams.map((t) => t.faction), ai: this.ai, names,
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
    && Array.isArray(r.factions) && r.factions.length === 2 && r.factions.every((f) => FACTION_LIST.includes(f))
    && Array.isArray(r.ai) && r.ai.length === 2 && r.ai.every((d) => d === null || d === 'normal' || d === 'hard' || d === 'brutal')
    && Array.isArray(r.commands) && Array.isArray(r.hashes) && Number.isInteger(r.ticks);
  if (!ok) throw new Error('Not a replay file');
  r.names = Array.isArray(r.names) ? r.names.map(String) : ['', ''];
  return r;
}

/** A short file name for a replay: e.g. strat-fremen-vs-corrino-2026-10-09.json. */
export function replayFileName(r: Replay): string {
  return `strat-${r.factions[0]}-vs-${r.factions[1]}-${r.date.slice(0, 10)}.json`;
}
