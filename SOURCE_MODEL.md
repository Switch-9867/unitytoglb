# SOURCE_MODEL.md — Clean Conceptual Model of the Source

Status: **DRAFT v1**

This document defines the internal representation the parser produces and the converter consumes. It intentionally **mirrors the source format's own concepts**, not glTF concepts (see plan.md Rule 7).

---

## 1. Principles

1. The model is a faithful picture of the Unity scene/asset graph as exported, not a glTF picture.
2. Every field is either **source-faithful** (holds raw semantics) or marked with a defined unit/convention.
3. Ambiguities are surfaced as explicit fields or annotations, never silently dropped.
4. Names/IDs are preserved so metadata mapping is traceable.

---

## 2. Top-level model

```text
SourceBundle (the AssetRipper export root)
├── SourceScene            # ORGANIZM.unity
│   ├── SceneSettings      # RenderSettings, LightmapSettings, OcclusionCullingSettings, NavMeshSettings
│   ├── SourceNode[]       # every GameObject+Transform
│   ├── SourceCamera[]
│   ├── SourceLight[]
│   ├── SourceAudioSource[]
│   ├── SourceAnimator[]   # live controllers
│   ├── SourceBehaviour[]  # MonoBehaviours (Udon, VRCStation, UI, Bakery ...)
│   ├── SourceRenderer[]   # MeshRenderer / CanvasRenderer (links node->mesh->materials)
│   └── SourceCollider[]   # Mesh/Box/Sphere/Capsule colliders + Rigidbodies
├── SourceMesh[]           # Mesh assets
├── SourceMaterial[]       # .mat
├── SourceTexture[]        # .png + .meta  (and .texture2D lightmaps)
├── SourceCubemap[]
├── SourceShader[]         # .shader text
├── SourceAnimationClip[]
├── SourceAnimatorController[]
├── SourceAudioClip[]      # .ogg
├── SourceLightingData     # Lightmap tables
├── SourceOcclusionData
└── SourceAssetFile[]      # generic fallback for anything not mapped (preserved as raw YAML)
```

---

## 3. Identity model

Every source object has:

- `fileID: number` — unique within its own file.
- `sourceFile: string` — path of the file it came from.
- `classId: number` — Unity class id (1=GameObject, 4=Transform, ...).
- `name: string` — `m_Name` (GameObjects, assets), or generated (e.g. `Transform/<fileID>`).
- `guid: string` — only for assets that have a `.meta` guid.
- `references: Reference[]` — recorded **raw** references (see below) so the converter can chase them lazily and the metadata layer can rebuild provenance.

### Reference value type

```ts
interface Ref {
  fileID: number;
  guid?: string;      // undefined => intra-file reference
  type?: 0 | 2 | 3;   // source's own type tag; 0/absent => intra-file
}
```

Resolution is a separate concern: `SourceBundle.resolve(ref) => SourceObject | SourceAsset`.

---

## 4. Scene graph

### 4.1 SourceNode

One per `GameObject` + its `Transform` (they are 1:1 by `m_GameObject`).

```ts
interface SourceNode {
  fileID: number;
  name: string;
  layer: number;            // m_Layer
  tag: string;              // m_TagString
  active: boolean;          // m_IsActive
  staticFlags: number;      // m_StaticEditorFlags (raw)

  // transform (all LOCAL)
  localPosition: Vec3;      // meters, Unity world units
  localRotation: Quat;      // x,y,z,w  (left-handed convention)
  localScale: Vec3;         // uniform usually; can be non-uniform/negative
  parentFileId: number | null;   // null => scene root
  childFileIds: number[];   // ordered
  rootOrder: number;        // m_RootOrder (editor sibling index)

  // components attached to this GameObject
  componentFileIds: number[];      // raw m_Component order
}
```

Ownership: each object has **exactly one parent** (a single `m_Father`). Cycles are impossible by construction in Unity serialization (roots have `m_Father: {fileID: 0}`).

### 4.2 Hierarchy resolution rules

1. Scene roots = nodes with `parentFileId === null`.
2. Sibling order: by `m_RootOrder` within a parent (stable; if missing, by `m_Children[]` order).
3. Effective world transform for a node = composition of local TRS from the scene root down (Unity convention `M_world = M_parent · T · R · S`). See COORDINATE_SYSTEM.md for the exact composition and the handedness conversion applied at conversion time.

---

## 5. Geometry model

### 5.1 SourceMesh

```ts
interface SourceMesh {
  name: string;
  subMeshes: SubMesh[];        // in order
  indexFormat: 'uint16' | 'uint32';
  indexBytes: Uint8Array;      // raw little-endian
  vertexData: VertexData;      // typed channels + stride
  localAabb: { center: Vec3; extent: Vec3 };  // informational
  hasShapes: boolean;          // morph targets (false in this world)
  hasSkin: boolean;            // bind poses (false in this world)
}
```

### 5.2 VertexData

```ts
interface VertexData {
  vertexCount: number;
  strideBytes: number;         // max(offset+size) over channels on stream 0
  channels: VertexChannel[];   // index 0..14 semantic table (see SOURCE_FORMAT.md §5.1)
  data: Uint8Array;            // raw interleaved stream 0
}

interface VertexChannel {
  semantic: number;            // 0..14
  stream: number;              // 0 only in this export
  offset: number;              // bytes from start of vertex
  format: VertexFormat;        // Float32..SInt32 (see table)
  dimension: number;           // 0 = unused
  sizeBytes: number;           // computed = formatSize * dimension
}
```

### 5.3 SubMesh

```ts
interface SubMesh {
  topology: number;            // 0 = triangles
  firstByte: number;           // byte offset of index range in indexBytes
  indexCount: number;
  baseVertex: number;
  firstVertex: number;
  vertexCount: number;
}
```

The material for a submesh is implied by position in the **renderer's** `m_Materials[]` (index = submesh index). Mesh assets do not store material links.

---

## 6. Material model

```ts
interface SourceMaterial {
  name: string;
  shaderGuid: string | null;           // -> SourceShader
  shaderKeywords: string[];            // m_ShaderKeywords (space-separated in source)
  lightmapFlags: number;
  customRenderQueue: number;
  doubleSidedGI: boolean;
  // m_SavedProperties
  texEnvs: Record<string, TexEnv>;     // keyed by shader property name (e.g. _MainTex)
  floats: Record<string, number>;      // _Mode, _Metallic, _Glossiness, _Cutoff, ...
  colors: Record<string, Vec4>;        // _Color, _EmissionColor, ...
  stringTags: Record<string, string>;
}

interface TexEnv {
  textureGuid: string | null;          // null = {fileID: 0}
  scale: { x: number; y: number };     // UV scale
  offset: { x: number; y: number };    // UV offset
}
```

**Do not map property names to meanings at parse time.** `_MainTex` means whatever the attached shader says it means. Semantic interpretation (albedo/normal/emissive/…) happens in the conversion layer and only for shaders we recognize (Bakery/Standard variants); unknown shaders are preserved verbatim as metadata (LOSS_AND_WARNINGS.md).

---

## 7. Texture model

```ts
interface SourceTexture {
  name: string;
  guid: string;
  kind: 'png' | 'lightmap' | 'cubemap';
  width: number;
  height: number;
  bytes: Uint8Array;             // PNG bytes for png; decoded pixels for lightmap/cubemap
  importer: {
    sRGB: boolean;
    isNormalMap: boolean;        // textureType===1 || convertToNormalMap
    wrapU: 0 | 1 | 2;            // Repeat/Clamp/Mirror
    wrapV: 0 | 1 | 2;
    filterMode: 0 | 1 | 2;       // Point/Bilinear/Trilinear
    mipMaps: boolean;
    alphaIsTransparency: boolean;
  };
}
```

---

## 8. Camera model

```ts
interface SourceCamera {
  nodeFileId: number;            // owning GameObject/Transform
  projection: 'perspective';     // only perspective observed
  verticalFovDegrees: number;    // m_projectionMatrixMode 1
  near: number;
  far: number;
  backgroundColor: Vec4;
  clearFlags: number;
  viewportRect: { x,y,width,height };
}
```

---

## 9. Light model

```ts
interface SourceLight {
  nodeFileId: number;
  type: 0 | 1 | 2 | 3;           // Directional/Point/Spot/Area
  color: Vec4;                   // m_Color (RGB, alpha ignored)
  intensity: number;
  range: number;                 // m_Range
  spotAngleDegrees: number;      // m_SpotAngle
  innerSpotAngleDegrees: number; // m_InnerSpotAngle
  shadowsType: number;           // m_Shadows.m_Type
  cookieGuid: string | null;     // m_Cookie (projection texture), null here typically
}
```

---

## 10. Animation model

```ts
interface SourceAnimationClip {
  name: string;
  legacy: boolean;
  durationSeconds: number;          // max end-time across curves
  tracks: Track[];                  // one per animated path+property group
  events: ClipEvent[];              // m_Events
}

interface Track {
  path: string;                     // Unity hierarchy path ('' = the Animator's object)
  // one or more of:
  position?: Curve<Vec3>;           // meters
  rotation?: EulerCurve<Vec3>;      // local Euler DEGREES (Unity order)
  scale?: Curve<Vec3>;
  floats?: Record<string, Curve<number>>;   // property name -> curve (12 clips)
  objectRefs?: Record<string, Curve<Ref>>;  // m_PPtrCurves (12 clips)
}

interface Key<T> {
  time: number;                     // seconds
  value: T;
  inSlope: Vec3 | number;
  outSlope: Vec3 | number;
  tangentMode: number;
  weightedMode: number;
  inWeight: number;
  outWeight: number;
}
```

Note: Unity rotation animation is stored as Euler curves (even for objects whose rest pose is quaternion). Conversion must reconstruct quaternions using Unity's Euler order (see COORDINATE_SYSTEM.md and LOSS_AND_WARNINGS.md on interpolation fidelity).

```ts
interface SourceAnimatorController {
  name: string;
  layers: { name: string; defaultState: { clipGuid: string | null; speed: number } }[];
}
```

---

## 11. Behaviour / interaction model

```ts
interface SourceBehaviour {
  nodeFileId: number;
  scriptGuid: string;               // m_Script guid
  type: 'udon' | 'vrcstation' | 'bakerylightmesh' | 'ui' | 'unknown';
  // udon
  udonProgramGuid?: string;         // serializedProgramAsset
  udonVariablesBase64?: string;     // serializedPublicVariablesBytesString (raw)
  udonObjectRefs?: Ref[];           // publicVariablesUnityEngineObjects
  // generic
  fields: Record<string, unknown>;  // decoded YAML subtree, preserved
}
```

No semantics are extracted from Udon bytecode at this stage; the model preserves the raw blob plus the object references needed to map to nodes.

---

## 12. Renderer model

```ts
interface SourceRenderer {
  nodeFileId: number;
  kind: 'mesh' | 'ui';
  meshGuid: string | null;          // MeshFilter.m_Mesh
  materialRefs: Ref[];              // m_Materials[]
  castShadows: boolean;
  receiveShadows: boolean;
  lightmapIndex: number;            // -1 if none (m_LightmapIndex, editor-baked)
  staticBatchInfo?: { firstSubMesh: number; subMeshCount: number };
  staticBatchRoot?: Ref | null;
  isStatic: boolean;
}
```

Colliders/Rigidbodies (2,366 mesh colliders, 384 box, 25 capsule, 1 sphere, 36 rigidbodies) are preserved as model objects but are **not convertible** to glTF core (see LOSS_AND_WARNINGS.md).

---

## 13. Scene settings

```ts
interface SourceSceneSettings {
  renderSettings: {
    fogEnabled: boolean; fogMode: number; fogColor: Vec4; fogDensity: number;
    ambientSky: Vec4; ambientEquator: Vec4; ambientGround: Vec4;
    skyboxMaterialGuid: string | null;
    customReflectionCubemapGuid: string | null;
  };
  lightmapSettings: {
    giWorkflow: number; enableBaked: boolean; enableRealtime: boolean;
    lightingDataAssetGuid: string | null; useShadowmask: boolean;
  };
  occlusion: { dataGuid: string | null };
  navMesh: { /* not convertible, preserved as metadata */ };
}
```

---

## 14. What the model deliberately does NOT do

- Does **not** decide glTF node/mesh/material factorization.
- Does **not** apply coordinate conversions.
- Does **not** interpret shader property semantics.
- Does **not** flatten or de-duplicate.
- Does **not** drop anything, including fields not listed here (a `raw: Record<string, unknown>` bag is retained per object for unmodeled fields).

This keeps parsing stable and independently testable from conversion (plan.md Rule 13).
