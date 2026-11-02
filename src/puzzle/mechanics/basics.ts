import type { Mechanic } from '../core/registry';

declare module '../core/types' {
  interface ObjKinds {
    /** 鐵柵 (1-1a；只在現實)：擋路的柵欄 */
    bars: {};
    /** 圖上的墨牆 (1-1a；只在藏寶圖)：擋路的墨水牆 */
    inkwall: {};
    /** 玻璃牆 (1-1c；只在現實)：把房間分成前後 */
    glass: {};
    /** 木板橋 (1-1b；只在現實)：跨坑的走道 */
    plank: {};
    /** 石階 / 台階 (1-1b、1-1c；兩邊都有)：可站上的石塊 */
    stone: {};
  }
}

/** 無行為的基本類型 (地板、牆、欄杆、桌、高台、書架、木箱、鐵柵、墨牆、玻璃牆、木板橋、石階)；註冊讓類型都有擁有者 */
export const basics: Mechanic = {
  id: 'basics',
  types: { floor: {}, wall: {}, rail: {}, table: {}, plinth: {}, shelf: {}, crate: {}, bars: {}, inkwall: {}, glass: {}, plank: {}, stone: {} }
};
