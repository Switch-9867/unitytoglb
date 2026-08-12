// Pure coordinate, unit, rotation, winding, and convention transformations
// Reimplemented from AssetRipper GlbCoordinateConversion.cs

import { Vec3, Quat, Vec4 } from '../model/types.js';

/**
 * Position conversion: flip X axis.
 * Unity (left-handed, +X right) -> glTF (right-handed, -X right).
 * p' = (-p.x, p.y, p.z)
 */
export function convertPosition(p: Vec3): Vec3 {
  return { x: -p.x, y: p.y, z: p.z };
}

/**
 * Normal / Direction vector conversion: flip X axis.
 * n' = (-n.x, n.y, n.z)
 */
export function convertVector(v: Vec3): Vec3 {
  return { x: -v.x, y: v.y, z: v.z };
}

/**
 * Tangent conversion: flip X axis and invert tangent handedness w.
 * t' = (-t.x, t.y, t.z, -t.w)
 */
export function convertTangent(t: Vec4): Vec4 {
  return { x: -t.x, y: t.y, z: t.z, w: -t.w };
}

/**
 * Quaternion rotation conversion matching AssetRipper GlbCoordinateConversion.ToGltfQuaternionConvert.
 * q' = (q.x, -q.y, -q.z, q.w)
 */
export function convertRotation(q: Quat): Quat {
  return { x: q.x, y: -q.y, z: -q.z, w: q.w };
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
  return { u, v: 1.0 - v };
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
 * Apply X-axis coordinate flip to a contiguous Float32Array of positions (3 floats per vertex).
 */
export function convertPositionsArray(positions: Float32Array): Float32Array {
  const result = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    result[i] = -positions[i];
    result[i + 1] = positions[i + 1];
    result[i + 2] = positions[i + 2];
  }
  return result;
}

/**
 * Apply X-axis coordinate flip to a contiguous Float32Array of normals (3 floats per vertex).
 */
export function convertNormalsArray(normals: Float32Array): Float32Array {
  return convertPositionsArray(normals);
}

/**
 * Apply X-axis & handedness flip to a contiguous Float32Array of tangents (4 floats per vertex).
 */
export function convertTangentsArray(tangents: Float32Array): Float32Array {
  const result = new Float32Array(tangents.length);
  for (let i = 0; i < tangents.length; i += 4) {
    result[i] = -tangents[i];
    result[i + 1] = tangents[i + 1];
    result[i + 2] = tangents[i + 2];
    result[i + 3] = -tangents[i + 3];
  }
  return result;
}

/**
 * Apply UV origin flip to a contiguous Float32Array of UVs (2 floats per vertex).
 */
export function convertUVsArray(uvs: Float32Array): Float32Array {
  const result = new Float32Array(uvs.length);
  for (let i = 0; i < uvs.length; i += 2) {
    result[i] = uvs[i];
    result[i + 1] = 1.0 - uvs[i + 1];
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
