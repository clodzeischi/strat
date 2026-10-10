const VOLUME = 0.5;
/** Seconds the music takes to fade out when a match begins. */
const FADE = 1.5;

/**
 * The title screen's music: streamed rather than decoded whole (it's long), looping. Browsers may not allow it to
 * start until the player clicks or presses a key, so it tries right away and again on the first one. Once the match
 * begins it fades out for good.
 */
export class Music {
  private el: HTMLAudioElement;
  private over = false;

  constructor(name: string) {
    this.el = new Audio(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
    this.el.loop = true;
    this.el.volume = VOLUME;
    this.el.preload = 'none';
    const start = () => {
      window.removeEventListener('pointerdown', start, true);
      window.removeEventListener('keydown', start, true);
      this.start();
    };
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('keydown', start, true);
    this.start();
  }

  /** Fades out and stops for good. */
  stop(): void {
    if (this.over) return;
    this.over = true;
    const el = this.el;
    if (el.paused) return;
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

  private start(): void {
    if (this.over || !this.el.paused) return;
    this.el.play().catch(() => {
      // Not allowed yet: the first click or key tries again.
    });
  }
}
