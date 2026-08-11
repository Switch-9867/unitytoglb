import * as fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRTextureTransform, KHRLightsPunctual, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, dedup, weld, quantize } from '@gltf-transform/functions';
import { parseSourceScene } from '../parse/scene.js';
import { findExportRoot, findSceneFile } from '../io/exportRoot.js';
import { loadAssetsForScene } from '../io/assetLoader.js';
import { convertSourceBundleToGltf } from '../convert/convert.js';

async function main() {
  console.log('=== GLTF OPTIMIZATION BENCHMARK ===');

  const cwd = process.cwd();
  const exportRoot = await findExportRoot(cwd);
  const scenePath = findSceneFile(exportRoot, 'ORGANIZM.unity');

  const sceneContent = fs.readFileSync(scenePath, 'utf8');
  const scene = parseSourceScene(sceneContent, 'ORGANIZM');

  // Convert 100 renderers
  const sampledScene = {
    ...scene,
    renderers: scene.renderers.slice(0, 100),
  };

  const bundle = loadAssetsForScene(sampledScene, exportRoot.guidIndex);

  console.log('[1] Generating unoptimized glTF Document...');
  const doc = convertSourceBundleToGltf(bundle);

  const ioBefore = new NodeIO().registerExtensions([KHRTextureTransform, KHRLightsPunctual]);
  const glbBefore = await ioBefore.writeBinary(doc);
  console.log(`Unoptimized GLB Size: ${(glbBefore.byteLength / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n[2] Applying Optimization Pipeline (weld, dedup, prune, quantize)...');
  const startOpt = Date.now();
  await doc.transform(
    weld(),
    dedup(),
    prune(),
    quantize()
  );
  const optTime = ((Date.now() - startOpt) / 1000).toFixed(2);
  console.log(`Optimization completed in ${optTime}s`);

  const ioAfter = new NodeIO().registerExtensions([KHRTextureTransform, KHRLightsPunctual, KHRMeshQuantization]);
  const glbAfter = await ioAfter.writeBinary(doc);
  const optSizeMB = (glbAfter.byteLength / 1024 / 1024).toFixed(2);

  console.log(`\n===========================================`);
  console.log(`OPTIMIZED GLB SIZE: ${optSizeMB} MB`);
  console.log(`REDUCTION: ${(((glbBefore.byteLength - glbAfter.byteLength) / glbBefore.byteLength) * 100).toFixed(1)}%`);
  console.log(`===========================================`);
}

main().catch((err) => {
  console.error('Optimization error:', err);
  process.exit(1);
});
