import * as THREE from 'three';
import { SPICE_MAX } from '../config';
import { CLIFF, ROCK, SAND, SPICE, type GameMap } from '../map';

/** Base color per tile kind. */
export const GROUND_COLORS = {
  [SAND]: new THREE.Color(0xd9b77a),
  [ROCK]: new THREE.Color(0x8f7d66),
  [CLIFF]: new THREE.Color(0x6b5646),
  [SPICE]: new THREE.Color(0xc8642a),
};
/** Cliff walls (painted by the shader). */
export const WALL_COLOR = new THREE.Color(0x76533b);

/**
 * Flat color of one tile, used for the minimap and as the base the ground mesh blends between.
 * With `ground`, spice tiles give plain sand and outcrops plain rock: the ground shader paints those on top.
 */
export function tileColor(map: GameMap, cx: number, cz: number, out = new THREE.Color(), ground = false): THREE.Color {
  const i = map.idx(cx, cz);
  const t = map.tiles[i];
  if (t === SPICE && ground) {
    out.copy(GROUND_COLORS[SAND]);
  } else if (t === CLIFF && ground) {
    out.copy(GROUND_COLORS[ROCK]); // the shader paints outcrops brown over a sprawl
  } else if (t === SPICE) {
    const f = Math.min(1, map.spice[i] / SPICE_MAX);
    out.copy(GROUND_COLORS[SAND]).lerp(GROUND_COLORS[SPICE], 0.35 + f * 0.65);
  } else {
    out.copy(GROUND_COLORS[t as keyof typeof GROUND_COLORS]);
  }
  // High ground is a touch lighter so plateaus read at a glance (on the minimap too).
  if (map.level[i] === 1 && !map.ramp[i]) out.multiplyScalar(1.08);
  return out;
}

/** Spice look: light thin spice, deep rich spice, the darker rim along field edges, and the glint color. */
export const SPICE_LOOK = {
  light: new THREE.Color(0xd8803c),
  deep: new THREE.Color(0xb4441c),
  rim: new THREE.Color(0x7a2a12),
  glint: new THREE.Color(0xfff2c8),
};
