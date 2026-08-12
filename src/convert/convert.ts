// Orchestrate conversion from SourceScene + Assets to glTF Document / GLB / GLTF

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Document, NodeIO, Mesh, Material } from '@gltf-transform/core';
import { KHRTextureTransform, KHRLightsPunctual } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { SourceScene, SourceMesh, SourceMaterial } from '../model/types.js';
import { createGltfSceneGraph } from './hierarchy.js';
import { createGltfMesh } from './geometry.js';
import { createGltfMaterial } from './materials.js';
import { createTextureManager } from './textures.js';
import { GuidIndex } from '../io/guidIndex.js';

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
}

export function convertSourceBundleToGltf(bundle: SourceBundle, options?: ConvertOptions): Document {
  const doc = new Document();
  const buffer = doc.createBuffer('binary_buffer');

  // Texture Manager for materials (only create if skipTextures is false)
  const textureCache = bundle.guidIndex && !options?.skipTextures
    ? createTextureManager(doc, bundle.guidIndex)
    : undefined;

  // 1. Convert Materials
  const gltfMaterialMap = new Map<string, Material>();
  for (const [guid, mat] of bundle.materials.entries()) {
    const gltfMat = createGltfMaterial(doc, mat, textureCache);
    gltfMaterialMap.set(guid, gltfMat);
  }

  // 2. Convert Meshes per Renderer with Per-Renderer Material Binding & Static Batch Submesh Slicing
  const meshVariantMap = new Map<string, Mesh>();
  const nodeMeshMap = new Map<number, Mesh>();

  for (const renderer of bundle.scene.renderers) {
    if (!renderer.meshGuid || !bundle.meshes.has(renderer.meshGuid)) {
      continue;
    }

    const sourceMesh = bundle.meshes.get(renderer.meshGuid)!;

    // Build material list for submeshes of this renderer
    const matList: (Material | null)[] = [];
    const matGuidsKeyParts: string[] = [];

    for (let subIdx = 0; subIdx < renderer.materialRefs.length; subIdx++) {
      const matRef = renderer.materialRefs[subIdx];
      const gMat = matRef?.guid ? gltfMaterialMap.get(matRef.guid) || null : null;
      matList.push(gMat);
      matGuidsKeyParts.push(matRef?.guid || 'none');
    }

    const firstSub = renderer.staticBatchInfo?.firstSubMesh ?? 0;
    const subCount = renderer.staticBatchInfo?.subMeshCount ?? 0;

    const variantKey = `${renderer.meshGuid}:sub_${firstSub}_${subCount}:${matGuidsKeyParts.join('_')}`;

    let gltfMesh = meshVariantMap.get(variantKey);
    if (!gltfMesh) {
      gltfMesh = createGltfMesh(doc, buffer, sourceMesh, matList, renderer.staticBatchInfo);
      meshVariantMap.set(variantKey, gltfMesh);
    }

    nodeMeshMap.set(renderer.nodeFileId, gltfMesh);
  }

  // 3. Convert Scene Hierarchy (including Cameras and Lights)
  createGltfSceneGraph(doc, bundle.scene, (nodeFileId) => nodeMeshMap.get(nodeFileId) || null);

  return doc;
}

export async function processDocumentOptimizations(doc: Document): Promise<void> {
  // Only deduplicate materials/textures and prune unused nodes. NEVER weld or quantize vertices.
  await doc.transform(
    dedup({ propertyTypes: ['material', 'texture'] }),
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
