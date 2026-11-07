import type { Box, ObjState, World } from './types';
import { EPS } from './constants';
import { objBox, overlaps, sweepAxis } from './geometry';
import { solidsFor } from './presence';
import { resolvePlayerOverlap } from './place';
import { say } from './world';

/** 木箱底下是否仍有支撐 (中心點落在某個頂面等高的實體上) */
function supported(w: World, crate: ObjState, x: number, z: number): boolean {
  return solidsFor(w, '3d').some(s => {
    if (s === crate) return false;
    const b = objBox(s);
    return Math.abs(b.max[1] - crate.y) < 0.02 && x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2];
  });
}

/** box 與 z 沿 axis 的重疊長度 (不相交 = 0) */
const depth = (box: Box, z: Box, axis: 0 | 2): number => (overlaps(box, z, '3d') ? Math.min(box.max[axis], z.max[axis]) - Math.max(box.min[axis], z.min[axis]) : 0);

/**
 * 禁區 (Mechanic.pushKeepOut；例：門前淨空區)：還沒進去的推到邊界就停；已經在裡面的 (例：剛從拱門推過來) 只能往外、不能更深
 */
function clipKeepOut(w: World, crate: ObjState, box: Box, axis: 0 | 2, moved: number): number {
  for (const m of w.rt.mechanics.pushKeepOut) {
    for (const z of m.pushKeepOut!(w, crate)) {
      const at = (d: number): Box => {
        const b: Box = { min: [...box.min], max: [...box.max] };
        b.min[axis] += d; b.max[axis] += d;
        return b;
      };
      const before = depth(box, z, axis);
      if (depth(at(moved), z, axis) <= before + EPS) continue;
      if (before > 0) { moved = 0; continue; }
      // 進去之前停在邊界 (sweepAxis 同理：其他軸要相交才擋得到)
      const gap = moved > 0 ? z.min[axis] - box.max[axis] : box.min[axis] - z.max[axis];
      moved = Math.sign(moved) * Math.max(0, Math.min(Math.abs(moved), gap));
    }
  }
  return moved;
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
  if (moved !== 0) moved = clipKeepOut(w, crate, box, axis, moved);
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

/** T：所有木箱回到初始位置 (避免推進死角卡關)；若木箱回到玩家身上則把玩家挪到最近空位 (C12) */
export function resetCrates(w: World): void {
  if (w.cleared) return;
  for (const o of w.objs) {
    if (!o.def.pushable) continue;
    o.x = o.def.x; o.y = o.def.y; o.z = o.def.z;
  }
  resolvePlayerOverlap(w);
  say(w, 'msg.crateReset');
}
