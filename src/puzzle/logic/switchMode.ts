import type { Box, Mode, World } from './types';
import { MSG_SQUEEZE, PLAYER_HW, SEARCH_RADIUS, SEARCH_STEP } from './constants';
import { boxAt, clamp, objBox, overlaps, solidsFor, supportsOf } from './geometry';
import { say } from './world';

export interface SwitchResult { ok: boolean }

function inBounds(w: World, x: number, z: number, mode: Mode): boolean {
  const b = w.level.bounds;
  if (x < b.minX + PLAYER_HW - 1e-6 || x > b.maxX - PLAYER_HW + 1e-6) return false;
  return mode === '2d' || (z >= b.minZ + PLAYER_HW - 1e-6 && z <= b.maxZ - PLAYER_HW + 1e-6);
}

/** 在 (a,b) 平面上由近到遠找第一個無重疊點；找不到回傳 null */
function nearestFree(free: (a: number, b: number) => boolean, a0: number, b0: number, bMinOffset = -SEARCH_RADIUS): [number, number] | null {
  if (free(a0, b0)) return [a0, b0];
  const n = Math.round(SEARCH_RADIUS / SEARCH_STEP);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let i = -n; i <= n; i++) {
    for (let j = Math.round(bMinOffset / SEARCH_STEP); j <= n; j++) {
      const d = i * i + j * j;
      if (d >= bestD) continue;
      const a = a0 + i * SEARCH_STEP;
      const b = b0 + j * SEARCH_STEP;
      if (free(a, b)) { best = [a, b]; bestD = d; }
    }
  }
  return best;
}

function hits(boxes: Box[], box: Box, mode: Mode): boolean {
  return boxes.some(s => overlaps(box, s, mode));
}

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
    // 站在某物體上就採用該支撐物的 z (落在其 z 範圍內)
    let z = p.z3d;
    const sup = supportsOf(w, p, '2d');
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
    const spot = nearestFree((x, zz) => inBounds(w, x, zz, '3d') && !hits(boxes, boxAt(x, p.y, zz), '3d'), p.x, z);
    if (!spot) { say(w, MSG_SQUEEZE); return { ok: false }; }
    [p.x, p.z] = spot;
    p.mode = '3d';
  }
  p.vy = 0;
  p.onGround = false;
  return { ok: true };
}
