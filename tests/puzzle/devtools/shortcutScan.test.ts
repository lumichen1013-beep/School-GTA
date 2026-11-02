import { describe, it, expect } from 'vitest';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { addItem } from '../../../src/puzzle/mechanics/items';
import { resolveFlag, scanShortcuts, type ScanSpec } from '../../../src/puzzle/devtools/shortcutScan';
import type { Cmd } from '../../../src/puzzle/devtools/runScript';
import type { LevelDef, World } from '../../../src/puzzle/core/types';
import { TEXT } from '../msgs';

// 捷徑「取樣」掃描 (規格 M1 / D4；架構 4.12、T12)：只證明取樣到的配置 × 探針沒有捷徑，不是證明無解
// 與 foyerSolution.test 的 for z of [...] 反例並存 (舊測試保留)

const base = { level: foyer, mechanics: DEFAULT_MECHANICS, text: TEXT };
const range = (a: number, b: number, s: number): number[] => { const out: number[] = []; for (let v = a; v <= b + 1e-9; v += s) out.push(Math.round(v * 100) / 100); return out; };
const without = (ids: string[]): LevelDef => ({ ...foyer, objects: foyer.objects.filter(o => !ids.includes(o.id)) });
const flip: Cmd = { act: 'flip' };
const use: Cmd = { act: 'interact' };

/** ① 缺口：3D 不論起跳深度、站不站木箱都過不了 (書架只在 2D 可走) */
const GAP: ScanSpec = {
  ...base,
  modes: ['3d'],
  movable: [{ id: 'crate', xs: [-12.5, -11], zs: [-3.5, 0, 2, 4.5] }],
  playerAt: [...range(-5.5, 5.5, 1).map(z => ({ x: -12, y: 0, z })), { x: -11, y: 1.1, z: 2 }, { x: -12.5, y: 1.1, z: -3.5 }],
  probes: [
    [{ hold: { moveX: 1, jump: true }, seconds: 6 }],
    [{ hold: { moveX: 1, moveZ: -1, jump: true }, seconds: 3 }, { hold: { moveX: 1, jump: true }, seconds: 3 }]
  ],
  forbidden: [{ id: 'crossedGap3d', holds: w => w.player.mode === '3d' && w.player.onGround && w.player.x > -9.69 }]
};

/** ② 高台：木箱離高台夠遠 (箱心 x ≤ 5.5；起點 4.5) 時，站地面或站箱頂、兩模式都拿不到筆尖
 *  (箱心 x ≥ 6 起 2D 從箱頂邊緣就跳得上高台：那是同一解法「把箱推近」的容許範圍，不是捷徑；見下方對照組) */
const onPlinth = (w: World): boolean => w.player.onGround && w.player.y > 2.4;
const KEY: ScanSpec = {
  ...base,
  movable: [{ id: 'crate', xs: [2, 3, 4, 4.5, 5, 5.5], zs: [-4.5, 0, 2] }],
  playerAt: [{ on: 'crate' }, { on: 'crate', dx: 0.45 }, { on: 'crate', dx: 0.85 }, { x: 7.7, y: 0, z: -4.5 }, { x: 7.7, y: 0, z: 0 }],
  probes: [
    [{ hop: 1, until: onPlinth, seconds: 3, optional: true }, use, flip, { wait: 0.1 }, { hop: 1, until: onPlinth, seconds: 3, optional: true }, use],
    [{ hold: { moveX: 1, jump: true }, seconds: 3 }, use, flip, { wait: 0.1 }, use],
    [{ hold: { moveX: -1, jump: true }, seconds: 0.5 }, { hop: 1, until: onPlinth, seconds: 3, optional: true }, use]
  ],
  forbidden: ['item:nib', 'gone:key']
};

/** ③ 壓板：木箱在長桌前方 (不走後方窄道) 時，兩模式怎麼推、怎麼切都壓不下壓板 */
const PLATE: ScanSpec = {
  ...base,
  movable: [{ id: 'crate', xs: [1.5, 3, 5], zs: [-4, -1, 2, 5.2] }],
  playerAt: [{ x: 2.7, y: 0, z: -4 }, { x: 4.2, y: 0, z: -1 }, { x: 6.2, y: 0, z: 2 }, { x: 4.2, y: 0, z: 5.2 }],
  probes: [
    [{ hold: { moveX: -1 }, seconds: 4 }, flip, { wait: 0.3 }],
    [{ walkTo: [-0.1, null] }, flip, { wait: 0.3 }],           // 推木箱時玩家 x = 箱 x + 0.9 → 箱心停在壓板 x=-1
    [{ hold: { moveX: -1, jump: true }, seconds: 3 }, flip, { hold: { moveX: -1 }, seconds: 1 }],
    [flip, { hold: { moveX: -1, jump: true }, seconds: 3 }]
  ],
  forbidden: ['used:plate', 'used:gate']
};

/** ③ 壓板：玩家自己 (不帶木箱) 在壓板附近兩模式來回都壓不下 */
const PLATE_SELF: ScanSpec = {
  ...base,
  movable: [],
  playerAt: range(-2, 0, 0.5).map(x => ({ x, y: 0, z: -5.3 })),
  probes: [[{ wait: 0.5 }, flip, { wait: 0.5 }], [{ hold: { jump: true }, seconds: 1 }, flip, { hold: { jump: true }, seconds: 1 }]],
  forbidden: ['used:plate', 'used:gate']
};

/** 隔牆：閘門未開時兩模式都到不了出口區 (含站木箱跳) */
const PASSED = { id: 'pastPartition', holds: (w: { player: { x: number } }) => w.player.x > 10.4 };
const PARTITION: ScanSpec = {
  ...base,
  movable: [{ id: 'crate', xs: [8.6, 9.2], zs: [-1, 0, 1, 3] }],
  playerAt: [...range(-5.5, 5.5, 1).map(z => ({ x: 9.5, y: 0, z })), { x: 9.2, y: 1.1, z: 0 }, { x: 8.7, y: 2.5, z: -4.5 }],
  probes: [[{ hold: { moveX: 1, jump: true }, seconds: 3 }], [flip, { hold: { moveX: 1, jump: true }, seconds: 3 }]],
  forbidden: [PASSED]
};

/** 終章：沒有筆尖時兩模式都解不開出口門、也不能通關 */
const EXIT: ScanSpec = {
  ...base,
  movable: [],
  playerAt: [...range(14, 18, 1).map(x => ({ x, y: 0, z: -4.6 })), { x: 15, y: 0, z: 0 }],
  probes: [[use], [{ walkTo: [15, null] }, use, flip, { walkTo: [18, -4.6] }, use]],
  forbidden: ['used:door', 'cleared']
};

describe('shortcutScan：玄關取樣無捷徑', () => {
  for (const [name, spec, minRuns] of [['① 缺口', GAP, 20], ['② 高台筆尖', KEY, 60], ['③ 壓板 (木箱在桌前)', PLATE, 60], ['③ 壓板 (玩家自己)', PLATE_SELF, 15],
    ['隔牆 (閘門未開)', PARTITION, 40], ['終章 (無筆尖)', EXIT, 15]] as const) {
    it(name, () => {
      const r = scanShortcuts(spec);
      expect(r.hits).toEqual([]);
      expect(r.runs).toBeGreaterThanOrEqual(minRuns);
    });
  }
});

describe('shortcutScan：反向驗證掃描器有效 (故意放寬的關卡必須被抓到)', () => {
  it('移除閘門 → 3D 直接穿過門洞', () => {
    const r = scanShortcuts({ ...PARTITION, level: without(['gate']) });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every(h => h.flag === 'pastPartition')).toBe(true);
    expect(r.hits.some(h => h.sample.endsWith('3d') && h.sample.includes('player@(9.5,0,0.5)'))).toBe(true);
  });

  it('移除長桌 → 木箱從前方推到壓板，切 2D 即壓下', () => {
    const r = scanShortcuts({ ...PLATE, level: without(['table']) });
    expect(r.hits.some(h => h.flag === 'used:plate')).toBe(true);
    expect(r.hits.some(h => h.flag === 'used:gate')).toBe(true);
  });

  it('對照組：木箱推近高台 (x=6 / 7，正解配置) → 同一組探針確實拿得到筆尖', () => {
    for (const x of [6, 7]) {
      const r = scanShortcuts({ ...KEY, movable: [{ id: 'crate', xs: [x], zs: [-4.5, 2] }] });
      expect(r.hits.some(h => h.flag === 'item:nib' && h.sample.endsWith('2d'))).toBe(true);
    }
  });

  it('開場先給筆尖 → 終章的門被打開 (setup 生效)', () => {
    const r = scanShortcuts({ ...EXIT, setup: w => addItem(w, 'nib', 1) });
    expect(r.hits.map(h => h.flag)).toContain('used:door');
    expect(r.hits.map(h => h.flag)).toContain('cleared');
  });

  it('未知旗標格式 / 不存在的物件直接拋錯 (避免打錯字讓掃描恆過)', () => {
    expect(() => resolveFlag('nib')).toThrow('unknown flag "nib"');
    expect(() => scanShortcuts({ ...EXIT, forbidden: ['used:nope'] })).toThrow('no object "nope"');
  });
});
