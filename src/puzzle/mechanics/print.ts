// 2-3 印房 (規格 6「2-3 印房（細化）」)：活字架 (部件卡)、印刷機 (P4 的目標：兩扇門同時接上指定的房)、
// 排字架與字輪 (P11：剛好走 hops 扇門的路線上，出門那一側門旁的活字 = 密碼；路線依此刻的排列，由章節層寫入 ext.cube.graph)、鉛字盤 (可推)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { addItem, hasItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 活字架：3D 第一次按 E → 取得 gives、used、useText；之後 = emptyText */
    typeCase: { gives: readonly ItemId[]; emptyText: TextKey };
    /**
     * 印刷機：needs = 這些門此刻都接到指定的房才壓得下版 (讀 ext.cube.links)；成立 → used、reward、okText、done；
     * 不成立 = looseText；壓過之後 = readText。side = 側板刻的字 (外觀)
     */
    press: { needs: ReadonlyArray<{ door: ObjId; room: string }>; reward?: ItemId; okText: TextKey; looseText: TextKey; readText: TextKey; side: TextKey };
    /** 字輪：屬於排字架 lock 的第 index 個；3D 按 E 換下一個字 (字 = (used ? 1 : 0) + (touched ? 2 : 0) 對到 lock.glyphs) */
    typeWheel: { lock: ObjId; index: number };
    /**
     * 排字架 (P11 的鎖，不可互動)：glyphs = 字輪上的字 (依序循環)；from / to / hops = 路線起訖與門數；
     * need = 要先持有的道具 (校樣；別間房給的)，needText = 沒有時轉字輪的說明；字輪排成任一條路線的字 → used、reward、openText、done
     */
    typeLock: { glyphs: readonly TextKey[]; from: string; to: string; hops: number; need?: ItemId; needText?: TextKey; reward?: ItemId; openText: TextKey; doneText: TextKey };
    /** 鉛字盤 (可推；2-5 的墊腳)：pushable 由資料指定 */
    typeTray: {};
  }
}

/** 字輪此刻的字序號 (0～3) */
export const wheelIndex = (o: ObjState): number => (o.used ? 1 : 0) + (o.touched ? 2 : 0);
const setWheel = (o: ObjState, i: number): void => { o.used = (i & 1) === 1; o.touched = (i & 2) === 2; };

/**
 * 此刻 from → to、剛好 hops 扇門的所有簡單路線的密碼 (每一扇出門的門旁活字，依序；經過沒有刻字的門 (洞) 的路線不算)。
 * 讀章節層寫入的 ext.cube.graph (全章的房 ↔ 房接通)
 */
export function routeCodes(w: World, from: string, to: string, hops: number): string[][] {
  const graph = w.ext.cube?.graph ?? [];
  const out: string[][] = [];
  const walk = (room: string, seen: string[], code: string[]): void => {
    if (code.length === hops) { if (room === to) out.push(code); return; }
    for (const e of graph) {
      if (e.room !== room || seen.includes(e.to) || e.glyph === undefined) continue;
      walk(e.to, [...seen, e.to], [...code, e.glyph]);
    }
  };
  walk(from, [from], []);
  return out;
}

/** 排字架的字輪 (依 index 排序) */
const wheelsOf = (w: World, lock: ObjId): ObjState[] =>
  w.objs.filter(o => o.def.type === 'typeWheel' && o.def.lock === lock).sort((a, b) => (a.def.type === 'typeWheel' && b.def.type === 'typeWheel' ? a.def.index - b.def.index : 0));

/** 字輪排出的字 (文字 key) */
export function wheelCode(w: World, lock: ObjState): string[] {
  if (lock.def.type !== 'typeLock') return [];
  const glyphs = lock.def.glyphs;
  return wheelsOf(w, lock.def.id).map(o => glyphs[wheelIndex(o) % glyphs.length]);
}

/** 轉一個字輪：沒有前置道具 → 說明；已打開 → doneText；否則換下一個字，排成此刻任一條路線的字 → 打開 */
export function spinWheel(w: World, o: ObjState): void {
  if (o.def.type !== 'typeWheel') return;
  const lock = w.byId.get(o.def.lock);
  if (!lock || lock.def.type !== 'typeLock') return;
  if (lock.used) { say(w, lock.def.doneText); return; }
  if (lock.def.need !== undefined && !hasItem(w, lock.def.need)) { say(w, lock.def.needText ?? ''); return; }
  setWheel(o, (wheelIndex(o) + 1) % lock.def.glyphs.length);
  const code = wheelCode(w, lock).join('|');
  const ok = routeCodes(w, lock.def.from, lock.def.to, lock.def.hops).some(c => c.join('|') === code);
  if (!ok) { say(w, 'msg.print.wheel', { glyph: w.rt.text(lock.def.glyphs[wheelIndex(o)]) }); return; }
  lock.used = true;
  if (lock.def.reward) addItem(w, lock.def.reward, 1);
  say(w, lock.def.openText);
  if (lock.def.doneFlag) w.events.push({ t: 'done', flag: lock.def.doneFlag });
}

/** 印刷機的條件：needs 的每扇門此刻都接到指定的房 */
export const pressReady = (w: World, o: ObjState): boolean =>
  o.def.type === 'press' && o.def.needs.every(n => { const l = w.ext.cube?.links[n.door]; return l?.to === 'room' && l.room === n.room; });

export const print: Mechanic = {
  id: 'print',
  types: {
    typeCase: {
      verbKey: 'obj.typeCase.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'typeCase') return;
        if (o.used) { say(w, o.def.emptyText); return; }
        o.used = true;
        for (const c of o.def.gives) addItem(w, c, 1);
        say(w, o.def.useText ?? o.def.emptyText);
      }
    },
    press: {
      verbKey: 'obj.press.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'press') return;
        if (o.used) { say(w, o.def.readText); return; }
        if (!pressReady(w, o)) { say(w, o.def.looseText); return; }
        o.used = true;
        if (o.def.reward) addItem(w, o.def.reward, 1);
        say(w, o.def.okText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    },
    typeWheel: { verbKey: 'obj.typeWheel.verb', usableWhenUsed: true, interact: spinWheel },
    typeLock: {},
    typeTray: {}
  }
};
