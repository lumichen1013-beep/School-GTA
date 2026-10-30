import { describe, it, expect } from 'vitest';
import {
  PORTRAIT_MAX_FOV,
  horizontalFov,
  portraitDistanceScale,
  portraitFactor,
  portraitFov,
} from '../src/camera/portraitCamera';

describe('portraitCamera', () => {
  it('橫屏與桌機 (aspect >= 1) 係數為 0，FOV 與距離不變', () => {
    for (const a of [1, 1.6, 2.165, 16 / 9]) {
      const f = portraitFactor(a);
      expect(f).toBe(0);
      expect(portraitFov(65, f)).toBe(65);
      expect(portraitFov(72, f)).toBe(72);
      expect(portraitDistanceScale(f)).toBe(1);
    }
  });

  it('直屏係數隨 aspect 變窄單調上升並夾在 0~1', () => {
    expect(portraitFactor(0.75)).toBeGreaterThan(0);
    expect(portraitFactor(0.5)).toBeGreaterThan(portraitFactor(0.75));
    expect(portraitFactor(0.2)).toBe(1);
    expect(portraitFactor(NaN)).toBe(0);
  });

  it('垂直 FOV 不超過上限，且水平視野比不補償時更寬', () => {
    for (const base of [65, 72]) {
      const f = portraitFactor(390 / 844);
      const v = portraitFov(base, f);
      expect(v).toBeLessThanOrEqual(PORTRAIT_MAX_FOV);
      expect(v).toBeGreaterThanOrEqual(base);
      expect(horizontalFov(v, 390 / 844)).toBeGreaterThan(horizontalFov(base, 390 / 844));
    }
    expect(portraitFov(65, 1)).toBe(PORTRAIT_MAX_FOV);
  });

  it('距離倍率隨係數增加', () => {
    expect(portraitDistanceScale(1)).toBeGreaterThan(portraitDistanceScale(0.5));
    expect(portraitDistanceScale(0.5)).toBeGreaterThan(1);
  });

  it('390x844 戶外跟隨距離約 7.5m (基礎 4.2m，容差 0.1m)', () => {
    const BASE_OUTDOOR_DISTANCE = 4.2; // ThirdPersonCamera.targetDistance (步行)
    const outdoor = BASE_OUTDOOR_DISTANCE * portraitDistanceScale(portraitFactor(390 / 844));
    expect(Math.abs(outdoor - 7.5)).toBeLessThanOrEqual(0.1);
  });
});
