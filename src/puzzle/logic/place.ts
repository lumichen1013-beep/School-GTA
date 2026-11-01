import type { Box, Mode, World } from './types';
import { PLAYER_HW, SEARCH_RADIUS, SEARCH_STEP } from './constants';
import { boxAt, objBox, overlaps, solidsFor } from './geometry';

export function inBounds(w: World, x: number, z: number, mode: Mode): boolean {
  const b = w.level.bounds;
  if (x < b.minX + PLAYER_HW - 1e-6 || x > b.maxX - PLAYER_HW + 1e-6) return false;
  return mode === '2d' || (z >= b.minZ + PLAYER_HW - 1e-6 && z <= b.maxZ - PLAYER_HW + 1e-6);
}

/** 在 (a,b) 平面上由近到遠找第一個可用點；找不到回傳 null */
export function nearestFree(free: (a: number, b: number) => boolean, a0: number, b0: number, bMinOffset = -SEARCH_RADIUS): [number, number] | null {
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

export function hits(boxes: Box[], box: Box, mode: Mode): boolean {
  return boxes.some(s => overlaps(box, s, mode));
}

/** 玩家若與目前模式的實體重疊 (例如木箱重置到身上)，移到最近空位；回傳是否成功 */
export function resolvePlayerOverlap(w: World): boolean {
  const p = w.player;
  const boxes = solidsFor(w, p.mode).map(objBox);
  if (!hits(boxes, boxAt(p.x, p.y, p.z), p.mode)) return true;
  const spot = p.mode === '3d'
    ? nearestFree((x, z) => inBounds(w, x, z, '3d') && !hits(boxes, boxAt(x, p.y, z), '3d'), p.x, p.z)
    : nearestFree((x, y) => inBounds(w, x, 0, '2d') && y > w.level.voidY && !hits(boxes, boxAt(x, y, 0), '2d'), p.x, p.y, -0.5);
  if (!spot) return false;
  if (p.mode === '3d') [p.x, p.z] = spot; else [p.x, p.y] = spot;
  return true;
}
