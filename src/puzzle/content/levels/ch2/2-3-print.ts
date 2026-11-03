import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 2-3 印房 (第二章魔方的上列第 2 行；房間 id 'print'，關卡 id '2-3'；規格 6「2-3 印房（細化）」)
//   x∈[-6, 6]、z∈[-5, 5] (同占位版；東門 x=5.8)；東門 (上列轉一次接 2-1 西門)、南拱門 (前緣、只在 3D；門牌在藏寶圖上)
// 分區 (後 / 中 / 前)：後景排字區 (活字架、活字桌與鏡片) ｜ 中景印刷區 (印刷機斜放、字條釘在機器背板) ｜ 前景出貨口 (南拱門與門牌、鉛字盤、紙捆)
// 謎題：
//   2-3a 門裡多一個日 (P7 + 部件卡首次)：3D 活字架 → 部件卡「日」→ 2D 門牌「門」貼「日」=「間」→ done (三行解鎖)；南拱門對面沒有門也接得上 (開洞)
//   2-3b 墨只夠三次 (P4 首次；墨 3)：印刷機要東門接迴廊、南拱門接閱覽室 (閱覽室北牆的洞) → 校樣
//   2-3c 沿路的符號 (P11 首次)：校樣 + 書脊小字 → 剛好三扇門的路線 (印房 → … → 手稿庫)，出門那一側門旁的活字 = 手稿庫排字架的密碼 → 銅鑰匙的柄
// 文字 = content/text/zh-Hant/lvl-2-3.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.2-3.note' } as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorE', type: 'cubeDoor', side: 'E', kind: 'door', glyph: 'term.glyph.shan', x: 5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorE' },
  { id: 'archS', type: 'cubeDoor', side: 'S', kind: 'arch', plate: 'plate:print', glyph: 'term.glyph.shui', x: -2.6, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-3.archS' },
  // ── 後景：排字區 ──
  { id: 'typeCase', type: 'typeCase', gives: ['card.ri'], useText: 'lvl.2-3.case.take', emptyText: 'lvl.2-3.case.empty',
    x: -3.2, y: 0, z: -4.4, w: 2.4, h: 1.9, d: 0.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-3.case' },
  { id: 'typeDesk', type: 'readingTable', x: 2.5, y: 0, z: -3.6, w: 1.6, h: 0.85, d: 0.8, visible: 'both', solid: false, labelKey: 'lvl.2-2.typeDesk' },
  { id: 'lens', type: 'lens', grants: 'lens', useText: 'lvl.2-2.lens.got', x: 2.5, y: 0.85, z: -3.6, w: 0.3, h: 0.12, d: 0.3,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-2.lens' },
  // ── 中景：印刷區 (印刷機是實體，四周留走道) ──
  { id: 'press', type: 'press', side: 'lvl.2-3.press.side', needs: [{ door: 'doorE', room: 'shelf' }, { door: 'archS', room: 'reading' }], reward: 'proof',
    okText: 'lvl.2-3.press.ok', looseText: 'lvl.2-3.press.loose', readText: 'lvl.2-3.press.read', doneFlag: '2-3b',
    x: 0.2, y: 0, z: -0.4, w: 1.8, h: 1.2, d: 1.2, visible: 'both', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.2-3.press' },
  // ── 前景：出貨口 (南拱門的門牌只畫在藏寶圖上；鉛字盤靠在拱門旁) ──
  { id: 'plateS', type: 'doorPlate', doneFlag: '2-3a', x: -2.6, y: 1.6, z: 4.4, w: 0.8, h: 0.5, d: 0.05, visible: '2d', solid: false, labelKey: 'lvl.2-3.plate.name',
    label: { id: 'plate:print', kind: 'plate', textKey: 'term.glyph.men', answers: ['card.ri'], forms: { 'card.ri': 'term.glyph.jian' },
      solvedText: 'lvl.2-3.plate.solved', noCardText: 'lvl.2-3.plate.noCard' } },
  { id: 'tray', type: 'typeTray', pushable: true, x: 4.0, y: 0, z: 2.4, w: 1.2, h: 1.0, d: 1.2, visible: 'both', solid: true, labelKey: 'lvl.2-3.tray' },
  // ── 字條 (父親的筆記；story-bible 7.3) ──
  { ...noteBase, id: 'noteA', x: -5.6, z: -4.4, textKey: 'lvl.2-3.note.a' }, // 2-3a L1 (釘在活字架側板)
  { ...noteBase, id: 'noteB', x: 0.4, z: -1.15, textKey: 'lvl.2-3.note.b' }, // 2-3b L1 (釘在印刷機背板)
  { ...noteBase, id: 'noteC', x: 4.8, z: 3.4, textKey: 'lvl.2-3.note.c' }   // 2-3c L1 (前景木柱，出貨口旁)
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'bookcase', x: 0.6, w: 2.2, seed: 31 },
  { kind: 'roots', x: -5.9, side: 'W', seed: 8 },
  { kind: 'rug', x: 0.2, z: 1.6, w: 4.4, d: 2.4 },
  { kind: 'floatBooks', x: -1, y: 3.6, z: -2, w: 6, seed: 12 },
  { kind: 'pendant', x: 0.2, z: -0.4 },
  { kind: 'pendant', x: -3.2, z: -3 }
];

export const print: LevelDef = {
  id: '2-3',
  titleKey: 'lvl.2-3.title',
  bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 2.2, y: 0, z: 1.5 },
  narrationKey: 'lvl.2-3.narration',
  puzzles: [
    { id: '2-3a', titleKey: 'lvl.2-3.puzzle.a' },
    { id: '2-3b', titleKey: 'lvl.2-3.puzzle.b' },
    { id: '2-3c', titleKey: 'lvl.2-3.puzzle.c' }
  ],
  nextKey: 'lvl.2-3.next',
  theme: 'study',
  // 基礎 6；2-3b (P4) 還沒完成時只有 3 滴 (規格 5.4.9)
  turnBudget: { base: 6, puzzles: { '2-3b': 3 } },
  decor,
  objects
};
