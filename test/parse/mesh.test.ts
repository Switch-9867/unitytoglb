import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseSourceMesh,
  extractChannelFloat32,
  extractSubmeshIndices,
  float16ToFloat32,
  hexToBytes,
} from '../../src/parse/mesh.js';

describe('Mesh Parser & Channel Decoder', () => {
  it('converts Float16 (half precision) to Float32 correctly', () => {
    expect(float16ToFloat32(0x0000)).toBe(0);
    expect(float16ToFloat32(0x3c00)).toBe(1);
    expect(float16ToFloat32(0xbc00)).toBe(-1);
    expect(float16ToFloat32(0x3800)).toBe(0.5);
    expect(float16ToFloat32(0xc000)).toBe(-2);
  });

  it('decodes hex bytes correctly', () => {
    const bytes = hexToBytes('010203ff');
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 255]));
  });

  it('parses real 15_ki_coll.asset mesh file completely', () => {
    const meshPath = path.resolve('AssetRipper_export_20260811_145909/ExportedProject/Assets/Mesh/15_ki_coll.asset');
    expect(fs.existsSync(meshPath)).toBe(true);

    const content = fs.readFileSync(meshPath, 'utf8');
    const mesh = parseSourceMesh(content, 'test-mesh-guid');

    expect(mesh.name).toBe('15_ki_coll');
    expect(mesh.guid).toBe('test-mesh-guid');
    expect(mesh.subMeshes).toHaveLength(1);
    expect(mesh.subMeshes[0].indexCount).toBe(36);
    expect(mesh.subMeshes[0].vertexCount).toBe(24);
    expect(mesh.vertexData.vertexCount).toBe(24);
    expect(mesh.vertexData.strideBytes).toBe(48);

    // Extract POSITION (semantic 0)
    const positions = extractChannelFloat32(mesh.vertexData, 0);
    expect(positions).not.toBeNull();
    expect(positions!).toHaveLength(24 * 3); // 24 vertices, Vec3

    // First position check (little-endian float32)
    // Validate positions are finite numbers
    for (let i = 0; i < positions!.length; i++) {
      expect(Number.isFinite(positions![i])).toBe(true);
    }

    // Extract NORMALS (semantic 1)
    const normals = extractChannelFloat32(mesh.vertexData, 1);
    expect(normals).not.toBeNull();
    expect(normals!).toHaveLength(24 * 3);

    // Extract TANGENTS (semantic 2)
    const tangents = extractChannelFloat32(mesh.vertexData, 2);
    expect(tangents).not.toBeNull();
    expect(tangents!).toHaveLength(24 * 4); // Vec4 (xyz + handedness w)

    // Extract UV0 (semantic 4)
    const uv0 = extractChannelFloat32(mesh.vertexData, 4);
    expect(uv0).not.toBeNull();
    expect(uv0!).toHaveLength(24 * 2); // Vec2

    // Extract Indices
    const indices = extractSubmeshIndices(mesh, 0);
    expect(indices).toHaveLength(36);
    expect(mesh.indexFormat).toBe('uint16');
  });
});
