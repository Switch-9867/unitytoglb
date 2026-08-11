// Convert SourceScene hierarchy to @gltf-transform/core Scene and Node graph

import { Document, Node, Scene, Mesh } from '@gltf-transform/core';
import { SourceScene } from '../model/types.js';
import { convertPosition, convertRotation, convertScale } from './coords.js';
import { attachGltfLight } from './lights.js';
import { attachGltfCamera } from './cameras.js';

export function createGltfSceneGraph(
  doc: Document,
  sourceScene: SourceScene,
  getMeshForNode?: (nodeFileId: number) => Mesh | null
): { scene: Scene; nodeMap: Map<number, Node> } {
  const scene = doc.createScene(String(sourceScene.name || 'Scene'));
  const nodeMap = new Map<number, Node>();

  // 1. Create glTF Node for every SourceNode
  for (const [fileID, sourceNode] of sourceScene.nodes.entries()) {
    const nameStr = String(sourceNode.name ?? `Node_${fileID}`);
    const node = doc.createNode(nameStr);

    const pos = convertPosition(sourceNode.localPosition);
    const rot = convertRotation(sourceNode.localRotation);
    const scale = convertScale(sourceNode.localScale);

    // Only set transform attributes if non-default to keep JSON compact
    if (pos.x !== 0 || pos.y !== 0 || pos.z !== 0) {
      node.setTranslation([pos.x, pos.y, pos.z]);
    }
    if (rot.x !== 0 || rot.y !== 0 || rot.z !== 0 || rot.w !== 1) {
      node.setRotation([rot.x, rot.y, rot.z, rot.w]);
    }
    if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
      node.setScale([scale.x, scale.y, scale.z]);
    }

    if (getMeshForNode) {
      const mesh = getMeshForNode(sourceNode.fileID);
      if (mesh) {
        node.setMesh(mesh);
      }
    }

    nodeMap.set(fileID, node);
  }

  // 2. Attach Cameras
  for (const cam of sourceScene.cameras) {
    const node = nodeMap.get(cam.nodeFileId);
    if (node) {
      attachGltfCamera(doc, node, cam);
    }
  }

  // 3. Attach Lights
  for (const light of sourceScene.lights) {
    const node = nodeMap.get(light.nodeFileId);
    if (node) {
      attachGltfLight(doc, node, light);
    }
  }

  // 4. Build parent-child edges
  for (const [fileID, sourceNode] of sourceScene.nodes.entries()) {
    const node = nodeMap.get(fileID)!;
    for (const childFileId of sourceNode.childFileIds) {
      const childNode = nodeMap.get(childFileId);
      if (childNode) {
        node.addChild(childNode);
      }
    }
  }

  // 5. Add root nodes to glTF Scene in rootOrder
  for (const rootFileId of sourceScene.rootNodeFileIds) {
    const rootNode = nodeMap.get(rootFileId);
    if (rootNode) {
      scene.addChild(rootNode);
    }
  }

  return { scene, nodeMap };
}
