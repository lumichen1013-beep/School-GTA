import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import { atticWindow, door, floor, hatch, plaque, sealedBy } from './parts';

// 第五章的房間 (規格 6「第五章骨架與銜接（v0.4 細化）」)：樓梯口 (裝飾房：入口)、5-1 天窗間 (另檔 5-1-sky.ts，這裡轉出)、5-2 東窗、5-3 西窗、
// 5-4 北窗、5-5 最後的機關、6-1 林心草地 (核心) 的占位版與四格梁上走道 (走廊格：沒有門的占位，只在展開圖)；謎題逐關取代。
// 門位 (本地)：E / W 在側牆 z = 0；N 在後牆 z = -4.8；S 在前緣 z = 4.8 (只在實景)；U = 靠後牆的梯子、D = 地上的活板門；梯口都只在實景按 E。
// 封住的門 = cubeDoor.sealed (本步沒有任何東西會打開它)。每房墨 10 (林心 8)。文字 = content/text/zh-Hant/lvl-ch5.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
/** 展開圖格子小時的短名 / 標題 (文字 key) */
const SHORT_KEYS: Readonly<Record<string, string>> = {
  landing: 'lvl.ch5.landing.short', east: 'lvl.ch5.east.short', west: 'lvl.ch5.west.short', north: 'lvl.ch5.north.short', engine: 'lvl.ch5.engine.short',
  meadow: 'lvl.ch5.meadow.short', walkA: 'lvl.ch5.walk.short', walkB: 'lvl.ch5.walk.short', walkC: 'lvl.ch5.walk.short', walkD: 'lvl.ch5.walk.short'
};
const TITLE_KEYS: Readonly<Record<string, string>> = {
  landing: 'lvl.ch5.landing.title', east: 'lvl.ch5.east.title', west: 'lvl.ch5.west.title', north: 'lvl.ch5.north.title', engine: 'lvl.ch5.engine.title',
  meadow: 'lvl.ch5.meadow.title', walkA: 'lvl.ch5.walkA.title', walkB: 'lvl.ch5.walkB.title', walkC: 'lvl.ch5.walkC.title', walkD: 'lvl.ch5.walkD.title'
};
/** 關卡 id (規格「第五章骨架與銜接」房間表：room id / LevelDef id；裝飾房與走廊格 = room id) */
const LEVEL_IDS: Readonly<Record<string, string>> = { east: '5-2', west: '5-3', north: '5-4', engine: '5-5', meadow: '6-1' };
const NARRATION: Readonly<Record<string, string>> = {
  landing: 'lvl.ch5.landing.narration', east: 'lvl.ch5.east.narration', west: 'lvl.ch5.west.narration', north: 'lvl.ch5.north.narration',
  engine: 'lvl.ch5.engine.narration', meadow: 'lvl.ch5.meadow.narration'
};

function room(id: string, minX: number, maxX: number, objects: ObjDef[], decor: DecorItem[], extra: Partial<LevelDef> = {}): LevelDef {
  return {
    id: LEVEL_IDS[id] ?? id,
    titleKey: TITLE_KEYS[id],
    shortKey: SHORT_KEYS[id],
    bounds: { minX, maxX, minZ: -5, maxZ: 5 },
    voidY: -5,
    start: { x: (minX + maxX) / 2, y: 0, z: 1.5 },
    narrationKey: NARRATION[id] ?? 'lvl.ch5.placeholder.narration',
    nextKey: 'lvl.ch5.placeholder.next',
    theme: 'attic',
    // 每次穿門進房補滿 10 滴墨 (規格 5.4.9 第五章基礎預算)
    turnBudget: { base: 10 },
    decor: [{ kind: 'walls' }, { kind: 'atticRoof', seed: minX * 7 + maxX }, ...decor],
    objects: [floor(minX, maxX), ...objects],
    ...extra
  };
}

/** 5-1 天窗間 (頂面心；第五章入口房)：完整檔在 5-1-sky.ts */
export { sky } from './5-1-sky';

/**
 * 樓梯口 (南面心 [1,2,1]；裝飾房，不是關卡)：南門 (入口：接 [1,2,1] 南側屋框「地下室的木梯」，只在實景)、往上的窄梯 (U；↔ 梁上走道 A ↔ 天窗間南門)。
 * 後景 斜屋頂下的木梯與樑 ｜ 中景 一疊帆布蓋著的舊箱、踏腳凳上的紙籤 ｜ 前景 樓板開口與欄杆 (從地下室上來的地方)
 */
export const landing = room('landing', -6, 6, [
  door('S', 'door', -2.0, { frameText: 'lvl.ch5.landing.doorS.frame' }),
  hatch('U', 'door', 2.6, -4.4, { labelKey: 'lvl.ch5.ladderU' }),
  plaque('plaqueLanding', 'lvl.ch5.landing.plaque', -3.4, 0.5, 0.4)
], [
  { kind: 'canvasPile', x: -3.6, z: -1.4, seed: 521 },
  { kind: 'stool', x: -3.4, z: 0.4, rot: 0 },
  { kind: 'railing', x: -2.0, z: 3.4, w: 3.6 },
  { kind: 'starChart', x: 0.6, z: -4.2, n: 1, seed: 523 }
], { start: { x: -2.0, y: 0, z: 3.2 } });

/** 5-2 東窗 (東面心；許問津的窗)：完整檔在 5-2-east.ts */
export { eastRoom as east } from './5-2-east';

/**
 * 5-3 西窗 (西面心 [0,1,1]；爸爸的窗)：西牆 = 西窗、南門 (前緣，只在實景)、地板梯口。
 * 後景 爸爸的書桌與檯燈 ｜ 中景 西窗與窗台、地板梯口 ｜ 前景 箱堆與摺好的毯子、南門
 */
export const west = room('west', -10, 10, [
  door('S', 'door', 4.0),
  hatch('D', 'door', -3.0, 1.6),
  plaque('desk', 'lvl.ch5.west.desk', 2.4, 0.82, -3.4, 'both', 'lvl.ch5.west.deskLabel'),
  plaque('sill', 'lvl.ch5.west.sill', -9.5, 1.0, 0, 'both', 'lvl.ch5.sill')
], [
  atticWindow('W', 0),
  { kind: 'desk', x: 2.4, z: -3.4, rot: Math.PI },
  { kind: 'stool', x: 2.4, z: -2.2, rot: Math.PI },
  { kind: 'lantern', x: 2.4, y: 3.6, z: -2.6 },
  { kind: 'trunks', x: 7.4, z: 3.2, n: 2, seed: 541 },
  { kind: 'blanket', x: 7.4, z: 3.2 }
]);

/**
 * 5-4 北窗 (北面心 [1,0,1]；你的窗)：北牆中央 = 北窗 (後牆)、東門、地板梯口。
 * 後景 北窗與兩側的立柱 ｜ 中景 天平的座 (5-4 放上)、東門 ｜ 前景 舊箱與紙籤
 */
export const north = room('north', -10, 10, [
  door('E', 'door', 9.8),
  hatch('D', 'door', -3.0, 1.6),
  plaque('window', 'lvl.ch5.north.window', 0, 1.2, -4.85, 'both', 'lvl.ch5.north.windowLabel'),
  plaque('plaqueNorth', 'lvl.ch5.north.plaque', 5.6, 0.9, 3.2)
], [
  atticWindow('N', 0, 2.6, 1.8, 2.3),
  { kind: 'posts', xs: '-2.0,2.0', z: -4.5 },
  { kind: 'trunks', x: 5.6, z: 3.4, n: 3, seed: 551 },
  { kind: 'canvasPile', x: -7.4, z: -1.2, seed: 553 }
]);

/** 機關的兩扇門：三扇窗都完成才拔得掉星釘 (ch5.windows)；兩面都封 (從接到它的任何一扇門都走不進來) */
const NAILED = { sealed: { until: 'ch5.windows', text: 'lvl.ch5.engine.nailed', both: true } };

/**
 * 5-5 最後的機關 (底面心 [1,1,0]；Boss 三階段、收束)：北門 / 南門 (都 sealed until ch5.windows「門上釘著三顆星釘。」)、
 * 天花板梯口 (往核心；sealed until 5-5c)。後景 巨大的黃銅齒輪牆與三道光槽 ｜ 中景 機關底盤 (地板被重畫的展開圖) ｜ 前景 箱堆與工具、南門
 */
export const engine = room('engine', -14, 14, [
  door('N', 'door', -6.0, NAILED),
  door('S', 'door', 6.0, NAILED),
  hatch('U', 'door', 0, -4.4, sealedBy('5-5c', 'lvl.ch5.engine.ceilingSealed')),
  plaque('base', 'lvl.ch5.engine.base', 0, 0.1, 0.2, 'both', 'lvl.ch5.engine.baseLabel')
], [
  { kind: 'gearWall', x: 0, w: 24, seed: 561 },
  { kind: 'floorDrawing', x: 0, z: 0.2, w: 8, d: 4, seed: 563 },
  { kind: 'trunks', x: -10.4, z: 3.4, n: 3, seed: 565 },
  { kind: 'crateStack', x: 10.6, z: 3.0, seed: 567 }
]);

/** 林心的門都封著 (5-5c 收束時化開) */
const CORE = sealedBy('5-5c', 'lvl.ch5.meadow.sealed');

/**
 * 6-1 林心草地 (核心 [1,1,1]；終章，切片轉永遠只在原地轉)：六個門位 (D / U 梯口、N / E / S / W 門) 全部 sealed until 5-5c。
 * 後景 古樹撐開屋頂 ｜ 中景 草地上的石台與苔 ｜ 前景 草與落葉、南門。主題 meadow；墨 8 (規格 5.4.9)
 */
export const meadow = room('meadow', -10, 10, [
  hatch('D', 'door', 0, 1.6, CORE),
  hatch('U', 'door', 4.0, -4.4, CORE),
  door('N', 'door', -4.0, CORE),
  door('E', 'door', 9.8, CORE),
  door('S', 'door', 0, CORE),
  door('W', 'door', -9.8, CORE),
  plaque('tree', 'lvl.ch5.meadow.tree', -6.0, 1.0, -3.4, 'both', 'lvl.ch5.meadow.treeLabel'),
  plaque('stone', 'lvl.ch5.meadow.stone', 3.0, 0.8, 0.4, 'both', 'lvl.ch5.meadow.stoneLabel')
], [], {
  theme: 'meadow',
  turnBudget: { base: 8 },
  // 林心不是閣樓：沒有斜屋頂 (古樹撐開了屋頂)
  decor: [
    { kind: 'walls' },
    { kind: 'ancientTree', x: -6.0, z: -3.4, seed: 571 },
    { kind: 'grass', w: 20, seed: 573 },
    { kind: 'stoneTable', x: 3.0, z: 0.4 },
    { kind: 'leaves', w: 18, seed: 575 }
  ]
});

/** 梁上走道 (走廊格：沒有門的占位；穿過去直接到另一頭的房間，只畫在展開圖) */
const walk = (id: string) => room(id, -6, 6, [], [{ kind: 'posts', xs: '-3.0,3.0', z: -4.5 }]);
export const walkA = walk('walkA');
export const walkB = walk('walkB');
export const walkC = walk('walkC');
export const walkD = walk('walkD');
