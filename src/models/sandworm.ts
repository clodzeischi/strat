import * as THREE from 'three';
import { mat } from '../materials/lambert';
import { TOOTH, WORM_HIDE, shade } from '../materials/palette';
import { cloneWormModel } from './gltf';

/** How far under the ground the worm's maw sits while it travels (the body is drawn this far down). */
export const WORM_DEPTH = 10;

export interface SandwormModel {
  /** Moves with the worm, at ground level. */
  root: THREE.Group;
  /** The ringed body with its maw on top, rearing up out of the sand (raise it to bite, lower it out of sight). */
  body: THREE.Group;
  /** The ridge of sand pushed up over the worm while it travels underground: wormsign. */
  ridge: THREE.Mesh;
}

/**
 * The wild Sandworm a Thumper calls: a ringed column with a round maw full of teeth at the top, which bursts up out
 * of the sand to swallow what's above it, and a long mound of sand that shows where it is while it travels below.
 * The body's top (the maw) is at y = 0 of `body`; it rests WORM_DEPTH down, out of sight.
 */
export function makeSandworm(): SandwormModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const hide = mat(WORM_HIDE);
  const ring = mat(shade(WORM_HIDE, 0.72));
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    // Widest just under the maw, the rings below narrowing a little.
    const r = 2.0 - i * 0.06;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 0.06, 1.2, 16), i % 2 ? ring : hide);
    seg.position.y = -0.6 - i * 1.15;
    seg.castShadow = true;
    body.add(seg);
  }
  // The maw: a dark throat ringed by teeth, two rows of them pointing in.
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.08, 18), mat(0x3a120c));
  throat.position.y = 0.02;
  body.add(throat);
  const teeth = mat(TOOTH);
  for (const [n, r, len] of [[18, 1.8, 0.75], [12, 1.15, 0.5]] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r < 1.5 ? 0.13 : 0);
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.12, len, 4), teeth);
      tooth.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
      // Leaning in over the throat.
      tooth.lookAt(0, 0.25 + len, 0);
      tooth.rotateX(Math.PI / 2);
      body.add(tooth);
    }
  }
  // Three lips around the maw, peeled back.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.1), hide);
    lip.position.set(Math.cos(a) * 2.1, 0.35, Math.sin(a) * 2.1);
    lip.rotation.y = -a;
    lip.rotateZ(0.7);
    lip.castShadow = true;
    body.add(lip);
  }
  body.position.y = -WORM_DEPTH;
  body.visible = false;
  root.add(body);
  // Wormsign: a long low mound of sand, stretched along the way it's heading (+X).
  const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), mat(0xc9ad7a));
  ridge.scale.set(3.2, 0.55, 1.4);
  ridge.position.y = -0.15;
  ridge.receiveShadow = true;
  root.add(ridge);
  return { root, body, ridge };
}

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
