import { describe, expect, it, vi } from 'vitest';

// SoundEffects 於模組載入時會存取 window / document，以任意方法皆為空函式的 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => {} }) }));

import {
  AOE_SECONDARY_DMG, PLAYER_COMBOS, probeFan, probeLine, strikeCanLaunch, strikeHitMode, strikeRoute
} from '../src/entities/shared/kungfu';
import { getWeaponSummary, summarizeCombo } from '../src/game/weaponStats';
import { getWeapon } from '../src/weapons/registry';
import { launchDistance } from '../src/weapons/launch';
import { SOUND_RANGE, soundGain } from '../src/audio/spatialAudio';
import type { DevWeaponsMode } from '../src/weapons/featureFlags';

const [W1, W2, W3] = PLAYER_COMBOS.WHIP;
const DEF = getWeapon('BOOK_WHIP');
const REACH = DEF.stats.reach;
const DEG = Math.PI / 180;

describe('綁帶捆書：招式資料', () => {
  it('名稱 / 時長 / 命中 / 接續點', () => {
    expect([W1, W2, W3].map((m) => m.name)).toEqual(['甩書橫掃', '回手抽擊', '旋鞭橫掃']);
    expect([W1, W2, W3].map((m) => m.dur)).toEqual([0.36, 0.36, 0.6]);
    expect([W1, W2, W3].map((m) => m.strike)).toEqual([0.4, 0.4, 0.5]);
    expect([W1.cancel, W3.cancel]).toEqual([0.6, 0.75]);
    expect(W2.extraStrikes).toEqual([0.6]);
    expect(W2.extraDmg).toEqual([0.5]);
    expect(W2.cancel).toBeGreaterThan(W2.extraStrikes[0]); // 追擊必在可接續點之前送出
    expect([W1.finisher, W2.finisher, W3.finisher]).toEqual([false, false, true]);
  });

  it('範圍換算：FAN 半徑 4.2m 半角 70°；LINE 長 4.8m 寬 1.2m；SELF 圓 4.2m；人數上限 4 / 4 / 6', () => {
    const a1 = W1.aoe!;
    expect(a1.shape).toBe('FAN');
    expect(a1.radius * REACH).toBeCloseTo(4.2);
    expect(a1.halfAngle! / DEG).toBeCloseTo(70);
    const a2 = W2.aoe!;
    expect(a2.shape).toBe('LINE');
    expect(a2.len! * REACH).toBeCloseTo(4.8);
    expect(a2.halfWidth! * REACH * 2).toBeCloseTo(1.2);
    const a3 = W3.aoe!;
    expect(a3.shape).toBeUndefined();
    expect(a3.center).toBe('SELF');
    expect(a3.radius * REACH).toBeCloseTo(4.2);
    expect([a1.max, a2.max, a3.max]).toEqual([4, 4, 6]);
    // 停格每招只設一次：三段皆 0.03s
    for (const a of [a1, a2, a3]) { expect(a.hitStop).toBe(0.03); expect(a.hitStopMulti).toBe(0.03); }
  });

  it('route 與 mode：第 1、2 段 (含追擊) 為 SHOVE，第 3 段主擊 LAUNCH', () => {
    const push = DEF.lightPush!;
    expect(push).toBe(0.5);
    expect(strikeRoute(W1, 0)).toBe('AOE');
    expect(strikeHitMode(W1, 0, push)).toBe('SHOVE');
    expect(strikeRoute(W2, 0)).toBe('AOE');
    expect(strikeHitMode(W2, 0, push)).toBe('SHOVE');
    expect(strikeRoute(W2, 1)).toBe('AOE_LIGHT');
    expect(strikeHitMode(W2, 1, push)).toBe('SHOVE');
    expect(strikeRoute(W3, 0)).toBe('AOE');
    expect(strikeHitMode(W3, 0, push)).toBe('LAUNCH');
    expect(strikeCanLaunch(W1, 0)).toBe(false);
    expect(strikeCanLaunch(W2, 0)).toBe(false);
    expect(strikeCanLaunch(W3, 0)).toBe(true);
  });

  it('終結技擊飛：主目標約 2.8m (launchCap 8 / 4.6)，近距離滿力時 ≥ 2.6m', () => {
    const force = DEF.stats.knockback * W3.knock * (1 - W3.aoe!.falloff * (1 / 4.2));
    expect(launchDistance(force, DEF.launchCap!)).toBeGreaterThan(2.6);
    expect(launchDistance(force, DEF.launchCap!)).toBeLessThanOrEqual(2.9);
  });
});

describe('綁帶捆書：FAN / LINE 判定與人數上限', () => {
  // 以與 resolveFinisherAoe 相同的篩選 + 取最近 N 人，驗證 5 名 NPC 時的上限
  const pick = (cands: { x: number; z: number }[], test: (x: number, z: number) => number, max: number) =>
    cands.map((c) => ({ c, d: test(c.x, c.z) })).filter((e) => e.d >= 0).sort((a, b) => a.d - b.d).slice(0, max).map((e) => e.c);

  it('FAN：扇形內 5 人只取最近 4 人；扇形外、背後、半徑外不入選', () => {
    const a = W1.aoe!;
    const cos = Math.cos(a.halfAngle!);
    const r = a.radius * REACH + 0.3;
    const test = (x: number, z: number) => probeFan(0, 0, 0, 1, r, cos, x, z);
    const inside = [{ x: 0, z: 1 }, { x: 1, z: 2 }, { x: -1.5, z: 2.5 }, { x: 2, z: 3 }, { x: 0, z: 4 }];
    expect(pick(inside, test, a.max)).toEqual(inside.slice(0, 4));
    expect(test(3, 0.5)).toBe(-1);   // 偏角約 80° 在半角外
    expect(test(0, -2)).toBe(-1);    // 背後
    expect(test(0, 5)).toBe(-1);     // 半徑外
  });

  it('LINE：長條內 5 人只取最近 4 人；半寬外、背後、超出長度不入選', () => {
    const a = W2.aoe!;
    const len = a.len! * REACH;
    const hw = a.halfWidth! * REACH + 0.3;
    const out = new Float32Array(3);
    const test = (x: number, z: number) => probeLine(0, 0, 0, 1, len, hw, x, z, out);
    const inside = [{ x: 0, z: 1 }, { x: 0.3, z: 2 }, { x: -0.4, z: 3 }, { x: 0, z: 4 }, { x: 0.2, z: 4.6 }];
    expect(pick(inside, test, a.max)).toEqual(inside.slice(0, 4));
    expect(test(1.5, 2)).toBe(-1);
    expect(test(0, -1.5)).toBe(-1);
    expect(test(0, 6)).toBe(-1);
  });

  it('SELF 圓形：第 3 段最多 6 人 (上限 AOE_CAP 8 以內)', () => {
    expect(W3.aoe!.max).toBe(6);
    expect(W3.aoe!.max).toBeLessThanOrEqual(8);
  });
});

describe('綁帶捆書：裝備頁秒傷', () => {
  it('單體秒傷約 67/s (±2)，一套 14 + 21 + 18 = 53', () => {
    const s = getWeaponSummary('BOOK_WHIP', 'CAMPUS');
    expect(s.totalDamage).toBe(53);
    expect(Math.abs(s.dps - 67)).toBeLessThanOrEqual(2);
    expect(s.moves.map((m) => m.damage)).toEqual([14, 21, 18]);
  });

  it('群攻 3 人秒傷約 175/s (逐人取整，次目標 ×0.8；容許 ±6)，且大於單體 2.4 倍', () => {
    const s = getWeaponSummary('BOOK_WHIP', 'CAMPUS');
    expect(s.groupTargets).toBe(3);
    expect(Math.abs(s.groupDps! - 175)).toBeLessThanOrEqual(6);
    expect(s.groupDps! / s.dps).toBeGreaterThan(2.4);
    expect(AOE_SECONDARY_DMG).toBe(0.8);
  });

  it('既有 4 把武器 (群攻皆為終結技) 不顯示群攻秒傷', () => {
    for (const id of ['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET'] as const) {
      expect(getWeaponSummary(id, 'CAMPUS').groupDps).toBeNull();
    }
  });

  it('summarizeCombo：無群攻招式 groupDps 為 null', () => {
    const move = { name: 'x', dur: 1, cancel: 0.5, dmg: 1, extraStrikes: [], extraDmg: [], finisher: false, aoe: null } as never;
    expect(summarizeCombo([move], 25, 1).groupDps).toBeNull();
  });
});

// 解鎖：CampusMode.updateMissionTracker 每幀檢查 racingGame.bestSwimTime
async function makeCampus(mode: DevWeaponsMode, bestSwimTime: number | null) {
  vi.resetModules();
  const flags = await import('../src/weapons/featureFlags');
  flags.__setDevWeaponsMode(mode);
  const registry = await import('../src/weapons/registry');
  const { Progression } = await import('../src/game/Progression');
  const { CampusMode } = await import('../src/game/CampusMode');
  const unlocked = new Set<string>();
  const state = { current: 'FIST' as string };
  const player = {
    position: { x: 0, y: 0, z: 0 },
    hasNormalBat: false,
    hasSpecialBat: false,
    isWeaponUnlocked(id: string) {
      if (!registry.isWeaponEnabled(id as never)) return false;
      const def = registry.getWeapon(id as never);
      if (def.release === 'dev' && flags.devWeaponsMode === 'unlocked') return true;
      return def.unlock === null || unlocked.has(id);
    },
    setWeaponUnlocked(id: string, v: boolean) { if (v) unlocked.add(id); else unlocked.delete(id); },
    setWeapon(id: string) { if (!this.isWeaponUnlocked(id)) return false; state.current = id; return true; },
    get currentWeapon() { return state.current; }
  };
  const showBanner = vi.fn();
  const racingGame = { bestSwimTime, bestTrackTime: null };
  const ctx = {
    player, wantedSystem: { showBanner }, currentWorldType: 'CAMPUS', racingGame,
    ecologicalGarden: { boss: { isDead: false } }, tennisGame: { coachDefeated: false }, basketballGame: { scoreStreak: 0, bestStreak: 0 },
    peCoachNpc: null, hud: { updateMissionTracker: vi.fn() }
  } as never;
  const progression = new Progression(ctx);
  (ctx as unknown as { progression: unknown }).progression = progression;
  const campus = new CampusMode(ctx);
  return { campus, progression, showBanner, racingGame, state, unlocked, registry };
}

describe('綁帶捆書：游泳比賽獲勝解鎖', () => {
  it('locked：尚未贏游泳不解鎖；bestSwimTime 有值後解鎖、跳橫幅並自動裝備，之後不重複', async () => {
    const t = await makeCampus('locked', null);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.progression.swimWon).toBe(false);
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'BOOK_WHIP')!.unlockSteps).toEqual([{ label: '游泳比賽獲勝', cur: 0, max: 1 }]);

    t.racingGame.bestSwimTime = 41.3;
    t.campus.updateMissionTracker();
    expect(t.progression.swimWon).toBe(true);
    expect(t.showBanner).toHaveBeenCalledWith('🌊 游泳比賽冠軍！解鎖【綁帶捆書】(滾輪或大地圖【裝備】切換)', 7000);
    expect(t.state.current).toBe('BOOK_WHIP');
    expect(t.unlocked.has('BOOK_WHIP')).toBe(true);
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'BOOK_WHIP')!.unlockSteps).toEqual([{ label: '游泳比賽獲勝', cur: 1, max: 1 }]);

    t.showBanner.mockClear();
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
  });

  it('off：bestSwimTime 有值也不觸發 (無橫幅、無旗標、不裝備)，武器不在武器槽', async () => {
    const t = await makeCampus('off', 30);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.unlocked.has('BOOK_WHIP')).toBe(false);
    expect(t.state.current).toBe('FIST');
    expect(t.registry.WEAPONS.map((w) => w.id)).not.toContain('BOOK_WHIP');
  });

  it('unlocked：視為已解鎖，不跳橫幅', async () => {
    const t = await makeCampus('unlocked', 30);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.state.current).toBe('FIST');
  });
});

describe('綁帶捆書：音效距離衰減', () => {
  it('whipCrack 20m、bookThud 15m：近距離滿音量、線性衰減、超出範圍不播', () => {
    expect(SOUND_RANGE.whipCrack).toBe(20);
    expect(SOUND_RANGE.bookThud).toBe(15);
    for (const id of ['whipCrack', 'bookThud'] as const) {
      expect(soundGain(id, 2)).toBe(1);
      expect(soundGain(id, 10)).toBeLessThan(1);
      expect(soundGain(id, 10)).toBeGreaterThan(soundGain(id, 13));
      expect(soundGain(id, SOUND_RANGE[id])).toBe(0);
    }
    expect(soundGain('whipCrack', 16)).toBeGreaterThan(0);
    expect(soundGain('bookThud', 16)).toBe(0);
  });
});

describe('綁帶捆書：持羽球拍時不推擊', () => {
  async function swing(holdingRacket: boolean) {
    const { CombatSystem } = await import('../src/game/CombatSystem');
    const THREE = await import('three');
    const npc = { position: new THREE.Vector3(0, 0, 1.5), isKnockedDown: false, isPermanentlyKnockedOut: false };
    const ctx = {
      currentWorldType: 'CAMPUS', npcs: [npc],
      player: {
        isDead: false, position: new THREE.Vector3(), rotationY: 0, moveSerial: 1, isHoldingRacket: holdingRacket,
        weaponDef: DEF, activeWeapon: { launchCap: null },
        strikeMove: holdingRacket ? PLAYER_COMBOS.RACKET[0] : W1, strikeIndex: 0,
        getWeaponReach: () => REACH, getWeaponDamage: () => DEF.stats.damage, getWeaponKnockback: () => DEF.stats.knockback
      },
      ecologicalGarden: { tryHitByPlayer: () => ({ hit: false }) }
    } as never;
    const combat = new CombatSystem(ctx);
    const modes: string[] = [];
    combat.applyPlayerHitToNpc = ((_n: unknown, spec: { mode: string }) => { modes.push(spec.mode); return true; }) as never;
    combat.updatePlayerStrike();
    return modes;
  }

  it('裝備綁帶捆書但持羽球拍揮拍：只扣血 (LIGHT)，不套用 lightPush', async () => {
    expect(await swing(true)).toEqual(['LIGHT']);
  });
});
