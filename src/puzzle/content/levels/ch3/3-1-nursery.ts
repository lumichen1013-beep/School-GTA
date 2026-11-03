import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 3-1 苗圃 (第三章魔方的中列第 0 行；房間 id 'nursery'，關卡 id '3-1'；規格 6「第三章骨架與銜接（v0.4 細化）」占位版)
//   x∈[-6, 8]、z∈[-5, 5]；西門 (入口：S0 接來時的走廊)、東拱門 (S0 接夜溫室西拱門)、南拱門 (前緣、只在實景；S0 面對水塔 = 牆)
//   屋頂是木棚 (沒有彩繪玻璃)；門邊工作台上的園丁羅盤 = 第三章的控制盤 (3D 站穩按 E 啟動)
// 分區 (後 / 中 / 前)：後景門邊工作區 (工作台與羅盤、兩座育苗架) ｜ 中景兩座育苗床夾著走道 ｜ 前景南拱門旁的陶盆與木凳
// 占位版：花秤、比例尺、樹根 (3-1a / 3-1b) 在 3-1 細化時加入。文字 = content/text/zh-Hant/lvl-3-1.ts、lvl-ch3.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 1, y: -1, z: 0, w: 14, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', frameText: 'lvl.ch3.doorW.frame', x: -5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.doorW' },
  { id: 'archE', type: 'cubeDoor', side: 'E', kind: 'arch', x: 7.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.archE' },
  { id: 'archS', type: 'cubeDoor', side: 'S', kind: 'arch', x: 3.0, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.archS' },
  // ── 後景：門邊工作台上的園丁羅盤 (fixedCells = 盤上兩格實心：工具間 [2,0]、水塔 [0,2]) ──
  { id: 'dial', type: 'dial', chapter: 3, useText: 'lvl.3-1.dial.activated', readyText: 'lvl.3-1.dial.ready', fixedCells: [[2, 0], [0, 2]],
    x: -3.6, y: 0, z: -3.7, w: 1.6, h: 1.2, d: 0.8, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.dial' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 後景：靠後牆的兩座育苗架 (工作台在西側、門邊)
  { kind: 'pottingRack', x: 0.4, w: 2.6, seed: 31 },
  { kind: 'pottingRack', x: 4.6, w: 2.2, seed: 34 },
  // 中景：兩座育苗床斜放，中間留走道 (東西向的走道通往東拱門)
  { kind: 'planter', x: -1.2, z: -1.4, w: 2.6, d: 1.0, rot: 0.18, seed: 3 },
  { kind: 'planter', x: 4.4, z: -1.2, w: 2.4, d: 1.0, rot: -0.22, seed: 7 },
  // 前景：南拱門旁的陶盆與木凳
  { kind: 'pots', x: 0.6, z: 3.4, n: 5, seed: 11 },
  { kind: 'pots', x: 5.8, z: 3.6, n: 3, seed: 13 },
  { kind: 'bench', x: -3.0, z: 3.4, w: 1.6, rot: 0.3 },
  { kind: 'roots', x: -5.9, side: 'W', seed: 21 },
  { kind: 'pendant', x: -3.4, z: -2.6 },
  { kind: 'pendant', x: 3.0, z: 0.4 }
];

export const nursery: LevelDef = {
  id: '3-1',
  titleKey: 'lvl.3-1.title',
  bounds: { minX: -6, maxX: 8, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -3, y: 0, z: 1.5 },
  narrationKey: 'lvl.3-1.narration',
  nextKey: 'lvl.ch3.placeholder.next',
  theme: 'greenhouse',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第三章基礎預算)
  turnBudget: { base: 8 },
  decor,
  objects
};
