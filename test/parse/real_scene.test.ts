import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSourceScene } from '../../src/parse/scene.js';
import { findExportRoot, findSceneFile } from '../../src/io/exportRoot.js';

describe('Real Scene Parser Integration', () => {
  it('parses ORGANIZM.unity export with thousands of nodes', async () => {
    const cwd = process.cwd();
    const exportRoot = await findExportRoot(cwd);
    const scenePath = findSceneFile(exportRoot, 'ORGANIZM.unity');

    expect(fs.existsSync(scenePath)).toBe(true);

    const content = fs.readFileSync(scenePath, 'utf8');
    const scene = parseSourceScene(content, 'ORGANIZM');

    expect(scene.name).toBe('ORGANIZM');
    // Verify count of nodes, renderers, cameras, lights per SOURCE_FORMAT.md
    expect(scene.nodes.size).toBeGreaterThan(4000);
    expect(scene.renderers.length).toBeGreaterThan(3000);
    expect(scene.cameras.length).toBe(5);
    expect(scene.lights.length).toBe(10);
    expect(scene.rootNodeFileIds.length).toBeGreaterThan(0);

    // Assert every node has valid localPosition, localRotation, localScale
    for (const node of scene.nodes.values()) {
      expect(node.localPosition.x).toBeTypeOf('number');
      expect(node.localRotation.w).toBeTypeOf('number');
      expect(node.localScale.x).toBeTypeOf('number');
    }
  });
});
