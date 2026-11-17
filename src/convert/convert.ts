// Orchestrate conversion from SourceScene + Assets to glTF Document / GLB / GLTF
// 100% 1:1 AssetRipper hierarchy conversion with exact submesh inverse transform matrix baking

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Document, NodeIO, Mesh, Material, Node, Scene, PropertyType } from '@gltf-transform/core';
import { KHRTextureTransform, KHRLightsPunctual } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { SourceScene, SourceMesh, SourceMaterial } from '../model/types.js';
import { createGltfSceneGraph } from './hierarchy.js';
import { createGltfMesh } from './geometry.js';
import { createGltfMaterial } from './materials.js';
import { createTextureManager } from './textures.js';
import { GuidIndex } from '../io/guidIndex.js';
import { Matrix4, createIdentityMatrix, createTRSMatrix, multiplyMatrices, invertMatrix } from './matrix.js';

export interface SourceBundle {
  scene: SourceScene;
  meshes: Map<string, SourceMesh>; // key: guid
  materials: Map<string, SourceMaterial>; // key: guid
  guidIndex?: GuidIndex;
}

export interface ConvertOptions {
  optimize?: boolean;
  skipTextures?: boolean;
  separateTextures?: boolean;
  texturesDir?: string; // relative or absolute folder name for external textures
  rotateYUp?: boolean;
  /** Embed no textures; keep materials as untextured placeholders (used by the Resonite layout). */
  untexturedMaterials?: boolean;
}

export interface RendererMeshInfo {
  meshGuid: string;
  isStaticBatch: boolean;
  firstSubMesh: number;
  subMeshCount: number;
}

/** Internal lookup tables produced during conversion, used by post-processing layouts. */
export interface ConversionContext {
  scene: Scene;
  buffer: import('@gltf-transform/core').Buffer;
  /** key: material GUID / builtin_<fileID> / default_node_<id>_sub_<n> */
  materials: Map<string, Material>;
  /** Unity transform fileID -> glTF node */
  nodes: Map<number, Node>;
  /** Unity transform fileID -> mesh info of the renderer on that node */
  rendererMeshes: Map<number, RendererMeshInfo>;
}

export function convertSourceBundleToGltf(bundle: SourceBundle, options?: ConvertOptions): Document {
  return buildGltfDocument(bundle, options).doc;
}

export function buildGltfDocument(
  bundle: SourceBundle,
  options?: ConvertOptions
): { doc: Document; ctx: ConversionContext } {
  const doc = new Document();
  const buffer = doc.createBuffer('binary_buffer');

  // Texture Manager for materials (only create if skipTextures is false)
  const textureCache = bundle.guidIndex && !options?.skipTextures && !options?.untexturedMaterials
    ? createTextureManager(doc, bundle.guidIndex)
    : undefined;

  // 1. Convert Materials
  const gltfMaterialMap = new Map<string, Material>();
  for (const [guid, mat] of bundle.materials.entries()) {
    const gltfMat = createGltfMaterial(doc, mat, textureCache);
    gltfMaterialMap.set(guid, gltfMat);
  }

  // 2. Compute Global Inverse Transforms for all Nodes
  const nodeGlobalInverseTransformMap = new Map<number, Matrix4>();

  function computeNodeTransforms(fileID: number, parentGlobal: Matrix4) {
    const node = bundle.scene.nodes.get(fileID);
    if (!node) return;

    const localMat = createTRSMatrix(node.localPosition, node.localRotation, node.localScale);
    const globalMat = multiplyMatrices(parentGlobal, localMat);
    const invGlobalMat = invertMatrix(globalMat) || createIdentityMatrix();

    nodeGlobalInverseTransformMap.set(fileID, invGlobalMat);

    for (const childId of node.childFileIds) {
      computeNodeTransforms(childId, globalMat);
    }
  }

  const identityMat = createIdentityMatrix();
  for (const rootFileId of bundle.scene.rootNodeFileIds) {
    computeNodeTransforms(rootFileId, identityMat);
  }

  // 3. Convert Meshes per Renderer with Per-Submesh Inverse Transform Matrix Slicing
  const meshVariantMap = new Map<string, Mesh>();
  const nodeMeshMap = new Map<number, Mesh>();
  const rendererMeshes = new Map<number, RendererMeshInfo>();

  for (const renderer of bundle.scene.renderers) {
    if (!renderer.meshGuid || !bundle.meshes.has(renderer.meshGuid)) {
      continue;
    }

    const sourceMesh = bundle.meshes.get(renderer.meshGuid)!;
    const isStaticBatch = !!(renderer.staticBatchInfo && renderer.staticBatchInfo.subMeshCount > 0);

    const posTransform = isStaticBatch ? nodeGlobalInverseTransformMap.get(renderer.nodeFileId) || null : null;

    // Build material list for submeshes of this renderer
    const matList: (Material | null)[] = [];
    const matGuidsKeyParts: string[] = [];

    const firstSub = renderer.staticBatchInfo?.firstSubMesh ?? 0;
    const subCount = renderer.staticBatchInfo?.subMeshCount && renderer.staticBatchInfo.subMeshCount > 0
      ? renderer.staticBatchInfo.subMeshCount
      : sourceMesh.subMeshes.length - firstSub;
    const totalSubmeshes = Math.max(renderer.materialRefs.length, subCount, 1);

    for (let subIdx = 0; subIdx < totalSubmeshes; subIdx++) {
      const matRef = renderer.materialRefs[subIdx];
      let gMat: Material | null = null;
      let refKey = 'none';

      if (matRef?.guid) {
        refKey = matRef.guid;
        gMat = gltfMaterialMap.get(matRef.guid) || null;
        if (!gMat) {
          // Dedicated placeholder material for this unbundled GUID
          gMat = createGltfMaterial(doc, {
            name: `Material_${matRef.guid.slice(0, 8)}`,
            guid: matRef.guid,
            shaderRef: null,
            shaderKeywords: [],
            lightmapFlags: 0,
            customRenderQueue: -1,
            doubleSidedGI: false,
            texEnvs: {},
            floats: {},
            colors: {},
            stringTags: {},
          });
          gltfMaterialMap.set(matRef.guid, gMat);
        }
      } else if (matRef?.fileID) {
        refKey = `builtin_${matRef.fileID}`;
        gMat = gltfMaterialMap.get(refKey) || null;
        if (!gMat) {
          gMat = createGltfMaterial(doc, {
            name: `Material_${matRef.fileID}`,
            guid: refKey,
            shaderRef: null,
            shaderKeywords: [],
            lightmapFlags: 0,
            customRenderQueue: -1,
            doubleSidedGI: false,
            texEnvs: {},
            floats: {},
            colors: {},
            stringTags: {},
          });
          gltfMaterialMap.set(refKey, gMat);
        }
      }

      if (!gMat) {
        // Material ref is missing/null: create a distinct fallback material per renderer/submesh so in-engine meshes don't lose distinct assignment
        const fallbackKey = `default_node_${renderer.nodeFileId}_sub_${subIdx}`;
        refKey = fallbackKey;
        gMat = gltfMaterialMap.get(fallbackKey) || null;
        if (!gMat) {
          gMat = createGltfMaterial(doc, {
            name: `DefaultMaterial_${renderer.nodeFileId}_${subIdx}`,
            guid: fallbackKey,
            shaderRef: null,
            shaderKeywords: [],
            lightmapFlags: 0,
            customRenderQueue: -1,
            doubleSidedGI: false,
            texEnvs: {},
            floats: {},
            colors: {},
            stringTags: {},
          });
          gltfMaterialMap.set(fallbackKey, gMat);
        }
      }

      matList.push(gMat);
      matGuidsKeyParts.push(refKey);
    }

    const transformKey = isStaticBatch ? `_inv_${renderer.nodeFileId}` : '_dyn';
    const variantKey = `${renderer.meshGuid}:${transformKey}:sub_${firstSub}_${subCount}:${matGuidsKeyParts.join('_')}`;

    let gltfMesh = meshVariantMap.get(variantKey);
    if (!gltfMesh) {
      gltfMesh = createGltfMesh(doc, buffer, sourceMesh, matList, renderer.staticBatchInfo, posTransform);
      meshVariantMap.set(variantKey, gltfMesh);
    }

    nodeMeshMap.set(renderer.nodeFileId, gltfMesh);
    rendererMeshes.set(renderer.nodeFileId, {
      meshGuid: renderer.meshGuid,
      isStaticBatch,
      firstSubMesh: firstSub,
      subMeshCount: subCount,
    });
  }

  // 4. Convert Scene Hierarchy (100% preserving node local transforms and parent-child edges)
  const { scene, nodeMap } = createGltfSceneGraph(
    doc,
    bundle.scene,
    (nodeFileId) => nodeMeshMap.get(nodeFileId) || null,
    { rotateYUp: options?.rotateYUp }
  );

  return {
    doc,
    ctx: { scene, buffer, materials: gltfMaterialMap, nodes: nodeMap, rendererMeshes },
  };
}

export async function processDocumentOptimizations(doc: Document): Promise<void> {
  // Deduplicate textures and prune unused elements. NEVER merge distinct materials, weld, or quantize vertices.
  await doc.transform(
    dedup({ propertyTypes: [PropertyType.TEXTURE] }),
    prune()
  );
}

export async function convertSourceBundleToGLB(bundle: SourceBundle, options?: ConvertOptions): Promise<Uint8Array> {
  const doc = convertSourceBundleToGltf(bundle, options);
  if (options?.optimize) {
    await processDocumentOptimizations(doc);
  }
  const extensions = [KHRTextureTransform, KHRLightsPunctual];

  const io = new NodeIO().registerExtensions(extensions as any);
  const glbBuffer = await io.writeBinary(doc);
  return glbBuffer;
}

export async function exportSourceBundleToGltfFiles(
  bundle: SourceBundle,
  outputPath: string,
  options?: ConvertOptions
): Promise<void> {
  const doc = convertSourceBundleToGltf(bundle, options);
  if (options?.optimize) {
    await processDocumentOptimizations(doc);
  }

  if (!options?.skipTextures && options?.separateTextures) {
    const outDir = path.dirname(outputPath);
    const texturesFolderRel = options?.texturesDir || 'textures';
    const texturesFolderAbs = path.isAbsolute(texturesFolderRel)
      ? texturesFolderRel
      : path.join(outDir, texturesFolderRel);

    if (!fs.existsSync(texturesFolderAbs)) {
      fs.mkdirSync(texturesFolderAbs, { recursive: true });
    }

    // Assign custom image URIs for external texture folder
    const textures = doc.getRoot().listTextures();
    for (let i = 0; i < textures.length; i++) {
      const tex = textures[i];
      const name = tex.getName() || `texture_${i}`;
      const mime = tex.getMimeType();
      const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png';
      const filename = `${name}${ext}`;

      const relUri = path.join(texturesFolderRel, filename);
      tex.setURI(relUri);
    }
  }

  const extensions = [KHRTextureTransform, KHRLightsPunctual];

  const io = new NodeIO().registerExtensions(extensions as any);
  await io.write(outputPath, doc);
}
