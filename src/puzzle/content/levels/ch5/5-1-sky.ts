import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { CH5_ALIGN } from '../../cubes/ch5';
import { door, floor, hatch, sealedBy } from './parts';

// 5-1 天窗間 (第五章魔方的頂面心 [1,1,2]；房間 id 'sky'，關卡 id '5-1'；規格 6「5-1 天窗間（細化）」；第五章入口房)
//   x∈[-12, 12]、z∈[-5, 5]；南門 (前緣、只在實景；↔ 梁上走道 A ↔ 樓梯口的梯子)、東門 (S0 門後是牆)、
//   地板梯口 (往核心 6-1 林心；sealed until 5-5c「地板下透著綠光，打不開。」)
// 分區：後景 屋頂上的天窗與斜落的塵光、星圖天花板、天窗下的觀星儀與它的刻度盤 ｜
//   中景 工作桌 (桌上的縮影與卡在它底層軌道上的齒輪；椅子面向觀星儀)、梁上掛的星表、地板梯口 ｜
//   前景 四張字條 (落地木柱；離工作桌與刻度盤遠一點，藏寶圖裡按 E 不會先讀到字條)、舊箱、望遠鏡腳架、南門
// 謎題：5-1a 桌上的魔方 (P10 首次：標籤「你」貼「小」→ 鑽進縮影 → 頂層原地轉 → 天窗的星圖對上刻度)、
//   5-1b 縮影裡的卡榫 (P3 / P10：原尺寸先把齒輪量「小」掉出軌道，再縮自己進縮影轉底層)
// 文字 = content/text/zh-Hant/lvl-5-1.ts、lvl-ch5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, z: 2.8, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.5-1.note', mount: 'post' } as const;

/** 工作桌的桌面高 */
const BENCH_H = 0.78;

const objects: ObjDef[] = [
  floor(-12, 12),
  door('S', 'door', -8.0),
  door('E', 'door', 11.8),
  // v0.4 5-5a 洞位 (平常不在場；機關的門牌讀作「間」、走道那一頭正對這一面時才接上)
  door('N', 'door', 7.6, { id: 'holeN', hole: true, labelKey: 'lvl.ch2.hole' }),
  door('W', 'door', -11.8, { id: 'holeW', hole: true, labelKey: 'lvl.ch2.hole' }),
  hatch('D', 'door', 0, 1.6, { labelKey: 'lvl.5-1.hatchD', ...sealedBy('5-5c', 'lvl.5-1.floorSealed') }),
  // ── 後景：觀星儀 (控制盤；只開三條中間片) 與底座旁的刻度盤 (5-1a：星圖對上刻度) ──
  { id: 'dial', type: 'dial', chapter: 5, useText: 'lvl.5-1.dial.activated', readyText: 'lvl.5-1.dial.ready',
    x: -3.0, y: 0, z: -3.6, w: 1.6, h: 1.6, d: 1.2, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-1.dial' },
  { id: 'starScale', type: 'starScale', align: CH5_ALIGN, doneFlag: '5-1a',
    awayText: 'lvl.5-1.scale.away', offText: 'lvl.5-1.scale.off', nearText: 'lvl.5-1.scale.near', doneText: 'lvl.5-1.scale.done', alignedText: 'lvl.5-1.aligned',
    x: -0.9, y: 0, z: -3.5, w: 0.9, h: 1.1, d: 0.5, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.5-1.scale' },
  // ── 中景：工作桌、桌上的縮影 (可以站上去；側面的小門只有縮小才鑽得進)、卡在縮影底層的齒輪 ──
  { id: 'bench', type: 'workbench', x: 4.0, y: 0, z: -1.2, w: 2.6, h: BENCH_H, d: 1.0, visible: 'both', solid: true },
  { id: 'mini', type: 'miniCube', doneFlag: '5-1b', lookText: 'lvl.5-1.mini.look', enterText: 'lvl.5-1.mini.enter', exitText: 'lvl.5-1.mini.exit', exit: [3.4, -0.2],
    x: 3.4, y: BENCH_H, z: -1.2, w: 0.9, h: 0.9, d: 0.9, visible: 'both', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.5-1.mini',
    label: { id: 'mini', kind: 'noun', textKey: 'lvl.5-1.mini.tag', scale: true, refuse: 'lvl.5-1.mini.refuse' } },
  { id: 'gear', type: 'miniGear', doneFlag: 'gear', jamText: 'lvl.5-1.gear.jam', freedText: 'lvl.5-1.gear.free', doneText: 'lvl.5-1.gear.done', stayShrunk: true, pushTo: [4.9, -0.95],
    x: 4.12, y: BENCH_H, z: -1.2, w: 0.56, h: 0.56, d: 0.14, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-1.gear',
    label: { id: 'gear', kind: 'noun', textKey: 'lvl.5-1.gear.tag', scale: true, answers: ['card.xiao'], noCardText: 'lvl.5-1.gear.noCard', tagLift: 0.5 } },
  // 你自己的標籤「你」(只在藏寶圖；跟著你走；只收「小」)
  { id: 'self', type: 'selfTag', x: -8.0, y: 0, z: 0, w: 0.2, h: 0.2, d: 0.1, visible: '2d', solid: false,
    label: { id: 'self', kind: 'noun', textKey: 'lvl.5-1.self', scale: true, answers: ['card.xiao'], noCardText: 'lvl.5-1.self.noCard', self: true } },
  // ── 前景：字條 (父親的筆記；story-bible 7.3)：西兩張 = 5-1a、東兩張 = 5-1b ──
  { ...noteBase, id: 'noteA', x: -9.6, textKey: 'lvl.5-1.note.a' },
  { ...noteBase, id: 'noteA2', x: -6.4, textKey: 'lvl.5-1.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteB', x: 8.0, textKey: 'lvl.5-1.note.b' },
  { ...noteBase, id: 'noteB2', x: 11.0, textKey: 'lvl.5-1.note.b2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 後景：斜屋頂與樑柱、屋頂上的天窗 (星圖)、斜落的塵光 (照在觀星儀上)、星圖天花板、成組的立柱
  { kind: 'atticRoof', seed: 511 },
  { kind: 'skyWindow', x: -3.0, z: -3.6, w: 3.0 },
  { kind: 'starCeiling', x: 0, w: 22, seed: 513 },
  { kind: 'posts', xs: '-6.4,0.8', z: -4.6 },
  // 中景：椅子 (面向觀星儀)、梁上掛的羊皮紙星表
  { kind: 'stool', x: 5.9, z: -0.3, rot: Math.PI / 2 },
  { kind: 'starChart', x: 8.4, z: -3.0, n: 3, seed: 515 },
  // 中景西側：帆布蓋著的箱堆 (靠西牆)；前景：舊箱 (西南角)、望遠鏡腳架 (東，兩張字條之間)
  { kind: 'canvasPile', x: -10.8, z: -1.4, seed: 519 },
  { kind: 'trunks', x: -11.2, z: 4.0, n: 2, seed: 517 },
  { kind: 'telescope', x: 9.5, z: 4.2, rot: -0.6 }
];

export const sky: LevelDef = {
  id: '5-1',
  titleKey: 'lvl.5-1.title',
  shortKey: 'lvl.ch5.sky.short',
  bounds: { minX: -12, maxX: 12, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -8.0, y: 0, z: 3.4 },
  narrationKey: 'lvl.5-1.narration',
  puzzles: [
    { id: '5-1a', titleKey: 'lvl.5-1.puzzle.a' },
    { id: '5-1b', titleKey: 'lvl.5-1.puzzle.b' }
  ],
  nextKey: 'lvl.5-1.next',
  theme: 'attic',
  // 每次穿門進房補滿 10 滴墨 (規格 5.4.9 第五章基礎預算)
  turnBudget: { base: 10 },
  decor,
  objects
};
