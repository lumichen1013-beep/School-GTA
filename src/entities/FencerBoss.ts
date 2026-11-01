import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { soundManager } from '../audio/SoundEffects';
import { slashFX } from '../effects/SlashFX';
import { comboFinisherFX } from '../effects/ComboFinisherFX';
import { BossFX, PETAL_PALETTE_ROSE, PETAL_PALETTE_SUN, PETAL_PALETTE_DUSK, PETAL_PALETTE_THORN, PETAL_PALETTE_SHADOW, createSilhouetteMaterial } from '../effects/BossFX';
import type { WeaponFxStyle } from '../effects/weaponFxStyle';
import { FAN_ANGLE_MIN_DIST, probeLine } from './shared/kungfu';
import type { PlantAoeShape } from '../world/EcologicalGarden';
import { SkillBubble, TALK_BUBBLE_STYLE } from './shared/SkillBubble';
import { ndcOvershoot, worldDropForNdc, ndcInsetX } from '../game/fencer/bubbleSafeArea';
import {
  BossHealthBars, FENCER, TRANSITION_BLINK_AT, segmentPointDistance, rayCircleDistance, thornArmYaw, thornCrossYaw, thornCrossHit,
  pinchClonePos, pinchHitMask, inFan, type BossDamageResult, type BossCue
} from '../game/fencer/fencerRules';

// 世界 Boss【花劍客・向日爵士】：英倫紳士劍客。模型 7 個部件 (軀幹+頭+燕尾 / 雙臂 (右臂含細劍) / 雙腿 / 披風 / 高帽)，
// 共用一個頂點色 Lambert 材質 (受擊閃白只改 emissive，不換材質)。
// 戰鬥：霸體 (不吃擊飛 / 推擊)、側步 / 後空翻 / 瞬步、S1 玫瑰三連刺 / S2 高帽迴旋斬 / S3 萬花華爾滋・終幕 (+ 鞠躬破綻)、
// S4 玫瑰荊棘十字 (第 2 管起) / S5 花影雙人舞 (第 3 管)。所有判定為解析式 (膠囊 / 球 / 圓 / 十字線段)，不使用 Raycaster。

export type AttackId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
type Act = 'HIDDEN' | 'INTRO' | 'NEUTRAL' | 'ATTACK' | 'RECOVER' | 'BOW' | 'TRANSITION' | 'DEFEATED' | 'TRIUMPH';
type MoveKind = 'NONE' | 'SIDESTEP' | 'BACKFLIP' | 'BLINK';

/** 已實作的招式 (循環中不在此集合的插槽自動略過) */
export const IMPLEMENTED_ATTACKS: ReadonlySet<AttackId> = new Set<AttackId>(['S1', 'S2', 'S3', 'S4', 'S5']);

interface PhaseSpec {
  rotation: readonly AttackId[]; // 出招循環 (未實作的插槽自動略過)
  pressure: number;              // 出招密度倍率 (中立期 / 冷卻縮短)
  speedMul: number;              // 移動速度倍率
  s1Thrusts: number;
  s1Echo: boolean;               // 最後一刺後的玫瑰殘影再刺
  s2Hats: number;
  s3Rings: number;
  s3Cooldown: number;
  /** 連刺追擊 (懲罰失誤)：S1 前一刺刺中 → 下一刺預警縮短、傷害 FOLLOW_DMG；S5 第 1 回合刺中 → 第 2 回合同理 */
  followUp: boolean;
  /** S1 (含玫瑰殘影 / 衝擊波) / S3 綻放圈 / S5 的傷害加成 (S2、S4、終幕不加) */
  dmgBonus: number;
  /** S4 荊棘臂數 (四臂十字 / 終樂章六臂) */
  thornArms: number;
  /** S3 終幕：null = 落點大圈；否則全場爆發，只留 n 個安全圈 (最近一圈距玩家 near[0]~near[1] m) */
  s3Field: { n: number; r: number; near: readonly [number, number]; warn: number } | null;
}
export const PHASES: readonly PhaseSpec[] = [
  { rotation: ['S1', 'S2', 'S1', 'S3'], pressure: 1.0, speedMul: 1.0, s1Thrusts: 3, s1Echo: false, s2Hats: 1, s3Rings: 5, s3Cooldown: 13, followUp: false, dmgBonus: 0, thornArms: 4, s3Field: null },
  { rotation: ['S1', 'S2', 'S4', 'S1', 'S3'], pressure: 1.2, speedMul: 1.0, s1Thrusts: 4, s1Echo: true, s2Hats: 2, s3Rings: 7, s3Cooldown: 13, followUp: true, dmgBonus: 0, thornArms: 4,
    s3Field: { n: 3, r: 2.6, near: [4, 7], warn: 1.8 } },
  // 終樂章兩輪一循環：S5 每輪、S4 隔輪 (模擬校正：S4 時間長，每輪都放會稀釋壓力)
  { rotation: ['S1', 'S5', 'S2', 'S1', 'S4', 'S3', 'S1', 'S5', 'S2', 'S1', 'S3'], pressure: 1.4, speedMul: 1.2, s1Thrusts: 4, s1Echo: true, s2Hats: 2, s3Rings: 9, s3Cooldown: 10, followUp: true, dmgBonus: 2, thornArms: 6,
    s3Field: { n: 2, r: 2.4, near: [5, 8], warn: 1.7 } }
];
const BASE_COOLDOWN: Record<AttackId, number> = { S1: 4, S2: 6, S3: 13, S4: 11, S5: 9 };

// 數值 (常數表；實測後只調這裡)。放大版 (結界 R23)：範圍放大 + 晚鎖定追蹤 + 傷害 ×1.75；預警下限見設計文件 §9.13，
// 下限依據 = 反應 0.3s + 衝刺 10m/s (或閃身步 0.24s 無敵按時機)。預警範圍 = 判定範圍 (地面 decal 半寬 / 半徑與判定一致)。
const S1_LEN = 9;              // 刺長上限 (= 到玩家位置 + S1_OVERSHOOT，夾在 S1_MIN_LEN~S1_LEN)
const S1_MIN_LEN = 4;
const S1_OVERSHOOT = 2.5;      // 穿過玩家後再前進的距離 (停在玩家前方附近 → 後續刺仍朝向玩家)
const S1_HIT_R = 1.2;
const S1_DMG = 14;
const S1_DASH_SEC = 0.12;
const S1_FIRST_WINDUP = 0.45;  // 下限 0.45
const S1_NEXT_WINDUP = 0.3;    // 下限 0.3
const S1_LOCK_FIRST = 0.3;     // 打出前 N 秒停止追蹤 (鎖定)；之前每秒最多轉 S1_TRACK_RATE
const S1_LOCK_NEXT = 0.25;
const S1_TRACK_RATE = (150 * Math.PI) / 180;
const S1_MAX_TURN = (60 * Math.PI) / 180;
const S1_ECHO_DELAY = 0.4;
// S1 末刺玫瑰衝擊波：末刺後 S1_WAVE_DELAY 秒，自末刺起點沿刺擊方向擴成扇形 (起點半寬 S1_HIT_R、半角 18°) 一路衝到牆
const S1_WAVE_DELAY = 0.35;
const S1_WAVE_TAN = Math.tan((18 * Math.PI) / 180);
const S1_WAVE_HALF_ANGLE = (18 * Math.PI) / 180;
const S2_LEN = 18;
const S2_FLIGHT = 2.0;
const S2_WINDUP = 0.6;         // 下限 0.6
const S2_HIT_R = 1.3;          // 帽子球半徑 (判定再加玩家胸口 0.45 = 1.75)
const S2_BOW = 6;              // 弧線側偏
const S2_HAT_SCALE = 1.8;
const S2_DMG = 12;
const S3_SPIN = 0.6;
const S3_RING_R = 3.5;
const S3_RING_GAP = 0.2;
const S3_RING_WARN = 0.8;      // 下限 0.8
const S3_RING_DMG = 11;
const S3_FINAL_R = 8.5;        // 第一樂章終幕大圈
const S3_FINAL_WARN = 1.2;     // + S3_RING_GAP = 1.4 (下限)
const S3_FINAL_DMG = 21;
const S3_AIR_Y = 6;
const S3_FIELD_SPACING = 8;    // 全場終幕安全圈彼此最小距離
// S4 玫瑰荊棘十字：躍到場中 → 細劍插地 + 地面預兆 0.9s → 荊棘爆出 → 停 0.4s → 2.2s 旋轉一個臂距 → 縮回、拔劍破綻
// 可解性：四臂角速度 0.714 rad/s → 距插劍點 ≤12.6m 可跟轉 (≤9m/s)、≥6.6m 可跳過 (臂寬 2.6m 掃過 ≤0.55s)，兩段重疊；
// 六臂 (終樂章) 0.476 rad/s → 跟轉 ≤18.9m、跳 ≥9.9m
const S4_ANCHOR_MAX = 6;       // 插劍點距結界中心上限
const S4_LEAP_SEC = 0.3;
const S4_WARN_SEC = 0.9;       // 下限 0.9
const S4_ERUPT_SEC = 0.22;
const S4_HOLD_SEC = 0.4;
const S4_ROTATE_SEC = 2.2;     // 下限 2.0
const S4_RETRACT_SEC = 0.4;
const S4_HALF_W = 1.3;         // 荊棘半寬 (含玩家體型)
const S4_JUMP_CLEAR = 0.6;     // 玩家腳高於此可跳過 (跳躍頂點約 1.5m)
const S4_DMG = 16;
const S4_RECOVER_EXTRA = 0.5;  // 拔劍破綻 (RECOVER 0.7s + 0.5s)
const MAX_THORN_ARMS = 6;
// S5 花影雙人舞：分身站到玩家另一側 (與本體夾 100°)，兩邊同時單刺夾擊 (一路刺到牆)，兩回合
const S5_ROUNDS = 2;
const S5_FIRST_WINDUP = 0.7;
const S5_NEXT_WINDUP = 0.45;   // 下限 0.45
const S5_LOCK_FIRST = 0.3;
const S5_LOCK_NEXT = 0.25;
const S5_DASH_SEC = 0.14;
const S5_CLONE_ANGLE = (100 * Math.PI) / 180;
const S5_CLONE_DIST = 8;
const S5_HIT_R = 1.3;
const S5_DMG = 14;
const S5_RECOVER_EXTRA = 0.3;  // 收劍破綻 (RECOVER 0.7s + 0.3s)
// 連刺追擊 (第 2 管起；新手難度校正：只懲罰已被刺中的玩家，一直在閃的人不受影響)
const S1_FOLLOW_WINDUP = 0.2;  // 前一刺刺中 → 下一刺預警 0.3 → 0.2s
const S5_FOLLOW_WINDUP = 0.2;  // 第 1 回合刺中 → 第 2 回合預警 0.45 → 0.2s
const FOLLOW_DMG = 21;         // 追擊刺傷害 (= 全戰上限，同終幕)
const BOW_SEC = 1.5;
const HIT_PAD = 0.75;     // 玩家打 Boss 的體型補正
const BODY_HEIGHT = 2.3;
const AIRBORNE_Y = 2.0;   // 高於此高度無法被近戰命中
const PREFERRED_MIN = 6;
const PREFERRED_MAX = 9;
const SIDESTEP_DIST = 3;
const BACKFLIP_DIST = 5;
const BLINK_MIN = 8;
const BLINK_RAND = 3;
const HAT_PRIORITY_DIST = 12;  // 玩家超過此距離優先丟高帽
const BLINK_CLOSE_DIST = 13;   // 招式冷卻中且超過此距離 → 瞬步拉近
const NEUTRAL_MIN = 0.4;
const NEUTRAL_RAND = 0.5;
const CHASE_AFTER = 1.5;

const COLOR_WARN = 0xff4f8b;
const COLOR_WARN_BIG = 0xff2a55;
const COLOR_HAT = 0xffb347;
const COLOR_THORN = 0xff4fd8; // 洋紅：與結界地板紅色紋章、S1 粉紅預警區隔
const COLOR_CLONE = 0xc04dff;
const COLOR_LOCK = 0xfff0f6;  // 鎖定瞬間 (停止追蹤 = 現在閃)
const COLOR_SAFE = 0xffd54f;  // 全場終幕安全圈 (金)
const ROSE_STYLE: WeaponFxStyle = { color: 0xff5c8a, tipColor: 0xffe0ea, intensity: 1.2, life: 0.2, glow: 1, impact: 0xff3d6e };

export interface FencerBossHost {
  readonly playerPos: THREE.Vector3;
  readonly playerVel: THREE.Vector3;
  readonly playerDead: boolean;
  readonly isTouch: boolean;
  /** 玩家是否處於脫戰狀態 (反風箏追擊判定) */
  readonly playerOutOfCombat: boolean;
  /** Boss 招式命中玩家 (自動閃避、扣血 / 擊飛、脫戰中斷由宿主處理) */
  damagePlayer(amount: number, launchDir: THREE.Vector3 | null, h: number, v: number, reason: string): void;
  onBossDamaged(result: BossDamageResult, point: THREE.Vector3): void;
  shake(amount: number): void;
  hitStop(seconds: number): void;
  /** 劇情提示點 (招式宣言 / 收招致意 / 追擊)：由宿主依頻率規則決定是否說話 */
  onCue?(cue: BossCue): void;
}

const BUBBLE_Y = 2.75;
const _bv = new THREE.Vector3();
const _br = new THREE.Vector3();

// ===== 模型 =====
function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g.index ? g.toNonIndexed() : g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, hex: number) => colored(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), hex);

const C = {
  hat: 0x141414, band: 0xb3123a, flower: 0xf6c21c, skin: 0xf1d3b5, gold: 0xe2b33c, coat: 0x1e2a4a,
  shirt: 0xf3ead7, scarf: 0xb3123a, glove: 0xf3ead7, pants: 0x4b5563, shoe: 0x141414, blade: 0xd9e2ec, capeIn: 0xe2b33c
};

function buildBody(): THREE.BufferGeometry {
  // 收腰軀幹 (0 ~ 0.7，以髖部為原點) + 頭 + 燕尾
  const parts = [
    box(0.5, 0.62, 0.3, 0, 0.36, 0, C.coat),
    box(0.22, 0.5, 0.02, 0, 0.42, 0.155, C.shirt),
    box(0.16, 0.1, 0.03, 0, 0.62, 0.165, C.scarf),
    box(0.05, 0.05, 0.02, 0, 0.36, 0.17, C.gold),
    box(0.05, 0.05, 0.02, 0, 0.24, 0.17, C.gold),
    box(0.56, 0.14, 0.34, 0, 0.66, 0, C.coat),
    // 燕尾兩片
    colored(new THREE.BoxGeometry(0.14, 0.55, 0.04).translate(0, -0.27, 0).rotateX(-0.18).translate(-0.12, 0.05, -0.15), C.coat),
    colored(new THREE.BoxGeometry(0.14, 0.55, 0.04).translate(0, -0.27, 0).rotateX(-0.18).translate(0.12, 0.05, -0.15), C.coat),
    // 頭 + 單片眼鏡 + 八字鬍
    box(0.3, 0.32, 0.3, 0, 0.92, 0, C.skin),
    colored(new THREE.TorusGeometry(0.055, 0.012, 6, 8).translate(0.07, 0.95, 0.155), C.gold),
    colored(new THREE.ConeGeometry(0.025, 0.12, 5).rotateZ(Math.PI / 2 + 0.4).translate(-0.06, 0.85, 0.16), C.hat),
    colored(new THREE.ConeGeometry(0.025, 0.12, 5).rotateZ(-Math.PI / 2 - 0.4).translate(0.06, 0.85, 0.16), C.hat),
    box(0.06, 0.04, 0.02, -0.07, 0.96, 0.152, C.hat)
  ];
  return mergeGeometries(parts);
}
function buildArm(side: number, withSword: boolean): THREE.BufferGeometry {
  // 以肩為原點向下
  const parts = [
    box(0.13, 0.62, 0.13, 0, -0.3, 0, C.coat),
    box(0.12, 0.12, 0.12, 0, -0.66, 0, C.glove)
  ];
  if (withSword) {
    parts.push(colored(new THREE.SphereGeometry(0.08, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, -0.7, 0.08), C.gold));
    parts.push(box(0.025, 0.025, 1.1, 0, -0.7, 0.66, C.blade));
    parts.push(colored(new THREE.SphereGeometry(0.045, 6, 5).translate(0, -0.7, -0.07), C.scarf));
  }
  void side;
  return mergeGeometries(parts);
}
function buildLeg(): THREE.BufferGeometry {
  return mergeGeometries([
    box(0.16, 0.86, 0.16, 0, -0.43, 0, C.pants),
    box(0.17, 0.08, 0.28, 0, -0.9, 0.05, C.shoe)
  ]);
}
function buildCape(): THREE.BufferGeometry {
  return mergeGeometries([
    box(0.36, 0.7, 0.03, 0, -0.35, -0.02, C.band),
    box(0.34, 0.66, 0.02, 0, -0.35, 0.0, C.capeIn)
  ]);
}
function buildHat(): THREE.BufferGeometry {
  const parts = [
    cyl(0.17, 0.17, 0.42, 8, 0, 0.23, 0, C.hat),
    cyl(0.3, 0.3, 0.025, 12, 0, 0.02, 0, C.hat),
    cyl(0.175, 0.175, 0.07, 8, 0, 0.08, 0, C.band)
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(colored(new THREE.BoxGeometry(0.03, 0.06, 0.01).translate(Math.cos(a) * 0.035, Math.sin(a) * 0.035 + 0.1, 0.18), C.flower));
  }
  return mergeGeometries(parts);
}

/** 花影分身：本體零件以突刺姿勢合併成單一幾何 (1 draw call) */
function buildCloneGeometry(parts: Array<{ mesh: THREE.Mesh }>): THREE.BufferGeometry {
  const geos = parts.map(({ mesh }) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return merged;
}

// ===== 暫存 =====
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _fxPoint = new THREE.Vector3();
const _probe = new Float32Array(3);
const _clonePos = { x: 0, z: 0 };

interface HatFlight {
  mesh: THREE.Mesh;
  active: boolean;
  side: number;
  p0: THREE.Vector3; p1: THREE.Vector3; p2: THREE.Vector3; p3: THREE.Vector3; // 去程 p0→p1→p2，回程 p2→p3→(Boss)
  hitOut: boolean; hitBack: boolean;
  lastPos: THREE.Vector3;
}
interface PendingRing { active: boolean; x: number; z: number; t: number; r: number; dmg: number; big: boolean; field: boolean }

export class FencerBoss {
  public readonly root = new THREE.Group();     // 位置 / 朝向 (世界座標)
  public readonly container = new THREE.Group(); // 掛在場景：root + 飛行中的帽子
  public readonly position = new THREE.Vector3();
  public readonly bars = new BossHealthBars();
  public rotY = 0;
  public act: Act = 'HIDDEN';
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  private readonly hip = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly cape: THREE.Mesh;
  private readonly hat: THREE.Mesh;
  private readonly hat2: THREE.Mesh;
  private readonly hatHome = new THREE.Vector3(0, 1.08, 0);
  private flashTimer = 0;
  private animTime = 0;
  private actTimer = 0;
  private phase = 0;
  private rotationIdx = 0;
  private readonly cooldown: Record<AttackId, number> = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0 };
  private attack: AttackId | null = null;
  private atkTimer = 0;
  private atkStep = 0;
  private neutralTime = 0;
  private sinceLastAttack = 99;
  private closeTimer = 0;   // 玩家貼身累計
  private farTimer = 0;     // 玩家遠離 / 脫戰累計 (追擊)
  private readonly recentHits: number[] = [0, 0, 0, 0, 0];
  private recentHitIdx = 0;
  private clock = 0;
  // 移動
  private move: MoveKind = 'NONE';
  private moveT = 0;
  private moveDur = 0;
  private readonly moveFrom = new THREE.Vector3();
  private readonly moveTo = new THREE.Vector3();
  private movePause = 0;
  private sideSign = 1;
  private pendingChaseThrust = false;
  // S1
  private s1Count = 0;
  private s1Echo = false;
  private s1Hit = false;
  private s1Decal = -1;
  private s1Windup = S1_FIRST_WINDUP;
  private s1Follow = false;
  private hatCount = 1;
  private readonly s1Start = new THREE.Vector3();
  private readonly s1End = new THREE.Vector3();
  private s1Wave = false;        // 本次 S1 末刺帶衝擊波 (近身單刺不帶)
  private s1FanDecal = -1;
  private s1Locked = false;
  private s1Lead = S1_LOCK_FIRST;
  // S2
  private readonly hats: HatFlight[];
  private hatSpinSfx = 0;
  // S3
  private s3RingsLeft = 0;
  private s3RingTimer = 0;
  private readonly s3Land = new THREE.Vector3();
  private readonly s3From = new THREE.Vector3();
  private readonly rings: PendingRing[] = [];
  /** 全場終幕安全圈 (x, z)；數量 = s3SafeCount */
  private readonly s3Safe: { x: number; z: number }[] = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  private s3SafeCount = 0;
  private s3SafeR = 0;
  private s3FinaleSec = S3_FINAL_WARN + S3_RING_GAP;
  private airY = 0;
  // S4
  private readonly s4Anchor = new THREE.Vector3();
  private readonly s4From = new THREE.Vector3();
  private s4Yaw = 0;
  private s4Dir = 1;
  private s4HitErupt = false;
  private s4HitSweep = false;
  private readonly s4Lens = new Float32Array(MAX_THORN_ARMS);
  private s4Arms = 4;
  // S5
  public readonly clone: THREE.Mesh;
  private readonly cloneMat: THREE.ShaderMaterial;
  private cloneDissolve = 1;
  private cloneFade = 0;         // >0 淡入、<0 淡出 (每秒)
  private s5Round = 0;
  private s5Hit = false;
  private s5Windup = S5_FIRST_WINDUP;
  private s5Follow = false;
  private cloneYaw = 0;
  private readonly s5BossFrom = new THREE.Vector3();
  private readonly s5BossTo = new THREE.Vector3();
  private readonly s5CloneFrom = new THREE.Vector3();
  private readonly s5CloneTo = new THREE.Vector3();
  private readonly s5ClonePos = new THREE.Vector3();
  private s5DecalBoss = -1;
  private s5DecalClone = -1;
  private s5Locked = false;
  private s5Lead = S5_LOCK_FIRST;
  // 開場 / 亮相 / 換樂章
  private introPose = 0;
  private transitionSec = FENCER.BAR_BREAK_POSE_SEC + FENCER.BAR_TRANSITION_SEC;
  private _transitionCentered = false;
  /** 擊敗後化成花瓣的秒數 (首勝長過場由台詞事件 DISSOLVE 觸發 = dissolveNow；再戰 1.4s) */
  public defeatDissolveAt = 1.4;
  // 頭頂對話框 (跟隨位置但不受縮放 / 化花瓣隱藏影響；1 sprite，預建畫布)
  private readonly bubbleAnchor = new THREE.Group();
  private readonly bubble = new SkillBubble(this.bubbleAnchor, BUBBLE_Y, TALK_BUBBLE_STYLE);

  constructor(private readonly host: FencerBossHost, private readonly fx: BossFX) {
    this.container.name = 'fencer_boss';
    const mk = (g: THREE.BufferGeometry) => new THREE.Mesh(g, this.material);
    this.body = mk(buildBody());
    this.body.castShadow = true;
    this.armL = mk(buildArm(-1, false));
    this.armR = mk(buildArm(1, true));
    this.legL = mk(buildLeg());
    this.legR = mk(buildLeg());
    this.cape = mk(buildCape());
    this.cape.castShadow = true;
    const hatGeo = buildHat();
    this.hat = mk(hatGeo);
    this.hat2 = mk(hatGeo);

    this.hip.position.y = 0.95;
    this.root.add(this.hip, this.legL, this.legR);
    this.legL.position.set(-0.13, 0.95, 0);
    this.legR.position.set(0.13, 0.95, 0);
    this.hip.add(this.body);
    this.armL.position.set(-0.33, 0.66, 0);
    this.armR.position.set(0.33, 0.66, 0);
    this.cape.position.set(-0.12, 0.7, -0.17);
    this.body.add(this.armL, this.armR, this.cape);
    this.hat.position.copy(this.hatHome);
    this.body.add(this.hat);
    this.hat2.visible = false;
    this.container.add(this.root, this.hat2, this.bubbleAnchor);
    this.container.visible = false;

    const mkHat = (mesh: THREE.Mesh): HatFlight => ({
      mesh, active: false, side: 1, p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(), p3: new THREE.Vector3(),
      hitOut: false, hitBack: false, lastPos: new THREE.Vector3()
    });
    this.hats = [mkHat(this.hat), mkHat(this.hat2)];
    for (let i = 0; i < 12; i++) this.rings.push({ active: false, x: 0, z: 0, t: 0, r: 0, dmg: 0, big: false, field: false });

    // 花影分身：本體零件擺成突刺姿勢後合併 (共用零件建構，1 draw call、不透明剪影材質、不投影)
    this.hip.position.y = 0.85;
    this.body.rotation.x = 0.35;
    this.armR.rotation.x = -1.6;
    this.armL.rotation.set(-0.3, 0, -0.9);
    this.legL.position.y = this.legR.position.y = 0.85;
    this.legL.rotation.x = 0.9;
    this.legR.rotation.x = -0.7;
    this.cape.rotation.x = 0.8;
    this.root.updateMatrixWorld(true);
    this.cloneMat = createSilhouetteMaterial();
    this.clone = new THREE.Mesh(buildCloneGeometry([this.body, this.armL, this.armR, this.legL, this.legR, this.cape, this.hat].map((mesh) => ({ mesh }))), this.cloneMat);
    this.clone.name = 'fencer_clone';
    this.clone.visible = false;
    this.container.add(this.clone);
    this.hip.position.y = 0.95;
    this.legL.position.y = this.legR.position.y = 0.95;
    for (const m of [this.body, this.armR, this.armL, this.legL, this.legR, this.cape]) m.rotation.set(0, 0, 0);
  }

  // ===== 狀態查詢 =====

  public get currentBar(): number {
    return this.bars.bar;
  }

  public get isAirborne(): boolean {
    return this.position.y > AIRBORNE_Y;
  }

  public get isHittable(): boolean {
    return (this.act === 'NEUTRAL' || this.act === 'ATTACK' || this.act === 'RECOVER' || this.act === 'BOW')
      && !this.isAirborne && !this.bars.invulnerable;
  }

  /** 出招中的招式 (非出招 null)；Boss 戰鏡頭依此判斷大招預警 */
  public get currentAttack(): AttackId | null {
    return this.act === 'ATTACK' ? this.attack : null;
  }

  public get isInTransition(): boolean {
    return this.act === 'TRANSITION';
  }

  public get isDefeated(): boolean {
    return this.act === 'DEFEATED';
  }

  /** 換樂章過場已進行秒數 (非換樂章時 -1) */
  public get transitionTime(): number {
    return this.act === 'TRANSITION' ? this.actTimer : -1;
  }

  /**
   * 手機直屏遠景：把頭頂框上緣夾在螢幕安全區 (頂部資訊條下方)；safeTop = null 表示不夾 (桌機 / 橫屏)。
   * 以兩次投影求「世界高度 → NDC」斜率，換算需下移的世界高度。
   */
  public fitBubble(camera: THREE.Camera, safeTop: number | null) {
    const sprite = this.bubble.sprite;
    const b = this.bubble;
    if (safeTop === null || !sprite || !sprite.visible) { b.yOffset = b.xOffset = b.zOffset = 0; return; }
    // 垂直：上緣不進入頂部 UI
    const topY = BUBBLE_Y + 0.25 + sprite.scale.y * 0.85; // +0.25 = 浮動上升量
    _bv.set(this.position.x, topY, this.position.z).project(camera);
    if (_bv.z > 1) { b.yOffset = b.xOffset = b.zOffset = 0; return; }
    const y0 = _bv.y;
    _bv.set(this.position.x, topY + 1, this.position.z).project(camera);
    const slope = _bv.y - y0;
    b.yOffset = -worldDropForNdc(ndcOvershoot(y0, safeTop), slope, BUBBLE_Y - 1.2);
    // 水平：左右不被螢幕邊緣切掉 (沿鏡頭右方向平移)
    _br.setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
    if (_br.lengthSq() < 1e-6) { b.xOffset = b.zOffset = 0; return; }
    _br.normalize();
    const halfWorld = sprite.scale.x / 2;
    _bv.set(this.position.x, BUBBLE_Y, this.position.z).project(camera);
    const cx = _bv.x;
    _bv.set(this.position.x + _br.x * halfWorld, BUBBLE_Y, this.position.z + _br.z * halfWorld).project(camera);
    const halfNdc = Math.abs(_bv.x - cx);
    const inset = ndcInsetX(cx, halfNdc, 0.03);
    const shift = halfNdc > 1e-4 ? (inset / halfNdc) * halfWorld : 0;
    b.xOffset = _br.x * shift;
    b.zOffset = _br.z * shift;
  }

  /** 頭頂對話框 (NPC 樣式，≤ 22 字) */
  public say(text: string, duration: number) {
    if (typeof document === 'undefined') return;
    this.bubble.show(text, text.length > 6, duration);
  }

  // ===== 生命週期 =====

  /** 重置為新一場 (三管血全滿)；位置 = 結界中心 */
  public resetForFight(x: number, z: number) {
    this.bars.reset();
    this.phase = 0;
    this.rotationIdx = 0;
    for (const k of Object.keys(this.cooldown) as AttackId[]) this.cooldown[k] = 0;
    this.cooldown.S3 = 6; // 開場不馬上出大招
    this.position.set(x, 0, z);
    this.rotY = 0;
    this.attack = null;
    this.move = 'NONE';
    this.movePause = 0;
    this.closeTimer = 0;
    this.farTimer = 0;
    this.sinceLastAttack = 99;
    this.recentHits.fill(-99);
    this.airY = 0;
    this.resetHats();
    this.clearSpecials();
    for (const r of this.rings) r.active = false;
    this.flashTimer = 0;
    this.material.emissive.setHex(0x000000);
    this.root.rotation.set(0, 0, 0);
    this.root.visible = true;
    this.syncTransform();
  }

  public hide() {
    this.act = 'HIDDEN';
    this.container.visible = false;
    this.bubble.hide();
    this.resetHats();
    this.clearSpecials();
    for (const r of this.rings) r.active = false;
  }

  /** 擊敗後立即化成花瓣 (首勝過場台詞事件) */
  public dissolveNow() {
    if (this.act === 'DEFEATED') this.defeatDissolveAt = Math.min(this.defeatDissolveAt, this.actTimer);
  }

  /** 開場亮相 (花瓣龍捲中現身、壓帽沿、劍禮)；由開戰過場驅動 */
  public beginIntro(faceYaw: number) {
    this.act = 'INTRO';
    this.actTimer = 0;
    this.introPose = 0;
    this.rotY = faceYaw;
    this.container.visible = true;
    this.root.scale.setScalar(0.01);
    this.syncTransform();
  }

  /** 開戰：交還 AI (開戰前 delay 秒不出手) */
  public startFight(delay: number) {
    this.act = 'NEUTRAL';
    this.root.scale.setScalar(1);
    this.neutralTime = delay;
    this.actTimer = 0;
    this.sinceLastAttack = 0;
  }

  /** 玩家倒下：Boss 收劍鞠躬，停止一切出手 */
  public triumph() {
    this.act = 'TRIUMPH';
    this.actTimer = 0;
    this.attack = null;
    this.resetHats();
    this.clearSpecials();
    for (const r of this.rings) r.active = false;
    this.landNow();
  }

  /** 收起 S4 荊棘與 S5 分身 (中斷 / 換樂章 / 結束) */
  private clearSpecials() {
    this.fx.hideThorns();
    if (this.clone.visible) {
      if (this.act !== 'HIDDEN') this.fx.petalBurst(this.clone.position.x, 1.1, this.clone.position.z, 20, 3, PETAL_PALETTE_SHADOW, 2);
      this.clone.visible = false;
    }
    this.cloneFade = 0;
    this.cloneDissolve = 1;
  }

  private resetHats() {
    for (const h of this.hats) { h.active = false; h.mesh.scale.setScalar(1); }
    if (this.hat.parent !== this.body) this.body.add(this.hat);
    this.hat.position.copy(this.hatHome);
    this.hat.rotation.set(0, 0, 0);
    this.hat2.visible = false;
  }

  private landNow() {
    this.airY = 0;
    this.position.y = 0;
  }

  // ===== 玩家打 Boss (解析式) =====

  /** 近戰單體：水平距離 < 觸及 + 體型補正 */
  public tryHitMelee(origin: THREE.Vector3, reach: number, damage: number): BossDamageResult | null {
    if (!this.isHittable) return null;
    const dx = this.position.x - origin.x;
    const dz = this.position.z - origin.z;
    if (dx * dx + dz * dz >= (reach + HIT_PAD) * (reach + HIT_PAD)) return null;
    if (Math.abs(this.position.y - origin.y) > 2.0) return null;
    return this.applyDamage(damage, _hitPoint.set(this.position.x, this.position.y + 1.3, this.position.z));
  }

  /** 群攻：圓形粗篩 + 扇形 / 長條精篩 (與生態園相同的 PlantAoeShape；LINE 起點可為突進起點) */
  public tryHitAoe(center: THREE.Vector3, radius: number, damage: number, shape: PlantAoeShape | null): BossDamageResult | null {
    if (!this.isHittable) return null;
    const px = this.position.x;
    const pz = this.position.z;
    const dx = px - center.x;
    const dz = pz - center.z;
    if (Math.sqrt(dx * dx + dz * dz) - HIT_PAD >= radius) return null;
    if (shape) {
      if (shape.kind === 1) {
        if (probeLine(shape.ox, shape.oz, shape.fx, shape.fz, shape.len, shape.halfWidth + HIT_PAD, px, pz, _probe) < 0) return null;
      } else {
        const ox = px - shape.ox;
        const oz = pz - shape.oz;
        const d = Math.sqrt(ox * ox + oz * oz);
        if (d - HIT_PAD > FAN_ANGLE_MIN_DIST && (ox * shape.fx + oz * shape.fz) / d < shape.cosHalf) return null;
      }
    }
    return this.applyDamage(damage, _hitPoint.set(px, this.position.y + 1.3, pz));
  }

  /** 投射物點判定：受擊圓柱 (半徑 HIT_PAD、高 BODY_HEIGHT) 外擴彈體半徑 r */
  public tryHitAtPoint(point: THREE.Vector3, r: number, damage: number): BossDamageResult | null {
    if (!this.isHittable) return null;
    const dy = point.y - this.position.y;
    if (dy < -r || dy > BODY_HEIGHT + r) return null;
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const rr = HIT_PAD + r;
    if (dx * dx + dz * dz >= rr * rr) return null;
    return this.applyDamage(damage, _hitPoint.copy(point));
  }

  private applyDamage(damage: number, point: THREE.Vector3): BossDamageResult {
    const res = this.bars.damage(Math.max(1, Math.round(damage)));
    if (res.applied > 0) {
      this.flashTimer = 0.08;
      this.material.emissive.setHex(0xffffff);
      slashFX.hitFlash(point.x, point.y, point.z, 0xffe0ea);
      this.recentHits[this.recentHitIdx] = this.clock;
      this.recentHitIdx = (this.recentHitIdx + 1) % this.recentHits.length;
    }
    this.host.onBossDamaged(res, point);
    if (res.defeated) this.beginDefeat();
    else if (res.barBroken) this.beginTransition();
    return res;
  }

  // ===== 換樂章 / 擊破 =====

  private beginTransition() {
    this.bars.invulnerable = true;
    this.act = 'TRANSITION';
    this.actTimer = 0;
    this.transitionSec = FENCER.BAR_BREAK_POSE_SEC + FENCER.BAR_TRANSITION_SEC;
    this._transitionCentered = false;
    this.attack = null;
    this.move = 'NONE';
    this.resetHats();
    this.clearSpecials();
    for (const r of this.rings) r.active = false;
    this.landNow();
    this.fx.petalBurst(this.position.x, 1.3, this.position.z, 60, 6, PETAL_PALETTE_ROSE, 3);
    this.host.shake(0.3);
  }

  private blinkToCenter() {
    this._transitionCentered = true;
    const pal = this.bars.bar === 0 ? PETAL_PALETTE_DUSK : PETAL_PALETTE_SUN;
    this.fx.petalBurst(this.position.x, 1.1, this.position.z, 40, 5, pal, 3);
    this.position.set(FENCER.ARENA_X, 0, FENCER.ARENA_Z);
    this.airY = 0;
    const p = this.host.playerPos;
    this.rotY = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    this.fx.petalBurst(this.position.x, 0.6, this.position.z, 60, 6, pal, 3.5);
    this.fx.petalTornado(this.position.x, this.position.z, 1.6, 50, pal, 1.2);
    soundManager.playDodge(true, this.position);
  }

  /** 換樂章中且已回到中央 */
  public get transitionCentered(): boolean {
    return this._transitionCentered;
  }

  private endTransition() {
    this.bars.advanceBar();
    this.bars.invulnerable = false;
    this.phase = this.bars.bar;
    this.rotationIdx = 0;
    this.cooldown.S1 = 0;
    this.cooldown.S2 = 2;
    this.cooldown.S3 = 6;
    this.cooldown.S4 = 4;
    this.cooldown.S5 = 3;
    this.act = 'NEUTRAL';
    this.neutralTime = 0.8;
  }

  private beginDefeat() {
    this.act = 'DEFEATED';
    this.actTimer = 0;
    this.attack = null;
    this.move = 'NONE';
    this.resetHats();
    this.clearSpecials();
    for (const r of this.rings) r.active = false;
    this.landNow();
  }

  /** 換樂章過場總長 (秒)；宿主依台詞字數以 setTransitionDuration 設定 */
  public get transitionTotal(): number {
    return this.transitionSec;
  }

  /** 宿主設定本次換樂章過場總長 (擊破亮相 + 回中央 + 台詞) */
  public setTransitionDuration(sec: number) {
    this.transitionSec = Math.max(FENCER.BAR_BREAK_POSE_SEC + 0.5, sec);
  }

  /** 宿主結束換樂章過場 (跳過 / 台詞播完) */
  public endTransitionNow() {
    if (this.act === 'TRANSITION') this.endTransition();
  }

  // ===== 每幀 =====

  public update(dt: number) {
    if (this.act === 'HIDDEN') return;
    this.clock += dt;
    this.animTime += dt;
    this.actTimer += dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.material.emissive.setHex(0x000000);
    }
    for (const k of Object.keys(this.cooldown) as AttackId[]) if (this.cooldown[k] > 0) this.cooldown[k] -= dt;
    this.sinceLastAttack += dt;

    switch (this.act) {
      case 'INTRO': this.updateIntro(dt); break;
      case 'NEUTRAL': this.updateNeutral(dt); break;
      case 'ATTACK': this.updateAttack(dt); break;
      case 'RECOVER':
        this.updateMovement(dt, false);
        if (this.actTimer >= 0.7) { this.act = 'NEUTRAL'; this.neutralTime = this.rollNeutral(); }
        break;
      case 'BOW':
        if (this.actTimer >= BOW_SEC) { this.act = 'RECOVER'; this.actTimer = 0.1; }
        break;
      case 'TRANSITION':
        if (this.actTimer >= FENCER.BAR_BREAK_POSE_SEC && this.actTimer - dt < FENCER.BAR_BREAK_POSE_SEC) {
          const pal = this.bars.bar === 0 ? PETAL_PALETTE_DUSK : PETAL_PALETTE_SUN;
          this.fx.petalTornado(this.position.x, this.position.z, 2.2, 90, pal, 3.0);
        }
        // 花瓣龍捲收束後瞬移回結界中央 (頭頂框 / 台詞一定在牆內、鏡頭好取景)，面向玩家
        if (!this.transitionCentered && this.actTimer >= TRANSITION_BLINK_AT) this.blinkToCenter();
        if (this.actTimer >= this.transitionTotal) this.endTransition();
        break;
      case 'DEFEATED':
        if (this.actTimer >= this.defeatDissolveAt && this.root.visible) {
          this.root.visible = false;
          this.fx.petalBurst(this.position.x, 1.2, this.position.z, 140, 7, PETAL_PALETTE_SUN, 4);
          this.fx.petalBurst(this.position.x, 1.2, this.position.z, 60, 5, PETAL_PALETTE_ROSE, 3);
        }
        break;
      case 'TRIUMPH':
        break;
    }
    this.updateHats(dt);
    this.updateRings(dt);
    this.updateClone(dt);
    this.clampToArena();
    this.syncTransform();
    this.animate(dt);
    this.bubble.update(dt);
  }

  private updateIntro(dt: number) {
    // 0~0.6s 由花瓣龍捲中長出、0.6~1.4s 壓帽沿、1.4s 起拔劍行劍禮
    const t = this.actTimer;
    const s = Math.min(1, t / 0.6);
    this.root.scale.setScalar(0.01 + 0.99 * (1 - Math.pow(1 - s, 3)));
    this.introPose = t;
    void dt;
  }

  // ----- 中立期與選招 -----

  private rollNeutral(): number {
    const spec = PHASES[this.phase];
    return (NEUTRAL_MIN + Math.random() * NEUTRAL_RAND) / spec.pressure;
  }

  private distToPlayer(): number {
    const p = this.host.playerPos;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  private updateNeutral(dt: number) {
    const dist = this.distToPlayer();
    // 反貼身：玩家貼身 > 1.2s 或 2 秒內吃到 5 擊 → 後空翻脫身
    if (dist < 1.2) this.closeTimer += dt; else this.closeTimer = 0;
    // 反風箏：玩家脫戰或距離 > 8m 超過 1.5s → 追擊
    const wasChasing = this.farTimer > CHASE_AFTER;
    if (this.host.playerOutOfCombat || dist > FENCER.OOC_MIN_DIST) this.farTimer += dt; else this.farTimer = 0;
    if (!wasChasing && this.farTimer > CHASE_AFTER) this.host.onCue?.('CHASE');

    if (this.host.playerDead) return;
    if (this.move === 'NONE' && this.movePause <= 0 && (this.closeTimer > 1.2 || this.hitsInLast(2) >= 5)) {
      this.startBackflip();
      this.host.onCue?.('BACKFLIP');
      this.closeTimer = 0;
      this.recentHits.fill(-99);
      return;
    }
    this.neutralTime -= dt;
    if (this.neutralTime > 0 || this.sinceLastAttack < 0.5) {
      this.updateMovement(dt, true); // 中立期：側步拉扯
      return;
    }
    // 中立期結束：等目前的位移做完再選招
    if (this.move !== 'NONE' || this.movePause > 0) {
      this.updateMovement(dt, false);
      return;
    }
    this.facePlayer(dt, 8);

    const chase = this.farTimer > CHASE_AFTER;
    if (this.pendingChaseThrust) {
      this.pendingChaseThrust = false;
      if (this.cooldown.S1 <= 0 || chase) { this.beginAttack('S1', true); return; }
    }
    if (chase) {
      if (this.cooldown.S2 <= 0) { this.beginAttack('S2', false); return; }
      if (dist > 4) { this.startBlink(); this.pendingChaseThrust = true; return; }
    }
    const next = this.nextRotationAttack();
    // 依距離微調：玩家遠 (> 12m) 優先高帽、< 2m 近身單刺
    if (dist > HAT_PRIORITY_DIST && this.cooldown.S2 <= 0) { this.beginAttack('S2', false); return; }
    if (dist < 2 && this.cooldown.S1 <= 0) { this.beginAttack('S1', true); return; }
    if (next && this.cooldown[next] <= 0) {
      this.rotationIdx++;
      this.beginAttack(next, false);
      return;
    }
    // 招式冷卻中：繼續側步拉扯；距離過遠瞬步拉近
    if (dist > BLINK_CLOSE_DIST) this.startBlink();
    else this.neutralTime = 0.3;
  }

  private nextRotationAttack(): AttackId | null {
    const rot = PHASES[this.phase].rotation;
    for (let i = 0; i < rot.length; i++) {
      const id = rot[(this.rotationIdx) % rot.length];
      if (IMPLEMENTED_ATTACKS.has(id)) return id;
      this.rotationIdx++; // 未實作插槽：略過
    }
    return null;
  }

  private hitsInLast(sec: number): number {
    let n = 0;
    for (const t of this.recentHits) if (this.clock - t <= sec) n++;
    return n;
  }

  // ----- 移動 (側步 / 後空翻 / 瞬步) -----

  private updateMovement(dt: number, allowStart: boolean) {
    if (this.movePause > 0) { this.movePause -= dt; this.facePlayer(dt, 10); return; }
    if (this.move !== 'NONE') {
      this.moveT += dt;
      const k = Math.min(1, this.moveT / this.moveDur);
      const e = this.move === 'BLINK' ? k : k * (2 - k);
      this.position.x = this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * e;
      this.position.z = this.moveFrom.z + (this.moveTo.z - this.moveFrom.z) * e;
      this.position.y = this.move === 'BACKFLIP' ? Math.sin(k * Math.PI) * 1.3 : this.airY;
      if (this.move === 'BACKFLIP') this.root.rotation.x = -k * Math.PI * 2;
      if (k >= 1) {
        if (this.move === 'BLINK') this.movePause = 0.3;
        if (this.move === 'BACKFLIP') this.root.rotation.x = 0;
        this.move = 'NONE';
        this.position.y = this.airY;
      }
      if (this.move !== 'BACKFLIP') this.facePlayer(dt, 12);
      return;
    }
    this.facePlayer(dt, 8);
    if (allowStart) this.startSidestep();
  }

  private startSidestep() {
    const p = this.host.playerPos;
    _dir.set(this.position.x - p.x, 0, this.position.z - p.z);
    const d = _dir.length() || 1;
    _dir.divideScalar(d);
    if (Math.random() < 0.3) this.sideSign = -this.sideSign;
    const speed = PHASES[this.phase].speedMul;
    // 切線 3m + 徑向修正到偏好距離 6~9m
    const radial = d < PREFERRED_MIN ? Math.min(2, PREFERRED_MIN - d) : d > PREFERRED_MAX ? -Math.min(2.5, d - PREFERRED_MAX) : 0;
    this.moveFrom.copy(this.position);
    this.moveTo.set(
      this.position.x + (-_dir.z * this.sideSign) * SIDESTEP_DIST * speed + _dir.x * radial,
      0,
      this.position.z + (_dir.x * this.sideSign) * SIDESTEP_DIST * speed + _dir.z * radial
    );
    this.clampPoint(this.moveTo, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD - 0.5);
    this.move = 'SIDESTEP';
    this.moveT = 0;
    this.moveDur = 0.25;
    this.movePause = 0.15 + Math.random() * 0.25;
  }

  private startBackflip() {
    const p = this.host.playerPos;
    _dir.set(this.position.x - p.x, 0, this.position.z - p.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(-Math.sin(this.rotY), 0, -Math.cos(this.rotY));
    _dir.normalize();
    this.moveFrom.copy(this.position);
    this.moveTo.copy(this.position).addScaledVector(_dir, BACKFLIP_DIST);
    this.clampPoint(this.moveTo, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD - 0.3);
    this.rotY = Math.atan2(-_dir.x, -_dir.z);
    this.move = 'BACKFLIP';
    this.moveT = 0;
    this.moveDur = 0.35;
    soundManager.playDodge(false, this.position);
  }

  private startBlink() {
    const p = this.host.playerPos;
    _dir.set(p.x - this.position.x, 0, p.z - this.position.z);
    const d = _dir.length();
    if (d < 0.01) return;
    _dir.divideScalar(d);
    const step = Math.min(BLINK_MIN + Math.random() * BLINK_RAND, Math.max(0, d - 2.5));
    if (step < 1) return;
    this.fx.petalBurst(this.position.x, 1.1, this.position.z, 24, 3, PETAL_PALETTE_ROSE, 1.5);
    this.moveFrom.copy(this.position);
    this.moveTo.copy(this.position).addScaledVector(_dir, step);
    this.clampPoint(this.moveTo, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD);
    this.move = 'BLINK';
    this.moveT = 0;
    this.moveDur = 0.15;
    soundManager.playDodge(true, this.position);
  }

  private facePlayer(dt: number, rate: number) {
    const p = this.host.playerPos;
    const target = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    const diff = Math.atan2(Math.sin(target - this.rotY), Math.cos(target - this.rotY));
    this.rotY += diff * Math.min(1, dt * rate);
  }

  // ----- 出招 -----

  private beginAttack(id: AttackId, close: boolean) {
    const spec = PHASES[this.phase];
    this.attack = id;
    this.act = 'ATTACK';
    this.atkTimer = 0;
    this.atkStep = 0;
    this.move = 'NONE';
    this.movePause = 0;
    this.farTimer = 0;
    const cdScale = 1 / spec.pressure;
    if (id === 'S1') {
      this.s1Count = close ? 1 : spec.s1Thrusts;
      this.s1Echo = !close && spec.s1Echo;
      this.s1Wave = !close;
      this.cooldown.S1 = BASE_COOLDOWN.S1 * cdScale;
      this.beginThrustAim(true);
    } else if (id === 'S2') {
      this.cooldown.S2 = BASE_COOLDOWN.S2 * cdScale;
      this.beginHatWindup(spec.s2Hats);
    } else if (id === 'S3') {
      this.cooldown.S3 = spec.s3Cooldown;
      this.s3RingsLeft = spec.s3Rings;
    } else if (id === 'S4') {
      this.cooldown.S4 = BASE_COOLDOWN.S4;
      this.beginThornLeap();
    } else if (id === 'S5') {
      this.cooldown.S5 = BASE_COOLDOWN.S5;
      this.s5Round = 0;
      this.beginPinchAim(true);
    }
    if (id !== 'S3') this.host.onCue?.(id);
  }

  /** 收招；extraRecover = 額外破綻秒數 (RECOVER 期間可被輸出) */
  private finishAttack(toBow: boolean, extraRecover: number = 0) {
    this.attack = null;
    this.sinceLastAttack = 0;
    this.act = toBow ? 'BOW' : 'RECOVER';
    this.actTimer = toBow ? 0 : 0.1 * Math.random() - extraRecover;
    if (toBow) this.host.onCue?.('BOW');
  }

  private updateAttack(dt: number) {
    this.atkTimer += dt;
    if (this.attack === 'S1') this.updateS1(dt);
    else if (this.attack === 'S2') this.updateS2(dt);
    else if (this.attack === 'S3') this.updateS3(dt);
    else if (this.attack === 'S4') this.updateS4(dt);
    else if (this.attack === 'S5') this.updateS5(dt);
    else this.finishAttack(false);
  }

  // S1 玫瑰連刺：預警長條 (= 判定寬) 持續追蹤玩家、打出前 0.3/0.25s 鎖定 (變白) → 0.12s 突進到玩家位置 +2.5m (4~9m)；
  // 每刺間最多轉向 60°。末刺 (非近身單刺) 帶扇形衝擊波：末刺預警起就畫出扇形，刺完 0.35s 後爆發
  private beginThrustAim(first: boolean) {
    const p = this.host.playerPos;
    const target = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    let diff = Math.atan2(Math.sin(target - this.rotY), Math.cos(target - this.rotY));
    if (!first) diff = Math.max(-S1_MAX_TURN, Math.min(S1_MAX_TURN, diff));
    this.rotY += diff;
    this.s1Start.copy(this.position).setY(0);
    this.planS1End();
    // 連刺追擊：前一刺刺中 → 預警縮短、傷害提高 (第 2 管起)
    this.s1Follow = !first && this.s1Hit && PHASES[this.phase].followUp;
    const windup = first ? S1_FIRST_WINDUP : this.s1Follow ? S1_FOLLOW_WINDUP : S1_NEXT_WINDUP;
    this.s1Decal = this.fx.warnLine(this.s1Start.x, this.s1Start.z, this.s1End.x, this.s1End.z, S1_HIT_R, windup, windup + S1_DASH_SEC, COLOR_WARN);
    this.s1FanDecal = -1;
    if (this.s1Wave && this.s1Count === 1) {
      const fill = windup + S1_DASH_SEC + S1_WAVE_DELAY;
      this.s1FanDecal = this.fx.warnFan(this.s1Start.x, this.s1Start.z, this.rotY, S1_HIT_R, S1_WAVE_TAN, this.waveLength(), fill, fill + 0.05, COLOR_WARN_BIG);
    }
    if (first || this.s1Follow) slashFX.hitFlash(this.position.x + Math.sin(this.rotY) * 0.9, 1.0, this.position.z + Math.cos(this.rotY) * 0.9, 0xffffff);
    this.atkStep = 0; // 0 = 瞄準
    this.atkTimer = 0;
    this.s1Hit = false;
    this.s1Windup = windup;
    this.s1Lead = first ? S1_LOCK_FIRST : S1_LOCK_NEXT;
    this.s1Locked = this.s1Follow; // 追擊刺不追蹤 (預警本來就短)
  }

  /** 依目前朝向與玩家距離決定突刺終點 (到玩家 +2.5m，夾在 4~9m、結界內) */
  private planS1End() {
    const p = this.host.playerPos;
    const d = Math.hypot(p.x - this.s1Start.x, p.z - this.s1Start.z);
    const len = Math.max(S1_MIN_LEN, Math.min(S1_LEN, d + S1_OVERSHOOT));
    this.s1End.set(this.s1Start.x + Math.sin(this.rotY) * len, 0, this.s1Start.z + Math.cos(this.rotY) * len);
    this.clampPoint(this.s1End, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD);
  }

  /** 衝擊波長度：末刺起點沿朝向到結界牆 */
  private waveLength(): number {
    return rayCircleDistance(this.s1Start.x, this.s1Start.z, Math.sin(this.rotY), Math.cos(this.rotY), FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R);
  }

  private updateS1(dt: number) {
    const windup = this.s1Windup;
    if (this.atkStep === 0) {
      if (!this.s1Locked) {
        if (windup - this.atkTimer > this.s1Lead) {
          // 追蹤：轉速上限，預警長條 / 扇形跟著轉
          const p = this.host.playerPos;
          const target = Math.atan2(p.x - this.s1Start.x, p.z - this.s1Start.z);
          const diff = Math.atan2(Math.sin(target - this.rotY), Math.cos(target - this.rotY));
          const step = S1_TRACK_RATE * dt;
          this.rotY += Math.max(-step, Math.min(step, diff));
          this.planS1End();
          this.fx.moveLine(this.s1Decal, this.s1Start.x, this.s1Start.z, this.s1End.x, this.s1End.z);
          if (this.s1FanDecal >= 0) this.fx.moveFan(this.s1FanDecal, this.s1Start.x, this.s1Start.z, this.rotY, this.waveLength());
        } else {
          this.s1Locked = true;
          this.fx.setDecalColor(this.s1Decal, COLOR_LOCK);
        }
      }
      if (this.atkTimer >= windup) {
        this.atkStep = 1;
        this.atkTimer = 0;
        soundManager.playRapierThrust(this.position);
      }
      return;
    }
    if (this.atkStep === 1) {
      const k = Math.min(1, this.atkTimer / S1_DASH_SEC);
      this.position.x = this.s1Start.x + (this.s1End.x - this.s1Start.x) * k;
      this.position.z = this.s1Start.z + (this.s1End.z - this.s1Start.z) * k;
      this.checkThrustHit(this.s1Start.x, this.s1Start.z, this.position.x, this.position.z, this.s1Count === 1);
      if (k >= 1) {
        slashFX.dashBand(this.s1Start.x, this.s1Start.z, this.s1End.x, this.s1End.z, S1_HIT_R * 2, 0.4, 0xff5c8a);
        this.fx.petalBurst(this.s1End.x, 1.0, this.s1End.z, 20, 4, PETAL_PALETTE_ROSE, 1.8);
        this.s1Count--;
        if (this.s1Count > 0) this.beginThrustAim(false);
        else if (this.s1Wave) {
          this.atkStep = 3;
          this.atkTimer = 0;
        } else this.afterLastThrust();
      }
      return;
    }
    if (this.atkStep === 3) {
      if (this.atkTimer < S1_WAVE_DELAY) return;
      this.fireWave();
      this.afterLastThrust();
      return;
    }
    // 玫瑰殘影：0.4s 後沿同一條線再刺一次
    if (this.atkStep === 2 && this.atkTimer >= S1_ECHO_DELAY) {
      this.s1Hit = false;
      this.s1Follow = false;
      this.checkThrustHit(this.s1Start.x, this.s1Start.z, this.s1End.x, this.s1End.z, false);
      slashFX.dashBand(this.s1Start.x, this.s1Start.z, this.s1End.x, this.s1End.z, S1_HIT_R * 2, 0.44, 0xffb3c6);
      this.fx.petalBurst(this.s1Start.x, 1.0, this.s1Start.z, 24, 4, PETAL_PALETTE_ROSE, 1.8);
      soundManager.playRapierThrust(this.s1Start);
      this.finishAttack(false);
    }
  }

  /** 末刺之後：玫瑰殘影 (第 2 管起) 或收招 */
  private afterLastThrust() {
    if (this.s1Echo) {
      this.atkStep = 2;
      this.atkTimer = 0;
      this.fx.warnLine(this.s1Start.x, this.s1Start.z, this.s1End.x, this.s1End.z, S1_HIT_R, S1_ECHO_DELAY, S1_ECHO_DELAY + S1_DASH_SEC, COLOR_WARN);
    } else this.finishAttack(false);
  }

  /** 玫瑰衝擊波：扇形 (起點半寬 S1_HIT_R、半角 18°) 自末刺起點衝到牆；判定瞬間 (可跳不可、閃身步無敵可吃掉) */
  private fireWave() {
    const ox = this.s1Start.x;
    const oz = this.s1Start.z;
    const ux = Math.sin(this.rotY);
    const uz = Math.cos(this.rotY);
    const len = this.waveLength();
    this.fx.waveFan(ox, oz, this.rotY, S1_WAVE_HALF_ANGLE, len, 0xff5c8a);
    this.fx.petalBurst(ox + ux * len * 0.5, 0.6, oz + uz * len * 0.5, 30, 6, PETAL_PALETTE_ROSE, 3);
    soundManager.playPetalBloom(this.s1End);
    this.host.shake(0.22);
    const p = this.host.playerPos;
    if (p.y > 1.8) return;
    if (!inFan(ox, oz, ux, uz, S1_HIT_R, S1_WAVE_TAN, len, p.x, p.z)) return;
    _dir.set(ux, 0, uz);
    this.host.damagePlayer(S1_DMG + PHASES[this.phase].dmgBonus, _dir, 6, 2, '玫瑰衝擊波');
  }

  private s1Damage(): number {
    return this.s1Follow ? FOLLOW_DMG : S1_DMG + PHASES[this.phase].dmgBonus;
  }

  private checkThrustHit(ax: number, az: number, bx: number, bz: number, launch: boolean) {
    if (this.s1Hit) return;
    const p = this.host.playerPos;
    if (p.y > 1.8) return;
    if (segmentPointDistance(ax, az, bx, bz, p.x, p.z) > S1_HIT_R) return;
    this.s1Hit = true;
    // 最後一刺 (含近身單刺) 小擊退，其餘只扣血
    const last = launch || this.s1Count === 1;
    if (last) {
      _dir.set(bx - ax, 0, bz - az).normalize();
      this.host.damagePlayer(this.s1Damage(), _dir, 5, 2, '玫瑰三連刺');
    } else {
      this.host.damagePlayer(this.s1Damage(), null, 0, 0, '玫瑰三連刺');
    }
  }

  // S2 高帽迴旋斬：預備 0.6s (地面虛線弧) → 帽子 (放大 1.8 倍) 去回兩段二次貝茲 (共 2.0s、飛 18m)，球形 r=1.3，去回各命中一次
  private beginHatWindup(count: number) {
    const p = this.host.playerPos;
    _dir.set(p.x - this.position.x, 0, p.z - this.position.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(this.rotY), 0, Math.cos(this.rotY));
    _dir.normalize();
    this.rotY = Math.atan2(_dir.x, _dir.z);
    const len = S2_LEN * (this.host.isTouch ? 0.85 : 1);
    const side = Math.random() < 0.5 ? 1 : -1;
    const dots = this.fx.hatDotCount;
    for (let h = 0; h < count; h++) {
      const hf = this.hats[h];
      const s = h === 0 ? side : -side;
      hf.side = s;
      hf.p0.set(this.position.x, 1.5, this.position.z);
      hf.p2.set(this.position.x + _dir.x * len, 1.2, this.position.z + _dir.z * len);
      this.clampPoint(hf.p2, FENCER.ARENA_R - 0.5);
      const mx = (hf.p0.x + hf.p2.x) / 2;
      const mz = (hf.p0.z + hf.p2.z) / 2;
      hf.p1.set(mx + -_dir.z * s * S2_BOW, 1.4, mz + _dir.x * s * S2_BOW);
      hf.p3.set(mx + _dir.z * s * S2_BOW, 1.4, mz - _dir.x * s * S2_BOW);
      // 虛線弧：去程 + 回程各半
      const per = Math.max(2, Math.floor(dots / count / 2));
      for (let i = 1; i <= per; i++) {
        this.bezier(hf.p0, hf.p1, hf.p2, i / per, _v);
        this.fx.warnDot(_v.x, _v.z, 0.6, S2_WINDUP + S2_FLIGHT * 0.5, COLOR_HAT);
        this.bezier(hf.p2, hf.p3, hf.p0, i / per, _v);
        this.fx.warnDot(_v.x, _v.z, 0.5, S2_WINDUP + S2_FLIGHT, COLOR_HAT);
      }
    }
    // 帽子舉起發光 (第二樂章另從帽中變出第二頂)
    this.hat.position.set(0, 1.25, 0.1);
    this.atkStep = 0;
    this.hatCount = count;
  }

  private bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
    const u = 1 - t;
    return out.set(
      u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      u * u * a.y + 2 * u * t * b.y + t * t * c.y,
      u * u * a.z + 2 * u * t * b.z + t * t * c.z
    );
  }

  private updateS2(dt: number) {
    const count = this.hatCount;
    if (this.atkStep === 0) {
      this.facePlayer(dt, 4);
      if (this.atkTimer >= S2_WINDUP) {
        this.atkStep = 1;
        this.atkTimer = 0;
        for (let h = 0; h < count; h++) {
          const hf = this.hats[h];
          hf.active = true;
          hf.hitOut = false;
          hf.hitBack = false;
          this.container.attach(hf.mesh);
          hf.mesh.visible = true;
          hf.mesh.scale.setScalar(S2_HAT_SCALE);
          hf.mesh.position.copy(hf.p0);
          hf.lastPos.copy(hf.p0);
        }
        this.hatSpinSfx = 0;
      }
      return;
    }
    // 帽子飛行期間 Boss 只側步、不出其他招
    this.updateMovement(dt, true);
    if (this.atkTimer >= S2_FLIGHT) {
      this.resetHats();
      this.finishAttack(false);
    }
  }

  private updateHats(dt: number) {
    if (this.attack !== 'S2' || this.atkStep !== 1) return;
    const t = Math.min(1, this.atkTimer / S2_FLIGHT);
    const p = this.host.playerPos;
    this.hatSpinSfx -= dt;
    for (const hf of this.hats) {
      if (!hf.active) continue;
      hf.lastPos.copy(hf.mesh.position);
      // 回程終點追蹤 Boss 目前位置
      _v2.set(this.position.x, 1.5, this.position.z);
      if (t < 0.5) this.bezier(hf.p0, hf.p1, hf.p2, t * 2, hf.mesh.position);
      else this.bezier(hf.p2, hf.p3, _v2, (t - 0.5) * 2, hf.mesh.position);
      hf.mesh.rotation.set(0.25, this.animTime * 22, 0);
      // 球形判定 (玩家胸口)
      const dx = hf.mesh.position.x - p.x;
      const dy = hf.mesh.position.y - (p.y + 1.0);
      const dz = hf.mesh.position.z - p.z;
      const outbound = t < 0.5;
      const already = outbound ? hf.hitOut : hf.hitBack;
      if (!already && dx * dx + dy * dy + dz * dz < (S2_HIT_R + 0.45) * (S2_HIT_R + 0.45)) {
        if (outbound) hf.hitOut = true; else hf.hitBack = true;
        // 側向推：帽子行進方向
        _dir.set(hf.mesh.position.x - hf.lastPos.x, 0, hf.mesh.position.z - hf.lastPos.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(-dx, 0, -dz);
        _dir.normalize();
        this.host.damagePlayer(S2_DMG, _dir, 4, 1.5, '高帽迴旋斬');
      }
      if (this.hatSpinSfx <= 0) soundManager.playHatSpin(hf.mesh.position);
    }
    if (this.hatSpinSfx <= 0) this.hatSpinSfx = 0.4;
  }

  // S3 萬花華爾滋・終幕：旋轉 0.6s → 躍起滯空，依序標出 N 個綻放圈 (r3.5，第一個在玩家腳下、其後依速度預測)，
  // 每圈 0.8s 後爆花瓣柱；終幕：第一樂章落點大圈 r8.5 (1.4s)，第二樂章起全場爆發只留金色安全圈 (1.8 / 1.7s)；
  // 收招 1.5s 脫帽致意 (固定破綻)
  private updateS3(dt: number) {
    const p = this.host.playerPos;
    if (this.atkStep === 0) {
      this.rotY += dt * 14;
      if (this.atkTimer >= S3_SPIN) {
        this.atkStep = 1;
        this.atkTimer = 0;
        this.s3RingTimer = 0;
        soundManager.playDodge(true, this.position);
        this.fx.petalBurst(this.position.x, 0.5, this.position.z, 30, 4, PETAL_PALETTE_ROSE, 3);
        this.host.onCue?.('S3_JUMP');
      }
      return;
    }
    if (this.atkStep === 1) {
      // 躍起 0.4s 到 6m，滯空期間逐一標圈
      this.airY = Math.min(S3_AIR_Y, this.airY + dt * (S3_AIR_Y / 0.4));
      this.position.y = this.airY;
      this.facePlayer(dt, 6);
      this.s3RingTimer -= dt;
      if (this.s3RingsLeft > 0 && this.s3RingTimer <= 0) {
        const first = this.s3RingTimer > -1 && this.s3RingsLeft === PHASES[this.phase].s3Rings;
        if (first) _v.set(p.x, 0, p.z);
        else _v.set(p.x + this.host.playerVel.x * 0.9, 0, p.z + this.host.playerVel.z * 0.9);
        this.clampPoint(_v, FENCER.ARENA_R - 1);
        this.queueRing(_v.x, _v.z, S3_RING_R, S3_RING_WARN, S3_RING_DMG + PHASES[this.phase].dmgBonus, false);
        this.s3RingsLeft--;
        this.s3RingTimer = S3_RING_GAP;
        if (this.s3RingsLeft === 0) {
          // 終幕：Boss 落在玩家目前位置；第一樂章大圈、之後全場 (安全圈)
          this.s3Land.set(p.x, 0, p.z);
          this.clampPoint(this.s3Land, FENCER.ARENA_R - 2);
          this.s3From.copy(this.position);
          const field = PHASES[this.phase].s3Field;
          if (field) {
            this.planSafeZones(p.x, p.z, field.n, field.r, field.near[0], field.near[1]);
            this.s3FinaleSec = field.warn;
            this.queueField(field.warn, S3_FINAL_DMG);
          } else {
            this.s3FinaleSec = S3_FINAL_WARN + S3_RING_GAP;
            this.queueRing(this.s3Land.x, this.s3Land.z, S3_FINAL_R, this.s3FinaleSec, S3_FINAL_DMG, true);
          }
          this.atkStep = 2;
          this.atkTimer = 0;
          this.host.onCue?.('S3_FINALE');
        }
      }
      return;
    }
    if (this.atkStep === 2) {
      // 空中移到落點上方，預警結束瞬間落地
      const k = Math.min(1, this.atkTimer / this.s3FinaleSec);
      this.position.x = this.s3From.x + (this.s3Land.x - this.s3From.x) * k;
      this.position.z = this.s3From.z + (this.s3Land.z - this.s3From.z) * k;
      this.airY = k < 0.8 ? S3_AIR_Y : S3_AIR_Y * (1 - (k - 0.8) / 0.2);
      this.position.y = this.airY;
      if (k >= 1) {
        this.landNow();
        this.atkStep = 3;
        this.finishAttack(true); // 脫帽致意破綻
      }
    }
  }

  // S4 玫瑰荊棘十字 -----------------------------------------------------------------
  // 躍到場中 (距中心 ≤ 6m) → 細劍插地：四 (終樂章六) 條地面預兆線 (一臂對準玩家) + 旋轉方向箭點 0.9s →
  // 荊棘自劍尖往牆爆出 (打擊幀) → 停 0.4s → 2.2s 內旋轉一個臂距 → 縮回、拔劍 (額外 0.5s 破綻)。
  // 判定：玩家到任一臂線段 ≤ 1.3m 且腳高 < 0.6m (可跳過)；爆發 (含停頓) 與旋轉掃過各最多命中一次。Boss 插劍期間不動、可被打。
  private beginThornLeap() {
    this.s4From.copy(this.position).setY(0);
    this.s4Anchor.copy(this.s4From);
    const dx = this.s4Anchor.x - FENCER.ARENA_X;
    const dz = this.s4Anchor.z - FENCER.ARENA_Z;
    const d = Math.hypot(dx, dz);
    if (d > S4_ANCHOR_MAX) {
      this.s4Anchor.x = FENCER.ARENA_X + (dx / d) * S4_ANCHOR_MAX;
      this.s4Anchor.z = FENCER.ARENA_Z + (dz / d) * S4_ANCHOR_MAX;
    }
    this.s4Arms = PHASES[this.phase].thornArms;
    this.s4HitErupt = false;
    this.s4HitSweep = false;
    this.atkStep = 0;
    this.atkTimer = 0;
    soundManager.playDodge(true, this.position);
  }

  private computeThornLens(yaw: number) {
    for (let k = 0; k < MAX_THORN_ARMS; k++) {
      if (k >= this.s4Arms) { this.s4Lens[k] = 0; continue; }
      const a = thornArmYaw(yaw, k, this.s4Arms);
      this.s4Lens[k] = rayCircleDistance(this.s4Anchor.x, this.s4Anchor.z, Math.sin(a), Math.cos(a), FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R);
    }
  }

  private updateS4(dt: number) {
    const a = this.s4Anchor;
    if (this.atkStep === 0) {
      // 躍到插劍點 (小弧線)
      const k = Math.min(1, this.atkTimer / S4_LEAP_SEC);
      this.position.x = this.s4From.x + (a.x - this.s4From.x) * k;
      this.position.z = this.s4From.z + (a.z - this.s4From.z) * k;
      this.position.y = Math.sin(k * Math.PI) * 1.2;
      this.facePlayer(dt, 12);
      if (k >= 1) {
        this.position.set(a.x, 0, a.z);
        this.atkStep = 1;
        this.atkTimer = 0;
        // 一臂對準玩家；旋轉方向隨機
        const p = this.host.playerPos;
        this.s4Yaw = Math.atan2(p.x - a.x, p.z - a.z);
        this.s4Dir = Math.random() < 0.5 ? 1 : -1;
        this.rotY = this.s4Yaw;
        this.computeThornLens(this.s4Yaw);
        for (let i = 0; i < this.s4Arms; i++) {
          const ay = thornArmYaw(this.s4Yaw, i, this.s4Arms);
          const len = this.s4Lens[i];
          this.fx.warnLine(a.x, a.z, a.x + Math.sin(ay) * len, a.z + Math.cos(ay) * len, S4_HALF_W, S4_WARN_SEC, S4_WARN_SEC + 0.05, COLOR_THORN);
          // 旋轉方向箭點：沿旋轉方向由小到大兩點
          for (let j = 1; j <= 2; j++) {
            const da = ay + this.s4Dir * j * 0.2;
            const rr = 5 + j * 1.4;
            this.fx.warnDot(a.x + Math.sin(da) * rr, a.z + Math.cos(da) * rr, 0.35 + j * 0.18, S4_WARN_SEC + S4_ERUPT_SEC + S4_HOLD_SEC, COLOR_THORN);
          }
        }
        slashFX.hitFlash(a.x, 0.3, a.z, 0xffffff);
        this.fx.petalBurst(a.x, 0.2, a.z, 18, 3, PETAL_PALETTE_THORN, 2, 1.6);
        soundManager.playRapierThrust(this.position);
        this.host.shake(0.12);
      }
      return;
    }
    if (this.atkStep === 1) {
      // 預兆：地面十字線填滿；劍下冒小碎片
      if (this.atkTimer >= S4_WARN_SEC) {
        this.atkStep = 2;
        this.atkTimer = 0;
        this.fx.thornFlash(1);
        this.host.shake(0.32);
        soundManager.playPetalBloom(this.position);
        for (let i = 0; i < this.s4Arms; i++) {
          const ay = thornArmYaw(this.s4Yaw, i, this.s4Arms);
          const half = this.s4Lens[i] * 0.5;
          this.fx.petalBurst(a.x + Math.sin(ay) * half, 0.5, a.z + Math.cos(ay) * half, 16, 5, PETAL_PALETTE_THORN, 3.5, 2.2);
        }
      }
      return;
    }
    let yaw = this.s4Yaw;
    let grow = 1;
    let sink = 0;
    if (this.atkStep === 2) {
      grow = Math.min(1, this.atkTimer / S4_ERUPT_SEC);
      if (this.atkTimer >= S4_ERUPT_SEC + S4_HOLD_SEC) { this.atkStep = 3; this.atkTimer = 0; soundManager.playBarrierHum(this.position); }
    } else if (this.atkStep === 3) {
      yaw = thornCrossYaw(this.s4Yaw, this.s4Dir, this.atkTimer, S4_ROTATE_SEC, this.s4Arms);
      if (this.atkTimer >= S4_ROTATE_SEC) { this.atkStep = 4; this.atkTimer = 0; }
    } else {
      yaw = thornCrossYaw(this.s4Yaw, this.s4Dir, S4_ROTATE_SEC, S4_ROTATE_SEC, this.s4Arms);
      sink = Math.min(1, this.atkTimer / S4_RETRACT_SEC);
      if (sink >= 1) {
        this.fx.hideThorns();
        this.fx.petalBurst(a.x, 0.6, a.z, 14, 3, PETAL_PALETTE_THORN, 2.5, 1.4);
        this.finishAttack(false, S4_RECOVER_EXTRA);
        return;
      }
    }
    this.computeThornLens(yaw);
    this.fx.setThornCross(a.x, a.z, yaw, this.s4Lens, grow, sink, this.s4Arms, S4_HALF_W / 0.6);
    if (sink === 0) this.checkThornHit(yaw, grow);
  }

  private checkThornHit(yaw: number, reach: number) {
    const sweep = this.atkStep === 3;
    if (sweep ? this.s4HitSweep : this.s4HitErupt) return;
    const p = this.host.playerPos;
    if (p.y > S4_JUMP_CLEAR) return;
    const a = this.s4Anchor;
    const arm = thornCrossHit(a.x, a.z, yaw, reach, FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R, p.x, p.z, S4_HALF_W, this.s4Arms);
    if (arm < 0) return;
    if (sweep) this.s4HitSweep = true; else this.s4HitErupt = true;
    // 小擊退：垂直於該臂，旋轉中朝旋轉方向 (推到荊棘前方)，爆發時朝玩家所在側
    const ay = thornArmYaw(yaw, arm, this.s4Arms);
    const nx = Math.cos(ay);
    const nz = -Math.sin(ay);
    // yaw 增加時臂朝 (cos, -sin) 掃過 → 旋轉中推往 dirSign 側 (荊棘前方)；爆發時推往玩家所在側
    const side = this.atkStep === 3 ? this.s4Dir : Math.sign((p.x - a.x) * nx + (p.z - a.z) * nz) || 1;
    _dir.set(nx * side, 0, nz * side);
    this.host.damagePlayer(S4_DMG, _dir, 4, 2.5, '玫瑰荊棘十字');
    this.fx.petalBurst(p.x, 0.6, p.z, 12, 4, PETAL_PALETTE_THORN, 3, 1.8);
    slashFX.hitFlash(p.x, 0.8, p.z, 0xff3d8b);
    this.fx.thornFlash(0.6);
    this.host.hitStop(0.05);
    this.host.shake(0.25);
  }

  // S5 花影雙人舞 ---------------------------------------------------------------------
  // 分身自花瓣中成形於玩家另一側 (與本體夾 100°、距玩家 8m)，兩條預警線 (= 判定寬 1.3m) 持續瞄準玩家、打出前 0.3/0.25s 鎖定 →
  // 同時單刺夾擊，一路刺到結界牆 (沿用 S1 光帶)；兩回合 (第二回合分身重新站位、預警較短)，同一回合被兩邊夾到也只吃一次；
  // 分身不可被攻擊，刺完即散成花瓣。安全方向 = 兩線夾角外側 (沿角平分線退開約 1.7m)。
  private beginPinchAim(first: boolean) {
    const p = this.host.playerPos;
    this.rotY = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    const side = Math.random() < 0.5 ? 1 : -1;
    pinchClonePos(p.x, p.z, this.position.x, this.position.z, side, S5_CLONE_ANGLE, S5_CLONE_DIST,
      FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD, _clonePos);
    this.s5ClonePos.set(_clonePos.x, 0, _clonePos.z);
    this.planThrust(this.position.x, this.position.z, p, this.s5BossFrom, this.s5BossTo);
    this.planThrust(_clonePos.x, _clonePos.z, p, this.s5CloneFrom, this.s5CloneTo);
    this.cloneYaw = Math.atan2(p.x - _clonePos.x, p.z - _clonePos.z);
    // 連刺追擊：第 1 回合刺中 → 第 2 回合預警縮短、傷害提高 (s5Hit 於下方才重置)
    this.s5Follow = !first && this.s5Hit && PHASES[this.phase].followUp;
    const windup = first ? S5_FIRST_WINDUP : this.s5Follow ? S5_FOLLOW_WINDUP : S5_NEXT_WINDUP;
    this.s5DecalBoss = this.fx.warnLine(this.s5BossFrom.x, this.s5BossFrom.z, this.s5BossTo.x, this.s5BossTo.z, S5_HIT_R, windup, windup + S5_DASH_SEC, COLOR_WARN);
    this.s5DecalClone = this.fx.warnLine(this.s5CloneFrom.x, this.s5CloneFrom.z, this.s5CloneTo.x, this.s5CloneTo.z, S5_HIT_R, windup, windup + S5_DASH_SEC, COLOR_CLONE);
    // 分身花瓣成形 (舊位置先散)
    if (this.clone.visible) this.fx.petalBurst(this.clone.position.x, 1.1, this.clone.position.z, 14, 3, PETAL_PALETTE_SHADOW, 2);
    this.clone.position.set(_clonePos.x, 0, _clonePos.z);
    this.clone.rotation.set(0, this.cloneYaw, 0);
    this.clone.visible = true;
    this.cloneDissolve = 1;
    this.cloneFade = first ? 3 : 6;
    this.fx.petalTornado(_clonePos.x, _clonePos.z, 0.9, first ? 40 : 24, PETAL_PALETTE_SHADOW, 0.6);
    soundManager.playPetalBloom(this.clone.position);
    if (first || this.s5Follow) slashFX.hitFlash(this.position.x + Math.sin(this.rotY) * 0.9, 1.0, this.position.z + Math.cos(this.rotY) * 0.9, 0xffffff);
    this.s5Hit = false;
    this.s5Windup = windup;
    this.s5Lead = first ? S5_LOCK_FIRST : S5_LOCK_NEXT;
    this.s5Locked = this.s5Follow;
    this.atkStep = 0;
    this.atkTimer = 0;
  }

  /** 由 (x, z) 穿過玩家、一路刺到結界牆的突刺線段 */
  private planThrust(x: number, z: number, p: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) {
    from.set(x, 0, z);
    let dx = p.x - x;
    let dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = Math.sin(this.rotY); dz = Math.cos(this.rotY); } else { dx /= d; dz /= d; }
    const len = Math.max(4, rayCircleDistance(x, z, dx, dz, FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD));
    to.set(x + dx * len, 0, z + dz * len);
    this.clampPoint(to, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD);
  }

  private updateS5(_dt: number) {
    if (this.atkStep === 0) {
      if (!this.s5Locked) {
        if (this.s5Windup - this.atkTimer > this.s5Lead) {
          // 追蹤：本體與分身原地轉向玩家，預警線跟著轉
          const p = this.host.playerPos;
          this.planThrust(this.s5BossFrom.x, this.s5BossFrom.z, p, this.s5BossFrom, this.s5BossTo);
          this.planThrust(this.s5ClonePos.x, this.s5ClonePos.z, p, this.s5CloneFrom, this.s5CloneTo);
          this.rotY = Math.atan2(p.x - this.s5BossFrom.x, p.z - this.s5BossFrom.z);
          this.cloneYaw = Math.atan2(p.x - this.s5ClonePos.x, p.z - this.s5ClonePos.z);
          this.fx.moveLine(this.s5DecalBoss, this.s5BossFrom.x, this.s5BossFrom.z, this.s5BossTo.x, this.s5BossTo.z);
          this.fx.moveLine(this.s5DecalClone, this.s5CloneFrom.x, this.s5CloneFrom.z, this.s5CloneTo.x, this.s5CloneTo.z);
        } else {
          this.s5Locked = true;
          this.fx.setDecalColor(this.s5DecalBoss, COLOR_LOCK);
          this.fx.setDecalColor(this.s5DecalClone, COLOR_LOCK);
        }
      }
      if (this.atkTimer >= this.s5Windup) {
        this.atkStep = 1;
        this.atkTimer = 0;
        soundManager.playRapierThrust(this.position);
        soundManager.playRapierThrust(this.clone.position);
      }
      return;
    }
    if (this.atkStep === 1) {
      const k = Math.min(1, this.atkTimer / S5_DASH_SEC);
      const bf = this.s5BossFrom, bt = this.s5BossTo, cf = this.s5CloneFrom, ct = this.s5CloneTo;
      this.position.x = bf.x + (bt.x - bf.x) * k;
      this.position.z = bf.z + (bt.z - bf.z) * k;
      this.clone.position.set(cf.x + (ct.x - cf.x) * k, 0, cf.z + (ct.z - cf.z) * k);
      this.checkPinchHit(bf.x, bf.z, this.position.x, this.position.z, cf.x, cf.z, this.clone.position.x, this.clone.position.z);
      if (k >= 1) {
        slashFX.dashBand(bf.x, bf.z, bt.x, bt.z, S5_HIT_R * 2, 0.4, 0xff5c8a);
        slashFX.dashBand(cf.x, cf.z, ct.x, ct.z, S5_HIT_R * 2, 0.4, 0xc04dff);
        this.fx.petalBurst(bt.x, 1.0, bt.z, 20, 4, PETAL_PALETTE_ROSE, 1.8);
        this.s5Round++;
        if (this.s5Round < S5_ROUNDS) {
          this.beginPinchAim(false);
        } else {
          // 分身刺完即散；本體收劍 (額外破綻)
          this.cloneFade = -4;
          this.fx.petalBurst(ct.x, 1.1, ct.z, 36, 5, PETAL_PALETTE_SHADOW, 3, 1.5);
          this.finishAttack(false, S5_RECOVER_EXTRA);
        }
      }
    }
  }

  private checkPinchHit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, ex: number, ez: number) {
    if (this.s5Hit) return;
    const p = this.host.playerPos;
    if (p.y > 1.8) return;
    const mask = pinchHitMask(ax, az, bx, bz, cx, cz, ex, ez, p.x, p.z, S5_HIT_R);
    if (mask === 0) return;
    this.s5Hit = true;
    const last = this.s5Round === S5_ROUNDS - 1;
    const dmg = this.s5Follow ? FOLLOW_DMG : S5_DMG + PHASES[this.phase].dmgBonus;
    if (last) {
      // 最後一回合小擊退：兩邊都中時沿兩刺合成方向
      _dir.set(0, 0, 0);
      if (mask & 1) _dir.x += bx - ax, _dir.z += bz - az;
      if (mask & 2) _dir.x += ex - cx, _dir.z += ez - cz;
      if (_dir.lengthSq() < 1e-6) _dir.set(bx - ax, 0, bz - az);
      _dir.normalize();
      this.host.damagePlayer(dmg, _dir, 5, 2, '花影雙人舞');
    } else {
      this.host.damagePlayer(dmg, null, 0, 0, '花影雙人舞');
    }
    if (mask === 3) this.host.hitStop(0.05);
  }

  private updateClone(dt: number) {
    if (!this.clone.visible) return;
    this.cloneMat.uniforms.uTime.value = this.animTime;
    if (this.cloneFade > 0) {
      this.cloneDissolve = Math.max(0, this.cloneDissolve - this.cloneFade * dt);
      if (this.cloneDissolve <= 0) this.cloneFade = 0;
    } else if (this.cloneFade < 0) {
      this.cloneDissolve = Math.min(1, this.cloneDissolve - this.cloneFade * dt);
      if (this.cloneDissolve >= 1) { this.cloneFade = 0; this.clone.visible = false; }
    }
    this.cloneMat.uniforms.uDissolve.value = this.cloneDissolve;
    // 分身朝向本回合突刺方向 (擺動微浮)
    this.clone.rotation.y = this.cloneYaw;
    this.clone.position.y = 0.05 + Math.sin(this.animTime * 6) * 0.04;
  }

  private queueRing(x: number, z: number, r: number, warn: number, dmg: number, big: boolean) {
    for (const ring of this.rings) {
      if (ring.active) continue;
      ring.active = true; ring.x = x; ring.z = z; ring.t = warn; ring.r = r; ring.dmg = dmg; ring.big = big; ring.field = false;
      this.fx.warnCircle(x, z, r, warn, warn + 0.05, big ? COLOR_WARN_BIG : COLOR_WARN, big);
      return;
    }
  }

  /**
   * 全場終幕安全圈：第一圈距玩家 nearMin~nearMax (隨機方向，結界內)，其餘隨機、距玩家 ≥ nearMin、彼此 ≥ S3_FIELD_SPACING；
   * 全部完全落在結界內 (圈緣距牆 ≥ 0.5m)。寫入 s3Safe / s3SafeCount / s3SafeR。
   */
  private planSafeZones(px: number, pz: number, n: number, r: number, nearMin: number, nearMax: number) {
    const lim = FENCER.ARENA_R - r - 0.5;
    this.s3SafeR = r;
    this.s3SafeCount = 0;
    const put = (x: number, z: number) => { const c = this.s3Safe[this.s3SafeCount++]; c.x = x; c.z = z; };
    // 第一圈：最多試 12 個方向，取第一個不用夾回的 (夾回會改變距離)；都不行就夾回
    let placed = false;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 12 && !placed; i++) {
      const a = a0 + i * 0.5236;
      const d = nearMin + Math.random() * (nearMax - nearMin);
      _v.set(px + Math.sin(a) * d, 0, pz + Math.cos(a) * d);
      if (Math.hypot(_v.x - FENCER.ARENA_X, _v.z - FENCER.ARENA_Z) <= lim) { put(_v.x, _v.z); placed = true; }
    }
    if (!placed) {
      // 玩家貼牆：往結界中心方向放
      const dx = FENCER.ARENA_X - px;
      const dz = FENCER.ARENA_Z - pz;
      const d = Math.hypot(dx, dz) || 1;
      _v.set(px + (dx / d) * nearMin, 0, pz + (dz / d) * nearMin);
      this.clampPoint(_v, lim);
      put(_v.x, _v.z);
    }
    for (let tries = 0; this.s3SafeCount < n && tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * lim;
      const x = FENCER.ARENA_X + Math.sin(a) * d;
      const z = FENCER.ARENA_Z + Math.cos(a) * d;
      let ok = Math.hypot(x - px, z - pz) >= nearMin; // 其餘安全圈不比第一圈近 (不落在玩家腳邊)
      for (let k = 0; k < this.s3SafeCount; k++) if (Math.hypot(this.s3Safe[k].x - x, this.s3Safe[k].z - z) < S3_FIELD_SPACING) { ok = false; break; }
      if (ok) put(x, z);
    }
  }

  /** 全場終幕：全場預警 (安全圈挖洞) + 金色安全圈；warn 秒後安全圈外全場爆發 */
  private queueField(warn: number, dmg: number) {
    for (const ring of this.rings) {
      if (ring.active) continue;
      ring.active = true; ring.x = FENCER.ARENA_X; ring.z = FENCER.ARENA_Z; ring.t = warn; ring.r = FENCER.ARENA_R; ring.dmg = dmg; ring.big = true; ring.field = true;
      this.fx.warnField(FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R, this.s3Safe, this.s3SafeCount, this.s3SafeR, warn, warn + 0.05, COLOR_WARN_BIG);
      for (let k = 0; k < this.s3SafeCount; k++) this.fx.warnCircle(this.s3Safe[k].x, this.s3Safe[k].z, this.s3SafeR, 0.35, warn + 0.05, COLOR_SAFE);
      return;
    }
  }

  /** 玩家是否站在任一全場終幕安全圈內 (圈心距 ≤ 半徑) */
  private inSafeZone(x: number, z: number): boolean {
    for (let k = 0; k < this.s3SafeCount; k++) if (Math.hypot(this.s3Safe[k].x - x, this.s3Safe[k].z - z) <= this.s3SafeR) return true;
    return false;
  }

  private updateRings(dt: number) {
    const p = this.host.playerPos;
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.t -= dt;
      if (ring.t > 0) continue;
      ring.active = false;
      const dx = p.x - ring.x;
      const dz = p.z - ring.z;
      if (ring.field) {
        this.fireField(ring.dmg);
        continue;
      }
      const inside = dx * dx + dz * dz <= (ring.r + 0.3) * (ring.r + 0.3) && p.y < 2.5;
      _fxPoint.set(ring.x, 0, ring.z);
      if (ring.big) {
        comboFinisherFX.groundSlam(_fxPoint, ring.r, ROSE_STYLE, false, true);
        comboFinisherFX.spinWave(_fxPoint, ring.r * 1.1, 1.0, ROSE_STYLE, 0, 0, 0);
        this.fx.petalBurst(ring.x, 0.4, ring.z, 70, 7, PETAL_PALETTE_ROSE, 4);
        this.host.shake(0.35);
        this.host.hitStop(0.06);
        soundManager.playFinaleChime(_fxPoint);
        if (inside) {
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 0.05) _dir.set(dx / d, 0, dz / d); else _dir.set(Math.sin(this.rotY), 0, Math.cos(this.rotY));
          this.host.damagePlayer(ring.dmg, _dir, 9, 6, '萬花華爾滋・終幕');
        }
      } else {
        this.fx.pillar(ring.x, ring.z, ring.r * 0.8, 0xff5c8a);
        this.fx.petalBurst(ring.x, 0.3, ring.z, 16, 3, PETAL_PALETTE_ROSE, 4);
        soundManager.playPetalBloom(_fxPoint);
        if (inside) this.host.damagePlayer(ring.dmg, null, 0, 0, '萬花綻放');
      }
    }
  }

  /** 全場終幕爆發：安全圈外全場花瓣柱 + Boss 落點衝擊；不在安全圈內 (且未跳過 2.5m) 即命中 */
  private fireField(dmg: number) {
    const R = FENCER.ARENA_R;
    // 花瓣柱：兩圈環狀分布 (避開安全圈)
    for (let ring = 0; ring < 2; ring++) {
      const rr = ring === 0 ? R * 0.4 : R * 0.78;
      const n = ring === 0 ? 5 : 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        const x = FENCER.ARENA_X + Math.sin(a) * rr;
        const z = FENCER.ARENA_Z + Math.cos(a) * rr;
        if (this.inSafeZone(x, z)) continue;
        this.fx.pillar(x, z, 2.4, 0xff3d6e);
      }
    }
    _fxPoint.set(this.s3Land.x, 0, this.s3Land.z);
    comboFinisherFX.groundSlam(_fxPoint, 6, ROSE_STYLE, false, true);
    comboFinisherFX.spinWave(_fxPoint, 7, 1.0, ROSE_STYLE, 0, 0, 0);
    this.fx.petalBurst(this.s3Land.x, 0.4, this.s3Land.z, 90, 9, PETAL_PALETTE_ROSE, 5);
    this.host.shake(0.5);
    this.host.hitStop(0.06);
    soundManager.playFinaleChime(_fxPoint);
    const p = this.host.playerPos;
    if (p.y >= 2.5 || this.inSafeZone(p.x, p.z)) return;
    _dir.set(p.x - this.s3Land.x, 0, p.z - this.s3Land.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(this.rotY), 0, Math.cos(this.rotY));
    _dir.normalize();
    this.host.damagePlayer(dmg, _dir, 9, 6, '萬花華爾滋・終幕');
  }

  // ===== 位置 / 動畫 =====

  private clampPoint(v: THREE.Vector3, r: number) {
    const dx = v.x - FENCER.ARENA_X;
    const dz = v.z - FENCER.ARENA_Z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= r) return;
    v.x = FENCER.ARENA_X + (dx / d) * r;
    v.z = FENCER.ARENA_Z + (dz / d) * r;
  }

  private clampToArena() {
    this.clampPoint(this.position, FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD);
  }

  private syncTransform() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.rotY;
    this.bubbleAnchor.position.copy(this.position);
  }

  // 程序化姿勢 (依狀態)：只改各部件旋轉，不改幾何
  private animate(dt: number) {
    const t = this.animTime;
    let armR = -1.35;  // 細劍前指 (繞 X：負值往前抬)
    let armL = -0.3;
    let armLz = 0.9;   // 左手後揚
    let legL = 0.25;
    let legR = -0.2;
    let hipY = 0.95;
    let bodyPitch = 0;
    let capeX = 0.15 + Math.sin(t * 3) * 0.08;
    let hatTilt = 0;
    if (this.act === 'INTRO') {
      const s = this.introPose;
      if (s < 1.4) { armL = -2.6; armLz = 0.2; armR = -0.2; hatTilt = 0.25; } // 壓帽沿
      else { armR = -2.4 + Math.min(1, (s - 1.4) / 0.6) * 0.9; armL = -0.2; armLz = 0.4; bodyPitch = 0.12; } // 劍禮：劍立於面前
      legL = 0.05; legR = -0.05;
    } else if (this.act === 'ATTACK' && this.attack === 'S1') {
      if (this.atkStep === 0) { armR = -0.6; hipY = 0.82; bodyPitch = 0.25; legL = 0.6; legR = -0.5; }
      else { armR = -1.6; hipY = 0.85; bodyPitch = 0.35; legL = 0.9; legR = -0.7; capeX = 0.8; }
    } else if (this.act === 'ATTACK' && this.attack === 'S5') {
      if (this.atkStep === 0) { armR = -0.6; hipY = 0.82; bodyPitch = 0.25; legL = 0.6; legR = -0.5; }
      else { armR = -1.6; hipY = 0.85; bodyPitch = 0.35; legL = 0.9; legR = -0.7; capeX = 0.8; }
    } else if (this.act === 'ATTACK' && this.attack === 'S4') {
      if (this.atkStep === 0) { armR = -2.7; armL = -0.8; armLz = 0.5; legL = 0.5; legR = -0.6; capeX = 0.7; }
      else { armR = -0.5; hipY = 0.72; bodyPitch = 0.55; armL = -2.5; armLz = 0.7; legL = 0.7; legR = -0.6; capeX = 0.5 + Math.sin(t * 9) * 0.12; }
    } else if (this.act === 'ATTACK' && this.attack === 'S2') {
      armL = this.atkStep === 0 ? -2.8 : -1.4; armLz = 0.2;
    } else if (this.act === 'ATTACK' && this.attack === 'S3') {
      armR = -1.4; armL = -1.4; armLz = 1.4; legL = 0.1; legR = -0.4; capeX = 0.9;
    } else if (this.act === 'BOW' || this.act === 'TRIUMPH') {
      bodyPitch = 0.7; armL = -1.1; armLz = 0.1; armR = -0.4; legL = 0.05; legR = -0.05; hatTilt = -0.4;
    } else if (this.act === 'TRANSITION') {
      armR = -2.9; armL = -0.3; armLz = 0.6; bodyPitch = -0.1;
    } else if (this.act === 'DEFEATED') {
      hipY = 0.55; bodyPitch = 0.5; armR = 0.2; armL = 0.1; legL = -1.4; legR = 0.2;
      // 長過場 1.6s 起：抬頭、以劍拄地
      if (this.defeatDissolveAt > 2 && this.actTimer >= 1.6) { bodyPitch = 0.12; armR = -0.75; }
    } else if (this.move === 'SIDESTEP') {
      legL = 0.5; legR = -0.4;
    } else {
      legL = 0.25 + Math.sin(t * 4) * 0.05;
      legR = -0.2 - Math.sin(t * 4) * 0.05;
    }
    const k = Math.min(1, dt * 14);
    const lerp = (o: THREE.Object3D, axis: 'x' | 'z', v: number) => { o.rotation[axis] += (v - o.rotation[axis]) * k; };
    lerp(this.armR, 'x', armR);
    lerp(this.armL, 'x', armL);
    lerp(this.armL, 'z', -armLz);
    lerp(this.legL, 'x', legL);
    lerp(this.legR, 'x', legR);
    lerp(this.body, 'x', bodyPitch);
    lerp(this.cape, 'x', capeX);
    this.hip.position.y += (hipY - this.hip.position.y) * k;
    this.legL.position.y = this.legR.position.y = this.hip.position.y;
    if (this.hat.parent === this.body) this.hat.rotation.x += (hatTilt - this.hat.rotation.x) * k;
  }

  public prewarm(compile: () => void) {
    const v = this.container.visible;
    const cv = this.clone.visible;
    if (typeof document !== 'undefined') this.bubble.ensure(); // 預建對話框畫布與 sprite (之後只重畫文字)
    const sprite = this.bubble.sprite;
    const sv = sprite?.visible ?? false;
    if (sprite) sprite.visible = true;
    this.container.visible = true;
    this.hat2.visible = true;
    this.clone.visible = true;
    compile();
    this.hat2.visible = false;
    this.clone.visible = cv;
    this.container.visible = v;
    if (sprite) sprite.visible = sv;
  }
}
