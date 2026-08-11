# scene-to-gltf — Unity Export to glTF 2.0 / GLB Converter

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

### 4. Apply Geometry Optimization Pass (Weld Vertices & Quantization)
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
| `-O` | `--optimize` | Apply vertex welding, accessor deduplication & quantization | `false` |
| `-q` | `--quiet` | Suppress non-error output | `false` |
| `-h` | `--help` | Display CLI help menu | — |

---

## Running Tests

```bash
# Run unit & integration tests
npm test

# Run memory usage verification benchmark
npm run test:memory
```

---

## License

ISC
