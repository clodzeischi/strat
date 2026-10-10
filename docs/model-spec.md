# Model and material spec

How to build a unit or building model in Blender so it drops into the game as a `.glb`. Models are migrated one at a time; anything not yet migrated keeps its procedural model from `src/models/`.

## Files

| What | Where |
|---|---|
| Blender source | `art/models/units/<type>.blend`, `art/models/buildings/<type>.blend` (not shipped) |
| Exported model | `src/public/models/units/<type>.glb`, `src/public/models/buildings/<type>.glb` |
| Shared palette texture | `src/public/models/palette.png` |

`<type>` is the key from `src/config/units.ts` or `src/config/buildings.ts` (`trike`, `rocket`, `artillery`, `hitech`, ...), not the display name. Factions never share models (see [art-direction.md](art-direction.md)): a type that more than one faction builds gets one file per faction, `<type>.<faction>.glb` (e.g. `conyard.atreides.glb`, `conyard.fremen.glb`).

## Scale and axes

- Scene units: Metric, Unit Scale **1.0**. **1 Blender metre = 1 game unit.**
- **One map tile = 2 m** (`TILE` in `src/config/rules.ts`). Set the viewport grid Scale to 2 so grid squares are tiles.
- Export with **+Y Up**. Blender X stays X; Blender Z becomes game up; Blender −Y becomes game +Z.
- **Units face Blender +X.**
- **Buildings face Blender −Y** (the side shown in Front view, Numpad 1). Production buildings release units from their front.
- **Origin:** center of the footprint, at ground level (Z = 0). Wheels, tracks and feet touch Z = 0.
- **Aircraft** (Carryall, Sky Raider, Wind Glider): the origin is the center of the body. The game sets flying height.
- Apply all transforms (Ctrl+A → All Transforms) on every object before export. Child objects keep their own origins (see Named objects).

## Sizes

### Units

`radius` is the collision circle. Keep the model's top-view outline roughly inside it, or units overlap visibly. Animated units are covered under Animation below.

| Type | Unit | Faction | Radius | Turret | Upgrade parts | Notes |
|---|---|---|---|---|---|---|
| `infantry` | Infantry | Atreides | 0.45 | | weapons, armor, rockets | animated; ~0.75 m tall |
| `trike` | Trike | Atreides | 0.8 | | weapons, armor, nitro | ~1.3 m long |
| `tank` | Tank | Atreides | 1.1 | yes | weapons, armor | |
| `rocket` | MLRS | Atreides | 1.0 | yes | weapons, armor | |
| `harvester` | Harvester | Atreides, Corrino | 1.1 | | armor, harvest | |
| `repair` | Repair Vehicle | Atreides | 0.9 | | armor | |
| `carryall` | Carryall | Atreides | 1.4 | | armor | aircraft |
| `trooper` | Harkonnen Trooper | Corrino | 0.45 | | weapons, armor | animated |
| `sardaukar` | Sardaukar | Corrino | 0.5 | | weapons, armor | animated |
| `razor` | Razor | Corrino | 0.85 | | weapons, armor | |
| `devastator` | Devastator | Corrino | 1.4 | yes | weapons, armor | |
| `raider` | Sky Raider | Corrino | 1.0 | | weapons, armor | aircraft |
| `artillery` | Soulcrusher | Corrino | 1.1 | yes | weapons, armor | deploy animation |
| `warrior` | Fremen Warrior | Fremen | 0.45 | | weapons, armor | animated |
| `fedaykin` | Fedaykin | Fremen | 0.5 | | weapons, armor | animated |
| `mortar` | Fremen Mortar | Fremen | 0.5 | | | animated; deploy animation |
| `crew` | Spice Crew | Fremen | 0.45 | | | animated |
| `glider` | Wind Glider | Fremen | 0.9 | | | aircraft; the game rolls it in turns |

### Buildings

A building fills a square of `size × 2 m`. Unless it is **bare**, the game adds a plain 0.3 m concrete slab, `size × 2 − 0.3` m wide, square to the map (N-S). The slab has no team color, so the structure must carry readable team markings. **Start the structure at Z = 0.3 and leave the slab out of the model.** Bare buildings stand on the sand and include their own base.

**The model is a drop-in: the game doesn't turn or scale it.** Buildings look turned 45° on the map, as in StarCraft, but only the structure is turned, and that turn is baked in Blender:

1. Build the structure square to the axes, filling the slab width, front facing −Y.
2. Rotate it +45° about Z.
3. Scale it by 0.707 (1/√2) on all axes, scaling from the slab top (Z = 0.3). The turned square then fits inside the slab. Don't scale X and Y alone: it stretches the building upward.
4. Apply transforms.

After the turn, a front built facing −Y points SE on screen, and one built facing −X points SW.

| Size | Slab width | Square before the turn |
|---|---|---|
| 1 | 1.7 m | 1.7 m |
| 2 | 3.7 m | 3.7 m |
| 3 | 5.7 m | 5.7 m |

| Type | Building | Faction | Size | `spinner` | Level 2 | Notes |
|---|---|---|---|---|---|---|
| `conyard` | Construction Yard | all | 3 | crane | yes | |
| `refinery` | Refinery | Atreides, Corrino | 3 | | | |
| `barracks` | Barracks | all | 2 | | yes | |
| `bunker` | Bunker | Atreides, Fremen | 2 | | | |
| `factory` | Factory | Atreides | 3 | radar | yes | |
| `hitech` | Hi-Tech Factory | Atreides | 3 | radar | | |
| `fab` | Fab | Corrino | 3 | beacon | yes | |
| `tleilaxu` | Tleilaxu Research | Corrino | 3 | spire | | |
| `pad` | Repair Pad | Corrino | 2 | | | |
| `turret` | Auto Turret | Corrino | 1 | gun head | | `spinner` aims at targets; add `muzzle` |
| `sietch` | Sietch | Fremen | 3 | | yes | |
| `thumper` | Thumper | Fremen | 1 | piston | | bare |
| `camp` | Spice Camp | Fremen | 2 | drill | | bare |

## Named objects

The loader finds parts by object name. Names are exact and lowercase.

| Name | Type | Used for |
|---|---|---|
| `body` | mesh | The main hull. Everything not listed below goes here (join it into one mesh). For units with armor tiers, only the parts every tier shares. |
| `turret` | mesh | The part that rotates to aim (units marked "turret"). Origin on the rotation pivot, at rest facing +X. Child of `body`. |
| `muzzle` | Empty | Where shots start. Child of `turret` if there is one, otherwise of `body`. Every armed unit, plus the Auto Turret. |
| `spinner` | mesh | A building's moving piece. Origin on its rotation axis (Z). |
| `level2` | mesh | Structure added at building level 2. Child of `body`. |
| `armor0`, `armor1`, `armor2` | mesh | Armor tiers. Each is a complete, separate hull, not a bolt-on: exactly one is shown, and `armor0` is hidden once `armor1` is researched. Child of `body`. |
| `weapons0`, `weapons1`, `weapons2` | mesh | Weapon tiers, swapped the same way and independently of armor, so always separate objects. Child of `turret` if there is one, otherwise of `body`. |
| `up_<upgrade>` | mesh | Parts added once a one-step upgrade is researched: `up_rockets`, `up_nitro`, `up_harvest`. Child of `turret` if it moves with it, otherwise of `body`. |

Every visible piece must belong to one of these meshes. Leftover objects are ignored.

## Materials

The game draws models with its own flat-shaded, matte material (`MeshLambertMaterial`). Only the base color comes through: no shine, no metalness, no normal or roughness maps.

- Use only **Principled BSDF**, with **Metallic 0** and **Roughness 1** so the Blender preview looks like the game.
- Base Color comes from an **Image Texture** of `palette.png` with interpolation set to **Closest**. Do not use flat color values.
- Each model has at most **two materials**:
  - `palette`: everything that isn't team colored.
  - `team`: surfaces tinted with the player's color. Use the same palette texture, mapped onto the greys in row 0 (see below). The game multiplies those greys by the team color.
- Glowing parts (Fremen eyes, lights) may use **Emission** on a third material named `glow`. Use it sparingly.
- **Object → Shade Flat** on every mesh. The game draws flat-shaded, so smooth normals are thrown away.

### Palette

`palette.png` is 32 × 32 px, laid out as 4 × 4 swatches of 8 px each. UV each face (or island) into the middle of one swatch. Shrinking the UVs to a point is fine. Row 0 is the top of the image (V = 1).

| Row | Col 0 | Col 1 | Col 2 | Col 3 |
|---|---|---|---|---|
| 0 | `C5C5C5` grey | `9A9A9A` grey | `515151` grey | `1D1616` near-black |
| 1 | `776A3B` Atreides | `674980` Corrino | `555B63` Fremen | `41F0FE` cyan |
| 2 | `A0987D` Atreides | `A389BA` Corrino | `7F8C9D` Fremen | `41FE73` green |
| 3 | `D1CBB6` Atreides | `C8B7D6` Corrino | `AAB8CC` Fremen | `FF898E` pink |

- Columns 0–2, rows 1–3: the three faction colors, darkest first. A model uses its own faction's column.
- Row 0: shared greys and near-black, for any faction. On `palette` they're plain steel and machinery colors. On `team` the greys are tinted by the player color: `C5C5C5` for the main team surfaces, `9A9A9A` and `515151` for darker team trims.
- Column 3, rows 1–3: accents for lights and screens, used sparingly (on `glow` when they should shine).

Hex values are sRGB, as in Blender's color picker. Blender models don't use the procedural colors in `src/materials/palette.ts`.

## Budgets

| Kind | Triangles | Vertices |
|---|---|---|
| Infantry (animated) | ≤ 600 | ≤ 800 |
| Vehicles | 500–1,200 | |
| Aircraft | 500–1,200 | |
| Buildings | 1,500–5,000 | |
| `.glb` size | ≤ 100 KB per model after compression | |

Infantry are drawn 100+ at a time and store every vertex for every animation frame, so their vertex count matters most. Hard edges split vertices; keep them to where the silhouette needs them.

Delete faces pointing more than 45° down (normal Z < −0.7): no camera ever sees them. Keep back and side walls; the title-screen flyover sees buildings from every side.

## Animation

### Infantry (animated units in the table)

Rig with an armature and animate as usual. A build step samples each frame and bakes the result into a vertex animation texture, so the armature doesn't ship.

- Actions, named exactly: `idle`, `walk`, `shoot`, `die`. `deploy` is also needed for `mortar` and `crew`.
- Animate at **15 fps** (scene frame rate). `idle`, `walk` and `shoot` must loop: the first and last frames match.
- Keep each action short. `walk` is one stride cycle of about 0.6–0.8 s at walking speed (2.4–3 m/s, see `speed` in `units.ts`). Total across all actions ≤ 90 frames.
- The rig moves on the spot: no root motion. The game moves the unit.
- `up_*` parts are skinned to the same armature.

### Rigid moving parts (vehicles, buildings)

The game moves `turret` and `spinner` itself; don't animate them. A unit with a **deploy** pose (`artillery`) has an action named `deploy` that keys the transforms of named parts from mobile (first frame) to dug in (last frame). The game plays it as a 0–1 slider. Only key the objects listed under Named objects, plus any extra named child meshes the deploy needs (`leg_1`, `leg_2`, ...).

## Export

File → Export → glTF 2.0:

- Format: **glTF Binary (.glb)**
- Include: Selected Objects; no cameras, no lights
- Transform: **+Y Up**
- Data → Mesh: Apply Modifiers on, UVs on, **Normals off** (the game draws flat-shaded and works normals out itself), Vertex Colors off
- Data → Material: Export
- Animation: on for animated units and deploy actions; off otherwise
- Compression: off for now. Add `gltfpack -cc -kn` (meshopt) as a build step if the total download gets too big

Don't embed `palette.png`: it's shared and loaded once. Export with the texture as a separate file (glTF Separate), or let the build step strip it.

## Checklist per model

1. Faces +X (unit); buildings are built facing −Y, then turned +45° and scaled 0.707 in Blender; origin at ground center; transforms applied.
2. Size matches the table; the outline fits the radius or footprint.
3. Objects named per the table; `muzzle` placed; turret pivot correct.
4. Only `palette` / `team` (/ `glow`) materials; UVs inside swatches; Shade Flat.
5. Within the triangle budget.
6. Exported to `src/public/models/...` with the settings above, and listed in `FILES` in `src/models/gltf.ts` (the game only loads listed models; everything else stays procedural).
