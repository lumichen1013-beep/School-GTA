import { describe, it, expect } from 'vitest';
import { FOYER_V02, newWorld, place, DT } from '../helpers';
import { onCrateAtValve } from '../helpers';
import { FIXED_DT, LevelLoop } from '../../../src/puzzle/app/loop';
import { step } from '../../../src/puzzle/core/step';
import { interact } from '../../../src/puzzle/core/interact';
import type { Transition } from '../../../src/puzzle/render/transitions';
import type { World } from '../../../src/puzzle/core/types';

const still = { moveX: 0, moveZ: 0, jump: false, pressed: [] as const };
const snap = (w: World) => ({ p: { ...w.player }, msgSeq: w.msgSeq, objs: w.objs.map(o => [o.x, o.y, o.z, o.gone, o.used]), time: w.time });

/** 假過場：記錄呼叫，固定 n 步結束、第 swapAt 步換畫面 */
function fakeTransition(n: number, swapAt: number): Transition & { log: string[] } {
  let k = 0;
  const log: string[] = [];
  return {
    duration: n * FIXED_DT, log,
    start(to) { k = 0; log.push(`start:${to}`); },
    tick() { k++; return { done: k >= n, swapNow: k === swapAt }; },
    cancel() { log.push('cancel'); }
  };
}

describe('LevelLoop：固定步長 1/60', () => {
  it('固定步長與測試 DT 相同；累加真實時間，單幀最多 1/20 秒', () => {
    expect(FIXED_DT).toBe(DT);
    const loop = new LevelLoop(newWorld(), null);
    expect(loop.frame(1 / 120, still)).toBe(0);
    expect(loop.frame(1 / 120, still)).toBe(1);
    expect(loop.alpha).toBeCloseTo(0, 6);
    expect(loop.frame(1, still)).toBe(3);
    expect(loop.frame(1 / 60 * 2.5, still)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5, 6);
  });

  it('不同幀率下結果與逐步呼叫 step(DT) 完全一致 (實機與測試一致)', () => {
    const a = newWorld(); const b = newWorld();
    const loop = new LevelLoop(a, null);
    const input = { moveX: 1, moveZ: -0.4, jump: true, pressed: [] as const };
    let ticks = 0;
    for (const ms of [7, 9, 16.7, 33, 8.3, 4, 21, 16.6, 16.7, 50, 3, 11]) ticks += loop.frame(ms / 1000, input);
    for (let i = 0; i < ticks; i++) step(b, input, DT);
    expect(ticks).toBeGreaterThan(5);
    expect(snap(a)).toEqual(snap(b));
  });

  it('本幀按下的動作只送進下一個固定步；沒有步數的幀不會遺失按鍵', () => {
    const w = newWorld(FOYER_V02); // 字條在 x=-17 的凍結場景 (C7 起正式玄關的西區是 1-2d 拉繩)
    place(w, -17, 0, -5.2);
    const loop = new LevelLoop(w, null);
    const seq = w.msgSeq;
    expect(loop.frame(0.001, { ...still, pressed: ['interact'] })).toBe(0);
    expect(w.msgSeq).toBe(seq);
    loop.frame(1 / 30, still);
    expect(w.msgSeq).toBe(seq + 1);
    expect(w.msg).toBe('缺口不寬。當年他們也是這樣走過去的？');
  });

  it('切換成功 → 過場鎖：期間不推進世界、丟棄按鍵；換畫面點呼叫 onSwap，結束後恢復', () => {
    const w = newWorld();
    place(w, -17, 0, 2);
    const tr = fakeTransition(18, 9);
    let swaps = 0;
    const loop = new LevelLoop(w, tr, { onSwap: () => swaps++ });
    loop.frame(FIXED_DT, { ...still, pressed: ['flip'] });
    expect(w.player.mode).toBe('2d');
    expect(tr.log).toEqual(['start:2d']);
    expect(loop.isLocked).toBe(true);
    const t0 = w.time;
    const seq = w.msgSeq;
    for (let i = 0; i < 8; i++) loop.frame(FIXED_DT, { moveX: 1, moveZ: 0, jump: false, pressed: ['interact', 'flip'] });
    expect(swaps).toBe(0);
    loop.frame(FIXED_DT, still);
    expect(swaps).toBe(1);
    for (let i = 0; i < 9; i++) loop.frame(FIXED_DT, { moveX: 1, moveZ: 0, jump: false, pressed: ['flip'] });
    expect(loop.isLocked).toBe(false);
    expect(w.time).toBe(t0);
    expect(w.msgSeq).toBe(seq);
    expect(w.player.mode).toBe('2d');
    loop.frame(FIXED_DT, { ...still, moveX: 1 });
    expect(w.time).toBeGreaterThan(t0);
  });

  it('沒有過場時切換成功即 onSwap；切換失敗不鎖', () => {
    const w = newWorld();
    place(w, -17, 0, 2);
    let swaps = 0;
    const loop = new LevelLoop(w, null, { onSwap: () => swaps++ });
    loop.frame(FIXED_DT, { ...still, pressed: ['flip'] });
    expect(swaps).toBe(1);
    expect(loop.isLocked).toBe(false);
  });

  it('通關只通知一次，之後不再推進', () => {
    const w = newWorld(FOYER_V02);
    place(w, 8.5, 2.5, -4.5, '2d'); interact(w);
    onCrateAtValve(w); interact(w);
    place(w, 18, 0, -4.6);
    let cleared = 0;
    const loop = new LevelLoop(w, null, { onCleared: () => cleared++ });
    loop.frame(FIXED_DT, { ...still, pressed: ['interact'] });
    expect(w.cleared).toBe(true);
    const t = w.time;
    loop.frame(0.05, { moveX: 1, moveZ: 0, jump: false, pressed: ['interact'] });
    expect(w.time).toBe(t);
    expect(cleared).toBe(1);
  });

  it('prev 記錄最後一步之前的位置 (渲染內插)', () => {
    const w = newWorld();
    place(w, 0, 0, 2);
    const loop = new LevelLoop(w, null);
    loop.frame(FIXED_DT, { ...still, moveX: 1 });
    expect(w.player.x - loop.prev.x).toBeCloseTo(3.2 * DT, 6);
  });
});
