import { describe, it, expect } from 'vitest';
import {
  convertPosition,
  convertVector,
  convertTangent,
  convertRotation,
  convertScale,
  convertUV,
  convertNormalsArray,
  convertTangentsArray,
  reverseTriangleWinding,
  computeMinMax3D,
} from '../../src/convert/coords.js';

describe('Coordinate Conversion Math (Unity to glTF Z-Reflection)', () => {
  it('flips Z axis for position coordinates', () => {
    expect(convertPosition({ x: -288.9, y: 133.09674, z: 374.4 })).toEqual({ x: -288.9, y: 133.09674, z: -374.4 });
    expect(convertPosition({ x: -16.80175, y: -252.2902, z: -14.66264 })).toEqual({ x: -16.80175, y: -252.2902, z: 14.66264 });
  });

  it('flips Z and normalizes vector', () => {
    expect(convertVector({ x: 2, y: 0, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
    expect(convertVector({ x: 0, y: 0, z: 5 })).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('flips Z and normalizes tangent vector with clamped handedness', () => {
    expect(convertTangent({ x: 2, y: 0, z: 0, w: 1 })).toEqual({ x: 1, y: 0, z: 0, w: -1 });
    expect(convertTangent({ x: -0.5, y: 0, z: 0, w: -1 })).toEqual({ x: -1, y: 0, z: 0, w: 1 });
  });

  it('converts rotation quaternion under Z-reflection', () => {
    expect(convertRotation({ x: -0.7071068, y: 0, z: 0, w: 0.7071068 })).toEqual({ x: 0.7071068, y: 0, z: 0, w: 0.7071068 });
  });

  it('preserves scale unchanged', () => {
    expect(convertScale({ x: 2, y: 3, z: 4 })).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('flips UV origin V axis', () => {
    expect(convertUV(0, 0)).toEqual({ u: 0, v: 1 });
    expect(convertUV(0.5, 0.25)).toEqual({ u: 0.5, v: 0.75 });
    expect(convertUV(1, 1)).toEqual({ u: 1, v: 0 });
  });

  it('normalizes normal arrays correctly with Z reflection', () => {
    const raw = new Float32Array([10, 0, 0, 0, 0, 5]);
    const converted = convertNormalsArray(raw);
    expect(Array.from(converted)).toEqual([1, 0, 0, 0, 0, -1]);
  });

  it('normalizes tangent arrays with strict w handedness', () => {
    const raw = new Float32Array([0, 0, 5, 1]);
    const converted = convertTangentsArray(raw);
    expect(Array.from(converted)).toEqual([0, 0, -1, -1]);
  });

  it('reverses triangle index winding order', () => {
    const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);
    const reversed = reverseTriangleWinding(indices);
    expect(Array.from(reversed)).toEqual([2, 1, 0, 5, 4, 3]);
  });

  it('computes correct 3D min/max for accessors', () => {
    const positions = new Float32Array([1, 2, -3, -4, 5, 6, 0, -1, 2]);
    const { min, max } = computeMinMax3D(positions);
    expect(min).toEqual([-4, -1, -3]);
    expect(max).toEqual([1, 5, 6]);
  });
});
