import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { floorPiece, HOUSE_DRAWING } from './drawing';

// 2-5 書房深處 (第二章魔方的下列第 2 行；房間 id 'deep'，關卡 id '2-5'；規格 6「2-5 書房深處（細化）」)
//   x∈[-6, 6]、z∈[-5, 5]；西門 (S0 接手稿庫東門)、東章門 (平台上，y = 2.0；只接 [2,1] 東側屋框：往溫室的走廊)、北牆洞位 (上方印房的「間」)
// 分區 (後 / 中 / 前)：後景鑰匙台、北牆洞位、線索③ (2-4b) ｜ 中景章門平台 (手記架、章門) ｜ 前景書堆與兩張字條
// 2-5 刻著同一個圖案 (P2 / P7)：章門平台高 2.0 (兩個視角都跳不上)；墊腳 = 印房的鉛字盤 (高 1.0)，從印房南拱門 (門牌「間」) 推過北牆的洞；
//   書房深處不在第 2 行時，鉛字盤跟著房間一起轉回來；鑰匙台把柄 + 三枚齒組成房間的銅鑰匙；章門打開 = 第二章通關
// 文字 = content/text/zh-Hant/lvl-2-5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const LANDING_H = 2.0;
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.2-5.note' } as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', glyph: 'term.glyph.shan', x: -5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorW' },
  // 北牆的洞位 (上方那一格的門牌讀作「間」時才開；鉛字盤從這裡推進來)
  { id: 'holeN', type: 'cubeDoor', side: 'N', kind: 'arch', hole: true, x: 0, y: 0, z: -4.8, w: 1.6, h: 2.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.hole' },
  // ── 後景：鑰匙台 (組裝；固定動作)、2-4b 的線索③ ──
  { id: 'keyBench', type: 'keyBench', parts: ['key.bow', 'tooth.shelf', 'tooth.reading', 'tooth.manuscripts'], out: 'key.study',
    okText: 'lvl.2-5.bench.ok', missingText: 'lvl.2-5.bench.missing', doneText: 'lvl.2-5.bench.done',
    x: -2.6, y: 0, z: -4.2, w: 1.4, h: 0.9, d: 0.7, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-5.bench' },
  { id: 'clueWax', type: 'remark', textKey: 'lvl.2-4.clue.wax', ink: true, x: -3, y: 1.6, z: -4.4, w: 1.6, h: 0.5, d: 0.04, visible: '2d', solid: false, interactable: true, labelKey: 'lvl.2-4.clue' },
  // ── 中景：章門平台 (實體)；平台上的手記架與章門 ──
  { id: 'landing', type: 'landing', x: 4.7, y: 0, z: 0, w: 2.6, h: LANDING_H, d: 3.2, visible: 'both', solid: true, labelKey: 'lvl.2-5.landing' },
  { id: 'diary', type: 'diaryStand', gives: 'diary.2', useText: 'lvl.2-5.diary.take', emptyText: 'lvl.2-5.diary.empty', doneFlag: '2-5.diary',
    x: 4.4, y: LANDING_H, z: -1.1, w: 0.5, h: 0.5, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-5.diary' },
  { id: 'chapterE', type: 'cubeDoor', side: 'E', kind: 'chapter', key: 'key.study', openText: 'lvl.ch2.chapterE.open', carving: HOUSE_DRAWING, doneFlag: '2-5',
    x: 5.8, y: LANDING_H, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.chapterE' },
  // ── 前景：書堆上的字條 (L1 / L2) ──
  { ...noteBase, id: 'noteA', mount: 'pile', x: -3.4, z: 3.4, textKey: 'lvl.2-5.note.a' },
  { ...noteBase, id: 'noteA2', mount: 'pile', x: 0.4, z: 3.4, textKey: 'lvl.2-5.note.a2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'bookcase', x: -0.2, w: 2.0, seed: 51 },
  { kind: 'bookcase', x: 3.6, w: 1.8, seed: 54 },
  { kind: 'roots', x: -5.9, side: 'W', seed: 11 },
  { kind: 'rug', x: -1.2, z: 1.6, w: 4.4, d: 2.6 },
  floorPiece('deep', -1.4, 0.6, 2.2),
  { kind: 'floatBooks', x: 0, y: 3.8, z: -2.4, w: 6, seed: 17 },
  { kind: 'pendant', x: -1.2, z: 0.6 },
  { kind: 'pendant', x: 4.7, z: 0 }
];

export const deep: LevelDef = {
  id: '2-5',
  titleKey: 'lvl.2-5.title',
  bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -3, y: 0, z: 1.5 },
  narrationKey: 'lvl.2-5.narration',
  puzzles: [{ id: '2-5', titleKey: 'lvl.2-5.puzzle' }],
  nextKey: 'lvl.2-5.next',
  theme: 'study',
  turnBudget: { base: 6 },
  decor,
  objects
};
