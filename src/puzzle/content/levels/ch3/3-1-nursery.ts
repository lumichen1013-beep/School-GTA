import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 3-1 苗圃 (第三章魔方的中列第 0 行；房間 id 'nursery'，關卡 id '3-1'；規格 6「3-1 苗圃（細化）」)
//   x∈[-6, 8]、z∈[-5, 5]；西門 (入口：S0 接來時的走廊)、東拱門 (S0 接夜溫室西拱門)、南拱門 (前緣、只在實景；S0 面對水塔 = 牆)；屋頂是木棚
// 分區：入口工具區 (西：掛板上的建築比例尺、工作台上的園丁羅盤、劇情字條) ｜ 育苗區 (中：花秤與兩個陶盆、育苗架、長椅) ｜
//   樹根角 (東北，花架門後：北牆鑽進來的樹根、根前的花窗玻璃片；南側只在實景的高育苗架)；三帶都有可互動物件 (layoutDepthIssues)
// 謎題：
//   (路段) 建築比例尺：3D 拿 → 道具 / 能力 scale + 尺度卡「大」「小」
//   3-1a 一大一小 (P17 首次)：花秤兩盤各一個陶盆 (原 2 = 2)；往西倒 → 繩子拉起花架門 (閂住)。解：西盆「大」或東盆「小」
//   3-1b 卡住的軌道 (P3 首次)：樹根越過北牆 (z -5.2) = 苗圃卡住；貼「小」→ 縮回牆內 → 苗圃第一次滑出原格 = 完成；根前露出花窗玻璃片一
//     (花架門關著時藏寶圖上的樹根被花架蓋住：標籤 after 'trellis'——實景走東側走道到樹根的 x 再切藏寶圖也貼不到)
// 家具可穿過：樹根、花秤、陶盆、工作台不進碰撞；擋路的只有花架門 (兩個視角) 與高育苗架 (只在實景)
// 文字 = content/text/zh-Hant/lvl-3-1.ts、lvl-ch3.ts；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const PAN_Y = 0.72;
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-1.note' } as const;
const pot = (id: string, x: number): ObjDef => ({
  id, type: 'pot', fixedText: 'lvl.3-1.pot.fixed', x, y: PAN_Y, z: -0.6, w: 0.56, h: 0.5, d: 0.56,
  visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.pot',
  label: { id: `scale:${id}`, kind: 'noun', textKey: 'lvl.3-1.pot', scale: true, noCardText: 'lvl.3-1.slot.empty' }
});

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 1, y: -1, z: 0, w: 14, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', frameText: 'lvl.ch3.doorW.frame', x: -5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.doorW' },
  { id: 'archE', type: 'cubeDoor', side: 'E', kind: 'arch', x: 7.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.archE' },
  { id: 'archS', type: 'cubeDoor', side: 'S', kind: 'arch', x: 3.0, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.archS' },
  // ── 入口工具區：工作台上的園丁羅盤 (fixedCells = 盤上兩格實心：工具間 [2,0]、水塔 [0,2])、西牆掛板上的建築比例尺 ──
  { id: 'dial', type: 'dial', chapter: 3, useText: 'lvl.3-1.dial.activated', readyText: 'lvl.3-1.dial.ready', fixedCells: [[2, 0], [0, 2]],
    x: -3.6, y: 0, z: -3.7, w: 1.6, h: 1.2, d: 0.8, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.dial' },
  { id: 'ruler', type: 'ruler', grants: 'scale', also: ['card.da', 'card.xiao'], useText: 'lvl.3-1.ruler.take',
    x: -5.85, y: 0.9, z: -1.7, w: 0.15, h: 0.9, d: 0.5, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.ruler' },
  // ── 育苗區：花秤 (兩盤各釘一個陶盆；往西倒 = 拉起花架門) ──
  { id: 'balance', type: 'balance', pans: { W: ['potW'], E: ['potE'] }, want: 'W', opens: 'trellis', doneFlag: '3-1a',
    solvedText: 'lvl.3-1.balance.solved', wrongText: 'lvl.3-1.balance.wrong',
    x: 1.6, y: 0, z: -0.6, w: 3.6, h: 1.1, d: 0.9, visible: 'both', solid: false, labelKey: 'lvl.3-1.balance' },
  pot('potW', 0.4), pot('potE', 2.8),
  // ── 樹根角 (東北)：花架門 (西側；兩個視角都擋)、高育苗架 (南側；只在實景)、樹根 (卡榫)、根前的花窗玻璃片 ──
  { id: 'trellis', type: 'trellis', lockedRead: 'lvl.3-1.trellis.closed', x: 4.6, y: 0, z: -3.65, w: 0.2, h: 2.0, d: 2.7, visible: 'both', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.trellis' },
  { id: 'shelfS', type: 'pottingShelf', x: 6.28, y: 0, z: -2.3, w: 3.44, h: 1.6, d: 0.5, visible: '3d', solid: true, labelKey: 'lvl.3-1.shelf' },
  { id: 'root', type: 'root', jam: true, home: [0, 1], doneFlag: '3-1b',
    jamText: 'lvl.3-1.root.jam', freeText: 'lvl.3-1.root.free', doneText: 'lvl.3-1.root.done', freedText: 'lvl.3-1.root.freed',
    x: 7.2, y: 0, z: -4.4, w: 1.0, h: 1.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.root',
    label: { id: 'scale:root', kind: 'noun', textKey: 'lvl.3-1.root', scale: true, noCardText: 'lvl.3-1.slot.empty', after: 'trellis' } },
  { id: 'pane1', type: 'pane', under: 'root', grants: 'pane.1', useText: 'lvl.3-1.pane.take',
    x: 7.2, y: 0, z: -3.3, w: 0.5, h: 0.6, d: 0.12, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-1.pane' },
  // ── 字條 (父親的筆記；story-bible 7.3)：比例尺旁的劇情字條、3-1a L1 (前景)、3-1b L1 (花架門外的前景) ──
  { ...noteBase, id: 'noteStory', mount: 'post', x: -5.3, z: -3.2, textKey: 'lvl.3-1.note.story' },
  { ...noteBase, id: 'noteA', mount: 'post', x: -2.3, z: 2.8, textKey: 'lvl.3-1.note.a' },
  { ...noteBase, id: 'noteB', mount: 'post', x: 5.2, z: 2.8, textKey: 'lvl.3-1.note.b' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 入口工具區：西牆的工具掛板 (比例尺掛在上面)；前景的長椅斜放、面向花秤
  { kind: 'toolBoard', z: -1.7, w: 1.6 },
  { kind: 'bench', x: -3.4, z: 3.4, w: 1.6, rot: 0.35 },
  // 育苗區：靠後牆的育苗架 (花秤後面)、中景兩座育苗床 (走道繞過)、前景一簇陶盆
  { kind: 'pottingRack', x: 1.2, w: 2.6, seed: 31 },
  { kind: 'planter', x: -1.6, z: 0.9, w: 2.2, d: 0.9, rot: 0.18, seed: 3 },
  { kind: 'planter', x: 5.6, z: 1.3, w: 2.0, d: 0.9, rot: -0.22, seed: 7 },
  { kind: 'pots', x: 0.9, z: 3.4, n: 5, seed: 11 },
  // 樹根角：花架門後的苔與落葉 (地上)；南拱門旁的陶盆
  { kind: 'pots', x: 6.6, z: 3.8, n: 3, seed: 13, fern: 1 },
  { kind: 'pendant', x: -3.4, z: -2.6 },
  { kind: 'pendant', x: 1.6, z: 0.6 }
];

export const nursery: LevelDef = {
  id: '3-1',
  titleKey: 'lvl.3-1.title',
  bounds: { minX: -6, maxX: 8, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -3, y: 0, z: 1.5 },
  narrationKey: 'lvl.3-1.narration',
  puzzles: [
    { id: '3-1a', titleKey: 'lvl.3-1.puzzle.a' },
    { id: '3-1b', titleKey: 'lvl.3-1.puzzle.b' }
  ],
  nextKey: 'lvl.3-1.next',
  theme: 'greenhouse',
  // 每次穿門進房補滿 8 滴墨 (規格 5.4.9 第三章基礎預算；3-1b 最短 1 + 教學 3 = 4 ≤ 8)
  turnBudget: { base: 8 },
  decor,
  objects
};
