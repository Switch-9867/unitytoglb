# Plan: Convert Existing Scene Format to glTF

## Goal

Build a reliable TypeScript CLI that converts an existing scene/file format into valid glTF 2.0 / GLB files.

The converter should use `@gltf-transform/core` as the glTF construction and serialization layer.

The source format is an existing format that must first be reverse-engineered/documented sufficiently to understand its complete scene representation.

The central principle is:

> **Understand the source format first. Design the conversion mapping second. Implement the converter third.**

Do not allow the structure or terminology of glTF Transform to prematurely dictate the interpretation of the source format.

---

# Phase 1 — Understand the Source Format

## Objective

Produce a rigorous description of the existing format before designing the converter.

The LLM must assemble information about the source format in the following order.

### 1. File-level structure

Determine:

* File extensions
* Text, binary, or hybrid format
* Header/magic bytes
* Version information
* File sections/chunks
* Global metadata
* Endianness
* Alignment requirements
* Compression
* External file dependencies
* Resource references
* Whether multiple scenes/assets can exist in one file

Document the complete high-level file layout.

---

### 2. Scene model

Determine what the format considers a "scene."

Document:

* Scene objects
* Scene roots
* Object identifiers
* Object names
* Parent/child relationships
* References between objects
* Object lifetime/ownership semantics
* Whether objects can belong to multiple parents
* Whether cycles are possible

Establish the exact hierarchy represented by the source format.

---

### 3. Transforms

Determine how transforms are represented.

Document:

* Translation
* Rotation
* Scale
* Matrix transforms
* Quaternion conventions
* Euler angle conventions, if applicable
* Transform composition order
* Local vs world transforms
* Parent-relative transforms
* Coordinate system
* Up axis
* Forward axis
* Handedness
* Units

This information must be explicitly established before implementing geometry or animation conversion.

---

### 4. Geometry

Determine the complete representation of geometry.

Document:

* Meshes
* Submeshes
* Primitives
* Vertex buffers
* Index buffers
* Vertex formats
* Position
* Normal
* Tangent
* UV coordinates
* Multiple UV sets
* Vertex colors
* Joints
* Skin weights
* Morph targets
* Primitive topology
* Triangle winding
* Index size
* Vertex duplication rules
* Bounding boxes/spheres
* Mesh-level transforms, if any

For every attribute, record:

* Data type
* Component count
* Normalization
* Coordinate space
* Units
* Storage layout
* Index/reference semantics

---

### 5. Materials

Determine:

* Material model
* Base color/diffuse
* Metallic
* Roughness
* Specular
* Emissive
* Transparency
* Alpha mode
* Double-sided rendering
* Normal maps
* Occlusion maps
* Texture slots
* Custom shader parameters
* Rendering flags

Determine whether the source material model maps directly to glTF's PBR model or requires approximation.

---

### 6. Textures and images

Document:

* Image formats
* Embedded vs external images
* Texture references
* Texture coordinate sets
* UV transformations
* Wrapping
* Filtering
* Mipmaps
* Color spaces
* Normal-map conventions
* Texture compression
* Texture channel semantics

Explicitly distinguish color textures from data textures such as normal, roughness, metallic, and occlusion maps.

---

### 7. Cameras

Document:

* Perspective cameras
* Orthographic cameras
* Field of view
* Aspect ratio
* Near/far clipping planes
* Position
* Orientation
* Camera coordinate conventions

Determine the exact mapping to glTF cameras.

---

### 8. Lights

Determine whether the source format supports:

* Directional lights
* Point lights
* Spot lights
* Area lights
* Color
* Intensity
* Range
* Cone angles
* Shadows
* Custom lighting properties

Identify which properties have direct glTF equivalents and which do not.

---

### 9. Animation

Document:

* Animated properties
* Animation clips
* Tracks/channels
* Keyframes
* Time units
* Interpolation
* Translation animation
* Rotation animation
* Scale animation
* Morph-target animation
* Animation events
* Skeleton animation

Determine how source animation data maps to glTF animation samplers and channels.

---

### 10. Skinning and skeletons

If supported, document:

* Bones
* Skeleton hierarchy
* Joint identifiers
* Bind pose
* Inverse bind matrices
* Joint transforms
* Skin weights
* Maximum influences per vertex
* Animated joints

Determine the complete mapping to glTF `Skin`, joints, and inverse bind matrices.

---

### 11. Metadata and custom data

Identify information that is not directly represented by standard glTF.

Classify each item as:

1. Directly representable by glTF
2. Representable using `extras`
3. Representable using a glTF extension
4. Approximatable
5. Unsupported and must be discarded
6. Unsupported but should generate a warning/error

Do not silently discard source information.

---

# Phase 2 — Establish Source Semantics

After the source format has been documented, resolve ambiguities.

For every important field, determine:

* What does it mean?
* What are its units?
* What are its valid ranges?
* What is its default?
* Is it optional?
* What happens when it is absent?
* Is it inherited?
* Is it local or global?
* Is it an index or an identifier?
* Is it a reference or an embedded value?

Do not infer semantics from field names alone.

When the format documentation is insufficient, identify the ambiguity explicitly and search for additional evidence in:

* Existing implementations
* Readers/writers
* Test files
* Sample assets
* Source code
* Format specifications
* Comments
* Related tools
* Existing exporters/importers

Every inferred behavior should be marked as an inference rather than presented as a confirmed fact.

---

# Phase 3 — Define an Intermediate Source Model

Do not convert directly from raw parsed data into glTF.

Define a clean internal representation of the source scene.

Conceptually:

```text
SourceFile
    ↓
SourceScene
    ├── SourceNodes
    ├── SourceMeshes
    ├── SourceMaterials
    ├── SourceTextures
    ├── SourceCameras
    ├── SourceLights
    ├── SourceAnimations
    └── SourceSkins
```

This model should represent the source format faithfully rather than mirroring glTF.

The parser should produce this representation.

The converter should consume this representation.

This separation allows the parser and glTF conversion logic to be tested independently.

---

# Phase 4 — Study the glTF Target Model

Only after the source format is understood, document the relevant glTF model.

Focus on:

* Scenes
* Nodes
* Meshes
* Primitives
* Accessors
* BufferViews
* Buffers
* Materials
* Textures
* Images
* Cameras
* Animations
* Skins
* Morph targets
* `extras`
* Extensions

The LLM should specifically study how `@gltf-transform/core` represents these concepts.

Determine the APIs needed to construct each target object.

Do not attempt to learn the entire glTF ecosystem if it is irrelevant to the conversion.

---

# Phase 5 — Create the Conversion Matrix

Create a definitive mapping table.

Every significant source field must have an explicit destination.

Example:

| Source                       | glTF              | Conversion                  |
| ---------------------------- | ----------------- | --------------------------- |
| Scene                        | Scene             | Direct                      |
| Object                       | Node              | Direct                      |
| Position                     | Node.translation  | Coordinate conversion       |
| Rotation                     | Node.rotation     | Coordinate conversion       |
| Mesh                         | Mesh              | Structural conversion       |
| Vertex positions             | POSITION accessor | Repack                      |
| Indices                      | Index accessor    | Repack                      |
| Material                     | Material          | PBR mapping                 |
| Image                        | Image             | Format/reference conversion |
| Custom metadata              | extras            | Preserve                    |
| Unsupported shader parameter | None              | Warning                     |

The real project plan must contain the complete version of this table.

Nothing important should be left as an implicit mapping.

---

# Phase 6 — Resolve Coordinate and Convention Conversion

Before implementation, explicitly define all required transformations.

Document:

* Source coordinate system
* glTF coordinate system
* Axis conversion
* Handedness conversion
* Unit conversion
* Rotation conversion
* Winding conversion
* Normal conversion
* Tangent conversion
* Camera conversion
* Animation conversion
* Skinning conversion

Create small mathematical test cases for these transformations.

Examples should include:

* Identity transform
* Translation
* 90° rotation around each axis
* Scale
* Parent/child transforms
* A known triangle
* A known camera orientation

---

# Phase 7 — Define Error and Loss Handling

The converter must have an explicit policy for unsupported or lossy features.

Classify conversion outcomes:

```text
EXACT
APPROXIMATED
PRESERVED_AS_METADATA
UNSUPPORTED_WITH_WARNING
UNSUPPORTED_WITH_ERROR
```

The LLM must identify every known case where source information cannot be represented exactly in glTF.

The converter should not silently lose information.

---

# Phase 8 — Build the Minimal Vertical Slice

Implement the smallest useful converter:

```text
Source file
    ↓
Parser
    ↓
SourceScene
    ↓
Node hierarchy
    ↓
One mesh
    ↓
One material
    ↓
GLTF Document
    ↓
GLB
```

The first output should be viewable in a known glTF viewer.

Do not begin with:

* Optimization
* Compression
* Advanced extensions
* Performance tuning
* Full animation support
* Every exotic source feature

First prove that the basic conversion is correct.

---

# Phase 9 — Expand Feature Coverage

Add support in approximately this order:

1. Scene hierarchy
2. Transforms
3. Basic geometry
4. Multiple primitives
5. Materials
6. Textures
7. Cameras
8. Lights where applicable
9. Animations
10. Skinning
11. Morph targets
12. Metadata
13. Extensions
14. Optimization
15. Compression

The exact order may change if the source format has different dependencies, but dependencies should be made explicit.

---

# Phase 10 — Validation

Every conversion stage must have tests.

At minimum test:

### Structural correctness

* Valid GLB/glTF
* Correct scene
* Correct node hierarchy
* Correct references
* No orphaned required resources

### Geometry correctness

* Vertex positions
* Normals
* UVs
* Indices
* Winding
* Primitive topology

### Transform correctness

* Translation
* Rotation
* Scale
* Parent/child transforms
* Coordinate conversion

### Material correctness

* Base color
* Metallic/roughness
* Transparency
* Textures
* Normal maps

### Animation correctness

* Keyframe timing
* Interpolation
* Transform channels
* Skinning

### Data preservation

* Custom metadata
* Unsupported feature warnings
* Resource names/identifiers where appropriate

Use small deterministic fixtures rather than relying exclusively on large production assets.

---

# Phase 11 — CLI Design

After the conversion library works, build the CLI around it.

Conceptually:

```bash
scene-to-gltf input.scene output.glb
```

The CLI should eventually support useful options such as:

```text
--format
--output
--verbose
--strict
--preserve-metadata
--no-textures
--no-animation
```

Do not finalize CLI options until the conversion model is understood.

The conversion engine should remain usable as a TypeScript library independently of the CLI.

---

# Required Research Deliverables

Before substantial implementation begins, the LLM should produce these documents:

## 1. `SOURCE_FORMAT.md`

Complete description of the source format.

## 2. `SOURCE_MODEL.md`

Clean conceptual model of scenes, nodes, meshes, materials, textures, animations, etc.

## 3. `GLTF_MAPPING.md`

Field-by-field source → glTF mapping.

## 4. `COORDINATE_SYSTEM.md`

All coordinate, unit, rotation, winding, and convention conversions.

## 5. `LOSS_AND_WARNINGS.md`

Everything that cannot be represented exactly.

## 6. `IMPLEMENTATION_PLAN.md`

Concrete TypeScript architecture and implementation sequence.

## 7. `TEST_PLAN.md`

Fixtures and tests required to prove correctness.

Only after these are sufficiently complete should the main converter implementation begin.

---

# Rules for the LLM

The LLM working on this project should follow these rules:

1. **Do not start coding before understanding the source format.**

2. **Do not assume a source field's meaning from its name.**

3. **Separate confirmed facts from inference.**

4. **Search for primary/authoritative documentation before relying on secondary explanations.**

5. **Use actual source files and existing implementations as evidence when available.**

6. **Do not silently discard source information.**

7. **Do not design the source model as a copy of glTF.**

8. **Treat `@gltf-transform/core` as the target/output API, not the source-domain model.**

9. **Document coordinate systems before implementing transforms.**

10. **Document binary/vertex layouts before implementing geometry conversion.**

11. **Prefer small reproducible tests over visual inspection alone.**

12. **When uncertain, record the uncertainty and investigate it rather than guessing.**

13. **Keep parsing, source representation, conversion, and serialization as separate layers.**

14. **Implement a minimal end-to-end conversion before adding advanced features.**

15. **Every source feature should have an explicit conversion status: exact, approximate, metadata, warning, or error.**

---

# Final Objective

The finished project should provide:

```text
Existing Scene Format
        │
        ▼
     Parser
        │
        ▼
 Source Scene Model
        │
        ▼
 Conversion / Normalization
        │
        ▼
 @gltf-transform/core
        │
        ▼
 Valid glTF / GLB
```

The converter should be:

* Correct
* Testable
* Explicit about lossy conversions
* Capable of preserving useful metadata
* Independent of the source parser
* Independent of the CLI
* Maintainable as the source format evolves
* Maintainable as glTF features are added

The primary engineering objective is **faithful conversion**, not merely producing a file that happens to load in a viewer.
