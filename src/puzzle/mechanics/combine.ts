// N28 道具合成 (P13；architecture 4.19 combine.ts 最小版；規格 6「2-2 閱覽室（細化）」2-2c)
// - 配方表 (固定)：兩件章節道具 → 一件；道具屬於章節 (ChapterState.items，跟著玩家跨房)
// - WorldCommand {t:'combine'} (C 鍵 / HUD「合成」鈕)：手上有一組配方 → 合成；只有一件 / 沒有 → 說明 (合成失敗有回饋)
// - lens：拾取物 (資料以 grants 指定道具)；smallPrint：要持有 requires 的道具才讀得到的小字 (讀到 = used、done、給 reward)
// - v0.4 第五章 5-3 合成台 (Recipe.station)：配方指定一個物件類型當台——這間房有那個類型的物件 (在場、沒用過) 才合得了；
//   兩件都在手上但沒有台 = 說 stationText、不合成；合成成功 → 台 used (doneFlag 由台的資料給)。2-2c 的配方沒有台 (照舊隨處可合)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjState, TextKey, World } from '../core/types';
import { addItem, hasItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 小拾取物 (鏡片)：資料以 grants 指定取得的道具 */
    lens: {};
    /** 書脊上的小字：requires = 看得清要的道具 (lockedText = 看不清)；第一次讀到 → used、doneFlag、reward、firstText；之後再按 = readText */
    smallPrint: { readText: TextKey; firstText: TextKey; reward?: ItemId };
  }
}

/** 配方：parts 兩件都持有 → 各減一、得到 out；text = 合成時的訊息；station = 合成台的物件類型 (這間房要有；stationText = 沒有台時的說明) */
export interface Recipe { parts: readonly [ItemId, ItemId]; out: ItemId; text: TextKey; station?: string; stationText?: TextKey }
export const RECIPES: readonly Recipe[] = [
  { parts: ['frame', 'lens'], out: 'magnifier', text: 'msg.combine.magnifier' },
  // 5-3 西窗：爸爸的墨水瓶 + 許問津的空白羊皮紙 → 可寫的手記頁 (台 = 爸爸書桌上的筆記本，mechanics/desk)
  { parts: ['ink.father', 'parchment'], out: 'page.blank', text: 'msg.combine.page', station: 'writingDesk', stationText: 'msg.combine.noDesk' }
];

/** 這間房此刻的合成台 (配方沒有台 = null；有台但不在場 / 用過 = undefined) */
export function stationOf(w: World, r: Recipe): ObjState | null | undefined {
  if (!r.station) return null;
  return w.objs.find(o => o.def.type === r.station && !o.gone && !o.used);
}

/** 此刻能合成的第一個配方 (兩件都在手上、要台的配方這間房有台；HUD 的「合成」鈕也用它) */
export const readyRecipe = (w: World): Recipe | null => RECIPES.find(r => r.parts.every(p => hasItem(w, p)) && stationOf(w, r) !== undefined) ?? null;

/** 合成：有配方 → 合成 (有台 = 台 used、doneFlag)；兩件都在手上但沒有台 → stationText；手上只有某配方的一件 → 「只有一樣」；都沒有 → 「沒有能湊在一起的」 */
export function combine(w: World): void {
  const r = readyRecipe(w);
  if (r) {
    for (const p of r.parts) addItem(w, p, -1);
    addItem(w, r.out, 1);
    const st = stationOf(w, r);
    if (st) {
      st.used = true;
      if (st.def.doneFlag) w.events.push({ t: 'done', flag: st.def.doneFlag });
    }
    say(w, r.text);
    return;
  }
  const held = RECIPES.find(x => x.parts.every(p => hasItem(w, p)) && x.stationText);
  if (held?.stationText) { say(w, held.stationText); return; }
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
