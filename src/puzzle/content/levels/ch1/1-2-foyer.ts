import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 玄關 (擴建；第一章魔方的 D 格，規格 6「1-2 玄關」)：入口區 x∈[-20,-10] ／ 缺口 x∈[-10,-6] ／ 中庭 x∈[-6,10] ／ 隔牆 x∈[10,10.4] ／ 出口區 x∈[10.4,20]
// 謎題鏈 (內部物件 id 沿用；puzzles 的編號與名稱照舊，規格 v0.3 的改號 (原 1-2b → 1-2a…) 在 M1a 重做 1-2 時一起改)：
//   1-2a 書架過缺口：3D 被木欄圍住的書架，2D 壓平後就是腳下的路 (noLand3d 讓回 3D 時落在地板)
//   1-2b 推箱取筆尖：3D 把木箱推到高台旁 (z 不必對齊) → 2D 地板→箱 (1.1)→高台 (2.5) → 2D 拾取筆尖
//   1-2c 長桌下的機關踏板：木箱沿 -z 推進長桌後方窄道、沿窄道推到踏板 x → 2D 壓下 (鎖定) → 鐵柵門升起
//   門後是牆 (規格 v0.3 的新 1-2c；P1 首次)：出口區東端的東門 (cubeDoor) 起初面對空的魔方格 →「門後是牆。」；
//        2D 展開圖站在拉桿旁看預覽 → 3D 拉出口區的拉桿「上」→ 玄關 (連同玩家) 滑到 A 格 → 東門接上樓梯間的西門
//   入口：南拱門 (S，西區前緣 x=-17) 接大門 (1-1 門廊)；玄關滑走後南拱門面對空格
// M-Cube (C6) 的改動：墨水閥、出口門 (墨線封印) 與 1-2d 高處墨水閥題依規格 6「保留 / 改 / 廢」表廢除；
//   新增南拱門 archS、東門 doorE、拉桿 lever (方向字「上」)；其餘地形 / 座標不動
// 文字一律為 content/text/zh-Hant/lvl-1-2.ts 的 key
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -6
const WALL_Z = -5.95;
const floorBase = { type: 'floor', y: -1, z: 0, h: 1, d: 12, visible: 'both', solid: true } as const;
const railBase = { type: 'rail', y: 0, h: 2.6, visible: '3d', solid: true, labelKey: 'lvl.1-2.rail' } as const;
const partBase = { type: 'wall', x: 10.2, y: 0, w: 0.4, h: 6, visible: 'both', solid: true, labelKey: 'lvl.1-2.wall' } as const;
const noteBase = { type: 'note', y: 1.0, z: WALL_Z, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.1-2.note' } as const;

const objects: ObjDef[] = [
  { ...floorBase, id: 'floorA', x: -15, w: 10 },
  { ...floorBase, id: 'floorB', x: 7, w: 26 },

  // ① 缺口 x∈[-10,-6]；書架平台橫跨缺口、緊貼後牆，頂面與地板同高。3D 被木欄圍住 (欄高 2.6，站木箱也跳不過)
  { id: 'shelf', type: 'shelf', x: -8, y: -0.3, z: -5.2, w: 5.2, h: 0.3, d: 1.6, visible: 'both', solid: true, noLand3d: true, labelKey: 'lvl.1-2.shelf' },
  { ...railBase, id: 'railFront', x: -8, z: -4.2, w: 6.2, d: 0.2 },
  { ...railBase, id: 'railL', x: -11, z: -5.05, w: 0.2, d: 1.9 },
  { ...railBase, id: 'railR', x: -5, z: -5.05, w: 0.2, d: 1.9 },
  { ...noteBase, id: 'note', x: -17, textKey: 'lvl.1-2.note.1' }, // 1-2a L1 (入口區，起點旁)

  // ③ 長桌只存在於現實 (圖紙沒畫它)，從前牆一路延伸到 z=-4.6，只留後方一條窄道；壓板畫在桌子底下的那一段
  { id: 'table', type: 'table', x: -1, y: 0, z: 0.7, w: 3, h: 0.8, d: 10.6, visible: '3d', solid: true, labelKey: 'lvl.1-2.table' },
  { id: 'plate', type: 'plate', x: -1, y: 0, z: -5.3, w: 1.2, h: 0.06, d: 1.2, visible: '2d', solid: false, opens: 'gate', labelKey: 'lvl.1-2.plate' },
  { ...noteBase, id: 'note3', x: 2.2, textKey: 'lvl.1-2.note.3' }, // 1-2c L1 (長桌右後方)

  // ② 木箱 + 高台：木箱起點離高台 2.9，2D 也跳不上；推近後切 2D 才跳得到 2.5 的高台
  { id: 'crate', type: 'crate', x: 4.5, y: 0, z: 2, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true, labelKey: 'lvl.1-2.crate' },
  { ...noteBase, id: 'note2', x: 6, textKey: 'lvl.1-2.note.2' }, // 1-2b L1 (木箱與高台之間)
  { id: 'plinth', type: 'plinth', x: 8.5, y: 0, z: -4.5, w: 1, h: 2.5, d: 3, visible: 'both', solid: true, labelKey: 'lvl.1-2.plinth' },
  { id: 'key', type: 'key', x: 8.5, y: 2.5, z: -4.5, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.1-2.key',
    grants: 'nib', useText: 'lvl.1-2.key.use' },

  // 隔牆：門洞 z∈[-1,1] 只在現實能穿過 (圖紙裡整面牆壓成一道)，門洞由 3D 閘門擋住，壓板壓下才升起
  { ...partBase, id: 'partBack', z: -3.5, d: 5 },
  { ...partBase, id: 'partFront', z: 3.5, d: 5 },
  { ...partBase, id: 'lintel', y: 3, h: 3, z: 0, d: 2 },
  { id: 'gate', type: 'gate', x: 10.2, y: 0, z: 0, w: 0.3, h: 3, d: 2, visible: '3d', solid: true, interactable: true, labelKey: 'lvl.1-2.gate' },

  // 魔方 (N21)：出口區的拉桿「上」(貼後牆；只在 3D 拉得動，2D 站在旁邊看展開圖預覽)、東端的東門、西區前緣的南拱門 (只在實景：前緣在藏寶圖裡壓不出形狀)
  { id: 'lever', type: 'lever', word: 'up', x: 15, y: 0.2, z: -5.7, w: 0.6, h: 1.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.lever' },
  { id: 'doorE', type: 'cubeDoor', side: 'E', kind: 'door', x: 19.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.doorE' },
  { id: 'archS', type: 'cubeDoor', side: 'S', kind: 'arch', x: -17, y: 0, z: 5.8, w: 1.8, h: 2.6, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.archS' }
];

// 房間裝飾 (純呈現：不進碰撞、不可互動；由 render/decor 依序建出，順序即建立順序)
// 掛畫 / 牆上書架掛在後牆 (z 由後牆決定)；吊燈從牆頂垂下；地毯貼地；坑洞自動鋪在相鄰地板的缺口下
const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: -14, y: 3.1, w: 1.6, h: 1.2, variant: 0 },
  { kind: 'painting', x: -1, y: 3.2, w: 2.0, h: 1.4, variant: 1 },
  { kind: 'painting', x: 12.7, y: 3.1, w: 1.5, h: 1.1, variant: 2 }, // 讓出拉桿 (x≈15) 的上方，藏寶圖裡不重疊
  { kind: 'wallShelf', x: -12.6, y: 2.75, w: 2.2, seed: 1 },
  { kind: 'wallShelf', x: 4.3, y: 2.8, w: 2.0, seed: 4 },
  { kind: 'wallShelf', x: 16.4, y: 2.75, w: 1.8, seed: 6 },
  { kind: 'rug', x: -15, z: 1.5, w: 5, d: 3.4 },
  { kind: 'rug', x: 15, z: 1.2, w: 5.2, d: 3.6 },
  { kind: 'pendant', x: -15, z: 0.5 },
  { kind: 'pendant', x: -1, z: 0.5 },
  { kind: 'pendant', x: 5.5, z: 0.5 },
  { kind: 'pendant', x: 15, z: 0.5 },
  { kind: 'pits' }
];

export const foyer: LevelDef = {
  id: '1-2',
  titleKey: 'lvl.1-2.title',
  bounds: { minX: -20, maxX: 20, minZ: -6, maxZ: 6 },
  voidY: -5,
  start: { x: -18, y: 0, z: 2 },
  checkpoints: [{ minX: -5.7, x: -4, y: 0, z: 2 }],
  narrationKey: 'lvl.1-2.narration',
  puzzles: [
    { id: '1-2a', titleKey: 'lvl.1-2.puzzle.a' },
    { id: '1-2b', titleKey: 'lvl.1-2.puzzle.b' },
    { id: '1-2c', titleKey: 'lvl.1-2.puzzle.c' }
  ],
  nextKey: 'lvl.1-2.next',
  decor,
  objects
};
