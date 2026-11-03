import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 衣帽間 (第一章魔方的 C 格；1-3)：M-Cube 原型的占位房，只有兩個門位可進出 (拉桿「左」、木箱、大衣標籤於 M1b 加入)
//   北拱門 (N，後牆)：S1 接樓梯間的南門；S2 接玄關的南拱門 (拱門對拱門)。東章門 (E)：對著書房走廊時要房間的銅鑰匙 (M1b 前一律鎖著)
// 文字一律為 content/text/zh-Hant/lvl-ch1.ts 的 key；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 14, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'archN', type: 'cubeDoor', side: 'N', kind: 'arch', x: -1, y: 0, z: -4.8, w: 1.8, h: 2.6, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.closet.archN' },
  { id: 'chapterE', type: 'cubeDoor', side: 'E', kind: 'chapter', x: 6.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.closet.chapterE' }
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: 3, y: 3.2, w: 1.6, h: 1.2, variant: 0 },
  { kind: 'wallShelf', x: -4.2, y: 2.8, w: 2.0, seed: 7 },
  { kind: 'rug', x: 0, z: 1.2, w: 5, d: 3.2 },
  { kind: 'pendant', x: -1, z: 0.5 },
  { kind: 'pendant', x: 3.5, z: 0.5 }
];

export const closet: LevelDef = {
  id: 'closet',
  titleKey: 'lvl.closet.title',
  bounds: { minX: -7, maxX: 7, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1 },
  narrationKey: 'lvl.closet.narration',
  nextKey: 'lvl.closet.next',
  decor,
  objects
};
