# LOSS_AND_WARNINGS.md — Loss, Approximation and Warning Policy

Status: **DRAFT v1**

The converter classifies every conversion outcome. No source information is silently dropped; anything not representable is either preserved as metadata, approximated, or reported.

## Outcome taxonomy

| Class | Meaning |
| ----- | ------- |
| **EXACT** | Direct, lossless representation in glTF. |
| **APPROXIMATED** | Represented with a documented, bounded approximation. |
| **PRESERVED_AS_METADATA** | Stored verbatim in `extras` (lossless within glTF, but not first-class). |
| **UNSUPPORTED_WITH_WARNING** | Cannot be represented; converter logs a warning and continues. |
| **UNSUPPORTED_WITH_ERROR** | Cannot be represented; converter errors and refuses to emit that asset (or aborts, per CLI policy). |

---

## 1. Losses inherent to glTF

These apply to **every** conversion and are unconditional:

| Item | Source value | Outcome | Note |
| ---- | ------------ | ------- | ---- |
| Left-handed → right-handed | LH scene | APPROXIMATED | reflection + winding flip (COORDINATE_SYSTEM.md). Geometrically equivalent, but chirality differs. |
| UV origin | V bottom-left | APPROXIMATED | `v' = 1 − v`. Texture content assumed stored for bottom-left origin. |
| Euler→quaternion rotation | Euler curves | APPROXIMATED | quaternions only in glTF; potential interpolation-path differences on resample. |
| Curves → samplers | Bézier tangents | APPROXIMATED | glTF supports LINEAR/STEP/CUBICSPLINE only. |

## 2. Exact-by-construction (for completeness)

- Node hierarchy (parent/child), names, TRS values, scene roots.
- Vertex position/normal/tangent/UV0 geometry.
- Indices (with winding reversal).
- Cameras (yfov, znear, zfar).
- Material `_Color`, `_Metallic`, `_Glossiness→roughness`, `_Cutoff`, alpha mode for Opaque/Cutout.
- Texture sampling (wrap, filter, mipmaps), sRGB vs linear flags.

---

## 3. Approximations

| Source feature | Approximation | Risk |
| -------------- | ------------- | ---- |
| `_Mode` 2/3 (Fade/Transparent) | `alphaMode: BLEND` | Source uses explicit `_SrcBlend`/`_DstBlend`/`_ZWrite`; glTF has one blend mode. Sorting artifacts may differ. |
| `_MetallicGlossMap` | channel repack (metallic in B, roughness from A→G) | Requires per-shader channel knowledge; wrong repack shifts look. Must verify against the actual shader source in `Assets/Shader/`. |
| `_SmoothnessTextureChannel` | source-channel choice honored at import | Same as above. |
| Normal maps | green-channel flip | Fine for standard Unity normal maps. |
| `_OcclusionMap` | R-channel AO + `strength` | Unity AO packing varies by shader; verify. |
| Emission | factor clamped to [0,1] (glTF constraint) | HDR emission is truncated; glTF has no HDR emissive in core. |
| Punctual lights | KHR extension + unit conversion | Light intensity units differ (Unity legacy vs physical); range dropped. |
| Animation curves | resampling or CUBICSPLINE tangent mapping | Sampling rate choice affects motion fidelity. |
| FOV/aspect | aspectRatio inferred from sensor | Minor. |

## 4. Preserved as metadata (`extras`)

Anything not core-glTF that still has value in the target file:

- GameObject layer / tag / static flags / active flag.
- Asset GUIDs and fileIDs (provenance / reference tracing).
- Mesh AABBs, lightmap index assignments.
- Full material property tables for unknown shaders (floats/colors/texenvs/keywords).
- Shader name + guid.
- Udon variable tables (raw base64) + resolved object reference list.
- VRCStation fields; UI component fields; AudioSource fields (clip, volume, loop, pitch).
- Collider/Rigidbody geometry+physics fields.
- RenderSettings (fog color/mode/density, ambient, skybox guid).
- LightmapSettings / LightingData (lightmap list, dir maps).
- OcclusionCullingData reference; NavMeshSettings.
- Animation events, float curves, object-ref curves.
- `path_id_map.json` (AuxiliaryFiles) — retain as asset.

## 5. Unsupported with warning (conversion continues)

| Feature | Reason |
| ------- | ------ |
| Light type 3 (Area) | punctual extension can't represent area lights. |
| Light `range` | no glTF equivalent (decay semantics differ). |
| Static-batched combined meshes (if detected) | would need un-baking; use original mesh refs. |
| Extra UV sets (TEXCOORD2..7) | no consumer in core glTF PBR. |
| Lightmap baking (indirect GI from lightmap textures) | glTF has no lightmap support in core; `KHR_texture_transform`-based baking into materials is out of scope for v1. Emit lightmap textures as standalone images + `TEXCOORD_1` + note. |
| Skybox / ReflectionProbes / cubemaps | core glTF has no environment maps. |
| UI Canvas/Text/Image/Button | not a glTF concept. |
| Audio | not a glTF concept. |
| Fog / post-processing / per-renderer flags | viewer-side concepts. |
| Udon/VRChat interactivity | runtime platform logic. |
| Instancing variants, `m_EnableInstancingVariants` | glTF instance extension out of scope. |

## 6. Unsupported with error (conversion aborts for that asset)

- `SkinnedMeshRenderer` / non-empty `m_BindPose` (none in this world).
- Non-empty `m_Shapes` morph targets (none in this world).
- Any `topology` other than triangle list.
- Vertex channels with stream ≠ 0 that carry real data (would be morph/skin streams).
- Unknown index formats.

These are **errors** because silently continuing would produce wrong geometry.

---

## 7. Losses caused by the AssetRipper export itself (upstream, unavoidable)

- Original texture compression is gone; PNGs are decompressed (size/quality). sRGB/wrap/filter restored from `.meta`.
- Some editor-only data and the original shader compilation artifacts are absent.
- `m_CompressedMesh` was empty in this export — if a mesh ever carries compressed data, the export would have decoded it already (nothing to do).
- Original source GUIDs of objects in the scene are internal-only; GUID→file mapping is from `.meta` files.

The converter documents these in the output `extras.source` provenance block.

---

## 8. Output policy for the CLI

Proposed flags (plan.md Phase 11) and their effect on the above:

| Flag | Effect |
| ---- | ------ |
| `--strict` | Upgrade `UNSUPPORTED_WITH_WARNING` → `UNSUPPORTED_WITH_ERROR` (fail on any lossy feature). |
| `--verbose` | Print every classification decision. |
| `--preserve-metadata` | (default on) write `extras`; off = drop metadata (still warns). |
| `--no-textures` | Drop images, keep factors only (warns). |
| `--no-animation` | Drop animation (warns). |

Every conversion emits a **summary report**: counts by outcome class per category (geometry/materials/animation/metadata), so no silent loss can pass unnoticed.

---

## 9. Known open uncertainties (tracked, not decided)

1. Actual channel packing of `_MetallicGlossMap` / `_OcclusionMap` for each shader variant in use (Bakery, Standard, VRChat mobile, Doppels, RED_SIM water…). Must read the `.shader` sources before finalizing the repack table.
2. Unity Euler angle order for `.anim` curves (ZXY per Unity docs — to be confirmed with fixtures).
3. Light intensity → candela/lux conversion for Unity 2019.4.
4. `TextureFormat` enum values (24/28) for lightmap stream decoding.
5. Whether any renderer in the world actually relies on `TEXCOORD_1` lightmaps on non-static geometry (affects whether we emit UV1 at all).
6. Static batching state of `MeshFilter.m_Mesh` references.
