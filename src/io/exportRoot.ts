// Locates AssetRipper export root, Assets directory, path_id_map, and scene files.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildGuidIndexFromDir, GuidIndex } from './guidIndex.js';

export interface ExportRootInfo {
  exportRootDir: string;
  assetsDir: string;
  auxiliaryDir?: string;
  pathIdMapPath?: string;
  guidIndex: GuidIndex;
}

let cachedRootPromise: Promise<ExportRootInfo> | null = null;

export async function findExportRoot(startDir: string): Promise<ExportRootInfo> {
  if (cachedRootPromise) {
    return cachedRootPromise;
  }
  cachedRootPromise = (async () => {
    let current = path.resolve(startDir);

    if (fs.existsSync(path.join(current, 'ExportedProject', 'Assets'))) {
      const assetsDir = path.join(current, 'ExportedProject', 'Assets');
      const auxDir = path.join(current, 'AuxiliaryFiles');
      const pathIdMap = path.join(auxDir, 'path_id_map.json');
      const guidIndex = await buildGuidIndexFromDir(assetsDir);
      return {
        exportRootDir: current,
        assetsDir,
        auxiliaryDir: fs.existsSync(auxDir) ? auxDir : undefined,
        pathIdMapPath: fs.existsSync(pathIdMap) ? pathIdMap : undefined,
        guidIndex,
      };
    }

    if (fs.existsSync(current)) {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('AssetRipper_export_')) {
          const fullSub = path.join(current, entry.name);
          if (fs.existsSync(path.join(fullSub, 'ExportedProject', 'Assets'))) {
            return findExportRoot(fullSub);
          }
        }
      }
    }

    if (fs.existsSync(path.join(current, 'Assets'))) {
      const assetsDir = path.join(current, 'Assets');
      const guidIndex = await buildGuidIndexFromDir(assetsDir);
      return {
        exportRootDir: current,
        assetsDir,
        guidIndex,
      };
    }

    throw new Error(`Could not locate ExportedProject/Assets in ${startDir}`);
  })();

  return cachedRootPromise;
}

export function findSceneFile(info: ExportRootInfo, sceneName: string = 'ORGANIZM.unity'): string {
  function search(dir: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = search(full);
        if (found) return found;
      } else if (entry.isFile() && entry.name === sceneName) {
        return full;
      }
    }
    return null;
  }

  const found = search(info.assetsDir);
  if (!found) {
    throw new Error(`Scene file ${sceneName} not found under ${info.assetsDir}`);
  }
  return found;
}
