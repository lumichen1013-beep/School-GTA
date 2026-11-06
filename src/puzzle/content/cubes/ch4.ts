// 第四章魔方 (規格 6「第四章魔方與門位（v0.4 細化）」「第四章骨架與銜接」、5.4.2、5.4.9)：3×3×2 (z=1 上層 根窖層、z=0 下層 墨爐層)；
// 層轉 (一整層繞垂直軸轉 90°，位置與朝向一起轉)；控制盤 = 4-1 根窖走廊的年輪根盤
//   上層：4-1 根窖走廊 (hall) 在北邊 [1,0,1]、根井 (well，裝飾房：樹根梯井) 在中心 [1,1,1]，其餘空格
//   下層：4-2 墨爐間 (furnace) 在中心 [1,1,0]、4-3 封存書庫 (archive) 在西邊 [0,1,0]、4-4 最後的抽屜 (drawer) 在東邊 [2,1,0]、
//         H3 封存室 (sealed，隱藏房占位) 在南邊 [1,2,0]，其餘空格
//   屋框：入口 (從溫室深處下來的石階) 在 [1,0,1] 北側；天窗 (溫室的玻璃地板透下來的月光) 在 [1,2,1] 上側；章門出口 (往閣樓的木梯) 在 [1,0,0] 北側
// 層轉是整層剛體旋轉：同一層的門轉完照樣對著同一間房，會變的只有上下梯口 (U / D) 與屋框。沒有實心格 (含實心格的層轉不動)
// 組 = L0 (下層)、L1 (上層)；鎖扣 (根結)：L0 在 4-1c 完成前鎖著 (落下的木箱壓住抽屜的踏板，下圈年輪鬆開)
import type { CubeDef } from '../../core/cube';

export const CH4_CUBE: CubeDef = {
  id: 'ch4',
  dims: [3, 3, 2],
  ops: 'layer',
  control: 'dial',
  cells: [
    { at: [1, 0, 1], room: 'hall' }, { at: [1, 1, 1], room: 'well' },
    { at: [0, 1, 0], room: 'archive' }, { at: [1, 1, 0], room: 'furnace' }, { at: [2, 1, 0], room: 'drawer' }, { at: [1, 2, 0], room: 'sealed' }
  ],
  frame: [
    { at: [1, 0, 1], side: 'N', kind: 'porch', to: 'greenhouseStair' },
    { at: [1, 2, 1], side: 'U', kind: 'skylight' },
    { at: [1, 0, 0], side: 'N', kind: 'chapterExit', to: 'attic' }
  ],
  dial: {
    entry: { room: 'hall', obj: 'dial' },
    groups: [{ id: 'L0', kind: 'layer', index: 0 }, { id: 'L1', kind: 'layer', index: 1 }],
    locks: [{ group: 'L0', until: '4-1c', text: 'lvl.ch4.locked' }]
  }
};
