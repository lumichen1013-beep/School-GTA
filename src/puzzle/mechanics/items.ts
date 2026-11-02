import type { Mechanic } from '../core/registry';

declare module '../core/types' {
  interface ObjKinds {
    /** 拾取物 (筆尖)：資料以 grants 指定取得的物品 */
    key: {};
    /** 鎖 (墨水閥)：資料以 requires 指定需求、opens 指定解開的對象 */
    valve: {};
  }
}

// 物品查詢 (N9)：狀態在核心 World.inv，requires / grants 的通用流程在 core/interact
export { hasItem, addItem } from '../core/world';

/** C8 / N9：通用鑰匙與鎖，行為全由物件資料 (requires / grants / opens / lockedText / useText) 驅動 */
export const items: Mechanic = {
  id: 'items',
  types: { key: {}, valve: {} }
};
