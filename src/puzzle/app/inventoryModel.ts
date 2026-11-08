// 道具欄 popup 的資料 (純函式，Node 可測；ui/inventory.ts 只負責畫)：持有的道具排成格子 (一格一個圖示)、空格補到至少 12 格 (整列)；
// 點一格 = 在 popup 內顯示名稱與說明；字卡 (card.*) 另標「可在字卡匣使用」(字卡匣 N22 照舊負責貼卡，道具欄只是檢視)
import type { Text } from '../text/text';
import { itemIcon } from '../ui/icons';
import type { InventoryCell, InventoryView } from '../ui/inventory';

export type { InventoryCell, InventoryView } from '../ui/inventory';

/** 最少格數、每列格數 (超過自動增列；popup 內可捲動) */
export const MIN_SLOTS = 12;
export const COLS = 4;

/** 名稱 (term.<id>；沒有 = id 本身) 與說明 (item.<id>.desc；沒有 = 後備說明) */
export function itemName(text: Text, id: string): string { return text(`term.${id}`); }
export function itemDesc(text: Text, id: string): string {
  return text(text.has(`item.${id}.desc`) ? `item.${id}.desc` : 'item.generic.desc');
}
/** 卡面的字：名稱「詞卡「外」」裡的「外」 */
const cardGlyph = (name: string): string => /「(.+?)」/.exec(name)?.[1] ?? '';

/**
 * inv = World.inv (數量 > 0)；selected = 點選的那一格 (不在手上 = 沒有說明)
 */
export function deriveInventory(inv: Readonly<Record<string, number>>, text: Text, selected: string | null): InventoryView {
  const owned = Object.entries(inv).filter(([, n]) => n > 0);
  const cells: InventoryCell[] = owned.map(([id, n]) => {
    const name = itemName(text, id);
    const card = id.startsWith('card.');
    return { id, name, n, icon: itemIcon(id, card ? cardGlyph(name) : '').svg, card, selected: id === selected };
  });
  const slots = Math.max(MIN_SLOTS, Math.ceil(cells.length / COLS) * COLS);
  const sel = cells.find(c => c.selected);
  return {
    title: text('ui.items.title'),
    close: text('ui.items.close'),
    cells,
    slots,
    count: owned.reduce((s, [, n]) => s + n, 0),
    empty: cells.length ? null : text('ui.items.empty'),
    detail: sel ? { name: sel.name, desc: itemDesc(text, sel.id), count: sel.n > 1 ? text('ui.items.count', { n: sel.n }) : null, note: sel.card ? text('ui.items.cardNote') : null } : null,
    hint: text('ui.items.pick'),
    slotLabel: text('ui.items.slot')
  };
}
