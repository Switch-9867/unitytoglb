# COORDINATE_SYSTEM.md — Coordinate, Unit, Winding and Convention Conversions

Status: **DRAFT v1** — math to be validated by fixtures (see TEST_PLAN.md, Phase 6 of plan.md).

---

## 1. Source (Unity) conventions

| Property | Unity (source) | Evidence / notes |
| -------- | -------------- | ---------------- |
| Handedness | **Left-handed** | Standard Unity; +Z is "forward" |
| Up axis | +Y | |
| Forward axis | +Z (camera & object forward) | |
| Units | 1 Unity unit = 1 metre (Unity/VRChat default) | VRChat worlds are authored in metres |
| Rotation | Quaternion `x,y,z,w` (scalar last) | `Transform.m_LocalRotation` |
| Rotation order (Euler) | Unity's intrinsic order (Z, then X, then Y) | `m_LocalEulerAnglesHint`; **inference, verify** |
| Front-face winding | **Clockwise** (LH) | Unity renders triangles front-facing CW when viewed from front |
| UV origin | V=0 at **bottom** of image | Unity OpenGL-style UVs |
| Position space | Local, parent-relative | `m_LocalPosition` |
| Scale | Local, parent-relative; may be negative/non-uniform | `m_LocalScale` |

## 2. Target (glTF) conventions

| Property | glTF (target) |
| -------- | ------------- |
| Handedness | **Right-handed** |
| Up axis | +Y |
| Forward axis | −Z |
| Units | metres |
| Rotation | Quaternion `x,y,z,w` |
| Front-face winding | **Counter-clockwise** (RH) |
| UV origin | V=0 at **top** of image |
| Node transforms | Local TRS (translation, rotation, scale); optional matrix |

---

## 3. Core conversion: handedness flip across the XY plane

Unity (left-handed, +Z forward) and glTF (right-handed, −Z forward) both use +Y up. The established mapping is a **reflection across the XY plane** (negate Z). This is a pure mirror and does not rotate the content.

Formally: let the source→target linear map be

```
R = diag(1, 1, −1)
```

Applied per-vertex/per-vector and to every transform, followed by a winding fix on triangles.

### 3.1 Positions

```
p' = (p.x, p.y, −p.z)
```

### 3.2 Quaternions (rotations)

A rotation in the source space is conjugated by the reflection:

```
q' = (q.x, q.y, −q.z, q.w)
```

Derivation: quaternion vector part v → R v R under similarity gives (v.x, v.y, −v.z), scalar unchanged.

### 3.3 Vectors (normals, directions)

Same rule as positions:

```
n' = (n.x, n.y, −n.z)
```

### 3.4 Tangents

Tangent = (tx, ty, tz, tw) where `tw ∈ {+1,−1}` encodes the bitangent sign.

```
t' = (t.x, t.y, −t.z, −t.w)
```

`w` flips because the handedness of the tangent/bitangent/normal frame flips. (Validate: a left-handed UV frame under reflection produces the correct right-handed frame only when w is negated.)

### 3.5 Triangle winding (indices)

The reflection mirrors triangles, flipping their orientation. To keep front faces outward with glTF's CCW convention, **reverse the winding of each triangle**:

```
(i0, i1, i2)  →  (i2, i1, i0)
```

equivalently swap any two indices. This must be applied to every submesh index list.

### 3.6 UV coordinates

glTF uses top-left UV origin; Unity uses bottom-left:

```
u' = u
v' = 1 − v
```

This applies to **all** UV sets (UV0 color/texture, UV1 lightmap). Note: if a source texture itself was already stored upside-down relative to glTF expectations, the double flip would cancel — treat the mesh UV flip as the canonical rule and verify with a textured fixture.

### 3.7 Normal-map green channel

When a normal map is exported, glTF expects +Y up in tangent space, Unity expects +Y up in its own convention, but because V is flipped the green channel contribution must be inverted. For a Unity normal map stored with `g` in the green channel:

```
normalMap.rgb' = (r, 1 − g, b)
```

Apply at image-import time only when the source texture is flagged as a normal map.

### 3.8 Lightmap UVs (UV1)

Unity lightmap UV1 also uses bottom-left origin → apply the same `v' = 1 − v`. (Lightmap *textures* themselves are baked with Unity's convention; see LOSS_AND_WARNINGS.md — core glTF cannot consume lightmaps.)

---

## 4. Transform composition

### 4.1 Source (Unity) local transform

Unity composes local TRS as

```
M_local = T · R · S
```

applied to the mesh; a child's world matrix is

```
M_world = M_parent · T · R · S
```

where `T = translate(pos)`, `R = quaternion rotation`, `S = scale(sx,sy,sz)`.

### 4.2 Target (glTF) local transform

glTF defines exactly the same composition:

```
matrix = T · R · S
```

and children multiply parent transforms. **No change to composition order is needed.**

### 4.3 Per-node conversion

Because the reflection `R` commutes with the hierarchy when applied consistently (it is a global similarity), converting **each local TRS individually** with the rules in §3 and keeping the hierarchy identical produces a correct right-handed world:

1. `position' = (x, y, −z)`
2. `rotation' = (x, y, −z, w)`
3. `scale' = (sx, sy, sz)` — **unchanged**. (Negating z scale would introduce an extra mirror beyond the global flip; do not do it.)
4. Children use the same per-local rule.

Equivalently, one could convert world matrices with `R M R` and factor; the per-local approach is simpler and equivalent (validate in fixtures).

---

## 5. Camera conversion

Unity camera looks down its local **+Z**; glTF camera looks down local **−Z**.

- The camera **node rotation** is converted with the same quaternion rule (§3.2), so the camera node points the correct way automatically.
- glTF perspective camera parameters map directly:
  - `yfov = verticalFovDegrees · π / 180`
  - `znear = near` (Unity `near clip plane`, e.g. 0.3)
  - `zfar = far` (Unity `far clip plane`, e.g. 1000)
  - `aspectRatio` — omit (let viewers use the default) or set to `sensorWidth/sensorHeight` (36/24 = 1.5); see GLTF_MAPPING.md.

---

## 6. Light conversion (KHR_lights_punctual)

- Light node direction/position comes from the node transform (already converted).
- Punctual-light definitions are in the **local** space of the light node:
  - `directional`: direction = light node's local −Z axis in glTF. Since glTF lights point along local −Z and Unity directional lights point along local +Z, the light node's quaternion conversion (§3.2) places the emitter correctly — **no additional rotation needed on the light definition** (validate with a fixture).
  - `point`: no direction.
  - `spot`: direction = local −Z (same as above); `outerConeAngle = spotAngleDegrees/2 · π/180`, `innerConeAngle = innerSpotAngleDegrees/2 · π/180`.
- `intensity`: see LOSS_AND_WARNINGS.md — Unity intensity units (candela/legacy) do not map 1:1 to glTF punctual intensity; choose a documented scale factor and mark APPROXIMATED.
- `range`: Unity spot/point have a `range` (m); glTF punctual has no range (quadratic decay to 0). Dropped (warning) unless the `KHR_lights_punctual` implementation documents a convention.

---

## 7. Animation conversion

- Source time unit (seconds) maps 1:1 to glTF `input` (seconds).
- Source local Euler rotation curves → convert each keyframe's Euler to a **quaternion using Unity's Euler order**, then apply the reflection rule `q'=(x,y,−z,w)` per keyframe.
- Position curves: `value' = (x, y, −z)` per keyframe.
- Scale curves: unchanged.
- Because glTF supports LINEAR, STEP, and CUBICSPLINE only, and Unity uses its own Bézier `tangentMode`/`weightedMode` curves, the converter either:
  1. resamples Unity curves at a fixed rate (default, robust, lossy but bounded), or
  2. approximates Unity tangents as glTF cubic-spline tangents (in/out slopes), for keyframes whose `tangentMode` is analytic.
  
  Decision recorded in IMPLEMENTATION_PLAN.md; mark conversion APPROXIMATED unless the clip is linear/constant.

---

## 8. Skinning / morphs

Not present in this world (no SkinnedMeshRenderer, empty m_Shapes). Rules if ever encountered:

- Joints: quaternions/positions converted per §3.1–3.2 in the skin's global space; glTF requires accessor data in the **same global space** as the skin, so convert bind poses and animation channels consistently with the reflection.
- Morph deltas: positions/deltas converted as positions; normal deltas as vectors.

(Recorded for completeness; must raise UNSUPPORTED_WITH_ERROR if a future source file contains them.)

---

## 9. Summary reference table

| Item | Unity | glTF | Rule |
| ---- | ----- | ---- | ---- |
| Handedness | LH | RH | reflect Z |
| Position | (x,y,z) | (x,y,−z) | negate z |
| Normal | (x,y,z) | (x,y,−z) | negate z |
| Tangent | (x,y,z,w) | (x,y,−z,−w) | negate z & w |
| Quaternion | (x,y,z,w) | (x,y,−z,w) | negate z |
| Scale | (sx,sy,sz) | (sx,sy,sz) | unchanged |
| Winding | CW (LH) | CCW (RH) | reverse triangles |
| UV | V bottom-origin | V top-origin | v' = 1 − v |
| Normal map G | Unity | glTF | g' = 1 − g |
| Euler order | Unity ZXY | n/a (quats) | convert with Unity order |
| Units | metre | metre | 1:1 |
| Compose | T·R·S | T·R·S | unchanged |

---

## 10. Fixture checklist (see TEST_PLAN.md)

1. Identity transform → unchanged.
2. Pure translation (1,0,0), (0,1,0), (0,0,1) → (1,0,0),(0,1,0),(0,0,−1).
3. 90° rotations about X, Y, Z; verify quaternion sign rules.
4. Scale (2,2,2) and (−1,1,1).
5. Parent/child: child of parent with known transform; verify world equivalence pre/post conversion.
6. Known triangle: 3 vertices + winding; verify reversed index order.
7. Known camera orientation: verify −Z view direction.
8. UV flip on a single quad with a checkerboard texture.
9. Normal-map green flip.
10. Euler→quaternion unit tests for Unity order vs naive order (catch wrong order).
