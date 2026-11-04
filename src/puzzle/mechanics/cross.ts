// v0.4 第三章 跨房推導 (規格 6「3-3 夜溫室（細化）」；architecture 7.4.7)：ChapterSpec.derive 的實作 (app 以 mechanics/index chapterSpecOf 注入；核心不 import mechanics)
// - ext.balance：當前房的每個半座天平 (balanceHalf)，它的門此刻拱門對拱門接到另一半所在那扇門 → other = 對面那盤的重量 (對面房的關卡資料 + 章節標籤)；
//   done = 另一半已閂住 (對面房的快照)
// - ext.protrude：隔壁房此刻從拱門伸進來的東西 (mechanics/scale protrusionsInto)
import type { ObjDef, ObjId, WorldExt } from '../core/types';
import type { ChapterState } from '../core/chapter';
import { links } from '../core/cube';
import { defWeight, protrusionsInto, type CrossRooms } from './scale';

type Labels = Readonly<Record<string, readonly string[]>>;

const usedIn = (state: ChapterState, room: string): ReadonlySet<ObjId> => new Set((state.rooms[room]?.objs ?? []).filter(o => o.used).map(o => o.id));

/** 物件定義與所在房 (第一個列出它的房) */
function findDef(c: CrossRooms, id: ObjId): { room: string; def: ObjDef } | null {
  for (const [room, lv] of Object.entries(c.rooms)) { const def = lv.objects.find(d => d.id === id); if (def) return { room, def }; }
  return null;
}

/** 這一房此刻的半座天平推導 */
export function balanceExt(c: CrossRooms, room: string, state: ChapterState, labels: Labels): NonNullable<WorldExt['balance']> {
  const out: Record<ObjId, { other?: number; done?: boolean }> = {};
  const halves = (c.rooms[room]?.objects ?? []).filter(d => d.type === 'balanceHalf');
  if (!halves.length) return out;
  const ls = c.cube && state.cube ? links(c.cube, state.cube, c.doors) : [];
  for (const h of halves) {
    if (h.type !== 'balanceHalf') continue;
    const pair = findDef(c, h.pair);
    const entry: { other?: number; done?: boolean } = {};
    if (pair && pair.room !== room) {
      if (usedIn(state, pair.room).has(h.pair)) entry.done = true;
      const l = ls.find(x => x.from.room === room && x.from.door === h.door);
      if (l && l.kind === 'arch' && 'room' in l.to && l.to.room === pair.room && pair.def.type === 'balanceHalf' && pair.def.door === l.to.door) {
        const objs = c.rooms[pair.room].objects;
        entry.other = pair.def.pans.reduce((n, id) => { const d = objs.find(x => x.id === id); return d ? n + defWeight(d, labels) : n; }, 0);
      }
    }
    out[h.id] = entry;
  }
  return out;
}

/** ChapterSpec.derive (app 注入) */
export const deriveQuery = (c: CrossRooms) => (room: string, state: ChapterState, labels: Labels): Partial<WorldExt> => {
  if (!state.cube) return {};
  const protrude = protrusionsInto(c, room, state.cube, labels, r => usedIn(state, r));
  const balance = balanceExt(c, room, state, labels);
  // 沒有的欄位寫 undefined (清掉上一次的結果；toEqual 視同沒有)
  return { balance: Object.keys(balance).length ? balance : undefined, protrude: protrude.length ? protrude : undefined };
};
