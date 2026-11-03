// 章節存檔 (v0.3；規格 8 SaveV3 的 chapters[n])：ChapterState ↔ ChapterSave、開章時的起始狀態 (含舊存檔的預設旗標)
import type { ObjId } from '../core/types';
import { newChapterState, type ChapterSpec, type ChapterState, type ObjSnapshot } from '../core/chapter';
import type { ChapterSave, Save } from './save';

/** 舊存檔的預設快照 (content/cubes/ch<N>.ts 的 *_LEGACY)：已通關 level → 開章時 room 的物件旗標與章節道具 */
export interface LegacyChapter {
  level: string;
  room: string;
  objs: Readonly<Record<ObjId, { gone?: boolean; used?: boolean }>>;
  items: Readonly<Record<string, number>>;
}

/** 章節狀態 → 存檔 (只存魔方、房間快照、下次進章的房間 / 門、章節道具、旗標) */
export function chapterSave(state: ChapterState): ChapterSave {
  if (!state.cube) throw new Error(`chapter ${state.chapter} has no cube`);
  return JSON.parse(JSON.stringify({ cube: state.cube, rooms: state.rooms, at: { room: state.room, door: state.door }, items: state.items, flags: state.flags })) as ChapterSave;
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
    return {
      chapter: spec.chapter, cube: saved.cube, rooms: saved.rooms, items: saved.items, flags: saved.flags,
      room: known ? saved.at.room : start.room, door: known ? saved.at.door : start.door
    };
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
