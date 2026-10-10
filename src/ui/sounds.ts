import * as THREE from 'three';
import { SOUNDS, type Sound } from '../config';
import type { AudioBank } from './audio';

/**
 * Each sound's level, and how many of it may play at once: a big fight is dozens of guns, and playing every shot
 * would just be noise (and clipping), so past the limit a shot is heard through the ones already playing.
 */
const MIX: Record<Sound, { volume: number; max: number }> = {
  light_mg: { volume: 0.5, max: 3 },
  heavy_mg: { volume: 0.55, max: 3 },
  coax_mg: { volume: 0.55, max: 3 },
  devastator_coax: { volume: 0.5, max: 2 },
  single_shot: { volume: 0.7, max: 3 },
  small_laser: { volume: 0.55, max: 3 },
  heavy_laser: { volume: 0.8, max: 2 },
  auto_laser: { volume: 0.55, max: 3 },
  sky_raider_fire: { volume: 0.65, max: 2 },
  launch_small: { volume: 0.5, max: 3 },
  launch_large: { volume: 0.6, max: 2 },
  explosion_small: { volume: 0.6, max: 4 },
  explosion_med: { volume: 0.8, max: 3 },
  explosion_Large: { volume: 1, max: 2 },
  click: { volume: 0.4, max: 2 },
  win: { volume: 0.9, max: 1 },
};
/** The same sound doesn't start again within this many seconds (a volley is heard as one). */
const MIN_GAP = 0.07;
/** At most this many effects at once, all sounds together. */
const MAX_ALL = 14;
/** Effects are heard on screen, fading out over this much (in screen halves) past its edge. */
const EDGE = 0.3;
/** How far a sound on the screen's edge leans to that side. */
const PAN = 0.6;
/** Each shot or blast plays at a slightly different speed, so repeats don't sound identical. */
const PITCH_SPREAD = 0.08;

/** The sound effects: shots and blasts where they happen on the map (heard when on screen), and interface sounds. */
export class Sounds {
  private playing = new Map<Sound, number>();
  private started = new Map<Sound, number>();
  private all = 0;
  private v = new THREE.Vector3();

  constructor(private bank: AudioBank, private camera: THREE.Camera) {}

  /** Fetches every effect, in the background. */
  load(): void {
    for (const s of SOUNDS) void this.bank.fetch(`effects/${s}`);
  }

  /** A sound at a place on the map: louder the nearer it is to the middle of the screen, panned to its side. */
  at(sound: Sound, x: number, z: number): void {
    const p = this.v.set(x, 0, z).project(this.camera);
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    if (p.z > 1 || off > 1 + EDGE) return;
    const fade = off <= 1 ? 1 : (1 + EDGE - off) / EDGE;
    const rate = 1 + (Math.random() - 0.5) * PITCH_SPREAD;
    this.start(sound, fade, THREE.MathUtils.clamp(p.x, -1, 1) * PAN, rate);
  }

  /** An interface sound: the same everywhere. */
  ui(sound: Sound): void {
    this.start(sound, 1, 0, 1);
  }

  private start(sound: Sound, level: number, pan: number, rate: number): void {
    if (!this.bank.live) return;
    const mix = MIX[sound];
    const now = performance.now() / 1000;
    const n = this.playing.get(sound) ?? 0;
    if (n >= mix.max || this.all >= MAX_ALL || now - (this.started.get(sound) ?? -Infinity) < MIN_GAP) return;
    this.playing.set(sound, n + 1);
    this.started.set(sound, now);
    this.all++;
    void this.bank.play(`effects/${sound}`, 'sfx', mix.volume * level, pan, rate).then(() => {
      this.playing.set(sound, (this.playing.get(sound) ?? 1) - 1);
      this.all--;
    });
  }
}
