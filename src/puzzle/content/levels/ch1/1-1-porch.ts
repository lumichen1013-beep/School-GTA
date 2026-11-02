import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 門廊 (第一關；全部現有機制)：起點區 x∈[-12,-4] ／ 走廊 x∈[-4,2] ／ 台階 x∈[4,8] ／ 坑 x∈[8,12] ／ 隔牆 x∈[13.3,13.7] ／ 玻璃間 x∈[13.7,20]
// 謎題鏈 (規格 6「1-1 門廊」)：
//   1-1a 兩種牆：x=-4 鐵柵 (只在實景，全深、高 4；3D 跳 1.25 跳不過) → 切藏寶圖走過；x=+2 墨牆 (只在藏寶圖，全高) → 切實景走過
//   1-1b 紙上跳得高：台階頂 1.35 (固定步長 1/60 的實際最高點：3D ≈1.18、2D ≈1.52；兩邊對台頂的餘裕都 ≈0.17 ≥ D10 的 0.15)；
//        坑寬 4 (2D 從台頂跳水平約 2.5、3D 約 2.3，都 < 坑寬 − 身寬 3.4)；台頂後方 z∈[-6,-4] 的木板橋只在實景 → 2D 上台、切 3D 沿台頂走到後方、過橋
// 與規格的差異：台頂 1.4 → 1.35。規格依 C4 連續公式 (3D 1.25 / 2D 1.6) 取 1.4，但實際 2D 最高點 1.52 只留 0.12 餘裕 < D10；降到 1.35 後兩邊都留 ≥ 0.15
//   1-1c 回來的深度：z=0 玻璃牆 (只在實景) 把玻璃間分成前後，玩家從隔牆門洞 (z∈[1.5,4.5]) 進入前半；後半的矮石階 (頂 0.6，z∈[-5,-1])
//        → 2D 跳上石階、切 3D：C11 取支撐物的深度 → 落在後半 → 開門 (門只在實景能開：藏寶圖沒有深度，不能隔著玻璃開門)
// 規格座標：1-1a / 1-1b 原樣；1-1c 規格的石階 x∈[-2,0] 為該題局部座標，整體平移 +17 → x∈[15,17]
// 隔牆 (規格未寫)：讓玩家一定從前半 (z>0) 以實景進入玻璃間；否則可在橋後 (z≈-5) 切藏寶圖穿過玻璃間左緣，回實景時還原 z3d 直接落在後半 (捷徑)
// 文字一律為 content/text/zh-Hant/lvl-1-1.ts 的 key；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -6
const floorBase = { type: 'floor', y: -1, z: 0, h: 1, d: 12, visible: 'both', solid: true } as const;
const partBase = { type: 'wall', x: 13.5, y: 0, w: 0.4, h: 6, visible: 'both', solid: true, labelKey: 'lvl.1-1.wall' } as const;

const objects: ObjDef[] = [
  { ...floorBase, id: 'floorA', x: -2, w: 20 },
  { ...floorBase, id: 'floorB', x: 16, w: 8 },

  // 1-1a 兩種牆
  { id: 'bars', type: 'bars', x: -4, y: 0, z: 0, w: 0.3, h: 4, d: 12, visible: '3d', solid: true, labelKey: 'lvl.1-1.bars' },
  { id: 'inkwall', type: 'inkwall', x: 2, y: 0, z: 0, w: 0.5, h: 6, d: 12, visible: '2d', solid: true, labelKey: 'lvl.1-1.inkwall' },

  // 1-1b 紙上跳得高：台階 (全深) + 坑 x∈[8,12] (兩塊地板之間) + 台頂後方的木板橋 (頂面與台頂同高 1.35)
  { id: 'stair', type: 'stone', x: 6, y: 0, z: 0, w: 4, h: 1.35, d: 12, visible: 'both', solid: true, labelKey: 'lvl.1-1.stair' },
  { id: 'plank', type: 'plank', x: 10, y: 1.15, z: -5, w: 4, h: 0.2, d: 2, visible: '3d', solid: true, labelKey: 'lvl.1-1.plank' },

  // 隔牆：門洞 z∈[1.5,4.5] 只在實景能穿過 (藏寶圖裡整面牆壓成一道)
  { ...partBase, id: 'partBack', z: -2.25, d: 7.5 },
  { ...partBase, id: 'partFront', z: 5.25, d: 1.5 },
  { ...partBase, id: 'lintel', y: 3, h: 3, z: 3, d: 3 },

  // 1-1c 回來的深度：玻璃牆 (全寬、全高) + 後半的矮石階 + 後半的門
  { id: 'glass', type: 'glass', x: 16.85, y: 0, z: 0, w: 6.3, h: 6, d: 0.1, visible: '3d', solid: true, labelKey: 'lvl.1-1.glass' },
  { id: 'step', type: 'stone', x: 16, y: 0, z: -3, w: 2, h: 0.6, d: 4, visible: 'both', solid: true, labelKey: 'lvl.1-1.step' },
  // 字條 (1-1c L1，story-bible 7.3)：貼在玻璃前面，兩模式都讀得到
  { id: 'note', type: 'note', x: 15, y: 1.0, z: 0.1, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.1-1.note', textKey: 'lvl.1-1.note.1' },
  { id: 'door', type: 'door', x: 18.6, y: 0, z: -5.85, w: 1.6, h: 2.4, d: 0.3, visible: 'both', solid: false, interactable: true, interactIn: '3d', unsealed: true,
    labelKey: 'lvl.1-1.door', useText: 'lvl.1-1.door.use' }
];

// 房間裝飾 (純呈現：不進碰撞、不可互動；沿用玄關主題)；台階上方不掛吊燈 (站在台頂往後走時吊線會擋住視線)
const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: -9, y: 3.1, w: 1.6, h: 1.2, variant: 0 },
  { kind: 'painting', x: -1, y: 3.2, w: 1.8, h: 1.3, variant: 1 },
  { kind: 'painting', x: 16, y: 3.4, w: 1.6, h: 1.1, variant: 2 },
  { kind: 'wallShelf', x: -6.4, y: 2.75, w: 1.8, seed: 2 },
  { kind: 'wallShelf', x: 10, y: 3.6, w: 2.0, seed: 5 },
  { kind: 'rug', x: -8.5, z: 2, w: 5, d: 3.4 },
  { kind: 'rug', x: 17.2, z: 3.2, w: 4.4, d: 2.6 },
  { kind: 'pendant', x: -8.5, z: 1 },
  { kind: 'pendant', x: -1, z: 1 },
  { kind: 'pendant', x: 17, z: 3 },
  { kind: 'pits' }
];

export const porch: LevelDef = {
  id: '1-1',
  titleKey: 'lvl.1-1.title',
  bounds: { minX: -12, maxX: 20, minZ: -6, maxZ: 6 },
  voidY: -5,
  start: { x: -10, y: 0, z: 2 },
  checkpoints: [{ minX: 2.6, x: 3, y: 0, z: 2 }, { minX: 12.4, x: 12.8, y: 0, z: 2 }],
  narrationKey: 'lvl.1-1.narration',
  nextKey: 'lvl.1-1.next',
  decor,
  objects
};
