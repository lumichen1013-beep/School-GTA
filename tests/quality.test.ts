import { afterEach, describe, expect, it } from 'vitest';
import {
  PROBE, QUALITY_PRESETS, analyzeFrames, areaChangedSignificantly, decideFromHigh, decideFromMedium,
  makeDeviceKey, parseStoredQuality, resolvePixelRatio, resolveStartupTier, serializeStoredQuality,
  type StoredQuality,
} from '../src/core/quality';
import { FX_POOL_MAX, FX_PRESETS, computeFxPoolMax, getFxQuality, setFxTier } from '../src/effects/fxQuality';
import { NPC_LOD_DIST, nextNpcLodLevel, setNpcLodDistanceScale } from '../src/entities/npc/lod';
import { isTouchSignals } from '../src/core/device';

// 產生 n 個幀間隔 (ms)
const frames = (n: number, ms: number) => Array.from({ length: n }, () => ms);
const mix = (...parts: number[][]) => parts.flat();

describe('畫質參數表', () => {
  it('像素比 / 陰影 / NPC 分級距離依 低 < 中 < 高 遞增', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect([low.pixelRatioMax, medium.pixelRatioMax, high.pixelRatioMax]).toEqual([1, 1.5, 2]);
    expect([low.shadowMapSize, medium.shadowMapSize, high.shadowMapSize]).toEqual([0, 1024, 2048]);
    expect(low.npcLodScale).toBeLessThan(medium.npcLodScale);
    expect(medium.npcLodScale).toBeLessThanOrEqual(high.npcLodScale);
  });

  it('像素比不超過 devicePixelRatio', () => {
    expect(resolvePixelRatio(3, 'high')).toBe(2);
    expect(resolvePixelRatio(3, 'medium')).toBe(1.5);
    expect(resolvePixelRatio(3, 'low')).toBe(1);
    expect(resolvePixelRatio(1, 'high')).toBe(1);
    expect(resolvePixelRatio(1.25, 'medium')).toBe(1.25);
    expect(resolvePixelRatio(0, 'high')).toBe(1);
    expect(resolvePixelRatio(NaN, 'medium')).toBe(1);
  });

  it('特效：中檔介於低與高之間，池容量為各檔最大值', () => {
    const numeric = ['crackPool', 'crackLayers', 'ringPool', 'dustPool', 'lightningStrands', 'slashPool', 'flashPerStrike', 'featherPool', 'debrisCount', 'trailSubdiv', 'crackMaxSize', 'crackLife'] as const;
    for (const k of numeric) {
      expect(FX_PRESETS.low[k]).toBeLessThanOrEqual(FX_PRESETS.medium[k]);
      expect(FX_PRESETS.medium[k]).toBeLessThanOrEqual(FX_PRESETS.high[k]);
    }
    expect(FX_POOL_MAX).toEqual(computeFxPoolMax(FX_PRESETS));
    for (const tier of ['low', 'medium', 'high'] as const) {
      const q = FX_PRESETS[tier];
      expect(q.slashPool).toBeLessThanOrEqual(FX_POOL_MAX.slashPool);
      expect(q.featherPool).toBeLessThanOrEqual(FX_POOL_MAX.featherPool);
      expect(q.ringPool).toBeLessThanOrEqual(FX_POOL_MAX.ringPool);
      expect(q.dustPool).toBeLessThanOrEqual(FX_POOL_MAX.dustPool);
      expect(q.crackPool * q.crackLayers).toBeLessThanOrEqual(FX_POOL_MAX.crackPool * FX_POOL_MAX.crackLayers);
      expect(q.lightningStrands * q.lightningSegments).toBeLessThanOrEqual(FX_POOL_MAX.lightningStrands * FX_POOL_MAX.lightningSegments);
    }
  });

  afterEach(() => { setFxTier('medium'); setNpcLodDistanceScale(1); });

  it('getFxQuality 不快取，改檔立即生效', () => {
    setFxTier('high');
    expect(getFxQuality().slashPool).toBe(FX_PRESETS.high.slashPool);
    setFxTier('low');
    expect(getFxQuality().slashPool).toBe(FX_PRESETS.low.slashPool);
    expect(getFxQuality().chargeRingDouble).toBe(false);
  });

  it('NPC 分級距離倍率：低檔 ×0.7 時較近即降級', () => {
    const d = NPC_LOD_DIST.midEnter * 0.85;
    expect(nextNpcLodLevel(0, d * d, false)).toBe(0);
    setNpcLodDistanceScale(0.7);
    expect(nextNpcLodLevel(0, d * d, false)).toBe(1);
    setNpcLodDistanceScale(1);
    expect(nextNpcLodLevel(0, d * d, false)).toBe(0);
  });
});

describe('FPS 量測統計', () => {
  it('60Hz 穩定：目標 16.7ms、無掉幀', () => {
    const s = analyzeFrames(frames(180, 16.7));
    expect(s.frames).toBe(180);
    expect(s.fps).toBeCloseTo(59.9, 0);
    expect(s.targetMs).toBeCloseTo(16.7, 1);
    expect(s.jankRatio).toBe(0);
  });

  it('剔除過長間隔 (切分頁 / 長暫停)', () => {
    const s = analyzeFrames(mix(frames(100, 16.7), [1200, 800]));
    expect(s.frames).toBe(100);
  });

  it('120Hz 螢幕：目標以 60fps 為上限，不要求 120fps', () => {
    const s = analyzeFrames(frames(300, 8.33));
    expect(s.refreshMs).toBeCloseTo(8.33, 2);
    expect(s.targetMs).toBeCloseTo(1000 / PROBE.TARGET_FPS_MAX, 3);
    expect(s.fpsRatio).toBeGreaterThan(1.9);
  });

  it('空資料不崩潰', () => {
    const s = analyzeFrames([]);
    expect(s.frames).toBe(0);
    expect(decideFromMedium(s)).toBe('medium');
    expect(decideFromHigh(s)).toBe('medium');
  });
});

describe('檔位決策', () => {
  it('中檔 60fps 穩定 → 試升高檔', () => {
    expect(decideFromMedium(analyzeFrames(frames(180, 16.7)))).toBe('high');
  });

  it('90Hz / 120Hz 螢幕跑滿 → 試升高檔', () => {
    expect(decideFromMedium(analyzeFrames(frames(270, 11.1)))).toBe('high');
    expect(decideFromMedium(analyzeFrames(frames(360, 8.33)))).toBe('high');
  });

  it('120Hz 螢幕跑約 70fps (未達螢幕上限但超過 60) → 不降檔', () => {
    const s = analyzeFrames(mix(frames(150, 8.33), frames(150, 16.7)));
    expect(decideFromMedium(s)).not.toBe('low');
  });

  it('約 50fps 有偶發掉幀 → 維持中檔', () => {
    // 60Hz：每 5 幀 1 幀掉到 33ms → 平均約 20ms (50fps)
    const s = analyzeFrames(Array.from({ length: 150 }, (_, i) => (i % 5 === 0 ? 33.4 : 16.7)));
    expect(s.fps).toBeGreaterThan(45);
    expect(decideFromMedium(s)).toBe('medium');
  });

  it('中檔約 30fps → 降低檔', () => {
    expect(decideFromMedium(analyzeFrames(frames(90, 33.3)))).toBe('low');
  });

  it('平均尚可但掉幀頻繁 (>25%) → 降低檔', () => {
    const s = analyzeFrames(Array.from({ length: 150 }, (_, i) => (i % 3 === 0 ? 33.4 : 12)));
    expect(s.jankRatio).toBeGreaterThan(PROBE.DOWNGRADE_JANK_MIN);
    expect(decideFromMedium(s)).toBe('low');
  });

  it('省電鎖 30fps 的裝置不會被當成順暢 (目標下限 50fps)', () => {
    const s = analyzeFrames(frames(90, 33.3));
    expect(s.targetMs).toBeCloseTo(1000 / PROBE.TARGET_FPS_MIN, 3);
    expect(decideFromMedium(s)).toBe('low');
  });

  it('高檔試跑：順暢維持高檔，掉到約 45fps 退回中檔', () => {
    expect(decideFromHigh(analyzeFrames(frames(150, 16.7)))).toBe('high');
    // 60Hz 垂直同步下 45fps 實際呈現為 16.7 / 33.4ms 交錯 (每 3 幀掉 1 幀)
    expect(decideFromHigh(analyzeFrames(Array.from({ length: 150 }, (_, i) => (i % 3 === 0 ? 33.4 : 16.7))))).toBe('medium');
    expect(decideFromHigh(analyzeFrames(Array.from({ length: 150 }, (_, i) => (i % 4 === 0 ? 33.4 : 16.7))))).toBe('medium');
  });
});

describe('設定儲存與啟動檔位', () => {
  const key = makeDeviceKey({ screenW: 1280, screenH: 800, dpr: 2, touch: true, gpu: 'Mali-G57' });

  it('裝置鍵不分直橫向', () => {
    expect(makeDeviceKey({ screenW: 800, screenH: 1280, dpr: 2, touch: true, gpu: 'Mali-G57' })).toBe(key);
    expect(makeDeviceKey({ screenW: 1280, screenH: 800, dpr: 1.5, touch: true, gpu: 'Mali-G57' })).not.toBe(key);
    expect(makeDeviceKey({ screenW: 1280, screenH: 800, dpr: 2, touch: false, gpu: 'Mali-G57' })).not.toBe(key);
  });

  it('解析失敗 / 欄位錯誤時退回自動且無結果', () => {
    expect(parseStoredQuality(null)).toEqual({ mode: 'auto', auto: null });
    expect(parseStoredQuality('{bad')).toEqual({ mode: 'auto', auto: null });
    expect(parseStoredQuality(JSON.stringify({ mode: 'ultra', auto: { tier: 'x' } }))).toEqual({ mode: 'auto', auto: null });
  });

  it('序列化往返', () => {
    const s: StoredQuality = { mode: 'low', auto: { tier: 'high', fps: 59.8, key, area: 1024000, blurOff: true, at: 1 } };
    expect(parseStoredQuality(serializeStoredQuality(s))).toEqual(s);
  });

  it('舊版偵測結果 (無 blurOff) 解析為 false；手動檔位不受影響', () => {
    const raw = JSON.stringify({ mode: 'high', auto: { tier: 'low', fps: 27.6, key, area: 1e6, at: 5 } });
    const s = parseStoredQuality(raw);
    expect(s.mode).toBe('high');
    expect(s.auto?.blurOff).toBe(false);
  });

  it('毛玻璃條件不同的偵測結果失效 (舊結果在有毛玻璃下測得；觸控裝置現已關閉)，手動模式不受影響', () => {
    const old = { tier: 'low' as const, fps: 27.6, key, area: 1_000_000, blurOff: false, at: 0 };
    expect(resolveStartupTier({ mode: 'auto', auto: old }, key, 1e6, true)).toEqual({ tier: 'medium', needProbe: true });
    expect(resolveStartupTier({ mode: 'auto', auto: old }, key, 1e6, false)).toEqual({ tier: 'low', needProbe: false });
    expect(resolveStartupTier({ mode: 'auto', auto: { ...old, blurOff: true } }, key, 1e6, true)).toEqual({ tier: 'low', needProbe: false });
    expect(resolveStartupTier({ mode: 'high', auto: old }, key, 1e6, true)).toEqual({ tier: 'high', needProbe: false });
  });

  it('手動模式直接採用，不量測', () => {
    expect(resolveStartupTier({ mode: 'low', auto: null }, key, 1e6)).toEqual({ tier: 'low', needProbe: false });
  });

  it('自動模式：同裝置、面積相近沿用上次結果', () => {
    const auto = { tier: 'high' as const, fps: 60, key, area: 1_000_000, blurOff: false, at: 0 };
    expect(resolveStartupTier({ mode: 'auto', auto }, key, 1_100_000)).toEqual({ tier: 'high', needProbe: false });
  });

  it('自動模式：無結果 / 換裝置 / 面積大幅改變 → 中檔起跑並重新量測', () => {
    const auto = { tier: 'high' as const, fps: 60, key, area: 1_000_000, blurOff: false, at: 0 };
    expect(resolveStartupTier({ mode: 'auto', auto: null }, key, 1e6)).toEqual({ tier: 'medium', needProbe: true });
    expect(resolveStartupTier({ mode: 'auto', auto }, key + 'x', 1e6)).toEqual({ tier: 'medium', needProbe: true });
    expect(resolveStartupTier({ mode: 'auto', auto }, key, 2_000_000)).toEqual({ tier: 'medium', needProbe: true });
  });

  it('面積變化門檻', () => {
    expect(areaChangedSignificantly(1e6, 1.5e6)).toBe(false);
    expect(areaChangedSignificantly(1e6, 1.7e6)).toBe(true);
    expect(areaChangedSignificantly(1e6, 0.6e6)).toBe(true);
    expect(areaChangedSignificantly(0, 1e6)).toBe(true);
  });
});

describe('觸控判斷 (不看視窗寬度)', () => {
  it('任一觸控訊號成立即視為觸控', () => {
    expect(isTouchSignals({ maxTouchPoints: 0, hasOnTouchStart: false, coarsePointer: false })).toBe(false);
    expect(isTouchSignals({ maxTouchPoints: 5, hasOnTouchStart: false, coarsePointer: false })).toBe(true);
    expect(isTouchSignals({ maxTouchPoints: 0, hasOnTouchStart: true, coarsePointer: false })).toBe(true);
    expect(isTouchSignals({ maxTouchPoints: 0, hasOnTouchStart: false, coarsePointer: true })).toBe(true);
  });
});
