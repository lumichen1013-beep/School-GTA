import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/audio/SoundEffects', () => ({ soundManager: {} }));

import type { DevWeaponsMode } from '../src/weapons/featureFlags';

// registry 於載入時依 devWeaponsMode 決定武器槽 → 每個模式重置模組後再載入
async function load(mode: DevWeaponsMode) {
  vi.resetModules();
  const flags = await import('../src/weapons/featureFlags');
  flags.__setDevWeaponsMode(mode);
  const registry = await import('../src/weapons/registry');
  const { Progression } = await import('../src/game/Progression');
  return { registry, Progression };
}

const DEV = 'BOOK_WHIP' as const;

// 最小 Player / ctx stub：只實作 Progression 用到的武器 API (規則與 Player.isWeaponUnlocked 相同，來源即真實 registry / flags)
async function makeProgression(mode: DevWeaponsMode) {
  const { registry, Progression } = await load(mode);
  const flags = await import('../src/weapons/featureFlags');
  const unlocked = new Set<string>();
  const state = { current: 'FIST' as string };
  const player = {
    position: { x: 0, y: 0, z: 0 },
    get currentWeapon() { return state.current; },
    isWeaponUnlocked(id: string) {
      if (!registry.isWeaponEnabled(id as never)) return false;
      const def = registry.getWeapon(id as never);
      if (def.release === 'dev' && flags.devWeaponsMode === 'unlocked') return true;
      return def.unlock === null || unlocked.has(id);
    },
    setWeaponUnlocked(id: string, v: boolean) { if (v) unlocked.add(id); else unlocked.delete(id); },
    setWeapon(id: string) { if (!this.isWeaponUnlocked(id)) return false; state.current = id; return true; },
    hasNormalBat: false,
    hasSpecialBat: false
  };
  const showBanner = vi.fn();
  const ctx = { player, wantedSystem: { showBanner }, currentWorldType: 'CAMPUS' } as never;
  return { registry, progression: new Progression(ctx), player, showBanner, unlocked, state };
}

describe('開發中武器開關', () => {
  beforeEach(() => vi.clearAllMocks());

  it('off：dev 武器不在 WEAPONS / 循環 / 裝備頁，unlockWeapon 不跳橫幅也不設旗標', async () => {
    const { registry, progression, showBanner, unlocked, state } = await makeProgression('off');
    expect(registry.ALL_WEAPONS.map((w) => w.id)).toContain(DEV);
    expect(registry.WEAPONS.map((w) => w.id)).not.toContain(DEV);
    expect(registry.isWeaponEnabled(DEV)).toBe(false);
    expect(registry.isWeaponEnabled('FIST')).toBe(true);
    expect(progression.getWeaponEquipEntries().map((e) => e.id)).not.toContain(DEV);

    expect(progression.unlockWeapon(DEV, { text: 'x', duration: 1000 })).toBe(false);
    expect(showBanner).not.toHaveBeenCalled();
    expect(unlocked.has(DEV)).toBe(false);
    expect(state.current).toBe('FIST');

    expect(progression.equipById(DEV)).toBe(false);
    expect(state.current).toBe('FIST');

    // 循環走完整圈也不會落在 dev 武器 (其餘皆未解鎖 → 回到徒手)
    for (let i = 0; i < 6; i++) progression.cycleWeapon();
    expect(state.current).toBe('FIST');
  });

  it('off：getWeapon 對未啟用 id 退回徒手', async () => {
    const { registry } = await load('off');
    expect(registry.getWeapon(DEV).id).toBe('FIST');
  });

  it('unlocked：dev 武器可直接裝備、進入循環並標示開發中', async () => {
    const { registry, progression, player, state } = await makeProgression('unlocked');
    expect(registry.WEAPONS.map((w) => w.id)).toContain(DEV);
    expect(player.isWeaponUnlocked(DEV)).toBe(true);
    const entry = progression.getWeaponEquipEntries().find((e) => e.id === DEV)!;
    expect(entry.dev).toBe(true);
    expect(entry.status).toBe('unlocked');
    expect(progression.getWeaponEquipEntries().filter((e) => e.id !== DEV && e.id !== 'BASKETBALL').every((e) => !e.dev)).toBe(true);

    expect(progression.equipById(DEV)).toBe(true);
    expect(state.current).toBe(DEV);

    state.current = 'FIST';
    progression.cycleWeapon();
    expect(state.current).toBe(DEV); // 其餘武器未解鎖，循環直接到 dev 武器
  });

  it('locked：需要解鎖才可裝備，解鎖時跳橫幅並自動裝備', async () => {
    const { progression, player, showBanner, state } = await makeProgression('locked');
    const entry = progression.getWeaponEquipEntries().find((e) => e.id === DEV)!;
    expect(entry.dev).toBe(true);
    expect(entry.status).toBe('locked');
    expect(player.isWeaponUnlocked(DEV)).toBe(false);
    expect(progression.equipById(DEV)).toBe(false);
    expect(state.current).toBe('FIST');

    expect(progression.unlockWeapon(DEV, { text: 'unlocked!', duration: 1000 })).toBe(true);
    expect(showBanner).toHaveBeenCalledWith('unlocked!', 1000);
    expect(state.current).toBe(DEV);
    expect(progression.equipById(DEV)).toBe(true);
  });

  it('released 武器在三種模式下都在 WEAPONS，順序固定', async () => {
    for (const mode of ['off', 'unlocked', 'locked'] as const) {
      const { registry } = await load(mode);
      expect(registry.WEAPONS.filter((w) => w.release === 'released').map((w) => w.id)).toEqual(['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET']);
    }
  });
});
