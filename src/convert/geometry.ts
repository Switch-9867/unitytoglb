// Convert SourceMesh to @gltf-transform/core Mesh, Primitives, and Accessors

import { Document, Buffer, Mesh, Primitive, Material, Accessor } from '@gltf-transform/core';
import { SourceMesh } from '../model/types.js';
import { extractChannelFloat32, extractSubmeshIndices } from '../parse/mesh.js';
import {
  convertPositionsArray,
  convertNormalsArray,
  convertTangentsArray,
  convertUVsArray,
  reverseTriangleWinding,
} from './coords.js';

export interface MeshSubmeshRange {
  firstSubMesh?: number;
  subMeshCount?: number;
}

export function createGltfMesh(
  doc: Document,
  buffer: Buffer,
  sourceMesh: SourceMesh,
  materials?: (Material | null)[],
  submeshRange?: MeshSubmeshRange
): Mesh {
  const meshName = String(sourceMesh.name || 'Mesh');
  const mesh = doc.createMesh(meshName);

  // Shared vertex attribute accessors for the entire mesh across all submeshes
  let posAccessor: Accessor | null = null;
  let normAccessor: Accessor | null = null;
  let tanAccessor: Accessor | null = null;
  let uv0Accessor: Accessor | null = null;

  // 1. POSITION (semantic 0) - Master vertex count for the mesh
  const rawPositions = extractChannelFloat32(sourceMesh.vertexData, 0);
  if (!rawPositions || rawPositions.length < 3) {
    return mesh; // Mesh has no valid position data
  }

  const convertedPositions = convertPositionsArray(rawPositions);
  const vertexCount = Math.floor(convertedPositions.length / 3);
  if (vertexCount === 0) {
    return mesh;
  }

  posAccessor = doc
    .createAccessor()
    .setName(`${meshName}_pos`)
    .setType('VEC3')
    .setArray(convertedPositions)
    .setBuffer(buffer);

  // 2. NORMAL (semantic 1) - Must match master vertexCount per glTF 2.0 spec
  const rawNormals = extractChannelFloat32(sourceMesh.vertexData, 1);
  if (rawNormals && rawNormals.length >= 3) {
    let convertedNormals = convertNormalsArray(rawNormals);
    const targetLength = vertexCount * 3;
    if (convertedNormals.length !== targetLength) {
      const fixedNorms = new Float32Array(targetLength);
      fixedNorms.set(convertedNormals.subarray(0, Math.min(convertedNormals.length, targetLength)));
      convertedNormals = fixedNorms;
    }
    normAccessor = doc
      .createAccessor()
      .setName(`${meshName}_norm`)
      .setType('VEC3')
      .setArray(convertedNormals)
      .setBuffer(buffer);
  }

  // 3. TANGENT (semantic 2) - Must match master vertexCount per glTF 2.0 spec
  const rawTangents = extractChannelFloat32(sourceMesh.vertexData, 2);
  if (rawTangents && rawTangents.length >= 4) {
    let convertedTangents = convertTangentsArray(rawTangents);
    const targetLength = vertexCount * 4;
    if (convertedTangents.length !== targetLength) {
      const fixedTans = new Float32Array(targetLength);
      fixedTans.set(convertedTangents.subarray(0, Math.min(convertedTangents.length, targetLength)));
      convertedTangents = fixedTans;
    }
    tanAccessor = doc
      .createAccessor()
      .setName(`${meshName}_tan`)
      .setType('VEC4')
      .setArray(convertedTangents)
      .setBuffer(buffer);
  }

  // 4. TEXCOORD_0 (semantic 4) - Must match master vertexCount per glTF 2.0 spec
  const rawUV0 = extractChannelFloat32(sourceMesh.vertexData, 4);
  if (rawUV0 && rawUV0.length >= 2) {
    let convertedUV0 = convertUVsArray(rawUV0);
    const targetLength = vertexCount * 2;
    if (convertedUV0.length !== targetLength) {
      const fixedUVs = new Float32Array(targetLength);
      fixedUVs.set(convertedUV0.subarray(0, Math.min(convertedUV0.length, targetLength)));
      convertedUV0 = fixedUVs;
    }
    uv0Accessor = doc
      .createAccessor()
      .setName(`${meshName}_uv0`)
      .setType('VEC2')
      .setArray(convertedUV0)
      .setBuffer(buffer);
  }

  // Determine submesh range (support Unity static batching submesh slicing)
  const startSub = submeshRange?.firstSubMesh ?? 0;
  const countSub = submeshRange?.subMeshCount && submeshRange.subMeshCount > 0
    ? submeshRange.subMeshCount
    : sourceMesh.subMeshes.length - startSub;

  const endSub = Math.min(sourceMesh.subMeshes.length, startSub + countSub);

  // Create primitive per submesh sharing the vertex accessors
  for (let subIdx = startSub; subIdx < endSub; subIdx++) {
    const rawIndices = extractSubmeshIndices(sourceMesh, subIdx);
    if (!rawIndices || rawIndices.length < 3) {
      continue; // Skip empty submeshes with < 3 indices
    }

    const primitive = doc.createPrimitive();

    primitive.setAttribute('POSITION', posAccessor);
    if (normAccessor) primitive.setAttribute('NORMAL', normAccessor);
    if (tanAccessor) primitive.setAttribute('TANGENT', tanAccessor);
    if (uv0Accessor) primitive.setAttribute('TEXCOORD_0', uv0Accessor);

    // Raw indices with winding order reversal for glTF right-handed space
    const reversedIndices = reverseTriangleWinding(rawIndices);
    const indexAccessor = doc
      .createAccessor()
      .setName(`${meshName}_indices_${subIdx}`)
      .setType('SCALAR')
      .setArray(reversedIndices)
      .setBuffer(buffer);

    primitive.setIndices(indexAccessor);
    primitive.setMode(Primitive.Mode.TRIANGLES);

    // Attach material if provided for submesh (index relative to startSub)
    const matIndex = subIdx - startSub;
    if (materials && materials[matIndex]) {
      primitive.setMaterial(materials[matIndex]!);
    }

    mesh.addPrimitive(primitive);
  }

  return mesh;
}
