/**
 * Seeded random numbers for the simulation. Everything that changes the game's state draws from the game's own
 * generator, never from Math.random, so the same seed and the same commands always play out the same way: that's
 * what lockstep multiplayer and replays rely on. Visual-only randomness (sparks, smoke) can keep Math.random.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over 32-bit words, for state checksums. */
export class Hasher {
  private h = 0x811c9dc5;
  private view = new DataView(new ArrayBuffer(8));

  int(v: number): this {
    this.h = Math.imul(this.h ^ (v | 0), 16777619);
    return this;
  }

  /** Hashes a number's exact bits, so even a last-digit difference shows. */
  num(v: number): this {
    this.view.setFloat64(0, v);
    return this.int(this.view.getInt32(0)).int(this.view.getInt32(4));
  }

  get value(): number {
    return this.h >>> 0;
  }
}
