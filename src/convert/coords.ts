// Pure coordinate, unit, rotation, winding, and convention transformations
// Preserves exact local TRS coordinates from Unity scene graph

import { Vec3, Quat, Vec4 } from '../model/types.js';

/**
 * Position conversion: Preserves exact local position coordinates.
 * p' = (p.x, p.y, p.z)
 */
export function convertPosition(p: Vec3): Vec3 {
  return { x: p.x || 0, y: p.y || 0, z: p.z || 0 };
}

/**
 * Normal / Direction vector conversion & normalize.
 * n' = (n.x, n.y, n.z)
 */
export function convertVector(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1.0;
  return { x: (v.x / len) || 0, y: (v.y / len) || 0, z: (v.z / len) || 0 };
}

/**
 * Tangent conversion: normalize (x,y,z) and clamp handedness w to +/-1.
 */
export function convertTangent(t: Vec4): Vec4 {
  const len = Math.hypot(t.x, t.y, t.z) || 1.0;
  const w = t.w < 0 ? -1.0 : 1.0;
  return { x: (t.x / len) || 0, y: (t.y / len) || 0, z: (t.z / len) || 0, w };
}

/**
 * Quaternion rotation conversion matching exact Unity local rotation.
 * q' = (q.x, q.y, q.z, q.w)
 */
export function convertRotation(q: Quat): Quat {
  return { x: q.x || 0, y: q.y || 0, z: q.z || 0, w: q.w || 0 };
}

/**
 * Local scale: unchanged.
 * s' = (s.x, s.y, s.z)
 */
export function convertScale(s: Vec3): Vec3 {
  return { x: s.x, y: s.y, z: s.z };
}

/**
 * UV coordinate conversion: flip V origin (Unity bottom-left -> glTF top-left).
 * u' = u, v' = 1 - v
 */
export function convertUV(u: number, v: number): { u: number; v: number } {
  return { u: u || 0, v: (1.0 - v) || 0 };
}

/**
 * Reverse triangle index winding order for a list of indices:
 * (i0, i1, i2) -> (i2, i1, i0)
 */
export function reverseTriangleWinding<T extends Uint16Array | Uint32Array>(indices: T): T {
  const result = indices.slice() as T;
  for (let i = 0; i < result.length; i += 3) {
    if (i + 2 < result.length) {
      const tmp = result[i];
      result[i] = result[i + 2];
      result[i + 2] = tmp;
    }
  }
  return result;
}

/**
 * Apply coordinate passthrough to a contiguous Float32Array of positions (3 floats per vertex).
 */
export function convertPositionsArray(positions: Float32Array): Float32Array {
  const result = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    result[i] = positions[i] || 0;
    result[i + 1] = positions[i + 1] || 0;
    result[i + 2] = positions[i + 2] || 0;
  }
  return result;
}

/**
 * Apply strict unit normalization to a contiguous Float32Array of normals (3 floats per vertex).
 */
export function convertNormalsArray(normals: Float32Array): Float32Array {
  const result = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];

    const len = Math.hypot(x, y, z);
    if (len > 1e-6) {
      result[i] = (x / len) || 0;
      result[i + 1] = (y / len) || 0;
      result[i + 2] = (z / len) || 0;
    } else {
      // Fallback for zero or degenerate normal
      result[i] = 0;
      result[i + 1] = 1.0;
      result[i + 2] = 0;
    }
  }
  return result;
}

/**
 * Apply handedness clamp with unit normalization to a contiguous Float32Array of tangents (4 floats per vertex).
 */
export function convertTangentsArray(tangents: Float32Array): Float32Array {
  const result = new Float32Array(tangents.length);
  for (let i = 0; i < tangents.length; i += 4) {
    const x = tangents[i];
    const y = tangents[i + 1];
    const z = tangents[i + 2];
    const rawW = tangents[i + 3];

    const w = rawW < 0 ? -1.0 : 1.0;

    const len = Math.hypot(x, y, z);
    if (len > 1e-6) {
      result[i] = (x / len) || 0;
      result[i + 1] = (y / len) || 0;
      result[i + 2] = (z / len) || 0;
      result[i + 3] = w;
    } else {
      result[i] = 1.0;
      result[i + 1] = 0;
      result[i + 2] = 0;
      result[i + 3] = w;
    }
  }
  return result;
}

/**
 * Apply UV origin flip to a contiguous Float32Array of UVs (2 floats per vertex).
 */
export function convertUVsArray(uvs: Float32Array): Float32Array {
  const result = new Float32Array(uvs.length);
  for (let i = 0; i < uvs.length; i += 2) {
    result[i] = uvs[i] || 0;
    result[i + 1] = (1.0 - uvs[i + 1]) || 0;
  }
  return result;
}

/**
 * Compute accessor min/max arrays from converted 3D position data.
 */
export function computeMinMax3D(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;

    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}
