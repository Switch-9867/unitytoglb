// Parser for Unity Scene (.unity) YAML documents into a SourceScene model

import {
  SourceScene,
  SourceNode,
  SourceCamera,
  SourceLight,
  SourceRenderer,
  SourceMeshFilter,
  SourceCollider,
  SourceRigidbody,
  SourceAudioSource,
  SourceAnimator,
  SourceBehaviour,
  SourceSceneSettings,
  RawYamlDocument,
  Ref,
  Vec3,
  Quat,
} from '../model/types.js';
import { parseUnityYamlFile } from './yaml.js';

export function parseSourceScene(yamlContent: string, sceneName: string = 'ORGANIZM', keepRawDocs: boolean = false): SourceScene {
  const rawDocs = parseUnityYamlFile(yamlContent);
  return parseRawDocsToSourceScene(rawDocs, sceneName, keepRawDocs);
}

export function parseRawDocsToSourceScene(rawDocs: RawYamlDocument[], sceneName: string, keepRawDocs: boolean = false): SourceScene {
  const rawDocMap = keepRawDocs ? new Map<number, RawYamlDocument>() : undefined;
  if (keepRawDocs && rawDocMap) {
    for (const doc of rawDocs) {
      rawDocMap.set(doc.fileId, doc);
    }
  }

  // Maps for identity resolution
  // GameObject fileID -> GameObject data
  const gameObjects = new Map<number, Record<string, unknown>>();
  // Transform fileID -> Transform data
  const transforms = new Map<number, Record<string, unknown>>();

  // Transform fileID -> SourceNode
  const nodes = new Map<number, SourceNode>();
  // GameObject fileID -> SourceNode
  const gameObjectToNode = new Map<number, SourceNode>();

  const cameras: SourceCamera[] = [];
  const lights: SourceLight[] = [];
  const renderers: SourceRenderer[] = [];
  const meshFilters: SourceMeshFilter[] = [];
  const colliders: SourceCollider[] = [];
  const rigidbodies: SourceRigidbody[] = [];
  const audioSources: SourceAudioSource[] = [];
  const animators: SourceAnimator[] = [];
  const behaviours: SourceBehaviour[] = [];

  const settings: SourceSceneSettings = {};

  // First pass: collect GameObjects and Transforms
  for (const doc of rawDocs) {
    if (doc.classId === 1) {
      // GameObject
      gameObjects.set(doc.fileId, doc.data);
    } else if (doc.classId === 4 || doc.classId === 224) {
      // Transform / RectTransform (UI objects; RectTransform extends Transform and
      // serializes the same m_LocalPosition / m_LocalRotation / m_LocalScale / m_Father / m_Children)
      transforms.set(doc.fileId, doc.data);
    }
  }

  // Build SourceNodes from Transforms + GameObjects
  for (const [transformFileId, transformData] of transforms.entries()) {
    const goRef = parseRef(transformData['m_GameObject']);
    const goFileId = goRef ? goRef.fileID : 0;
    const goData = gameObjects.get(goFileId) || {};

    const name = (goData['m_Name'] as string) || `Node_${transformFileId}`;
    const layer = (goData['m_Layer'] as number) ?? 0;
    const tag = (goData['m_TagString'] as string) || 'Untagged';
    const active = goData['m_IsActive'] === 1 || goData['m_IsActive'] === true || goData['m_IsActive'] === undefined;
    const staticFlags = (goData['m_StaticEditorFlags'] as number) ?? 0;

    const posObj = (transformData['m_LocalPosition'] as Record<string, number>) || { x: 0, y: 0, z: 0 };
    const rotObj = (transformData['m_LocalRotation'] as Record<string, number>) || { x: 0, y: 0, z: 0, w: 1 };
    const scaleObj = (transformData['m_LocalScale'] as Record<string, number>) || { x: 1, y: 1, z: 1 };

    const localPosition: Vec3 = { x: posObj.x ?? 0, y: posObj.y ?? 0, z: posObj.z ?? 0 };
    const localRotation: Quat = { x: rotObj.x ?? 0, y: rotObj.y ?? 0, z: rotObj.z ?? 0, w: rotObj.w ?? 1 };
    const localScale: Vec3 = { x: scaleObj.x ?? 1, y: scaleObj.y ?? 1, z: scaleObj.z ?? 1 };

    const fatherRef = parseRef(transformData['m_Father']);
    const parentFileId = fatherRef && fatherRef.fileID !== 0 ? fatherRef.fileID : null;

    const rawChildren = transformData['m_Children'];
    const childFileIds: number[] = [];
    if (Array.isArray(rawChildren)) {
      for (const childItem of rawChildren) {
        const cRef = parseRef(childItem);
        if (cRef && cRef.fileID !== 0) {
          childFileIds.push(cRef.fileID);
        }
      }
    }

    const rootOrder = (transformData['m_RootOrder'] as number) ?? 0;

    // Component file IDs
    const componentFileIds: number[] = [];
    const rawComponents = goData['m_Component'];
    if (Array.isArray(rawComponents)) {
      for (const compItem of rawComponents) {
        const cRef = parseRef(compItem) || (compItem && typeof compItem === 'object' ? parseRef(compItem['component']) : null);
        if (cRef && cRef.fileID !== 0) {
          componentFileIds.push(cRef.fileID);
        }
      }
    }

    const node: SourceNode = {
      fileID: transformFileId,
      gameObjectFileId: goFileId,
      name,
      layer,
      tag,
      active,
      staticFlags,
      localPosition,
      localRotation,
      localScale,
      parentFileId,
      childFileIds,
      rootOrder,
      componentFileIds,
    };

    nodes.set(transformFileId, node);
    if (goFileId !== 0) {
      gameObjectToNode.set(goFileId, node);
    }
  }

  // Helper to find parent transform fileID for a component by its m_GameObject
  const getNodeFileIdForComponent = (compData: Record<string, unknown>): number => {
    const goRef = parseRef(compData['m_GameObject']);
    if (goRef && goRef.fileID !== 0) {
      const node = gameObjectToNode.get(goRef.fileID);
      if (node) return node.fileID;
    }
    return 0;
  };

  // Second pass: parse components & scene settings
  for (const doc of rawDocs) {
    const d = doc.data;
    switch (doc.classId) {
      case 20: {
        // Camera
        const nodeFileId = getNodeFileIdForComponent(d);
        const fov = (d['field of view'] as number) ?? 60;
        const near = (d['near clip plane'] as number) ?? 0.3;
        const far = (d['far clip plane'] as number) ?? 1000;
        const bgObj = (d['m_BackGroundColor'] as Record<string, number>) || { r: 0, g: 0, b: 0, a: 1 };
        const clearFlags = (d['m_ClearFlags'] as number) ?? 1;
        const vpObj = (d['m_NormalizedViewPortRect'] as Record<string, number>) || { x: 0, y: 0, width: 1, height: 1 };

        cameras.push({
          fileID: doc.fileId,
          nodeFileId,
          projection: 'perspective',
          verticalFovDegrees: fov,
          near,
          far,
          backgroundColor: { r: bgObj.r ?? 0, g: bgObj.g ?? 0, b: bgObj.b ?? 0, a: bgObj.a ?? 1 },
          clearFlags,
          viewportRect: { x: vpObj.x ?? 0, y: vpObj.y ?? 0, width: vpObj.width ?? 1, height: vpObj.height ?? 1 },
        });
        break;
      }
      case 108: {
        // Light
        const nodeFileId = getNodeFileIdForComponent(d);
        const type = (d['m_Type'] as number) ?? 0;
        const colObj = (d['m_Color'] as Record<string, number>) || { r: 1, g: 1, b: 1, a: 1 };
        const intensity = (d['m_Intensity'] as number) ?? 1;
        const range = (d['m_Range'] as number) ?? 10;
        const spotAngleDegrees = (d['m_SpotAngle'] as number) ?? 30;
        const innerSpotAngleDegrees = (d['m_InnerSpotAngle'] as number) ?? 21.8;
        const shadowsObj = d['m_Shadows'] as Record<string, unknown>;
        const shadowsType = shadowsObj ? ((shadowsObj['m_Type'] as number) ?? 0) : 0;
        const cookieRef = parseRef(d['m_Cookie']);

        lights.push({
          fileID: doc.fileId,
          nodeFileId,
          type,
          color: { r: colObj.r ?? 1, g: colObj.g ?? 1, b: colObj.b ?? 1, a: colObj.a ?? 1 },
          intensity,
          range,
          spotAngleDegrees,
          innerSpotAngleDegrees,
          shadowsType,
          cookieGuid: cookieRef?.guid || null,
        });
        break;
      }
      case 23:
      case 222: {
        // MeshRenderer (23) or CanvasRenderer (222)
        const nodeFileId = getNodeFileIdForComponent(d);
        const kind = doc.classId === 222 ? 'ui' : 'mesh';

        const materialRefs: Ref[] = [];
        const rawMats = d['m_Materials'];
        if (Array.isArray(rawMats)) {
          for (const mItem of rawMats) {
            const r = parseRef(mItem);
            if (r) materialRefs.push(r);
          }
        }

        const castShadows = d['m_CastShadows'] === 1 || d['m_CastShadows'] === true;
        const receiveShadows = d['m_ReceiveShadows'] === 1 || d['m_ReceiveShadows'] === true;
        const lightmapIndex = (d['m_LightmapIndex'] as number) ?? -1;

        let staticBatchInfo: { firstSubMesh: number; subMeshCount: number } | undefined;
        if (d['m_StaticBatchInfo'] && typeof d['m_StaticBatchInfo'] === 'object') {
          const sb = d['m_StaticBatchInfo'] as Record<string, number>;
          staticBatchInfo = {
            firstSubMesh: sb.firstSubMesh ?? 0,
            subMeshCount: sb.subMeshCount ?? 0,
          };
        }
        const staticBatchRoot = parseRef(d['m_StaticBatchRoot']);

        renderers.push({
          fileID: doc.fileId,
          nodeFileId,
          kind,
          meshGuid: null,
          materialRefs,
          castShadows,
          receiveShadows,
          lightmapIndex,
          staticBatchInfo,
          staticBatchRoot,
          isStatic: lightmapIndex >= 0 || (staticBatchInfo && staticBatchInfo.subMeshCount > 0) || false,
        });
        break;
      }
      case 33: {
        // MeshFilter
        const nodeFileId = getNodeFileIdForComponent(d);
        const meshRef = parseRef(d['m_Mesh']);

        meshFilters.push({
          fileID: doc.fileId,
          nodeFileId,
          meshRef,
        });
        break;
      }
      case 64:
      case 65:
      case 135:
      case 136: {
        // Collider
        const nodeFileId = getNodeFileIdForComponent(d);
        const kind = doc.classId === 64 ? 'mesh' : doc.classId === 65 ? 'box' : doc.classId === 135 ? 'sphere' : 'capsule';
        const isTrigger = d['m_IsTrigger'] === 1 || d['m_IsTrigger'] === true;
        const materialRef = parseRef(d['m_Material']);
        const meshRef = doc.classId === 64 ? parseRef(d['m_Mesh']) : null;

        const centerObj = d['m_Center'] as Record<string, number>;
        const center = centerObj ? { x: centerObj.x ?? 0, y: centerObj.y ?? 0, z: centerObj.z ?? 0 } : undefined;
        const sizeObj = d['m_Size'] as Record<string, number>;
        const size = sizeObj ? { x: sizeObj.x ?? 0, y: sizeObj.y ?? 0, z: sizeObj.z ?? 0 } : undefined;

        colliders.push({
          fileID: doc.fileId,
          nodeFileId,
          kind,
          isTrigger,
          materialRef,
          meshRef,
          center,
          size,
          radius: (d['m_Radius'] as number) ?? undefined,
          height: (d['m_Height'] as number) ?? undefined,
          direction: (d['m_Direction'] as number) ?? undefined,
        });
        break;
      }
      case 54: {
        // Rigidbody
        const nodeFileId = getNodeFileIdForComponent(d);
        rigidbodies.push({
          fileID: doc.fileId,
          nodeFileId,
          mass: (d['m_Mass'] as number) ?? 1,
          drag: (d['m_Drag'] as number) ?? 0,
          angularDrag: (d['m_AngularDrag'] as number) ?? 0.05,
          useGravity: d['m_UseGravity'] === 1 || d['m_UseGravity'] === true,
          isKinematic: d['m_IsKinematic'] === 1 || d['m_IsKinematic'] === true,
        });
        break;
      }
      case 82: {
        // AudioSource
        const nodeFileId = getNodeFileIdForComponent(d);
        const audioClipRef = parseRef(d['m_audioClip']);
        audioSources.push({
          fileID: doc.fileId,
          nodeFileId,
          audioClipRef,
          playOnAwake: d['m_PlayOnAwake'] === 1 || d['m_PlayOnAwake'] === true,
          volume: (d['m_Volume'] as number) ?? 1,
          pitch: (d['m_Pitch'] as number) ?? 1,
          loop: d['Loop'] === 1 || d['Loop'] === true,
          spatialize: d['Spatialize'] === 1 || d['Spatialize'] === true,
        });
        break;
      }
      case 95: {
        // Animator
        const nodeFileId = getNodeFileIdForComponent(d);
        const controllerRef = parseRef(d['m_Controller']);
        const avatarRef = parseRef(d['m_Avatar']);
        animators.push({
          fileID: doc.fileId,
          nodeFileId,
          controllerRef,
          avatarRef,
        });
        break;
      }
      case 114: {
        // MonoBehaviour
        const nodeFileId = getNodeFileIdForComponent(d);
        const scriptRef = parseRef(d['m_Script']);

        let type: 'udon' | 'vrcstation' | 'bakerylightmesh' | 'ui' | 'unknown' = 'unknown';
        if (scriptRef && scriptRef.guid) {
          if (scriptRef.guid === 'ca9c02d562e1d03a6f385ba2f733eef7') type = 'udon';
          else if (scriptRef.guid === '48c5fe8ecd6bf3d06a561ed0e0318d97') type = 'vrcstation';
        }

        const udonProgRef = parseRef(d['serializedProgramAsset']);
        const udonVariablesBase64 = d['serializedPublicVariablesBytesString'] as string | undefined;

        const udonObjectRefs: Ref[] = [];
        const rawUdonRefs = d['publicVariablesUnityEngineObjects'];
        if (Array.isArray(rawUdonRefs)) {
          for (const uItem of rawUdonRefs) {
            const r = parseRef(uItem);
            if (r) udonObjectRefs.push(r);
          }
        }

        behaviours.push({
          fileID: doc.fileId,
          nodeFileId,
          scriptRef,
          type,
          udonProgramGuid: udonProgRef?.guid,
          udonVariablesBase64,
          udonObjectRefs: udonObjectRefs.length > 0 ? udonObjectRefs : undefined,
          fields: d,
        });
        break;
      }
      case 104: {
        // RenderSettings
        const fogColorObj = (d['m_FogColor'] as Record<string, number>) || { r: 0.5, g: 0.5, b: 0.5, a: 1 };
        const skyObj = (d['m_AmbientSkyColor'] as Record<string, number>) || { r: 0.2, g: 0.2, b: 0.2, a: 1 };
        const eqObj = (d['m_AmbientEquatorColor'] as Record<string, number>) || { r: 0.2, g: 0.2, b: 0.2, a: 1 };
        const grObj = (d['m_AmbientGroundColor'] as Record<string, number>) || { r: 0.2, g: 0.2, b: 0.2, a: 1 };

        settings.renderSettings = {
          fogEnabled: d['m_Fog'] === 1 || d['m_Fog'] === true,
          fogMode: (d['m_FogMode'] as number) ?? 0,
          fogColor: { r: fogColorObj.r ?? 0.5, g: fogColorObj.g ?? 0.5, b: fogColorObj.b ?? 0.5, a: fogColorObj.a ?? 1 },
          fogDensity: (d['m_FogDensity'] as number) ?? 0.01,
          ambientSky: { r: skyObj.r ?? 0.2, g: skyObj.g ?? 0.2, b: skyObj.b ?? 0.2, a: skyObj.a ?? 1 },
          ambientEquator: { r: eqObj.r ?? 0.2, g: eqObj.g ?? 0.2, b: eqObj.b ?? 0.2, a: eqObj.a ?? 1 },
          ambientGround: { r: grObj.r ?? 0.2, g: grObj.g ?? 0.2, b: grObj.b ?? 0.2, a: grObj.a ?? 1 },
          skyboxMaterialRef: parseRef(d['m_SkyboxMaterial']),
          customReflectionCubemapRef: parseRef(d['m_CustomReflection']),
        };
        break;
      }
      case 157: {
        // LightmapSettings
        settings.lightmapSettings = {
          giWorkflow: (d['m_GIWorkflowMode'] as number) ?? 0,
          enableBaked: true,
          enableRealtime: false,
          lightingDataAssetRef: parseRef(d['m_LightingDataAsset']),
          useShadowmask: d['m_UseShadowmask'] === 1 || d['m_UseShadowmask'] === true,
        };
        break;
      }
      case 29: {
        // OcclusionCullingSettings
        settings.occlusionSettings = {
          occlusionDataRef: parseRef(d['m_OcclusionCullingData']),
        };
        break;
      }
      case 196: {
        // NavMeshSettings
        settings.navMeshSettings = {
          raw: d,
        };
        break;
      }
    }
  }

  // Associate MeshFilters with Renderers on the same node
  const meshFilterMapByNode = new Map<number, SourceMeshFilter>();
  for (const mf of meshFilters) {
    if (mf.nodeFileId !== 0) {
      meshFilterMapByNode.set(mf.nodeFileId, mf);
    }
  }
  for (const r of renderers) {
    const mf = meshFilterMapByNode.get(r.nodeFileId);
    if (mf && mf.meshRef) {
      if (mf.meshRef.guid && mf.meshRef.guid !== '0000000000000000e000000000000000') {
        r.meshGuid = mf.meshRef.guid;
      } else if (mf.meshRef.fileID) {
        r.meshGuid = `builtin_${mf.meshRef.fileID}`;
      }
    }
  }

  // Compute Root Nodes sorted by rootOrder
  const rootNodeFileIds: number[] = [];
  for (const node of nodes.values()) {
    if (node.parentFileId === null) {
      rootNodeFileIds.push(node.fileID);
    }
  }
  rootNodeFileIds.sort((a, b) => {
    const nodeA = nodes.get(a)!;
    const nodeB = nodes.get(b)!;
    return nodeA.rootOrder - nodeB.rootOrder;
  });

  return {
    name: sceneName,
    nodes,
    gameObjectToNode,
    rootNodeFileIds,
    cameras,
    lights,
    renderers,
    meshFilters,
    colliders,
    rigidbodies,
    audioSources,
    animators,
    behaviours,
    settings,
    rawDocuments: rawDocMap,
  };
}

export function parseRef(val: unknown): Ref | null {
  if (!val || typeof val !== 'object') return null;
  const obj = val as Record<string, unknown>;
  const fileID = (obj['fileID'] as number) ?? 0;
  const guid = (obj['guid'] as string) || undefined;
  const type = (obj['type'] as number) || undefined;

  if (fileID === 0 && !guid) return null;
  return { fileID, guid, type };
}
