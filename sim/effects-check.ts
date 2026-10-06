// Stress-tests the effect pools: fill them past capacity, then check they drain back to empty.
import * as THREE from 'three';
import { Effects } from '../src/render/effects/effects';

const scene = new THREE.Scene();
const fx = new Effects(scene);
const counts = () => scene.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh).map((m) => m.count);
for (let k = 0; k < 300; k++) fx.explosion(new THREE.Vector3(Math.random() * 30, 1, Math.random() * 30), 3);
for (let k = 0; k < 600; k++) fx.tracer(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
fx.update(0.016);
console.log('after 300 big explosions (glow, smoke, debris):', counts());
let t = 0;
const t0 = performance.now();
for (; t < 3; t += 0.016) fx.update(0.016);
console.log('3 s later:', counts(), `| ${Math.round(3 / 0.016)} updates took ${(performance.now() - t0).toFixed(0)} ms`);
