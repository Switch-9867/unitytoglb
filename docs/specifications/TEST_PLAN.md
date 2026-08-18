# TEST_PLAN.md — Fixtures & Tests

Status: **DRAFT v1**

Goal: prove correctness of parsing, source representation, conversion, and serialization with **small deterministic fixtures**, not only production assets (plan.md Phase 10).

## 1. Test layers

1. **Parser tests** — raw YAML/hex → SourceModel.
2. **Model tests** — identity/hierarchy/reference resolution.
3. **Math tests** — COORDINATE_SYSTEM.md conversions (pure functions).
4. **Conversion tests** — SourceModel → glTF Document.
5. **Serialization/validation tests** — GLB bytes valid; `@gltf-transform/validate` passes; accessor min/max correct.
6. **Integration** — a tiny curated slice of the real world + one full-scene smoke run.

## 2. Fixture strategy

Hand-author minimal Unity YAML **in the exact format the exporter emits** (verbatim structure, not general Unity): one scene + a couple of assets. Keep them tiny (a quad, a cube, a camera, a spot light, one material, one clip). Reference sample asset files:
- `Mesh/15_ki_coll.asset` (24 verts, 48B stride, uint16 indices) — use as the canonical decode vector.
- `Material/01 - Defa22ul2t111122.mat`, `1626718360_….mat`.
- `AnimationClip/cub.anim` (Euler curves), `AnimatorController/Circle043.controller`.
- `Texture2D/131e2122_16815-71-2.png` + `.meta`.
- `ORGANIZM/LMGroup_00_final.texture2d` (lightmap stream).

Fixture tree lives in `test/fixtures/`; each fixture is `*.scene`/`*.mesh`/`*.mat`/`*.anim` YAML + `.meta` so the guid index can be exercised.

## 3. Structural correctness

- Valid GLB header (`glTF`, version 2, length), JSON chunk + BIN chunk.
- Correct `scene` root count and node hierarchy mirroring source (names, parent edges, sibling order).
- Every `node.mesh`/`primitive.material`/`primitive.indices`/accessor reference resolves; no orphans.
- No dangling `image`/`sampler`/`material`; `--strict` flags any.

## 4. Geometry correctness

| Test | Expectation |
| ---- | ----------- |
| Quad (4 verts, 2 tris, known positions) | positions `(x,y,−z)`; min/max match; winding reversed (`i2,i1,i0`) |
| Cube (24 verts / 12 tris) | faces outward in right-handed space (validated by accessor orientation + a viewer snapshot) |
| `15_ki_coll` decode | 24 verts, stride 48, channel offsets [0,12,24,40], uint16 indices, 36 indices, submesh slice from `firstByte` |
| Index formats | uint16 and uint32 fixtures |
| Normal/tangent | negate z; tangent w flips; unit vectors preserved |
| UV0 | `(u, 1−v)` |
| baseVertex handling | index offset applied |
| Accessor min/max | computed from converted data == expected for each fixture |

## 5. Transform correctness

| Fixture | Expectation |
| ------- | ----------- |
| Identity | TRS unchanged |
| Translation (0,0,1) | `(0,0,−1)` |
| 90° rotations X/Y/Z | quaternion sign rules per COORDINATE_SYSTEM.md §3.2 |
| Scale (2,2,2) and (−1,1,1) | unchanged |
| Parent/child (child local (1,0,0) of parent local (5,0,0)) | world = (6,0,0) in glTF; recompute both spaces, equal up to eps |
| Mixed hierarchy | recursive world matrix equality: `M_gltf(world) == R · M_unity(world) · R` |

## 6. Material correctness

| Fixture | Expectation |
| ------- | ----------- |
| Opaque, `_Color` (0.5,0.25,0.125,1), `_Glossiness 0.8` | baseColorFactor (0.5,0.25,0.125,1); roughnessFactor 0.2; metallicFactor `_Metallic` |
| Cutout `_Mode 1`, `_Cutoff 0.4` | alphaMode MASK, alphaCutoff 0.4 |
| `_Mode 3` | alphaMode BLEND |
| `_MainTex` + wrap/filter from `.meta` | image + sampler wrapS/T, mag/min filter |
| Normal map | normalTexture + green flip; `scale=_BumpScale` |
| MetallicGlossMap | channel repack B→B, A→G (per verified shader table) |
| Unrecognized shader | falls back to base color; full props in `extras`; warning emitted |

## 7. Animation correctness

| Fixture | Expectation |
| ------- | ----------- |
| Linear position clip (2 keys) | `input [0,t]`, `output (x,y,−z)`, interpolation LINEAR |
| Constant keys | STEP |
| Euler rotation keys | quat(Unity order) then reflect; compare against hand-computed values |
| Resampling (default 30 fps) | sampled values within tolerance of source curve (eval via fixture curve formula) |
| Scale keys | unchanged |
| Controller default state | animation present, name = clip name |

## 8. Camera & light correctness

| Fixture | Expectation |
| ------- | ----------- |
| Camera fov 60, near 0.3, far 1000 | yfov π/3, znear 0.3, zfar 1000 |
| Camera node orientation | views −Z |
| Directional light | KHR directional, color/intensity mapped |
| Spot light 30°/21.8° | outerCone 15°, innerCone 10.9° |
| Area light | warning, not emitted (or error in strict) |

## 9. Data preservation

- `extras` present for layer/tag/guid/Udon raw blob/VRCStation; contents exact.
- Outcome report counts: categories sum to processed objects; no unclassified items.
- `--preserve-metadata` off → extras dropped, report still lists them.
- `--no-textures` / `--no-animation` behave as documented with warnings.

## 10. Regression data

- Keep a **golden GLB** for each fixture (byte-hash) after every change to catch nondeterminism (careful: GLB may embed timestamps — normalize or compare JSON+bin separately).
- Validate every produced GLB with `@gltf-transform/validate`.

## 11. Test runner

- `vitest` (or node:test) — plain TypeScript, no Unity tooling required.
- CI runs: `yarn test`, `yarn lint`, `yarn typecheck`, `yarn test:golden`.

## 12. Known areas needing manual/visual confirmation (not unit-testable)

- Viewer render snapshot for the vertical-slice scene (front-face orientation, texture orientation).
- Lightmap visual parity (deferred to extension milestone).
