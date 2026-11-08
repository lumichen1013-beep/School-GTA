// v0.4 第五章 三扇窗 (規格 6「5-2 東窗（細化）」)：窗框上的詩 (5-2 換讀法 P18 / P1)、星表匣 (詞卡)
// - poemWindow：窗框兩側直刻的兩行詩；可寫的那一行 = 物件的標籤 (kind 'blank' + label.flip，mechanics/labels)。
//   「倒過來看」= 這間房此刻在 face 那一面 (東窗在底面心：窗外是屋底的黑，玻璃成了鏡子 → 倒影 = 倒讀)。
//   3D 按 E：依此刻的面說 levelText (水平四面：順讀) / upText (朝上：側影) / downText (face：倒影)；讀通之後 (used) = doneText。
//   寫通 = labels 的 solveBlank (物件 used、doneFlag)
// - starCase：書案上的星表匣 (3D 按 E 取得 cards；同 2-2 卡片目錄櫃，mechanics/reading takeCards)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjState, TextKey, World } from '../core/types';
import { faceOfCell, type Side } from '../core/cube';
import { say } from '../core/world';
import { takeCards } from './reading';

declare module '../core/types' {
  interface ObjKinds {
    /**
     * 窗框上的詩：face = 倒過來看的那一面 (5-2 = 'D')；upper / upperFlip = 不可寫的那一行 (順讀 / 倒讀；外觀用)；
     * levelText / upText / downText / doneText = 3D 按 E (水平四面 / 朝上 / 倒過來 / 讀通之後)
     */
    poemWindow: { face: Side; upper: TextKey; upperFlip: TextKey; levelText: TextKey; upText: TextKey; downText: TextKey; doneText: TextKey };
    /** 星表匣：cards = 匣裡的詞卡；emptyText = 拿過之後 */
    starCase: { cards: readonly ItemId[]; emptyText: TextKey };
  }
}

/** 窗此刻的樣子：'flip' = 在 face 那一面 (倒影)、'up' = 朝上 (側影；face 不是 U 時)、'level' = 其餘 (順讀) */
export function windowView(w: World, o: ObjState): 'flip' | 'up' | 'level' {
  if (o.def.type !== 'poemWindow') return 'level';
  const f = faceOfCell(w.ext.cube?.at);
  return f === o.def.face ? 'flip' : f === 'U' ? 'up' : 'level';
}

const VIEW_TEXT = { level: 'levelText', up: 'upText', flip: 'downText' } as const;

export const windows: Mechanic = {
  id: 'windows',
  types: {
    poemWindow: {
      verbKey: 'obj.poemWindow.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'poemWindow') say(w, o.used ? o.def.doneText : o.def[VIEW_TEXT[windowView(w, o)]]); }
    },
    starCase: {
      verbKey: 'obj.starCase.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'starCase') takeCards(w, o, o.def.cards, o.def.emptyText); }
    }
  }
};
