# scene-to-gltf — Unity Export to glTF 2.0 / GLB Converter

> [!WARNING]
> ### ⚠️ AI & Project Disclaimer
> - **AI-Assisted Development**: This codebase was developed with the assistance of AI coding assistants. While the architecture, coordinate mathematics, binary decoders, and conversion pipelines have been designed, tested, and validated against standard glTF 2.0 specifications and integration benchmarks, users are advised to test and verify converted assets for their specific production pipelines and 3D engine requirements.
> - **No Support**: No maintenance, updates, or support are provided for this project.
> - **Skill Representation**: The purpose of this project being uploaded is not representative of my personal skills or abilities.

A high-performance TypeScript CLI tool and library for converting AssetRipper Unity project scene exports into standard **glTF 2.0 (.gltf)** and **GLB (.glb)** binary 3D assets.

---

## Features

- **Scene Graph & Hierarchy**: Preserves GameObjects, transform hierarchies, matrices, and parent-child edges.
- **Coordinate System Conversion**: Corrects Left-Handed Unity ($+Z$ forward, $Y$-up) $\to$ Right-Handed glTF ($-Z$ forward, $Y$-up) with proper quaternion and tangent transformations.
- **Binary Mesh Decoder**: Decodes native Little-endian binary vertex streams (Float32/Float16, UVs, Normals, Tangents, UNorm8/SNorm8) and submesh index buffers.
- **PBR Materials**: Converts Unity Standard Shader properties (`_MainTex`, `_BumpMap`, `_MetallicGlossMap`, `_EmissionMap`, `_OcclusionMap`) into glTF 2.0 PBR materials.
- **Cameras & Lights**: Maps Perspective Cameras and Unity Lights to glTF standard cameras and `KHR_lights_punctual` extensions.
- **Texture Transforms**: Maps Unity texture scale & offset (`m_TexEnvs`) via `KHR_texture_transform`.
- **Memory Optimized**: Single-thread memory-capped pipeline designed to parse large Unity scenes without filling RAM/swap.
- **Blender 5.x Compatible**: Validated against Blender's strict glTF 2.0 schema importer.

---

## Installation & Build

```bash
# Install dependencies
npm install

# Build TypeScript output
npm run build
```

---

## Command Line Usage

### 1. Export as Single Binary GLB
```bash
node dist/cli/index.js . -o Scene.glb
```

### 2. Export Textureless GLB (Super Fast & Lightweight)
```bash
node dist/cli/index.js . --skip-textures -o Scene_no_textures.glb
```

### 3. Export as glTF JSON + External Textures Folder (Recommended for Blender)
```bash
node dist/cli/index.js . --separate-textures --textures-dir textures -o Scene.gltf
```

### 4. Apply Document Optimization Pass (Deduplicate & Prune)
```bash
node dist/cli/index.js . -O -o Scene_optimized.glb
```

---

## CLI Options

| Flag | Long Option | Description | Default |
| :--- | :--- | :--- | :--- |
| `-o` | `--output <path>` | Output `.glb` or `.gltf` file path | `<SceneName>.glb` |
| `-s` | `--scene <name>` | Specific `.unity` scene file to convert | `ORGANIZM.unity` |
| `-m` | `--max-renderers <n>` | Limit number of renderers (fast preview mode) | All renderers |
| `-f` | `--format <glb\|gltf>` | Explicit output format (`glb` or `gltf`) | `glb` |
| `-nt` | `--skip-textures`, `--no-textures` | Skip loading and embedding textures completely | `false` |
| `-st` | `--separate-textures` | Extract textures to separate image files | `false` |
| `-td` | `--textures-dir <dir>` | Folder path for extracted texture files | `textures` |
| `-ry` | `--rotate-y-up` | Apply root node container orientation (+Y Up) | `false` |
| `-O` | `--optimize` | Deduplicate materials/textures and prune unused glTF elements | `false` |
| `-q` | `--quiet` | Suppress non-error output | `false` |
| `-h` | `--help` | Display CLI help menu | — |

---

## Project Structure

```
.
├── docs/                     # Architecture guides & specifications
│   ├── architecture/         # Coordinate math, glTF mapping, and binary formats
│   ├── specifications/       # Implementation plans, loss policies, and test matrices
│   └── README.md             # Documentation master index
├── src/
│   ├── index.ts              # Programmatic TypeScript library API entry point
│   ├── cli/
│   │   └── index.ts          # CLI runner & argument parsing
│   ├── convert/              # glTF conversion, scene graphs, geometry, materials, math
│   ├── io/                   # Asset discovery, export root resolution, and GUID indexing
│   ├── model/                # Clean TypeScript source data interfaces
│   ├── parse/                # Unity YAML, binary mesh decoders, and builtin primitives
│   └── scripts/              # Diagnostics, benchmarks, and validation tools
├── test/                     # Vitest unit & integration test suites
│   ├── convert/              # Geometry, materials, cameras, lights, memory benchmarks
│   ├── fixtures/             # Sample Unity scene test fixtures
│   └── parse/                # YAML and binary mesh decoder tests
├── dist/                     # Compiled JavaScript output (tsc) & standalone bundle
└── exports/                  # Default output directory for generated 3D assets
```

---

## Programmatic Library Usage

`scene-to-gltf` can also be used as a TypeScript/Node.js library:

```typescript
import {
  findExportRoot,
  findSceneFile,
  parseSourceScene,
  loadAssetsForScene,
  convertSourceBundleToGLB,
} from 'scene-to-gltf';
import * as fs from 'node:fs';

// 1. Locate export directory and scene file
const rootInfo = await findExportRoot('./AssetRipper_export');
const scenePath = findSceneFile(rootInfo, 'SampleScene.unity');

// 2. Parse Unity YAML scene & load referenced assets
const sceneContent = fs.readFileSync(scenePath, 'utf8');
const scene = parseSourceScene(sceneContent, 'SampleScene');
const bundle = loadAssetsForScene(scene, rootInfo.guidIndex);

// 3. Convert to GLB binary buffer
const glbBytes = await convertSourceBundleToGLB(bundle, { optimize: true });
fs.writeFileSync('Output.glb', glbBytes);
```

---

## Documentation & Deep-Dive Specs

For in-depth architectural and mathematical references, refer to the [**`docs/`**](file:///home/switch/Desktop/ORGANISM/docs/README.md) directory:

- [**Coordinate System Conversion Math**](file:///home/switch/Desktop/ORGANISM/docs/architecture/COORDINATE_SYSTEM.md): Z-reflection, winding flip, and quaternion formulas.
- [**glTF 2.0 Mapping Matrix**](file:///home/switch/Desktop/ORGANISM/docs/architecture/GLTF_MAPPING.md): Component mapping reference tables.
- [**Binary Mesh Format Specification**](file:///home/switch/Desktop/ORGANISM/docs/architecture/SOURCE_FORMAT.md): Multi-stream vertex channel structures & half-float decoding.
- [**Loss & Approximation Policy**](file:///home/switch/Desktop/ORGANISM/docs/specifications/LOSS_AND_WARNINGS.md): Classification taxonomy for unsupported or approximated features.
- [**Maintainer & Architecture Guide**](file:///home/switch/Desktop/ORGANISM/docs/architecture/LLM_HANDOFF.md): Memory optimization rules and pipeline walkthrough.

---

## Running Tests & Diagnostics

```bash
# Run full unit & integration test suite
npm test

# Run memory benchmark (< 250 MB heap verification)
npm run test:memory

# Validate glTF schema against Blender 5.x requirements
npm run validate
```

---

## License

ISC
