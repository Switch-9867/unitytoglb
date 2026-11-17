import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRTextureTransform, KHRLightsPunctual } from '@gltf-transform/extensions';
import { parseSourceScene } from '../../src/parse/scene.js';
import { parseSourceMesh } from '../../src/parse/mesh.js';
import { parseSourceMaterial } from '../../src/parse/material.js';
import { buildGltfDocument, SourceBundle } from '../../src/convert/convert.js';
import { applyResoniteLayout } from '../../src/convert/resonite.js';

const MESH_GUID = 'testmeshguid123456789012345678';
const COLLISION_ONLY_GUID = 'collisiononlyguid1234567890123';
const MAT_GUID = 'testmatguid1234567890123456789';

function makeBundle(): SourceBundle {
  const scene = parseSourceScene(fs.readFileSync(path.resolve('test/fixtures/sample_scene.unity'), 'utf8'), 'SampleScene');
  const meshYaml = fs.readFileSync(
    path.resolve('AssetRipper_export_20260811_145909/ExportedProject/Assets/Mesh/15_ki_coll.asset'),
    'utf8'
  );
  const mat = parseSourceMaterial(
    `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  m_Name: Painted
  m_Shader: {fileID: 4800000, guid: testshader, type: 3}
  m_SavedProperties:
    m_Floats:
      _Glossiness: 0.25
    m_Colors:
      _Color: {r: 0.8, g: 0.4, b: 0.2, a: 1}
`,
    MAT_GUID
  );

  // 201 = ChildMesh (has the renderer), 301 = Main Camera (no renderer), 101 = RootObject
  scene.colliders.push(
    { fileID: 900, nodeFileId: 201, kind: 'mesh', enabled: true, isTrigger: false, convex: false, materialRef: null, meshRef: { fileID: 4300000, guid: MESH_GUID } },
    { fileID: 901, nodeFileId: 301, kind: 'mesh', enabled: true, isTrigger: true, convex: false, materialRef: null, meshRef: { fileID: 4300000, guid: COLLISION_ONLY_GUID } },
    { fileID: 902, nodeFileId: 101, kind: 'box', enabled: true, isTrigger: false, materialRef: null, center: { x: 1, y: 2, z: 3 }, size: { x: 4, y: 5, z: 6 } }
  );
  scene.lights.push({
    fileID: 903, nodeFileId: 101, type: 2, color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 2, range: 8,
    spotAngleDegrees: 30, innerSpotAngleDegrees: 20, shadowsType: 2, cookieGuid: null, enabled: true, bakeMode: 4,
  });

  return {
    scene,
    meshes: new Map([
      [MESH_GUID, parseSourceMesh(meshYaml, MESH_GUID)],
      [COLLISION_ONLY_GUID, parseSourceMesh(meshYaml, COLLISION_ONLY_GUID)],
    ]),
    materials: new Map([[MAT_GUID, mat]]),
  };
}

describe('Resonite layout', () => {
  it('builds Root/{Assets/{Textures,Materials,Colliders},World} and a matching manifest', async () => {
    const bundle = makeBundle();
    const { doc, ctx } = buildGltfDocument(bundle, { untexturedMaterials: true });
    const manifest = applyResoniteLayout(doc, bundle, ctx, {
      glbFileName: 'SampleScene.glb',
      texturesDirName: 'SampleScene_textures',
      audioDirName: 'SampleScene_audio',
    });

    expect(manifest.importSettings).toMatchObject({ scale: 'meters', grabbable: false, generateColliders: false });

    // Hierarchy
    const [root] = doc.getRoot().listScenes()[0].listChildren();
    expect(root.getName()).toBe('SampleScene');
    expect(root.listChildren().map((n) => n.getName())).toEqual(['Assets', 'World']);
    const [assets, world] = root.listChildren();
    expect(assets.listChildren().map((n) => n.getName())).toEqual(['Textures', 'Materials', 'Colliders']);
    expect(world.listChildren().map((n) => n.getName())).toEqual(['RootObject']);

    // Materials: empty named slot, GLB material renamed to match
    const materialsNode = assets.listChildren()[1];
    expect(materialsNode.listChildren().map((n) => n.getName())).toEqual(['Painted']);
    expect(materialsNode.listChildren()[0].getMesh()).toBeNull();
    expect(manifest.materials).toHaveLength(1);
    expect(manifest.materials[0].slot).toEqual({ path: ['Assets', 'Materials', 'Painted'], indexPath: [0, 1, 0] });
    expect(manifest.materials[0].pbr.smoothness).toBeCloseTo(0.25);
    expect(manifest.renderers).toEqual([
      expect.objectContaining({ slot: { path: ['World', 'RootObject', 'ChildMesh'], indexPath: [1, 0, 0] }, materials: [MAT_GUID] }),
    ]);

    // Colliders: shared mesh -> visible, collision-only mesh -> Assets/Colliders, box center Z flipped
    const collidersNode = assets.listChildren()[2];
    expect(collidersNode.listChildren()).toHaveLength(1);
    expect(collidersNode.listChildren()[0].getMesh()).not.toBeNull();
    expect(manifest.stats.meshCollidersUsingVisibleMesh).toBe(1);
    expect(manifest.stats.collisionOnlyMeshes).toBe(1);

    const [shared, collisionOnly, box] = manifest.colliders;
    expect(shared.mesh).toEqual({ source: 'visible', slot: shared.slot });
    expect(collisionOnly.isTrigger).toBe(true);
    expect(collisionOnly.mesh).toEqual({
      source: 'collider',
      id: COLLISION_ONLY_GUID,
      slot: { path: ['Assets', 'Colliders', '15_ki_coll'], indexPath: [0, 2, 0] },
    });
    expect(box).toMatchObject({ type: 'box', center: [1, 2, -3], unityCenter: [1, 2, 3], resoniteCenter: [-1, 2, -3], size: [4, 5, 6], slot: { path: ['World', 'RootObject'] } });

    // Lights: Unity type 2 = point, also present in the GLB
    expect(manifest.lights).toEqual([
      expect.objectContaining({
        type: 'point', bakeMode: 'realtime', shadows: 'soft', inGlb: true,
        resonite: { intensity: 2, range: 8, flipForward: false, rotationFix: [0, 0, 0, 1] },
      }),
    ]);

    // Empty asset slots survive a GLB round trip
    const io = new NodeIO().registerExtensions([KHRTextureTransform, KHRLightsPunctual]);
    const readBack = await io.readBinary(await io.writeBinary(doc));
    const names = readBack.getRoot().listNodes().map((n) => n.getName());
    expect(names).toEqual(expect.arrayContaining(['Assets', 'Textures', 'Materials', 'Colliders', 'World', 'Painted']));
  });
});
