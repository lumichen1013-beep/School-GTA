import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch, inkSealed, plaque } from './parts';

// 第四章的房間 (規格 6「第四章骨架與銜接（v0.4 細化）」)：4-1 根窖走廊 (另檔 4-1-hall.ts，這裡轉出)、根井 (裝飾房)、4-2 墨爐間、
// 4-3 封存書庫、4-4 最後的抽屜、H3 封存室 (隱藏房占位，沒有門) 的占位版；謎題逐關取代。
// 門位 (本地)：E / W 在側牆 z = 0；N 在後牆 z = -4.8；S 在前緣 z = 4.8 (只在實景)；U = 靠後牆的梯子 (往天花板的梯口)、D = 地上的活板門 (往下的梯口)；
// 梯口都只在實景按 E。墨線鎖封住的門 = cubeDoor.sealed (本步沒有任何東西會打開它)。每房墨 8。文字 = content/text/zh-Hant/lvl-ch4.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
/** 展開圖格子小時的短名 (文字 key) */
const SHORT_KEYS: Readonly<Record<string, string>> = {
  well: 'lvl.ch4.well.short', furnace: 'lvl.ch4.furnace.short', archive: 'lvl.ch4.archive.short', drawer: 'lvl.ch4.drawer.short', sealed: 'lvl.ch4.sealed.short'
};
const TITLE_KEYS: Readonly<Record<string, string>> = {
  well: 'lvl.ch4.well.title', furnace: 'lvl.ch4.furnace.title', archive: 'lvl.ch4.archive.title', drawer: 'lvl.ch4.drawer.title', sealed: 'lvl.ch4.sealed.title'
};

function room(id: string, minX: number, maxX: number, objects: ObjDef[], decor: DecorItem[], extra: Partial<LevelDef> = {}): LevelDef {
  return {
    id,
    titleKey: TITLE_KEYS[id],
    shortKey: SHORT_KEYS[id],
    bounds: { minX, maxX, minZ: -5, maxZ: 5 },
    voidY: -5,
    start: { x: (minX + maxX) / 2, y: 0, z: 1.5 },
    narrationKey: 'lvl.ch4.placeholder.narration',
    nextKey: 'lvl.ch4.placeholder.next',
    theme: 'cellar',
    // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第四章基礎預算)
    turnBudget: { base: 8 },
    decor: [{ kind: 'walls', stone: 1 }, ...decor],
    objects: [floor(minX, maxX), ...objects],
    ...extra
  };
}

/** 4-1 根窖走廊 (上層北邊；入口)：完整檔在 4-1-hall.ts */
export { hall } from './4-1-hall';

/**
 * 根井 (上層中心；裝飾房，不是關卡)：北門 (↔ 走廊南門)、地上的根梯梯口 (往下到墨爐間；中心疊中心，永遠接通)。
 * 後景盤繞的粗根爬滿石壁 ｜ 中景往下的根梯與井口 ｜ 前景石欄 (紙籤) 與滴水的積水
 */
export const well = room('well', -5, 5, [
  door('N', 'door', 0),
  hatch('D', 'door', 2.0, 1.2, { id: 'ladderD', labelKey: 'lvl.ch4.ladderD' }),
  plaque('plaqueWell', 'lvl.ch4.well.plaque', -2.2, 0.8, 3.2, '3d'),
  // 4-2a 的隱藏點：墨流過根井 → 後牆顯出墨痕、墨痕裡的殘片 3 (只在藏寶圖拿)
  { id: 'inkMark', type: 'inkMark', x: -1.6, y: 1.2, z: -4.86, w: 3.0, h: 2.6, d: 0.04, visible: 'both', solid: false, labelKey: 'lvl.4-2.mark' },
  { id: 'scrap3', type: 'scrap', grants: 'scrap.3', useText: 'lvl.4-2.scrap.got', revealedBy: 'inkMark',
    x: -1.6, y: 1.3, z: -4.7, w: 0.36, h: 0.26, d: 0.08, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.4-2.scrap' },
  { id: 'pipeWell', type: 'inkPipe', when: 'through', path: '2.6,0,1.2 3.6,2.4,-2 0,4.2,-4.6 0,5.6,-4.6', x: 2.0, y: 0, z: -1.6, w: 0.3, h: 5.6, d: 0.3, visible: '3d', solid: false }
], [
  { kind: 'rootWall', x: 0, w: 9.6, seed: 201 },
  { kind: 'wellMouth', x: 2.0, z: 1.2 },
  { kind: 'stoneRail', x: -2.2, z: 3.4, w: 3.2 },
  { kind: 'puddle', x: -3.4, z: 1.6, w: 1.4, d: 0.9 },
  { kind: 'lantern', x: -1.0, y: 3.4, z: -1.0 }
]);

/** 4-2 墨爐間 (下層中心)：完整檔在 4-2-furnace.ts */
export { furnace } from './4-2-furnace';

/**
 * 4-3 封存書庫 (下層西邊)：東門 (↔ 墨爐間西門；墨線鎖)、天花板梯口 (窄梯；只有人過)。
 * 後景整面鐵皮抽屜牆 (貼著樹根) ｜ 中景長桌與檔案櫃 (成組、面向抽屜牆) ｜ 前景散落的封條與積水、紙籤
 */
export const archive = room('archive', -10, 10, [
  door('E', 'door', 9.8, inkSealed('4-2a')),
  // 4-1b：天花板梯口的折疊梯收著 (拉繩拉下之前爬不上去)；拉繩只在藏寶圖、要站上只畫在圖上的台階才搆得到
  hatch('U', 'door', -4.0, -4.4, { sealed: { until: '4-1b', text: 'lvl.4-1.ladder.folded' } }),
  // 樹根管線 (外觀；4-2a)：天花板 → 東門 (墨流回墨爐的西門)
  { id: 'pipeArchive', type: 'inkPipe', when: 'through', path: '-3.2,5.6,-4.7 2,4.4,-4.7 9.6,1.8,-1.2', x: 3.2, y: 1.8, z: -3.0, w: 0.3, h: 3.8, d: 0.3, visible: '3d', solid: false },
  { id: 'foldCord', type: 'foldCord', doneFlag: '4-1b', useText: 'msg.cellar.cord', x: -3.0, y: 2.6, z: -3.9, w: 0.2, h: 0.5, d: 0.2, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.4-1.cord' },
  { id: 'inkStep', type: 'inkStep', x: -2.2, y: 0, z: -3.6, w: 1.2, h: 1.4, d: 1.0, visible: '2d', solid: true, labelKey: 'lvl.4-1.inkStep' },
  plaque('plaqueArchive', 'lvl.ch4.archive.plaque', 2.4, 0.8, 3.0)
], [
  { kind: 'drawerWall', x: 3.0, w: 9.0, h: 3.2, seed: 221 },
  { kind: 'rootCeiling', x: 0, w: 18, seed: 223 },
  { kind: 'longTable', x: 1.6, z: -0.8, w: 3.2, rot: 0 },
  { kind: 'cabinets', x: -6.4, z: -1.2, n: 2, rot: 0.25, seed: 225 },
  { kind: 'cabinets', x: 7.4, z: -2.6, n: 2, rot: -0.2, seed: 227 },
  { kind: 'seals', x: -1.4, z: 2.4, seed: 229 },
  { kind: 'puddle', x: 5.6, z: 2.4, w: 1.6, d: 1.0 },
  { kind: 'lantern', x: -1.0, y: 3.6, z: -0.4 }
]);

/**
 * 4-4 最後的抽屜 (下層東邊)：西門 (↔ 墨爐間東門；墨線鎖)、天花板梯口 (寬梯：木箱落得進來)、東章門 (要房間的銅鑰匙 key.cellar；只接 [1,0,0] 北側屋框)。
 * 後景一排檔案櫃與最後一個抽屜 ｜ 中景爸爸的書桌與椅子 (面向抽屜) ｜ 前景章門前往上的木梯腳、積水、紙籤
 */
export const drawer = room('drawer', -14, 14, [
  door('W', 'door', -13.8, inkSealed('ink.E')),
  hatch('U', 'arch', -6.0, -4.4),
  // 樹根管線 (外觀)：天花板 → 西門 (墨流回墨爐的東門)
  { id: 'pipeDrawer', type: 'inkPipe', when: 'through', path: '-5.0,5.6,-4.7 -9.6,4.4,-4.7 -13.6,1.8,-1.2', x: -9.3, y: 1.8, z: -3.0, w: 0.3, h: 3.8, d: 0.3, visible: '3d', solid: false },
  // 4-1c：天花板梯口正下方的根結踏板 (木箱從走廊落下來就壓在上面)
  { id: 'rootPlate', type: 'rootPlate', doneFlag: '4-1c', solvedText: 'lvl.4-1.plate.solved', x: -6.0, y: 0, z: -2.4, w: 2.4, h: 0.08, d: 1.4, visible: 'both', solid: false, labelKey: 'lvl.4-1.plate' },
  door('E', 'chapter', 13.8, { key: 'key.cellar' }),
  plaque('plaqueDrawer', 'lvl.ch4.drawer.plaque', 3.6, 0.8, 3.0)
], [
  { kind: 'cabinets', x: 2.4, z: -4.2, n: 5, rot: 0, seed: 231 },
  { kind: 'rootCeiling', x: 0, w: 26, seed: 233 },
  { kind: 'desk', x: 1.6, z: -1.2, rot: Math.PI },
  { kind: 'stool', x: 1.6, z: 0.2, rot: 0 },
  { kind: 'atticStair', x: 12.4, z: 3.2 },
  { kind: 'puddle', x: -3.4, z: 2.6, w: 2.2, d: 1.2 },
  { kind: 'lantern', x: 1.6, y: 3.4, z: -1.2 },
  { kind: 'lantern', x: -9.0, y: 3.6, z: 0.6 }
], { nextKey: 'lvl.ch4.drawer.next' });

/** H3 封存室 (下層南邊；隱藏房占位)：沒有門 (梯口被樹根封住；本版進不去) */
export const sealed = room('sealed', -6, 6, [], [
  { kind: 'rootWall', x: 0, w: 11.6, seed: 241 },
  { kind: 'desk', x: 0, z: -1.6, rot: Math.PI }
]);
