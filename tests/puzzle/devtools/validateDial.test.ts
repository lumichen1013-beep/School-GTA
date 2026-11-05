// D7：devtools/validateCube 的 validateDial (控制盤章節：多解列舉、預算繞過、鎖扣、魔方儀入口、狀態上限；規格 5.4.8 ⑥～⑪、D16)
import { describe, it, expect } from 'vitest';
import { areaPairs, dialModelOf, validateDial, validateCube, chapterOneModel, type DialModel } from '../../../src/puzzle/devtools/validateCube';
import { TEST_DIAL_CUBE, TEST_DIAL_FINISH, TEST_DIAL_PUZZLES, TEST_DIAL_START } from '../../../src/puzzle/content/cubes/test-dial';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { CH1_CUBE, CH1_MODEL } from '../../../src/puzzle/content/cubes/ch1';
import type { CubeDef, DoorInfo, Side } from '../../../src/puzzle/core/cube';

const MODEL: DialModel = dialModelOf(TEST_DIAL_CUBE, PROTO_DIAL_ROOMS, TEST_DIAL_PUZZLES, TEST_DIAL_START, TEST_DIAL_FINISH);

describe('validateDial：原型的 2×3 測試魔方', () => {
  const r = validateDial(MODEL);

  it('可達排列 720、有解、卡死 0 (含 R：每個進房快照都到得了終點)；沒有任何問題', () => {
    expect([r.arrangements, r.solvable, r.deadlocks]).toEqual([720, true, []]);
    expect(r.states).toBe(32770);
    expect(r.needsRestart).toBeGreaterThan(0); // 墨用完困在房裡的狀態：要 R (回到進房快照) 才解得開
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
  });

  it('每題回報最短 / 次短 / 解法數 (序列、本質不同)；非教學題 (行轉的終點) 本質不同的解 ≥ 2 且有寬裕量', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.budget, p.issues])).toEqual([
      ['test.a', 1, 1, 6, []], ['test.b', 1, 2, 6, []], ['test.goal', 2, 2, 6, []]
    ]);
    const a = r.perPuzzle[0];
    expect([a.solutions, a.distinct, a.sampled]).toEqual([2, 2, false]); // 上列往左或往右轉一次都接得上丙室
    const goal = r.perPuzzle[2];
    expect(goal.distinct).toBeGreaterThanOrEqual(2);
    expect(goal.sampled).toBe(true); // 超過 10⁴ / 預算 條的深度改為取樣
  });

  it('確定性：兩次結果相同；第一章 validateCube 數字不變 (96 / 3 / 卡死 0 / 最短 3)', () => {
    expect(validateDial(MODEL)).toEqual(r);
    const c = validateCube(chapterOneModel(CH1_CUBE, CH1_MODEL));
    expect([c.states, c.arrangements, c.deadEnds, c.minTurns]).toEqual([96, 3, 0, 3]);
  });

  it('前置不成立就能完成的題 → 報錯 (設計的先後被繞過)', () => {
    const m = { ...MODEL, puzzles: MODEL.puzzles.map(p => (p.id === 'test.a' ? { ...p, needs: ['test.goal'] } : p)) };
    expect(validateDial(m).issues).toContain('puzzle test.a can be done before its needs');
  });

  it('超過 maxStates → 報錯並停下 (不卡住)', () => {
    const t0 = Date.now();
    const small = validateDial({ ...MODEL, maxStates: 100 });
    expect(small.issues.some(i => i.includes('exceed maxStates (100)'))).toBe(true);
    expect(small.solvable).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('validateDial：三個刻意做壞的模型', () => {
  it('① 預算繞過：P4 題 (墨只夠 3) 換房補墨就能用少於最短解的墨完成 → budgetBypass', () => {
    // 2×3 每間房四面都有門 (永遠走得出去)；甲室的 P4 題要上下兩列各往右一格 (最短 2)
    const rooms = ['a', 'b', 'c', 'd', 'e', 'f'];
    const doors: DoorInfo[] = rooms.flatMap(room => (['N', 'E', 'S', 'W'] as Side[]).map(side => ({ room, door: `${room}${side}`, side, kind: 'door' as const })));
    const cube: CubeDef = { ...TEST_DIAL_CUBE, cells: rooms.map((room, i) => ({ at: [i % 3, Math.floor(i / 3), 0] as const, room })), dial: { ...TEST_DIAL_CUBE.dial!, entry: { room: 'a', obj: 'dial' }, locks: [] } };
    const m: DialModel = {
      cube, doors, start: 'a', finish: 'p4',
      rooms: Object.fromEntries(rooms.map(r => [r, r === 'a' ? { budget: 6, p4: { p4: 3 } } : { budget: 6 }])),
      puzzles: [{ id: 'p4', room: 'a', needs: [], teaching: true, goal: s => s.pos.b[0] === 2 && s.pos.e[0] === 2 }]
    };
    const r = validateDial(m);
    expect(r.perPuzzle[0].shortest).toBe(2);
    expect(r.budgetBypass).toEqual(['p4: doable with < 2 turns per visit to a (refill by changing rooms)']);
  });

  it('② 鎖互相等待：上列等己室的開關、下列等丙室的開關 → 誰都轉不動 (lockIssues)', () => {
    const cube: CubeDef = { ...TEST_DIAL_CUBE, dial: { ...TEST_DIAL_CUBE.dial!, locks: [{ group: 'row0', until: 'test.b' }, { group: 'row1', until: 'test.a' }, ...TEST_DIAL_CUBE.dial!.locks.filter(l => l.group.startsWith('col'))] } };
    const r = validateDial({ ...MODEL, cube });
    expect(r.solvable).toBe(false);
    expect(r.lockIssues).toContain('locks wait on each other: row0 <-> row1');
    expect(r.lockIssues).toContain('lock row0: test.b unreachable while row0 stays locked');
    expect(r.deadlocks.length).toBeGreaterThan(0);
  });

  it('③ 入口需要轉動：魔方儀放在丙室 (開章不轉就走不到) → entryIssues', () => {
    const cube: CubeDef = { ...TEST_DIAL_CUBE, dial: { ...TEST_DIAL_CUBE.dial!, entry: { room: 'protoC', obj: 'dial' } } };
    const r = validateDial({ ...MODEL, cube });
    expect(r.entryIssues).toEqual(['dial room protoC is not reachable from protoA without turning']);
    expect(r.solvable).toBe(false);
  });
});

describe('validateDial：房內被隔開的區 (DialModel.areas；v0.4 H1)', () => {
  const L = (fr: string, fd: string, tr: string, td: string) => ({ from: { room: fr, door: fd }, to: { room: tr, door: td }, kind: 'door' as const });
  const AREA = { id: 'mezzBack', room: 'mezz', doors: ['holeN'], opensWhen: 'H1.shrink' };
  it('areaPairs：門所在的區 = 節點 (沒有區 = 房)；區還沒開 → 只出不進；opensWhen 沒給 = 一直開著；沒有區 = 原本的房對房', () => {
    const ls = [L('print', 'archS', 'mezz', 'holeN'), L('mezz', 'holeN', 'print', 'archS'), L('shelf', 'doorE', 'mezz', 'doorW'), L('mezz', 'doorW', 'shelf', 'doorE')];
    expect(areaPairs({ areas: [AREA] }, ls, new Set())).toEqual([['mezzBack', 'print'], ['shelf', 'mezz'], ['mezz', 'shelf']]);
    expect(areaPairs({ areas: [AREA] }, ls, new Set(['H1.shrink']))).toEqual([['print', 'mezzBack'], ['mezzBack', 'print'], ['shelf', 'mezz'], ['mezz', 'shelf']]);
    expect(areaPairs({ areas: [{ ...AREA, opensWhen: undefined }] }, ls, new Set())).toEqual([['print', 'mezzBack'], ['mezzBack', 'print'], ['shelf', 'mezz'], ['mezz', 'shelf']]);
    expect(areaPairs({}, ls, new Set())).toEqual([['print', 'mezz'], ['mezz', 'print'], ['shelf', 'mezz'], ['mezz', 'shelf']]);
  });

  it('dialModelOf 的 extra 收 areas、區的預算 = 所在房；validateDial 沒列預算的區也自動補 (結果相同)；沒有區的模型數字不變', () => {
    const areas = [{ id: 'protoBack', room: 'protoB', doors: ['nope'] }];
    const m = dialModelOf(TEST_DIAL_CUBE, PROTO_DIAL_ROOMS, TEST_DIAL_PUZZLES, TEST_DIAL_START, TEST_DIAL_FINISH, { areas });
    expect(m.rooms.protoBack).toEqual({ budget: m.rooms.protoB.budget });
    const { protoBack: _drop, ...rooms } = m.rooms;
    const a = validateDial(m), b = validateDial({ ...m, rooms });
    // 區沒有任何門接得上 (doors 不是本章的門) = 永遠進不去：狀態數同沒有區的模型
    expect([a.states, b.states, a.solvable]).toEqual([32770, 32770, true]);
  });
});
