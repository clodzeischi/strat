---
name: infantry-model
description: Build, rig, animate and export an animated infantry unit (Fremen, Sardaukar, troopers...) for strat in Blender via MCP, the way the Sardaukar was made. Use when the user brings a concept for a new infantry unit or wants one redone.
---

# Infantry model workflow

This is how the Corrino Sardaukar was made (October 2026). The user approved every animation on the first pass.

**Reference files:**
- `docs/low-poly-style.md`: the topology rules and tri budget.
- `docs/model-spec.md` (the Infantry section): the names the game expects.
- `art/models/units/sardaukar.corrino.blend`: the worked example. Its `build.py`, `idle.py`, `walk.py`, `shoot.py` and `die.py` texts are the full scripts.

**Helpers:** `scripts/` holds the reusable code. Run it inside Blender with `exec(open(path).read())`.
- `shells.py`: build the mesh.
- `pose.py`: pose the rig and key the actions.
- `checks.py`: pre-export checks.
- `export.py`: write the `.glb`.
- `md3.py`: read Quake 3 models for study.

## Ground rules (the user's)

- Work on a branch per unit (`<faction>-<unit>`). Commit locally as you go, and merge and push only when the user says.
- Show designs and get approval before exporting, playtesting or pushing.
- **Never** `open_mainfile` or revert while `bpy.data.is_dirty` is true. The user edits in the same Blender, and reloading once lost their work. Save first if it's their work in progress. If something does get lost, the autosaves are in `/var/folders/.../T/`.
- After the user hand-edits a mesh or an action, never rerun the script that generated it. Each generator gets a header saying so.
- Read the concept for *look*, but take *function* from the game. The Sardaukar concept shows a blade, but in game he's a carbine gunner, so he got a carbine and a sheathed blade. Check `src/config/units.ts` for the weapon, range, speed and cooldown.

## 1. Model: low-poly shells

1. **Start from the faction's last infantry `.blend`:** "save as" the new name and delete the old actions. That keeps `kit.py` (the palette swatches and `uv_of`), the materials and the 17-bone rig. Adjust the bone positions for the new height first. The model is drawn 1.6× in game, and these are the sizes:
   - Atreides: 0.75 m;
   - Sardaukar: 0.82 m;
   - Harkonnen: 0.90 m.
2. **Build it with `shells.py`, in the A pose on that rig, following `docs/low-poly-style.md`:**
   - **Shells:** pelvis, torso and head are welded shells. Legs and arms are separate shells whose open ends sink into the pelvis and torso, so they cost nothing.
   - **Rings:** irregular 4–6 point rings, with a ridge on the silhouette and vertices only at joints and where the outline turns.
   - **Joints:** use `poke()` for the kneecap and elbow points.
   - **Colour:** put colours on edges the shape already has (the `over=` argument of `band()`). Use the darker team shade (`CLOTH`) for cloth.
   - **Cloth:** capes and tabards are thin closed slabs (`prism_x`). Don't use single-sided quads; the game culls back faces.
   - **Weapons:** build the weapon as a side profile (`prism_y`) in the `hand_frame()` grip frame, weighted 100% to `hand.R`. Place `muzzle()` at the barrel tip.
   - **Mirroring:** build the left side only and `mirror(m)` it. Add asymmetric parts after mirroring (the Sardaukar's scabbard is on the left hip).
3. **Budget:** about 300–420 tris with every tier shown. The Sardaukar came out at 414, and the user called that negligible for the quality. Quality beats a hard cap.
4. **Show the user:** use `look` with `angles`, and colours in Material Preview (`shading.type='MATERIAL'`). Solid mode hides the team tint. Also pose it in a quick weapon-ready stance before showing it. **Check the silhouette with the armour tiers hidden:** the Sardaukar's arms looked detached once `armor1` was off, and the user had to add inner shoulder rings.
5. **The user tweaks next,** usually by moving vertices without changing the topology. Afterwards, find what broke and reweight only that.
   - Inner shoulder ring sunk in the torso: chest 0.7 / upper_arm 0.3.
   - Shoulder ring: chest 0.2 / upper_arm 0.8.
   - Everything else: project onto the bone chain with ~0.02 blends at the joints.
6. **Tidy up:** delete the superseded objects, then rename to the export names: `body`, `armor1`, `weapons0`, `weapons1`, `muzzle`.

## 2. Animate: one action at a time, directed by the user

Ask the user for the overall character first. The Sardaukar brief was: "neutral, disciplined, no dance-like moves like the Fremen". Then, for each action:
1. **Ask how it should feel.** Offer the in-game facts that constrain it: speed, cooldown and the frame budget. Then follow the user's brief literally.
2. **Write the pose functions with `pose.py`:**
   - `aim`/`yaw` for the spine and head;
   - `leg_reach` plus `plant()` for feet on the ground;
   - `hold`/`hold_r` for a two- or one-handed weapon;
   - `ground()` for kneeling or lying poses.
3. **Key it with `key_action()`.** Then check every frame with `frames_on_ground()`; don't eyeball it.
4. **Show it:** call `frame_set(f)`, then `look` in `angles` mode. `frames` mode framed the figure tiny.
5. **Revise until the user approves.** After that, never regenerate that action.

The game's rules for actions:
- Exactly `idle`, `walk`, `shoot` and `die`, at 15 fps.
- `idle`, `walk` and `shoot` loop: the last key equals the first, with a CYCLES modifier and `use_cyclic`.
- No root motion.
- At most 90 frames in total.

| Action | Sardaukar brief | What made it work |
|---|---|---|
| idle | "Stands with weapon up, other arm by his side; slightly wider athletic stance" | Carbine one-handed, muzzle up. One slow breath over 30 frames. Leg IK keeps the boots planted. |
| walk | "Determined brisk range walk, carbine at low ready across body, torso slightly forward" | Every frame keyed on an 8-frame cycle (LINEAR). The planted foot slides back at constant speed, `plant()` checks the boots every frame, the hips stay low and level, the chest counters the hip twist. |
| shoot | "Torso slightly turned clockwise, weapon shouldered, left hand supporting the front, wider bracing stance" | Hips −12°, shoulders −24°, head counter-yawed onto the target. Cycle = weapon cooldown (0.75 s = 11 frames): kick on frame 2, settled by frame 7. |
| die | "Fall to his knees, lean on his weapon, pause, collapse" | 31 frames, played once: hit, knees, gun planted muzzle-down with the left hand on the knee, ~0.8 s sagging pause, topple, prone. |

**Walk cadence:** fast units slip. Distance covered per cycle = 4 × stride reach × 1.6 (draw scale), compared with `speed` × cycle time. The Sardaukar (speed 2.6) covers about 70% of the ground at 8 frames and about 92% at 6 frames. Give the user the numbers and let them choose; they took 8.

## 3. Check, export, playtest

1. `checks.py` → `check_all()`, plus `frames_on_ground(action)` for every action. It covers:
   - **Normals:** inside-out pieces, and tops or bottoms facing the wrong way. A single flipped cap is invisible in Blender and a hole in game, as with the Sardaukar's neck.
   - **Weights:** no unweighted vertices, and left/right weights match.
   - **Budget:** frames ≤ 90.
   - **Ground:** the soles touch the ground and nothing sinks. Blends between poses sink: the die drop needed hip keys at the in-between frames.
2. Export with `export.py` → `export('<repo>/src/public/models/units/<type>.<faction>.glb')`. Then compare its nodes and animations with an existing infantry `.glb`.
3. Add `'units/<type>.<faction>'` to `FILES` in `src/models/gltf.ts`, then run `npx tsc --noEmit -p .`.
4. **Smoke test** in the browser:
   - set `sessionStorage['strat.autostart'] = 'normal:128:7:<faction>:<enemy>'` and reload;
   - spawn units with `game.spawnUnit(type, team, x, z, 0)` next to `game.buildings[0]`;
   - frame them with `rts.lookAt(x, z); rts.dist = 7; rts.apply()`.

   Then the user playtests.
5. On approval: add a section to `docs/art-direction.md`, merge into main, type-check, push and delete the branch.

## Pitfalls hit so far

- **Weights wiped:** clearing vertex groups *after* `bm.to_mesh` wipes the weights. Create the groups first (`build_object` does).
- **Material indices reset:** clearing materials after `to_mesh` resets every face's material index.
- **Mirror test:** decide a shell's side by its centroid, not its minimum y (a leg's inner edge crosses y=0).
- **Cap normals:** a cap's centre sits on its shell's axis, so the "face away from the axis" test can't orient it. `cap()` takes an explicit direction for this.
- **Twist adds up:** `aim()` keeps a bone's inherited twist, so turns accumulate down the spine. `yaw()` each bone by its own extra turn only.
- **Kneeling:** feet pointed down lift the knees off the ground. Tuck the feet flat behind.
- **Export from Pose Mode:** `select_all` fails its poll there. `export.py` uses `select_set` inside a VIEW_3D `temp_override`.
- **Study models:** the Quake 3 references are in `~/Desktop/pak0/models/players/`; load them with `md3.py`. Use them for rules only; no id geometry goes into the game.
