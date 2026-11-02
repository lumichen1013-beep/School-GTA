import { describe, it, expect } from 'vitest';
import { newWorld } from '../helpers';
import { runScript, playFrames, ScriptError, type Cmd } from '../../../src/puzzle/devtools/runScript';
import type { ActionFrame } from '../../../src/puzzle/core/actions';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { findTarget } from '../../../src/puzzle/core/interact';
import { MSG_PLATE_ON } from '../msgs';
import type { World } from '../../../src/puzzle/core/types';

const get = (w: World, id: string) => w.byId.get(id)!;
const target = (id: string): Cmd => ({ expect: w => expect(findTarget(w)?.def.id).toBe(id), label: `target ${id}` });

/** 玄關完整通關 (foyerSolution.test 的同一路徑；切換 / 互動改走 step 的動作幀，與遊戲主迴圈相同) */
const FOYER: readonly Cmd[] = [
  { wait: 0.2 },
  // ① 書架過缺口
  { walkTo: [-10.3, 2], zFirst: true },
  { act: 'flip' }, { expect: w => expect(w.player.mode).toBe('2d') },
  { walkTo: [-4.5, null] }, { expect: w => expect(w.player.y).toBeCloseTo(0, 3) },
  { act: 'flip' }, { wait: 0.2 },
  { expect: w => { expect(w.player.mode).toBe('3d'); expect(w.player.x).toBeGreaterThan(-6); expect(w.checkpoint).toBe(0); }, label: '① 過缺口' },
  // ② 繞長桌推木箱到高台旁，2D 跳上高台取筆尖
  { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 2] }, { walkTo: [6.1, null] },
  { expect: w => expect(get(w, 'crate').x).toBeCloseTo(7, 1), label: '木箱到高台旁' },
  { act: 'flip' },
  { hop: 1, until: w => w.player.onGround && w.player.y > 2.4 && w.player.x > 8.1, label: '跳上高台' },
  { walkTo: [8.5, null] }, target('key'),
  { act: 'interact' }, { expect: w => expect(hasItem(w, 'nib')).toBe(true), label: '② 筆尖' },
  // ③ 木箱推回、推進後方窄道、沿窄道推到壓板；2D 壓下 → 3D 過閘門
  { act: 'flip' },
  { walkTo: [null, 2] }, { walkTo: [5.4, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] },
  { walkTo: [null, -4.5] }, { hold: { moveZ: -1 }, seconds: 0.3 },
  { expect: w => expect(get(w, 'crate').z).toBeCloseTo(-5.4, 3) },
  { walkTo: [5.6, null] }, { walkTo: [null, -5.4] }, { walkTo: [-0.1, null] },
  { expect: w => { const c = get(w, 'crate'); expect(c.x).toBeGreaterThan(-1.6); expect(c.x).toBeLessThan(-0.4); expect(get(w, 'gate').used).toBe(false); } },
  { act: 'flip' }, { wait: 0.1 },
  { expect: w => { expect(get(w, 'plate').used).toBe(true); expect(get(w, 'gate').used).toBe(true); expect(w.msg).toBe(MSG_PLATE_ON); }, label: '③ 壓板' },
  { act: 'flip' },
  { walkTo: [1.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] },
  { expect: w => expect(w.player.x).toBeCloseTo(12, 1), label: '③ 過閘門' },
  // 1-2d：物歸原處 (踏板 / 閘門已鎖定) → 3D 把木箱推到 z=0、推過門洞到 x≈15 → 2D 跳上箱頂轉高處的墨水閥
  { act: 'reset' },
  { expect: w => { expect(get(w, 'gate').used).toBe(true); expect(get(w, 'crate').x).toBe(4.5); }, label: '1-2d 物歸原處' },
  { walkTo: [6, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] }, { walkTo: [null, 0.9] },
  { walkTo: [3, null] }, { walkTo: [null, 0] }, { walkTo: [14.1, null] },
  { expect: w => expect(get(w, 'crate').x).toBeCloseTo(15, 1), label: '1-2d 木箱過門洞' },
  // 終章：2D 墨水閥 → 3D 出口門
  { act: 'flip' },
  { hop: 1, until: w => w.player.onGround && w.player.y > 1.05 && w.player.x > 14.5, label: '1-2d 跳上箱頂' },
  { walkTo: [15, null] }, target('valve'),
  { act: 'interact' }, { expect: w => expect(get(w, 'door').used).toBe(true) },
  { act: 'flip' }, { walkTo: [18, -4.6] }, target('door'),
  { act: 'interact' }
];

describe('runScript：玄關完整通關 (腳本版，舊 foyerSolution 保留)', () => {
  it('從 createWorld 一路走到 cleared；切換經 step 送出 switch 事件', () => {
    const w = newWorld();
    const frames = runScript(w, FOYER);
    expect(w.cleared).toBe(true);
    expect(frames).toBeGreaterThan(600);
    expect(w.events.filter(e => e.t === 'switch')).toHaveLength(8);
    expect(w.events.some(e => e.t === 'switchDenied')).toBe(false);
  });

  it('錄下的 ActionFrame 序列在新世界回放得到同一結果 (確定性)', () => {
    const rec: ActionFrame[] = [];
    const a = newWorld();
    runScript(a, FOYER, { record: rec });
    expect(rec.some(f => f.pressed.includes('interact'))).toBe(true);
    const b = newWorld();
    playFrames(b, rec);
    expect(b.cleared).toBe(true);
    expect([b.player.x, b.player.y, b.player.z, b.time]).toEqual([a.player.x, a.player.y, a.player.z, a.time]);
    expect(b.objs.map(o => [o.def.id, o.x, o.z, o.used, o.gone])).toEqual(a.objs.map(o => [o.def.id, o.x, o.z, o.used, o.gone]));
  });

  it('少了一步 (沒拿筆尖) 就到不了 cleared；斷言點失敗回報指令索引與 label', () => {
    const skipKey = FOYER.filter(c => !('label' in c && c.label === '② 筆尖'));
    const i = skipKey.findIndex(c => 'act' in c && c.act === 'interact');
    const w = newWorld();
    expect(() => runScript(w, skipKey.filter((_, k) => k !== i))).toThrow(ScriptError);
    expect(w.cleared).toBe(false);
    expect(() => runScript(newWorld(), [{ wait: 0.1 }, { expect: () => { throw new Error('boom'); }, label: 'here' }])).toThrow('script step #1 (here): boom');
    expect(() => runScript(newWorld(), [{ hop: 1, until: () => false, seconds: 0.1, label: 'never' }])).toThrow(/#0 \(never\): hop condition not reached/);
  });

  it('歸位 (reset) 動作經 step 處理：推走的木箱回原位', () => {
    const w = newWorld();
    runScript(w, [{ place: [3.3, 0, 2] }, { hold: { moveX: 1 }, seconds: 1 }]);
    expect(get(w, 'crate').x).toBeGreaterThan(4.6);
    runScript(w, [{ walkTo: [0, null] }, { act: 'reset' }]);
    expect(get(w, 'crate').x).toBe(4.5);
    expect(get(w, 'crate').z).toBe(2);
  });
});
