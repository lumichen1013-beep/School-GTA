import * as THREE from 'three';
import { CollidableBox } from '../../world/CampusWorld';

export interface SafeTeleportOptions {
  minRadius: number;
  maxRadius: number;
  attempts: number;
  // 找不到更高支撐面時的預設地面高度 (玩家為 0，NPC 為所屬樓層基準)
  baseGroundY: number;
}

const HALF_WIDTH = 0.45;
const BODY_HEIGHT = 1.8;

// 尋找瞬移安全落點 (0-GC，隨機取樣避開阻擋障礙物並計算落點地面高度，結果寫入 out)
export function findSafeTeleportPos(
  out: THREE.Vector3,
  centerX: number,
  centerZ: number,
  currentY: number,
  colliders: CollidableBox[],
  opts: SafeTeleportOptions
): THREE.Vector3 {
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = opts.minRadius + Math.random() * (opts.maxRadius - opts.minRadius);
    const candX = centerX + Math.cos(angle) * dist;
    const candZ = centerZ + Math.sin(angle) * dist;

    // 檢查是否與任何實體阻擋障礙物碰撞
    let blocked = false;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box.isFloorOnly) continue;
      if (
        candX + HALF_WIDTH > box.min.x &&
        candX - HALF_WIDTH < box.max.x &&
        candZ + HALF_WIDTH > box.min.z &&
        candZ - HALF_WIDTH < box.max.z &&
        currentY + BODY_HEIGHT > box.min.y &&
        currentY + 0.3 < box.max.y
      ) {
        blocked = true;
        break;
      }
    }

    if (!blocked) {
      // 找到安全水平座標，計算該點地面高度 (含坡道)
      let groundY = opts.baseGroundY;
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        if (
          candX + HALF_WIDTH > box.min.x &&
          candX - HALF_WIDTH < box.max.x &&
          candZ + HALF_WIDTH > box.min.z &&
          candZ - HALF_WIDTH < box.max.z
        ) {
          if (box.isRamp && box.rampMinZ !== undefined && box.rampMaxZ !== undefined && box.rampYAtMinZ !== undefined && box.rampYAtMaxZ !== undefined) {
            const t = THREE.MathUtils.clamp((candZ - box.rampMinZ) / (box.rampMaxZ - box.rampMinZ), 0, 1);
            const rampY = box.rampYAtMinZ + t * (box.rampYAtMaxZ - box.rampYAtMinZ);
            if (rampY <= currentY + 0.85 && rampY > groundY) {
              groundY = rampY;
            }
          } else if (box.max.y <= currentY + 0.85 && box.max.y > groundY) {
            groundY = box.max.y;
          }
        }
      }
      return out.set(candX, groundY, candZ);
    }
  }

  // 多次取樣皆撞牆，退回起始中心點
  return out.set(centerX, currentY, centerZ);
}
