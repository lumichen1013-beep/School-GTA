import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { floorPiece, HOUSE_DRAWING, HOUSE_TARGET } from './drawing';

// 2-4 手稿庫 (第二章魔方的下列第 1 行；房間 id 'manuscripts'，關卡 id '2-4'；規格 6「2-4 手稿庫（細化）」)
//   x∈[-6, 10]、z∈[-5, 5] (往東加長；北門 x=1.5、東門 x=9.8)；S0：北門 ↔ 閱覽室南門、東門 ↔ 書房深處西門
// 分區 (後 / 中 / 前)：後景歸檔區 (排字架 (2-3c)、手稿櫃 (2-4a)) ｜ 中景整理區 (手稿架與四捆手稿 (2-4b)) ｜ 前景閱讀角 (閉櫃 (2-4c)、扶手椅、落地燈)
// 謎題：
//   2-4a 手稿拼圖 (P5 首次)：六間房地板各畫老宅立面圖的一角 → 排成手稿櫃門上的圖 (ext.cube.layout) → 銅鑰匙的齒・三
//   2-4b 三份手稿 (P12 / P1，擴充)：閉櫃裡「紅繩」∩ 印房鉛筆字「厚」= B；書房深處劃掉的「封蠟」是誤推 → 爸爸的手稿
//   2-4c 拆掉一半 (P18，擴充)：閉櫃門牌「閉」拆掉部件「才」→「門」→ 櫃門開 (部件卡「才」、2-4b 的線索①)
// 文字 = content/text/zh-Hant/lvl-2-4.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.2-4.note' } as const;
const bundle = (id: string, x: number, thick: boolean, tie?: 'red' | 'wax'): ObjDef => ({
  id, type: 'bundle', lock: 'bundleLock', ...(tie ? { tie } : {}), x, y: 0.8, z: 0, w: 0.6, h: 0.3, d: thick ? 0.6 : 0.25,
  visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-4.bundle'
});

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 2, y: -1, z: 0, w: 16, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorN', type: 'cubeDoor', side: 'N', kind: 'door', glyph: 'term.glyph.mu', x: 1.5, y: 0, z: -4.8, w: 1.6, h: 2.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorN' },
  { id: 'doorE', type: 'cubeDoor', side: 'E', kind: 'door', glyph: 'term.glyph.shui', x: 9.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorE' },
  // ── 後景：歸檔區 (西：2-3c 的排字架；東：2-4a 的手稿櫃) ──
  { id: 'typeLock', type: 'typeLock', glyphs: ['term.glyph.shan', 'term.glyph.shui', 'term.glyph.mu', 'term.glyph.huo'], from: 'print', to: 'manuscripts', hops: 3,
    need: 'proof', needText: 'lvl.2-3.lock.need', reward: 'key.bow', openText: 'lvl.2-3.lock.open', doneText: 'lvl.2-3.lock.done', doneFlag: '2-3c',
    x: -3, y: 0, z: -3.9, w: 3.2, h: 0.9, d: 0.8, visible: 'both', solid: false, labelKey: 'lvl.2-3.lock' },
  ...[0, 1, 2].map((i): ObjDef => ({ id: `wheel${i}`, type: 'typeWheel', lock: 'typeLock', index: i, x: -4 + i, y: 0.9, z: -3.9, w: 0.4, h: 0.4, d: 0.4,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-3.wheel' })),
  { id: 'patternCab', type: 'patternCabinet', target: HOUSE_TARGET, drawing: HOUSE_DRAWING, reward: 'tooth.manuscripts', doneFlag: '2-4a',
    okText: 'lvl.2-4.cab.ok', notText: 'lvl.2-4.cab.not', readText: 'lvl.2-4.cab.read',
    x: 5.2, y: 0, z: -4.3, w: 2.4, h: 2.2, d: 0.8, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-4.cab' },
  // ── 中景：整理區 (手稿架橫在房間中央，兩頭留走道) ──
  { id: 'rack', type: 'bundleRack', x: 0.6, y: 0, z: 0, w: 4.6, h: 0.8, d: 0.9, visible: 'both', solid: false, labelKey: 'lvl.2-4.rack' },
  bundle('bundleA', -1, false, 'red'), bundle('bundleB', 0, true, 'red'), bundle('bundleC', 1, true), bundle('bundleD', 2, false, 'wax'),
  { id: 'bundleLock', type: 'bookLock', answer: 'bundleB', reward: 'ms.father', openText: 'lvl.2-4.bundle.open', wrongText: 'lvl.2-4.bundle.wrong', doneText: 'lvl.2-4.bundle.done', doneFlag: '2-4b',
    x: 0.6, y: 0.2, z: 0.46, w: 0.5, h: 0.3, d: 0.04, visible: 'both', solid: false, labelKey: 'lvl.2-4.bundleLock' },
  // ── 前景：閱讀角 (閉櫃；門牌只在藏寶圖) ──
  { id: 'stripCab', type: 'smallCabinet', lockedRead: 'lvl.2-4.strip.locked', openRead: 'lvl.2-4.strip.open',
    x: -3.6, y: 0, z: 3.4, w: 1.6, h: 1.2, d: 0.8, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-4.strip' },
  { id: 'cabPlate', type: 'doorPlate', opens: 'stripCab', doneFlag: '2-4c', x: -3.6, y: 1.5, z: 3.0, w: 0.8, h: 0.5, d: 0.05, visible: '2d', solid: false, labelKey: 'lvl.2-4.plate',
    label: { id: 'strip:manuscripts', kind: 'strip', textKey: 'term.glyph.bi', part: 'card.cai', stripped: 'term.glyph.men', solvedText: 'lvl.2-4.strip.solved' } },
  // ── 字條 (父親的筆記；story-bible 7.3) ──
  { ...noteBase, id: 'noteC', x: -0.4, z: 3.6, textKey: 'lvl.2-4.note.c' }, // 2-4c L1 (扶手椅旁)
  { ...noteBase, id: 'noteB', x: 3.6, z: -0.9, textKey: 'lvl.2-4.note.b' }, // 2-4b L1 (手稿架尾)
  { ...noteBase, id: 'noteA', x: 7.4, z: -4.4, textKey: 'lvl.2-4.note.a' }  // 2-4a L1 (手稿櫃旁)
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'bookcase', x: -0.8, w: 2.4, seed: 41 },
  { kind: 'bookcase', x: 8.6, w: 2.2, seed: 44 },
  { kind: 'roots', x: -5.9, side: 'W', seed: 10 },
  { kind: 'rug', x: -2.6, z: 2.6, w: 4.2, d: 2.6 },
  floorPiece('manuscripts', 6.4, 1.8),
  { kind: 'floatBooks', x: 2, y: 3.7, z: -2.2, w: 8, seed: 14 },
  { kind: 'pendant', x: 0.6, z: 0 },
  { kind: 'pendant', x: 5.2, z: -3 }
];

export const manuscripts: LevelDef = {
  id: '2-4',
  titleKey: 'lvl.2-4.title',
  bounds: { minX: -6, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 6, y: 0, z: 1.5 },
  narrationKey: 'lvl.2-4.narration',
  puzzles: [
    { id: '2-4a', titleKey: 'lvl.2-4.puzzle.a' },
    { id: '2-4b', titleKey: 'lvl.2-4.puzzle.b' },
    { id: '2-4c', titleKey: 'lvl.2-4.puzzle.c' }
  ],
  nextKey: 'lvl.2-4.next',
  theme: 'study',
  turnBudget: { base: 6 },
  decor,
  objects
};
