import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/SoundEffects', () => ({ soundManager: {} }));

import { WEAPONS, getWeapon, resolveVariant } from '../src/weapons/registry';
import { launchDistance, launchHorizontal, launchVertical } from '../src/weapons/launch';
import type { WeaponId, WeaponWorld } from '../src/weapons/types';

// NPC.ts 預設玩家擊飛上限 (未設 launchCap 的武器沿用)
const DEFAULT_CAP = { h: 10, v: 7 };

// 終結技主目標 (無衰減) 的擊退力 = 武器 knockback × 終結招式 knock
function finisherForce(id: WeaponId, world: WeaponWorld): number {
  const combo = resolveVariant(id, world).combo;
  const fin = combo.find((m) => m.finisher)!;
  return getWeapon(id).stats.knockback * fin.knock;
}
function distance(id: WeaponId, world: WeaponWorld): number {
  return launchDistance(finisherForce(id, world), resolveVariant(id, world).launchCap ?? DEFAULT_CAP);
}

describe('終結技擊飛距離分級 (主目標、無衰減)', () => {
  const targets: [WeaponId, WeaponWorld, number][] = [
    ['FIST', 'CAMPUS', 4.0],
    ['NORMAL_BAT', 'CAMPUS', 5.4],
    ['NORMAL_BAT', 'DETENTION', 5.4], // 警棍
    ['SPECIAL_BAT', 'CAMPUS', 6.5],
    ['DUAL_RACKET', 'CAMPUS', 5.0]
  ];
  for (const [id, world, expected] of targets) {
    it(`${id} / ${world} 約 ${expected}m`, () => {
      expect(Math.abs(distance(id, world) - expected)).toBeLessThanOrEqual(0.2);
    });
  }

  it('各武器上限確實卡住主目標 (F 夠大，否則距離不由 cap 決定)', () => {
    for (const w of WEAPONS) {
      const cap = w.launchCap;
      if (!cap) continue;
      const f = finisherForce(w.id, 'CAMPUS');
      expect(f * 1.1).toBeGreaterThanOrEqual(cap.h);
      expect(f * 0.6).toBeGreaterThanOrEqual(cap.v);
    }
  });

  it('預設路徑不變：10 / 7 上限、距離約 5.38m', () => {
    expect(launchHorizontal(100, 10)).toBe(10);
    expect(launchVertical(100, 7)).toBe(7);
    expect(launchDistance(21, DEFAULT_CAP)).toBeCloseTo(5.38, 2);
    expect(getWeapon('NORMAL_BAT').launchCap).toBeUndefined();
  });

  it('距離依武器遞增：拳 < 雙羽球拍 < 棒 < 黃金棒', () => {
    expect(distance('FIST', 'CAMPUS')).toBeLessThan(distance('DUAL_RACKET', 'CAMPUS'));
    expect(distance('DUAL_RACKET', 'CAMPUS')).toBeLessThan(distance('NORMAL_BAT', 'CAMPUS'));
    expect(distance('NORMAL_BAT', 'CAMPUS')).toBeLessThan(distance('SPECIAL_BAT', 'CAMPUS'));
  });
});
