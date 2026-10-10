/** Mix levels of the two buses. */
const BUS_VOLUME = { voice: 0.9, sfx: 0.55 };

export type Bus = keyof typeof BUS_VOLUME;

/**
 * The audio files and the mixer: files under public/audio are fetched once and decoded the first time they play (so
 * only the sounds a match uses take up memory), and play on one of two buses, voice or sound effects. The browser
 * only lets audio start once the player has clicked or pressed a key, so until then nothing plays.
 */
export class AudioBank {
  private ctx: AudioContext | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private decoded = new Map<string, Promise<AudioBuffer | null>>();

  constructor() {
    const wake = () => {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const bus = (v: number) => {
          const g = ctx.createGain();
          g.gain.value = v;
          g.connect(ctx.destination);
          return g;
        };
        this.ctx = ctx;
        this.buses = { voice: bus(BUS_VOLUME.voice), sfx: bus(BUS_VOLUME.sfx) };
      }
      void this.ctx.resume();
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
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
