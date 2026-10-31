import type * as THREE from 'three';

// 遠處 NPC 繪製分級 (僅影響渲染，AI/碰撞/命中判定仍以完整骨架節點運算)：
// 0 = 完整模型 (軀幹/頭/雙臂/雙腿各自動畫，約 7~9 次繪製)
// 1 = 中距離：軀幹+頭+雙臂合併為單一靜態網格，雙腿保留走路擺動 (3 次繪製)
// 2 = 遠距離：全身合併為單一靜態剪影網格 (1 次繪製，不投射陰影)
export type NpcLodLevel = 0 | 1 | 2;

// 距離門檻 (公尺，以鏡頭到 NPC 的水平+垂直距離計)：進入較粗分級用 enter、回到較細分級用 exit，
// 兩者間距即為遲滯帶，避免 NPC 在門檻附近來回走動時每幀切換閃爍
export const NPC_LOD_DIST = {
  midEnter: 27,
  midExit: 23,
  farEnter: 58,
  farExit: 52
} as const;

// 門檻平方 (依畫質檔位的距離倍率縮放；低檔縮短距離讓遠處 NPC 更早改用合併網格)
let MID_ENTER_SQ = 0;
let MID_EXIT_SQ = 0;
let FAR_ENTER_SQ = 0;
let FAR_EXIT_SQ = 0;
let lodScale = 0;

export function setNpcLodDistanceScale(scale: number) {
  if (scale === lodScale) return;
  lodScale = scale;
  const sq = (d: number) => (d * scale) * (d * scale);
  MID_ENTER_SQ = sq(NPC_LOD_DIST.midEnter);
  MID_EXIT_SQ = sq(NPC_LOD_DIST.midExit);
  FAR_ENTER_SQ = sq(NPC_LOD_DIST.farEnter);
  FAR_EXIT_SQ = sq(NPC_LOD_DIST.farExit);
}

export function getNpcLodDistanceScale(): number {
  return lodScale;
}

setNpcLodDistanceScale(1);

// 依目前分級與距離平方決定下一個分級 (含遲滯)；forceFull 為 true 時一律回到完整模型
export function nextNpcLodLevel(current: NpcLodLevel, distSq: number, forceFull: boolean): NpcLodLevel {
  if (forceFull) return 0;
  if (current === 0) {
    if (distSq > FAR_ENTER_SQ) return 2;
    return distSq > MID_ENTER_SQ ? 1 : 0;
  }
  if (current === 1) {
    if (distSq < MID_EXIT_SQ) return 0;
    return distSq > FAR_ENTER_SQ ? 2 : 1;
  }
  if (distSq < MID_EXIT_SQ) return 0;
  return distSq < FAR_EXIT_SQ ? 1 : 2;
}

// 模型建構時預先建立的分級網格 (幾何體依外觀共用快取，執行期僅切換 visible)
export interface NpcLodRig {
  mid: THREE.Mesh;          // 分級 1：軀幹+頭+雙臂合併網格
  far: THREE.Mesh;          // 分級 2：全身合併網格
  upper: THREE.Object3D[];  // 分級 1/2 隱藏：軀幹不透明網格、頭、雙臂 (含手持裝備)
  legs: THREE.Object3D[];   // 分級 2 隱藏：雙腿
}

export function applyNpcLodLevel(rig: NpcLodRig, level: NpcLodLevel) {
  const full = level === 0;
  for (const o of rig.upper) o.visible = full;
  for (const o of rig.legs) o.visible = level !== 2;
  rig.mid.visible = level === 1;
  rig.far.visible = level === 2;
}
