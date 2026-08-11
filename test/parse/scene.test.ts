import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSourceScene } from '../../src/parse/scene.js';

describe('SourceScene Parser', () => {
  it('parses sample_scene.unity into SourceScene with complete hierarchy', () => {
    const fixturePath = path.resolve('test/fixtures/sample_scene.unity');
    const content = fs.readFileSync(fixturePath, 'utf8');

    const scene = parseSourceScene(content, 'SampleScene');

    expect(scene.name).toBe('SampleScene');
    expect(scene.nodes.size).toBe(3); // 3 transforms: 101, 201, 301
    expect(scene.rootNodeFileIds).toEqual([101]);

    const rootNode = scene.nodes.get(101);
    expect(rootNode).toBeDefined();
    expect(rootNode?.name).toBe('RootObject');
    expect(rootNode?.parentFileId).toBeNull();
    expect(rootNode?.childFileIds).toEqual([201, 301]);
    expect(rootNode?.localPosition).toEqual({ x: 1, y: 2, z: 3 });

    const childMeshNode = scene.nodes.get(201);
    expect(childMeshNode).toBeDefined();
    expect(childMeshNode?.name).toBe('ChildMesh');
    expect(childMeshNode?.parentFileId).toBe(101);
    expect(childMeshNode?.localScale).toEqual({ x: 2, y: 2, z: 2 });

    // Renderers & Filters
    expect(scene.renderers).toHaveLength(1);
    const renderer = scene.renderers[0];
    expect(renderer.nodeFileId).toBe(201);
    expect(renderer.meshGuid).toBe('testmeshguid123456789012345678');
    expect(renderer.materialRefs).toHaveLength(1);
    expect(renderer.materialRefs[0].guid).toBe('testmatguid1234567890123456789');

    // Cameras
    expect(scene.cameras).toHaveLength(1);
    const camera = scene.cameras[0];
    expect(camera.nodeFileId).toBe(301);
    expect(camera.verticalFovDegrees).toBe(60);
    expect(camera.near).toBe(0.3);
    expect(camera.far).toBe(1000);

    // Settings
    expect(scene.settings.renderSettings?.fogEnabled).toBe(true);
  });
});
