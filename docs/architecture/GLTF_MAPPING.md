# GLTF_MAPPING.md — Source → glTF Mapping

Status: **DRAFT v1**

Definitive field-by-field mapping from the source model (SOURCE_MODEL.md) to glTF 2.0 as represented by `@gltf-transform/core`. Every significant source field has an explicit destination; lossless/approx/metadata/warning outcomes are referenced from LOSS_AND_WARNINGS.md.

Legend for the "Status" column:

- **EXACT** — directly representable.
- **APPROX** — representable with approximation.
- **META** — preserved as `extras`/metadata.
- **WARN** — unsupported, converter emits a warning.
- **ERR** — unsupported, converter errors (abort or skip-with-error per policy).

---

## 1. Files / document

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| AssetRipper export root | — | META | provenance string in document `extras.source` |
| `ORGANIZM.unity` scene | glTF scene | EXACT | root of the conversion |
| GUID references | glTF object identity | EXACT | GUID retained in each node/asset `extras` |
| Per-file `fileID` | — | META | retained in `extras` |
| Class id | — | META | retained in `extras` |

---

## 2. Scene graph

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| Scene roots (Transform.m_Father = 0) | `gltf.scene` root nodes | EXACT | one glTF node per GameObject, edges from `m_Father`/`m_Children` |
| Node name (`m_Name`) | `node.name` | EXACT | verbatim |
| Node hierarchy | node children | EXACT | identity mapping of the parent tree (no re-parenting) |
| `m_LocalPosition` | `node.translation` | EXACT | `(x, y, −z)` per COORDINATE_SYSTEM.md |
| `m_LocalRotation` (quat x,y,z,w) | `node.rotation` | EXACT | `(x, y, −z, w)` |
| `m_LocalScale` | `node.scale` | EXACT | unchanged |
| Transform composition | T·R·S | EXACT | same order as Unity |
| `m_RootOrder` | sibling order | EXACT | order of `node.children` array |
| `m_Layer`, `m_TagString` | — | META | `node.extras.unity.layer/tag` |
| `m_IsActive` | — | META | `node.extras.unity.active` (glTF has no disable concept) |
| `m_StaticEditorFlags` | — | META | `node.extras.unity.staticFlags` |
| Empty/group GameObjects | `node` (no mesh) | EXACT | keep as hierarchy nodes |

---

## 3. Meshes & renderers

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| `Mesh` asset | `mesh` | EXACT | one mesh per SourceMesh |
| `Mesh.m_Name` | `mesh.name` | EXACT | |
| `m_SubMeshes[]` | `mesh.primitives[]` | EXACT | one primitive per submesh |
| Submesh topology (0=triangles) | `primitive.mode` (TRIANGLES) | EXACT | |
| `m_IndexBuffer` + `m_IndexFormat` | `primitive.indices` accessor | EXACT | decode to Uint16/Uint32; **reverse per-triangle winding** (COORDINATE_SYSTEM.md §3.5) |
| POSITION channel (Float32, dim 3) | `POSITION` accessor | EXACT | repack `(x,y,−z)`; compute accessor `min`/`max` from converted data |
| NORMAL channel | `NORMAL` accessor | EXACT | `(x,y,−z)` |
| TANGENT channel (dim 4) | `TANGENT` accessor | EXACT | `(x,y,−z,−w)` |
| TEXCOORD0 channel | `TEXCOORD_0` accessor | EXACT | `(u, 1−v)` |
| TEXCOORD1 (lightmap UV) | `TEXCOORD_1` accessor | EXACT* | repack `(u, 1−v)`; *only meaningful with lightmap support (LOSS_AND_WARNINGS) |
| TEXCOORD2..7 | — | META | only if a shader actually uses them; else WARN |
| COLOR channel | `COLOR_0` accessor | EXACT | if present; confirm component type/byte layout from channel format |
| BLENDWEIGHTS/BLENDINDICES | `JOINTS_0`/`WEIGHTS_0` | ERR | not present in this world; error if encountered |
| format Float16/UNorm8/etc | accessor component type | APPROX | convert to glTF-supported types (FLOAT/U8/U16 normalized) per format table |
| Vertex dedup across submeshes | — | EXACT | keep source indexing; glTF allows separate primitives to re-use indices per primitive |
| `Mesh.m_LocalAABB` | — | META | `mesh.extras` (real accessor min/max computed instead) |
| `MeshFilter.m_Mesh` | node→mesh link | EXACT | |
| `MeshRenderer.m_Materials[i]` | `primitive[i].material` | EXACT | index-aligned with submeshes |
| `MeshRenderer` cast/receive shadows | — | META | `primitive.extras.unity.castShadows/receiveShadows` |
| Static batching (`m_StaticBatchInfo`, `m_StaticBatchRoot`) | — | WARN | export uses per-renderer original meshes; if root present, verify meshes aren't merged; warn on combined static batches |
| Multiple renderers sharing one mesh | multiple nodes sharing mesh | EXACT | glTF supports mesh sharing |

---

## 4. Materials

Mapping keyed by recognized Standard/Bakery properties. Unrecognized shader properties → META + WARN.

| Source property | glTF | Status | Conversion |
| --------------- | ---- | ------ | ---------- |
| `_Color` | `material.baseColorFactor` | EXACT | `(r,g,b,a)`; a→alpha factor |
| `_MainTex` | `baseColorTexture` | EXACT | texCoord set 0; apply `m_Scale`/`m_Offset` as UV transform (see note) |
| `_Mode` 0/1 (Opaque/Cutout) | `alphaMode: OPAQUE/MASK` | EXACT | Cutout → `MASK`, `alphaCutoff = _Cutoff` |
| `_Mode` 2/3 (Fade/Transparent) | `alphaMode: BLEND` | APPROX | glTF BLEND is order-independent-ish; source blend funcs (`_SrcBlend`/`_DstBlend`/`_ZWrite`) not representable → META |
| `_Metallic` | `material.metallicFactor` | EXACT | 0..1 |
| `_Glossiness` | `roughnessFactor` | EXACT | `roughness = 1 − smoothness`; clamp to [0,1] |
| `_MetallicGlossMap` | `metallicRoughnessTexture` | APPROX | Unity packs metallic in B, smoothness in A (Bakery/Standard). glTF expects metallic in B, roughness in G. Requires channel repack at import → APPROX; mark META with original flags |
| `_SmoothnessTextureChannel` | — | APPROX | 0 = gloss from metallic map alpha; 1 = from albedo alpha; encode repack rule in `extras` |
| `_BumpMap` + `_BumpScale` | `normalTexture` | APPROX | flip green channel (COORDINATE_SYSTEM.md §3.7); `normalTexture.scale = _BumpScale` |
| `_OcclusionMap` + `_OcclusionStrength` | `occlusionTexture` | APPROX | glTF AO in R channel; Unity packs per-shader (often R) → verify per shader; `strength = _OcclusionStrength` |
| `_EmissionMap` + `_EmissionColor` | `emissiveTexture` + `emissiveFactor` | APPROX | factor = `_EmissionColor.rgb`; clamp (glTF clamps to [0,1] HDR); texture only when factor non-zero |
| `_Cutoff` | `alphaCutoff` | EXACT | |
| `_SrcBlend/_DstBlend/_ZWrite` | — | META | blend state |
| `m_ShaderKeywords` | — | META | e.g. `BAKERY_SHNONLINEAR`, `BAKERY_RNM`, instancing flags |
| Shader guid/name | — | META | `material.extras.unity.shaderGuid/shaderName` |
| Double-sided rendering | `material.doubleSided` | APPROX | infer from `_Cull`/shader if available; default false |
| **Unrecognized shader** (Rain/Water/Skybox/Clouds/Mirror…) | — | WARN+META | convert to closest PBR approximation if the shader exposes `_Color`/`_MainTex`/gloss, else emit unlit color; preserve full property table in `extras` |
| TexEnv `m_Scale`/`m_Offset` | `KHR_texture_transform` | APPROX | extension if enabled; else bake into UVs at mesh level or META |

---

## 5. Textures & images

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| PNG file | `image` | EXACT | bytes as-is |
| Lightmap `.texture2D` (YAML+base64) | `image` | EXACT* | decode stream to pixels, encode PNG/JPEG; *usable only via extension, see LOSS |
| Cubemap PNG (256×1536 vertical strip) | — | META/APPROX | glTF core has no cubemaps; store as image + layout in `extras`; usable for skybox only via extension |
| `sRGBTexture: 1` | image color space (sRGB) | EXACT | glTF textures are sRGB by default for color roles |
| Normal map flag | `KHR_materials_normal_texture` semantics | EXACT | treated as normal map (green flip) |
| `wrapU/V` (Repeat/Clamp/Mirror) | `sampler.wrapS/wrapT` | EXACT | 0→10497(Repeat), 1→33071(ClampToEdge), 2→33648(MirroredRepeat) |
| `filterMode` (Point/Bilinear/Trilinear) | `sampler.magFilter`/`minFilter` | EXACT | Point→9728/9728; Bilinear→9729; Trilinear→9987 (with mipmaps) |
| mipmaps | sampler minFilter chain | EXACT | encode Nearest/Linear+mip variants |
| GUID/name | `image.name`, `image.extras` | META | |
| Separate color vs data textures | glTF roles | EXACT | albedo vs metallicRoughness vs normal vs occlusion vs emissive |

---

## 6. Cameras

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| Camera | `camera` (perspective) | EXACT | attached to the node |
| `field of view` (vertical, deg) | `camera.perspective.yfov` | EXACT | `deg·π/180` |
| `near clip plane` | `camera.perspective.znear` | EXACT | |
| `far clip plane` | `camera.perspective.zfar` | EXACT | |
| Aspect | `camera.perspective.aspectRatio` | APPROX | `sensorWidth/sensorHeight` (36/24 = 1.5) if requested; else omit |
| Node transform | camera node TRS | EXACT | §COORDINATE_SYSTEM 5 |
| `m_ClearFlags`/`backgroundColor` | — | META | |
| viewport rect | — | META | |

---

## 7. Lights

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| Light (any) | `KHR_lights_punctual` | APPROX | glTF has no core lights |
| Type 0 Directional | `light.type = "directional"` | APPROX | |
| Type 1 Point | `light.type = "point"` | APPROX | |
| Type 2 Spot | `light.type = "spot"` | APPROX | outer/inner cone from `m_SpotAngle`/`m_InnerSpotAngle` (half-angles) |
| Type 3 Area | — | ERR/WARN | punctual cannot represent area; WARN + META |
| `m_Color.rgb` | `light.color` | EXACT | |
| `m_Intensity` | `light.intensity` | APPROX | unit conversion (Unity legacy/physical → candela/lux); document factor |
| `m_Range` | — | WARN | no glTF equivalent (decay model differs) |
| Shadows settings | — | META | |
| Light node TRS | light node TRS | EXACT | lights emit along glTF local −Z after node conversion (§COORDINATE_SYSTEM 6) |

---

## 8. Animation

| Source | glTF | Status | Conversion |
| ------ | ---- | ------ | ---------- |
| AnimationClip | `animation` | EXACT | one glTF animation per clip |
| `m_Name` | `animation.name` | EXACT | |
| Clip time (seconds) | `animation.sampler.input` | EXACT | 1:1 |
| Position curve per node path | `animation.channel` (translation) | EXACT | `(x,y,−z)` per keyframe |
| Rotation (Euler) curve per node path | `animation.channel` (rotation) | APPROX | convert Euler→quat with Unity order, then reflect; see COORDINATE_SYSTEM.md §7 |
| Scale curve per node path | `animation.channel` (scale) | EXACT | unchanged |
| Keyframe `tangentMode`/`inSlope`/`outSlope` | sampler interpolation | APPROX | STEP if tangentMode=0/constant; LINEAR for linear keys; otherwise resample (default) or map to CUBICSPLINE tangents |
| `m_FloatCurves` (non-transform properties) | — | META/WARN | not expressible in core; preserve in `animation.extras` |
| `m_PPtrCurves` (object refs) | — | META/WARN | preserve raw |
| Clip `m_Events` | — | META | |
| Path resolution | `node` target | EXACT | resolve Unity hierarchy path against the animator's node |
| `Animator` (scene) live controller | active animation | EXACT | controller default state → clip; runtime state machine semantics (blending, triggers) → META/WARN |
| Multiple clips per node | multiple animations | EXACT | |

---

## 9. Skinning & morphs

Not present in this world. If encountered:

| Source | glTF | Status |
| ------ | ---- | ------ |
| `m_BindPose` | `skin.inverseBindMatrices` | EXACT |
| Bone hierarchy | `skin.joints` | EXACT |
| BLENDWEIGHTS/INDICES | `WEIGHTS_0`/`JOINTS_0` | EXACT |
| `m_Shapes` | morph targets | EXACT |

Policy: present → ERR for v1 (plan.md Phase 9 ordering puts skinning/morphs late).

---

## 10. Metadata & custom data

| Source | glTF | Status |
| ------ | ---- | ------ |
| GameObject layer/tag/static flags | node `extras` | META |
| Behaviour (Udon) variable table (base64) | node `extras` | META |
| Udon object refs | node `extras` (as resolved node names/ids) | META |
| VRCStation settings | node `extras` | META |
| Bakery light components | node `extras` | META |
| UI (Canvas/Text/Image/Button) | node `extras` | META/WARN |
| AudioSource + clip | node `extras` | META/WARN |
| Colliders / Rigidbody | node `extras` | META/WARN |
| RenderSettings (fog, ambient, skybox) | — | META/WARN |
| LightmapSettings / LightingData | — | META/WARN |
| OcclusionCullingData | — | META |
| NavMeshSettings | — | META |
| path_id_map.json | — | META |

---

## 11. Open mapping questions (recorded, not resolved)

1. Light intensity unit conversion factor (Unity version/`m_LightmapFlags` dependent).
2. `KHR_texture_transform` vs baking `m_Scale`/`m_Offset` into UVs (default: bake, since target viewers may not support the extension).
3. Whether to emit `TEXCOORD_1` for lightmap UVs even without lightmap support (default: emit + META note).
4. Static-batched meshes: verify whether `MeshFilter.m_Mesh` always references the uncombined source mesh.
5. MetallicGlossMap channel semantics per actual shader variants used in the world (Bakery vs Standard vs VRChat mobile).
6. Alpha mode for `_Mode` 2 (Fade) — glTF BLEND vs two-pass approximations.
