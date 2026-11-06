import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { door, floor, hatch, inkSealed, plaque } from './parts';

// 4-3 封存書庫 (第四章魔方的下層西邊 [0,1,0]；房間 id 'archive'，關卡 id '4-3'；規格 6「4-3 封存書庫（細化）」)
//   x∈[-10, 10]、z∈[-5, 5]；東門 (↔ 墨爐間西門；墨線鎖 4-2a)、天花板梯口 (窄梯；4-1b 的折疊梯)
// 分區：後景 整面鐵皮抽屜牆、牆中央的符號櫃與四塊符號鍵、天花板梯口與折疊梯、拉繩與只畫在圖上的台階 (4-1b) ｜
//   中景 長桌上爸爸畫到一半的展開圖、東側檔案櫃裡的封存櫃 ｜ 前景 四張字條、散落的封條與積水、紙籤
// 謎題：4-3a 爸爸的展開圖 (P11 兩層：從走廊正下方那一格開始順時針讀下層四個邊格的字 → 符號櫃 → 道具 chart)、
//   4-3b 兩股墨 (P15：墨爐 W / E 兩道墨線鎖都化開 → 封存櫃)；驚嚇 = 4-3a 之後燈慢慢暗一瞬 (scare:archive)
// 文字 = content/text/zh-Hant/lvl-4-3.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, z: 2.8, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.4-3.note', mount: 'post' } as const;
/** 符號鍵的名稱 (文字 key) */
const KEY_LABEL = { book: 'lvl.4-3.key.book', drawer: 'lvl.4-3.key.drawer', seal: 'lvl.4-3.key.seal', empty: 'lvl.4-3.key.empty' } as const;
const key = (sym: 'book' | 'drawer' | 'seal' | 'empty', x: number): ObjDef =>
  ({ id: `key.${sym}`, type: 'symbolKey', sym, lock: 'symbolLock', x, y: 0.95, z: -4.2, w: 0.42, h: 0.42, d: 0.12, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: KEY_LABEL[sym] });

const objects: ObjDef[] = [
  floor(-10, 10),
  door('E', 'door', 9.8, inkSealed('4-2a')),
  // 4-1b：天花板梯口的折疊梯收著 (拉繩拉下之前爬不上去)；拉繩只在藏寶圖、要站上只畫在圖上的台階才搆得到
  hatch('U', 'door', -4.0, -4.4, { sealed: { until: '4-1b', text: 'lvl.4-1.ladder.folded' } }),
  { id: 'foldCord', type: 'foldCord', doneFlag: '4-1b', useText: 'msg.cellar.cord', x: -3.0, y: 2.6, z: -3.9, w: 0.2, h: 0.5, d: 0.2, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.4-1.cord' },
  { id: 'inkStep', type: 'inkStep', x: -2.2, y: 0, z: -3.6, w: 1.2, h: 1.4, d: 1.0, visible: '2d', solid: true, labelKey: 'lvl.4-1.inkStep' },
  // 樹根管線 (外觀；4-2a)：天花板 → 東門 (墨流回墨爐的西門)
  { id: 'pipeArchive', type: 'inkPipe', when: 'through', path: '-3.2,5.6,-4.7 2,4.4,-4.7 9.6,1.8,-1.2', x: 3.2, y: 1.8, z: -3.0, w: 0.3, h: 3.8, d: 0.3, visible: '3d', solid: false },
  // ── 後景：抽屜牆中央的符號櫃與四塊符號鍵 (4-3a) ──
  { id: 'symbolLock', type: 'symbolLock', hall: 'hall', grants: 'chart', doneFlag: '4-3a',
    solvedText: 'lvl.4-3.lock.solved', wrongText: 'lvl.4-3.lock.wrong', closedText: 'lvl.4-3.lock.closed', openText: 'lvl.4-3.lock.open',
    x: 3.0, y: 1.5, z: -4.3, w: 1.4, h: 0.8, d: 0.2, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-3.lock' },
  key('book', 1.8), key('drawer', 2.6), key('seal', 3.4), key('empty', 4.2),
  // ── 中景：長桌上爸爸畫到一半的展開圖 (4-3a 的讀法)、東側的封存櫃 (4-3b) ──
  { id: 'chartBoard', type: 'chartBoard', readText: 'lvl.4-3.chart.read', x: 1.6, y: 0.86, z: -0.8, w: 0.9, h: 0.06, d: 0.7, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.4-3.chart' },
  { id: 'sealCabinet', type: 'sealCabinet', needs: ['4-2a', 'ink.E'], doneFlag: '4-3b',
    solvedText: 'lvl.4-3.cabinet.solved', closedText: 'lvl.4-3.cabinet.closed', halfText: 'lvl.4-3.cabinet.half', openText: 'lvl.4-3.cabinet.open',
    x: 7.4, y: 0, z: -2.6, w: 1.2, h: 1.5, d: 0.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.4-3.cabinet' },
  // 驚嚇 (4-3a 之後；只影響呈現)
  { id: 'archiveScare', type: 'archiveScare', after: 'symbolLock', scare: 'archive', scareText: 'lvl.4-3.scare', x: 0, y: 0, z: 0, w: 0.6, h: 1.7, d: 0.6, visible: '3d', solid: false },
  // ── 前景：紙籤、字條 (父親的筆記；story-bible 7.3) ──
  plaque('plaqueArchive', 'lvl.ch4.archive.plaque', 0.4, 0.8, 3.0),
  { ...noteBase, id: 'noteA', x: -8.5, textKey: 'lvl.4-3.note.a' },
  { ...noteBase, id: 'noteA2', x: -5.0, textKey: 'lvl.4-3.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteB', x: 4.0, textKey: 'lvl.4-3.note.b' },
  { ...noteBase, id: 'noteB2', x: 8.0, textKey: 'lvl.4-3.note.b2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls', stone: 1 },
  { kind: 'drawerWall', x: 3.0, w: 9.0, h: 3.2, seed: 221 },
  { kind: 'rootCeiling', x: 0, w: 18, seed: 223 },
  { kind: 'longTable', x: 1.6, z: -0.8, w: 3.2, rot: 0 },
  { kind: 'stool', x: 1.0, z: 0.4, rot: 0.3 },
  { kind: 'cabinets', x: -6.4, z: -1.2, n: 2, rot: 0.25, seed: 225 },
  { kind: 'seals', x: -1.4, z: 2.4, seed: 229 },
  { kind: 'puddle', x: 5.6, z: 1.6, w: 1.6, d: 1.0 },
  { kind: 'lantern', x: -1.0, y: 3.6, z: -0.4 }
];

export const archive: LevelDef = {
  id: '4-3',
  titleKey: 'lvl.4-3.title',
  shortKey: 'lvl.ch4.archive.short',
  bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.4-3.narration',
  puzzles: [
    { id: '4-3a', titleKey: 'lvl.4-3.puzzle.a' },
    { id: '4-3b', titleKey: 'lvl.4-3.puzzle.b' }
  ],
  nextKey: 'lvl.4-3.next',
  theme: 'cellar',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第四章基礎預算)
  turnBudget: { base: 8 },
  decor,
  objects
};
