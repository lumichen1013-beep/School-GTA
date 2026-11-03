// 2-2 閱覽室 (規格 6「2-2 閱覽室（細化）」)：書檯、閱覽桌 (呈現)、對聯櫃 (2-2b 的鎖；左扇刻上聯)、下聯 (2-2b 的標籤所在)、卡片目錄櫃 (三張詞卡)
// - 對聯櫃 coupletCabinet：3D 按 E → 還鎖著 = 讀左扇的刻字 (上聯只在實景)；打開了 (下聯寫對，labels 的 opens) = 說櫃子空了
// - 下聯 couplet：只畫在藏寶圖上的墨字；本身不可互動，2D 站在它前面按 E = 開字卡匣 (標籤 kind 'blank'，mechanics/labels)
// - 卡片目錄櫃 cardCatalog：3D 拉抽屜 → 取得 cards (詞卡)，used；之後再按 = 空了
import type { Mechanic } from '../core/registry';
import type { ItemId, TextKey } from '../core/types';
import { addItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 書檯 (純呈現，不擋路) */
    lectern: {};
    /** 閱覽桌 (純呈現，不擋路) */
    readingTable: {};
    /** 對聯櫃：upper = 左扇刻的上聯 (外觀)；lockedRead = 還鎖著時按 E 的說明；openRead = 打開後 */
    coupletCabinet: { upper: TextKey; lockedRead: TextKey; openRead: TextKey };
    /** 下聯 (藏寶圖上的墨字；標籤 kind 'blank' 掛在這裡) */
    couplet: {};
    /** 卡片目錄櫃：cards = 抽屜裡的詞卡；emptyText = 拿過之後 */
    cardCatalog: { cards: readonly ItemId[]; emptyText: TextKey };
  }
}

export const reading: Mechanic = {
  id: 'reading',
  types: {
    lectern: {},
    readingTable: {},
    couplet: {},
    coupletCabinet: {
      verbKey: 'obj.coupletCabinet.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'coupletCabinet') say(w, o.used ? o.def.openRead : o.def.lockedRead); }
    },
    cardCatalog: {
      verbKey: 'obj.cardCatalog.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'cardCatalog') return;
        if (o.used) { say(w, o.def.emptyText); return; }
        o.used = true;
        for (const c of o.def.cards) addItem(w, c, 1);
        say(w, o.def.useText ?? o.def.emptyText);
      }
    }
  }
};
