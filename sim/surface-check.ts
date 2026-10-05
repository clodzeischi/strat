// Checks that GameMap.surfaceAt matches the rendered terrain mesh, by raycasting down onto it at random points.
import * as THREE from 'three';
import { GameMap } from '../src/map';
import { Terrain } from '../src/terrain';

const map = new GameMap(Number(process.env.SIZE ?? 64), 7);
const terrain = new Terrain(map);
terrain.mesh.updateMatrixWorld(true);
const ray = new THREE.Raycaster();
let worst = 0;
for (let k = 0; k < 2000; k++) {
  const x = Math.random() * map.worldSize();
  const z = Math.random() * map.worldSize();
  ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(terrain.mesh, true)[0];
  if (!hit) continue;
  worst = Math.max(worst, Math.abs(hit.point.y - map.surfaceAt(x, z)));
}
console.log(`max difference between surfaceAt and the mesh over 2000 points: ${worst.toFixed(5)}`);
