/** Seconds music takes to fade out when it stops. */
const FADE = 1.5;

/**
 * Music: tracks streamed rather than decoded whole (they're long), one after another from a random first one, round
 * and round (one track just loops). Browsers may not allow it to start until the player clicks or presses a key, so
 * it tries right away and again on every one until it's playing.
 */
export class Music {
  private el: HTMLAudioElement | null = null;
  private track = 0;
  private wanted = false;
  private level = 1;

  /** `volume` is its level at full volume (the player's setting scales it). */
  constructor(private tracks: string[], private volume: number) {
    const retry = () => {
      if (this.wanted && this.el?.paused) this.el.play().catch(() => {});
    };
    window.addEventListener('pointerdown', retry, true);
    window.addEventListener('keydown', retry, true);
  }

  /** Sets the volume, 0 (silent) to 1 (full). */
  setLevel(level: number): void {
    this.level = level;
    if (this.el && this.wanted) this.el.volume = this.volume * level;
  }

  play(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.track = Math.floor(Math.random() * this.tracks.length);
    this.load();
  }

  /** Fades out and stops. */
  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    const el = this.el;
    if (!el || el.paused) return;
    const from = el.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
      el.volume = from * (1 - k);
      if (k < 1) requestAnimationFrame(step);
      else el.pause();
    };
    requestAnimationFrame(step);
  }

  private load(): void {
    const el = new Audio(`${import.meta.env.BASE_URL}audio/${this.tracks[this.track]}.mp3`);
    el.volume = this.volume * this.level;
    el.loop = this.tracks.length === 1;
    el.addEventListener('ended', () => {
      if (!this.wanted || el !== this.el) return;
      this.track = (this.track + 1) % this.tracks.length;
      this.load();
    });
    this.el = el;
    el.play().catch(() => {
      // Not allowed yet: the next click or key tries again.
    });
  }
}
