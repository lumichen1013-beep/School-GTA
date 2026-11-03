import type { Mechanic } from '../core/registry';
import type { ItemId } from '../core/types';
import { addItem } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 拾取物 (筆尖)：資料以 grants 指定取得的物品 */
    key: {};
    /** 鎖 (墨水閥)：資料以 requires 指定需求、opens 指定解開的對象 */
    valve: {};
    /** 掛鉤 (1-3a；高處)：grants 取得主要物品 (房間的銅鑰匙)，also = 一併取得的其他物品 (許問津的手記一頁) */
    hook: { also?: ItemId[] };
  }
}

// 物品查詢 (N9)：狀態在核心 World.inv，requires / grants 的通用流程在 core/interact
export { hasItem, addItem } from '../core/world';

/** C8 / N9：通用鑰匙與鎖，行為全由物件資料 (requires / grants / opens / lockedText / useText) 驅動 */
export const items: Mechanic = {
  id: 'items',
  types: {
    key: { verbKey: 'obj.key.verb' },
    valve: { verbKey: 'obj.valve.verb' },
    hook: { verbKey: 'obj.hook.verb', interact: (w, o) => { if (o.def.type === 'hook') for (const i of o.def.also ?? []) addItem(w, i, 1); } }
  }
};
