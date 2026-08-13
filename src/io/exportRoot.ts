// Locates AssetRipper export root, Assets directory, path_id_map, and scene files.
// Supports direct .unity scene file paths, export root directories, or project subfolders.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildGuidIndexFromDir, GuidIndex } from './guidIndex.js';

export interface ExportRootInfo {
  exportRootDir: string;
  assetsDir: string;
  sceneFilePath?: string;
  auxiliaryDir?: string;
  pathIdMapPath?: string;
  guidIndex: GuidIndex;
}

let cachedRootPromise: Promise<ExportRootInfo> | null = null;

export async function findExportRoot(targetPathInput: string): Promise<ExportRootInfo> {
  const resolvedPath = path.resolve(targetPathInput);

  let targetSceneFilePath: string | undefined;
  let startDir = resolvedPath;

  // Check if input is directly a .unity scene file or any file
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    targetSceneFilePath = resolvedPath;
    startDir = path.dirname(resolvedPath);
  }

  // Traversal to find Assets or ExportedProject/Assets
  let current = startDir;
  let assetsDir: string | undefined;
  let exportRootDir: string | undefined;

  while (current && current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, 'ExportedProject', 'Assets'))) {
      exportRootDir = current;
      assetsDir = path.join(current, 'ExportedProject', 'Assets');
      break;
    }
    if (fs.existsSync(path.join(current, 'Assets'))) {
      exportRootDir = current;
      assetsDir = path.join(current, 'Assets');
      break;
    }
    // Check if current directory itself is 'Assets'
    if (path.basename(current) === 'Assets') {
      assetsDir = current;
      exportRootDir = path.dirname(current);
      break;
    }
    current = path.dirname(current);
  }

  if (!assetsDir) {
    // Check subdirectories if pointing to parent folder
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('AssetRipper_export_')) {
          const fullSub = path.join(resolvedPath, entry.name);
          if (fs.existsSync(path.join(fullSub, 'ExportedProject', 'Assets'))) {
            exportRootDir = fullSub;
            assetsDir = path.join(fullSub, 'ExportedProject', 'Assets');
            break;
          }
        }
      }
    }
  }

  if (!assetsDir || !exportRootDir) {
    throw new Error(`Could not locate Assets or ExportedProject/Assets directory from ${targetPathInput}`);
  }

  const auxDir = path.join(exportRootDir, 'AuxiliaryFiles');
  const pathIdMap = path.join(auxDir, 'path_id_map.json');
  const guidIndex = await buildGuidIndexFromDir(assetsDir);

  return {
    exportRootDir,
    assetsDir,
    sceneFilePath: targetSceneFilePath,
    auxiliaryDir: fs.existsSync(auxDir) ? auxDir : undefined,
    pathIdMapPath: fs.existsSync(pathIdMap) ? pathIdMap : undefined,
    guidIndex,
  };
}

export function findSceneFile(info: ExportRootInfo, sceneNameInput?: string): string {
  // If a direct scene file path was provided to findExportRoot, use it directly
  if (info.sceneFilePath && fs.existsSync(info.sceneFilePath)) {
    return info.sceneFilePath;
  }

  const sceneName = sceneNameInput || 'ORGANIZM.unity';

  function search(dir: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = search(full);
        if (found) return found;
      } else if (entry.isFile() && (entry.name === sceneName || entry.name.toLowerCase() === sceneName.toLowerCase())) {
        return full;
      }
    }
    return null;
  }

  const found = search(info.assetsDir);
  if (!found) {
    throw new Error(`Scene file '${sceneName}' not found under ${info.assetsDir}`);
  }
  return found;
}
