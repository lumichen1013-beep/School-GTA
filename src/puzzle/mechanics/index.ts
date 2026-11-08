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
import { night } from './night';
import { deriveQuery } from './cross';
import { depths, uncoveredQuery } from './depths';
import { chase } from './chase';
import { mezz } from './mezz';
import { cellar } from './cellar';
import { ink } from './ink';
import { archive } from './archive';
import { drawerMech } from './drawer';
import { attic } from './attic';
import { windows } from './windows';
import { desk } from './desk';
import { engine } from './engine';
import { chapterDoors } from './cube';
import type { CubeDef } from '../core/cube';
import { arrivalBlocker, type ChapterSpec } from '../core/chapter';
import type { LevelDef } from '../core/types';

/** 預設機制表：陣列順序即執行順序 (afterPhysics：plates 必須在 links 之前；scale 的 beforePhysics 重算尺寸 / 位置，balance 在 afterPhysics 讀重量；light 在 afterPhysics 讀章節層寫入的光；night 在 balance 之後讀半座天平是否閂住；depths 在 light 之後讀苔窗是否閂住、花窗讀光；chase 在 depths 之後讀柵門是否開著；mezz = H1 的書牆 / 書櫃，只有類型；attic = 第五章 5-1 縮影：beforePhysics 依標籤「你」定玩家尺寸、afterPhysics 寫 ext.mini、齒輪 / 星圖；windows = 第五章三扇窗的窗框詩與星表匣，只有類型；desk = 5-3 爸爸的書桌 (合成台)、墨水瓶、羊皮紙，只有類型；engine = 5-5 最後的機關：afterPhysics 讀章節層寫入的星光 (光槽閂住)) */
export const DEFAULT_MECHANICS: readonly Mechanic[] = [basics, items, links, plates, notes, exit, cube, sequence, labels, coats, dial, shelf, reveal, combineMech, reading, print, manuscripts, deep, scale, balance, nursery, ink, light, night, depths, chase, mezz, cellar, archive, drawerMech, attic, windows, desk, engine];

/**
 * 一章的 ChapterSpec (app / 測試共用)：門位由各房的 cubeDoor 整理 (chapterDoors)；卡榫查詢 (不在場的房) 由 mechanics/scale 注入
 * (規格 6「第三章共用規則」卡榫；核心不 import mechanics)；跨房推導 (半座天平、伸過來的那一截) 由 mechanics/cross 注入 (3-3)；
 * 露出來的被蓋住的玻璃 (巨根縮小後的苔窗) 由 mechanics/depths 注入 (3-4b)；讀檔時到達處的查詢 (H1) 以本機制表建探測房
 */
export function chapterSpecOf(c: { chapter: number; cube: CubeDef; rooms: Readonly<Record<string, LevelDef>> }): ChapterSpec {
  const doors = chapterDoors(c.rooms);
  const cross = { rooms: c.rooms, cube: c.cube, doors };
  const spec: ChapterSpec = { chapter: c.chapter, cube: c.cube, rooms: c.rooms, doors, jammed: jamQuery(cross), derive: deriveQuery(cross), uncovered: uncoveredQuery(cross) };
  // v0.4 H1 讀檔位置校正 (meta/chapters chapterStart)：到達處此刻被占住 → 從開章入口進
  return { ...spec, arrival: st => arrivalBlocker(spec, st, { mechanics: DEFAULT_MECHANICS }) };
}
