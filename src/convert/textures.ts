// Convert Unity Texture assets to glTF 2.0 Textures & Images

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Document, Texture, TextureInfo } from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import { GuidIndex } from '../io/guidIndex.js';
import { TexEnv } from '../model/types.js';

export interface TextureCache {
  getOrCreateTexture(guid: string, slots?: string): Texture | null;
}

/**
 * Creates a Texture Manager to load, convert, and cache glTF Textures.
 */
export function createTextureManager(doc: Document, guidIndex: GuidIndex): TextureCache {
  const textureMap = new Map<string, Texture>();

  // Ensure KHRTextureTransform extension is registered on document
  doc.createExtension(KHRTextureTransform);

  return {
    getOrCreateTexture(guid: string, slots: string = 'baseColorTexture'): Texture | null {
      if (textureMap.has(guid)) {
        return textureMap.get(guid)!;
      }

      const entry = guidIndex.get(guid);
      if (!entry || !fs.existsSync(entry.assetPath)) {
        return null;
      }

      try {
        const imageBuffer = fs.readFileSync(entry.assetPath);
        const ext = path.extname(entry.assetPath).toLowerCase();

        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === '.webp') {
          mimeType = 'image/webp';
        } else if (ext === '.hdr') {
          mimeType = 'image/vnd.radiance';
        }

        const fileName = path.basename(entry.assetPath, ext);
        const texture = doc
          .createTexture(fileName)
          .setImage(imageBuffer)
          .setMimeType(mimeType);

        textureMap.set(guid, texture);
        return texture;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Apply texture scale & offset (m_TexEnvs) using KHR_texture_transform extension.
 */
export function applyTextureTransform(
  doc: Document,
  texInfo: TextureInfo | null,
  texEnv: TexEnv
): void {
  if (!texInfo) return;

  const { scale, offset } = texEnv;
  if (scale.x === 1 && scale.y === 1 && offset.x === 0 && offset.y === 0) {
    return;
  }

  const khrTransformExt = doc.createExtension(KHRTextureTransform);
  const transform = khrTransformExt.createTransform();

  transform.setScale([scale.x, scale.y]);
  transform.setOffset([offset.x, offset.y]);

  texInfo.setExtension('KHR_texture_transform', transform);
}
