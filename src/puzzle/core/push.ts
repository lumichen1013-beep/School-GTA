import type { ObjState, World } from './types';
import { objBox, solidsFor, sweepAxis } from './geometry';

/** 木箱底下是否仍有支撐 (中心點落在某個頂面等高的實體上) */
function supported(w: World, crate: ObjState, x: number, z: number): boolean {
  return solidsFor(w, '3d').some(s => {
    if (s === crate) return false;
    const b = objBox(s);
    return Math.abs(b.max[1] - crate.y) < 0.02 && x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2];
  });
}

/** 沿 x(0) 或 z(2) 推木箱 delta，被擋 / 出界 / 失去支撐就停；回傳實際位移 (含正負號) */
export function pushCrate(w: World, crate: ObjState, axis: 0 | 2, delta: number): number {
  const box = objBox(crate);
  const others = solidsFor(w, '3d').filter(s => s !== crate);
  let moved = sweepAxis(box, axis, delta, others, '3d').allowed;
  const bd = w.level.bounds;
  const lo = axis === 0 ? bd.minX : bd.minZ;
  const hi = axis === 0 ? bd.maxX : bd.maxZ;
  const half = axis === 0 ? crate.def.w / 2 : crate.def.d / 2;
  const cur = axis === 0 ? crate.x : crate.z;
  moved = Math.min(Math.max(moved, lo + half - cur), hi - half - cur);
  if (Math.sign(moved) !== Math.sign(delta)) moved = 0;
  // 不可推出地板邊緣：失去支撐就縮短位移
  const step = 0.02 * Math.sign(delta || 1);
  while (moved !== 0) {
    const nx = axis === 0 ? crate.x + moved : crate.x;
    const nz = axis === 2 ? crate.z + moved : crate.z;
    if (supported(w, crate, nx, nz)) break;
    moved = Math.abs(moved) <= 0.02 ? 0 : moved - step;
  }
  if (axis === 0) crate.x += moved; else crate.z += moved;
  return moved;
}
