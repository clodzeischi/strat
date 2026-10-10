import { ACK_LINES, ANNOUNCEMENTS, type AckKind, type Announcement, type Faction } from '../config';
import type { AudioBank } from './audio';

const VOLUME = { announcer: 1, ack: 0.75 };
/** The announcer doesn't repeat a line within this many seconds ("Insufficient funds" on every click). */
const REPEAT_GAP = 3;
/** Announcer lines waiting their turn: at most this many, and none older than STALE seconds when it comes. */
const QUEUE_MAX = 2;
const STALE = 4;

/**
 * The voice lines: the announcer (one line at a time, a short queue behind it) and the local faction's unit
 * acknowledgements (skipped while one is still speaking, so clicking fast doesn't stack them).
 */
export class Voice {
  private faction: Faction = 'atreides';
  private speaking: Announcement | null = null;
  private queue: { line: Announcement; at: number }[] = [];
  private lastSaid = new Map<Announcement, number>();
  private acking = false;
  private lastAck = new Map<AckKind, number>();

  constructor(private bank: AudioBank) {}

  /** Whose units answer (the menu's settings preview them before a match). */
  setFaction(faction: Faction): void {
    this.faction = faction;
  }

  /** Fetches the announcer's lines and this faction's acknowledgements, in the background. */
  load(faction: Faction): void {
    this.faction = faction;
    for (const a of ANNOUNCEMENTS) void this.bank.fetch(`announcer/${a}`);
    for (const kind of ['select', 'move', 'attack'] as const) {
      for (let i = 1; i <= ACK_LINES; i++) void this.bank.fetch(`${faction}/${kind}_${i}`);
    }
  }

  /** The announcer says a line (now, or after the one it's saying). */
  say(line: Announcement): void {
    if (!this.bank.live) return;
    const now = performance.now() / 1000;
    if (line === this.speaking || this.queue.some((q) => q.line === line)) return;
    if (now - (this.lastSaid.get(line) ?? -Infinity) < REPEAT_GAP) return;
    if (this.speaking) {
      if (this.queue.length < QUEUE_MAX) this.queue.push({ line, at: now });
      return;
    }
    this.speak(line);
  }

  /** A unit of the local faction acknowledges: one of its lines for this, not the same one twice running. */
  ack(kind: AckKind): void {
    if (!this.bank.live || this.acking) return;
    const last = this.lastAck.get(kind) ?? 0;
    let n = 1 + Math.floor(Math.random() * (last ? ACK_LINES - 1 : ACK_LINES));
    if (last && n >= last) n++;
    this.lastAck.set(kind, n);
    this.acking = true;
    void this.bank.play(`${this.faction}/${kind}_${n}`, 'units', VOLUME.ack).then(() => (this.acking = false));
  }

  private speak(line: Announcement): void {
    this.speaking = line;
    this.lastSaid.set(line, performance.now() / 1000);
    void this.bank.play(`announcer/${line}`, 'announcer', VOLUME.announcer).then(() => {
      this.speaking = null;
      const now = performance.now() / 1000;
      this.queue = this.queue.filter((q) => now - q.at < STALE);
      const next = this.queue.shift();
      if (next) this.speak(next.line);
    });
  }
}
