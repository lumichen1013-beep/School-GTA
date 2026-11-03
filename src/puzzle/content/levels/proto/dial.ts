import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import type { Side } from '../../../core/cube';

// 【原型占位，不計入正式 22 關】M-Dial 控制盤原型的六間占位房 (architecture 7.4.1 D3、6.7)：只有門、一座魔方儀、三個鎖扣開關。
// 不在關卡登錄表 LEVELS 裡；只從選單的「開發：控制盤原型」(網址加 ?dev=1) 進入 (content/levels PROTO_LEVELS)。
// 魔方 (content/cubes/test-dial.ts) 2×3：上列 甲 乙 丙、下列 丁 戊 己；門位 (本地)：
//   甲 東 / 西 / 南 (魔方儀)、乙 西、丙 東 (開關 test.a → 解開下列)、丁 北 / 西、戊 西 (開關 test.goal = 終點)、己 東 / 西 (開關 test.b → 解開三行)
// 只用上列走得到丙；兩列走得到己；戊要行轉才接得上 (validateDial 驗證)。文字 = content/text/zh-Hant/lvl-proto.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5

const DOOR: Readonly<Record<Side, Partial<ObjDef>>> = {
  E: { x: 5.8, z: 0, w: 0.4, d: 1.6, visible: 'both' },
  W: { x: -5.8, z: 0, w: 0.4, d: 1.6, visible: 'both' },
  N: { x: 1.5, z: -4.8, w: 1.6, d: 0.4, visible: 'both' },
  S: { x: -1.5, z: 4.8, w: 1.6, d: 0.4, visible: '3d' },
  U: {}, D: {}
};
const DOOR_KEY: Readonly<Record<string, string>> = { E: 'lvl.proto.doorE', W: 'lvl.proto.doorW', N: 'lvl.proto.doorN', S: 'lvl.proto.doorS' };

const door = (side: 'E' | 'W' | 'N' | 'S'): ObjDef => ({
  id: `door${side}`, type: 'cubeDoor', side, kind: 'door', y: 0, h: 2.4, solid: false, interactable: true, interactIn: '3d', labelKey: DOOR_KEY[side],
  ...(DOOR[side] as { x: number; z: number; w: number; d: number; visible: 'both' | '3d' })
});

/** 鎖扣開關 (貼後牆的黃銅把手；只在 3D 拉得動，一次性) */
const latch = (flag: string, useText: string): ObjDef => ({
  id: 'latch', type: 'latch', doneFlag: flag, useText, x: -2.5, y: 0.8, z: -4.75, w: 0.6, h: 0.8, d: 0.3,
  visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.proto.latch'
});

const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 10, visible: 'both', solid: true };
const decor = (variant: number): DecorItem[] => [
  { kind: 'walls' },
  { kind: 'painting', x: 2.6, y: 3.1, w: 1.4, h: 1.1, variant: variant % 2 },
  { kind: 'rug', x: 0, z: 1, w: 4, d: 3 },
  { kind: 'pendant', x: 0, z: 0.5 }
];

const room = (id: string, titleKey: string, objects: ObjDef[], variant: number): LevelDef => ({
  id,
  titleKey,
  bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -2, y: 0, z: 1.5 },
  narrationKey: 'lvl.proto.narration',
  nextKey: 'lvl.proto.next',
  theme: 'foyer',
  // 每次穿門進房補滿 6 滴墨 (規格 5.4.9 第二章基礎預算)
  turnBudget: { base: 6 },
  decor: decor(variant),
  objects: [floor, ...objects]
});

/** 甲室：魔方儀 (閱讀架上，3D 啟動) */
export const protoA = room('protoA', 'lvl.proto.a.title', [
  door('E'), door('W'), door('S'),
  { id: 'dial', type: 'dial', chapter: 90, x: 0.5, y: 0, z: -3.6, w: 1, h: 1.4, d: 0.9, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.proto.dial' },
  { id: 'note', type: 'note', textKey: 'lvl.proto.note.a', x: -3.6, y: 1.0, z: -4.95, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.proto.note' }
], 0);
export const protoB = room('protoB', 'lvl.proto.b.title', [door('W')], 1);
export const protoC = room('protoC', 'lvl.proto.c.title', [door('E'), latch('test.a', 'lvl.proto.latch.a')], 2);
export const protoD = room('protoD', 'lvl.proto.d.title', [door('N'), door('W')], 3);
export const protoE = room('protoE', 'lvl.proto.e.title', [door('W'), latch('test.goal', 'lvl.proto.latch.goal')], 4);
export const protoF = room('protoF', 'lvl.proto.f.title', [door('E'), door('W'), latch('test.b', 'lvl.proto.latch.b')], 5);

export const PROTO_DIAL_ROOMS: Readonly<Record<string, LevelDef>> = { protoA, protoB, protoC, protoD, protoE, protoF };
