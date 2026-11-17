// Parse a Unity LightingDataAsset (.asset): the baked lightmap list and per-renderer lightmap
// assignments. Unity keeps these here (not on the MeshRenderer) for scenes saved by the editor.

import { Ref } from '../model/types.js';
import { parseRef } from './scene.js';
import { parseInlineFlow } from './yaml.js';

export interface SourceLightmap {
  color: Ref | null;
  directional: Ref | null;
  shadowMask: Ref | null;
}

export interface RendererLightmapData {
  lightmapIndex: number;
  /** Unity lightmapScaleOffset: uv1 * (x, y) + (z, w) */
  scaleOffset: [number, number, number, number];
}

export interface SourceLightingData {
  /** 0 = NonDirectional, 1 = CombinedDirectional */
  lightmapsMode: number;
  lightmaps: SourceLightmap[];
  /** key: renderer component fileID in the scene */
  renderers: Map<number, RendererLightmapData>;
}

/** Lightmap indices >= this value mean "not lightmapped" (65534) or "none" (65535). */
export const LIGHTMAP_INDEX_NONE = 65534;

const NUM = '(-?[0-9.]+(?:[eE][-+]?[0-9]+)?)';

function section(yaml: string, key: string): string {
  const start = yaml.indexOf(`\n  ${key}:`);
  if (start < 0) return '';
  const rest = yaml.slice(start + key.length + 4);
  const end = rest.search(/\n  [A-Za-z_]+:/);
  return end < 0 ? rest : rest.slice(0, end);
}

export function parseLightingDataAsset(yaml: string): SourceLightingData {
  const lightmaps: SourceLightmap[] = section(yaml, 'm_Lightmaps')
    .split(/\n  - /)
    .slice(1)
    .map((entry) => {
      const ref = (key: string) => {
        const m = entry.match(new RegExp(`${key}: (\\{[^}]*\\})`));
        return m ? parseRef(parseInlineFlow(m[1])) : null;
      };
      return { color: ref('m_Lightmap'), directional: ref('m_DirLightmap'), shadowMask: ref('m_ShadowMask') };
    });

  const data = section(yaml, 'm_LightmappedRendererData')
    .split(/\n  - /)
    .slice(1)
    .map((entry): RendererLightmapData => {
      const idx = entry.match(/\n    lightmapIndex: (\d+)/);
      const st = entry.match(new RegExp(`\\n    lightmapST: \\{x: ${NUM}, y: ${NUM}, z: ${NUM}, w: ${NUM}\\}`));
      return {
        lightmapIndex: idx ? Number(idx[1]) : 65535,
        scaleOffset: st ? [Number(st[1]), Number(st[2]), Number(st[3]), Number(st[4])] : [1, 1, 0, 0],
      };
    });

  const ids = [...section(yaml, 'm_LightmappedRendererDataIDs').matchAll(/targetObject: (-?\d+)/g)].map((m) => Number(m[1]));
  if (ids.length !== data.length) {
    throw new Error(`LightingData: ${data.length} renderer entries but ${ids.length} renderer IDs`);
  }

  const renderers = new Map<number, RendererLightmapData>();
  ids.forEach((id, i) => renderers.set(id, data[i]));

  const mode = yaml.match(/\n  m_LightmapsMode: (\d+)/);
  return { lightmapsMode: mode ? Number(mode[1]) : 0, lightmaps, renderers };
}
