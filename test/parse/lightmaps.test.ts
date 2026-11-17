import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseTexture2DAsset, UNITY_TEXTURE_FORMAT_BC6H } from '../../src/parse/texture2d.js';
import { decodeBc6hImage, halfToFloat } from '../../src/parse/bc6h.js';
import { parseLightingDataAsset, LIGHTMAP_INDEX_NONE } from '../../src/parse/lightingData.js';
import { encodeRadianceHdr } from '../../src/io/hdr.js';

const ASSETS = path.resolve('AssetRipper_export_20260811_145909/ExportedProject/Assets');

describe('BC6H lightmap decoding', () => {
  it('matches an independent decoder (Pillow) on a real lightmap', () => {
    const tex = parseTexture2DAsset(fs.readFileSync(path.join(ASSETS, 'ORGANIZM/LMGroup_00_final.texture2D'), 'utf8'));
    expect(tex).toMatchObject({ name: 'LMGroup_00_final', width: 1024, height: 1024, textureFormat: UNITY_TEXTURE_FORMAT_BC6H });

    const rgb = decodeBc6hImage(tex.data, tex.width, tex.height);
    // [x, y (memory row), Pillow 8-bit RGB]. The first four are pixels a different decoder
    // (texture2ddecoder) gets wrong; the rest are spread across the image.
    const reference: Array<[number, number, [number, number, number]]> = [
      [834, 5, [192, 124, 205]],
      [834, 8, [209, 69, 167]],
      [835, 8, [128, 10, 58]],
      [834, 10, [255, 236, 255]],
      [100, 100, [0, 0, 0]],
      [512, 700, [233, 255, 255]],
      [1000, 20, [101, 60, 102]],
      [3, 1021, [15, 15, 21]],
    ];
    for (const [x, y, expected] of reference) {
      const o = (y * tex.width + x) * 3;
      const got = [0, 1, 2].map((c) => Math.floor(Math.min(1, Math.max(0, rgb[o + c])) * 255));
      got.forEach((v, c) => expect(Math.abs(v - expected[c])).toBeLessThanOrEqual(1));
    }

    // HDR range is preserved (values above 1 are not clipped)
    expect(Math.max(...rgb.subarray(0, 300000))).toBeGreaterThan(1);
  });

  it('converts half floats', () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0x4000)).toBe(2);
    expect(halfToFloat(0x3800)).toBe(0.5);
    expect(halfToFloat(0x0001)).toBeCloseTo(5.96e-8, 10);
  });
});

describe('LightingData', () => {
  it('maps every lightmapped renderer to a lightmap index and scale/offset', () => {
    const data = parseLightingDataAsset(fs.readFileSync(path.join(ASSETS, 'ORGANIZM/LightingData.asset'), 'utf8'));
    expect(data.lightmaps).toHaveLength(28);
    expect(data.lightmaps[0].color?.guid).toBe('f93a782c6f2d951488546b7c6cf6984e');
    expect(data.renderers.size).toBe(2706);
    for (const r of data.renderers.values()) {
      if (r.lightmapIndex < LIGHTMAP_INDEX_NONE) expect(r.lightmapIndex).toBeLessThan(28);
      r.scaleOffset.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    }
    // first entry in the file
    expect(data.renderers.get(8790)).toEqual({
      lightmapIndex: 24,
      scaleOffset: [0.03545836, 0.03371408, 0.6538246, 0.8806384],
    });
  });
});

describe('Radiance HDR writer', () => {
  it('encodes RGBE and flips bottom-up rows', () => {
    // 1x2 image, bottom row first: bottom = (2, 1, 0.5), top = (0, 0, 0)
    const buf = encodeRadianceHdr(new Float32Array([2, 1, 0.5, 0, 0, 0]), 1, 2, 'bottom-up');
    const text = buf.toString('latin1');
    const start = text.indexOf('-Y 2 +X 1\n') + '-Y 2 +X 1\n'.length;
    const [top, bottom] = [buf.subarray(start, start + 4), buf.subarray(start + 4, start + 8)];
    expect([...top]).toEqual([0, 0, 0, 0]);
    const e = bottom[3] - 128;
    const decode = (m: number) => ((m + 0.5) / 256) * 2 ** e;
    expect(decode(bottom[0])).toBeCloseTo(2, 1);
    expect(decode(bottom[1])).toBeCloseTo(1, 1);
    expect(decode(bottom[2])).toBeCloseTo(0.5, 1);
  });
});
