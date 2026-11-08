import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch, plaque, sealedBy } from './parts';

// 5-5 最後的機關 (第五章魔方的底面心 [1,1,0]；房間 id 'engine'，關卡 id '5-5'；規格 6「5-5 最後的機關（細化）」；Boss 三階段)
//   x∈[-14, 14]、z∈[-5, 5]；北門 (x -6) / 南門 (x 6，只在實景) 都 sealed until ch5.windows (兩面都封)、天花板梯口 (0, -4.4) sealed until 5-5c
// 分區：後景 齒輪牆與三道光槽 (東 / 北 / 西)、天花板梯口、北門與門牌、5-5a / 5-5b 的 L1 字條 ｜
//   中景 機關底盤 (被重畫的展開圖) 與底盤正中央的焦點、5-5c 的 L1 字條 ｜ 前景 工具箱 (一盒拆開的活字：部件卡「日」)、箱堆、南門與門牌、三張 L2 字條
// 謎題：5-5a 地板被重畫 (P4 / P7)：第一次進門 → 閣樓被重畫成 CH5_REDRAW；三扇窗都看得見星星、星光都照得進機關 (三道光槽同時亮)；墨 7；
//   北門門牌貼「日」=「間」(走道那一頭開出洞位) 才湊得出 ｜ 5-5b 殘影守門 (P8 / P6，追逐 3) ｜ 5-5c 收束 (P12 / P1)
// 文字 = content/text/zh-Hant/lvl-5-5.ts、lvl-ch5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.5-5.note', mount: 'post' } as const;
const wallNote = { ...noteBase, y: 1.3, z: -4.4, mount: undefined } as const;

/** 機關的兩扇門：三扇窗都完成才拔得掉星釘 (ch5.windows)；兩面都封 (從接到它的任何一扇門都走不進來) */
const NAILED = { sealed: { until: 'ch5.windows', text: 'lvl.ch5.engine.nailed', both: true } };

/** 門牌 (只在藏寶圖；標籤「門」，收部件卡「日」→「間」：走道那一頭沒有門也接得上，光從門縫透進來) */
const plate = (id: string, label: string, x: number, y: number, z: number): ObjDef => ({
  id, type: 'doorPlate', x, y, z, w: 0.8, h: 0.5, d: 0.05, visible: '2d', solid: false, labelKey: 'lvl.5-5.plate.name',
  label: { id: label, kind: 'plate', textKey: 'term.glyph.men', answers: ['card.ri'], forms: { 'card.ri': 'term.glyph.jian' }, solvedText: 'lvl.5-5.plate.solved', noCardText: 'lvl.5-5.plate.noCard' }
});

/** 三道光槽的位置 (齒輪牆上、避開天花板梯口的梯子)：光槽物件的中心 x 與三道槽的間距 */
export const SLOTS = { x: 3.2, gap: 1.0, z: -4.6 } as const;

const objects: ObjDef[] = [
  floor(-14, 14),
  door('N', 'door', -6.0, { ...NAILED, plate: 'plate:engineN' }),
  door('S', 'door', 6.0, { ...NAILED, plate: 'plate:engineS' }),
  hatch('U', 'door', 0, -4.4, sealedBy('5-5c', 'lvl.ch5.engine.ceilingSealed')),
  // ── 後景：齒輪牆上的三道光槽 (東 / 北 / 西：那扇窗的星光此刻照得進機關 = 亮；三道同時亮 = 5-5a)、北門的門牌、兩張 L1 字條 ──
  { id: 'slots', type: 'starSlots', doneFlag: '5-5a', order: ['east', 'north', 'west'],
    darkText: 'lvl.5-5.slots.dark', someText: 'lvl.5-5.slots.some', behindText: 'lvl.5-5.slots.behind', solvedText: 'lvl.5-5.slots.solved', doneText: 'lvl.5-5.slots.done',
    x: SLOTS.x, y: 0, z: SLOTS.z, w: 3.0, h: 3.0, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-5.slots' },
  plate('plateN', 'plate:engineN', -6.0, 1.6, -4.4),
  { ...wallNote, id: 'noteA', x: -12.4, textKey: 'lvl.5-5.note.a' },
  { ...wallNote, id: 'noteB', x: 12.4, textKey: 'lvl.5-5.note.b' },
  // ── 5-5b 殘影守門 (追逐 3)：許問津的守衛沿光路從東窗走過來 (推導物件，只在藏寶圖)；東窗斷開、另一扇窗的光接上 = 5-5b 的旗標物件 ──
  { id: 'chaser', type: 'engineChaser', derived: true, from: 'east', trigger: 'slots', cut: 'chaseCut', omenSec: 3, enterSec: 2, speed: 2.4, assistAfter: 3, assistFactor: 0.8,
    checkpoints: [-11.0, 11.0], checkZ: -0.2, omenText: 'lvl.5-5.chase.omen', caughtText: 'lvl.5-5.chase.caught', cutText: 'lvl.5-5.chase.cut', darkText: 'lvl.5-5.chase.dark', flag: 'chase:5-5',
    x: -6.0, y: 0, z: -3.6, w: 0.6, h: 1.7, d: 0.6, visible: '2d', solid: false },
  { id: 'chaseCut', type: 'chaseMark', doneFlag: '5-5b', x: -6.0, y: 2.9, z: -4.6, w: 0.2, h: 0.1, d: 0.2, visible: '3d', solid: false },
  // ── 中景：機關底盤 (被重畫的展開圖；資訊)、5-5c 的 L1 字條 ──
  plaque('base', 'lvl.5-5.base', -2.4, 0.1, 1.6, 'both', 'lvl.ch5.engine.baseLabel'),
  { ...noteBase, id: 'noteC', x: -9.4, z: 0.4, textKey: 'lvl.5-5.note.c' },
  // ── 前景：工具箱 (一盒拆開的活字：部件卡「日」；只在實景拿)、南門的門牌、三張 L2 字條 (空白，進房 4 分鐘浮現) ──
  { id: 'toolbox', type: 'typeCase', gives: ['card.ri'], useText: 'lvl.5-5.toolbox.take', emptyText: 'lvl.5-5.toolbox.empty',
    x: -8.4, y: 0, z: 3.4, w: 1.2, h: 0.8, d: 0.7, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-5.toolbox' },
  plate('plateS', 'plate:engineS', 6.0, 1.6, 4.4),
  { ...noteBase, id: 'noteA2', x: -4.0, z: 3.2, textKey: 'lvl.5-5.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteC2', x: 2.0, z: 3.4, textKey: 'lvl.5-5.note.c2', revealAfter: 240 },
  { ...noteBase, id: 'noteB2', x: 9.4, z: 3.2, textKey: 'lvl.5-5.note.b2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'atticRoof', seed: 0 },
  // 後景：巨大的黃銅齒輪牆 (光槽改由 starSlots 畫)
  { kind: 'gearWall', x: 0, w: 24, seed: 561, slots: 0 },
  // 中景：機關底盤 (地板被重畫的展開圖) 與兩側成組的立柱
  { kind: 'floorDrawing', x: 0, z: 0.2, w: 8, d: 4, seed: 563 },
  { kind: 'posts', xs: '-9.0,9.0', z: -1.6 },
  // 前景：箱堆與工具
  { kind: 'trunks', x: -11.4, z: 3.4, n: 3, seed: 565 },
  { kind: 'crateStack', x: 11.6, z: 3.0, seed: 567 }
];

export const engineRoom: LevelDef = {
  id: '5-5',
  titleKey: 'lvl.5-5.title',
  shortKey: 'lvl.ch5.engine.short',
  bounds: { minX: -14, maxX: 14, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.ch5.engine.narration',
  puzzles: [{ id: '5-5a', titleKey: 'lvl.5-5.puzzle.a' }, { id: '5-5b', titleKey: 'lvl.5-5.puzzle.b' }, { id: '5-5c', titleKey: 'lvl.5-5.puzzle.c' }],
  nextKey: 'lvl.5-5.next',
  theme: 'attic',
  // 每次穿門進房補滿 10 滴墨；5-5a 進行中 7 (P4：最短 6 + 1)，完成的那一刻補滿
  turnBudget: { base: 10, puzzles: { '5-5a': 7 }, refillOn: ['5-5a'] },
  decor,
  objects
};
