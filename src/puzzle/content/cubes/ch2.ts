// 第二章魔方 (規格 6「第二章魔方與門位（v0.4 細化）」、5.4.2、5.4.9)：2×3 (上列 y=0、下列 y=1)；列轉 / 行轉；控制盤 = 2-1 的黃銅魔方儀
//   上列：2-1 書架迴廊 (shelf)｜2-2 閱覽室 (reading)｜2-3 印房 (print)；下列：H1 夾層 (mezz)｜2-4 手稿庫 (manuscripts)｜2-5 書房深處 (deep)
//   屋框：章門入口 (來時的走廊，接衣帽間章門) 在 [0,0] 西側；章門出口 (往溫室) 在 [2,1] 東側；上列北側是一整面固定的書牆 (2-1 的 frameBay)
// 鎖扣：下列 ← 2-1a (迴廊盡頭的書擋落下)；三行 ← 2-3a (本版本沒有 2-3a：三行一直鎖著)
import type { CubeDef, CubeState } from '../../core/cube';

export const CH2_CUBE: CubeDef = {
  id: 'ch2',
  dims: [3, 2, 1],
  ops: 'rowcol',
  control: 'dial',
  cells: [
    { at: [0, 0, 0], room: 'shelf' }, { at: [1, 0, 0], room: 'reading' }, { at: [2, 0, 0], room: 'print' },
    { at: [0, 1, 0], room: 'mezz' }, { at: [1, 1, 0], room: 'manuscripts' }, { at: [2, 1, 0], room: 'deep' }
  ],
  frame: [
    { at: [0, 0, 0], side: 'W', kind: 'porch', to: 'hall' },
    { at: [2, 1, 0], side: 'E', kind: 'chapterExit', to: 'greenhouse' }
  ],
  dial: {
    entry: { room: 'shelf', obj: 'dial' },
    groups: [
      { id: 'row0', kind: 'row', index: 0 }, { id: 'row1', kind: 'row', index: 1 },
      { id: 'col0', kind: 'col', index: 0 }, { id: 'col1', kind: 'col', index: 1 }, { id: 'col2', kind: 'col', index: 2 }
    ],
    locks: [
      { group: 'row1', until: '2-1a' },
      { group: 'col0', until: '2-3a' }, { group: 'col1', until: '2-3a' }, { group: 'col2', until: '2-3a' }
    ]
  }
};

/** 抽象模型的一題 (devtools/validateCube 的 DialPuzzle 同形；content 不 import devtools) */
export interface ZonePuzzle { id: string; room: string; needs: readonly string[]; teaching?: boolean; goal?: (s: CubeState, flags: ReadonlySet<string>) => boolean }

/** 2-1 在上列的第幾行 (不在上列 = -1) */
const shelfCol = (s: CubeState): number => (s.pos.shelf && s.pos.shelf[1] === 0 ? s.pos.shelf[0] : -1);

/**
 * 2-1 區的抽象模型 (devtools/validateDial；規格 5.4.9 分區)：三行的解鎖條件 (2-3a) 在 2-3 區，所以本區只有兩列。
 * 題：2-1a = 2-1 轉到第 2 行 (書擋在書牆東段)；2-1b = 不需轉動 (P12)；2-1c 分三步 = 2-1 依序在第 1 / 2 / 0 行點亮林 / 書 / 門
 * (前一步完成才算；第一步要讀過 2-1a 倒下的書擋底座)
 */
export const CH2_ZONE21 = {
  cube: { ...CH2_CUBE, dial: { ...CH2_CUBE.dial!, groups: CH2_CUBE.dial!.groups.filter(g => g.kind === 'row'), locks: CH2_CUBE.dial!.locks.filter(l => l.group === 'row1') } } as CubeDef,
  puzzles: [
    { id: '2-1a', room: 'shelf', needs: [], teaching: true, goal: s => shelfCol(s) === 2 },
    { id: '2-1b', room: 'shelf', needs: [], teaching: true },
    { id: '2-1c.1', room: 'shelf', needs: ['2-1a'], goal: (s, f) => f.has('2-1a') && shelfCol(s) === 1 },
    { id: '2-1c.2', room: 'shelf', needs: ['2-1c.1'], goal: (s, f) => f.has('2-1c.1') && shelfCol(s) === 2 },
    { id: '2-1c', room: 'shelf', needs: ['2-1c.2'], goal: (s, f) => f.has('2-1c.2') && shelfCol(s) === 0 }
  ] as readonly ZonePuzzle[],
  start: 'shelf',
  finish: '2-1c'
};

/**
 * 2-1 + 2-2 區的抽象模型 (devtools/validateDial；規格 6「2-2 閱覽室（細化）」)：同樣只有兩列 (三行的解鎖在 2-3 區)。
 * 題：2-1 區五題 + 2-2a / 2-2b (閱覽室，不需轉動)；2-2c.lens = 在印房拿到鏡片 (要先顯影 2-2a 才知道去哪；S0 印房孤立，要轉一次上列)；
 * 2-2c = 回到閱覽室、已有空鏡框 (2-2b) 與鏡片 → 合成、讀書脊；終點 ch2.top = 2-1、2-2 兩間都通關、人在閱覽室
 */
export const CH2_ZONE22 = {
  cube: CH2_ZONE21.cube,
  puzzles: [
    ...CH2_ZONE21.puzzles,
    { id: '2-2a', room: 'reading', needs: [], teaching: true },
    { id: '2-2b', room: 'reading', needs: [], teaching: true },
    { id: '2-2c.lens', room: 'print', needs: ['2-2a'], teaching: true, goal: (_s, f) => f.has('2-2a') },
    { id: '2-2c', room: 'reading', needs: ['2-2b', '2-2c.lens'], teaching: true, goal: (_s, f) => f.has('2-2b') && f.has('2-2c.lens') },
    { id: 'ch2.top', room: 'reading', needs: ['2-1c', '2-2c'], teaching: true, goal: (_s, f) => f.has('2-1c') && f.has('2-2c') }
  ] as readonly ZonePuzzle[],
  start: 'shelf',
  finish: 'ch2.top'
};
