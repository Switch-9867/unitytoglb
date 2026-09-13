// Unity Material asset (.mat) YAML parser

import { SourceMaterial, TexEnv, ColorRGBA } from '../model/types.js';
import { parseUnityYamlFile } from './yaml.js';
import { parseRef } from './scene.js';

export function parseSourceMaterial(yamlContent: string, guid?: string): SourceMaterial {
  const rawDocs = parseUnityYamlFile(yamlContent);
  const matDoc = rawDocs.find((doc) => doc.classId === 21 || doc.className === 'Material');
  if (!matDoc) {
    throw new Error('No Material (!u!21) document found in YAML');
  }

  const d = matDoc.data;
  const name = String(d['m_Name'] ?? 'Material');
  const shaderRef = parseRef(d['m_Shader']);

  const rawKeywords = d['m_ShaderKeywords'];
  const keywordsStr = typeof rawKeywords === 'string' ? rawKeywords : '';
  const shaderKeywords = keywordsStr ? keywordsStr.split(/\s+/).filter(Boolean) : [];

  const lightmapFlags = (d['m_LightmapFlags'] as number) ?? 0;
  const customRenderQueue = (d['m_CustomRenderQueue'] as number) ?? -1;
  const doubleSidedGI = d['m_DoubleSidedGI'] === 1 || d['m_DoubleSidedGI'] === true;

  const savedProps = (d['m_SavedProperties'] as Record<string, unknown>) || {};
  const texEnvsRaw = (savedProps['m_TexEnvs'] as Record<string, any>) || {};
  const floatsRaw = (savedProps['m_Floats'] as Record<string, number>) || {};
  const colorsRaw = (savedProps['m_Colors'] as Record<string, any>) || {};

  const texEnvs: Record<string, TexEnv> = {};
  if (texEnvsRaw && typeof texEnvsRaw === 'object' && !Array.isArray(texEnvsRaw)) {
    for (const [key, val] of Object.entries(texEnvsRaw)) {
      if (!val || typeof val !== 'object') continue;
      const valObj = val as Record<string, any>;
      const texRef = parseRef(valObj['m_Texture']);
      const scaleObj = valObj['m_Scale'] || { x: 1, y: 1 };
      const offsetObj = valObj['m_Offset'] || { x: 0, y: 0 };
      texEnvs[key] = {
        textureRef: texRef,
        scale: {
          x: typeof scaleObj.x === 'number' ? scaleObj.x : parseFloat(String(scaleObj.x)) || 1,
          y: typeof scaleObj.y === 'number' ? scaleObj.y : parseFloat(String(scaleObj.y)) || 1,
        },
        offset: {
          x: typeof offsetObj.x === 'number' ? offsetObj.x : parseFloat(String(offsetObj.x)) || 0,
          y: typeof offsetObj.y === 'number' ? offsetObj.y : parseFloat(String(offsetObj.y)) || 0,
        },
      };
    }
  }

  const floats: Record<string, number> = {};
  if (floatsRaw && typeof floatsRaw === 'object' && !Array.isArray(floatsRaw)) {
    for (const [key, val] of Object.entries(floatsRaw)) {
      floats[key] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
    }
  }

  const colors: Record<string, ColorRGBA> = {};
  if (colorsRaw && typeof colorsRaw === 'object' && !Array.isArray(colorsRaw)) {
    for (const [key, val] of Object.entries(colorsRaw)) {
      if (!val || typeof val !== 'object') continue;
      const valObj = val as Record<string, any>;
      colors[key] = {
        r: typeof valObj.r === 'number' ? valObj.r : parseFloat(String(valObj.r)) || 1,
        g: typeof valObj.g === 'number' ? valObj.g : parseFloat(String(valObj.g)) || 1,
        b: typeof valObj.b === 'number' ? valObj.b : parseFloat(String(valObj.b)) || 1,
        a: typeof valObj.a === 'number' ? valObj.a : parseFloat(String(valObj.a)) || 1,
      };
    }
  }

  const stringTagMapRaw = (d['stringTagMap'] as Record<string, string>) || {};
  const stringTags: Record<string, string> = {};
  if (stringTagMapRaw && typeof stringTagMapRaw === 'object' && !Array.isArray(stringTagMapRaw)) {
    for (const [key, val] of Object.entries(stringTagMapRaw)) {
      stringTags[key] = String(val);
    }
  }

  return {
    name,
    guid,
    shaderRef,
    shaderKeywords,
    lightmapFlags,
    customRenderQueue,
    doubleSidedGI,
    texEnvs,
    floats,
    colors,
    stringTags,
  };
}

export function createBuiltinMaterial(guid: string, name: string = 'Default-Material'): SourceMaterial {
  return {
    name,
    guid,
    shaderRef: null,
    shaderKeywords: [],
    lightmapFlags: 0,
    customRenderQueue: -1,
    doubleSidedGI: false,
    texEnvs: {},
    floats: {
      _Metallic: 0,
      _Glossiness: 0.5,
      _Mode: 0,
    },
    colors: {
      _Color: { r: 1, g: 1, b: 1, a: 1 },
    },
    stringTags: {},
  };
}
