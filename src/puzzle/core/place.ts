import type { Box, Mode, World } from './types';
import { PLAYER_HW, SEARCH_RADIUS, SEARCH_STEP } from './constants';
import { boxAt, objBox, overlaps } from './geometry';
import { MODES } from './modes';
import { solidsFor } from './presence';

export function inBounds(w: World, x: number, z: number, mode: Mode): boolean {
  const b = w.level.bounds;
  if (x < b.minX + PLAYER_HW - 1e-6 || x > b.maxX - PLAYER_HW + 1e-6) return false;
  return !MODES[mode].boundsZ || (z >= b.minZ + PLAYER_HW - 1e-6 && z <= b.maxZ - PLAYER_HW + 1e-6);
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

/** 2D (x-y 平面) 上離 (x,y) 最近的空位：不出界、高於坑底、不與 boxes 重疊；向下最多找 0.5 */
export function nearestFree2d(w: World, boxes: Box[], x: number, y: number): [number, number] | null {
  return nearestFree((a, b) => inBounds(w, a, 0, '2d') && b > w.level.voidY && !hits(boxes, boxAt(a, b, 0), '2d'), x, y, -0.5);
}

/** 各模式把重疊的玩家挪到最近空位的方式 (3D 在 x-z 平面找、2D 在 x-y 平面找) */
const RELOCATE: Readonly<Record<Mode, (w: World, boxes: Box[]) => boolean>> = {
  '3d': (w, boxes) => {
    const p = w.player;
    const spot = nearestFree((x, z) => inBounds(w, x, z, '3d') && !hits(boxes, boxAt(x, p.y, z), '3d'), p.x, p.z);
    if (!spot) return false;
    [p.x, p.z] = spot;
    return true;
  },
  '2d': (w, boxes) => {
    const p = w.player;
    const spot = nearestFree2d(w, boxes, p.x, p.y);
    if (!spot) return false;
    [p.x, p.y] = spot;
    return true;
  }
};

/** 玩家若與目前模式的實體重疊 (例如木箱重置到身上)，移到最近空位；回傳是否成功 */
export function resolvePlayerOverlap(w: World): boolean {
  const p = w.player;
  const boxes = solidsFor(w, p.mode).map(objBox);
  if (!hits(boxes, boxAt(p.x, p.y, p.z), p.mode)) return true;
  return RELOCATE[p.mode](w, boxes);
}
