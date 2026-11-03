// 魔方章節登錄表 (v0.3)：哪一章有魔方、房間 id → 關卡、從哪扇門進章、哪個關卡 id 屬於哪間房
import type { CubeDef } from '../../core/cube';
import type { LevelDef } from '../../core/types';
import { foyer } from '../levels/ch1/1-2-foyer';
import { stair } from '../levels/ch1/stair';
import { closet } from '../levels/ch1/closet';
import { CH1_CUBE, CH1_LEGACY } from './ch1';

export interface CubeChapter {
  chapter: number;
  cube: CubeDef;
  /** 房間 id (= 魔方 cells 的 room) → 關卡 */
  rooms: Readonly<Record<string, LevelDef>>;
  /** 新進本章：從哪間房的哪扇門進 (第一章 = 大門 → 玄關南拱門) */
  start: { room: string; door: string };
  /** 登錄表的關卡 id → 房間 id (選單從這些關卡進章) */
  levels: Readonly<Record<string, string>>;
  /** 舊存檔已通關某關 → 開章時的預設快照 (規格 8 遷移) */
  legacy?: typeof CH1_LEGACY;
}

export const CUBE_CHAPTERS: readonly CubeChapter[] = [
  { chapter: 1, cube: CH1_CUBE, rooms: { foyer, stair, closet }, start: { room: 'foyer', door: 'archS' }, levels: { '1-2': 'foyer' }, legacy: CH1_LEGACY }
];

/** 這個關卡 id 是否在某章的魔方上 */
export const cubeChapterOf = (levelId: string): CubeChapter | undefined => CUBE_CHAPTERS.find(c => levelId in c.levels);
