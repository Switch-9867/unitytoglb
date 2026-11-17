// Minimal Radiance RGBE (.hdr) writer for linear float RGB images.

import * as fs from 'node:fs';

/**
 * Encode linear float RGB pixels as a Radiance .hdr file (flat, uncompressed scanlines).
 * `rgb` rows are in `rowOrder`; the file is written top row first as the format expects.
 */
export function encodeRadianceHdr(
  rgb: Float32Array,
  width: number,
  height: number,
  rowOrder: 'top-down' | 'bottom-up' = 'top-down'
): Buffer {
  const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, 'ascii');
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = rowOrder === 'bottom-up' ? height - 1 - y : y;
    for (let x = 0; x < width; x++) {
      const s = (srcRow * width + x) * 3;
      const d = (y * width + x) * 4;
      const r = Math.max(0, rgb[s]);
      const g = Math.max(0, rgb[s + 1]);
      const b = Math.max(0, rgb[s + 2]);
      const m = Math.max(r, g, b);
      if (!(m > 1e-32) || !Number.isFinite(m)) {
        continue; // zero (buffer is already 0)
      }
      const e = Math.ceil(Math.log2(m) + 1e-9);
      const scale = 256 / 2 ** e;
      pixels[d] = Math.min(255, Math.floor(r * scale));
      pixels[d + 1] = Math.min(255, Math.floor(g * scale));
      pixels[d + 2] = Math.min(255, Math.floor(b * scale));
      pixels[d + 3] = e + 128;
    }
  }
  return Buffer.concat([header, pixels]);
}

export function writeRadianceHdr(
  filePath: string,
  rgb: Float32Array,
  width: number,
  height: number,
  rowOrder: 'top-down' | 'bottom-up' = 'top-down'
): void {
  fs.writeFileSync(filePath, encodeRadianceHdr(rgb, width, height, rowOrder));
}
