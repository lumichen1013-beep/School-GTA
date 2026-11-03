import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 2-1 書架迴廊 (第二章魔方的上列第 0 行；房間 id 'shelf'，關卡 id '2-1'；規格 6「2-1 書架迴廊（細化）」)
//   沒有後牆：z=-5～-4.5 是屋框北牆上一整面固定的書牆，分三段 (frameBay 0 / 1 / 2 = 上列第 0 / 1 / 2 行的背後)；
//   2-1 在第幾行，就只有那一段的東西在場 (mechanics/shelf)。書都書背朝牆，書名只畫在藏寶圖上
//   西門 (入口；S0 接屋框「來時的走廊」，任一次上列轉動後接 2-3 印房東門)、東門 (S0 / 上列 +1 時接 2-2 閱覽室西門)
// 魔方儀 (不計題)：閱讀架上的黃銅魔方儀，3D 啟動 → 之後 2D 站穩可開轉動模式
// 謎題：
//   2-1a 整列一起走 (P1；控制盤 + 列轉首次)：上列 ◀ 一次 (或 ▶ 兩次) → 2-1 到第 2 行 → 書牆東段的書擋 → 3D 推倒 (下列的鎖扣鬆開)；
//        底座刻著 2-1c 的順序「林中有書，書後有門。」。隱藏點：第 1 行時中段書架上層露出老宅圖殘片 1 (2D 跳上書梯取得)
//   2-1b 那年的推測 (P12 首次 / P9)：三條眉批 — 一 (2D)「最高」→ B、D、影；二 (3D)「不肯站齊」→ A、D；三 (2D) 爸爸劃掉「很確定」的猜測「影」→
//        影只畫在圖上 (實景沒有) → 一 ∩ 二 = D → 3D 抽 D → 暗格、銅鑰匙的齒・一
//   2-1c 書名的順序 (P16)：燈書 第 0 段「門」、第 1 段「林」、第 2 段「書」；依「林 → 書 → 門」點亮 (3D)，每一本都要先把那一段轉到面前；
//        2-1a 後在第 2 行：◀ 林、▶ 書、▶ 門 (最短 3)；點錯全部暗下 (N27)；三盞全亮 = 2-1 通關
// 文字一律為 content/text/zh-Hant/lvl-2-1.ts 的 key；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；屋框書牆正面 z = -4.5
const NOTE_Z = -4.4;
const noteBase = { type: 'note', y: 1.0, z: NOTE_Z, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.2-1.note' } as const;

/** 矮書架的書 (2-1b)：x、高度、是否往外凸 (實景才看得出) */
const book = (id: string, x: number, h: number, out: boolean): ObjDef => ({
  id, type: 'spine', lock: 'bookLock', x, y: 0.8, z: out ? -3.75 : -4.0, w: 0.3, h, d: 0.5,
  visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-1.book'
});

/** 燈書 (2-1c)：屬於書牆的第 bay 段；書名只畫在藏寶圖上 */
const lamp = (id: string, bay: number, title: string, done?: string): ObjDef => ({
  id, type: 'lampBook', lock: 'lampLock', title, frameBay: bay, ...(done ? { doneFlag: done } : {}),
  x: 3.5, y: 0.8, z: -4.55, w: 0.42, h: 0.42, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-1.lamp'
});

const BAY_KEYS = ['lvl.2-1.bay.0', 'lvl.2-1.bay.1', 'lvl.2-1.bay.2'];

/** 屋框書牆的一段 (呈現：三段的書色不同；gaps = 這一段要讓出的格子：燈書 / 殘片 / 書擋) */
const bay = (n: number, gaps: number[]): ObjDef => ({
  id: `bay${n}`, type: 'bayShelf', variant: n, turnWhen: 'lampLock', gaps, frameBay: n,
  x: 0, y: 0, z: -4.69, w: 20, h: 5.6, d: 0.38, visible: 'both', solid: false, labelKey: BAY_KEYS[n]
});

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 20, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', frameText: 'lvl.2-1.doorW.frame', x: -9.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-1.doorW' },
  { id: 'doorE', type: 'cubeDoor', side: 'E', kind: 'door', x: 9.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-1.doorE' },
  // 黃銅魔方儀 (閱讀架上；3D 啟動，不計題)
  { id: 'dial', type: 'dial', chapter: 2, x: -6.5, y: 0, z: -3.4, w: 1, h: 1.4, d: 0.9, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-1.dial' },
  // 屋框書牆的三段 (frameBay；gaps：第 0 段燈書、第 1 段燈書 + 殘片、第 2 段燈書 + 書擋)
  bay(0, [3.5]), bay(1, [3.5, 6.6]), bay(2, [3.5, 8.7]),
  // ── 2-1b 那年的推測 (x∈[-5, 3]) ──
  { id: 'lowShelf', type: 'lowShelf', x: -1.5, y: 0, z: -4.0, w: 6.2, h: 0.8, d: 0.8, visible: 'both', solid: false },
  book('bookA', -4, 0.5, true), book('bookB', -3, 0.8, false), book('bookC', -2, 0.55, false), book('bookD', -1, 0.8, true), book('bookE', 0, 0.45, false),
  // 書「影」：只畫在藏寶圖上 (實景那一格是空的)；2D 按 E = 碰到的是紙
  { id: 'bookYing', type: 'spine', lock: 'bookLock', title: 'lvl.2-1.book.ying', drawnText: 'lvl.2-1.book.drawn', x: 1, y: 0.8, z: -4.0, w: 0.3, h: 0.8, d: 0.5,
    visible: '2d', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.2-1.book' },
  { id: 'bookLock', type: 'bookLock', answer: 'bookD', reward: 'tooth.shelf', doneFlag: '2-1b',
    openText: 'lvl.2-1.lock.open', wrongText: 'lvl.2-1.lock.wrong', doneText: 'lvl.2-1.lock.done',
    x: -1, y: 0.25, z: -3.58, w: 0.4, h: 0.3, d: 0.04, visible: 'both', solid: false, labelKey: 'lvl.2-1.lock' },
  { id: 'remark1', type: 'remark', textKey: 'lvl.2-1.remark.1', ink: true, x: -2, y: 1.75, z: -4.0, w: 1.6, h: 0.3, d: 0.04, visible: '2d', solid: false, interactable: true, labelKey: 'lvl.2-1.remark' },
  { id: 'remark2', type: 'remark', textKey: 'lvl.2-1.remark.2', x: 2.0, y: 0.45, z: -3.9, w: 0.6, h: 0.3, d: 0.04, visible: '3d', solid: false, interactable: true, labelKey: 'lvl.2-1.remark' },
  { id: 'remark3', type: 'remark', textKey: 'lvl.2-1.remark.3', ink: true, x: 2.5, y: 1.65, z: -4.0, w: 1.2, h: 0.3, d: 0.04, visible: '2d', solid: false, interactable: true, labelKey: 'lvl.2-1.remark' },
  // ── 2-1c 書名的順序：燈座 (鎖；亮幾盞 = 進度) 與三段書牆的燈書 ──
  { id: 'lampLock', type: 'lampLock', order: ['lampLin', 'lampShu', 'lampMen'], doneFlag: '2-1c',
    openText: 'lvl.2-1.lamp.open', stepText: 'lvl.2-1.lamp.step', resetText: 'lvl.2-1.lamp.reset',
    x: 3.5, y: 0, z: -4.15, w: 1, h: 0.6, d: 0.5, visible: 'both', solid: false, labelKey: 'lvl.2-1.lampLock' },
  lamp('lampMen', 0, 'lvl.2-1.lamp.men'), lamp('lampLin', 1, 'lvl.2-1.lamp.lin', '2-1c.1'), lamp('lampShu', 2, 'lvl.2-1.lamp.shu', '2-1c.2'),
  // ── 2-1a 書擋 (書牆第 2 段 = 迴廊盡頭) 與隱藏點 (第 1 段的殘片；書梯當墊腳) ──
  { id: 'step', type: 'libraryStep', x: 6.6, y: 0, z: -3.9, w: 1, h: 1.1, d: 1, visible: 'both', solid: true, labelKey: 'lvl.2-1.step' },
  { id: 'scrap', type: 'scrap', grants: 'scrap.1', useText: 'lvl.2-1.scrap.got', frameBay: 1, x: 6.6, y: 2.5, z: -4.6, w: 0.5, h: 0.3, d: 0.1,
    visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.2-1.scrap' },
  { id: 'bookend', type: 'bookend', doneFlag: '2-1a', useText: 'lvl.2-1.bookend.fall', readText: 'lvl.2-1.bookend.read', plateText: 'lvl.2-1.bookend.plate', frameBay: 2,
    x: 8.7, y: 0.8, z: -4.45, w: 0.45, h: 0.8, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.2-1.bookend' },
  // ── 字條 (父親的筆記；story-bible 7.3) ──
  { ...noteBase, id: 'noteA', x: -8.6, textKey: 'lvl.2-1.note.a' }, // 2-1a L1 (魔方儀旁)
  { ...noteBase, id: 'noteB', x: -5.0, textKey: 'lvl.2-1.note.b' }, // 2-1b L1 (矮書架西端)
  { ...noteBase, id: 'noteC', x: 4.6, textKey: 'lvl.2-1.note.c' }   // 2-1c L1 (燈座旁)
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'roots', x: -9.9, side: 'W', seed: 1 },
  { kind: 'roots', x: 9.9, side: 'E', seed: 2 },
  { kind: 'stainedGlass', x: -3, z: 1.4 },
  { kind: 'floatBooks', x: -1, y: 3.6, z: -2.6, w: 9, seed: 4 },
  { kind: 'rug', x: -1, z: 1.4, w: 6, d: 3.2 },
  { kind: 'pendant', x: -5.5, z: 0.5 },
  { kind: 'pendant', x: 4.5, z: 0.5 }
];

export const shelf: LevelDef = {
  id: '2-1',
  titleKey: 'lvl.2-1.title',
  bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -8, y: 0, z: 0 },
  narrationKey: 'lvl.2-1.narration',
  puzzles: [
    { id: '2-1a', titleKey: 'lvl.2-1.puzzle.a' },
    { id: '2-1b', titleKey: 'lvl.2-1.puzzle.b' },
    { id: '2-1c', titleKey: 'lvl.2-1.puzzle.c' }
  ],
  nextKey: 'lvl.2-1.next',
  theme: 'study',
  // 每次穿門進房補滿 6 滴墨 (規格 5.4.9：第二章基礎預算；2-1a 教學 1 + 3、2-1c 3 + 2 都在內)
  turnBudget: { base: 6 },
  decor,
  objects
};
