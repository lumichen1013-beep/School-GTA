import * as THREE from 'three';

// 靜態場景共用工具：材質快取與靜態物件矩陣凍結

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
