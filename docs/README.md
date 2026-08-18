# `scene-to-gltf` Documentation

Comprehensive documentation, specifications, coordinate mathematics, loss policies, and architecture guides for the **`scene-to-gltf`** Unity-to-glTF conversion system.

---

## 📚 Documentation Index

### 1. Architecture & Core Systems (`docs/architecture/`)

- [**LLM Handoff & Architecture Reference**](file:///home/switch/Desktop/ORGANISM/docs/architecture/LLM_HANDOFF.md): Executive summary, pipeline overview, static batching memory breakdown, binary decoding rules, and maintainer guidelines.
- [**Coordinate System Specification**](file:///home/switch/Desktop/ORGANISM/docs/architecture/COORDINATE_SYSTEM.md): Detailed mathematical formulation for Unity (Left-Handed, $+Y$ Up, $+Z$ Forward) to glTF 2.0 (Right-Handed, $+Y$ Up, $-Z$ Forward) reflection, winding inversion, and quaternion conversions.
- [**glTF Mapping Guide**](file:///home/switch/Desktop/ORGANISM/docs/architecture/GLTF_MAPPING.md): Mapping tables from Unity components (MeshFilter, MeshRenderer, Standard Material, Cameras, Lights) to glTF 2.0 primitives and KHR extensions.
- [**Source Format Specification**](file:///home/switch/Desktop/ORGANISM/docs/architecture/SOURCE_FORMAT.md): Detailed breakdown of the AssetRipper export directory structure, YAML document structures, binary vertex stream layouts, and `.meta` files.
- [**Source Conceptual Model**](file:///home/switch/Desktop/ORGANISM/docs/architecture/SOURCE_MODEL.md): Abstract data model definitions for scenes, nodes, submeshes, materials, and components.

---

### 2. Specifications & Policy (`docs/specifications/`)

- [**Implementation Plan**](file:///home/switch/Desktop/ORGANISM/docs/specifications/IMPLEMENTATION_PLAN.md): Step-by-step milestone execution roadmap and component design.
- [**Loss, Approximation & Warning Policy**](file:///home/switch/Desktop/ORGANISM/docs/specifications/LOSS_AND_WARNINGS.md): Classification taxonomy (`EXACT`, `APPROXIMATED`, `PRESERVED_AS_METADATA`, `UNSUPPORTED`) and fidelity rules for material properties, blend modes, and light types.
- [**Master Execution Plan**](file:///home/switch/Desktop/ORGANISM/docs/specifications/PLAN.md): Phase-by-phase implementation tracking and verification checklist.
- [**Test Plan**](file:///home/switch/Desktop/ORGANISM/docs/specifications/TEST_PLAN.md): Test matrices, unit tests, integration benchmarks, and memory validation procedures.
