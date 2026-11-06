import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch } from './parts';

// 4-1 根窖走廊 (第四章魔方的上層北邊 [1,0,1]；房間 id 'hall'，關卡 id '4-1'；規格 6「第四章骨架與銜接（v0.4 細化）」)
//   x∈[-12, 12]、z∈[-5, 5]；北門 (入口：S0 接 [1,0,1] 北側屋框「從溫室下來的石階」)、南門 (前緣、只在實景；↔ 根井北門)、
//   地上的梯口 (拱門形活板門：疊在下層哪一間由兩層的角度決定；S0 下面是夯土)
// 分區：後景兩排一模一樣的書架夾著走道、盡頭被樹根纏住的年輪根盤 ｜ 中景地板梯口與一盞吊在根上的油燈 ｜ 前景南門旁往上的石階與木箱堆 (裝飾)
// 謎題逐關加入 (4-1a～4-1c，見規格「第四章題目配置」)；本步只有門、梯口、年輪根盤
// 文字 = content/text/zh-Hant/lvl-4-1.ts、lvl-ch4.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const objects: ObjDef[] = [
  floor(-12, 12),
  door('N', 'door', -9.0, { frameText: 'lvl.ch4.hall.doorN.frame' }),
  door('S', 'door', 6.0),
  hatch('D', 'arch', -2.0, 1.6),
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
  nextKey: 'lvl.4-1.next',
  theme: 'cellar',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第四章基礎預算)
  turnBudget: { base: 8 },
  decor,
  objects
};
