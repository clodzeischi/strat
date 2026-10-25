import * as THREE from 'three';
import { mat } from '../materials/lambert';
import { TOOTH, WORM_HIDE, shade } from '../materials/palette';
import { cloneWormModel } from './gltf';

export interface RiddenWormModel {
  /** Holds the worm; its pieces are placed in world space every frame. */
  root: THREE.Group;
  /** How many pieces (or bones) run from the head (0) to the tail tip. */
  count: number;
  /** Radius of each piece, for how deep it sits in the sand and where the rider stands. */
  radii: number[];
  /** Puts piece `i` at a world point, facing `heading` (radians, the game's), its nose raised by `pitch`. */
  place(i: number, at: THREE.Vector3, heading: number, pitch?: number): void;
  /** Opens the maw (0 closed .. 1 open), if the model has one that opens. */
  open(t: number): void;
}

/** The Blender worm's radius at each bone, from the head to the tail (see sandworm.blend's build.py). */
const BONE_RADII = Array.from({ length: 12 }, (_, i) => (i <= 1 ? 1.68 : i <= 10 ? 1.65 - ((i - 1) / 9) * 0.8 : 0.6));

/**
 * A ridden Sandworm, surfaced. The Blender model if it's loaded: one skinned body whose bones the game lays along
 * the path the head has taken, so it bends with its movement, and a three-petal maw that opens to bite. Otherwise
 * the procedural one below, a chain of rigid pieces laid the same way.
 */
export function makeRiddenWorm(segments: number): RiddenWormModel {
  const rig = cloneWormModel();
  if (!rig) return proceduralRiddenWorm(segments);
  const root = new THREE.Group();
  root.add(rig.root);
  return { root, count: BONE_RADII.length, radii: BONE_RADII, place: rig.place, open: rig.open };
}

function proceduralRiddenWorm(segments: number): RiddenWormModel {
  const root = new THREE.Group();
  const hide = mat(WORM_HIDE);
  const ring = mat(shade(WORM_HIDE, 0.72));
  const pieces: THREE.Object3D[] = [];
  const radii: number[] = [];
  // Head: a short drum lying along +X, the maw ringed with teeth at its front.
  const head = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 1.8, 16), hide);
  drum.rotation.z = Math.PI / 2;
  drum.castShadow = true;
  head.add(drum);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.08, 16), mat(0x3a120c));
  throat.rotation.z = Math.PI / 2;
  throat.position.x = 0.92;
  head.add(throat);
  const teeth = mat(TOOTH);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), teeth);
    tooth.position.set(1.0, Math.sin(a) * 1.4, Math.cos(a) * 1.4);
    tooth.lookAt(1.6, 0, 0);
    tooth.rotateX(Math.PI / 2);
    head.add(tooth);
  }
  pieces.push(head);
  radii.push(1.7);
  for (let i = 0; i < segments; i++) {
    const r = 1.65 - (i / segments) * 0.8;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.5, 14), i % 2 ? ring : hide);
    seg.rotation.z = Math.PI / 2;
    seg.castShadow = true;
    const holder = new THREE.Group();
    holder.add(seg);
    pieces.push(holder);
    radii.push(r);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 12), hide);
  tail.rotation.z = Math.PI / 2;
  const tailHolder = new THREE.Group();
  tailHolder.add(tail);
  pieces.push(tailHolder);
  radii.push(0.8);
  for (const p of pieces) root.add(p);
  return {
    root, count: pieces.length, radii,
    place(i, at, heading, pitch = 0) {
      pieces[i].position.copy(at);
      pieces[i].rotation.set(0, -heading, pitch, 'YXZ');
    },
    open() {},
  };
}
