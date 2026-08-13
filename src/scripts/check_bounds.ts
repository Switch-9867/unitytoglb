import * as fs from 'node:fs';
import { parseSourceScene } from '../parse/scene.js';
import { findExportRoot, findSceneFile } from '../io/exportRoot.js';
import { loadAssetsForScene } from '../io/assetLoader.js';
import { extractChannelFloat32 } from '../parse/mesh.js';

async function main() {
  console.log('=== MESH BOUNDING BOX & SCALE VALIDATION ===');

  const cwd = process.cwd();
  const exportRoot = await findExportRoot(cwd);
  const scenePath = findSceneFile(exportRoot, 'ORGANIZM.unity');

  const sceneContent = fs.readFileSync(scenePath, 'utf8');
  const scene = parseSourceScene(sceneContent, 'ORGANIZM');

  const bundle = loadAssetsForScene(scene, exportRoot.guidIndex);
  console.log(`Inspecting ${bundle.meshes.size} unique loaded meshes...`);

  let globalMinX = Infinity, globalMaxX = -Infinity;
  let globalMinY = Infinity, globalMaxY = -Infinity;
  let globalMinZ = Infinity, globalMaxZ = -Infinity;

  let validMeshCount = 0;

  for (const [guid, mesh] of bundle.meshes.entries()) {
    const rawPos = extractChannelFloat32(mesh.vertexData, 0);
    if (!rawPos || rawPos.length === 0) continue;

    validMeshCount++;
    for (let i = 0; i < rawPos.length; i += 3) {
      const x = rawPos[i];
      const y = rawPos[i + 1];
      const z = rawPos[i + 2];

      if (!isNaN(x) && isFinite(x)) {
        if (x < globalMinX) globalMinX = x;
        if (x > globalMaxX) globalMaxX = x;
      }
      if (!isNaN(y) && isFinite(y)) {
        if (y < globalMinY) globalMinY = y;
        if (y > globalMaxY) globalMaxY = y;
      }
      if (!isNaN(z) && isFinite(z)) {
        if (z < globalMinZ) globalMinZ = z;
        if (z > globalMaxZ) globalMaxZ = z;
      }
    }
  }

  console.log(`\nValid Meshes Analyzed: ${validMeshCount}`);
  console.log(`Global Position Bounds (Raw Unity Mesh Local Coordinates):`);
  console.log(`  X Range: [${globalMinX.toFixed(4)}, ${globalMaxX.toFixed(4)}]`);
  console.log(`  Y Range: [${globalMinY.toFixed(4)}, ${globalMaxY.toFixed(4)}]`);
  console.log(`  Z Range: [${globalMinZ.toFixed(4)}, ${globalMaxZ.toFixed(4)}]`);

  if (Math.abs(globalMaxX) < 100000 && Math.abs(globalMaxY) < 100000 && Math.abs(globalMaxZ) < 100000) {
    console.log('\nSUCCESS: Geometry position scale is verified in normal meters (no billions/garbled offsets)!');
  } else {
    console.error('\nWARNING: Position scale is out of bounds!');
  }
}

main().catch((err) => {
  console.error('Validation error:', err);
  process.exit(1);
});
