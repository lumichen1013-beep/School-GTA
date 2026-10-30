import { describe, expect, it, vi } from 'vitest';

// SoundEffects 於模組載入時會存取 window / document，以最小 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: {} }));

import { getWeaponSummary, summarizeCombo } from '../src/game/weaponStats';
import { WEAPONS } from '../src/weapons/registry';

describe('大地圖裝備頁秒傷估算', () => {
  const dps = (id: Parameters<typeof getWeaponSummary>[0]) => getWeaponSummary(id, 'CAMPUS').dps;

  it('徒手約 75/s', () => expect(Math.abs(dps('FIST') - 75)).toBeLessThanOrEqual(2));
  it('普通球棒約 88/s', () => expect(Math.abs(dps('NORMAL_BAT') - 88)).toBeLessThanOrEqual(2));
  it('黃金雷霆棒約 150/s', () => expect(Math.abs(dps('SPECIAL_BAT') - 150)).toBeLessThanOrEqual(2));
  it('雙燕羽刃約 132/s', () => expect(Math.abs(dps('DUAL_RACKET') - 132)).toBeLessThanOrEqual(2));

  it('逐擊取整：總傷等於各招傷害加總，且每招至少一擊', () => {
    for (const w of WEAPONS) {
      const s = getWeaponSummary(w.id, 'CAMPUS');
      expect(s.moves.length).toBeGreaterThan(0);
      expect(s.moves.reduce((n, m) => n + m.damage, 0)).toBe(s.totalDamage);
      for (const m of s.moves) expect(m.mults.length).toBeGreaterThan(0);
    }
  });

  it('summarizeCombo：extraDmg 與 dmg 皆為直接倍率、耗時為 Σ(cancel×dur×tempo)', () => {
    const move = { name: 'x', dur: 1, cancel: 0.5, dmg: 1, extraStrikes: [0.5, 0.7], extraDmg: [0.5, 2], finisher: false } as never;
    const s = summarizeCombo([move], 25, 2);
    expect(s.moves[0].mults).toEqual([1, 0.5, 2]);
    expect(s.totalDamage).toBe(25 + 13 + 50);
    expect(s.totalSeconds).toBeCloseTo(1, 5);
  });
});
