# IMPLEMENTATION_PLAN.md — TypeScript Architecture & Implementation Sequence

Status: **DRAFT v1**

## 1. Goals

- A TypeScript **library** (`scene-to-gltf`) that converts the AssetRipper export (Unity YAML scene+assets) into glTF 2.0 / GLB via `@gltf-transform/core`.
- A thin **CLI** on top (`scene-to-gltf input.glb… `, see §9).
- **Faithful conversion first**: correctness over feature coverage; explicit loss reporting.

## 2. Layering (plan.md Rule 13)

```
┌─────────────────────────────────────────────────────┐
│ CLI (bin/)                 — args, options, I/O     │
├─────────────────────────────────────────────────────┤
│ Conversion (src/convert/)  — SourceModel → glTF doc │
├─────────────────────────────────────────────────────┤
│ Source model (src/model/)  — typed Source* objects  │
├─────────────────────────────────────────────────────┤
│ Parsing (src/parse/)       — YAML/hex/base64/PNG    │
├─────────────────────────────────────────────────────┤
│ I/O (src/io/)              — file walking, guid map │
└─────────────────────────────────────────────────────┘
```

Dependency direction is strictly downward. Parsing never sees glTF; conversion never sees file paths.

## 3. Repo layout

```
src/
  io/
    exportRoot.ts        # locate Assets/, read .meta guid map, path_id_map.json
    guidIndex.ts         # guid -> {file, classId, mainFileId}
  parse/
    yaml.ts              # multi-doc YAML splitter + minimal document parser
    scene.ts             # ORGANIZM.unity -> SourceScene
    mesh.ts              # Mesh .asset -> SourceMesh (hex decode, channels)
    material.ts          # .mat -> SourceMaterial
    texture.ts           # .png + .meta, .texture2D base64, cubemap strip
    anim.ts              # .anim + .controller -> SourceAnimationClip
    audio.ts             # .ogg (bytes passthrough)
    behaviour.ts         # MonoBehaviour (Udon base64 blob capture)
    lighting.ts          # LightingData, OcclusionCullingData
  model/
    types.ts             # Source* interfaces (SOURCE_MODEL.md)
    index.ts             # SourceBundle + resolve(ref)
  convert/
    convert.ts           # orchestration: SourceBundle -> Document
    coords.ts            # all COORDINATE_SYSTEM.md math + fixture helpers
    geometry.ts          # SourceMesh -> primitives/accessors
    hierarchy.ts         # nodes/edges
    materials.ts         # SourceMaterial -> Material (+shader-specific tables)
    textures.ts          # SourceTexture -> Image/Sampler
    cameras.ts, lights.ts, animation.ts
    metadata.ts          # extras writers
    report.ts            # outcome-class summary (LOSS_AND_WARNINGS.md)
  classify/
    outcomes.ts          # EXACT / APPROX / META / WARN / ERR decision helpers
bin/
  cli.ts
test/
  fixtures/…             # small deterministic Unity YAML + hex datasets
```

## 4. YAML parsing strategy

Unity YAML is a restricted subset of YAML. Do **not** pull a full YAML dependency if avoidable; if we do, pin one that preserves scalar key order and numeric precision.

- Split on `^--- !u!<id> &<fileId>`; keep `%TAG` line.
- Represent each document as `{ classId, fileId, className, tree: Node }` where Node is an ordered map/array/scalar tree.
- Scalar types: int, float (full precision, prefer reading as raw string and parsing later where precision matters), bool, string, `{r,g,b,a}`, `{x,y,z}`, `{x,y,z,w}` vectors, `{fileID, guid, type}` refs, hex blobs.
- `&<fileId>` may repeat object id inside animations (nested documents share the file id space for sub-objects) — index by `(docIndex, fileId)` internally, but references inside a `.controller`/`.anim` use the large fileIDs directly.

Precision: floats like `-1.1808302E-06` must not round-trip through a lossy YAML float parser.

## 5. GUID resolution

- Build `guidIndex` from every `*.meta` file: `guid → { path, classId, mainObjectFileId }`.
- Scene references of form `{fileID, guid, type}` resolve via the index. `{fileID}`-only references resolve within the current file.
- Missing GUID → `UNSUPPORTED_WITH_WARNING` (broken reference), record in report.
- Builtin GUIDs (`0000…e000`, `0000…f000`) → skip (engine placeholders).

## 6. Mesh decoding pipeline

1. Parse `m_Channels`; for each channel compute `size = formatSize(format) * dimension`.
2. `stride = max(offset + size)` across used channels on stream 0.
3. Decode `_typelessdata` hex → `Uint8Array`; validate `stride * vertexCount === m_DataSize`.
4. Extract per-channel typed views honoring `format`:
   - Float32 → DataView.getFloat32(le)
   - Float16 → half-to-float conversion
   - UNorm8/SNorm8/UNorm16/SNorm16 → normalize to float
   - UInt/SInt → keep integer, or float for glTF accessor
5. Decode `m_IndexBuffer` per `m_IndexFormat` (uint16/uint32, little-endian), respecting `firstByte`/`indexCount`/`baseVertex` per submesh.
6. Windowing: reverse per-triangle order during index copy.
7. Morph/skin streams (stream 1..3) or non-empty bind poses → `UNSUPPORTED_WITH_ERROR`.

## 7. Conversion pipeline (order of work)

### Phase A — Core vertical slice (plan.md Phase 8)
Source → parse scene graph + **one** mesh + **one** material → GLB viewable in a viewer.
Checks: correct root/hierarchy, one cube/quad, one PBR material, coordinate/winding/UV-correctness.

### Phase B — Full static scene (plan.md Phase 9: 1–7)
1. Full scene hierarchy + all nodes/transforms.
2. All meshes → primitives/accessors (dedup by mesh guid).
3. All materials (Standard/Bakery recognized set) → PBR.
4. Textures → images/samplers (PNG path first; lightmap decode later).
5. Cameras.
6. Lights via `KHR_lights_punctual`.
7. Metadata (extras) + report.

### Phase C — Animation (plan.md Phase 9: 9)
1. `.controller` default state → active clip per Animator.
2. `.anim` position/rotation/scale curves → channels; Euler→quat; resample policy.
3. Float/PPtr curves → extras.

### Phase D — Extension features
- Lightmap export as standalone images + UV1 + notes (out of core PBR).
- `KHR_texture_transform` optional.
- Cubemap/skybox images as metadata.

### Phase E — Validation gates (plan.md Phase 10)
Continuous from Phase A; see TEST_PLAN.md.

## 8. @gltf-transform/core usage notes

- Build `Document`, `node(name)`, `mesh(name)`, `primitive`, `accessor`/`buffer` writes, `material`, `image`, `sampler`, `camera`, `animation`.
- Accessors: create buffers via `doc.createBuffer()` + `getWriter()`, or use `@gltf-transform/core` accessor `setArray`/`setBuffer`. Choose the `WriterUtils`-style manual buffer build for full control of interleaving/min-max.
- Min/max computed from converted data (not source AABB).
- KHR extension: `@gltf-transform/extensions` `KHRTextureTransform`, `KHRMaterials*` as needed; lights via `KHR_lights_punctual` — implement/register per extension docs.
- Serialize: `doc.toGLB()` / `doc.toJSON()`; validation via `@gltf-transform/validate`.

## 9. CLI

```
scene-to-gltf inputDir output.glb [options]
```

- `inputDir` = the AssetRipper export root (`AssetRipper_export_20260811_145909/`).
- Options (finalize after library works):
  `--scene ORGANIZM.unity`, `--format glb|gltf`, `--output`, `--verbose`, `--strict`, `--preserve-metadata`, `--no-textures`, `--no-animation`, `--resample-rate 30`, `--report <path>`.
- Exit codes: 0 ok (warnings allowed), 1 error, 2 strict violations.
- Print the loss/warning summary report on completion.

## 10. Sequence milestones

| # | Milestone | Definition of done |
| - | --------- | ------------------ |
| M1 | Parse scene graph | Scene → SourceScene with full hierarchy; unit tests |
| M2 | Parse mesh | SourceMesh decode incl. hex/little-endian/channels; tests |
| M3 | Vertical slice | One mesh+material → valid GLB; viewer check |
| M4 | Full static scene | 3,334 renderers → GLB; validate, report counts |
| M5 | Materials + textures | PBR conversion for Standard/Bakery; lightmap decode |
| M6 | Cameras + lights | KHR punctual output; validation |
| M7 | Animation | clips → channels; Euler order fixtures pass |
| M8 | Metadata + report | extras + outcome report; `--strict` enforcement |
| M9 | CLI polish | options, docs, exit codes |

## 11. Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| YAML precision/format drift | minimal parser + precision tests |
| Shader property channel assumptions | read `.shader` sources before finalizing repack table |
| Euler order wrong | fixture-verified tests first (COORDINATE_SYSTEM.md §10) |
| Udon blob decode | not required for v1; captured as metadata |
| Static batching surprises | verify `MeshFilter.m_Mesh` vs combined meshes on sampled scene data |
| Lightmap decode (format 24) | verify enum; else emit warning + raw stream as metadata |
