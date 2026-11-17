// SOURCE_MODEL.md — Clean Conceptual Model of the Source

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Ref {
  fileID: number;
  guid?: string;
  type?: number;
}

export type VertexFormat =
  | 'Float32'
  | 'Float16'
  | 'UNorm8'
  | 'SNorm8'
  | 'UNorm16'
  | 'SNorm16'
  | 'UInt8'
  | 'SInt8'
  | 'UInt16'
  | 'SInt16'
  | 'UInt32'
  | 'SInt32';

export interface VertexChannel {
  semantic: number; // 0=POSITION, 1=NORMAL, 2=TANGENT, 3=COLOR, 4=TEXCOORD0, 5=TEXCOORD1, ...
  stream: number;
  offset: number;
  format: VertexFormat;
  formatCode: number;
  dimension: number; // 0 = unused
  sizeBytes: number;
}

export interface VertexData {
  vertexCount: number;
  strideBytes: number;
  channels: VertexChannel[];
  data: Uint8Array;
  streams?: Array<{ streamIndex: number; strideBytes: number; offsetBytes: number }>;
}

export interface SubMesh {
  topology: number; // 0 = Triangles
  firstByte: number;
  indexCount: number;
  baseVertex: number;
  firstVertex: number;
  vertexCount: number;
  localAabb?: { center: Vec3; extent: Vec3 };
}

export interface SourceMesh {
  name: string;
  guid?: string;
  subMeshes: SubMesh[];
  indexFormat: 'uint16' | 'uint32';
  indexBytes: Uint8Array;
  vertexData: VertexData;
  localAabb?: { center: Vec3; extent: Vec3 };
  hasShapes: boolean;
  hasSkin: boolean;
}

export interface TexEnv {
  textureRef: Ref | null;
  scale: { x: number; y: number };
  offset: { x: number; y: number };
}

export interface SourceMaterial {
  name: string;
  guid?: string;
  shaderRef: Ref | null;
  shaderKeywords: string[];
  lightmapFlags: number;
  customRenderQueue: number;
  doubleSidedGI: boolean;
  texEnvs: Record<string, TexEnv>;
  floats: Record<string, number>;
  colors: Record<string, ColorRGBA>;
  stringTags: Record<string, string>;
}

export interface SourceNode {
  fileID: number;
  gameObjectFileId: number;
  name: string;
  layer: number;
  tag: string;
  active: boolean;
  staticFlags: number;

  // Local transform
  localPosition: Vec3;
  localRotation: Quat;
  localScale: Vec3;

  parentFileId: number | null;
  childFileIds: number[];
  rootOrder: number;

  componentFileIds: number[];
}

export interface SourceCamera {
  fileID: number;
  nodeFileId: number;
  projection: 'perspective';
  verticalFovDegrees: number;
  near: number;
  far: number;
  backgroundColor: ColorRGBA;
  clearFlags: number;
  viewportRect: { x: number; y: number; width: number; height: number };
}

export interface SourceLight {
  fileID: number;
  nodeFileId: number;
  type: number; // Unity LightType: 0=Spot, 1=Directional, 2=Point, 3=Area
  color: ColorRGBA;
  intensity: number;
  range: number;
  spotAngleDegrees: number;
  innerSpotAngleDegrees: number;
  shadowsType: number;
  shadowStrength?: number;
  cookieGuid: string | null;
  enabled?: boolean;
  /** m_Lightmapping: 4 = Realtime, 1 = Mixed, 2 = Baked */
  bakeMode?: number;
}

export interface SourceRenderer {
  fileID: number;
  nodeFileId: number;
  kind: 'mesh' | 'ui';
  meshGuid: string | null;
  materialRefs: Ref[];
  castShadows: boolean;
  receiveShadows: boolean;
  lightmapIndex: number;
  staticBatchInfo?: { firstSubMesh: number; subMeshCount: number };
  staticBatchRoot?: Ref | null;
  isStatic: boolean;
}

export interface SourceMeshFilter {
  fileID: number;
  nodeFileId: number;
  meshRef: Ref | null;
}

export interface SourceCollider {
  fileID: number;
  nodeFileId: number;
  kind: 'mesh' | 'box' | 'sphere' | 'capsule';
  enabled: boolean;
  isTrigger: boolean;
  convex?: boolean;
  materialRef: Ref | null;
  meshRef?: Ref | null;
  center?: Vec3;
  size?: Vec3;
  radius?: number;
  height?: number;
  direction?: number;
}

export interface SourceRigidbody {
  fileID: number;
  nodeFileId: number;
  mass: number;
  drag: number;
  angularDrag: number;
  useGravity: boolean;
  isKinematic: boolean;
}

export interface SourceAudioSource {
  fileID: number;
  nodeFileId: number;
  audioClipRef: Ref | null;
  playOnAwake: boolean;
  volume: number;
  pitch: number;
  loop: boolean;
  spatialize: boolean;
  enabled?: boolean;
  mute?: boolean;
  minDistance?: number;
  maxDistance?: number;
  /** 0 = Logarithmic, 1 = Linear, 2 = Custom */
  rolloffMode?: number;
  /** 0 = 2D, 1 = fully 3D (first key of panLevelCustomCurve) */
  spatialBlend?: number;
  dopplerLevel?: number;
  priority?: number;
}

export interface SourceAnimator {
  fileID: number;
  nodeFileId: number;
  controllerRef: Ref | null;
  avatarRef: Ref | null;
}

export interface SourceBehaviour {
  fileID: number;
  nodeFileId: number;
  scriptRef: Ref | null;
  type: 'udon' | 'vrcstation' | 'bakerylightmesh' | 'ui' | 'unknown';
  udonProgramGuid?: string;
  udonVariablesBase64?: string;
  udonObjectRefs?: Ref[];
  fields: Record<string, unknown>;
}

export interface SourceRenderSettings {
  fogEnabled: boolean;
  fogMode: number;
  fogColor: ColorRGBA;
  fogDensity: number;
  ambientSky: ColorRGBA;
  ambientEquator: ColorRGBA;
  ambientGround: ColorRGBA;
  skyboxMaterialRef: Ref | null;
  customReflectionCubemapRef: Ref | null;
}

export interface SourceLightmapSettings {
  giWorkflow: number;
  enableBaked: boolean;
  enableRealtime: boolean;
  lightingDataAssetRef: Ref | null;
  useShadowmask: boolean;
}

export interface SourceOcclusionSettings {
  occlusionDataRef: Ref | null;
}

export interface SourceNavMeshSettings {
  raw: Record<string, unknown>;
}

export interface SourceSceneSettings {
  renderSettings?: SourceRenderSettings;
  lightmapSettings?: SourceLightmapSettings;
  occlusionSettings?: SourceOcclusionSettings;
  navMeshSettings?: SourceNavMeshSettings;
}

export interface SourceScene {
  name: string;
  nodes: Map<number, SourceNode>;
  gameObjectToNode: Map<number, SourceNode>;
  rootNodeFileIds: number[];

  cameras: SourceCamera[];
  lights: SourceLight[];
  renderers: SourceRenderer[];
  meshFilters: SourceMeshFilter[];
  colliders: SourceCollider[];
  rigidbodies: SourceRigidbody[];
  audioSources: SourceAudioSource[];
  animators: SourceAnimator[];
  behaviours: SourceBehaviour[];

  settings: SourceSceneSettings;
  rawDocuments?: Map<number, RawYamlDocument>;
}

export interface RawYamlDocument {
  classId: number;
  fileId: number;
  className: string;
  data: Record<string, unknown>;
}
