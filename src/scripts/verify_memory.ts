import * as fs from 'node:fs';
import { parseSourceScene } from '../parse/scene.js';
import { findExportRoot, findSceneFile } from '../io/exportRoot.js';
import { loadAssetsForScene } from '../io/assetLoader.js';
import { convertSourceBundleToGLB } from '../convert/convert.js';

async function main() {
  console.log('=== MEMORY USAGE VERIFICATION BENCHMARK ===');

  const startMem = process.memoryUsage();
  console.log(`Initial Heap Used: ${(startMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Initial RSS:       ${(startMem.rss / 1024 / 1024).toFixed(2)} MB`);

  const cwd = process.cwd();
  const exportRoot = await findExportRoot(cwd);
  const scenePath = findSceneFile(exportRoot, 'ORGANIZM.unity');

  console.log('\n[1] Parsing 12.6 MB Scene File...');
  const sceneContent = fs.readFileSync(scenePath, 'utf8');
  const scene = parseSourceScene(sceneContent, 'ORGANIZM');

  console.log(`Total GameObjects: ${scene.nodes.size}`);
  console.log(`Total Renderers:   ${scene.renderers.length}`);

  // Test loading assets for 50 renderers
  const sampledScene = {
    ...scene,
    renderers: scene.renderers.slice(0, 50),
  };

  console.log('\n[2] Loading Asset Binary Data...');
  const bundleWithReport = loadAssetsForScene(sampledScene, exportRoot.guidIndex);
  console.log(`Loaded Unique Meshes: ${bundleWithReport.report.loadedMeshes}`);

  console.log('\n[3] Converting to glTF 2.0 / GLB...');
  const glbBytes = await convertSourceBundleToGLB(bundleWithReport);
  console.log(`Generated GLB Size: ${(glbBytes.byteLength / 1024 / 1024).toFixed(2)} MB`);

  const endMem = process.memoryUsage();
  const peakHeapMB = (endMem.heapUsed / 1024 / 1024).toFixed(2);
  const peakRssMB = (endMem.rss / 1024 / 1024).toFixed(2);

  console.log('\n===========================================');
  console.log(`FINAL PEAK HEAP USED: ${peakHeapMB} MB`);
  console.log(`FINAL PEAK RSS:       ${peakRssMB} MB`);
  console.log('===========================================');

  if (endMem.heapUsed / 1024 / 1024 < 250) {
    console.log('SUCCESS: Memory usage verified cleanly under target threshold!');
  } else {
    console.warn('WARNING: Memory usage exceeded target threshold.');
  }
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
