#!/usr/bin/env node

// CLI Entry point for scene-to-gltf Unity Export Converter

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
  scene-to-gltf [target-path] [options]

Options:
  -o, --output <path>         Output GLB/glTF file path (default: <SceneName>.gltf or <SceneName>.glb)
  -s, --scene <name>          Specific scene file to convert (default: ORGANIZM.unity)
  -m, --max-renderers <num>   Limit number of renderers to convert (optional preview mode)
  -f, --format <glb|gltf>     Output format: glb (single binary) or gltf (JSON + external files)
  --skip-textures, -nt        Skip loading and embedding textures completely (super fast & lightweight)
  --separate-textures, -st   Extract textures to separate files instead of embedding in GLB
  --textures-dir, -td <dir>   Directory name/path for extracted textures (default: textures)
  --rotate-y-up, -ry          Apply +90 deg X master root node rotation to orient scene +Y Up
  -O, --optimize              Apply geometry welding, accessor deduplication, and mesh quantization
  -q, --quiet                 Suppress non-error logging
  -h, --help                  Show this help message

Examples:
  # Export full scene without any textures (lightweight geometry & material colors)
  scene-to-gltf . --skip-textures -o ORGANIZM_no_textures.glb

  # Export full scene oriented +Y Up
  scene-to-gltf . --skip-textures --rotate-y-up -o ORGANIZM_yup.glb
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const log = (...msg: any[]) => {
    if (!args.quiet) console.log(...msg);
  };

  log('=== Unity Export to glTF 2.0 / GLB Converter ===');

  const exportRoot = await findExportRoot(args.targetPath);
  log(`Root Directory:   ${exportRoot.exportRootDir}`);
  log(`Assets Directory: ${exportRoot.assetsDir}`);

  const sceneFileName = args.sceneName || 'ORGANIZM.unity';
  const scenePath = findSceneFile(exportRoot, sceneFileName);
  log(`Scene File:       ${path.basename(scenePath)}`);

  log('\n[1] Parsing Scene Hierarchy...');
  const sceneContent = fs.readFileSync(scenePath, 'utf8');
  let scene = parseSourceScene(sceneContent, path.basename(sceneFileName, '.unity'));

  if (args.maxRenderers && args.maxRenderers > 0) {
    log(`[Info] Capping renderers to max ${args.maxRenderers}`);
    scene = {
      ...scene,
      renderers: scene.renderers.slice(0, args.maxRenderers),
    };
  }

  log(`    GameObjects: ${scene.nodes.size}`);
  log(`    Renderers:   ${scene.renderers.length}`);
  log(`    Cameras:     ${scene.cameras.length}`);
  log(`    Lights:      ${scene.lights.length}`);

  log('\n[2] Loading Referenced Asset Data...');
  const bundle = loadAssetsForScene(scene, exportRoot.guidIndex);
  log(`    Loaded Meshes:    ${bundle.report.loadedMeshes}`);
  log(`    Loaded Materials: ${bundle.report.loadedMaterials}`);
  if (args.skipTextures) {
    log(`    [Option] Skipping texture loading (--skip-textures active)`);
  }

  const convertOpts: ConvertOptions = {
    optimize: args.optimize,
    skipTextures: args.skipTextures,
    separateTextures: args.separateTextures,
    texturesDir: args.texturesDir || 'textures',
    rotateYUp: args.rotateYUp,
  };

  const isGltfFormat = args.format === 'gltf' || (args.separateTextures && !args.skipTextures);
  const defaultExt = isGltfFormat ? '.gltf' : '.glb';
  const outputPath = args.outputPath || path.join(exportRoot.exportRootDir, `${scene.name}${defaultExt}`);

  log('\n[3] Converting to glTF 2.0...');
  if (args.optimize) {
    log('    Applying Optimization Pipeline...');
  }
  if (args.rotateYUp) {
    log('    [Option] Applying SceneRoot +90 deg X rotation for +Y Up orientation');
  }

  const startConvert = Date.now();

  if (isGltfFormat) {
    log(`    Writing glTF JSON...`);
    await exportSourceBundleToGltfFiles(bundle, outputPath, convertOpts);
  } else {
    log('    Packing single binary GLB buffer...');
    const glbBytes = await convertSourceBundleToGLB(bundle, convertOpts);
    fs.writeFileSync(outputPath, glbBytes);
  }

  const elapsedSec = ((Date.now() - startConvert) / 1000).toFixed(2);

  log(`\n===============================================`);
  log(`SUCCESS: Export completed in ${elapsedSec}s!`);
  log(`Output File: ${outputPath}`);
  if (args.separateTextures && !args.skipTextures) {
    log(`Textures Folder: ${path.join(path.dirname(outputPath), convertOpts.texturesDir!)}`);
  }
  log(`===============================================`);
}

main().catch((err) => {
  console.error('\nConversion Error:', err);
  process.exit(1);
});
