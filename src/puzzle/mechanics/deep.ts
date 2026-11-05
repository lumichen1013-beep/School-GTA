// 2-5 書房深處 (規格 6「2-5 書房深處（細化）」)：鑰匙台 (柄 + 三枚齒 → 房間的銅鑰匙；固定動作，不計題)、手記架 (許問津的手記)、章門平台 (實體、呈現)
import type { Mechanic } from '../core/registry';
import type { ItemId, TextKey } from '../core/types';
import { addItem, hasItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 鑰匙台：parts 全部持有 → 各減一、得到 out、used、okText；缺件 → missingText ({parts} = 缺的道具名)；組過之後 = doneText */
    keyBench: { parts: readonly ItemId[]; out: ItemId; okText: TextKey; missingText: TextKey; doneText: TextKey };
    /**
     * 手記架：第一次按 E → 取得 gives、used、useText (doneFlag → done)；之後 = emptyText；
     * v0.4 look = 外觀 (純呈現，行為不變)：'desk' = H1 爸爸小時候的小書桌 (抽屜裡是老宅圖殘片 4)
     */
    diaryStand: { gives: ItemId; emptyText: TextKey; look?: 'desk' };
    /** 章門平台 (實體；呈現) */
    landing: {};
  }
}

export const deep: Mechanic = {
  id: 'deep',
  types: {
    keyBench: {
      verbKey: 'obj.keyBench.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'keyBench') return;
        if (o.used) { say(w, o.def.doneText); return; }
        const missing = o.def.parts.filter(p => !hasItem(w, p));
        if (missing.length) { say(w, o.def.missingText, { parts: missing.map(p => w.rt.text(`term.${p}`)).join(w.rt.text('msg.list.sep')) }); return; }
        for (const p of o.def.parts) addItem(w, p, -1);
        addItem(w, o.def.out, 1);
        o.used = true;
        say(w, o.def.okText);
      }
    },
    diaryStand: {
      verbKey: 'obj.diaryStand.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'diaryStand') return;
        if (o.used) { say(w, o.def.emptyText); return; }
        o.used = true;
        addItem(w, o.def.gives, 1);
        say(w, o.def.useText ?? o.def.emptyText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    },
    landing: {}
  }
};
