// 【原型占位】M-Dial 控制盤原型的 2×3 測試魔方 (architecture 6.7、7.4.1 D3；不計入正式關卡，第二章正式內容另做)：
// 上列 甲 乙 丙、下列 丁 戊 己；control = 'dial'；組 = 兩列 + 三行；鎖扣：下列 ← test.a (丙室的開關)、三行 ← test.b (己室的開關)
import type { CubeDef } from '../../core/cube';

export const TEST_DIAL_CHAPTER = 90;

export const TEST_DIAL_CUBE: CubeDef = {
  id: 'test-dial',
  dims: [3, 2, 1],
  ops: 'rowcol',
  control: 'dial',
  cells: [
    { at: [0, 0, 0], room: 'protoA' }, { at: [1, 0, 0], room: 'protoB' }, { at: [2, 0, 0], room: 'protoC' },
    { at: [0, 1, 0], room: 'protoD' }, { at: [1, 1, 0], room: 'protoE' }, { at: [2, 1, 0], room: 'protoF' }
  ],
  frame: [],
  dial: {
    entry: { room: 'protoA', obj: 'dial' },
    groups: [
      { id: 'row0', kind: 'row', index: 0 }, { id: 'row1', kind: 'row', index: 1 },
      { id: 'col0', kind: 'col', index: 0 }, { id: 'col1', kind: 'col', index: 1 }, { id: 'col2', kind: 'col', index: 2 }
    ],
    locks: [
      { group: 'row1', until: 'test.a' },
      { group: 'col0', until: 'test.b' }, { group: 'col1', until: 'test.b' }, { group: 'col2', until: 'test.b' }
    ]
  }
};

/**
 * 原型的謎題 (devtools/validateDial 的輸入；都是「走到那間房、拉下開關」)：needs = 設計上的先後 (開關本身不檢查前置，
 * 驗證器另查「能不能在前置之前完成」)。test.a 教列轉、test.b 教下列、test.goal 要行轉 (非教學：步數上限內要有兩種以上本質不同的走法)
 */
export const TEST_DIAL_PUZZLES: ReadonlyArray<{ id: string; room: string; needs: readonly string[]; teaching?: boolean }> = [
  { id: 'test.a', room: 'protoC', needs: [], teaching: true },
  { id: 'test.b', room: 'protoF', needs: ['test.a'], teaching: true },
  { id: 'test.goal', room: 'protoE', needs: ['test.b'] }
];
export const TEST_DIAL_START = 'protoA';
export const TEST_DIAL_FINISH = 'test.goal';
