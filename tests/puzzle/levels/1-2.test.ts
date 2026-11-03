// 1-2 玄關 (改版)：四題 1-2a～1-2d 的通關腳本 (題與題之間檢查中間狀態) + 1-2d 數值驗算 / 反例 / 捷徑掃描 + 字條量表與預算
// (規格 6「1-2 玄關」、3 D2 / D4 / D10、7.1.1 H1～H4 / H10、7.1.3；舊玄關測試 foyerSolution / puzzleLogic / shortcutScan 照舊保留)
import { describe, it, expect } from 'vitest';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { addItem, hasItem } from '../../../src/puzzle/mechanics/items';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { trySwitchMode } from '../../../src/puzzle/core/switchMode';
import { resetCrates } from '../../../src/puzzle/core/push';
import { INTERACT_RANGE, PLAYER_H } from '../../../src/puzzle/core/constants';
import { type Cmd, runScript } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts, type ScanSpec } from '../../../src/puzzle/devtools/shortcutScan';
import { validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import type { ObjDef, World } from '../../../src/puzzle/core/types';
import { newWorld, onCrateAtValve, place, run, walkTo } from '../helpers';
import { MSG_PLATE_ON, TEXT } from '../msgs';

const def = (id: string): ObjDef => foyer.objects.find(o => o.id === id)!;
const get = (w: World, id: string) => w.byId.get(id)!;
const p = (w: World) => w.player;
const VALVE = def('valve');
const CRATE = def('crate');
const CRATE_TOP = CRATE.y + CRATE.h;
/** 身體中心 = 腳底 + 半身高 (core/interact distanceTo) */
const HALF = PLAYER_H / 2;
/** 出口區 (隔牆右側) */
const EXIT_MIN_X = 10.4;

/** 1-2d 的前置狀態：已有筆尖、踏板已壓下 (鎖定)、鐵柵門已開；木箱在原位 */
function afterC(w: World): World {
  addItem(w, 'nib', 1);
  get(w, 'plate').used = true;
  get(w, 'gate').used = true;
  return w;
}

// ── 通關腳本 (與 runScript.test 的 FOYER 同一路線，拆成四題並在題與題之間檢查) ──
const SOLVE_A: Cmd[] = [
  { wait: 0.2 },
  { walkTo: [-10.3, 2], zFirst: true },
  { act: 'flip' }, { walkTo: [-4.5, null] },
  { expect: w => { expect(p(w).mode).toBe('2d'); expect(p(w).y).toBeCloseTo(0, 3); }, label: '藏寶圖沿書架走過缺口' },
  { act: 'flip' }, { wait: 0.2 },
  { expect: w => { expect(p(w).mode).toBe('3d'); expect(p(w).x).toBeGreaterThan(-6); expect(w.checkpoint).toBe(0); expect(hasItem(w, 'nib')).toBe(false); }, label: '1-2a 完成' }
];
const SOLVE_B: Cmd[] = [
  { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 2] }, { walkTo: [6.1, null] },
  { expect: w => expect(get(w, 'crate').x).toBeCloseTo(7, 1), label: '木箱推到高台旁' },
  { act: 'flip' },
  { hop: 1, until: w => p(w).onGround && p(w).y > 2.4 && p(w).x > 8.1, label: '藏寶圖踩木箱跳上高台' },
  { walkTo: [8.5, null] }, { act: 'interact' },
  { expect: w => { expect(hasItem(w, 'nib')).toBe(true); expect(w.msg).toBe(TEXT('lvl.1-2.key.use')); expect(get(w, 'plate').used).toBe(false); }, label: '1-2b 完成：筆尖' }
];
const SOLVE_C: Cmd[] = [
  { act: 'flip' },
  { walkTo: [null, 2] }, { walkTo: [5.4, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] },
  { walkTo: [null, -4.5] }, { hold: { moveZ: -1 }, seconds: 0.3 },
  { walkTo: [5.6, null] }, { walkTo: [null, -5.4] }, { walkTo: [-0.1, null] },
  { expect: w => { const c = get(w, 'crate'); expect(c.x).toBeGreaterThan(-1.6); expect(c.x).toBeLessThan(-0.4); expect(c.z).toBeCloseTo(-5.4, 3); expect(get(w, 'gate').used).toBe(false); }, label: '木箱沿窄道到踏板' },
  { act: 'flip' }, { wait: 0.1 },
  { expect: w => { expect(get(w, 'plate').used).toBe(true); expect(get(w, 'gate').used).toBe(true); expect(w.msg).toBe(MSG_PLATE_ON); }, label: '踏板壓下、鐵柵門升起' },
  { act: 'flip' },
  { walkTo: [1.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] },
  { expect: w => { expect(p(w).x).toBeCloseTo(12, 1); expect(get(w, 'valve').used).toBe(false); expect(get(w, 'door').used).toBe(false); }, label: '1-2c 完成：穿過門洞' }
];
const SOLVE_D: Cmd[] = [
  // 出口區地板上兩模式都搆不到高處的閥
  { walkTo: [15, null] }, { expect: w => expect(findTarget(w)).toBeNull(), label: '實景地板：沒有目標' },
  { act: 'flip' }, { expect: w => { expect(p(w).mode).toBe('2d'); expect(findTarget(w)).toBeNull(); }, label: '藏寶圖地板：搆不到閥' },
  { act: 'interact' }, { expect: w => expect(get(w, 'valve').used).toBe(false) },
  { act: 'flip' },
  // 物歸原處：木箱回起點，踏板 / 鐵柵門維持
  { act: 'reset' },
  { expect: w => { expect(get(w, 'crate').x).toBe(CRATE.x); expect(get(w, 'crate').z).toBe(CRATE.z); expect(get(w, 'plate').used).toBe(true); expect(get(w, 'gate').used).toBe(true); }, label: '物歸原處後踏板仍鎖定' },
  { walkTo: [6, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] }, { walkTo: [null, 0.9] },
  { expect: w => expect(Math.abs(get(w, 'crate').z)).toBeLessThan(0.1), label: '木箱推到門洞深度' },
  { walkTo: [3, null] }, { walkTo: [null, 0] }, { walkTo: [14.1, null] },
  { expect: w => { expect(get(w, 'crate').x).toBeCloseTo(15, 1); expect(get(w, 'crate').x).toBeGreaterThan(EXIT_MIN_X + 0.6); }, label: '木箱推過門洞到閥下' },
  { act: 'flip' },
  { hop: 1, until: w => p(w).onGround && p(w).y > CRATE_TOP - 0.05 && p(w).x > 14.5, label: '藏寶圖跳上箱頂' },
  { walkTo: [15, null] },
  { expect: w => expect(findTarget(w)?.def.id).toBe('valve'), label: '箱頂搆得到閥' },
  { act: 'interact' },
  { expect: w => { expect(get(w, 'valve').used).toBe(true); expect(get(w, 'door').used).toBe(true); expect(w.msg).toBe(TEXT('lvl.1-2.valve.use')); }, label: '1-2d 完成：閥轉開、門解封' }
];
const EXIT: Cmd[] = [
  { act: 'flip' }, { walkTo: [18, -4.6] },
  { expect: w => expect(findTarget(w)?.def.id).toBe('door'), label: '出口門' },
  { act: 'interact' }
];

describe('1-2 玄關：通關路徑', () => {
  it('runScript 1-2a → 1-2b → 1-2c → 1-2d → 出口門', () => {
    const w = newWorld();
    runScript(w, [...SOLVE_A, ...SOLVE_B, ...SOLVE_C, ...SOLVE_D, ...EXIT]);
    expect(w.cleared).toBe(true);
    expect(w.events.some(e => e.t === 'switchDenied')).toBe(false);
  });

  it('只有 1-2c 完成、還沒做 1-2d：直接走到門前開不了 (門仍封印)', () => {
    const w = newWorld();
    runScript(w, [...SOLVE_A, ...SOLVE_B, ...SOLVE_C, { walkTo: [18, -4.6] }, { act: 'interact' }]);
    expect(w.cleared).toBe(false);
    expect(w.msg).toBe(TEXT('lvl.1-2.door.locked'));
  });
});

describe('1-2 玄關：資料與驗證器', () => {
  it('validateLevel / validateEntry 對 1-2 為 0 issue；謎題編號 1-2a～1-2d、顯示名走文字表', () => {
    expect(validateLevel(foyer, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(foyer.puzzles!.map(q => q.id)).toEqual(['1-2a', '1-2b', '1-2c', '1-2d']);
    expect(foyer.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['1-2a 書架過缺口', '1-2b 推箱取筆尖', '1-2c 長桌下的機關踏板', '1-2d 高處的墨水閥']);
    const bad = { ...foyer, puzzles: [{ id: '1-2x', titleKey: 'lvl.1-2.puzzle.nope' }] };
    expect(validateLevel(bad, { mechanics: DEFAULT_MECHANICS, bundle: zhHant }).map(i => i.code)).toEqual(['text.missing']);
  });

  it('內部物件 id 沿用 (改版只動墨水閥高度與文字)', () => {
    expect(foyer.objects.map(o => o.id)).toEqual(['floorA', 'floorB', 'shelf', 'railFront', 'railL', 'railR', 'note', 'table', 'plate', 'note3',
      'crate', 'note2', 'plinth', 'key', 'partBack', 'partFront', 'lintel', 'gate', 'valve', 'door']);
    expect([VALVE.x, VALVE.y, VALVE.z, VALVE.w, VALVE.h, VALVE.visible]).toEqual([15, 2.3, -5.7, 0.5, 0.5, '2d']);
  });

  it('開場旁白 / 筆尖取得 / 通關下一關文字 (story-bible 7.3、7.4)', () => {
    expect(TEXT(foyer.narrationKey)).toBe('鋼筆少了筆尖。墨線封住了門。');
    expect(TEXT('lvl.1-2.key.use')).toBe('拿到了「鋼筆筆尖」。筆尖還是濕的。像有人剛用過。');
    expect(TEXT(foyer.nextKey)).toBe('墨線像退潮一樣散開。門後的走廊很長。下一間房：衣帽間（尚未開放）');
  });
});

/** 平地原地跳的最高點 (y 增量) */
function apex(mode: '3d' | '2d'): number {
  const w = newWorld();
  place(w, -17, 0, 2, mode);
  let top = 0;
  run(w, { jump: true }, 0.05);
  run(w, {}, 1, () => { top = Math.max(top, w.player.y); });
  return top;
}
/** 身體中心到閥盒的距離 (2D 忽略 z；同 core/interact distanceTo) */
function distToValve(x: number, feetY: number, z: number, mode: '3d' | '2d'): number {
  const c = [x, feetY + HALF, z];
  const lo = [VALVE.x - VALVE.w / 2, VALVE.y, VALVE.z - VALVE.d / 2];
  const hi = [VALVE.x + VALVE.w / 2, VALVE.y + VALVE.h, VALVE.z + VALVE.d / 2];
  const n = mode === '2d' ? 2 : 3;
  let s = 0;
  for (let i = 0; i < n; i++) { const d = Math.max(lo[i] - c[i], 0, c[i] - hi[i]); s += d * d; }
  return Math.sqrt(s);
}

describe('1-2d 高處的墨水閥：數值驗算 (實測跳高、互動範圍、D10)', () => {
  it('實測跳高 3D ≈1.18、2D ≈1.52；2D 跳上箱頂 (1.1) 餘裕 ≥ 0.15', () => {
    const a3 = apex('3d');
    const a2 = apex('2d');
    expect(a3).toBeCloseTo(1.18, 1);
    expect(a2).toBeCloseTo(1.52, 1);
    expect(a2 - CRATE_TOP).toBeGreaterThanOrEqual(0.15);
  });

  it('站地板：身體中心 0.45 → 閥底 2.3 差 1.85 > 1.5 (兩模式、出口區任何 x)；站箱頂：1.55 → 差 0.75 ≤ 1.5', () => {
    expect(distToValve(VALVE.x, 0, VALVE.z + 0.6, '2d')).toBeCloseTo(1.85, 6);
    for (let x = 10.7; x <= 19.7; x += 0.25) for (const mode of ['3d', '2d'] as const) {
      expect(distToValve(x, 0, -5.2, mode)).toBeGreaterThan(INTERACT_RANGE);
    }
    expect(distToValve(VALVE.x, CRATE_TOP, 0, '2d')).toBeCloseTo(0.75, 6);
    expect(distToValve(VALVE.x, CRATE_TOP, 0, '2d')).toBeLessThanOrEqual(INTERACT_RANGE);
    // 2D 原地跳到最高點 (身體中心 ≈ 1.97) 也還差 0.33 才到閥底；何況空中不能互動
    expect(VALVE.y - (apex('2d') + HALF)).toBeGreaterThan(0.3);
    // 箱頂的水平容許：玩家中心 |Δx| ≤ √(1.5² − 0.75²) + 閥半寬 ≈ 1.55 (D10 水平餘裕 ≥ 0.3)
    const slack = Math.sqrt(INTERACT_RANGE ** 2 - 0.75 ** 2) + VALVE.w / 2;
    expect(slack).toBeGreaterThan(0.3 + CRATE.w / 2);
  });

  it('站在箱頂 (閥下)：2D 搆得到、實景看不見閥 (只在藏寶圖)', () => {
    const w = afterC(newWorld());
    onCrateAtValve(w, '3d');
    expect(findTarget(w)).toBeNull();
    onCrateAtValve(w, '2d');
    expect(findTarget(w)?.def.id).toBe('valve');
  });

  it('箱頂上跳起、空中連按 E 也不算 (雙腳站穩才能互動)；落回箱頂才轉得動', () => {
    const w = afterC(newWorld());
    onCrateAtValve(w);
    let airborne = false;
    run(w, { jump: true }, 0.05, () => { if (!w.player.onGround) airborne = true; });
    expect(airborne).toBe(true);
    for (let i = 0; i < 20 && !w.player.onGround; i++) { interact(w); run(w, {}, 1 / 60); }
    expect(get(w, 'valve').used).toBe(false);
    run(w, {}, 1);
    interact(w);
    expect(get(w, 'valve').used).toBe(true);
  });
});

describe('1-2d 反例', () => {
  it('站出口區地板：3D / 2D 都搆不到閥 (站、跳、空中按 E)', () => {
    for (const mode of ['3d', '2d'] as const) for (let x = 11; x <= 19.5; x += 0.5) {
      const w = afterC(newWorld());
      place(w, x, 0, -5.2, mode);
      expect(findTarget(w)?.def.id).not.toBe('valve');
      interact(w);
      run(w, { jump: true }, 0.8, () => interact(w));
      expect(get(w, 'valve').used).toBe(false);
      expect(get(w, 'door').used).toBe(false);
    }
  });

  it('未取得筆尖：站在閥下的箱頂也轉不動 (乾涸訊息)；有筆尖時同一位置轉得動 (正對照)', () => {
    const w = newWorld();
    get(w, 'gate').used = true;
    onCrateAtValve(w);
    expect(findTarget(w)?.def.id).toBe('valve');
    interact(w);
    expect(w.msg).toBe(TEXT('lvl.1-2.valve.locked'));
    expect(get(w, 'valve').used).toBe(false);
    expect(get(w, 'door').used).toBe(false);
    addItem(w, 'nib', 1);
    interact(w);
    expect(get(w, 'door').used).toBe(true);
  });

  it('鐵柵門未開：木箱在門洞深度怎麼推都進不了出口區 (實景推 / 邊推邊跳、藏寶圖推不動)；門開了同一推法就過得去 (正對照)', () => {
    const gateFace = def('gate').x - def('gate').w / 2;
    for (const open of [false, true]) for (const z of [-0.4, 0, 0.4]) for (const input of [{ moveX: 1 }, { moveX: 1, jump: true }]) {
      const w = newWorld();
      get(w, 'gate').used = open;
      const c = get(w, 'crate');
      c.x = 8; c.z = z;
      place(w, 7.05, 0, z);
      run(w, input, 4);
      if (!open) expect(c.x).toBeLessThanOrEqual(gateFace - 0.6 + 1e-6);
      else if (!input.jump) expect(c.x).toBeGreaterThan(EXIT_MIN_X + 0.6); // 邊推邊跳會跳上箱頂、不再推 (不是對照組)
    }
    const w = newWorld();
    const c = get(w, 'crate');
    c.x = 9.4; c.z = 0;
    place(w, 8.5, 0, 0, '2d');
    run(w, { moveX: 1 }, 3);
    expect(c.x).toBe(9.4);
  });

  it('門洞 z∈[-1,1]、箱深 1.2：箱心 |z| ≤ 0.4 才推得過 (水平容許 0.8)；偏出去會卡在隔牆', () => {
    for (const [z, pass] of [[-0.4, true], [0.4, true], [-0.6, false], [0.5, false], [1.2, false]] as const) {
      const w = afterC(newWorld());
      const c = get(w, 'crate');
      c.x = 8; c.z = z;
      place(w, 7.05, 0, z);
      run(w, { moveX: 1 }, 4);
      expect(c.x > EXIT_MIN_X + 0.6).toBe(pass);
    }
  });

  it('2D 從高台頂越不過隔牆 (閘門開或關)，到不了出口區、也碰不到閥', () => {
    for (const open of [false, true]) {
      const w = newWorld();
      addItem(w, 'nib', 1);
      get(w, 'gate').used = open;
      place(w, 8.7, 2.5, -4.5, '2d');
      run(w, { moveX: 1, jump: true }, 3, () => interact(w));
      expect(w.player.x).toBeLessThan(9.71);
      expect(get(w, 'valve').used).toBe(false);
    }
  });

  it('木箱沒推進出口區就搆不到閥：木箱貼著隔牆 (門洞正前方) 站箱頂、兩模式都碰不到', () => {
    for (const mode of ['3d', '2d'] as const) {
      const w = afterC(newWorld());
      const c = get(w, 'crate');
      c.x = 9.4; c.z = 0;
      place(w, 9.4, CRATE_TOP, 0, mode);
      expect(findTarget(w)?.def.id).not.toBe('valve');
      run(w, { moveX: 1, jump: true }, 2, () => interact(w));
      expect(get(w, 'valve').used).toBe(false);
    }
  });

  it('木箱鎖在窄道 (踏板上) 時推不回來：玩家站不到它後方 (緊貼後牆)，四面怎麼推箱心 z 都 ≤ -5.2；物歸原處才能再用 (規格差異)', () => {
    const tries: [number, number, number, number][] = [[-2.4, -5.4, 1, 0], [1.2, -5.4, -1, 0], [-0.1, -3.9, 0, -1], [-0.1, -4.3, 0, -1]];
    for (const [px, pz, mx, mz] of tries) {
      const w = afterC(newWorld());
      const c = get(w, 'crate');
      c.x = -0.1; c.z = -5.4;
      place(w, px, px > -2.5 && px < 0.5 ? 0.8 : 0, pz);
      run(w, { moveX: mx, moveZ: mz }, 2);
      run(w, { moveZ: 1 }, 2);
      expect(c.z).toBeLessThanOrEqual(-5.2 + 1e-6);
    }
    const w = afterC(newWorld());
    const c = get(w, 'crate');
    c.x = -0.1; c.z = -5.4;
    place(w, 14, 0, 0);
    resetCrates(w);
    expect([c.x, c.z]).toEqual([CRATE.x, CRATE.z]);
    expect(get(w, 'plate').used).toBe(true);
    expect(get(w, 'gate').used).toBe(true);
  });
});

// ── 1-2d 捷徑掃描 (木箱位置網格 × 兩模式 × 探針) ──
const base = { level: foyer, mechanics: DEFAULT_MECHANICS, text: TEXT, setup: (w: World) => { afterC(w); } };
const use: Cmd = { act: 'interact' };
const flip: Cmd = { act: 'flip' };
const AIR_E: Cmd = { hold: { jump: true, pressed: ['interact'] }, seconds: 0.8 };
const valveFlags = ['used:valve', 'used:door', 'cleared'];

describe('1-2d 捷徑掃描', () => {
  it('木箱不在出口區 (中庭網格，含貼隔牆、高台旁)：出口區地板 / 箱頂 × 兩模式 × 探針，都轉不到閥', () => {
    const spec: ScanSpec = {
      ...base,
      movable: [{ id: 'crate', xs: [1.5, 4.5, 7, 8.6, 9.4], zs: [-4.2, -0.4, 0, 0.4, 2, 5.2] }],
      playerAt: [{ x: 12, y: 0, z: 0 }, { x: 15, y: 0, z: -5.2 }, { x: 15, y: 0, z: 3 }, { x: 18, y: 0, z: -4.6 }, { on: 'crate' }, { on: 'crate', dx: 0.5 }],
      probes: [[use], [AIR_E], [{ walkTo: [15, null] }, use, AIR_E], [flip, use, AIR_E], [{ hold: { moveX: 1, jump: true }, seconds: 2 }, use]],
      forbidden: valveFlags
    };
    const r = scanShortcuts(spec);
    expect(r.hits).toEqual([]);
    expect(r.runs).toBeGreaterThanOrEqual(500);
  });

  it('木箱在出口區、玩家不站箱頂：地板任何位置 × 兩模式 × 站 / 空中按 E，都轉不到閥', () => {
    const spec: ScanSpec = {
      ...base,
      movable: [{ id: 'crate', xs: [11.5, 13, 15, 17, 19], zs: [-5.2, 0, 3] }],
      playerAt: [12, 14, 15, 16, 18].flatMap(x => [{ x, y: 0, z: -4.6 }, { x, y: 0, z: 1.5 }, { x, y: 0, z: 5 }]),
      probes: [[use], [AIR_E], [{ hold: { moveZ: -1 }, seconds: 1 }, use]],
      forbidden: valveFlags
    };
    const r = scanShortcuts(spec);
    expect(r.hits).toEqual([]);
    expect(r.runs).toBeGreaterThanOrEqual(300);
  });

  it('對照組：木箱在閥下 (x=14 / 15 / 16)、2D 站箱頂 → 同一探針轉得到閥；箱頂 x 離閥太遠 (13 / 17) 則轉不到', () => {
    const at = (xs: number[]) => scanShortcuts({ ...base, modes: ['2d'], movable: [{ id: 'crate', xs, zs: [0] }], playerAt: [{ on: 'crate' }], probes: [[use]], forbidden: ['used:valve'] });
    expect(at([14, 15, 16]).hits.length).toBe(3);
    expect(at([13, 17]).hits).toEqual([]);
  });

  it('沒有筆尖：木箱在閥下、站箱頂 × 兩模式也解不開門', () => {
    const r = scanShortcuts({ ...base, setup: w => { get(w, 'gate').used = true; }, movable: [{ id: 'crate', xs: [14, 15, 16], zs: [-2, 0, 2] }],
      playerAt: [{ on: 'crate' }], probes: [[use], [flip, use], [{ walkTo: [18, -4.6] }, use]], forbidden: valveFlags });
    expect(r.hits).toEqual([]);
    expect(r.runs).toBeGreaterThanOrEqual(50);
  });
});

// ── 字條 (規格 7.1.1 量表、7.1.3 預算；驗證器尚無字條規則 → 以資料檢查) ──
interface PuzzleMeta { id: string; difficulty: number; area: [number, number]; keyObjects: string[]; ahaTerms: string[]; notes: string[] }
/** 規格 6 的難度、謎題範圍 (x)、關鍵物件 (H4)、aha 詞表 (H10)；字條歸屬 */
const PUZZLES: PuzzleMeta[] = [
  { id: '1-2a', difficulty: 2, area: [-20, -5], keyObjects: ['shelf', 'railFront', 'railL', 'railR'], ahaTerms: ['書架', '欄', '圖', '紙', '路', '壓平'], notes: ['note'] },
  { id: '1-2b', difficulty: 3, area: [3, 10], keyObjects: ['crate', 'plinth', 'key'], ahaTerms: ['箱', '高台', '挨', '靠', '疊', '圖'], notes: ['note2'] },
  { id: '1-2c', difficulty: 3, area: [-2.5, 3], keyObjects: ['table', 'plate', 'gate'], ahaTerms: ['不存在', '踏板', '圖', '紙', '重量', '箱'], notes: ['note3'] },
  { id: '1-2d', difficulty: 3, area: [10.4, 20], keyObjects: ['valve', 'crate', 'plate'], ahaTerms: ['鎖', '踏板', '箱', '歸', '原處', '再用'], notes: [] }
];
const STORY_BIBLE_L1: Record<string, string> = {
  note: '缺口不寬。當年他們也是這樣走過去的？',
  note2: '想要高一點？我小時候都踩著朋友的肩膀。',
  note3: '桌子底下，好像有什麼不想讓人看？'
};
const notes = foyer.objects.filter(o => o.type === 'note');
const noteText = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');

describe('1-2 字條：量表 H1～H4、H10 與預算', () => {
  it('三張字條 = story-bible 7.3 的 1-2a / 1-2b / 1-2c L1 原文；1-2d 依預算不放', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual(STORY_BIBLE_L1);
    expect(PUZZLES.flatMap(q => q.notes).sort()).toEqual(notes.map(o => o.id).sort());
  });

  it('H1 字數 ≤ 24；H2 無祈使開頭與禁用動詞；H3 無按鍵名 / 「按」/ 方位精確詞 / 數字', () => {
    for (const o of notes) {
      const t = noteText(o);
      expect([...t].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t)).toBe(false);
      expect(/先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t)).toBe(false);
      expect(/[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
    }
  });

  it('H4 不點名本題關鍵物件 (名稱與顯示名)；H10 不含本題 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) expect(t.includes(TEXT(def(k).labelKey!))).toBe(false);
      for (const term of q.ahaTerms) expect(t.includes(term)).toBe(false);
    }
  });

  it('預算 (7.1.3)：每題張數符合難度 (< 3 → 0～1；3～4.5 → L1 1)、每關提示 ≤ 謎題數 + 1、總數 ≤ 謎題數 + 3', () => {
    for (const q of PUZZLES) expect(q.notes.length).toBeLessThanOrEqual(1);
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 1);
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 3);
  });

  it('位置：每張在所屬謎題範圍內；兩張間距 ≥ 3；任一 16 單位寬畫面 ≤ 3 張', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const x = def(id).x;
      expect(x).toBeGreaterThanOrEqual(q.area[0]);
      expect(x).toBeLessThanOrEqual(q.area[1]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (let x0 = foyer.bounds.minX; x0 <= foyer.bounds.maxX; x0 += 0.5) {
      expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    }
  });

  it('兩模式都讀得到 (站在字條前的地板，站穩按 E 讀出本文)', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = newWorld();
      place(w, o.x, 0, -5.2, mode);
      expect(findTarget(w)?.def.id).toBe(o.id);
      interact(w);
      expect(w.msg).toBe(noteText(o));
    }
  });
});

describe('1-2 起點與檢查點不受改版影響', () => {
  it('從起點 3D 切到藏寶圖再切回不被拒絕；1-2a 之後的檢查點照舊', () => {
    const w = newWorld();
    run(w, {}, 0.2);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(foyer.checkpoints).toEqual([{ minX: -5.7, x: -4, y: 0, z: 2 }]);
  });
});
