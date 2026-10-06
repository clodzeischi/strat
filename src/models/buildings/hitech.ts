import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, METAL, SANDSTONE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Hi-Tech Factory: a vaulted aircraft hangar, a landing pad out front and a control tower with a radar. */
export const hitech: BuildingBlueprint = {
  build(g, color) {
    // Hangar: half a cylinder lying along X.
    const vault = new THREE.CylinderGeometry(1.7, 1.7, 4.6, 14, 1, false, 0, Math.PI);
    vault.rotateZ(Math.PI / 2);
    vault.scale(1, 0.85, 1);
    const hangar = new THREE.Mesh(vault, mat(SANDSTONE));
    hangar.position.set(0, 0.3, -1.1);
    hangar.castShadow = true;
    hangar.receiveShadow = true;
    g.add(hangar);
    for (const x of [-1.5, 0, 1.5]) box(g, 0.14, 0.14, 3.45, color, x, 1.72, -1.1); // roof ribs
    box(g, 2.4, 1.15, 0.1, DARK, 0, 0.88, 0.62); // hangar door
    // Landing pad.
    cyl(g, 1.05, 0.1, shade(color, 0.7), 1.4, 0.35, 1.6, 20);
    cyl(g, 0.85, 0.12, DARK, 1.4, 0.36, 1.6, 20);
    box(g, 0.16, 0.13, 0.9, 0xe8e2d0, 1.4, 0.37, 1.6);
    // Control tower with a turning radar.
    box(g, 0.8, 2.2, 0.8, SANDSTONE, -1.9, 1.4, 1.6);
    box(g, 0.95, 0.4, 0.95, 0x223344, -1.9, 2.7, 1.6);
    box(g, 1.0, 0.12, 1.0, color, -1.9, 2.95, 1.6);
    const radar = new THREE.Group();
    radar.position.set(-1.9, 3.2, 1.6);
    box(radar, 0.1, 0.35, 0.1, METAL, 0, 0, 0);
    box(radar, 0.9, 0.3, 0.08, METAL, 0, 0.25, 0);
    g.add(radar);
    return radar;
  },
};
