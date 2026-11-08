// v0.4 第三章 跨房推導 (規格 6「3-3 夜溫室（細化）」；architecture 7.4.7)：ChapterSpec.derive 的實作 (app 以 mechanics/index chapterSpecOf 注入；核心不 import mechanics)
// - ext.balance：當前房的每個半座天平 (balanceHalf)，它的門此刻拱門對拱門接到另一半所在那扇門 → other = 對面那盤的重量 (對面房的關卡資料 + 章節標籤)；
//   done = 另一半已閂住 (對面房的快照)
// - ext.protrude：隔壁房此刻從拱門伸進來的東西 (mechanics/scale protrusionsInto)
// - v0.4 5-4 吊秤 (hangScale)：秤繩那一頭 = core/cube acrossEdge 的那一間；other = 那間房標了 ballast 的物件重量和 (關卡資料 + 章節標籤)、
//   room / titleKey = 那間房、at = 本房此刻的格；那一格沒有房 = 只寫 at (秤繩垂著)
import type { ObjDef, ObjId, WorldExt } from '../core/types';
import type { ChapterState } from '../core/chapter';
import { acrossEdge, converge, doorOpenFor, faceOfCell, links, slitOf, starlight } from '../core/cube';
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
  const objs = c.rooms[room]?.objects ?? [];
  for (const h of objs) {
    if (h.type !== 'hangScale' || !c.cube || !state.cube) continue;
    const other = acrossEdge(c.cube, state.cube, room, h.hook);
    const entry: { other?: number; done?: boolean; room?: string; titleKey?: string; at?: string } = { at: (state.cube.pos[room] ?? []).join(',') };
    if (other && c.rooms[other]) {
      entry.room = other;
      entry.titleKey = c.rooms[other].titleKey;
      entry.other = c.rooms[other].objects.reduce((n, d) => (d.ballast ? n + defWeight(d, labels) : n), 0);
    }
    out[h.id] = entry;
  }
  const halves = objs.filter(d => d.type === 'balanceHalf');
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

/** 此刻讀作「間」的門 (門牌標籤上貼著部件卡；core/chapter activePlates 的同一條件) */
const platesOf = (c: CrossRooms, labels: Labels): Set<string> =>
  new Set(c.doors.filter(d => d.plate && (labels[d.plate.label] ?? []).includes(d.plate.card)).map(d => `${d.room}.${d.door}`));

/** v0.4 5-5 星光 (CubeDef.stars；沒有 = undefined)：core/cube starlight + 各窗的窗縫 / 所在面 + 三道光是否落在同一點 */
export function starExt(c: CrossRooms, state: ChapterState, labels: Labels, done: ReadonlySet<string>): WorldExt['starlight'] {
  const st = c.cube?.stars;
  if (!st || !c.cube || !state.cube) return undefined;
  const cube = state.cube;
  const r = starlight(c.cube, cube, links(c.cube, cube, c.doors, platesOf(c, labels)), c.doors, doorOpenFor(c.doors, done));
  return {
    ...r,
    good: r.lit.filter(w => st.slits?.[w] === slitOf(cube, w)),
    slits: Object.fromEntries(st.windows.map(w => [w, slitOf(cube, w)])),
    faces: Object.fromEntries(st.windows.map(w => [w, faceOfCell(cube.pos[w])])),
    converge: converge(c.cube, cube)
  };
}

/** ChapterSpec.derive (app 注入)；done = 此刻成立的旗標 (封住的門透不透光) */
export const deriveQuery = (c: CrossRooms) => (room: string, state: ChapterState, labels: Labels, done: ReadonlySet<string> = new Set()): Partial<WorldExt> => {
  if (!state.cube) return {};
  const protrude = protrusionsInto(c, room, state.cube, labels, r => usedIn(state, r));
  const balance = balanceExt(c, room, state, labels);
  // 沒有的欄位寫 undefined (清掉上一次的結果；toEqual 視同沒有)
  return { balance: Object.keys(balance).length ? balance : undefined, protrude: protrude.length ? protrude : undefined, starlight: starExt(c, state, labels, done) };
};
