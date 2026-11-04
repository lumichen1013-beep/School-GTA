import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 3-3 夜溫室 (第三章魔方的中心格 [1,1]；房間 id 'night'，關卡 id '3-3'；規格 6「3-3 夜溫室（細化）」)
//   x∈[-12, 12]、z∈[-5, 5]；四個拱門：N x -3.0 (後牆)、W x -11.8、E x 11.8 (z 0)、S x 3.0 (前緣、只在實景)；彩繪玻璃 N / S (玻璃屋頂)
//   燈熄了：本房主題 greenhouseNight (燈光降、天光偏藍；2D 紙底同溫室)
// 分區：後景 北拱門的半座天平 (陶盆 + 澆水壺；配平後盤腳的花窗玻璃片三)、兩座螢光蕨架 ｜ 中景 巨盆 (樹蕨；3-3a 之後被守衛殘影推進北邊的軌道)、
//   圓形花台上的月下美人、長椅 ｜ 前景 頂著南拱門的長陶槽、陶盆堆、六張字條；三帶都有可互動物件 (layoutDepthIssues)
// 謎題：
//   3-3a 隔牆的天平 (P17 / P1)：苗圃滑到夜溫室正上方 (苗圃南拱門的另一半) → 合成一座；苗圃的盆「大」或這裡的盆「小」→ 平 → 花窗玻璃片三
//   3-3b 墨只夠四步 (P4 / P3)：巨盆被推進軌道 (夜溫室卡住) → 貼「小」縮回牆內；月下美人要天窗的月光、四面拱門都不接房；墨 4 (縮小後最短 3)
//   3-3c 故意卡住 (P3)：夜溫室在 [2,1] (南拱門對溫室深處北拱門) 時陶槽「大」→ 伸進深處當墊腳 (兩房都卡住) → 深處高台上的筆記一頁
// 家具可穿過：天平、陶盆、巨盆、陶槽、花台不進碰撞。文字 = content/text/zh-Hant/lvl-3-3.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const PAN_Y = 0.72;
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-3.note', mount: 'post' } as const;
const slot = (id: string, textKey: string) => ({ id: `scale:${id}`, kind: 'noun', textKey, scale: true, noCardText: 'lvl.3-1.slot.empty' } as const);
const ARCH_KEYS = { N: 'lvl.ch3.archN', E: 'lvl.ch3.archE', S: 'lvl.ch3.archS', W: 'lvl.ch3.archW' } as const;
const arch = (side: 'N' | 'E' | 'S' | 'W', x: number): ObjDef => {
  const ew = side === 'E' || side === 'W';
  return {
    id: `arch${side}`, type: 'cubeDoor', side, kind: 'arch', x, y: 0, z: ew ? 0 : side === 'N' ? -4.8 : 4.8,
    w: ew ? 0.4 : 1.6, h: 2.4, d: ew ? 1.6 : 0.4, visible: side === 'S' ? '3d' : 'both', solid: false, interactable: true, interactIn: '3d', labelKey: ARCH_KEYS[side]
  };
};
/** 半座天平的共用文字 (夜溫室 / 苗圃) */
export const HALF_TEXT = {
  want: 'level', unjoinedText: 'lvl.3-3.half.unjoined',
  wrongText: 'lvl.3-3.half.wrong', solvedText: 'lvl.3-3.half.solved', doneFlag: '3-3a'
} as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 24, h: 1, d: 10, visible: 'both', solid: true },
  arch('N', -3.0), arch('W', -11.8), arch('E', 11.8), arch('S', 3.0),
  // ── 後景 北拱門的半座天平 (秤桿從北拱門穿出去；苗圃在正上方時接上苗圃南拱門的另一半)：盤上釘著陶盆 (可量) 與澆水壺 (重 1) ──
  { id: 'halfN', type: 'balanceHalf', door: 'archN', pans: ['potN', 'can'], pair: 'halfS', ...HALF_TEXT,
    x: -3.0, y: 0, z: -3.5, w: 1.4, h: 1.1, d: 1.0, visible: 'both', solid: false, labelKey: 'lvl.3-3.half' },
  { id: 'potN', type: 'pot', fixedText: 'lvl.3-1.pot.fixed', x: -3.25, y: PAN_Y, z: -3.6, w: 0.56, h: 0.5, d: 0.56,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.pot', label: slot('potN', 'lvl.3-1.pot') },
  { id: 'can', type: 'pot', shape: 'can', weight: 1, fixedText: 'lvl.3-3.can.fixed', x: -2.6, y: PAN_Y, z: -3.6, w: 0.5, h: 0.45, d: 0.3,
    visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-3.can' },
  { id: 'pane3', type: 'pane', under: 'halfN', grants: 'pane.3', useText: 'lvl.3-1.pane.take',
    x: -1.3, y: 0, z: -3.4, w: 0.5, h: 0.6, d: 0.12, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-2.pane' },
  // ── 中景 巨盆 (樹蕨；3-3a 之後被推進北邊的軌道：z −4.6、越過北牆 0.4) 與圓形花台上的月下美人 ──
  { id: 'bigPot', type: 'bigPot', jam: true, pushTo: [0, -4.6], pushWhen: 'halfN', scare: 'handprint', pushText: 'lvl.3-3.bigPot.push',
    standText: 'lvl.3-3.bigPot.stand', jamText: 'lvl.3-3.bigPot.jam', freeText: 'lvl.3-3.bigPot.free',
    x: 0, y: 0, z: -2.2, w: 1.6, h: 2.2, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-3.bigPot',
    label: slot('bigPot', 'lvl.3-3.bigPot') },
  { id: 'flowerMoon', type: 'sensor', from: 'N', via: 0, alone: true, mount: 'planter', beam: [6.6, 4.6, -1.6], doneFlag: '3-3b',
    closedText: 'lvl.3-3.flower.closed', whiteText: 'lvl.3-3.flower.closed', weakText: 'lvl.3-3.flower.closed', crowdText: 'lvl.3-3.flower.crowd',
    solvedText: 'lvl.3-3.flower.solved', openText: 'lvl.3-3.flower.open',
    x: 6.6, y: 0, z: -0.4, w: 0.8, h: 1.4, d: 0.8, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-3.flower' },
  // ── 前景 頂著南拱門的長陶槽 (放大 = 從南拱門伸進此刻拱門對拱門接著的那一房) ──
  { id: 'trough', type: 'pot', shape: 'trough', jam: true, protrude: 'archS', fixedText: 'lvl.3-3.trough.fixed',
    x: 3.0, y: 0, z: 3.4, w: 0.8, h: 0.6, d: 3.2, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-3.trough',
    label: slot('trough', 'lvl.3-3.trough') },
  // ── 字條 (父親的筆記；story-bible 7.3)：前景的落地木柱；L2 空白，進房 4 分鐘浮現 ──
  { ...noteBase, id: 'noteB2', x: -11.4, z: 2.8, textKey: 'lvl.3-3.note.b2', revealAfter: 240 },
  { ...noteBase, id: 'noteA2', x: -8.3, z: 2.8, textKey: 'lvl.3-3.note.a2', revealAfter: 240 },
  { ...noteBase, id: 'noteA', x: -5.2, z: 2.8, textKey: 'lvl.3-3.note.a' },
  { ...noteBase, id: 'noteC', x: 5.0, z: 2.8, textKey: 'lvl.3-3.note.c' },
  { ...noteBase, id: 'noteB', x: 8.0, z: 2.8, textKey: 'lvl.3-3.note.b' },
  { ...noteBase, id: 'noteC2', x: 11.0, z: 2.8, textKey: 'lvl.3-3.note.c2', revealAfter: 240 }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 玻璃屋頂 (北側：夜裡透進天光)；北拱門兩側的螢光蕨架
  { kind: 'glassPane', side: 'N', at: 6.0, y: 3.4, w: 5.2, h: 2.6, cols: 5, rows: 3, seed: 61 },
  { kind: 'glassPane', side: 'N', at: -8.0, y: 3.4, w: 4.0, h: 2.4, cols: 4, rows: 3, seed: 62 },
  { kind: 'glowPlants', x: -6.4, z: -4.1, n: 6, seed: 63 },
  { kind: 'glowPlants', x: 3.6, z: -4.1, n: 5, seed: 65 },
  { kind: 'pottingRack', x: -8.6, w: 2.4, seed: 66 },
  // 中景：月下美人的圓形花台 (花台畫在感光花模型裡)、面向花台的兩張長椅、地上的螢光苔
  { kind: 'bench', x: 3.6, z: -0.2, w: 1.6, rot: Math.PI / 2 - 0.2 },
  { kind: 'bench', x: 9.4, z: 1.0, w: 1.6, rot: -Math.PI / 2 - 0.3 },
  { kind: 'glowPlants', x: -6.0, z: -0.4, n: 4, seed: 69 },
  { kind: 'planter', x: -7.6, z: 0.4, w: 2.4, d: 1.0, rot: 0.15, seed: 67 },
  { kind: 'bench', x: -4.4, z: 0.9, w: 1.8, rot: -0.3 },
  // 前景：陶盆堆、西南角的蕨、熄掉的吊燈；西拱門外側的樹根
  { kind: 'pots', x: 0.4, z: 4.0, n: 4, seed: 71 },
  { kind: 'pots', x: -9.8, z: 4.0, n: 3, seed: 73, fern: 1 },
  { kind: 'pots', x: 9.6, z: 4.2, n: 3, seed: 74 },
  { kind: 'pendant', x: -4.0, z: -1.0 },
  { kind: 'pendant', x: 5.0, z: 1.0 },
  { kind: 'roots', x: -11.9, side: 'W', seed: 75 }
];

export const night: LevelDef = {
  id: '3-3',
  titleKey: 'lvl.3-3.title',
  bounds: { minX: -12, maxX: 12, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.3-3.narration',
  puzzles: [
    { id: '3-3a', titleKey: 'lvl.3-3.puzzle.a' },
    { id: '3-3b', titleKey: 'lvl.3-3.puzzle.b' },
    { id: '3-3c', titleKey: 'lvl.3-3.puzzle.c' }
  ],
  nextKey: 'lvl.3-3.next',
  theme: 'greenhouseNight',
  // 每次穿門進房補滿 8 滴墨；3-3b 未完成時 4 (規格 5.4.9 第三章 P4：縮小後最短 3 + 1)
  turnBudget: { base: 8, puzzles: { '3-3b': 4 } },
  decor,
  objects
};
