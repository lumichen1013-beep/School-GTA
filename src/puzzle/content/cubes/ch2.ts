// 第二章魔方 (規格 6「第二章魔方與門位（v0.4 細化）」、5.4.2、5.4.9)：2×3 (上列 y=0、下列 y=1)；列轉 / 行轉；控制盤 = 2-1 的黃銅魔方儀
//   上列：2-1 書架迴廊 (shelf)｜2-2 閱覽室 (reading)｜2-3 印房 (print)；下列：H1 夾層 (mezz)｜2-4 手稿庫 (manuscripts)｜2-5 書房深處 (deep)
//   屋框：章門入口 (來時的走廊，接衣帽間章門) 在 [0,0] 西側；章門出口 (往溫室) 在 [2,1] 東側；上列北側是一整面固定的書牆 (2-1 的 frameBay)
// 鎖扣：下列 ← 2-1a (迴廊盡頭的書擋落下)；三行 ← 2-3a (印房的門牌寫成「間」)
import type { CubeDef, CubeState, Side } from '../../core/cube';

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

/** 題目條件可用的跨房資訊 (devtools/validateCube 的 GoalCtx 同形)：此刻的連接表 (含讀作「間」的門) */
interface ZoneLink { from: { room: string; door: string }; to: { room: string; door: string } | { frame: string } }
/** 抽象模型的一題 (devtools/validateCube 的 DialPuzzle 同形；content 不 import devtools) */
/** 區模型的一題 (devtools DialPuzzle 的內容版)；light = 第三章光路條件 (這間房要有從 from 進來、穿過至少 via 間房的光；validateDial 以 core/chapter lightPaths 判定) */
export interface ZonePuzzle {
  id: string; room: string; needs: readonly string[]; teaching?: boolean;
  goal?: (s: CubeState, flags: ReadonlySet<string>, ctx: { links(): readonly ZoneLink[] }) => boolean;
  light?: { from: Side; via: number };
}

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

/** 這扇門此刻接到哪一間房 (沒接到房 = null) */
const linkedTo = (ls: readonly ZoneLink[], room: string, door: string): string | null => {
  const l = ls.find(x => x.from.room === room && x.from.door === door);
  return l && 'room' in l.to ? l.to.room : null;
};
/** from → to、剛好 hops 扇門的簡單路線是否存在 (經過洞位的不算：洞旁沒有刻字；mechanics/print routeCodes 同規則) */
export function hasRoute(ls: readonly ZoneLink[], from: string, to: string, hops: number): boolean {
  const walk = (room: string, seen: readonly string[], n: number): boolean => {
    if (n === hops) return room === to;
    return ls.some(l => l.from.room === room && 'room' in l.to && !l.from.door.startsWith('hole') && !seen.includes(l.to.room) && walk(l.to.room, [...seen, l.to.room], n + 1));
  };
  return walk(from, [from], 0);
}

/**
 * 2-3 區的抽象模型 (devtools/validateDial；規格 6「2-3 印房（細化）」)：兩列 + 三行全列 (三行鎖在 2-3a)；印房南拱門在 2-3a 之後讀作「間」。
 * 題：2-1a (下列的鎖扣)；2-3a = 走進印房 (要轉一次上列)；2-3b = 印房東門接迴廊、南拱門接閱覽室 (P4，墨 3)；
 * 2-3c = 手稿庫、此刻有一條剛好三扇門的路線 (印房 → … → 手稿庫)；終點 2-3c
 */
export const CH2_ZONE23 = {
  cube: CH2_CUBE,
  puzzles: [
    { id: '2-1a', room: 'shelf', needs: [], teaching: true, goal: s => shelfCol(s) === 2 },
    { id: '2-3a', room: 'print', needs: [], teaching: true },
    { id: '2-3b', room: 'print', needs: ['2-3a'], teaching: true, goal: (_s, f, c) => f.has('2-3a') && linkedTo(c.links(), 'print', 'doorE') === 'shelf' && linkedTo(c.links(), 'print', 'archS') === 'reading' },
    { id: '2-3c', room: 'manuscripts', needs: ['2-3b'], teaching: true, goal: (_s, f, c) => f.has('2-3b') && hasRoute(c.links(), 'print', 'manuscripts', 3) }
  ] as readonly ZonePuzzle[],
  plates: [{ room: 'print', door: 'archS', when: '2-3a' }],
  start: 'shelf',
  finish: '2-3c'
};

/** 2-4a 的目標排列 (手稿櫃門上的圖；content/levels/ch2/drawing HOUSE_TARGET 同值) */
const HOUSE: Readonly<Record<string, readonly [number, number]>> = { reading: [0, 0], shelf: [1, 0], mezz: [2, 0], print: [0, 1], manuscripts: [1, 1], deep: [2, 1] };
const isHouse = (s: CubeState): boolean => Object.entries(HOUSE).every(([r, at]) => s.pos[r]?.[0] === at[0] && s.pos[r]?.[1] === at[1]);

/**
 * 2-4 區的抽象模型 (devtools/validateDial；規格 6「2-4 手稿庫（細化）」)：兩列 + 三行；印房南拱門在 2-3a 之後讀作「間」。
 * 題：2-1a / 2-3a (兩個鎖扣)；2-4c = 手稿庫 (不需轉動)；2-4b.clue = 走進印房讀到線索② (要轉一次)；2-4b = 回到手稿庫 (需 2-4c、2-4b.clue)；
 * 2-4a = 手稿庫、排列 = 手稿櫃的圖 (需 2-3a：三行)；終點 ch2.mid = 2-4a、2-4b 都完成
 */
export const CH2_ZONE24 = {
  cube: CH2_CUBE,
  puzzles: [
    { id: '2-1a', room: 'shelf', needs: [], teaching: true, goal: s => shelfCol(s) === 2 },
    { id: '2-3a', room: 'print', needs: [], teaching: true },
    { id: '2-4c', room: 'manuscripts', needs: [], teaching: true },
    { id: '2-4b.clue', room: 'print', needs: [] },
    // 2-4b = 拿著兩條線索走回手稿庫 (走路；轉動的部分在 2-4b.clue，本質不同 2 種) → 不計 D16 唯一解
    { id: '2-4b', room: 'manuscripts', needs: ['2-4c', '2-4b.clue'], teaching: true, goal: (_s, f) => f.has('2-4c') && f.has('2-4b.clue') },
    { id: '2-4a', room: 'manuscripts', needs: ['2-3a'], teaching: true, goal: (s, f) => f.has('2-3a') && isHouse(s) },
    { id: 'ch2.mid', room: 'manuscripts', needs: ['2-4a', '2-4b'], teaching: true, goal: (_s, f) => f.has('2-4a') && f.has('2-4b') }
  ] as readonly ZonePuzzle[],
  plates: [{ room: 'print', door: 'archS', when: '2-3a' }],
  start: 'shelf',
  finish: 'ch2.mid'
};

/**
 * 2-5 區的抽象模型 (devtools/validateDial；規格 6「2-5 書房深處（細化）」)：兩列 + 三行；印房南拱門在 2-3a 之後讀作「間」。
 * 題：2-1a / 2-3a (兩個鎖扣)；2-5.tray = 人在印房、南拱門此刻接到書房深處北牆的洞 (鉛字盤推得過去)；
 * 2-5 = 人在書房深處、書房深處回到 [2,1] (章門只接這一格的東側屋框)、鉛字盤已推過去 (跟著房間走)；終點 2-5。三枚齒與柄以前三關完成抽象
 */
export const CH2_ZONE25 = {
  cube: CH2_CUBE,
  puzzles: [
    { id: '2-1a', room: 'shelf', needs: [], teaching: true, goal: s => shelfCol(s) === 2 },
    { id: '2-3a', room: 'print', needs: [], teaching: true },
    { id: '2-5.tray', room: 'print', needs: ['2-3a'], goal: (_s, f, c) => f.has('2-3a') && linkedTo(c.links(), 'print', 'archS') === 'deep' },
    // 2-5 = 帶著鉛字盤回到 [2,1] 的書房深處 (轉動的部分在 2-5.tray 與帶回；BFS 的起點常已在 [2,1] → 不計 D16 唯一解)
    { id: '2-5', room: 'deep', needs: ['2-5.tray'], teaching: true, goal: (s, f) => f.has('2-5.tray') && s.pos.deep?.[0] === 2 && s.pos.deep?.[1] === 1 }
  ] as readonly ZonePuzzle[],
  plates: [{ room: 'print', door: 'archS', when: '2-3a' }],
  start: 'shelf',
  finish: '2-5'
};
