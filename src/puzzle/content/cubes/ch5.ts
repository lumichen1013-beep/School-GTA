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

/** 縮影的頂層 / 底層 (5-1a P10：只在縮影裡轉得到；ST = 頂面心、SB = 底面心那一格的房原地轉) */
export const CH5_MINI: readonly TurnGroup[] = [
  { id: 'ST', kind: 'spin', axis: 'z', index: 2 },
  { id: 'SB', kind: 'spin', axis: 'z', index: 0 }
];

/**
 * 5-1a 星圖對上觀星儀的刻度 (規格「5-1 天窗間（細化）」)：天窗間在頂面心、從上往下看順時針轉了四分之一圈 (朝向 1)，
 * 樓梯口與三扇窗都在原位、原朝向 (觀星儀外環上的四個刻度)。中間片永遠做不到 (面心的扭轉同位性；拿掉縮影則無解)，縮影的頂層 ↻ 一次即成
 */
export const CH5_ALIGN = {
  room: 'sky', at: [1, 1, 2] as const, rot: 1,
  home: { landing: [1, 2, 1] as const, east: [2, 1, 1] as const, west: [0, 1, 1] as const, north: [1, 0, 1] as const }
};

/** CH5_ALIGN 此刻成立 (mechanics/attic alignState 的同一條件；validateDial 的 goal) */
export function skyAligned(s: CubeState): boolean {
  const at = (r: string, c: readonly number[]) => { const p = s.pos[r]; return !!p && p[0] === c[0] && p[1] === c[1] && p[2] === c[2]; };
  return at(CH5_ALIGN.room, CH5_ALIGN.at) && (s.rot[CH5_ALIGN.room] ?? 0) === CH5_ALIGN.rot
    && Object.entries(CH5_ALIGN.home).every(([r, c]) => at(r, c) && (s.rot[r] ?? 0) === 0);
}

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
      { id: 'SN', kind: 'spin', index: 0, room: 'north' },
      // 縮影的頂層 / 底層 (5-1a / 5-1b)：頂面心 / 底面心那一格的房原地轉 (從上往下看順時針)；只在縮影裡轉得到 (miniOnly)
      ...CH5_MINI
    ],
    miniOnly: ['ST', 'SB'],
    // 5-1b：縮影底層的軌道被桌上的齒輪卡住 (齒輪量成「小」掉出軌道 = 旗標 gear)；底層第一次轉 = 縮影 (sky.mini) used = 5-1b
    // 你站在縮影的屋頂上 = 天窗間：天窗間不在頂面心時縮影對不上這棟房子 (頂 / 底都轉不動)
    jams: [
      { group: 'ST', home: { room: 'sky', at: [1, 1, 2] }, text: 'lvl.5-1.miniAway' },
      { group: 'SB', home: { room: 'sky', at: [1, 1, 2] }, text: 'lvl.5-1.miniAway' },
      { group: 'SB', until: 'gear', text: 'lvl.5-1.jammed' }
    ],
    marks: [{ group: 'SB', obj: 'mini' }],
    locks: [
      { group: 'SE', until: '5-2', rooms: ['east'], text: NAILED },
      { group: 'SW', until: '5-3', rooms: ['west'], text: NAILED },
      { group: 'SN', until: '5-4', rooms: ['north'], text: NAILED }
    ]
  }
};

/** 骨架區用的魔方 (規格「第五章骨架與銜接」驗證)：只開三條中間片 (窗框的星釘在本步打不開，不進排列) */
export const CH5_MIDDLE_CUBE: CubeDef = { ...CH5_CUBE, dial: { ...CH5_CUBE.dial!, groups: CH5_MIDDLE, locks: [], miniOnly: [], jams: [], marks: [] } };

/** 5-1 區用的魔方：中間片 + 縮影的頂 / 底 (窗框的星釘在 5-1 打不開，不進排列) */
export const CH5_SKY_CUBE: CubeDef = { ...CH5_CUBE, dial: { ...CH5_CUBE.dial!, groups: [...CH5_MIDDLE, ...CH5_MINI], locks: [] } };
/** 5-1 縮影子模型用的魔方：只有縮影的頂 / 底 (中間片對 5-1 兩題沒有用處，另以 CH5_ZONE51_MIDDLE 驗證) */
export const CH5_MINI_CUBE: CubeDef = { ...CH5_CUBE, dial: { ...CH5_CUBE.dial!, groups: CH5_MINI, locks: [] } };

/**
 * 5-1 區 (一) 中間片 + 縮影 (devtools/validateDial；規格「5-1 天窗間（細化）」抽象模型)：卡片與齒輪不進模型 (縮影在天窗間隨時進得去)、
 * 只有 5-1a；房 = 樓梯口與天窗間 (天窗間只接得到樓梯口)。量「中間片當干擾」：可達排列、卡死、多解；只用中間片則無解 (排列層級另驗)
 */
export const CH5_ZONE51_MIDDLE = {
  cube: CH5_SKY_CUBE,
  // 多解列舉只到 3 步 (span)：中間片當干擾時墨 10 的完整列舉太大；最短 1 / 次短 3 已在其內
  puzzles: [{ id: '5-1a', room: 'sky', needs: [], teaching: true, span: 3, goal: (s: CubeState) => skyAligned(s) }] as readonly ZonePuzzle[],
  mini: { room: 'sky' },
  start: 'landing',
  finish: '5-1a'
};

/**
 * 5-1 區 (二) 縮影子模型 (devtools/validateDial；規格「5-1 天窗間（細化）」抽象模型)：只有縮影的頂 / 底 (中間片見上)；人從樓梯口開章 (天窗間啟動觀星儀)。
 * 卡片：唯一的「小」在手上 / 標籤「你」(self) / 齒輪 (gear)，都在天窗間貼取；「小」在你身上 = 縮小：穿不過門、轉得到縮影的頂 / 底 (mini)。
 * 題：5-1a = 星圖對上刻度 (skyAligned)；gear = 齒輪量成「小」(閂住)；5-1b = 齒輪掉出軌道後，縮影的底層轉一次 (turn SB)；
 * 終點 ch5.sky = 兩題都完成 (天窗間通關)
 */
export const CH5_ZONE51 = {
  cube: CH5_MINI_CUBE,
  puzzles: [
    { id: '5-1a', room: 'sky', needs: [], teaching: true, goal: (s: CubeState) => skyAligned(s) },
    { id: 'gear', room: 'sky', needs: [], teaching: true, card: 'xiao@gear' },
    { id: '5-1b', room: 'sky', needs: ['gear'], turn: 'SB' },
    { id: 'ch5.sky', room: 'sky', needs: ['5-1a', '5-1b'], teaching: true, goal: (_s: CubeState, f: ReadonlySet<string>) => f.has('5-1a') && f.has('5-1b') }
  ] as readonly ZonePuzzle[],
  cards: [{ id: 'xiao', start: 'hand', slots: { self: { room: 'sky' }, gear: { room: 'sky' } } }],
  mini: { room: 'sky', card: 'xiao@self' },
  start: 'landing',
  finish: 'ch5.sky'
};

/** 5-1 完成後的排列 (5-2～5-4 區的起點)：S0 + 天窗間朝向 1 (5-1a 星圖對上刻度) + 機關朝向 1 (5-1b 縮影的底層 ↻ 一次) */
export const CH5_AFTER51: CubeState = (() => {
  const pos = Object.fromEntries(CH5_CUBE.cells.map(c => [c.room, c.at]));
  const rot = Object.fromEntries(CH5_CUBE.cells.map(c => [c.room, 0]));
  return { pos, rot: { ...rot, sky: 1, engine: 1 } };
})();

/** 5-2 區用的魔方：中間片 + 東窗的窗框 (SE：5-2 之後、只在東窗) */
export const CH5_EAST_CUBE: CubeDef = {
  ...CH5_CUBE,
  dial: { ...CH5_CUBE.dial!, groups: [...CH5_MIDDLE, CH5_CUBE.dial!.groups.find(g => g.id === 'SE')!], locks: CH5_CUBE.dial!.locks.filter(l => l.group === 'SE'), miniOnly: [], jams: [], marks: [] }
};

/**
 * 5-2 區 (devtools/validateDial；規格「5-2 東窗（細化）」抽象模型)：中間片 + 東窗的窗框；起點 = 5-1 完成 (CH5_AFTER51，人在天窗間)。
 * 題：5-2 = 人在東窗、東窗在底面心 (窗朝下：倒影；詞卡在東窗的星表匣，隨時拿得到 → 不進模型)；SE.turn = 窗框鬆開後在東窗轉一次 (終點)
 */
export const CH5_ZONE52 = {
  cube: CH5_EAST_CUBE,
  puzzles: [
    { id: '5-2', room: 'east', needs: [], goal: (s: CubeState) => faceOf(s, 'east') === 'D' },
    { id: 'SE.turn', room: 'east', needs: ['5-2'], teaching: true, turn: 'SE' }
  ] as readonly ZonePuzzle[],
  startCube: CH5_AFTER51,
  start: 'sky',
  finish: 'SE.turn'
};

/** 5-3 區用的魔方：中間片 + 西窗的窗框 (SW：5-3 之後、只在西窗) */
export const CH5_WEST_CUBE: CubeDef = {
  ...CH5_CUBE,
  dial: { ...CH5_CUBE.dial!, groups: [...CH5_MIDDLE, CH5_CUBE.dial!.groups.find(g => g.id === 'SW')!], locks: CH5_CUBE.dial!.locks.filter(l => l.group === 'SW'), miniOnly: [], jams: [], marks: [] }
};

/**
 * 5-3 區 (devtools/validateDial；規格「5-3 西窗（細化）」抽象模型)：中間片 + 西窗的窗框；起點 = 5-1 完成 (CH5_AFTER51，人在天窗間)。
 * 題：parchment = 人在東窗 (許問津的空白羊皮紙隨時拿得到)；5-3 = 人在西窗、手上有羊皮紙 (墨水瓶在西窗、合成台在西窗 → 不進模型)。
 * 東窗與西窗是對面的面心 (任何排列都不直接相連)：兩題之間一定要經過一間橋房。
 * 窗框 SW 鬆開後轉一次 (SW.turn) 不進本模型：加上第三題狀態超過 2×10⁶ (2,029,770)；由 levels/5-3 實跑驗證
 */
export const CH5_ZONE53 = {
  cube: CH5_WEST_CUBE,
  puzzles: [
    { id: 'parchment', room: 'east', needs: [] },
    { id: '5-3', room: 'west', needs: ['parchment'], goal: (_s: CubeState, f: ReadonlySet<string>) => f.has('parchment') }
  ] as readonly ZonePuzzle[],
  startCube: CH5_AFTER51,
  start: 'sky',
  finish: '5-3'
};

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
