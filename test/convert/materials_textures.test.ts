import { describe, it, expect } from 'vitest';
import { Document } from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import { createGltfMaterial } from '../../src/convert/materials.js';
import { SourceMaterial } from '../../src/model/types.js';

describe('Milestone 5: Materials & Texture Mapping', () => {
  it('converts SourceMaterial PBR properties into glTF Material', () => {
    const doc = new Document();
    const sourceMat: SourceMaterial = {
      name: 'CustomPbrMat',
      shaderRef: null,
      shaderKeywords: ['_EMISSION', '_NORMALMAP'],
      lightmapFlags: 0,
      customRenderQueue: 2000,
      doubleSidedGI: true,
      texEnvs: {},
      floats: {
        _Metallic: 0.8,
        _Glossiness: 0.6,
        _Mode: 0,
      },
      colors: {
        _Color: { r: 0.9, g: 0.2, b: 0.1, a: 1.0 },
        _EmissionColor: { r: 0.5, g: 0.5, b: 0.0, a: 1.0 },
      },
      stringTags: {},
    };

    const mat = createGltfMaterial(doc, sourceMat);

    expect(mat.getName()).toBe('CustomPbrMat');
    expect(mat.getBaseColorFactor()).toEqual([0.9, 0.2, 0.1, 1.0]);
    expect(mat.getMetallicFactor()).toBe(0.8);
    expect(mat.getRoughnessFactor()).toBeCloseTo(0.4, 5);
    expect(mat.getEmissiveFactor()).toEqual([0.5, 0.5, 0.0]);
    expect(mat.getDoubleSided()).toBe(true);
  });

  it('supports cutout and blend alpha modes', () => {
    const doc = new Document();
    const cutoutMat: SourceMaterial = {
      name: 'FoliageMat',
      shaderRef: null,
      shaderKeywords: [],
      lightmapFlags: 0,
      customRenderQueue: 2450,
      doubleSidedGI: false,
      texEnvs: {},
      floats: { _Mode: 1, _Cutoff: 0.35 },
      colors: {},
      stringTags: {},
    };

    const mat = createGltfMaterial(doc, cutoutMat);
    expect(mat.getAlphaMode()).toBe('MASK');
    expect(mat.getAlphaCutoff()).toBe(0.35);
  });

  it('preserves distinct untextured materials without deduplicating them', async () => {
    const { convertSourceBundleToGltf, processDocumentOptimizations } = await import('../../src/convert/convert.js');
    const { SourceBundle } = await import('../../src/convert/convert.js');
    const { createBuiltinPrimitiveMesh } = await import('../../src/parse/builtinPrimitives.js');

    const doc = new Document();
    const mesh = createBuiltinPrimitiveMesh(10202); // Cube

    // Two distinct materials with identical numeric values and NO textures
    const mat1: SourceMaterial = {
      name: 'UntexturedMat_A',
      guid: 'guid_mat_a',
      shaderRef: null,
      shaderKeywords: [],
      lightmapFlags: 0,
      customRenderQueue: -1,
      doubleSidedGI: false,
      texEnvs: {},
      floats: { _Metallic: 0, _Glossiness: 0.5 },
      colors: { _Color: { r: 1, g: 1, b: 1, a: 1 } },
      stringTags: {},
    };

    const mat2: SourceMaterial = {
      name: 'UntexturedMat_B',
      guid: 'guid_mat_b',
      shaderRef: null,
      shaderKeywords: [],
      lightmapFlags: 0,
      customRenderQueue: -1,
      doubleSidedGI: false,
      texEnvs: {},
      floats: { _Metallic: 0, _Glossiness: 0.5 },
      colors: { _Color: { r: 1, g: 1, b: 1, a: 1 } },
      stringTags: {},
    };

    const bundle: SourceBundle = {
      scene: {
        name: 'TestScene',
        nodes: new Map([
          [
            1,
            {
              fileID: 1,
              gameObjectFileId: 10,
              name: 'Node1',
              layer: 0,
              tag: 'Untagged',
              active: true,
              staticFlags: 0,
              localPosition: { x: 0, y: 0, z: 0 },
              localRotation: { x: 0, y: 0, z: 0, w: 1 },
              localScale: { x: 1, y: 1, z: 1 },
              parentFileId: null,
              childFileIds: [],
              rootOrder: 0,
              componentFileIds: [21],
            },
          ],
          [
            2,
            {
              fileID: 2,
              gameObjectFileId: 20,
              name: 'Node2',
              layer: 0,
              tag: 'Untagged',
              active: true,
              staticFlags: 0,
              localPosition: { x: 1, y: 0, z: 0 },
              localRotation: { x: 0, y: 0, z: 0, w: 1 },
              localScale: { x: 1, y: 1, z: 1 },
              parentFileId: null,
              childFileIds: [],
              rootOrder: 1,
              componentFileIds: [22],
            },
          ],
          [
            3,
            {
              fileID: 3,
              gameObjectFileId: 30,
              name: 'Node3',
              layer: 0,
              tag: 'Untagged',
              active: true,
              staticFlags: 0,
              localPosition: { x: 2, y: 0, z: 0 },
              localRotation: { x: 0, y: 0, z: 0, w: 1 },
              localScale: { x: 1, y: 1, z: 1 },
              parentFileId: null,
              childFileIds: [],
              rootOrder: 2,
              componentFileIds: [23],
            },
          ],
        ]),
        gameObjectToNode: new Map(),
        rootNodeFileIds: [1, 2, 3],
        cameras: [],
        lights: [],
        renderers: [
          // Renderer 1 uses mat1
          {
            fileID: 21,
            nodeFileId: 1,
            kind: 'mesh',
            meshGuid: 'cube_mesh',
            materialRefs: [{ fileID: 2100000, guid: 'guid_mat_a', type: 2 }],
            castShadows: true,
            receiveShadows: true,
            lightmapIndex: -1,
            isStatic: false,
          },
          // Renderer 2 also uses mat1 (shared material duplicate)
          {
            fileID: 22,
            nodeFileId: 2,
            kind: 'mesh',
            meshGuid: 'cube_mesh',
            materialRefs: [{ fileID: 2100000, guid: 'guid_mat_a', type: 2 }],
            castShadows: true,
            receiveShadows: true,
            lightmapIndex: -1,
            isStatic: false,
          },
          // Renderer 3 uses mat2 (distinct material, but same numeric properties)
          {
            fileID: 23,
            nodeFileId: 3,
            kind: 'mesh',
            meshGuid: 'cube_mesh',
            materialRefs: [{ fileID: 2100000, guid: 'guid_mat_b', type: 2 }],
            castShadows: true,
            receiveShadows: true,
            lightmapIndex: -1,
            isStatic: false,
          },
        ],
        meshFilters: [],
        colliders: [],
        rigidbodies: [],
        audioSources: [],
        animators: [],
        behaviours: [],
        settings: {},
      },
      meshes: new Map([['cube_mesh', mesh]]),
      materials: new Map([
        ['guid_mat_a', mat1],
        ['guid_mat_b', mat2],
      ]),
    };

    const outDoc = convertSourceBundleToGltf(bundle);

    // Initial check: 2 materials created
    const matsBefore = outDoc.getRoot().listMaterials();
    expect(matsBefore.length).toBe(2);

    // Renderer 1 and 2 share the exact same material instance
    const mesh1 = outDoc.getRoot().listMeshes()[0]; // for mat1
    const mesh2 = outDoc.getRoot().listMeshes()[1]; // for mat2
    expect(mesh1.listPrimitives()[0].getMaterial()?.getName()).toBe('UntexturedMat_A');
    expect(mesh2.listPrimitives()[0].getMaterial()?.getName()).toBe('UntexturedMat_B');

    // Run optimization (dedup + prune)
    await processDocumentOptimizations(outDoc);

    // Both distinct materials must be preserved!
    const matsAfter = outDoc.getRoot().listMaterials();
    expect(matsAfter.length).toBe(2);
    expect(matsAfter.map((m) => m.getName()).sort()).toEqual(['UntexturedMat_A', 'UntexturedMat_B']);
  });

  it('correctly parses materials with empty or non-string m_ShaderKeywords', async () => {
    const { parseSourceMaterial } = await import('../../src/parse/material.js');
    const yaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  m_Name: EmptyKeywordsMat
  m_Shader: {fileID: 4800000, guid: someguid, type: 3}
  m_ShaderKeywords:
  m_SavedProperties:
    m_Floats:
      _Metallic: 0.2
    m_Colors:
      _Color: {r: 0.5, g: 0.5, b: 0.5, a: 1}
`;

    const parsed = parseSourceMaterial(yaml, 'someguid');
    expect(parsed.name).toBe('EmptyKeywordsMat');
    expect(parsed.shaderKeywords).toEqual([]);
    expect(parsed.floats['_Metallic']).toBe(0.2);
  });
});
