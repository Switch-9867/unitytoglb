# SOURCE_FORMAT.md — Understanding the Source Format

Status: **DRAFT v1** — evidence-based, inferences marked.

## 1. What the "source format" actually is

The input to the converter is an **AssetRipper export** of a Unity project, located at:

```
AssetRipper_export_20260811_145909/
├── AuxiliaryFiles/
│   └── path_id_map.json
└── ExportedProject/
    ├── Assets/
    ├── Packages/manifest.json
    └── ProjectSettings/ProjectVersion.txt   # m_EditorVersion: 2019.4.31f1
```

The original project is a **VRChat world** named **ORGANIZM** built in **Unity 2019.4.31f1**. The relevant source "file format" is therefore **Unity's YAML serialized scene + asset format** (the exported representation of it).

> **Critical provenance note.** AssetRipper is *itself* a converter. The files we read are already a decoded/detailed lossy representation of the original Unity serialized files. Every statement below is about the **exported files as they exist on disk**, which is what the parser must actually consume. Where the export may have dropped original fidelity, we say so (see LOSS_AND_WARNINGS.md).

---

## 2. File-level structure

### 2.1 File inventory of the export

| Extension | Kind | Content | Count (approx.) |
| --------- | ---- | ------- | ---------------- |
| `.unity` | Text (YAML) | Scene: `ORGANIZM.unity` | 1 (12.6 MB, 430,266 lines) |
| `.asset` | Text (YAML) | `Mesh`, `MonoBehaviour`, `LightingData`, `OcclusionCullingData` | ~2000 meshes, 156 MonoBehaviours, 2 occlusion/culling |
| `.mat` | Text (YAML) | `Material` | 880 |
| `.anim` | Text (YAML) | `AnimationClip` | 24 |
| `.controller` | Text (YAML) | `AnimatorController` | 20 |
| `.shader` | Text (CG/HLSL) | `Shader` source | 72 |
| `.texture2D` | Text (YAML) | `Texture2D` with embedded binary stream (used for lightmaps) | ~100 (in `Assets/ORGANIZM/`) |
| `.png` | Binary | Decoded textures | 944 (in `Assets/Texture2D/`, `Cubemap/`) |
| `.ogg` | Binary (Vorbis) | Audio clips | 90 |
| `.meta` | Text | Sidecar metadata (GUID, importer settings) | one per asset |

### 2.2 Text/binary/hybrid

- All **serialized Unity data** is **text** — Unity YAML.
- **PNG / OGG** are binary blobs referenced from YAML by GUID.
- `.texture2D` lightmap files are YAML with a base64-encoded binary `m_Stream` field.

### 2.3 Header / magic bytes

Every YAML asset begins:

```
%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
```

Documents inside a file are separated by document markers of the form:

```
--- !u!<ClassID> &<fileID>
<ClassName>:
```

Example (from `ORGANIZM.unity`):

```
--- !u!1 &103
GameObject:
```

**Legend**

- `<ClassID>` — numeric Unity class identifier (see table in §3).
- `<fileID>` — unique integer id of this object **within this file only**. It is the key used by intra-file references (`{fileID: 4489}`).
- `<ClassName>` — human name of the class.

### 2.4 Version information

- Engine version: `2019.4.31f1` (from `ProjectSettings/ProjectVersion.txt`).
- Many serialized objects carry a per-class `serializedVersion` field (e.g. `Mesh: serializedVersion: 10`, `Material: serializedVersion: 6`, `Camera: serializedVersion: 2`). These are class-format versions and must be respected when parsing.

### 2.5 File sections / chunks

Unity YAML is a **flat sequence of documents**. There is no container, no header section, no table of contents. Objects reference each other by `{fileID}` (same file) or `{fileID, guid, type}` (other file). The parser reads documents sequentially and builds an id→object index.

### 2.6 Global metadata

Scene-level settings live in dedicated document objects in the scene file:

| ClassID | Name | Role |
| ------- | ---- | ---- |
| 29 | `OcclusionCullingSettings` | bake settings, `m_SceneGUID`, `m_OcclusionCullingData` |
| 104 | `RenderSettings` | fog, ambient, skybox material, reflection defaults |
| 157 | `LightmapSettings` | bake params, `m_LightingDataAsset` |
| 196 | `NavMeshSettings` | navmesh build settings |

These appear once at the top of the scene.

### 2.7 Endianness

Serialized binary payloads (vertex data, index buffer) are **little-endian**.

Evidence: mesh `15_ki_coll.asset` first position bytes `7dff89c1 e1b28b42 ...` interpreted little-endian produce ≈ `(-17.25, 872, 0)`, consistent with `localAABB` center `(0, 0, 18.255)` / extent `(17.24975, 69.84937, 18.255)`.

### 2.8 Alignment

The embedded binary vertex/lightmap streams are exported as **hex or base64 ASCII**, so alignment requirements are not visible at the file level. Within the vertex layout, each channel offset is byte-aligned to the channel format size (see §5). The exporter guarantees 4-byte alignment per float attribute.

### 2.9 Compression

- `m_CompressedMesh` exists in Mesh assets but is **empty** in all inspected meshes (`m_NumItems: 0`). All mesh data is uncompressed.
- Lightmap texture streams: `m_TextureFormat: 24` (numeric, see §6.4) — compression state must be decoded from the numeric format; PNGs are already decoded.

### 2.10 External dependencies / resource references

Three reference forms appear throughout:

1. **Intra-file**: `{fileID: 4489}` — object 4489 in the same file.
2. **Cross-file (native asset)**: `{fileID: 4300000, guid: e734c010..., type: 2}` — object `4300000` inside the asset whose GUID is `e734c010...`. The GUID is matched against the `guid:` line of an asset's `.meta` file. `type: 2` denotes a native (unmanaged) asset reference.
3. **Cross-file (managed/script asset)**: `{fileID: 11500000, guid: ..., type: 3}` — used for `MonoScript` (`m_Script`) and a handful of special references (e.g. `AudioSource.m_audioClip` is emitted with `type: 3` in this export).

Confirmed resolution: 2638 of 2640 distinct GUIDs referenced by `ORGANIZM.unity` resolve to a `.meta` file in the project. The 2 un-resolvable GUIDs are Unity built-in placeholders (`0000000000000000e000000000000000` = builtin spot cookie texture, `0000000000000000f000000000000000` = builtin default resources).

### 2.11 `fileID` convention

For single-object assets the `fileID` is derived from the class id:

| Class | fileID in references |
| ----- | -------------------- |
| `Mesh` | 4300000 |
| `Material` | 2100000 |
| `Texture2D` | 2800000 |
| `AudioClip` | 8300000 |
| `AnimationClip` | 7400000 |
| `AnimatorController` | 9100000 |
| `Shader` | 4800000 |
| `MonoBehaviour` (program asset) | 11400000 |
| `MonoScript` (`m_Script` target) | 11500000 |
| `LightingDataAsset` | 112000000 |
| `OcclusionCullingData` | 36300000 |

General rule: `fileID = classID * 100000` for the main object of an asset.

### 2.12 Multiple scenes/assets per file

- One scene per scene file (`ORGANIZM.unity` is the only scene).
- Each asset file contains exactly one main object (plus helper objects such as internal `AnimatorStateMachine`/`AnimatorState` docs in `.controller`, which are addressable via large 64-bit `fileID`s).

---

## 3. Unity class id table (observed in this export)

| ClassID | Class | Occurrences in scene |
| ------- | ----- | -------------------- |
| 1 | GameObject | 4,386 |
| 4 | Transform | 4,296 |
| 20 | Camera | 5 |
| 23 | MeshRenderer | 3,334 |
| 29 | OcclusionCullingSettings | 1 |
| 33 | MeshFilter | 3,334 |
| 43 | Mesh | (in `.asset` files) |
| 54 | Rigidbody | 36 |
| 64 | MeshCollider | 2,366 |
| 65 | BoxCollider | 384 |
| 74 | AnimationClip | (in `.anim` files) |
| 81 | AudioListener | 5 |
| 82 | AudioSource | 205 |
| 95 | Animator | 29 |
| 104 | RenderSettings | 1 |
| 108 | Light | 10 |
| 114 | MonoBehaviour | 869 |
| 135 | SphereCollider | 1 |
| 136 | CapsuleCollider | 25 |
| 157 | LightmapSettings | 1 |
| 196 | NavMeshSettings | 1 |
| 199 | (Editor-only renderer helper) | 13 |
| 215 | ReflectionProbe | 26 |
| 222 | CanvasRenderer | 81 |
| 223 | Canvas | 3 |
| 224 | RectTransform | 90 |

Not present in this export: `SkinnedMeshRenderer` (137), `AnimatorAvatar`, `LightProbeGroup`, `ParticleSystem` (so no skinning / particles at scene level).

---

## 4. Scene model (file-level)

The scene file is a flat list of the above objects. The structural relationships are:

- `GameObject.m_Component[]` — ordered list of `{fileID}` component references (Transform, renderers, colliders, etc.).
- `Transform` — `m_GameObject` (owning object), `m_LocalPosition`, `m_LocalRotation` (quaternion `x,y,z,w`), `m_LocalScale`, `m_Father` (`{fileID: 0}` = root), `m_Children[]`, `m_RootOrder` (sibling index), `m_LocalEulerAnglesHint` (editor hint only).
- `MeshFilter.m_Mesh` — guid reference to a Mesh asset.
- `MeshRenderer.m_Materials[]` — ordered guid references to Material assets (index-aligned with the Mesh's `m_SubMeshes`).
- `MeshRenderer.m_StaticBatchInfo {firstSubMesh, subMeshCount}` + `m_StaticBatchRoot` — static batching metadata (see GLTF_MAPPING.md).

Root objects are Transforms whose `m_Father == {fileID: 0}`. Their `m_RootOrder` gives scene-hierarchy sibling order.

---

## 5. Geometry representation (Mesh assets)

Mesh assets are YAML `!u!43` documents. Key fields (all confirmed from `15_ki_coll.asset` and others):

```
Mesh:
  serializedVersion: 10
  m_Name: 15_ki_coll
  m_SubMeshes:
  - serializedVersion: 2
    firstByte: 0          # byte offset of this submesh's index range into m_IndexBuffer
    indexCount: 36        # number of indices
    topology: 0           # 0 = Triangles
    baseVertex: 0         # index-base to apply when rendering
    firstVertex: 0
    vertexCount: 24       # count of vertices used by this submesh
    localAABB: { m_Center: {...}, m_Extent: {...} }
  m_Shapes: { vertices: [], shapes: [], channels: [], fullWeights: [] }   # morph targets (empty here)
  m_BindPose: []          # skinning bind poses (empty in this export)
  m_BoneNameHashes: ...
  m_IndexFormat: 0        # 0 = UInt16, 1 = UInt32
  m_IndexBuffer: <hex>    # little-endian index data
  m_VertexData:
    serializedVersion: 3
    m_VertexCount: 24
    m_Channels:           # 15 channels, index 0..14
    - stream: 0
      offset: 0
      format: 0           # 0 = Float32
      dimension: 3
    ...
    m_DataSize: 1152      # bytes of vertex data = vertexCount * stride
    _typelessdata: <hex>  # little-endian vertex buffer
  m_LocalAABB: { m_Center: {...}, m_Extent: {...} }
```

### 5.1 Vertex channels

Channel index → semantic (Unity fixed ordering):

| Channel | Semantic |
| ------- | -------- |
| 0 | POSITION |
| 1 | NORMAL |
| 2 | TANGENT |
| 3 | COLOR |
| 4 | TEXCOORD0 (UV0) |
| 5 | TEXCOORD1 (UV1 / lightmap) |
| 6 | TEXCOORD2 |
| 7 | TEXCOORD3 |
| 8 | TEXCOORD4 |
| 9 | TEXCOORD5 |
| 10 | TEXCOORD6 |
| 11 | TEXCOORD7 |
| 12 | BLENDWEIGHTS |
| 13 | BLENDINDICES |
| 14 | (reserved) |

`dimension: 0` means the channel is unused.

### 5.2 Channel format enum

| format | Meaning | Bytes |
| ------ | ------- | ----- |
| 0 | Float32 | 4 |
| 1 | Float16 | 2 |
| 2 | UNorm8 | 1 |
| 3 | SNorm8 | 1 |
| 4 | UNorm16 | 2 |
| 5 | SNorm16 | 2 |
| 6 | UInt8 | 1 |
| 7 | SInt8 | 1 |
| 8 | UInt16 | 2 |
| 9 | SInt16 | 2 |
| 10 | UInt32 | 4 |
| 11 | SInt32 | 4 |

### 5.3 Observed vertex layout (representative)

Sample mesh channels:

```
ch0 POSITION : stream 0, offset  0, format 0 (Float32), dim 3
ch1 NORMAL   : stream 0, offset 12, format 0,             dim 3
ch2 TANGENT  : stream 0, offset 24, format 0,             dim 4   (xyz + handedness w)
ch4 TEXCOORD0: stream 0, offset 40, format 0,             dim 2
```

Stride = 48 bytes; `m_DataSize = 24 * 48 = 1152` ✓.

### 5.4 Streams

- `stream: 0` = the per-vertex interleaved buffer (`_typelessdata`).
- Streams 1–3 are reserved for morph-target deltas in Unity; absent when there are no morphs (as in this export).

### 5.5 Index data

- `m_IndexFormat: 0` → 16-bit unsigned little-endian indices. `1` → 32-bit.
- `m_IndexBuffer` is hex ASCII; `firstByte` is a byte offset into the decoded buffer.
- `topology: 0` = triangle list (the only topology in this export).

### 5.6 Bounding data

- `localAABB`: `m_Center` + `m_Extent` per submesh and per mesh. Can seed glTF accessor min/max (but compute real min/max from POSITION data instead).

### 5.7 Morph targets / skinning

- `m_Shapes`: empty in this export → **no morph targets**.
- `m_BindPose`: empty in this export and **no `SkinnedMeshRenderer`** in the scene → **no skinning**.
- Conclusion: geometry conversion does not need Skin/joints/morph handling for this world (documented for completeness; must error/warn if ever encountered).

---

## 6. Textures and images

### 6.1 Regular textures (`Texture2D/`, `Cubemap/`)

Exported as **PNG**. The `.png.meta` carries importer settings:

```
TextureImporter:
  mipmaps: { enableMipMap: 1, sRGBTexture: 1, ... }
  bumpmap: { convertToNormalMap: 0, externalNormalMap: 0, heightScale: 0.25, normalMapFilter: 0 }
  isReadable: 0
  textureFormat: 28
  textureSettings: { filterMode: 1, aniso: 1, wrapU: 0, wrapV: 0, wrapW: 0 }
  textureType: 0      # 0 = Default, 1 = NormalMap, ...
  alphaIsTransparency: 1
```

Key semantics:

- `sRGBTexture: 1` → color texture; `0` → linear (data).
- `convertToNormalMap: 1` / `textureType: 1` → normal map.
- `wrapU/V`: `0`=Repeat, `1`=Clamp, `2`=Mirror.
- `filterMode`: `0`=Point, `1`=Bilinear, `2`=Trilinear.

### 6.2 Lightmaps (`ORGANIZM/*.texture2D`)

Exported as YAML `!u!28 Texture2D` with an embedded base64 `m_Stream`:

```
Texture2D:
  m_Name: LMGroup_00_final
  m_Width: 1024
  m_Height: 1024
  m_CompleteImageSize: 1048576
  m_TextureFormat: 24
  m_MipCount: 1
  m_Stream: <base64>
```

These are indexed by `LightingData.asset` (`m_Lightmaps[]`, each with `m_Lightmap` + `m_DirLightmap` guid refs) and applied to renderers through their lightmap index (see LOSS_AND_WARNINGS.md — lightmap UVs are not directly representable in glTF without a KHR extension).

### 6.3 Cubemaps

`Cubemap/` contains a `256 x 1536` PNG (6 faces × 256) — vertical cross cubemap. Used by ReflectionProbes / skybox.

### 6.4 Texture format enum note

`m_TextureFormat` numbers (e.g. `24` for lightmaps, `28` for PNGs) reference Unity's `TextureFormat` enum as of 2019.4. **Exact numeric values must be verified against Unity 2019.4 docs before relying on them for channel/byte layout** (inference: `24` is a 1-byte/px luminance-ish or packed format given `CompleteImageSize = 1024*1024`; `28` = ARGB32 for PNG export). For this project the actual bytes are PNG, so decode cost is minimal.

---

## 7. Materials

`Material` assets (`!u!21`, `serializedVersion: 6`):

```
Material:
  m_Name: ...
  m_Shader: {fileID: 4800000, guid: 86836dc02c6364c41a9e0660e6f7ed70, type: 3}  # -> Shader/Bakery_Standard.shader
  m_ShaderKeywords: BAKERY_SHNONLINEAR
  m_LightmapFlags: 4
  m_EnableInstancingVariants: 0
  m_DoubleSidedGI: 0
  m_CustomRenderQueue: -1
  stringTagMap: {}
  disabledShaderPasses: []
  m_SavedProperties:
    serializedVersion: 3
    m_TexEnvs:            # texture slots
      _MainTex: { m_Texture: {fileID: 2800000, guid: ..., type: 3}, m_Scale: {x,y}, m_Offset: {x,y} }
      _BumpMap: { m_Texture: {fileID: 0}, ... }
      _MetallicGlossMap: ...
      _OcclusionMap: ...
      _EmissionMap: ...
    m_Floats:
      _Mode: 0            # 0=Opaque 1=Cutout 2=Fade 3=Transparent
      _Metallic: 0
      _Glossiness: 0
      _Cutoff: 0.5
      _BumpScale: 1
      _OcclusionStrength: 1
      _SrcBlend: 1, _DstBlend: 0, _ZWrite: 1
      _BAKERY_SHNONLINEAR: 1     # Bakery-specific keywords/flags
      ...
    m_Colors:
      _Color: {r: 1, g: 1, b: 1, a: 1}
      _EmissionColor: {r: 0, g: 0, b: 0, a: 1}
```

**Material model observed:** Standard/Bakery shader (metallic + smoothness), NOT metallic/roughness. glTF is metallic-roughness → `roughness = 1 - smoothness` conversion required.

Shader corpus includes many VRChat community shaders (Rain, Water, Skybox, Panosphere, Clouds, Mirror) with bespoke parameters that have **no glTF equivalent** (see LOSS_AND_WARNINGS.md).

---

## 8. Cameras (scene `!u!20`)

```
Camera:
  m_ClearFlags: 1
  m_BackGroundColor: {r,g,b,a}
  m_projectionMatrixMode: 1      # 1 = vertical FOV
  m_NormalizedViewPortRect: {x: 0, y: 0, width: 1, height: 1}
  near clip plane: 0.3
  far clip plane: 1000
  field of view: 60
  m_SensorSize: {x: 36, y: 24}
  m_FocalLength: 50
```

- `field of view` = **vertical FOV in degrees**.
- 5 cameras in scene (main + extras).

---

## 9. Lights (scene `!u!108`)

```
Light:
  m_Type: 2            # 0=Directional, 1=Point, 2=Spot, 3=Area
  m_Color: {r,g,b,a}
  m_Intensity: 4.61
  m_Range: 6.44
  m_SpotAngle: 30
  m_InnerSpotAngle: 21.80208
  m_Shadows: { m_Type: 0, m_Strength: 1, ... }
```

- 10 lights in scene. glTF has no core light support → needs `KHR_lights_punctual` (directional/point/spot only; area = unsupported).

---

## 10. Animation

### 10.1 AnimationClip (`!u!74`)

Confirmed from `cub.anim` (and all 24 clips):

```
AnimationClip:
  m_Name: cub
  m_Legacy: 0
  m_EulerCurves:
  - path: <bone/object path, e.g. empty or root path>
    curve:
      m_Curve:
      - time: 0
        value: {x: 0, y: 0, z: 0}        # local Euler degrees
        inSlope: {...}
        outSlope: {...}
        tangentMode: 1
        weightedMode: 0
        inWeight: {...}
        outWeight: {...}
  m_PositionCurves: [...]   # Vector3 local positions (meters)
  m_ScaleCurves: [...]      # Vector3 local scales
  m_FloatCurves: [...]      # 12 of 24 clips
  m_PPtrCurves: [...]       # object-reference curves (12 of 24), e.g. material/audio refs
  m_Events: []
```

- Time unit: **seconds**.
- Rotation is stored as **Euler angles** (`m_EulerCurves`), Unity rotation order — must be converted to quaternions for glTF (interpolate in Euler then convert, or resample — see GLTF_MAPPING.md).
- Curves carry `inSlope`/`outSlope`/`tangentMode`/`weightedMode` (Unity animation curves, Bézier-like). glTF supports linear/step/cubic-spline only → resampling/approximation required.

### 10.2 AnimatorController (`!u!91`)

```
AnimatorController:
  m_Name: Circle043
  m_AnimatorLayers:
  - m_Name: Base Layer
    m_StateMachine: {fileID: 1107709254077376921}
AnimatorStateMachine:
  m_ChildStates: [ { m_State: {fileID: ...}, ... } ]
  m_DefaultState: {fileID: ...}
AnimatorState:
  m_Name: hole
  m_Motion: {fileID: 7400000, guid: ..., type: 2}   # -> AnimationClip
```

- Simple one-layer, one-default-state machines. Animator (scene `!u!95`) references controller by guid; controller's default state references the clip.

---

## 11. VRChat-specific objects

### 11.1 `UdonBehaviour` (366 instances, scene `!u!114`)

```
MonoBehaviour:
  m_Script: {fileID: 11500000, guid: ca9c02d562e1d03a6f385ba2f733eef7, type: 3}  # UdonBehaviour.cs
  interactText: Use
  proximity: 2
  serializedProgramAsset: {fileID: 11400000, guid: ..., type: 2}   # Udon program asset (MonoBehaviour/*.asset)
  serializedPublicVariablesBytesString: <base64>   # .NET BinaryWriter blob of the public variable table
  publicVariablesUnityEngineObjects: [ {fileID: 127}, {fileID: 4513}, ... ]  # scene object refs
```

The base64 blob is a **UDON-assembly-derived public variable table** serialized via .NET `BinaryWriter` (type-name/type/value tagged). Decoding requires implementing the Udon serialization contract. For scene conversion this is **metadata** (see GLTF_MAPPING.md / LOSS_AND_WARNINGS.md).

### 11.2 `VRCStation` (193 instances)

```
m_Script: {fileID: 11500000, guid: 48c5fe8ecd6bf3d06a561ed0e0318d97, type: 3}  # VRCStation.cs
```

Metadata only (seats/interactions).

### 11.3 CyanTrigger

A single `CyanTrigger.cs` script exists; scene MonoBehaviours are dominated by UdonBehaviour/VRCStation/UI/Bakery scripts. CyanTrigger assets appear in `Assets/MonoBehaviour/` as Udon program assets.

---

## 12. Audio

- `AudioClip` exported as OGG Vorbis (44.1 kHz stereo confirmed).
- Scene `!u!82 AudioSource` (205 in scene):

```
AudioSource:
  m_audioClip: {fileID: 8300000, guid: ..., type: 3}
  m_PlayOnAwake: 1
  m_Volume: 1
  m_Pitch: 1
  Loop: 1
  Spatialize: 0
```

- glTF core has no audio → metadata / extension only.

---

## 13. Scene settings (top of `ORGANIZM.unity`)

- `RenderSettings`: fog enabled (`m_Fog: 1`, linear, `m_FogColor`), skybox material guid → `Material/sky.mat`, ambient colors, custom reflection cubemap guid.
- `LightmapSettings`: `m_GIWorkflowMode: 1`, bake params (PVR settings), `m_LightingDataAsset` → `ORGANIZM/LightingData.asset`, `m_UseShadowmask: 1`.
- `OcclusionCullingSettings`: `m_OcclusionCullingData` → `OcclusionCullingData/OcclusionCullingData.asset` (covers 2,812 renderers).

`LightingData.asset` (`!u!1120`):

```
LightingDataAsset:
  m_Scene: {fileID: 102900000, guid: 6e61c5ad..., type: 3}
  m_Lightmaps:
  - { m_Lightmap: {fileID: 2800000, guid: ...}, m_DirLightmap: {fileID: 2800000, guid: ...}, m_ShadowMask: {fileID: 0} }
  ...
```

---

## 14. Confirmed facts vs. inferences

### Confirmed (directly observed in exported files)

1. YAML format, `%TAG !u!`, `--- !u!<classID> &<fileID>` documents.
2. `{fileID, guid, type}` reference scheme; 2638/2640 scene GUIDs resolve via `.meta`.
3. Mesh: submeshes/index buffer/vertex channels/`_typelessdata` hex; little-endian; stride/channel layout above.
4. Transform: local TRS (quaternion `x,y,z,w`), `m_Father`/`m_Children`/`m_RootOrder`.
5. Material: `_Color`, `_MainTex`, `_Metallic`, `_Glossiness`, `_Mode`, texenvs, keywords.
6. Camera: vertical FOV 60, near 0.3, far 1000.
7. Light: types 0/1/2, color/intensity/range/spot angles.
8. AnimationClip: Euler position/rotation/scale curves, seconds, tangent data; AnimatorController: one default state → clip.
9. VRChat Udon/Station objects and base64 variable tables.
10. Texture PNG export + importer `.meta` fields.

### Inferred / to verify

1. Exact `TextureFormat` enum values (24, 28) — verify against Unity 2019.4.
2. Unity Euler angle **rotation order** (Unity applies Euler in `ZXY` intrinsic order for `localEulerAngles`; `tangentMode` semantics) — verify with fixtures.
3. `type: 2` vs `type: 3` semantic split (observed: 2 for native assets, 3 for MonoScripts/audio — treat as exporter convention).
4. Udon binary variable-table layout (need Udon serialization spec or CyanTrigger sources as authority).
5. Static-batching semantics in the export (`m_StaticBatchInfo`/`m_StaticBatchRoot`) — whether MeshFilter meshes are originals or combined.
6. Light intensity units (physical vs legacy) for punctual-light conversion.
7. Whether `m_TextureFormat: 24` lightmap stream is a single-channel luminance layout (see §6.4).

---

## 15. Parser-facing summary

The parser must:

1. Split multi-document YAML files on `--- !u!`.
2. Map `&fileID` → object; index `m_GameObject`, `m_Father`, `m_Children` links.
3. Resolve GUID references by reading the `.meta` sidecars of referenced files.
4. Decode `_typelessdata`/`m_IndexBuffer` hex (little-endian) into typed arrays per the channel table.
5. Decode `m_Stream` base64 for lightmap textures.
6. Decode `.controller` internal documents (state machine/state fileIDs).
7. Decode `serializedPublicVariablesBytesString` (Udon) — at minimum capture raw for metadata.
