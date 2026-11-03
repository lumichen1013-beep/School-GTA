// 第三章魔方 (規格 6「第三章魔方與門位（v0.4 細化）」「第三章骨架與銜接」、5.4.2、5.4.9)：3×3 (北列 y=0、中列 y=1、南列 y=2)；滑動、兩個空格；控制盤 = 3-1 苗圃的園丁羅盤
//   北列：（空格）｜（空格）｜■ 工具間 (實心)；中列：3-1 苗圃 (nursery)｜3-3 夜溫室 (night)｜3-2 玻璃長廊 (gallery)；
//   南列：■ 水塔 (實心)｜H2 溫床 (bed，隱藏房占位)｜3-4 溫室深處 (depths)
//   屋框：章門入口 (來時的走廊，接書房深處的章門) 在 [0,1] 西側；天窗在 [0,0]、[1,0] 北側；章門出口 (往地下室) 在 [2,2] 南側
// 組 = 九格各一個 slideCell (c0～c8，格號 x + 3y)；沒有鎖扣 (本章的限制改由卡榫擔任，3-1b 起)
import type { CubeDef, Side } from '../../core/cube';

export const CH3_CUBE: CubeDef = {
  id: 'ch3',
  dims: [3, 3, 1],
  ops: 'slide',
  control: 'dial',
  cells: [
    { at: [2, 0, 0], room: 'solid', label: 'lvl.ch3.toolshed' },
    { at: [0, 1, 0], room: 'nursery' }, { at: [1, 1, 0], room: 'night' }, { at: [2, 1, 0], room: 'gallery' },
    { at: [0, 2, 0], room: 'solid', label: 'lvl.ch3.waterTower' }, { at: [1, 2, 0], room: 'bed' }, { at: [2, 2, 0], room: 'depths' }
  ],
  frame: [
    { at: [0, 1, 0], side: 'W', kind: 'porch', to: 'study' },
    { at: [0, 0, 0], side: 'N', kind: 'skylight' },
    { at: [1, 0, 0], side: 'N', kind: 'skylight' },
    { at: [2, 2, 0], side: 'S', kind: 'chapterExit', to: 'cellar' }
  ],
  dial: {
    entry: { room: 'nursery', obj: 'dial' },
    groups: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, kind: 'slideCell' as const, index: i })),
    locks: []
  }
};

/** 一間房的彩繪玻璃 (光路 N26)：glass = 有玻璃的邊 (本地門位)；prism = 稜鏡 (成對、雙向：從 a 進來的光轉向 b，從 b 進來的轉向 a) */
export interface RoomGlass { glass: readonly Side[]; prism?: ReadonlyArray<readonly [Side, Side]> }

/**
 * 第三章各房的彩繪玻璃 (規格「第三章魔方與門位」房間表；光路傳播在 3-2 實作時讀這張表 → core/chapter.lightPaths)。
 * 苗圃屋頂是木棚 (沒有玻璃)；長廊 N / W / S + 稜鏡 W↔S；夜溫室 N / S (玻璃屋頂，光直穿)；深處 N (九格花窗) / W (苔窗)；溫床 N / E + 稜鏡 N↔E
 */
export const CH3_GLASS: Readonly<Record<string, RoomGlass>> = {
  nursery: { glass: [] },
  gallery: { glass: ['N', 'W', 'S'], prism: [['W', 'S']] },
  night: { glass: ['N', 'S'] },
  depths: { glass: ['N', 'W'] },
  bed: { glass: ['N', 'E'], prism: [['N', 'E']] }
};
