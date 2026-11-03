// N28 道具合成 (P13；architecture 4.19 combine.ts 最小版；規格 6「2-2 閱覽室（細化）」2-2c)
// - 配方表 (固定)：兩件章節道具 → 一件；道具屬於章節 (ChapterState.items，跟著玩家跨房)
// - WorldCommand {t:'combine'} (C 鍵 / HUD「合成」鈕)：手上有一組配方 → 合成；只有一件 / 沒有 → 說明 (合成失敗有回饋)
// - lens：拾取物 (資料以 grants 指定道具)；smallPrint：要持有 requires 的道具才讀得到的小字 (讀到 = used、done、給 reward)
import type { Mechanic } from '../core/registry';
import type { ItemId, TextKey, World } from '../core/types';
import { addItem, hasItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 小拾取物 (鏡片)：資料以 grants 指定取得的道具 */
    lens: {};
    /** 書脊上的小字：requires = 看得清要的道具 (lockedText = 看不清)；第一次讀到 → used、doneFlag、reward、firstText；之後再按 = readText */
    smallPrint: { readText: TextKey; firstText: TextKey; reward?: ItemId };
  }
}

/** 配方：parts 兩件都持有 → 各減一、得到 out；text = 合成時的訊息 */
export interface Recipe { parts: readonly [ItemId, ItemId]; out: ItemId; text: TextKey }
export const RECIPES: readonly Recipe[] = [
  { parts: ['frame', 'lens'], out: 'magnifier', text: 'msg.combine.magnifier' }
];

/** 此刻能合成的第一個配方 (HUD 的「合成」鈕也用它) */
export const readyRecipe = (w: World): Recipe | null => RECIPES.find(r => r.parts.every(p => hasItem(w, p))) ?? null;

/** 合成：有配方 → 合成；手上只有某配方的一件 → 「只有一樣」；都沒有 → 「沒有能湊在一起的」 */
export function combine(w: World): void {
  const r = readyRecipe(w);
  if (r) {
    for (const p of r.parts) addItem(w, p, -1);
    addItem(w, r.out, 1);
    say(w, r.text);
    return;
  }
  say(w, RECIPES.some(x => x.parts.some(p => hasItem(w, p))) ? 'msg.combine.half' : 'msg.combine.none');
}

export const combineMech: Mechanic = {
  id: 'combine',
  types: {
    lens: { verbKey: 'obj.lens.verb' },
    smallPrint: {
      verbKey: 'obj.smallPrint.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'smallPrint') return;
        if (o.used) { say(w, o.def.readText); return; }
        o.used = true;
        if (o.def.reward) addItem(w, o.def.reward, 1);
        say(w, o.def.firstText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    }
  },
  command: (w, cmd) => {
    if (cmd.t !== 'combine') return false;
    combine(w);
    return true;
  }
};
