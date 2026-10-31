import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/audio/SoundEffects', () => ({ soundManager: {} }));

import { getWeapon, isWeaponEnabled, WEAPONS } from '../src/weapons/registry';
import { Progression } from '../src/game/Progression';

const NEW_WEAPONS = ['BOOK_WHIP', 'BASKETBALL', 'SLINGSHOT'] as const;

// 最小 Player / ctx stub：只實作 Progression 用到的武器 API (規則與 Player.isWeaponUnlocked 相同)
function makeProgression() {
  const unlocked = new Set<string>();
  const state = { current: 'FIST' as string };
  const player = {
    position: { x: 0, y: 0, z: 0 },
    get currentWeapon() { return state.current; },
    isWeaponUnlocked(id: string) {
      if (!isWeaponEnabled(id as never)) return false;
      return getWeapon(id as never).unlock === null || unlocked.has(id);
    },
    setWeaponUnlocked(id: string, v: boolean) { if (v) unlocked.add(id); else unlocked.delete(id); },
    setWeapon(id: string) { if (!this.isWeaponUnlocked(id)) return false; state.current = id; return true; },
    hasNormalBat: false,
    hasSpecialBat: false
  };
  const showBanner = vi.fn();
  const ctx = { player, wantedSystem: { showBanner }, currentWorldType: 'CAMPUS' } as never;
  return { progression: new Progression(ctx), player, showBanner, unlocked, state };
}

describe('書鞭 / 籃球 / 彈弓正式開放', () => {
  beforeEach(() => vi.clearAllMocks());

  it('皆在武器槽並已啟用，順序固定', () => {
    expect(WEAPONS.map((w) => w.id)).toEqual(['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET', 'RAPIER', ...NEW_WEAPONS]);
    for (const id of NEW_WEAPONS) {
      expect(isWeaponEnabled(id)).toBe(true);
      expect(getWeapon(id).id).toBe(id);
      expect(getWeapon(id).unlock).not.toBeNull();
    }
  });

  it('預設未解鎖：裝備頁為 locked 且不可裝備；達成條件解鎖後跳橫幅並自動裝備', () => {
    const { progression, player, showBanner, state } = makeProgression();
    const entry = progression.getWeaponEquipEntries().find((e) => e.id === 'BOOK_WHIP')!;
    expect(entry.status).toBe('locked');
    expect(player.isWeaponUnlocked('BOOK_WHIP')).toBe(false);
    expect(progression.equipById('BOOK_WHIP')).toBe(false);
    expect(state.current).toBe('FIST');

    expect(progression.unlockWeapon('BOOK_WHIP', { text: 'unlocked!', duration: 1000 })).toBe(true);
    expect(showBanner).toHaveBeenCalledWith('unlocked!', 1000);
    expect(state.current).toBe('BOOK_WHIP');
    expect(progression.equipById('BOOK_WHIP')).toBe(true);
  });

  it('未解鎖時循環切換不會落在新武器', () => {
    const { progression, state } = makeProgression();
    for (let i = 0; i < 8; i++) progression.cycleWeapon();
    expect(state.current).toBe('FIST');
  });
});
