// 衣帽間的衣架與三件大衣 (1-3；規格 9.1 驚嚇「1-3a 完成後三件大衣同時滑落」)：
// 謎題完成 (fallWhen 物品到手) 後進衣帽間，相對安靜 SCARE_DELAY 秒才滑落 (used = 已滑落)；只影響呈現 (衣架不擋路、不可互動)。
// 演出過 → 章節旗標 scare:<id> (R 不還原)；之後再進房 / R → 一開始就安靜地倒在地上，不再演
import type { Mechanic } from '../core/registry';
import type { ItemId, TextKey } from '../core/types';
import { hasItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 衣架 (掛三件大衣)：fallWhen = 持有此物品後滑落；scare = 驚嚇 id (旗標 scare:<id>)；fallText = 滑落時的訊息 */
    coatRack: { fallWhen: ItemId; scare: string; fallText: TextKey };
  }
}

/** 驚嚇前的安靜時間 (秒；規格 9.1「觸發前 ≥ 2 秒相對安靜」) */
export const SCARE_DELAY = 2.5;
export const scareFlag = (id: string): string => `scare:${id}`;

export const coats: Mechanic = {
  id: 'coats',
  types: { coatRack: {} },
  afterPhysics: w => {
    for (const o of w.objs) {
      if (o.def.type !== 'coatRack' || o.used) continue;
      const flag = scareFlag(o.def.scare);
      if (w.ext.flags?.includes(flag)) { o.used = true; continue; }
      if (!hasItem(w, o.def.fallWhen) || w.time < SCARE_DELAY) continue;
      o.used = true;
      w.events.push({ t: 'flag', flag });
      say(w, o.def.fallText);
    }
  }
};
