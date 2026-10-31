import * as THREE from 'three';
import type { CollidableBox } from '../../world/CampusWorld';
import type { NpcHitResult } from '../../entities/NPC';
import type { PlayerHitMode } from '../../entities/shared/kungfu';
import type { LaunchCap } from '../launch';
import { getSupportFloorY, queryColliders } from '../../physics/aabb';
import { updateVisibleMatricesOnly } from '../../core/matrixUpdate';
import { getFxQuality } from '../../effects/fxQuality';
import { tracerFX } from '../../effects/TracerFX';
import { createPlayerHitSpec, HIT_STOP_EXTRA, type PlayerHitSpec } from '../../game/CombatSystem';
import {
  DOG_CAPSULE_R, DOG_CAPSULE_Y0, DOG_CAPSULE_Y1, HUMAN_CAPSULE_R, HUMAN_CAPSULE_Y0, HUMAN_CAPSULE_Y1,
  isCanineRole, quadBezier, returnDuration, segmentAabbT, segmentCapsuleT, segmentFloorT
} from './collide';

// 共用投射物系統 (籃球 / 彈弓石子等)：固定 PROJ_MAX 槽的物件池，位置 / 上一幀位置 / 速度存於 Float32Array，執行期零配置。
// 每種彈體一個 InstancedMesh (閒置隱藏 = 0 draw call)，飛行光痕由 TracerFX (1 draw call) 繪製。
// 每幀以 prevPos → pos 線段解析式掃掠：NPC 垂直膠囊、牆 AABB (slab)、地板、生態園生物，取 t 最小者為命中 (禁止 THREE.Raycaster)。
// 狀態：FLY 飛行 (可傷人) → 命中 / 落地 / 逾時後 DEAD，或 (旗標允許時) BOUNCE 反彈 (不傷人) / RETURN 二次貝茲回收到回呼提供的終點。
// 池滿時拒絕發射 (spawn 回傳 -1)：回收中的球必須存活到被接住，覆蓋最舊槽會讓持有者狀態機失去它的球。

export const PROJ_MAX = 8;
export const PROJ_BALL = 0;
export const PROJ_STONE = 1;
export type ProjectileKind = 0 | 1;
const KIND_COUNT = 2;

// 各彈體預設：重力 (m/s²)、碰撞半徑 (m)、模型相對碰撞半徑的顯示倍率
export const KIND_GRAVITY: readonly number[] = [14, 6];
export const KIND_RADIUS: readonly number[] = [0.12, 0.05];
const KIND_VISUAL_SCALE: readonly number[] = [1, 1.2];

export const PSTATE_DEAD = 0;
export const PSTATE_FLY = 1;
export const PSTATE_BOUNCE = 2;
export const PSTATE_RETURN = 3;

// 行為旗標
export const PFLAG_BOUNCE_FLOOR = 1; // 落地反彈 (否則落地即結束)
export const PFLAG_BOUNCE_WALL = 2;  // 撞牆沿法線反射 (否則撞牆即結束)
export const PFLAG_RETURN = 4;       // 結束時改為回收 (RETURN) 到 returnTarget；命中目標後先反彈 reboundDelay 秒
export const PFLAG_TRACER = 8;       // 飛行中顯示光痕 (中 / 高檔)

export const BALL_RESTITUTION = 0.55; // 彈地恢復係數 (垂直速度保留比例)
export const BALL_FRICTION = 0.75;    // 彈地水平速度保留比例
export const BALL_MAX_BOUNCES = 2;
export const WALL_RESTITUTION = 0.5;  // 撞牆反射後速度倍率
export const RETURN_CATCH_DIST = 0.6; // 回收時距終點此距離內即接住
const MIN_BOUNCE_VY = 1.0;            // 落地垂直速度低於此值不再彈起 (視為停住)
const WALL_SEPARATION = 0.01;         // 撞牆後沿法線離開外擴面距離
const NPC_BROAD_PAD = 1.0;            // NPC XZ 粗篩額外半徑 (含膠囊半徑)
const GARDEN_SAMPLE_STEP = 0.5;       // 生態園點判定沿線段取樣間距 (m)
const MAX_SPIN_STEP = 0.5;            // 每幀自轉角上限 (rad，避免高速彈體頻閃)

export type ProjectileSoundId = 'throwWhoosh' | 'ballHit' | 'stoneHit' | 'ballCatch' | 'dribble';
export type ProjectileEventType = 'NPC' | 'GARDEN' | 'WALL' | 'FLOOR' | 'CATCH' | 'EXPIRE';

// 可被投射物命中的角色 (NPC 結構子集，便於測試)
export interface ProjectileTarget {
  readonly position: THREE.Vector3;
  readonly role: string;
  readonly isKnockedDown: boolean;
  readonly isPermanentlyKnockedOut: boolean;
  readonly lastHitResult: NpcHitResult;
}

export interface ProjectileGardenHit { hit: boolean; name: string; defeated: boolean; isBoss: boolean; damage: number }

// 遊戲端介面：目標名單、碰撞盒、命中結算與回饋 (見 gameHost.ts)；測試以 mock 取代
export interface ProjectileHost {
  readonly targets: readonly ProjectileTarget[];
  readonly colliders: CollidableBox[];
  readonly cameraPosition: THREE.Vector3;
  // 結算命中 (CombatSystem.applyPlayerHitToNpc)：false = 總教官金鐘護盾擋下
  hitTarget(target: ProjectileTarget, spec: PlayerHitSpec): boolean;
  // 生態園點判定 (含扣血與獎勵結算)；本世界無生態園回傳 null
  hitGardenAt(point: THREE.Vector3, r: number, damage: number): ProjectileGardenHit | null;
  requestHitStop(seconds: number): void;
  playSound(id: ProjectileSoundId, pos: THREE.Vector3): void;
  hitFlash(pos: THREE.Vector3, color: number): void;
  dust(pos: THREE.Vector3, normal: THREE.Vector3): void;
}

// 事件 (命中 / 撞牆 / 落地 / 接住 / 逾時)：預配置單一結構，回呼內立即取用，勿保留參照
export interface ProjectileEvent {
  type: ProjectileEventType;
  slot: number;
  kind: ProjectileKind;
  serial: number;
  readonly point: THREE.Vector3;    // 撞擊點 (彈體中心)
  readonly normal: THREE.Vector3;   // 撞擊面法線 (NPC / 生態園為速度反向)
  readonly velocity: THREE.Vector3; // 撞擊前速度
  target: ProjectileTarget | null;
  result: NpcHitResult | null;      // NPC 防禦結果 (lastHitResult)
  applied: boolean;                 // NPC：結算成立 (false = 金鐘護盾)
  hitHeight: number;                // 命中點高於目標腳底 (爆頭判定用)
  garden: ProjectileGardenHit | null;
  bounces: number;
}

// 發射參數 (呼叫端預配置重用；spawn 時複製進槽位，之後修改不影響已發射者)
export interface ProjectileSpawnOpts {
  radius: number;       // 碰撞半徑 (≤ 0 = 依種類預設)
  gravity: number;      // 重力 (< 0 = 依種類預設)；水平距發射點超過 maxRange 後加倍
  maxRange: number;
  maxLife: number;      // 保險壽命 (秒)：到期回收 (PFLAG_RETURN) 或消失
  damage: number;
  knockback: number;
  mode: PlayerHitMode;
  shoveDist: number;
  launchCap: LaunchCap | null;
  serial: number;       // 發射當下的出招序號 (同一序號只通緝 / 提示一次)
  flags: number;
  maxBounces: number;
  restitution: number;
  friction: number;
  wallRestitution: number;
  reboundBack: number;  // 命中目標後反彈：沿行進反向速度
  reboundUp: number;    //                  向上速度
  reboundDelay: number; //                  反彈多久後開始回收
  hitStop: number;      // 命中停格 (真實秒)
  hitFlashColor: number;// 命中閃光顏色 (< 0 = 不出)
  hitDust: boolean;     // 命中 / 撞牆 / 落地結束時噴煙塵
  launchSound: ProjectileSoundId | null;
  hitSound: ProjectileSoundId | null;
  wallSound: ProjectileSoundId | null;
  floorSound: ProjectileSoundId | null;
  catchSound: ProjectileSoundId | null;
  tracerColor: number;
  tracerHalfWidth: number;
  returnTarget: ((out: THREE.Vector3) => void) | null; // 回收終點 (每幀呼叫；需預先建立的函式)
  onEvent: ((ev: ProjectileEvent) => void) | null;     // 事件回呼 (需預先建立的函式)；回呼內可 kill / recall 改寫預設處置
}

export function createProjectileSpawnOpts(kind: ProjectileKind): ProjectileSpawnOpts {
  const ball = kind === PROJ_BALL;
  return {
    radius: 0, gravity: -1, maxRange: ball ? 18 : 50, maxLife: ball ? 2 : 3,
    damage: 0, knockback: 0, mode: 'LIGHT', shoveDist: 0, launchCap: null, serial: -1,
    flags: PFLAG_TRACER | (ball ? PFLAG_BOUNCE_FLOOR | PFLAG_BOUNCE_WALL | PFLAG_RETURN : 0),
    maxBounces: BALL_MAX_BOUNCES, restitution: BALL_RESTITUTION, friction: BALL_FRICTION, wallRestitution: WALL_RESTITUTION,
    reboundBack: 6, reboundUp: 5, reboundDelay: 0.2,
    hitStop: HIT_STOP_EXTRA, hitFlashColor: ball ? 0xff8a2a : 0xffffff, hitDust: true,
    launchSound: 'throwWhoosh', hitSound: ball ? 'ballHit' : 'stoneHit', wallSound: ball ? 'dribble' : 'stoneHit',
    floorSound: ball ? 'dribble' : 'stoneHit', catchSound: ball ? 'ballCatch' : null,
    tracerColor: ball ? 0xffb066 : 0xfff2cc, tracerHalfWidth: ball ? 0.09 : 0.04,
    returnTarget: null, onEvent: null
  };
}

function copyOpts(s: ProjectileSpawnOpts, d: ProjectileSpawnOpts) {
  d.radius = s.radius; d.gravity = s.gravity; d.maxRange = s.maxRange; d.maxLife = s.maxLife;
  d.damage = s.damage; d.knockback = s.knockback; d.mode = s.mode; d.shoveDist = s.shoveDist; d.launchCap = s.launchCap; d.serial = s.serial;
  d.flags = s.flags; d.maxBounces = s.maxBounces; d.restitution = s.restitution; d.friction = s.friction; d.wallRestitution = s.wallRestitution;
  d.reboundBack = s.reboundBack; d.reboundUp = s.reboundUp; d.reboundDelay = s.reboundDelay;
  d.hitStop = s.hitStop; d.hitFlashColor = s.hitFlashColor; d.hitDust = s.hitDust;
  d.launchSound = s.launchSound; d.hitSound = s.hitSound; d.wallSound = s.wallSound; d.floorSound = s.floorSound; d.catchSound = s.catchSound;
  d.tracerColor = s.tracerColor; d.tracerHalfWidth = s.tracerHalfWidth;
  d.returnTarget = s.returnTarget; d.onEvent = s.onEvent;
}

interface Vec3Like { x: number; y: number; z: number }

// 模組層級暫存 (零配置)
const HIT_NONE = 0, HIT_FLOOR = 1, HIT_WALL = 2, HIT_NPC = 3, HIT_GARDEN = 4;
const _event: ProjectileEvent = {
  type: 'NPC', slot: 0, kind: PROJ_BALL, serial: 0,
  point: new THREE.Vector3(), normal: new THREE.Vector3(), velocity: new THREE.Vector3(),
  target: null, result: null, applied: false, hitHeight: 0, garden: null, bounces: 0
};
const _wallNear: CollidableBox[] = [];
const _n = { x: 0, y: 0, z: 0 };
const _hitNormal = new THREE.Vector3();
const _point = new THREE.Vector3();
const _ret = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

function buildBallGeometry(): THREE.BufferGeometry {
  // 12×8 段球，縫線 (赤道 + 兩條經線) 以頂點色烘焙
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0xd5621c);
  const seam = new THREE.Color(0x2a160c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const c = Math.abs(x) < 0.14 || Math.abs(y) < 0.14 ? seam : base;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export class ProjectileSystem {
  readonly pos = new Float32Array(PROJ_MAX * 3);
  readonly prevPos = new Float32Array(PROJ_MAX * 3);
  readonly vel = new Float32Array(PROJ_MAX * 3);
  private readonly origin = new Float32Array(PROJ_MAX * 3);
  private readonly retFrom = new Float32Array(PROJ_MAX * 3);
  private readonly rot = new Float32Array(PROJ_MAX * 4);
  readonly kind = new Uint8Array(PROJ_MAX);
  readonly state = new Uint8Array(PROJ_MAX);
  readonly flags = new Uint8Array(PROJ_MAX);
  readonly bounces = new Uint8Array(PROJ_MAX);
  readonly serial = new Int32Array(PROJ_MAX);
  readonly damage = new Float32Array(PROJ_MAX);
  private readonly radius = new Float32Array(PROJ_MAX);
  private readonly gravity = new Float32Array(PROJ_MAX);
  private readonly life = new Float32Array(PROJ_MAX);
  private readonly timer = new Float32Array(PROJ_MAX);     // BOUNCE：開始回收倒數
  private readonly retT = new Float32Array(PROJ_MAX);      // RETURN：總秒數
  private readonly retElapsed = new Float32Array(PROJ_MAX);
  private readonly retArc = new Float32Array(PROJ_MAX);    // RETURN：控制點抬高
  private readonly gen = new Uint32Array(PROJ_MAX);        // 槽位狀態轉換計數 (事件回呼改寫處置的偵測)
  private readonly opts: ProjectileSpawnOpts[] = [];
  private readonly meshes: (THREE.InstancedMesh | null)[] = [null, null];
  private readonly kindActive = new Int32Array(KIND_COUNT);
  private readonly spec = createPlayerHitSpec();
  private activeCount = 0;

  constructor(private readonly host: ProjectileHost) {
    for (let i = 0; i < PROJ_MAX; i++) {
      this.opts.push(createProjectileSpawnOpts(PROJ_BALL));
      this.rot[i * 4 + 3] = 1;
    }
  }

  get active(): number {
    return this.activeCount;
  }

  // 預建各彈體 InstancedMesh 與光痕 (閒置 visible=false：0 draw call、不走訪矩陣)
  public init(scene: THREE.Object3D) {
    if (this.meshes[0]) return;
    const ballMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8b857c, flatShading: true });
    this.meshes[PROJ_BALL] = this.createMesh(buildBallGeometry(), ballMat, scene);
    this.meshes[PROJ_STONE] = this.createMesh(new THREE.IcosahedronGeometry(1, 0), stoneMat, scene);
    tracerFX.init(scene);
  }

  private createMesh(geo: THREE.BufferGeometry, mat: THREE.Material, scene: THREE.Object3D): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, PROJ_MAX);
    for (let i = 0; i < PROJ_MAX; i++) mesh.setMatrixAt(i, _zeroMatrix);
    mesh.frustumCulled = false; // 實例每幀移動，略過整體包圍球剔除
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    updateVisibleMatricesOnly(mesh);
    scene.add(mesh);
    return mesh;
  }

  // 暫時顯示以便 renderer.compile 預熱 shader (初始化、進入世界與畫質切換後各呼叫一次)
  public prewarm(compile: () => void) {
    for (let k = 0; k < KIND_COUNT; k++) { const m = this.meshes[k]; if (m) m.visible = true; }
    compile();
    for (let k = 0; k < KIND_COUNT; k++) { const m = this.meshes[k]; if (m) m.visible = this.kindActive[k] > 0; }
    tracerFX.prewarm(compile);
  }

  // 發射：回傳槽號；池滿回傳 -1 (拒絕發射，不影響飛行中的彈體)
  public spawn(kind: ProjectileKind, origin: Vec3Like, velocity: Vec3Like, opts: ProjectileSpawnOpts): number {
    let i = -1;
    for (let k = 0; k < PROJ_MAX; k++) {
      if (this.state[k] === PSTATE_DEAD) { i = k; break; }
    }
    if (i < 0) return -1;
    const o = i * 3;
    this.pos[o] = this.prevPos[o] = this.origin[o] = origin.x;
    this.pos[o + 1] = this.prevPos[o + 1] = this.origin[o + 1] = origin.y;
    this.pos[o + 2] = this.prevPos[o + 2] = this.origin[o + 2] = origin.z;
    this.vel[o] = velocity.x; this.vel[o + 1] = velocity.y; this.vel[o + 2] = velocity.z;
    const r = i * 4;
    this.rot[r] = 0; this.rot[r + 1] = 0; this.rot[r + 2] = 0; this.rot[r + 3] = 1;
    const op = this.opts[i];
    copyOpts(opts, op);
    this.kind[i] = kind;
    this.state[i] = PSTATE_FLY;
    this.flags[i] = op.flags;
    this.bounces[i] = 0;
    this.serial[i] = op.serial;
    this.damage[i] = op.damage;
    this.radius[i] = op.radius > 0 ? op.radius : KIND_RADIUS[kind];
    this.gravity[i] = op.gravity >= 0 ? op.gravity : KIND_GRAVITY[kind];
    this.life[i] = 0;
    this.timer[i] = 0;
    this.gen[i]++;
    this.activeCount++;
    this.kindActive[kind]++;
    const mesh = this.meshes[kind];
    if (mesh) mesh.visible = true;
    if (op.launchSound) this.host.playSound(op.launchSound, _point.set(origin.x, origin.y, origin.z));
    return i;
  }

  public isAlive(slot: number): boolean {
    return this.state[slot] !== PSTATE_DEAD;
  }

  public getPosition(slot: number, out: THREE.Vector3): THREE.Vector3 {
    const o = slot * 3;
    return out.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
  }

  // 立即移除 (不發事件)；換武器 / 上車等由持有者呼叫
  public kill(slot: number) {
    if (this.state[slot] === PSTATE_DEAD) return;
    this.state[slot] = PSTATE_DEAD;
    this.gen[slot]++;
    this.activeCount--;
    const k = this.kind[slot];
    this.kindActive[k]--;
    const mesh = this.meshes[k];
    if (mesh) {
      mesh.setMatrixAt(slot, _zeroMatrix);
      mesh.instanceMatrix.needsUpdate = true;
      if (this.kindActive[k] === 0) mesh.visible = false;
    }
    tracerFX.clear(slot);
  }

  // 強制開始回收 (需有 returnTarget；否則直接移除)
  public recall(slot: number) {
    if (this.state[slot] === PSTATE_DEAD || this.state[slot] === PSTATE_RETURN) return;
    this.startReturn(slot);
  }

  // 清空所有投射物 (換世界 / 死亡 / 上車)，不發事件、不配置
  public reset() {
    for (let i = 0; i < PROJ_MAX; i++) this.kill(i);
    tracerFX.reset();
  }

  public update(delta: number) {
    if (this.activeCount === 0 || delta <= 0) return; // 閒置不走訪；停格 / 計量表暫停 (delta = 0) 時凍結
    for (let i = 0; i < PROJ_MAX; i++) {
      const st = this.state[i];
      if (st === PSTATE_DEAD) continue;
      if (st === PSTATE_RETURN) this.stepReturn(i, delta);
      else this.stepPhysics(i, delta);
    }
    this.syncVisuals();
  }

  // 半隱式 Euler (先更新速度再更新位置) + 本幀線段碰撞
  private stepPhysics(i: number, dt: number) {
    const o = i * 3;
    const p = this.pos, v = this.vel, pp = this.prevPos;
    const op = this.opts[i];
    pp[o] = p[o]; pp[o + 1] = p[o + 1]; pp[o + 2] = p[o + 2];
    const hx = p[o] - this.origin[o], hz = p[o + 2] - this.origin[o + 2];
    const g = hx * hx + hz * hz > op.maxRange * op.maxRange ? this.gravity[i] * 2 : this.gravity[i];
    v[o + 1] -= g * dt;
    p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
    this.spin(i, dt);
    this.life[i] += dt;

    const g0 = this.gen[i];
    this.sweep(i);
    if (this.gen[i] !== g0) return; // 已結束 / 轉為回收
    if (this.state[i] === PSTATE_BOUNCE) {
      this.timer[i] -= dt;
      if (this.timer[i] <= 0) { this.startReturn(i); return; }
    }
    if (this.life[i] >= op.maxLife) this.expire(i);
  }

  // 本幀線段 prevPos → pos 對 地板 / 牆 / NPC / 生態園 取 t 最小者並處置
  private sweep(i: number) {
    const o = i * 3;
    const p = this.pos, pp = this.prevPos;
    const ax = pp[o], ay = pp[o + 1], az = pp[o + 2];
    const bx = p[o], by = p[o + 1], bz = p[o + 2];
    const r = this.radius[i];
    const colliders = this.host.colliders;
    let bestT = 2;
    let hitType = HIT_NONE;
    let hitTarget: ProjectileTarget | null = null;

    // 地板：終點下方支撐面 (不高於起點中心)；無樓板時為 y = 0
    const floorY = colliders.length > 0 ? getSupportFloorY(colliders, bx, ay, bz, 0) : 0;
    const tf = segmentFloorT(ay, by, r, floorY);
    if (tf >= 0) { bestT = tf; hitType = HIT_FLOOR; _hitNormal.set(0, 1, 0); }

    // 牆：線段外擴範圍內的阻擋盒 (樓板 / 坡道只當地板)
    if (colliders.length > 0) {
      const near = queryColliders(colliders, Math.min(ax, bx) - r, Math.max(ax, bx) + r, Math.min(az, bz) - r, Math.max(az, bz) + r, _wallNear);
      for (let k = 0; k < near.length; k++) {
        const box = near[k];
        if (box.isFloorOnly || box.isRamp) continue;
        const t = segmentAabbT(ax, ay, az, bx, by, bz, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z, r, _n);
        if (t >= 0 && t < bestT) { bestT = t; hitType = HIT_WALL; _hitNormal.set(_n.x, _n.y, _n.z); }
      }
    }

    const flying = this.state[i] === PSTATE_FLY;
    if (flying) {
      // NPC：XZ 平方距離粗篩後做線段對垂直膠囊；略過倒地 / 永久擊倒
      const targets = this.host.targets;
      const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
      const half = 0.5 * Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      const reach = half + r + NPC_BROAD_PAD;
      const reachSq = reach * reach;
      for (let k = 0; k < targets.length; k++) {
        const t = targets[k];
        if (t.isKnockedDown || t.isPermanentlyKnockedOut) continue;
        const tp = t.position;
        const dx = tp.x - mx, dz = tp.z - mz;
        if (dx * dx + dz * dz > reachSq) continue;
        const dog = isCanineRole(t.role);
        const tt = segmentCapsuleT(ax, ay, az, bx, by, bz, tp.x, tp.z,
          tp.y + (dog ? DOG_CAPSULE_Y0 : HUMAN_CAPSULE_Y0), tp.y + (dog ? DOG_CAPSULE_Y1 : HUMAN_CAPSULE_Y1),
          (dog ? DOG_CAPSULE_R : HUMAN_CAPSULE_R) + r);
        if (tt >= 0 && tt < bestT) { bestT = tt; hitType = HIT_NPC; hitTarget = t; }
      }

      // 生態園：沿線段取樣點判定 (只到目前最近命中為止；命中即扣血，故依 t 由小到大)
      const tEnd = bestT < 1 ? bestT : 1;
      const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az)) * tEnd;
      const steps = Math.max(1, Math.ceil(len / GARDEN_SAMPLE_STEP));
      for (let s = 1; s <= steps; s++) {
        const t = (s / steps) * tEnd;
        _point.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
        const gh = this.host.hitGardenAt(_point, r, this.damage[i]);
        if (gh === null) break; // 本世界無生態園
        if (gh.hit) { bestT = t; hitType = HIT_GARDEN; _event.garden = gh; break; }
      }
    }

    if (hitType === HIT_NONE) return;
    // 撞擊點
    p[o] = ax + (bx - ax) * bestT;
    p[o + 1] = ay + (by - ay) * bestT;
    p[o + 2] = az + (bz - az) * bestT;
    if (hitType === HIT_FLOOR) this.onFloor(i, floorY);
    else if (hitType === HIT_WALL) this.onWall(i);
    else this.onTargetHit(i, hitType === HIT_NPC ? hitTarget : null);
  }

  private fillEvent(i: number, type: ProjectileEventType) {
    const o = i * 3;
    const ev = _event;
    ev.type = type;
    ev.slot = i;
    ev.kind = this.kind[i] as ProjectileKind;
    ev.serial = this.serial[i];
    ev.point.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
    ev.velocity.set(this.vel[o], this.vel[o + 1], this.vel[o + 2]);
    ev.target = null;
    ev.result = null;
    ev.applied = false;
    ev.hitHeight = 0;
    if (type !== 'GARDEN') ev.garden = null;
    ev.bounces = this.bounces[i];
    return ev;
  }

  // 事件回呼；回傳 true 表示回呼已改寫此槽狀態 (kill / recall)，略過預設處置
  private emit(i: number): boolean {
    const cb = this.opts[i].onEvent;
    if (!cb) return false;
    const g0 = this.gen[i];
    cb(_event);
    return this.gen[i] !== g0;
  }

  private onTargetHit(i: number, target: ProjectileTarget | null) {
    const o = i * 3;
    const op = this.opts[i];
    const v = this.vel;
    const host = this.host;
    const ev = this.fillEvent(i, target ? 'NPC' : 'GARDEN');
    // 擊退 / 背後判定方向：水平行進方向
    const hl = Math.sqrt(v[o] * v[o] + v[o + 2] * v[o + 2]);
    const dirX = hl > 1e-6 ? v[o] / hl : 0;
    const dirZ = hl > 1e-6 ? v[o + 2] / hl : 1;
    ev.normal.set(-dirX, 0, -dirZ);

    let applied = true;
    if (target) {
      const spec = this.spec;
      spec.src.copy(ev.point);
      spec.dir.set(dirX, 0, dirZ);
      spec.useAttackDir = true;
      spec.attackDirX = dirX;
      spec.attackDirZ = dirZ;
      spec.damage = this.damage[i];
      spec.dmgMul = 1;
      spec.knockback = op.knockback;
      spec.mode = op.mode;
      spec.shoveDist = op.shoveDist;
      spec.serial = this.serial[i];
      spec.launchCap = op.launchCap;
      spec.ignoreCooldown = false;
      spec.fightNoise = true;
      spec.deferFrontal = false;
      spec.reportCrime = true;
      spec.move = null;
      spec.strikeIndex = 0;
      spec.feedback = 'NONE';
      applied = host.hitTarget(target, spec);
      ev.target = target;
      ev.result = target.lastHitResult;
      ev.hitHeight = ev.point.y - target.position.y;
    }
    ev.applied = applied;
    if (applied) {
      if (op.hitStop > 0) host.requestHitStop(op.hitStop);
      if (op.hitFlashColor >= 0 && ev.result !== 'BLOCKED') host.hitFlash(ev.point, op.hitFlashColor);
      if (op.hitDust) host.dust(ev.point, ev.normal);
    }
    if (op.hitSound) host.playSound(op.hitSound, ev.point);
    if (this.emit(i)) return;
    if (this.flags[i] & PFLAG_RETURN) {
      // 自命中點反彈，稍後回收 (反彈期間不傷人)
      v[o] = -dirX * op.reboundBack;
      v[o + 1] = op.reboundUp;
      v[o + 2] = -dirZ * op.reboundBack;
      this.state[i] = PSTATE_BOUNCE;
      this.timer[i] = op.reboundDelay;
      this.gen[i]++;
      tracerFX.clear(i);
    } else {
      this.kill(i);
    }
  }

  private onWall(i: number) {
    const o = i * 3;
    const op = this.opts[i];
    const p = this.pos, v = this.vel;
    const ev = this.fillEvent(i, 'WALL');
    ev.normal.copy(_hitNormal);
    const nx = _hitNormal.x, ny = _hitNormal.y, nz = _hitNormal.z;
    p[o] += nx * WALL_SEPARATION; p[o + 1] += ny * WALL_SEPARATION; p[o + 2] += nz * WALL_SEPARATION;
    if (op.wallSound) this.host.playSound(op.wallSound, ev.point);
    if (this.emit(i)) return;
    if (this.flags[i] & PFLAG_BOUNCE_WALL) {
      // 沿法線反射後整體 × wallRestitution
      const vn = v[o] * nx + v[o + 1] * ny + v[o + 2] * nz;
      if (vn < 0) {
        const e = op.wallRestitution;
        v[o] = (v[o] - 2 * vn * nx) * e;
        v[o + 1] = (v[o + 1] - 2 * vn * ny) * e;
        v[o + 2] = (v[o + 2] - 2 * vn * nz) * e;
      }
      return;
    }
    this.finish(i, ev.point, ev.normal);
  }

  private onFloor(i: number, floorY: number) {
    const o = i * 3;
    const op = this.opts[i];
    const p = this.pos, v = this.vel;
    p[o + 1] = floorY + this.radius[i];
    const ev = this.fillEvent(i, 'FLOOR');
    ev.normal.set(0, 1, 0);
    const canBounce = (this.flags[i] & PFLAG_BOUNCE_FLOOR) !== 0 && this.bounces[i] < op.maxBounces && -v[o + 1] > MIN_BOUNCE_VY;
    if (op.floorSound) this.host.playSound(op.floorSound, ev.point);
    if (this.emit(i)) return;
    if (canBounce) {
      v[o + 1] = -v[o + 1] * op.restitution;
      v[o] *= op.friction;
      v[o + 2] *= op.friction;
      this.bounces[i]++;
      return;
    }
    this.finish(i, ev.point, ev.normal);
  }

  // 落空結束：可回收者開始回收，否則噴煙塵後移除
  private finish(i: number, point: THREE.Vector3, normal: THREE.Vector3) {
    if (this.flags[i] & PFLAG_RETURN) { this.startReturn(i); return; }
    if (this.opts[i].hitDust) this.host.dust(point, normal);
    this.kill(i);
  }

  private expire(i: number) {
    if (this.flags[i] & PFLAG_RETURN) { this.startReturn(i); return; }
    this.fillEvent(i, 'EXPIRE');
    if (this.emit(i)) return;
    this.kill(i);
  }

  private startReturn(i: number) {
    const target = this.opts[i].returnTarget;
    if (!target) { this.kill(i); return; }
    const o = i * 3;
    target(_ret);
    const fx = this.pos[o], fy = this.pos[o + 1], fz = this.pos[o + 2];
    this.retFrom[o] = fx; this.retFrom[o + 1] = fy; this.retFrom[o + 2] = fz;
    const d = Math.sqrt((_ret.x - fx) * (_ret.x - fx) + (_ret.y - fy) * (_ret.y - fy) + (_ret.z - fz) * (_ret.z - fz));
    this.retT[i] = returnDuration(d);
    this.retElapsed[i] = 0;
    this.retArc[i] = Math.min(2.5, Math.max(0.5, d * 0.15));
    this.state[i] = PSTATE_RETURN;
    this.gen[i]++;
    tracerFX.clear(i);
  }

  // 回收：二次貝茲 (起點固定、終點每幀由回呼提供、控制點 = 中點抬高)，不判傷、不碰撞
  private stepReturn(i: number, dt: number) {
    const o = i * 3;
    const op = this.opts[i];
    const p = this.pos, pp = this.prevPos, v = this.vel, f = this.retFrom;
    op.returnTarget!(_ret);
    this.retElapsed[i] += dt;
    const T = this.retT[i];
    const u = Math.min(1, this.retElapsed[i] / T);
    const cx = (f[o] + _ret.x) * 0.5, cy = (f[o + 1] + _ret.y) * 0.5 + this.retArc[i], cz = (f[o + 2] + _ret.z) * 0.5;
    pp[o] = p[o]; pp[o + 1] = p[o + 1]; pp[o + 2] = p[o + 2];
    p[o] = quadBezier(f[o], cx, _ret.x, u);
    p[o + 1] = quadBezier(f[o + 1], cy, _ret.y, u);
    p[o + 2] = quadBezier(f[o + 2], cz, _ret.z, u);
    v[o] = (p[o] - pp[o]) / dt; v[o + 1] = (p[o + 1] - pp[o + 1]) / dt; v[o + 2] = (p[o + 2] - pp[o + 2]) / dt;
    this.spin(i, dt);
    const dx = p[o] - _ret.x, dy = p[o + 1] - _ret.y, dz = p[o + 2] - _ret.z;
    if (u >= 1 || dx * dx + dy * dy + dz * dz < RETURN_CATCH_DIST * RETURN_CATCH_DIST) {
      const ev = this.fillEvent(i, 'CATCH');
      ev.normal.set(0, 1, 0);
      if (op.catchSound) this.host.playSound(op.catchSound, ev.point);
      if (this.emit(i)) return;
      this.kill(i);
    }
  }

  // 彈體自轉：繞 (上 × 速度) 軸，角速度 = 速度 / 半徑 (每幀上限 MAX_SPIN_STEP)
  private spin(i: number, dt: number) {
    const o = i * 3;
    const vx = this.vel[o], vz = this.vel[o + 2];
    const h = Math.sqrt(vx * vx + vz * vz);
    if (h < 1e-3) return;
    const step = Math.min(MAX_SPIN_STEP, (h * dt) / this.radius[i]);
    _axis.set(vz / h, 0, -vx / h);
    const r = i * 4;
    _q.set(this.rot[r], this.rot[r + 1], this.rot[r + 2], this.rot[r + 3]);
    _dq.setFromAxisAngle(_axis, step);
    _q.premultiply(_dq).normalize();
    this.rot[r] = _q.x; this.rot[r + 1] = _q.y; this.rot[r + 2] = _q.z; this.rot[r + 3] = _q.w;
  }

  // 寫入實例矩陣與光痕 (只處理存活槽；各種類網格僅在有實例時標記更新)
  private syncVisuals() {
    const tracerOn = tracerFX.enabled;
    const tracerLife = getFxQuality().tracerLife;
    let dirtyBall = false, dirtyStone = false;
    for (let i = 0; i < PROJ_MAX; i++) {
      if (this.state[i] === PSTATE_DEAD) continue;
      const k = this.kind[i];
      const mesh = this.meshes[k];
      const o = i * 3;
      const p = this.pos;
      if (mesh) {
        const r = i * 4;
        _q.set(this.rot[r], this.rot[r + 1], this.rot[r + 2], this.rot[r + 3]);
        _m.compose(_p.set(p[o], p[o + 1], p[o + 2]), _q, _s.setScalar(this.radius[i] * KIND_VISUAL_SCALE[k]));
        mesh.setMatrixAt(i, _m);
        if (k === PROJ_BALL) dirtyBall = true; else dirtyStone = true;
      }
      if (tracerOn && this.state[i] === PSTATE_FLY && (this.flags[i] & PFLAG_TRACER)) {
        const v = this.vel;
        const speed = Math.sqrt(v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2]);
        if (speed > 1e-3) {
          // 光痕長 = 速度 × 壽命，且不超過離發射點的距離 (不畫到出手點後方)
          const ex = p[o] - this.origin[o], ey = p[o + 1] - this.origin[o + 1], ez = p[o + 2] - this.origin[o + 2];
          const len = Math.min(speed * tracerLife, Math.sqrt(ex * ex + ey * ey + ez * ez));
          const s = len / speed;
          const op = this.opts[i];
          tracerFX.set(i, p[o], p[o + 1], p[o + 2], p[o] - v[o] * s, p[o + 1] - v[o + 1] * s, p[o + 2] - v[o + 2] * s, op.tracerHalfWidth, op.tracerColor);
          continue;
        }
      }
      tracerFX.clear(i);
    }
    if (dirtyBall) this.meshes[PROJ_BALL]!.instanceMatrix.needsUpdate = true;
    if (dirtyStone) this.meshes[PROJ_STONE]!.instanceMatrix.needsUpdate = true;
    tracerFX.update(this.host.cameraPosition);
  }
}
