import type { Faction, MapSize, Side, Team } from '../config';
import type { Command } from '../game/commands';
import type { Difficulty } from '../game/game';

/** Bumped whenever the messages or the simulation change in a way that would split two different builds apart. */
export const PROTOCOL_VERSION = 5;

/** One against one, or two against two (people and computer players). */
export type RoomMode = '1v1' | '2v2';

/** An open game waiting for players. */
export interface RoomInfo {
  code: string;
  host: string;
  size: MapSize;
  /** The host's faction. */
  faction: Faction;
  mode: RoomMode;
  /** Whether there's still a place on the host's side, and on the other. */
  open: { with: boolean; against: boolean };
}

/** A place in a room being filled: a person, or (once it starts) a computer player. */
export interface SlotInfo {
  name: string;
  faction: Faction;
  human: boolean;
  side: Side;
}

/** What each player gets when a match is made; the page reloads into the match with it. */
export interface MatchInfo {
  code: string;
  /** Proves it's the same player when the page reconnects after reloading. */
  token: string;
  team: Team;
  seed: number;
  size: MapSize;
  /** Per team. */
  names: string[];
  factions: Faction[];
  /** Each team's side (missing: teams alternate). */
  sides?: Side[];
  /** Each team's computer player, or null for a person (missing: all people). */
  ai?: (Difficulty | null)[];
  /** Who takes over for a person who leaves while an ally of theirs plays on. */
  takeover?: Difficulty;
}

export type ClientMsg =
  | { t: 'list' }
  | { t: 'host'; name: string; size: MapSize; faction: Faction; version: number; mode?: RoomMode; difficulty?: Difficulty }
  /** `side`: in a 2v2, join on the host's side or against it. */
  | { t: 'join'; code: string; name: string; faction: Faction; version: number; side?: 'with' | 'against' }
  /** The host of a 2v2 starts it: computer players take the empty places. */
  | { t: 'start' }
  | { t: 'cancel' }
  | { t: 'resume'; code: string; token: string }
  /** This player's commands for one tick (sent every tick, empty or not, so the others know they can go on). */
  | { t: 'cmds'; tick: number; cmds: Command[] }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'hosted'; code: string }
  /** A room being filled, as it stands, to the people in it (`you`: their place). */
  | { t: 'room'; code: string; mode: RoomMode; slots: (SlotInfo | null)[]; you: Team; host: boolean }
  | { t: 'match'; match: MatchInfo }
  /** Everyone is in: start the clock. */
  | { t: 'go' }
  | { t: 'cmds'; team: Team; tick: number; cmds: Command[] }
  | { t: 'hash'; team: Team; tick: number; hash: number }
  /**
   * A player quit, closed the page or lost the connection for good. `tick`: the last tick they sent commands for
   * (everyone has them); from the next one on, they're gone.
   */
  | { t: 'left'; team: Team; tick: number }
  | { t: 'error'; text: string };
