# Art direction

Each faction has its own models and a look you can tell apart at a glance, as in StarCraft. Models are never shared between factions. Technical rules (scale, axes, names, materials, budgets) are in [model-spec.md](model-spec.md).

## Palette

`src/public/models/palette.png` is laid out in [model-spec.md](model-spec.md#palette). In short:
- Each faction has three colors (rows 1–3 of its column).
- Every faction shares the greys and near-black in row 0.
- Column 3 holds the light and screen accents.

## Atreides: expeditionary military

Containerized, modular, rough industrial: a force that arrived by lander and bolted its base together on site. Everything looks armored and rugged. The palette is flat dark earth, like US military vehicles in Iraq.

- **Shapes:** chamfered boxes, armor plates, ISO containers with ribbed sides, tracks, cranes, ladders, crates and supply stacks. No curves where a bevel will do.
- **Colors:**
  - Hull and top plates: `A0987D`.
  - Edge highlights: `D1CBB6`.
  - Secondary panels, ribs and crates: `776A3B`.
  - Tracks, vents, gaps, windows and crane steel: `1D1616` near-black.
  - Plain metal: `515151`.
  - Lights: accent column, sparingly.
- **Team color:** container sides, roof bands and markings, on the `team` material over `C5C5C5`.

### Construction Yard (`conyard`)

A huge tracked lander that has deployed into a base. The command vehicle sits along the diagonal, its nose facing SW, with container wings unfolded to the NW and SE. Together they make an X that fills the square footprint, the way StarCraft buildings do. The corners of the X are filled with containers, crates and construction supplies. A heavy crane rises from the body; it is the `spinner`.

**Level 2** turns the construction yard into a command center: radar dishes, antennas and comms boxes on the body.

In Blender it is laid out square first: the nose points −X, the wings extend along ±Y, and the layout fills the 5.7 m slab. Then it is turned +45° and scaled 0.707 (see [model-spec.md](model-spec.md#buildings)), which puts the nose SW and the wings NW and SE.

## Corrino

To be defined.

## Fremen

To be defined.
