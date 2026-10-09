import type { Faction, MapSize, Team } from '../config';
import type { Command } from '../game/commands';

/** Bumped whenever the messages or the simulation change in a way that would split two different builds apart. */
export const PROTOCOL_VERSION = 4;

/** An open game waiting for a second player. */
export interface RoomInfo {
  code: string;
  host: string;
  size: MapSize;
  /** The host's faction. */
  faction: Faction;
}

/** What each player gets when a match is made; the page reloads into the match with it. */
export interface MatchInfo {
  code: string;
  /** Proves it's the same player when the page reconnects after reloading. */
  token: string;
  team: Team;
  seed: number;
  size: MapSize;
  names: [string, string];
  factions: [Faction, Faction];
}

export type ClientMsg =
  | { t: 'list' }
  | { t: 'host'; name: string; size: MapSize; faction: Faction; version: number }
  | { t: 'join'; code: string; name: string; faction: Faction; version: number }
  | { t: 'cancel' }
  | { t: 'resume'; code: string; token: string }
  /** This player's commands for one tick (sent every tick, empty or not, so the others know they can go on). */
  | { t: 'cmds'; tick: number; cmds: Command[] }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'hosted'; code: string }
  | { t: 'match'; match: MatchInfo }
  /** Both players are in: start the clock. */
  | { t: 'go' }
  | { t: 'cmds'; team: Team; tick: number; cmds: Command[] }
  | { t: 'hash'; team: Team; tick: number; hash: number }
  /** The other player quit, closed the page or lost the connection for good. */
  | { t: 'left'; team: Team }
  | { t: 'error'; text: string };
