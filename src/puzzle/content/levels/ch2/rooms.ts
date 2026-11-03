import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';
import type { Side } from '../../../core/cube';

// 第二章的占位房 (規格 6「第二章魔方與門位（v0.4 細化）」)：2-2 閱覽室、2-3 印房、H1 夾層、2-4 手稿庫、2-5 書房深處。
// 只有門 (可進出、不計題；謎題 2-2a 起另做)；2-5 的東章門此版本一律鎖著 (三枚銅鑰匙的齒在 2-5 組裝，尚未實作)。
// 門位 (本地)：閱覽室 西 / 南、印房 東、夾層 西、手稿庫 北 / 東、書房深處 西 / 東章門。文字 = content/text/zh-Hant/lvl-ch2.ts
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const DOOR: Readonly<Record<'E' | 'W' | 'N' | 'S', { x: number; z: number; w: number; d: number; visible: 'both' | '3d' }>> = {
  E: { x: 5.8, z: 0, w: 0.4, d: 1.6, visible: 'both' },
  W: { x: -5.8, z: 0, w: 0.4, d: 1.6, visible: 'both' },
  N: { x: 1.5, z: -4.8, w: 1.6, d: 0.4, visible: 'both' },
  S: { x: -1.5, z: 4.8, w: 1.6, d: 0.4, visible: '3d' }
};
const DOOR_KEY: Readonly<Record<string, string>> = { E: 'lvl.ch2.doorE', W: 'lvl.ch2.doorW', N: 'lvl.ch2.doorN', S: 'lvl.ch2.doorS' };

const door = (side: 'E' | 'W' | 'N' | 'S', extra: Partial<{ frameText: string }> = {}): ObjDef => ({
  id: `door${side}`, type: 'cubeDoor', side: side as Side, kind: 'door', y: 0, h: 2.4, solid: false, interactable: true, interactIn: '3d', labelKey: DOOR_KEY[side],
  ...DOOR[side], ...extra
});

const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 10, visible: 'both', solid: true };
const decor = (seed: number): DecorItem[] => [
  { kind: 'walls' },
  { kind: 'bookcase', x: -3.2, w: 3.2, seed },
  { kind: 'bookcase', x: 3.4, w: 2.6, seed: seed + 3 },
  { kind: 'roots', x: seed % 2 ? -5.9 : 5.9, side: seed % 2 ? 'W' : 'E', seed },
  { kind: 'rug', x: 0, z: 1, w: 4, d: 3 },
  { kind: 'pendant', x: 0, z: 0.5 }
];

const TITLE_KEYS: Readonly<Record<string, string>> = {
  reading: 'lvl.ch2.reading.title', print: 'lvl.ch2.print.title', mezz: 'lvl.ch2.mezz.title', manuscripts: 'lvl.ch2.manuscripts.title', deep: 'lvl.ch2.deep.title'
};

const room = (id: string, objects: ObjDef[], seed: number): LevelDef => ({
  id,
  titleKey: TITLE_KEYS[id],
  bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1.5 },
  narrationKey: 'lvl.ch2.placeholder.narration',
  nextKey: 'lvl.ch2.placeholder.next',
  theme: 'study',
  // 每次穿門進房補滿 6 滴墨 (規格 5.4.9 第二章基礎預算)
  turnBudget: { base: 6 },
  decor: decor(seed),
  objects: [floor, ...objects]
});

/** 2-2 閱覽室 (上列中格)：西門接 2-1 東門；南門接 2-4 北門；上列 −1 時西門面對入口屋框 */
export const reading = room('reading', [door('W', { frameText: 'lvl.ch2.doorW.frame' }), door('S')], 1);
/** 2-3 印房 (上列右格)：只有東門 (S0 面對屋外；任一次上列轉動後接 2-1 西門) */
export const print = room('print', [door('E')], 2);
/** H1 夾層 (下列左格；隱藏房)：只有西門，只用列轉時接不上任何房 */
export const mezz = room('mezz', [door('W')], 3);
/** 2-4 手稿庫 (下列中格)：北門接 2-2 南門；東門接 2-5 西門 */
export const manuscripts = room('manuscripts', [door('N'), door('E')], 4);
/** 2-5 書房深處 (下列右格)：西門；東章門 (往溫室；要房間的銅鑰匙，此版本取不到) */
export const deep = room('deep', [
  door('W'),
  { id: 'chapterE', type: 'cubeDoor', side: 'E', kind: 'chapter', key: 'key.study', openText: 'lvl.ch2.chapterE.open',
    x: 5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.ch2.chapterE' }
], 5);
