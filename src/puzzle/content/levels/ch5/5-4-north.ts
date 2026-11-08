import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { atticWindow, door, floor, hatch, plaque } from './parts';

// 5-4 北窗 (第五章魔方的北面心 [1,0,1]；房間 id 'north'，關卡 id '5-4'；規格 6「5-4 北窗（細化）」；你的窗)
//   x∈[-10, 10]、z∈[-5, 5]；北牆中央 = 北窗 (後牆，不是門)、東門 (x 9.8)、地板梯口 (-3, 1.6)
// 分區 (空的房間：只有你帶來的背包、一面窗、兩側立柱)：後景 北窗與窗前的紙籤、窗兩側的立柱、窗台角上的天窗銘文 (北)、
//   窗框左側後牆上的劇情字條 ｜ 中景 吊秤 (梁下垂下的黃銅秤桿：西端的盤上是你的背包、東端的秤繩穿過地板的小洞)、地板梯口 ｜
//   前景 兩張字條 (落地木柱)、東門
// 謎題：5-4 吊秤 (P17 / P1)：秤繩從北窗的地板 (本地 D) 垂下去，吊著那格稜另一頭的面心房 (core/cube acrossEdge)；秤的是那間房裡的重物
//   (西窗爸爸的舊皮箱 3、東窗許問津的書箱 4、天窗間 / 機關 0)；背包 小 1 / 原 2 / 大 3 → 唯一的平 = 西窗吊在下面 + 背包「大」
// 文字 = content/text/zh-Hant/lvl-5-4.ts、lvl-ch5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.5-4.note', mount: 'post' } as const;

/** 吊秤：支點 x、盤 (背包) 的 x、秤繩的 x、z；盤頂高 */
export const SCALE = { x: 3.0, pan: 2.0, rope: 4.2, z: -1.0, panY: 0.8 } as const;

const objects: ObjDef[] = [
  floor(-10, 10),
  door('E', 'door', 9.8),
  hatch('D', 'door', -3.0, 1.6),
  // v0.4 5-5a 洞位 (平常不在場；機關的門牌讀作「間」、走道那一頭正對這一面時才接上)
  door('W', 'door', -9.8, { id: 'holeW', hole: true, labelKey: 'lvl.ch2.hole' }),
  // ── 後景：北窗 (窗前的紙籤照舊)、窗台角上的天窗銘文 (北；許問津；只在實景；5-5c 引用)、窗框旁的劇情字條 ──
  plaque('window', 'lvl.ch5.north.window', 0, 1.2, -4.85, 'both', 'lvl.ch5.north.windowLabel'),
  plaque('inscriptionN', 'lvl.5-4.inscription', 1.6, 0.9, -4.6, '3d', 'lvl.5-4.inscription.label'),
  { ...noteBase, id: 'noteStory', x: -2.6, y: 1.3, z: -4.4, mount: undefined, textKey: 'lvl.5-4.note.story' },
  // ── 中景：吊秤 (秤繩從地板垂下去；3D 按 E = 此刻吊著哪一間、哪一頭重) 與盤上的背包 (名詞標籤帶方槽) ──
  { id: 'scale', type: 'hangScale', hook: 'D', pans: ['bag'], want: 'level', doneFlag: '5-4',
    mineText: 'lvl.5-4.scale.mine', otherText: 'lvl.5-4.scale.other', nearText: 'lvl.5-4.scale.near', sameText: 'lvl.5-4.scale.same',
    solvedText: 'lvl.5-4.scale.solved', doneText: 'lvl.5-4.scale.done',
    x: SCALE.x + 0.6, y: 0, z: SCALE.z, w: 1.6, h: 2.6, d: 0.8, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-4.scale' },
  { id: 'bag', type: 'backpack', fixedText: 'lvl.5-4.bag.fixed',
    x: SCALE.pan, y: SCALE.panY, z: SCALE.z, w: 0.5, h: 0.6, d: 0.34, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-4.bag',
    label: { id: 'scale:bag', kind: 'noun', textKey: 'lvl.5-4.bag.tag', scale: true } },
  // ── 前景：字條 (父親的筆記；story-bible 7.3) ──
  { ...noteBase, id: 'noteA', x: -7.4, z: 3.0, textKey: 'lvl.5-4.note.a' },
  { ...noteBase, id: 'noteA2', x: 6.6, z: 2.6, textKey: 'lvl.5-4.note.a2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'atticRoof', seed: 0 },
  // 後景：北窗與兩側的立柱 (骨架照舊；舊箱與帆布箱堆退役：這間房是空的)
  atticWindow('N', 0, 2.6, 1.8, 2.3),
  { kind: 'posts', xs: '-2.0,2.0', z: -4.5 }
];

export const northRoom: LevelDef = {
  id: '5-4',
  titleKey: 'lvl.5-4.title',
  shortKey: 'lvl.ch5.north.short',
  bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.ch5.north.narration',
  puzzles: [{ id: '5-4', titleKey: 'lvl.5-4.puzzle' }],
  nextKey: 'lvl.5-4.next',
  theme: 'attic',
  // 每次穿門進房補滿 10 滴墨 (規格 5.4.9 第五章基礎預算)
  turnBudget: { base: 10 },
  decor,
  objects
};
