// 第五章魔方 (規格 6「第五章魔方與門位（v0.4 細化）」「第五章共用規則」「第五章骨架與銜接」、5.4.9)：3×3×3 (z=2 頂層、z=1 中層、z=0 底層)；
// 切片轉 (三條中間片：東西軸 X1、南北軸 Y1、上下軸 Z1；朝向 24 種)；控制盤 = 5-1 天窗間的觀星儀
//   頂層：5-1 天窗間 (sky) 在頂面心 [1,1,2]、梁上走道 A (walkA) 在 [1,2,2]
//   中層：梁上走道 C (walkC) [0,0,1]、5-4 北窗 (north) [1,0,1]、5-3 西窗 (west) [0,1,1]、6-1 林心草地 (meadow，核心) [1,1,1]、5-2 東窗 (east) [2,1,1]、
//         樓梯口 (landing，裝飾房：入口) [1,2,1]、梁上走道 D (walkD) [2,2,1]
//   底層：梁上走道 B (walkB) [0,1,0]、5-5 最後的機關 (engine) [1,1,0]
//   屋框：入口 (地下室往上的木梯) 在 [1,2,1] 南側；天窗 (星圖) 在 [1,1,2] 上側；三扇窗外的星空在 [2,1,1] 東側、[0,1,1] 西側、[1,0,1] 北側
// 中間片只搬動面心與稜：房間只在 6 個面之間換位、朝外的那一面永遠朝外；房間之間靠稜上的走廊格 (corridors) 相通。角與其餘稜是空格
// 組 = X1 / Y1 / Z1 (中間片) + 窗框 SE / SW / SN (spin：那扇窗的房間原地轉；星釘鎖到 5-2 / 5-3 / 5-4，且只在人在那間窗房時可轉)。
// 縮影的頂 / 底 (ST / SB，miniOnly) 與終章的真外圈 (FE / FW / FN / FT) 逐關加入 (5-1a、6-1)
import type { CubeDef, CubeState, TurnGroup } from '../../core/cube';
import type { ZonePuzzle } from './ch2';

/** 三條中間片 (觀星儀一啟動就開；骨架區只開這三條) */
export const CH5_MIDDLE: readonly TurnGroup[] = [
  { id: 'X1', kind: 'slice', axis: 'x', index: 1 },
  { id: 'Y1', kind: 'slice', axis: 'y', index: 1 },
  { id: 'Z1', kind: 'slice', axis: 'z', index: 1 }
];

/** 星釘 (外圈的星環被銀釘釘住) 的說明 */
const NAILED = 'lvl.ch5.locked';

export const CH5_CUBE: CubeDef = {
  id: 'ch5',
  dims: [3, 3, 3],
  ops: 'slice',
  control: 'dial',
  cells: [
    { at: [1, 1, 2], room: 'sky' }, { at: [1, 2, 2], room: 'walkA' },
    { at: [0, 0, 1], room: 'walkC' }, { at: [1, 0, 1], room: 'north' },
    { at: [0, 1, 1], room: 'west' }, { at: [1, 1, 1], room: 'meadow' }, { at: [2, 1, 1], room: 'east' },
    { at: [1, 2, 1], room: 'landing' }, { at: [2, 2, 1], room: 'walkD' },
    { at: [0, 1, 0], room: 'walkB' }, { at: [1, 1, 0], room: 'engine' }
  ],
  frame: [
    { at: [1, 2, 1], side: 'S', kind: 'porch', to: 'cellarLadder' },
    // 天窗與三扇窗外的星空：只是窗 (wall)，門轉到這裡 = 門後是牆
    { at: [1, 1, 2], side: 'U', kind: 'skylight', wall: true },
    { at: [2, 1, 1], side: 'E', kind: 'skylight', to: 'starE', wall: true },
    { at: [0, 1, 1], side: 'W', kind: 'skylight', to: 'starW', wall: true },
    { at: [1, 0, 1], side: 'N', kind: 'skylight', to: 'starN', wall: true }
  ],
  corridors: ['walkA', 'walkB', 'walkC', 'walkD'],
  dial: {
    entry: { room: 'sky', obj: 'dial' },
    groups: [
      ...CH5_MIDDLE,
      { id: 'SE', kind: 'spin', index: 0, room: 'east' },
      { id: 'SW', kind: 'spin', index: 0, room: 'west' },
      { id: 'SN', kind: 'spin', index: 0, room: 'north' }
    ],
    locks: [
      { group: 'SE', until: '5-2', rooms: ['east'], text: NAILED },
      { group: 'SW', until: '5-3', rooms: ['west'], text: NAILED },
      { group: 'SN', until: '5-4', rooms: ['north'], text: NAILED }
    ]
  }
};

/** 骨架區用的魔方 (規格「第五章骨架與銜接」驗證)：只開三條中間片 (窗框的星釘在本步打不開，不進排列) */
export const CH5_MIDDLE_CUBE: CubeDef = { ...CH5_CUBE, dial: { ...CH5_CUBE.dial!, groups: CH5_MIDDLE, locks: [] } };

/** 房間 room 此刻在哪個面 (面心格朝外的方位；不在面心 = null) */
export function faceOf(s: CubeState, room: string): 'N' | 'S' | 'E' | 'W' | 'U' | 'D' | null {
  const c = s.pos[room];
  if (!c) return null;
  const [x, y, z] = c;
  if (y === 1 && z === 1) return x === 2 ? 'E' : x === 0 ? 'W' : null;
  if (x === 1 && z === 1) return y === 0 ? 'N' : y === 2 ? 'S' : null;
  if (x === 1 && y === 1) return z === 2 ? 'U' : z === 0 ? 'D' : null;
  return null;
}

/**
 * 骨架區的抽象模型 (devtools/validateDial；規格「第五章骨架與銜接」骨架的驗證)：只開中間片、每房墨 10。
 * 題 = 走得到三扇窗 (教學：骨架沒有謎題，只量「從天窗間出發最少幾轉接得到」)；終點 = 走到該窗
 */
export const CH5_ZONE_SKELETON = {
  cube: CH5_MIDDLE_CUBE,
  reach: (room: 'east' | 'west' | 'north'): { puzzles: readonly ZonePuzzle[]; start: string; finish: string } => ({
    puzzles: [{ id: `reach.${room}`, room, needs: [], teaching: true }],
    start: 'landing',
    finish: `reach.${room}`
  })
};
