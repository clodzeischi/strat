import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { DARK, METAL, SANDSTONE } from '../../materials/palette';
import { box, cyl } from '../parts';
import type { BuildingBlueprint } from '../types';

/** Factory: big hall with a pitched roof, vehicle door and a turning radar; level 2 adds a hall and smokestacks. */
export const factory: BuildingBlueprint = {
  build(g, color) {
    box(g, 5.0, 1.8, 3.8, SANDSTONE, 0, 1.2, -0.6);
    const roofGeo = new THREE.CylinderGeometry(2.2, 2.2, 5.0, 3);
    roofGeo.rotateX(-Math.PI / 2); // triangle peak points up
    roofGeo.rotateY(Math.PI / 2); // prism runs along X
    roofGeo.scale(1, 0.5, 1);
    const roof = new THREE.Mesh(roofGeo, mat(color));
    roof.position.set(0, 2.65, -0.6);
    roof.castShadow = true;
    g.add(roof);
    box(g, 2.2, 1.4, 0.15, DARK, 0, 1.0, 1.32); // door
    box(g, 0.4, 2.6, 0.4, METAL, -2.0, 1.6, 1.2);
    const radar = new THREE.Group();
    radar.position.set(2.0, 3.0, -1.8);
    box(radar, 0.15, 0.8, 0.15, METAL, 0, -0.3, 0);
    box(radar, 0.1, 0.5, 1.0, METAL, 0, 0.15, 0);
    g.add(radar);
    return radar;
  },

  levelKit(g, color) {
    // Second assembly hall and smokestacks.
    box(g, 1.4, 1.2, 1.2, SANDSTONE, 2.0, 0.9, 1.9);
    box(g, 1.5, 0.2, 1.3, color, 2.0, 1.6, 1.9);
    cyl(g, 0.25, 2.4, METAL, -1.2, 3.2, -1.9, 8);
    cyl(g, 0.25, 2.0, METAL, -0.5, 3.0, -1.9, 8);
    cyl(g, 0.28, 0.15, color, -1.2, 4.4, -1.9, 8);
  },
};
