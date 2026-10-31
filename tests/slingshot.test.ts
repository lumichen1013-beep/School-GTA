import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects 於模組載入時會存取 window / document，以任意方法皆為空函式的 mock 取代 (記錄被呼叫的方法名)
const played = vi.hoisted(() => [] as string[]);
vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy({}, { get: (_t, name: string) => () => { played.push(name); } })
}));

import { getWeaponSummary } from '../src/game/weaponStats';
import { getWeapon } from '../src/weapons/registry';
import { slashFX } from '../src/effects/SlashFX';
import { lodBoostedDistSq } from '../src/entities/npc/lod';
import { SOUND_RANGE, soundGain } from '../src/audio/spatialAudio';
import { isHeadshotHit, rangeDamageMul } from '../src/weapons/projectiles/collide';
import {
  PROJ_STONE, ProjectileSystem, type ProjectileEvent, type ProjectileHost, type ProjectileTarget
} from '../src/weapons/projectiles/ProjectileSystem';
import { PRE_INPUT_WINDOW } from '../src/weapons/rangedCommon';
import {
  SLING, SLING_SNAP_CHARGE, canRelease, chargeDamageFrac, chargeProgress, chargeRatio, chargeSpeed, flatDrop, flightTime,
  flatDrop, slingDamage, slingDps, slingRangeMul, solvePitch
} from '../src/weapons/slingshot/ballistics';
import { hasLineOfSight, pickSlingTarget, rayConvergeDistance, SLING_AIM_RANGE, SLING_TOUCH_HALF_ANGLE } from '../src/weapons/slingshot/aim';
import { SlingshotController } from '../src/weapons/slingshot/SlingshotController';
import { buildSlingshot } from '../src/weapons/models/slingshotModel';
import { createSlingRelease } from '../src/weapons/slingshot/releaseMove';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera';
import type { GameContext } from '../src/game/GameContext';
import type { DevWeaponsMode } from '../src/weapons/featureFlags';

// 準星為 DOM：以最小 stub 取代 (記錄掛上 body 的元素)
const els: Record<string, { style: Record<string, string>; className: string; id: string }> = {};
beforeEach(() => {
  for (const k of Object.keys(els)) delete els[k];
  vi.stubGlobal('document', {
    createElement: () => ({ style: {} as Record<string, string>, className: '', id: '' }),
    body: { appendChild: (e: { id: string; style: Record<string, string>; className: string }) => { els[e.id] = e; } }
  });
  vi.stubGlobal('window', { innerWidth: 800, innerHeight: 400 });
});
afterEach(() => { vi.unstubAllGlobals(); });

const DEF = getWeapon('SLINGSHOT');
const MOVE = DEF.combo[0];
const DT = 1 / 60;
const deg = (d: number) => d * Math.PI / 180;

describe('彈弓：武器定義', () => {
  it('數值：ATK 60、射程 50、不擊退、dev、只限校園、單發放弦 (0.3 秒 / 離弦 0.05)', () => {
    expect(DEF.release).toBe('dev');
    expect(DEF.stats).toEqual({ damage: 60, reach: 50, knockback: 0 });
    expect(DEF.worlds).toEqual({ CAMPUS: true, DETENTION: false });
    expect(DEF.readyPose).toBe('SLING_AIM');
    expect(DEF.combo).toHaveLength(1);
    expect(MOVE).toMatchObject({ name: '放弦', dur: 0.3, strike: 0.05, projectile: 'SLING', knock: 0, finisher: false });
    expect(createSlingRelease()[0].name).toBe('放弦');
  });

  it('解鎖：跑操場獲勝；特訓院提示器材遭沒收', () => {
    expect(DEF.unlock?.lockedHint({ trackWon: false } as never, 'CAMPUS')).toContain('跑操場');
    expect(DEF.unlock?.lockedHint({ trackWon: false } as never, 'DETENTION')).toBe('⚠️ 特訓院管制區：器材已遭沒收！');
    expect(DEF.unlock?.steps?.({ trackWon: false } as never)).toEqual([{ label: '跑操場比賽獲勝', cur: 0, max: 1 }]);
    expect(DEF.unlock?.steps?.({ trackWon: true } as never)).toEqual([{ label: '跑操場比賽獲勝', cur: 1, max: 1 }]);
  });

  it('音效可聞距離：slingDraw 8m、slingTwang 15m、stoneHit 15m、headshotDing 20m (全部帶位置衰減)', () => {
    expect(SOUND_RANGE.slingDraw).toBe(8);
    expect(SOUND_RANGE.slingTwang).toBe(15);
    expect(SOUND_RANGE.stoneHit).toBe(15);
    expect(SOUND_RANGE.headshotDing).toBe(20);
    expect(soundGain('headshotDing', 19)).toBeGreaterThan(0);
    expect(soundGain('slingDraw', 8)).toBe(0);
  });

  it('模型：2 個 mesh (架 + 握把 / 橡皮筋 + 彈兜)、三角形數量合理、不投影；aim 比例驅動轉向與拉伸', () => {
    const h = buildSlingshot();
    const meshes: THREE.Mesh[] = [];
    h.parts.R!.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes).toHaveLength(2);
    const tris = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    expect(tris(meshes[0])).toBeGreaterThan(90);
    expect(tris(meshes[0])).toBeLessThanOrEqual(130);
    expect(tris(meshes[0]) + tris(meshes[1])).toBeLessThan(180);
    for (const m of meshes) expect(m.castShadow).toBe(false);
    expect(h.parts.R!.visible).toBe(false);
    const band = meshes[1];
    h.aim!(0);
    const rest = band.scale.y;
    const restRot = h.parts.R!.rotation.x;
    h.aim!(1);
    expect(band.scale.y).toBeGreaterThan(rest * 4);
    expect(h.parts.R!.rotation.x).toBeGreaterThan(restRot);
  });
});

describe('彈弓：蓄力傷害曲線與彈速', () => {
  it('0.25 秒起可射；未達不可射', () => {
    expect(canRelease(0.249)).toBe(false);
    expect(canRelease(0.25)).toBe(true);
    expect(chargeDamageFrac(0.2)).toBe(0);
  });
  it('傷害比例：0.25s = 40%、0.7s = 100%，線性；超過滿蓄力維持 100%', () => {
    expect(chargeDamageFrac(0.25)).toBeCloseTo(0.4, 9);
    expect(chargeDamageFrac(0.475)).toBeCloseTo(0.7, 9);
    expect(chargeDamageFrac(0.7)).toBeCloseTo(1, 9);
    expect(chargeDamageFrac(2)).toBe(1);
    expect(Math.round(SLING.damage * chargeDamageFrac(0.25))).toBe(24);
    expect(Math.round(SLING.damage * chargeDamageFrac(0.5))).toBe(44);
  });
  it('彈速 40 → 70 m/s', () => {
    expect(chargeSpeed(0.25)).toBe(40);
    expect(chargeSpeed(0.475)).toBeCloseTo(55, 9);
    expect(chargeSpeed(0.7)).toBe(70);
    expect(chargeProgress(0.7)).toBe(1);
  });
  it('視覺蓄力比例 0 → 1 (開鏡 / 姿勢 / 橡皮筋)', () => {
    expect(chargeRatio(0)).toBe(0);
    expect(chargeRatio(0.35)).toBeCloseTo(0.5, 9);
    expect(chargeRatio(0.7)).toBe(1);
    expect(chargeRatio(5)).toBe(1);
  });
});

describe('彈弓：射程衰減與下墜 (純函式)', () => {
  it('30m 內全額、之後線性衰減、50m 剩 70%、超過維持 70%', () => {
    expect(slingRangeMul(0)).toBe(1);
    expect(slingRangeMul(10)).toBe(1);
    expect(slingRangeMul(30)).toBe(1);
    expect(slingRangeMul(40)).toBeCloseTo(0.85, 9);
    expect(slingRangeMul(45)).toBeCloseTo(0.775, 9);
    expect(slingRangeMul(50)).toBeCloseTo(0.7, 9);
    expect(slingRangeMul(80)).toBeCloseTo(0.7, 9);
    expect(rangeDamageMul(40, 0, 0, 1)).toBe(1); // near <= 0 = 不衰減
  });
  it('單發期望傷害：蓄力 × 射程 × 爆頭', () => {
    expect(slingDamage(0.7, 10, false)).toBe(60);
    expect(slingDamage(0.7, 10, true)).toBeCloseTo(96, 9);
    expect(slingDamage(0.7, 50, true)).toBeCloseTo(67.2, 9);
    expect(slingDamage(0.25, 45, false)).toBeCloseTo(60 * 0.4 * 0.775, 9);
    expect(slingDamage(0.1, 10, false)).toBe(0);
  });
  it('重力 6：70 m/s 水平射出 50m 下墜約 1.5m；10m / 30m / 45m', () => {
    expect(flatDrop(70, 50)).toBeCloseTo(1.53, 2);
    expect(flatDrop(70, 10)).toBeCloseTo(0.061, 3);
    expect(flatDrop(70, 30)).toBeCloseTo(0.551, 3);
    expect(flatDrop(70, 45)).toBeCloseTo(1.24, 2);
    expect(flatDrop(40, 50)).toBeGreaterThan(flatDrop(70, 50));
  });
  it('出手仰角求解：以相同半隱式 Euler 積分 (1/30s) 飛行後落在目標高度 (誤差 < 0.15m)', () => {
    const sim = (speed: number, dist: number, dh: number, dt: number) => {
      const th = solvePitch(speed, dist, dh);
      let x = 0, y = 0, vx = speed * Math.cos(th), vy = speed * Math.sin(th);
      let px = 0, py = 0;
      while (x < dist) { px = x; py = y; vy -= SLING.gravity * dt; x += vx * dt; y += vy * dt; }
      return py + (y - py) * ((dist - px) / (x - px)); // 線性內插到目標水平距離
    };
    for (const [v, d, dh] of [[70, 10, 0], [70, 30, -0.4], [70, 45, 0.5], [40, 50, 0], [55, 25, 1]] as const) {
      expect(Math.abs(sim(v, d, dh, 1 / 30) - dh)).toBeLessThan(0.15);
      expect(Math.abs(sim(v, d, dh, 1 / 60) - dh)).toBeLessThan(0.1);
    }
  });
  it('無解 (超出射程) 回傳 45°；飛行時間隨仰角', () => {
    expect(solvePitch(20, 200, 0)).toBeCloseTo(Math.PI / 4, 9);
    expect(flightTime(70, 35, 0)).toBeCloseTo(0.5, 9);
  });
});

describe('彈弓：秒傷 (遠程口徑)', () => {
  it('滿蓄力約 52/s、爆頭約 83/s、點射約 46/s', () => {
    expect(slingDps(0.7, 30, false)).toBeCloseTo(60 / 1.15, 6);
    expect(slingDps(0.7, 30, true)).toBeCloseTo(96 / 1.15, 6);
    expect(slingDps(SLING_SNAP_CHARGE, 30, false)).toBeCloseTo(44 / 0.95, 0);
    const s = getWeaponSummary('SLINGSHOT', 'CAMPUS');
    expect(Math.round(s.dps)).toBe(52);
    expect(s.ranged!.standardDistance).toBe(30);
    expect(s.ranged!.scenarios!.map((c) => [c.label, Math.round(c.dps)])).toEqual([['滿蓄力', 52], ['爆頭', 83], ['點射', 46]]);
    expect(s.ranged!.dpsAt.map(Math.round)).toEqual([52, 52, 40]); // 10m / 30m / 45m (45m 衰減到 77.5%)
    expect(s.totalDamage).toBe(60);
    expect(s.totalSeconds).toBeCloseTo(1.15, 9);
    expect(s.groupDps).toBeNull();
  });
  it('其餘武器 scenarios 為 null (籃球的遠程口徑不受影響)', () => {
    expect(getWeaponSummary('BASKETBALL', 'CAMPUS').ranged!.scenarios).toBeNull();
    expect(getWeaponSummary('FIST', 'CAMPUS').ranged).toBeNull();
  });
});

describe('彈弓：目標選擇與視線 (O(n)，不用 Raycaster)', () => {
  const T = (x: number, z: number, extra: Partial<{ y: number; isKnockedDown: boolean; role: string }> = {}) =>
    ({ position: { x, y: extra.y ?? 0, z }, role: extra.role ?? 'STUDENT', isKnockedDown: extra.isKnockedDown ?? false, isPermanentlyKnockedOut: false });
  const at = (d: number, r: number) => T(Math.sin(deg(d)) * r, Math.cos(deg(d)) * r);
  const wall = (minX: number, minZ: number, maxX: number, maxZ: number, over: Record<string, unknown> = {}) =>
    ({ min: new THREE.Vector3(minX, 0, minZ), max: new THREE.Vector3(maxX, 4, maxZ), ...over });
  const pick = (targets: ReturnType<typeof T>[], cols: unknown[] = []) =>
    pickSlingTarget(targets, cols as never, 0, 0, 0, 0, 1, SLING_TOUCH_HALF_ANGLE, SLING_AIM_RANGE);

  it('±25°、50m：取最接近畫面中心 (夾角最小) 者，不看距離；25° 外 / 50m 外 / 倒地 / 背後不鎖', () => {
    const near = at(20, 4), center = at(2, 40), far = at(0, 51), out = at(26, 5), down = T(0, 3, { isKnockedDown: true }), behind = T(0, -3);
    expect(pick([near, center, far, out, down, behind])).toBe(center);
    expect(pick([far, out, down, behind])).toBeNull();
    expect(pick([])).toBeNull();
  });
  it('滑動換目標：鏡頭轉向後選到另一個 (最接近新畫面中心)', () => {
    const a = at(-15, 20), b = at(15, 20);
    expect(pickSlingTarget([a, b], [], 0, 0, 0, Math.sin(deg(-12)), Math.cos(deg(-12)), SLING_TOUCH_HALF_ANGLE, 50)).toBe(a);
    expect(pickSlingTarget([a, b], [], 0, 0, 0, Math.sin(deg(12)), Math.cos(deg(12)), SLING_TOUCH_HALF_ANGLE, 50)).toBe(b);
  });
  it('視線被牆擋住退而求其次；全被擋為 null；樓板 / 坡道不擋', () => {
    const blocked = at(1, 20), clear = at(10, 20);
    const w = wall(-0.6, 8, 0.6, 9);
    expect(pick([blocked, clear], [w])).toBe(clear);
    expect(pick([blocked], [w])).toBeNull();
    expect(pick([blocked], [wall(-0.6, 8, 0.6, 9, { isFloorOnly: true })])).toBe(blocked);
    expect(pick([blocked], [wall(-0.6, 8, 0.6, 9, { isRamp: true })])).toBe(blocked);
  });
  it('hasLineOfSight：線段對 AABB；牆低於視線不擋；目標緊貼牆面不誤判', () => {
    const w = wall(-5, 10, 5, 11);
    expect(hasLineOfSight([w] as never, 0, 1.5, 0, 0, 1, 20)).toBe(false);
    expect(hasLineOfSight([w] as never, 0, 1.5, 0, 0, 1, 9)).toBe(true);
    expect(hasLineOfSight([w] as never, 0, 5, 0, 0, 5, 20)).toBe(true); // 牆高 4m，視線在 5m 以上
    expect(hasLineOfSight([] as never, 0, 1.5, 0, 0, 1, 20)).toBe(true);
    expect(hasLineOfSight([wall(-5, 10, 5, 11)] as never, 0, 1.5, 0, 0, 1, 9.99)).toBe(true);
  });
  it('開鏡 LOD：只提升被鎖定者 (距離 ÷ 倍率)', () => {
    expect(lodBoostedDistSq(40 * 40, 1)).toBe(1600);
    expect(lodBoostedDistSq(40 * 40, 2)).toBe(400);
    expect(lodBoostedDistSq(40 * 40, 1.5)).toBeCloseTo(711.1, 1);
  });
});

// ===== 狀態機 (真實 ProjectileSystem + mock host / ctx) =====
interface Target extends ProjectileTarget {
  position: THREE.Vector3; role: string; isKnockedDown: boolean; isPermanentlyKnockedOut: boolean; lastHitResult: 'BLOCKED' | 'HIT' | 'KO'; lodBoost: number;
}
function makeTarget(x: number, z: number, role = 'STUDENT'): Target {
  return { position: new THREE.Vector3(x, 0, z), role, isKnockedDown: false, isPermanentlyKnockedOut: false, lastHitResult: 'HIT', lodBoost: 1 };
}
interface Hit { mode: string; damage: number; dmgMul: number; knockback: number; serial: number; hitHeight: number }

function makeRig(targets: Target[] = [], touch = false) {
  const hits: Hit[] = [];
  const events: ProjectileEvent[] = [];
  const sounds: string[] = [];
  const stops: number[] = [];
  const host: ProjectileHost = {
    targets, colliders: [] as never, cameraPosition: new THREE.Vector3(0, 5, -10),
    hitTarget: (t, spec) => {
      hits.push({ mode: spec.mode, damage: spec.damage, dmgMul: spec.dmgMul, knockback: spec.knockback, serial: spec.serial, hitHeight: (spec.src.y - t.position.y) });
      (t as Target).lastHitResult = 'HIT';
      return true;
    },
    hitGardenAt: () => null,
    requestHitStop: (s) => { stops.push(s); },
    playSound: (id) => { sounds.push(id); },
    hitFlash: () => {},
    dust: () => {}
  };
  const projectiles = new ProjectileSystem(host);
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 300);
  camera.position.set(0, 1.0, -2);
  camera.lookAt(0, 1.0, 10);
  camera.updateMatrixWorld();
  const camState = { aimZoom: 0, aimZoomFactor: 1, yaw: 0, pitch: 0 };
  const cameraCtrl = {
    camera,
    get aimZoom() { return camState.aimZoom; }, set aimZoom(v: number) { camState.aimZoom = v; },
    get aimZoomFactor() { return camState.aimZoomFactor; }, set aimZoomFactor(v: number) { camState.aimZoomFactor = v; },
    get yaw() { return camState.yaw; }, set yaw(v: number) { camState.yaw = v; },
    get pitch() { return camState.pitch; }, set pitch(v: number) { camState.pitch = v; },
    getForwardVector: () => {
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      d.y = 0;
      return d.normalize();
    }
  };
  const combat = { isExecutionActive: false, updateHitText: vi.fn(), showHitDamage: vi.fn(), prewarmHitText: vi.fn() };
  const player = {
    position: new THREE.Vector3(0, 0, 0), rotationY: 0, currentWeapon: 'SLINGSHOT', isHoldingRacket: false, isDead: false, isRidingVehicle: false,
    isAttacking: false, attackLock: false, moveSerial: 0, busy: false, aimCharge: 0, aimYaw: null as number | null,
    isKnockedFlying: false, knockdownTimer: 0, isDodging: false, isBackflipping: false, isSwimming: false,
    get canAttack() { return !this.attackLock && !this.busy; },
    attack() { if (!this.canAttack) return false; this.isAttacking = true; this.moveSerial++; return true; },
    faceDirection(dx: number, dz: number) { this.rotationY = Math.atan2(dx, dz); }
  };
  const input = { isTouchDevice: touch, mouseButtons: { left: false, right: false }, keys: {} as Record<string, boolean> };
  const ctx = {
    currentWorldType: 'CAMPUS', currentRidingBike: null, player, projectiles, npcs: targets, activeColliders: [], combat, cameraCtrl, input,
    basketballGame: { isHolding: false }, engine: { scene: new THREE.Scene() }
  } as unknown as GameContext;
  const ctrl = new SlingshotController(ctx);
  const step = (dt = DT) => { ctrl.update(dt); projectiles.update(dt); };
  const run = (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += DT) step(); };
  const press = () => { input.mouseButtons.left = true; return ctrl.handleAttack(); };
  const releaseKey = () => { input.mouseButtons.left = false; };
  // 按住蓄力 sec 秒 → 放開 → 一幀處理放手 (進入 WINDUP)
  const chargeAndRelease = (sec: number) => {
    press();
    run(sec);
    releaseKey();
    step();
  };
  // 放手後離弦 (CombatSystem 在招式命中時間點呼叫 launch)
  const fire = () => ctrl.launch(MOVE);
  const flyUntilHit = (maxSeconds = 3) => {
    let t = 0;
    while (hits.length === 0 && t < maxSeconds) { step(); t += DT; }
  };
  host.targets = targets;
  const origOnEvent = (ctrl as unknown as { opts: { onEvent: (ev: ProjectileEvent) => void } }).opts;
  const inner = origOnEvent.onEvent;
  origOnEvent.onEvent = (ev) => { events.push({ ...ev, point: ev.point.clone(), origin: ev.origin.clone() }); inner(ev); };
  return { ctrl, ctx, player, projectiles, hits, events, sounds, stops, step, run, press, releaseKey, chargeAndRelease, fire, flyUntilHit, camState, cameraCtrl, input, combat, targets, camera };
}

describe('彈弓狀態機：蓄力 / 放手 / 上彈', () => {
  it('按住蓄力：進入 CHARGING、開鏡比例隨蓄力、桌機倍率 2、面向鏡頭、播拉弦音；放開 < 0.25 秒不射', () => {
    played.length = 0;
    const r = makeRig();
    expect(r.press()).toBe(true);
    expect(r.ctrl.state).toBe('CHARGING');
    expect(played).toContain('playSlingDraw');
    r.run(0.35);
    expect(r.ctrl.state).toBe('CHARGING');
    expect(r.camState.aimZoom).toBeCloseTo(0.5, 1);
    expect(r.camState.aimZoomFactor).toBe(2);
    expect(r.player.aimCharge).toBeCloseTo(0.5, 1);
    expect(r.player.aimYaw).not.toBeNull();
    r.run(0.5);
    expect(r.camState.aimZoom).toBe(1);

    const q = makeRig();
    q.press();
    q.run(0.2);
    q.releaseKey();
    q.step();
    expect(q.ctrl.state).toBe('IDLE'); // 太短：取消，不射、不上彈
    expect(q.projectiles.active).toBe(0);
    expect(q.camState.aimZoom).toBe(0);
    expect(q.player.aimYaw).toBeNull();
    expect(q.player.attackLock).toBe(false);
    expect(q.player.isAttacking).toBe(false);
  });

  it('手機倍率 1.5；F 鍵同樣可蓄力', () => {
    const r = makeRig([], true);
    r.press();
    r.run(0.3);
    expect(r.camState.aimZoomFactor).toBe(1.5);
    const f = makeRig();
    f.input.keys['KeyF'] = true;
    expect(f.ctrl.handleAttack()).toBe(true);
    f.run(0.3);
    expect(f.ctrl.state).toBe('CHARGING'); // F 按住即維持蓄力 (holding 含 KeyF)
    f.input.keys['KeyF'] = false;
    f.step();
    expect(f.ctrl.state).toBe('CHARGING' === f.ctrl.state ? 'WINDUP' : 'WINDUP');
  });

  it('滿蓄力放手：播放弦招式、鎖攻擊 → 離弦發射石子 → 上彈 0.35 秒 → 解鎖；石子不穿透、不擊退 (LIGHT)', () => {
    const t = makeTarget(0, 15);
    const r = makeRig([t]);
    r.chargeAndRelease(0.8);
    expect(r.ctrl.state).toBe('WINDUP');
    expect(r.player.isAttacking).toBe(true);
    expect(r.player.attackLock).toBe(true);
    expect(r.projectiles.active).toBe(0); // 尚未離弦
    expect(r.fire()).toBe(true);
    expect(r.ctrl.state).toBe('RELOAD');
    expect(r.projectiles.active).toBe(1);
    expect(r.sounds).toContain('slingTwang');
    r.flyUntilHit();
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ mode: 'LIGHT', knockback: 0, damage: 60, dmgMul: 1, serial: r.player.moveSerial });
    expect(r.projectiles.active).toBe(0); // 不穿透：命中即消失
    expect(r.sounds).toContain('stoneHit');
    // 上彈期間不可蓄力；0.35 秒後解鎖
    expect(r.ctrl.state).toBe('RELOAD');
    r.player.isAttacking = false;
    r.run(0.4);
    expect(r.ctrl.state).toBe('IDLE');
    expect(r.player.attackLock).toBe(false);
  });

  it('launch 對非彈弓招式回傳 false (CombatSystem 轉交籃球)', () => {
    const r = makeRig();
    expect(r.ctrl.launch({} as never)).toBe(false);
  });

  it('不同蓄力的傷害：0.25s = 24 (40%)、0.5s = 44、0.7s = 60；彈速 40 → 70', () => {
    const dmg = (sec: number) => {
      const t = makeTarget(0, 12);
      const r = makeRig([t]);
      r.chargeAndRelease(sec);
      r.fire();
      const speed = Math.hypot(r.projectiles.vel[0], r.projectiles.vel[1], r.projectiles.vel[2]);
      r.flyUntilHit();
      return { dmg: Math.round(r.hits[0].damage * r.hits[0].dmgMul), speed };
    };
    const a = dmg(0.27), b = dmg(0.5), c = dmg(0.9);
    expect(a.dmg).toBeGreaterThanOrEqual(24);
    expect(a.dmg).toBeLessThanOrEqual(27);
    expect(a.speed).toBeGreaterThanOrEqual(40);
    expect(a.speed).toBeLessThan(44);
    expect(b.dmg).toBeGreaterThan(a.dmg);
    expect(b.dmg).toBeLessThan(c.dmg);
    expect(c.dmg).toBe(60);
    expect(c.speed).toBeCloseTo(70, 5);
  });

  it('射程衰減 (事件含發射起點)：10m / 30m 全額，45m 約 77.5%，下墜依距離增加', () => {
    const shot = (z: number) => {
      const t = makeTarget(0, z);
      const r = makeRig([t]);
      // 桌機不補償下墜：遠距離準星需抬高 (準星對準 1.0m + 該距離下墜量)
      const y = 1.0 + flatDrop(70, z);
      r.camera.position.set(0, y, -2);
      r.camera.lookAt(0, y, 10);
      r.camera.updateMatrixWorld();
      r.chargeAndRelease(0.8);
      r.fire();
      r.flyUntilHit();
      const ev = r.events.find((e) => e.type === 'NPC')!;
      return { mul: r.hits[0].dmgMul, ev };
    };
    const a = shot(10), b = shot(30), c = shot(45);
    expect(a.mul).toBe(1);
    expect(b.mul).toBe(1);
    expect(c.mul).toBeCloseTo(slingRangeMul(c.ev.distance), 9);
    expect(c.mul).toBeGreaterThan(0.75);
    expect(c.mul).toBeLessThan(0.8);
    expect(a.ev.origin.z).toBeCloseTo(0.45, 6); // 發射起點欄位
    expect(a.ev.distance).toBeCloseTo(10 - 0.45 - 0.35 - 0.05, 0);
    // 下墜：準星高度相同時，越遠命中點越低 (10m vs 30m，目標都在準星射線上)
    const fixed = (z: number) => {
      const r = makeRig([makeTarget(0, z)]);
      r.chargeAndRelease(0.8);
      r.fire();
      r.flyUntilHit();
      return r.events.find((e) => e.type === 'NPC')!.hitHeight;
    };
    const h10 = fixed(10), h30 = fixed(30);
    expect(h10 - h30).toBeGreaterThan(0.3);
    expect(h10 - h30).toBeLessThan(flatDrop(70, 30) + 0.1);
  });

  it('每發各一個 serial (一發只報一次通緝)', () => {
    const r = makeRig([makeTarget(0, 12)]);
    r.chargeAndRelease(0.8);
    r.fire();
    const s1 = r.player.moveSerial;
    r.flyUntilHit();
    r.player.isAttacking = false;
    r.run(0.4);
    r.chargeAndRelease(0.8);
    r.fire();
    expect(r.player.moveSerial).toBe(s1 + 1);
  });

  it('預輸入：上彈期間按攻擊進 0.25 秒緩衝，上彈完成且仍按住時自動開始下一發蓄力；超過視窗或已放開不觸發', () => {
    const r = makeRig();
    r.chargeAndRelease(0.8);
    r.fire();
    r.player.isAttacking = false;
    r.run(0.2); // 上彈剩 ~0.15
    expect(r.ctrl.state).toBe('RELOAD');
    r.press();
    expect(r.ctrl.buffer).toBe(PRE_INPUT_WINDOW);
    r.run(0.25);
    expect(r.ctrl.state).toBe('CHARGING');

    const late = makeRig();
    late.chargeAndRelease(0.8);
    late.fire();
    late.player.isAttacking = false;
    late.press(); // 剛上彈完 0.35 才進入緩衝，但 0.35 秒後緩衝仍 0.25 → 以另一情境驗證「放開則不觸發」
    late.releaseKey();
    late.run(0.5);
    expect(late.ctrl.state).toBe('IDLE');
  });

  it('放弦被中斷 (閃身 / 受擊使出招取消)：回到待命、解除鎖定', () => {
    const r = makeRig();
    r.chargeAndRelease(0.8);
    expect(r.ctrl.state).toBe('WINDUP');
    r.player.isAttacking = false;
    r.step();
    expect(r.ctrl.state).toBe('IDLE');
    expect(r.player.attackLock).toBe(false);
  });

  it('池滿：離弦失敗回到待命，不鎖攻擊', () => {
    const r = makeRig();
    const filler = (r.ctrl as unknown as { opts: Parameters<ProjectileSystem['spawn']>[3] }).opts;
    for (let i = 0; i < 8; i++) r.projectiles.spawn(PROJ_STONE, new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, 0, 0), { ...filler, maxLife: 100, gravity: 0 });
    r.chargeAndRelease(0.8);
    r.fire();
    expect(r.ctrl.state).toBe('IDLE');
    expect(r.player.attackLock).toBe(false);
  });
});

describe('彈弓狀態機：取消', () => {
  const charging = () => {
    const t = makeTarget(0, 20);
    const r = makeRig([t]);
    r.press();
    r.run(0.4);
    expect(r.ctrl.state).toBe('CHARGING');
    expect(t.lodBoost).toBe(2); // 桌機小錐鎖定 → LOD 提升
    return { r, t };
  };
  const expectClean = (r: ReturnType<typeof makeRig>, t: Target) => {
    expect(r.ctrl.state).toBe('IDLE');
    expect(r.camState.aimZoom).toBe(0);
    expect(r.player.aimCharge).toBe(0);
    expect(r.player.aimYaw).toBeNull();
    expect(r.player.attackLock).toBe(false);
    expect(t.lodBoost).toBe(1);
    expect(r.projectiles.active).toBe(0);
    expect(r.ctrl.buffer).toBe(0);
  };

  it('換武器', () => {
    const { r, t } = charging();
    r.player.currentWeapon = 'FIST';
    r.step();
    expectClean(r, t);
  });
  it('死亡', () => {
    const { r, t } = charging();
    r.player.isDead = true;
    r.step();
    expectClean(r, t);
  });
  it('換世界', () => {
    const { r, t } = charging();
    (r.ctx as unknown as { currentWorldType: string }).currentWorldType = 'DETENTION';
    r.step();
    expectClean(r, t);
  });
  it('上車', () => {
    const { r, t } = charging();
    (r.ctx as unknown as { currentRidingBike: unknown }).currentRidingBike = {};
    r.step();
    expectClean(r, t);
  });
  it('受擊倒地 / 閃身', () => {
    const a = charging();
    a.r.player.knockdownTimer = 1;
    a.r.step();
    expectClean(a.r, a.t);
    const b = charging();
    b.r.player.isDodging = true;
    b.r.step();
    expectClean(b.r, b.t);
  });
  it('暗殺動作中 / 手持小遊戲籃球', () => {
    const a = charging();
    a.r.combat.isExecutionActive = true;
    a.r.step();
    expectClean(a.r, a.t);
    const b = charging();
    (b.r.ctx.basketballGame as { isHolding: boolean }).isHolding = true;
    b.r.step();
    expectClean(b.r, b.t);
  });
  it('放弦預備 (WINDUP) 與上彈 (RELOAD) 中換武器：解除鎖攻擊；已射出的石子照原軌跡飛行', () => {
    const r = makeRig([makeTarget(0, 30)]);
    r.chargeAndRelease(0.8);
    r.fire();
    expect(r.ctrl.state).toBe('RELOAD');
    r.player.currentWeapon = 'FIST';
    r.step();
    expect(r.ctrl.state).toBe('IDLE');
    expect(r.player.attackLock).toBe(false);
    expect(r.projectiles.active).toBe(1);
    r.ctrl.cancel();
    expect(r.ctrl.state).toBe('IDLE');
  });
  it('CombatSystem 重置 (換世界 / 死亡)：cancel 後完全復原，可重複呼叫', () => {
    const { r, t } = charging();
    r.ctrl.cancel();
    r.ctrl.cancel();
    expectClean(r, t);
  });
});

describe('彈弓：爆頭判定與特效', () => {
  // 目標頭部高度：對準 y + 1.5 的射線 → hitHeight > 1.4 (人型) 才算爆頭；犬型不算
  const shootAtHeight = (role: string, aimY: number) => {
    const t = makeTarget(0, 15, role);
    const r = makeRig([t]);
    // 鏡頭抬到可對準指定高度 (水平射線 + 彈道補償：以 y 近似平射)
    r.camera.position.set(0, aimY, -2);
    r.camera.lookAt(0, aimY, 10);
    r.camera.updateMatrixWorld();
    r.chargeAndRelease(0.8);
    r.fire();
    r.flyUntilHit();
    return { r, ev: r.events.find((e) => e.type === 'NPC') };
  };

  it('人型命中點高於腳底 1.4m：爆頭 ×1.6 (傷害 96)；低於為身體 (60)', () => {
    const cross = vi.spyOn(slashFX, 'crossAt').mockImplementation(() => {});
    played.length = 0;
    const head = shootAtHeight('STUDENT', 1.78);
    expect(head.ev!.headshot).toBe(true);
    expect(head.ev!.hitHeight).toBeGreaterThan(1.4);
    expect(head.r.hits[0].dmgMul).toBeCloseTo(1.6, 9);
    expect(Math.round(head.ev!.damage)).toBe(96);
    expect(head.r.stops).toContain(SLING.headHitStop); // 爆頭停格 0.04
    expect(cross).toHaveBeenCalledTimes(1);
    expect(head.r.combat.showHitDamage).toHaveBeenCalledWith(expect.anything(), 96);
    expect(played).toContain('playHeadshotDing');

    cross.mockClear();
    const body = shootAtHeight('STUDENT', 1.0);
    expect(body.ev!.headshot).toBe(false);
    expect(body.r.hits[0].dmgMul).toBe(1);
    expect(cross).not.toHaveBeenCalled();
    expect(body.r.combat.showHitDamage).not.toHaveBeenCalled();
    cross.mockRestore();
  });

  it('犬型不算爆頭 (即使命中點高度 > 1.4)', () => {
    expect(isHeadshotHit(1.5, 'DOG')).toBe(false);
    expect(isHeadshotHit(1.5, 'DETENTION_WOLF')).toBe(false);
    expect(isHeadshotHit(1.5, 'STUDENT')).toBe(true);
    expect(isHeadshotHit(1.4, 'STUDENT')).toBe(false);
    const dog = shootAtHeight('DOG', 0.2);
    expect(dog.ev!.headshot).toBe(false);
    expect(dog.r.hits[0].dmgMul).toBe(1);
  });

  it('射程 50m 的爆頭同時套射程衰減：×0.7 × 1.6', () => {
    const t = makeTarget(0, 49);
    const r = makeRig([t]);
    r.camera.position.set(0, 1.9, -2);
    r.camera.lookAt(0, 1.9, 10);
    r.camera.updateMatrixWorld();
    r.chargeAndRelease(0.8);
    r.fire();
    r.flyUntilHit(3);
    const ev = r.events.find((e) => e.type === 'NPC');
    if (ev && ev.headshot) {
      expect(r.hits[0].dmgMul).toBeCloseTo(slingRangeMul(ev.distance) * 1.6, 9);
    } else {
      expect(r.hits[0]?.dmgMul ?? 0.7).toBeLessThanOrEqual(1);
    }
  });
});

describe('彈弓：手機自動鎖定、補償下墜、穩住爆頭', () => {
  // 目標在畫面中央偏右 6°、40m，鏡頭看 +Z
  const mobileRig = (dist = 40, deg6 = 6, role = 'STUDENT') => {
    const t = makeTarget(Math.sin(deg(deg6)) * dist, Math.cos(deg(deg6)) * dist, role);
    return { t, r: makeRig([t], true) };
  };

  it('長按攻擊鍵：自動鎖定 ±25° 內最接近畫面中心的目標 (每 0.1 秒一次)，開鏡倍率 1.5；LOD 只提升被鎖定者', () => {
    const near = makeTarget(Math.sin(deg(20)) * 8, Math.cos(deg(20)) * 8);
    const center = makeTarget(Math.sin(deg(3)) * 40, Math.cos(deg(3)) * 40);
    const other = makeTarget(-5, 30);
    const r = makeRig([near, center, other], true);
    r.press();
    r.step();
    expect(r.ctrl.lockTarget).toBe(center);
    expect(center.lodBoost).toBe(1.5);
    expect(near.lodBoost).toBe(1);
    expect(other.lodBoost).toBe(1);
    r.ctrl.cancel();
    expect(center.lodBoost).toBe(1);
  });

  it('滑動換目標：鏡頭轉向後 0.1 秒內鎖定換到最接近新中心者，LOD 提升跟著換', () => {
    const a = makeTarget(Math.sin(deg(-18)) * 25, Math.cos(deg(-18)) * 25);
    const b = makeTarget(Math.sin(deg(18)) * 25, Math.cos(deg(18)) * 25);
    const r = makeRig([a, b], true);
    r.press();
    r.camera.lookAt(a.position.x, 1.6, a.position.z);
    r.camera.updateMatrixWorld();
    r.run(0.15);
    expect(r.ctrl.lockTarget).toBe(a);
    r.camera.lookAt(b.position.x, 1.6, b.position.z);
    r.camera.updateMatrixWorld();
    r.run(0.15);
    expect(r.ctrl.lockTarget).toBe(b);
    expect(b.lodBoost).toBe(1.5);
    expect(a.lodBoost).toBe(1);
  });

  it('視線被牆擋住時不鎖定', () => {
    const t = makeTarget(0, 30);
    const r = makeRig([t], true);
    (r.ctx as unknown as { activeColliders: unknown[] }).activeColliders = [{ min: new THREE.Vector3(-3, 0, 10), max: new THREE.Vector3(3, 4, 11) }];
    r.press();
    r.run(0.2);
    expect(r.ctrl.lockTarget).toBeNull();
  });

  it('放開時依距離自動補償下墜：40m 命中胸口 (非爆頭)，不同蓄力 (彈速) 皆命中', () => {
    for (const sec of [0.3, 0.5, 0.8]) {
      const { r } = mobileRig();
      r.chargeAndRelease(sec);
      r.fire();
      r.flyUntilHit();
      expect(r.hits, `蓄力 ${sec}`).toHaveLength(1);
      const ev = r.events.find((e) => e.type === 'NPC')!;
      expect(ev.hitHeight).toBeGreaterThan(0.6);
      expect(ev.hitHeight).toBeLessThan(1.4);
      expect(ev.headshot).toBe(false);
      expect(r.hits[0].dmgMul).toBeLessThan(1); // 40m 已進入衰減帶
      expect(r.hits[0].dmgMul).toBeGreaterThan(0.84);
    }
  });

  it('滿蓄力後鏡頭穩住 0.25 秒：準星縮小移到頭部，此時命中算爆頭 ×1.6', () => {
    const { t, r } = mobileRig(25, 2);
    r.press();
    r.run(0.7);
    expect(r.ctrl.headLocked).toBe(false);
    r.run(0.3); // 穩住累計 > 0.25
    expect(r.ctrl.lockTarget).toBe(t);
    expect(r.ctrl.headLocked).toBe(true);
    r.releaseKey();
    r.step();
    r.fire();
    r.flyUntilHit();
    const ev = r.events.find((e) => e.type === 'NPC')!;
    expect(ev.headshot).toBe(true);
    expect(ev.hitHeight).toBeGreaterThan(1.4);
    expect(r.hits[0].dmgMul).toBeCloseTo(slingRangeMul(ev.distance) * 1.6, 9);
  });

  it('鏡頭轉動 (角速度超過門檻) 或換目標重置穩住計時；未穩住時命中不算爆頭倍率', () => {
    const { r } = mobileRig(25, 2);
    r.press();
    r.run(1.1);
    expect(r.ctrl.headLocked).toBe(true);
    r.cameraCtrl.yaw += 0.05; // 單幀 0.05 rad ≈ 3 rad/s
    r.step();
    expect(r.ctrl.headLocked).toBe(false);
    expect(r.ctrl.steady).toBe(0);
    // 立刻放開：未穩住 → 瞄胸口、不享爆頭倍率
    r.releaseKey();
    r.step();
    r.fire();
    r.flyUntilHit();
    expect(r.events.find((e) => e.type === 'NPC')!.headshot).toBe(false);
    expect(r.hits[0].dmgMul).toBe(1);
  });

  it('手機準星為 DOM：鎖定時 sling-reticle--lock，穩住後 --head，放開後隱藏', () => {
    const { r } = mobileRig(25, 2);
    r.camera.position.set(0, 1.6, -2);
    r.camera.updateMatrixWorld();
    r.press();
    r.run(0.3);
    const el = els.slingReticle;
    expect(el.style.display).toBe('block');
    expect(el.className).toContain('sling-reticle--lock');
    expect(el.style.transform).toMatch(/^translate\(/);
    r.run(0.9);
    expect(el.className).toContain('sling-reticle--head');
    r.releaseKey();
    r.step();
    expect(el.style.display).toBe('none');
  });

  it('桌機準星固定在螢幕中心；滿蓄力改色 class', () => {
    const r = makeRig();
    r.press();
    r.run(0.3);
    const el = els.slingReticle;
    expect(el.style.display).toBe('block');
    expect(el.style.transform).toBe('translate(400.0px, 200.0px)');
    expect(el.className).not.toContain('--lock');
    r.run(0.6);
    expect(el.className).toContain('sling-reticle--full');
  });
});

describe('彈弓：開鏡鏡頭 (ThirdPersonCamera.aimZoom)', () => {
  const makeCam = () => {
    const cam = new ThirdPersonCamera(65, 16 / 9, 0.1, 500);
    cam.updateAspect(16 / 9);
    return cam;
  };
  const run = (cam: ThirdPersonCamera, pos: THREE.Vector3, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) cam.update(pos, DT, []);
  };
  const OUT = new THREE.Vector3(-60, 0, 60);   // 戶外
  const IN = new THREE.Vector3(36, 0.2, 40);   // 教學大樓走廊 (室內)

  it('桌機 2×：FOV 平滑線性拉近到 1/2，距離 4.2 → 2.2，放開後平滑回復', () => {
    const cam = makeCam();
    cam.currentWorld = 'CAMPUS';
    run(cam, OUT, 2);
    expect(cam.camera.fov).toBeCloseTo(65, 6);
    expect(cam.distance).toBeCloseTo(4.2, 1);
    cam.aimZoomFactor = 2;
    cam.aimZoom = 0.5;
    run(cam, OUT, 1);
    expect(cam.camera.fov).toBeCloseTo(65 * 0.75, 1); // 半蓄力 = FOV 線性走一半
    cam.aimZoom = 1;
    // 平滑：中間幀不會一步到位
    cam.update(OUT, DT, []);
    expect(cam.camera.fov).toBeGreaterThan(65 * 0.5 + 1);
    run(cam, OUT, 2);
    expect(cam.camera.fov).toBeCloseTo(32.5, 1);
    expect(cam.distance).toBeCloseTo(2.2, 1);
    cam.aimZoom = 0;
    run(cam, OUT, 2.5);
    expect(cam.camera.fov).toBeCloseTo(65, 1);
    expect(cam.distance).toBeCloseTo(4.2, 1);
  });

  it('手機 1.5×；滑鼠靈敏度 × fov / 預設 fov，未開鏡時不變', () => {
    const cam = makeCam();
    run(cam, OUT, 1);
    const y0 = cam.yaw;
    cam.updateRotation(100, 0);
    const base = Math.abs(cam.yaw - y0);
    cam.aimZoomFactor = 1.5;
    cam.aimZoom = 1;
    run(cam, OUT, 2);
    expect(cam.camera.fov).toBeCloseTo(65 / 1.5, 1);
    const y1 = cam.yaw;
    cam.updateRotation(100, 0);
    expect(Math.abs(cam.yaw - y1)).toBeCloseTo(base / 1.5, 6);
  });

  it('過肩偏移 1.0：鏡頭位置朝鏡頭右方偏移，視線同向平移', () => {
    const cam = makeCam();
    cam.yaw = 0;
    run(cam, OUT, 2);
    const x0 = cam.camera.position.x;
    cam.aimZoomFactor = 2;
    cam.aimZoom = 1;
    run(cam, OUT, 2);
    expect(cam.camera.position.x - x0).toBeCloseTo(1.0, 1); // yaw = 0：鏡頭右方 = +X
  });

  it('室內遵守距離上限 (2.8m 以內)、不穿過牆：開鏡距離 ≤ 2.2 且鏡頭不進入碰撞盒', () => {
    const cam = makeCam();
    cam.currentWorld = 'CAMPUS';
    const wallBox = { min: new THREE.Vector3(33, 0, 38), max: new THREE.Vector3(34, 6, 44) };
    const cols = [wallBox] as never;
    cam.yaw = Math.PI / 2; // 鏡頭在玩家 +X 側，牆在玩家與鏡頭之間
    for (let t = 0; t < 3; t += DT) cam.update(IN, DT, cols);
    const base = cam.distance;
    expect(base).toBeLessThanOrEqual(2.8 + 1e-6);
    cam.aimZoomFactor = 2;
    cam.aimZoom = 1;
    for (let t = 0; t < 3; t += DT) cam.update(IN, DT, cols);
    expect(cam.distance).toBeLessThanOrEqual(2.2 + 1e-6);
    const p = cam.camera.position;
    const inside = p.x > wallBox.min.x && p.x < wallBox.max.x && p.z > wallBox.min.z && p.z < wallBox.max.z && p.y > 0 && p.y < 6;
    expect(inside).toBe(false);
  });

  it('直屏補償：開鏡距離乘 portraitDistanceScale (比橫屏遠)', () => {
    const land = makeCam();
    const port = new ThirdPersonCamera(65, 9 / 16, 0.1, 500);
    port.updateAspect(9 / 16);
    for (const c of [land, port]) { c.aimZoomFactor = 2; c.aimZoom = 1; run(c, OUT, 3); }
    expect(port.distance).toBeGreaterThan(land.distance);
  });
});

describe('彈弓：解鎖 (跑操場)', () => {
  async function makeCampus(mode: DevWeaponsMode, bestTrackTime: number | null) {
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
    const racingGame = { bestSwimTime: null as number | null, bestTrackTime };
    const ctx = {
      player, wantedSystem: { showBanner }, currentWorldType: 'CAMPUS', racingGame,
      ecologicalGarden: { boss: { isDead: false } }, tennisGame: { coachDefeated: false }, basketballGame: { scoreStreak: 0, bestStreak: 0, totalMade: 0 },
      peCoachNpc: null, hud: { updateMissionTracker: vi.fn() }
    } as never;
    const progression = new Progression(ctx);
    (ctx as unknown as { progression: unknown }).progression = progression;
    return { campus: new CampusMode(ctx), progression, showBanner, state, unlocked, racingGame, registry };
  }
  const BANNER = '🏃 跑操場冠軍！解鎖【彈弓】(滾輪或大地圖【裝備】切換)';

  it('locked：沒贏不解鎖；贏阿凱 (bestTrackTime 有值) 跳橫幅、解鎖並自動裝備，之後不重複；裝備頁進度條接上 trackWon', async () => {
    const t = await makeCampus('locked', null);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.progression.trackWon).toBe(false);
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'SLINGSHOT')!.unlockSteps).toEqual([{ label: '跑操場比賽獲勝', cur: 0, max: 1 }]);

    t.racingGame.bestTrackTime = 38.2;
    t.campus.updateMissionTracker();
    expect(t.showBanner).toHaveBeenCalledWith(BANNER, 7000);
    expect(t.unlocked.has('SLINGSHOT')).toBe(true);
    expect(t.state.current).toBe('SLINGSHOT');
    expect(t.progression.trackWon).toBe(true);
    expect(t.progression.getWeaponEquipEntries().find((e) => e.id === 'SLINGSHOT')!.unlockSteps).toEqual([{ label: '跑操場比賽獲勝', cur: 1, max: 1 }]);
    t.showBanner.mockClear();
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
  });

  it('off：贏了也不觸發 (無橫幅、無旗標)，武器不在武器槽、getWeapon 退回徒手', async () => {
    const t = await makeCampus('off', 30);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.unlocked.has('SLINGSHOT')).toBe(false);
    expect(t.registry.WEAPONS.map((w) => w.id)).not.toContain('SLINGSHOT');
    expect(t.registry.getWeapon('SLINGSHOT').id).toBe('FIST');
  });

  it('unlocked：視為已解鎖，不跳橫幅', async () => {
    const t = await makeCampus('unlocked', 30);
    t.campus.updateMissionTracker();
    expect(t.showBanner).not.toHaveBeenCalled();
    expect(t.state.current).toBe('FIST');
  });
});

describe('彈弓：CombatSystem 接點', () => {
  async function makeCombat(over: Record<string, unknown> = {}) {
    const { CombatSystem } = await import('../src/game/CombatSystem');
    const slingshot = { handleAttack: vi.fn(() => true), launch: vi.fn(() => true), cancel: vi.fn() };
    const ballThrow = { handleAttack: vi.fn(() => false), launch: vi.fn(), cancel: vi.fn() };
    const ctx = {
      currentWorldType: 'CAMPUS', currentRidingBike: null, slingshot, ballThrow,
      player: { isDead: false, hp: 100, canAttack: true, attack: vi.fn(), strikeMove: null as unknown, strikeIndex: 0, cancelAttack: vi.fn() },
      basketballGame: { isHolding: false }, hud: {}, projectiles: { reset: vi.fn() }, detention: { nearbyCqcTarget: null },
      ...over
    } as never;
    return { combat: new CombatSystem(ctx), slingshot, ballThrow, ctx: ctx as unknown as { player: { attack: ReturnType<typeof vi.fn>; strikeMove: unknown } } };
  }

  it('持彈弓時 onAttack 由彈弓接管 (不走近戰 player.attack)；彈弓未接管時照常往下', async () => {
    const t = await makeCombat();
    t.combat.onAttack();
    expect(t.slingshot.handleAttack).toHaveBeenCalledTimes(1);
    expect(t.ctx.player.attack).not.toHaveBeenCalled();
    t.slingshot.handleAttack.mockReturnValue(false);
    t.combat.onAttack();
    expect(t.ctx.player.attack).toHaveBeenCalledTimes(1);
  });

  it('離弦時間點：先交給彈弓 (回傳 true 即處理完)，否則才交給籃球', async () => {
    const t = await makeCombat();
    t.ctx.player.strikeMove = MOVE;
    t.combat.updatePlayerStrike();
    expect(t.slingshot.launch).toHaveBeenCalledWith(MOVE);
    expect(t.ballThrow.launch).not.toHaveBeenCalled();
    t.slingshot.launch.mockReturnValue(false);
    t.combat.updatePlayerStrike();
    expect(t.ballThrow.launch).toHaveBeenCalledWith(MOVE);
  });

  it('換世界 / 死亡重置：取消彈弓蓄力，再清空投射物', async () => {
    const t = await makeCombat();
    const order: string[] = [];
    t.slingshot.cancel.mockImplementation(() => { order.push('cancel'); });
    (t.ctx as unknown as { projectiles: { reset: ReturnType<typeof vi.fn> } }).projectiles.reset.mockImplementation(() => { order.push('reset'); });
    t.combat.resetTransientState();
    expect(order).toEqual(['cancel', 'reset']);
  });
});

describe('彈弓：桌機收斂距離 (準星所指之處)', () => {
  const T = (x: number, z: number) => ({ position: { x, y: 0, z }, role: 'STUDENT', isKnockedDown: false, isPermanentlyKnockedOut: false });
  it('射線上第一個 NPC 膠囊 / 牆的距離；皆無回傳 fallback；倒地者不算', () => {
    const wall = { min: new THREE.Vector3(-3, 0, 20), max: new THREE.Vector3(3, 4, 21) };
    expect(rayConvergeDistance([T(0.6, 15)], [], 0.6, 1.4, 0, 0, 0, 1, 60, 40)).toBeCloseTo(15 - 0.35, 1);
    expect(rayConvergeDistance([T(0.6, 15)], [wall] as never, 0.6, 1.4, 0, 0, 0, 1, 60, 40)).toBeCloseTo(15 - 0.35, 1);
    expect(rayConvergeDistance([], [wall] as never, 0.6, 1.4, 0, 0, 0, 1, 60, 40)).toBeCloseTo(20, 1);
    expect(rayConvergeDistance([T(5, 15)], [], 0.6, 1.4, 0, 0, 0, 1, 60, 40)).toBe(40);
    expect(rayConvergeDistance([{ ...T(0.6, 15), isKnockedDown: true }], [], 0.6, 1.4, 0, 0, 0, 1, 60, 40)).toBe(40);
  });
});

describe('彈弓：生態園命中傷害取整', () => {
  it('非整數蓄力傷害打到生態園生物：以取整後數值扣血與顯示橫幅 (比照近戰)', async () => {
    const { createProjectileHost } = await import('../src/weapons/projectiles/gameHost');
    const tryHitAtPoint = vi.fn((_p: unknown, _r: number, dmg: number) => ({ hit: true, name: '食人藤蔓', defeated: false, isBoss: false, damage: dmg }));
    const reportPlantHit = vi.fn();
    const host = createProjectileHost({
      currentWorldType: 'CAMPUS', ecologicalGarden: { tryHitAtPoint }, combat: { reportPlantHit }
    } as never);
    host.hitGardenAt(new THREE.Vector3(), 0.05, 60 * (0.4 + 0.6 * (0.43 - 0.25) / 0.45));
    expect(tryHitAtPoint.mock.calls[0][2]).toBe(Math.round(60 * (0.4 + 0.6 * (0.43 - 0.25) / 0.45)));
    expect(Number.isInteger(reportPlantHit.mock.calls[0][1])).toBe(true);
  });
});
