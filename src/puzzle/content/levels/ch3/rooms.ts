import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import type { DoorKind } from '../../../core/cube';

// 第三章的占位房 (規格 6「第三章骨架與銜接（v0.4 細化）」)：3-3 夜溫室、3-4 溫室深處、H2 溫床 (3-1 苗圃、3-2 玻璃長廊另檔，這裡轉出)。
// 只有門、彩繪玻璃 (資料在 content/cubes/ch3 CH3_GLASS；這裡是窗的裝飾與窗邊的紙籤)、裝飾；謎題逐關取代。
// 門位 (本地)：夜溫室 北 / 西 / 東 / 南 四個拱門、深處 北拱門 / 南章門 (要 key.greenhouse；本版沒有給鑰匙的物件 → 鎖著)、溫床沒有門。
// E / W 門位 z = 0；N 在後牆 z = -4.8；S 在前緣 z = 4.8 (只在實景)。每房墨 8。文字 = content/text/zh-Hant/lvl-ch3.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
/** 門的名稱 (文字 key；id = 型別 + 門位) */
const DOOR_KEYS: Readonly<Record<string, string>> = {
  doorW: 'lvl.ch3.doorW', doorS: 'lvl.ch3.doorS', archN: 'lvl.ch3.archN', archE: 'lvl.ch3.archE', archS: 'lvl.ch3.archS', archW: 'lvl.ch3.archW', chapterS: 'lvl.ch3.chapterS'
};
/** 房間標題 (文字 key) */
const TITLE_KEYS: Readonly<Record<string, string>> = {
  night: 'lvl.ch3.night.title', depths: 'lvl.ch3.depths.title', bed: 'lvl.ch3.bed.title'
};

/** 一扇門 / 拱門：E / W 在側牆 (z = 0)、N 在後牆、S 在前緣 (只在實景) */
function door(side: 'E' | 'W' | 'N' | 'S', kind: DoorKind, x: number, extra: Partial<{ key: string; frameText: string }> = {}): ObjDef {
  const ew = side === 'E' || side === 'W';
  return {
    id: `${kind}${side}`, type: 'cubeDoor', side, kind, x, y: 0, z: ew ? 0 : side === 'N' ? -4.8 : 4.8,
    w: ew ? 0.4 : 1.6, h: 2.4, d: ew ? 1.6 : 0.4, visible: side === 'S' ? '3d' : 'both', solid: false, interactable: true, interactIn: '3d',
    labelKey: DOOR_KEYS[`${kind}${side}`], ...extra
  };
}
/** 窗邊 / 樹根旁的紙籤 (資訊物件，不計入字條預算)：貼在牆上的兩個視角都看得到；插在木樁上的 (stake 裝飾只在實景) 只在實景 */
const plaque = (id: string, textKey: string, x: number, y: number, z: number, visible: 'both' | '3d' = 'both'): ObjDef =>
  ({ id, type: 'remark', textKey, x, y, z, w: 1.4, h: 0.42, d: 0.04, visible, solid: false, interactable: true, labelKey: 'lvl.ch3.plaque' });
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

/**
 * 3-4 溫室深處 (南列右格；章門格)：北拱門 (S0 接長廊南門)、南章門 (只接 [2,2] 南側屋框：往地下室；要房間的銅鑰匙 key.greenhouse，本版鎖著)。
 * 彩繪玻璃 N (九格花窗，缺三格) / W (苔窗，被巨根蓋住)。後景北牆花窗 ｜ 中景西牆的巨根與木樁上的紙籤 (只在實景) ｜ 前景章門前的石板與大蕨
 */
export const depths = room('depths', -8, 8, [
  door('N', 'arch', 0),
  door('S', 'chapter', 3.0, { key: 'key.greenhouse' }),
  plaque('plaqueRoot', 'lvl.ch3.depths.plaqueRoot', -5.4, 0.75, -0.2, '3d'),
  // 3-3c (規格「3-3 夜溫室（細化）」)：北牆花窗下的高台 (1.9：徒手上不去) 與台上爸爸的園藝筆記一頁；墊腳 = 夜溫室在 [2,1] 時從北拱門伸進來的陶槽
  { id: 'ledge', type: 'ledge', readText: 'lvl.3-3.ledge.read', x: 1.85, y: 0, z: -4.55, w: 2.0, h: 1.9, d: 0.9, visible: 'both', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.3-3.ledge' },
  { id: 'pageGarden', type: 'page', grants: 'page.garden', useText: 'lvl.3-3.page.take', doneFlag: '3-3c',
    x: 1.85, y: 1.9, z: -4.55, w: 0.4, h: 0.08, d: 0.3, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-3.page' }
], [
  { kind: 'glassPane', side: 'N', at: 3.6, y: 3.2, w: 3.0, h: 3.0, cols: 3, rows: 3, missing: '0,1;2,0;1,2', seed: 81 },
  { kind: 'glassPane', side: 'W', at: 0.6, y: 2.6, w: 2.4, h: 2.2, cols: 2, rows: 2, seed: 83 },
  { kind: 'roots', x: -7.9, side: 'W', seed: 85 },
  { kind: 'roots', x: -7.9, side: 'W', seed: 86 },
  { kind: 'stake', x: -5.4, z: -0.27, h: 1.25 },
  { kind: 'pots', x: -2.2, z: -3.6, n: 3, seed: 87 },
  { kind: 'planter', x: 5.8, z: -1.0, w: 2.2, d: 1.0, rot: -0.3, seed: 89 },
  { kind: 'rug', x: 3.0, z: 3.0, w: 2.2, d: 3.0 },
  { kind: 'pots', x: 0.8, z: 3.6, n: 2, seed: 91, fern: 1 },
  { kind: 'pots', x: 5.4, z: 3.6, n: 2, seed: 93, fern: 1 },
  { kind: 'pendant', x: 1.0, z: -0.6 }
], 'lvl.ch3.depths.narration');

/** H2 溫床 (南列中格；隱藏房占位)：沒有門 (本版進不去)；彩繪玻璃 N / E + 稜鏡 N↔E (只當光路的一段) */
export const bed = room('bed', -6, 6, [], [
  { kind: 'glassPane', side: 'N', at: 0, y: 3.0, w: 3.6, h: 2.4, cols: 3, rows: 3, seed: 95 },
  { kind: 'glassPane', side: 'E', at: 0, y: 2.8, w: 2.4, h: 2.2, cols: 2, rows: 2, seed: 97 },
  { kind: 'planter', x: -2.0, z: -1.0, w: 3.0, d: 1.2, rot: 0, seed: 99 },
  { kind: 'planter', x: 2.4, z: 1.4, w: 2.4, d: 1.0, rot: 0.2, seed: 101 }
]);
