// Asset Loader: loads referenced Mesh (.asset) and Material (.mat) files via GuidIndex

import * as fs from 'node:fs';
import { SourceScene, SourceMesh, SourceMaterial } from '../model/types.js';
import { GuidIndex } from './guidIndex.js';
import { parseSourceMesh } from '../parse/mesh.js';
import { parseSourceMaterial, createBuiltinMaterial } from '../parse/material.js';
import { createBuiltinPrimitiveMesh } from '../parse/builtinPrimitives.js';
import { SourceBundle } from '../convert/convert.js';
import { parseLightingDataAsset, SourceLightingData } from '../parse/lightingData.js';

export interface AssetLoadingReport {
  totalRenderers: number;
  uniqueMeshGuids: number;
  loadedMeshes: number;
  missingMeshGuids: string[];
  colliderMeshGuids: number;
  uniqueMaterialGuids: number;
  loadedMaterials: number;
  missingMaterialGuids: string[];
}

export function loadAssetsForScene(scene: SourceScene, guidIndex: GuidIndex): SourceBundle & { report: AssetLoadingReport } {
  const meshes = new Map<string, SourceMesh>();
  const materials = new Map<string, SourceMaterial>();

  const meshGuids = new Set<string>();
  const materialGuids = new Set<string>();

  for (const renderer of scene.renderers) {
    if (renderer.meshGuid) {
      meshGuids.add(renderer.meshGuid);
    }
    for (const matRef of renderer.materialRefs) {
      if (matRef.guid) {
        materialGuids.add(matRef.guid);
      } else if (matRef.fileID) {
        materialGuids.add(`builtin_${matRef.fileID}`);
      }
    }
  }

  // Mesh collider meshes (often collision-only meshes with no renderer)
  const colliderMeshGuids = new Set<string>();
  for (const col of scene.colliders) {
    const key = colliderMeshKey(col.meshRef);
    if (key) {
      colliderMeshGuids.add(key);
      meshGuids.add(key);
    }
  }

  const missingMeshGuids: string[] = [];
  for (const guid of meshGuids) {
    if (guid.startsWith('builtin_') || guid === '0000000000000000e000000000000000') {
      const fileId = parseInt(guid.replace('builtin_', ''), 10) || 10202;
      const mesh = createBuiltinPrimitiveMesh(fileId);
      meshes.set(guid, mesh);
      continue;
    }

    const entry = guidIndex.get(guid);
    if (entry && fs.existsSync(entry.assetPath) && fs.statSync(entry.assetPath).isFile()) {
      try {
        const content = fs.readFileSync(entry.assetPath, 'utf8');
        const mesh = parseSourceMesh(content, guid);
        meshes.set(guid, mesh);
      } catch {
        missingMeshGuids.push(guid);
      }
    } else {
      missingMeshGuids.push(guid);
    }
  }

  const missingMaterialGuids: string[] = [];
  for (const guid of materialGuids) {
    if (guid === '0000000000000000f000000000000000' || guid.startsWith('builtin_')) {
      const mat = createBuiltinMaterial(guid, 'Default-Material');
      materials.set(guid, mat);
      continue;
    }

    const entry = guidIndex.get(guid);
    if (entry && fs.existsSync(entry.assetPath) && fs.statSync(entry.assetPath).isFile()) {
      try {
        const content = fs.readFileSync(entry.assetPath, 'utf8');
        const mat = parseSourceMaterial(content, guid);
        materials.set(guid, mat);
      } catch {
        missingMaterialGuids.push(guid);
      }
    } else {
      missingMaterialGuids.push(guid);
    }
  }

  const report: AssetLoadingReport = {
    totalRenderers: scene.renderers.length,
    uniqueMeshGuids: meshGuids.size,
    colliderMeshGuids: colliderMeshGuids.size,
    loadedMeshes: meshes.size,
    missingMaterialGuids,
    uniqueMaterialGuids: materialGuids.size,
    loadedMaterials: materials.size,
    missingMeshGuids,
  };

  // Baked lighting (lightmap list + per-renderer lightmap index / scale-offset)
  let lighting: SourceLightingData | undefined;
  const lightingGuid = scene.settings.lightmapSettings?.lightingDataAssetRef?.guid;
  const lightingEntry = lightingGuid ? guidIndex.get(lightingGuid) : undefined;
  if (lightingEntry && fs.existsSync(lightingEntry.assetPath)) {
    try {
      lighting = parseLightingDataAsset(fs.readFileSync(lightingEntry.assetPath, 'utf8'));
    } catch {
      lighting = undefined;
    }
  }

  return {
    scene,
    meshes,
    materials,
    guidIndex,
    lighting,
    report,
  };
}

/** Key used in the mesh map for a collider's mesh reference (GUID, or builtin_<fileID> for Unity builtin primitives). */
export function colliderMeshKey(ref: { fileID: number; guid?: string } | null | undefined): string | null {
  if (!ref) return null;
  if (ref.guid && ref.guid !== '0000000000000000e000000000000000') return ref.guid;
  if (ref.fileID) return `builtin_${ref.fileID}`;
  return null;
}
