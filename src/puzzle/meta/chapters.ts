// 章節存檔 (v0.3；規格 8 SaveV3 的 chapters[n])：ChapterState ↔ ChapterSave、開章時的起始狀態 (含舊存檔的預設旗標)
import type { ObjId } from '../core/types';
import { isDialChapter, newChapterState, turnBudgetFor, type ChapterSpec, type ChapterState, type ObjSnapshot } from '../core/chapter';
import type { ChapterSave, Save } from './save';
import type { CubeChapter } from '../content/cubes';

/** 舊存檔的預設快照 (content/cubes/ch<N>.ts 的 *_LEGACY)：已通關 level → 開章時 room 的物件旗標與章節道具 */
export interface LegacyChapter {
  level: string;
  room: string;
  objs: Readonly<Record<ObjId, { gone?: boolean; used?: boolean }>>;
  items: Readonly<Record<string, number>>;
}

/** 章節狀態 → 存檔 (魔方、房間快照、下次進章的房間 / 門、章節道具、旗標、標籤上的字卡、跨房物件；控制盤章節另有 dial / unlocked / turns) */
export function chapterSave(state: ChapterState): ChapterSave {
  if (!state.cube) throw new Error(`chapter ${state.chapter} has no cube`);
  return JSON.parse(JSON.stringify({
    cube: state.cube, rooms: state.rooms, at: { room: state.room, door: state.door }, items: state.items, flags: state.flags, labels: state.labels, moved: state.moved,
    ...(state.dial !== undefined ? { dial: state.dial } : {}), ...(state.unlocked ? { unlocked: state.unlocked } : {}), ...(state.turns ? { turns: state.turns } : {})
  })) as ChapterSave;
}

/**
 * 控制盤欄位對照章節定義校正 (規格 8 v0.4 增補)：只在控制盤章節保留；鎖扣只留本章有的組；
 * turns：墨量在 0～該房預算、堆疊長度 ≤ 預算、每筆的組 id 存在 → 照存檔 (房內讀檔不補墨)，否則丟棄 turns (= 開章時補滿；其他進度不動)
 */
function dialFields(spec: ChapterSpec, saved: ChapterSave, base: ChapterState): Pick<ChapterState, 'dial' | 'unlocked' | 'turns'> {
  if (!isDialChapter(spec)) return {};
  const groups = new Set((spec.cube?.dial?.groups ?? []).map(g => g.id));
  const out: Pick<ChapterState, 'dial' | 'unlocked' | 'turns'> = {};
  if (saved.dial !== undefined) out.dial = saved.dial;
  if (saved.unlocked) out.unlocked = saved.unlocked.filter(g => groups.has(g));
  const t = saved.turns;
  if (t) {
    const max = turnBudgetFor(spec, base);
    if (t.left <= max && t.undo.length <= max && t.undo.every(r => groups.has(r.group))) out.turns = { left: t.left, undo: t.undo.map(r => ({ ...r })) };
  }
  return out;
}

/** 寫入一章的快照 (其餘欄位不變) */
export function withChapter(save: Save, state: ChapterState): Save {
  return { ...save, chapters: { ...save.chapters, [String(state.chapter)]: chapterSave(state) } };
}

/**
 * 開章時的狀態：有存檔 → 從存檔 (房間 / 門不存在於本章 → 從開章入口)；沒有 → 新章 (魔方 S0、從 start 進)，
 * 若舊存檔已通關 legacy.level，legacy.room 套用預設旗標、給章節道具
 */
export function chapterStart(save: Save, spec: ChapterSpec, start: { room: string; door: ObjId | null }, legacy?: LegacyChapter): ChapterState {
  const saved = save.chapters?.[String(spec.chapter)];
  if (saved && spec.cube && spec.cube.cells.every(c => c.room === 'solid' || c.room in saved.cube.pos)) {
    const known = saved.at.room in spec.rooms && (saved.at.door === null || spec.doors.some(d => d.room === saved.at.room && d.door === saved.at.door));
    const base: ChapterState = {
      chapter: spec.chapter, cube: saved.cube, rooms: saved.rooms, items: saved.items, flags: saved.flags,
      labels: saved.labels ?? {}, moved: (saved.moved ?? {}),
      room: known ? saved.at.room : start.room, door: known ? saved.at.door : start.door
    };
    // v0.4 H1：存檔的門 / 洞此刻的到達處被占住 (例：占位版夾層的洞內側，現在是書櫃) → 從開章入口進 (不把人放進後面)
    const open = !known || saved.at.door === null || !spec.arrival || spec.arrival(base) === null;
    if (!open) { base.room = start.room; base.door = start.door; }
    // 存檔的房間不在本章 / 改從開章入口進 → 墨量屬於別的房，不沿用
    return { ...base, ...dialFields(spec, known && open ? saved : { ...saved, turns: undefined }, base) };
  }
  const state = newChapterState(spec, start.room, start.door);
  if (legacy && save.cleared.includes(legacy.level)) {
    const level = spec.rooms[legacy.room];
    const objs: ObjSnapshot[] = (level?.objects ?? []).filter(o => o.id in legacy.objs).map(o => ({
      id: o.id, x: o.x, y: o.y, z: o.z, gone: legacy.objs[o.id].gone ?? false, used: legacy.objs[o.id].used ?? false, touched: false
    }));
    state.rooms[legacy.room] = { objs, flags: [] };
    state.items = { ...legacy.items };
  }
  return state;
}

/**
 * 進關時要顯示的旁白 = 開章後實際所在房間的旁白 (選單選 1-3、但沒有章節存檔 → 從玄關開始 → 玄關的旁白，不是衣帽間的)；
 * 不在魔方上的單房關卡 = 該關的旁白
 */
export const entryNarrationKey = (spec: ChapterSpec, state: ChapterState): string => spec.rooms[state.room].narrationKey;

/** 尺度卡 (3-1 建築比例尺的「大」「小」；mechanics/scale SCALE_CARDS 的鍵) */
const SCALE_CARD_IDS: readonly string[] = ['card.da', 'card.xiao'];

/**
 * v0.4 H1 補發尺度卡 (規格「H1 夾層（細化）」怎麼進 2)：存檔能力有 scale、這一章 cc.scaleCards (第二章、第五章)、
 * 章節道具與標籤上都沒有那張卡 → 補進 state.items (各一張)；granted = 這次補的卡 (非空 → 開章後 HUD 說一次 msg.cards.scaleBack)。
 * 之後卡片就是一般章節道具 (存檔 / R 照舊)；不改傳入的 state
 */
export function grantScaleCards(save: Save, cc: Pick<CubeChapter, 'scaleCards'>, state: ChapterState): { state: ChapterState; granted: string[] } {
  if (!cc.scaleCards || !save.abilities.includes('scale')) return { state, granted: [] };
  const onLabels = new Set(Object.values(state.labels).flat());
  const granted = SCALE_CARD_IDS.filter(id => (state.items[id] ?? 0) <= 0 && !onLabels.has(id));
  if (!granted.length) return { state, granted };
  const items = { ...state.items };
  for (const id of granted) items[id] = 1;
  return { state: { ...state, items }, granted };
}
