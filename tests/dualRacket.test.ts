import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects 於模組載入時會存取 window / document，以最小 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: { playPunch: vi.fn(), playBatHit: vi.fn(), playSpecialBatHit: vi.fn(), playBadmintonWhoosh: vi.fn(), playBadmintonHit: vi.fn() }
}));

import {
  KungFuLayer, PLAYER_COMBOS, StrikeTracker, lungeStep, probePath, strikeCanLaunch, strikeDmg, strikeFrac, strikeRoute, type KfMove
} from '../src/entities/shared/kungfu';
import { getWeapon, isWeaponAvailable, resolveVariant } from '../src/weapons/registry';
import { WEAPON_FX_STYLES } from '../src/effects/weaponFxStyle';

const [M1, M2, M3] = PLAYER_COMBOS.DUAL;
const DEF = getWeapon('DUAL_RACKET');
const TWO_PI = Math.PI * 2;

// 以固定幀長推進整招，回傳各擊的 (序號, 觸發時的圖層時間)
function runMove(move: KfMove, delta = 1 / 120) {
  const kf = new KungFuLayer();
  const tracker = new StrikeTracker();
  kf.start(move, DEF.tempo, new THREE.Object3D());
  const out: { index: number; time: number }[] = [];
  for (let f = 0; kf.move && f < 2000; f++) {
    const i = tracker.step(kf, delta);
    if (i >= 0) out.push({ index: i, time: kf.time });
  }
  return out;
}

// 單擊傷害 (CombatSystem：武器 ATK × 該擊倍率，四捨五入)
const strikeDamage = (move: KfMove, i: number) => Math.round(DEF.stats.damage * strikeDmg(move, i));

describe('雙燕羽刃：三段七擊時序', () => {
  it('每段名稱 / 時長 / 命中時間點 / 接續點', () => {
    expect([M1, M2, M3].map((m) => m.name)).toEqual(['二刀・快斬', '二刀・交叉斬', '鬼斬']);
    expect([M1, M2, M3].map((m) => m.dur)).toEqual([0.4, 0.44, 1.0]);
    expect([M1.strike, M2.strike, M3.strike]).toEqual([0.28, 0.42, 0.42]);
    expect([M1.extraStrikes, M2.extraStrikes, M3.extraStrikes]).toEqual([[0.55], [0.5], [0.26, 0.31]]);
    expect([M1.cancel, M2.cancel, M3.cancel]).toEqual([0.68, 0.64, 0.7]);
    expect(M1.extraStrikes.length + M2.extraStrikes.length + M3.extraStrikes.length + 3).toBe(7);
    // 整套接續節奏 (各段接續點秒數加總) 約 1.25s
    const chain = [M1, M2, M3].reduce((s, m) => s + m.cancel * m.dur, 0);
    expect(chain).toBeGreaterThan(1.15);
    expect(chain).toBeLessThan(1.35);
  });

  it('StrikeTracker 實跑：每段各擊恰好送出一次，依時間先後，時間點與設計一致', () => {
    for (const m of [M1, M2, M3]) {
      const hits = runMove(m);
      const expected = [0, ...m.extraStrikes.map((_, i) => i + 1)]
        .map((i) => ({ index: i, at: strikeFrac(m, i) * m.dur }))
        .sort((a, b) => a.at - b.at);
      expect(hits.map((h) => h.index)).toEqual(expected.map((e) => e.index));
      hits.forEach((h, k) => expect(h.time).toBeGreaterThanOrEqual(expected[k].at - 1e-6));
      hits.forEach((h, k) => expect(h.time - expected[k].at).toBeLessThan(1 / 120 + 1e-6));
    }
    // 第 3 段時間順序：0.26、0.31 為衝刺中途小擊 (序號 1、2)，0.42 為收刀主擊 (序號 0，延遲斬)
    expect(runMove(M3).map((h) => h.index)).toEqual([1, 2, 0]);
  });

  it('掉幀 (單幀 0.2s) 時七擊仍各結算一次', () => {
    for (const m of [M1, M2, M3]) {
      const kf = new KungFuLayer();
      const tracker = new StrikeTracker();
      kf.start(m, 1, new THREE.Object3D());
      const seen: number[] = [];
      for (let f = 0; f < 40; f++) {
        const i = tracker.step(kf, 0.2);
        if (i >= 0) seen.push(i);
      }
      expect(seen.sort()).toEqual([0, ...m.extraStrikes.map((_, i) => i + 1)].sort());
    }
  });

  it('第 3 段鬼斬：蓄力 0.2s → 突進 4.5m (0.15s) → 收刀背對敵人停 0.3s', () => {
    expect(M3.charge).toEqual([0.04, 0.2]);
    expect(M3.lunge).toEqual({ dist: 4.5, from: 0.2, to: 0.35 });
    expect((M3.lunge!.from - M3.charge![0]) * M3.dur).toBeCloseTo(0.16);
    expect((M3.lunge!.to - M3.lunge!.from) * M3.dur).toBeCloseTo(0.15);
    // 收刀停格：主擊 (0.42) 到下一個關鍵影格結束 (0.72) 約 0.3s
    expect((0.72 - M3.strike) * M3.dur).toBeCloseTo(0.3);
    let sum = 0;
    for (let t = 0; t < M3.dur; t += 1 / 60) sum += lungeStep(M3, M3.dur, t, t + 1 / 60);
    expect(sum).toBeCloseTo(4.5, 5);
    // 主擊 (收刀) 發生在突進結束之後；小擊都在突進區間內
    expect(M3.strike).toBeGreaterThan(M3.lunge!.to);
    for (const e of M3.extraStrikes) { expect(e).toBeGreaterThan(M3.lunge!.from); expect(e).toBeLessThan(M3.lunge!.to); }
    // 收刀關鍵影格 (0.42) 身體轉向背對 (tw = π)
    const i = [...Array(M3.count).keys()].find((k) => Math.abs(M3.keys[k * 18] - 0.42) < 1e-6)!;
    expect(M3.keys[i * 18 + 2]).toBeCloseTo(Math.PI);
    expect(M1.lunge).toBeNull();
    expect(M2.lunge).toBeNull();
    expect([M1.charge, M2.charge]).toEqual([null, null]);
  });

  it('雙色拖尾：每段右拍 W + 左拍 WL，區段落在 0..1 內', () => {
    expect([M1, M2, M3].map((m) => [m.trailLimb, m.trailLimb2])).toEqual([['W', 'WL'], ['W', 'WL'], ['W', 'WL']]);
    expect(M1.trail).toEqual([0.12, 0.4]);
    expect(M1.trail2).toEqual([0.38, 0.66]);
    expect(M2.trail).toEqual([0.26, 0.55]);
    expect(M2.trail2).toEqual([0.32, 0.62]);
    expect(M3.trail).toEqual([0.2, 0.56]);
    expect(M3.trail2).toEqual([0.2, 0.56]);
    expect(resolveVariant('DUAL_RACKET', 'CAMPUS').fx).toEqual({ R: 'DUAL_R', L: 'DUAL_L' });
    expect(WEAPON_FX_STYLES.DUAL_R.color).toBe(0x2ef2c8);
    expect(WEAPON_FX_STYLES.DUAL_L.color).toBe(0xff6fcf);
  });
});

describe('雙燕羽刃：傷害 / 結算分流 / 擊飛', () => {
  it('武器數值 25 / 2.6 / 10', () => {
    expect(DEF.stats).toEqual({ damage: 25, reach: 2.6, knockback: 10.0 });
  });

  it('各擊傷害：第 1、2 段 25×2、第 3 段 13 + 13 + 40，整套 166', () => {
    expect([0, 1].map((i) => strikeDamage(M1, i))).toEqual([25, 25]);
    expect([0, 1].map((i) => strikeDamage(M2, i))).toEqual([25, 25]);
    // 第 3 段：主擊 (序號 0) 1.6 倍、額外擊各 0.5 倍 (extraDmg 與 dmg 皆為直接倍率，不相乘)
    expect([0, 1, 2].map((i) => strikeDamage(M3, i))).toEqual([40, 13, 13]);
    let total = 0;
    for (const m of [M1, M2, M3]) for (let i = 0; i <= m.extraStrikes.length; i++) total += strikeDamage(m, i);
    expect(total).toBe(166);
  });

  it('結算分流：第 1、2 段單體；第 3 段主擊群攻、額外擊只扣血的群攻', () => {
    expect([0, 1].map((i) => strikeRoute(M1, i))).toEqual(['SINGLE', 'SINGLE']);
    expect([0, 1].map((i) => strikeRoute(M2, i))).toEqual(['SINGLE', 'SINGLE']);
    expect([0, 1, 2].map((i) => strikeRoute(M3, i))).toEqual(['AOE', 'AOE_LIGHT', 'AOE_LIGHT']);
  });

  it('只有終結技主擊可擊飛 (第 1、2 段含其所有擊皆不影響 NPC)', () => {
    for (const m of [M1, M2]) for (let i = 0; i <= m.extraStrikes.length; i++) expect(strikeCanLaunch(m, i)).toBe(false);
    expect([0, 1, 2].map((i) => strikeCanLaunch(M3, i))).toEqual([true, false, false]);
    expect([M1, M2, M3].map((m) => m.finisher)).toEqual([false, false, true]);
  });

  it('終結技擊飛速度被玩家上限壓在 10 / 7 以內 (NPC.launchFlying：水平 ≥ force×1.1、垂直 force×0.6 取上限)', () => {
    const force = DEF.stats.knockback * M3.knock;
    expect(Math.min(Math.max(force * 1.1, 3.0), 10)).toBe(10);
    expect(Math.min(Math.max(force * 0.6, 2.0), 7)).toBe(7);
    // 群攻擊退衰減只會更小，不會超過上限
    const edge = force * (1 - M3.aoe!.falloff);
    expect(Math.min(Math.max(edge * 1.1, 3.0), 10)).toBeLessThanOrEqual(10);
    expect(Math.min(Math.max(edge * 0.6, 2.0), 7)).toBeLessThanOrEqual(7);
  });

  it('終結技群攻參數 (PATH 路徑矩形、鏡頭 0.75、揮空 0.3、停格 0.12 / 0.14)，第 2 段命中震動 0.15', () => {
    expect(M3.aoe).toEqual({ shape: 'PATH', center: 'SELF', offset: 0, radius: 0.35, max: 6, falloff: 0.3, shake: 0.75, hitStop: 0.12, hitStopMulti: 0.14, missShake: 0.3 });
    // 半寬 = radius × 攻擊距離 ≈ 0.9m (整體寬約 1.8m)，上限 6 人
    expect(M3.aoe!.radius * DEF.stats.reach).toBeCloseTo(0.91);
    expect([M1.hitShake, M2.hitShake, M3.hitShake]).toEqual([0, 0.15, 0]);
    expect([M1.slashFx, M2.slashFx, M3.slashFx]).toEqual(['LINE', 'X', 'LINE']);
    expect(M3.fx).toBe('DASH');
  });
});

describe('雙燕羽刃：武器定義', () => {
  it('雙持、只限校園、不撐傘、持拍姿勢 DUAL', () => {
    expect(DEF.slot).toBe(4);
    expect(DEF.icon).toBe('🏸🏸');
    expect(DEF.model?.mount).toBe('BOTH');
    expect(DEF.suppressUmbrella).toBe(true);
    expect(DEF.readyPose).toBe('DUAL');
    expect(isWeaponAvailable(DEF, 'CAMPUS')).toBe(true);
    expect(isWeaponAvailable(DEF, 'DETENTION')).toBe(false);
    expect(DEF.anchors.R).toEqual(DEF.anchors.L);
  });
});

describe('突進路徑命中範圍 (aoe.shape PATH)', () => {
  const out = new Float32Array(3);
  const HALF = 0.9;

  it('probePath：路徑中段、起點外、終點外的距離與最近點', () => {
    expect(probePath(0, 0, 0, 4, 1, 2, out)).toBeCloseTo(1);
    expect([out[0], out[1], out[2]]).toEqual([0, 2, 0.5]);
    expect(probePath(0, 0, 0, 4, 0, -1, out)).toBeCloseTo(1);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
    expect(probePath(0, 0, 0, 4, 0, 6, out)).toBeCloseTo(2);
    expect([out[0], out[1], out[2]]).toEqual([0, 4, 1]);
  });

  it('路徑長度 0 (原地) 退化為圓形；斜向路徑沿線量距', () => {
    expect(probePath(1, 1, 1, 1, 1, 3, out)).toBeCloseTo(2);
    expect(probePath(0, 0, 3, 3, 3, 0, out)).toBeCloseTo(Math.SQRT2 * 1.5);
  });

  it('矩形範圍：路徑旁半寬內命中、半寬外不中，終點之後的敵人不中 (撞牆取較短路徑)', () => {
    // 完整突進 4.5m：路徑 z 0 → 4.5
    expect(probePath(0, 0, 0, 4.5, 0.8, 3, out)).toBeLessThanOrEqual(HALF);
    expect(probePath(0, 0, 0, 4.5, 1.3, 3, out)).toBeGreaterThan(HALF);
    expect(probePath(0, 0, 0, 4.5, 0, 6, out)).toBeGreaterThan(HALF);
    // 撞牆 1.5m 停下：原本在 3m 處的敵人落在路徑外
    expect(probePath(0, 0, 0, 1.5, 0, 3, out)).toBeGreaterThan(HALF);
    expect(probePath(0, 0, 0, 1.5, 0, 1.2, out)).toBeLessThanOrEqual(HALF);
  });
});

describe('既有招式群攻形狀不變', () => {
  it('SELF / FRONT 圓形群攻的 shape 未設 (沿用圓形)', () => {
    for (const [k, moves] of Object.entries(PLAYER_COMBOS)) {
      if (k === 'DUAL' || k === 'WHIP' || k === 'RAPIER') continue;
      for (const m of moves) if (m.aoe) expect(m.aoe.shape).toBeUndefined();
    }
    expect(PLAYER_COMBOS.BAT[2].aoe!.center).toBe('FRONT');
    expect(PLAYER_COMBOS.FIST[2].aoe!.center).toBe('SELF');
  });
});
