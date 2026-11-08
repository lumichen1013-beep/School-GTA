// 5-5 最後的機關 (規格 6「5-5 最後的機關（細化）」；Boss 三階段)：
// - 星光 (章節層推導 mechanics/cross starExt → World.ext.starlight；core/cube starlight 同一組純函式，validateDial 共用)：
//   lit = 看得見星星的窗、reach = 星光照得進機關的窗、behind = 星光照到機關某扇門外那一間卻沒接進來、slits / faces = 各窗此刻的窗縫與所在面
// - 三道光槽 (starSlots)：order = 三道槽依序對應的窗；三扇窗的光同時照進機關的那一刻 → used (閂住) + solvedText + doneFlag (5-5a)；
//   3D 按 E = 此刻的狀態句 (全暗 / 亮了幾道 / 門外亮著卻進不來)；閂住之後 = doneText + 此刻的狀態
import type { Mechanic } from '../core/registry';
import type { ObjState, TextKey, World } from '../core/types';
import type { Side, Slit } from '../core/cube';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 三道光槽：order = 三道槽依序對應的窗房 (東 / 北 / 西)；狀態句 dark / some ({n} {names}) / behind；solvedText = 三道同時亮的那一刻；doneText = 閂住之後 */
    starSlots: { order: readonly string[]; darkText: TextKey; someText: TextKey; behindText: TextKey; solvedText: TextKey; doneText: TextKey };
  }
  interface WorldExt {
    /**
     * v0.4 第五章 5-5 星光 (章節層在進房 / 轉動 / 改標籤後寫入；mechanics/engine 只讀)：lit = 看得見星星的窗房、reach = 星光照得進機關的窗、
     * behind = 星光照到機關門外卻沒接進來的窗、slits = 各窗此刻的窗縫、faces = 各窗此刻在哪一面、converge = 三道光落在同一點
     */
    starlight?: { lit: readonly string[]; reach: readonly string[]; behind: readonly string[]; slits: Readonly<Record<string, Slit>>; faces: Readonly<Record<string, Side | null>>; converge: boolean };
  }
}

/** 窗房 → 光槽上的字 (東 / 北 / 西) */
export const SLOT_NAME: Readonly<Record<string, TextKey>> = { east: 'lvl.5-5.slot.east', north: 'lvl.5-5.slot.north', west: 'lvl.5-5.slot.west' };

/** 光槽此刻的狀態句 (3D 按 E；閂住之前) */
export function slotsText(w: World, o: ObjState): { key: TextKey; params?: Record<string, string> } {
  if (o.def.type !== 'starSlots') return { key: '' };
  const st = w.ext.starlight;
  const on = o.def.order.filter(r => st?.reach.includes(r));
  if (!on.length) return { key: st?.behind.length ? o.def.behindText : o.def.darkText };
  return { key: o.def.someText, params: { n: String(on.length), names: on.map(r => w.rt.text(SLOT_NAME[r] ?? r)).join(w.rt.text('lvl.5-5.slots.sep')) } };
}

function updateSlots(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'starSlots' || o.used) continue;
    const reach = w.ext.starlight?.reach ?? [];
    if (!o.def.order.every(r => reach.includes(r))) continue;
    o.used = true;
    say(w, o.def.solvedText);
    if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
  }
}

export const engine: Mechanic = {
  id: 'engine',
  types: {
    starSlots: {
      verbKey: 'obj.starSlots.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'starSlots') return;
        const t = slotsText(w, o);
        if (o.used) { say(w, o.def.doneText, { state: w.rt.text(t.key, t.params) }); return; }
        say(w, t.key, t.params);
      }
    }
  },
  afterPhysics: updateSlots
};
