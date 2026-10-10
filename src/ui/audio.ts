/** Mix levels of the buses at full volume (the player's settings scale them). */
const BUS_VOLUME = { effects: 0.55, units: 0.9, announcer: 0.9 };

export type Bus = keyof typeof BUS_VOLUME;
const BUSES = Object.keys(BUS_VOLUME) as Bus[];

/**
 * The audio files and the mixer: files under public/audio are fetched once and decoded the first time they play (so
 * only the sounds a match uses take up memory), and play on a bus (effects, units, announcer) whose volume the player
 * sets. The browser only lets audio start once the player has clicked or pressed a key, so until then nothing plays.
 */
export class AudioBank {
  private ctx: AudioContext | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private levels: Record<Bus, number> = { effects: 1, units: 1, announcer: 1 };
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private decoded = new Map<string, Promise<AudioBuffer | null>>();

  constructor() {
    const wake = () => {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const bus = (b: Bus) => {
          const g = ctx.createGain();
          g.gain.value = BUS_VOLUME[b] * this.levels[b];
          g.connect(ctx.destination);
          return g;
        };
        this.ctx = ctx;
        this.buses = Object.fromEntries(BUSES.map((b) => [b, bus(b)])) as Record<Bus, GainNode>;
      }
      void this.ctx.resume();
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
  }

  /** Sets a bus's volume, 0 (silent) to 1 (full). */
  setLevel(bus: Bus, level: number): void {
    this.levels[bus] = level;
    if (this.buses) this.buses[bus].gain.value = BUS_VOLUME[bus] * level;
  }

  /** Whether sounds can play now. */
  get live(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Fetches a file ahead of its first play (`name` is its path under audio/, without .mp3). */
  fetch(name: string): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(name);
    if (!p) {
      p = fetch(`${import.meta.env.BASE_URL}audio/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(name, p);
    }
    return p;
  }

  /**
   * Plays a file, panned (-1 left to 1 right) and at a playback rate (1 as recorded); resolves when it has finished,
   * or right away if it can't play.
   */
  async play(name: string, bus: Bus, volume: number, pan = 0, rate = 1): Promise<void> {
    if (!this.live) return;
    const buf = await this.buffer(name);
    const ctx = this.ctx!;
    if (!buf || !this.live) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    let node: AudioNode = src.connect(gain);
    if (pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      node = node.connect(panner);
    }
    node.connect(this.buses![bus]);
    await new Promise<void>((done) => {
      src.onended = () => done();
      src.start();
    });
  }

  private buffer(name: string): Promise<AudioBuffer | null> {
    let p = this.decoded.get(name);
    if (!p) {
      p = this.fetch(name).then((b) => {
        // Decoding takes the bytes over: they're no longer needed once it's an AudioBuffer.
        this.bytes.delete(name);
        return b ? this.ctx!.decodeAudioData(b).catch(() => null) : null;
      });
      this.decoded.set(name, p);
    }
    return p;
  }
}
