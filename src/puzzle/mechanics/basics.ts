import type { Mechanic } from '../core/registry';

/** 無行為的基本類型 (地板、牆、欄杆、桌、高台、書架、木箱)；註冊讓類型都有擁有者 */
export const basics: Mechanic = {
  id: 'basics',
  types: { floor: {}, wall: {}, rail: {}, table: {}, plinth: {}, shelf: {}, crate: {} }
};
