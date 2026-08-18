// Asset Loader: loads referenced Mesh (.asset) and Material (.mat) files via GuidIndex

import * as fs from 'node:fs';
import { SourceScene, SourceMesh, SourceMaterial } from '../model/types.js';
import { GuidIndex } from './guidIndex.js';
import { parseSourceMesh } from '../parse/mesh.js';
import { parseSourceMaterial } from '../parse/material.js';
import { createBuiltinPrimitiveMesh } from '../parse/builtinPrimitives.js';
import { SourceBundle } from '../convert/convert.js';

export interface AssetLoadingReport {
  totalRenderers: number;
  uniqueMeshGuids: number;
  loadedMeshes: number;
  missingMeshGuids: string[];
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
      }
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
    loadedMeshes: meshes.size,
    missingMaterialGuids,
    uniqueMaterialGuids: materialGuids.size,
    loadedMaterials: materials.size,
    missingMeshGuids,
  };

  return {
    scene,
    meshes,
    materials,
    guidIndex,
    report,
  };
}
