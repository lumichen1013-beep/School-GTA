// 1-1 門廊：通關腳本 (三題依序，題與題之間檢查中間狀態) + 每題反例 / 捷徑掃描 (規格 6「1-1 門廊」、D2、D4、D10)
import { describe, it, expect } from 'vitest';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { createWorld } from '../../../src/puzzle/core/world';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { trySwitchMode } from '../../../src/puzzle/core/switchMode';
import { type Cmd, runScript } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts, type ScanSpec } from '../../../src/puzzle/devtools/shortcutScan';
import type { LevelDef, World } from '../../../src/puzzle/core/types';
import { hopUntil, place, run, walkTo } from '../helpers';
import { MSG_FELL, MSG_UNREACHABLE, TEXT } from '../msgs';

const newPorch = (level: LevelDef = porch): World => createWorld(level, { mechanics: DEFAULT_MECHANICS, text: TEXT });
const without = (...ids: string[]): LevelDef => ({ ...porch, objects: porch.objects.filter(o => !ids.includes(o.id)) });
const p = (w: World) => w.player;
/** 台階頂 (1-1b) */
const STAIR_TOP = porch.objects.find(o => o.id === 'stair')!.h;

/** 1-1a 兩種牆：3D 被鐵柵擋 → 2D 走過 → 被墨牆擋 → 3D 走過 */
const SOLVE_A: Cmd[] = [
  { walkTo: [-4.6, null] },
  { expect: w => { expect(p(w).x).toBeLessThan(-4.4); expect(p(w).mode).toBe('3d'); }, label: '鐵柵擋住實景' },
  { act: 'flip' },
  { walkTo: [1.6, null] },
  { expect: w => { expect(p(w).mode).toBe('2d'); expect(p(w).x).toBeGreaterThan(-3); expect(p(w).x).toBeLessThan(1.5); }, label: '藏寶圖穿過鐵柵、被墨牆擋住' },
  { act: 'flip' },
  { walkTo: [3, null] },
  { expect: w => { expect(p(w).mode).toBe('3d'); expect(p(w).x).toBeCloseTo(3, 1); expect(w.checkpoint).toBe(0); }, label: '1-1a 完成' }
];

/** 1-1b 紙上跳得高：2D 跳上台階 → 3D 沿台頂走到後方 → 木板橋過坑 */
const SOLVE_B: Cmd[] = [
  { act: 'flip' },
  { hop: 1, until: w => p(w).onGround && p(w).y > STAIR_TOP - 0.01 && p(w).x > 4.4, label: '藏寶圖跳上台階' },
  { act: 'flip' },
  { wait: 0.1 },
  { expect: w => { expect(p(w).mode).toBe('3d'); expect(p(w).y).toBeCloseTo(STAIR_TOP, 3); expect(p(w).onGround).toBe(true); }, label: '實景站在台頂' },
  { walkTo: [7.4, -5], zFirst: true },
  { walkTo: [12.9, null] },
  { expect: w => { expect(p(w).x).toBeGreaterThan(12.4); expect(p(w).y).toBeCloseTo(0, 3); expect(w.checkpoint).toBe(1); }, label: '1-1b 完成：過坑' }
];

/** 1-1c 回來的深度：前半 → 2D 跳上石階 → 3D 落在後半 (C11) → 開門 */
const SOLVE_C: Cmd[] = [
  { walkTo: [null, 3] },
  { walkTo: [14.4, null] },
  { expect: w => { expect(p(w).x).toBeGreaterThan(14); expect(p(w).z).toBeGreaterThan(0); }, label: '從門洞進入玻璃間前半' },
  { act: 'flip' },
  { hop: 1, until: w => p(w).onGround && p(w).y > 0.59 && p(w).x > 15.4, label: '藏寶圖跳上石階' },
  { walkTo: [16, null] },
  { act: 'flip' },
  { wait: 0.1 },
  { expect: w => { expect(p(w).mode).toBe('3d'); expect(p(w).z).toBeLessThan(0); expect(p(w).y).toBeCloseTo(0.6, 3); }, label: '回到實景落在後半的石階上' },
  { walkTo: [18.6, -4.6] },
  { expect: w => expect(findTarget(w)?.def.id).toBe('door'), label: '門在範圍內' },
  { act: 'interact' },
  { expect: w => expect(w.cleared).toBe(true), label: '通關' }
];

describe('1-1 門廊：通關路徑', () => {
  it('runScript 三題依序通關', () => {
    const w = newPorch();
    expect(w.byId.get('door')!.used).toBe(true); // 沒有封印的門
    runScript(w, [...SOLVE_A, ...SOLVE_B, ...SOLVE_C]);
    expect(w.cleared).toBe(true);
  });
});

// ── 捷徑掃描共用 ──
const scan = (s: Omit<ScanSpec, 'mechanics' | 'text' | 'movable' | 'level'> & { level?: LevelDef }) =>
  scanShortcuts({ level: porch, mechanics: DEFAULT_MECHANICS, text: TEXT, movable: [], ...s });
const grid = (xs: number[], zs: number[], y = 0) => xs.flatMap(x => zs.map(z => ({ x, y, z })));
const flag = (id: string, holds: (w: World) => boolean) => ({ id, holds });
const RIGHT = { hold: { moveX: 1 }, seconds: 4 } as const;
const HOP_RIGHT = { hop: 1, until: () => false, seconds: 4, optional: true } as const;
const DIAG = [{ hold: { moveX: 1, moveZ: -1 }, seconds: 2 }, { hold: { moveX: 1, moveZ: 1 }, seconds: 2 }] as const;
const HOP_DIAG = [{ hold: { moveX: 1, moveZ: -1, jump: true }, seconds: 2 }, { hold: { moveX: 1, moveZ: 1, jump: true }, seconds: 2 }] as const;

/** 平地原地跳的最高點 (y 增量) */
function apex(mode: '3d' | '2d'): number {
  const w = newPorch();
  place(w, -10, 0, 2, mode);
  let top = 0;
  run(w, { jump: true }, 0.05);
  run(w, {}, 1, () => { top = Math.max(top, w.player.y); });
  return top;
}

describe('1-1 門廊：物理數值 (C4、D10)', () => {
  it('跳高 (固定步長實測)：3D ≈1.18、2D ≈1.52；台階頂與兩者都差 ≥ 0.15 (D10)；鐵柵 4 遠高於兩者', () => {
    const a3 = apex('3d');
    const a2 = apex('2d');
    expect(a3).toBeCloseTo(1.18, 1);
    expect(a2).toBeCloseTo(1.52, 1);
    expect(STAIR_TOP - a3).toBeGreaterThanOrEqual(0.15);
    expect(a2 - STAIR_TOP).toBeGreaterThanOrEqual(0.15);
    expect(porch.objects.find(o => o.id === 'bars')!.h).toBeGreaterThan(a2 + 2);
    expect(porch.objects.find(o => o.id === 'plank')!.y + porch.objects.find(o => o.id === 'plank')!.h).toBeCloseTo(STAIR_TOP, 6);
  });
});

describe('1-1a 兩種牆：反例', () => {
  const pastBars = flag('past bars', w => w.player.x > -3.85);
  const pastInk = flag('past inkwall', w => w.player.x > 2.25);

  it('只用實景：走、跳、斜走都過不了鐵柵 (高 4、全深)', () => {
    const r = scan({ modes: ['3d'], playerAt: grid([-11, -8, -5], [-5.6, -2, 0, 2, 5.6]), probes: [[RIGHT], [HOP_RIGHT], [...DIAG], [...HOP_DIAG]], forbidden: [pastBars, pastInk] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(60);
  });

  it('跳不過鐵柵：貼著鐵柵連跳，x 不會越過、最高 < 台階頂', () => {
    const w = newPorch();
    walkTo(w, -4.6, null);
    let top = 0;
    expect(hopUntil(w, 1, () => { top = Math.max(top, w.player.y); return w.player.x > -3.85; }, 5)).toBe(false);
    expect(top).toBeLessThan(STAIR_TOP);
  });

  it('只用藏寶圖：穿過鐵柵的位置，但走、跳都過不了墨牆 (全高)', () => {
    const r = scan({ modes: ['2d'], playerAt: grid([-10, -4, -1, 1], [2]), probes: [[RIGHT], [HOP_RIGHT], [{ walkTo: [1.4, null] }, { hop: 1, until: () => false, seconds: 3, optional: true }]], forbidden: [pastInk] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(12);
  });

  it('跳過關鍵步驟：在墨牆前不切回實景就過不去；切了才過得去 (同一位置的正對照)', () => {
    const w = newPorch();
    runScript(w, SOLVE_A.slice(0, 5));
    run(w, { moveX: 1 }, 2);
    expect(w.player.x).toBeLessThan(1.5);
    expect(trySwitchMode(w).ok).toBe(true);
    run(w, { moveX: 1 }, 0.6);
    expect(w.player.x).toBeGreaterThan(2.25);
  });
});

describe('1-1b 紙上跳得高：反例', () => {
  const onStair3d = flag('3d on stair', w => w.player.mode === '3d' && w.player.onGround && w.player.y > STAIR_TOP - 0.05);
  const acrossPit = flag('across pit', w => w.player.onGround && w.player.x > 12.2);

  it('實景跳不上台階：台階前任何深度、正面或斜跳', () => {
    const r = scan({ modes: ['3d'], playerAt: grid([2.6, 3.2, 3.6], [-5.6, -3, 0, 3, 5.6]), probes: [[HOP_RIGHT], [...HOP_DIAG]], forbidden: [onStair3d, acrossPit] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(30);
  });

  it('藏寶圖直接跳坑跳不過 (坑寬 4；從台頂起跳水平約 2.5 < 3.4)，沿台頂走也只會掉下去', () => {
    const r = scan({ modes: ['2d'], playerAt: grid([5, 6.5, 7.6], [2], STAIR_TOP), probes: [[HOP_RIGHT], [RIGHT], [{ hold: { moveX: 1 }, seconds: 0.3 }, HOP_RIGHT]], forbidden: [acrossPit] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(9);
    const w = newPorch();
    place(w, 7.6, STAIR_TOP, 2, '2d');
    let maxX = 0;
    let fellAt: number | null = null;
    run(w, { moveX: 1, jump: true }, 2, () => {
      if (fellAt === null && w.msg === MSG_FELL) fellAt = w.player.x;
      if (fellAt === null) maxX = Math.max(maxX, w.player.x);
    });
    expect(maxX).toBeLessThan(12.3);
    expect(fellAt).toBeCloseTo(3, 3); // 掉進坑：回到檢查點 (台階前)
  });

  it('藏寶圖沿台頂到不了木板橋 (木板橋只在實景)：走到台頂後方深度也一樣掉下去', () => {
    const w = newPorch();
    place(w, 3, 0, -5);                       // 先在實景站到後方深度 (z3d = -5)
    expect(trySwitchMode(w).ok).toBe(true);
    expect(hopUntil(w, 1, () => w.player.onGround && w.player.y > STAIR_TOP - 0.01 && w.player.x > 4.4)).toBe(true);
    run(w, { moveX: 1 }, 3);
    expect(w.msg).toBe(MSG_FELL);
    expect(w.player.mode).toBe('2d');
  });

  it('跳過關鍵步驟：沒走到台頂後方 (木板橋的深度) 就在實景跳坑 → 掉下去', () => {
    const r = scan({ modes: ['3d'], playerAt: grid([6, 7.6], [-3, 0, 3, 5.6], STAIR_TOP), probes: [[HOP_RIGHT], [RIGHT]], forbidden: [acrossPit] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(16);
  });

  it('跳過關鍵步驟：沒有木板橋就過不了坑 (兩模式、含切換的探針)；有橋時同一探針過得去 (正對照)', () => {
    const playerAt = grid([6, 7.6], [-5, 2], STAIR_TOP);
    const probes = [
      [{ hold: { moveZ: -1 }, seconds: 2 }, RIGHT],
      [{ act: 'flip' }, HOP_RIGHT],
      [{ act: 'flip' }, { hold: { moveX: 1, jump: true }, seconds: 0.25 }, { act: 'flip' }, RIGHT]
    ] as Cmd[][];
    expect(scan({ level: without('plank'), playerAt, probes, forbidden: [acrossPit] }).hits).toEqual([]);
    expect(scan({ playerAt, probes, forbidden: [acrossPit] }).hits.length).toBeGreaterThan(0);
  });
});

describe('1-1c 回來的深度：反例', () => {
  const backHalf = flag('back half', w => w.player.mode === '3d' && w.player.x > 13.7 && w.player.z < 0);

  it('在地板上來回切換 20 次 (含在藏寶圖裡走動) 不會跑到 z<0', () => {
    const w = newPorch();
    place(w, 18, 0, 3);
    const xs = [19.4, 14.2, 18, 17.6];
    let minZ = Infinity;
    for (let i = 0; i < 20; i++) {
      expect(trySwitchMode(w).ok).toBe(true);
      expect(w.player.mode).toBe(i % 2 === 0 ? '2d' : '3d');
      if (w.player.mode === '2d') walkTo(w, xs[(i / 2) % xs.length], null);
      run(w, {}, 0.2, () => { if (w.player.mode === '3d') minZ = Math.min(minZ, w.player.z); });
    }
    expect(w.player.mode).toBe('3d');
    expect(minZ).toBeGreaterThan(0);
    expect(w.player.z).toBeCloseTo(3, 3);
  });

  it('玻璃牆在實景擋住 (走、跳、斜走)；藏寶圖裡隔著玻璃也開不了門 (只在實景能開，提示換個角度)', () => {
    const r = scan({ modes: ['3d'], playerAt: grid([14.3, 16, 18.6, 19.5], [0.5, 2, 4]), probes: [[{ hold: { moveZ: -1 }, seconds: 3 }], [{ hold: { moveZ: -1, jump: true }, seconds: 3 }], [{ hold: { moveX: 1, moveZ: -1 }, seconds: 3 }]], forbidden: [backHalf, 'cleared'] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(36);
    const w = newPorch();
    place(w, 18.6, 0, 3, '2d');
    interact(w);
    expect(w.cleared).toBe(false);
    expect(w.msg).toBe(MSG_UNREACHABLE);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(w.player.z).toBeGreaterThan(0);
  });

  it('跳過關鍵步驟：沒有站上矮石階就回不到後半 (拿掉石階，兩模式、含切換的探針)；有石階時同一探針做得到 (正對照)', () => {
    /** 藏寶圖裡站在高於地板的東西上 (有石階時 = 石階頂) */
    const onRaised = (w: World) => w.player.onGround && w.player.y > 0.5;
    const playerAt = grid([14.3, 16, 18, 19.5], [0.5, 3]);
    const probes = [
      [{ act: 'flip' }, { hop: 1, until: onRaised, seconds: 1.5, optional: true }, { act: 'flip' }, { hold: { moveZ: -1 }, seconds: 1 }],
      [{ act: 'flip' }, { hold: { moveX: 1 }, seconds: 1 }, { act: 'flip' }, { hold: { moveZ: -1 }, seconds: 1 }],
      [{ act: 'flip' }, { hop: -1, until: onRaised, seconds: 1.5, optional: true }, { act: 'flip' }, { hold: { moveZ: -1 }, seconds: 1 }]
    ] as Cmd[][];
    expect(scan({ level: without('step'), playerAt, probes, forbidden: [backHalf, 'cleared'] }).hits).toEqual([]);
    expect(scan({ playerAt, probes, forbidden: [backHalf] }).hits.length).toBeGreaterThan(0);
  });

  it('跳過關鍵步驟：從橋後 (後方深度) 切藏寶圖想繞過玻璃間 → 隔牆擋住，只能從前半的門洞進去', () => {
    const r = scan({ modes: ['3d'], playerAt: grid([12.6, 13], [-5.5, -3, -1]), probes: [
      [{ act: 'flip' }, RIGHT, { act: 'flip' }, RIGHT],
      [{ act: 'flip' }, HOP_RIGHT, { act: 'flip' }, { hold: { moveX: 1, moveZ: -1 }, seconds: 2 }],
      [{ hold: { moveX: 1 }, seconds: 2 }, { act: 'flip' }, RIGHT, { act: 'flip' }]
    ], forbidden: [backHalf, 'cleared'] });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBe(18);
  });
});

describe('1-1 門廊：出口門 (沒有封印)', () => {
  it('unsealed 的門建立世界時即解封；實景站在門前互動就通關，沒有取得物', () => {
    const w = newPorch();
    expect(w.byId.get('door')!.used).toBe(true);
    place(w, 18.6, 0, -4.6);
    expect(findTarget(w)?.def.id).toBe('door');
    interact(w);
    expect(w.cleared).toBe(true);
    expect(w.inv).toEqual({});
  });

  it('沒有 unsealed 的門照舊是封印的 (玄關行為不變)', () => {
    const sealed = { ...porch, objects: porch.objects.map(o => (o.id === 'door' ? { ...o, unsealed: undefined } : o)) };
    const w = newPorch(sealed);
    expect(w.byId.get('door')!.used).toBe(false);
    place(w, 18.6, 0, -4.6);
    interact(w);
    expect(w.cleared).toBe(false);
  });
});
