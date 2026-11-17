// BC6H (BPTC float) block decoder, producing linear float RGB.
//
// Ported from bcdec (https://github.com/iOrange/bcdec), used under its MIT license:
//   Copyright (c) 2022 Sergii Kudlai
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
//   and associated documentation files (the "Software"), to deal in the Software without
//   restriction, including without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
//   Software is furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or substantial portions of
//   the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
//
// The per-mode endpoint bit layouts below are generated mechanically from bcdec.h.
/* eslint-disable */

const ACTUAL_BITS_COUNT = [
  [10, 7, 11, 11, 11, 9, 8, 8, 8, 6, 10, 11, 12, 16], // W
  [5, 6, 5, 4, 4, 5, 6, 5, 5, 6, 10, 9, 8, 4], // dR
  [5, 6, 4, 5, 4, 5, 5, 6, 5, 6, 10, 9, 8, 4], // dG
  [5, 6, 4, 4, 5, 5, 5, 5, 6, 6, 10, 9, 8, 4], // dB
];

/** 32 two-region partition shapes, row-major 4x4; values >= 128 mark the fix-up index. */
const PARTITION_SETS: number[][] = [[128, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 129], [128, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 129], [128, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 129], [128, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 129], [128, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 129], [128, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 129], [128, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129], [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 129], [128, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 129], [128, 1, 129, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], [128, 0, 0, 0, 0, 0, 0, 0, 129, 0, 0, 0, 1, 1, 1, 0], [128, 1, 129, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0], [128, 0, 129, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], [128, 0, 0, 0, 1, 0, 0, 0, 129, 1, 0, 0, 1, 1, 1, 0], [128, 0, 0, 0, 0, 0, 0, 0, 129, 0, 0, 0, 1, 1, 0, 0], [128, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 129], [128, 0, 129, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], [128, 0, 0, 0, 1, 0, 0, 0, 129, 0, 0, 0, 1, 1, 0, 0], [128, 1, 129, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0], [128, 0, 129, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0], [128, 0, 0, 1, 0, 1, 1, 1, 129, 1, 1, 0, 1, 0, 0, 0], [128, 0, 0, 0, 1, 1, 1, 1, 129, 1, 1, 1, 0, 0, 0, 0], [128, 1, 129, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0], [128, 0, 129, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0]];

const WEIGHT3 = [0, 9, 18, 27, 37, 46, 55, 64];
const WEIGHT4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

const extendSign = (val: number, bits: number) => (val << (32 - bits)) >> (32 - bits);

function transformInverse(val: number, a0: number, bits: number, isSigned: boolean): number {
  val = (val + a0) & ((1 << bits) - 1);
  return isSigned ? extendSign(val, bits) : val;
}

function unquantize(val: number, bits: number, isSigned: boolean): number {
  if (!isSigned) {
    if (bits >= 15) return val;
    if (!val) return 0;
    if (val === (1 << bits) - 1) return 0xffff;
    return ((val << 16) + 0x8000) >> bits;
  }
  if (bits >= 16) return val;
  let s = false;
  if (val < 0) {
    s = true;
    val = -val;
  }
  let unq: number;
  if (val === 0) unq = 0;
  else if (val >= (1 << (bits - 1)) - 1) unq = 0x7fff;
  else unq = ((val << 15) + 0x4000) >> (bits - 1);
  return s ? -unq : unq;
}

const interpolate = (a: number, b: number, weights: number[], index: number) =>
  (a * (64 - weights[index]) + b * weights[index] + 32) >> 6;

function finishUnquantize(val: number, isSigned: boolean): number {
  if (!isSigned) return ((val * 31) >> 6) & 0xffff;
  val = val < 0 ? -(((-val) * 31) >> 5) : (val * 31) >> 5;
  let s = 0;
  if (val < 0) {
    s = 0x8000;
    val = -val;
  }
  return (s | val) & 0xffff;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** IEEE half -> float. */
export function halfToFloat(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) {
    const v = mant * 2 ** -24; // denormal / zero
    return sign ? -v : v;
  }
  if (exp === 31) {
    u32[0] = sign | 0x7f800000 | (mant << 13);
    return f32[0];
  }
  u32[0] = sign | ((exp - 15 + 127) << 23) | (mant << 13);
  return f32[0];
}

/**
 * Decode one 16-byte BC6H block at `data[offset]` into 16 half-float RGB triplets
 * (`out[(row * 4 + col) * 3 + channel]`, row 0 = first row of the block in memory order).
 */
export function decodeBc6hBlockHalf(data: Uint8Array, offset: number, out: Uint16Array, isSigned = false): void {
  let bitPos = 0;
  const rb = (numBits: number): number => {
    let v = 0;
    for (let k = 0; k < numBits; k++, bitPos++) {
      v |= ((data[offset + (bitPos >> 3)] >> (bitPos & 7)) & 1) << k;
    }
    return v;
  };
  const rbr = (numBits: number): number => {
    let bits = rb(numBits);
    let result = 0;
    while (numBits--) {
      result = (result << 1) | (bits & 1);
      bits >>= 1;
    }
    return result;
  };

  const r = [0, 0, 0, 0];
  const g = [0, 0, 0, 0];
  const b = [0, 0, 0, 0];

  let mode = rb(2);
  if (mode > 1) mode |= rb(3) << 2;
  let partition = 0;

  switch (mode) {
        /* mode 1 */
        case 0b00: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 75 bits (10.555, 10.555, 10.555) */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[2] |= rb(1) << 4;       /* by[4]   */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(5);        /* rx[4:0] */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(5);        /* gx[4:0] */
            b[3] |= rb(1);            /* bz[0]   */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(5);        /* bx[4:0] */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(5);        /* ry[4:0] */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(5);        /* rz[4:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 0;
        } break;

        /* mode 2 */
        case 0b01: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 75 bits (7666, 7666, 7666) */
            g[2] |= rb(1) << 5;       /* gy[5]   */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            g[3] |= rb(1) << 5;       /* gz[5]   */
            r[0] |= rb(7);        /* rw[6:0] */
            b[3] |= rb(1);            /* bz[0]   */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[0] |= rb(7);        /* gw[6:0] */
            b[2] |= rb(1) << 5;       /* by[5]   */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[0] |= rb(7);        /* bw[6:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            b[3] |= rb(1) << 5;       /* bz[5]   */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[1] |= rb(6);        /* rx[5:0] */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(6);        /* gx[5:0] */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(6);        /* bx[5:0] */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(6);        /* ry[5:0] */
            r[3] |= rb(6);        /* rz[5:0] */
            partition = rb(5);    /* d[4:0]  */
            mode = 1;
        } break;

        /* mode 3 */
        case 0b00010: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (11.555, 11.444, 11.444) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(5);        /* rx[4:0] */
            r[0] |= rb(1) << 10;      /* rw[10]  */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(4);        /* gx[3:0] */
            g[0] |= rb(1) << 10;      /* gw[10]  */
            b[3] |= rb(1);            /* bz[0]   */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(4);        /* bx[3:0] */
            b[0] |= rb(1) << 10;      /* bw[10]  */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(5);        /* ry[4:0] */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(5);        /* rz[4:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 2;
        } break;

        /* mode 4 */
        case 0b00110: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (11.444, 11.555, 11.444) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(4);        /* rx[3:0] */
            r[0] |= rb(1) << 10;      /* rw[10]  */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(5);        /* gx[4:0] */
            g[0] |= rb(1) << 10;      /* gw[10]  */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(4);        /* bx[3:0] */
            b[0] |= rb(1) << 10;      /* bw[10]  */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(4);        /* ry[3:0] */
            b[3] |= rb(1);            /* bz[0]   */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(4);        /* rz[3:0] */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 3;
        } break;

        /* mode 5 */
        case 0b01010: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (11.444, 11.444, 11.555) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(4);        /* rx[3:0] */
            r[0] |= rb(1) << 10;      /* rw[10]  */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(4);        /* gx[3:0] */
            g[0] |= rb(1) << 10;      /* gw[10]  */
            b[3] |= rb(1);            /* bz[0]   */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(5);        /* bx[4:0] */
            b[0] |= rb(1) << 10;      /* bw[10]  */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(4);        /* ry[3:0] */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(4);        /* rz[3:0] */
            b[3] |= rb(1) << 4;       /* bz[4]   */ 
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 4;
        } break;

        /* mode 6 */
        case 0b01110: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (9555, 9555, 9555) */
            r[0] |= rb(9);        /* rw[8:0] */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[0] |= rb(9);        /* gw[8:0] */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[0] |= rb(9);        /* bw[8:0] */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[1] |= rb(5);        /* rx[4:0] */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(5);        /* gx[4:0] */
            b[3] |= rb(1);            /* bz[0]   */
            g[3] |= rb(4);        /* gx[3:0] */
            b[1] |= rb(5);        /* bx[4:0] */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(5);        /* ry[4:0] */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(5);        /* rz[4:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 5;
        } break;

        /* mode 7 */
        case 0b10010: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (8666, 8555, 8555) */
            r[0] |= rb(8);        /* rw[7:0] */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[0] |= rb(8);        /* gw[7:0] */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[0] |= rb(8);        /* bw[7:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[1] |= rb(6);        /* rx[5:0] */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(5);        /* gx[4:0] */
            b[3] |= rb(1);            /* bz[0]   */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(5);        /* bx[4:0] */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(6);        /* ry[5:0] */
            r[3] |= rb(6);        /* rz[5:0] */
            partition = rb(5);    /* d[4:0]  */
            mode = 6;
        } break;

        /* mode 8 */
        case 0b10110: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (8555, 8666, 8555) */
            r[0] |= rb(8);        /* rw[7:0] */
            b[3] |= rb(1);            /* bz[0]   */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[0] |= rb(8);        /* gw[7:0] */
            g[2] |= rb(1) << 5;       /* gy[5]   */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[0] |= rb(8);        /* bw[7:0] */
            g[3] |= rb(1) << 5;       /* gz[5]   */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[1] |= rb(5);        /* rx[4:0] */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(6);        /* gx[5:0] */
            g[3] |= rb(4);        /* zx[3:0] */
            b[1] |= rb(5);        /* bx[4:0] */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(5);        /* ry[4:0] */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(5);        /* rz[4:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 7;
        } break;

        /* mode 9 */
        case 0b11010: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (8555, 8555, 8666) */
            r[0] |= rb(8);        /* rw[7:0] */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[0] |= rb(8);        /* gw[7:0] */
            b[2] |= rb(1) << 5;       /* by[5]   */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[0] |= rb(8);        /* bw[7:0] */
            b[3] |= rb(1) << 5;       /* bz[5]   */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[1] |= rb(5);        /* bw[4:0] */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(5);        /* gx[4:0] */
            b[3] |= rb(1);            /* bz[0]   */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(6);        /* bx[5:0] */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(5);        /* ry[4:0] */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            r[3] |= rb(5);        /* rz[4:0] */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            partition = rb(5);    /* d[4:0]  */
            mode = 8;
        } break;

        /* mode 10 */
        case 0b11110: {
            /* Partitition indices: 46 bits
               Partition: 5 bits
               Color Endpoints: 72 bits (6666, 6666, 6666) */
            r[0] |= rb(6);        /* rw[5:0] */
            g[3] |= rb(1) << 4;       /* gz[4]   */
            b[3] |= rb(1);            /* bz[0]   */
            b[3] |= rb(1) << 1;       /* bz[1]   */
            b[2] |= rb(1) << 4;       /* by[4]   */
            g[0] |= rb(6);        /* gw[5:0] */
            g[2] |= rb(1) << 5;       /* gy[5]   */
            b[2] |= rb(1) << 5;       /* by[5]   */
            b[3] |= rb(1) << 2;       /* bz[2]   */
            g[2] |= rb(1) << 4;       /* gy[4]   */
            b[0] |= rb(6);        /* bw[5:0] */
            g[3] |= rb(1) << 5;       /* gz[5]   */
            b[3] |= rb(1) << 3;       /* bz[3]   */
            b[3] |= rb(1) << 5;       /* bz[5]   */
            b[3] |= rb(1) << 4;       /* bz[4]   */
            r[1] |= rb(6);        /* rx[5:0] */
            g[2] |= rb(4);        /* gy[3:0] */
            g[1] |= rb(6);        /* gx[5:0] */
            g[3] |= rb(4);        /* gz[3:0] */
            b[1] |= rb(6);        /* bx[5:0] */
            b[2] |= rb(4);        /* by[3:0] */
            r[2] |= rb(6);        /* ry[5:0] */
            r[3] |= rb(6);        /* rz[5:0] */
            partition = rb(5);    /* d[4:0]  */
            mode = 9;
        } break;

        /* mode 11 */
        case 0b00011: {
            /* Partitition indices: 63 bits
               Partition: 0 bits
               Color Endpoints: 60 bits (10.10, 10.10, 10.10) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(10);       /* rx[9:0] */
            g[1] |= rb(10);       /* gx[9:0] */
            b[1] |= rb(10);       /* bx[9:0] */
            mode = 10;
        } break;

        /* mode 12 */
        case 0b00111: {
            /* Partitition indices: 63 bits
               Partition: 0 bits
               Color Endpoints: 60 bits (11.9, 11.9, 11.9) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(9);        /* rx[8:0] */
            r[0] |= rb(1) << 10;      /* rw[10]  */
            g[1] |= rb(9);        /* gx[8:0] */
            g[0] |= rb(1) << 10;      /* gw[10]  */
            b[1] |= rb(9);        /* bx[8:0] */
            b[0] |= rb(1) << 10;      /* bw[10]  */
            mode = 11;
        } break;

        /* mode 13 */
        case 0b01011: {
            /* Partitition indices: 63 bits
               Partition: 0 bits
               Color Endpoints: 60 bits (12.8, 12.8, 12.8) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(8);        /* rx[7:0] */
            r[0] |= rbr(2) << 10;/* rx[10:11] */
            g[1] |= rb(8);        /* gx[7:0] */
            g[0] |= rbr(2) << 10;/* gx[10:11] */
            b[1] |= rb(8);        /* bx[7:0] */
            b[0] |= rbr(2) << 10;/* bx[10:11] */
            mode = 12;
        } break;

        /* mode 14 */
        case 0b01111: {
            /* Partitition indices: 63 bits
               Partition: 0 bits
               Color Endpoints: 60 bits (16.4, 16.4, 16.4) */
            r[0] |= rb(10);       /* rw[9:0] */
            g[0] |= rb(10);       /* gw[9:0] */
            b[0] |= rb(10);       /* bw[9:0] */
            r[1] |= rb(4);        /* rx[3:0] */
            r[0] |= rbr(6) << 10;/* rw[10:15] */
            g[1] |= rb(4);        /* gx[3:0] */
            g[0] |= rbr(6) << 10;/* gw[10:15] */
            b[1] |= rb(4);        /* bx[3:0] */
            b[0] |= rbr(6) << 10;/* bw[10:15] */
            mode = 13;
        } break;

    default:
      // Reserved modes decode to black.
      out.fill(0, 0, 48);
      return;
  }

  const numPartitions = mode >= 10 ? 0 : 1;
  const bits0 = ACTUAL_BITS_COUNT[0][mode];
  if (isSigned) {
    r[0] = extendSign(r[0], bits0);
    g[0] = extendSign(g[0], bits0);
    b[0] = extendSign(b[0], bits0);
  }
  if ((mode !== 9 && mode !== 10) || isSigned) {
    for (let i = 1; i < (numPartitions + 1) * 2; ++i) {
      r[i] = extendSign(r[i], ACTUAL_BITS_COUNT[1][mode]);
      g[i] = extendSign(g[i], ACTUAL_BITS_COUNT[2][mode]);
      b[i] = extendSign(b[i], ACTUAL_BITS_COUNT[3][mode]);
    }
  }
  if (mode !== 9 && mode !== 10) {
    for (let i = 1; i < (numPartitions + 1) * 2; ++i) {
      r[i] = transformInverse(r[i], r[0], bits0, isSigned);
      g[i] = transformInverse(g[i], g[0], bits0, isSigned);
      b[i] = transformInverse(b[i], b[0], bits0, isSigned);
    }
  }
  for (let i = 0; i < (numPartitions + 1) * 2; ++i) {
    r[i] = unquantize(r[i], bits0, isSigned);
    g[i] = unquantize(g[i], bits0, isSigned);
    b[i] = unquantize(b[i], bits0, isSigned);
  }

  const weights = mode >= 10 ? WEIGHT4 : WEIGHT3;
  for (let i = 0; i < 4; ++i) {
    for (let j = 0; j < 4; ++j) {
      let partitionSet = mode >= 10 ? (i | j ? 0 : 128) : PARTITION_SETS[partition][i * 4 + j];
      let indexBits = mode >= 10 ? 4 : 3;
      if (partitionSet & 0x80) indexBits--;
      partitionSet &= 0x01;
      const index = rb(indexBits);
      const ep = partitionSet * 2;
      const o = (i * 4 + j) * 3;
      out[o] = finishUnquantize(interpolate(r[ep], r[ep + 1], weights, index), isSigned);
      out[o + 1] = finishUnquantize(interpolate(g[ep], g[ep + 1], weights, index), isSigned);
      out[o + 2] = finishUnquantize(interpolate(b[ep], b[ep + 1], weights, index), isSigned);
    }
  }
}

/**
 * Decode a BC6H image into linear float RGB, rows in the texture's memory order
 * (Unity: bottom row first). Width/height are padded to whole 4x4 blocks internally.
 */
export function decodeBc6hImage(data: Uint8Array, width: number, height: number, isSigned = false): Float32Array {
  const out = new Float32Array(width * height * 3);
  const block = new Uint16Array(48);
  const bw = Math.ceil(width / 4);
  const bh = Math.ceil(height / 4);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBc6hBlockHalf(data, (by * bw + bx) * 16, block, isSigned);
      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) break;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) break;
          const s = (py * 4 + px) * 3;
          const d = (y * width + x) * 3;
          out[d] = halfToFloat(block[s]);
          out[d + 1] = halfToFloat(block[s + 1]);
          out[d + 2] = halfToFloat(block[s + 2]);
        }
      }
    }
  }
  return out;
}
