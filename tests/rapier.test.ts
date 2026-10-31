import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const sfx = vi.hoisted(() => ({
  playRapierThrust: vi.fn(), playPetalBloom: vi.fn(), playBanditSlash: vi.fn(), playFinisherThump: vi.fn(), playSwingWhoosh: vi.fn(), playFanfare: vi.fn()
}));
// 細劍用到的音效以 spy 記錄，其餘 (Boss 等) 為空函式
vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy(sfx as Record<string, unknown>, { get: (t, k: string) => t[k] ?? (() => undefined) })
}));
vi.mock('../src/effects/SlashFX', () => ({ slashFX: { hitFlash: vi.fn(), dashBand: vi.fn(), chargeRing: vi.fn(), thrust: vi.fn(), hitRing: vi.fn() } }));
vi.mock('../src/effects/ComboFinisherFX', () => ({ comboFinisherFX: { groundSlam: vi.fn(), spinWave: vi.fn(), featherBurst: vi.fn(), arcBolt: vi.fn() } }));

import { PLAYER_COMBOS, lineAoeSpan, probeLine, strikeHitMode, strikeRoute } from '../src/entities/shared/kungfu';
import { getWeaponSummary } from '../src/game/weaponStats';
import { getWeapon, isWeaponEnabled, resolveVariant, WEAPONS } from '../src/weapons/registry';
import { LAUNCH_GRAVITY, launchDistance, launchVertical } from '../src/weapons/launch';
import { IMPACT_PROFILES, impactFeedback } from '../src/weapons/impactClass';
import { WEAPON_FX_STYLES } from '../src/effects/weaponFxStyle';
import { buildRapier, RAPIER_BLADE_TIP } from '../src/weapons/models/rapierModel';
import { RAPIER_UNLOCK_TEXT } from '../src/weapons/defs/rapier';
import { Progression } from '../src/game/Progression';
import { FencerBoss, type FencerBossHost } from '../src/entities/FencerBoss';
import { BossFX } from '../src/effects/BossFX';
import { PlantAoeShape } from '../src/world/EcologicalGarden';
import { FENCER } from '../src/game/fencer/fencerRules';

const [R1, R2, R3] = PLAYER_COMBOS.RAPIER;
const DEF = getWeapon('RAPIER');
const REACH = DEF.stats.reach;

describe('玫瑰細劍：定義與上線', () => {
  it('與花劍客同步正式上線 (三種 dev 模式皆在武器槽)、只限校園、HEAVY 分級、FENCE 架勢', () => {
    expect(DEF.release).toBe('released');
    expect(isWeaponEnabled('RAPIER')).toBe(true);
    expect(WEAPONS.map((w) => w.id)).toContain('RAPIER');
    expect(DEF.worlds).toEqual({ CAMPUS: true, DETENTION: false });
    expect(DEF.impactClass).toBe('HEAVY');
    expect(DEF.readyPose).toBe('FENCE');
    expect(resolveVariant('RAPIER', 'CAMPUS').fx).toEqual({ R: 'RAPIER', L: 'RAPIER_GOLD' });
    expect(DEF.stats).toEqual({ damage: 30, reach: 3.0, knockback: 12 });
  });

  it('配色：玫瑰紅 + 金，與花劍客粉 / 洋紅 / 紫預警色不同；元素 PETAL', () => {
    const bossColors = [0xff4f8b, 0xff2a55, 0xff4fd8, 0xc04dff, 0xff5c8a];
    for (const k of ['RAPIER', 'RAPIER_GOLD'] as const) {
      const s = WEAPON_FX_STYLES[k];
      expect(s.element).toBe('PETAL');
      expect(bossColors).not.toContain(s.color);
    }
    expect(WEAPON_FX_STYLES.RAPIER.tail).toBe(WEAPON_FX_STYLES.RAPIER_GOLD.color); // 紅 → 金
    expect(WEAPON_FX_STYLES.RAPIER_GOLD.tail).toBe(WEAPON_FX_STYLES.RAPIER.color); // 金 → 紅
  });
});

describe('玫瑰細劍：招式與平衡', () => {
  it('名稱 / 時長 / 命中點 / 接續點', () => {
    expect([R1, R2, R3].map((m) => m.name)).toEqual(['含苞點刺', '薔薇三重奏', '謝幕禮・千瓣綻放']);
    expect([R1.dur, R2.dur, R3.dur]).toEqual([0.36, 0.6, 0.95]);
    expect([R1.cancel, R2.cancel, R3.cancel]).toEqual([0.68, 0.7, 0.64]);
    expect(R1.extraStrikes).toEqual([0.56]);
    expect(R2.extraStrikes).toEqual([0.38, 0.54]);
    expect(R3.extraStrikes).toEqual([0.3]);
    for (const m of [R1, R2, R3]) for (const t of m.extraStrikes) expect(t).toBeLessThan(m.cancel); // 每擊都在可接續點之前送出
    expect(R3.charge).toEqual([0.04, 0.22]);
    expect(R3.lunge).toEqual({ dist: 3.2, from: 0.22, to: 0.34 });
  });

  it('前兩段：單體窄錐 3.6m、每擊只扣血 (不穿刺、不位移)；終結技：LINE 自突進起點貫穿，只有主擊擊飛', () => {
    for (const m of [R1, R2]) {
      expect(m.aoe).toBeNull();
      expect(m.reach * REACH).toBeCloseTo(3.6);
      expect(m.arc).toBe(0.7);
      for (let i = 0; i <= m.extraStrikes.length; i++) {
        expect(strikeRoute(m, i)).toBe('SINGLE');
        expect(strikeHitMode(m, i, 0)).toBe('LIGHT');
      }
    }
    expect(R3.aoe).toMatchObject({ shape: 'LINE', fromDash: true, len: 1.0, max: 4 });
    expect(R3.fx).toBe('PIERCE');
    expect(strikeRoute(R3, 0)).toBe('AOE');
    expect(strikeHitMode(R3, 0, 0)).toBe('LAUNCH');
    expect(strikeRoute(R3, 1)).toBe('AOE_LIGHT');
    expect(strikeHitMode(R3, 1, 0)).toBe('LIGHT');
  });

  it('秒傷約 140 (總傷 178 ÷ 1.2728s)、裝備頁不顯示群攻 (只有終結技群攻)', () => {
    const s = getWeaponSummary('RAPIER', 'CAMPUS');
    expect(s.moves.map((m) => m.damage)).toEqual([46, 60, 72]);
    expect(s.totalDamage).toBe(178);
    expect(s.totalSeconds).toBeCloseTo(1.2728, 4);
    expect(Math.abs(s.dps - 140)).toBeLessThanOrEqual(1);
    expect(s.dps).toBeGreaterThan(getWeaponSummary('DUAL_RACKET', 'CAMPUS').dps);
    expect(s.dps).toBeLessThan(getWeaponSummary('SPECIAL_BAT', 'CAMPUS').dps);
    expect(s.groupDps).toBeNull();
  });

  it('擊飛約 6.0m (force 18、cap 12 / 6.5)，falloff 0.2 的次目標仍 6.0m', () => {
    const force = DEF.stats.knockback * R3.knock;
    expect(force).toBe(18);
    expect(launchDistance(force, DEF.launchCap!)).toBeCloseTo(6.0, 2);
    expect(launchDistance(force * (1 - R3.aoe!.falloff), DEF.launchCap!)).toBeCloseTo(6.0, 2);
  });

  it('收招僵直被擊退覆蓋 (最壞情況：追擊 16.5 m/s、攻擊距離 2.4m，+0.3 秒反應)', () => {
    const recovery = (R3.cancel - R3.strike) * R3.dur * DEF.tempo;
    const air = 2 * launchVertical(18, DEF.launchCap!.v) / LAUNCH_GRAVITY;
    const back = air + (0.6 + launchDistance(18, DEF.launchCap!) - 2.4) / 16.5; // 主目標貼身 0.6m (最壞)
    expect(recovery).toBeCloseTo(0.209, 3);
    expect(back).toBeGreaterThanOrEqual(recovery + 0.3);
  });

  it('終結技停格 / 震動取 aoe 覆寫 (高於 HEAVY 下限)', () => {
    const out = { hitStop: 0, shake: 0 };
    impactFeedback('HEAVY', true, false, false, 0, R3.aoe, false, out);
    expect(out).toEqual({ hitStop: 0.1, shake: 0.65 });
    impactFeedback('HEAVY', true, false, true, 0, R3.aoe, false, out);
    expect(out.hitStop).toBe(0.12);
    expect(out.hitStop).toBeGreaterThan(IMPACT_PROFILES.HEAVY.finisherHitStopMulti);
  });
});

describe('玫瑰細劍：LINE 自突進起點 (撞牆時跟著縮短)', () => {
  const out = [0, 0];
  it('fromDash 且已突進：起點 = 突進起點、長度 = 實際突進 + 3m', () => {
    expect(lineAoeSpan(true, true, 0, 0, 0, 3.2, 3, out)).toBeCloseTo(6.2);
    expect(out).toEqual([0, 0]);
    // 撞牆只衝了 1.1m
    expect(lineAoeSpan(true, true, 0, 0, 0, 1.1, 3, out)).toBeCloseTo(4.1);
  });
  it('尚未突進 / 非 fromDash：自目前位置起算', () => {
    expect(lineAoeSpan(true, false, 0, 0, 5, 5, 3, out)).toBe(3);
    expect(out).toEqual([5, 5]);
    expect(lineAoeSpan(false, true, 0, 0, 5, 5, 3, out)).toBe(3);
  });
  it('突進穿過的人 (起點與目前位置之間) 與劍尖前方都在範圍內，偏離半寬外不在', () => {
    const halfW = R3.aoe!.halfWidth! * REACH + 0.6; // + AOE_REACH_GRACE
    const len = lineAoeSpan(true, true, 0, 0, 0, 3.2, R3.aoe!.len! * REACH, out);
    const probe = new Float32Array(3);
    expect(probeLine(out[0], out[1], 0, 1, len, halfW, 0.3, 1.5, probe)).toBeGreaterThanOrEqual(0); // 穿過的人
    expect(probeLine(out[0], out[1], 0, 1, len, halfW, -0.2, 5.8, probe)).toBeGreaterThanOrEqual(0); // 劍尖前方
    expect(probeLine(out[0], out[1], 0, 1, len, halfW, 1.6, 4, probe)).toBe(-1);
  });
  it('花劍客：終結技 LINE (自突進起點) 打得到 Boss；偏離打不到', () => {
    const host: FencerBossHost = {
      playerPos: new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 5),
      playerVel: new THREE.Vector3(), playerDead: false, isTouch: false, playerOutOfCombat: false,
      damagePlayer: () => undefined, onBossDamaged: () => undefined, shake: () => undefined, hitStop: () => undefined
    } as FencerBossHost;
    const boss = new FencerBoss(host, new BossFX());
    boss.resetForFight(FENCER.CENTER_X, FENCER.CENTER_Z);
    boss.startFight(0);
    // 玩家自 Boss 前 6m 朝 -Z 突進 3.2m (停在 Boss 前 2.8m)，長條 = 3.2 + 3 = 6.2m
    const ox = FENCER.CENTER_X, oz = FENCER.CENTER_Z + 6;
    const len = lineAoeSpan(true, true, ox, oz, ox, oz - 3.2, R3.aoe!.len! * REACH, out);
    const hw = R3.aoe!.halfWidth! * REACH;
    const center = new THREE.Vector3(out[0], 0, out[1] - len / 2);
    expect(boss.tryHitAoe(center, len / 2 + hw, 57, new PlantAoeShape().set(1, out[0], out[1], 0, -1, 0, len, hw))?.applied).toBe(57);
    const missShape = new PlantAoeShape().set(1, out[0] + 2.5, out[1], 0, -1, 0, len, hw);
    expect(boss.tryHitAoe(new THREE.Vector3(out[0] + 2.5, 0, center.z), len / 2 + hw, 57, missShape)).toBeNull();
  });
});

describe('玫瑰細劍：模型 / 音效', () => {
  it('2 mesh (劍身 + 烘焙零件)、不投影；發光後 resetGlow 還原', () => {
    const h = buildRapier();
    const meshes: THREE.Mesh[] = [];
    h.parts.R!.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.length).toBe(2);
    for (const m of meshes) expect(m.castShadow).toBe(false);
    let tris = 0;
    for (const m of meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    expect(tris).toBeLessThan(400);
    const blade = meshes[0].material as THREE.MeshStandardMaterial;
    h.glow!(1, 2, 0xe8173a);
    expect(blade.emissiveIntensity).toBe(2);
    h.resetGlow();
    expect(blade.emissiveIntensity).toBe(0);
    expect(DEF.anchors.R!.tip).toBe(RAPIER_BLADE_TIP);
  });

  it('每刺細劍破空；打中疊刀刃命中；終結技主擊花瓣綻放、打中再疊低頻重擊', () => {
    const pos = { x: 0, y: 0, z: 0 };
    for (const f of Object.values(sfx)) f.mockClear();
    DEF.sounds.strike!(1, pos, false, 0, false);
    expect(sfx.playRapierThrust).toHaveBeenCalledTimes(1);
    expect(sfx.playBanditSlash).not.toHaveBeenCalled();
    DEF.sounds.strike!(0, pos, false, 1, true);
    expect(sfx.playBanditSlash).toHaveBeenCalledTimes(1);
    expect(sfx.playPetalBloom).not.toHaveBeenCalled();
    DEF.sounds.strike!(0, pos, true, 2, true);
    expect(sfx.playPetalBloom).toHaveBeenCalledTimes(1);
    expect(sfx.playFinisherThump).toHaveBeenCalledWith(pos, false);
  });
});

describe('玫瑰細劍：花劍客首勝解鎖', () => {
  function make() {
    const unlocked = new Set<string>();
    const state = { current: 'FIST' as string };
    const player = {
      isWeaponUnlocked: (id: string) => getWeapon(id as never).unlock === null || unlocked.has(id),
      setWeaponUnlocked(id: string, v: boolean) { if (v) unlocked.add(id); else unlocked.delete(id); },
      setWeapon(id: string) { state.current = id; return true; },
      get currentWeapon() { return state.current; }
    };
    const showBanner = vi.fn();
    const ctx = { player, wantedSystem: { showBanner }, currentWorldType: 'CAMPUS' } as never;
    return { progression: new Progression(ctx), unlocked, state, showBanner };
  }
  const steps = (p: Progression) => p.getWeaponEquipEntries().find((e) => e.id === 'RAPIER')!.unlockSteps;

  it('未首勝：裝備頁顯示「擊敗花劍客 0/1」與鎖定提示；當場打贏 → Boss 戰 / 過場中延後，結束後跳橫幅並自動裝備，之後不重複', () => {
    const t = make();
    t.progression.checkRapierUnlock(false);
    expect(t.unlocked.has('RAPIER')).toBe(false);
    expect(steps(t.progression)).toEqual([{ label: '擊敗花劍客', cur: 0, max: 1 }]);
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'RAPIER')!.hint).toContain('花劍客');

    t.progression.fencerDefeated = true; // FencerBossFight 首勝時設定
    t.progression.checkRapierUnlock(true); // 首勝過場中
    expect(t.unlocked.has('RAPIER')).toBe(false);
    t.progression.checkRapierUnlock(false); // 恢復校園
    expect(t.unlocked.has('RAPIER')).toBe(true);
    expect(t.state.current).toBe('RAPIER');
    expect(t.showBanner).toHaveBeenCalledWith(RAPIER_UNLOCK_TEXT, 7000);
    expect(sfx.playFanfare).toHaveBeenCalled();
    expect(steps(t.progression)).toEqual([{ label: '擊敗花劍客', cur: 1, max: 1 }]);
    t.showBanner.mockClear();
    t.progression.checkRapierUnlock(false);
    expect(t.showBanner).not.toHaveBeenCalled();
  });

  it('存檔相容：啟動時花劍客存檔已首勝 → 靜默解鎖 (不重播橫幅、不自動換武器)；舊存檔 / 無存檔 → 維持鎖定', () => {
    const t = make();
    t.progression.fencerDefeated = true; // 讀檔
    t.progression.checkRapierUnlock(false);
    expect(t.unlocked.has('RAPIER')).toBe(true);
    expect(t.state.current).toBe('FIST');
    expect(t.showBanner).not.toHaveBeenCalled();
    const fresh = make();
    fresh.progression.checkRapierUnlock(false);
    expect(fresh.unlocked.has('RAPIER')).toBe(false);
  });
});
