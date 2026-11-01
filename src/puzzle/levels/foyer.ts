import type { LevelDef, ObjDef } from '../logic/types';

// 玄關：缺口 (書架平台 2D 可走) → 木箱 + 高台 (筆尖) → 墨水閥 (2D) → 出口門
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0
const floorBase = { type: 'floor', y: -1, z: 0, w: 6, h: 1, d: 10, visible: 'both', solid: true } as const;
const railBase = { type: 'rail', y: 0, h: 2.2, visible: '3d', solid: true, label: '木欄' } as const;

const objects: ObjDef[] = [
  { ...floorBase, id: 'floorL', x: -5 },
  { ...floorBase, id: 'floorR', x: 5 },
  // 缺口 x∈[-2,2]；書架平台橫跨缺口，緊貼後牆，頂面與地板同高
  { id: 'shelf', type: 'shelf', x: 0, y: -0.3, z: -4.1, w: 5.2, h: 0.3, d: 1.6, visible: 'both', solid: true, label: '書架' },
  // 3D 專屬木欄圍住書架區 (圖紙不畫欄杆)，3D 下無法走上書架
  { ...railBase, id: 'railFront', x: 0, z: -3.1, w: 6.2, d: 0.2 },
  { ...railBase, id: 'railL', x: -3, z: -4, w: 0.2, d: 2 },
  { ...railBase, id: 'railR', x: 3, z: -4, w: 0.2, d: 2 },
  { id: 'crate', type: 'crate', x: 3.4, y: 0, z: -0.5, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true, label: '木箱' },
  { id: 'plinth', type: 'plinth', x: 6.85, y: 0, z: 3, w: 0.9, h: 2.5, d: 3, visible: 'both', solid: true, label: '高台' },
  { id: 'key', type: 'key', x: 6.85, y: 2.5, z: 3, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '2d', label: '筆尖' },
  { id: 'valve', type: 'valve', x: 4.6, y: 0.55, z: -3, w: 0.5, h: 0.5, d: 0.5, visible: '2d', solid: false, interactable: true, label: '墨水閥' },
  { id: 'door', type: 'door', x: 7.85, y: 0, z: -2, w: 0.3, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, label: '出口門' },
  {
    id: 'note', type: 'note', x: -6.5, y: 1.0, z: -4.9, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, label: '紙條',
    text: '看不見的地方，不代表不存在。換個角度，它就在那裡。'
  }
];

export const foyer: LevelDef = {
  id: 'foyer',
  title: '玄關',
  bounds: { minX: -8, maxX: 8, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: -6.5, y: 0, z: 0 },
  narration: '門消失了。牆上多了一條墨線，像有人剛畫完，墨還沒乾。',
  nextRoom: '第二間房：書房（尚未開放）',
  objects
};
