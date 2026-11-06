import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch, inkSealed, plaque } from './parts';

// 4-2 墨爐間 (第四章魔方的下層中心 [1,1,0]；房間 id 'furnace'，關卡 id '4-2'；規格 6「4-2 墨爐間（細化）」)
//   x∈[-14, 14]、z∈[-5, 5]；天花板梯口的根梯 (↔ 根井，中心疊中心)、西門 (↔ 封存書庫；墨線鎖)、東門 (↔ 抽屜；墨線鎖)
// 分區：後景 鑄鐵墨爐與爐前的墨爐閥、沿牆的銅管、根梯、牆上的舊圖 (只在藏寶圖，月光照進來之後才在場) 與爐邊小櫃 ｜
//   中景 西門 / 東門與門邊的墨線鎖、西牆的玻璃眼 (月光鏡)、墨槽與鐵架 ｜ 前景 六張字條、木凳、積水、紙籤
// 謎題：4-2a 墨流 (P15 首次：開閥、走廊疊在書庫上 → 西門的墨線鎖)、4-2b 地板縫裡的光 (P6 / P1：走廊與書庫都在南邊 → 玻璃眼)、
//   4-2c 記號跑到哪 (P14 / P1：塗開舊圖、抽屜轉到西邊 → 爐邊小櫃)
// 文字 = content/text/zh-Hant/lvl-4-2.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, z: 2.8, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.4-2.note', mount: 'post' } as const;

const objects: ObjDef[] = [
  floor(-14, 14),
  hatch('U', 'door', 0, -4.4, { id: 'ladderU', labelKey: 'lvl.ch4.ladderU' }),
  door('W', 'door', -13.8, inkSealed('4-2a')),
  door('E', 'door', 13.8, inkSealed('ink.E')),
  // ── 後景：墨爐閥 (墨爐 = 墨流的源頭)、舊圖 (4-2c) 與爐邊小櫃 ──
  { id: 'inkValve', type: 'inkValve', doneFlag: 'ink.valve', useText: 'lvl.4-2.valve.open', usedText: 'lvl.4-2.valve.used',
    x: -3.4, y: 0, z: -3.0, w: 0.6, h: 1.1, d: 0.5, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-2.valve' },
  { id: 'veil', type: 'inkveil', after: 'eye', revealText: 'lvl.4-2.veil.reveal', sketch: 'lvl.4-2.veil.sketch',
    x: 7.2, y: 1.4, z: -4.9, w: 2.0, h: 1.6, d: 0.05, visible: '2d', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.4-2.veil' },
  { id: 'markCase', type: 'markCase', veil: 'veil', room: 'drawer', at: [0, 1], wrongAt: [1, 2], doneFlag: '4-2c',
    solvedText: 'lvl.4-2.case.solved', wrongText: 'lvl.4-2.case.wrong', closedText: 'lvl.4-2.case.closed', openText: 'lvl.4-2.case.open',
    x: 8.6, y: 0, z: -4.2, w: 0.9, h: 1.1, d: 0.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-2.case' },
  // ── 中景：兩扇門邊的墨線鎖、西牆的玻璃眼 ──
  { id: 'lockW', type: 'inkLock', side: 'W', doneFlag: '4-2a', solvedText: 'lvl.4-2.lockW.solved', dryText: 'lvl.4-2.lock.dry', openText: 'lvl.4-2.lock.open',
    x: -13.5, y: 0.9, z: 1.3, w: 0.3, h: 0.7, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-2.lock' },
  { id: 'lockE', type: 'inkLock', side: 'E', doneFlag: 'ink.E', solvedText: 'lvl.4-2.lockE.solved', dryText: 'lvl.4-2.lock.dry', openText: 'lvl.4-2.lock.open',
    x: 13.5, y: 0.9, z: 1.3, w: 0.3, h: 0.7, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-2.lock' },
  { id: 'eye', type: 'sensor', from: 'W', via: 2, mount: 'wall', beam: [-13.95, 2.4, -2.4], doneFlag: '4-2b',
    closedText: 'lvl.4-2.eye.closed', whiteText: 'lvl.4-2.eye.weak', weakText: 'lvl.4-2.eye.weak', solvedText: 'lvl.4-2.eye.solved', openText: 'lvl.4-2.eye.open',
    x: -13.9, y: 1.4, z: -2.4, w: 0.2, h: 1.4, d: 1.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-2.eye' },
  // ── 根管線 (外觀)：爐頂往天花板、西門 / 東門的匯點 ──
  { id: 'pipeUp', type: 'inkPipe', when: 'through', path: '-5,2.7,-3.8 -5,5.6,-3.8', x: -5, y: 2.7, z: -3.8, w: 0.3, h: 2.9, d: 0.3, visible: '3d', solid: false },
  { id: 'pipeW', type: 'inkPipe', when: 'W', path: '-13.7,5.6,-4.6 -13.7,3.2,-1.2 -13.6,1.6,1.3', x: -13.7, y: 1.6, z: -1.6, w: 0.3, h: 4, d: 0.3, visible: '3d', solid: false },
  { id: 'pipeE', type: 'inkPipe', when: 'E', path: '13.7,5.6,-4.6 13.7,3.2,-1.2 13.6,1.6,1.3', x: 13.7, y: 1.6, z: -1.6, w: 0.3, h: 4, d: 0.3, visible: '3d', solid: false },
  // ── 前景：紙籤、字條 (父親的筆記；story-bible 7.3)：六根落地木柱 ──
  plaque('plaqueFurnace', 'lvl.ch4.furnace.plaque', 2.0, 0.8, 3.0),
  { ...noteBase, id: 'noteA', x: -12.5, textKey: 'lvl.4-2.note.a' },
  { ...noteBase, id: 'noteA2', x: -9.0, textKey: 'lvl.4-2.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteB', x: -5.5, textKey: 'lvl.4-2.note.b' },
  { ...noteBase, id: 'noteB2', x: 5.5, textKey: 'lvl.4-2.note.b2', revealAfter: 240 },
  { ...noteBase, id: 'noteC', x: 9.0, textKey: 'lvl.4-2.note.c' },
  { ...noteBase, id: 'noteC2', x: 12.5, textKey: 'lvl.4-2.note.c2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls', stone: 1 },
  { kind: 'inkFurnace', x: -5.0, z: -3.6 },
  { kind: 'wallPipes', x: 0, w: 27, y: 2.6, seed: 211 },
  { kind: 'rootCeiling', x: 0, w: 26, seed: 213 },
  { kind: 'inkTrough', x: 4.6, z: -0.6, w: 3.2, rot: 0 },
  { kind: 'ironRack', x: 10.8, z: -3.4, w: 2.0 },
  { kind: 'ironRack', x: -10.4, z: -3.4, w: 2.4 },
  { kind: 'puddle', x: 7.2, z: 2.0, w: 2.0, d: 1.1 },
  { kind: 'stool', x: -7.2, z: 1.8, rot: 0.4 },
  { kind: 'lantern', x: 3.0, y: 3.6, z: 0.4 },
  { kind: 'lantern', x: -9.0, y: 3.6, z: 0.8 }
];

export const furnace: LevelDef = {
  id: '4-2',
  titleKey: 'lvl.4-2.title',
  shortKey: 'lvl.ch4.furnace.short',
  bounds: { minX: -14, maxX: 14, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: -3.3 },
  narrationKey: 'lvl.4-2.narration',
  puzzles: [
    { id: '4-2a', titleKey: 'lvl.4-2.puzzle.a' },
    { id: '4-2b', titleKey: 'lvl.4-2.puzzle.b' },
    { id: '4-2c', titleKey: 'lvl.4-2.puzzle.c' }
  ],
  nextKey: 'lvl.4-2.next',
  theme: 'cellar',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第四章基礎預算)
  turnBudget: { base: 8 },
  decor,
  objects
};
