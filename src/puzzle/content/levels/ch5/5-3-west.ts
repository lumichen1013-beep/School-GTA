import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { atticWindow, door, floor, hatch, plaque } from './parts';

// 5-3 西窗 (第五章魔方的西面心 [0,1,1]；房間 id 'west'，關卡 id '5-3'；規格 6「5-3 西窗（細化）」；爸爸的窗)
//   x∈[-10, 10]、z∈[-5, 5]；西牆 = 西窗 (不是門)、南門 (前緣 x 4，只在實景)、地板梯口 (-3, 1.6)
// 分區：後景 爸爸的書桌 (靠後牆；桌上的筆記本與吸墨墊 = 合成台、墨水瓶、檯燈、咖啡杯、一疊筆記)、桌前的凳子、梁下的燈、後牆上爸爸抄的星圖、立柱、
//   墨水瓶旁後牆上的劇情字條 ｜ 中景 西窗與窗台角上的天窗銘文 (西：爸爸的鉛筆字)、面向西窗的扶手椅、地板梯口 ｜
//   前景 南門、東南角的舊箱與摺好的毯子、兩張字條 (落地木柱)
// 謎題：5-3 爸爸的書桌 (P13 / P1)：爸爸的墨水瓶 (這裡) + 許問津的空白羊皮紙 (5-2 東窗) → 在這張書桌上合成「可寫的手記頁」(page.blank)；
//   東窗與西窗是對面的面心、永遠碰不到 → 用切片轉找一間兩邊都接得上的橋房 (天窗間 / 樓梯口 / 北窗)
// 文字 = content/text/zh-Hant/lvl-5-3.ts、msg.ts (合成)、lvl-ch5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.5-3.note', mount: 'post' } as const;

/** 爸爸書桌的桌面高 (decor dadDesk；同 decor desk) */
const DESK_H = 0.76;

const objects: ObjDef[] = [
  floor(-10, 10),
  door('S', 'door', 4.0),
  hatch('D', 'door', -3.0, 1.6),
  // v0.4 5-5a 洞位 (平常不在場；機關的門牌讀作「間」、走道那一頭正對這一面時才接上)
  door('N', 'door', -7.6, { id: 'holeN', hole: true, labelKey: 'lvl.ch2.hole' }),
  // ── 後景：爸爸的書桌 (合成台 = 攤開的筆記本與吸墨墊；墨水瓶在桌上西端，只在實景拿) ──
  { id: 'deskBook', type: 'writingDesk', readText: 'lvl.5-3.desk.read', doneText: 'lvl.5-3.desk.done', doneFlag: '5-3',
    x: 2.35, y: DESK_H, z: -3.3, w: 0.6, h: 0.1, d: 0.48, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch5.west.deskLabel' },
  { id: 'inkBottle', type: 'inkBottle', grants: 'ink.father', useText: 'lvl.5-3.ink.take',
    x: 1.55, y: DESK_H, z: -3.3, w: 0.2, h: 0.26, d: 0.2, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-3.ink' },
  { ...noteBase, id: 'noteStory', x: -2.0, y: 1.3, z: -4.4, mount: undefined, textKey: 'lvl.5-3.note.story' },
  // ── 中景：窗台角上的天窗銘文 (西；爸爸的鉛筆字，劃掉重寫；只在實景；5-5c 引用) ──
  plaque('inscriptionW', 'lvl.5-3.inscription', -9.5, 0.9, 1.8, '3d', 'lvl.5-3.inscription.label'),
  // ── 前景：字條 (父親的筆記；story-bible 7.3) ──
  { ...noteBase, id: 'noteA', x: -7.6, z: 3.0, textKey: 'lvl.5-3.note.a' },
  { ...noteBase, id: 'noteA2', x: 6.0, z: 1.4, textKey: 'lvl.5-3.note.a2', revealAfter: 240 },
  // 5-4 的重物：爸爸的舊皮箱 (東南角舊箱旁；秤繩吊著西窗時計重 3；蓋上一個銅環；搬不動)
  { id: 'trunkDad', type: 'ballastBox', look: 'trunk', fixedText: 'lvl.5-4.trunk.fixed', ballast: true, weight: 3,
    x: 5.4, y: 0, z: 3.7, w: 1.0, h: 0.6, d: 0.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-4.trunk' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'atticRoof', seed: -60 },
  // 中景：西窗
  atticWindow('W', 0),
  // 後景：爸爸的書桌 (檯燈、咖啡杯、一疊筆記) 與凳子、梁下的燈、後牆上的星圖抄本、立柱
  { kind: 'dadDesk', x: 2.4, z: -3.4 },
  { kind: 'stool', x: 2.3, z: -2.4 },
  { kind: 'lantern', x: 2.4, y: 3.6, z: -2.6 },
  { kind: 'starChart', x: -5.0, z: -3.4, n: 1, seed: 543 },
  { kind: 'posts', xs: '-7.0,6.0', z: -4.5 },
  // 中景：面向西窗的扶手椅 (爸爸坐在這裡看窗)
  { kind: 'armchair', x: -6.8, z: 0.6, rot: -Math.PI / 2, tone: 1 },
  // 前景：東南角的舊箱與摺好的毯子
  { kind: 'trunks', x: 7.4, z: 3.2, n: 2, seed: 541 },
  { kind: 'blanket', x: 7.4, z: 3.2 }
];

export const westRoom: LevelDef = {
  id: '5-3',
  titleKey: 'lvl.5-3.title',
  shortKey: 'lvl.ch5.west.short',
  bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.ch5.west.narration',
  puzzles: [{ id: '5-3', titleKey: 'lvl.5-3.puzzle' }],
  nextKey: 'lvl.5-3.next',
  theme: 'attic',
  // 每次穿門進房補滿 10 滴墨 (規格 5.4.9 第五章基礎預算)
  turnBudget: { base: 10 },
  decor,
  objects
};
