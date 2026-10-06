import type * as THREE from 'three';

/**
 * Per-instance opacity for an instanced MeshBasicMaterial, read from an `instanceAlpha` attribute: three.js has
 * per-instance color but not alpha, so it's patched into the shader.
 */
export function instanceAlpha<T extends THREE.MeshBasicMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float instanceAlpha;\nvarying float vInstanceAlpha;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
    shader.fragmentShader = 'varying float vInstanceAlpha;\n' +
      shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );');
  };
  return material;
}
