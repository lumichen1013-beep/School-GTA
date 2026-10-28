import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 靜態場景共用工具：材質快取、靜態物件矩陣凍結與靜態幾何合併

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();

// 取得共用 Lambert 材質 (相同顏色/透明度/面向共用同一實例，減少材質數與著色器狀態切換)
// 注意：回傳的材質為共用實例，呼叫端不可在執行期修改其屬性
export function sharedLambert(
  color: number,
  opts: { transparent?: boolean; opacity?: number; side?: THREE.Side } = {}
): THREE.MeshLambertMaterial {
  const transparent = opts.transparent ?? false;
  const opacity = opts.opacity ?? 1;
  const side = opts.side ?? THREE.FrontSide;
  const key = `${color}|${transparent}|${opacity}|${side}`;
  let mat = lambertCache.get(key);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color, transparent, opacity, side });
    lambertCache.set(key, mat);
  }
  return mat;
}

// 凍結靜態物件的本地矩陣：計算一次後關閉 matrixAutoUpdate，省去每幀數千次矩陣組合運算
// exclude 內的物件 (及其子孫) 於執行期會移動/縮放，維持自動更新
export function freezeStaticMatrices(root: THREE.Object3D, exclude: Set<THREE.Object3D>) {
  const visit = (obj: THREE.Object3D) => {
    if (exclude.has(obj)) return;
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
    for (const child of obj.children) visit(child);
  };
  for (const child of root.children) visit(child);
  root.updateMatrixWorld(true);
}

// 材質外觀鍵：外觀完全相同的獨立材質實例可視為同一材質合併繪製
const TEXTURE_SLOTS = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'emissiveMap', 'envMap', 'lightMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'specularMap', 'displacementMap'] as const;
function materialKey(mat: THREE.Material): string {
  const m = mat as THREE.Material & Record<string, unknown>;
  const parts: unknown[] = [
    mat.type, mat.side, mat.transparent, mat.opacity, mat.vertexColors, mat.depthWrite, mat.depthTest,
    mat.alphaTest, mat.blending, mat.polygonOffset, mat.polygonOffsetFactor, mat.polygonOffsetUnits, mat.toneMapped
  ];
  for (const prop of ['color', 'emissive'] as const) {
    const c = m[prop] as THREE.Color | undefined;
    parts.push(c ? c.getHex() : '-');
  }
  for (const prop of ['emissiveIntensity', 'roughness', 'metalness', 'wireframe', 'flatShading', 'fog'] as const) {
    parts.push(m[prop]);
  }
  for (const slot of TEXTURE_SLOTS) {
    const tex = m[slot] as THREE.Texture | null | undefined;
    parts.push(tex ? tex.uuid : '-');
  }
  return parts.join('|');
}

// 靜態幾何合併 (Static Batching)：將外觀相同、陰影設定相同且位於同一空間格的靜態 Mesh
// 烘焙世界矩陣後合併為單一 Mesh，大幅減少 draw call；保留空間分格以維持視錐剔除效果。
// exclude 內的物件 (及其子孫) 於執行期會移動/縮放/換材質，維持原樣不合併。
// 透明物件因合併後無法逐物件排序，亦維持原樣。
export function bakeStatic(root: THREE.Object3D, exclude: Set<THREE.Object3D>, cellSize: number = 40) {
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const canonicalMats = new Map<string, THREE.Material>();
  const buckets = new Map<string, { material: THREE.Material; castShadow: boolean; receiveShadow: boolean; meshes: THREE.Mesh[] }>();
  const center = new THREE.Vector3();

  const visit = (obj: THREE.Object3D) => {
    if (exclude.has(obj)) return;
    const mesh = obj as THREE.Mesh;
    if (
      mesh.isMesh &&
      mesh.children.length === 0 && // 帶子物件的 Mesh 移除時會連帶移除子物件，維持原樣
      !(mesh as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh &&
      !(mesh as THREE.Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh &&
      !Array.isArray(mesh.material) &&
      !mesh.material.transparent &&
      mesh.visible &&
      mesh.frustumCulled &&
      mesh.renderOrder === 0 &&
      Object.keys(mesh.geometry.morphAttributes).length === 0
    ) {
      const mKey = materialKey(mesh.material);
      let material = canonicalMats.get(mKey);
      if (!material) {
        material = mesh.material;
        canonicalMats.set(mKey, material);
      }
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      center.copy(geo.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
      const attrKey = Object.keys(geo.attributes).sort().join(',') + (geo.index ? '|i' : '|n');
      const key = `${mKey}#${mesh.castShadow}${mesh.receiveShadow}#${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}#${attrKey}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, meshes: [] };
        buckets.set(key, bucket);
      }
      bucket.meshes.push(mesh);
    }
    for (const child of obj.children) visit(child);
  };
  for (const child of root.children) visit(child);

  const removedGeometries = new Set<THREE.BufferGeometry>();
  const removedMaterials = new Set<THREE.Material>();
  const relMatrix = new THREE.Matrix4();
  let before = 0;
  let after = 0;

  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const mesh of bucket.meshes) {
      relMatrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
      geos.push(mesh.geometry.clone().applyMatrix4(relMatrix));
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;

    const bakedMesh = new THREE.Mesh(merged, bucket.material);
    bakedMesh.castShadow = bucket.castShadow;
    bakedMesh.receiveShadow = bucket.receiveShadow;
    bakedMesh.matrixAutoUpdate = false;
    root.add(bakedMesh);
    bakedMesh.updateMatrixWorld(true);

    for (const mesh of bucket.meshes) {
      mesh.removeFromParent();
      removedGeometries.add(mesh.geometry);
      if (mesh.material !== bucket.material) removedMaterials.add(mesh.material as THREE.Material);
    }
    before += bucket.meshes.length;
    after++;
  }

  // 僅釋放已不再被任何剩餘物件引用的幾何體與材質 (共用資源可能仍被排除物件使用)
  const stillUsedGeo = new Set<THREE.BufferGeometry>();
  const stillUsedMat = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh && !(obj as THREE.Line).isLine) return;
    stillUsedGeo.add(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) stillUsedMat.add(m);
  });
  for (const g of removedGeometries) if (!stillUsedGeo.has(g)) g.dispose();
  for (const m of removedMaterials) if (!stillUsedMat.has(m)) m.dispose();

  // 移除合併後已空的群組節點，減少場景圖遍歷成本
  const pruneEmpty = (obj: THREE.Object3D) => {
    for (let i = obj.children.length - 1; i >= 0; i--) {
      const child = obj.children[i];
      pruneEmpty(child);
      if (child.type === 'Group' && child.children.length === 0 && !exclude.has(child)) child.removeFromParent();
    }
  };
  pruneEmpty(root);

  return { before, after };
}
