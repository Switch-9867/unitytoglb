import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Document } from '@gltf-transform/core';
import { parseSourceMesh, extractChannelFloat32 } from '../../src/parse/mesh.js';
import { createGltfMesh } from '../../src/convert/geometry.js';
import { createTRSMatrix, invertMatrix } from '../../src/convert/matrix.js';

const MESH_PATH = path.resolve('AssetRipper_export_20260811_145909/ExportedProject/Assets/Mesh/15_ki_coll.asset');
const MESH_GUID = 'testmeshguid123456789012345678';

describe('static-batch bake through a mirroring transform', () => {
  it('keeps faces and normals pointing outward', () => {
    const source = parseSourceMesh(fs.readFileSync(MESH_PATH, 'utf8'), MESH_GUID);
    const doc = new Document();
    const buffer = doc.createBuffer();

    // World matrix of a mirrored object (scale -1 on X); static batching bakes its inverse.
    const world = createTRSMatrix({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: -1, y: 1, z: 1 });
    const inverse = invertMatrix(world)!;
    const identity = createTRSMatrix({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 1, z: 1 });

    const plain = createGltfMesh(doc, buffer, source, [], undefined, identity).listPrimitives()[0];
    const mirrored = createGltfMesh(doc, buffer, source, [], undefined, inverse).listPrimitives()[0];

    // Normals: true inverse-transpose of diag(-1,1,1) is diag(-1,1,1); then Unity->glTF flips Z.
    const srcN = extractChannelFloat32(source.vertexData, 1)!;
    const n = mirrored.getAttribute('NORMAL')!.getArray()!;
    for (let i = 0; i < n.length; i += 3) {
      expect(n[i]).toBeCloseTo(-srcN[i], 5);
      expect(n[i + 1]).toBeCloseTo(srcN[i + 1], 5);
      expect(n[i + 2]).toBeCloseTo(-srcN[i + 2], 5);
    }

    // Winding: the mirroring bake cancels the handedness reversal applied to the plain mesh.
    const pi = plain.getIndices()!.getArray()!;
    const mi = mirrored.getIndices()!.getArray()!;
    for (let t = 0; t < pi.length; t += 3) {
      expect([mi[t], mi[t + 1], mi[t + 2]]).toEqual([pi[t + 2], pi[t + 1], pi[t]]);
    }

    // Tangent handedness flips with the mirror.
    const pt = plain.getAttribute('TANGENT')?.getArray();
    const mt = mirrored.getAttribute('TANGENT')?.getArray();
    if (pt && mt) {
      for (let i = 3; i < pt.length; i += 4) expect(mt[i]).toBe(-pt[i]);
    }
  });
});
