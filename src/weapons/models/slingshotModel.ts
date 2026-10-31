import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponModelHandle } from '../types';
import { mountOnHand } from './batModels';
import { SLING_AIM_STANCE } from '../slingshot/pose';

// 彈弓：Y 字架 + 握把合併為 1 個 mesh (頂點色烘焙，約 108 三角形)，橡皮筋 + 彈兜為 1 個 mesh (約 32 三角形，以 scale.y 拉伸表現蓄力)，
// 共 2 個 mesh、不投影。模型本地 Y 軸朝前：握把 0 ~ 0.14、叉柄 0.14 ~ 0.24、雙叉尖端 y = 0.36 (x = ±0.075)。
// 持握待命時與棒類相同斜上掛在右手；瞄準時整支轉成朝前 (aim 的 ratio 0..1 對應蓄力)，橡皮筋彈兜沿 -Y 拉向射手。
const GRIP_LEN = 0.14;
const STEM_TOP = 0.24;
const FORK_TIP_Y = 0.36;
const FORK_TIP_X = 0.075;
const PULL_MAX = 0.45;      // 滿蓄力彈兜拉開距離 (m)
const BAND_REST = 0.12;     // 未蓄力的鬆弛比例 (pull = PULL_MAX × 此比例)
const IDLE_ROT = Math.PI / 3;
// 瞄準時右臂前舉：模型 +Y 轉到臂前方所需的掛點旋轉 = π/2 − 臂旋轉
const AIM_ROT = Math.PI / 2 - SLING_AIM_STANCE.rightArm.x;

const WOOD = 0x8a5a2b;
const GRIP = 0x3b2a1e;
const BAND = 0x2c2c2c;
const POUCH = 0x6e4a2a;

function bake(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // mergeGeometries 要求同屬性：非索引化後合併
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return merged;
}

// 自 (x0, y0) 到 (x1, y1) 的細圓柱 (XY 平面內)，4 邊開口
function strut(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, radial: number, hex: number) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.rotateZ(-Math.atan2(dx, dy));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return bake(g, hex);
}

export function buildSlingshot(): WeaponModelHandle {
  const frameParts: THREE.BufferGeometry[] = [
    bake(new THREE.CylinderGeometry(0.028, 0.026, GRIP_LEN, 8).translate(0, GRIP_LEN / 2, 0), GRIP),
    strut(0, GRIP_LEN, 0, STEM_TOP, 0.024, 0.022, 6, WOOD),
    strut(0, STEM_TOP, -FORK_TIP_X, FORK_TIP_Y, 0.022, 0.018, 6, WOOD),
    strut(0, STEM_TOP, FORK_TIP_X, FORK_TIP_Y, 0.022, 0.018, 6, WOOD),
    bake(new THREE.IcosahedronGeometry(0.024, 0).translate(-FORK_TIP_X, FORK_TIP_Y, 0), GRIP),
    bake(new THREE.IcosahedronGeometry(0.024, 0).translate(FORK_TIP_X, FORK_TIP_Y, 0), GRIP)
  ];
  // 橡皮筋：自雙叉尖端 (y = 0) 向下連到彈兜 (0, -1)，單位長度；整個 mesh 沿 Y 縮放 = 彈兜拉開距離
  const bandParts: THREE.BufferGeometry[] = [
    strut(-FORK_TIP_X, 0, 0, -1, 0.008, 0.008, 4, BAND),
    strut(FORK_TIP_X, 0, 0, -1, 0.008, 0.008, 4, BAND),
    bake(new THREE.BoxGeometry(0.05, 0.001, 0.045).translate(0, -1, 0), POUCH)
  ];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const frame = new THREE.Mesh(merge(frameParts), mat);
  const band = new THREE.Mesh(merge(bandParts), mat);
  band.position.y = FORK_TIP_Y;
  frame.castShadow = false;
  band.castShadow = false;

  const root = new THREE.Group();
  root.add(frame, band);
  mountOnHand(root);
  const aim = (ratio: number) => {
    root.rotation.x = IDLE_ROT + (AIM_ROT - IDLE_ROT) * ratio;
    band.scale.y = PULL_MAX * (BAND_REST + (1 - BAND_REST) * ratio);
  };
  aim(0);
  return { parts: { R: root }, glow: null, resetGlow: () => {}, aim };
}
