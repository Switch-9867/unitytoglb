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

export function createGltfMesh(
  doc: Document,
  buffer: Buffer,
  sourceMesh: SourceMesh,
  materials?: (Material | null)[]
): Mesh {
  const meshName = String(sourceMesh.name || 'Mesh');
  const mesh = doc.createMesh(meshName);

  // Shared vertex attribute accessors for the entire mesh across all submeshes
  let posAccessor: Accessor | null = null;
  let normAccessor: Accessor | null = null;
  let tanAccessor: Accessor | null = null;
  let uv0Accessor: Accessor | null = null;

  // 1. POSITION (semantic 0) - Defines master vertex count for the mesh
  const rawPositions = extractChannelFloat32(sourceMesh.vertexData, 0);
  if (!rawPositions || rawPositions.length === 0) {
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

  // 2. NORMAL (semantic 1) - Must match vertexCount
  const rawNormals = extractChannelFloat32(sourceMesh.vertexData, 1);
  if (rawNormals && rawNormals.length > 0) {
    let convertedNormals = convertNormalsArray(rawNormals);
    if (convertedNormals.length !== vertexCount * 3) {
      const fixedNorms = new Float32Array(vertexCount * 3);
      fixedNorms.set(convertedNormals.subarray(0, Math.min(convertedNormals.length, vertexCount * 3)));
      convertedNormals = fixedNorms;
    }
    normAccessor = doc
      .createAccessor()
      .setName(`${meshName}_norm`)
      .setType('VEC3')
      .setArray(convertedNormals)
      .setBuffer(buffer);
  }

  // 3. TANGENT (semantic 2) - Must match vertexCount
  const rawTangents = extractChannelFloat32(sourceMesh.vertexData, 2);
  if (rawTangents && rawTangents.length > 0) {
    let convertedTangents = convertTangentsArray(rawTangents);
    if (convertedTangents.length !== vertexCount * 4) {
      const fixedTans = new Float32Array(vertexCount * 4);
      fixedTans.set(convertedTangents.subarray(0, Math.min(convertedTangents.length, vertexCount * 4)));
      convertedTangents = fixedTans;
    }
    tanAccessor = doc
      .createAccessor()
      .setName(`${meshName}_tan`)
      .setType('VEC4')
      .setArray(convertedTangents)
      .setBuffer(buffer);
  }

  // 4. TEXCOORD_0 (semantic 4) - Must match vertexCount
  const rawUV0 = extractChannelFloat32(sourceMesh.vertexData, 4);
  if (rawUV0 && rawUV0.length > 0) {
    let convertedUV0 = convertUVsArray(rawUV0);
    if (convertedUV0.length !== vertexCount * 2) {
      const fixedUVs = new Float32Array(vertexCount * 2);
      fixedUVs.set(convertedUV0.subarray(0, Math.min(convertedUV0.length, vertexCount * 2)));
      convertedUV0 = fixedUVs;
    }
    uv0Accessor = doc
      .createAccessor()
      .setName(`${meshName}_uv0`)
      .setType('VEC2')
      .setArray(convertedUV0)
      .setBuffer(buffer);
  }

  // Create primitive per submesh sharing the vertex accessors
  for (let subIdx = 0; subIdx < sourceMesh.subMeshes.length; subIdx++) {
    const rawIndices = extractSubmeshIndices(sourceMesh, subIdx);
    if (!rawIndices || rawIndices.length === 0) {
      continue; // Skip empty submeshes with 0 indices
    }

    // Reverse winding and clamp indices to [0, vertexCount - 1]
    const reversedIndices = reverseTriangleWinding(rawIndices);
    for (let i = 0; i < reversedIndices.length; i++) {
      if (reversedIndices[i] >= vertexCount) {
        reversedIndices[i] = Math.max(0, vertexCount - 1);
      }
    }

    const primitive = doc.createPrimitive();

    primitive.setAttribute('POSITION', posAccessor);
    if (normAccessor) primitive.setAttribute('NORMAL', normAccessor);
    if (tanAccessor) primitive.setAttribute('TANGENT', tanAccessor);
    if (uv0Accessor) primitive.setAttribute('TEXCOORD_0', uv0Accessor);

    const indexAccessor = doc
      .createAccessor()
      .setName(`${meshName}_indices_${subIdx}`)
      .setType('SCALAR')
      .setArray(reversedIndices)
      .setBuffer(buffer);

    primitive.setIndices(indexAccessor);
    primitive.setMode(Primitive.Mode.TRIANGLES);

    // Attach material if provided for submesh
    if (materials && materials[subIdx]) {
      primitive.setMaterial(materials[subIdx]!);
    }

    mesh.addPrimitive(primitive);
  }

  return mesh;
}
