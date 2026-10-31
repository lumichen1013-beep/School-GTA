import { queryColliders } from '../../physics/aabb';
import type { CollidableBox } from '../../world/CampusWorld';
import { AIM_MAX_DY, type AimCandidate } from '../basketball/aim';
import { HUMAN_CAPSULE_R, HUMAN_CAPSULE_Y0, HUMAN_CAPSULE_Y1, DOG_CAPSULE_R, DOG_CAPSULE_Y0, DOG_CAPSULE_Y1, isCanineRole, segmentAabbT, segmentCapsuleT } from '../projectiles/collide';

// 彈弓目標選擇與視線檢查 (純函式、零配置)。不用 Raycaster：視線以線段對 AABB (slab) 判定。

export const SLING_AIM_RANGE = 50;                               // 鎖定 / 射程上限 (m)
export const SLING_TOUCH_HALF_ANGLE = 25 * Math.PI / 180;        // 手機自動鎖定：鏡頭前方 ±25°
export const SLING_SCOPE_HALF_ANGLE = 8 * Math.PI / 180;         // 桌機：僅供開鏡 LOD 提升的鎖定錐 (不輔助瞄準)
export const SLING_LOCK_INTERVAL = 0.1;                          // 鎖定 / 視線檢查間隔 (秒)
export const SLING_EYE_HEIGHT = 1.5;                             // 視線起點高度 (高於玩家腳底)
export const SLING_BODY_HEIGHT = 1.0;                            // 視線 / 瞄準點：目標胸口 (高於腳底)
export const SLING_HEAD_HEIGHT = 1.5;                            // 穩住後瞄準點：目標頭部
const LOS_END_MARGIN = 0.02;                                     // 線段終點前留白比例 (目標緊貼牆面時不誤判)

const _n = { x: 0, y: 0, z: 0 };
const _near: CollidableBox[] = [];

// 線段 A→B 之間是否沒有阻擋盒 (樓板 / 坡道只當地板，不阻擋視線)
export function hasLineOfSight(
  colliders: readonly CollidableBox[], ax: number, ay: number, az: number, bx: number, by: number, bz: number
): boolean {
  if (colliders.length === 0) return true;
  const near = queryColliders(colliders as CollidableBox[], Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), _near);
  const ex = ax + (bx - ax) * (1 - LOS_END_MARGIN);
  const ey = ay + (by - ay) * (1 - LOS_END_MARGIN);
  const ez = az + (bz - az) * (1 - LOS_END_MARGIN);
  for (let i = 0; i < near.length; i++) {
    const box = near[i];
    if (box.isFloorOnly || box.isRamp) continue;
    if (segmentAabbT(ax, ay, az, ex, ey, ez, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z, 0, _n) >= 0) return false;
  }
  return true;
}

const TOP = 3; // 依角度排序的前幾名候選 (最佳者被牆擋住時退而求其次)
const _topT: (AimCandidate | null)[] = [null, null, null];
const _topScore = new Float32Array(TOP);

// 自 (px, pz) 沿水平單位向量 (fx, fz) 的錐形內，挑夾角最小 (最接近畫面中心) 且與玩家眼睛有視線的目標；無則 null。
// O(n)：單趟維護前 3 名，只對前 3 名做視線檢查 (最多 3 次線段對 AABB)
export function pickSlingTarget<T extends AimCandidate>(
  targets: readonly T[], colliders: readonly CollidableBox[], px: number, py: number, pz: number, fx: number, fz: number,
  halfAngle: number, maxDist: number
): T | null {
  const cosHalf = Math.cos(halfAngle);
  const maxSq = maxDist * maxDist;
  for (let k = 0; k < TOP; k++) { _topT[k] = null; _topScore[k] = Infinity; }
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.isKnockedDown || t.isPermanentlyKnockedOut) continue;
    const dx = t.position.x - px;
    const dz = t.position.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > maxSq) continue;
    const dy = t.position.y - py;
    if (dy > AIM_MAX_DY || dy < -AIM_MAX_DY) continue;
    let cos = 1;
    if (d2 > 0.09) {
      cos = (dx * fx + dz * fz) / Math.sqrt(d2);
      if (cos < cosHalf) continue;
    }
    const score = -cos;
    if (score >= _topScore[TOP - 1]) continue;
    let k = TOP - 1;
    while (k > 0 && _topScore[k - 1] > score) { _topScore[k] = _topScore[k - 1]; _topT[k] = _topT[k - 1]; k--; }
    _topScore[k] = score;
    _topT[k] = t;
  }
  for (let k = 0; k < TOP; k++) {
    const t = _topT[k] as T | null;
    if (!t) break;
    if (hasLineOfSight(colliders, px, py + SLING_EYE_HEIGHT, pz, t.position.x, t.position.y + SLING_BODY_HEIGHT, t.position.z)) return t;
  }
  return null;
}

// 桌機彈道收斂距離：鏡頭中心射線 (A→A+d×maxDist) 上第一個 NPC 膠囊 / 阻擋盒的距離；都沒有則回傳 fallback。
// 過肩鏡頭偏離玩家軸線 0.6m，彈道朝射線上「準星所指之處」收斂才不會近距離偏右；O(n)，每發只算一次，不用 Raycaster
export function rayConvergeDistance(
  targets: readonly AimCandidate[], colliders: readonly CollidableBox[], ax: number, ay: number, az: number,
  dx: number, dy: number, dz: number, maxDist: number, fallback: number
): number {
  const bx = ax + dx * maxDist, by = ay + dy * maxDist, bz = az + dz * maxDist;
  let best = 2;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.isKnockedDown || t.isPermanentlyKnockedOut) continue;
    const dog = isCanineRole(t.role);
    const tt = segmentCapsuleT(ax, ay, az, bx, by, bz, t.position.x, t.position.z,
      t.position.y + (dog ? DOG_CAPSULE_Y0 : HUMAN_CAPSULE_Y0), t.position.y + (dog ? DOG_CAPSULE_Y1 : HUMAN_CAPSULE_Y1),
      dog ? DOG_CAPSULE_R : HUMAN_CAPSULE_R);
    if (tt >= 0 && tt < best) best = tt;
  }
  if (colliders.length > 0) {
    const near = queryColliders(colliders as CollidableBox[], Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), _near);
    for (let i = 0; i < near.length; i++) {
      const box = near[i];
      if (box.isFloorOnly || box.isRamp) continue;
      const tt = segmentAabbT(ax, ay, az, bx, by, bz, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z, 0, _n);
      if (tt >= 0 && tt < best) best = tt;
    }
  }
  return best <= 1 ? Math.max(1, best * maxDist) : fallback;
}
