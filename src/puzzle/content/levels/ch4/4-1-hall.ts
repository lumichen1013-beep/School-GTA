import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch } from './parts';

// 4-1 根窖走廊 (第四章魔方的上層北邊 [1,0,1]；房間 id 'hall'，關卡 id '4-1'；規格 6「第四章骨架與銜接（v0.4 細化）」)
//   x∈[-12, 12]、z∈[-5, 5]；北門 (入口：S0 接 [1,0,1] 北側屋框「從溫室下來的石階」)、南門 (前緣、只在實景；↔ 根井北門)、
//   地上的梯口 (拱門形活板門：疊在下層哪一間由兩層的角度決定；S0 下面是夯土)
// 分區：後景兩排一模一樣的書架夾著走道、盡頭被樹根纏住的年輪根盤 ｜ 中景地板梯口與一盞吊在根上的油燈 ｜ 前景南門旁往上的石階與木箱堆 (裝飾)
// 謎題 (規格 6「4-1 根窖走廊（細化）」)：4-1a 整層一起轉 (P1：第一次爬下地板梯口)、4-1b 圖上相鄰，腳下不通 (P9：封存書庫的折疊梯與拉繩)、
//   4-1c 從天花板落下的箱子 (P2：木箱推進拱門形地板梯口、落在抽屜的根結踏板上 → 下層鬆開)；4-1b / 4-1c 在別的房間完成
// 文字 = content/text/zh-Hant/lvl-4-1.ts、lvl-ch4.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, z: 2.8, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.4-1.note', mount: 'post' } as const;

const objects: ObjDef[] = [
  floor(-12, 12),
  door('N', 'door', -9.0, { frameText: 'lvl.ch4.hall.doorN.frame' }),
  door('S', 'door', 6.0),
  // 4-1a：地板梯口 (第一次爬下去 = 閂住；到了下面說 passText)
  hatch('D', 'arch', -2.0, 1.6, { doneFlag: '4-1a', passText: 'lvl.4-1.a.done' }),
  // 4-1c：木箱 (與梯口同一條 z 線；推進梯口 → 落進下面那一間)
  { id: 'crate', type: 'crate', x: 4.5, y: 0, z: 1.6, w: 1.0, h: 0.9, d: 1.0, visible: 'both', solid: true, pushable: true, labelKey: 'lvl.4-1.crate' },
  // 字條 (父親的筆記；story-bible 7.3)：前景五根落地木柱 (4-1a L1、4-1b L1 / L2、4-1c L1 / L2)
  { ...noteBase, id: 'noteA', x: -10.8, textKey: 'lvl.4-1.note.a' },
  { ...noteBase, id: 'noteB', x: -7.6, textKey: 'lvl.4-1.note.b' },
  { ...noteBase, id: 'noteB2', x: -4.4, textKey: 'lvl.4-1.note.b2', revealAfter: 240 },
  { ...noteBase, id: 'noteC', x: 7.4, textKey: 'lvl.4-1.note.c' },
  { ...noteBase, id: 'noteC2', x: 10.4, textKey: 'lvl.4-1.note.c2', revealAfter: 240 },
  // 年輪根盤 (控制盤；只開上層，下層被根結住直到 4-1c)
  { id: 'dial', type: 'dial', chapter: 4, useText: 'lvl.4-1.dial.activated', readyText: 'lvl.4-1.dial.ready',
    x: 9.0, y: 0, z: -3.7, w: 1.6, h: 1.2, d: 1.0, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-1.dial' }
];

const decor: DecorItem[] = [
  { kind: 'walls', stone: 1 },
  // 後景：兩排一模一樣的書架 (「排得太整齊了」)，走道對著盡頭的年輪根盤
  { kind: 'shelfRow', x: -3.4, z: -3.9, n: 3, seed: 251 },
  { kind: 'shelfRow', x: 3.4, z: -3.9, n: 3, seed: 251 },
  { kind: 'rootCeiling', x: 0, w: 22, seed: 253 },
  { kind: 'rootKnot', x: 9.0, z: -3.7 },
  // 中景：梯口旁吊在根上的油燈、積水
  { kind: 'lantern', x: -2.0, y: 3.4, z: 0.6 },
  { kind: 'puddle', x: 3.2, z: 0.8, w: 1.8, d: 1.0 },
  // 前景：南門旁往上的石階 (回溫室，裝飾)、木箱堆
  { kind: 'greenhouseStair', x: -9.0, z: -3.6 },
  { kind: 'crateStack', x: 9.4, z: 3.0, seed: 255 }
];

export const hall: LevelDef = {
  id: '4-1',
  titleKey: 'lvl.4-1.title',
  shortKey: 'lvl.ch4.hall.short',
  bounds: { minX: -12, maxX: 12, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -9.0, y: 0, z: -2.6 },
  narrationKey: 'lvl.4-1.narration',
  puzzles: [
    { id: '4-1a', titleKey: 'lvl.4-1.puzzle.a' },
    { id: '4-1b', titleKey: 'lvl.4-1.puzzle.b' },
    { id: '4-1c', titleKey: 'lvl.4-1.puzzle.c' }
  ],
  nextKey: 'lvl.4-1.next',
  theme: 'cellar',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第四章基礎預算)
  turnBudget: { base: 8 },
  decor,
  objects
};
