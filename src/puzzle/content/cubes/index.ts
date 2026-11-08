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
import { CH3_CUBE } from './ch3';
import { bed, depths, gallery, night, nursery } from '../levels/ch3/rooms';
import { CH4_CUBE } from './ch4';
import { archive, drawer, furnace, hall, sealed, well } from '../levels/ch4/rooms';
import { CH5_CUBE } from './ch5';
import { east, engine, landing, meadow, north, sky, walkA, walkB, walkC, walkD, west } from '../levels/ch5/rooms';
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
  /**
   * v0.4 H1：回到本章時補發尺度卡 (存檔能力 scale、章節道具與標籤上都沒有那張卡 → 補進章節道具；meta/chapters grantScaleCards)。
   * 第二章 (夾層的書櫃要量)、第五章 (5-1a 的「小」；規格「第五章骨架與銜接」)；第一章不補 (8 節「新能力不進舊關」)、第三章本來就有
   */
  scaleCards?: boolean;
}

export const CUBE_CHAPTERS: readonly CubeChapter[] = [
  { chapter: 1, cube: CH1_CUBE, rooms: { foyer, stair, closet }, start: { room: 'foyer', door: 'archS' }, levels: { '1-2': 'foyer', '1-3': 'closet' }, legacy: CH1_LEGACY },
  // 第二章 書房 (v0.4 控制盤)：2-1～2-5、H1 夾層 (隱藏房，要第三章的比例尺：回到本章時補發尺度卡) 都是完整關卡；從衣帽間章門外的走廊進 2-1 西門
  { chapter: 2, cube: CH2_CUBE, rooms: { shelf, reading, print, mezz, manuscripts, deep }, start: { room: 'shelf', door: 'doorW' }, levels: { '2-1': 'shelf', '2-2': 'reading', '2-3': 'print', '2-4': 'manuscripts', '2-5': 'deep', H1: 'mezz' }, scaleCards: true },
  // 第三章 溫室 (v0.4 控制盤、滑動)：3-1 苗圃、3-2 玻璃長廊、3-3 夜溫室、3-4 溫室深處為完整關卡，溫床為占位房 (沒有門)；從書房深處章門外的走廊進 3-1 苗圃西門
  { chapter: 3, cube: CH3_CUBE, rooms: { nursery, night, gallery, bed, depths }, start: { room: 'nursery', door: 'doorW' }, levels: { '3-1': 'nursery', '3-2': 'gallery', '3-3': 'night', '3-4': 'depths' } },
  // 第四章 地下室 (v0.4 控制盤、層轉)：4-1 根窖走廊、根井 (裝飾房)、4-2 墨爐間、4-3 封存書庫、4-4 最後的抽屜為占位版 (逐關取代)、H3 封存室占位 (沒有門)；
  // 從溫室深處章門外的石階進 4-1 根窖走廊北門
  { chapter: 4, cube: CH4_CUBE, rooms: { hall, well, furnace, archive, drawer, sealed }, start: { room: 'hall', door: 'doorN' }, levels: { '4-1': 'hall', '4-2': 'furnace', '4-3': 'archive', '4-4': 'drawer' } },
  // 第五章 閣樓 (v0.4 控制盤、切片轉)：樓梯口 (裝飾房)、5-1 天窗間、5-2 東窗、5-3 西窗、5-4 北窗、5-5 最後的機關、6-1 林心草地為占位版 (逐關取代)、
  // 梁上走道 A～D (走廊格)；從地下室的木梯進樓梯口南門；第五章要「大」「小」尺度卡 (scaleCards)
  {
    chapter: 5, cube: CH5_CUBE, rooms: { landing, sky, east, west, north, engine, meadow, walkA, walkB, walkC, walkD },
    start: { room: 'landing', door: 'doorS' }, levels: { '5-1': 'sky', '5-2': 'east' }, scaleCards: true
  }
];

/** 【原型占位】開發用的魔方 (不在正式章節；只從選單的開發入口進入)：M-Dial 控制盤原型 */
export const PROTO_CUBE_CHAPTERS: readonly CubeChapter[] = [
  { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, start: { room: 'protoA', door: null }, levels: { 'dev-dial': 'protoA' } }
];

/** 這個關卡 id 是否在某章的魔方上 (正式章節優先；開發入口的原型魔方另列) */
export const cubeChapterOf = (levelId: string): CubeChapter | undefined =>
  CUBE_CHAPTERS.find(c => levelId in c.levels) ?? PROTO_CUBE_CHAPTERS.find(c => levelId in c.levels);
