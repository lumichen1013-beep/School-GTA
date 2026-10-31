import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects 於模組載入時會存取 window / document，以任意方法皆為空函式的 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => {} }) }));

import { PLAYER_COMBOS } from '../src/entities/shared/kungfu';
import { getWeaponSummary, rangedSeconds, RANGED_DISTANCES, summarizeCombo } from '../src/game/weaponStats';
import { getWeapon } from '../src/weapons/registry';
import { returnDuration, RETURN_SPEED } from '../src/weapons/projectiles/collide';
import {
  createProjectileSpawnOpts, PFLAG_RETURN, PFLAG_TRACER, PFLAG_TRACER_RETURN, PROJ_BALL, PROJ_MAX, PSTATE_RETURN, ProjectileSystem,
  type ProjectileHost, type ProjectileTarget
} from '../src/weapons/projectiles/ProjectileSystem';
import { BallThrowController, PRE_INPUT_WINDOW } from '../src/weapons/basketball/BallThrowController';
import {
  AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, AIM_TOUCH_HALF_ANGLE, BALL_KI_GRAVITY, BALL_SPEED,
  pickAimTarget, solveLaunch, type LaunchVelocity
} from '../src/weapons/basketball/aim';
import {
  BASKETBALL_BLAST_DMG, BASKETBALL_BLAST_MAX, BASKETBALL_BLAST_RADIUS, BASKETBALL_BLAST_SHOVE, BASKETBALL_UNLOCK_GOAL
} from '../src/weapons/defs/basketball';
import { launchDistance } from '../src/weapons/launch';
import { tracerFX, TRACER_KI, TRACER_LINE } from '../src/effects/TracerFX';
import { FX_PRESETS, setFxTier } from '../src/effects/fxQuality';
import { buildBasketball } from '../src/weapons/models/basketballModel';
import { buildBallGeometry } from '../src/weapons/projectiles/ballGeometry';
import { BasketballGame } from '../src/systems/BasketballGame';
import { impactDust } from '../src/effects/ImpactDust';
import { comboFinisherFX } from '../src/effects/ComboFinisherFX';
import { SOUND_RANGE, soundGain } from '../src/audio/spatialAudio';
import type { GameContext } from '../src/game/GameContext';

const DEF = getWeapon('BASKETBALL');
const [B1, B2, B3] = PLAYER_COMBOS.BALL;
const DT = 1 / 60;

describe('籃球：武器定義與招式', () => {
  it('數值：ATK 45 / 射程 18 / 擊退 11 / launchCap 11.5,6.2 (擊飛約 5.5m) / 光束 60 m/s / 只限校園', () => {
    expect(DEF.stats).toEqual({ damage: 45, reach: 18, knockback: 11 });
    expect(DEF.launchCap).toEqual({ h: 11.5, v: 6.2 });
    // 終結段擊飛距離介於拳 (4m) / 雙拍 (5m) / 棒 (5.4m) 與黃金棒 (7m) 之間
    const fly = launchDistance(DEF.stats.knockback * B3.knock, DEF.launchCap!);
    expect(fly).toBeGreaterThan(5.3);
    expect(fly).toBeLessThan(6);
    expect(DEF.worlds).toEqual({ CAMPUS: true, DETENTION: false });
    expect(DEF.ranged).toMatchObject({ speed: 60, range: 18, catchDelay: 0.06, dpsDistance: 8 });
    expect(BALL_SPEED).toBe(DEF.ranged!.speed);
    expect(RETURN_SPEED).toBe(60);
    expect(DEF.chainWindow).toBe(0.8);
  });

  it('節奏：第 1、2 投前搖約 0.1 秒、可取消 0.38 秒；終結段聚氣 0.28 秒、可取消 0.50 秒 (出手後僵直 0.22 秒)', () => {
    for (const m of [B1, B2]) {
      expect(m.strike * m.dur).toBeCloseTo(0.105, 3);
      expect(m.cancel * m.dur).toBeCloseTo(0.378, 3);
    }
    expect(B3.strike * B3.dur).toBeCloseTo(0.279, 3);
    expect(B3.cancel * B3.dur).toBeCloseTo(0.496, 3);
    expect(B3.strike * B3.dur).toBeGreaterThan(B1.strike * B1.dur * 2); // 終結段聚氣明顯較長
  });

  it('大招僵直與擊退：敵人 (追擊 10 m/s) 回到攻擊距離所需時間 ≥ 出手後僵直 + 0.3 秒反應', () => {
    const recovery = (B3.cancel - B3.strike) * B3.dur; // 出手後到可取消 (可移動 / 閃身)
    expect(recovery).toBeCloseTo(0.217, 3);
    const chase = 10;
    // 主目標：擊飛約 5.5m (另有滯空與倒地時間，未計入)
    expect(launchDistance(DEF.stats.knockback * B3.knock, DEF.launchCap!) / chase).toBeGreaterThanOrEqual(recovery + 0.3);
    // 爆風波及者：踉蹌 0.3 秒 (打斷出招) + 推開 2.5m 跑回
    expect(0.3 + BASKETBALL_BLAST_SHOVE / chase).toBeGreaterThanOrEqual(recovery + 0.3);
  });

  it('三招皆為發射型：projectile 欄位、終結技只有第 3 投', () => {
    expect([B1, B2, B3].map((m) => m.projectile)).toEqual(['BALL_CHEST', 'BALL_SNAP', 'BALL_BLAST']);
    expect([B1, B2, B3].map((m) => m.name)).toEqual(['氣勁推傳', '迴旋快傳', '灌籃氣功砲']);
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

  it('音效：出手 kiShot 12m、命中 kiImpact 18m、接球 ballCatch 8m', () => {
    expect(SOUND_RANGE.kiShot).toBe(12);
    expect(SOUND_RANGE.kiImpact).toBe(18);
    expect(SOUND_RANGE.ballCatch).toBe(8);
    expect(soundGain('ballCatch', 8)).toBe(0);
    expect(soundGain('kiImpact', 17)).toBeGreaterThan(0);
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

describe('籃球：出手速度求解 (無重力直線光束)', () => {
  const v: LaunchVelocity = { h: 0, vy: 0 };
  it('三投皆水平 60 m/s、直線穿過瞄準點；18m 飛行 0.3 秒', () => {
    expect(BALL_KI_GRAVITY).toBe(0);
    for (const kind of ['BALL_CHEST', 'BALL_SNAP', 'BALL_BLAST'] as const) {
      for (const d of [3, 8, 14, 18]) {
        solveLaunch(kind, d, 1.25, 0.5, v);
        expect(v.h).toBe(60);
        expect(1.25 + v.vy * (d / v.h)).toBeCloseTo(0.5, 6);
      }
    }
    expect(AIM_MAX_RANGE / BALL_SPEED).toBeCloseTo(0.3, 6);
  });
});

describe('籃球：秒傷 (遠程口徑)', () => {
  const s = getWeaponSummary('BASKETBALL', 'CAMPUS');
  it('8m 標準秒傷約 114 (改版前 44)：介於普通棒 88 與雙拍 132 / 黃金棒 150 之間；4m 約 132、15m 約 77', () => {
    expect(s.ranged).not.toBeNull();
    expect(s.ranged!.distances).toEqual([4, 8, 15]);
    const [d4, d8, d15] = s.ranged!.dpsAt;
    expect(d8).toBeGreaterThanOrEqual(110);
    expect(d8).toBeLessThanOrEqual(120);
    expect(Math.abs(d4 - 132)).toBeLessThanOrEqual(2);
    expect(Math.abs(d15 - 77)).toBeLessThanOrEqual(2);
    expect(d8).toBeGreaterThan(getWeaponSummary('NORMAL_BAT', 'CAMPUS').dps);
    expect(d4).toBeLessThan(getWeaponSummary('DUAL_RACKET', 'CAMPUS').dps);
    expect(d4).toBeLessThan(getWeaponSummary('SPECIAL_BAT', 'CAMPUS').dps);
    expect(s.ranged!.standardDistance).toBe(8);
    expect(s.dps).toBeCloseTo(d8, 9);
  });

  it('逐項驗算：每投耗時 = max(可取消點, 前搖 + 去程 + 回程 + 0.06s)，總傷 45 + 45 + 77 = 167', () => {
    expect(s.totalDamage).toBe(167);
    expect(s.moves.map((m) => m.damage)).toEqual([45, 45, 77]);
    const per = (m: typeof B1, d: number) => Math.max(m.cancel * m.dur, m.strike * m.dur + d / 60 + returnDuration(d) + 0.06);
    const expected = [B1, B2, B3].reduce((sum, m) => sum + per(m, 8), 0);
    expect(rangedSeconds(PLAYER_COMBOS.BALL, 1, DEF.ranged!, 8)).toBeCloseTo(expected, 9);
    expect(s.totalSeconds).toBeCloseTo(expected, 9);
    // 近距離 (4m) 第 1、2 投由可取消點決定節奏
    expect(per(B1, 4)).toBeCloseTo(B1.cancel * B1.dur, 9);
    expect(rangedSeconds(PLAYER_COMBOS.BALL, 1, DEF.ranged!, 4)).toBeCloseTo(per(B1, 4) * 2 + per(B3, 4), 9);
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
  const blastHits: { target: unknown; mode: string; dmgMul: number; shoveDist: number; serial: number; dirX: number; dirZ: number }[] = [];
  const combat = {
    applyPlayerHitToNpc: (t: unknown, spec: { mode: string; dmgMul: number; shoveDist: number; serial: number; dir: THREE.Vector3 }) => {
      blastHits.push({ target: t, mode: spec.mode, dmgMul: spec.dmgMul, shoveDist: spec.shoveDist, serial: spec.serial, dirX: spec.dir.x, dirZ: spec.dir.z });
      return true;
    }
  };
  const stops: number[] = [];
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
    requestHitStop: (sec) => { stops.push(sec); },
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
    input: { isTouchDevice: false }, engine: { scene }, combat
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
  return { ctrl, ctx, player, projectiles, hits, blastHits, stops, sounds, state, step, stepUntil, throwBall, catches, scene, basketballGame, targets };
}

describe('籃球狀態機：命中、落空、撞牆、被擋', () => {
  it('命中：第 1 投只扣血不位移 (LIGHT)、傷害 45、serial = 該招序號；化光極速收回 (8m 來回 < 0.35 秒) 並解鎖攻擊', () => {
    const spin = vi.spyOn(comboFinisherFX, 'spinWave').mockImplementation(() => {});
    const t = makeTarget(0, 8);
    const r = makeRig([t]);
    r.throwBall(B1);
    expect(r.ctrl.state).toBe('FLIGHT');
    expect(r.player.attackLock).toBe(true);
    expect(r.state.calls.held).toEqual([true]); // 手上的球隱藏
    expect(r.player.canAttack).toBe(false);     // 投出到接回之前不能攻擊
    const tHit = r.stepUntil(() => r.hits.length > 0, 2);
    expect(tHit).toBeLessThan(0.15);            // 7.5m / 60 m/s
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ mode: 'LIGHT', damage: 45, knockback: 11, shoveDist: 0, launchCap: null, serial: r.player.moveSerial });
    expect(spin).toHaveBeenCalledTimes(1);      // 命中衝擊環
    expect(r.stops).toEqual([0.045]);           // 第 1 段停格 = impactClass MEDIUM 讀表
    const tBack = r.stepUntil(() => r.ctrl.state === 'READY', 4);
    expect(tHit + tBack).toBeLessThan(0.35);
    expect(r.player.attackLock).toBe(false);
    expect(r.state.calls.held).toEqual([true, false]); // 接回後顯示
    expect(r.state.calls.chain).toBe(1);               // 連段窗自接球起算
    expect(r.projectiles.active).toBe(0);
    expect(r.hits).toHaveLength(1);                    // 每發只結算一次 (回程不傷人)
    expect(r.blastHits).toHaveLength(0);
    expect(r.sounds).toEqual(expect.arrayContaining(['kiShot', 'kiImpact', 'ballCatch']));
    spin.mockRestore();
  });

  it('第 3 投：LAUNCH、傷害 76.5 (×1.7)、launchCap {11.5,6.2}、長停格；出手聚氣環 + 命中衝擊環 + 爆風地面環', () => {
    const spin = vi.spyOn(comboFinisherFX, 'spinWave').mockImplementation(() => {});
    const t = makeTarget(0, 8);
    const r = makeRig([t]);
    r.throwBall(B3);
    expect(spin).toHaveBeenCalledTimes(1); // 出手聚氣環
    r.stepUntil(() => r.hits.length > 0, 3);
    expect(r.hits[0]).toMatchObject({ mode: 'LAUNCH', damage: 76.5, knockback: 11, shoveDist: 0, launchCap: { h: 11.5, v: 6.2 } });
    expect(spin).toHaveBeenCalledTimes(3);
    expect(r.stops).toEqual([0.09]);
    r.stepUntil(() => r.ctrl.state === 'READY', 4);
    spin.mockClear();
    const r2 = makeRig([makeTarget(0, 8)]);
    r2.throwBall(B2);
    r2.stepUntil(() => r2.hits.length > 0, 3);
    expect(r2.hits[0]).toMatchObject({ mode: 'LIGHT', damage: 45, shoveDist: 0 });
    expect(r2.stops).toEqual([0.045]);
    expect(spin).toHaveBeenCalledTimes(1);
    spin.mockRestore();
  });

  it('第 3 投爆風：命中點 2.2m 內主目標以外最近的 2 人，SHOVE 1.5m 向外推、傷害 ×0.5、同一 serial；更遠 / 第 3 近者不波及', () => {
    const main = makeTarget(0, 8);
    const n1 = makeTarget(1.0, 8.2), n2 = makeTarget(-1.4, 8), n3 = makeTarget(0, 9.9), far = makeTarget(3, 8);
    const r = makeRig([main, n1, n2, n3, far]);
    r.throwBall(B3);
    r.stepUntil(() => r.hits.length > 0, 2);
    expect(r.hits).toHaveLength(1); // 光束本身只命中主目標一次
    expect(BASKETBALL_BLAST_MAX).toBe(2);
    expect(r.blastHits.map((h) => h.target)).toEqual([n1, n2]);
    for (const h of r.blastHits) {
      expect(h).toMatchObject({ mode: 'SHOVE', dmgMul: BASKETBALL_BLAST_DMG, shoveDist: BASKETBALL_BLAST_SHOVE, serial: r.player.moveSerial });
    }
    expect(r.blastHits[0].dirX).toBeGreaterThan(0.7); // 向外推 (n1 在 +X 側)
    expect(r.blastHits[1].dirX).toBeLessThan(-0.7);
    expect(BASKETBALL_BLAST_RADIUS).toBe(2.2);
    // 第 1 投無爆風
    const r2 = makeRig([makeTarget(0, 8), makeTarget(1, 8)]);
    r2.throwBall(B1);
    r2.stepUntil(() => r2.ctrl.state === 'READY', 2);
    expect(r2.blastHits).toHaveLength(0);
  });

  it('落空：直線飛完 18m 射程 (0.35 秒保險) 後化光收回，1 秒內回手；不反彈', () => {
    const r = makeRig();
    r.throwBall(B1);
    const t = r.stepUntil(() => r.ctrl.state === 'READY', 6);
    expect(r.ctrl.state).toBe('READY');
    expect(t).toBeLessThan(0.8);
    expect(r.sounds).not.toContain('dribble');
    expect(r.hits).toHaveLength(0);
  });

  it('撞牆：撞擊點出小衝擊環後收回 (不反射)', () => {
    const spin = vi.spyOn(comboFinisherFX, 'spinWave').mockImplementation(() => {});
    const r = makeRig([], [wall(-3, 6, 3, 7)]);
    r.throwBall(B1);
    r.stepUntil(() => r.projectiles.state[r.ctrl.slot] === PSTATE_RETURN, 1);
    const p = r.projectiles.getPosition(r.ctrl.slot, new THREE.Vector3());
    expect(p.z).toBeLessThan(6);               // 停在牆前，未穿牆
    expect(spin).toHaveBeenCalledTimes(1);
    r.stepUntil(() => r.ctrl.state === 'READY', 2);
    expect(r.ctrl.state).toBe('READY');
    expect(r.sounds).toContain('kiImpact');
    expect(r.projectiles.active).toBe(0);
    spin.mockRestore();
  });

  it('高速不穿透：低幀率 (20 fps，每幀 3m) 也命中 0.1m 薄牆與 NPC 膠囊，且只結算一次', () => {
    const r = makeRig([], [wall(-3, 9, 3, 9.1)]);
    r.throwBall(B1);
    const slot = r.ctrl.slot;
    let t = 0;
    while (r.projectiles.state[slot] !== PSTATE_RETURN && t < 1) { r.ctrl.update(1 / 20); r.projectiles.update(1 / 20); t += 1 / 20; }
    expect(r.projectiles.getPosition(slot, new THREE.Vector3()).z).toBeLessThan(9);
    // NPC：膠囊半徑 0.35，單幀位移 3m 跨過整個膠囊
    const tgt = makeTarget(0, 10);
    const r2 = makeRig([tgt]);
    r2.throwBall(B3);
    for (let k = 0; k < 40 && r2.ctrl.state !== 'READY'; k++) { r2.ctrl.update(1 / 20); r2.projectiles.update(1 / 20); }
    expect(r2.hits).toHaveLength(1);
    expect(r2.ctrl.state).toBe('READY');
  });

  it('光束：氣功彈彗星樣式 (TRACER_KI) + 回程細光痕，不反彈旗標', () => {
    const r = makeRig();
    const opts = (r.ctrl as unknown as { opts: ReturnType<typeof createProjectileSpawnOpts>[] }).opts;
    for (const o of opts) {
      expect(o.flags).toBe(PFLAG_TRACER | PFLAG_TRACER_RETURN | PFLAG_RETURN);
      expect(o.tracerStyle).toBe(TRACER_KI);
      expect(o.gravity).toBe(0);
      expect(o.launchSound).toBe('kiShot');
    }
    // 終結段光束更粗更長
    expect(opts[2].tracerHalfWidth).toBeGreaterThan(opts[0].tracerHalfWidth);
    expect(opts[2].tracerLenMul).toBeGreaterThan(opts[1].tracerLenMul);
  });

  it('被擋 (BLOCKED)：直接收回 (立即進入回收)，無衝擊環', () => {
    const spin = vi.spyOn(comboFinisherFX, 'spinWave').mockImplementation(() => {});
    const t = makeTarget(0, 8);
    const r = makeRig([t]);
    r.state.block = true;
    r.throwBall(B1);
    const slot = r.ctrl.slot;
    r.stepUntil(() => r.hits.length > 0, 2);
    expect(r.hits).toHaveLength(1);
    expect(r.projectiles.state[slot]).toBe(PSTATE_RETURN);
    expect(spin).not.toHaveBeenCalled();
    r.stepUntil(() => r.ctrl.state === 'READY', 4);
    expect(r.ctrl.state).toBe('READY');
    expect(r.hits).toHaveLength(1); // 回程不傷人
    spin.mockRestore();
  });

  it('保險壽命：飛行 0.35 秒 (射程 / 速度 + 0.05) 未結束即轉回收', () => {
    const r = makeRig();
    const op = { ...(r.ctrl as unknown as { opts: ReturnType<typeof createProjectileSpawnOpts>[] }).opts[0] };
    expect(op.maxLife).toBeCloseTo(0.35, 6);
    const slot = r.projectiles.spawn(PROJ_BALL, new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 0, 1), op);
    let t = 0;
    while (r.projectiles.state[slot] !== PSTATE_RETURN && t < 3) { r.projectiles.update(DT); t += DT; }
    expect(t).toBeGreaterThanOrEqual(0.35 - DT);
    expect(t).toBeLessThan(0.35 + 2 * DT);
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

  it('手持小遊戲籃球：手上的武器球隱藏 (不出現兩顆球)，放下後恢復；只在狀態改變時寫入', () => {
    const r = makeRig();
    r.step();
    expect(r.state.calls.held).toEqual([]);
    r.basketballGame.isHolding = true;
    r.step();
    r.step();
    expect(r.state.calls.held).toEqual([true]);
    r.basketballGame.isHolding = false;
    r.step();
    expect(r.state.calls.held).toEqual([true, false]);
    // 持其他武器時不處理
    r.player.currentWeapon = 'FIST';
    r.basketballGame.isHolding = true;
    r.step();
    expect(r.state.calls.held).toEqual([true, false]);
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
  async function makeCampus(totalMade: number) {
    vi.resetModules();
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

  it('9 球不解鎖；達 10 球跳橫幅解鎖但不自動裝備，之後不重複；basketballMade 與裝備頁進度接上 totalMade', async () => {
    const t = await makeCampus(9);
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

describe('籃球：光束特效 (TracerFX 1 draw call、檔位降級)', () => {
  it('低檔：細光痕 (彈弓) 關閉，氣功彈彗星仍顯示 (短光束)；全部共用同一 InstancedMesh', () => {
    const scene = new THREE.Scene();
    tracerFX.init(scene);
    const meshes = scene.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh);
    expect(meshes).toHaveLength(1);
    try {
      setFxTier('low');
      expect(FX_PRESETS.low.tracerPool).toBe(0);
      expect(FX_PRESETS.low.kiBeamLife).toBeGreaterThan(0);
      expect(FX_PRESETS.high.kiBeamLife).toBeGreaterThan(FX_PRESETS.medium.kiBeamLife);
      expect(FX_PRESETS.medium.kiBeamLife).toBeGreaterThan(FX_PRESETS.low.kiBeamLife);
      expect(tracerFX.enabled).toBe(false);
      tracerFX.set(1, 0, 1, 2, 0, 1, 0, 0.04, 0xffffff, TRACER_LINE);
      expect(meshes[0].visible).toBe(false);
      tracerFX.set(0, 0, 1, 6, 0, 1, 0, 0.3, 0xff9a3a, TRACER_KI);
      expect(meshes[0].visible).toBe(true);
      tracerFX.update(new THREE.Vector3(0, 3, -6));
      tracerFX.reset();
      expect(meshes[0].visible).toBe(false);
    } finally {
      setFxTier('high');
      tracerFX.reset();
    }
  });
});
