import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 玄關 (擴建；第一章魔方的 D 格，規格 6「1-2 玄關」)：入口區 (西區) x∈[-20,-10] ／ 缺口 x∈[-10,-6] ／ 中庭 x∈[-6,10] ／ 隔牆 x∈[10,10.4] ／ 出口區 x∈[10.4,20]
// 謎題 (規格 v0.3 的編號；內部物件 id 沿用 v0.2，房間快照 / 存檔以 id 對應)：
//   (路段，不計題) 書架過缺口：3D 被木欄圍住的書架，2D 壓平後就是腳下的路 (noLand3d 讓回 3D 時落在地板)；與 1-1a 的 aha 重疊，v0.3 降為複習路段
//   1-2a 推箱取筆尖：3D 把木箱推到高台旁 (z 不必對齊) → 2D 地板→箱 (1.1)→高台 (2.5) → 2D 拾取筆尖 (= 寫的能力 nib + 空的字卡匣)
//   1-2b 長桌下的踏板：木箱沿 -z 推進長桌後方窄道、沿窄道推到踏板 x → 2D 壓下 (鎖定；weight 2 = 一個原尺寸木箱，玩家 1 太輕) → 鐵柵門升起
//   1-2c 門後是牆 (P1 首次)：出口區東端的東門 (cubeDoor) 起初面對空的魔方格 →「門後是牆。」；
//        2D 展開圖站在拉桿旁看預覽 → 3D 拉出口區的拉桿「上」→ 玄關 (連同玩家) 滑到 A 格 → 東門接上樓梯間的西門
//   1-2d 三代的年份 (P16 首次；N27 順序鎖)：西區後牆三幅畫像 (左 祖父、中 爸爸小時候、右 曾祖)，年份分在兩個視角 —
//        右只刻在實景畫框 (1931)、中只用墨寫在藏寶圖 (1979)、左兩邊都有 (實景 1958；藏寶圖 ~~1926~~ 改 1958)；
//        依年代由早到晚 3D 拉繩：右 → 左 → 中 → 畫像下的小抽屜彈開，取得詞卡「右」(1-3b 用)；拉錯全部彈回、無懲罰。進場就看得到、任何時候都可做
//   入口：南拱門 (S，西區前緣 x=-17) 接大門 (1-1 門廊)；玄關滑走後南拱門面對空格；S2 (衣帽間滑到 D) 南拱門接衣帽間北拱門 (木箱推得過來)
//   1-3a 的掛鉤 (銅鑰匙) 也在西區 (x=-14.8 高處)；拉桿的標籤「上」可貼詞卡 (N22；1-3b 的錯誤嘗試：玄關在 A 往右是樓梯間，推不動)
// C7 (M1a)：原書架字條 (note，x=-17) 移除；字條 a～d 依 story-bible 7.3；新增 1-2c 字條 noteC、1-2d 畫像 / 拉繩 / 抽屜 / 字條 noteD
// 文字一律為 content/text/zh-Hant/lvl-1-2.ts 的 key
// 座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -6
const WALL_Z = -5.95;
const floorBase = { type: 'floor', y: -1, z: 0, h: 1, d: 12, visible: 'both', solid: true } as const;
const railBase = { type: 'rail', y: 0, h: 2.6, visible: '3d', solid: true, labelKey: 'lvl.1-2.rail' } as const;
const partBase = { type: 'wall', x: 10.2, y: 0, w: 0.4, h: 6, visible: 'both', solid: true, labelKey: 'lvl.1-2.wall' } as const;
const portraitBase = { type: 'portrait', y: 2, z: -5.92, w: 1, h: 1.3, d: 0.08, visible: 'both', solid: false, labelKey: 'lvl.1-2.portrait' } as const;
const cordBase = { type: 'cord', lock: 'drawer', y: 0.95, z: -5.8, w: 0.2, h: 1.05, d: 0.1, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.cord' } as const;
const noteBase = { type: 'note', y: 1.0, z: WALL_Z, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.1-2.note' } as const;

const objects: ObjDef[] = [
  { ...floorBase, id: 'floorA', x: -15, w: 10 },
  { ...floorBase, id: 'floorB', x: 7, w: 26 },

  // ① 缺口 x∈[-10,-6]；書架平台橫跨缺口、緊貼後牆，頂面與地板同高。3D 被木欄圍住 (欄高 2.6，站木箱也跳不過)
  { id: 'shelf', type: 'shelf', x: -8, y: -0.3, z: -5.2, w: 5.2, h: 0.3, d: 1.6, visible: 'both', solid: true, noLand3d: true, labelKey: 'lvl.1-2.shelf' },
  { ...railBase, id: 'railFront', x: -8, z: -4.2, w: 6.2, d: 0.2 },
  { ...railBase, id: 'railL', x: -11, z: -5.05, w: 0.2, d: 1.9 },
  { ...railBase, id: 'railR', x: -5, z: -5.05, w: 0.2, d: 1.9 },

  // ③ 長桌只存在於現實 (圖紙沒畫它)，從前牆一路延伸到 z=-4.6，只留後方一條窄道；壓板畫在桌子底下的那一段
  { id: 'table', type: 'table', x: -1, y: 0, z: 0.7, w: 3, h: 0.8, d: 10.6, visible: '3d', solid: true, labelKey: 'lvl.1-2.table' },
  { id: 'plate', type: 'plate', x: -1, y: 0, z: -5.3, w: 1.2, h: 0.06, d: 1.2, visible: '2d', solid: false, weight: 2, opens: 'gate', labelKey: 'lvl.1-2.plate' },
  { ...noteBase, id: 'note3', x: 2.2, textKey: 'lvl.1-2.note.b' }, // 1-2b L1 (長桌右後方)

  // ② 木箱 + 高台：木箱起點離高台 2.9，2D 也跳不上；推近後切 2D 才跳得到 2.5 的高台
  { id: 'crate', type: 'crate', x: 4.5, y: 0, z: 2, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true, labelKey: 'lvl.1-2.crate' },
  { ...noteBase, id: 'note2', x: 6, textKey: 'lvl.1-2.note.a' }, // 1-2a L1 (木箱與高台之間)
  { id: 'plinth', type: 'plinth', x: 8.5, y: 0, z: -4.5, w: 1, h: 2.5, d: 3, visible: 'both', solid: true, labelKey: 'lvl.1-2.plinth' },
  { id: 'key', type: 'key', x: 8.5, y: 2.5, z: -4.5, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.1-2.key',
    grants: 'nib', useText: 'lvl.1-2.key.use' },

  // 隔牆：門洞 z∈[-1,1] 只在現實能穿過 (圖紙裡整面牆壓成一道)，門洞由 3D 閘門擋住，壓板壓下才升起
  { ...partBase, id: 'partBack', z: -3.5, d: 5 },
  { ...partBase, id: 'partFront', z: 3.5, d: 5 },
  { ...partBase, id: 'lintel', y: 3, h: 3, z: 0, d: 2 },
  { id: 'gate', type: 'gate', x: 10.2, y: 0, z: 0, w: 0.3, h: 3, d: 2, visible: '3d', solid: true, interactable: true, labelKey: 'lvl.1-2.gate' },

  // 魔方 (N21)：出口區的拉桿「上」(貼後牆；只在 3D 拉得動，2D 站在旁邊看展開圖預覽)、東端的東門、西區前緣的南拱門 (只在實景：前緣在藏寶圖裡壓不出形狀)
  { id: 'lever', type: 'lever', word: 'up', label: { id: 'lever:foyer', kind: 'dir' }, x: 15, y: 0.2, z: -5.7, w: 0.6, h: 1.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.lever' },
  { id: 'doorE', type: 'cubeDoor', side: 'E', kind: 'door', x: 19.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.doorE' },
  { id: 'archS', type: 'cubeDoor', side: 'S', kind: 'arch', x: -17, y: 0, z: 5.8, w: 1.8, h: 2.6, d: 0.4, visible: '3d', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-2.archS' },
  { ...noteBase, id: 'noteC', x: 17, textKey: 'lvl.1-2.note.c' }, // 1-2c L1 (出口區，拉桿與東門之間；離兩者 > 1.5，藏寶圖裡站在東門 / 拉桿旁不會對到字條)

  // 1-2d 西區後牆：三幅畫像 (底 y=2，不可互動) + 各一條拉繩 (只在 3D 拉得動；相鄰 1.5，站在繩前只會對到那一條) + 畫像下的小抽屜 (順序鎖)
  { ...portraitBase, id: 'portraitL', x: -19, variant: 0, carved: 'lvl.1-2.portrait.L.carved', ink: 'lvl.1-2.portrait.L.ink' },
  { ...portraitBase, id: 'portraitM', x: -17.5, variant: 1, ink: 'lvl.1-2.portrait.M.ink' },
  { ...portraitBase, id: 'portraitR', x: -16, variant: 2, carved: 'lvl.1-2.portrait.R.carved' },
  { ...cordBase, id: 'cordL', x: -19 },
  { ...cordBase, id: 'cordM', x: -17.5 },
  { ...cordBase, id: 'cordR', x: -16 },
  { id: 'drawer', type: 'drawer', order: ['cordR', 'cordL', 'cordM'], reward: 'card.right', openText: 'lvl.1-2.drawer.open',
    x: -17.5, y: 0.2, z: -5.8, w: 0.9, h: 0.45, d: 0.3, visible: 'both', solid: false, labelKey: 'lvl.1-2.drawer' },
  { ...noteBase, id: 'noteD', x: -13, textKey: 'lvl.1-2.note.d' }, // 1-2d L1 (西區，離拉繩 ≥ 3：站在字條前不會對到繩子)

  // 1-3a 的目標 (規格 6「1-3a 連箱帶人」)：西區後牆高處的掛鉤 (底 y=2.3，只在藏寶圖拿得到)，掛著房間的銅鑰匙與許問津的手記第一頁。
  // 站地板：身體中心 0.45 → 差 1.85 > 1.5 搆不到；站箱頂 (1.1)：差 0.75。玄關自己的木箱過不了缺口，要從衣帽間經拱門推一個過來
  { id: 'hook', type: 'hook', grants: 'key.brass', also: ['diary.1'], useText: 'lvl.1-2.hook.use',
    x: -14.8, y: 2.3, z: -5.85, w: 0.3, h: 0.45, d: 0.15, visible: 'both', solid: false, interactable: true, interactIn: '2d', labelKey: 'lvl.1-2.hook' }
];

// 房間裝飾 (純呈現：不進碰撞、不可互動；由 render/decor 依序建出，順序即建立順序)
// 掛畫 / 牆上書架掛在後牆 (z 由後牆決定)；吊燈從牆頂垂下；地毯貼地；坑洞自動鋪在相鄰地板的缺口下
const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: -14.8, y: 3.35, w: 1.3, h: 1.0, variant: 0 }, // 讓出掛鉤 (x≈-14.8、y 2.3～2.75) 的位置：畫在掛鉤正上方
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
    { id: '1-2c', titleKey: 'lvl.1-2.puzzle.c' },
    { id: '1-2d', titleKey: 'lvl.1-2.puzzle.d' }
  ],
  nextKey: 'lvl.1-2.next',
  decor,
  objects
};
