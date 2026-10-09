import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, METAL, ROBE, shade } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Spice Camp: a stilltent beside a spice drill turning slowly (the spinner), and sacks of spice ready to go. */
export const camp: BuildingBlueprint = {
  build(g, color) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.2, 4), mat(shade(ROBE, 1.1)));
    tent.position.set(-0.6, 0.9, -0.5);
    tent.rotation.y = Math.PI / 4;
    tent.castShadow = true;
    g.add(tent);
    box(g, 0.5, 0.5, 0.04, DARK, -0.6, 0.6, 0.2);
    box(g, 0.2, 0.1, 1.4, color, -0.6, 0.35, -0.5);
    const drill = new THREE.Group();
    drill.position.set(0.8, 0.3, 0.3);
    cyl(drill, 0.12, 1.6, METAL, 0, 0.8, 0, 6);
    box(drill, 0.8, 0.1, 0.1, METAL, 0, 1.4, 0);
    box(drill, 0.1, 0.1, 0.8, METAL, 0, 1.4, 0);
    g.add(drill);
    for (const [x, z] of [[0.2, 1.1], [0.55, 1.0], [0.35, 0.75]]) cyl(g, 0.2, 0.32, 0xd88a3a, x, 0.46, z, 7);
    return drill;
  },
};
