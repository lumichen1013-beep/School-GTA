import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects 於模組載入時會存取 window / document，以任意方法皆為空函式的 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => {} }) }));

import { PLAYER_COMBOS } from '../src/entities/shared/kungfu';
import { getWeaponSummary, rangedSeconds, RANGED_DISTANCES, summarizeCombo } from '../src/game/weaponStats';
import { getWeapon } from '../src/weapons/registry';
import { returnDuration, RETURN_SPEED } from '../src/weapons/projectiles/collide';
import {
  createProjectileSpawnOpts, PROJ_BALL, PROJ_MAX, PSTATE_DEAD, PSTATE_RETURN, ProjectileSystem,
  type ProjectileHost, type ProjectileTarget
} from '../src/weapons/projectiles/ProjectileSystem';
import { BallThrowController, PRE_INPUT_WINDOW } from '../src/weapons/basketball/BallThrowController';
import {
  AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, AIM_TOUCH_HALF_ANGLE, BALL_BOUNCE_FRAC, BALL_BOUNCE_SPEED, BALL_GRAVITY, BALL_RADIUS,
  pickAimTarget, solveLaunch, type LaunchVelocity
} from '../src/weapons/basketball/aim';
import { BASKETBALL_UNLOCK_GOAL } from '../src/weapons/defs/basketball';
import { buildBasketball } from '../src/weapons/models/basketballModel';
import { buildBallGeometry } from '../src/weapons/projectiles/ballGeometry';
import { BasketballGame } from '../src/systems/BasketballGame';
import { impactDust } from '../src/effects/ImpactDust';
import { comboFinisherFX } from '../src/effects/ComboFinisherFX';
import { SOUND_RANGE, soundGain } from '../src/audio/spatialAudio';
import type { DevWeaponsMode } from '../src/weapons/featureFlags';
import type { GameContext } from '../src/game/GameContext';

const DEF = getWeapon('BASKETBALL');
const [B1, B2, B3] = PLAYER_COMBOS.BALL;
const DT = 1 / 60;

describe('籃球：武器定義與招式', () => {
  it('數值：ATK 45 / 射程 18 / 擊退 9 / launchCap 9,5 / dev / 只限校園', () => {
    expect(DEF.release).toBe('dev');
    expect(DEF.stats).toEqual({ damage: 45, reach: 18, knockback: 9 });
    expect(DEF.launchCap).toEqual({ h: 9, v: 5 });
    expect(DEF.worlds).toEqual({ CAMPUS: true, DETENTION: false });
    expect(DEF.ranged).toMatchObject({ speed: 24, range: 18, catchDelay: 0.1, dpsDistance: 8 });
    expect(RETURN_SPEED).toBe(20);
    expect(DEF.chainWindow).toBe(0.8);
  });

  it('三招皆為發射型：projectile 欄位、終結技只有第 3 投', () => {
    expect([B1, B2, B3].map((m) => m.projectile)).toEqual(['BALL_CHEST', 'BALL_BOUNCE', 'BALL_LOB']);
    expect([B1, B2, B3].map((m) => m.name)).toEqual(['胸前推傳', '地板彈傳', '高拋灌籃']);
    expect([B1.finisher, B2.finisher, B3.finisher]).toEqual([false, false, true]);
    // 既有武器招式沒有 projectile
    for (const id of ['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET', 'BOOK_WHIP'] as const) {
      expect(getWeapon(id).combo.every((m) => m.projectile === null)).toBe(true);
    }
  });

  it('解鎖提示與進度步驟 (N/10)', () => {
    expect(BASKETBALL_UNLOCK_GOAL).toBe(10);
    expect(DEF.unlock?.lockedHint({ basketballMade: 4 } as never, 'CAMPUS')).toContain('4/10');
    expect(DEF.unlock?.lockedHint({ basketballMade: 4 } as never, 'DETENTION')).toBe('⚠️ 特訓院管制區：器材已遭沒收！');
    expect(DEF.unlock?.steps?.({ basketballMade: 4 } as never)).toEqual([{ label: '累計投進籃框', cur: 4, max: 10 }]);
    expect(DEF.unlock?.steps?.({ basketballMade: 99 } as never)).toEqual([{ label: '累計投進籃框', cur: 10, max: 10 }]);
  });

  it('音效：throwWhoosh 10m、ballHit 15m、ballCatch 8m', () => {
    expect(SOUND_RANGE.throwWhoosh).toBe(10);
    expect(SOUND_RANGE.ballHit).toBe(15);
    expect(SOUND_RANGE.ballCatch).toBe(8);
    expect(soundGain('ballCatch', 8)).toBe(0);
    expect(soundGain('ballHit', 14)).toBeGreaterThan(0);
  });

  it('模型：1 個 mesh、12×8 段球 168 三角形、帶頂點色縫線、不投影', () => {
    const h = buildBasketball();
    let meshes = 0;
    let tris = 0;
    h.parts.R!.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; expect(m.castShadow).toBe(false); }
    });
    expect(meshes).toBe(1);
    expect(tris).toBe(168);
    expect(h.parts.R!.visible).toBe(false);
    expect(buildBallGeometry().getAttribute('color')).toBeDefined();
  });
});

describe('籃球：瞄準 (O(n) 錐形選擇)', () => {
  const T = (x: number, z: number, extra: Partial<{ y: number; isKnockedDown: boolean; role: string }> = {}) =>
    ({ position: { x, y: extra.y ?? 0, z }, role: extra.role ?? 'STUDENT', isKnockedDown: extra.isKnockedDown ?? false, isPermanentlyKnockedOut: false });
  const deg = (d: number, r: number) => T(Math.sin(d * Math.PI / 180) * r, Math.cos(d * Math.PI / 180) * r);

  it('桌機 ±12°：取夾角最小者；12° 外、18m 外、倒地者不鎖', () => {
    const a = deg(10, 5), b = deg(3, 12), out1 = deg(14, 4), far = deg(0, 19), down = T(0, 3, { isKnockedDown: true });
    expect(pickAimTarget([a, b, out1, far, down], 0, 0, 0, 0, 1, AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, 'ANGLE')).toBe(b);
    expect(pickAimTarget([out1, far, down], 0, 0, 0, 0, 1, AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, 'ANGLE')).toBeNull();
    expect(pickAimTarget([], 0, 0, 0, 0, 1, AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, 'ANGLE')).toBeNull();
  });

  it('手機 ±30°、18m：取最近者 (不看夾角)；31° 外與背後不鎖', () => {
    const near = deg(28, 4), mid = deg(2, 9), out = deg(31, 2), behind = T(0, -3);
    expect(pickAimTarget([mid, near, out, behind], 0, 0, 0, 0, 1, AIM_TOUCH_HALF_ANGLE, AIM_MAX_RANGE, 'NEAREST')).toBe(near);
    expect(pickAimTarget([out, behind], 0, 0, 0, 0, 1, AIM_TOUCH_HALF_ANGLE, AIM_MAX_RANGE, 'NEAREST')).toBeNull();
  });

  it('貼身目標不檢查角度；不同樓層 (高度差 > 3m) 不鎖', () => {
    expect(pickAimTarget([T(0.2, -0.1)], 0, 0, 0, 0, 1, AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, 'ANGLE')).not.toBeNull();
    expect(pickAimTarget([T(0, 5, { y: 4 })], 0, 0, 0, 0, 1, AIM_TOUCH_HALF_ANGLE, AIM_MAX_RANGE, 'NEAREST')).toBeNull();
  });
});

describe('籃球：出手速度求解', () => {
  const v: LaunchVelocity = { h: 0, vy: 0 };
  // 以與 ProjectileSystem 相同的半隱式 Euler 積分 (小步長) 追蹤球經過水平距離 x 時的高度
  const heightAt = (h: number, vy0: number, y0: number, x: number) => {
    let px = 0, py = y0, vy = vy0;
    const dt = 1 / 2000;
    while (px < x) { vy -= BALL_GRAVITY * dt; px += h * dt; py += vy * dt; }
    return py;
  };

  it('胸前推傳：水平 24 m/s，球在目標距離處經過胸口高度', () => {
    for (const d of [3, 8, 14, 18]) {
      solveLaunch('BALL_CHEST', d, 1.25, 1.0, v);
      expect(v.h).toBe(24);
      expect(heightAt(v.h, v.vy, 1.25, d)).toBeCloseTo(1.0, 1);
    }
  });

  it('高拋灌籃：落在瞄準點、頂點明顯高於出手點 (近距離 > 2.5m)', () => {
    for (const d of [4, 8, 12, 18]) {
      solveLaunch('BALL_LOB', d, 1.9, 1.0, v);
      expect(heightAt(v.h, v.vy, 1.9, d)).toBeCloseTo(1.0, 1);
    }
    solveLaunch('BALL_LOB', 8, 1.9, 1.0, v);
    expect(1.9 + (v.vy * v.vy) / (2 * BALL_GRAVITY)).toBeGreaterThan(3.5);
    // 飛行時間 (到目標距離) 在 2 秒保險內
    for (const d of [4, 8, 12, 18]) {
      solveLaunch('BALL_LOB', d, 1.9, 1.0, v);
      expect(d / v.h).toBeLessThan(1.8);
    }
  });

  it('地板彈傳：水平 20 m/s，在目標距離 × 0.55 處觸地 (球心高度 = 半徑)', () => {
    for (const d of [4, 8, 14]) {
      solveLaunch('BALL_BOUNCE', d, 1.25, 1.0, v);
      expect(v.h).toBe(BALL_BOUNCE_SPEED);
      expect(heightAt(v.h, v.vy, 1.25, d * BALL_BOUNCE_FRAC)).toBeCloseTo(BALL_RADIUS, 1);
    }
  });
});

describe('籃球：秒傷 (遠程口徑)', () => {
  const s = getWeaponSummary('BASKETBALL', 'CAMPUS');
  it('單發期望傷害 ÷ (前搖 + 去程 + 回程 + 0.1s)：8m 約 45/s、15m 約 28/s、4m 較高', () => {
    expect(s.ranged).not.toBeNull();
    expect(s.ranged!.distances).toEqual([4, 8, 15]);
    const [d4, d8, d15] = s.ranged!.dpsAt;
    expect(Math.abs(d8 - 45)).toBeLessThanOrEqual(2);
    expect(Math.abs(d15 - 28)).toBeLessThanOrEqual(2);
    expect(d4).toBeGreaterThan(d8);
    expect(d8).toBeGreaterThan(d15);
    // 裝備頁標準秒傷 = 8m
    expect(s.ranged!.standardDistance).toBe(8);
    expect(s.dps).toBeCloseTo(d8, 9);
  });

  it('逐項驗算耗時與總傷 (45 + 45 + 54 = 144)', () => {
    expect(s.totalDamage).toBe(144);
    expect(s.moves.map((m) => m.damage)).toEqual([45, 45, 54]);
    const expected = [B1, B2, B3].reduce((sum, m) => sum + m.strike * m.dur + 8 / 24 + returnDuration(8) + 0.1, 0);
    expect(rangedSeconds(PLAYER_COMBOS.BALL, 1, DEF.ranged!, 8)).toBeCloseTo(expected, 9);
    expect(s.totalSeconds).toBeCloseTo(expected, 9);
    expect(s.groupDps).toBeNull();
  });

  it('近戰武器不受影響 (ranged 為 null，dps 沿用近戰算法)', () => {
    for (const id of ['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET', 'BOOK_WHIP'] as const) {
      expect(getWeaponSummary(id, 'CAMPUS').ranged).toBeNull();
    }
    const move = { name: 'x', dur: 1, strike: 0.5, cancel: 0.5, dmg: 1, extraStrikes: [], extraDmg: [], finisher: false, aoe: null } as never;
    expect(summarizeCombo([move], 25, 1).dps).toBeCloseTo(50, 9);
    expect(RANGED_DISTANCES).toEqual([4, 8, 15]);
  });
});

// ===== 狀態機 (真實 ProjectileSystem + mock host / ctx) =====
interface Target extends ProjectileTarget { position: THREE.Vector3; role: string; isKnockedDown: boolean; isPermanentlyKnockedOut: boolean; lastHitResult: 'BLOCKED' | 'HIT' | 'KO' }
function makeTarget(x: number, z: number, role = 'STUDENT'): Target {
  return { position: new THREE.Vector3(x, 0, z), role, isKnockedDown: false, isPermanentlyKnockedOut: false, lastHitResult: 'HIT' };
}
function wall(minX: number, minZ: number, maxX: number, maxZ: number) {
  return { min: new THREE.Vector3(minX, 0, minZ), max: new THREE.Vector3(maxX, 4, maxZ) };
}

function makeRig(targets: Target[] = [], colliders: ReturnType<typeof wall>[] = []) {
  const hits: { mode: string; damage: number; knockback: number; shoveDist: number; launchCap: unknown; serial: number }[] = [];
  const sounds: string[] = [];
  const state = { block: false, calls: { held: [] as boolean[], chain: 0 } };
  const host: ProjectileHost = {
    targets, colliders: colliders as never, cameraPosition: new THREE.Vector3(0, 5, -10),
    hitTarget: (t, spec) => {
      hits.push({ mode: spec.mode, damage: spec.damage, knockback: spec.knockback, shoveDist: spec.shoveDist, launchCap: spec.launchCap, serial: spec.serial });
      (t as Target).lastHitResult = state.block ? 'BLOCKED' : 'HIT';
      return !state.block;
    },
    hitGardenAt: () => null,
    requestHitStop: () => {},
    playSound: (id) => { sounds.push(id); },
    hitFlash: () => {},
    dust: () => {}
  };
  const projectiles = new ProjectileSystem(host);
  const scene = new THREE.Scene();
  const player = {
    position: new THREE.Vector3(0, 0, 0), rotationY: 0, currentWeapon: 'BASKETBALL', isHoldingRacket: false, isDead: false, isRidingVehicle: false,
    isAttacking: false, attackLock: false, moveSerial: 0, busy: false,
    get canAttack() { return !this.attackLock && !this.busy; },
    attack() { if (!this.canAttack) return false; this.isAttacking = true; this.moveSerial++; return true; },
    faceDirection(dx: number, dz: number) { this.rotationY = Math.atan2(dx, dz); },
    getHandPoint(out: THREE.Vector3) { return out.set(this.position.x, 1.15, this.position.z + 0.3); },
    setHeldWeaponHidden(h: boolean) { state.calls.held.push(h); },
    refreshChainWindow() { state.calls.chain++; }
  };
  const basketballGame = new BasketballGame(scene, new THREE.Vector3(30, 0, 30));
  const ctx = {
    currentWorldType: 'CAMPUS', currentRidingBike: null, player, projectiles, npcs: targets, basketballGame,
    cameraCtrl: { getForwardVector: () => new THREE.Vector3(0, 0, 1), camera: new THREE.PerspectiveCamera() },
    input: { isTouchDevice: false }, engine: { scene }
  } as unknown as GameContext;
  const ctrl = new BallThrowController(ctx);
  const step = (dt = DT) => { ctrl.update(dt); projectiles.update(dt); };
  const stepUntil = (cond: () => boolean, maxSeconds = 6) => {
    let t = 0;
    while (!cond() && t < maxSeconds) { step(); t += DT; }
    return t;
  };
  // 按攻擊 → 預備段結束 (球離手)
  const throwBall = (move = B1) => {
    expect(ctrl.handleAttack()).toBe(true);
    expect(ctrl.state).toBe('WINDUP');
    ctrl.launch(move);
  };
  const catches = () => { /* 事件由狀態回到 READY 判定 */ };
  return { ctrl, ctx, player, projectiles, hits, sounds, state, step, stepUntil, throwBall, catches, scene, basketballGame, targets };
}

describe('籃球狀態機：命中、落空、撞牆、被擋', () => {
  it('命中：第 1 投 SHOVE 1.2m、傷害 45、擊退 9、serial = 該招序號；球反彈後回到手上並解鎖攻擊', () => {
    const t = makeTarget(0, 8);
    const r = makeRig([t]);
    r.throwBall(B1);
    expect(r.ctrl.state).toBe('FLIGHT');
    expect(r.player.attackLock).toBe(true);
    expect(r.state.calls.held).toEqual([true]); // 手上的球隱藏
    expect(r.player.canAttack).toBe(false);     // 投出到接回之前不能攻擊
    r.stepUntil(() => r.hits.length > 0, 2);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ mode: 'SHOVE', damage: 45, knockback: 9, shoveDist: 1.2, launchCap: null, serial: r.player.moveSerial });
    r.stepUntil(() => r.ctrl.state === 'READY', 4);
    expect(r.ctrl.state).toBe('READY');
    expect(r.player.attackLock).toBe(false);
    expect(r.state.calls.held).toEqual([true, false]); // 接回後顯示
    expect(r.state.calls.chain).toBe(1);               // 連段窗自接球起算
    expect(r.projectiles.active).toBe(0);
    expect(r.sounds).toEqual(expect.arrayContaining(['throwWhoosh', 'ballHit', 'ballCatch']));
  });

  it('第 3 投：LAUNCH、傷害 54、launchCap {9,5}、命中點出小型衝擊環 (spinWave)；第 1、2 投不出', () => {
    const spin = vi.spyOn(comboFinisherFX, 'spinWave').mockImplementation(() => {});
    const t = makeTarget(0, 8);
    const r = makeRig([t]);
    r.throwBall(B3);
    r.stepUntil(() => r.hits.length > 0, 3);
    expect(r.hits[0]).toMatchObject({ mode: 'LAUNCH', damage: 54, knockback: 9, shoveDist: 0, launchCap: { h: 9, v: 5 } });
    expect(spin).toHaveBeenCalledTimes(1);
    r.stepUntil(() => r.ctrl.state === 'READY', 4);
    spin.mockClear();
    const r2 = makeRig([makeTarget(0, 8)]);
    r2.throwBall(B2);
    r2.stepUntil(() => r2.hits.length > 0, 3);
    expect(r2.hits[0]).toMatchObject({ mode: 'SHOVE', damage: 45 });
    expect(spin).not.toHaveBeenCalled();
    spin.mockRestore();
  });

  it('每發各一個 serial (一發只報一次通緝)；武器球不計入小遊戲投籃數', () => {
    const r = makeRig([makeTarget(0, 8)]);
    r.throwBall(B1);
    const s1 = r.player.moveSerial;
    r.stepUntil(() => r.ctrl.state === 'READY', 5);
    r.throwBall(B2);
    expect(r.player.moveSerial).toBe(s1 + 1);
    r.stepUntil(() => r.ctrl.state === 'READY', 5);
    expect(r.basketballGame.totalMade).toBe(0);
  });

  it('落空：彈地 (最多 2 次)後自動回收，約 2 秒內必回手', () => {
    const r = makeRig();
    r.throwBall(B1);
    const t = r.stepUntil(() => r.ctrl.state === 'READY', 6);
    expect(r.ctrl.state).toBe('READY');
    expect(t).toBeLessThan(3.2);
    expect(r.sounds.filter((s) => s === 'dribble').length).toBeGreaterThan(0);
    expect(r.hits).toHaveLength(0);
  });

  it('撞牆：牆面反射後回收', () => {
    const r = makeRig([], [wall(-3, 6, 3, 7)]);
    r.throwBall(B1);
    r.stepUntil(() => r.ctrl.state === 'READY', 6);
    expect(r.ctrl.state).toBe('READY');
    expect(r.sounds.filter((s) => s === 'dribble').length).toBeGreaterThan(0);
    expect(r.projectiles.active).toBe(0);
  });

  it('被擋 (BLOCKED)：直接回彈 (立即進入回收，不再停留反彈)，未算命中閃光 / 停格', () => {
    const t = makeTarget(0, 8);
    const r = makeRig([t]);
    r.state.block = true;
    r.throwBall(B1);
    const slot = r.ctrl.slot;
    r.stepUntil(() => r.hits.length > 0, 2);
    expect(r.hits).toHaveLength(1);
    expect(r.projectiles.state[slot]).toBe(PSTATE_RETURN);
    r.stepUntil(() => r.ctrl.state === 'READY', 4);
    expect(r.ctrl.state).toBe('READY');
    expect(r.hits).toHaveLength(1); // 回程不傷人
  });

  it('2 秒保險：飛行逾時強制進入回收 (重力 0 的慢速球於 2.0s 轉回收，隨後被接住)', () => {
    const r = makeRig();
    const op = { ...(r.ctrl as unknown as { opts: ReturnType<typeof createProjectileSpawnOpts>[] }).opts[0] };
    expect(op.maxLife).toBe(2);
    op.gravity = 0;
    const slot = r.projectiles.spawn(PROJ_BALL, new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 0, 1), op);
    let t = 0;
    while (r.projectiles.state[slot] !== PSTATE_RETURN && t < 3) { r.projectiles.update(DT); t += DT; }
    expect(t).toBeGreaterThanOrEqual(2 - DT);
    expect(t).toBeLessThan(2 + 2 * DT);
  });

  it('池滿：spawn 失敗時回到持球，不鎖攻擊', () => {
    const r = makeRig();
    const filler = createProjectileSpawnOpts(PROJ_BALL);
    filler.maxLife = 100;
    for (let i = 0; i < PROJ_MAX; i++) r.projectiles.spawn(PROJ_BALL, new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, 0, 0), filler);
    r.throwBall(B1);
    expect(r.ctrl.state).toBe('READY');
    expect(r.player.attackLock).toBe(false);
  });

  it('預備段被中斷 (閃身 / 受擊使出招取消)：回到持球、解除鎖定', () => {
    const r = makeRig();
    expect(r.ctrl.handleAttack()).toBe(true);
    expect(r.ctrl.state).toBe('WINDUP');
    expect(r.player.attackLock).toBe(true);
    r.player.isAttacking = false;
    r.step();
    expect(r.ctrl.state).toBe('READY');
    expect(r.player.attackLock).toBe(false);
  });
});

describe('籃球狀態機：取消與互斥', () => {
  it('換武器：飛行中的球立即消失並噴煙塵，手上的球恢復顯示', () => {
    const burst = vi.spyOn(impactDust, 'burst').mockImplementation(() => {});
    const r = makeRig();
    r.throwBall(B1);
    for (let i = 0; i < 5; i++) r.step();
    const slot = r.ctrl.slot;
    expect(r.projectiles.isAlive(slot)).toBe(true);
    r.player.currentWeapon = 'FIST';
    r.step();
    expect(r.projectiles.isAlive(slot)).toBe(false);
    expect(r.projectiles.active).toBe(0);
    expect(r.ctrl.state).toBe('READY');
    expect(r.player.attackLock).toBe(false);
    expect(burst).toHaveBeenCalledTimes(1);
    burst.mockRestore();
  });

  it('死亡 / 上車 / 換世界 (cancel)：球消失 + 煙塵；死亡與非校園時不可投', () => {
    const burst = vi.spyOn(impactDust, 'burst').mockImplementation(() => {});
    for (const act of ['dead', 'ride', 'world'] as const) {
      const r = makeRig();
      r.throwBall(B1);
      r.step();
      if (act === 'dead') r.player.isDead = true;
      else if (act === 'ride') (r.ctx as { currentRidingBike: unknown }).currentRidingBike = {};
      else (r.ctx as { currentWorldType: string }).currentWorldType = 'DETENTION';
      r.step();
      expect(r.projectiles.active).toBe(0);
      expect(r.ctrl.state).toBe('READY');
      expect(r.ctrl.handleAttack()).toBe(false);
    }
    expect(burst).toHaveBeenCalledTimes(3);
    // 顯式 cancel (CombatSystem.resetTransientState / mountBike / 死亡流程呼叫)
    const r = makeRig();
    r.throwBall(B1);
    r.ctrl.cancel();
    expect(r.projectiles.active).toBe(0);
    expect(r.player.attackLock).toBe(false);
    expect(burst).toHaveBeenCalledTimes(4);
    r.ctrl.cancel(); // 冪等：無球不再噴煙塵
    expect(burst).toHaveBeenCalledTimes(4);
    burst.mockRestore();
  });

  it('手持小遊戲籃球：武器球不接管攻擊鍵 (由小遊戲投籃優先)；飛行中拿起則武器球消失', () => {
    const burst = vi.spyOn(impactDust, 'burst').mockImplementation(() => {});
    const r = makeRig();
    r.basketballGame.isHolding = true;
    expect(r.ctrl.handleAttack()).toBe(false);
    expect(r.ctrl.state).toBe('READY');
    r.basketballGame.isHolding = false;
    r.throwBall(B1);
    r.step();
    r.basketballGame.isHolding = true;
    r.step();
    expect(r.projectiles.active).toBe(0);
    expect(burst).toHaveBeenCalledTimes(1);
    burst.mockRestore();
  });

  it('飛行中連按攻擊只進緩衝，不會再出招', () => {
    const r = makeRig();
    r.throwBall(B1);
    const serial = r.player.moveSerial;
    r.step();
    expect(r.ctrl.handleAttack()).toBe(true);
    expect(r.ctrl.buffer).toBe(PRE_INPUT_WINDOW);
    expect(r.player.moveSerial).toBe(serial);
    expect(r.ctrl.state).toBe('FLIGHT');
  });
});

describe('籃球狀態機：預輸入 0.25 秒', () => {
  it('接球前 0.25 秒內按攻擊：接到球後自動投出下一球', () => {
    const r = makeRig();
    r.throwBall(B1);
    // 回收中且距手部 < 2m (約接球前 0.1 秒) 時按攻擊
    r.stepUntil(() => r.projectiles.state[r.ctrl.slot] === PSTATE_RETURN && r.projectiles.getPosition(r.ctrl.slot, new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 1.15, 0.3)) < 2, 4);
    expect(r.ctrl.state).toBe('FLIGHT');
    expect(r.ctrl.handleAttack()).toBe(true);
    const serial = r.player.moveSerial;
    r.stepUntil(() => r.ctrl.state !== 'FLIGHT', 1);
    expect(r.ctrl.state).toBe('READY');
    r.step(); // 下一幀自動接投
    expect(r.ctrl.state).toBe('WINDUP');
    expect(r.player.moveSerial).toBe(serial + 1);
    expect(r.state.calls.chain).toBe(1);
  });

  it('飛行初期就按 (早於接球 0.25 秒以上)：緩衝過期，接球後不自動投', () => {
    const r = makeRig();
    r.throwBall(B1);
    r.step();
    r.ctrl.handleAttack();
    r.stepUntil(() => r.ctrl.state === 'READY', 5);
    expect(r.ctrl.state).toBe('READY');
    r.step();
    expect(r.ctrl.state).toBe('READY');
    expect(r.ctrl.buffer).toBeLessThanOrEqual(0);
  });

  it('持球但仍在收招 (canAttack = false) 時按攻擊進緩衝，可出招後自動投出', () => {
    const r = makeRig();
    r.player.busy = true;
    expect(r.ctrl.handleAttack()).toBe(true);
    expect(r.ctrl.state).toBe('READY');
    r.step();
    expect(r.ctrl.state).toBe('READY');
    r.player.busy = false;
    r.step();
    expect(r.ctrl.state).toBe('WINDUP');
  });
});

describe('籃球：手機自動鎖定準星', () => {
  it('手機待命時顯示 DOM 準星 (id ballLockReticle)，鎖定目標出界或出手後隱藏；桌機不建立', () => {
    const els: Record<string, { style: Record<string, string>; id?: string; className?: string }> = {};
    const doc = { createElement: () => ({ style: {} as Record<string, string> }), body: { appendChild: (e: { id: string; style: Record<string, string> }) => { els[e.id] = e as never; } } };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { innerWidth: 800, innerHeight: 400 });
    try {
      const t = makeTarget(2, 8);
      const r = makeRig([t]);
      (r.ctx.input as { isTouchDevice: boolean }).isTouchDevice = true;
      // 鏡頭看向 +Z：置於玩家身後
      const cam = r.ctx.cameraCtrl.camera;
      cam.position.set(0, 3, -6);
      cam.lookAt(0, 1, 8);
      cam.updateMatrixWorld();
      r.step();
      expect(els.ballLockReticle).toBeDefined();
      expect(els.ballLockReticle.style.display).toBe('block');
      expect(els.ballLockReticle.style.transform).toMatch(/^translate\(/);
      // 出手後隱藏
      r.throwBall(B1);
      r.step();
      expect(els.ballLockReticle.style.display).toBe('none');
      // 目標超出 18m：隱藏
      r.stepUntil(() => r.ctrl.state === 'READY', 5);
      t.position.set(0, 0, 25);
      r.step();
      expect(els.ballLockReticle.style.display).toBe('none');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('手機出手方向對準鎖定目標 (±30° 內最近者)，桌機無目標時沿鏡頭前方', () => {
    // 目標在右前 25°、8m；鏡頭看 +Z
    const t = makeTarget(Math.sin(25 * Math.PI / 180) * 8, Math.cos(25 * Math.PI / 180) * 8);
    const r = makeRig([t]);
    (r.ctx.input as { isTouchDevice: boolean }).isTouchDevice = true;
    r.throwBall(B1);
    expect(r.player.rotationY).toBeCloseTo(25 * Math.PI / 180, 4);
    r.stepUntil(() => r.hits.length > 0, 2);
    expect(r.hits).toHaveLength(1); // 彈道實際打中被鎖定的目標

    const d = makeRig([makeTarget(Math.sin(25 * Math.PI / 180) * 8, Math.cos(25 * Math.PI / 180) * 8)]);
    d.throwBall(B1); // 桌機 ±12°：25° 不鎖，直射鏡頭前方
    expect(d.player.rotationY).toBeCloseTo(0, 4);
    d.stepUntil(() => d.ctrl.state === 'READY', 5);
    expect(d.hits).toHaveLength(0);
  });
});

describe('籃球：解鎖與小遊戲計數', () => {
  async function makeCampus(mode: DevWeaponsMode, totalMade: number) {
    vi.resetModules();
    const flags = await import('../src/weapons/featureFlags');
    flags.__setDevWeaponsMode(mode);
    const registry = await import('../src/weapons/registry');
    const { Progression } = await import('../src/game/Progression');
    const { CampusMode } = await import('../src/game/CampusMode');
    const unlocked = new Set<string>();
    const state = { current: 'FIST' as string };
    const player = {
      position: { x: 0, y: 0, z: 0 }, hasNormalBat: false, hasSpecialBat: false,
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
    const basketballGame = { scoreStreak: 0, bestStreak: 0, totalMade };
    const ctx = {
      player, wantedSystem: { showBanner }, currentWorldType: 'CAMPUS', racingGame: { bestSwimTime: null, bestTrackTime: null },
      ecologicalGarden: { boss: { isDead: false } }, tennisGame: { coachDefeated: false }, basketballGame, peCoachNpc: null, hud: { updateMissionTracker: vi.fn() }
    } as never;
    const progression = new Progression(ctx);
    (ctx as unknown as { progression: unknown }).progression = progression;
    return { campus: new CampusMode(ctx), progression, showBanner, state, unlocked, basketballGame, registry };
  }
  const BANNER = '🏀 累計投進 10 球！解鎖【籃球】(滾輪或大地圖【裝備】切換)';

  it('locked：9 球不解鎖；達 10 球跳橫幅解鎖但不自動裝備，之後不重複；basketballMade 與裝備頁進度接上 totalMade', async () => {
    const t = await makeCampus('locked', 9);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.progression.basketballMade).toBe(9);
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'BASKETBALL')!.unlockSteps).toEqual([{ label: '累計投進籃框', cur: 9, max: 10 }]);

    t.basketballGame.totalMade = 10;
    t.campus.updateMissionTracker();
    expect(t.showBanner).toHaveBeenCalledWith(BANNER, 7000);
    expect(t.unlocked.has('BASKETBALL')).toBe(true);
    expect(t.state.current).toBe('FIST'); // 不自動裝備
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'BASKETBALL')!.unlockSteps).toEqual([{ label: '累計投進籃框', cur: 10, max: 10 }]);

    t.showBanner.mockClear();
    t.basketballGame.totalMade = 11;
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.progression.equipById('BASKETBALL')).toBe(true);
    expect(t.state.current).toBe('BASKETBALL');
  });

  it('off：累計再多也不觸發 (無橫幅、無旗標)，武器不在武器槽', async () => {
    const t = await makeCampus('off', 50);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.unlocked.has('BASKETBALL')).toBe(false);
    expect(t.registry.WEAPONS.map((w) => w.id)).not.toContain('BASKETBALL');
  });

  it('unlocked：視為已解鎖，不跳橫幅', async () => {
    const t = await makeCampus('unlocked', 50);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.state.current).toBe('FIST');
  });

  it('BasketballGame：PERFECT / GOOD 入網各 +1 totalMade，打鐵不計', () => {
    const game = new BasketballGame(new THREE.Scene(), new THREE.Vector3(30, 0, 30));
    const hoop = new THREE.Vector3(0, 3, 0);
    const player = { position: new THREE.Vector3(), stamina: 0, maxStamina: 100 };
    const wanted = { showBanner: vi.fn() };
    const run = (quality: 'PERFECT' | 'GOOD' | 'BAD') => {
      const g = game as unknown as Record<string, unknown>;
      g.isHolding = false;
      g.isBallInAir = true;
      g.hasScoredThisShot = false;
      g.targetShotQuality = quality;
      (g.ballVelocity as THREE.Vector3).set(0, -2, 0);
      game.basketballMesh.position.set(0, 3.2, 0);
      game.update(0.016, player as never, {} as never, {} as never, wanted as never, [hoop], [], new THREE.PerspectiveCamera());
    };
    run('PERFECT');
    expect(game.totalMade).toBe(1);
    run('GOOD');
    expect(game.totalMade).toBe(2);
    run('BAD');
    expect(game.totalMade).toBe(2);
    expect(game.scoreStreak).toBe(0);
    expect(game.bestStreak).toBe(2);
  });
});

describe('籃球：CombatSystem 接點', () => {
  async function makeCombat(over: Record<string, unknown>) {
    const { CombatSystem } = await import('../src/game/CombatSystem');
    const ballThrow = { handleAttack: vi.fn(() => true), launch: vi.fn(), cancel: vi.fn() };
    const startCharging = vi.fn();
    const ctx = {
      currentWorldType: 'CAMPUS', currentRidingBike: null, ballThrow,
      player: { isDead: false, hp: 100, canAttack: true, attack: vi.fn(), strikeMove: null, strikeIndex: 0, cancelAttack: vi.fn() },
      basketballGame: { isHolding: false, startCharging }, hud: {}, projectiles: { reset: vi.fn() },
      detention: { nearbyCqcTarget: null },
      ...over
    } as never;
    return { combat: new CombatSystem(ctx), ballThrow, startCharging, ctx: ctx as unknown as { player: { attack: ReturnType<typeof vi.fn>; strikeMove: unknown }; projectiles: { reset: ReturnType<typeof vi.fn> } } };
  }

  it('手持小遊戲籃球時 onAttack 優先處理投籃，武器球不接管', async () => {
    const t = await makeCombat({ basketballGame: { isHolding: true, startCharging: vi.fn() } });
    t.combat.onAttack();
    expect((t.ctx as never as { basketballGame: { startCharging: ReturnType<typeof vi.fn> } }).basketballGame.startCharging).toHaveBeenCalledTimes(1);
    expect(t.ballThrow.handleAttack).not.toHaveBeenCalled();
    expect(t.ctx.player.attack).not.toHaveBeenCalled();
  });

  it('持武器球時 onAttack 由籃球狀態機接管 (不走近戰 player.attack)', async () => {
    const t = await makeCombat({});
    t.combat.onAttack();
    expect(t.ballThrow.handleAttack).toHaveBeenCalledTimes(1);
    expect(t.ctx.player.attack).not.toHaveBeenCalled();
  });

  it('發射型招式命中時間點：resolvePlayerHit 改呼叫 launch，不做近戰判定 (不碰生態園 / NPC 名單)', async () => {
    const t = await makeCombat({});
    t.ctx.player.strikeMove = B1;
    t.combat.updatePlayerStrike();
    expect(t.ballThrow.launch).toHaveBeenCalledWith(B1);
  });

  it('換世界重置：先取消籃球 (煙塵)，再清空投射物', async () => {
    const t = await makeCombat({});
    const order: string[] = [];
    t.ballThrow.cancel.mockImplementation(() => { order.push('cancel'); });
    t.ctx.projectiles.reset.mockImplementation(() => { order.push('reset'); });
    t.combat.resetTransientState();
    expect(order).toEqual(['cancel', 'reset']);
  });
});
