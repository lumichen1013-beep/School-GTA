import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch, inkSealed, plaque } from './parts';

// 4-4 最後的抽屜 (第四章魔方的下層東邊 [2,1,0]；房間 id 'drawer'，關卡 id '4-4'；規格 6「4-4 最後的抽屜（細化）」；章末)
//   x∈[-14, 14]、z∈[-5, 5]；西門 (↔ 墨爐間東門；墨線鎖 ink.E)、天花板梯口 (寬梯：4-1c 的木箱落得進來；追逐 2 的殘影從這裡下來)、
//   東章門 (要房間的銅鑰匙 key.cellar；抽屜在下層北邊 [1,0,0] 才接上閣樓的木梯)
// 分區：後景 一排檔案櫃中間的最後一個抽屜與它上面的墨閘、天花板梯口與根結踏板 ｜ 中景 爸爸的書桌 (桌上的筆記)、西門 / 東章門 ｜
//   前景 四張字條、章門前往上的木梯腳、積水、紙籤
// 謎題：4-4a 殘影走的那扇門 (P8 首次：拿筆記 → 殘影沿梯子下來 → 轉開梯口)、4-4b 最後一個抽屜 (P4 / P15：墨閘、鑰匙與手記第四頁、轉到章門)；
//   章門 = 第四章通關
// 文字 = content/text/zh-Hant/lvl-4-4.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, z: 2.8, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.4-4.note', mount: 'post' } as const;

const objects: ObjDef[] = [
  floor(-14, 14),
  door('W', 'door', -13.8, inkSealed('ink.E')),
  hatch('U', 'arch', -6.0, -4.4),
  // 樹根管線 (外觀)：天花板 → 墨閘 → 西門 (墨流回墨爐的東門)
  { id: 'pipeDrawer', type: 'inkPipe', when: 'through', path: '-5.0,5.6,-4.7 -9.6,4.4,-4.7 -13.6,1.8,-1.2', x: -9.3, y: 1.8, z: -3.0, w: 0.3, h: 3.8, d: 0.3, visible: '3d', solid: false },
  // 4-1c：天花板梯口正下方的根結踏板 (木箱從走廊落下來就壓在上面)
  { id: 'rootPlate', type: 'rootPlate', doneFlag: '4-1c', solvedText: 'lvl.4-1.plate.solved', x: -6.0, y: 0, z: -2.4, w: 2.4, h: 0.08, d: 1.4, visible: 'both', solid: false, labelKey: 'lvl.4-1.plate' },
  // ── 後景：最後一個抽屜與墨閘 (4-4b) ──
  { id: 'gate', type: 'inkLock', side: 'through', after: 'ladderCut', doneFlag: 'gate', solvedText: 'lvl.4-4.gate.solved', dryText: 'lvl.4-4.gate.dry', openText: 'lvl.4-4.gate.open',
    x: 3.4, y: 1.6, z: -3.85, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-4.gate' },
  { id: 'lastDrawer', type: 'lastDrawer', gate: 'gate', item: 'key.cellar', also: ['diary.4'], doneFlag: '4-4b',
    useText: 'lvl.4-4.drawer.take', dryText: 'lvl.4-4.drawer.dry', usedText: 'lvl.4-4.drawer.used',
    x: 2.4, y: 0.6, z: -3.85, w: 0.6, h: 0.35, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-4.drawer' },
  // ── 中景：爸爸書桌上的筆記 (4-4a 的觸發)、殘影 (推導物件)、4-4a 的旗標物件 ──
  { id: 'notesDesk', type: 'notesDesk', needLink: 'hatchU', item: 'notes.father', useText: 'lvl.4-4.notes.take', tiedText: 'lvl.4-4.notes.tied', usedText: 'lvl.4-4.notes.used',
    x: 1.6, y: 0.8, z: -1.2, w: 0.6, h: 0.1, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-4.notes' },
  { id: 'hatchChaser', type: 'hatchChaser', derived: true, trigger: 'notesDesk', hatch: 'hatchU', cut: 'ladderCut', omenSec: 3, descendSec: 4, speed: 2.4,
    assistAfter: 3, assistFactor: 0.8, checkpoint: { x: 2.4, z: -0.2 }, omenText: 'lvl.4-4.chase.omen', caughtText: 'lvl.4-4.chase.caught', cutText: 'lvl.4-4.chase.cut', flag: 'chase:4-4',
    x: -6.0, y: 0, z: -3.6, w: 0.6, h: 1.7, d: 0.6, visible: '2d', solid: false },
  { id: 'ladderCut', type: 'chaseMark', doneFlag: '4-4a', x: -6.0, y: 2.9, z: -4.6, w: 0.2, h: 0.1, d: 0.2, visible: '3d', solid: false },
  door('E', 'chapter', 13.8, { key: 'key.cellar', doneFlag: '4-4', openText: 'lvl.4-4.chapter.open' }),
  // ── 前景：紙籤、字條 (父親的筆記；story-bible 7.3) ──
  plaque('plaqueDrawer', 'lvl.ch4.drawer.plaque', 0.6, 0.8, 3.0),
  { ...noteBase, id: 'noteA', x: -12.0, textKey: 'lvl.4-4.note.a' },
  { ...noteBase, id: 'noteA2', x: -8.5, textKey: 'lvl.4-4.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteB', x: 4.0, textKey: 'lvl.4-4.note.b' },
  { ...noteBase, id: 'noteB2', x: 8.5, textKey: 'lvl.4-4.note.b2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls', stone: 1 },
  { kind: 'cabinets', x: 2.4, z: -4.2, n: 5, rot: 0, seed: 231 },
  { kind: 'rootCeiling', x: 0, w: 26, seed: 233 },
  { kind: 'desk', x: 1.6, z: -1.2, rot: Math.PI },
  { kind: 'stool', x: 1.6, z: 0.2, rot: 0 },
  { kind: 'atticStair', x: 12.4, z: 3.2 },
  { kind: 'puddle', x: -3.4, z: 1.6, w: 2.2, d: 1.2 },
  { kind: 'lantern', x: 1.6, y: 3.4, z: -1.2 },
  { kind: 'lantern', x: -9.0, y: 3.6, z: 0.6 }
];

export const drawer: LevelDef = {
  id: '4-4',
  titleKey: 'lvl.4-4.title',
  shortKey: 'lvl.ch4.drawer.short',
  bounds: { minX: -14, maxX: 14, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.4-4.narration',
  puzzles: [
    { id: '4-4a', titleKey: 'lvl.4-4.puzzle.a' },
    { id: '4-4b', titleKey: 'lvl.4-4.puzzle.b' },
    { id: '4-4', titleKey: 'lvl.4-4.puzzle.door' }
  ],
  nextKey: 'lvl.4-4.next',
  theme: 'cellar',
  // 每次穿門進房補滿 8 滴墨；4-4b 完成前 4 (P4：整段 轉開梯口 → 疊回開墨閘 → 轉到章門 最短 3 + 1)
  turnBudget: { base: 8, puzzles: { '4-4b': 4 } },
  decor,
  objects
};
