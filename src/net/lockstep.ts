import type { Team } from '../config';
import { applyCommand, type Command } from '../game/commands';
import type { Game } from '../game/game';
import type { ClientMsg } from './protocol';

/** Seconds of game time per simulation step: 20 steps a second, on every machine. */
export const TICK = 0.05;
/** Players compare state checksums this often (in ticks). */
export const HASH_EVERY = 20;
/** Online, a command runs this many ticks after it's given, which leaves time for it to reach the other player. */
export const NET_DELAY = 4;

export interface RecordedCommand {
  tick: number;
  team: Team;
  cmd: Command;
}

/**
 * Runs the simulation at a fixed rate and feeds it commands at agreed ticks.
 *
 * Offline, commands run on the next tick. Online (deterministic lockstep), each player's commands are scheduled
 * `NET_DELAY` ticks ahead and sent to the other player, every tick, even when empty; a tick only runs once the
 * other player's batch for it has arrived, so both machines apply the same commands at the same ticks and stay in
 * step. Only commands cross the network, never unit positions. Every `HASH_EVERY` ticks both send a checksum of
 * the game state, to catch a desync as soon as it happens.
 */
export class Lockstep {
  /** Every command applied so far, for replays. */
  readonly record: RecordedCommand[] = [];
  /** Seconds the simulation has been held up waiting for the other player (0 while it runs). */
  waiting = 0;
  /** Called before each step, with the game at the tick about to run (computer players think here). */
  onTick: () => void = () => {};
  /** Called once with the first tick at which the two machines' games differ. */
  onDesync: (tick: number) => void = () => {};
  readonly delay: number;

  private queued: Command[] = [];
  /** Commands per tick, per team. */
  private batches = new Map<number, Command[][]>();
  /** Ticks the other player's batch has arrived for. */
  private arrived = new Set<number>();
  private latestRemote = -1;
  private ownHashes = new Map<number, number>();
  private remoteHashes = new Map<number, number>();
  private desynced = false;
  private acc = 0;

  constructor(readonly game: Game, readonly team: Team, private net: { send(msg: ClientMsg): void } | null = null) {
    this.delay = net ? NET_DELAY : 0;
  }

  /** Gives a command for this player. */
  issue(cmd: Command): void {
    this.queued.push(cmd);
  }

  /** Plays back recorded commands (a replay): each runs at its tick, for its team. */
  play(record: RecordedCommand[]): void {
    for (const r of record) (this.batch(r.tick)[r.team] ??= []).push(r.cmd);
  }

  /** The other player's commands for a tick. */
  receive(team: Team, tick: number, cmds: Command[]): void {
    this.batch(tick)[team] = cmds;
    this.arrived.add(tick);
    this.latestRemote = Math.max(this.latestRemote, tick);
  }

  receiveHash(tick: number, hash: number): void {
    this.remoteHashes.set(tick, hash);
    this.compare(tick);
  }

  /** Runs one tick if it can. Returns false while waiting for the other player. */
  step(): boolean {
    const tick = this.game.ticks;
    if (this.net && tick >= this.delay && !this.arrived.has(tick)) return false;
    const at = tick + this.delay;
    const mine = this.queued;
    this.queued = [];
    const b = this.batch(at);
    b[this.team] = [...(b[this.team] ?? []), ...mine];
    this.net?.send({ t: 'cmds', tick: at, cmds: mine });

    const batch = this.batches.get(tick);
    this.batches.delete(tick);
    this.arrived.delete(tick);
    // Teams in a fixed order, so both machines apply the same tick's commands the same way.
    if (batch) {
      batch.forEach((cmds, team) => {
        for (const cmd of cmds ?? []) {
          applyCommand(this.game, team as Team, cmd);
          this.record.push({ tick, team: team as Team, cmd });
        }
      });
    }
    this.onTick();
    this.game.update(TICK);

    if (this.net && this.game.ticks % HASH_EVERY === 0) {
      const hash = this.game.hash();
      this.ownHashes.set(this.game.ticks, hash);
      this.net.send({ t: 'hash', tick: this.game.ticks, hash });
      this.compare(this.game.ticks);
    }
    return true;
  }

  /**
   * Called every frame with the real time passed: runs the ticks that are due, at most `maxBehind` seconds' worth.
   * Returns how far the game is into the next tick (0-1), for drawing units between their last two positions.
   */
  advance(dt: number, maxBehind = TICK * 8): number {
    // A long stall (offline: a tab that was hidden) doesn't try to run minutes of game in one frame.
    this.acc = Math.min(this.acc + dt, maxBehind);
    // Fallen behind the other player (a slow frame): run a little faster until caught up.
    if (this.net && this.latestRemote - this.delay - this.game.ticks > 2) this.acc += TICK * 0.5;
    while (this.acc >= TICK) {
      if (!this.step()) {
        this.waiting += dt;
        this.acc = TICK * 0.999;
        return 1;
      }
      this.acc -= TICK;
    }
    this.waiting = 0;
    return this.acc / TICK;
  }

  private batch(tick: number): Command[][] {
    let b = this.batches.get(tick);
    if (!b) this.batches.set(tick, (b = []));
    return b;
  }

  private compare(tick: number): void {
    const a = this.ownHashes.get(tick);
    const b = this.remoteHashes.get(tick);
    if (a === undefined || b === undefined) return;
    this.ownHashes.delete(tick);
    this.remoteHashes.delete(tick);
    if (a !== b && !this.desynced) {
      this.desynced = true;
      this.onDesync(tick);
    }
  }
}
