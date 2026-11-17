// Convert Unity Lights to glTF 2.0 KHR_lights_punctual extension

import { Document, Node } from '@gltf-transform/core';
import { KHRLightsPunctual } from '@gltf-transform/extensions';
import { SourceLight } from '../model/types.js';

/**
 * Convert SourceLight into glTF KHR_lights_punctual Light and attach to node.
 */
export function attachGltfLight(doc: Document, node: Node, sourceLight: SourceLight): void {
  const khrLightsExt = doc.createExtension(KHRLightsPunctual);

  // Unity LightType: 0 = Spot, 1 = Directional, 2 = Point, 3 = Area (no glTF equivalent; area lights are baked-only)
  let type: 'directional' | 'point' | 'spot';
  if (sourceLight.type === 0) type = 'spot';
  else if (sourceLight.type === 1) type = 'directional';
  else if (sourceLight.type === 2) type = 'point';
  else return;

  const light = khrLightsExt
    .createLight()
    .setName(`Light_${sourceLight.fileID}`)
    .setType(type)
    .setColor([sourceLight.color.r, sourceLight.color.g, sourceLight.color.b])
    .setIntensity(sourceLight.intensity);

  if (type === 'point' || type === 'spot') {
    light.setRange(sourceLight.range);
  }

  if (type === 'spot') {
    const outerRad = (sourceLight.spotAngleDegrees * Math.PI) / 180.0 / 2.0;
    const innerRad = (sourceLight.innerSpotAngleDegrees * Math.PI) / 180.0 / 2.0;
    light.setOuterConeAngle(outerRad);
    light.setInnerConeAngle(innerRad);
  }

  node.setExtension('KHR_lights_punctual', light);
}
