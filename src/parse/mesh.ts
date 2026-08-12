// Unity Mesh asset (.asset) binary parser & multi-stream channel decoder
// Reimplemented from AssetRipper's C# MeshExtensions & VertexDataBlob

import { SourceMesh, SubMesh, VertexData, VertexChannel, VertexFormat, Vec3 } from '../model/types.js';
import { parseUnityYamlFile } from './yaml.js';

export const VERTEX_FORMAT_SIZES: Record<number, number> = {
  0: 4, // Float32
  1: 2, // Float16
  2: 1, // UNorm8
  3: 1, // SNorm8
  4: 2, // UNorm16
  5: 2, // SNorm16
  6: 1, // UInt8
  7: 1, // SInt8
  8: 2, // UInt16
  9: 2, // SInt16
  10: 4, // UInt32
  11: 4, // SInt32
};

export const VERTEX_FORMAT_NAMES: Record<number, VertexFormat> = {
  0: 'Float32',
  1: 'Float16',
  2: 'UNorm8',
  3: 'SNorm8',
  4: 'UNorm16',
  5: 'SNorm16',
  6: 'UInt8',
  7: 'SInt8',
  8: 'UInt16',
  9: 'SInt16',
  10: 'UInt32',
  11: 'SInt32',
};

export interface VertexStreamInfo {
  streamIndex: number;
  strideBytes: number;
  offsetBytes: number;
}

/**
 * Optimized C++ hex string decoder using Buffer.from
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/\s+/g, '');
  if (cleanHex.length === 0) return new Uint8Array(0);
  if (cleanHex.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${cleanHex.length}`);
  }
  const buf = Buffer.from(cleanHex, 'hex');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function float16ToFloat32(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;

  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  }
  if (e === 0x1f) {
    return f ? NaN : (s ? -1 : 1) * Infinity;
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

export function parseSourceMesh(yamlContent: string, guid?: string): SourceMesh {
  const rawDocs = parseUnityYamlFile(yamlContent);
  const meshDoc = rawDocs.find((doc) => doc.classId === 43 || doc.className === 'Mesh');
  if (!meshDoc) {
    throw new Error('No Mesh (!u!43) document found in asset YAML');
  }

  const d = meshDoc.data;
  const name = (d['m_Name'] as string) || 'Mesh';

  // SubMeshes
  const subMeshes: SubMesh[] = [];
  const rawSubMeshes = d['m_SubMeshes'];
  if (Array.isArray(rawSubMeshes)) {
    for (const sm of rawSubMeshes) {
      const smObj = sm as Record<string, unknown>;
      const localAabbObj = smObj['localAABB'] as Record<string, any>;
      let localAabb: { center: Vec3; extent: Vec3 } | undefined;

      if (localAabbObj && localAabbObj['m_Center'] && localAabbObj['m_Extent']) {
        const c = localAabbObj['m_Center'];
        const e = localAabbObj['m_Extent'];
        localAabb = {
          center: { x: c.x ?? 0, y: c.y ?? 0, z: c.z ?? 0 },
          extent: { x: e.x ?? 0, y: e.y ?? 0, z: e.z ?? 0 },
        };
      }

      subMeshes.push({
        topology: (smObj['topology'] as number) ?? 0,
        firstByte: (smObj['firstByte'] as number) ?? 0,
        indexCount: (smObj['indexCount'] as number) ?? 0,
        baseVertex: (smObj['baseVertex'] as number) ?? 0,
        firstVertex: (smObj['firstVertex'] as number) ?? 0,
        vertexCount: (smObj['vertexCount'] as number) ?? 0,
        localAabb,
      });
    }
  }

  // Index Format & Index Buffer
  const indexFormatCode = (d['m_IndexFormat'] as number) ?? 0;
  const indexFormat = indexFormatCode === 1 ? 'uint32' : 'uint16';
  const indexHex = (d['m_IndexBuffer'] as string) || '';
  const indexBytes = indexHex ? hexToBytes(indexHex) : new Uint8Array(0);

  // Vertex Data
  const vdObj = (d['m_VertexData'] as Record<string, unknown>) || {};
  const vertexCount = (vdObj['m_VertexCount'] as number) ?? 0;

  const typelessHex = (vdObj['_typelessdata'] as string) || '';
  const data = typelessHex ? hexToBytes(typelessHex) : new Uint8Array(0);

  // Parse Channels
  const rawChannels = vdObj['m_Channels'];
  const channels: VertexChannel[] = [];
  let maxStream = 0;

  if (Array.isArray(rawChannels)) {
    for (let semantic = 0; semantic < rawChannels.length; semantic++) {
      const ch = rawChannels[semantic] as Record<string, number>;
      const stream = ch['stream'] ?? 0;
      const offset = ch['offset'] ?? 0;
      const formatCode = ch['format'] ?? 0;
      const rawDimension = ch['dimension'] ?? 0;
      const dimension = rawDimension & 0x0f; // Low 4 bits store actual dimension count

      const format = VERTEX_FORMAT_NAMES[formatCode] || 'Float32';
      const elementSize = VERTEX_FORMAT_SIZES[formatCode] || 4;
      const sizeBytes = elementSize * dimension;

      if (stream > maxStream) maxStream = stream;

      channels.push({
        semantic,
        stream,
        offset,
        format,
        formatCode,
        dimension,
        sizeBytes,
      });
    }
  }

  // AssetRipper Multi-Stream Alignment Offset Calculation (16-byte alignment per stream)
  const streams: VertexStreamInfo[] = [];
  let currentOffset = 0;

  for (let s = 0; s <= maxStream; s++) {
    let streamStride = 0;
    for (const ch of channels) {
      if (ch.stream === s && ch.dimension > 0) {
        streamStride = Math.max(streamStride, ch.offset + ch.sizeBytes);
      }
    }

    streams.push({
      streamIndex: s,
      strideBytes: streamStride,
      offsetBytes: currentOffset,
    });

    if (streamStride > 0 && vertexCount > 0) {
      currentOffset += vertexCount * streamStride;
      // AlignStream: 16-byte alignment after each vertex stream block
      currentOffset = (currentOffset + 15) & ~15;
    }
  }

  const mainStream = streams[0] || { streamIndex: 0, strideBytes: 0, offsetBytes: 0 };
  const strideBytes = mainStream.strideBytes;

  const vertexData: VertexData = {
    vertexCount,
    strideBytes,
    channels,
    data,
    streams,
  };

  // Local AABB
  let localAabb: { center: Vec3; extent: Vec3 } | undefined;
  const mainAabbObj = d['m_LocalAABB'] as Record<string, any>;
  if (mainAabbObj && mainAabbObj['m_Center'] && mainAabbObj['m_Extent']) {
    const c = mainAabbObj['m_Center'];
    const e = mainAabbObj['m_Extent'];
    localAabb = {
      center: { x: c.x ?? 0, y: c.y ?? 0, z: c.z ?? 0 },
      extent: { x: e.x ?? 0, y: e.y ?? 0, z: e.z ?? 0 },
    };
  }

  const shapes = d['m_Shapes'] as Record<string, any>;
  const hasShapes = shapes && Array.isArray(shapes['vertices']) && shapes['vertices'].length > 0;
  const bindPose = d['m_BindPose'];
  const hasSkin = Array.isArray(bindPose) && bindPose.length > 0;

  return {
    name,
    guid,
    subMeshes,
    indexFormat,
    indexBytes,
    vertexData,
    localAabb,
    hasShapes: !!hasShapes,
    hasSkin: !!hasSkin,
  };
}

/**
 * Decode a vertex attribute channel (e.g. semantic 0 for POSITION) into a Float32Array
 * using AssetRipper multi-stream offsets.
 */
export function extractChannelFloat32(vd: VertexData, semantic: number): Float32Array | null {
  const channel = vd.channels.find((c) => c.semantic === semantic && c.dimension > 0);
  if (!channel || vd.vertexCount === 0 || vd.data.byteLength === 0) return null;

  const streamInfo = vd.streams?.find((s) => s.streamIndex === channel.stream) || {
    streamIndex: channel.stream,
    strideBytes: vd.strideBytes,
    offsetBytes: 0,
  };

  if (streamInfo.strideBytes === 0) return null;

  const totalBytes = vd.data.byteLength;
  const maxVertices = Math.floor((totalBytes - streamInfo.offsetBytes) / streamInfo.strideBytes);
  const validVertexCount = Math.min(vd.vertexCount, Math.max(0, maxVertices));
  if (validVertexCount === 0) return null;

  const result = new Float32Array(validVertexCount * channel.dimension);
  const view = new DataView(vd.data.buffer, vd.data.byteOffset, totalBytes);

  for (let v = 0; v < validVertexCount; v++) {
    const vertexStart = streamInfo.offsetBytes + channel.offset + v * streamInfo.strideBytes;

    for (let d = 0; d < channel.dimension; d++) {
      const elementSize = VERTEX_FORMAT_SIZES[channel.formatCode] || 4;
      const pos = vertexStart + d * elementSize;
      let val = 0;

      if (pos >= 0 && pos + elementSize <= totalBytes) {
        switch (channel.formatCode) {
          case 0: // Float32
            val = view.getFloat32(pos, true);
            break;
          case 1: // Float16
            val = float16ToFloat32(view.getUint16(pos, true));
            break;
          case 2: // UNorm8
            val = view.getUint8(pos) / 255.0;
            break;
          case 3: // SNorm8
            val = Math.max(-1.0, view.getInt8(pos) / 127.0);
            break;
          case 4: // UNorm16
            val = view.getUint16(pos, true) / 65535.0;
            break;
          case 5: // SNorm16
            val = Math.max(-1.0, view.getInt16(pos, true) / 32767.0);
            break;
          case 6: // UInt8
          case 7: // SInt8
            val = channel.formatCode === 6 ? view.getUint8(pos) : view.getInt8(pos);
            break;
          case 8: // UInt16
          case 9: // SInt16
            val = channel.formatCode === 8 ? view.getUint16(pos, true) : view.getInt16(pos, true);
            break;
          case 10: // UInt32
          case 11: // SInt32
            val = channel.formatCode === 10 ? view.getUint32(pos, true) : view.getInt32(pos, true);
            break;
        }
      }

      result[v * channel.dimension + d] = val;
    }
  }

  return result;
}

/**
 * Decode indices for a submesh into a Uint32Array (or Uint16Array), adding baseVertex offset.
 */
export function extractSubmeshIndices(mesh: SourceMesh, submeshIndex: number): Uint32Array | Uint16Array {
  const submesh = mesh.subMeshes[submeshIndex];
  if (!submesh) {
    throw new Error(`Submesh index ${submeshIndex} out of bounds`);
  }

  const bytesPerIndex = mesh.indexFormat === 'uint32' ? 4 : 2;
  const byteOffset = submesh.firstByte;
  const count = submesh.indexCount;
  const baseVertex = submesh.baseVertex || 0;
  const totalBytes = mesh.indexBytes.byteLength;

  if (totalBytes < byteOffset) {
    return new Uint32Array(0);
  }

  const maxIndices = Math.floor((totalBytes - byteOffset) / bytesPerIndex);
  const actualCount = Math.min(count, maxIndices);

  if (actualCount <= 0) {
    return new Uint32Array(0);
  }

  const result = new Uint32Array(actualCount);
  const view = new DataView(mesh.indexBytes.buffer, mesh.indexBytes.byteOffset + byteOffset, actualCount * bytesPerIndex);

  if (mesh.indexFormat === 'uint32') {
    for (let i = 0; i < actualCount; i++) {
      result[i] = view.getUint32(i * 4, true) + baseVertex;
    }
  } else {
    for (let i = 0; i < actualCount; i++) {
      result[i] = view.getUint16(i * 2, true) + baseVertex;
    }
  }

  return result;
}
