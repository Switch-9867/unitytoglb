import { describe, it, expect } from 'vitest';
import {
  convertPosition,
  convertVector,
  convertTangent,
  convertRotation,
  convertScale,
  convertUV,
  reverseTriangleWinding,
  computeMinMax3D,
} from '../../src/convert/coords.js';

describe('Coordinate Conversion Math (AssetRipper X-Flip)', () => {
  it('converts position by negating X axis', () => {
    expect(convertPosition({ x: 1, y: 2, z: 3 })).toEqual({ x: -1, y: 2, z: 3 });
    expect(convertPosition({ x: -5, y: 0, z: 0 })).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('converts vector by negating X axis', () => {
    expect(convertVector({ x: 1, y: 0, z: 0 })).toEqual({ x: -1, y: 0, z: 0 });
    expect(convertVector({ x: 0, y: 1, z: 0 })).toEqual({ x: -0, y: 1, z: 0 });
  });

  it('converts tangent by negating X and inverting w', () => {
    expect(convertTangent({ x: 1, y: 0, z: 0, w: 1 })).toEqual({ x: -1, y: 0, z: 0, w: -1 });
    expect(convertTangent({ x: -0.5, y: 1, z: 0.5, w: -1 })).toEqual({ x: 0.5, y: 1, z: 0.5, w: 1 });
  });

  it('converts rotation quaternion matching AssetRipper formula', () => {
    expect(convertRotation({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 })).toEqual({ x: 0.1, y: -0.2, z: -0.3, w: 0.9 });
  });

  it('preserves scale unchanged', () => {
    expect(convertScale({ x: 2, y: 3, z: 4 })).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('flips UV origin V axis', () => {
    expect(convertUV(0, 0)).toEqual({ u: 0, v: 1 });
    expect(convertUV(0.5, 0.25)).toEqual({ u: 0.5, v: 0.75 });
    expect(convertUV(1, 1)).toEqual({ u: 1, v: 0 });
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
