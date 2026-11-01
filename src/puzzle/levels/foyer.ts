import type { LevelDef, ObjDef } from '../logic/types';

// 玄關 (擴建)：入口區 x∈[-20,-10] ／ 缺口 x∈[-10,-6] ／ 中庭 x∈[-6,10] ／ 隔牆 x∈[10,10.4] ／ 出口區 x∈[10.4,20]
// 謎題鏈：① 書架過缺口 (2D) → ② 推箱 + 高台取筆尖 (3D 推、2D 跳) → ③ 長桌後的圖紙壓板 (3D 繞路推箱、2D 壓下、3D 過閘門)
//         → 墨水閥 (2D) 解封出口門
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -6
const WALL_Z = -5.95;
const floorBase = { type: 'floor', y: -1, z: 0, h: 1, d: 12, visible: 'both', solid: true } as const;
const railBase = { type: 'rail', y: 0, h: 2.6, visible: '3d', solid: true, label: '木欄' } as const;
const partBase = { type: 'wall', x: 10.2, y: 0, w: 0.4, h: 6, visible: 'both', solid: true, label: '隔牆' } as const;
const noteBase = { type: 'note', y: 1.0, z: WALL_Z, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, label: '紙條' } as const;

const objects: ObjDef[] = [
  { ...floorBase, id: 'floorA', x: -15, w: 10 },
  { ...floorBase, id: 'floorB', x: 7, w: 26 },

  // ① 缺口 x∈[-10,-6]；書架平台橫跨缺口、緊貼後牆，頂面與地板同高。3D 被木欄圍住 (欄高 2.6，站木箱也跳不過)
  { id: 'shelf', type: 'shelf', x: -8, y: -0.3, z: -5.2, w: 5.2, h: 0.3, d: 1.6, visible: 'both', solid: true, noLand3d: true, label: '書架' },
  { ...railBase, id: 'railFront', x: -8, z: -4.2, w: 6.2, d: 0.2 },
  { ...railBase, id: 'railL', x: -11, z: -5.05, w: 0.2, d: 1.9 },
  { ...railBase, id: 'railR', x: -5, z: -5.05, w: 0.2, d: 1.9 },
  { ...noteBase, id: 'note', x: -17, text: '看不見的地方，不代表不存在。換個角度，它就在那裡。' },

  // ③ 長桌只存在於現實 (圖紙沒畫它)，從前牆一路延伸到 z=-4.6，只留後方一條窄道；壓板畫在桌子底下的那一段
  { id: 'table', type: 'table', x: -1, y: 0, z: 0.7, w: 3, h: 0.8, d: 10.6, visible: '3d', solid: true, label: '長桌' },
  { id: 'plate', type: 'plate', x: -1, y: 0, z: -5.3, w: 1.2, h: 0.06, d: 1.2, visible: '2d', solid: false, opens: 'gate', label: '壓板' },
  { ...noteBase, id: 'note3', x: 2.2, text: '有些重量，只在紙上才算數。' },

  // ② 木箱 + 高台：木箱起點離高台 2.9，2D 也跳不上；推近後切 2D 才跳得到 2.5 的高台
  { id: 'crate', type: 'crate', x: 4.5, y: 0, z: 2, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true, label: '木箱' },
  { ...noteBase, id: 'note2', x: 6, text: '站得夠高之前，先找一個肯讓你踩的。' },
  { id: 'plinth', type: 'plinth', x: 8.5, y: 0, z: -4.5, w: 1, h: 2.5, d: 3, visible: 'both', solid: true, label: '高台' },
  { id: 'key', type: 'key', x: 8.5, y: 2.5, z: -4.5, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '2d', label: '筆尖' },

  // 隔牆：門洞 z∈[-1,1] 只在現實能穿過 (圖紙裡整面牆壓成一道)，門洞由 3D 閘門擋住，壓板壓下才升起
  { ...partBase, id: 'partBack', z: -3.5, d: 5 },
  { ...partBase, id: 'partFront', z: 3.5, d: 5 },
  { ...partBase, id: 'lintel', y: 3, h: 3, z: 0, d: 2 },
  { id: 'gate', type: 'gate', x: 10.2, y: 0, z: 0, w: 0.3, h: 3, d: 2, visible: '3d', solid: true, interactable: true, label: '閘門' },

  // 出口區：墨水閥只畫在圖紙上；出口門在後牆
  { id: 'valve', type: 'valve', x: 15, y: 0.55, z: -5.7, w: 0.5, h: 0.5, d: 0.5, visible: '2d', solid: false, interactable: true, label: '墨水閥' },
  { id: 'door', type: 'door', x: 18, y: 0, z: -5.85, w: 1.6, h: 2.4, d: 0.3, visible: 'both', solid: false, interactable: true, label: '出口門' }
];

export const foyer: LevelDef = {
  id: 'foyer',
  title: '玄關',
  bounds: { minX: -20, maxX: 20, minZ: -6, maxZ: 6 },
  voidY: -5,
  start: { x: -18, y: 0, z: 2 },
  checkpoints: [{ minX: -5.7, x: -4, y: 0, z: 2 }],
  narration: '門消失了。牆上多了一條墨線，像有人剛畫完，墨還沒乾。',
  nextRoom: '第二間房：書房（尚未開放）',
  objects
};
