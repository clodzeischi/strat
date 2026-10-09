import * as THREE from 'three';
import { mat } from '../../materials/lambert';
import { IBAD, ROBE, STILLSUIT, shade } from '../../materials/palette';
import { box } from '../parts';

/**
 * The robed Fremen figure the faction's infantry share: stillsuit legs, a desert robe, a team-colored sash, a hood
 * and the blue-within-blue eyes. Faces +X; returns the body group (unscaled) for each unit to arm.
 */
export function fremenFigure(color: number, robe = ROBE): THREE.Group {
  const body = new THREE.Group();
  box(body, 0.28, 0.28, 0.28, STILLSUIT, 0, 0.14, 0); // legs
  box(body, 0.36, 0.52, 0.34, robe, 0, 0.52, 0); // robe
  box(body, 0.38, 0.1, 0.36, color, 0, 0.62, 0); // sash
  box(body, 0.4, 0.3, 0.12, shade(robe, 0.8), -0.12, 0.42, 0); // robe tails
  const hood = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), mat(shade(robe, 0.85)));
  hood.position.set(0, 0.9, 0);
  hood.castShadow = true;
  body.add(hood);
  box(body, 0.06, 0.04, 0.16, IBAD, 0.15, 0.92, 0); // eyes
  return body;
}
