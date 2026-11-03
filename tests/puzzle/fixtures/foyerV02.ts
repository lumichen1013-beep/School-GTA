import type { DecorItem, LevelDef, ObjDef } from '../../../src/puzzle/core/types';

// 玄關 (擴建)：入口區 x∈[-20,-10] ／ 缺口 x∈[-10,-6] ／ 中庭 x∈[-6,10] ／ 隔牆 x∈[10,10.4] ／ 出口區 x∈[10.4,20]
// 謎題鏈 (規格 6「1-2 玄關」；顯示編號 1-2a～1-2d，內部物件 id 沿用)：
//   1-2a 書架過缺口：3D 被木欄圍住的書架，2D 壓平後就是腳下的路 (noLand3d 讓回 3D 時落在地板)
//   1-2b 推箱取筆尖：3D 把木箱推到高台旁 (z 不必對齊) → 2D 地板→箱 (1.1)→高台 (2.5) → 2D 拾取筆尖
//   1-2c 長桌下的機關踏板：木箱沿 -z 推進長桌後方窄道、沿窄道推到踏板 x → 2D 壓下 (鎖定) → 鐵柵門升起
//   1-2d 高處的墨水閥：墨水閥在 y=2.3 (只在 2D)；踏板鎖定後木箱又自由了 → 物歸原處 (T) 讓木箱回到起點 (踏板 / 鐵柵門維持)
//        → 3D 推到 z∈[-0.4,0.4] (門洞 z∈[-1,1]、箱深 1.2) → 推過門洞到 x≈15 → 2D 跳上箱頂 → 轉閥 → 出口門
//   互動範圍 1.5 (身體中心 = 腳底 + 0.45)：站地板 0.45 → 閥底 2.3 差 1.85 > 1.5；站箱頂 1.55 → 差 0.75 ≤ 1.5
//   (箱頂水平容許：|Δx| ≤ √(1.5²−0.75²) ≈ 1.3，即玩家中心 x∈[13.45,16.55])；跳高實測 3D ≈1.18 / 2D ≈1.52，2D 跳上箱頂 (1.1) 餘裕 0.42
// 與規格的差異：規格寫「從踏板沿窄道推回、推到 z≈0」，但木箱在窄道裡緊貼後牆 (z=-5.4，背面 = 後牆)，玩家站不到它後方、
//   無法再往 +z 推；唯一的回收方式是物歸原處 (C12：只歸位木箱，踏板 / 鐵柵門已鎖定不受影響)。只改墨水閥高度，不動其他座標
// 文字：v0.2 才有 / 改版後改掉的 key 用本檔的 FOYER_V02_TEXT (v02.1-2.*，字串為 v0.2 原文)；其餘沿用 content/text/zh-Hant/lvl-1-2.ts
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
  { ...noteBase, id: 'note', x: -17, textKey: 'v02.1-2.note.1' }, // 1-2a L1 (入口區，起點旁)

  // ③ 長桌只存在於現實 (圖紙沒畫它)，從前牆一路延伸到 z=-4.6，只留後方一條窄道；壓板畫在桌子底下的那一段
  { id: 'table', type: 'table', x: -1, y: 0, z: 0.7, w: 3, h: 0.8, d: 10.6, visible: '3d', solid: true, labelKey: 'lvl.1-2.table' },
  { id: 'plate', type: 'plate', x: -1, y: 0, z: -5.3, w: 1.2, h: 0.06, d: 1.2, visible: '2d', solid: false, opens: 'gate', labelKey: 'lvl.1-2.plate' },
  { ...noteBase, id: 'note3', x: 2.2, textKey: 'v02.1-2.note.3' }, // 1-2c L1 (長桌右後方)

  // ② 木箱 + 高台：木箱起點離高台 2.9，2D 也跳不上；推近後切 2D 才跳得到 2.5 的高台
  { id: 'crate', type: 'crate', x: 4.5, y: 0, z: 2, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true, labelKey: 'lvl.1-2.crate' },
  { ...noteBase, id: 'note2', x: 6, textKey: 'v02.1-2.note.2' }, // 1-2b L1 (木箱與高台之間)
  { id: 'plinth', type: 'plinth', x: 8.5, y: 0, z: -4.5, w: 1, h: 2.5, d: 3, visible: 'both', solid: true, labelKey: 'lvl.1-2.plinth' },
  { id: 'key', type: 'key', x: 8.5, y: 2.5, z: -4.5, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.1-2.key',
    grants: 'nib', useText: 'v02.1-2.key.use' },

  // 隔牆：門洞 z∈[-1,1] 只在現實能穿過 (圖紙裡整面牆壓成一道)，門洞由 3D 閘門擋住，壓板壓下才升起
  { ...partBase, id: 'partBack', z: -3.5, d: 5 },
  { ...partBase, id: 'partFront', z: 3.5, d: 5 },
  { ...partBase, id: 'lintel', y: 3, h: 3, z: 0, d: 2 },
  { id: 'gate', type: 'gate', x: 10.2, y: 0, z: 0, w: 0.3, h: 3, d: 2, visible: '3d', solid: true, interactable: true, labelKey: 'lvl.1-2.gate' },

  // 1-2d 出口區：墨水閥只畫在圖紙上、掛在高處 (y=2.3；需筆尖，解封出口門)；出口門在後牆 (被墨水閥 opens 解封 = used)
  { id: 'valve', type: 'valve', x: 15, y: 2.3, z: -5.7, w: 0.5, h: 0.5, d: 0.5, visible: '2d', solid: false, interactable: true, labelKey: 'v02.1-2.valve',
    requires: 'nib', opens: 'door', lockedText: 'v02.1-2.valve.locked', useText: 'v02.1-2.valve.use' },
  { id: 'door', type: 'door', x: 18, y: 0, z: -5.85, w: 1.6, h: 2.4, d: 0.3, visible: 'both', solid: false, interactable: true, labelKey: 'v02.1-2.door',
    lockedText: 'v02.1-2.door.locked', useText: 'v02.1-2.door.use' }
];

// 房間裝飾 (純呈現：不進碰撞、不可互動；由 render/decor 依序建出，順序即建立順序)
// 掛畫 / 牆上書架掛在後牆 (z 由後牆決定)；吊燈從牆頂垂下；地毯貼地；坑洞自動鋪在相鄰地板的缺口下
const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: -14, y: 3.1, w: 1.6, h: 1.2, variant: 0 },
  { kind: 'painting', x: -1, y: 3.2, w: 2.0, h: 1.4, variant: 1 },
  { kind: 'painting', x: 12.7, y: 3.1, w: 1.5, h: 1.1, variant: 2 }, // 讓出高處墨水閥 (x≈15、y 2.3～2.8) 的後方，藏寶圖裡不重疊
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

/**
 * v0.2 玄關的文字 (C7 自 zh-Hant 移出：墨水閥 / 出口門 / 書架字條 / 舊題名 / 舊字條 / 舊筆尖文字，正式內容已不再使用)；
 * 測試的文字解析器 (tests/puzzle/msgs.ts TEXT) 與驗證器 bundle 疊上這一份，凍結場景的訊息與 v0.2 一字不差
 */
export const FOYER_V02_TEXT: Readonly<Record<string, string>> = {
  'v02.1-2.narration': '鋼筆少了筆尖。墨線封住了門。',
  'v02.1-2.next': '墨線像退潮一樣散開。門後的走廊很長。下一間房：衣帽間（尚未開放）',
  'v02.1-2.puzzle.a': '1-2a 書架過缺口',
  'v02.1-2.puzzle.b': '1-2b 推箱取筆尖',
  'v02.1-2.puzzle.c': '1-2c 長桌下的機關踏板',
  'v02.1-2.puzzle.d': '1-2d 高處的墨水閥',
  'v02.1-2.valve': '墨水閥',
  'v02.1-2.door': '出口門',
  'v02.1-2.note.1': '缺口不寬。當年他們也是這樣走過去的？',
  'v02.1-2.note.2': '想要高一點？我小時候都踩著朋友的肩膀。',
  'v02.1-2.note.3': '桌子底下，好像有什麼不想讓人看？',
  'v02.1-2.key.use': '拿到了「[[term.nib]]」。筆尖還是濕的。像有人剛用過。',
  'v02.1-2.valve.locked': '墨水閥乾涸了。需要一支能引墨的東西。',
  'v02.1-2.valve.use': '[[term.nib]]點下，墨線像退潮一樣散開了。',
  'v02.1-2.door.locked': '門被墨線封印著。[[term.mode2d]]裡似乎有它的機關。',
  'v02.1-2.door.use': '門開了。'
};

/**
 * 1-2 玄關 v0.2 版 (M-Cube C6 之前的實作原樣凍結；含墨水閥 / 出口門)：只給「機制 / 引擎行為」的回歸測試當固定場景用
 * (閥 / 門 / 推箱 / 壓板 / 捷徑掃描器 / 渲染)。正式玄關改版後的關卡測試一律用 content/levels/ch1/1-2-foyer.ts
 */
export const FOYER_V02: LevelDef = {
  id: '1-2',
  titleKey: 'lvl.1-2.title',
  bounds: { minX: -20, maxX: 20, minZ: -6, maxZ: 6 },
  voidY: -5,
  start: { x: -18, y: 0, z: 2 },
  checkpoints: [{ minX: -5.7, x: -4, y: 0, z: 2 }],
  narrationKey: 'v02.1-2.narration',
  puzzles: [
    { id: '1-2a', titleKey: 'v02.1-2.puzzle.a' },
    { id: '1-2b', titleKey: 'v02.1-2.puzzle.b' },
    { id: '1-2c', titleKey: 'v02.1-2.puzzle.c' },
    { id: '1-2d', titleKey: 'v02.1-2.puzzle.d' }
  ],
  nextKey: 'v02.1-2.next',
  decor,
  objects
};
