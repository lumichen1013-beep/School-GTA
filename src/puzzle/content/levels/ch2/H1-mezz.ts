import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { floorPiece } from './drawing';

// H1 夾層 (第二章魔方的下列第 0 行；隱藏房；房間 id 'mezz'，關卡 id 'H1'；規格 6「H1 夾層（細化）」)
//   x∈[-6, 6]、z∈[-5, 5] (同占位版)；西門 x −5.8 (門旁活字 火)、北牆洞位 x 0 (上方那一格的門牌讀作「間」時才在場)
// 分區 (後 / 中 / 前)：後景 夾層書庫 (書牆後面的窄廊 z∈[-5, -3.0]：洞口前的後面那面書櫃、爸爸小時候的小書桌 + 小凳 + 牆燈、一疊書)
//   ｜ 書牆 (只在實景、全寬、z∈[-3.0, -2.4]，書背朝牆；頂上的裝飾書 9.1 D) ｜ 中景 閱讀角 (扶手椅 + 落地燈面向書牆、地毯、吊燈；西門的走道)
//   ｜ 前景 書車與地上的那一角 (2-4a 屋頂右、書車、兩張字條立在落地木柱上；劇情字條斜靠在書車上)
// 謎題 H1 書櫃後面 (P7 / P3)：前廳 (西門) 與後面 (洞) 在任何排列下都不相通——在前廳隔著書牆、在藏寶圖裡把書櫃量小 (藏寶圖不分前後)，
//   再把印房轉到夾層正上方、從印房南拱門的「間」穿洞進後面 → 3D 拉開小書桌的抽屜 = 殘片 4、房間通關
// 家具可穿過 (椅子、燈、書車、書堆、小凳都是裝飾)；擋路的只有地板、書牆、後面那面書櫃
// 文字 = content/text/zh-Hant/lvl-H1.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.H1.note' } as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 10, visible: 'both', solid: true },
  // ── 門位 (同占位版) ──
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', glyph: 'term.glyph.huo', x: -5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorW' },
  { id: 'holeN', type: 'cubeDoor', side: 'N', kind: 'arch', hole: true, x: 0, y: 0, z: -4.8, w: 1.6, h: 2.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.hole' },
  // ── 書牆：只在實景、全寬、頂到 3.0 (前廳與後面隔開；藏寶圖上沒有這面牆) ──
  { id: 'bookWall', type: 'bookWall', readText: 'lvl.H1.wall.read',
    x: 0, y: 0, z: -2.7, w: 12, h: 3.0, d: 0.6, visible: '3d', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.H1.wall' },
  // ── 後景：夾層書庫 (只有從洞進來才走得到) ──
  // 後面那面書櫃：背板朝洞；原尺寸 x∈[-0.4, 3.2] 堵住洞的到達處 (0, -3.7)，「小」x∈[0.5, 2.3] 讓開 0.2；「大」壓進書牆 = 放不下。
  // noLand3d：藏寶圖裡站在 (量小的) 書櫃頂上切回實景，不採用書櫃的深度 (不能從前廳跳進後面)
  { id: 'innerShelf', type: 'innerShelf', readText: 'lvl.H1.shelf.read', smallText: 'lvl.H1.shelf.small', blockText: 'lvl.H1.shelf.block', noLand3d: true,
    x: 1.4, y: 0, z: -3.8, w: 3.6, h: 2.6, d: 1.4, visible: 'both', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.H1.shelf',
    label: { id: 'scale:innerShelf', kind: 'noun', textKey: 'lvl.H1.shelf', scale: true, noCardText: 'lvl.H1.slot.empty' } },
  // 爸爸小時候的小書桌 (抽屜裡是老宅圖殘片 4；只在實景拿得到；不擋路)
  { id: 'desk', type: 'diaryStand', look: 'desk', gives: 'scrap.4', useText: 'lvl.H1.desk.take', emptyText: 'lvl.H1.desk.empty', doneFlag: 'H1',
    x: -4.4, y: 0, z: -4.3, w: 1.4, h: 0.75, d: 0.7, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.H1.desk' },
  // ── 前景：字條 (父親的筆記；story-bible 7.3 H1) ──
  { ...noteBase, id: 'noteA', mount: 'post', x: -3.4, z: 2.8, textKey: 'lvl.H1.note.a' },                   // H1 L1
  { ...noteBase, id: 'noteA2', mount: 'post', x: 4.4, z: 2.8, textKey: 'lvl.H1.note.a2', revealAfter: 240 }, // H1 L2 (空白，4 分鐘浮現)
  { ...noteBase, id: 'noteS', mount: 'pile', x: 0.2, y: 0.9, z: 3.4, visible: '3d', textKey: 'lvl.H1.note.story' } // 劇情字條 (斜靠在書車上，只在實景)
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 中景 閱讀角：扶手椅 + 落地燈 (面向北邊的書牆)、地毯、吊燈
  { kind: 'rug', x: -2.4, z: 0.6, w: 3.6, d: 2.8 },
  { kind: 'armchair', x: -2.4, z: 0.9, rot: Math.PI, tone: 1 },
  { kind: 'floorLamp', x: -3.5, z: 0.4 },
  { kind: 'pendant', x: -1.2, z: 0.6 },
  // 前景：2-4a 地板的老宅圖 (屋頂右；位置不變)、推到角落的書車 (劇情字條斜靠在上面)
  floorPiece('mezz', 2.6, 2.4, 2.2),
  { kind: 'bookCart', x: 1.0, z: 3.5, seed: 41 },
  // 書牆頂的裝飾書 (9.1 D：每次切回實景多一層、最多三層；減弱緊張效果時不出現)
  { kind: 'wallTopBooks', x: 0, z: -2.7, y: 3.0, w: 11.96, seed: 91 },
  // 後景 夾層書庫：小書桌旁的小凳、牆燈、一疊書；書櫃東邊一疊書
  { kind: 'stool', x: -4.2, z: -3.55 },
  { kind: 'wallLamp', x: -4.4, y: 1.9 },
  { kind: 'bookPile', x: -2.6, z: -4.4, n: 7, seed: 23 },
  { kind: 'bookPile', x: 4.6, z: -4.3, n: 5, seed: 29 },
  { kind: 'pendant', x: 1.4, z: -3.9 }
];

export const mezz: LevelDef = {
  id: 'H1',
  titleKey: 'lvl.H1.title',
  bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -2.0, y: 0, z: 1.6 },
  narrationKey: 'lvl.H1.narration',
  puzzles: [{ id: 'H1', titleKey: 'lvl.H1.puzzle' }],
  nextKey: 'lvl.H1.next',
  theme: 'study',
  // 每次穿門進房補滿 6 滴墨 (規格 5.4.9 第二章基礎預算)
  turnBudget: { base: 6 },
  decor,
  objects
};
