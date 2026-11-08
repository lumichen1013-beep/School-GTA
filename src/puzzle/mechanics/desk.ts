// v0.4 第五章 5-3 西窗 (規格 6「5-3 西窗（細化）」)：爸爸的書桌 (合成台)、墨水瓶、許問津的空白羊皮紙 (P13 / P1)
// - writingDesk：書桌上的筆記本與吸墨墊 = 合成台 (mechanics/combine 的 Recipe.station)。3D 按 E：合得了就合成 (同 C)、
//   不然說 readText；合成之後 (used) = doneText。doneFlag 由資料給 (合成成功時 combine 推 done 事件)
// - inkBottle：墨水瓶 (通用拾取：grants + useText，只在實景；自己的類型只為外觀)
// - parchment：羊皮紙捲 (拾取物；item = 給的道具；不用 ObjBase.grants 的通用拾取)。名詞標籤帶方槽：貼著「大」= bigText、「小」= smallText，都不給
import type { Mechanic } from '../core/registry';
import type { ItemId, TextKey } from '../core/types';
import { addItem, say } from '../core/world';
import { combine, readyRecipe, stationOf } from './combine';
import { scaleCardOn } from './scale';

declare module '../core/types' {
  interface ObjKinds {
    /** 合成台 (書桌上的筆記本)：readText = 還合不了時、doneText = 合成之後 */
    writingDesk: { readText: TextKey; doneText: TextKey };
    /** 墨水瓶 (通用拾取：grants / useText) */
    inkBottle: {};
    /** 羊皮紙捲：item = 拿到的道具；bigText / smallText = 標籤上貼著「大」/「小」時 (拿不走) */
    parchment: { item: ItemId; bigText: TextKey; smallText: TextKey };
  }
}

export const desk: Mechanic = {
  id: 'desk',
  types: {
    writingDesk: {
      verbKey: 'obj.writingDesk.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'writingDesk') return;
        if (o.used) { say(w, o.def.doneText); return; }
        const r = readyRecipe(w);
        if (r && stationOf(w, r) === o) { combine(w); return; }
        say(w, o.def.readText);
      }
    },
    inkBottle: { verbKey: 'obj.inkBottle.verb' },
    parchment: {
      verbKey: 'obj.parchment.verb',
      interact: (w, o) => {
        if (o.def.type !== 'parchment') return;
        const c = scaleCardOn(o.def, w.ext.labels);
        if (c === 'card.da') { say(w, o.def.bigText); return; }
        if (c === 'card.xiao') { say(w, o.def.smallText); return; }
        o.gone = true;
        addItem(w, o.def.item, 1);
        if (o.def.useText) say(w, o.def.useText);
      }
    }
  }
};
