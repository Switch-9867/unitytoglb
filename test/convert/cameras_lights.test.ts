import { describe, it, expect } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRLightsPunctual } from '@gltf-transform/extensions';
import { attachGltfLight } from '../../src/convert/lights.js';
import { attachGltfCamera } from '../../src/convert/cameras.js';
import { SourceLight, SourceCamera } from '../../src/model/types.js';

describe('Milestone 6: Cameras & Lights', () => {
  it('converts SourceCamera into glTF Perspective Camera', () => {
    const doc = new Document();
    const node = doc.createNode('MainCamera');
    const sourceCam: SourceCamera = {
      fileID: 100,
      nodeFileId: 1,
      projection: 'perspective',
      verticalFovDegrees: 60,
      near: 0.1,
      far: 1000,
      backgroundColor: { r: 0, g: 0, b: 0, a: 1 },
      clearFlags: 1,
      viewportRect: { x: 0, y: 0, width: 1, height: 1 },
    };

    attachGltfCamera(doc, node, sourceCam);

    const camera = node.getCamera();
    expect(camera).not.toBeNull();
    expect(camera!.getType()).toBe('perspective');
    expect(camera!.getYFov()).toBeCloseTo((60 * Math.PI) / 180, 5);
    expect(camera!.getZNear()).toBe(0.1);
    expect(camera!.getZFar()).toBe(1000);
  });

  it('converts SourceLight into glTF KHR_lights_punctual Light', async () => {
    const doc = new Document();
    const node = doc.createNode('SunLight');
    const sourceLight: SourceLight = {
      fileID: 200,
      nodeFileId: 1,
      type: 0, // Directional
      color: { r: 1.0, g: 0.9, b: 0.8, a: 1.0 },
      intensity: 2.5,
      range: 50,
      spotAngleDegrees: 30,
      innerSpotAngleDegrees: 20,
      shadowsType: 1,
      cookieGuid: null,
    };

    attachGltfLight(doc, node, sourceLight);

    const ext = node.getExtension<any>('KHR_lights_punctual');
    expect(ext).not.toBeNull();
    expect(ext.getType()).toBe('directional');
    expect(ext.getColor()).toEqual([1.0, 0.9, 0.8]);
    expect(ext.getIntensity()).toBe(2.5);

    // Verify binary serialization with extension registered
    const io = new NodeIO().registerExtensions([KHRLightsPunctual]);
    const glb = await io.writeBinary(doc);
    expect(glb.byteLength).toBeGreaterThan(0);
  });
});
