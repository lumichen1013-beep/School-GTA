// 第一章魔方 (規格 6 第一章、architecture 6.6)：2×2 滑動；A 左上空格、B 右上樓梯間、C 右下衣帽間、D 左下玄關 (上 = 北 = 後牆方向)
// 屋框：大門在 D 南側 (通 1-1 門廊)；書房走廊 (章門) 在 C 東側
import type { CubeDef, DoorInfo } from '../../core/cube';

export const CH1_CUBE: CubeDef = {
  id: 'ch1',
  dims: [2, 2, 1],
  ops: 'slide',
  cells: [
    { at: [1, 0, 0], room: 'stair' },
    { at: [1, 1, 0], room: 'closet' },
    { at: [0, 1, 0], room: 'foyer' }
  ],
  frame: [
    { at: [0, 1, 0], side: 'S', kind: 'porch' },
    { at: [1, 1, 0], side: 'E', kind: 'chapterExit', to: 'study' }
  ]
};

/**
 * 第一章抽象模型 (規格 5.4.8 / 6「第一章抽象模型驗證」；devtools/validateCube 的 BFS 輸入)：
 * 門位 (規格「房間 / 門位 / 機關」表) + 拉桿方向字 + 1-2d 詞卡「右」+ 1-3a 推箱 / 掛鉤 + 章門。
 * 房內謎題以「前置 → 旗標」抽象；房內物理由各關通關腳本另行驗證。內容實作後以測試比對門位與實際房間一致
 */
export const CH1_MODEL = {
  doors: [
    { room: 'foyer', door: 'archS', side: 'S', kind: 'arch' },
    { room: 'foyer', door: 'doorE', side: 'E', kind: 'door' },
    { room: 'stair', door: 'doorW', side: 'W', kind: 'door' },
    { room: 'stair', door: 'doorS', side: 'S', kind: 'door' },
    { room: 'closet', door: 'archN', side: 'N', kind: 'arch' },
    { room: 'closet', door: 'chapterE', side: 'E', kind: 'chapter' }
  ] as readonly DoorInfo[],
  /** 各房拉桿的原字 (玄關「上」、衣帽間「左」) */
  levers: { foyer: 'up', closet: 'left' } as Readonly<Record<string, 'up' | 'down' | 'left' | 'right'>>,
  /** 1-2d：在 card.room 取得詞卡 card.word；貼在 card.lever 房的拉桿上 = 改方向字 (1-3b) */
  card: { room: 'foyer', word: 'right', lever: 'closet' } as const,
  /** 1-3a：木箱起點的房間；只能經拱門對拱門跨房；箱子在 key.room 才取得到掛鉤上的鑰匙 */
  crate: { room: 'closet' },
  key: { room: 'foyer' },
  /** 起點 (從大門進玄關) 與終點 (帶鑰匙穿過章門到屋框 frame) */
  start: { room: 'foyer' },
  exit: { room: 'closet', door: 'chapterE', frame: 'study' }
};

/**
 * 舊存檔已通關 1-2 (v2 以前的玄關) → 第一章開章時的預設快照 (規格 8 遷移 v2 → v3)：
 * 1-2a、1-2b 的旗標成立 (筆尖已拿、踏板已壓、鐵柵門已開)，不必重做；1-2c 起照常要做
 */
export const CH1_LEGACY = {
  level: '1-2',
  room: 'foyer',
  objs: { key: { gone: true }, plate: { used: true }, gate: { used: true } } as Readonly<Record<string, { gone?: boolean; used?: boolean }>>,
  items: { nib: 1 } as Readonly<Record<string, number>>
};
