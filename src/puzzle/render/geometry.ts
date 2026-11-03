import * as THREE from 'three';

/**
 * 把幾塊幾何合成一個 (同材質的零件合成一個網格，省繪製次數)：每塊先轉成非索引、只保留 position / normal / uv。
 * (render 層不能 import three 以外的模組，所以不用 three/examples 的 BufferGeometryUtils)
 */
export function mergeParts(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    if (!flat.every(g => g.getAttribute(name))) continue;
    const size = flat[0].getAttribute(name).itemSize;
    const arr = new Float32Array(flat.reduce((n, g) => n + g.getAttribute(name).count * size, 0));
    let at = 0;
    for (const g of flat) { const a = g.getAttribute(name).array as ArrayLike<number>; arr.set(a, at); at += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** 擺好位置 (平移 + 旋轉) 的一塊幾何 */
export function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
}
