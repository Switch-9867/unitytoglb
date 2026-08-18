// scene-to-gltf — Core Library Entry Point

// 1. Model & Types
export * from './model/types.js';

// 2. Conversion Pipeline
export {
  convertSourceBundleToGltf,
  convertSourceBundleToGLB,
  exportSourceBundleToGltfFiles,
  processDocumentOptimizations,
  type SourceBundle,
  type ConvertOptions,
} from './convert/convert.js';

export { createGltfSceneGraph, type SceneGraphOptions } from './convert/hierarchy.js';
export { createGltfMesh, type MeshSubmeshRange } from './convert/geometry.js';
export { createGltfMaterial } from './convert/materials.js';
export { createTextureManager, applyTextureTransform, type TextureCache } from './convert/textures.js';
export { attachGltfCamera } from './convert/cameras.js';
export { attachGltfLight } from './convert/lights.js';

// 3. Coordinate Systems & Matrix Math
export {
  convertPosition,
  convertVector,
  convertTangent,
  convertRotation,
  convertScale,
  convertUV,
  reverseTriangleWinding,
  convertPositionsArray,
  convertNormalsArray,
  convertTangentsArray,
  convertUVsArray,
  computeMinMax3D,
} from './convert/coords.js';

export {
  type Matrix4,
  createIdentityMatrix,
  createTRSMatrix,
  multiplyMatrices,
  invertMatrix,
  transformPoint3D,
  transformVector3D,
  transformNormal3D,
} from './convert/matrix.js';

// 4. Parsing Utilities
export { parseSourceScene, parseRawDocsToSourceScene, parseRef } from './parse/scene.js';
export {
  parseSourceMesh,
  extractChannelFloat32,
  extractSubmeshIndices,
  hexToBytes,
  float16ToFloat32,
  VERTEX_FORMAT_SIZES_2017,
  VERTEX_FORMAT_NAMES_2017,
} from './parse/mesh.js';
export { parseSourceMaterial } from './parse/material.js';
export { createBuiltinPrimitiveMesh, isBuiltinMeshGuid } from './parse/builtinPrimitives.js';
export { parseUnityYamlFile, parseYamlDocumentLines, parseInlineFlow, parseScalar, parseValue, splitUnityYaml } from './parse/yaml.js';

// 5. I/O & Asset Resolution
export { findExportRoot, findSceneFile, type ExportRootInfo } from './io/exportRoot.js';
export { GuidIndex, buildGuidIndexFromDir, parseGuidFromMeta, type GuidEntry } from './io/guidIndex.js';
export { loadAssetsForScene, type AssetLoadingReport } from './io/assetLoader.js';
