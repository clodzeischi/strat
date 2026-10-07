import type * as THREE from 'three';
import { GROUND_COLORS, SPICE_LOOK, WALL_COLOR } from '../materials/ground';
import { CLIFF, ROCK, SAND } from '../map';

/**
 * Patches the ground's Lambert shader to paint every ground material per pixel from the per-vertex shares:
 * - rock and sand split along a crisp, noise-wobbled contour; sand gets ripples and grain, rock mottling;
 * - outcrops in brown, fading gradually over their sprawling base;
 * - cliff walls in their own brown with a crisp noisy outline, layers, streaks and cracks;
 * - spice with a crisp field edge, a dark rim, grain and bare patches that open up as it's harvested, plus the
 *   shimmer: tiny twinkling glints and a slow drifting sheen;
 * - fog of war on top, from a one-texel-per-tile brightness map.
 */
export function groundShader(material: THREE.MeshLambertMaterial, time: { value: number }, fog: { value: THREE.Texture }, worldSize: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: time,
      uFogMap: fog,
      uWorldSize: worldSize,
      uSand: { value: GROUND_COLORS[SAND] },
      uRock: { value: GROUND_COLORS[ROCK] },
      uOutcrop: { value: GROUND_COLORS[CLIFF] },
      uWall: { value: WALL_COLOR },
      uSpiceLight: { value: SPICE_LOOK.light },
      uSpiceDeep: { value: SPICE_LOOK.deep },
      uSpiceRim: { value: SPICE_LOOK.rim },
      uGlint: { value: SPICE_LOOK.glint },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 spice;
attribute float wall;
varying vec4 vSpice;
varying float vWall;
varying vec3 vGround;
varying vec3 vGroundN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSpice = spice;
vWall = wall;
vGroundN = mat3(modelMatrix) * objectNormal;
vGround = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform sampler2D uFogMap;
uniform float uWorldSize;
uniform vec3 uSand, uRock, uOutcrop, uWall, uSpiceLight, uSpiceDeep, uSpiceRim, uGlint;
varying vec4 vSpice;
varying float vWall;
varying vec3 vGround;
varying vec3 vGroundN;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 gp = vGround.xz;
float amount = vSpice.y;
// Rock/sand boundary: like the spice edge, a crisp noisy contour instead of the vertex colors' tile-wide fade.
// The vertex color is (roughly) rock and sand blended by the sand share; rescaling it to pure rock or pure sand
// on either side of the contour keeps the shading baked into it.
float sandEdge = vSpice.z - 0.5 + (gNoise(gp * 1.1 + 90.0) * 0.6 + gNoise(gp * 3.0) * 0.4 - 0.5) * 0.45;
float sandAa = fwidth(sandEdge) + 1e-4;
float sandShare = smoothstep(-sandAa, sandAa, sandEdge);
vec3 blended = mix(uRock, uSand, vSpice.z);
diffuseColor.rgb *= mix(uRock, uSand, sandShare) / blended;
// Outcrops: brown, fading out gradually over their sprawling base into whatever surrounds them, sand or rock.
float oc = smoothstep(0.12, 0.7, vSpice.w + (gNoise(gp * 1.4 + 5.0) - 0.5) * 0.3);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uOutcrop / mix(uRock, uSand, sandShare), oc);
// Sand: fine grain and wind ripples. Ripples run across the wind and wander a little; they fade out when
// they'd be thinner than a few pixels, so they never flicker.
float ripple = dot(gp, vec2(0.8, 0.6)) * 2.6 + gNoise(gp * 0.45) * 2.5;
float rippleFade = 1.0 - smoothstep(0.25, 0.6, fwidth(ripple));
float wave = fract(ripple);
float rippleShade = (smoothstep(0.0, 0.75, wave) - smoothstep(0.75, 1.0, wave) - 0.5) * 0.07 * rippleFade;
float sandGrain = (gNoise(gp * 14.0) - 0.5) * 0.06;
// Rock: blotchy color, and faint layers that follow height so outcrop faces read as stratified stone.
float mottle = (gNoise(gp * 1.3 + 70.0) * 0.6 + gNoise(gp * 4.1) * 0.4 - 0.5) * 0.16;
float strata = (sin(vGround.y * 7.0 + gNoise(gp * 0.7) * 3.0) * 0.5) * 0.06;
// Field edge: where the spice share crosses one half, pushed in and out by noise.
float edge = vSpice.x - 0.5 + (gNoise(gp * 0.9) * 0.6 + gNoise(gp * 2.6) * 0.4 - 0.5) * 0.5;
// Thinning: as a field is harvested, bare sand opens up in patches.
float cover = amount * 2.2 + 0.1 - gNoise(gp * 0.8 + 40.0);
float shape = min(edge, cover * 0.6);
float aa = fwidth(shape) + 1e-4;
float inside = smoothstep(-aa, aa, shape);
float grain = gNoise(gp * 7.0) * 0.6 + gNoise(gp * 13.0 + 7.0) * 0.4;
vec3 spiceCol = mix(uSpiceLight, uSpiceDeep, clamp(amount * 0.85 + (grain - 0.5) * 0.5, 0.0, 1.0));
spiceCol *= 0.84 + 0.3 * gNoise(gp * 5.0 + 19.0);
spiceCol = mix(spiceCol, uSpiceRim, (1.0 - smoothstep(0.0, 0.06, shape)) * 0.7);
// The vertex color is sand with dune shading baked in; scaling it keeps that shading on the spice.
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * spiceCol / uSand, inside);
// Sand and rock detail last, kept off the spice (it has its own grain).
diffuseColor.rgb *= 1.0 + mix((mottle + strata) * (1.0 + oc), rippleShade + sandGrain, sandShare * (1.0 - oc)) * (1.0 - inside);
// Cliff walls: their own brown with a crisp, slightly noisy edge onto the ground above and below (never a blend
// with it), layered, streaked and cracked. Streaks run along the wall, so they use whichever horizontal axis the
// wall faces across. Outcrops keep their own soft look.
vec3 wn = normalize(vGroundN);
float wallEdge = vWall - 0.45 + (gNoise(gp * 2.2 + 11.0) * 0.6 + gNoise(gp * 6.0) * 0.4 - 0.5) * 0.3;
float wallAa = fwidth(wallEdge) + 1e-4;
float wallMask = smoothstep(-wallAa, wallAa, wallEdge) * (1.0 - smoothstep(0.2, 0.45, vSpice.w));
if (wallMask > 0.0) {
  float along = abs(wn.x) > abs(wn.z) ? vGround.z : vGround.x;
  float layers = sin(vGround.y * 10.0 + gNoise(vec2(along * 0.5, vGround.y * 2.0)) * 4.0) * 0.5 + 0.5;
  float streaks = gNoise(vec2(along * 3.5, vGround.y * 0.6)) * 0.65 + gNoise(vec2(along * 9.0, vGround.y * 1.5)) * 0.35;
  // Cracks: thin lines where a noise stretched tall crosses one half, so they run mostly up and down.
  float crackN = gNoise(vec2(along * 2.2, vGround.y * 0.35) + 30.0);
  float crack = (1.0 - smoothstep(0.0, 0.03 + fwidth(crackN), abs(crackN - 0.5))) * step(0.55, gNoise(vec2(along * 0.7, 3.0)));
  float wall = 1.0 + (layers - 0.5) * 0.14 + (streaks - 0.5) * 0.3;
  diffuseColor.rgb = mix(diffuseColor.rgb, uWall * wall * (1.0 - crack * 0.4), wallMask);
}`)
      .replace('#include <opaque_fragment>', `{
  // Shimmer: one possible glint per small cell, each twinkling on its own clock, denser on rich spice.
  vec2 cp = gp * 2.2;
  vec2 cell = floor(cp);
  float h = gHash(cell);
  vec2 at = vec2(gHash(cell + 17.1), gHash(cell + 31.7)) * 0.7 + 0.15;
  float d = length(fract(cp) - at);
  float twinkle = pow(max(0.0, sin(uTime * (1.2 + h * 2.4) + h * 60.0)), 20.0);
  float size = max(0.07, fwidth(cp.x) * 1.2);
  float spark = (1.0 - smoothstep(size * 0.3, size, d)) * twinkle * step(h, 0.2 + 0.4 * amount);
  float sheen = smoothstep(0.62, 0.9, gNoise(gp * 0.3 + vec2(uTime * 0.22, uTime * 0.09))) * 0.1;
  outgoingLight += uGlint * (spark * 1.5 + sheen) * inside;
}
{
  // Fog of war: darker where the player can't see now, near black where they never have, a little greyer too.
  // Four filtered taps half a tile apart blur the tile steps into soft edges.
  vec2 fuv = vGround.xz / uWorldSize;
  float tx = 0.5 / float(textureSize(uFogMap, 0).x);
  float seen = 0.25 * (texture2D(uFogMap, fuv + vec2(-tx, -tx)).r + texture2D(uFogMap, fuv + vec2(tx, -tx)).r
    + texture2D(uFogMap, fuv + vec2(-tx, tx)).r + texture2D(uFogMap, fuv + vec2(tx, tx)).r);
  seen = smoothstep(0.0, 1.0, seen);
  float grey = dot(outgoingLight, vec3(0.3, 0.5, 0.2));
  outgoingLight = mix(vec3(grey), outgoingLight, 0.4 + 0.6 * seen) * seen;
}
#include <opaque_fragment>`);
  };
}
