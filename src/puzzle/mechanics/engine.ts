// 5-5 最後的機關 (規格 6「5-5 最後的機關（細化）」；Boss 三階段)：
// - 星光 (章節層推導 mechanics/cross starExt → World.ext.starlight；core/cube starlight 同一組純函式，validateDial 共用)：
//   lit = 看得見星星的窗、reach = 星光照得進機關的窗、behind = 星光照到機關某扇門外那一間卻沒接進來、slits / faces = 各窗此刻的窗縫與所在面
// - 三道光槽 (starSlots)：order = 三道槽依序對應的窗；三扇窗的光同時照進機關的那一刻 → used (閂住) + solvedText + doneFlag (5-5a)；
//   3D 按 E = 此刻的狀態句 (全暗 / 亮了幾道 / 門外亮著卻進不來)；閂住之後 = doneText + 此刻的狀態
// - 殘影 (engineChaser；追逐 3、5-5b；推導物件，不存快照、只在藏寶圖)：trigger 物件 used (5-5a)、cut 物件還沒 used、from 那扇窗此刻和機關連在一起
//   (ext.starlight.linked) → 預兆 (omenSec；殘影出現在那扇窗連過來的那一扇門 = via) → 走出門 (enterSec) → 在 2D 沿 x 追 (speed；被追上 assistAfter 次後 × assistFactor)；
//   被追上 (2D、x 重疊、低於 1.2) = 回檢查點 (離那扇門較遠的一側)、重新從預兆開始。from 斷開 → 殘影被拉回 (end)；同一刻另一扇窗的星光照得進機關
//   (reach 有別的窗) → cut used = 5-5b + cutText；沒有 = darkText (之後 from 再接上就重來)。calm = 不出現，斷開 + 第二道光照樣成立。
//   位置 = 時間的純函式 (固定步長、不讀亂數與時鐘)
// - 焦點 (starFocus；5-5c)：after 物件 used (5-5b) 才有光落下；3D 按 E：手上有手記頁 → 放上去 (touched = 紙在槽裡；手上的那頁用掉)；之後 = 每扇窗一句
//   (看不見星星 / 偏了一格 / 落在紙上)。紙在槽裡、三道光落在同一點 (ext.starlight.converge)、人在機關 → used + item (手記第五頁) + solvedText + doneFlag (5-5c；收束)
// - 驚嚇 (engineScare；推導物件、只在藏寶圖)：after 物件 used (5-5b) 之後、人在藏寶圖、這一次進房相對安靜 delay 秒 → used (外觀演出三道殘影) +
//   章節旗標 scare:<id> (R 不重演)；旗標已在 = 不演出
// - 窗縫儀 (slitPane；三扇窗房)：3D 按 E = 這扇窗此刻的窗縫 (直 / 橫) 與窗外 (看不見星星 / 朝著天上)；外觀讀 ext.starlight
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import type { Side, Slit } from '../core/cube';
import { addItem, say } from '../core/world';
import { scareFlag } from './coats';

declare module '../core/types' {
  interface ObjKinds {
    /** 三道光槽：order = 三道槽依序對應的窗房 (東 / 北 / 西)；狀態句 dark / some ({n} {names}) / behind；solvedText = 三道同時亮的那一刻；doneText = 閂住之後 */
    starSlots: { order: readonly string[]; darkText: TextKey; someText: TextKey; behindText: TextKey; solvedText: TextKey; doneText: TextKey };
    /**
     * 殘影 (追逐 3)：from = 它從哪一扇窗沿光路走過來；trigger = 開始追的旗標物件 (光槽：5-5a)；cut = 5-5b 的旗標物件；
     * checkpoints = 被追上時回到的 x (取離殘影那扇門較遠的一個)、checkZ = 回到的 z
     */
    engineChaser: {
      from: string; trigger: ObjId; cut: ObjId; omenSec: number; enterSec: number; speed: number; assistAfter: number; assistFactor: number;
      checkpoints: readonly number[]; checkZ: number; omenText: TextKey; caughtText: TextKey; cutText: TextKey; darkText: TextKey; flag: string;
    };
    /**
     * 焦點：after = 光開始落下的旗標物件 (5-5b)；page = 放上去的道具 (可寫的手記頁)、item = 照出來的道具 (手記第五頁)；order = 狀態句的窗序；
     * names = 窗房 → 名字；emptyText (還沒放紙)、placeText、onText / offText / darkText ({w})、solvedText、doneText
     */
    starFocus: {
      after: ObjId; page: ItemId; item: ItemId; order: readonly string[]; names: Readonly<Record<string, TextKey>>;
      emptyText: TextKey; placeText: TextKey; onText: TextKey; offText: TextKey; darkText: TextKey; solvedText: TextKey; doneText: TextKey;
    };
    /** 驚嚇：after = 這個物件 used 之後；scare = 驚嚇 id；delay = 進房 / 完成之後相對安靜幾秒 */
    engineScare: { after: ObjId; scare: string; delay: number };
    /** 窗縫儀：room = 這是哪一扇窗；vText / hText / skyText / darkText */
    slitPane: { room: string; vText: TextKey; hText: TextKey; skyText: TextKey; darkText: TextKey };
  }
  interface WorldExt {
    /**
     * v0.4 第五章 5-5 星光 (章節層在進房 / 轉動 / 改標籤後寫入；mechanics/engine 只讀)：lit = 看得見星星的窗房、reach = 星光照得進機關的窗、
     * behind = 星光照到機關門外卻沒接進來的窗、linked / via = 和機關連在一起的窗與連過去的門、good = 看得見星星且窗縫對的窗 (三段銘文)、
     * slits = 各窗此刻的窗縫、faces = 各窗此刻在哪一面、converge = 三道光落在同一點
     */
    starlight?: { lit: readonly string[]; reach: readonly string[]; behind: readonly string[]; linked: readonly string[]; via: Readonly<Record<string, string>>; good: readonly string[]; slits: Readonly<Record<string, Slit>>; faces: Readonly<Record<string, Side | null>>; converge: boolean };
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

type Phase = 'idle' | 'omen' | 'enter' | 'run';
interface Run { phase: Phase; at: number; x: number; caught: number; door: string; dark: boolean; armedAt: number }
const runs = new WeakMap<World, Run>();
/** 殘影此刻的狀態 (測試與外觀用) */
export const engineChaseRun = (w: World): Readonly<Run> => runs.get(w) ?? { phase: 'idle', at: 0, x: 0, caught: 0, door: '', dark: false, armedAt: -1 };
/** 5-5a 完成 (或進房) 之後先安靜幾秒才起預兆 (9.1 Boss 表：靜默 2 秒 → 鐘音) */
export const SETTLE_SEC = 2;

function emit(w: World, o: ObjState, s: 'omen' | 'start' | 'caught' | 'end'): void {
  if (o.def.type === 'engineChaser') w.events.push({ t: 'chase', id: o.def.flag, s });
}

function updateChaser(w: World, o: ObjState): void {
  if (o.def.type !== 'engineChaser') return;
  const d = o.def;
  const r = runs.get(w) ?? { phase: 'idle' as Phase, at: 0, x: 0, caught: 0, door: '', dark: false, armedAt: -1 };
  runs.set(w, r);
  const cut = w.byId.get(d.cut);
  if (!w.byId.get(d.trigger)?.used || !cut || cut.used) { if (r.phase !== 'idle') { r.phase = 'idle'; o.used = false; emit(w, o, 'end'); } return; }
  if (r.armedAt < 0) r.armedAt = w.time;
  const st = w.ext.starlight;
  const on = !!st?.linked.includes(d.from);
  // 那扇窗斷開：殘影被拉回；同一刻另一扇窗的星光照得進機關 = 5-5b
  if (!on) {
    if (r.phase !== 'idle') { r.phase = 'idle'; o.used = false; emit(w, o, 'end'); }
    if (st?.reach.some(x => x !== d.from)) {
      cut.used = true;
      say(w, d.cutText);
      if (cut.def.doneFlag) w.events.push({ t: 'done', flag: cut.def.doneFlag });
    } else if (!r.dark) { r.dark = true; say(w, d.darkText); }
    return;
  }
  r.dark = false;
  if (w.rt.calm) return; // 減弱緊張效果：殘影不出現 (仍要轉開)
  const door = w.byId.get(st?.via[d.from] ?? '');
  const dx = door?.x ?? 0;
  if (r.phase === 'idle' && w.time - r.armedAt < SETTLE_SEC - 1e-9) return;
  if (r.phase === 'idle') { r.phase = 'omen'; r.at = w.time; r.door = door?.def.id ?? ''; o.x = dx; o.used = true; if (!r.caught) say(w, d.omenText); emit(w, o, 'omen'); return; }
  if (r.phase === 'omen' && w.time - r.at >= d.omenSec - 1e-9) { r.phase = 'enter'; r.at = w.time; return; }
  if (r.phase === 'enter') {
    if (w.time - r.at >= d.enterSec - 1e-9) { r.phase = 'run'; r.at = w.time; r.x = dx; emit(w, o, 'start'); }
    return;
  }
  if (r.phase === 'run') {
    const p = w.player;
    const v = d.speed * (r.caught >= d.assistAfter ? d.assistFactor : 1);
    r.x += Math.sign(p.x - r.x) * Math.min(Math.abs(p.x - r.x), v / 60);
    o.x = r.x;
    if (p.mode === '2d' && Math.abs(p.x - r.x) < 0.6 && p.y < 1.2) {
      r.caught++;
      const far = [...d.checkpoints].sort((a, b) => Math.abs(b - dx) - Math.abs(a - dx))[0] ?? 0;
      p.x = far; p.z3d = d.checkZ; p.vy = 0;
      r.phase = 'omen'; r.at = w.time; o.x = dx;
      say(w, d.caughtText);
      emit(w, o, 'caught');
    }
  }
}

/** 焦點此刻的狀態句 (每扇窗一句，依 order 接起來) */
export function focusText(w: World, o: ObjState): string {
  if (o.def.type !== 'starFocus') return '';
  const d = o.def;
  const st = w.ext.starlight;
  return d.order.map(r => {
    const name = w.rt.text(d.names[r] ?? r);
    if (!st?.lit.includes(r)) return w.rt.text(d.darkText, { w: name });
    return w.rt.text(st.good.includes(r) ? d.onText : d.offText, { w: name });
  }).join('');
}

function updateFocus(w: World, o: ObjState): void {
  if (o.def.type !== 'starFocus' || o.used || !o.touched || !w.byId.get(o.def.after)?.used || !w.ext.starlight?.converge) return;
  o.used = true;
  addItem(w, o.def.item, 1);
  say(w, o.def.solvedText);
  if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
}

/** 驚嚇的計時：這一次進房 (World) 第一次看到 after used 的時刻 */
const scareSince = new WeakMap<ObjState, number>();
function updateScare(w: World, o: ObjState): void {
  if (o.def.type !== 'engineScare' || o.used) return;
  const flag = scareFlag(o.def.scare);
  if (w.ext.flags?.includes(flag)) return;
  if (!w.byId.get(o.def.after)?.used) return;
  if (!scareSince.has(o)) scareSince.set(o, w.time);
  if (w.player.mode !== '2d' || w.time - scareSince.get(o)! < o.def.delay - 1e-9) return;
  o.used = true;
  w.events.push({ t: 'flag', flag });
}

export const engine: Mechanic = {
  id: 'engine',
  types: {
    engineChaser: {},
    engineScare: {},
    starFocus: {
      verbKey: 'obj.starFocus.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'starFocus') return;
        const d = o.def;
        if (o.used) { say(w, d.doneText); return; }
        if (!o.touched) {
          if (!w.byId.get(d.after)?.used || (w.inv[d.page] ?? 0) <= 0) { say(w, d.emptyText); return; }
          o.touched = true;
          w.inv[d.page] = (w.inv[d.page] ?? 0) - 1;
          if (!w.inv[d.page]) delete w.inv[d.page];
          w.msgKey = d.placeText;
          w.msg = w.rt.text(d.placeText) + focusText(w, o);
          w.msgSeq++;
          return;
        }
        w.msgKey = d.onText;
        w.msg = focusText(w, o);
        w.msgSeq++;
      }
    },
    slitPane: {
      verbKey: 'obj.slitPane.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'slitPane') return;
        const st = w.ext.starlight;
        const f = st?.faces[o.def.room];
        say(w, !st || !st.lit.includes(o.def.room) ? o.def.darkText : f === 'U' ? o.def.skyText : st.slits[o.def.room] === 'v' ? o.def.vText : o.def.hText);
      }
    },
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
  afterPhysics: w => {
    updateSlots(w);
    for (const o of w.objs) {
      if (o.def.type === 'engineChaser') updateChaser(w, o);
      else if (o.def.type === 'starFocus') updateFocus(w, o);
      else if (o.def.type === 'engineScare') updateScare(w, o);
    }
  }
};
