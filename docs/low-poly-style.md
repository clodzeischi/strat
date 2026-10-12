# Low-poly character style

Rules for infantry meshes, taken from measuring the stock Quake 3 player models (head/upper/lower `.md3`, all three
LODs, in particular Major, Sarge, Visor and Grunt). Only rules are taken from them, no geometry. Our infantry are
about 14 px tall on screen, which is Quake 3's farthest LOD, so that's the level to copy.

## Budget

| | Quake 3 LOD0 (close) | LOD1 | **LOD2 (far, our size)** |
|---|---|---|---|
| Whole character | 750–930 | 440–600 | **250–380** |
| Head | 100–200 | 55–125 | **45–60** |
| Torso + arms | 330–430 | 190–300 | **130–160** |
| Pelvis + legs | 260–450 | 150–300 | **125–150** |

Ours: about **300 tris with every tier shown**: `body` about 220, then about 40 for each armour or weapon tier.

## How the meshes are built

1. **Closed shells, welded.** Vertices ≈ triangles ÷ 2. Few pieces:
   - pelvis and both legs are one shell;
   - the torso is one shell;
   - the arms are often separate shells sunk into the shoulder;
   - the head is its own shell;
   - pauldrons and pads may be extra shells.

   Nothing is hidden: no caps buried inside other parts, no boxes overlapping boxes.
2. **Vertices go where the outline turns, not in even loops.** A far-LOD leg has about 30 vertices, at staggered heights, not in rings:
   - about a third at the foot and a third at the knee;
   - about a fifth at the hip;
   - only 1–2 on each long span (thigh, shin).

   Triangles run the full length of a bone.
3. **Cross-sections have 4–6 irregular sides,** with a ridge edge placed on the silhouette (shin, front of the thigh, forearm, spine). They are not round 6–8-sided tubes.
4. **Joints get a point:**
   - a vertex poking forward at the kneecap and back at the elbow;
   - a ring at the hip and the shoulder.

   That one point gives the bend its volume and puts a corner in the outline.
5. **Hard facets.** 45–75% of edges fold more than 30°, so the shape reads as big flat planes catching the light. At distance those planes are the detail.
6. **Exaggerate the silhouette:**
   - big shoulders, a small waist;
   - flared boots, wedge feet;
   - mitten hands of 8–12 tris;
   - one or two spikes (a pauldron edge, a crest).
7. **Detail lives in the texture.** We have no textures, only flat palette colours per face, so:
   - a colour change needs an edge. Put the colour boundary on an edge the shape needs anyway (belt line, visor slit, armour plate edge), or split one face. Never add a box just to carry a stripe.
   - the game culls back faces, so no single-sided plates. Make a plate a thin wedge.

## Building one (bmesh, box-modelling)

- **Rough shells:**
  - torso: a 6-sided prism with rings at the pelvis, waist, chest and shoulders;
  - legs: 5-sided, with rings at the hip, knee (plus the kneecap point) and ankle, and a wedge foot of 6–8 vertices;
  - arms: 4–5 sided, with shoulder and wrist rings plus the elbow point, and a mitten hand;
  - head: a faceted wedge of about 10 vertices with a nose or visor ridge.
- **Then shape it:** move vertices out to the silhouette from front and side views, delete every loop that doesn't change the outline or carry a colour edge, triangulate, and turn edges so they follow the form.
- **Check:**
  - tri count per part against the budget;
  - no hidden faces;
  - the outline at 14 px (zoomed out, backface culling on).
