import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch, plaque, sealedBy } from './parts';

// 5-1 天窗間 (第五章魔方的頂面心 [1,1,2]；房間 id 'sky'，關卡 id '5-1'；規格 6「第五章骨架與銜接（v0.4 細化）」；第五章入口房)
//   x∈[-12, 12]、z∈[-5, 5]；南門 (前緣、只在實景；↔ 梁上走道 A ↔ 樓梯口的梯子)、東門 (S0 門後是牆)、
//   地板梯口 (往核心 6-1 林心；sealed until 5-5c「地板下透著綠光，打不開。」)
// 分區：後景 屋頂上的天窗與斜落的塵光、星圖天花板、天窗下的觀星儀 ｜ 中景 工作桌與椅 (面向觀星儀；縮影的位置，5-1a 放上) ｜
//   前景 舊箱與望遠鏡腳架、南門
// 謎題 (5-1a 桌上的魔方、5-1b 縮影裡的卡榫) 逐關加入；本步只有觀星儀 (只開三條中間片)
// 文字 = content/text/zh-Hant/lvl-5-1.ts、lvl-ch5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5

const objects: ObjDef[] = [
  floor(-12, 12),
  door('S', 'door', -8.0),
  door('E', 'door', 11.8),
  hatch('D', 'door', 0, 1.6, { labelKey: 'lvl.5-1.hatchD', ...sealedBy('5-5c', 'lvl.5-1.floorSealed') }),
  // 工作桌 (中景；縮影 5-1a 放在桌上)：先只是一張空桌
  plaque('bench', 'lvl.5-1.bench.text', 4.0, 0.78, -1.2, 'both', 'lvl.5-1.bench'),
  // 觀星儀 (控制盤；只開三條中間片，外圈的星環被銀釘釘住)
  { id: 'dial', type: 'dial', chapter: 5, useText: 'lvl.5-1.dial.activated', readyText: 'lvl.5-1.dial.ready',
    x: -3.0, y: 0, z: -3.6, w: 1.6, h: 1.6, d: 1.2, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-1.dial' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 後景：斜屋頂與樑柱、屋頂上的天窗 (星圖)、斜落的塵光 (照在觀星儀上)、星圖天花板
  { kind: 'atticRoof', seed: 511 },
  { kind: 'skyWindow', x: -3.0, z: -3.6, w: 3.0 },
  { kind: 'starCeiling', x: 0, w: 22, seed: 513 },
  // 中景：工作桌與椅 (面向觀星儀)、梁上掛的羊皮紙星表
  { kind: 'longTable', x: 4.0, z: -1.2, w: 2.6, rot: 0 },
  { kind: 'stool', x: 5.8, z: -0.4, rot: Math.PI / 2 },
  { kind: 'starChart', x: 6.6, z: -3.0, n: 3, seed: 515 },
  // 前景：舊箱 (皮面木箱、帆布蓋著的箱堆) 與望遠鏡腳架
  { kind: 'trunks', x: -10.2, z: 3.0, n: 3, seed: 517 },
  { kind: 'telescope', x: 8.6, z: 3.0, rot: -0.6 }
];

export const sky: LevelDef = {
  id: '5-1',
  titleKey: 'lvl.5-1.title',
  shortKey: 'lvl.ch5.sky.short',
  bounds: { minX: -12, maxX: 12, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -8.0, y: 0, z: 3.4 },
  narrationKey: 'lvl.5-1.narration',
  nextKey: 'lvl.ch5.placeholder.next',
  theme: 'attic',
  // 每次穿門進房補滿 10 滴墨 (規格 5.4.9 第五章基礎預算)
  turnBudget: { base: 10 },
  decor,
  objects
};
