// 3-3 夜溫室 (規格 6「3-3 夜溫室（細化）」)：巨盆被推進軌道 (3-3b 的卡榫來源) 與驚嚇 (彩繪玻璃上的手印；規格 9.1、story-bible 6.2)
// - bigPot：巨盆 (jam、名詞標籤 + 方槽、pushTo；縮放與卡榫在 mechanics/scale)。pushWhen 指向的物件 (夜溫室的半座天平) used 之後、
//   人在這間房、相對安靜 SCARE_DELAY 秒 → used (= 被推進軌道：位置改為 pushTo)、章節旗標 scare:<id> (R 不重演)、pushText；
//   旗標已在 (演過了；R 之後) → 一看到就安靜地推過去。3D 按 E = 此刻的樣子 (還站著 / 卡在軌道 / 縮在牆邊)
import type { Mechanic } from '../core/registry';
import type { ObjId, ObjState, TextKey, World } from '../core/types';
import { say } from '../core/world';
import { SCARE_DELAY, scareFlag } from './coats';
import { worldJammed } from './scale';

declare module '../core/types' {
  interface ObjKinds {
    /** 巨盆：pushWhen = 這個物件 used 之後被推；scare = 驚嚇 id；pushText = 被推的那一刻；standText / jamText / freeText = 3D 按 E */
    bigPot: { pushWhen: ObjId; scare: string; pushText: TextKey; standText: TextKey; jamText: TextKey; freeText: TextKey };
    /** 高台 (實體；溫室深處花窗下，3-3c)：readText = 3D 按 E */
    ledge: { readText: TextKey };
    /** 筆記一頁 (拾取物；grants 指定)：拿到的那一刻 used + doneFlag (3-3c 在深處完成) */
    page: {};
  }
}

/** 推的條件第一次成立的時間 (World 本地；換房 / R = 新的 World、重新等) */
const since = new WeakMap<ObjState, number>();

function update(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'bigPot' || o.used) continue;
    if (!w.byId.get(o.def.pushWhen)?.used) { since.delete(o); continue; }
    const flag = scareFlag(o.def.scare);
    if (w.ext.flags?.includes(flag)) { o.used = true; continue; }
    const t0 = since.get(o) ?? w.time;
    since.set(o, t0);
    if (w.time - t0 < SCARE_DELAY) continue;
    o.used = true;
    w.events.push({ t: 'flag', flag });
    say(w, o.def.pushText);
  }
}

export const night: Mechanic = {
  id: 'night',
  types: {
    bigPot: {
      verbKey: 'obj.bigPot.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'bigPot') say(w, !o.used ? o.def.standText : worldJammed(w) ? o.def.jamText : o.def.freeText); }
    },
    ledge: { verbKey: 'obj.sensor.verb', interact: (w, o) => { if (o.def.type === 'ledge') say(w, o.def.readText); } },
    page: { verbKey: 'obj.key.verb', interact: (w, o) => { if (o.def.type !== 'page' || o.used) return; o.used = true; if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag }); } }
  },
  afterPhysics: update
};

