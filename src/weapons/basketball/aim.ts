import type { ProjectileMoveKind } from '../../entities/shared/kungfu';

// 籃球的三種投法 (彈弓的 SLING 不走此求解)
export type BallMoveKind = Exclude<ProjectileMoveKind, 'SLING'>;
import { isCanineRole } from '../projectiles/collide';

// 籃球瞄準與彈道求解 (純函式，零配置；測試與 BallThrowController 共用)。
// 目標選擇 O(n)：不用 Raycaster，只比水平角度 / 距離。

export const AIM_DESKTOP_HALF_ANGLE = 12 * Math.PI / 180; // 桌機：鏡頭前方 ±12° 軟鎖定 (取最正對者)
export const AIM_TOUCH_HALF_ANGLE = 30 * Math.PI / 180;   // 手機：±30° 自動鎖定 (取最近者)
export const AIM_MAX_RANGE = 18;                          // 鎖定 / 射程上限 (m)
export const AIM_MAX_DY = 3;                              // 與玩家高度差超過此值視為不同樓層，不鎖定
const AIM_MIN_DIST = 0.3;                                 // 貼身目標不檢查角度

export interface AimCandidate {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly role: string;
  readonly isKnockedDown: boolean;
  readonly isPermanentlyKnockedOut: boolean;
}
export type AimMode = 'ANGLE' | 'NEAREST';

// 自 (px, pz) 沿水平單位向量 (fx, fz) 的錐形內挑一個目標；ANGLE = 最正對 (夾角最小)、NEAREST = 最近。無目標回傳 null
export function pickAimTarget<T extends AimCandidate>(
  targets: readonly T[], px: number, py: number, pz: number, fx: number, fz: number,
  halfAngle: number, maxDist: number, mode: AimMode
): T | null {
  const cosHalf = Math.cos(halfAngle);
  const maxSq = maxDist * maxDist;
  let best: T | null = null;
  let bestScore = Infinity;
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
    if (d2 > AIM_MIN_DIST * AIM_MIN_DIST) {
      cos = (dx * fx + dz * fz) / Math.sqrt(d2);
      if (cos < cosHalf) continue;
    }
    const score = mode === 'ANGLE' ? -cos : d2;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

// 瞄準點高度 (高於目標腳底)：人型胸口、犬類背部
export function aimHeight(role: string): number {
  return isCanineRole(role) ? 0.5 : 1.0;
}

export const BALL_GRAVITY = 14;       // 與 ProjectileSystem KIND_GRAVITY[球] 一致
export const BALL_CHEST_SPEED = 24;   // 胸前推傳水平初速 (m/s)
export const BALL_BOUNCE_SPEED = 20;  // 地板彈傳水平初速
export const BALL_BOUNCE_FRAC = 0.55; // 彈地點位於目標距離的比例
export const BALL_RADIUS = 0.12;
const DEFAULT_DIST = { BALL_CHEST: 14, BALL_BOUNCE: 8, BALL_LOB: 8 } as const;
const LOB_ANGLE_NEAR = 58 * Math.PI / 180; // 高拋仰角：近距離 58°，18m 降到 38° (飛行時間不超過保險壽命)
const LOB_ANGLE_FAR = 38 * Math.PI / 180;

export interface LaunchVelocity { h: number; vy: number } // 水平速率 (沿瞄準方向) 與垂直速度

// 依招式求出手速度。dist = 到瞄準點的水平距離 (已夾在 [1.2, AIM_MAX_RANGE])、originH = 出手高度 (高於地面)、aimH = 瞄準點高度 (高於地面)。
// CHEST：水平速度固定 24，垂直速度使球恰好在 dist 處經過瞄準點；
// BOUNCE：水平速度 20，使球在 dist × 0.55 處觸地 (之後依恢復係數彈起，上行穿過目標)；
// LOB：固定仰角 (近 58° / 遠 38°)，初速使球恰好落在瞄準點
export function solveLaunch(kind: BallMoveKind, dist: number, originH: number, aimH: number, out: LaunchVelocity): LaunchVelocity {
  const g = BALL_GRAVITY;
  if (kind === 'BALL_CHEST') {
    const t = dist / BALL_CHEST_SPEED;
    out.h = BALL_CHEST_SPEED;
    out.vy = (aimH - originH + 0.5 * g * t * t) / t;
  } else if (kind === 'BALL_BOUNCE') {
    const t1 = (dist * BALL_BOUNCE_FRAC) / BALL_BOUNCE_SPEED;
    out.h = BALL_BOUNCE_SPEED;
    out.vy = (BALL_RADIUS - originH + 0.5 * g * t1 * t1) / t1;
  } else {
    const u = Math.min(1, Math.max(0, (dist - 6) / 12));
    const th = LOB_ANGLE_NEAR + (LOB_ANGLE_FAR - LOB_ANGLE_NEAR) * u;
    const cos = Math.cos(th);
    const denom = 2 * cos * cos * (dist * Math.tan(th) - (aimH - originH));
    const v = denom > 1e-3 ? Math.sqrt((g * dist * dist) / denom) : 12;
    out.h = v * cos;
    out.vy = v * Math.sin(th);
  }
  return out;
}

// 無目標時的預設瞄準距離
export function defaultAimDistance(kind: BallMoveKind): number {
  return DEFAULT_DIST[kind];
}
