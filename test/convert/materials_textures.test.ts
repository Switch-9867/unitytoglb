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
});
