// Convert SourceMesh to @gltf-transform/core Mesh, Primitives, and Accessors
// Reimplemented matching exact 3D inverse transform vector rotation for static batching

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
import { Matrix4, transformPoint3D, transformVector3D } from './matrix.js';

export interface MeshSubmeshRange {
  firstSubMesh?: number;
  subMeshCount?: number;
}

export function createGltfMesh(
  doc: Document,
  buffer: Buffer,
  sourceMesh: SourceMesh,
  materials?: (Material | null)[],
  submeshRange?: MeshSubmeshRange,
  posTransform?: Matrix4 | null
): Mesh {
  const meshName = String(sourceMesh.name || 'Mesh');
  const mesh = doc.createMesh(meshName);

  const startSub = submeshRange?.firstSubMesh ?? 0;
  const countSub = submeshRange?.subMeshCount && submeshRange.subMeshCount > 0
    ? submeshRange.subMeshCount
    : sourceMesh.subMeshes.length - startSub;

  const endSub = Math.min(sourceMesh.subMeshes.length, startSub + countSub);

  // Extract raw channels
  const rawPositionsAll = extractChannelFloat32(sourceMesh.vertexData, 0);
  if (!rawPositionsAll || rawPositionsAll.length < 3) {
    return mesh;
  }
  const rawNormalsAll = extractChannelFloat32(sourceMesh.vertexData, 1);
  const rawTangentsAll = extractChannelFloat32(sourceMesh.vertexData, 2);
  const rawUV0All = extractChannelFloat32(sourceMesh.vertexData, 4);

  const totalVertices = Math.floor(rawPositionsAll.length / 3);

  // Create primitive per submesh
  for (let subIdx = startSub; subIdx < endSub; subIdx++) {
    const submesh = sourceMesh.subMeshes[subIdx];
    const rawIndices = extractSubmeshIndices(sourceMesh, subIdx);
    if (!rawIndices || rawIndices.length < 3) {
      continue;
    }

    // Determine vertex slice range for this submesh
    let firstV = submesh?.firstVertex ?? 0;
    let vCount = submesh?.vertexCount && submesh.vertexCount > 0 ? submesh.vertexCount : totalVertices - firstV;

    if (firstV >= totalVertices) {
      firstV = 0;
      vCount = totalVertices;
    } else if (firstV + vCount > totalVertices) {
      vCount = totalVertices - firstV;
    }

    if (vCount <= 0) {
      firstV = 0;
      vCount = totalVertices;
    }

    // 1. POSITION slice (transformed by posTransform = globalInverseTransform)
    let posSlice = rawPositionsAll.subarray(firstV * 3, (firstV + vCount) * 3);
    if (posTransform) {
      const transformedPos = new Float32Array(posSlice.length);
      for (let i = 0; i < posSlice.length; i += 3) {
        const pt = transformPoint3D(posTransform, {
          x: posSlice[i],
          y: posSlice[i + 1],
          z: posSlice[i + 2],
        });
        transformedPos[i] = pt.x;
        transformedPos[i + 1] = pt.y;
        transformedPos[i + 2] = pt.z;
      }
      posSlice = transformedPos;
    }

    const convertedPositions = convertPositionsArray(posSlice);
    const sliceVertexCount = Math.floor(convertedPositions.length / 3);
    if (sliceVertexCount === 0) continue;

    const posAccessor = doc
      .createAccessor()
      .setName(`${meshName}_sub${subIdx}_pos`)
      .setType('VEC3')
      .setArray(convertedPositions)
      .setBuffer(buffer);

    const primitive = doc.createPrimitive();
    primitive.setAttribute('POSITION', posAccessor);

    // 2. NORMAL slice (transformed by 3x3 rotation of posTransform = globalInverseTransform)
    if (rawNormalsAll && rawNormalsAll.length >= (firstV + sliceVertexCount) * 3) {
      let normSlice = rawNormalsAll.subarray(firstV * 3, (firstV + sliceVertexCount) * 3);
      if (posTransform) {
        const transformedNorm = new Float32Array(normSlice.length);
        for (let i = 0; i < normSlice.length; i += 3) {
          const vec = transformVector3D(posTransform, {
            x: normSlice[i],
            y: normSlice[i + 1],
            z: normSlice[i + 2],
          });
          const len = Math.hypot(vec.x, vec.y, vec.z) || 1.0;
          transformedNorm[i] = vec.x / len;
          transformedNorm[i + 1] = vec.y / len;
          transformedNorm[i + 2] = vec.z / len;
        }
        normSlice = transformedNorm;
      }

      const convertedNormals = convertNormalsArray(normSlice);
      const normAccessor = doc
        .createAccessor()
        .setName(`${meshName}_sub${subIdx}_norm`)
        .setType('VEC3')
        .setArray(convertedNormals)
        .setBuffer(buffer);
      primitive.setAttribute('NORMAL', normAccessor);
    }

    // 3. TANGENT slice
    if (rawTangentsAll && rawTangentsAll.length >= (firstV + sliceVertexCount) * 4) {
      let tanSlice = rawTangentsAll.subarray(firstV * 4, (firstV + sliceVertexCount) * 4);
      if (posTransform) {
        const transformedTan = new Float32Array(tanSlice.length);
        for (let i = 0; i < tanSlice.length; i += 4) {
          const vec = transformVector3D(posTransform, {
            x: tanSlice[i],
            y: tanSlice[i + 1],
            z: tanSlice[i + 2],
          });
          const len = Math.hypot(vec.x, vec.y, vec.z) || 1.0;
          transformedTan[i] = vec.x / len;
          transformedTan[i + 1] = vec.y / len;
          transformedTan[i + 2] = vec.z / len;
          transformedTan[i + 3] = tanSlice[i + 3];
        }
        tanSlice = transformedTan;
      }

      const convertedTangents = convertTangentsArray(tanSlice);
      const tanAccessor = doc
        .createAccessor()
        .setName(`${meshName}_sub${subIdx}_tan`)
        .setType('VEC4')
        .setArray(convertedTangents)
        .setBuffer(buffer);
      primitive.setAttribute('TANGENT', tanAccessor);
    }

    // 4. TEXCOORD_0 slice
    if (rawUV0All && rawUV0All.length >= (firstV + sliceVertexCount) * 2) {
      const uv0Slice = rawUV0All.subarray(firstV * 2, (firstV + sliceVertexCount) * 2);
      const convertedUV0 = convertUVsArray(uv0Slice);
      const uv0Accessor = doc
        .createAccessor()
        .setName(`${meshName}_sub${subIdx}_uv0`)
        .setType('VEC2')
        .setArray(convertedUV0)
        .setBuffer(buffer);
      primitive.setAttribute('TEXCOORD_0', uv0Accessor);
    }

    // 5. INDICES (re-indexed relative to firstV)
    const reindexed = new Uint32Array(rawIndices.length);
    for (let i = 0; i < rawIndices.length; i++) {
      const idx = rawIndices[i];
      reindexed[i] = idx >= firstV ? idx - firstV : idx;
    }

    const reversedIndices = reverseTriangleWinding(reindexed);
    const indexAccessor = doc
      .createAccessor()
      .setName(`${meshName}_sub${subIdx}_indices`)
      .setType('SCALAR')
      .setArray(reversedIndices)
      .setBuffer(buffer);

    primitive.setIndices(indexAccessor);
    primitive.setMode(Primitive.Mode.TRIANGLES);

    // Attach material if provided for submesh
    const matIndex = subIdx - startSub;
    if (materials && materials[matIndex]) {
      primitive.setMaterial(materials[matIndex]!);
    }

    mesh.addPrimitive(primitive);
  }

  return mesh;
}
