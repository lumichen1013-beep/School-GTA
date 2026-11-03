import type { Mechanic } from '../core/registry';
import { basics } from './basics';
import { items } from './items';
import { links } from './links';
import { plates } from './plates';
import { notes } from './notes';
import { exit } from './exit';
import { cube } from './cube';
import { sequence } from './sequence';
import { labels } from './labels';
import { coats } from './coats';
import { dial } from './dial';
import { shelf } from './shelf';
import { reveal } from './reveal';
import { combineMech } from './combine';
import { reading } from './reading';
import { print } from './print';
import { manuscripts } from './manuscripts';
import { deep } from './deep';
import { scale, jamQuery } from './scale';
import { balance } from './balance';
import { nursery } from './nursery';
import { light } from './light';
import { chapterDoors } from './cube';
import type { CubeDef } from '../core/cube';
import type { ChapterSpec } from '../core/chapter';
import type { LevelDef } from '../core/types';

/** 預設機制表：陣列順序即執行順序 (afterPhysics：plates 必須在 links 之前；scale 的 beforePhysics 重算尺寸，balance 在 afterPhysics 讀重量；light 在 afterPhysics 讀章節層寫入的光) */
export const DEFAULT_MECHANICS: readonly Mechanic[] = [basics, items, links, plates, notes, exit, cube, sequence, labels, coats, dial, shelf, reveal, combineMech, reading, print, manuscripts, deep, scale, balance, nursery, light];

/**
 * 一章的 ChapterSpec (app / 測試共用)：門位由各房的 cubeDoor 整理 (chapterDoors)；卡榫查詢 (不在場的房) 由 mechanics/scale 注入
 * (規格 6「第三章共用規則」卡榫；核心不 import mechanics)
 */
export function chapterSpecOf(c: { chapter: number; cube: CubeDef; rooms: Readonly<Record<string, LevelDef>> }): ChapterSpec {
  return { chapter: c.chapter, cube: c.cube, rooms: c.rooms, doors: chapterDoors(c.rooms), jammed: jamQuery(c.rooms) };
}
