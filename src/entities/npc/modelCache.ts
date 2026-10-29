import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// NPC 模型烘焙快取：將同一骨架節點 (軀幹、頭、單臂、單腿…) 底下的所有靜態零件
// 依材質類別烘焙為頂點色並合併成少數幾個 Mesh，同外觀 NPC 共用同一份幾何體與材質，
// 大幅降低 Draw Call、幾何體與材質數量。共用資源標記 userData.shared，釋放時需略過。

type BucketKey = string; // 'lambert' | 'double' | 'basic' | 透明材質專屬 key

interface BakedBucket {
  key: BucketKey;
  geometry: THREE.BufferGeometry;
  castShadow: boolean;
}

interface BakeEntry {
  key: BucketKey;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  flat: boolean;
  castShadow: boolean;
  material: THREE.Material;
}

const bakedCache = new Map<string, BakedBucket[]>();
const sharedMaterials = new Map<BucketKey, THREE.Material>();

export function markShared<T extends { userData: Record<string, unknown> }>(res: T): T {
  res.userData.shared = true;
  return res;
}

// 取得 (或建立) 指定類別的共用材質；透明零件以原材質複製一份共用版本
function getSharedMaterial(key: BucketKey, sample?: THREE.Material): THREE.Material {
  let mat = sharedMaterials.get(key);
  if (!mat) {
    if (key === 'lambert') {
      mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    } else if (key === 'double') {
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    } else if (key === 'basic') {
      mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    } else {
      mat = sample ? sample.clone() : new THREE.MeshBasicMaterial();
    }
    markShared(mat);
    sharedMaterials.set(key, mat);
  }
  return mat;
}

// 依原材質決定烘焙類別：透明零件獨立保留；明亮的無光照零件 (反光條、感測燈) 保持無光照；其餘以 Lambert 呈現
function classify(mat: THREE.Material): BucketKey {
  const m = mat as THREE.MeshBasicMaterial;
  if (mat.transparent) {
    return `t|${m.color ? m.color.getHexString() : ''}|${mat.opacity}|${mat.side}|${mat.depthWrite}`;
  }
  if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const c = m.color;
    const luminance = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    if (luminance > 0.02) return 'basic';
  }
  return mat.side === THREE.DoubleSide ? 'double' : 'lambert';
}

function collectEntries(
  root: THREE.Object3D,
  keep: (obj: THREE.Object3D) => boolean,
  entries: BakeEntry[],
  kept: THREE.Object3D[]
) {
  const visit = (obj: THREE.Object3D, parentMatrix: THREE.Matrix4) => {
    let matrix = parentMatrix;
    if (obj !== root) {
      if (keep(obj)) {
        kept.push(obj);
        return;
      }
      obj.updateMatrix();
      matrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, obj.matrix);
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshLambertMaterial;
      entries.push({
        key: classify(mat),
        geometry: mesh.geometry,
        matrix,
        color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
        flat: !!mat.flatShading,
        castShadow: mesh.castShadow,
        material: mat
      });
    }
    for (const child of obj.children) visit(child, matrix);
  };
  visit(root, new THREE.Matrix4());
}

// 將單一零件幾何體轉為「非索引 + position/normal/color」統一格式並套用相對矩陣
function prepareGeometry(entry: BakeEntry, withColor: boolean): THREE.BufferGeometry {
  const src = entry.geometry;
  const geo = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  geo.morphAttributes = {};
  geo.clearGroups();
  geo.applyMatrix4(entry.matrix);
  if (entry.flat || !geo.attributes.normal) geo.computeVertexNormals();
  if (withColor) {
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = entry.color.r;
      colors[i * 3 + 1] = entry.color.g;
      colors[i * 3 + 2] = entry.color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return geo;
}

function buildBuckets(entries: BakeEntry[]): BakedBucket[] {
  const byKey = new Map<BucketKey, BakeEntry[]>();
  for (const e of entries) {
    let list = byKey.get(e.key);
    if (!list) {
      list = [];
      byKey.set(e.key, list);
    }
    list.push(e);
  }
  const buckets: BakedBucket[] = [];
  for (const [key, list] of byKey) {
    const withColor = !key.startsWith('t|');
    const geos = list.map(e => prepareGeometry(e, withColor));
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (geos.length > 1) for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    buckets.push({ key, geometry: markShared(merged), castShadow: list.some(e => e.castShadow) });
  }
  // 主要 Lambert 類別排第一，供骨架節點本身直接承載
  buckets.sort((a, b) => (a.key === 'lambert' ? -1 : b.key === 'lambert' ? 1 : 0));
  return buckets;
}

// 釋放物件樹中「非共用」的幾何體與材質 (共用資源由快取持有，不可釋放)
export function disposeNonShared(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && !m.userData.shared) m.dispose();
    }
  });
}

/**
 * 將骨架節點 root (Mesh 或 Group) 底下所有靜態零件烘焙合併，並以 cacheKey 共用結果。
 * - root 自身的位置/旋轉/縮放保留 (動畫仍作用於 root)
 * - keep(obj) 為 true 的子樹原樣保留 (例如可切換顯示的雨傘)
 * - 同 cacheKey 的 NPC 共用同一份合併幾何體
 * - castShadow 為 false 時合併後網格一律不投射陰影 (頭與四肢僅由軀幹投影，節省陰影 Draw Call)
 */
export function bakeNode(
  root: THREE.Object3D,
  cacheKey: string,
  keep: (obj: THREE.Object3D) => boolean = () => false,
  castShadow: boolean = true
) {
  const entries: BakeEntry[] = [];
  const kept: THREE.Object3D[] = [];
  collectEntries(root, keep, entries, kept);

  let buckets = bakedCache.get(cacheKey);
  if (!buckets) {
    buckets = buildBuckets(entries);
    bakedCache.set(cacheKey, buckets);
  }

  // 保留子樹若位於更深層，先掛回 root 底下 (維持相同外觀位置)，再釋放其餘原始暫時零件資源
  for (const k of kept) {
    if (k.parent !== root) {
      root.updateWorldMatrix(true, true);
      root.attach(k);
    }
  }
  const rootMesh = root as THREE.Mesh;
  const oldChildren = root.children.filter(c => !kept.includes(c));
  for (const child of oldChildren) {
    root.remove(child);
    disposeNonShared(child);
  }
  if (rootMesh.isMesh) {
    if (rootMesh.geometry && !rootMesh.geometry.userData.shared) rootMesh.geometry.dispose();
    const mats = Array.isArray(rootMesh.material) ? rootMesh.material : [rootMesh.material];
    for (const m of mats) if (m && !m.userData.shared) m.dispose();
  }

  let first = true;
  for (const bucket of buckets) {
    const mat = getSharedMaterial(bucket.key, entries.find(e => e.key === bucket.key)?.material);
    if (first && rootMesh.isMesh) {
      rootMesh.geometry = bucket.geometry;
      rootMesh.material = mat;
      rootMesh.castShadow = castShadow && bucket.castShadow;
      first = false;
      continue;
    }
    first = false;
    const mesh = new THREE.Mesh(bucket.geometry, mat);
    mesh.castShadow = castShadow && bucket.castShadow;
    root.add(mesh);
  }
  // 骨架節點為 Mesh 但完全沒有零件時 (理論上不會發生) 隱藏避免錯誤繪製
  if (rootMesh.isMesh && buckets.length === 0) rootMesh.visible = false;
}

/**
 * 將多個同層靜態零件 (含子樹) 收進一個新的 Group 後烘焙，回傳該 Group。
 * 零件原本位於 container 座標系，Group 位於原點，故相對矩陣不變。
 */
export function bakeStaticParts(container: THREE.Object3D, parts: THREE.Object3D[], cacheKey: string): THREE.Group {
  const group = new THREE.Group();
  group.name = 'npc_static_body';
  for (const p of parts) {
    container.remove(p);
    group.add(p);
  }
  container.add(group);
  bakeNode(group, cacheKey);
  return group;
}

// 頭頂血條共用資源 (幾何體、底框材質與三種狀態色材質)
const hpBarBgGeo = markShared(new THREE.BoxGeometry(0.84, 0.11, 0.05));
const hpBarGeo = markShared(new THREE.BoxGeometry(0.80, 0.07, 0.07).translate(0.40, 0, 0));
const hpBarBgMat = markShared(new THREE.MeshBasicMaterial({ color: 0x111111 }));
const hpBarMats = new Map<number, THREE.MeshBasicMaterial>();

export function getHpBarResources() {
  return { bgGeo: hpBarBgGeo, barGeo: hpBarGeo, bgMat: hpBarBgMat };
}

export function getHpBarMaterial(hex: number): THREE.MeshBasicMaterial {
  let mat = hpBarMats.get(hex);
  if (!mat) {
    // 深度偏移把血條往鏡頭方向推：遠距離深度精度不足時也穩定疊在黑色底框之上，不會與底框閃爍互搶
    mat = markShared(new THREE.MeshBasicMaterial({ color: hex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    hpBarMats.set(hex, mat);
  }
  return mat;
}

// NPC 手機 (滑手機/舉手機錄影姿勢時顯示)：深色機身 + 亮色螢幕合併為單一頂點色網格，全 NPC 共用一份幾何體與材質 (1 Draw Call)
let phoneGeo: THREE.BufferGeometry | null = null;
let phoneMat: THREE.MeshBasicMaterial | null = null;

function paintGeometry(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function getPhoneResources() {
  if (!phoneGeo || !phoneMat) {
    // 機身 (寬 0.11、長 0.2、厚 0.022)，螢幕貼於 +Z 面
    const body = paintGeometry(new THREE.BoxGeometry(0.11, 0.2, 0.022).toNonIndexed(), 0x1b1d22);
    const screen = paintGeometry(new THREE.PlaneGeometry(0.095, 0.172).toNonIndexed(), 0x8fd3ff);
    screen.translate(0, 0, 0.0115);
    body.deleteAttribute('uv');
    screen.deleteAttribute('uv');
    body.deleteAttribute('normal');
    screen.deleteAttribute('normal');
    phoneGeo = markShared(mergeGeometries([body, screen])!);
    body.dispose();
    screen.dispose();
    phoneGeo.computeBoundingSphere();
    phoneMat = markShared(new THREE.MeshBasicMaterial({ vertexColors: true }));
  }
  return { geometry: phoneGeo, material: phoneMat };
}
