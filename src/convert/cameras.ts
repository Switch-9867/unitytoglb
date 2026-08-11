// Convert Unity Cameras to glTF 2.0 Cameras

import { Document, Node } from '@gltf-transform/core';
import { SourceCamera } from '../model/types.js';

/**
 * Convert SourceCamera into glTF Camera and attach to node.
 */
export function attachGltfCamera(doc: Document, node: Node, sourceCamera: SourceCamera): void {
  const yfovRad = (sourceCamera.verticalFovDegrees * Math.PI) / 180.0;

  const camera = doc
    .createCamera(`Camera_${sourceCamera.fileID}`)
    .setType('perspective')
    .setYFov(yfovRad)
    .setZNear(sourceCamera.near)
    .setZFar(sourceCamera.far);

  node.setCamera(camera);
}
