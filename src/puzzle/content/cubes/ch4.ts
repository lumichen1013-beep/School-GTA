// 第四章魔方 (規格 6「第四章魔方與門位（v0.4 細化）」「第四章骨架與銜接」、5.4.2、5.4.9)：3×3×2 (z=1 上層 根窖層、z=0 下層 墨爐層)；
// 層轉 (一整層繞垂直軸轉 90°，位置與朝向一起轉)；控制盤 = 4-1 根窖走廊的年輪根盤
//   上層：4-1 根窖走廊 (hall) 在北邊 [1,0,1]、根井 (well，裝飾房：樹根梯井) 在中心 [1,1,1]，其餘空格
//   下層：4-2 墨爐間 (furnace) 在中心 [1,1,0]、4-3 封存書庫 (archive) 在西邊 [0,1,0]、4-4 最後的抽屜 (drawer) 在東邊 [2,1,0]、
//         H3 封存室 (sealed，隱藏房占位) 在南邊 [1,2,0]，其餘空格
//   屋框：入口 (從溫室深處下來的石階) 在 [1,0,1] 北側；天窗 (溫室的玻璃地板透下來的月光) 在 [1,2,1] 上側；章門出口 (往閣樓的木梯) 在 [1,0,0] 北側
// 層轉是整層剛體旋轉：同一層的門轉完照樣對著同一間房，會變的只有上下梯口 (U / D) 與屋框。沒有實心格 (含實心格的層轉不動)
// 組 = L0 (下層)、L1 (上層)；鎖扣 (根結)：L0 在 4-1c 完成前鎖著 (落下的木箱壓住抽屜的踏板，下圈年輪鬆開)
import type { CubeDef, CubeState } from '../../core/cube';
import type { ZonePuzzle } from './ch2';

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
  }
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
