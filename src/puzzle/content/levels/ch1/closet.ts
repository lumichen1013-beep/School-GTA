import type { DecorItem, LevelDef, ObjDef } from '../../../core/types';

// 1-3 衣帽間 (第一章魔方的 C 格；房間 id 'closet'，關卡 id '1-3'；規格 6「1-3 衣帽間」)
//   北拱門 (N，後牆 x=-1)：S1 接樓梯間的南門 (門對拱門 = 只有人能過，箱子推不出去)；S2 (衣帽間滑到 D) 接玄關的南拱門 (拱門對拱門：箱子推得過去)
//   東章門 (E)：S1 / S0 對著書房走廊 (屋框)；要房間的銅鑰匙 (1-3a 在玄關西區高處的掛鉤取得) 才開，開了 = 第一章通關
// 謎題：
//   1-3a 連箱帶人 (P2 首次)：衣帽間的木箱出不了人用的門 → 3D 拉拉桿「左」→ 衣帽間 (連同玩家與木箱) 滑到 D → 北拱門對上玄關南拱門 →
//        把木箱推進拱門 (跨房到玄關西區) → 推到掛鉤下 (玄關 x≈-14.8) → 2D 跳上箱頂 → E 取下銅鑰匙 (與許問津的手記第一頁)
//        完成後回到衣帽間：安靜 2.5 秒後三件大衣同時滑落 (規格 9.1 驚嚇；calmTension = 安靜地落下)
//   1-3b 回來的路 (P7 首次)：S2 時章門面對空格 → 2D 對拉桿的標籤「左」貼上詞卡「右」(1-2d 取得) → 3D 拉 → 衣帽間滑回 C → 章門接上書房走廊 → 銅鑰匙開門
//   「量」的鋪陳 (不計題)：衣架的標籤「大衣」旁有一格空著的尺度卡槽 (貼詞卡 = 不成字，卡片退回)
// 文字一律為 content/text/zh-Hant/lvl-1-3.ts 的 key；座標：x 向右、y 向上、z 向觀眾；地板頂面 y = 0；後牆 z = -5
const WALL_Z = -4.95;
const noteBase = { type: 'note', y: 1.0, z: WALL_Z, w: 0.7, h: 0.9, d: 0.1, visible: 'both', solid: false, interactable: true, labelKey: 'lvl.1-3.note' } as const;

const objects: ObjDef[] = [
  { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 14, h: 1, d: 10, visible: 'both', solid: true },
  { id: 'archN', type: 'cubeDoor', side: 'N', kind: 'arch', x: -1, y: 0, z: -4.8, w: 1.8, h: 2.6, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-3.archN' },
  { id: 'chapterE', type: 'cubeDoor', side: 'E', kind: 'chapter', key: 'key.brass', openText: 'lvl.1-3.chapterE.open',
    x: 6.8, y: 0, z: 0, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-3.chapterE' },
  // 拉桿「左」(貼後牆；只在 3D 拉得動)；標籤只在藏寶圖看得到、寫得到 (N22)
  { id: 'lever', type: 'lever', word: 'left', label: { id: 'lever:closet', kind: 'dir', noCardText: 'lvl.1-3.lever.noCard' },
    x: 2.5, y: 0.2, z: -4.7, w: 0.6, h: 1.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d', labelKey: 'lvl.1-3.lever' },
  // 衣帽間的木箱 (id 與玄關的 crate 不同：跨房後兩個箱子同在玄關)；正北推 → 半個箱身壓進拱門
  { id: 'closetCrate', type: 'crate', x: -1.6, y: 0, z: 1.2, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true, labelKey: 'lvl.1-3.crate' },
  // 衣架與三件大衣 (不擋路、不可互動；標籤「大衣」+ 空的尺度卡槽)
  { id: 'coats', type: 'coatRack', fallWhen: 'key.brass', scare: 'coats', fallText: 'lvl.1-3.coats.fall',
    label: { id: 'coats', kind: 'noun', textKey: 'lvl.1-3.coats.word', scale: true },
    x: -4.6, y: 0, z: -4.5, w: 2.4, h: 2.3, d: 0.8, visible: 'both', solid: false, labelKey: 'lvl.1-3.coats' },
  { ...noteBase, id: 'noteA', x: -6.5, textKey: 'lvl.1-3.note.a' },                    // 1-3a L1 (衣架旁)
  { ...noteBase, id: 'noteA2', x: -2.8, textKey: 'lvl.1-3.note.a2', revealAfter: 240 }, // 1-3a L2 (空白；進房 4 分鐘浮現)
  { ...noteBase, id: 'noteB', x: 5, textKey: 'lvl.1-3.note.b' }                         // 1-3b L1 (拉桿與章門之間)
];

const decor: DecorItem[] = [
  { kind: 'walls' },
  { kind: 'painting', x: 4.6, y: 3.3, w: 1.6, h: 1.2, variant: 0 },
  { kind: 'wallShelf', x: -4.6, y: 3.4, w: 2.4, seed: 7 },
  { kind: 'rug', x: 0.5, z: 1.4, w: 5, d: 3.2 },
  { kind: 'pendant', x: -2.5, z: 0.5 },
  { kind: 'pendant', x: 3.5, z: 0.5 }
];

export const closet: LevelDef = {
  id: '1-3',
  titleKey: 'lvl.1-3.title',
  bounds: { minX: -7, maxX: 7, minZ: -5, maxZ: 5 },
  voidY: -5,
  start: { x: 0, y: 0, z: 1 },
  narrationKey: 'lvl.1-3.narration',
  puzzles: [
    { id: '1-3a', titleKey: 'lvl.1-3.puzzle.a' },
    { id: '1-3b', titleKey: 'lvl.1-3.puzzle.b' }
  ],
  nextKey: 'lvl.1-3.next',
  decor,
  objects
};
