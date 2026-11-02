import type { World } from './types';
import { MSG_SQUEEZE, PLAYER_HW } from './constants';
import { activeIn, boxAt, clamp, objBox, overlapsXZ, solidsFor, supportsAt, supportsOf } from './geometry';
import { hits, inBounds, nearestFree } from './place';
import { say } from './world';

export interface SwitchResult { ok: boolean }

/** F / Q：切換 3D 現實 ↔ 2D 圖紙；塞不下則拒絕並提示 */
export function trySwitchMode(w: World): SwitchResult {
  const p = w.player;
  if (p.mode === '3d') {
    const boxes = solidsFor(w, '2d').map(objBox);
    const spot = nearestFree((x, y) => inBounds(w, x, 0, '2d') && y > w.level.voidY && !hits(boxes, boxAt(x, y, 0), '2d'), p.x, p.y, -0.5);
    if (!spot) { say(w, MSG_SQUEEZE); return { ok: false }; }
    p.z3d = p.z;
    [p.x, p.y] = spot;
    p.z = 0;
    p.mode = '2d';
  } else {
    const sup2d = supportsOf(w, p, '2d');
    // 站在某物體上就採用該支撐物的 z (落在其 z 範圍內)；noLand3d 的支撐物不採用
    let z = p.z3d;
    const sup = sup2d.filter(s => activeIn(s.def.visible, '3d') && !s.def.noLand3d);
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
    const noLand = w.objs.filter(o => !o.gone && o.def.noLand3d && activeIn(o.def.visible, '3d')).map(objBox);
    const free = (x: number, zz: number): boolean => {
      const pb = boxAt(x, p.y, zz);
      return inBounds(w, x, zz, '3d') && !hits(boxes, pb, '3d') && !noLand.some(nb => overlapsXZ(pb, nb));
    };
    // 圖紙裡踩著東西 → 回到現實也要踩得到東西 (避免切回 3D 就掉進坑或落在被圍住的書架上)
    const landable = (x: number, zz: number): boolean =>
      free(x, zz) && supportsAt(w, x, p.y, zz, '3d').some(s => !s.def.noLand3d);
    const spot = (sup2d.length ? nearestFree(landable, p.x, z) : null) ?? nearestFree(free, p.x, z);
    if (!spot) { say(w, MSG_SQUEEZE); return { ok: false }; }
    [p.x, p.z] = spot;
    p.mode = '3d';
  }
  p.vy = 0;
  p.onGround = false;
  return { ok: true };
}
