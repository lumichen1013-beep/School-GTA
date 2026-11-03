// N24 顯影 (P14；architecture 4.19 reveal.ts 最小版；規格 6「2-2 閱覽室（細化）」2-2a)
// - openBook：攤開的書 (3D 按 E 翻到下一頁 = used；之後再按 = 重讀)；文字 = useText (第一次) / readText (之後)
// - inkveil：只畫在藏寶圖上的淡墨 (visible '2d')；after = 這個物件 used 之後才在場 (例：書翻到空白頁)；
//   2D 站穩、能寫 (筆尖) 按 E → 塗開 = used (doneFlag 成立 → done 事件)、說 revealText；之後再按 = 重讀。持續到 R (房間快照)
import type { Mechanic } from '../core/registry';
import type { ObjId, ObjState, TextKey, World } from '../core/types';
import { say } from '../core/world';
import { canWrite } from './labels';

declare module '../core/types' {
  interface ObjKinds {
    /** 攤開的書：readText = 翻過頁之後再按 E 的說明 (第一次翻頁的訊息 = useText) */
    openBook: { readText: TextKey };
    /** 淡墨 (顯影)：after = 先 used 才在場的物件；revealText = 塗開後顯出的內容 (說明)；sketch = 顯出的圖上的字 (外觀) */
    inkveil: { after?: ObjId; revealText: TextKey; sketch?: TextKey };
  }
}

/** 淡墨此刻不在場：after 指向的物件還沒 used (例：書還停在開頭那一頁) */
export const veilHidden = (w: World, o: ObjState): boolean =>
  o.def.type === 'inkveil' && o.def.after !== undefined && !w.byId.get(o.def.after)?.used;

/** 塗開淡墨 (2D；要能寫)：第一次 = used + done；之後 = 重讀顯出的內容 */
export function brushVeil(w: World, o: ObjState): void {
  if (o.def.type !== 'inkveil') return;
  if (o.used) { say(w, o.def.revealText); return; }
  if (!canWrite(w)) { say(w, 'msg.reveal.noNib'); return; }
  o.used = true;
  say(w, o.def.revealText);
  if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
}

export const reveal: Mechanic = {
  id: 'reveal',
  types: {
    openBook: {
      verbKey: 'obj.openBook.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'openBook') return;
        if (o.used) { say(w, o.def.readText); return; }
        o.used = true;
        say(w, o.def.useText ?? o.def.readText);
      }
    },
    inkveil: { verbKey: 'obj.inkveil.verb', usableWhenUsed: true, interact: brushVeil }
  },
  hidden: veilHidden
};
