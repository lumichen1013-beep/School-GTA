// C4：轉動短過場 (規格 5.4.1：≤ 1.2 秒；減弱動態改 0.6 秒淡入淡出、不位移) 與換房淡出淡入
import { describe, it, expect } from 'vitest';
import { CUBE_FX, cssCubeFx } from '../../../src/puzzle/render/transitions';

const fake = () => ({ style: { transform: '', opacity: '' }, clientWidth: 1000, clientHeight: 600 }) as unknown as HTMLElement;
function play(dir: string | null, reduce: boolean) {
  const stage = fake(); const veil = fake();
  const fx = cssCubeFx(stage, veil, dir, reduce);
  const log: { t: number; tr: string; op: number; swap: boolean }[] = [];
  let t = 0; let done = false; let swaps = 0;
  while (!done && t < 5) {
    const r = fx.tick(1 / 60);
    t += 1 / 60;
    if (r.swapNow) swaps++;
    done = r.done;
    log.push({ t, tr: stage.style.transform, op: Number(veil.style.opacity), swap: r.swapNow });
  }
  return { fx, log, t, swaps, stage, veil };
}

describe('cssCubeFx', () => {
  it('轉動 1.0 秒 (≤ 1.2)：畫面朝滑動方向位移、中段換畫面一次、結束時復原', () => {
    const { t, swaps, log, stage, veil } = play('N', false);
    expect(CUBE_FX.turn).toBeLessThanOrEqual(1.2);
    expect(t).toBeCloseTo(CUBE_FX.turn, 1);
    expect(swaps).toBe(1);
    expect(log.find(l => l.swap)!.t).toBeCloseTo(0.5, 1);
    expect(log.some(l => /translate\([-\d.]+px, -\d/.test(l.tr))).toBe(true); // 北 = 往畫面上方
    expect(Math.max(...log.map(l => l.op))).toBeGreaterThan(0.8);
    expect([stage.style.transform, veil.style.opacity]).toEqual(['', '0']);
  });

  it('減弱動態：0.6 秒、只有遮罩淡入淡出、不位移；換房 0.5 秒也不位移', () => {
    for (const [dir, reduce, dur] of [['E', true, CUBE_FX.reduced], [null, false, CUBE_FX.door]] as const) {
      const { t, swaps, log } = play(dir, reduce);
      expect(t).toBeCloseTo(dur, 1);
      expect(swaps).toBe(1);
      expect(log.every(l => l.tr === '')).toBe(true);
    }
  });

  it('cancel 立即清除畫面', () => {
    const stage = fake(); const veil = fake();
    const fx = cssCubeFx(stage, veil, 'W', false);
    for (let i = 0; i < 20; i++) fx.tick(1 / 60);
    expect(stage.style.transform).not.toBe('');
    fx.cancel();
    expect([stage.style.transform, veil.style.opacity]).toEqual(['', '0']);
  });
});
