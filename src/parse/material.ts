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

  const keywordsStr = (d['m_ShaderKeywords'] as string) || '';
  const shaderKeywords = keywordsStr ? keywordsStr.split(/\s+/).filter(Boolean) : [];

  const lightmapFlags = (d['m_LightmapFlags'] as number) ?? 0;
  const customRenderQueue = (d['m_CustomRenderQueue'] as number) ?? -1;
  const doubleSidedGI = d['m_DoubleSidedGI'] === 1 || d['m_DoubleSidedGI'] === true;

  const savedProps = (d['m_SavedProperties'] as Record<string, unknown>) || {};
  const texEnvsRaw = (savedProps['m_TexEnvs'] as Record<string, any>) || {};
  const floatsRaw = (savedProps['m_Floats'] as Record<string, number>) || {};
  const colorsRaw = (savedProps['m_Colors'] as Record<string, any>) || {};

  const texEnvs: Record<string, TexEnv> = {};
  for (const [key, val] of Object.entries(texEnvsRaw)) {
    const valObj = val as Record<string, any>;
    const texRef = parseRef(valObj['m_Texture']);
    const scaleObj = valObj['m_Scale'] || { x: 1, y: 1 };
    const offsetObj = valObj['m_Offset'] || { x: 0, y: 0 };
    texEnvs[key] = {
      textureRef: texRef,
      scale: { x: scaleObj.x ?? 1, y: scaleObj.y ?? 1 },
      offset: { x: offsetObj.x ?? 0, y: offsetObj.y ?? 0 },
    };
  }

  const floats: Record<string, number> = {};
  for (const [key, val] of Object.entries(floatsRaw)) {
    floats[key] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  }

  const colors: Record<string, ColorRGBA> = {};
  for (const [key, val] of Object.entries(colorsRaw)) {
    const valObj = val as Record<string, number>;
    colors[key] = {
      r: valObj.r ?? 1,
      g: valObj.g ?? 1,
      b: valObj.b ?? 1,
      a: valObj.a ?? 1,
    };
  }

  const stringTagMapRaw = (d['stringTagMap'] as Record<string, string>) || {};

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
    stringTags: stringTagMapRaw,
  };
}
