// Resonite import layout: restructures the converted glTF document and produces a JSON manifest
// that a separate importer tool (e.g. over ResoniteLink) uses to finish setting up the world.
//
// GLB layout:
//   <SceneName>
//   ├─ Assets
//   │  ├─ Textures    empty slot per texture   (importer uploads the file and adds StaticTexture2D)
//   │  ├─ Materials   empty slot per material  (importer adds the material component)
//   │  └─ Colliders   slot per collision-only mesh (geometry that has no visible counterpart)
//   └─ World         original Unity hierarchy (visible meshes, lights, cameras)
//
// Mesh colliders whose geometry is the same as the visible mesh do NOT get a Colliders entry;
// the manifest points them at the visible mesh instead.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Document, Node, Mesh, Material } from '@gltf-transform/core';
import { SourceMesh, SourceMaterial, SourceCollider, Ref, Vec3 } from '../model/types.js';
import { GuidIndex } from '../io/guidIndex.js';
import { colliderMeshKey } from '../io/assetLoader.js';
import { createBuiltinPrimitiveMesh } from '../parse/builtinPrimitives.js';
import { LIGHTMAP_INDEX_NONE } from '../parse/lightingData.js';
import { parseTexture2DAsset, UNITY_TEXTURE_FORMAT_BC6H } from '../parse/texture2d.js';
import { decodeBc6hImage } from '../parse/bc6h.js';
import { writeRadianceHdr } from '../io/hdr.js';
import { SourceBundle, ConversionContext, computeInactiveNodes } from './convert.js';
import { createGltfMesh } from './geometry.js';
import { convertPosition } from './coords.js';

export const RESONITE_MANIFEST_VERSION = 1;

/** Location of a slot in the imported hierarchy, relative to the root slot (root itself = []). */
export interface SlotRef {
  /** Slot names from the root's children down to the slot. */
  path: string[];
  /** Child indices from the root down to the slot (robust against duplicate sibling names). */
  indexPath: number[];
}

export interface ManifestTexture {
  id: string;
  name: string;
  slot: SlotRef;
  /** Path of the texture file, relative to the manifest. */
  file: string;
  /** Upload color profile (ResoniteLink / reso naming): Linear for normal maps and other data textures. */
  colorProfile: 'sRGB' | 'Linear';
  unity: {
    textureType: number | null; // 0 = Default, 1 = NormalMap, 2 = GUI, 8 = Sprite, 10 = SingleChannel
    sRGB: boolean | null;
    isNormalMap: boolean;
    alphaIsTransparency: boolean | null;
    mipmaps: boolean | null;
    filterMode: number | null; // 0 = Point, 1 = Bilinear, 2 = Trilinear
    anisoLevel: number | null;
    wrapU: number | null; // 0 = Repeat, 1 = Clamp, 2 = Mirror, 3 = MirrorOnce
    wrapV: number | null;
  };
}

export interface ManifestTextureBinding {
  texture: string | null; // ManifestTexture.id
  scale: [number, number];
  offset: [number, number];
}

export interface ManifestMaterial {
  id: string;
  name: string;
  slot: SlotRef;
  /** Normalized PBR values, ready to map onto a Resonite PBS material. */
  pbr: {
    albedoColor: [number, number, number, number];
    albedoTexture: ManifestTextureBinding | null;
    normalTexture: ManifestTextureBinding | null;
    normalScale: number;
    metallic: number;
    smoothness: number;
    metallicGlossTexture: ManifestTextureBinding | null;
    occlusionTexture: ManifestTextureBinding | null;
    occlusionStrength: number;
    emissiveColor: [number, number, number, number];
    emissiveTexture: ManifestTextureBinding | null;
    alphaMode: 'opaque' | 'cutout' | 'blend';
    alphaCutoff: number;
    doubleSided: boolean;
  };
  /** Raw Unity material data, for shader-specific mappings. */
  unity: {
    guid: string | null;
    shaderGuid: string | null;
    shaderName: string | null;
    keywords: string[];
    renderQueue: number;
    floats: Record<string, number>;
    colors: Record<string, [number, number, number, number]>;
    textures: Record<string, ManifestTextureBinding>;
  } | null;
}

export interface ManifestRendererLightmap {
  /** Index into manifest.lightmaps */
  index: number;
  /**
   * Scale/offset to apply to TEXCOORD_1 in Unity UV convention (v up): uv * (x, y) + (z, w).
   * [1, 1, 0, 0] for static-batched renderers, whose UV1 already has it baked in.
   */
  scaleOffset: [number, number, number, number];
  /** The same transform in glTF UV convention (v down), for use on the GLB's TEXCOORD_1 directly. */
  scaleOffsetGltf: [number, number, number, number];
}

export interface ManifestLightmap {
  index: number;
  id: string;
  name: string;
  /** Linear HDR Radiance file, relative to the manifest. Top row first, like other image files. */
  file: string;
  width: number;
  height: number;
  /** Brightest channel value in the lightmap (values above 1 are normal for HDR lightmaps). */
  maxValue: number;
}

export interface ManifestRenderer {
  slot: SlotRef;
  /** Baked lightmap for this renderer (sample with TEXCOORD_1), or null when not lightmapped. */
  lightmap: ManifestRendererLightmap | null;
  /** False when the Unity MeshRenderer was disabled (invisible in the original world). */
  enabled: boolean;
  /** Material id for each glTF primitive (submesh) of the slot's mesh, in primitive order. */
  materials: string[];
  castShadows: boolean;
  receiveShadows: boolean;
}

export type ManifestColliderMesh =
  | { source: 'visible'; slot: SlotRef } // use the visible mesh on this slot
  | { source: 'collider'; id: string; slot: SlotRef }; // use the mesh under Assets/Colliders

export interface ManifestCollider {
  slot: SlotRef;
  type: 'box' | 'sphere' | 'capsule' | 'mesh';
  enabled: boolean;
  isTrigger: boolean;
  /** Local-space center in glTF coordinates (right-handed, Z flipped from Unity). */
  center?: [number, number, number];
  /** Local-space center exactly as authored in Unity (left-handed, +Y up, like Resonite). */
  unityCenter?: [number, number, number];
  size?: [number, number, number];
  radius?: number;
  height?: number;
  /** Capsule axis: 0 = X, 1 = Y, 2 = Z. */
  direction?: number;
  convex?: boolean;
  mesh?: ManifestColliderMesh | null;
  physicMaterial: string | null; // ManifestPhysicMaterial.id
}

export interface ManifestPhysicMaterial {
  id: string;
  name: string;
  dynamicFriction: number | null;
  staticFriction: number | null;
  bounciness: number | null;
  frictionCombine: number | null; // 0 = Average, 1 = Minimum, 2 = Multiply, 3 = Maximum
  bounceCombine: number | null;
}

export interface ManifestRigidbody {
  slot: SlotRef;
  mass: number;
  drag: number;
  angularDrag: number;
  useGravity: boolean;
  isKinematic: boolean;
}

export interface ManifestLight {
  slot: SlotRef;
  type: 'directional' | 'point' | 'spot' | 'area';
  enabled: boolean;
  /** Unity bake mode. 'baked' lights only contributed to lightmaps in Unity. */
  bakeMode: 'realtime' | 'mixed' | 'baked';
  color: [number, number, number, number];
  intensity: number;
  range: number;
  spotAngle: number;
  shadows: 'none' | 'hard' | 'soft';
  shadowStrength: number;
  /** True when the light is also present in the GLB as KHR_lights_punctual (area lights are not). */
  inGlb: boolean;
}

export interface ManifestAudioClip {
  id: string;
  name: string;
  /** Path of the audio file, relative to the manifest. */
  file: string;
}

export interface ManifestAudioSource {
  slot: SlotRef;
  clip: string | null; // ManifestAudioClip.id
  enabled: boolean;
  playOnAwake: boolean;
  loop: boolean;
  mute: boolean;
  volume: number;
  pitch: number;
  /** 0 = 2D, 1 = fully 3D */
  spatialBlend: number;
  minDistance: number;
  maxDistance: number;
  rolloff: 'logarithmic' | 'linear' | 'custom';
  dopplerLevel: number;
  priority: number;
}

export interface ResoniteManifest {
  version: number;
  generator: string;
  scene: string;
  coordinateSystem: string;
  files: { glb: string; texturesDir: string; audioDir: string; lightmapsDir: string };
  slots: { root: SlotRef; assets: SlotRef; textures: SlotRef; materials: SlotRef; colliders: SlotRef; world: SlotRef };
  textures: ManifestTexture[];
  materials: ManifestMaterial[];
  colliderMeshes: Array<{ id: string; name: string; slot: SlotRef; triangles: number }>;
  renderers: ManifestRenderer[];
  colliders: ManifestCollider[];
  physicMaterials: ManifestPhysicMaterial[];
  rigidbodies: ManifestRigidbody[];
  /** Topmost inactive GameObjects; deactivate these slots (their children inherit it). */
  inactiveSlots: SlotRef[];
  /** Baked lightmaps; renderers reference them by index. */
  lightmaps: ManifestLightmap[];
  lightmapsMode: 'nonDirectional' | 'directional' | null;
  lights: ManifestLight[];
  audioClips: ManifestAudioClip[];
  audioSources: ManifestAudioSource[];
  stats: {
    textures: number;
    materials: number;
    renderers: number;
    colliders: number;
    meshCollidersUsingVisibleMesh: number;
    collisionOnlyMeshes: number;
    hiddenRenderers: number;
    lightmaps: number;
    lightmappedRenderers: number;
    inactiveSlots: number;
    lights: number;
    audioClips: number;
    audioSources: number;
  };
  warnings: string[];
}

export interface ResoniteLayoutOptions {
  glbFileName: string;
  /** Directory (relative to the manifest) the texture files are copied to. */
  texturesDirName: string;
  /** Absolute directory to copy texture files into; omit to skip copying. */
  texturesDirAbs?: string;
  /** Directory (relative to the manifest) the audio files are copied to. */
  audioDirName: string;
  /** Absolute directory to copy audio files into; omit to skip copying. */
  audioDirAbs?: string;
  /** Directory (relative to the manifest) the decoded lightmaps are written to. */
  lightmapsDirName?: string;
  /** Absolute directory to write decoded lightmaps into; omit to skip decoding. */
  lightmapsDirAbs?: string;
}

/** Hands out unique names within one folder. */
class NameAllocator {
  private used = new Set<string>();
  take(base: string): string {
    const clean = (base || 'Unnamed').replace(/[\\/:*?"<>|]/g, '_');
    let name = clean;
    for (let i = 2; this.used.has(name.toLowerCase()); i++) name = `${clean}_${i}`;
    this.used.add(name.toLowerCase());
    return name;
  }
}

function readMetaNumber(meta: string, key: string): number | null {
  const m = meta.match(new RegExp(`^\\s*${key}:\\s*(-?[0-9.]+)\\s*$`, 'm'));
  return m ? Number(m[1]) : null;
}

function readTextureMeta(assetPath: string): ManifestTexture['unity'] {
  let meta = '';
  try {
    meta = fs.readFileSync(`${assetPath}.meta`, 'utf8');
  } catch {
    /* no meta file */
  }
  const bool = (k: string) => {
    const v = readMetaNumber(meta, k);
    return v === null ? null : v !== 0;
  };
  const textureType = readMetaNumber(meta, 'textureType');
  return {
    textureType,
    sRGB: bool('sRGBTexture'),
    isNormalMap: textureType === 1,
    alphaIsTransparency: bool('alphaIsTransparency'),
    mipmaps: bool('enableMipMap'),
    filterMode: readMetaNumber(meta, 'filterMode'),
    anisoLevel: readMetaNumber(meta, 'aniso'),
    wrapU: readMetaNumber(meta, 'wrapU'),
    wrapV: readMetaNumber(meta, 'wrapV'),
  };
}

function readShaderName(guid: string | undefined, guidIndex?: GuidIndex): string | null {
  if (!guid || !guidIndex) return null;
  const entry = guidIndex.get(guid);
  if (!entry) return null;
  try {
    const fd = fs.openSync(entry.assetPath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const m = buf.subarray(0, n).toString('utf8').match(/Shader\s+"([^"]+)"/);
    return m ? m[1] : path.basename(entry.assetPath, path.extname(entry.assetPath));
  } catch {
    return null;
  }
}

function readPhysicMaterial(ref: Ref, guidIndex?: GuidIndex): ManifestPhysicMaterial | null {
  if (!ref.guid || !guidIndex) return null;
  const entry = guidIndex.get(ref.guid);
  let yaml = '';
  try {
    if (entry) yaml = fs.readFileSync(entry.assetPath, 'utf8');
  } catch {
    /* unreadable */
  }
  const name = yaml.match(/^\s*m_Name:\s*(.*)$/m)?.[1]?.trim() || (entry ? path.basename(entry.assetPath) : ref.guid);
  return {
    id: ref.guid,
    name,
    dynamicFriction: readMetaNumber(yaml, 'dynamicFriction'),
    staticFriction: readMetaNumber(yaml, 'staticFriction'),
    bounciness: readMetaNumber(yaml, 'bounciness'),
    frictionCombine: readMetaNumber(yaml, 'frictionCombine'),
    bounceCombine: readMetaNumber(yaml, 'bounceCombine'),
  };
}

function vec3(v: Vec3): [number, number, number] {
  return [v.x, v.y, v.z];
}

function meshTriangles(mesh: Mesh): number {
  let tris = 0;
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += Math.floor((idx ? idx.getCount() : prim.getAttribute('POSITION')?.getCount() ?? 0) / 3);
  }
  return tris;
}

function meshBounds(mesh: Mesh): { min: number[]; max: number[] } | null {
  let min: number[] | null = null;
  let max: number[] | null = null;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const pmin = pos.getMin([]);
    const pmax = pos.getMax([]);
    min = min ? min.map((v, i) => Math.min(v, pmin[i])) : pmin;
    max = max ? max.map((v, i) => Math.max(v, pmax[i])) : pmax;
  }
  return min && max ? { min, max } : null;
}

/** True when a Unity source mesh has the same geometry as an already converted visible glTF mesh. */
function isSameGeometry(source: SourceMesh, visible: Mesh): boolean {
  const srcTris = source.subMeshes.reduce((n, s) => n + Math.floor(s.indexCount / 3), 0);
  if (srcTris !== meshTriangles(visible)) return false;
  const aabb = source.localAabb;
  const bounds = meshBounds(visible);
  if (!aabb || !bounds) return false;
  // Unity AABB (left-handed) -> glTF: flip Z
  const c = convertPosition(aabb.center);
  const e = aabb.extent;
  const srcMin = [c.x - e.x, c.y - e.y, c.z - e.z];
  const srcMax = [c.x + e.x, c.y + e.y, c.z + e.z];
  const tol = 1e-3 * Math.max(1, Math.hypot(e.x, e.y, e.z));
  for (let i = 0; i < 3; i++) {
    if (Math.abs(srcMin[i] - bounds.min[i]) > tol || Math.abs(srcMax[i] - bounds.max[i]) > tol) return false;
  }
  return true;
}

function textureBinding(
  env: { textureRef: Ref | null; scale: { x: number; y: number }; offset: { x: number; y: number } } | undefined,
  textureIds: Map<string, string>
): ManifestTextureBinding | null {
  if (!env?.textureRef?.guid) return null;
  const id = textureIds.get(env.textureRef.guid);
  if (!id) return null;
  return { texture: id, scale: [env.scale.x, env.scale.y], offset: [env.offset.x, env.offset.y] };
}

function firstEnv(mat: SourceMaterial, keys: string[]) {
  for (const k of keys) {
    if (mat.texEnvs[k]?.textureRef?.guid) return mat.texEnvs[k];
  }
  return undefined;
}

function rgba(c: { r: number; g: number; b: number; a: number } | undefined, fallback: [number, number, number, number]) {
  return c ? ([c.r, c.g, c.b, c.a] as [number, number, number, number]) : fallback;
}

function pbrFromGltf(mat: Material): ManifestMaterial['pbr'] {
  const bc = mat.getBaseColorFactor() as [number, number, number, number];
  const em = mat.getEmissiveFactor();
  const alpha = mat.getAlphaMode();
  return {
    albedoColor: [bc[0], bc[1], bc[2], bc[3]],
    albedoTexture: null,
    normalTexture: null,
    normalScale: 1,
    metallic: mat.getMetallicFactor(),
    smoothness: 1 - mat.getRoughnessFactor(),
    metallicGlossTexture: null,
    occlusionTexture: null,
    occlusionStrength: 1,
    emissiveColor: [em[0], em[1], em[2], 1],
    emissiveTexture: null,
    alphaMode: alpha === 'MASK' ? 'cutout' : alpha === 'BLEND' ? 'blend' : 'opaque',
    alphaCutoff: mat.getAlphaCutoff(),
    doubleSided: mat.getDoubleSided(),
  };
}

/**
 * Restructure the converted document into the Resonite layout and build the import manifest.
 * Must be called on a document produced by buildGltfDocument() with untexturedMaterials enabled.
 */
export function applyResoniteLayout(
  doc: Document,
  bundle: SourceBundle,
  ctx: ConversionContext,
  options: ResoniteLayoutOptions
): ResoniteManifest {
  const warnings: string[] = [];
  const sceneName = String(bundle.scene.name || 'Scene');

  // --- Hierarchy skeleton -------------------------------------------------
  const root = doc.createNode(sceneName);
  const assets = doc.createNode('Assets');
  const texturesNode = doc.createNode('Textures');
  const materialsNode = doc.createNode('Materials');
  const collidersNode = doc.createNode('Colliders');
  const world = doc.createNode('World');
  root.addChild(assets).addChild(world);
  assets.addChild(texturesNode).addChild(materialsNode).addChild(collidersNode);

  for (const child of ctx.scene.listChildren()) {
    ctx.scene.removeChild(child);
    world.addChild(child);
  }
  ctx.scene.addChild(root);

  // --- Textures (empty slots; files copied next to the manifest) -----------
  const textureIds = new Map<string, string>(); // unity texture guid -> id
  const textureEntries: Array<Omit<ManifestTexture, 'slot'> & { node: Node }> = [];
  const textureNames = new NameAllocator();
  if (options.texturesDirAbs) fs.mkdirSync(options.texturesDirAbs, { recursive: true });

  for (const mat of bundle.materials.values()) {
    for (const env of Object.values(mat.texEnvs)) {
      const guid = env.textureRef?.guid;
      if (!guid || textureIds.has(guid)) continue;
      const entry = bundle.guidIndex?.get(guid);
      if (!entry || !fs.existsSync(entry.assetPath) || !fs.statSync(entry.assetPath).isFile()) {
        continue;
      }
      const ext = path.extname(entry.assetPath).toLowerCase();
      const name = textureNames.take(path.basename(entry.assetPath, path.extname(entry.assetPath)));
      const fileName = `${name}${ext}`;
      if (options.texturesDirAbs) {
        fs.copyFileSync(entry.assetPath, path.join(options.texturesDirAbs, fileName), fs.constants.COPYFILE_FICLONE);
      }
      const node = doc.createNode(name);
      texturesNode.addChild(node);
      textureIds.set(guid, guid);
      const unityMeta = readTextureMeta(entry.assetPath);
      textureEntries.push({
        id: guid,
        name,
        file: path.posix.join(options.texturesDirName, fileName),
        colorProfile: unityMeta.isNormalMap || unityMeta.sRGB === false ? 'Linear' : 'sRGB',
        unity: unityMeta,
        node,
      });
    }
  }

  // --- Materials (empty slots; GLB materials renamed to match) ------------
  const materialIdByGltf = new Map<Material, string>();
  const materialEntries: Array<Omit<ManifestMaterial, 'slot'> & { node: Node }> = [];
  const materialNames = new NameAllocator();

  for (const [key, gltfMat] of ctx.materials) {
    if (materialIdByGltf.has(gltfMat)) continue;
    const name = materialNames.take(gltfMat.getName());
    gltfMat.setName(name);
    const node = doc.createNode(name);
    materialsNode.addChild(node);
    materialIdByGltf.set(gltfMat, key);

    const src = bundle.materials.get(key);
    const pbr = pbrFromGltf(gltfMat);
    let unity: ManifestMaterial['unity'] = null;
    if (src) {
      pbr.albedoTexture = textureBinding(firstEnv(src, ['_MainTex', '_BaseMap', '_Tex']), textureIds);
      pbr.normalTexture = textureBinding(firstEnv(src, ['_BumpMap', '_DetailNormalMap', '_Normal']), textureIds);
      pbr.normalScale = src.floats['_BumpScale'] ?? 1;
      pbr.metallicGlossTexture = textureBinding(firstEnv(src, ['_MetallicGlossMap', '_SpecGlossMap']), textureIds);
      pbr.occlusionTexture = textureBinding(firstEnv(src, ['_OcclusionMap']), textureIds);
      pbr.occlusionStrength = src.floats['_OcclusionStrength'] ?? 1;
      pbr.emissiveTexture = textureBinding(firstEnv(src, ['_EmissionMap']), textureIds);
      pbr.emissiveColor = rgba(src.colors['_EmissionColor'] ?? src.colors['_EmisColor'], pbr.emissiveColor);

      const textures: Record<string, ManifestTextureBinding> = {};
      for (const [prop, env] of Object.entries(src.texEnvs)) {
        textures[prop] = {
          texture: env.textureRef?.guid ? textureIds.get(env.textureRef.guid) ?? null : null,
          scale: [env.scale.x, env.scale.y],
          offset: [env.offset.x, env.offset.y],
        };
      }
      const colors: Record<string, [number, number, number, number]> = {};
      for (const [prop, c] of Object.entries(src.colors)) colors[prop] = [c.r, c.g, c.b, c.a];

      unity = {
        guid: src.guid ?? null,
        shaderGuid: src.shaderRef?.guid ?? null,
        shaderName: readShaderName(src.shaderRef?.guid, bundle.guidIndex),
        keywords: src.shaderKeywords,
        renderQueue: src.customRenderQueue,
        floats: { ...src.floats },
        colors,
        textures,
      };
    }
    materialEntries.push({ id: key, name, pbr, unity, node });
  }

  // --- Lightmaps (BC6H Texture2D assets decoded to linear HDR) ---------------
  const lightmapEntries: ManifestLightmap[] = [];
  const lightmapIndexMap = new Map<number, number>(); // Unity lightmap index -> manifest index
  if (bundle.lighting && options.lightmapsDirAbs) {
    fs.mkdirSync(options.lightmapsDirAbs, { recursive: true });
    const lightmapNames = new NameAllocator();
    bundle.lighting.lightmaps.forEach((lmap, unityIndex) => {
      const guid = lmap.color?.guid;
      const entry = guid ? bundle.guidIndex?.get(guid) : undefined;
      if (!guid || !entry || !fs.existsSync(entry.assetPath)) {
        warnings.push(`Lightmap ${unityIndex}: texture ${guid ?? '(none)'} not found`);
        return;
      }
      try {
        const tex = parseTexture2DAsset(fs.readFileSync(entry.assetPath, 'utf8'));
        if (tex.textureFormat !== UNITY_TEXTURE_FORMAT_BC6H) {
          warnings.push(`Lightmap ${unityIndex} (${tex.name}): texture format ${tex.textureFormat} is not supported (only BC6H)`);
          return;
        }
        const rgb = decodeBc6hImage(tex.data, tex.width, tex.height);
        let maxValue = 0;
        for (let i = 0; i < rgb.length; i++) if (rgb[i] > maxValue) maxValue = rgb[i];
        const name = lightmapNames.take(tex.name || `Lightmap_${unityIndex}`);
        // Unity texture memory is bottom row first; image files are top row first.
        writeRadianceHdr(path.join(options.lightmapsDirAbs!, `${name}.hdr`), rgb, tex.width, tex.height, 'bottom-up');
        lightmapIndexMap.set(unityIndex, lightmapEntries.length);
        lightmapEntries.push({
          index: lightmapEntries.length,
          id: guid,
          name,
          file: path.posix.join(options.lightmapsDirName ?? 'lightmaps', `${name}.hdr`),
          width: tex.width,
          height: tex.height,
          maxValue,
        });
      } catch (e) {
        warnings.push(`Lightmap ${unityIndex}: ${(e as Error).message}`);
      }
    });
  }

  // --- Renderers ------------------------------------------------------------
  const rendererEntries: Array<Omit<ManifestRenderer, 'slot'> & { node: Node }> = [];
  for (const renderer of bundle.scene.renderers) {
    const node = ctx.nodes.get(renderer.nodeFileId);
    const mesh = node?.getMesh();
    if (!node || !mesh) continue;
    const materials = mesh.listPrimitives().map((p) => {
      const m = p.getMaterial();
      return m ? materialIdByGltf.get(m) ?? '' : '';
    });
    const lm = bundle.lighting?.renderers.get(renderer.fileID);
    let lightmap: ManifestRendererLightmap | null = null;
    if (lm && lm.lightmapIndex < LIGHTMAP_INDEX_NONE && lightmapIndexMap.has(lm.lightmapIndex)) {
      // Unity static batching bakes lightmapScaleOffset into the combined mesh's UV1.
      const batched = ctx.rendererMeshes.get(renderer.nodeFileId)?.isStaticBatch ?? false;
      const [sx, sy, ox, oy] = batched ? [1, 1, 0, 0] : lm.scaleOffset;
      lightmap = {
        index: lightmapIndexMap.get(lm.lightmapIndex)!,
        scaleOffset: [sx, sy, ox, oy],
        scaleOffsetGltf: [sx, sy, ox, 1 - sy - oy],
      };
    }
    rendererEntries.push({
      lightmap,
      enabled: renderer.enabled !== false,
      materials,
      castShadows: renderer.castShadows,
      receiveShadows: renderer.receiveShadows,
      node,
    });
  }

  // Visible meshes that are a full, untransformed copy of a source mesh (reusable by any collider)
  const visibleBySourceMesh = new Map<string, Node>();
  for (const [nodeFileId, info] of ctx.rendererMeshes) {
    if (info.isStaticBatch) continue;
    const node = ctx.nodes.get(nodeFileId);
    const src = bundle.meshes.get(info.meshGuid);
    if (node?.getMesh() && src && info.firstSubMesh === 0 && info.subMeshCount >= src.subMeshes.length) {
      if (!visibleBySourceMesh.has(info.meshGuid)) visibleBySourceMesh.set(info.meshGuid, node);
    }
  }

  // --- Colliders ------------------------------------------------------------
  const colliderMeshIds = new Map<string, { id: string; node: Node; triangles: number }>();
  const colliderMeshNames = new NameAllocator();
  const physicMaterials = new Map<string, ManifestPhysicMaterial>();
  const colliderEntries: Array<Omit<ManifestCollider, 'slot' | 'mesh'> & { node: Node; meshRef: { source: 'visible'; node: Node } | { source: 'collider'; id: string; node: Node } | null }> = [];
  let sharedCount = 0;

  const resolveColliderMesh = (col: SourceCollider, colNode: Node) => {
    const key = colliderMeshKey(col.meshRef);
    if (!key) return null;

    // 1. Same node's visible mesh (exact source mesh, or identical static-batch slice)
    const info = ctx.rendererMeshes.get(col.nodeFileId);
    const visibleMesh = colNode.getMesh();
    const src = bundle.meshes.get(key) ?? (key.startsWith('builtin_') ? createBuiltinPrimitiveMesh(Number(key.slice(8))) : undefined);
    if (info && visibleMesh) {
      const sameSource = !info.isStaticBatch && info.meshGuid === key;
      if (sameSource || (src && isSameGeometry(src, visibleMesh))) {
        sharedCount++;
        return { source: 'visible' as const, node: colNode };
      }
    }
    // 2. Another node shows this exact mesh
    const other = visibleBySourceMesh.get(key);
    if (other) {
      sharedCount++;
      return { source: 'visible' as const, node: other };
    }
    // 3. Collision-only geometry -> Assets/Colliders
    let entry = colliderMeshIds.get(key);
    if (!entry) {
      if (!src) {
        warnings.push(`Mesh collider on node ${col.nodeFileId}: mesh ${key} could not be loaded`);
        return null;
      }
      const gltfMesh = createGltfMesh(doc, ctx.buffer, src, [], undefined, null);
      if (gltfMesh.listPrimitives().length === 0) {
        warnings.push(`Mesh collider on node ${col.nodeFileId}: mesh ${key} has no triangles`);
        gltfMesh.dispose();
        return null;
      }
      const name = colliderMeshNames.take(src.name || key);
      gltfMesh.setName(name);
      const node = doc.createNode(name).setMesh(gltfMesh);
      collidersNode.addChild(node);
      entry = { id: key, node, triangles: meshTriangles(gltfMesh) };
      colliderMeshIds.set(key, entry);
    }
    return { source: 'collider' as const, id: entry.id, node: entry.node };
  };

  for (const col of bundle.scene.colliders) {
    const node = ctx.nodes.get(col.nodeFileId);
    if (!node) {
      warnings.push(`Collider ${col.fileID} is attached to unknown node ${col.nodeFileId}`);
      continue;
    }
    let physicMaterial: string | null = null;
    if (col.materialRef?.guid) {
      if (!physicMaterials.has(col.materialRef.guid)) {
        const pm = readPhysicMaterial(col.materialRef, bundle.guidIndex);
        if (pm) physicMaterials.set(pm.id, pm);
      }
      physicMaterial = physicMaterials.has(col.materialRef.guid) ? col.materialRef.guid : null;
    }

    const base = { type: col.kind, enabled: col.enabled, isTrigger: col.isTrigger, physicMaterial, node };
    const center = col.center ? vec3(convertPosition(col.center)) : [0, 0, 0] as [number, number, number];
    const unityCenter = col.center ? vec3(col.center) : [0, 0, 0] as [number, number, number];
    switch (col.kind) {
      case 'box':
        colliderEntries.push({ ...base, center, unityCenter, size: col.size ? vec3(col.size) : [1, 1, 1], meshRef: null });
        break;
      case 'sphere':
        colliderEntries.push({ ...base, center, unityCenter, radius: col.radius ?? 0.5, meshRef: null });
        break;
      case 'capsule':
        colliderEntries.push({ ...base, center, unityCenter, radius: col.radius ?? 0.5, height: col.height ?? 2, direction: col.direction ?? 1, meshRef: null });
        break;
      case 'mesh':
        colliderEntries.push({ ...base, convex: col.convex ?? false, meshRef: resolveColliderMesh(col, node) });
        break;
    }
  }

  const inactiveNodes = computeInactiveNodes(bundle.scene);

  // --- Rigidbodies ----------------------------------------------------------
  const rigidbodyEntries = bundle.scene.rigidbodies
    .map((rb) => ({ rb, node: ctx.nodes.get(rb.nodeFileId) }))
    .filter((x): x is { rb: typeof x.rb; node: Node } => !!x.node);

  // --- Lights ----------------------------------------------------------------
  const lightTypes = ['spot', 'directional', 'point', 'area'] as const; // Unity m_Type 0..3
  const lightEntries = bundle.scene.lights
    .map((l) => ({ l, node: ctx.nodes.get(l.nodeFileId) }))
    .filter((x): x is { l: typeof x.l; node: Node } => {
      if (!x.node) warnings.push(`Light ${x.l.fileID} is attached to unknown node ${x.l.nodeFileId}`);
      return !!x.node;
    });

  // --- Audio ------------------------------------------------------------------
  const audioClipIds = new Map<string, ManifestAudioClip>();
  const audioNames = new NameAllocator();
  if (options.audioDirAbs && bundle.scene.audioSources.length > 0) fs.mkdirSync(options.audioDirAbs, { recursive: true });
  const audioEntries: Array<Omit<ManifestAudioSource, 'slot'> & { node: Node }> = [];
  for (const a of bundle.scene.audioSources) {
    const node = ctx.nodes.get(a.nodeFileId);
    if (!node) {
      warnings.push(`AudioSource ${a.fileID} is attached to unknown node ${a.nodeFileId}`);
      continue;
    }
    let clip: string | null = null;
    const guid = a.audioClipRef?.guid;
    if (guid) {
      if (!audioClipIds.has(guid)) {
        const entry = bundle.guidIndex?.get(guid);
        if (entry && fs.existsSync(entry.assetPath) && fs.statSync(entry.assetPath).isFile()) {
          const ext = path.extname(entry.assetPath).toLowerCase();
          const name = audioNames.take(path.basename(entry.assetPath, path.extname(entry.assetPath)));
          if (options.audioDirAbs) {
            fs.copyFileSync(entry.assetPath, path.join(options.audioDirAbs, `${name}${ext}`), fs.constants.COPYFILE_FICLONE);
          }
          audioClipIds.set(guid, { id: guid, name, file: path.posix.join(options.audioDirName, `${name}${ext}`) });
        } else {
          warnings.push(`AudioSource ${a.fileID}: audio clip ${guid} not found`);
        }
      }
      clip = audioClipIds.has(guid) ? guid : null;
    }
    audioEntries.push({
      clip,
      enabled: a.enabled ?? true,
      playOnAwake: a.playOnAwake,
      loop: a.loop,
      mute: a.mute ?? false,
      volume: a.volume,
      pitch: a.pitch,
      spatialBlend: a.spatialBlend ?? 0,
      minDistance: a.minDistance ?? 1,
      maxDistance: a.maxDistance ?? 500,
      rolloff: a.rolloffMode === 1 ? 'linear' : a.rolloffMode === 2 ? 'custom' : 'logarithmic',
      dopplerLevel: a.dopplerLevel ?? 1,
      priority: a.priority ?? 128,
      node,
    });
  }

  // --- Slot paths (computed last, once the hierarchy is final) --------------
  const slotRefs = new Map<Node, SlotRef>();
  const walk = (node: Node, ref: SlotRef) => {
    slotRefs.set(node, ref);
    node.listChildren().forEach((child, i) =>
      walk(child, { path: [...ref.path, child.getName()], indexPath: [...ref.indexPath, i] })
    );
  };
  walk(root, { path: [], indexPath: [] });
  const slot = (node: Node): SlotRef => slotRefs.get(node)!;

  return {
    version: RESONITE_MANIFEST_VERSION,
    generator: 'scene-to-gltf',
    scene: sceneName,
    coordinateSystem:
      'Slot transforms in the GLB are glTF (right-handed, +Y up, meters; Unity Z flipped). Collider "center" is in glTF space; ' +
      '"unityCenter" is the original Unity value (left-handed, +Y up, same convention as Resonite). Sizes, radii and capsule axes are unchanged.',
    files: {
      glb: options.glbFileName,
      texturesDir: options.texturesDirName,
      audioDir: options.audioDirName,
      lightmapsDir: options.lightmapsDirName ?? 'lightmaps',
    },
    slots: {
      root: slot(root),
      assets: slot(assets),
      textures: slot(texturesNode),
      materials: slot(materialsNode),
      colliders: slot(collidersNode),
      world: slot(world),
    },
    textures: textureEntries.map(({ node, ...t }) => ({ ...t, slot: slot(node) })),
    materials: materialEntries.map(({ node, ...m }) => ({ ...m, slot: slot(node) })),
    colliderMeshes: [...colliderMeshIds.values()].map((c) => ({
      id: c.id,
      name: c.node.getName(),
      slot: slot(c.node),
      triangles: c.triangles,
    })),
    renderers: rendererEntries.map(({ node, ...r }) => ({ ...r, slot: slot(node) })),
    colliders: colliderEntries.map(({ node, meshRef, ...c }) => ({
      ...c,
      slot: slot(node),
      ...(c.type === 'mesh'
        ? {
            mesh: meshRef
              ? meshRef.source === 'visible'
                ? { source: 'visible' as const, slot: slot(meshRef.node) }
                : { source: 'collider' as const, id: meshRef.id, slot: slot(meshRef.node) }
              : null,
          }
        : {}),
    })),
    physicMaterials: [...physicMaterials.values()],
    rigidbodies: rigidbodyEntries.map(({ rb, node }) => ({
      slot: slot(node),
      mass: rb.mass,
      drag: rb.drag,
      angularDrag: rb.angularDrag,
      useGravity: rb.useGravity,
      isKinematic: rb.isKinematic,
    })),
    inactiveSlots: [...inactiveNodes]
      .filter((id) => {
        const parent = bundle.scene.nodes.get(id)?.parentFileId;
        return !(parent && inactiveNodes.has(parent));
      })
      .map((id) => ctx.nodes.get(id))
      .filter((n): n is Node => !!n)
      .map(slot),
    lightmaps: lightmapEntries,
    lightmapsMode: bundle.lighting ? (bundle.lighting.lightmapsMode === 1 ? 'directional' : 'nonDirectional') : null,
    lights: lightEntries.map(({ l, node }) => ({
      slot: slot(node),
      type: lightTypes[l.type] ?? 'point',
      enabled: l.enabled ?? true,
      bakeMode: l.bakeMode === 2 ? 'baked' : l.bakeMode === 1 ? 'mixed' : 'realtime',
      color: [l.color.r, l.color.g, l.color.b, l.color.a],
      intensity: l.intensity,
      range: l.range,
      spotAngle: l.spotAngleDegrees,
      shadows: l.shadowsType === 1 ? 'hard' : l.shadowsType === 2 ? 'soft' : 'none',
      shadowStrength: l.shadowStrength ?? 1,
      inGlb: !!node.getExtension('KHR_lights_punctual'),
    })),
    audioClips: [...audioClipIds.values()],
    audioSources: audioEntries.map(({ node, ...a }) => ({ ...a, slot: slot(node) })),
    stats: {
      textures: textureEntries.length,
      materials: materialEntries.length,
      renderers: rendererEntries.length,
      colliders: colliderEntries.length,
      meshCollidersUsingVisibleMesh: sharedCount,
      collisionOnlyMeshes: colliderMeshIds.size,
      hiddenRenderers: rendererEntries.filter((r) => !r.enabled).length,
      lightmaps: lightmapEntries.length,
      lightmappedRenderers: rendererEntries.filter((r) => r.lightmap).length,
      inactiveSlots: inactiveNodes.size,
      lights: lightEntries.length,
      audioClips: audioClipIds.size,
      audioSources: audioEntries.length,
    },
    warnings,
  };
}

/** Convert a bundle into a Resonite-layout GLB, a texture folder and a manifest next to it. */
export async function exportResoniteBundle(
  bundle: SourceBundle,
  glbPath: string,
  options?: { skipHidden?: boolean }
): Promise<{ manifestPath: string; texturesDir: string; manifest: ResoniteManifest; glbBytes: number }> {
  const { buildGltfDocument } = await import('./convert.js');
  const { NodeIO } = await import('@gltf-transform/core');
  const { KHRTextureTransform, KHRLightsPunctual } = await import('@gltf-transform/extensions');

  const outDir = path.dirname(glbPath);
  const base = path.basename(glbPath, path.extname(glbPath));
  const texturesDirName = `${base}_textures`;
  const texturesDirAbs = path.join(outDir, texturesDirName);
  const audioDirName = `${base}_audio`;
  const audioDirAbs = path.join(outDir, audioDirName);
  const lightmapsDirName = `${base}_lightmaps`;
  const lightmapsDirAbs = path.join(outDir, lightmapsDirName);
  const manifestPath = path.join(outDir, `${base}.resonite.json`);

  const { doc, ctx } = buildGltfDocument(bundle, { untexturedMaterials: true, skipHidden: options?.skipHidden });
  const manifest = applyResoniteLayout(doc, bundle, ctx, {
    glbFileName: path.basename(glbPath),
    texturesDirName,
    texturesDirAbs,
    audioDirName,
    audioDirAbs,
    lightmapsDirName,
    lightmapsDirAbs,
  });
  // No prune()/dedup here: prune would delete the intentionally empty Texture/Material slots.

  const io = new NodeIO().registerExtensions([KHRTextureTransform, KHRLightsPunctual] as any);
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(glbPath, glb);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  return { manifestPath, texturesDir: texturesDirAbs, manifest, glbBytes: glb.byteLength };
}
