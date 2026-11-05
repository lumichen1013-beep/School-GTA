import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 3-4 溫室深處 (第三章魔方的南列右格 [2,2] = 章門格；房間 id 'depths'，關卡 id '3-4'；規格 6「3-4 溫室深處（細化）」)
//   x∈[-10, 62]、z∈[-5, 5]：主室 x∈[-10, 12] + 東邊的追逐長廊 x∈[12, 62]；北拱門 x 0 (後牆)、南章門 x 61.0 (長廊盡頭的前緣、只在實景；要 key.greenhouse；
//   設計 61.2 的門框東緣會與東牆共面，內移 0.2)
//   彩繪玻璃 N (九格花窗) / W (苔窗：被巨根蓋著，3-4b 才露出；CH3_GLASS.depths)
// 分區：後景 北牆的九格花窗、窗下的花窗架與彈出的抽屜、3-3c 的高台與筆記一頁、面向花窗的長椅 ｜ 中景 西牆鑽進來的巨根與它背後的苔窗、木樁上的紙籤、
//   舊的羅盤架與面向它的木凳 ｜ 前景 石板小徑與四張字條、大蕨 ｜ 長廊 柵門、墨牆 / 鐵柵交替六道、兩側花槽與玻璃屋頂、盡頭的章門
// 謎題：
//   3-4a 月下的花窗 (P5 / P6)：花窗架嵌上三片玻璃 (固定動作) → 九格花窗的六格剪影 (苗圃 [1,2]、西邊上兩格空、深處 [2,2]、兩格實心) +
//     三格玻璃片 = 月光的路 (天窗 → 夜溫室 → 溫床的稜鏡 → 長廊的稜鏡 → 深處北窗) → 「許」字亮 → 抽屜 (房間的銅鑰匙 + 手記第三頁)、柵門打開
//   3-4b 長進軌道的根 (P3 / P6)：唯一的「小」從巨盆拿來貼巨根 (夜溫室又卡住) → 苔窗露出、深處鬆開 → 西邊穿過兩間房的光 (溫床的稜鏡往東) → 爸爸的字、墨補滿
// 家具可穿過：巨根、花窗架、羅盤架、長椅、花槽不進碰撞；擋路的只有地板、高台、柵門與長廊的墨牆 / 鐵柵。
// 追逐 1 (N19，不計題)：柵門內側的守衛殘影 chaser (只在藏寶圖、只在 2D 碰得到；預兆線 13 / 觸發線 19 / 終點線 60.5、出生點 12.0、
//   被追上回 (14, 0, 0)、速度 2.6、被追上 3 次後 ×0.8、預兆 3 秒；完成旗標 chase:3-4；減弱緊張效果 = 過預兆線直接通過)。
// 章門打開 = 第三章通關 (記入 3-1～3-4；第四章占位：通關畫面沒有「前往」)。文字 = content/text/zh-Hant/lvl-3-4.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const noteBase = { type: 'note', y: 1.0, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-4.note', mount: 'post' } as const;
/** 長廊的墨牆 (只在藏寶圖：要在實景通過) / 鐵柵 (只在實景：要在藏寶圖通過)；1-1 同型 */
const inkwall = (id: string, x: number): ObjDef => ({ id, type: 'inkwall', x, y: 0, z: 0, w: 0.5, h: 6, d: 10, visible: '2d', solid: true });
const bars = (id: string, x: number): ObjDef => ({ id, type: 'bars', x, y: 0, z: 0, w: 0.3, h: 4, d: 10, visible: '3d', solid: true });

/** 九格花窗要的排列 (列優先 x + 3y)：北列 月 (空)｜玻璃片｜磚 (工具間)；中列 月 (空)｜玻璃片｜玻璃片；南列 磚 (水塔)｜幼苗 (苗圃)｜樹根 (深處) */
export const LATTICE_CELLS = ['empty', 'any', 'solid', 'empty', 'any', 'any', 'solid', 'nursery', 'depths'] as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 26, y: -1, z: 0, w: 72, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'archN', type: 'cubeDoor', side: 'N', kind: 'arch', x: 0, y: 0, z: -4.8, w: 1.6, h: 2.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.archN' },
  // ── 後景 北牆的九格花窗、窗下的花窗架 (嵌三片玻璃)、字亮了才彈出的抽屜；花窗西側是 3-3c 的高台與筆記一頁 (座標不動) ──
  { id: 'lattice', type: 'lattice', cells: LATTICE_CELLS, light: { from: 'N', via: 3 }, frame: 'paneFrame', doneFlag: '3-4a',
    readText: 'lvl.3-4.lattice.read', patternText: 'lvl.3-4.lattice.pattern', lightText: 'lvl.3-4.lattice.light', solvedText: 'lvl.3-4.lattice.solved', doneText: 'lvl.3-4.lattice.done',
    x: 4.0, y: 1.7, z: -4.95, w: 3.0, h: 3.0, d: 0.1, visible: 'both', solid: false, labelKey: 'lvl.3-4.lattice' },
  { id: 'paneFrame', type: 'paneFrame', parts: ['pane.1', 'pane.2', 'pane.3'], okText: 'lvl.3-4.frame.ok', missingText: 'lvl.3-4.frame.missing', lattice: 'lattice',
    x: 4.0, y: 0, z: -4.45, w: 1.8, h: 1.2, d: 0.7, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-4.frame' },
  { id: 'latticeBox', type: 'latticeBox', grants: 'key.greenhouse', also: ['diary.3'], revealedBy: 'lattice', useText: 'lvl.3-4.box.take',
    x: 4.6, y: 0.6, z: -3.9, w: 0.6, h: 0.3, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-4.box' },
  { id: 'ledge', type: 'ledge', readText: 'lvl.3-3.ledge.read', x: 1.85, y: 0, z: -4.55, w: 2.0, h: 1.9, d: 0.9, visible: 'both', solid: true, interactable: true, interactIn: '3d', labelKey: 'lvl.3-3.ledge' },
  { id: 'pageGarden', type: 'page', grants: 'page.garden', useText: 'lvl.3-3.page.take', doneFlag: '3-3c',
    x: 1.85, y: 1.9, z: -4.55, w: 0.4, h: 0.08, d: 0.3, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-3.page' },
  // ── 中景西 巨根 (越過西牆 0.4 = 卡榫；標籤在花窗亮之前被苔蓋著) 與它背後的苔窗 (西牆的彩繪玻璃；沒有花的感光窗) ──
  { id: 'giantRoot', type: 'giantRoot', usedWhen: 'mossW', jam: true, stayShrunk: true, covers: 'W',
    x: -9.0, y: 0, z: 0.6, w: 2.8, h: 2.6, d: 2.4, visible: 'both', solid: false, labelKey: 'lvl.3-4.root',
    label: { id: 'scale:giantRoot', kind: 'noun', textKey: 'lvl.3-4.root', scale: true, noCardText: 'lvl.3-1.slot.empty', after: 'lattice' } },
  { id: 'mossW', type: 'sensor', from: 'W', via: 2, mount: 'wall', coveredBy: 'giantRoot', beam: [-9.95, 2.6, 0.6], doneFlag: '3-4b',
    coveredText: 'lvl.3-4.moss.covered', closedText: 'lvl.3-4.moss.closed', whiteText: 'lvl.3-4.moss.weak', weakText: 'lvl.3-4.moss.weak',
    solvedText: 'lvl.3-4.moss.solved', openText: 'lvl.3-4.moss.open',
    x: -9.9, y: 1.5, z: 0.6, w: 0.2, h: 2.2, d: 2.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.3-4.moss' },
  { id: 'plaqueRoot', type: 'remark', textKey: 'lvl.ch3.depths.plaqueRoot', x: -7.0, y: 0.75, z: -1.6, w: 1.4, h: 0.42, d: 0.04, visible: '3d', solid: false, interactable: true, labelKey: 'lvl.ch3.plaque' },
  // ── 中景中 舊的羅盤架 (盤面不見了、把手磨亮：開場旁白的依據) ──
  { id: 'oldCompass', type: 'oldCompass', readText: 'lvl.3-4.compass.read',
    x: -0.6, y: 0, z: 0.9, w: 0.8, h: 1.0, d: 0.8, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.3-4.compass' },
  // ── 前景 石板小徑旁的字條 (西兩張 = 3-4b、東兩張 = 3-4a；L2 空白，進房 4 分鐘浮現) ──
  { ...noteBase, id: 'noteB', x: -6.2, z: 2.8, textKey: 'lvl.3-4.note.b' },
  { ...noteBase, id: 'noteB2', x: -3.0, z: 2.8, textKey: 'lvl.3-4.note.b2', revealAfter: 240 },
  { ...noteBase, id: 'noteA', x: 6.8, z: 2.8, textKey: 'lvl.3-4.note.a' },
  { ...noteBase, id: 'noteA2', x: 10.6, z: 2.8, textKey: 'lvl.3-4.note.a2', revealAfter: 240 },
  // ── 長廊 (追逐 1 的場地)：入口的鐵柵門 (花窗亮了才開)；墨牆 / 鐵柵交替六道 (全深：只能切換視角通過)；盡頭南側的章門 ──
  { id: 'chaseGate', type: 'chaseGate', opensWhen: 'lattice', x: 12.2, y: 0, z: 0, w: 0.3, h: 2.6, d: 10, visible: 'both', solid: true, labelKey: 'lvl.3-4.gate' },
  inkwall('inkA', 24), bars('barsA', 31), inkwall('inkB', 38), bars('barsB', 45), inkwall('inkC', 52), bars('barsC', 59),
  // 守衛殘影 (推導物件：不進快照)：起跑時落後 19.0 − 12.0 − 0.6 = 6.4；每段切換窗 7 / 3.2 ≈ 2.2 秒
  { id: 'chaser', type: 'chaser', derived: true, omenX: 13.0, triggerX: 19.0, endX: 60.5, resetX: 12.5, spawnX: 12.0, checkpoint: { x: 14.0, y: 0, z: 0 },
    speed: 2.6, assistAfter: 3, assistFactor: 0.8, omenSec: 3, gate: 'chaseGate', flag: 'chase:3-4', caughtText: 'lvl.3-4.chase.caught',
    x: 12.0, y: 0, z: 0, w: 0.6, h: 1.7, d: 0.6, visible: '2d', solid: false },
  { id: 'chapterS', type: 'cubeDoor', side: 'S', kind: 'chapter', key: 'key.greenhouse', doneFlag: '3-4',
    x: 61.0, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch3.chapterS' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  // 後景：花窗兩側的螢光蕨、北拱門西側的陶盆；面向花窗的石長椅 (朝北)
  { kind: 'glowPlants', x: 6.6, z: -4.2, n: 4, seed: 111 },
  { kind: 'pots', x: -2.0, z: -4.0, n: 2, seed: 113, fern: 1 },
  { kind: 'bench', x: 4.0, z: -1.7, w: 1.8, rot: Math.PI },
  // 中景西：根腳撐破的陶盆、地上的苔、紙籤的木樁
  { kind: 'pots', x: -7.4, z: -1.0, n: 3, seed: 115 },
  { kind: 'glowPlants', x: -7.6, z: 2.0, n: 3, seed: 117 },
  { kind: 'stake', x: -7.0, z: -1.67, h: 1.25 },
  // 中景中：舊羅盤架前的地毯與面向它的木凳 (朝北)
  { kind: 'rug', x: -0.6, z: 1.4, w: 2.6, d: 2.2 },
  { kind: 'bench', x: -0.6, z: 2.2, w: 0.8, rot: Math.PI },
  // 前景：由西往東通到柵門的石板小徑、兩盆大蕨；吊燈
  { kind: 'stonePath', x0: -9.4, x1: 12.0, z: 3.9, seed: 119 },
  { kind: 'pots', x: 1.8, z: 4.3, n: 2, seed: 121, fern: 1 },
  { kind: 'pots', x: 8.7, z: 4.3, n: 2, seed: 123, fern: 1 },
  { kind: 'pendant', x: 2.6, z: -0.8 },
  { kind: 'pendant', x: -5.2, z: 0.4 },
  // 長廊：兩側矮花槽、玻璃屋頂、熄掉的吊燈、地上的虛線邊框、盡頭往下的石階 (同材質合併、玻璃格 InstancedMesh)
  { kind: 'chaseHall', x0: 12.5, x1: 62, seed: 125 }
];

export const depths: LevelDef = {
  id: '3-4',
  titleKey: 'lvl.3-4.title',
  bounds: { minX: -10, maxX: 62, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -1.5, y: 0, z: 1.5 },
  narrationKey: 'lvl.3-4.narration',
  puzzles: [
    { id: '3-4a', titleKey: 'lvl.3-4.puzzle.a' },
    { id: '3-4b', titleKey: 'lvl.3-4.puzzle.b' },
    { id: '3-4', titleKey: 'lvl.3-4.puzzle.door' }
  ],
  nextKey: 'lvl.3-4.next',
  theme: 'greenhouse',
  // 每次穿門進房補滿 8 滴墨；3-4b 閂住的那一刻也補滿 (苔窗上的字還是濕的；規格「3-4 溫室深處（細化）」)
  turnBudget: { base: 8, refillOn: ['3-4b'], refillText: 'lvl.3-4.refill' },
  decor,
  objects
};
