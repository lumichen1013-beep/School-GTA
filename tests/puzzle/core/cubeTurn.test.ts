// D1：core/cube.ts 控制盤的轉動 (applyTurn / inverseTurn / cellsOf；architecture 4.16.1、規格 5.4.4 / 5.4.9)
import { describe, it, expect } from 'vitest';
import { applyTurn, cellsOf, cubeKey, initialCube, inverseTurn, isBlocked, turnDirs, type CubeDef, type CubeState, type Turn, type TurnGroup } from '../../../src/puzzle/core/cube';

const ROWCOL: TurnGroup[] = [
  { id: 'row0', kind: 'row', index: 0 }, { id: 'row1', kind: 'row', index: 1 },
  { id: 'col0', kind: 'col', index: 0 }, { id: 'col1', kind: 'col', index: 1 }, { id: 'col2', kind: 'col', index: 2 }
];
/** 2×3 (2 列 × 3 行)：上列 a b c、下列 d e f (第二章書房的形狀) */
const C23: CubeDef = {
  id: 't23', dims: [3, 2, 1], ops: 'rowcol', control: 'dial', frame: [],
  cells: [
    { at: [0, 0, 0], room: 'a' }, { at: [1, 0, 0], room: 'b' }, { at: [2, 0, 0], room: 'c' },
    { at: [0, 1, 0], room: 'd' }, { at: [1, 1, 0], room: 'e' }, { at: [2, 1, 0], room: 'f' }
  ],
  dial: { entry: { room: 'a', obj: 'dial' }, groups: ROWCOL, locks: [] }
};

/** 只用 groups 中的組 BFS：可達排列數與直徑 (最壞的最短步數) */
function explore(def: CubeDef, groups: readonly string[], start: CubeState = initialCube(def)): { count: number; diameter: number } {
  const seen = new Map<string, number>([[cubeKey(start), 0]]);
  const q: CubeState[] = [start];
  let diameter = 0;
  while (q.length) {
    const s = q.shift()!;
    const d = seen.get(cubeKey(s))!;
    diameter = Math.max(diameter, d);
    for (const g of groups) {
      for (const dir of turnDirs(def, g)) {
        const r = applyTurn(def, s, { group: g, dir });
        if (isBlocked(r)) continue;
        const k = cubeKey(r);
        if (!seen.has(k)) { seen.set(k, d + 1); q.push(r); }
      }
    }
  }
  return { count: seen.size, diameter };
}

const at = (s: CubeState, room: string) => [...s.pos[room]];
const ok = (r: ReturnType<typeof applyTurn>): CubeState => { if (isBlocked(r)) throw new Error(r.blocked); return r; };

describe('applyTurn：2×3 列轉 / 行轉', () => {
  const s0 = initialCube(C23);

  it('列 +1 = 整列往東循環平移 (最東那間繞到最西)；−1 反向；另一列不動、朝向不變；輸入不被修改', () => {
    const before = JSON.stringify(s0);
    const r = ok(applyTurn(C23, s0, { group: 'row0', dir: 1 }));
    expect([at(r, 'a'), at(r, 'b'), at(r, 'c')]).toEqual([[1, 0, 0], [2, 0, 0], [0, 0, 0]]);
    expect([at(r, 'd'), at(r, 'e'), at(r, 'f')]).toEqual([[0, 1, 0], [1, 1, 0], [2, 1, 0]]);
    expect(r.rot).toEqual(s0.rot);
    expect(JSON.stringify(s0)).toBe(before);
    const l = ok(applyTurn(C23, s0, { group: 'row1', dir: -1 }));
    expect([at(l, 'd'), at(l, 'e'), at(l, 'f')]).toEqual([[2, 1, 0], [0, 1, 0], [1, 1, 0]]);
  });

  it('行 = 一行兩格上下對調；方向無意義 (控制盤只列一個方向)', () => {
    const r = ok(applyTurn(C23, s0, { group: 'col1', dir: 1 }));
    expect([at(r, 'b'), at(r, 'e')]).toEqual([[1, 1, 0], [1, 0, 0]]);
    expect(ok(applyTurn(C23, s0, { group: 'col1', dir: -1 }))).toEqual(r);
    expect(turnDirs(C23, 'col1')).toEqual([1]);
    expect(turnDirs(C23, 'row0')).toEqual([-1, 1]);
  });

  it('沒有這一組 / 方向型別不對 → noGroup；cellsOf 列出組內的格', () => {
    expect(applyTurn(C23, s0, { group: 'row9', dir: 1 })).toEqual({ blocked: 'noGroup' });
    expect(applyTurn(C23, s0, { group: 'row0', dir: 'N' })).toEqual({ blocked: 'noGroup' });
    expect(cellsOf(C23, s0, 'row1')).toEqual([[0, 1, 0], [1, 1, 0], [2, 1, 0]]);
    expect(cellsOf(C23, s0, 'col2')).toEqual([[2, 0, 0], [2, 1, 0]]);
    expect(cellsOf(C23, s0, 'nope')).toEqual([]);
  });

  it('applyTurn(inverseTurn(t)) = 原狀 (每一組、每個方向，從隨機走過的排列出發)', () => {
    let s = s0;
    const walk: Turn[] = [{ group: 'row0', dir: 1 }, { group: 'col2', dir: 1 }, { group: 'row1', dir: -1 }, { group: 'col0', dir: 1 }];
    for (const t of walk) s = ok(applyTurn(C23, s, t));
    for (const g of ROWCOL) {
      for (const dir of turnDirs(C23, g.id)) {
        const t: Turn = { group: g.id, dir };
        const back = ok(applyTurn(C23, ok(applyTurn(C23, s, t)), inverseTurn(C23, s, t)));
        expect(cubeKey(back)).toBe(cubeKey(s));
      }
    }
    expect(inverseTurn(C23, s0, { group: 'row0', dir: 1 })).toEqual({ group: 'row0', dir: -1 });
    expect(inverseTurn(C23, s0, { group: 'col1', dir: 1 })).toEqual({ group: 'col1', dir: 1 });
  });

  it('組內有實心格 → notEmpty (實心格固定不動)', () => {
    const def: CubeDef = { ...C23, cells: [...C23.cells.filter(c => c.room !== 'f'), { at: [2, 1, 0], room: 'solid' }] };
    expect(applyTurn(def, initialCube(def), { group: 'row1', dir: 1 })).toEqual({ blocked: 'notEmpty' });
    expect(isBlocked(applyTurn(def, initialCube(def), { group: 'row0', dir: 1 }))).toBe(false);
  });
});

describe('可達排列與直徑 (規格 5.4.9 實算表)', () => {
  it('2×3：只開上列 3 (直徑 1；規格表寫 2，±1 兩向都可轉時實算為 1)、兩列 9 (直徑 2)、列 + 行 720 (直徑 7)、上列 + 三行 (下列鎖) 720 (直徑 8)', () => {
    expect(explore(C23, ['row0'])).toEqual({ count: 3, diameter: 1 });
    expect(explore(C23, ['row0', 'row1'])).toEqual({ count: 9, diameter: 2 });
    expect(explore(C23, ['row0', 'row1', 'col0', 'col1', 'col2'])).toEqual({ count: 720, diameter: 7 });
    expect(explore(C23, ['row0', 'col0', 'col1', 'col2'])).toEqual({ count: 720, diameter: 8 });
  });

  it('3×3 滑動 (slideCell)、兩個空格、兩個實心格固定在屋框角落：2,520 (= 7! / 2!)', () => {
    const cells = Array.from({ length: 9 }, (_, i) => i);
    const def: CubeDef = {
      id: 't33', dims: [3, 3, 1], ops: 'slide', control: 'dial', frame: [],
      // 實心格在西北角與東南角；空格在中央與東北角；其餘五格是房間
      cells: [
        { at: [0, 0, 0], room: 'solid' }, { at: [2, 2, 0], room: 'solid' },
        { at: [1, 0, 0], room: 'r1' }, { at: [0, 1, 0], room: 'r2' }, { at: [2, 1, 0], room: 'r3' }, { at: [0, 2, 0], room: 'r4' }, { at: [1, 2, 0], room: 'r5' }
      ],
      dial: { entry: { room: 'r1', obj: 'dial' }, groups: cells.map(i => ({ id: `cell${i}`, kind: 'slideCell' as const, index: i })), locks: [] }
    };
    const r = explore(def, def.dial!.groups.map(g => g.id));
    expect(r.count).toBe(2520);
    // 滑動的反向 = 從滑到的那一格往反方向滑回
    const s0 = initialCube(def);
    const t: Turn = { group: 'cell1', dir: 'S' }; // r1 從 [1,0] 滑進中央 [1,1]
    const s1 = ok(applyTurn(def, s0, t));
    expect(at(s1, 'r1')).toEqual([1, 1, 0]);
    expect(inverseTurn(def, s0, t)).toEqual({ group: 'cell4', dir: 'N' });
    expect(cubeKey(ok(applyTurn(def, s1, inverseTurn(def, s0, t))))).toBe(cubeKey(s0));
    expect(applyTurn(def, s0, { group: 'cell4', dir: 'N' })).toEqual({ blocked: 'noRoom' });
    expect(applyTurn(def, s0, { group: 'cell1', dir: 'W' })).toEqual({ blocked: 'notEmpty' }); // 西邊是實心格
    expect(applyTurn(def, s0, { group: 'cell1', dir: 'N' })).toEqual({ blocked: 'outOfCube' });
    expect(applyTurn(def, s0, { group: 'cell1', dir: 1 })).toEqual({ blocked: 'noGroup' });
  });

  it('3×3×2 層轉：轉四次 = 原狀 (位置與朝向)；兩層各自轉 = 16 種', () => {
    const def: CubeDef = {
      id: 't332', dims: [3, 3, 2], ops: 'layer', control: 'dial', frame: [],
      cells: [
        { at: [0, 0, 0], room: 'p' }, { at: [1, 1, 0], room: 'core' }, { at: [2, 0, 0], room: 'q' },
        { at: [0, 0, 1], room: 'u' }, { at: [1, 2, 1], room: 'v' }
      ],
      dial: { entry: { room: 'p', obj: 'dial' }, groups: [{ id: 'L0', kind: 'layer', index: 0 }, { id: 'L1', kind: 'layer', index: 1 }], locks: [] }
    };
    const s0 = initialCube(def);
    const s1 = ok(applyTurn(def, s0, { group: 'L0', dir: 1 }));
    // 順時針 (從上往下看)：西北角 → 東北角，朝向 +1；中心格只在原地轉；上層不動
    expect([at(s1, 'p'), s1.rot.p, at(s1, 'core'), s1.rot.core, at(s1, 'u'), s1.rot.u]).toEqual([[2, 0, 0], 1, [1, 1, 0], 1, [0, 0, 1], 0]);
    let s = s0;
    for (let i = 0; i < 4; i++) s = ok(applyTurn(def, s, { group: 'L0', dir: 1 }));
    expect(s).toEqual(s0);
    expect(cubeKey(ok(applyTurn(def, s1, inverseTurn(def, s0, { group: 'L0', dir: 1 }))))).toBe(cubeKey(s0));
    expect(explore(def, ['L0', 'L1']).count).toBe(16);
    expect(explore(def, ['L0']).count).toBe(4);
  });

  it('切片轉：x 軸中間片轉四次 = 原狀；平面不是正方形 → outOfCube', () => {
    const def: CubeDef = {
      id: 't333', dims: [3, 3, 3], ops: 'slice', control: 'dial', frame: [],
      cells: [{ at: [1, 0, 0], room: 'm' }, { at: [1, 1, 1], room: 'center' }, { at: [0, 0, 0], room: 'side' }],
      dial: { entry: { room: 'm', obj: 'dial' }, groups: [{ id: 'X1', kind: 'slice', axis: 'x', index: 1 }, { id: 'Z0', kind: 'slice', axis: 'z', index: 0 }], locks: [] }
    };
    const s0 = initialCube(def);
    const s1 = ok(applyTurn(def, s0, { group: 'X1', dir: 1 }));
    expect([at(s1, 'm'), at(s1, 'center'), at(s1, 'side')]).toEqual([[1, 2, 0], [1, 1, 1], [0, 0, 0]]);
    let s = s0;
    for (let i = 0; i < 4; i++) s = ok(applyTurn(def, s, { group: 'X1', dir: -1 }));
    expect(s).toEqual(s0);
    expect(explore(def, ['X1', 'Z0']).count).toBeGreaterThan(4);
    const flat: CubeDef = { ...def, dims: [3, 3, 2], cells: [{ at: [1, 0, 0], room: 'm' }] };
    expect(applyTurn(flat, initialCube(flat), { group: 'X1', dir: 1 })).toEqual({ blocked: 'outOfCube' });
  });
});

describe('確定性', () => {
  it('同一串轉動永遠得到同一個狀態 (兩次各自從 S0 跑)', () => {
    const seq: Turn[] = [
      { group: 'row0', dir: 1 }, { group: 'col1', dir: 1 }, { group: 'row1', dir: -1 }, { group: 'col2', dir: 1 },
      { group: 'row0', dir: -1 }, { group: 'col0', dir: 1 }, { group: 'row1', dir: 1 }
    ];
    const run = () => seq.reduce((s, t) => ok(applyTurn(C23, s, t)), initialCube(C23));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    expect(cubeKey(run())).not.toBe(cubeKey(initialCube(C23)));
  });
});
