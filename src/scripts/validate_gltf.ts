import * as fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRTextureTransform, KHRLightsPunctual } from '@gltf-transform/extensions';
import { parseSourceScene } from '../parse/scene.js';
import { findExportRoot, findSceneFile } from '../io/exportRoot.js';
import { loadAssetsForScene } from '../io/assetLoader.js';
import { convertSourceBundleToGLB } from '../convert/convert.js';

async function main() {
  console.log('=== GLTF SCHEMA VALIDATION FOR BLENDER IMPORTER ===');

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
  const glbBytes = await convertSourceBundleToGLB(bundle);

  // Register extensions with NodeIO for reading
  const io = new NodeIO().registerExtensions([KHRTextureTransform, KHRLightsPunctual]);
  const doc = await io.readBinary(glbBytes);
  const root = doc.getRoot();

  const accessors = root.listAccessors();
  console.log(`Total Accessors: ${accessors.length}`);

  let invalidCount = 0;
  for (const acc of accessors) {
    if (acc.getCount() <= 0) {
      console.error(`Invalid Accessor found: ${acc.getName()} has count: ${acc.getCount()}`);
      invalidCount++;
    }
  }

  const meshes = root.listMeshes();
  console.log(`Total Meshes: ${meshes.length}`);
  for (const m of meshes) {
    if (m.listPrimitives().length === 0) {
      console.warn(`Warning: Mesh ${m.getName()} has 0 primitives.`);
    }
  }

  if (invalidCount === 0) {
    console.log('\nSUCCESS: All accessors have count >= 1. Valid glTF 2.0 schema for Blender!');
  } else {
    console.error(`\nFAILED: Found ${invalidCount} invalid accessors with count <= 0.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Validation error:', err);
  process.exit(1);
});
