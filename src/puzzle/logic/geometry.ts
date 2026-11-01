import type { Box, Mode, ObjState, Player, V3, Visibility, World } from './types';
import { EPS, PLAYER_H, PLAYER_HW } from './constants';

export const activeIn = (v: Visibility, m: Mode): boolean => v === 'both' || v === m;

export function objBox(o: ObjState): Box {
  const { w, h, d } = o.def;
  return { min: [o.x - w / 2, o.y, o.z - d / 2], max: [o.x + w / 2, o.y + h, o.z + d / 2] };
}

export function boxAt(x: number, y: number, z: number): Box {
  return { min: [x - PLAYER_HW, y, z - PLAYER_HW], max: [x + PLAYER_HW, y + PLAYER_H, z + PLAYER_HW] };
}
export const playerBox = (p: Player): Box => boxAt(p.x, p.y, p.z);

/** 嚴格相交；2D 壓平模式完全忽略 z (所有物體視為同一平面) */
export function overlaps(a: Box, b: Box, mode: Mode): boolean {
  const axes = mode === '2d' ? 2 : 3;
  for (let i = 0; i < axes; i++) {
    if (!(a.min[i] < b.max[i] - EPS && a.max[i] > b.min[i] + EPS)) return false;
  }
  return true;
}

/** 目前模式下生效的實體 (可見模式吻合、未被拾取、solid) */
export function solidsFor(w: World, mode: Mode): ObjState[] {
  return w.objs.filter(o => !o.gone && o.def.solid && activeIn(o.def.visible, mode));
}

/** 沿單軸掃掠：回傳可移動距離 (含正負號) 與擋住的物件 */
export function sweepAxis(box: Box, axis: 0 | 1 | 2, delta: number, solids: ObjState[], mode: Mode): { allowed: number; hit: ObjState | null } {
  let allowed = delta;
  let hit: ObjState | null = null;
  const axes = mode === '2d' ? 2 : 3;
  for (const s of solids) {
    const sb = objBox(s);
    let cross = true;
    for (let i = 0; i < axes; i++) {
      if (i === axis) continue;
      if (!(box.min[i] < sb.max[i] - EPS && box.max[i] > sb.min[i] + EPS)) { cross = false; break; }
    }
    if (!cross) continue;
    if (delta > 0) {
      const gap = sb.min[axis] - box.max[axis];
      if (gap >= -EPS && gap < allowed) { allowed = Math.max(gap, 0); hit = s; }
    } else if (delta < 0) {
      const gap = box.min[axis] - sb.max[axis];
      if (gap >= -EPS && -gap > allowed) { allowed = -Math.max(gap, 0); hit = s; }
    }
  }
  return { allowed, hit };
}

/** 腳下的支撐物 (頂面約等於腳底且水平投影重疊) */
export function supportsOf(w: World, p: Player, mode: Mode): ObjState[] {
  const pb = boxAt(p.x, p.y - 0.05, p.z);
  return solidsFor(w, mode).filter(s => {
    const sb = objBox(s);
    return Math.abs(sb.max[1] - p.y) < 0.02 && overlaps(pb, sb, mode);
  });
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const toV3 = (x: number, y: number, z: number): V3 => [x, y, z];
