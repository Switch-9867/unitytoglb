#!/usr/bin/env node

// CLI Entry point for scene-to-gltf Unity Export Converter
// Supports direct .unity scene files, export root directories, or project subfolders

import * as fs from 'node:fs';
import * as path from 'node:path';
import { findExportRoot, findSceneFile } from '../io/exportRoot.js';
import { parseSourceScene } from '../parse/scene.js';
import { loadAssetsForScene } from '../io/assetLoader.js';
import {
  convertSourceBundleToGLB,
  exportSourceBundleToGltfFiles,
  ConvertOptions,
} from '../convert/convert.js';

interface CliArgs {
  targetPath: string;
  outputPath?: string;
  sceneName?: string;
  maxRenderers?: number;
  format?: 'glb' | 'gltf';
  skipTextures: boolean;
  separateTextures: boolean;
  texturesDir?: string;
  rotateYUp: boolean;
  optimize: boolean;
  quiet: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    targetPath: '.',
    skipTextures: false,
    separateTextures: false,
    rotateYUp: false,
    optimize: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-q' || arg === '--quiet') {
      result.quiet = true;
    } else if (arg === '-O' || arg === '--optimize') {
      result.optimize = true;
    } else if (arg === '--rotate-y-up' || arg === '-ry') {
      result.rotateYUp = true;
    } else if (arg === '--skip-textures' || arg === '--no-textures' || arg === '-nt') {
      result.skipTextures = true;
    } else if (arg === '--separate-textures' || arg === '--separate' || arg === '-st') {
      result.separateTextures = true;
    } else if (arg === '--textures-dir' || arg === '-td') {
      result.texturesDir = args[++i];
      result.separateTextures = true; // Implicitly enable separate textures if dir set
    } else if (arg === '-f' || arg === '--format') {
      const fmt = args[++i].toLowerCase();
      if (fmt === 'gltf' || fmt === 'glb') {
        result.format = fmt;
      }
    } else if (arg === '-o' || arg === '--output') {
      result.outputPath = args[++i];
    } else if (arg === '-s' || arg === '--scene') {
      result.sceneName = args[++i];
    } else if (arg === '-m' || arg === '--max-renderers') {
      result.maxRenderers = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      result.targetPath = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
scene-to-gltf — Convert AssetRipper Unity exports into glTF 2.0 / GLB

Usage:
  scene-to-gltf [scene-file.unity | target-dir] [options]

Options:
  -o, --output <path>         Output GLB/glTF file path (default: <SceneName>.glb)
  -s, --scene <name>          Specific scene file to convert if directory is passed
  -m, --max-renderers <num>   Limit number of renderers to convert (optional preview mode)
  -f, --format <glb|gltf>     Output format: glb (single binary) or gltf (JSON + external files)
  --skip-textures, -nt        Skip loading and embedding textures completely (super fast & lightweight)
  --separate-textures, -st   Extract textures to separate files instead of embedding in GLB
  --textures-dir, -td <dir>   Directory name/path for extracted textures (default: textures)
  --rotate-y-up, -ry          Apply +90 deg X master root node rotation to orient scene +Y Up
  -O, --optimize              Deduplicate materials/textures and prune unused glTF elements
  -q, --quiet                 Suppress non-error logging
  -h, --help                  Show this help message

Examples:
  # Point directly to a .unity scene file
  scene-to-gltf /path/to/ORGANIZM.unity --skip-textures -o ORGANIZM.glb

  # Point to project root directory
  scene-to-gltf . --skip-textures -o ORGANIZM.glb
`);
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const log = (msg: string) => {
    if (!args.quiet) {
      console.log(msg);
    }
  };

  log('=== Unity Export to glTF 2.0 / GLB Converter ===');

  try {
    const rootInfo = await findExportRoot(args.targetPath);
    const sceneFilePath = findSceneFile(rootInfo, args.sceneName);

    const sceneBasename = path.basename(sceneFilePath, '.unity');
    const outFormat = args.format || (args.outputPath?.endsWith('.gltf') ? 'gltf' : 'glb');
    const finalOutputPath = path.resolve(
      args.outputPath || `${sceneBasename}.${outFormat}`
    );

    log(`Root Directory:   ${rootInfo.exportRootDir}`);
    log(`Assets Directory: ${rootInfo.assetsDir}`);
    log(`Scene File:       ${sceneFilePath}`);

    // [1] Parse Scene
    log('\n[1] Parsing Scene Hierarchy...');
    const sceneYamlContent = fs.readFileSync(sceneFilePath, 'utf-8');
    const scene = parseSourceScene(sceneYamlContent, sceneBasename);

    log(`    GameObjects: ${scene.nodes.size}`);
    log(`    Renderers:   ${scene.renderers.length}`);
    log(`    Cameras:     ${scene.cameras.length}`);
    log(`    Lights:      ${scene.lights.length}`);

    // If max renderers option specified, limit renderer list for quick previewing
    if (args.maxRenderers && args.maxRenderers > 0) {
      scene.renderers = scene.renderers.slice(0, args.maxRenderers);
      log(`    [Preview Mode] Limited to first ${scene.renderers.length} renderers`);
    }

    // [2] Load Assets
    log('\n[2] Loading Referenced Asset Data...');
    const convertOptions: ConvertOptions = {
      optimize: args.optimize,
      skipTextures: args.skipTextures,
      separateTextures: args.separateTextures,
      texturesDir: args.texturesDir,
      rotateYUp: args.rotateYUp,
    };

    const assets = await loadAssetsForScene(scene, rootInfo.guidIndex);
    const report = assets.report;

    log(`    Loaded Meshes:    ${assets.meshes.size} / ${report.uniqueMeshGuids} referenced`);
    log(`    Loaded Materials: ${assets.materials.size} / ${report.uniqueMaterialGuids} referenced`);
    if (args.skipTextures) {
      log('    [Option] Skipping texture loading (--skip-textures active)');
    }

    if (report.missingMeshGuids.length > 0) {
      log(`    [Warning] Missing ${report.missingMeshGuids.length} referenced mesh asset(s)`);
      if (!args.quiet && report.missingMeshGuids.length <= 5) {
        report.missingMeshGuids.forEach((g) => log(`      - Mesh GUID: ${g}`));
      }
    }
    if (report.missingMaterialGuids.length > 0) {
      log(`    [Warning] Missing ${report.missingMaterialGuids.length} referenced material asset(s)`);
      if (!args.quiet && report.missingMaterialGuids.length <= 5) {
        report.missingMaterialGuids.forEach((g) => log(`      - Material GUID: ${g}`));
      }
    }

    // [3] Convert & Write glTF / GLB
    log('\n[3] Converting to glTF 2.0...');
    if (args.optimize) {
      log('    [Option] Optimizing glTF document (deduplicating materials/textures & pruning unused elements)...');
    }
    if (args.rotateYUp) {
      log('    [Option] Applying root container orientation (+Y Up)...');
    }

    const bundle = {
      scene,
      meshes: assets.meshes,
      materials: assets.materials,
      guidIndex: rootInfo.guidIndex,
    };

    const startTime = Date.now();
    let outputFileSize = 0;

    if (outFormat === 'gltf') {
      log(`    Writing glTF JSON & assets to ${finalOutputPath}...`);
      await exportSourceBundleToGltfFiles(bundle, finalOutputPath, convertOptions);
      if (fs.existsSync(finalOutputPath)) {
        outputFileSize = fs.statSync(finalOutputPath).size;
      }
    } else {
      log('    Packing single binary GLB buffer...');
      const glbBuffer = await convertSourceBundleToGLB(bundle, convertOptions);
      fs.writeFileSync(finalOutputPath, glbBuffer);
      outputFileSize = glbBuffer.byteLength;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const sizeMB = (outputFileSize / (1024 * 1024)).toFixed(2);

    log('\n===============================================');
    log(`SUCCESS: Export completed in ${elapsed}s!`);
    log(`Output File: ${finalOutputPath} (${sizeMB} MB)`);
    log('===============================================\n');
  } catch (err: any) {
    console.error(`\n[ERROR] ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Auto-run if executed directly as main script
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('cli/index.js') ||
    process.argv[1].endsWith('scene-to-gltf') ||
    process.argv[1].endsWith('scene-to-gltf.cjs'));

if (isDirectRun) {
  main();
}
