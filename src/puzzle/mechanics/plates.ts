import type { Mechanic } from '../core/registry';
import type { World } from '../core/types';
import { objBox, playerBox } from '../core/geometry';
import { isActiveIn } from '../core/presence';
import { openLinks, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 圖紙壓板：壓在上面的重量 ≥ weight (預設 = 一個原尺寸木箱) 即壓下、鎖定並觸發 opens */
    plate: { weight?: number };
  }
}

/** 重量換算 (規格 N2；1-2b)：一個原尺寸木箱 = 2、玩家 = 1 */
export const CRATE_WEIGHT = 2;
export const PLAYER_WEIGHT = 1;

/**
 * 壓力板只畫在圖紙上：圖紙模式下，投影中心落在板的 x 範圍內的木箱 (任何深度皆可，壓平後同一平面) 與站在板上的玩家
 * 合計重量 ≥ 板的 weight 就壓下並鎖定，開啟對應閘門；不夠重說「你太輕了」。(C6；鎖定、不計數)
 */
export function updatePlates(w: World): void {
  const p = w.player;
  for (const plate of w.objs) {
    if (plate.def.type !== 'plate' || plate.used || !isActiveIn(w, plate, p.mode)) continue;
    const b = objBox(plate);
    const crates = w.objs.filter(c => c.def.pushable && !c.gone && c.x >= b.min[0] && c.x <= b.max[0] && Math.abs(c.y - plate.y) < 0.05).length;
    const pb = playerBox(p);
    const standing = p.onGround && Math.abs(p.y - plate.y) < 0.1 && pb.max[0] > b.min[0] && pb.min[0] < b.max[0];
    if (crates * CRATE_WEIGHT + (standing ? PLAYER_WEIGHT : 0) >= (plate.def.weight ?? CRATE_WEIGHT)) {
      plate.used = true;
      openLinks(w, plate);
      say(w, 'msg.plate.on');
      continue;
    }
    if (standing && !plate.touched) say(w, 'msg.plate.light');
    plate.touched = standing;
  }
}

export const plates: Mechanic = {
  id: 'plates',
  types: { plate: {} },
  afterPhysics: w => updatePlates(w)
};
