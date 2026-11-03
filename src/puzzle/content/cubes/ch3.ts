// 第三章魔方 (規格 6「第三章魔方與門位（v0.4 細化）」「第三章骨架與銜接」、5.4.2、5.4.9)：3×3 (北列 y=0、中列 y=1、南列 y=2)；滑動、兩個空格；控制盤 = 3-1 苗圃的園丁羅盤
//   北列：（空格）｜（空格）｜■ 工具間 (實心)；中列：3-1 苗圃 (nursery)｜3-3 夜溫室 (night)｜3-2 玻璃長廊 (gallery)；
//   南列：■ 水塔 (實心)｜H2 溫床 (bed，隱藏房占位)｜3-4 溫室深處 (depths)
//   屋框：章門入口 (來時的走廊，接書房深處的章門) 在 [0,1] 西側；天窗在 [0,0]、[1,0] 北側；章門出口 (往地下室) 在 [2,2] 南側
// 組 = 九格各一個 slideCell (c0～c8，格號 x + 3y)；沒有鎖扣 (本章的限制改由卡榫擔任，3-1b 起)
import type { CubeDef, CubeState, RoomGlass } from '../../core/cube';
import type { ZonePuzzle } from './ch2';

export type { RoomGlass } from '../../core/cube';

/**
 * 第三章各房的彩繪玻璃 (規格「第三章魔方與門位」房間表；CH3_CUBE.glass → core/chapter.lightPaths)。
 * 苗圃屋頂是木棚 (沒有玻璃)；長廊 N / W / S + 稜鏡 W↔S；夜溫室 N / S (玻璃屋頂，光直穿)；深處 N (九格花窗) / W (苔窗：被巨根蓋住，3-4b 才露出)；
 * 溫床 N / E + 稜鏡 N↔E
 */
export const CH3_GLASS: Readonly<Record<string, RoomGlass>> = {
  nursery: { glass: [] },
  gallery: { glass: ['N', 'W', 'S'], prism: [['W', 'S']] },
  night: { glass: ['N', 'S'] },
  depths: { glass: ['N', 'W'], covered: ['W'] },
  bed: { glass: ['N', 'E'], prism: [['N', 'E']] }
};

export const CH3_CUBE: CubeDef = {
  id: 'ch3',
  dims: [3, 3, 1],
  ops: 'slide',
  control: 'dial',
  cells: [
    { at: [2, 0, 0], room: 'solid', label: 'lvl.ch3.toolshed' },
    { at: [0, 1, 0], room: 'nursery' }, { at: [1, 1, 0], room: 'night' }, { at: [2, 1, 0], room: 'gallery' },
    { at: [0, 2, 0], room: 'solid', label: 'lvl.ch3.waterTower' }, { at: [1, 2, 0], room: 'bed' }, { at: [2, 2, 0], room: 'depths' }
  ],
  frame: [
    { at: [0, 1, 0], side: 'W', kind: 'porch', to: 'study' },
    { at: [0, 0, 0], side: 'N', kind: 'skylight' },
    { at: [1, 0, 0], side: 'N', kind: 'skylight' },
    { at: [2, 2, 0], side: 'S', kind: 'chapterExit', to: 'cellar' }
  ],
  dial: {
    entry: { room: 'nursery', obj: 'dial' },
    groups: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, kind: 'slideCell' as const, index: i })),
    locks: []
  },
  glass: CH3_GLASS
};

/** 苗圃此刻不在原格 [0,1] */
const nurseryAway = (s: CubeState): boolean => !!s.pos.nursery && !(s.pos.nursery[0] === 0 && s.pos.nursery[1] === 1);

/**
 * 3-1 區的抽象模型 (devtools/validateDial；規格 6「3-1 苗圃（細化）」)：九格滑動、預算各房 8；卡榫 = 苗圃 (樹根，3-1b.shrink 之前)、
 * 溫室深處 (巨根；3-4b 才縮，本區一直卡著)。題：3-1a = 苗圃 (不需轉動)；3-1b.shrink = 苗圃 (花架門開了才貼得到「小」)；
 * 3-1b = 人在苗圃、苗圃不在原格 (3-1b 的完成判定，mechanics/nursery)；終點 3-1b。三題都是教學題 (P17 / P3 首次，D16 ③ 可唯一)
 */
export const CH3_ZONE31 = {
  cube: CH3_CUBE,
  puzzles: [
    { id: '3-1a', room: 'nursery', needs: [], teaching: true },
    { id: '3-1b.shrink', room: 'nursery', needs: ['3-1a'], teaching: true, goal: (_s, f) => f.has('3-1a') },
    { id: '3-1b', room: 'nursery', needs: ['3-1b.shrink'], teaching: true, goal: (s, f) => f.has('3-1b.shrink') && nurseryAway(s) }
  ] as readonly ZonePuzzle[],
  jams: [{ room: 'nursery', until: '3-1b.shrink' }, { room: 'depths' }] as ReadonlyArray<{ room: string; until?: string; from?: string }>,
  start: 'nursery',
  finish: '3-1b'
};

/**
 * 3-2 區的抽象模型 (devtools/validateDial；規格 6「3-2 玻璃長廊（細化）」)：九格滑動、預算各房 8；卡榫 = 苗圃與溫室深處一直卡著
 * (3-1b 之前的最壞情況：證明 3-2 不需要 3-1b；苗圃鬆開的變體在測試另驗)。題 (光路條件以資料宣告，validateDial 用 core/chapter lightPaths 判定)：
 * 3-2a = 長廊從北邊照進穿過至少一間房的光 (P6 首次，教學)；3-2b = 長廊從西邊照進穿過至少兩間房的光；兩題沒有先後；
 * 終點 ch3.gallery = 兩題都完成、人在長廊 (終點標記，教學 = 不查多解)
 */
export const CH3_ZONE32 = {
  cube: CH3_CUBE,
  puzzles: [
    { id: '3-2a', room: 'gallery', needs: [], teaching: true, light: { from: 'N', via: 1 } },
    { id: '3-2b', room: 'gallery', needs: [], light: { from: 'W', via: 2 } },
    { id: 'ch3.gallery', room: 'gallery', needs: ['3-2a', '3-2b'], teaching: true, goal: (_s, f) => f.has('3-2a') && f.has('3-2b') }
  ] as readonly ZonePuzzle[],
  jams: [{ room: 'nursery' }, { room: 'depths' }] as ReadonlyArray<{ room: string; until?: string; from?: string }>,
  start: 'nursery',
  finish: 'ch3.gallery'
};
