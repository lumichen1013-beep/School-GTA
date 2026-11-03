// 2-1 書架迴廊 (規格 6「2-1 書架迴廊（細化）」)：屋框書牆的三段、書擋 (2-1a)、矮書架的書 / 暗格 / 眉批 (2-1b)、老宅圖殘片
// - frameBay：屋框北牆是一整面固定的書牆，分成三段 (= 上列第 0 / 1 / 2 行的背後)；房間在第幾行，就只有那一段的東西在場
//   (World.ext.cube.at 由章節層寫入；沒有魔方資訊 = 開章位置第 0 行)
// - 書擋 (bookend)：3D 推倒 → used、doneFlag 成立 (done 事件；外殼解開下列的鎖扣)；倒下後再按 E = 讀底座的刻字
// - 書 (spine) / 暗格 (bookLock)：3D 抽書；是暗格的答案 → 暗格打開、取得 reward；不是 → 滑回去 (無懲罰)
// - 眉批 (remark)：爸爸寫在書架上的字 (只在它所在的視角讀得到；資訊物件，不是提示字條)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { addItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjBase {
    /** 屬於屋框書牆的第幾段 (上列第幾行的背後)；房間不在上列的那一行時不在場 */
    frameBay?: number;
  }
  interface ObjKinds {
    /** 屋框書牆的一段 (純呈現；不擋路、不可互動)；variant = 書的配色；turnWhen = 這個物件 used 後書背轉過來 (2-1c 全亮)；gaps = 讓出來放物件的格子 (x) */
    bayShelf: { variant: number; turnWhen?: ObjId; gaps?: number[] };
    /** 書擋 (2-1a)：useText = 推倒時的訊息 (含底座刻字)；readText = 倒下後再按 E 讀到的刻字；plateText = 底座刻字牌上的字 (外觀) */
    bookend: { readText: TextKey; plateText: TextKey };
    /** 矮書架上的一本書 (2-1b)：lock = 暗格；title = 只畫在藏寶圖上的書名 (沒有 = 不寫)；drawnText = 只畫在圖上的書，2D 按 E 的說明 */
    spine: { lock: ObjId; title?: TextKey; drawnText?: TextKey };
    /** 暗格 (2-1b 的鎖；不可互動)：answer = 抽了會打開的書；reward = 打開時取得；openText / wrongText / doneText = 打開 / 抽錯 / 已打開時再抽 */
    bookLock: { answer: ObjId; reward: ItemId; openText: TextKey; wrongText: TextKey; doneText: TextKey };
    /** 眉批 (2-1b 的線索)：按 E 讀出 textKey；ink = 藏寶圖上的墨字 (外觀)，否則實景的鉛筆字 */
    remark: { textKey: TextKey; ink?: boolean };
    /** 老宅圖殘片 (收集物；資料以 grants 指定 scrap.<n>) */
    scrap: {};
    /** 矮書架 (2-1b 的書站在上面；不擋路，純呈現) */
    lowShelf: {};
    /** 書梯 (木頭墊腳台；實體，可站上) */
    libraryStep: {};
  }
}

/** 房間此刻在上列的第幾行 (沒有魔方資訊 = 第 0 行；不在上列 = null：背後沒有屋框書牆) */
export function shelfColumn(w: World): number | null {
  const at = w.ext.cube?.at;
  if (!at) return 0;
  return at[1] === 0 && at[2] === 0 ? at[0] : null;
}

/** 這個物件此刻是否被藏起來 (屬於屋框書牆的另一段) */
export const offBay = (w: World, o: ObjState): boolean => o.def.frameBay !== undefined && shelfColumn(w) !== o.def.frameBay;

/** 抽一本書 (3D)：暗格已開 → 說明；是答案 → 打開、取得 reward、done 事件；不是 → 滑回去 */
export function pullSpine(w: World, book: ObjState): void {
  if (book.def.type !== 'spine') return;
  const lock = w.byId.get(book.def.lock);
  if (!lock || lock.def.type !== 'bookLock') return;
  if (lock.used) { say(w, lock.def.doneText); return; }
  if (book.def.id !== lock.def.answer) { say(w, lock.def.wrongText); return; }
  lock.used = true;
  book.used = true;
  addItem(w, lock.def.reward, 1);
  say(w, lock.def.openText);
  if (lock.def.doneFlag) w.events.push({ t: 'done', flag: lock.def.doneFlag });
}

export const shelf: Mechanic = {
  id: 'shelf',
  types: {
    bayShelf: {},
    bookend: {
      verbKey: 'obj.bookend.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'bookend') return;
        if (o.used) { say(w, o.def.readText); return; }
        o.used = true;
        say(w, o.def.useText ?? o.def.readText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    },
    spine: {
      verbKey: 'obj.spine.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'spine') return;
        // 只畫在圖上的書 (2D 才在場)：碰到的是紙
        if (o.def.drawnText && w.player.mode === '2d') { say(w, o.def.drawnText); return; }
        pullSpine(w, o);
      }
    },
    bookLock: {},
    remark: { verbKey: 'obj.remark.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'remark') say(w, o.def.textKey); } },
    scrap: { verbKey: 'obj.scrap.verb' },
    lowShelf: {},
    libraryStep: {}
  },
  hidden: offBay
};
