import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { parseSourceScene } from '../../src/parse/scene.js';
import { parseSourceMesh } from '../../src/parse/mesh.js';
import { parseSourceMaterial } from '../../src/parse/material.js';
import { convertSourceBundleToGltf, convertSourceBundleToGLB, SourceBundle } from '../../src/convert/convert.js';

describe('Vertical Slice (Source -> glTF GLB Conversion)', () => {
  it('converts SourceBundle into valid glTF Document and GLB binary array', async () => {
    // 1. Read sample scene
    const scenePath = path.resolve('test/fixtures/sample_scene.unity');
    const sceneContent = fs.readFileSync(scenePath, 'utf8');
    const scene = parseSourceScene(sceneContent, 'SampleScene');

    // 2. Read sample mesh asset 15_ki_coll.asset
    const meshPath = path.resolve('AssetRipper_export_20260811_145909/ExportedProject/Assets/Mesh/15_ki_coll.asset');
    const meshContent = fs.readFileSync(meshPath, 'utf8');
    const mesh = parseSourceMesh(meshContent, 'testmeshguid123456789012345678');

    // 3. Construct minimal material
    const materialYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  m_Name: DefaultMaterial
  m_Shader: {fileID: 4800000, guid: testshader, type: 3}
  m_SavedProperties:
    m_Floats:
      _Mode: 0
      _Metallic: 0.5
      _Glossiness: 0.8
    m_Colors:
      _Color: {r: 0.8, g: 0.4, b: 0.2, a: 1}
`;
    const mat = parseSourceMaterial(materialYaml, 'testmatguid1234567890123456789');

    const bundle: SourceBundle = {
      scene,
      meshes: new Map([['testmeshguid123456789012345678', mesh]]),
      materials: new Map([['testmatguid1234567890123456789', mat]]),
    };

    // 4. Convert to glTF Document
    const doc = convertSourceBundleToGltf(bundle);

    expect(doc.getRoot().listScenes()).toHaveLength(1);
    expect(doc.getRoot().listNodes()).toHaveLength(3);
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(doc.getRoot().listMaterials()).toHaveLength(1);

    const gltfMat = doc.getRoot().listMaterials()[0];
    expect(gltfMat.getName()).toBe('DefaultMaterial');
    expect(gltfMat.getBaseColorFactor()).toEqual([0.8, 0.4, 0.2, 1]);
    expect(gltfMat.getMetallicFactor()).toBe(0.5);
    expect(gltfMat.getRoughnessFactor()).toBeCloseTo(0.2); // 1 - 0.8

    const gltfMesh = doc.getRoot().listMeshes()[0];
    expect(gltfMesh.getName()).toBe('15_ki_coll');
    expect(gltfMesh.listPrimitives()).toHaveLength(1);

    const primitive = gltfMesh.listPrimitives()[0];
    const posAccessor = primitive.getAttribute('POSITION');
    expect(posAccessor).not.toBeNull();
    expect(posAccessor!.getCount()).toBe(24);

    // Verify GLB serialization
    const glbBytes = await convertSourceBundleToGLB(bundle);
    expect(glbBytes).toBeInstanceOf(Uint8Array);
    expect(glbBytes.byteLength).toBeGreaterThan(100);

    // Verify Header magic "glTF" (0x46546C67)
    const magic = new DataView(glbBytes.buffer, glbBytes.byteOffset, 4).getUint32(0, true);
    expect(magic).toBe(0x46546c67);

    // Validate GLB deserialization back into glTF Document using NodeIO
    const io = new NodeIO();
    const readDoc = await io.readBinary(glbBytes);
    expect(readDoc.getRoot().listScenes()).toHaveLength(1);
    expect(readDoc.getRoot().listNodes()).toHaveLength(3);
    expect(readDoc.getRoot().listMeshes()).toHaveLength(1);
  });
});
