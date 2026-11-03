import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 2-2 閱覽室 (第二章魔方的上列第 1 行；房間 id 'reading'，關卡 id '2-2'；規格 6「2-2 閱覽室（細化）」)
//   x∈[-6, 14] (往東加長；西門維持占位版的 x=-5.8)；西門 (S0 / 上列 +1 時接 2-1 東門；上列 −1 時面對入口屋框)、南門 (前緣、只在 3D；同一行時接 2-4 北門)
// 謎題：
//   2-2a 塗過才看得見 (P14 首次)：3D 對書檯上的書按 E 翻到空白頁 → 2D 空白頁上的淡墨 (只在藏寶圖) → 站穩按 E 塗開 → 小圖：
//        「一間只有東門的房，東門貼著迴廊的西門；房裡畫著一片鏡片」(= 2-2c 的鏡片在印房、要轉一次才接得上)
//   2-2b 下聯 (P18 首次)：對聯櫃左扇刻上聯「門外千棵樹」(只在實景)、右扇墨寫下聯「窗＿萬卷書」(只在藏寶圖；可寫的標籤)；
//        卡片目錄櫃 (3D) 三張詞卡 外 / 內 / 前 → 2D 貼「內」或「前」→ 櫃門彈開、空鏡框；「外」無效 (照抄上聯同位置的字)
//   2-2c 放大鏡 (P13 首次 / P1)：鏡片在印房 (S0 孤立；上列轉一次接上迴廊西門) → 帶回來、合成 (空鏡框 + 鏡片) → 3D 讀厚書書脊的小字 → 銅鑰匙的齒・二
// 三題都完成 = 2-2 通關。文字一律為 content/text/zh-Hant/lvl-2-2.ts 的 key；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const NOTE_Z = -4.4;
const noteBase = { type: 'note', y: 1.0, z: NOTE_Z, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.2-2.note' } as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 4, y: -1, z: 0, w: 20, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', frameText: 'lvl.ch2.doorW.frame', x: -5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorW' },
  { id: 'doorS', type: 'cubeDoor', side: 'S', kind: 'door', x: -1.5, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.doorS' },
  // ── 2-2a 塗過才看得見：書檯、只寫了開頭的書 (3D 翻頁)、空白頁上的淡墨 (只在藏寶圖；翻頁後才在場) ──
  { id: 'lectern', type: 'lectern', x: -1, y: 0, z: -3.8, w: 1.2, h: 1.0, d: 0.8, visible: 'both', solid: false, labelKey: 'lvl.2-2.lectern' },
  { id: 'book', type: 'openBook', useText: 'lvl.2-2.book.turn', readText: 'lvl.2-2.book.read', x: -1, y: 1.0, z: -3.7, w: 0.9, h: 0.5, d: 0.4,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-2.book' },
  { id: 'veil', type: 'inkveil', after: 'book', revealText: 'lvl.2-2.veil.reveal', sketch: 'lvl.2-2.veil.sketch', doneFlag: '2-2a',
    x: -1, y: 1.05, z: -3.45, w: 0.8, h: 0.5, d: 0.04, visible: '2d', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.2-2.veil' },
  // ── 2-2c 放大鏡：閱覽桌上的厚書 (書脊的小字；要持有放大鏡) ──
  { id: 'table', type: 'readingTable', x: 3, y: 0, z: -3.4, w: 2.4, h: 0.8, d: 1.2, visible: 'both', solid: false, labelKey: 'lvl.2-2.table' },
  { id: 'spine', type: 'smallPrint', requires: 'magnifier', lockedText: 'lvl.2-2.spine.blur', firstText: 'lvl.2-2.spine.first', readText: 'lvl.2-2.spine.read',
    reward: 'tooth.reading', doneFlag: '2-2c', x: 3.4, y: 0.8, z: -3.4, w: 0.25, h: 0.7, d: 0.5, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-2.spine' },
  // ── 2-2b 下聯：對聯櫃 (左扇刻上聯；下聯寫對 → opens 打開)、下聯 (藏寶圖的墨字 + 字謎標籤)、卡片目錄櫃 ──
  { id: 'cabinet', type: 'coupletCabinet', upper: 'lvl.2-2.cabinet.upper', lockedRead: 'lvl.2-2.cabinet.locked', openRead: 'lvl.2-2.cabinet.open',
    x: 8.5, y: 0, z: -4.3, w: 2.0, h: 2.2, d: 0.7, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-2.cabinet' },
  { id: 'lower', type: 'couplet', opens: 'cabinet', doneFlag: '2-2b', x: 9, y: 0.9, z: -3.9, w: 0.6, h: 0.9, d: 0.04, visible: '2d', solid: false, labelKey: 'lvl.2-2.couplet',
    label: { id: 'couplet:reading', kind: 'blank', textKey: 'lvl.2-2.couplet.lower', answers: ['card.nei', 'card.qian', 'card.li', 'card.bian'],
      reward: 'frame', solvedText: 'lvl.2-2.couplet.solved', noCardText: 'lvl.2-2.couplet.noCard' } },
  { id: 'catalog', type: 'cardCatalog', cards: ['card.wai', 'card.nei', 'card.qian'], useText: 'lvl.2-2.catalog.open', emptyText: 'lvl.2-2.catalog.empty',
    x: 12.6, y: 0, z: -4.2, w: 1.2, h: 1.3, d: 0.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-2.catalog' },
  // ── 字條 (父親的筆記；story-bible 7.3) ──
  { ...noteBase, id: 'noteA', x: -3.5, textKey: 'lvl.2-2.note.a' }, // 2-2a L1 (書檯旁)
  { ...noteBase, id: 'noteC', x: 4.6, textKey: 'lvl.2-2.note.c' },  // 2-2c L1 (閱覽桌旁)
  { ...noteBase, id: 'noteB', x: 11.0, textKey: 'lvl.2-2.note.b' }  // 2-2b L1 (對聯櫃與目錄櫃之間)
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'bookcase', x: -3.6, w: 3.2, seed: 21 },
  { kind: 'bookcase', x: 5.9, w: 2.2, seed: 24 },
  { kind: 'bookcase', x: 11.4, w: 1.4, seed: 27 },
  { kind: 'roots', x: -5.9, side: 'W', seed: 6 },
  { kind: 'roots', x: 13.9, side: 'E', seed: 7 },
  { kind: 'stainedGlass', x: 6, z: 1.6 },
  { kind: 'floatBooks', x: 3, y: 3.7, z: -2.4, w: 8, seed: 9 },
  { kind: 'rug', x: 3, z: 1.2, w: 6, d: 3 },
  { kind: 'pendant', x: -1, z: 0.4 },
  { kind: 'pendant', x: 7.5, z: 0.4 }
];

export const reading: LevelDef = {
  id: '2-2',
  titleKey: 'lvl.2-2.title',
  bounds: { minX: -6, maxX: 14, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.2-2.narration',
  puzzles: [
    { id: '2-2a', titleKey: 'lvl.2-2.puzzle.a' },
    { id: '2-2b', titleKey: 'lvl.2-2.puzzle.b' },
    { id: '2-2c', titleKey: 'lvl.2-2.puzzle.c' }
  ],
  nextKey: 'lvl.2-2.next',
  theme: 'study',
  // 每次穿門進房補滿 6 滴墨 (規格 5.4.9 第二章基礎預算；2-2c 最短 1 轉)
  turnBudget: { base: 6 },
  decor,
  objects
};
