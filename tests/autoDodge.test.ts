import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: {} }));

import { Progression } from '../src/game/Progression';

function make(level: number, boss = false) {
  const player = {
    isDead: false, isCinematicLocked: false, isDodging: false, hitCooldown: 0, isRidingVehicle: false,
    isSwimming: false, knockdownTimer: 0, isLunging: false,
    performFlashStep: vi.fn(), performBearShake: vi.fn()
  };
  const showBanner = vi.fn();
  const ctx = {
    player, wantedSystem: { showBanner }, currentRidingBike: null, activeColliders: [],
    currentWorldType: 'CAMPUS', fencerBossFight: { isActive: boss }, hud: { updateSkillHUD: vi.fn() }
  } as never;
  const p = new Progression(ctx);
  p.dodgeSkillLevel = level;
  return { p, player, showBanner };
}

afterEach(() => vi.restoreAllMocks());

describe('被動自動閃避', () => {
  it('等級 0 不觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { p, player } = make(0);
    expect(p.tryAutoDodge()).toBe(false);
    expect(player.performFlashStep).not.toHaveBeenCalled();
  });

  it('等級 1 觸發閃身步；平時機率 20% 邊界', () => {
    const { p, player } = make(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    expect(p.tryAutoDodge()).toBe(false);
    vi.spyOn(Math, 'random').mockReturnValue(0.19);
    expect(p.tryAutoDodge()).toBe(true);
    expect(player.performFlashStep).toHaveBeenCalledTimes(1);
    expect(player.performBearShake).not.toHaveBeenCalled();
  });

  it('花劍客戰期間機率 30% 邊界', () => {
    const { p } = make(1, true);
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    expect(p.tryAutoDodge()).toBe(false);
    vi.spyOn(Math, 'random').mockReturnValue(0.29);
    expect(p.tryAutoDodge()).toBe(true);
    const n = make(1, false);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(n.p.tryAutoDodge()).toBe(false); // 平時 0.25 不過
  });

  it('等級 2 觸發狗熊哆嗦毛位移；突進斬中不位移但仍判定閃避', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = make(2);
    expect(a.p.tryAutoDodge()).toBe(true);
    expect(a.player.performBearShake).toHaveBeenCalledTimes(1);
    expect(a.player.performFlashStep).not.toHaveBeenCalled();
    const b = make(2);
    b.player.isLunging = true;
    expect(b.p.tryAutoDodge()).toBe(true);
    expect(b.player.performBearShake).not.toHaveBeenCalled();
  });

  it('被動冷卻與主動冷卻互不影響', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { p } = make(1);
    p.dodgeCooldownTimer = 0.8; // 主動冷卻中仍可自動閃避
    expect(p.tryAutoDodge()).toBe(true);
    expect(p.dodgeCooldownTimer).toBe(0.8);
    expect(p.tryAutoDodge()).toBe(false); // 被動冷卻中
    p.updateSkillCooldown(1.1);
    expect(p.tryAutoDodge()).toBe(true);
    // 被動冷卻中，手動施放不受影響
    const m = make(1);
    expect(m.p.tryAutoDodge()).toBe(true);
    m.p.triggerDodgeSkill();
    expect(m.player.performFlashStep).toHaveBeenCalledTimes(2);
    expect(m.p.dodgeCooldownTimer).toBeGreaterThan(0);
  });
});
