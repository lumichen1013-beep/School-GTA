// 2-4a 的老宅立面圖 (規格 6「2-4 手稿庫（細化）」)：完整的圖畫在 3 × 2 格上 (x 0～3 向右、y 0～2 向下)；每間房的地板只畫自己那一格
// 字串格式 = 折線 (「x,y x,y …」) 以「;」分隔 (DecorValue 只能是字串；呈現層 render/decor 與展開圖 ui/cubeMap 依格裁切後畫)
export const HOUSE_DRAWING = [
  '0.15,1 1.5,0.22 2.85,1',                         // 屋頂
  '1.62,0.32 1.62,0.08 1.9,0.08 1.9,0.48',          // 煙囪
  '0.4,1 0.4,1.9 2.6,1.9 2.6,1',                    // 牆
  '0.6,1.2 0.98,1.2 0.98,1.56 0.6,1.56 0.6,1.2',    // 窗
  '0.79,1.2 0.79,1.56', '0.6,1.38 0.98,1.38',        // 窗格
  '1.3,1.9 1.3,1.3 1.7,1.3 1.7,1.9',                // 大門
  '1.62,1.62 1.64,1.62',                            // 門把
  '2.78,1.9 2.78,1.52',                             // 樹幹
  '2.78,1.06 2.97,1.14 3,1.32 2.92,1.5 2.78,1.56 2.6,1.5 2.56,1.32 2.62,1.14 2.78,1.06' // 樹冠
].join(';');

/** 目標排列 (手稿櫃的圖)：房間 → 它那一角在圖上的格 [行, 列] */
export const HOUSE_TARGET: Readonly<Record<string, readonly [number, number]>> = {
  reading: [0, 0], shelf: [1, 0], mezz: [2, 0], print: [0, 1], manuscripts: [1, 1], deep: [2, 1]
};

/** 一間房地板上的那一角 (裝飾 floorPiece；x / z = 地板上的位置、w = 邊長) */
export const floorPiece = (room: string, x: number, z: number, w = 2.6) =>
  ({ kind: 'floorPiece', x, z, w, px: HOUSE_TARGET[room][0], py: HOUSE_TARGET[room][1], drawing: HOUSE_DRAWING });
