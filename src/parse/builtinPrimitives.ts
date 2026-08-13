// Procedural generator for Unity built-in primitive meshes
// Handles fileID 10202 (Cube), 10209 (Plane), 10210 (Quad), 10207 (Sphere), 10206 (Cylinder), 10208 (Capsule)

import { SourceMesh, SubMesh, VertexData, VertexChannel } from '../model/types.js';

export function isBuiltinMeshGuid(guid?: string): boolean {
  return guid === '0000000000000000e000000000000000';
}

export function createBuiltinPrimitiveMesh(fileID: number): SourceMesh {
  switch (fileID) {
    case 10202: // Cube
      return createCubeMesh();
    case 10209: // Plane
      return createPlaneMesh();
    case 10210: // Quad
      return createQuadMesh();
    case 10207: // Sphere
      return createSphereMesh();
    case 10206: // Cylinder
    case 10208: // Capsule
      return createCylinderMesh();
    default:
      return createCubeMesh();
  }
}

function createCubeMesh(): SourceMesh {
  // Unity Unit Cube centered at (0,0,0), extents [-0.5, 0.5]
  const p = 0.5;
  const n = -0.5;

  // 24 vertices (4 per face)
  const positions = new Float32Array([
    // Front (+Z)
    n, n, p,  p, n, p,  p, p, p,  n, p, p,
    // Back (-Z)
    p, n, n,  n, n, n,  n, p, n,  p, p, n,
    // Top (+Y)
    n, p, p,  p, p, p,  p, p, n,  n, p, n,
    // Bottom (-Y)
    n, n, n,  p, n, n,  p, n, p,  n, n, p,
    // Right (+X)
    p, n, p,  p, n, n,  p, p, n,  p, p, p,
    // Left (-X)
    n, n, n,  n, n, p,  n, p, p,  n, p, n,
  ]);

  const normals = new Float32Array([
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);

  const indices = new Uint16Array([
    0, 1, 2,  0, 2, 3,    // Front
    4, 5, 6,  4, 6, 7,    // Back
    8, 9, 10, 8, 10, 11,  // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23  // Left
  ]);

  return buildSourceMeshFromArrays('Cube', positions, normals, uvs, indices);
}

function createPlaneMesh(): SourceMesh {
  // Unity 10x10 plane on XZ from -5 to +5 (11x11 vertices = 121 vertices, 10x10x2 = 200 triangles = 600 indices)
  const size = 10;
  const segments = 10;
  const half = size / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let z = 0; z <= segments; z++) {
    const vz = (z / segments) * size - half;
    const v = z / segments;

    for (let x = 0; x <= segments; x++) {
      const vx = (x / segments) * size - half;
      const u = x / segments;

      positions.push(vx, 0, vz);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }

  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const row1 = z * (segments + 1);
      const row2 = (z + 1) * (segments + 1);

      indices.push(row1 + x, row2 + x, row1 + x + 1);
      indices.push(row1 + x + 1, row2 + x, row2 + x + 1);
    }
  }

  return buildSourceMeshFromArrays('Plane', new Float32Array(positions), new Float32Array(normals), new Float32Array(uvs), new Uint16Array(indices));
}

function createQuadMesh(): SourceMesh {
  // Unity 1x1 Quad on XY from -0.5 to +0.5
  const positions = new Float32Array([
    -0.5, -0.5, 0,
     0.5, -0.5, 0,
     0.5,  0.5, 0,
    -0.5,  0.5, 0,
  ]);

  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);

  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]);

  const indices = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
  ]);

  return buildSourceMeshFromArrays('Quad', positions, normals, uvs, indices);
}

function createSphereMesh(): SourceMesh {
  const radius = 0.5;
  const segments = 16;
  const rings = 16;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;

      const x = Math.cos(theta) * Math.sin(phi);
      const y = Math.cos(phi);
      const z = Math.sin(theta) * Math.sin(phi);

      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const first = r * (segments + 1) + s;
      const second = first + segments + 1;

      indices.push(first, second, first + 1);
      indices.push(first + 1, second, second + 1);
    }
  }

  return buildSourceMeshFromArrays('Sphere', new Float32Array(positions), new Float32Array(normals), new Float32Array(uvs), new Uint16Array(indices));
}

function createCylinderMesh(): SourceMesh {
  const radius = 0.5;
  const height = 2.0;
  const segments = 20;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfH = height / 2;

  // Side vertices
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = u * Math.PI * 2;
    const x = Math.cos(theta);
    const z = Math.sin(theta);

    positions.push(x * radius, -halfH, z * radius);
    normals.push(x, 0, z);
    uvs.push(u, 0);

    positions.push(x * radius, halfH, z * radius);
    normals.push(x, 0, z);
    uvs.push(u, 1);
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 2, base + 1, base + 3);
  }

  return buildSourceMeshFromArrays('Cylinder', new Float32Array(positions), new Float32Array(normals), new Float32Array(uvs), new Uint16Array(indices));
}

function buildSourceMeshFromArrays(
  name: string,
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array
): SourceMesh {
  const vertexCount = Math.floor(positions.length / 3);

  // Interleave into single stream 0 buffer
  // Format: Pos (Float32x3 = 12B), Norm (Float32x3 = 12B), UV (Float32x2 = 8B) => Stride = 32B
  const strideBytes = 32;
  const data = new Uint8Array(vertexCount * strideBytes);
  const view = new DataView(data.buffer);

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * strideBytes;

    // Position
    view.setFloat32(offset + 0, positions[i * 3 + 0], true);
    view.setFloat32(offset + 4, positions[i * 3 + 1], true);
    view.setFloat32(offset + 8, positions[i * 3 + 2], true);

    // Normal
    view.setFloat32(offset + 12, normals[i * 3 + 0], true);
    view.setFloat32(offset + 16, normals[i * 3 + 1], true);
    view.setFloat32(offset + 20, normals[i * 3 + 2], true);

    // UV
    view.setFloat32(offset + 24, uvs[i * 2 + 0], true);
    view.setFloat32(offset + 28, uvs[i * 2 + 1], true);
  }

  const channels: VertexChannel[] = [
    { semantic: 0, stream: 0, offset: 0, format: 'Float32', formatCode: 0, dimension: 3, sizeBytes: 12 },
    { semantic: 1, stream: 0, offset: 12, format: 'Float32', formatCode: 0, dimension: 3, sizeBytes: 12 },
    { semantic: 4, stream: 0, offset: 24, format: 'Float32', formatCode: 0, dimension: 2, sizeBytes: 8 },
  ];

  const vertexData: VertexData = {
    vertexCount,
    strideBytes,
    channels,
    data,
    streams: [{ streamIndex: 0, strideBytes, offsetBytes: 0 }],
  };

  const indexBytes = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);

  const subMesh: SubMesh = {
    topology: 0,
    firstByte: 0,
    indexCount: indices.length,
    baseVertex: 0,
    firstVertex: 0,
    vertexCount,
  };

  return {
    name,
    subMeshes: [subMesh],
    indexFormat: 'uint16',
    indexBytes,
    vertexData,
    hasShapes: false,
    hasSkin: false,
  };
}
