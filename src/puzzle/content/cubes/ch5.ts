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
import type { CubeDef, CubeState, Side, TurnGroup } from '../../core/cube';
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

/**
 * 5-5a 地板被重畫 (規格「5-5 最後的機關（細化）」設計前提)：三扇窗都完成之後第一次走進機關，閣樓被排成這個樣子 (DialDef.redraw)。
 * = 5-1 完成後的排列 (CH5_AFTER51) → 西窗的窗框 ↻ → 縮影的底層 ↺ → 東西軸 ↺ → 上下軸 ↺ → 東西軸 ↺ → 上下軸 ↻ → 東西軸 ↻
 * (天窗間在頂面、機關在底面 (朝向 0)；東窗在北面、西窗在南面 (看不見星星)、北窗在西面、樓梯口在東面；機關南門 ↔ 梁上走道 ↔ 西窗南門)。
 * content 只能 import 核心型別 → 以資料寫出 (由 levels/5-5 以 applyTurn 重算驗證)
 */
export const CH5_REDRAW: CubeState = {
  pos: {
    sky: [1, 1, 2], walkA: [1, 2, 0], walkC: [0, 0, 1], north: [0, 1, 1], west: [1, 2, 1], meadow: [1, 1, 1],
    east: [1, 0, 1], landing: [2, 1, 1], walkD: [2, 2, 1], walkB: [0, 1, 0], engine: [1, 1, 0]
  },
  rot: { sky: 1, walkA: 20, walkC: 0, north: 17, west: 18, meadow: 3, east: 3, landing: 17, walkD: 0, walkB: 0, engine: 0 }
};

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
  // 5-5 星光：三扇窗在東 / 西 / 北面或頂面 = 看得見星星；星光沿接通的門照進機關。5-5c 三道光落在同一點 = 東縫橫、西縫橫、北縫直 (三段天窗銘文)
  stars: { windows: ['east', 'west', 'north'], faces: ['E', 'W', 'N', 'U'], target: 'engine', slits: { east: 'h', west: 'h', north: 'v' } },
  dial: {
    entry: { room: 'sky', obj: 'dial' },
    // 機關的星釘門：三扇窗都完成 (ch5.windows) 才拔得掉；之後第一次進機關 = 地板被重畫 (5-5a 的固定起點)
    derived: [{ flag: 'ch5.windows', all: ['5-2', '5-3', '5-4'] }],
    redraw: { room: 'engine', when: 'ch5.windows', flag: 'ch5.redraw', cube: CH5_REDRAW, text: 'lvl.5-5.redraw' },
    // 5-5c 三道光落在同一點 = 第五次轉動 (魔方排回 S0)；之後轉動模式收起 (林心的四個外圈由 6-1 加入)
    collapse: { on: '5-5c' },
    freeze: { after: '5-5c', text: 'msg.dial.frozen' },
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

/** 5-4 區用的魔方：中間片 + 北窗的窗框 (SN：5-4 之後、只在北窗) */
export const CH5_NORTH_CUBE: CubeDef = {
  ...CH5_CUBE,
  dial: { ...CH5_CUBE.dial!, groups: [...CH5_MIDDLE, CH5_CUBE.dial!.groups.find(g => g.id === 'SN')!], locks: CH5_CUBE.dial!.locks.filter(l => l.group === 'SN'), miniOnly: [], jams: [], marks: [] }
};

/**
 * 5-4 吊秤 (規格「5-4 北窗（細化）」)：秤繩從北窗的地板 (本地 D) 垂下去，吊著那格稜另一頭的面心房；秤的是那間房裡的重物 (ballast)。
 * CH5_BALLAST = 各房重物的重量和 (西窗爸爸的舊皮箱 3、東窗許問津的書箱 4；沒列 = 0；與關卡資料一致由 levels/5-4 驗證)；
 * BAG = 背包可量的重量 (小 1 / 原 2 / 大 3；拿掉尺度卡 = 只有 2)
 */
export const CH5_HANG: { room: string; hook: Side } = { room: 'north', hook: 'D' };
export const CH5_BALLAST: Readonly<Record<string, number>> = { west: 3, east: 4 };
export const CH5_BAG: readonly number[] = [1, 2, 3];
/** 秤繩那一頭此刻的重量 (hanged = 秤繩此刻吊著的房：core/cube acrossEdge(def, s, 'north', 'D')；validateDial 的 GoalCtx.across) */
export const hangWeight = (hanged: string | null, ballast: Readonly<Record<string, number>> = CH5_BALLAST): number => ballast[hanged ?? ''] ?? 0;

/**
 * 5-4 區 (devtools/validateDial；規格「5-4 北窗（細化）」抽象模型)：中間片 + 北窗的窗框；起點 = 5-1 完成 (CH5_AFTER51，人在天窗間)。
 * 題：5-4 = 人在北窗、秤繩那一頭的重量是背包量得到的 (bag；尺度卡在北窗隨時貼得上 → 卡片不進模型)；
 * SN.turn = 窗框鬆開後在北窗轉一次 (終點)。bag / ballast 可換 (拿掉尺度卡 = [2]、拿掉皮箱 = 西窗不列)；span = 多解列舉的步數上限 (拿掉要素的變體只看有沒有解)
 */
export const ch5Zone54 = (bag: readonly number[] = CH5_BAG, ballast: Readonly<Record<string, number>> = CH5_BALLAST, withSpin = true, span?: number) => ({
  cube: CH5_NORTH_CUBE,
  puzzles: [
    { id: '5-4', room: 'north', needs: [], ...(span ? { span } : {}), goal: (_s: CubeState, _f: ReadonlySet<string>, ctx) => bag.includes(hangWeight(ctx.across(CH5_HANG.room, CH5_HANG.hook), ballast)) },
    ...(withSpin ? [{ id: 'SN.turn', room: 'north', needs: ['5-4'], teaching: true, turn: 'SN' }] : [])
  ] as readonly ZonePuzzle[],
  startCube: CH5_AFTER51,
  start: 'sky',
  finish: withSpin ? 'SN.turn' : '5-4'
});
export const CH5_ZONE54 = ch5Zone54();

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

/**
 * 5-5a 地板被重畫 (devtools/validateDial；規格「5-5 最後的機關（細化）」抽象模型 CH5_ZONE55A)：在機關裡只轉得到中間片 (窗框要在窗房、
 * 縮影要在天窗間)；起點 = 重畫後的排列 CH5_REDRAW、人在機關。題：ch5.windows (三扇窗都完成：開章即成立的教學旗標，星釘門因此開著)、
 * plate (部件卡「日」貼在 plate 那扇門的門牌 = 讀作「間」；工具箱在機關、隨時拿得到)、5-5a (三扇窗都看得見星星、星光都照得進機關；P4 墨 7)。
 * plate = null → 不改門牌 (驗「不改門牌則無解」)；'doorS' → 貼在南門
 */
export const ch5Zone55a = (plate: 'doorN' | 'doorS' | null = 'doorN') => ({
  cube: CH5_MIDDLE_CUBE,
  puzzles: [
    { id: 'ch5.windows', room: 'engine', needs: [], teaching: true },
    ...(plate ? [{ id: 'plate', room: 'engine', needs: [], teaching: true }] : []),
    { id: '5-5a', room: 'engine', needs: plate ? ['ch5.windows', 'plate'] : ['ch5.windows'], refill: true, goal: (_s: CubeState, _f: ReadonlySet<string>, ctx) => ctx.star().reach.length === 3 }
  ] as readonly ZonePuzzle[],
  plates: plate ? [{ room: 'engine', door: plate, when: 'plate' }] : [],
  startCube: CH5_REDRAW,
  dialOn: true,
  start: 'engine',
  finish: '5-5a'
});
export const CH5_ZONE55A = ch5Zone55a();

/**
 * 5-5b 殘影守門 (devtools/validateDial；規格「5-5 最後的機關（細化）」抽象模型 CH5_ZONE55B)：中間片；起點 = 5-5a 的一種終局 (start；人在機關、「日」在北門)。
 * 題：ch5.windows (教學：開章即成立；北門的「日」從這一刻就貼著 = plates when ch5.windows)、5-5b (東窗不再和機關連在一起，同時另一扇窗的星光照得進機關)
 */
export const ch5Zone55b = (start: CubeState) => ({
  cube: CH5_MIDDLE_CUBE,
  puzzles: [
    { id: 'ch5.windows', room: 'engine', needs: [], teaching: true },
    { id: '5-5b', room: 'engine', needs: ['ch5.windows'], goal: (_s: CubeState, _f: ReadonlySet<string>, ctx) => { const st = ctx.star(); return !st.linked.includes('east') && st.reach.some(w => w !== 'east'); } }
  ] as readonly ZonePuzzle[],
  plates: [{ room: 'engine', door: 'doorN', when: 'ch5.windows' }],
  startCube: start,
  dialOn: true,
  start: 'engine',
  finish: '5-5b'
});

/** 5-5c 區用的魔方：中間片 + 東窗 / 西窗的窗框 (只在那間窗房轉得到；北窗的窗框不需要 = 北縫直，中間片就排得到；縮影的底層只多可達) */
export const CH5_CONVERGE_CUBE: CubeDef = {
  ...CH5_CUBE,
  dial: {
    ...CH5_CUBE.dial!,
    groups: [...CH5_MIDDLE, ...CH5_CUBE.dial!.groups.filter(g => g.id === 'SE' || g.id === 'SW')],
    locks: [{ group: 'SE', until: 'ch5.windows', rooms: ['east'], text: NAILED }, { group: 'SW', until: 'ch5.windows', rooms: ['west'], text: NAILED }],
    miniOnly: [], jams: [], marks: []
  }
};

/**
 * 5-5c 收束 (devtools/validateDial；規格「5-5 最後的機關（細化）」抽象模型 CH5_ZONE55C)：中間片 + 東西兩窗的窗框；起點 = 5-5b 的一種終局 (start；人在機關)；
 * 題：ch5.windows (教學：開章即成立；北門的「日」照舊貼著)、5-5c (人在機關、三道光落在同一點 = converge)。墨不進模型 (inkless)
 */
export const ch5Zone55c = (start: CubeState, cube: CubeDef = CH5_CONVERGE_CUBE, goal: (s: CubeState, f: ReadonlySet<string>, ctx: Parameters<NonNullable<ZonePuzzle['goal']>>[2]) => boolean = (_s, _f, ctx) => ctx.converge()) => ({
  cube,
  puzzles: [
    { id: 'ch5.windows', room: 'engine', needs: [], teaching: true },
    { id: '5-5c', room: 'engine', needs: ['ch5.windows'], span: 6, goal }
  ] as readonly ZonePuzzle[],
  plates: [{ room: 'engine', door: 'doorN', when: 'ch5.windows' }],
  startCube: start,
  dialOn: true,
  inkless: true,
  start: 'engine',
  finish: '5-5c'
});
