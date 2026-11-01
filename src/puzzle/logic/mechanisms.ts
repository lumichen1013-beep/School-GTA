import type { World } from './types';
import { activeIn, objBox, playerBox } from './geometry';
import { resolvePlayerOverlap } from './place';
import { say } from './world';

export const MSG_PLATE_ON = '圖紙上的壓板沉了下去。牆的另一頭，有什麼被拉起來了。';
export const MSG_PLATE_LIGHT = '紙上的壓板一動也不動。你太輕了。';
export const MSG_CRATE_RESET = '木箱回到了原來的地方。';

/**
 * 壓力板只畫在圖紙上：圖紙模式下，若有木箱的投影中心落在板的 x 範圍內 (任何深度皆可，壓平後同一平面)
 * 就壓下並鎖定，開啟對應閘門；玩家太輕壓不動。
 */
export function updatePlates(w: World): void {
  const p = w.player;
  for (const plate of w.objs) {
    if (plate.def.type !== 'plate' || plate.used || !activeIn(plate.def.visible, p.mode)) continue;
    const b = objBox(plate);
    const heavy = w.objs.some(c => c.def.pushable && !c.gone && c.x >= b.min[0] && c.x <= b.max[0] && Math.abs(c.y - plate.y) < 0.05);
    if (heavy) {
      plate.used = true;
      const gate = plate.def.opens ? w.byId.get(plate.def.opens) : undefined;
      if (gate) gate.used = true;
      say(w, MSG_PLATE_ON);
      continue;
    }
    const pb = playerBox(p);
    const standing = p.onGround && Math.abs(p.y - plate.y) < 0.1 && pb.max[0] > b.min[0] && pb.min[0] < b.max[0];
    if (standing && !plate.touched) say(w, MSG_PLATE_LIGHT);
    plate.touched = standing;
  }
}

/** T：所有木箱回到初始位置 (避免推進死角卡關)；若木箱回到玩家身上則把玩家挪到最近空位 */
export function resetCrates(w: World): void {
  if (w.cleared) return;
  for (const o of w.objs) {
    if (!o.def.pushable) continue;
    o.x = o.def.x; o.y = o.def.y; o.z = o.def.z;
  }
  resolvePlayerOverlap(w);
  say(w, MSG_CRATE_RESET);
}
