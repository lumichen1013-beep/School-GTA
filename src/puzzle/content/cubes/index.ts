// 魔方章節登錄表 (v0.3)：哪一章有魔方、房間 id → 關卡、從哪扇門進章、哪個關卡 id 屬於哪間房
import type { CubeDef } from '../../core/cube';
import type { LevelDef } from '../../core/types';
import { foyer } from '../levels/ch1/1-2-foyer';
import { stair } from '../levels/ch1/stair';
import { closet } from '../levels/ch1/closet';
import { CH1_CUBE, CH1_LEGACY } from './ch1';
import { CH2_CUBE } from './ch2';
import { shelf } from '../levels/ch2/2-1-shelf';
import { deep, manuscripts, mezz, print } from '../levels/ch2/rooms';
import { reading } from '../levels/ch2/2-2-reading';
import { PROTO_DIAL_ROOMS } from '../levels/proto/dial';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from './test-dial';

export interface CubeChapter {
  chapter: number;
  cube: CubeDef;
  /** 房間 id (= 魔方 cells 的 room) → 關卡 */
  rooms: Readonly<Record<string, LevelDef>>;
  /** 新進本章：從哪間房的哪扇門進 (第一章 = 大門 → 玄關南拱門) */
  start: { room: string; door: string | null };
  /** 登錄表的關卡 id → 房間 id (選單從這些關卡進章) */
  levels: Readonly<Record<string, string>>;
  /** 舊存檔已通關某關 → 開章時的預設快照 (規格 8 遷移) */
  legacy?: typeof CH1_LEGACY;
}

export const CUBE_CHAPTERS: readonly CubeChapter[] = [
  { chapter: 1, cube: CH1_CUBE, rooms: { foyer, stair, closet }, start: { room: 'foyer', door: 'archS' }, levels: { '1-2': 'foyer', '1-3': 'closet' }, legacy: CH1_LEGACY },
  // 第二章 書房 (v0.4 控制盤)：2-1 書架迴廊、2-2 閱覽室、2-3 印房為完整關卡，其餘三間為占位房；從衣帽間章門外的走廊進 2-1 西門
  { chapter: 2, cube: CH2_CUBE, rooms: { shelf, reading, print, mezz, manuscripts, deep }, start: { room: 'shelf', door: 'doorW' }, levels: { '2-1': 'shelf', '2-2': 'reading', '2-3': 'print', '2-4': 'manuscripts' } }
];

/** 【原型占位】開發用的魔方 (不在正式章節；只從選單的開發入口進入)：M-Dial 控制盤原型 */
export const PROTO_CUBE_CHAPTERS: readonly CubeChapter[] = [
  { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, start: { room: 'protoA', door: null }, levels: { 'dev-dial': 'protoA' } }
];

/** 這個關卡 id 是否在某章的魔方上 (正式章節優先；開發入口的原型魔方另列) */
export const cubeChapterOf = (levelId: string): CubeChapter | undefined =>
  CUBE_CHAPTERS.find(c => levelId in c.levels) ?? PROTO_CUBE_CHAPTERS.find(c => levelId in c.levels);
