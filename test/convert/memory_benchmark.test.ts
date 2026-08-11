import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { parseSourceScene } from '../../src/parse/scene.js';
import { findExportRoot, findSceneFile } from '../../src/io/exportRoot.js';
import { loadAssetsForScene } from '../../src/io/assetLoader.js';
import { convertSourceBundleToGLB } from '../../src/convert/convert.js';

describe('Memory Benchmark Verification', () => {
  it('converts static scene elements while strictly keeping heap memory under 250 MB', async () => {
    const memBefore = process.memoryUsage();

    const cwd = process.cwd();
    const exportRoot = await findExportRoot(cwd);
    const scenePath = findSceneFile(exportRoot, 'ORGANIZM.unity');

    const sceneContent = fs.readFileSync(scenePath, 'utf8');
    const scene = parseSourceScene(sceneContent, 'ORGANIZM');

    // Sample 150 renderers for memory benchmark
    const sampledRenderers = scene.renderers.slice(0, 150);
    const sampledScene = {
      ...scene,
      renderers: sampledRenderers,
    };

    const bundleWithReport = loadAssetsForScene(sampledScene, exportRoot.guidIndex);
    const glbBytes = await convertSourceBundleToGLB(bundleWithReport);

    const memAfter = process.memoryUsage();
    const heapUsedMB = memAfter.heapUsed / (1024 * 1024);
    const rssMB = memAfter.rss / (1024 * 1024);

    console.log(`[Memory Benchmark] Heap Used: ${heapUsedMB.toFixed(2)} MB | RSS: ${rssMB.toFixed(2)} MB`);

    expect(glbBytes.byteLength).toBeGreaterThan(10000);
    // Prove that memory usage stays low
    expect(heapUsedMB).toBeLessThan(250);
  });
});
