import * as THREE from 'three';
import type { CollidableBox } from '../world/CampusWorld';
import { ColliderGrid } from './ColliderGrid';

// 共用 AABB 碰撞工具 (玩家、NPC、單車、鏡頭)
// 所有函式先以 ColliderGrid 取出鄰近候選，再依原本的逐一檢測規則運算，結果與掃描整個陣列完全一致

const _blockNear: CollidableBox[] = [];
const _depenNear: CollidableBox[] = [];
const _floorNear: CollidableBox[] = [];
const DEPEN_QUERY_PAD = 0.5;

// 擠出方向規則：各角色沿用原本的取捨與相等時的偏向，確保行為不變
export type DepenetrateRule = 'player' | 'npc' | 'bicycle';
export const DEPEN_PUSH_X = 1;
export const DEPEN_PUSH_Z = 2;

// 取出 XZ 範圍與矩形相交的候選碰撞盒 (回傳重用陣列，呼叫端需於下次查詢前用完)
export function queryColliders(
  colliders: CollidableBox[],
  minX: number, maxX: number, minZ: number, maxZ: number,
  out: CollidableBox[]
): CollidableBox[] {
  return ColliderGrid.of(colliders).query(minX, maxX, minZ, maxZ, out);
}

// 圓柱 (以 XZ 方框近似) 位於 (x, z) 時是否與任何阻擋物重疊
// feetOffset / headOffset：身體垂直範圍 (y + feetOffset < box.max.y && y + headOffset > box.min.y)
// awayAxis (1 = X、2 = Z)：單車脫困規則，沿該軸遠離障礙物中心移動時不視為阻擋
export function isBlockedXZ(
  colliders: CollidableBox[],
  x: number, z: number, r: number,
  y: number, feetOffset: number, headOffset: number,
  awayAxis: 0 | 1 | 2 = 0, awayFrom: number = 0, awayDelta: number = 0
): boolean {
  const near = queryColliders(colliders, x - r, x + r, z - r, z + r, _blockNear);
  for (let i = 0; i < near.length; i++) {
    const box = near[i];
    if (box.isFloorOnly) continue;
    if (x + r <= box.min.x || x - r >= box.max.x || z + r <= box.min.z || z - r >= box.max.z) continue;
    if (!(y + feetOffset < box.max.y && y + headOffset > box.min.y)) continue;
    if (awayAxis !== 0) {
      const center = awayAxis === 1 ? (box.min.x + box.max.x) / 2 : (box.min.z + box.max.z) / 2;
      const movingAway = (awayFrom > center && awayDelta > 0) || (awayFrom < center && awayDelta < 0);
      if (movingAway) continue;
    }
    return true;
  }
  return false;
}

// 沿最小穿透方向將角色推出阻擋物，回傳推動過的軸 (DEPEN_PUSH_X | DEPEN_PUSH_Z)
// passes > 1 時無重疊即提前結束；推出後若離開候選查詢範圍，改由完整陣列從同一索引接續掃描
export function depenetrateXZ(
  colliders: CollidableBox[],
  pos: THREE.Vector3, r: number,
  feetOffset: number, headOffset: number,
  margin: number, passes: number, rule: DepenetrateRule
): number {
  const grid = ColliderGrid.of(colliders);
  const qMinX = pos.x - r - DEPEN_QUERY_PAD;
  const qMaxX = pos.x + r + DEPEN_QUERY_PAD;
  const qMinZ = pos.z - r - DEPEN_QUERY_PAD;
  const qMaxZ = pos.z + r + DEPEN_QUERY_PAD;
  let list = grid.query(qMinX, qMaxX, qMinZ, qMaxZ, _depenNear);
  let pushed = 0;

  for (let pass = 0; pass < passes; pass++) {
    let resolved = true;
    for (let i = 0; i < list.length; i++) {
      const box = list[i];
      if (box.isFloorOnly) continue;
      if (!(pos.y + feetOffset < box.max.y && pos.y + headOffset > box.min.y)) continue;
      const overlapLeft = pos.x + r - box.min.x;
      const overlapRight = box.max.x - (pos.x - r);
      const overlapBack = pos.z + r - box.min.z;
      const overlapFront = box.max.z - (pos.z - r);
      if (overlapLeft <= 0 || overlapRight <= 0 || overlapBack <= 0 || overlapFront <= 0) continue;
      resolved = false;

      if (rule === 'player') {
        const pushX = Math.min(overlapLeft, overlapRight);
        const pushZ = Math.min(overlapBack, overlapFront);
        if (pushX < pushZ) {
          pos.x = overlapLeft < overlapRight ? box.min.x - r - margin : box.max.x + r + margin;
          pushed |= DEPEN_PUSH_X;
        } else {
          pos.z = overlapBack < overlapFront ? box.min.z - r - margin : box.max.z + r + margin;
          pushed |= DEPEN_PUSH_Z;
        }
      } else if (rule === 'npc') {
        const boxCenterX = (box.min.x + box.max.x) * 0.5;
        const boxCenterZ = (box.min.z + box.max.z) * 0.5;
        const overlapX = ((box.max.x - box.min.x) * 0.5 + r) - Math.abs(pos.x - boxCenterX);
        const overlapZ = ((box.max.z - box.min.z) * 0.5 + r) - Math.abs(pos.z - boxCenterZ);
        if (overlapX < overlapZ) {
          pos.x = pos.x >= boxCenterX ? box.max.x + r + margin : box.min.x - r - margin;
          pushed |= DEPEN_PUSH_X;
        } else {
          pos.z = pos.z >= boxCenterZ ? box.max.z + r + margin : box.min.z - r - margin;
          pushed |= DEPEN_PUSH_Z;
        }
      } else {
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapBack, overlapFront);
        if (minOverlap === overlapLeft) {
          pos.x = box.min.x - r - margin;
          pushed |= DEPEN_PUSH_X;
        } else if (minOverlap === overlapRight) {
          pos.x = box.max.x + r + margin;
          pushed |= DEPEN_PUSH_X;
        } else if (minOverlap === overlapBack) {
          pos.z = box.min.z - r - margin;
          pushed |= DEPEN_PUSH_Z;
        } else {
          pos.z = box.max.z + r + margin;
          pushed |= DEPEN_PUSH_Z;
        }
      }

      // 推出後離開候選範圍：改掃完整陣列，從此碰撞盒的原始索引之後接續，維持與全掃描相同的順序
      if (list !== colliders && (pos.x - r < qMinX || pos.x + r > qMaxX || pos.z - r < qMinZ || pos.z + r > qMaxZ)) {
        i = grid.indexOf(box);
        list = colliders;
      }
    }
    if (resolved) break;
  }
  return pushed;
}

// 指定 (X, Z) 下方的支撐面高度 (樓板、坡道或地面 Y = 0)；reach 為可踏上的最大高度差
export function getSupportFloorY(colliders: CollidableBox[], posX: number, posY: number, posZ: number, reach: number): number {
  const near = queryColliders(colliders, posX, posX, posZ, posZ, _floorNear);
  let supportFloorY = 0;
  for (let i = 0; i < near.length; i++) {
    const box = near[i];
    if (!box.isFloorOnly && !box.isRamp) continue;
    if (posX < box.min.x || posX > box.max.x || posZ < box.min.z || posZ > box.max.z) continue;
    let floorTop = box.max.y;
    if (box.isRamp && box.rampMinZ !== undefined && box.rampMaxZ !== undefined && box.rampYAtMinZ !== undefined && box.rampYAtMaxZ !== undefined) {
      const t = THREE.MathUtils.clamp((posZ - box.rampMinZ) / (box.rampMaxZ - box.rampMinZ), 0, 1);
      floorTop = box.rampYAtMinZ + t * (box.rampYAtMaxZ - box.rampYAtMinZ);
    }
    if (floorTop <= posY + reach && floorTop > supportFloorY) {
      supportFloorY = floorTop;
    }
  }
  return supportFloorY;
}
