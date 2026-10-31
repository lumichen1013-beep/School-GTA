import { describe, expect, it } from 'vitest';
import { FPS_LOCK, QUALITY_PRESETS, resolveAntialias, resolveFpsCap, shouldSkipFrame, type StoredQuality } from '../src/core/quality';
import { describeDiagFlags, parseDiagFlags } from '../src/core/diagFlags';

const stored = (mode: StoredQuality['mode'], autoTier?: 'low' | 'medium' | 'high'): StoredQuality => ({
  mode,
  auto: autoTier ? { tier: autoTier, fps: 30, key: 'k', area: 1, at: 0 } : null,
});

describe('檔位新增參數', () => {
  it('低檔鎖 30、小地圖 10Hz、雷達 DPR 1；中高檔維持原值', () => {
    expect(QUALITY_PRESETS.low).toMatchObject({ fpsCap: 30, minimapHz: 10, fullmapHz: 10, minimapDprMax: 1 });
    for (const t of ['medium', 'high'] as const) {
      expect(QUALITY_PRESETS[t]).toMatchObject({ fpsCap: 0, minimapHz: 25, fullmapHz: 20, minimapDprMax: 2 });
    }
  });
});

describe('幀率上限判斷', () => {
  it('不限時永不略過', () => {
    expect(shouldSkipFrame(1, 0)).toBe(false);
  });
  it('30fps：低於 33.3ms-2ms 略過，之後放行', () => {
    expect(shouldSkipFrame(16.7, 30)).toBe(true);
    expect(shouldSkipFrame(22.2, 30)).toBe(true);
    expect(shouldSkipFrame(31.0, 30)).toBe(true);
    expect(shouldSkipFrame(31.4, 30)).toBe(false);
    expect(shouldSkipFrame(33.3, 30)).toBe(false);
  });
  it('模擬 60Hz / 90Hz 螢幕：實際執行幀率約 30', () => {
    for (const hz of [60, 90]) {
      const step = 1000 / hz;
      let last = 0, runs = 0;
      for (let i = 1; i <= hz * 10; i++) {
        const t = i * step;
        if (!shouldSkipFrame(t - last, 30)) { last = t; runs++; }
      }
      expect(runs / 10).toBeGreaterThan(28);
      expect(runs / 10).toBeLessThan(31);
    }
  });
  it('跳幀累積的時間等於實際經過時間 (delta 不失真)', () => {
    let last = 0, sum = 0;
    for (let i = 1; i <= 600; i++) {
      const t = i * (1000 / 60);
      if (!shouldSkipFrame(t - last, 30)) { sum += t - last; last = t; }
    }
    expect(sum).toBeCloseTo(last, 6);
  });
});

describe('幀率上限優先序', () => {
  it('診斷覆蓋 > 偵測中 > 手動開關 > 檔位預設', () => {
    expect(resolveFpsCap(30, null, false)).toBe(30);
    expect(resolveFpsCap(0, null, false)).toBe(0);
    expect(resolveFpsCap(30, false, false)).toBe(0);
    expect(resolveFpsCap(0, true, false)).toBe(FPS_LOCK);
    expect(resolveFpsCap(30, true, true)).toBe(0);
    expect(resolveFpsCap(30, true, true, 30)).toBe(30);
    expect(resolveFpsCap(30, null, false, 0)).toBe(0);
  });
});

describe('抗鋸齒決策', () => {
  it('首次啟動 (無存檔) 開啟', () => {
    expect(resolveAntialias({ mode: 'auto', auto: null })).toBe(true);
  });
  it('手動低檔關閉，手動中 / 高開啟', () => {
    expect(resolveAntialias(stored('low'))).toBe(false);
    expect(resolveAntialias(stored('medium'))).toBe(true);
    expect(resolveAntialias(stored('high'))).toBe(true);
  });
  it('自動模式依偵測結果', () => {
    expect(resolveAntialias(stored('auto', 'low'))).toBe(false);
    expect(resolveAntialias(stored('auto', 'medium'))).toBe(true);
    expect(resolveAntialias(stored('auto', 'high'))).toBe(true);
  });
});

describe('URL 診斷開關', () => {
  it('沒有 diag 參數時全部無效', () => {
    const f = parseDiagFlags('?rs=0.5&blur=0');
    expect(f.enabled).toBe(false);
    expect(f.rs).toBeNull();
    expect(f.blur).toBeNull();
  });
  it('解析各開關', () => {
    const f = parseDiagFlags('?diag=1&rs=0.5&aa=0&blur=0&hud=0&render=0&npc=0&map=0&far=60&fog=0&fps=30');
    expect(f).toEqual({ enabled: true, rs: 0.5, aa: false, blur: false, hud: false, render: false, npc: false, map: false, far: 60, fog: false, fps: 30 });
    expect(describeDiagFlags(f)).toHaveLength(10);
  });
  it('超出範圍或格式錯誤的值忽略', () => {
    const f = parseDiagFlags('?diag=1&rs=5&aa=x&far=abc&fps=45&hud=');
    expect(f).toMatchObject({ enabled: true, rs: null, aa: null, far: null, fps: null, hud: null });
  });
  it('fps=0 解除上限', () => {
    expect(parseDiagFlags('?diag=1&fps=0').fps).toBe(0);
  });
});

import { RollingWindow } from '../src/core/perfProbe';

describe('診斷滾動視窗', () => {
  it('平均與 p95，超過視窗的樣本被丟棄', () => {
    const w = new RollingWindow(2000);
    w.push(0, 100);
    for (let i = 1; i <= 100; i++) w.push(1000 + i, i);
    const s = w.stats(1100);
    expect(s.count).toBe(101);
    w.push(3500, 10);
    const s2 = w.stats(3500);
    expect(s2.count).toBe(1);
    expect(s2.avg).toBe(10);
    expect(s.p95).toBeGreaterThan(90);
  });
  it('空視窗回傳 0', () => {
    expect(new RollingWindow(1000).stats(5)).toEqual({ count: 0, avg: 0, p50: 0, p95: 0 });
  });
});
