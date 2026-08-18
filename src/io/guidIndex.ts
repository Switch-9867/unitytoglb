// Build GUID index mapping from Unity asset .meta files with disk caching

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GuidEntry {
  guid: string;
  assetPath: string;
  metaPath: string;
  classId?: number;
  mainFileId?: number;
}

export class GuidIndex {
  private index = new Map<string, GuidEntry>();

  public addEntry(entry: GuidEntry): void {
    this.index.set(entry.guid, entry);
  }

  public get(guid: string): GuidEntry | undefined {
    return this.index.get(guid);
  }

  public has(guid: string): boolean {
    return this.index.has(guid);
  }

  public size(): number {
    return this.index.size;
  }

  public entries(): IterableIterator<[string, GuidEntry]> {
    return this.index.entries();
  }

  public toJSON(): Record<string, GuidEntry> {
    const obj: Record<string, GuidEntry> = {};
    for (const [guid, entry] of this.index.entries()) {
      obj[guid] = entry;
    }
    return obj;
  }

  public fromJSON(data: Record<string, GuidEntry>): void {
    for (const [guid, entry] of Object.entries(data)) {
      this.index.set(guid, entry);
    }
  }
}

/**
 * Extract GUID string from a .meta file content using fast prefix search.
 */
export function parseGuidFromMeta(metaContent: string): string | null {
  const lines = metaContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('guid:')) {
      const g = line.slice(5).trim();
      if (g.length >= 32) {
        return g.slice(0, 32);
      }
    }
  }
  return null;
}

/**
 * Recursively scan directory for .meta files and construct GuidIndex (with disk cache).
 */
export async function buildGuidIndexFromDir(rootDir: string): Promise<GuidIndex> {
  const index = new GuidIndex();
  const cachePath = path.join(rootDir, '.guid_cache.json');

  if (fs.existsSync(cachePath)) {
    try {
      const cacheContent = fs.readFileSync(cachePath, 'utf8');
      const data = JSON.parse(cacheContent);
      index.fromJSON(data);
      return index;
    } catch {
      // cache corrupted, fall through to re-scan
    }
  }

  function scan(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.meta')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const guid = parseGuidFromMeta(content);
          if (guid) {
            const assetPath = fullPath.slice(0, -5);
            if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
              index.addEntry({
                guid,
                assetPath,
                metaPath: fullPath,
              });
            }
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  scan(rootDir);

  try {
    fs.writeFileSync(cachePath, JSON.stringify(index.toJSON(), null, 2), 'utf8');
  } catch {
    // ignore cache write failures
  }

  return index;
}
