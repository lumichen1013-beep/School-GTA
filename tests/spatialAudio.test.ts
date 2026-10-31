import { describe, it, expect } from 'vitest';
import {
  NEAR_RADIUS, SOUND_COOLDOWN, SOUND_RANGE, cooldownReady, distanceBetween, distanceGain,
  SOUND_VOLUME, soundGain
} from '../src/audio/spatialAudio';

describe('空間音效距離衰減', () => {
  it('近距離滿音量、超出最大距離完全不播', () => {
    expect(distanceGain(0, 20)).toBe(1);
    expect(distanceGain(NEAR_RADIUS, 20)).toBe(1);
    expect(distanceGain(20, 20)).toBe(0);
    expect(distanceGain(100, 20)).toBe(0);
  });
  it('中間距離線性遞減且單調', () => {
    const mid = (20 + NEAR_RADIUS) / 2;
    expect(distanceGain(mid, 20)).toBeCloseTo(0.5, 5);
    expect(distanceGain(8, 20)).toBeGreaterThan(distanceGain(12, 20));
  });
  it('接近邊界低於可聞門檻視為 0', () => {
    expect(distanceGain(19.9, 20)).toBe(0);
  });
  it('各音效可聞距離：哨音 > 鈴聲 > 打擊', () => {
    expect(SOUND_RANGE.whistle).toBeGreaterThan(SOUND_RANGE.bell);
    expect(SOUND_RANGE.bell).toBeGreaterThan(SOUND_RANGE.punch);
    expect(distanceGain(30, SOUND_RANGE.whistle)).toBeGreaterThan(0);
    expect(distanceGain(30, SOUND_RANGE.bell)).toBe(0);
  });
  it('三維距離計算', () => {
    expect(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });
});

describe('全域冷卻', () => {
  it('間隔內不可再播、達到冷卻後可播、從未播放可播', () => {
    expect(cooldownReady(-Infinity, 0, 2.5)).toBe(true);
    expect(cooldownReady(10, 11, 2.5)).toBe(false);
    expect(cooldownReady(10, 12.5, 2.5)).toBe(true);
  });
  it('哨音與鈴聲冷卻在 1.5~3 秒之間', () => {
    for (const id of ['whistle', 'bell'] as const) {
      expect(SOUND_COOLDOWN[id]).toBeGreaterThanOrEqual(1.5);
      expect(SOUND_COOLDOWN[id]).toBeLessThanOrEqual(3);
    }
  });
  it('閃身步老師演武：音量約實戰 55%、可聞距離較小，50m 外為 0', () => {
    expect(SOUND_RANGE.dodgePractice).toBeLessThan(SOUND_RANGE.dodge);
    expect(soundGain('dodgePractice', 0)).toBeCloseTo(SOUND_VOLUME.dodgePractice!, 5);
    expect(soundGain('dodge', 0)).toBe(1);
    expect(soundGain('dodgePractice', 8)).toBeGreaterThan(0);
    expect(soundGain('dodgePractice', 8)).toBeLessThan(soundGain('dodge', 8));
    expect(soundGain('dodgePractice', 50)).toBe(0);
  });
  it('所有音效 50m 外：小動作為 0，僅全校性事件仍可聞', () => {
    for (const id of Object.keys(SOUND_RANGE) as (keyof typeof SOUND_RANGE)[]) {
      if (SOUND_RANGE[id] <= 35) expect(soundGain(id, 50)).toBe(0);
    }
    expect(soundGain('schoolBell', 50)).toBeGreaterThan(0);
    expect(soundGain('schoolBell', 120)).toBe(0);
  });
});
