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

/** 苗圃此刻在夜溫室正上方 (苗圃南拱門對夜溫室北拱門 = 兩座半座天平合成一座；3-3a) */
const nurseryAboveNight = (s: CubeState): boolean => !!s.pos.nursery && !!s.pos.night && s.pos.nursery[0] === s.pos.night[0] && s.pos.nursery[1] === s.pos.night[1] - 1;
/** 夜溫室此刻四面的門都不接任何房 (月下美人：沒人經過) */
const nightAlone = (ls: readonly { from: { room: string }; to: object }[]): boolean => !ls.some(l => l.from.room === 'night' && 'room' in l.to);
/** 夜溫室南拱門此刻拱門對拱門接溫室深處 (3-3c：陶槽從南拱門伸進深處) */
const nightOnDepths = (ls: readonly { from: { room: string; door: string }; to: object; kind?: string }[]): boolean =>
  ls.some(l => l.from.room === 'night' && l.from.door === 'archS' && 'room' in l.to && (l.to as { room: string }).room === 'depths' && l.kind === 'arch');

/**
 * 3-3 區的抽象模型 (devtools/validateDial；規格 6「3-3 夜溫室（細化）」)：九格滑動、預算各房 8、夜溫室 3-3b 未完成時 4。
 * 題：3-1b.shrink / 3-1b (苗圃；教學，同 3-1 區：樹根縮回土裡之後「小」可以拿去別處)；3-3a = 苗圃在夜溫室正上方 (需 3-1b)；
 * 3-3b.shrink = 巨盆貼「小」(不需轉動；需 3-3a：巨盆在 3-3a 之後才被推進軌道)；3-3b = 夜溫室有從北邊照進來的光、四面不接房 (P4 預算 4；不縮 = 無解)；
 * 3-3c.grow = 夜溫室南拱門接深處時陶槽「大」(需比例尺 = 3-1b.shrink)；3-3c = 走進深處拿高台上的筆記一頁；終點 ch3.night = 三題都完成、人在夜溫室。
 * 卡榫：苗圃 until 3-1b.shrink、深處一直卡著、夜溫室 from 3-3a until 3-3b.shrink (巨盆)、夜溫室 from 3-3c.grow until 3-3c (陶槽)。
 * 尺度卡的階段旗標近似：3-3b.shrink 之後「小」一直在巨盆上；3-3c 用「大」(3-3a 若用了「大」，閂住之後取回)
 */
export const CH3_ZONE33 = {
  cube: CH3_CUBE,
  puzzles: [
    { id: '3-1b.shrink', room: 'nursery', needs: [], teaching: true },
    { id: '3-1b', room: 'nursery', needs: ['3-1b.shrink'], teaching: true, goal: (s, f) => f.has('3-1b.shrink') && nurseryAway(s) },
    { id: '3-3a', room: 'night', needs: ['3-1b'], goal: (s, f) => f.has('3-1b') && nurseryAboveNight(s) },
    { id: '3-3b.shrink', room: 'night', needs: ['3-3a'], teaching: true, goal: (_s, f) => f.has('3-3a') },
    { id: '3-3b', room: 'night', needs: ['3-3b.shrink'], light: { from: 'N', via: 0 }, excluded: { name: 'no-shrink (bigPot)', minSteps: Infinity },
      goal: (_s, f, ctx) => f.has('3-3b.shrink') && nightAlone(ctx.links()) },
    { id: '3-3c.grow', room: 'night', needs: ['3-1b.shrink'], goal: (_s, f, ctx) => f.has('3-1b.shrink') && nightOnDepths(ctx.links()) },
    { id: '3-3c', room: 'depths', needs: ['3-3c.grow'], teaching: true, goal: (_s, f) => f.has('3-3c.grow') },
    { id: 'ch3.night', room: 'night', needs: ['3-3a', '3-3b', '3-3c'], teaching: true, goal: (_s, f) => f.has('3-3a') && f.has('3-3b') && f.has('3-3c') }
  ] as readonly ZonePuzzle[],
  jams: [
    { room: 'nursery', until: '3-1b.shrink' }, { room: 'depths' },
    { room: 'night', from: '3-3a', until: '3-3b.shrink' }, { room: 'night', from: '3-3c.grow', until: '3-3c' }
  ] as ReadonlyArray<{ room: string; until?: string; from?: string }>,
  start: 'nursery',
  finish: 'ch3.night'
};
