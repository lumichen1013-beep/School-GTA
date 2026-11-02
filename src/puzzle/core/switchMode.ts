import type { Mode, World } from './types';
import { PLAYER_HW } from './constants';
import { boxAt, clamp, objBox, overlapsXZ, supportsAt, supportsOf } from './geometry';
import { hits, inBounds, nearestFree, nearestFree2d } from './place';
import { MODES } from './modes';
import { isActiveIn, solidsFor } from './presence';
import { say } from './world';

export interface SwitchResult { ok: boolean }

/** 3D→2D (C10)：先記下進紙深度 z3d，再在 x-y 平面找最近空位 */
function enter2d(w: World): boolean {
  const p = w.player;
  p.z3d = p.z;
  const boxes = solidsFor(w, '2d').map(objBox);
  const spot = nearestFree2d(w, boxes, p.x, p.y);
  if (!spot) return false;
  [p.x, p.y] = spot;
  p.z = 0;
  p.mode = '2d';
  return true;
}

/** 2D→3D (C11)：還原 z3d；站在某物體上就採用該支撐物的 z；noLand3d 區域不可落 */
function enter3d(w: World): boolean {
  const p = w.player;
  const sup2d = supportsOf(w, p, '2d');
  // 站在某物體上就採用該支撐物的 z (落在其 z 範圍內)；noLand3d 的支撐物不採用
  let z = p.z3d;
  const sup = sup2d.filter(s => isActiveIn(w, s, '3d') && !s.def.noLand3d);
  if (sup.length) {
    let bestDist = Infinity;
    let bestZ = z;
    for (const s of sup) {
      const lo = s.z - s.def.d / 2 + PLAYER_HW;
      const hi = s.z + s.def.d / 2 - PLAYER_HW;
      const c = hi < lo ? s.z : clamp(z, lo, hi);
      if (Math.abs(c - z) < bestDist) { bestDist = Math.abs(c - z); bestZ = c; }
    }
    z = bestZ;
  }
  const b = w.level.bounds;
  z = clamp(z, b.minZ + PLAYER_HW, b.maxZ - PLAYER_HW);
  const boxes = solidsFor(w, '3d').map(objBox);
  const noLand = w.objs.filter(o => isActiveIn(w, o, '3d') && o.def.noLand3d).map(objBox);
  const free = (x: number, zz: number): boolean => {
    const pb = boxAt(x, p.y, zz);
    return inBounds(w, x, zz, '3d') && !hits(boxes, pb, '3d') && !noLand.some(nb => overlapsXZ(pb, nb));
  };
  // 圖紙裡踩著東西 → 回到現實也要踩得到東西 (避免切回 3D 就掉進坑或落在被圍住的書架上)
  const landable = (x: number, zz: number): boolean =>
    free(x, zz) && supportsAt(w, x, p.y, zz, '3d').some(s => !s.def.noLand3d);
  const spot = (sup2d.length ? nearestFree(landable, p.x, z) : null) ?? nearestFree(free, p.x, z);
  if (!spot) return false;
  [p.x, p.z] = spot;
  p.mode = '3d';
  return true;
}

/** 進入各模式的落點求解；失敗回 false 且不改玩家位置 / 模式 */
const ENTER: Readonly<Record<Mode, (w: World) => boolean>> = { '2d': enter2d, '3d': enter3d };

/** F / Q：切換 3D 現實 ↔ 2D 圖紙；塞不下則拒絕並提示 (z3d 還原) */
export function trySwitchMode(w: World): SwitchResult {
  const p = w.player;
  const prevZ3d = p.z3d;
  if (!ENTER[MODES[p.mode].other](w)) {
    p.z3d = prevZ3d;
    say(w, 'msg.squeeze');
    return { ok: false };
  }
  p.vy = 0;
  p.onGround = false;
  return { ok: true };
}
