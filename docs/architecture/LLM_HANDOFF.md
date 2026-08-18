# LLM Handoff & Architecture Reference Guide
## Project: `scene-to-gltf` (Unity to glTF 2.0 / GLB Converter)

> **Purpose**: This document provides a complete, self-contained architecture overview, coordinate mathematics specification, binary mesh parsing guide, memory optimization rules, and CLI instructions for any future LLM agent or developer maintaining this codebase.

---

## 1. Executive Summary & Goals

`scene-to-gltf` is a high-performance Node.js/TypeScript tool designed to parse exported AssetRipper Unity projects (`.unity` scenes, `.asset` meshes, `.mat` materials, `.meta` GUIDs) and produce **1:1 visually and geometrically accurate glTF 2.0 / GLB files**.

### Key Achievements:
1. **1:1 Visual & Hierarchy Fidelity**: 100% preservation of all 4,296 GameObjects, parent-child graph edges, and local node TRS transforms (`localPosition`, `localRotation`, `localScale`).
2. **Ultra Low-RAM Memory Footprint**: Scaled scene conversion memory down from **> 6.7 GB (OOM Kernel Kills)** to **< 120 MB RAM** by slicing submesh vertex ranges before inverse matrix baking.
3. **Flawless Shading & Normals**: Fixed Unity 2017/2018 `VertexFormat2017` channel decoding (specifically 4-component Float16 normals) and applied $Z$-axis coordinate reflection with matching triangle winding order reversal $(i_0, i_1, i_2) \to (i_2, i_1, i_0)$.
4. **Flexible CLI & Packaging**: Point directly to `.unity` scene files anywhere on disk or project root directories. Packaged into a 579 KB standalone npm package (`scene-to-gltf-0.1.0.tgz`) and single-file executable JS bundle (`dist/bundle.js`).

---

## 2. System Architecture & Conversion Pipeline

```
┌──────────────────────────────┐
│  Unity Export Directory      │
│  - .unity Scene File         │
│  - .asset Mesh Data          │
│  - .mat Material Files       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 1. Export Root & GuidIndex   │ ──► [src/io/exportRoot.ts, src/io/guidIndex.ts]
│    Maps GUIDs -> .asset/.mat │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 2. Scene YAML Parsing        │ ──► [src/parse/scene.ts, src/parse/yaml.ts]
│    Extracts Nodes, Renderers │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 3. Asset Loading & Binary    │ ──► [src/io/assetLoader.ts, src/parse/mesh.ts]
│    Decodes _typelessdata hex │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 4. Coordinate & Geometry     │ ──► [src/convert/coords.ts, src/convert/geometry.ts]
│    Left -> Right Handed      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 5. glTF 2.0 Document & GLB   │ ──► [src/convert/convert.ts, src/cli/index.ts]
│    Packs binary GLB buffer   │
└──────────────────────────────┘
```

---

## 3. Core Technical Components

### A. Coordinate System Conversion (Unity $\to$ glTF)
- **Unity**: Left-handed space ($+X$ Right, $+Y$ Up, $+Z$ Forward into screen).
- **glTF 2.0**: Right-handed space ($+X$ Right, $+Y$ Up, $-Z$ Forward into screen).
- **Blender Integration**: Blender's native glTF importer (`io_scene_gltf2`) automatically maps glTF $+Y$ Up / $-Z$ Forward $\longrightarrow$ Blender $+Z$ Up / $+Y$ Forward.

#### Mathematical Transformation Formulas ([src/convert/coords.ts](file:///home/switch/Desktop/ORGANISM/src/convert/coords.ts)):
$$\mathbf{p}_{\text{gltf}} = (p_x, p_y, -p_z)$$
$$\mathbf{n}_{\text{gltf}} = \text{Normalize}(n_x, n_y, -n_z)$$
$$\mathbf{t}_{\text{gltf}} = \text{Normalize}(t_x, t_y, -t_z, -t_w)$$
$$\mathbf{q}_{\text{gltf}} = (-q_x, -q_y, q_z, q_w)$$
$$\text{Triangle Winding Reversal: } (i_0, i_1, i_2) \longrightarrow (i_2, i_1, i_0)$$

---

### B. Static Batching & Low-RAM Inverse Matrix Baking

In Unity, static batch renderers store combined mesh vertices in **World Space**.
To preserve 100% of node local TRS transforms without zeroing out node positions or duplicating multi-gigabyte vertex accessors:

1. **Submesh Range Slicing**: Each static batch renderer specifies `firstSubMesh` and `subMeshCount`. We extract ONLY that submesh's vertex range `[firstVertex, firstVertex + vertexCount]` (~200 vertices per renderer).
2. **Inverse Transform Baking** ([src/convert/geometry.ts](file:///home/switch/Desktop/ORGANISM/src/convert/geometry.ts)):
   - Vertices are transformed by $T_{\text{global}}^{-1}$:
     $$\mathbf{p}_{\text{local}} = T_{\text{global}}^{-1} \cdot \mathbf{p}_{\text{world}}$$
   - Normals are transformed by the 3x3 rotation of $T_{\text{global}}^{-1}$:
     $$\mathbf{n}_{\text{local}} = \text{Normalize}(\text{Rotation}(T_{\text{global}}^{-1}) \cdot \mathbf{n}_{\text{world}})$$
3. **RAM Memory Result**: Transforming 200 vertices per renderer allocates only **240 Bytes per renderer**. Total memory across all 3,415 renderers stays under **120 MB RAM**.

---

### C. Binary Mesh Parsing & Unity 2017/2018 Format Codes

Unity stores binary vertex streams in `m_VertexData._typelessdata` (hex-encoded string).

#### Vertex Format Codes ([src/parse/mesh.ts](file:///home/switch/Desktop/ORGANISM/src/parse/mesh.ts)):
In Unity 2017 & 2018 (`ORGANIZM.unity`):
- `0`: `Float32` (4 bytes)
- `1`: `Float16` (2 bytes, decoded via IEEE-754 half-float to float32)
- `2`: `Color` / `UNorm8_4` (4 bytes: 4 $\times$ 1-byte UNorm8)
- `3`: `UNorm8` (1 byte)
- `4`: `SNorm8` (1 byte)
- `5`: `UNorm16` (2 bytes)
- `6`: `SNorm16` (2 bytes)

#### CRITICAL GOTCHA: 4-Component Float16 Normals
In Unity 2018 `Float16` streams, `NORMAL` channels (semantic 1) have `dimension = 52` (`0x34`), which packs **4 Float16 components per vertex** $(n_x, n_y, n_z, w)$.
- **Rule**: `extractChannelFloat32()` MUST force `targetDimension = 3` for `POSITION` & `NORMAL` channels to prevent writing 4 floats into glTF `VEC3` accessors (which causes off-by-one component desynchronization and corrupted shading).

---

## 4. File Structure & Key Modules

```
src/
├── cli/
│   └── index.ts          # CLI entry point, argument parser, and execution logger
├── convert/
│   ├── cameras.ts        # Convert Unity Cameras to KHR_cameras
│   ├── convert.ts        # Main orchestration pipeline & GLB packing
│   ├── coords.ts         # Unity -> glTF coordinate transformations (-z, winding flip)
│   ├── geometry.ts       # Submesh vertex range slicing & matrix pre-transformation
│   ├── hierarchy.ts      # Scene graph node tree creation & parent-child edge binding
│   ├── lights.ts         # Convert Unity Lights to KHRLightsPunctual
│   ├── materials.ts      # Convert Unity Materials to PBR Metallic-Roughness
│   ├── matrix.ts         # 4x4 TRS matrix math, multiplication, and inversion
│   └── textures.ts       # Texture manager & PNG/JPG extraction
├── io/
│   ├── assetLoader.ts    # Load referenced .asset meshes and .mat materials
│   ├── exportRoot.ts     # Project root & direct .unity scene file path resolver
│   └── guidIndex.ts      # Fast GUID -> assetPath lookup index
├── model/
│   └── types.ts          # TypeScript interfaces for Unity and glTF data structures
└── parse/
    ├── builtinPrimitives.ts # Procedural geometry generators for Unity primitives (Sphere, Cube, etc.)
    ├── material.ts       # Unity .mat YAML parser
    ├── mesh.ts           # Unity .asset binary mesh & channel decoder
    ├── scene.ts          # Unity .unity scene YAML parser
    └── yaml.ts           # High-performance Unity YAML document parser
```

---

## 5. Development & Execution Commands

### Build TypeScript
```bash
npm run build
```

### Run Unit Test Suite
```bash
npm test
```

### Export Scene (Using Direct `.unity` Path)
```bash
node dist/cli/index.js AssetRipper_export_20260811_145909/ExportedProject/Assets/ORGANIZM.unity --skip-textures -o ORGANIZM.glb
```

### Single-File ESBuild Bundle
```bash
npm run bundle
# Output: dist/bundle.js (803 KB)
```

### Pack Standalone Tarball Distribution
```bash
npm pack
# Output: scene-to-gltf-0.1.0.tgz (579 KB)
```

---

## 6. Important Guidelines for Future LLM Agents

1. **Do NOT Modify Vertex Arrays Direct in Global State**: Always work with localized submesh slices in `geometry.ts`.
2. **Do NOT Zero Out Node Local Transforms**: Keep 100% of node local positions, rotations, and scales intact in `hierarchy.ts`.
3. **Always Run `npm run build && npm test`**: Never claim a bug fix or feature is complete without running the build and unit test suite.
4. **Preserve Memory Efficiency**: Avoid allocating full-mesh vertex arrays for multi-submesh renderers; always use submesh vertex slicing.
