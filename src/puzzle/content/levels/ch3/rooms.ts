import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 第三章的房間登錄 (規格 6「第三章骨架與銜接（v0.4 細化）」)：3-1 苗圃、3-2 玻璃長廊、3-3 夜溫室、3-4 溫室深處另檔 (這裡轉出)；
// 這裡只剩 H2 溫床的占位房 (沒有門；彩繪玻璃資料在 content/cubes/ch3 CH3_GLASS，這裡是窗的裝飾)。每房墨 8。文字 = content/text/zh-Hant/lvl-ch3.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
/** 房間標題 (文字 key) */
const TITLE_KEYS: Readonly<Record<string, string>> = { bed: 'lvl.ch3.bed.title' };

const floor = (minX: number, maxX: number): ObjDef =>
  ({ id: 'floor', type: 'floor', x: (minX + maxX) / 2, y: -1, z: 0, w: maxX - minX, h: 1, d: 10, visible: 'both', solid: true });

function room(id: string, minX: number, maxX: number, objects: ObjDef[], decor: DecorItem[], narrationKey = 'lvl.ch3.placeholder.narration'): LevelDef {
  return {
    id,
    titleKey: TITLE_KEYS[id],
    bounds: { minX, maxX, minZ: -5, maxZ: 5 },
    voidY: -5,
    start: { x: (minX + maxX) / 2, y: 0, z: 1.5 },
    narrationKey,
    nextKey: 'lvl.ch3.placeholder.next',
    theme: 'greenhouse',
    // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第三章基礎預算)
    turnBudget: { base: 8 },
    decor: [{ kind: 'walls' }, ...decor],
    objects: [floor(minX, maxX), ...objects]
  };
}

/** 3-1 苗圃 (中列左格；入口)：完整檔在 3-1-nursery.ts */
export { nursery } from './3-1-nursery';

/** 3-2 玻璃長廊 (中列右格)：完整檔在 3-2-gallery.ts */
export { gallery } from './3-2-gallery';

/** 3-3 夜溫室 (中心格)：完整檔在 3-3-night.ts */
export { night } from './3-3-night';

/** 3-4 溫室深處 (南列右格；章門格)：完整檔在 3-4-depths.ts */
export { depths } from './3-4-depths';

/** H2 溫床 (南列中格；隱藏房占位)：沒有門 (本版進不去)；彩繪玻璃 N / E + 稜鏡 N↔E (只當光路的一段) */
export const bed = room('bed', -6, 6, [], [
  { kind: 'glassPane', side: 'N', at: 0, y: 3.0, w: 3.6, h: 2.4, cols: 3, rows: 3, seed: 95 },
  { kind: 'glassPane', side: 'E', at: 0, y: 2.8, w: 2.4, h: 2.2, cols: 2, rows: 2, seed: 97 },
  { kind: 'planter', x: -2.0, z: -1.0, w: 3.0, d: 1.2, rot: 0, seed: 99 },
  { kind: 'planter', x: 2.4, z: 1.4, w: 2.4, d: 1.0, rot: 0.2, seed: 101 }
]);
