import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects 於模組載入時會存取 window / document，以任意方法皆為空函式的 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => {} }) }));

import {
  HUMAN_CAPSULE_R, HUMAN_CAPSULE_Y0, HUMAN_CAPSULE_Y1, RETURN_T_MAX, RETURN_T_MIN, returnDuration,
  segmentAabbT, segmentCapsuleT, segmentFloorT
} from '../src/weapons/projectiles/collide';
import {
  BALL_FRICTION, BALL_MAX_BOUNCES, BALL_RESTITUTION, KIND_GRAVITY, PFLAG_BOUNCE_FLOOR, PFLAG_BOUNCE_WALL, PFLAG_RETURN,
  PROJ_BALL, PROJ_MAX, PROJ_STONE, PSTATE_BOUNCE, PSTATE_DEAD, PSTATE_FLY, PSTATE_RETURN, ProjectileSystem,
  createProjectileSpawnOpts, type ProjectileEvent, type ProjectileHost, type ProjectileTarget
} from '../src/weapons/projectiles/ProjectileSystem';
import { SerialSlot } from '../src/game/serialSlot';
import type { CollidableBox } from '../src/world/CampusWorld';
import type { PlayerHitSpec } from '../src/game/CombatSystem';

const N = { x: 0, y: 0, z: 0 };
const STONE_STEP = 70 / 30; // 石子 70 m/s、delta 1/30 一幀 2.33m

describe('線段對垂直膠囊', () => {
  const R = HUMAN_CAPSULE_R + 0.05;
  const Y0 = HUMAN_CAPSULE_Y0, Y1 = HUMAN_CAPSULE_Y1;
  it('高速穿透：70 m/s、1/30s 一幀跨過整個身體仍命中，t 為進入點', () => {
    // 膠囊在一幀線段正中央 (起點與終點都在身體外)
    const t = segmentCapsuleT(0, 1, 0, 0, 1, STONE_STEP, 0, 1.2, Y0, Y1, R);
    expect(t).toBeCloseTo((1.2 - R) / STONE_STEP, 5);
  });
  it('擦邊：側向距離略小於半徑命中、略大於落空', () => {
    expect(segmentCapsuleT(R - 0.01, 1, -2, R - 0.01, 1, 2, 0, 0, Y0, Y1, R)).toBeGreaterThan(0);
    expect(segmentCapsuleT(R + 0.01, 1, -2, R + 0.01, 1, 2, 0, 0, Y0, Y1, R)).toBe(-1);
  });
  it('膠囊端點：頭頂球帽與腳底球帽', () => {
    // 正上方水平掠過：頭頂球帽最高點 Y1 + R
    expect(segmentCapsuleT(0, Y1 + R - 0.01, -2, 0, Y1 + R - 0.01, 2, 0, 0, Y0, Y1, R)).toBeGreaterThan(0);
    expect(segmentCapsuleT(0, Y1 + R + 0.01, -2, 0, Y1 + R + 0.01, 2, 0, 0, Y0, Y1, R)).toBe(-1);
    // 斜上方：只碰得到球帽 (不在圓柱高度內)
    const d = R * 0.9;
    expect(segmentCapsuleT(d, Y1 + 0.1, -2, d, Y1 + 0.1, 2, 0, 0, Y0, Y1, R)).toBeGreaterThan(0);
    expect(segmentCapsuleT(d, Y1 + 0.3, -2, d, Y1 + 0.3, 2, 0, 0, Y0, Y1, R)).toBe(-1);
    // 垂直落下打到頭頂：接觸於 Y1 + R
    const t = segmentCapsuleT(0, 3, 0, 0, 1, 0, 0, 0, Y0, Y1, R);
    expect(3 - 2 * t).toBeCloseTo(Y1 + R, 5);
    // 腳底下方掠過
    expect(segmentCapsuleT(0, Y0 - R - 0.01, -2, 0, Y0 - R - 0.01, 2, 0, 0, Y0, Y1, R)).toBe(-1);
  });
  it('起點已在膠囊內回傳 0；遠離或未到達回傳 -1', () => {
    expect(segmentCapsuleT(0.1, 1, 0, 3, 1, 0, 0, 0, Y0, Y1, R)).toBe(0);
    expect(segmentCapsuleT(0, 1, 2, 0, 1, 4, 0, 0, Y0, Y1, R)).toBe(-1);
    expect(segmentCapsuleT(0, 1, -4, 0, 1, -2, 0, 0, Y0, Y1, R)).toBe(-1);
  });
});

describe('線段對 AABB (slab)', () => {
  // 盒子 [-1, 1]³，外擴 0.1
  const hit = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
    segmentAabbT(ax, ay, az, bx, by, bz, -1, -1, -1, 1, 1, 1, 0.1, N);
  it('六個面：進入 t 與外法線', () => {
    const cases: [number[], number[]][] = [
      [[-3, 0, 0, 3, 0, 0], [-1, 0, 0]],
      [[3, 0, 0, -3, 0, 0], [1, 0, 0]],
      [[0, -3, 0, 0, 3, 0], [0, -1, 0]],
      [[0, 3, 0, 0, -3, 0], [0, 1, 0]],
      [[0, 0, -3, 0, 0, 3], [0, 0, -1]],
      [[0, 0, 3, 0, 0, -3], [0, 0, 1]],
    ];
    for (const [s, n] of cases) {
      const t = hit(s[0], s[1], s[2], s[3], s[4], s[5]);
      expect(t).toBeCloseTo((3 - 1.1) / 6, 5);
      expect([N.x, N.y, N.z]).toEqual(n);
    }
  });
  it('高速穿透薄牆 (0.2m 厚，一幀 2.33m)', () => {
    const t = segmentAabbT(0, 1, 0, 0, 1, STONE_STEP, -2, 0, 1.0, 2, 3, 1.2, 0.05, N);
    expect(t).toBeCloseTo(0.95 / STONE_STEP, 5);
    expect(N.z).toBe(-1);
  });
  it('擦邊、平行於面且在外側、未到達皆落空', () => {
    expect(hit(-3, 1.11, 0, 3, 1.11, 0)).toBe(-1);
    expect(hit(-3, 1.09, 0, 3, 1.09, 0)).toBeGreaterThan(0);
    expect(hit(-3, 0, 0, -1.2, 0, 0)).toBe(-1);
    expect(hit(3, 0, 0, 5, 0, 0)).toBe(-1);
  });
  it('起點在盒內回傳 0，法線與行進主軸相反', () => {
    expect(hit(0, 0, 0, 3, 0.5, 0)).toBe(0);
    expect(N.x).toBe(-1);
  });
});

describe('地板與回收時間', () => {
  it('線段觸地 t、已貼地向下為 0、向上離開為 -1', () => {
    expect(segmentFloorT(2, -2, 0.1, 0)).toBeCloseTo(1.9 / 4, 5);
    expect(segmentFloorT(0.1, 0.05, 0.1, 0)).toBe(0);
    expect(segmentFloorT(0.1, 0.5, 0.1, 0)).toBe(-1);
    expect(segmentFloorT(5, 1, 0.1, 2)).toBeCloseTo(2.9 / 4, 5); // 樓板高 2
    expect(segmentFloorT(5, 4, 0.1, 0)).toBe(-1);
  });
  it('T = clamp(d / 60, 0.1, 0.3)', () => {
    expect(RETURN_T_MIN).toBe(0.1);
    expect(RETURN_T_MAX).toBe(0.3);
    expect(returnDuration(2)).toBe(RETURN_T_MIN);
    expect(returnDuration(12)).toBeCloseTo(0.2);
    expect(returnDuration(40)).toBe(RETURN_T_MAX);
  });
});

// ===== ProjectileSystem (mock host) =====
interface Target extends ProjectileTarget { position: THREE.Vector3; role: string; isKnockedDown: boolean; isPermanentlyKnockedOut: boolean; lastHitResult: 'BLOCKED' | 'HIT' | 'KO' }
function makeTarget(x: number, z: number, role = 'STUDENT'): Target {
  return { position: new THREE.Vector3(x, 0, z), role, isKnockedDown: false, isPermanentlyKnockedOut: false, lastHitResult: 'HIT' };
}
function box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): CollidableBox {
  return { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ) };
}
function makeHost(targets: Target[] = [], colliders: CollidableBox[] = []) {
  const hits: { target: ProjectileTarget; serial: number; dirX: number; dirZ: number; useAttackDir: boolean; feedback: string }[] = [];
  const hitStops: number[] = [];
  const sounds: string[] = [];
  let blockNext = false;
  const host: ProjectileHost = {
    targets, colliders, cameraPosition: new THREE.Vector3(0, 5, -10),
    hitTarget: (t: ProjectileTarget, spec: PlayerHitSpec) => {
      hits.push({ target: t, serial: spec.serial, dirX: spec.attackDirX, dirZ: spec.attackDirZ, useAttackDir: spec.useAttackDir, feedback: spec.feedback });
      if (blockNext) { (t as Target).lastHitResult = 'BLOCKED'; return false; }
      (t as Target).lastHitResult = 'HIT';
      return true;
    },
    hitGardenAt: () => null,
    requestHitStop: (s) => { hitStops.push(s); },
    playSound: (id) => { sounds.push(id); },
    hitFlash: () => {},
    dust: () => {}
  };
  return { host, hits, hitStops, sounds, setBlock: (b: boolean) => { blockNext = b; } };
}
function recordEvents(): { list: ProjectileEvent[]; cb: (e: ProjectileEvent) => void } {
  const list: ProjectileEvent[] = [];
  return { list, cb: (e) => { list.push({ ...e, point: e.point.clone(), normal: e.normal.clone(), velocity: e.velocity.clone() }); } };
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('物理：重力與射程', () => {
  it('半隱式 Euler：石子重力 6，n 幀後 vy = -g·t、y = y0 - g·dt²·n(n+1)/2', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    const op = createProjectileSpawnOpts(PROJ_STONE);
    op.maxRange = 1000;
    const i = sys.spawn(PROJ_STONE, V(0, 50, 0), V(0, 0, 10), op);
    const dt = 1 / 60;
    for (let n = 0; n < 30; n++) sys.update(dt);
    expect(KIND_GRAVITY[PROJ_STONE]).toBe(6);
    expect(sys.vel[i * 3 + 1]).toBeCloseTo(-6 * 0.5, 4);
    expect(sys.pos[i * 3 + 1]).toBeCloseTo(50 - 6 * dt * dt * 30 * 31 / 2, 3);
    expect(sys.pos[i * 3 + 2]).toBeCloseTo(5, 3);
  });
  it('水平距發射點超過最大射程後重力加倍；球重力 14', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    const op = createProjectileSpawnOpts(PROJ_STONE);
    op.maxRange = 5;
    const i = sys.spawn(PROJ_STONE, V(0, 50, 0), V(0, 0, 10), op);
    const dt = 0.1;
    sys.update(dt); // 起點 0m (未超過)
    expect(sys.vel[i * 3 + 1]).toBeCloseTo(-0.6, 5);
    for (let n = 0; n < 5; n++) sys.update(dt); // 本幀起點已達 5m
    const vy = sys.vel[i * 3 + 1];
    sys.update(dt); // 起點 6m > 5m：重力加倍
    expect(sys.vel[i * 3 + 1] - vy).toBeCloseTo(-1.2, 5);
    expect(KIND_GRAVITY[PROJ_BALL]).toBe(14);
  });
});

describe('物理：彈地與撞牆', () => {
  it('球彈地：恢復係數 0.55、摩擦 0.75，最多 2 次，之後 (無回收) 消失', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    const ev = recordEvents();
    const op = createProjectileSpawnOpts(PROJ_BALL);
    op.flags = PFLAG_BOUNCE_FLOOR;
    op.maxLife = 100;
    op.onEvent = ev.cb;
    const i = sys.spawn(PROJ_BALL, V(0, 6, 0), V(4, 0, 0), op);
    for (let n = 0; n < 2000 && sys.isAlive(i); n++) sys.update(1 / 120);
    const floors = ev.list.filter(e => e.type === 'FLOOR');
    expect(floors.length).toBe(BALL_MAX_BOUNCES + 1);
    expect(sys.state[i]).toBe(PSTATE_DEAD);
    // 第 1 次觸地前後：水平 × 0.75 (由第 2 次觸地前的速度反推)、垂直反向 × 0.55
    expect(floors[0].bounces).toBe(0);
    expect(floors[1].bounces).toBe(1);
    expect(floors[1].velocity.x).toBeCloseTo(4 * BALL_FRICTION, 4);
    expect(floors[2].velocity.x).toBeCloseTo(4 * BALL_FRICTION * BALL_FRICTION, 4);
    // 對稱拋物線：第 2 次觸地速度 ≈ 第 1 次反彈速度 (容許離散誤差)
    expect(-floors[1].velocity.y).toBeCloseTo(-floors[0].velocity.y * BALL_RESTITUTION, 0);
    expect(floors[0].point.y).toBeCloseTo(0.12, 5);
  });
  it('球撞牆：沿法線反射後 × 0.5；石子撞牆即消失', () => {
    const wall = [box(5, 0, -5, 6, 4, 5)];
    const { host } = makeHost([], wall);
    const sys = new ProjectileSystem(host);
    const ev = recordEvents();
    const op = createProjectileSpawnOpts(PROJ_BALL);
    op.flags = PFLAG_BOUNCE_WALL;
    op.gravity = 0;
    op.onEvent = ev.cb;
    const i = sys.spawn(PROJ_BALL, V(0, 1, 0), V(20, 0, 3), op);
    for (let n = 0; n < 30; n++) sys.update(1 / 60);
    const w = ev.list.find(e => e.type === 'WALL')!;
    expect(w.normal.x).toBe(-1);
    expect(w.point.x).toBeCloseTo(5 - 0.12, 4);
    expect(sys.vel[i * 3]).toBeCloseTo(-10, 4);
    expect(sys.vel[i * 3 + 2]).toBeCloseTo(1.5, 4);

    const st = createProjectileSpawnOpts(PROJ_STONE);
    st.onEvent = ev.cb;
    const j = sys.spawn(PROJ_STONE, V(0, 1, 0), V(70, 0, 0), st);
    sys.update(1 / 30);
    sys.update(1 / 30); // 第 2 幀跨越牆面 (2.33 → 4.67 → 牆 5)
    sys.update(1 / 30);
    expect(sys.state[j]).toBe(PSTATE_DEAD);
  });
});

describe('物理：命中 NPC', () => {
  it('石子 70 m/s、delta 1/30 不穿透：命中第一個 NPC，帶行進方向與 feedback NONE，停格 HIT_STOP_EXTRA', () => {
    const a = makeTarget(0, 10);
    const b = makeTarget(0, 11.5);
    const { host, hits, hitStops } = makeHost([b, a]);
    const sys = new ProjectileSystem(host);
    const op = createProjectileSpawnOpts(PROJ_STONE);
    op.serial = 7;
    const i = sys.spawn(PROJ_STONE, V(0, 1.3, 0), V(0, 0, 70), op);
    for (let n = 0; n < 10; n++) sys.update(1 / 30);
    expect(hits.length).toBe(1);
    expect(hits[0].target).toBe(a);
    expect(hits[0].serial).toBe(7);
    expect(hits[0].useAttackDir).toBe(true);
    expect(hits[0].dirZ).toBeCloseTo(1, 5);
    expect(hits[0].feedback).toBe('NONE');
    expect(hitStops).toEqual([0.024]);
    expect(sys.state[i]).toBe(PSTATE_DEAD);
  });
  it('倒地 / 永久擊倒略過；犬型膠囊較矮', () => {
    const down = makeTarget(0, 5);
    down.isKnockedDown = true;
    const dog = makeTarget(0, 10, 'DOG');
    const { host, hits } = makeHost([down, dog]);
    const sys = new ProjectileSystem(host);
    const op = createProjectileSpawnOpts(PROJ_STONE);
    op.gravity = 0;
    sys.spawn(PROJ_STONE, V(0, 1.3, 0), V(0, 0, 70), op); // 胸高：越過校犬
    for (let n = 0; n < 10; n++) sys.update(1 / 30);
    expect(hits.length).toBe(0);
    sys.spawn(PROJ_STONE, V(0, 0.5, 0), V(0, 0, 70), op);
    for (let n = 0; n < 10; n++) sys.update(1 / 30);
    expect(hits.length).toBe(1);
    expect(hits[0].target).toBe(dog);
  });
  it('serial 一發一次：球命中後反彈不再傷人，通緝閘門每發只過一次', () => {
    const a = makeTarget(0, 6);
    const behind = makeTarget(0, 3); // 反彈路徑上
    const { host, hits } = makeHost([a]);
    const sys = new ProjectileSystem(host);
    const op = createProjectileSpawnOpts(PROJ_BALL);
    op.serial = 42;
    op.returnTarget = (out) => { out.set(0, 1.2, 0); };
    const i = sys.spawn(PROJ_BALL, V(0, 1.3, 0.6), V(0, 0, 24), op);
    for (let n = 0; n < 15 && hits.length === 0; n++) sys.update(1 / 60);
    expect(hits.length).toBe(1);
    expect(sys.state[i]).toBe(PSTATE_BOUNCE);
    (host.targets as Target[]).push(behind);
    for (let n = 0; n < 120; n++) sys.update(1 / 60);
    expect(hits.length).toBe(1);
    // 通緝閘門 (CombatSystem.takeCrimeSlot 同款)：同一 serial 只結算一次，下一發新 serial 可再結算
    const slot = new SerialSlot();
    expect(hits.map(h => slot.take(h.serial))).toEqual([true]);
    expect(slot.take(42)).toBe(false);
    expect(slot.take(43)).toBe(true);
  });
  it('被盾擋 (BLOCKED / 金鐘護盾)：回傳結果寫入事件並照常反彈', () => {
    const a = makeTarget(0, 6, 'DETENTION_BOSS');
    const { host, setBlock, hitStops } = makeHost([a]);
    setBlock(true);
    const sys = new ProjectileSystem(host);
    const ev = recordEvents();
    const op = createProjectileSpawnOpts(PROJ_BALL);
    op.onEvent = ev.cb;
    op.returnTarget = (out) => { out.set(0, 1.2, 0); };
    const i = sys.spawn(PROJ_BALL, V(0, 1.3, 0.6), V(0, 0, 24), op);
    for (let n = 0; n < 20; n++) sys.update(1 / 60);
    const e = ev.list.find(x => x.type === 'NPC')!;
    expect(e.applied).toBe(false);
    expect(e.result).toBe('BLOCKED');
    expect(hitStops.length).toBe(0); // 未成立不停格
    expect([PSTATE_BOUNCE, PSTATE_RETURN]).toContain(sys.state[i]);
  });
});

describe('物理：回收 (RETURN)', () => {
  it('二次貝茲：T = clamp(d/60)，終點每幀追蹤移動中的目標，到時接住', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    const ev = recordEvents();
    const target = V(10, 1, 0);
    const op = createProjectileSpawnOpts(PROJ_BALL);
    op.gravity = 0;
    op.onEvent = ev.cb;
    op.returnTarget = (out) => { out.copy(target); };
    const i = sys.spawn(PROJ_BALL, V(0, 1, 0), V(0, 0, 0), op);
    sys.recall(i);
    expect(sys.state[i]).toBe(PSTATE_RETURN);
    const dt = 1 / 100;
    let t = 0;
    while (sys.isAlive(i) && t < 2) {
      target.z += 2 * dt; // 目標側移 2 m/s
      sys.update(dt);
      t += dt;
    }
    const c = ev.list.find(e => e.type === 'CATCH')!;
    expect(c).toBeDefined();
    // d = 10 → T = 1/6 s；距目標 0.6m 內提前接住
    expect(t).toBeLessThanOrEqual(10 / 60 + 0.01 + 1e-6);
    expect(t).toBeGreaterThan(0.12);
    expect(c.point.distanceTo(target)).toBeLessThan(0.6);
  });
  it('彈地 2 次後開始回收；保險壽命到期也回收', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    const op = createProjectileSpawnOpts(PROJ_BALL);
    op.flags = PFLAG_BOUNCE_FLOOR | PFLAG_RETURN;
    op.maxLife = 100;
    op.returnTarget = (out) => { out.set(0, 1.2, 0); };
    const i = sys.spawn(PROJ_BALL, V(0, 4, 0), V(3, 0, 0), op);
    let n = 0;
    while (sys.state[i] === PSTATE_FLY && n++ < 2000) sys.update(1 / 120);
    expect(sys.state[i]).toBe(PSTATE_RETURN);
    expect(sys.bounces[i]).toBe(BALL_MAX_BOUNCES);

    const op2 = createProjectileSpawnOpts(PROJ_BALL);
    op2.gravity = 0;
    op2.maxLife = 0.5;
    op2.returnTarget = op.returnTarget;
    const j = sys.spawn(PROJ_BALL, V(0, 30, 0), V(1, 0, 0), op2);
    for (let k = 0; k < 49; k++) sys.update(0.01);
    expect(sys.state[j]).toBe(PSTATE_FLY);
    sys.update(0.02);
    expect(sys.state[j]).toBe(PSTATE_RETURN);
  });
});

describe('物件池', () => {
  it('池滿拒絕發射 (回傳 -1)，飛行中的彈體不受影響；reset 清空', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    sys.init(new THREE.Scene());
    const op = createProjectileSpawnOpts(PROJ_STONE);
    op.gravity = 0;
    const slots: number[] = [];
    for (let k = 0; k < PROJ_MAX; k++) slots.push(sys.spawn(PROJ_STONE, V(0, 30, k), V(1, 0, 0), op));
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    sys.update(0.1);
    const x0 = sys.pos[0];
    expect(sys.spawn(PROJ_STONE, V(0, 30, 0), V(1, 0, 0), op)).toBe(-1);
    expect(sys.pos[0]).toBe(x0);
    expect(sys.active).toBe(PROJ_MAX);
    sys.reset();
    expect(sys.active).toBe(0);
    expect(sys.spawn(PROJ_BALL, V(0, 30, 0), V(1, 0, 0), op)).toBe(0);
  });
  it('閒置時不走訪；網格只在有彈體時顯示', () => {
    const { host } = makeHost();
    const sys = new ProjectileSystem(host);
    const scene = new THREE.Scene();
    sys.init(scene);
    const meshes = scene.children.filter(c => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    expect(meshes.every(m => !m.visible)).toBe(true);
    const op = createProjectileSpawnOpts(PROJ_STONE);
    const i = sys.spawn(PROJ_STONE, V(0, 30, 0), V(1, 0, 0), op);
    expect(meshes.filter(m => m.visible).length).toBe(1);
    sys.kill(i);
    expect(meshes.every(m => !m.visible)).toBe(true);
  });
});
