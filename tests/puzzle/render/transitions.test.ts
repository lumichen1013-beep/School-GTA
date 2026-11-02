import { describe, it, expect } from 'vitest';
import { cssFade, INK_FADE, TRANSITIONS } from '../../../src/puzzle/render/transitions';
import { FIXED_DT } from '../../../src/puzzle/app/loop';

describe('過場 (資料驅動)', () => {
  it('墨水暈開沿用 0.3 秒；swapNow 只在過半那一步出現一次；結束時透明', () => {
    expect(TRANSITIONS.ink).toBe(INK_FADE);
    expect(INK_FADE.duration).toBe(0.3);
    const el = { style: {} as Record<string, string> };
    const tr = cssFade(el as unknown as HTMLElement, INK_FADE);
    tr.start('2d');
    expect(el.style.background).toBe(INK_FADE.background['2d']);
    const res = [];
    for (let i = 0; i < 40; i++) { const r = tr.tick(FIXED_DT); res.push(r); if (r.done) break; }
    expect(res.length).toBeGreaterThanOrEqual(18);
    expect(res.length).toBeLessThanOrEqual(19);
    expect(res.filter(r => r.swapNow).length).toBe(1);
    expect([8, 9]).toContain(res.findIndex(r => r.swapNow)); // 約過半 (浮點誤差可能晚一步)
    expect(el.style.opacity).toBe('0');
    tr.start('3d');
    tr.tick(FIXED_DT * 9);
    expect(Number(el.style.opacity)).toBeCloseTo(1, 6);
    expect(el.style.transform).toBe(`scale(${0.35 + 0.5 * 1.6})`);
    tr.cancel();
    expect(el.style.opacity).toBe('0');
  });
});
