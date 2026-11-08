import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { atticWindow, door, floor, hatch, plaque } from './parts';

// 5-2 東窗 (第五章魔方的東面心 [2,1,1]；房間 id 'east'，關卡 id '5-2'；規格 6「5-2 東窗（細化）」；許問津的窗)
//   x∈[-10, 10]、z∈[-5, 5]；東牆 = 東窗 (不是門)、北門 (後牆 x -4)、地板梯口 (3, 1.6)
// 分區：後景 北門、樑下的古籍書架、梁上掛的手抄星表、立柱 ｜
//   中景 東窗 (窗框兩側直刻的兩行詩 = poemWindow；窗台角上的天窗銘文 (東))、許問津的書案 (長邊朝窗) 與案上的星表匣、羽毛筆、案旁的古籍、地板梯口 ｜
//   (5-3) 古籍書架西端靠著許問津的空白羊皮紙 (5-3 西窗的另一件道具) ｜
//   前景 西南角舊箱與箱蓋紙籤、三張字條 (落地木柱；離窗 ≥ 2.6：藏寶圖裡站在窗前按 E 開的是詩的標籤)
// 謎題：5-2 倒過來的詩 (P18 / P1)：右行「上在星首仰」、左行「下在星頭＿」順讀不通；東窗在底面心 (窗朝下：玻璃成了鏡子) → 倒讀
//   「仰首星在上，＿頭星在下」→ 貼「低」或「垂」(詞典另收「俯」)；「抬」= 無效字；不在底面 = 一張都不收 (label.flip)
// 文字 = content/text/zh-Hant/lvl-5-2.ts、lvl-ch5.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.5-2.note', mount: 'post' } as const;

/** 書案的桌面高 (decor desk) */
const DESK_H = 0.76;

const objects: ObjDef[] = [
  floor(-10, 10),
  door('N', 'door', -4.0),
  hatch('D', 'door', 3.0, 1.6),
  // ── 中景：東窗的窗框 (兩行直刻的詩；可寫的那一行 = 標籤：窗朝下才讀作倒影、才收詞卡) ──
  { id: 'poem', type: 'poemWindow', face: 'D', upper: 'lvl.5-2.poem.upper', upperFlip: 'lvl.5-2.poem.upperFlip',
    levelText: 'lvl.5-2.poem.level', upText: 'lvl.5-2.poem.up', downText: 'lvl.5-2.poem.down', doneText: 'lvl.5-2.poem.done', doneFlag: '5-2',
    x: 9.6, y: 1.0, z: 0, w: 0.4, h: 2.8, d: 2.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-2.window',
    label: {
      id: 'poem:east', kind: 'blank', textKey: 'lvl.5-2.poem.lower', answers: ['card.di', 'card.chui', 'card.fu'],
      solvedText: 'lvl.5-2.poem.solved', noCardText: 'lvl.5-2.poem.noCard',
      flip: { face: 'D', textKey: 'lvl.5-2.poem.lowerFlip', wrongText: 'lvl.5-2.poem.wrong' }
    } },
  // 窗台角上的天窗銘文 (東；許問津；只在實景；5-5c 引用)
  plaque('inscriptionE', 'lvl.5-2.inscription', 9.5, 0.9, 2.6, '3d', 'lvl.5-2.inscription.label'),
  // 書案上的星表匣 (三張詞卡；只在實景打開)
  { id: 'starCase', type: 'starCase', cards: ['card.tai', 'card.di', 'card.chui'], useText: 'lvl.5-2.case.open', emptyText: 'lvl.5-2.case.empty',
    x: 5.6, y: DESK_H, z: -1.0, w: 0.6, h: 0.32, d: 0.42, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-2.case' },
  // 5-3 的另一件道具：許問津的空白羊皮紙 (靠在古籍書架西端的一捲；名詞標籤帶方槽：「大」帶不動、「小」寫不下；只在實景拿)
  { id: 'parchment', type: 'parchment', item: 'parchment', useText: 'lvl.5-3.parchment.take', bigText: 'lvl.5-3.parchment.big', smallText: 'lvl.5-3.parchment.small',
    x: 0.9, y: 0, z: -3.4, w: 0.3, h: 0.9, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-3.parchment',
    label: { id: 'parchment', kind: 'noun', textKey: 'lvl.5-3.parchment.tag', scale: true } },
  // ── 前景：箱蓋紙籤、字條 (父親的筆記；story-bible 7.3) ──
  plaque('plaqueEast', 'lvl.ch5.east.plaque', -6.4, 0.9, 3.2),
  { ...noteBase, id: 'noteA', x: -8.6, z: 2.6, textKey: 'lvl.5-2.note.a' },
  { ...noteBase, id: 'noteA2', x: -2.0, z: 3.4, textKey: 'lvl.5-2.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteStory', x: 6.6, z: 2.6, textKey: 'lvl.5-2.note.story' },
  // 5-4 的重物：許問津的書箱 (西南角舊箱的東邊；秤繩吊著東窗時計重 4；蓋上一個銅環；搬不動)
  { id: 'chestBooks', type: 'ballastBox', look: 'books', fixedText: 'lvl.5-4.books.fixed', ballast: true, weight: 4,
    x: -4.4, y: 0, z: 3.7, w: 1.0, h: 0.7, d: 0.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.5-4.books' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'atticRoof', seed: 521 },
  // 中景：東窗
  atticWindow('E', 0),
  // 後景：樑下的古籍書架、梁上的手抄星表、立柱
  { kind: 'shelfRow', x: 2.2, z: -3.9, n: 2, seed: 531 },
  { kind: 'starChart', x: -7.0, z: -3.4, n: 2, seed: 533 },
  { kind: 'posts', xs: '-6.0,0.4', z: -4.5 },
  // 中景：許問津的書案 (長邊朝窗) 與椅子 (西側，面向東窗)、羽毛筆與墨壺、案旁地上的古籍
  { kind: 'desk', x: 5.6, z: -1.4, rot: Math.PI / 2 },
  { kind: 'stool', x: 4.5, z: -1.4, rot: Math.PI / 2 },
  { kind: 'quill', x: 5.5, y: DESK_H, z: -1.9 },
  { kind: 'bookPile', x: 7.2, z: -2.6, n: 5, seed: 537 },
  // 前景：西南角的舊箱
  { kind: 'trunks', x: -6.4, z: 3.4, n: 3, seed: 535 }
];

export const eastRoom: LevelDef = {
  id: '5-2',
  titleKey: 'lvl.5-2.title',
  shortKey: 'lvl.ch5.east.short',
  bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.ch5.east.narration',
  puzzles: [{ id: '5-2', titleKey: 'lvl.5-2.puzzle' }],
  nextKey: 'lvl.5-2.next',
  theme: 'attic',
  // 每次穿門進房補滿 10 滴墨 (規格 5.4.9 第五章基礎預算)
  turnBudget: { base: 10 },
  decor,
  objects
};
