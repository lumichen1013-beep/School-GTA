// 第四章魔方 (規格 6「第四章魔方與門位（v0.4 細化）」「第四章骨架與銜接」、5.4.2、5.4.9)：3×3×2 (z=1 上層 根窖層、z=0 下層 墨爐層)；
// 層轉 (一整層繞垂直軸轉 90°，位置與朝向一起轉)；控制盤 = 4-1 根窖走廊的年輪根盤
//   上層：4-1 根窖走廊 (hall) 在北邊 [1,0,1]、根井 (well，裝飾房：樹根梯井) 在中心 [1,1,1]，其餘空格
//   下層：4-2 墨爐間 (furnace) 在中心 [1,1,0]、4-3 封存書庫 (archive) 在西邊 [0,1,0]、4-4 最後的抽屜 (drawer) 在東邊 [2,1,0]、
//         H3 封存室 (sealed，隱藏房占位) 在南邊 [1,2,0]，其餘空格
//   屋框：入口 (從溫室深處下來的石階) 在 [1,0,1] 北側；天窗 (溫室的玻璃地板透下來的月光) 在 [1,2,1] 上側；章門出口 (往閣樓的木梯) 在 [1,0,0] 北側
// 層轉是整層剛體旋轉：同一層的門轉完照樣對著同一間房，會變的只有上下梯口 (U / D) 與屋框。沒有實心格 (含實心格的層轉不動)
// 組 = L0 (下層)、L1 (上層)；鎖扣 (根結)：L0 在 4-1c 完成前鎖著 (落下的木箱壓住抽屜的踏板，下圈年輪鬆開)
import type { CubeDef, CubeState, RoomGlass, RoomPipes } from '../../core/cube';
import type { ZonePuzzle } from './ch2';

/**
 * 第四章的樹根管線 (墨流 P15；規格 6「4-2 墨爐間（細化）」；本地門位)：墨爐 = 源頭 (爐頂 U 往上爬；墨爐閥 ink.valve 打開才流)、匯點 W / E (兩扇門的墨線鎖)；
 * 根井 D↔N、走廊 S↔D、封存書庫 U↔E、抽屜 U↔W。唯一會變的路口 = 走廊的地板梯口疊在哪一間上
 */
export const CH4_INK: Readonly<Record<string, RoomPipes>> = {
  furnace: { source: 'U', valve: 'ink.valve', sinks: ['W', 'E'] },
  well: { pipes: [['D', 'N']] },
  hall: { pipes: [['S', 'D']] },
  archive: { pipes: [['U', 'E']] },
  drawer: { pipes: [['U', 'W']] }
};

/** 第四章的玻璃 / 格柵 (光往下走 4-2b)：走廊 U / D (鐵格柵，光直穿)；封存書庫 U / E + 稜鏡 U↔E；墨爐間 W (朝書庫那面牆上的玻璃眼) */
export const CH4_GLASS: Readonly<Record<string, RoomGlass>> = {
  hall: { glass: ['U', 'D'] },
  archive: { glass: ['U', 'E'], prism: [['U', 'E']] },
  furnace: { glass: ['W'] }
};

export const CH4_CUBE: CubeDef = {
  id: 'ch4',
  dims: [3, 3, 2],
  ops: 'layer',
  control: 'dial',
  cells: [
    { at: [1, 0, 1], room: 'hall' }, { at: [1, 1, 1], room: 'well' },
    { at: [0, 1, 0], room: 'archive' }, { at: [1, 1, 0], room: 'furnace' }, { at: [2, 1, 0], room: 'drawer' }, { at: [1, 2, 0], room: 'sealed' }
  ],
  frame: [
    { at: [1, 0, 1], side: 'N', kind: 'porch', to: 'greenhouseStair' },
    { at: [1, 2, 1], side: 'U', kind: 'skylight' },
    { at: [1, 0, 0], side: 'N', kind: 'chapterExit', to: 'attic' }
  ],
  dial: {
    entry: { room: 'hall', obj: 'dial' },
    groups: [{ id: 'L0', kind: 'layer', index: 0 }, { id: 'L1', kind: 'layer', index: 1 }],
    locks: [{ group: 'L0', until: '4-1c', text: 'lvl.ch4.locked' }]
  },
  glass: CH4_GLASS,
  ink: CH4_INK
};

/** 走廊的地板梯口此刻疊在哪一間房上 (同一格位的下層；沒有 = null) */
const belowHall = (s: CubeState): string | null => {
  const h = s.pos.hall;
  if (!h) return null;
  const r = Object.entries(s.pos).find(([, c]) => c[0] === h[0] && c[1] === h[1] && c[2] === h[2] - 1);
  return r ? r[0] : null;
};

/**
 * 4-1 區的抽象模型 (devtools/validateDial；規格 6「4-1 根窖走廊（細化）」4-1 區抽象模型)：兩層、預算各房 8；鎖扣 L0 until 4-1c。
 * 題：4-1a = 走廊的地板梯口此刻接到房 (教學：第一次爬下去)；4-1b = 走到封存書庫 (拉繩不需轉動；書庫天花板梯口的折疊梯在它之前爬不上去 = doorLocks)；
 * 4-1c = 地板梯口疊在抽屜上 (木箱推進拱門形梯口；需 4-1a)；終點 ch4.hall = 三題都完成、人在走廊。
 * 封門 (墨線鎖四扇、書庫的折疊梯) 由 dialModelOf 從 cubeDoor.sealed 組出
 */
export const CH4_ZONE41 = {
  cube: CH4_CUBE,
  puzzles: [
    { id: '4-1a', room: 'hall', needs: [], teaching: true, goal: s => belowHall(s) === 'archive' || belowHall(s) === 'drawer' },
    { id: '4-1b', room: 'archive', needs: [] },
    { id: '4-1c', room: 'hall', needs: ['4-1a'], goal: (s, f) => f.has('4-1a') && belowHall(s) === 'drawer' },
    { id: 'ch4.hall', room: 'hall', needs: ['4-1a', '4-1b', '4-1c'], teaching: true, goal: (_s, f) => f.has('4-1a') && f.has('4-1b') && f.has('4-1c') }
  ] as readonly ZonePuzzle[],
  start: 'hall',
  finish: 'ch4.hall'
};

/**
 * 4-2 區的抽象模型 (devtools/validateDial；規格 6「4-2 墨爐間（細化）」4-2 區抽象模型)：起點 = 4-1 完成 (4-1c、4-1b 以不需轉動的教學題代表：
 * 一開始就成立 → 下層鬆開、書庫的折疊梯放下)。題：ink.E = 東門的墨線鎖收到墨 (教學、不計題：封門 until 用)；4-2a = 西門的墨線鎖收到墨 (P15 首次教學)；
 * 4-2b = 墨爐的玻璃眼有從西邊 (本地) 照進、穿過兩間房的光；4-2c = 抽屜在下層西邊 (需 4-2b)；終點 ch4.furnace = 三題都完成、人在墨爐間
 */
export const CH4_ZONE42 = {
  cube: CH4_CUBE,
  puzzles: [
    { id: '4-1c', room: 'hall', needs: [], teaching: true },
    { id: '4-1b', room: 'archive', needs: [], teaching: true },
    { id: 'ink.E', room: 'furnace', needs: [], teaching: true, ink: { side: 'E' } },
    { id: '4-2a', room: 'furnace', needs: [], teaching: true, ink: { side: 'W' } },
    { id: '4-2b', room: 'furnace', needs: ['4-1c'], light: { from: 'W', via: 2 }, goal: (_s, f) => f.has('4-1c') },
    { id: '4-2c', room: 'furnace', needs: ['4-2b'], goal: (s, f) => f.has('4-2b') && !!s.pos.drawer && s.pos.drawer[0] === 0 && s.pos.drawer[1] === 1 },
    { id: 'ch4.furnace', room: 'furnace', needs: ['4-2a', '4-2b', '4-2c'], teaching: true, goal: (_s, f) => f.has('4-2a') && f.has('4-2b') && f.has('4-2c') }
  ] as readonly ZonePuzzle[],
  start: 'hall',
  finish: 'ch4.furnace'
};

/**
 * 4-3 區的抽象模型 (devtools/validateDial；規格 6「4-3 封存書庫（細化）」4-3 區抽象模型)：起點同 4-2 區 (4-1c、4-1b 以不需轉動的教學題代表)。
 * 題：4-2a = 墨爐西門的墨線鎖 (教學)、ink.E = 西門化開之後再把墨轉給東門 (4-3b 的轉動量在這一題)；4-3a = 走進封存書庫 (資訊題：讀法不需轉動，正確性由讀法表與腳本驗)；
 * 4-3b = 兩道墨線鎖都化開、人在書庫；終點 ch4.archive = 兩題都完成、人在書庫
 */
export const CH4_ZONE43 = {
  cube: CH4_CUBE,
  puzzles: [
    { id: '4-1c', room: 'hall', needs: [], teaching: true },
    { id: '4-1b', room: 'archive', needs: [], teaching: true },
    { id: '4-2a', room: 'furnace', needs: [], teaching: true, ink: { side: 'W' } },
    // 4-3b 的轉動 = 第二股墨 (西門化開之後再轉給東門)：多解列舉量在 ink.E (需 4-2a)；4-3b 本身只是兩道都化開後走進書庫
    { id: 'ink.E', room: 'furnace', needs: ['4-2a'], goal: (_s, f) => f.has('4-2a'), ink: { side: 'E' } },
    { id: '4-3a', room: 'archive', needs: [], teaching: true },
    { id: '4-3b', room: 'archive', needs: ['4-2a', 'ink.E'], teaching: true, goal: (_s, f) => f.has('4-2a') && f.has('ink.E') },
    { id: 'ch4.archive', room: 'archive', needs: ['4-3a', '4-3b'], teaching: true, goal: (_s, f) => f.has('4-3a') && f.has('4-3b') }
  ] as readonly ZonePuzzle[],
  start: 'hall',
  finish: 'ch4.archive'
};
