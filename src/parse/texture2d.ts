// Parse Unity Texture2D YAML assets (as exported by AssetRipper when it cannot convert a texture to
// an image file, e.g. BC6H lightmaps). Pixel data is stored inline as hex in `_typelessdata`.

export interface SourceTexture2D {
  name: string;
  width: number;
  height: number;
  /** Unity TextureFormat (24 = BC6H, 25 = BC7, 4 = RGBA32, ...) */
  textureFormat: number;
  mipCount: number;
  /** Unity LightmapFormat hint (0 = none) */
  lightmapFormat: number;
  colorSpace: number;
  /** Raw pixel data of all mips / images. */
  data: Uint8Array;
}

export const UNITY_TEXTURE_FORMAT_BC6H = 24;

function num(yaml: string, key: string): number | null {
  const m = yaml.match(new RegExp(`^  ${key}: (-?[0-9.]+)\\s*$`, 'm'));
  return m ? Number(m[1]) : null;
}

export function parseTexture2DAsset(yaml: string): SourceTexture2D {
  const name = yaml.match(/^  m_Name: (.*)$/m)?.[1]?.trim() ?? '';
  const width = num(yaml, 'm_Width');
  const height = num(yaml, 'm_Height');
  const textureFormat = num(yaml, 'm_TextureFormat');
  if (width === null || height === null || textureFormat === null) {
    throw new Error(`Texture2D "${name}": missing m_Width/m_Height/m_TextureFormat`);
  }
  const streamPath = yaml.match(/^  m_StreamData:\s*\n(?:    .*\n)*?    path: (.*)$/m)?.[1]?.trim();
  if (streamPath) {
    throw new Error(`Texture2D "${name}": pixel data is in an external stream (${streamPath}), not supported`);
  }
  const hex = yaml.match(/^  _typelessdata: ([0-9a-fA-F]*)\s*$/m)?.[1] ?? '';
  const data = new Uint8Array(Buffer.from(hex, 'hex'));
  return {
    name,
    width,
    height,
    textureFormat,
    mipCount: num(yaml, 'm_MipCount') ?? 1,
    lightmapFormat: num(yaml, 'm_LightmapFormat') ?? 0,
    colorSpace: num(yaml, 'm_ColorSpace') ?? 0,
    data,
  };
}
