import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 樓梯間 (第一章魔方的 B 格；裝飾房，規格 6 第一章「房間 / 門位 / 機關」表)：M-Cube 原型的占位房，只有兩扇門可進出
//   西門 (W，x=-5.8)：玄關滑到 A 格後接玄關的東門 (1-2c)；南門 (S，前緣)：衣帽間在 C 格時接衣帽間的北拱門 (門對拱門 = 只有人能過)
// 文字一律為 content/text/zh-Hant/lvl-ch1.ts 的 key；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'doorW', type: 'cubeDoor', side: 'W', kind: 'door', x: -5.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.stair.doorW' },
  { id: 'doorS', type: 'cubeDoor', side: 'S', kind: 'door', x: 1.5, y: 0, z: 4.8, w: 1.6, h: 2.4, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.stair.doorS' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: -2, y: 3.1, w: 1.4, h: 1.1, variant: 1 },
  { kind: 'wallShelf', x: 2.6, y: 2.8, w: 1.8, seed: 3 },
  { kind: 'rug', x: 0, z: 1, w: 4, d: 3 },
  { kind: 'pendant', x: 0, z: 0.5 }
];

export const stair: LevelDef = {
  id: 'stair',
  titleKey: 'lvl.stair.title',
  bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1 },
  narrationKey: 'lvl.stair.narration',
  nextKey: 'lvl.stair.next',
  decor,
  objects
};
