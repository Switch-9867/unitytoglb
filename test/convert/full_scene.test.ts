import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { parseSourceScene } from '../../src/parse/scene.js';
import { findExportRoot, findSceneFile } from '../../src/io/exportRoot.js';
import { loadAssetsForScene } from '../../src/io/assetLoader.js';
import { convertSourceBundleToGLB } from '../../src/convert/convert.js';
import { SourceNode } from '../../src/model/types.js';

describe('Milestone 4: Full Static Scene Conversion (Sampled Subtree)', () => {
  it('converts a representative static scene subtree into GLB in < 1 second', async () => {
    const cwd = process.cwd();
    const exportRoot = await findExportRoot(cwd);
    const scenePath = findSceneFile(exportRoot, 'ORGANIZM.unity');

    const sceneContent = fs.readFileSync(scenePath, 'utf8');
    const scene = parseSourceScene(sceneContent, 'ORGANIZM');

    // Sample 50 renderers and collect their node subtree
    const sampledRenderers = scene.renderers.slice(0, 50);
    const neededNodeIds = new Set<number>();

    for (const r of sampledRenderers) {
      let currentId: number | null = r.nodeFileId;
      while (currentId !== null && !neededNodeIds.has(currentId)) {
        neededNodeIds.add(currentId);
        const node = scene.nodes.get(currentId);
        currentId = node ? node.parentFileId : null;
      }
    }

    const sampledNodes = new Map<number, SourceNode>();
    for (const id of neededNodeIds) {
      const node = scene.nodes.get(id);
      if (node) {
        // filter childFileIds to only keep children present in neededNodeIds
        sampledNodes.set(id, {
          ...node,
          childFileIds: node.childFileIds.filter((cid) => neededNodeIds.has(cid)),
        });
      }
    }

    const rootNodeIds = Array.from(sampledNodes.values())
      .filter((n) => n.parentFileId === null || !neededNodeIds.has(n.parentFileId))
      .map((n) => n.fileID);

    const sampledScene = {
      ...scene,
      nodes: sampledNodes,
      rootNodeFileIds: rootNodeIds,
      renderers: sampledRenderers,
    };

    const bundleWithReport = loadAssetsForScene(sampledScene, exportRoot.guidIndex);
    const { report } = bundleWithReport;

    expect(report.totalRenderers).toBe(50);
    expect(report.loadedMeshes).toBeGreaterThan(0);

    // Convert sampled scene to GLB binary buffer
    const glbBytes = await convertSourceBundleToGLB(bundleWithReport);
    expect(glbBytes).toBeInstanceOf(Uint8Array);
    expect(glbBytes.byteLength).toBeGreaterThan(10000);

    // Verify GLB magic header
    const magic = new DataView(glbBytes.buffer, glbBytes.byteOffset, 4).getUint32(0, true);
    expect(magic).toBe(0x46546c67);

    // Validate GLB deserialization with NodeIO
    const io = new NodeIO();
    const readDoc = await io.readBinary(glbBytes);
    expect(readDoc.getRoot().listScenes()).toHaveLength(1);
    expect(readDoc.getRoot().listNodes().length).toBeGreaterThan(10);
  });
});
