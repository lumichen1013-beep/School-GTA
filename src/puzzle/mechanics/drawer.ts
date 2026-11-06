// 4-4 最後的抽屜的機關 (規格 6「4-4 最後的抽屜（細化）」)：
// - 爸爸的筆記 (notesDesk)：needLink 這扇梯口此刻接通才拉得開 (根繩拴在梯子上)；拿到 = used + item (道具；不用 ObjBase.grants：那是「拿了就消失」的通用拾取)
// - 殘影 (hatchChaser；推導物件，不存快照、只在藏寶圖)：trigger 物件 used、梯口接通 → 預兆 (omenSec) → 沿梯子爬下 (descendSec) → 在 2D 沿 x 追 (speed；
//   被追上 assistAfter 次後 × assistFactor)；被追上 (2D、x 重疊) = 回 checkpoint、重新從預兆開始；梯口斷開 = 拉回梯口 (cut 物件第一次 used = 4-4a)；
//   之後梯口再接通就重來 (墨閘那一段)。calm = 不出現，梯口斷開照樣成立。位置 = 時間的純函式 (固定步長、不讀亂數與時鐘)
// - 4-4a 的旗標物件 (chaseMark)：沒有互動
// - 最後一個抽屜 (lastDrawer)：gate 物件 used 才拉得開；item + also = 鑰匙與手記第四頁
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { addItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 爸爸的筆記：needLink = 要接通的梯口 (門 id)；tiedText = 沒接通時；usedText = 已經拿了 */
    notesDesk: { needLink: ObjId; item: ItemId; tiedText: TextKey; usedText: TextKey };
    /** 殘影 (追逐 2)：trigger = 拿到筆記的那個物件；hatch = 它爬下來的梯口；cut = 第一次轉開時 used 的旗標物件 */
    hatchChaser: {
      trigger: ObjId; hatch: ObjId; cut: ObjId; omenSec: number; descendSec: number; speed: number;
      assistAfter: number; assistFactor: number; checkpoint: { x: number; z: number };
      omenText: TextKey; caughtText: TextKey; cutText: TextKey; flag: string;
    };
    /** 4-4a 的旗標物件 (轉開梯口的那一刻 used) */
    chaseMark: {};
    /** 最後一個抽屜：gate = 墨閘 (used 才拉得開)；dryText = 墨閘還乾著；usedText = 已經拿了 */
    lastDrawer: { gate: ObjId; item: ItemId; dryText: TextKey; usedText: TextKey; also?: readonly ItemId[] };
  }
}

type Phase = 'idle' | 'omen' | 'descend' | 'run';
interface Run { phase: Phase; at: number; x: number; caught: number }
const runs = new WeakMap<World, Run>();
/** 殘影此刻的狀態 (測試與外觀用) */
export function hatchChaseRun(w: World): Readonly<Run> { return runs.get(w) ?? { phase: 'idle', at: 0, x: 0, caught: 0 }; }

const linked = (w: World, door: ObjId): boolean => w.ext.cube?.links[door]?.to === 'room';

function emit(w: World, o: ObjState, s: 'omen' | 'start' | 'caught' | 'end' | 'reset'): void {
  if (o.def.type === 'hatchChaser') w.events.push({ t: 'chase', id: o.def.flag, s });
}

function updateChaser(w: World, o: ObjState): void {
  if (o.def.type !== 'hatchChaser') return;
  const d = o.def;
  const r = runs.get(w) ?? { phase: 'idle' as Phase, at: 0, x: 0, caught: 0 };
  runs.set(w, r);
  const hatch = w.byId.get(d.hatch);
  const cut = w.byId.get(d.cut);
  const armed = !!w.byId.get(d.trigger)?.used;
  const on = linked(w, d.hatch);
  const hx = hatch?.x ?? 0;
  // 梯口斷開：殘影被拉回梯口 (第一次 = 4-4a)
  if (!on) {
    if (r.phase !== 'idle' || (armed && cut && !cut.used && w.rt.calm)) {
      if (r.phase !== 'idle') emit(w, o, 'end');
      r.phase = 'idle'; o.used = false; o.x = hx; o.y = 0;
      if (cut && !cut.used && armed) { cut.used = true; say(w, d.cutText); if (cut.def.doneFlag) w.events.push({ t: 'done', flag: cut.def.doneFlag }); }
    }
    return;
  }
  if (!armed) return;
  if (w.rt.calm) return; // 減弱緊張效果：殘影不出現
  // 預兆的那句只在第一次說 (墨閘那一段：同一幀墨閘化開的那句要留著)
  if (r.phase === 'idle') { r.phase = 'omen'; r.at = w.time; o.x = hx; o.used = false; if (!cut?.used) say(w, d.omenText); emit(w, o, 'omen'); return; }
  if (r.phase === 'omen' && w.time - r.at >= d.omenSec) { r.phase = 'descend'; r.at = w.time; o.used = true; o.x = hx; o.y = 2.4; return; }
  if (r.phase === 'descend') {
    const k = Math.min(1, (w.time - r.at) / d.descendSec);
    o.y = 2.4 * (1 - k);
    if (k >= 1) { r.phase = 'run'; r.at = w.time; r.x = hx; o.y = 0; emit(w, o, 'start'); }
    return;
  }
  if (r.phase === 'run') {
    const p = w.player;
    const v = d.speed * (r.caught >= d.assistAfter ? d.assistFactor : 1);
    const dt = 1 / 60;
    r.x += Math.sign(p.x - r.x) * Math.min(Math.abs(p.x - r.x), v * dt);
    o.x = r.x;
    if (p.mode === '2d' && Math.abs(p.x - r.x) < 0.6 && p.y < 1.2) {
      r.caught++;
      p.x = d.checkpoint.x; p.z3d = d.checkpoint.z; p.vy = 0;
      r.phase = 'omen'; r.at = w.time; o.used = false; o.x = hx; o.y = 0;
      say(w, d.caughtText);
      emit(w, o, 'caught');
    }
  }
}

export const drawerMech: Mechanic = {
  id: 'drawer',
  types: {
    notesDesk: {
      verbKey: 'obj.notesDesk.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'notesDesk') return;
        if (o.used) { say(w, o.def.usedText); return; }
        if (!linked(w, o.def.needLink)) { say(w, o.def.tiedText); return; }
        o.used = true;
        addItem(w, o.def.item, 1);
        say(w, o.def.useText ?? o.def.usedText);
      }
    },
    hatchChaser: {},
    chaseMark: {},
    lastDrawer: {
      verbKey: 'obj.lastDrawer.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'lastDrawer') return;
        if (o.used) { say(w, o.def.usedText); return; }
        if (!w.byId.get(o.def.gate)?.used) { say(w, o.def.dryText); return; }
        o.used = true;
        addItem(w, o.def.item, 1);
        for (const id of o.def.also ?? []) addItem(w, id as ItemId, 1);
        say(w, o.def.useText ?? o.def.usedText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    }
  },
  afterPhysics: w => { for (const o of w.objs) if (o.def.type === 'hatchChaser') updateChaser(w, o); }
};
