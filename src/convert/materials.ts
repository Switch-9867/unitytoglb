// Convert SourceMaterial to @gltf-transform/core Material with Texture mapping

import { Document, Material } from '@gltf-transform/core';
import { SourceMaterial } from '../model/types.js';
import { TextureCache, applyTextureTransform } from './textures.js';

export function createGltfMaterial(
  doc: Document,
  sourceMat?: SourceMaterial,
  textureCache?: TextureCache
): Material {
  const matName = String(sourceMat?.name ?? 'DefaultMaterial');
  const mat = doc.createMaterial(matName);
  if (!sourceMat) {
    mat.setBaseColorFactor([1, 1, 1, 1]);
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(0.5);
    return mat;
  }

  // Base color factor
  const color = sourceMat.colors['_Color'] || sourceMat.colors['_BaseColor'] || { r: 1, g: 1, b: 1, a: 1 };
  mat.setBaseColorFactor([color.r, color.g, color.b, color.a]);

  // Metallic & Roughness (Roughness = 1 - Glossiness / Smoothness)
  const metallic = sourceMat.floats['_Metallic'] ?? 0;
  const glossiness = sourceMat.floats['_Glossiness'] ?? sourceMat.floats['_GlossMapScale'] ?? sourceMat.floats['_Smoothness'] ?? 0;
  const roughness = Math.min(1.0, Math.max(0.0, 1.0 - glossiness));

  mat.setMetallicFactor(metallic);
  mat.setRoughnessFactor(roughness);

  // Alpha mode (_Mode: 0=Opaque, 1=Cutout, 2=Fade, 3=Transparent)
  const mode = sourceMat.floats['_Mode'] ?? 0;
  if (mode === 1) {
    mat.setAlphaMode('MASK');
    const cutoff = sourceMat.floats['_Cutoff'] ?? 0.5;
    mat.setAlphaCutoff(cutoff);
  } else if (mode === 2 || mode === 3) {
    mat.setAlphaMode('BLEND');
  } else {
    mat.setAlphaMode('OPAQUE');
  }

  // Double Sided
  if (sourceMat.doubleSidedGI || sourceMat.floats['_Cull'] === 0) {
    mat.setDoubleSided(true);
  }

  // Emission
  const emissionColor = sourceMat.colors['_EmissionColor'];
  if (emissionColor && (emissionColor.r > 0 || emissionColor.g > 0 || emissionColor.b > 0)) {
    mat.setEmissiveFactor([emissionColor.r, emissionColor.g, emissionColor.b]);
  }

  // Texture Mapping
  if (textureCache) {
    // 1. Base Color Texture (_MainTex or _BaseMap)
    const mainTexEnv = sourceMat.texEnvs['_MainTex'] || sourceMat.texEnvs['_BaseMap'];
    if (mainTexEnv && mainTexEnv.textureRef?.guid) {
      const tex = textureCache.getOrCreateTexture(mainTexEnv.textureRef.guid, 'baseColorTexture');
      if (tex) {
        mat.setBaseColorTexture(tex);
        applyTextureTransform(doc, mat.getBaseColorTextureInfo(), mainTexEnv);
      }
    }

    // 2. Normal Texture (_BumpMap or _DetailNormalMap)
    const bumpTexEnv = sourceMat.texEnvs['_BumpMap'] || sourceMat.texEnvs['_DetailNormalMap'];
    if (bumpTexEnv && bumpTexEnv.textureRef?.guid) {
      const tex = textureCache.getOrCreateTexture(bumpTexEnv.textureRef.guid, 'normalTexture');
      if (tex) {
        mat.setNormalTexture(tex);
        const bumpScale = sourceMat.floats['_BumpScale'] ?? 1.0;
        mat.setNormalScale(bumpScale);
        applyTextureTransform(doc, mat.getNormalTextureInfo(), bumpTexEnv);
      }
    }

    // 3. Metallic Roughness Texture (_MetallicGlossMap or _SpecGlossMap)
    const metallicTexEnv = sourceMat.texEnvs['_MetallicGlossMap'] || sourceMat.texEnvs['_SpecGlossMap'];
    if (metallicTexEnv && metallicTexEnv.textureRef?.guid) {
      const tex = textureCache.getOrCreateTexture(metallicTexEnv.textureRef.guid, 'metallicRoughnessTexture');
      if (tex) {
        mat.setMetallicRoughnessTexture(tex);
        applyTextureTransform(doc, mat.getMetallicRoughnessTextureInfo(), metallicTexEnv);
      }
    }

    // 4. Emissive Texture (_EmissionMap)
    const emissionTexEnv = sourceMat.texEnvs['_EmissionMap'];
    if (emissionTexEnv && emissionTexEnv.textureRef?.guid) {
      const tex = textureCache.getOrCreateTexture(emissionTexEnv.textureRef.guid, 'emissiveTexture');
      if (tex) {
        mat.setEmissiveTexture(tex);
        applyTextureTransform(doc, mat.getEmissiveTextureInfo(), emissionTexEnv);
      }
    }

    // 5. Occlusion Texture (_OcclusionMap)
    const occlusionTexEnv = sourceMat.texEnvs['_OcclusionMap'];
    if (occlusionTexEnv && occlusionTexEnv.textureRef?.guid) {
      const tex = textureCache.getOrCreateTexture(occlusionTexEnv.textureRef.guid, 'occlusionTexture');
      if (tex) {
        mat.setOcclusionTexture(tex);
        const occStrength = sourceMat.floats['_OcclusionStrength'] ?? 1.0;
        mat.setOcclusionStrength(occStrength);
        applyTextureTransform(doc, mat.getOcclusionTextureInfo(), occlusionTexEnv);
      }
    }
  }

  return mat;
}
