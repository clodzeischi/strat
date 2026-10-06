import type * as THREE from 'three';

/**
 * Lets an instanced particle cast a shadow as thick as it is opaque. The shadow pass ignores transparency,
 * so instead each shadow pixel is kept with probability equal to the particle's opacity (a dithered
 * shadow); the shadow map's filtering smooths the noise into a soft, partial shadow.
 */
export function ditheredShadow<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float instanceAlpha;\nvarying float vInstanceAlpha;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
    shader.fragmentShader = 'varying float vInstanceAlpha;\n' + shader.fragmentShader.replace('void main() {',
      'void main() {\n  if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > vInstanceAlpha) discard;');
  };
  return material;
}
