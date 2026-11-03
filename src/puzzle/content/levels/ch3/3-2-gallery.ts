import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 3-2 玻璃長廊 (第三章魔方的中列第 2 行；房間 id 'gallery'，關卡 id '3-2'；規格 6「3-2 玻璃長廊（細化）」)
//   x∈[-10, 10] (骨架 [-8, 8] 加寬：四張字條要任一 16 單位寬的畫面 ≤ 3 張)、z∈[-5, 5]；西門 (S0 接夜溫室東拱門)、南門 (前緣、只在實景；S0 接溫室深處北拱門)
//   彩繪玻璃 (CH3_GLASS.gallery)：北窗、西窗、南窗 (前緣，實景看不到)；稜鏡 W↔S (吊在西南角)；從北邊進來的光照直走出南窗
// 分區：西端窗台 (西窗下與窗台同高的木花架、架上的西窗感光花、花開後的殘片 2) ｜ 北窗花台 (兩座育苗床夾著北窗感光花、盆腳的花窗玻璃片二、紙籤) ｜
//   中段走道 (面向花台的長椅、南側盆栽) ｜ 前景 (南門與大蕨、四張字條的落地木柱)；三帶都有可互動物件 (layoutDepthIssues)
// 謎題 (光路 N26；P6 首次)：
//   3-2a 彩繪玻璃：北窗感光花要穿過玻璃的光從北邊進來 (via ≥ 1)：夜溫室 ▲、長廊 ◀ → 花開、花窗玻璃片二 (3D 拿)
//   3-2b 光要轉彎：西窗感光花要從西邊進來、穿過至少兩間房 (via ≥ 2)：夜溫室 ▲、溫床 ▲ (天窗 → 夜溫室 → 溫床稜鏡 → 長廊西窗) → 殘片 2 (2D 拿)
// 家具可穿過：花台、長椅、窗台花架、盆栽不進碰撞；光不是實體。文字 = content/text/zh-Hant/lvl-3-2.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-2.note', mount: 'post' } as const;
/** 感光花共用的文字 (白光 / 光不夠) */
const flowerText = { whiteText: 'lvl.3-2.flower.white', weakText: 'lvl.3-2.flower.weak' } as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 20, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', x: -9.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.doorW' },
  { id: 'doorS', type: 'cubeDoor', side: 'S', kind: 'door', x: -2.4, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.doorS' },
  // ── 北窗花台 (後景)：北窗感光花 (3-2a；落地大陶盆)、盆腳的花窗玻璃片二 (花開才在場)、花台東端的紙籤 ──
  { id: 'flowerN', type: 'sensor', from: 'N', via: 1, ...flowerText, closedText: 'lvl.3-2.flowerN.closed', solvedText: 'lvl.3-2.flowerN.solved', openText: 'lvl.3-2.flowerN.open',
    beam: [2.4, 3.0, -4.95], mount: 'floor', doneFlag: '3-2a',
    x: 2.4, y: 0, z: -3.9, w: 0.7, h: 1.3, d: 0.7, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-2.flower' },
  { id: 'pane2', type: 'pane', under: 'flowerN', grants: 'pane.2', useText: 'lvl.3-2.pane.take',
    x: 3.05, y: 0, z: -3.5, w: 0.5, h: 0.6, d: 0.12, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-2.pane' },
  { id: 'plaqueN', type: 'remark', textKey: 'lvl.ch3.gallery.plaqueN', x: 6.6, y: 0.95, z: -4.88, w: 1.4, h: 0.42, d: 0.04, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.ch3.plaque' },
  // ── 西端窗台：西窗下的木花架 (台面與窗台同高，畫在感光花的模型裡) 上的西窗感光花 (3-2b)、花開後架上的老宅圖殘片 2 (只在藏寶圖拿) ──
  { id: 'flowerW', type: 'sensor', from: 'W', via: 2, ...flowerText, closedText: 'lvl.3-2.flowerW.closed', solvedText: 'lvl.3-2.flowerW.solved', openText: 'lvl.3-2.flowerW.open',
    beam: [-9.95, 2.6, -2.6], mount: 'stand', doneFlag: '3-2b',
    x: -8.95, y: 1.1, z: -2.6, w: 0.5, h: 0.9, d: 0.5, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-2.flower' },
  { id: 'scrap2', type: 'scrap', grants: 'scrap.2', useText: 'lvl.3-2.scrap.got', revealedBy: 'flowerW',
    x: -8.4, y: 1.1, z: -2.0, w: 0.36, h: 0.26, d: 0.08, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.3-2.scrap' },
  // ── 字條 (父親的筆記；story-bible 7.3)：前景的落地木柱，西兩張 = 3-2b (L1、L2)、東兩張 = 3-2a (L1、L2)；L2 空白，進房 4 分鐘浮現 ──
  { ...noteBase, id: 'noteB', x: -6.8, z: 2.6, textKey: 'lvl.3-2.note.b' },
  { ...noteBase, id: 'noteB2', x: -3.6, z: 2.6, textKey: 'lvl.3-2.note.b2', revealAfter: 240 },
  { ...noteBase, id: 'noteA', x: 4.8, z: 2.8, textKey: 'lvl.3-2.note.a' },
  { ...noteBase, id: 'noteA2', x: 9.4, z: 2.8, textKey: 'lvl.3-2.note.a2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 北窗花台 (後景)：北牆的大彩繪玻璃窗、窗下兩座育苗床夾著北窗感光花；西段靠牆的育苗架
  { kind: 'glassPane', side: 'N', at: 2.4, y: 3.0, w: 4.2, h: 2.6, cols: 4, rows: 3, seed: 41 },
  { kind: 'planter', x: -0.1, z: -4.05, w: 3.0, d: 0.8, rot: 0, seed: 45 },
  { kind: 'planter', x: 4.9, z: -4.05, w: 3.0, d: 0.8, rot: 0, seed: 46 },
  { kind: 'pottingRack', x: -5.6, w: 2.6, seed: 52 },
  // 西端窗台：西牆的彩繪玻璃窗 (窗下的木花架畫在西窗感光花的模型裡)、西南角的稜鏡吊飾、角落的蕨
  { kind: 'glassPane', side: 'W', at: -2.6, y: 2.6, w: 2.2, h: 2.0, cols: 2, rows: 3, seed: 43 },
  { kind: 'prism', x: -8.8, y: 2.6, z: 3.6 },
  { kind: 'pots', x: -9.1, z: 4.0, n: 3, seed: 51, fern: 1 },
  // 中段走道：北側兩張長椅面向北窗花台、南側三簇盆栽、兩盞吊燈
  { kind: 'bench', x: 0.4, z: -1.5, w: 1.8, rot: Math.PI },
  { kind: 'bench', x: 4.6, z: -1.6, w: 1.8, rot: Math.PI - 0.12 },
  { kind: 'pots', x: -5.2, z: 1.6, n: 3, seed: 47 },
  { kind: 'pots', x: -0.8, z: 1.8, n: 4, seed: 48 },
  { kind: 'pots', x: 6.6, z: 1.7, n: 3, seed: 49 },
  { kind: 'pendant', x: -4.0, z: 0 },
  { kind: 'pendant', x: 4.0, z: 0 },
  // 前景：南門旁的兩叢大蕨、東段面向北的長椅
  { kind: 'pots', x: -4.2, z: 4.1, n: 2, seed: 53, fern: 1 },
  { kind: 'pots', x: -0.6, z: 4.1, n: 2, seed: 54, fern: 1 },
  { kind: 'bench', x: 6.8, z: 4.0, w: 1.8, rot: Math.PI }
];

export const gallery: LevelDef = {
  id: '3-2',
  titleKey: 'lvl.3-2.title',
  bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -8, y: 0, z: 1.5 },
  narrationKey: 'lvl.3-2.narration',
  puzzles: [
    { id: '3-2a', titleKey: 'lvl.3-2.puzzle.a' },
    { id: '3-2b', titleKey: 'lvl.3-2.puzzle.b' }
  ],
  nextKey: 'lvl.3-2.next',
  theme: 'greenhouse',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第三章基礎預算；本房兩題最短各 2)
  turnBudget: { base: 8 },
  decor,
  objects
};
