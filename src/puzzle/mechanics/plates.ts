import type { Mechanic } from '../core/registry';
import type { World } from '../core/types';
import { objBox, playerBox } from '../core/geometry';
import { isActiveIn } from '../core/presence';
import { openLinks, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 圖紙壓板：木箱壓下即鎖定並觸發 opens */
    plate: {};
  }
}

/**
 * 壓力板只畫在圖紙上：圖紙模式下，若有木箱的投影中心落在板的 x 範圍內 (任何深度皆可，壓平後同一平面)
 * 就壓下並鎖定，開啟對應閘門；玩家太輕壓不動。(C6；行為照舊：鎖定、不計數)
 */
export function updatePlates(w: World): void {
  const p = w.player;
  for (const plate of w.objs) {
    if (plate.def.type !== 'plate' || plate.used || !isActiveIn(w, plate, p.mode)) continue;
    const b = objBox(plate);
    const heavy = w.objs.some(c => c.def.pushable && !c.gone && c.x >= b.min[0] && c.x <= b.max[0] && Math.abs(c.y - plate.y) < 0.05);
    if (heavy) {
      plate.used = true;
      openLinks(w, plate);
      say(w, 'msg.plate.on');
      continue;
    }
    const pb = playerBox(p);
    const standing = p.onGround && Math.abs(p.y - plate.y) < 0.1 && pb.max[0] > b.min[0] && pb.min[0] < b.max[0];
    if (standing && !plate.touched) say(w, 'msg.plate.light');
    plate.touched = standing;
  }
}

export const plates: Mechanic = {
  id: 'plates',
  types: { plate: {} },
  afterPhysics: w => updatePlates(w)
};
