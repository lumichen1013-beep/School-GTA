import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SkillBubble } from './shared/SkillBubble';
import { AfterimagePool } from './shared/AfterimagePool';
import { findSafeTeleportPos } from './shared/teleport';
import { buildUmbrella } from './shared/umbrella';
import { ARM_HALF, KungFuLayer, lungeStep, PLAYER_TAKEDOWN, PLAYER_TAKEDOWN_BLOCKED, StrikeTracker, wrapAngle, type KfMove, type TrailLimb } from './shared/kungfu';
import { CollidableBox } from '../world/CampusWorld';
import { queryColliders, depenetrateXZ, DEPEN_PUSH_X, DEPEN_PUSH_Z } from '../physics/aabb';
import { InputManager } from '../core/InputManager';
import { soundManager } from '../audio/SoundEffects';
import { IndoorManager } from '../systems/IndoorManager';
import { swingTrail } from '../effects/SwingTrail';
import { slashFX } from '../effects/SlashFX';
import { WEAPON_FX_STYLES, FINISHER_FX_BOOST } from '../effects/weaponFxStyle';
import { WeaponRig } from '../weapons/WeaponRig';
import { getWeapon, resolveLoadout, resolveVariant } from '../weapons/registry';
import type { ResolvedWeapon, WeaponDefinition, WeaponDisplayId, WeaponId } from '../weapons/types';

export type WeaponType = WeaponId;

// 模組頂層靜態共享 Scratch 物件 (0-GC 避免每幀垃圾回收引發微卡頓)
const DEFAULT_RESPAWN_POS = new THREE.Vector3(0, 0, 15);
const _playerMoveDir = new THREE.Vector3();
const _armTop = new THREE.Vector3();
const _trailBase = new THREE.Vector3();
const _trailTip = new THREE.Vector3();
// 潛行姿勢 A「持棍戒備」：蹲姿時雙臂以肩為軸隨身體下沉並縮短，右手持武器斜擋身前、左臂半舉前伸平衡
const ARM_X = 0.45;
const ARM_STAND_Y = 1.05;
const CROUCH_ARM_SCALE = 0.85;
const READY_RIGHT_WEAPON = { x: -0.6, y: -0.5, z: -0.35 };
const READY_RIGHT_FIST = { x: -1.2, y: 0, z: -0.25 };
const READY_LEFT = { x: -1.0, y: 0.2, z: 0.2 };
// 雙燕羽刃持拍架勢 (readyPose 'DUAL'，參考索隆公仔)：身體挺直、雙腳與肩同寬，雙臂垂在身側向外張開約 30°，
// 兩支拍子倒提、朝斜下外側伸出 (右拍略指前方)；待機、行走、跑步皆維持，雙臂不隨步伐擺動 (只做小幅晃動)
// wrist：持拍腕角 (拍柄掛點 rotation.x，出招用 π/3 上仰；架勢改為拍身順著手臂方向倒提)
const DUAL_STANCE = {
  wrist: 2.9,
  rightArm: { x: -0.4, y: 0.3, z: 0.55 },
  leftArm: { x: -0.3, y: -0.5, z: -0.6 }
};
const RACKET_MOUNT_X = Math.PI / 3;
// 手機虛擬搖桿潛行範圍：推桿半徑比例 ≤ 0.9 視為潛行 (特訓院)
export const JOYSTICK_SNEAK_RADIUS = 0.9;
const _safeTeleportResult = new THREE.Vector3();
// 玩家瞬移落點取樣參數
const PLAYER_TELEPORT_OPTS = { minRadius: 2.0, maxRadius: 4.2, attempts: 12, baseGroundY: 0 };
// 玩家技能氣泡外觀 (固定大字級)
const PLAYER_BUBBLE_STYLE = { fillAlpha: 0.82, strokeAlpha: 0.70, fontSize: () => 38 };
const _sweepNear: CollidableBox[] = [];
const _footprintNear: CollidableBox[] = [];

// ==========================================================
// 主角造型配色 (方案 A 灰藍運動風)：灰藍外套 × 霧金黃後背包 × 灰白球鞋
// 低彩度、中明度，長時間遊玩不刺眼；與校園 NPC (米白深綠 / 藍紫運動服) 色相明度皆有區隔，背影以霧金黃背包辨識
// ==========================================================
const OUTFIT = {
  skin: 0xfad390,
  tee: 0xe8e4dc,      // 米灰 T 恤 (兼泳衣上身)
  jacket: 0x4a5d73,   // 灰藍外套 (身、袖同色) 與泳褲
  trim: 0x3a4a5e,     // 深灰藍：衣領、拉鍊滾邊、耳罩
  cream: 0xe8e4dc,    // 米白：袖口、下襬條紋、背包反光條
  dark: 0x2e3238,     // 深灰：背帶、鞋底、耳機頭帶、護腕
  pack: 0xc9a227,     // 霧金黃後背包 (背影辨識重點)
  packDark: 0xa88a22,
  badge: 0x4a5d73,    // 背包灰藍閃電徽章
  pants: 0x3a3f47,    // 深灰長褲
  cuff: 0x4b515a,     // 反摺褲管
  shoe: 0xeceae4,     // 灰白球鞋
  hair: 0x2a1a12,     // 深棕刺蝟頭
  eye: 0x1a1a1a,
  mouth: 0x9c4a3a
};

type OutfitLayer = 'base' | 'gear' | 'swim';
interface OutfitPart {
  w: number; h: number; d: number;
  color: number;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
}

// 方塊零件收集器：base = 常駐 (身體、T 恤、髮型)，gear = 陸上服裝 (外套、背包、長褲、球鞋、耳機)，
// swim = 僅游泳時出現 (泳褲、短袖)。被陸上服裝包覆的零件不可放在 base，否則表面過近會產生 Z-fighting 閃爍
class OutfitBuilder {
  private parts: Record<OutfitLayer, OutfitPart[]> = { base: [], gear: [], swim: [] };

  public box(layer: OutfitLayer, w: number, h: number, d: number, color: number,
    x: number, y: number, z: number, rx: number = 0, ry: number = 0, rz: number = 0) {
    this.parts[layer].push({ w, h, d, color, x, y, z, rx, ry, rz });
  }

  public get hasGear(): boolean {
    return this.parts.gear.length > 0 || this.parts.swim.length > 0;
  }

  // 烘焙為單一頂點色幾何體 (非索引、position/normal/color)
  public build(includeGear: boolean): THREE.BufferGeometry {
    const list = includeGear ? [...this.parts.base, ...this.parts.gear] : [...this.parts.base, ...this.parts.swim];
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const geos = list.map((p) => {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
      geo.deleteAttribute('uv');
      matrix.compose(pos.set(p.x, p.y, p.z), quat.setFromEuler(euler.set(p.rx, p.ry, p.rz)), scale);
      geo.applyMatrix4(matrix);
      color.setHex(p.color);
      const count = geo.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    });
    const merged = mergeGeometries(geos, false)!;
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere();
    return merged;
  }
}

// 軀幹 (節點原點為軀幹中心，正面朝 +Z、背面 -Z)
function buildTorsoParts(b: OutfitBuilder) {
  const c = OUTFIT;
  // 米灰 T 恤 (敞開外套中央露出)
  b.box('base', 0.65, 0.75, 0.35, c.tee, 0, 0, 0);

  // 灰藍外套 (前襟敞開)：背片、側片、左右前襟、深灰藍拉鍊滾邊、米白下襬條紋、深灰藍衣領
  b.box('gear', 0.69, 0.72, 0.04, c.jacket, 0, -0.005, -0.185);
  for (const s of [-1, 1]) {
    b.box('gear', 0.04, 0.72, 0.39, c.jacket, s * 0.345, -0.005, 0);
    b.box('gear', 0.2, 0.72, 0.04, c.jacket, s * 0.245, -0.005, 0.185);
    b.box('gear', 0.02, 0.72, 0.046, c.trim, s * 0.15, -0.005, 0.186);
    b.box('gear', 0.2, 0.05, 0.045, c.cream, s * 0.245, -0.33, 0.186);
  }
  b.box('gear', 0.69, 0.05, 0.045, c.cream, 0, -0.33, -0.186);
  b.box('gear', 0.56, 0.07, 0.4, c.trim, 0, 0.365, 0);

  // 霧金黃後背包：主體、頂蓋、前袋與拉鍊、反光底條、灰藍閃電徽章 (背影辨識重點)
  b.box('gear', 0.5, 0.52, 0.22, c.pack, 0, 0, -0.31);
  b.box('gear', 0.46, 0.06, 0.2, c.packDark, 0, 0.28, -0.31);
  b.box('gear', 0.38, 0.2, 0.06, c.packDark, 0, -0.12, -0.445);
  b.box('gear', 0.34, 0.02, 0.065, c.dark, 0, -0.04, -0.447);
  b.box('gear', 0.5, 0.03, 0.225, c.cream, 0, -0.235, -0.31);
  b.box('gear', 0.06, 0.14, 0.012, c.badge, 0.025, 0.16, -0.426, 0, 0, -0.45);
  b.box('gear', 0.13, 0.04, 0.012, c.badge, 0, 0.1, -0.426);
  b.box('gear', 0.06, 0.14, 0.012, c.badge, -0.025, 0.04, -0.426, 0, 0, -0.45);

  // 背包肩帶 (跨肩 + 胸前垂帶)
  for (const s of [-1, 1]) {
    b.box('gear', 0.07, 0.05, 0.42, c.dark, s * 0.17, 0.39, -0.03);
    b.box('gear', 0.07, 0.42, 0.03, c.dark, s * 0.17, 0.17, 0.205);
  }

  // 頸掛耳機：深灰頭帶 + 深灰藍耳罩
  b.box('gear', 0.44, 0.05, 0.05, c.dark, 0, 0.39, 0.2);
  for (const s of [-1, 1]) {
    b.box('gear', 0.07, 0.13, 0.13, c.trim, s * 0.24, 0.38, 0.12);
  }
}

// 頭部 (節點原點為頭部中心)：臉部五官 + 深棕刺蝟頭
function buildHeadParts(b: OutfitBuilder) {
  const c = OUTFIT;
  b.box('base', 0.38, 0.4, 0.38, c.skin, 0, 0, 0);
  for (const s of [-1, 1]) {
    b.box('base', 0.06, 0.065, 0.02, c.eye, s * 0.085, 0.02, 0.19);
    b.box('base', 0.11, 0.03, 0.02, c.hair, s * 0.09, 0.1, 0.192, 0, 0, s * 0.2);
    b.box('base', 0.04, 0.09, 0.06, c.skin, s * 0.2, 0, 0);
    b.box('base', 0.04, 0.16, 0.32, c.hair, s * 0.205, 0.12, -0.03);
  }
  b.box('base', 0.09, 0.02, 0.02, c.mouth, 0.03, -0.1, 0.191, 0, 0, 0.12);

  // 髮量基底 (頂、後腦、瀏海)
  b.box('base', 0.42, 0.12, 0.42, c.hair, 0, 0.2, 0);
  b.box('base', 0.42, 0.26, 0.07, c.hair, 0, 0.06, -0.19);
  b.box('base', 0.4, 0.07, 0.06, c.hair, 0, 0.165, 0.19);

  // 刺蝟尖刺 (向外斜翹)
  b.box('base', 0.12, 0.17, 0.12, c.hair, 0, 0.3, -0.06, -0.35, 0, 0);
  b.box('base', 0.12, 0.17, 0.12, c.hair, -0.13, 0.29, 0.02, 0, 0, 0.55);
  b.box('base', 0.12, 0.17, 0.12, c.hair, 0.13, 0.29, 0.02, 0, 0, -0.55);
  b.box('base', 0.12, 0.17, 0.12, c.hair, -0.1, 0.27, -0.15, -0.6, 0, 0.35);
  b.box('base', 0.12, 0.17, 0.12, c.hair, 0.1, 0.27, -0.15, -0.6, 0, -0.35);
  b.box('base', 0.11, 0.16, 0.11, c.hair, 0.08, 0.29, 0.11, 0.55, 0, -0.2);
  b.box('base', 0.11, 0.16, 0.11, c.hair, -0.06, 0.29, 0.12, 0.55, 0, 0.15);
}

// 手臂 (節點原點為手臂中心，手掌在 -Y 端)；side = -1 左 / 1 右
function buildArmParts(b: OutfitBuilder, side: number) {
  const c = OUTFIT;
  // 裸臂 + T 恤短袖 (僅游泳時出現，陸上由外套袖覆蓋)
  b.box('base', 0.18, 0.65, 0.18, c.skin, 0, 0, 0);
  b.box('swim', 0.2, 0.2, 0.2, c.tee, 0, 0.225, 0);

  // 灰藍外套袖、深灰與米白羅紋袖口
  b.box('gear', 0.21, 0.5, 0.21, c.jacket, 0, 0.085, 0);
  b.box('gear', 0.215, 0.025, 0.215, c.dark, 0, -0.115, 0);
  b.box('gear', 0.22, 0.06, 0.22, c.cream, 0, -0.15, 0);
  // 左手腕黑色護腕
  if (side < 0) b.box('gear', 0.2, 0.05, 0.2, c.dark, 0, -0.22, 0);
}

// 腿部 (節點原點為腿部中心，腳掌在 -Y 端)；side = -1 左 / 1 右 (泳褲側邊條紋)
function buildLegParts(b: OutfitBuilder, side: number) {
  const c = OUTFIT;
  // 裸腿 + 灰藍泳褲 (僅游泳時出現；陸上由長褲、褲管與球鞋完整覆蓋，避免頂面共面閃爍)
  b.box('swim', 0.24, 0.7, 0.24, c.skin, 0, 0, 0);
  b.box('swim', 0.25, 0.26, 0.25, c.jacket, 0, 0.22, 0);
  b.box('swim', 0.012, 0.24, 0.06, c.cream, side * 0.126, 0.22, 0);

  // 炭灰長褲與反摺褲管
  b.box('gear', 0.26, 0.58, 0.26, c.pants, 0, 0.06, 0);
  b.box('gear', 0.28, 0.07, 0.28, c.cuff, 0, -0.215, 0);
  // 灰白球鞋：鞋身、深灰鞋底
  b.box('gear', 0.27, 0.11, 0.36, c.shoe, 0, -0.29, 0.05);
  b.box('gear', 0.28, 0.035, 0.37, c.dark, 0, -0.35, 0.05);
}

export class Player {
  public mesh: THREE.Group;
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 15);
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;

  // Attributes
  public hp: number = 100;
  public maxHp: number = 100;
  public stamina: number = 150;
  public maxStamina: number = 150;

  // 武器系統 (Weapon System)：定義與數值見 src/weapons，徒手一開始即持有，其餘依解鎖集合
  private currentWeaponId: WeaponId = 'FIST';
  private readonly unlockedWeapons = new Set<WeaponId>();
  private weaponRig!: WeaponRig;

  // 羽球拍造型 (Badminton Racket Model - 4F 羽球挑戰賽專屬造型，場景覆寫，不進武器槽)
  public isHoldingRacket: boolean = false;

  // Speeds: 行走 5.0 | 跑步 10.0 (與教官、糾察隊在相同狀態下速度完全一致)
  public walkSpeed: number = 5.0;
  public sprintSpeed: number = 10.0;
  // 游泳速度：泳池僅 25m，放慢水中速度讓 50m 競速約 15~20 秒，衝刺體力仍為勝負關鍵
  public swimSpeed: number = 2.0;
  public swimSprintSpeed: number = 2.8;
  public jumpStrength: number = 8.5;
  public gravity: number = -24.0;
  public isGrounded: boolean = true;
  public isRidingVehicle: boolean = false;
  public isSwimming: boolean = false; // 游泳狀態
  public swimSurfaceY: number = 0.25; // 當前水體水面高度 (泳池 0.25 / 許願池 0.32)
  public swimBottomY: number = -1.1;  // 當前水體池底高度 (雙腳不可低於此值)
  private wasSwimming: boolean = false; // 游泳狀態切換檢測
  private isClimbingOutOfWater: boolean = false; // 出水攀上池畔中 (平滑抬升，避免瞬間彈起)
  public isMoving: boolean = false;   // 當前是否正在移動推進
  public isSprinting: boolean = false; // 當前是否處於衝刺加速狀態
  public isSneaking: boolean = false;  // 潛龍諜影靜音潛行模式 (無腳步聲，背刺專用)
  public isHidingInCover: boolean = false; // 刺客教條草堆匿蹤狀態
  public currentHidingSpotName: string = '';
  public crouchRatio: number = 0; // 0 = 站立, 1 = 完全蹲下潛行姿態
  public poisonTimer: number = 0;     // 中毒持續時間 (5秒)
  public poisonTickTimer: number = 0; // 中毒跳血計時
  public isInvisible: boolean = false; // 隱形模式 (如三分球投籃瞄準時不遮擋籃框與準心)
  public isDead: boolean = false;
  public deathTimer: number = 0;

  // 技能「閃身步」與「狗熊哆嗦毛」
  public isDodging: boolean = false;
  public dodgeTimer: number = 0;
  public dodgeDuration: number = 0.26;
  public dodgeSpeed: number = 11.5;
  public dodgeSideSign: number = 1;
  public dodgeDir: THREE.Vector3 = new THREE.Vector3();
  private afterimageSpawnTimer: number = 0;

  // 暗殺總教官後的後空翻脫離 (朝遠離 Boss 方向翻越約 4 個身位，全程面向 Boss 並留下閃身步殘影)
  public isBackflipping: boolean = false;
  private backflipTimer: number = 0;
  private backflipDuration: number = 0.6;

  // 暗殺運鏡期間：鎖定移動/跳躍/潛行輸入，且免疫一切傷害與擊飛
  public isCinematicLocked: boolean = false;
  private backflipSpeed: number = 0;
  private backflipGravity: number = -24.0; // 後空翻專用等效重力 (使滯空時間 = 翻轉時間且頂點高度固定)
  private readonly backflipDir: THREE.Vector3 = new THREE.Vector3();
  // 暗殺被格擋：受震後向後滑退 (等速遞減，遇牆即停)
  public isParrySkidding: boolean = false;
  private skidTimer: number = 0;
  private skidDuration: number = 0.5;
  private skidDistance: number = 4.0;
  private readonly skidDir: THREE.Vector3 = new THREE.Vector3();

  // 狗熊哆嗦毛 (連續瞬移 3 次，間隔 0.5s，圓形範圍隨機閃現)
  public isBearShaking: boolean = false;
  private bearBlinkCount: number = 0;
  private bearBlinkTimer: number = 0;
  private bearOriginCenter: THREE.Vector3 = new THREE.Vector3();

  // 0-GC 角色殘影物件池
  private afterimagePool: AfterimagePool;

  // 擊飛與擊退物理系統 (Knockback & Launch-flying)
  public knockVelocity: THREE.Vector3 = new THREE.Vector3();
  public isKnockedFlying: boolean = false;
  public knockTimer: number = 0;
  public hitCooldown: number = 0;
  // 被摔倒地 (如主任教官擒拿摔)：落地後倒地剩餘秒數，期間無法移動、攻擊與施展身法
  public knockdownTimer: number = 0;

  // 下雨天專屬雨傘系統
  public isHoldingUmbrella: boolean = false;
  private umbrellaMesh!: THREE.Group;
  private hasShownRainBubble: boolean = false;

  public onTakeDamageCallback: ((amount: number, reason: string) => void) | null = null;
  public onDeathCallback: (() => void) | null = null;
  // 被敵人攻擊命中瞬間的被動閃身判定 (由 Progression 注入)；回傳 true 代表已自動閃開
  public autoDodgeHook: (() => boolean) | null = null;

  // Visual parts for animation
  private bodyMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;

  // 主角造型：所有骨架節點共用一個頂點色材質 (玩家專屬，閃爍半透明特效改其 opacity 不影響 NPC)
  private outfitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private outfitNodes: { mesh: THREE.Mesh; land: THREE.BufferGeometry; swim: THREE.BufferGeometry }[] = [];
  private isSwimOutfit: boolean = false;
  // 半透明淡化特效 (閃身、狗熊哆嗦毛、草堆匿蹤) 作用的材質清單與原始不透明度/透明旗標 (建構後快取一次)
  private fadeMaterials: { mat: THREE.Material; baseOpacity: number; baseTransparent: boolean }[] = [];
  private currentFade: number = 1;

  // 頭頂技能名稱對話氣泡 (浮動微光膠囊框，0-GC 復用 Sprite)
  private skillBubble: SkillBubble;

  private animTimer: number = 0;
  private punchTimer: number = 0; // 攻擊硬直 (禁止出招秒數，例如正面攻擊守衛後的技能間隔)
  public isAttacking: boolean = false;

  // 功夫連段：出招姿勢圖層、目前生效的武器套組 (招式組 / 拖尾樣式) 與段數、距上次命中時間點秒數、預先輸入
  private readonly kf = new KungFuLayer();
  private activeLoadout: ResolvedWeapon = resolveVariant('FIST', 'CAMPUS');
  private comboIndex: number = 0;
  private sinceStrike: number = 99;
  private attackQueued: boolean = false;
  private worldType: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
  // 本幀到達命中時間點的招式與命中序號 (0 = 主擊，1 以後 = extraStrikes；由戰鬥系統取用並結算傷害)
  public strikeMove: KfMove | null = null;
  public strikeIndex: number = 0;
  // 出招序號 (每次連段起手遞增)：戰鬥系統據此將同一招多段命中的通緝 / 提示合併為一次
  public moveSerial: number = 0;
  // 突進起點與其所屬出招序號 (dashSerial === moveSerial 表示本招已開始突進)
  public readonly dashOrigin = new THREE.Vector3();
  public dashSerial: number = -1;
  private chargeSerial: number = -1;
  private readonly strikes = new StrikeTracker();
  // 揮擊拖尾 / 武器發光狀態：lane 0 = 主拖尾 (trail)、lane 1 = 第二拖尾 (trail2)；
  // 拖尾槽依錨點持握手輪替 (右手 0/1、左手 2/3)
  private readonly trailMove: (KfMove | null)[] = [null, null];
  private readonly trailSlot = [0, 0];
  private readonly trailActive = [false, false];
  private readonly trailFlip = [0, 0];
  private weaponGlowOn = false;
  // 雙持持拍架勢比例 (0 = 一般姿勢、1 = 倒提雙拍架勢)
  private dualRatio = 0;
  private dualWrist = 0; // 持拍腕角比例：架勢 1、出招 0 (拍子回到出招用的上仰角)

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ'; // 採用 Y(航向) -> X(俯仰) -> Z(側滾) 順序，避免自由式俯趴時歐拉角產生萬向節鎖(Gimbal Lock)並支援水中360度靈敏轉向
    this.mesh.position.copy(this.position);

    // 建立頭頂技能名稱對話方框 (3D Billboard Sprite)
    this.skillBubble = new SkillBubble(this.mesh, 2.35, PLAYER_BUBBLE_STYLE);
    this.skillBubble.ensure();

    // 1. 主角造型 (方案 A 灰藍運動風)：灰藍外套敞開、米灰 T 恤、深灰反摺長褲、灰白球鞋、
    //    霧金黃閃電後背包 (第三人稱背影最醒目)、深棕刺蝟頭、頸掛耳機
    //    每個骨架節點 (軀幹/頭/雙臂/雙腿) 將零件烘焙為頂點色單一 Mesh；陸上與游泳各一份幾何體，入水時切換為泳裝造型
    this.bodyMesh = this.createOutfitNode(buildTorsoParts, 0, 1.05, 0);
    this.headMesh = this.createOutfitNode(buildHeadParts, 0, 1.62, 0);
    this.leftArm = this.createOutfitNode((b) => buildArmParts(b, -1), -0.45, 1.05, 0);

    // 建立下雨天專屬雨傘 3D 模型並掛載於左手 (leftArm，右手依然可正常揮棒或揮拳)
    this.umbrellaMesh = this.buildUmbrellaModel();
    this.umbrellaMesh.position.set(0, -0.28, 0.10);
    this.umbrellaMesh.rotation.set(Math.PI * 0.65, 0.12, -0.12);
    this.leftArm.add(this.umbrellaMesh);

    this.rightArm = this.createOutfitNode((b) => buildArmParts(b, 1), 0.45, 1.05, 0);

    // 預建所有手持武器 3D 模型並掛載於手臂 (球棒 / 黃金棒 / 羽球拍掛右手，見 src/weapons/models)
    this.weaponRig = new WeaponRig(this.rightArm, this.leftArm);

    // 雙腿 (Legs)
    this.leftLeg = this.createOutfitNode((b) => buildLegParts(b, -1), -0.18, 0.35, 0);
    this.rightLeg = this.createOutfitNode((b) => buildLegParts(b, 1), 0.18, 0.35, 0);

    scene.add(this.mesh);
    this.collectFadeMaterials();

    // 建立 0-GC 角色殘影物件池 (8 個 Group，常駐場景，避免每幀垃圾回收)
    this.afterimagePool = new AfterimagePool(scene, 8);
  }

  // 建立單一骨架節點：零件烘焙為「陸上 (含外套/背包/長褲/球鞋)」與「游泳 (泳裝)」兩份幾何體
  private createOutfitNode(build: (b: OutfitBuilder) => void, x: number, y: number, z: number): THREE.Mesh {
    const builder = new OutfitBuilder();
    build(builder);
    const land = builder.build(true);
    const swim = builder.hasGear ? builder.build(false) : land;
    const node = new THREE.Mesh(land, this.outfitMaterial);
    node.position.set(x, y, z);
    node.castShadow = true;
    this.mesh.add(node);
    this.outfitNodes.push({ mesh: node, land, swim });
    return node;
  }

  // 入水換上泳裝 (隱藏外套、背包、長褲與球鞋)，上岸恢復；僅切換幾何體參考，無額外 Draw Call
  private setSwimOutfit(swimming: boolean) {
    this.isSwimOutfit = swimming;
    for (const node of this.outfitNodes) {
      node.mesh.geometry = swimming ? node.swim : node.land;
    }
  }

  // 敵人攻擊命中前呼叫一次：成功自動閃身步則呼叫端應完全略過此次傷害與擊飛
  public tryAutoDodge(): boolean {
    return !!this.autoDodgeHook && this.autoDodgeHook();
  }

  public takeDamage(amount: number, reason: string = '受到傷害'): boolean {
    if (this.isDead || this.isCinematicLocked) return false;
    if (this.isDodging || this.isBearShaking || this.isBackflipping) {
      // 處於閃身/無敵或狗熊哆嗦毛瞬移判定狀態，免疫一切傷害！
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.onTakeDamageCallback) {
      this.onTakeDamageCallback(amount, reason);
    }
    if (this.hp <= 0) {
      this.cancelAttack();
      this.isDead = true;
      this.isHoldingUmbrella = false;
      if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
      this.isKnockedFlying = false;
      this.knockVelocity.set(0, 0, 0);
      this.deathTimer = 3.0;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.rotation.z = 0;
      this.mesh.position.y = 0.25;
      if (this.onDeathCallback) {
        this.onDeathCallback();
      }
      return true;
    }
    return false;
  }

  // 玩家被攻擊擊退與擊飛效果 (Launch Flying & Knockback)
  public launchFlying(
    impactDir: THREE.Vector3,
    horizontalForce: number,
    verticalForce: number,
    damage: number,
    reason: string = '受到攻擊'
  ): boolean {
    if (this.isDead || this.isCinematicLocked) return false;
    if (this.isDodging || this.isBearShaking || this.isBackflipping) {
      // 處於閃身/無敵狀態，完全規避擊飛與擊退判定！
      return false;
    }
    if (this.hitCooldown > 0) return false;

    this.hitCooldown = 0.55; // 0.55秒受擊保護，避免瞬間被多隻連續秒殺
    this.isKnockedFlying = true;
    this.isHoldingUmbrella = false;
    if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
    this.knockTimer = 0.5;
    this.isGrounded = false;

    // 計算拋物線擊飛初速度
    this.knockVelocity.set(
      impactDir.x * horizontalForce,
      verticalForce,
      impactDir.z * horizontalForce
    );

    soundManager.playPunch();
    return this.takeDamage(damage, reason);
  }

  // 施展技能：閃身步 (朝角色面朝方向的左右橫向衝刺 2 個身位，破空殘影，絕不穿牆)
  public performFlashStep() {
    if (this.isDead || this.isRidingVehicle || this.isSwimming || this.knockdownTimer > 0) return;

    this.isDodging = true;
    this.dodgeDuration = 0.24;
    this.dodgeTimer = this.dodgeDuration;
    this.dodgeSpeed = 8.0; // 8.0 m/s * 0.24s = 1.92m (恰好 2 個身位寬度)
    this.afterimageSpawnTimer = 0;

    // 隨機 50% 機率朝左或朝右橫向閃身
    this.dodgeSideSign = Math.random() < 0.5 ? -1 : 1;
    // 面朝方向為 (sin(rotY), 0, cos(rotY))，右側橫向為 (cos(rotY), 0, -sin(rotY))
    this.dodgeDir.set(
      Math.cos(this.rotationY) * this.dodgeSideSign,
      0,
      -Math.sin(this.rotationY) * this.dodgeSideSign
    ).normalize();

    // 頭頂彈出「💨 閃身步」對話氣泡
    this.showSkillBubble('💨 閃身步', false);

    // 疾風破空音效
    soundManager.playDodge(false);

    // 初始位置產生第 1 道破空殘影 (青色微光)
    this.spawnAfterimage(0x38bdf8, 0.28);
  }

  // 施展技能：狗熊哆嗦毛 (4 個身位半徑內連續瞬移 3 次，間隔 0.5s，紫色暗芒殘影，100% 障礙物安全)
  public performBearShake(colliders: CollidableBox[] = []) {
    if (this.isDead || this.isRidingVehicle || this.isSwimming || this.knockdownTimer > 0) return;

    this.isBearShaking = true;
    this.isDodging = true; // 同步設置無敵標記
    this.bearBlinkCount = 0;
    this.bearBlinkTimer = 0;
    this.bearOriginCenter.copy(this.position);

    // 頭頂彈出「🐻 狗熊哆嗦毛」對話氣泡
    this.showSkillBubble('🐻 狗熊哆嗦毛', true);

    // 立即觸發第 1 次瞬移 (0.0s)
    this.executeBearBlink(colliders);
  }

  // 執行狗熊哆嗦毛單次瞬移
  private executeBearBlink(colliders: CollidableBox[]) {
    // 1. 在瞬移前原位留下紫色幻影殘影
    const purpleColors = [0xa855f7, 0x9333ea, 0xc084fc];
    const color = purpleColors[this.bearBlinkCount % purpleColors.length];
    this.spawnAfterimage(color, 0.7);

    // 2. 尋找半徑 4 個身位 (約 3.6m ~ 4.2m) 內的安全目標點 (避開建築物與障礙物)
    const safePos = this.findSafeTeleportPos(
      this.bearOriginCenter.x,
      this.bearOriginCenter.z,
      this.bearOriginCenter.y,
      colliders
    );

    // 3. 瞬間移動至目標點
    this.position.copy(safePos);
    this.mesh.position.copy(safePos);
    this.velocity.set(0, 0, 0);

    // 4. 隨機朝向，展現飄忽靈動的身法
    this.rotationY = Math.random() * Math.PI * 2;
    this.mesh.rotation.y = this.rotationY;

    // 5. 瞬移音效
    soundManager.playDodge(true);

    this.bearBlinkCount++;
  }

  // 刺客教條·暗殺 BOSS 後跳遠離 (後跳跳離約 4 個身位，面向 BOSS)；duration 為翻轉/滯空的模擬時間，peakHeight 為拋物線頂點高度
  public leapAwayFrom(targetPos: THREE.Vector3, jumpDist: number = 4.0, duration: number = 0.6, peakHeight: number = 1.1) {
    if (this.isDead) return;

    // 遠離 target 的水平方向
    this.backflipDir.subVectors(this.position, targetPos).setY(0);
    if (this.backflipDir.lengthSq() < 0.001) {
      this.backflipDir.set(-Math.sin(this.rotationY), 0, -Math.cos(this.rotationY));
    } else {
      this.backflipDir.normalize();
    }

    // 全程面向 BOSS (後退翻越)
    this.rotationY = Math.atan2(-this.backflipDir.x, -this.backflipDir.z);
    this.mesh.rotation.y = this.rotationY;

    // 水平位移交由一般碰撞處理 (遇牆即停，絕不穿牆)；
    // 起跳速度 vy0 = 4h/t、等效重力 g = 8h/t²：滯空時間 = 翻轉時間，頂點高度 = peakHeight
    this.isBackflipping = true;
    this.backflipDuration = duration;
    this.backflipTimer = this.backflipDuration;
    this.backflipSpeed = jumpDist / this.backflipDuration;
    this.backflipGravity = -8 * peakHeight / (duration * duration);
    this.velocity.y = 4 * peakHeight / duration;
    this.isGrounded = false;
    this.afterimageSpawnTimer = 0;

    soundManager.playDodge(false);
  }

  // 後空翻姿勢：繞身體中心 (離地 0.9m) 向後翻轉一圈，並於翻轉中留下青色殘影
  private applyBackflipPose(delta: number) {
    const progress = THREE.MathUtils.clamp(1 - this.backflipTimer / this.backflipDuration, 0, 1);
    const theta = -Math.PI * 2 * progress;
    const pivot = 0.9;
    const offsetLocalZ = -pivot * Math.sin(theta);
    this.mesh.rotation.x = theta;
    this.mesh.position.set(
      this.position.x + Math.sin(this.rotationY) * offsetLocalZ,
      this.position.y + pivot - pivot * Math.cos(theta),
      this.position.z + Math.cos(this.rotationY) * offsetLocalZ
    );
    // 收腿抱膝
    const tuck = Math.sin(progress * Math.PI);
    this.leftLeg.rotation.x = -1.2 * tuck;
    this.rightLeg.rotation.x = -1.2 * tuck;
    this.leftArm.rotation.x = -0.9 * tuck;
    this.rightArm.rotation.x = -0.9 * tuck;

    this.afterimageSpawnTimer -= delta;
    if (this.afterimageSpawnTimer <= 0) {
      this.afterimageSpawnTimer = 0.05;
      this.afterimagePool.spawn(0x38bdf8, 0.28, this.mesh.position, this.mesh.rotation, this.headMesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    }
  }

  // 尋找瞬移安全目標點 (0-GC，檢測障礙物碰撞與地面高度，絕不穿牆)
  private findSafeTeleportPos(centerX: number, centerZ: number, currentY: number, colliders: CollidableBox[]): THREE.Vector3 {
    return findSafeTeleportPos(_safeTeleportResult, centerX, centerZ, currentY, colliders, PLAYER_TELEPORT_OPTS);
  }

  // 產生 0-GC 角色殘影
  private spawnAfterimage(colorHex: number, duration: number) {
    this.afterimagePool.spawn(colorHex, duration, this.position, this.mesh.rotation, this.headMesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  // 每幀更新殘影透明度與生命週期
  public updateAfterimages(delta: number) {
    this.afterimagePool.update(delta);
  }

  public showSkillBubble(text: string, isAdvanced: boolean) {
    this.skillBubble.show(text, isAdvanced);
  }

  public updateSkillBubble(delta: number) {
    this.skillBubble.update(delta);
  }

  public respawn(pos: THREE.Vector3 = DEFAULT_RESPAWN_POS) {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.isDead = false;
    this.isHoldingUmbrella = false;
    if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
    this.equipBadmintonRacket(false);
    this.hasShownRainBubble = false;
    this.isInvisible = false;
    this.isDodging = false;
    this.isBackflipping = false;
    this.backflipTimer = 0;
    this.isParrySkidding = false;
    this.skidTimer = 0;
    this.isBearShaking = false;
    this.bearBlinkCount = 0;
    this.bearBlinkTimer = 0;
    this.dodgeTimer = 0;
    this.deathTimer = 0;
    this.isKnockedFlying = false;
    this.knockVelocity.set(0, 0, 0);
    this.hitCooldown = 0;
    this.knockdownTimer = 0;
    this.cancelAttack();
    this.punchTimer = 0;
    this.position.copy(pos);
    this.mesh.position.copy(pos);
    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
    this.velocity.set(0, 0, 0);
    this.skillBubble.hide();
    this.afterimagePool.hideAll();
  }

  // 裝備羽球拍造型 (4F 羽球比賽專用，只改變視覺外觀，比賽結束或搭電梯時還原)
  public equipBadmintonRacket(equip: boolean) {
    if (equip !== this.isHoldingRacket) this.releaseAttack();
    if (equip) {
      this.isHoldingRacket = true;
      this.weaponRig.show('RACKET');
    } else if (this.isHoldingRacket) {
      this.isHoldingRacket = false;
      // 還原原本的武器外觀
      this.weaponRig.show(this.currentWeaponId);
    }
  }

  public get currentWeapon(): WeaponId {
    return this.currentWeaponId;
  }

  // 目前武器定義 (數值 / 群攻覆寫；持羽球拍時仍為原武器)
  public get weaponDef(): WeaponDefinition {
    return getWeapon(this.currentWeaponId);
  }

  // 本招實際生效的武器套組 (起手時決定：羽球拍覆寫 / 世界變體)，供戰鬥系統取終結技特效樣式
  public get activeWeapon(): ResolvedWeapon {
    return this.activeLoadout;
  }

  public isWeaponUnlocked(id: WeaponId): boolean {
    return getWeapon(id).unlock === null || this.unlockedWeapons.has(id);
  }

  // 只改解鎖旗標，不切換手上武器 (由呼叫端決定是否 setWeapon)
  public setWeaponUnlocked(id: WeaponId, unlocked: boolean) {
    if (unlocked) this.unlockedWeapons.add(id);
    else this.unlockedWeapons.delete(id);
  }

  public get hasNormalBat(): boolean { return this.unlockedWeapons.has('NORMAL_BAT'); }
  public set hasNormalBat(v: boolean) { this.setWeaponUnlocked('NORMAL_BAT', v); }
  public get hasSpecialBat(): boolean { return this.unlockedWeapons.has('SPECIAL_BAT'); }
  public set hasSpecialBat(v: boolean) { this.setWeaponUnlocked('SPECIAL_BAT', v); }

  public setWeapon(type: WeaponType): boolean {
    if (!this.isWeaponUnlocked(type)) return false;

    if (type !== this.currentWeaponId) this.releaseAttack();
    this.currentWeaponId = type;
    this.weaponRig.show(this.displayWeaponId);
    return true;
  }

  // 手上顯示中的武器 (羽球拍覆寫優先)
  private get displayWeaponId(): WeaponDisplayId {
    return this.isHoldingRacket ? 'RACKET' : this.currentWeaponId;
  }

  // 手上顯示中的武器套組 (錨點 / 打擊音效 / 待機姿勢)
  private get displayLoadout(): ResolvedWeapon {
    return resolveLoadout(this.currentWeaponId, this.isHoldingRacket ? 'RACKET' : null, this.worldType);
  }

  public getWeaponDamage(): number {
    return this.weaponDef.stats.damage;
  }

  public getWeaponReach(): number {
    return this.weaponDef.stats.reach;
  }

  public getWeaponKnockback(): number {
    return this.weaponDef.stats.knockback;
  }

  // 建立玩家專屬雨傘模型 (沉穩皇家海軍藍傘面，向角色右側補正使傘頂位於頭頂上方)
  private buildUmbrellaModel(): THREE.Group {
    return buildUmbrella({
      name: 'player_umbrella',
      canopyColor: 0x1e3799,
      shaftMetalness: 0.7,
      handleColor: 0x1e272e,
      tipMetalness: 0.85,
      rigX: 0.26,
      rigZ: -0.08
    });
  }

  // 下雨天撐傘與收傘狀態機判定 (支援自行車騎乘、游泳、室內、擊飛與死亡自動收傘)
  public updateUmbrella(isRaining: boolean, isRidingBike: boolean = false, currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS') {
    // 少年院世界為鐵血特訓營舍，學員一律不持傘；雙持武器 (suppressUmbrella) 左手持械亦收傘
    if (currentWorld === 'DETENTION' || this.weaponDef.suppressUmbrella) {
      if (this.isHoldingUmbrella) {
        this.isHoldingUmbrella = false;
        this.umbrellaMesh.visible = false;
      }
      return;
    }

    // 判定是否處於室內遮蔽處 (建築物室內、走廊、體育館與車棚屋頂下方，露天頂樓天台除外)
    const isIndoors = IndoorManager.isIndoors(this.position, currentWorld);
    const canHoldUmbrella = isRaining &&
      !isRidingBike &&
      !this.isRidingVehicle &&
      !this.isSwimming &&
      !this.isKnockedFlying &&
      !this.isDead &&
      !isIndoors;

    if (canHoldUmbrella) {
      if (!this.isHoldingUmbrella) {
        this.isHoldingUmbrella = true;
        this.umbrellaMesh.visible = true;
        if (!this.hasShownRainBubble) {
          this.hasShownRainBubble = true;
          this.showSkillBubble('☔ 展開雨傘', false);
        }
      }
    } else {
      if (this.isHoldingUmbrella) {
        this.isHoldingUmbrella = false;
        this.umbrellaMesh.visible = false;
      }
    }

    if (!isRaining) {
      this.hasShownRainBubble = false;
    }
  }

  // 出招 (連段)：上一招命中後 0.6 秒內再按接續下一段，否則從第一段開始；出招中提早按下則預先輸入
  public attack(): boolean {
    if (this.isDead || this.isSwimming) return false; // 游泳狀態下雙手劃水，不可出拳揮棒
    if (!this.canAttack) {
      if (this.kf.move && !this.kf.beforeStrike && this.punchTimer <= 0) this.attackQueued = true;
      return false;
    }
    this.startComboMove();
    return true;
  }

  // 暗殺運鏡出手：專用招式「雙峰貫耳」依運鏡命中時間點 (模擬秒) 縮放節奏，不計入連段；
  // twistFrom 為轉身面向目標前的畫面朝向差，由招式起手平滑轉正
  public performCinematicStrike(strikeAt: number, twistFrom: number = 0) {
    if (this.isDead) return;
    this.attackQueued = false;
    this.comboIndex = 0;
    this.sinceStrike = 99;
    const move = PLAYER_TAKEDOWN;
    this.kf.start(move, strikeAt / (move.strike * move.dur), this.mesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, twistFrom);
    this.isAttacking = true;
  }

  // 暗殺被格擋：面向目標架起十字手，guardTime 秒後 (對方格擋擊中瞬間) 承受震擊後仰滑退
  public performTakedownBlocked(targetPos: THREE.Vector3, guardTime: number) {
    if (this.isDead) return;
    const face = Math.atan2(targetPos.x - this.position.x, targetPos.z - this.position.z);
    const twistFrom = wrapAngle(this.mesh.rotation.y - face);
    this.rotationY = face;
    this.attackQueued = false;
    const move = PLAYER_TAKEDOWN_BLOCKED;
    this.kf.start(move, guardTime / (move.strike * move.dur), this.mesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, twistFrom);
    this.isAttacking = true;
  }

  // 被格擋震退：自目標往外滑退 dist 公尺 (duration 秒內速度線性遞減至 0，位移交由一般碰撞處理，遇牆即停)，全程面向目標
  public performParrySkid(targetPos: THREE.Vector3, dist: number, duration: number) {
    if (this.isDead) return;
    this.skidDir.subVectors(this.position, targetPos).setY(0);
    if (this.skidDir.lengthSq() < 0.0001) this.skidDir.set(-Math.sin(this.rotationY), 0, -Math.cos(this.rotationY));
    else this.skidDir.normalize();
    this.isParrySkidding = true;
    this.skidDistance = dist;
    this.skidDuration = duration;
    this.skidTimer = duration;
  }

  private startComboMove() {
    this.attackQueued = false;
    // 套組：羽球拍覆寫 > 目前武器的世界變體 (如第二世界普通棒 → 警棍)；同一招式組才可接續連段
    const loadout = this.displayLoadout;
    const moves = loadout.combo;
    const chain = moves === this.activeLoadout.combo && this.sinceStrike <= 0.6 && this.comboIndex + 1 < moves.length;
    this.comboIndex = chain ? this.comboIndex + 1 : 0;
    this.activeLoadout = loadout;
    this.sinceStrike = 99;
    // tempo：武器整體節奏縮放 (如黃金雷霆棒較沉重)
    const move = moves[this.comboIndex];
    this.kf.start(move, loadout.tempo, this.mesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    this.moveSerial++;
    this.isAttacking = true;
    loadout.sounds.start?.();
  }

  // 手持球棒 (第二世界為警棍) 棒尖世界座標，需於出招姿勢套用後呼叫；未持棒時回傳玩家位置
  public getBatTipWorld(out: THREE.Vector3): THREE.Vector3 {
    const def = this.weaponDef;
    const bat = this.weaponRig.part(def.id, 'R');
    const anchor = def.anchors.R;
    if (!bat || !anchor || !bat.visible) return out.copy(this.position);
    bat.updateWorldMatrix(true, false);
    return bat.localToWorld(out.set(0, anchor.tip, 0));
  }

  // 取樣拖尾錨點 (世界座標)：W / WL = 右手 / 左手武器、RA / RL / LL = 右拳 / 右腳 / 左腳；需於姿勢套用後呼叫
  public sampleSwingAnchors(limb: TrailLimb, outBase: THREE.Vector3, outTip: THREE.Vector3): boolean {
    let node: THREE.Object3D | null;
    let by: number, ty: number, tz = 0;
    switch (limb) {
      case 'W':
      case 'WL': {
        const hand = limb === 'W' ? 'R' : 'L';
        const anchor = this.displayLoadout.anchors[hand];
        node = anchor ? this.weaponRig.part(this.displayWeaponId, hand) : null;
        by = anchor ? anchor.base : 0;
        ty = anchor ? anchor.tip : 0;
        break;
      }
      case 'RA': node = this.rightArm; by = 0; ty = -0.32; break;
      case 'RL': node = this.rightLeg; by = 0; ty = -0.33; tz = 0.1; break;
      default: node = this.leftLeg; by = 0; ty = -0.33; tz = 0.1; break;
    }
    if (!node || ((limb === 'W' || limb === 'WL') && !node.visible)) return false;
    node.updateWorldMatrix(true, false);
    node.localToWorld(outBase.set(0, by, 0));
    node.localToWorld(outTip.set(0, ty, tz));
    return true;
  }

  private get swingFxOn(): boolean {
    return this.trailActive[0] || this.trailActive[1] || this.weaponGlowOn;
  }

  // 結束拖尾與武器發光並還原材質原值
  private endSwingFx() {
    this.endTrailLane(0);
    this.endTrailLane(1);
    this.setWeaponGlow(0, 0);
  }

  private endTrailLane(lane: number) {
    if (this.trailActive[lane]) swingTrail.end(this.trailSlot[lane]);
    this.trailActive[lane] = false;
    this.trailMove[lane] = null;
  }

  // 推進單條拖尾：進度 p 位於 range 區段內時開啟 / 延續並取樣錨點，回傳是否位於區段內
  private updateTrailLane(lane: number, move: KfMove, p: number, range: readonly [number, number], limb: TrailLimb): boolean {
    if (p < range[0] || p > range[1]) {
      this.endTrailLane(lane);
      return false;
    }
    if (!this.trailActive[lane] || this.trailMove[lane] !== move) {
      if (this.trailActive[lane]) swingTrail.end(this.trailSlot[lane]);
      const left = limb === 'WL';
      const hand = left ? 1 : 0;
      this.trailFlip[hand] ^= 1;
      this.trailSlot[lane] = hand * 2 + this.trailFlip[hand];
      swingTrail.begin(this.trailSlot[lane], WEAPON_FX_STYLES[left ? this.activeLoadout.fx.L : this.activeLoadout.fx.R], move.finisher);
      this.trailActive[lane] = true;
      this.trailMove[lane] = move;
    }
    if (this.sampleSwingAnchors(limb, _trailBase, _trailTip)) swingTrail.push(this.trailSlot[lane], _trailBase, _trailTip);
    return true;
  }

  // 武器 emissive 脈衝：k = 0..1 的相對強度，peak = 峰值 (0 還原為原值)
  private setWeaponGlow(k: number, peak: number, color: number = 0xffffff) {
    if (k <= 0) {
      if (!this.weaponGlowOn) return;
      this.weaponGlowOn = false;
      this.weaponRig.resetGlow();
      return;
    }
    this.weaponGlowOn = true;
    this.weaponRig.glow(this.currentWeaponId, k, peak, color);
  }

  // 依出招進度推進拖尾與武器發光 (於 kf.apply 之後呼叫)
  private updateSwingFx() {
    const move = this.kf.move;
    // 僅一般連段套組出拖尾 (暗殺等專用招式不出)
    if (!move || !this.activeLoadout.combo.includes(move)) { if (this.swingFxOn) this.endSwingFx(); return; }
    const p = this.kf.progress;
    // 第二條拖尾 (雙持左手等) 區段獨立，不影響主拖尾與武器發光
    if (move.trail2) this.updateTrailLane(1, move, p, move.trail2, move.trailLimb2);
    else if (this.trailActive[1]) this.endTrailLane(1);
    // 蓄力區段：拍尖蓄能發光 (越蓄越亮)，起點出向內收的雙色光環
    const charge = move.charge;
    const inCharge = !!charge && p >= charge[0] && p <= charge[1];
    if (inCharge && charge) {
      if (this.chargeSerial !== this.moveSerial) {
        this.chargeSerial = this.moveSerial;
        const lo = this.activeLoadout.fx;
        slashFX.chargeRing(this.position.x, this.position.y + 0.9, this.position.z, WEAPON_FX_STYLES[lo.R].color, WEAPON_FX_STYLES[lo.L].color);
      }
      const style = WEAPON_FX_STYLES[this.activeLoadout.fx.R];
      this.setWeaponGlow((p - charge[0]) / (charge[1] - charge[0]), style.glow * FINISHER_FX_BOOST.glow * 1.6, style.color);
    }
    if (!this.updateTrailLane(0, move, p, move.trail, move.trailLimb)) {
      if (this.weaponGlowOn && !inCharge) this.setWeaponGlow(0, 0);
      return;
    }
    const [from, to] = move.trail;
    // 手持武器招式：顯示中的武器模型可發光時才做 emissive 脈衝 (羽球拍不發光)；有蓄力的招式衝刺時由蓄滿逐漸退光
    if ((move.trailLimb === 'W' || move.trailLimb === 'WL') && this.weaponRig.canGlow(this.displayWeaponId)) {
      const style = WEAPON_FX_STYLES[move.trailLimb === 'W' ? this.activeLoadout.fx.R : this.activeLoadout.fx.L];
      const u = (p - from) / (to - from);
      const k = move.charge ? 1 - u : Math.sin(Math.PI * u);
      this.setWeaponGlow(k, style.glow * (move.finisher ? FINISHER_FX_BOOST.glow : 1) * (move.charge ? 1.6 : 1), style.color);
    }
  }

  // 本幀命中時間點的打擊音效 (strikeIndex 0 = 主擊)
  private playStrikeSound(strikeIndex: number) {
    this.displayLoadout.sounds.strike?.(strikeIndex);
  }

  // 本幀招式突進速度 (m/s)：圖層時間 t → t + delta 與突進區段重疊的位移 ÷ delta (各幀加總恰為 lunge.dist)
  private lungeSpeed(delta: number): number {
    const move = this.kf.move;
    if (!move || !move.lunge || delta <= 0) return 0;
    const t = this.kf.time;
    const step = lungeStep(move, this.kf.duration, t, t + delta);
    // 突進起點 (本招第一個有位移的幀)：突進命中範圍 (aoe.shape 'PATH') 由此點量到目前位置
    if (step > 0 && this.dashSerial !== this.moveSerial) {
      this.dashSerial = this.moveSerial;
      this.dashOrigin.copy(this.position);
    }
    return step / delta;
  }

  // 突進中 (圖層時間位於 lunge 區段內)：戰鬥系統據此略過角色推擠，讓玩家穿過敵群
  public get isLunging(): boolean {
    const move = this.kf.move;
    if (!move || !move.lunge) return false;
    const p = this.kf.progress;
    return p >= move.lunge.from && p <= move.lunge.to;
  }

  // 本招為突進斬 (終結技含突進)：鏡頭據此略微拉遠
  public get isDashMove(): boolean {
    const move = this.kf.move;
    return !!move && move.finisher && !!move.lunge;
  }

  // 中止出招 (受擊、騎車、游泳、換世界、死亡等)，四肢位置立即還原
  public cancelAttack() {
    if (this.kf.engaged) {
      this.kf.cancel();
      this.mesh.rotation.y = this.rotationY;
      this.mesh.rotation.z = 0;
    }
    this.isAttacking = false;
    this.attackQueued = false;
    this.strikeMove = null;
    this.strikes.reset();
    this.comboIndex = 0;
    this.sinceStrike = 99;
    // 死亡 / 騎車等情況 update 會提前 return 而不再呼叫 updateKungFu，需於此立即收掉拖尾與武器發光
    if (this.swingFxOn) this.endSwingFx();
  }

  // 提前收招並淡出 (切換武器時)
  private releaseAttack() {
    if (this.kf.move) this.kf.release();
    this.isAttacking = false;
    this.attackQueued = false;
    this.strikeMove = null;
    this.strikes.reset();
    this.comboIndex = 0;
    this.sinceStrike = 99;
  }

  // 每幀推進出招時間與命中事件，並將姿勢疊加於一般動作之上 (於 animatePlayer 之後呼叫)
  private updateKungFu(delta: number) {
    this.strikeMove = null;
    if (this.punchTimer > 0) this.punchTimer -= delta;
    this.sinceStrike += delta;
    if (!this.kf.engaged) {
      if (this.swingFxOn) this.endSwingFx();
      return;
    }
    // 命中時間點 (主擊 + 多段招式的 extraStrikes)：一幀至多一擊，各擊恰好結算一次
    const strikeIndex = this.strikes.step(this.kf, delta);
    if (strikeIndex >= 0) {
      this.strikeMove = this.strikes.move;
      this.strikeIndex = strikeIndex;
      this.sinceStrike = 0;
      this.playStrikeSound(strikeIndex);
    }
    if (this.attackQueued && this.canAttack) this.startComboMove();
    if (!this.kf.move) this.isAttacking = false;
    // 出招圖層以目前肩部基準位置為軸 (蹲姿時肩部隨身體下沉)
    const rest = this.armRest;
    this.kf.setLimbBase(0, -rest.x, rest.y, rest.z);
    this.kf.setLimbBase(1, rest.x, rest.y, rest.z);
    // 撐傘時左臂維持撐傘姿勢；雙持武器 (suppressUmbrella) 不鎖左臂
    this.kf.apply(this.rotationY, this.isHoldingUmbrella && !this.weaponDef.suppressUmbrella ? 1 : 0, this.armPivot);
    this.updateSwingFx();
    // 出招淡出結束當幀四肢已還原為基準位置，立即依目前姿勢重設肩軸位置 (避免蹲姿收招閃一幀)
    if (!this.kf.engaged) this.applyArmPivot();
  }

  // 被摔倒地：拋起後落地倒地 downTime 秒 (不受受擊保護時間限制，閃身/無敵中無效)
  public knockDown(impactDir: THREE.Vector3, damage: number, reason: string, downTime: number): boolean {
    if (this.isDead || this.isCinematicLocked) return false;
    if (this.isDodging || this.isBearShaking || this.isBackflipping) return false;
    this.cancelAttack();
    this.hitCooldown = 0.55;
    this.isKnockedFlying = true;
    this.isHoldingUmbrella = false;
    if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
    this.knockTimer = 0.5;
    this.isGrounded = false;
    this.knockVelocity.set(impactDir.x * 5.0, 6.5, impactDir.z * 5.0);
    this.knockdownTimer = downTime;
    soundManager.playFallHit();
    return this.takeDamage(damage, reason);
  }

  // 設置玩家攻擊硬直/技能間隔冷卻 (如第二世界正面攻擊巡邏守衛時間隔 0.5 秒)
  public setAttackCooldown(seconds: number) {
    this.punchTimer = Math.max(this.punchTimer, seconds);
  }

  public get canAttack(): boolean {
    return !this.isDead && !this.isSwimming && this.knockdownTimer <= 0 && this.punchTimer <= 0 && this.kf.canChain;
  }

  public update(
    delta: number,
    input: InputManager,
    forwardVec: THREE.Vector3,
    rightVec: THREE.Vector3,
    colliders: CollidableBox[],
    isRaining: boolean = false,
    isRidingBike: boolean = false,
    currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS'
  ) {
    this.updateUmbrella(isRaining, isRidingBike, currentWorld);
    this.worldType = currentWorld;

    // 受擊擊飛、閃身、後空翻、游泳、騎乘或死亡時中止出招
    if (this.kf.engaged && (this.isDead || this.isRidingVehicle || this.isSwimming || this.isKnockedFlying || this.isDodging || this.isBackflipping)) {
      this.cancelAttack();
    }

    if (this.isDead) {
      this.isHoldingUmbrella = false;
      if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      return;
    }

    if (this.isRidingVehicle || this.isInvisible) {
      this.mesh.visible = false;
      if (this.isRidingVehicle) return;
    } else {
      this.mesh.visible = true;
    }

    // 狗熊哆嗦毛施法狀態：由 3 階段連續瞬移主導，免疫一切傷害與擊退
    if (this.isBearShaking) {
      this.bearBlinkTimer += delta;
      this.velocity.set(0, 0, 0);

      // 連續三次瞬移 (0.0s 初始瞬移；0.5s 觸發第 2 次；1.0s 觸發第 3 次)
      if (this.bearBlinkCount === 1 && this.bearBlinkTimer >= 0.5) {
        this.executeBearBlink(colliders);
      } else if (this.bearBlinkCount === 2 && this.bearBlinkTimer >= 1.0) {
        this.executeBearBlink(colliders);
      } else if (this.bearBlinkTimer >= 1.5) {
        // 1.5s 技能圓滿收招
        this.isBearShaking = false;
        this.isDodging = false;
        this.mesh.rotation.z = 0;
        this.setBodyFade(1);
      }

      if (this.isBearShaking) {
        // 狗熊哆嗦毛狂野微抖閃光動畫 (Wild rapid fur shake)
        const shakePhase = this.bearBlinkTimer * 45.0;
        this.mesh.rotation.z = Math.sin(shakePhase) * 0.16;
        this.leftArm.rotation.z = 0.35 + Math.cos(shakePhase) * 0.28;
        this.rightArm.rotation.z = -0.35 - Math.cos(shakePhase) * 0.28;
        this.leftLeg.rotation.x = Math.sin(shakePhase * 0.8) * 0.22;
        this.rightLeg.rotation.x = -Math.sin(shakePhase * 0.8) * 0.22;
        this.headMesh.rotation.y = Math.sin(shakePhase * 0.9) * 0.25;

        // 紫色幻影閃爍
        const purpleFlicker = 0.45 + Math.sin(shakePhase) * 0.35;
        this.setBodyFade(purpleFlicker);

        this.mesh.position.copy(this.position);
        this.updateSkillBubble(delta);
        this.updateAfterimages(delta);
        return;
      }
    }

    // 更新受擊保護計時器
    if (this.hitCooldown > 0) {
      this.hitCooldown -= delta;
    }

    // 1. 移動輸入合成 (WASD 與 360 度真類比虛擬搖桿，0-GC 重複利用 Scratch Vector)
    _playerMoveDir.set(0, 0, 0);
    let analogSpeedScale = 1.0;

    // 被摔倒地期間不讀取操作 (落地後才開始倒數)
    if (this.knockdownTimer > 0 && !this.isKnockedFlying) this.knockdownTimer = Math.max(0, this.knockdownTimer - delta);
    const isDowned = this.knockdownTimer > 0;
    const locked = this.isCinematicLocked || isDowned;
    const hasVirtualJoystick = input.virtualAxisMagnitude > 0.05;
    const hasKeyboard = !!(input.keys['KeyW'] || input.keys['KeyS'] ||
                          input.keys['KeyA'] || input.keys['KeyD']);
    const wantsSprint = !locked && input.sprint;
    const wantsJump = !locked && input.jump;

    if (locked) {
      // 暗殺運鏡鎖定：不讀取移動輸入
    } else if (hasVirtualJoystick && !hasKeyboard) {
      // 360 度真類比連續方向 (推桿 Y 負為前進，X 正為右移)
      _playerMoveDir.addScaledVector(forwardVec, -input.virtualAxisY);
      _playerMoveDir.addScaledVector(rightVec, input.virtualAxisX);
      if (_playerMoveDir.lengthSq() > 0.001) {
        _playerMoveDir.normalize();
      }
      // 支援輕推慢走（依搖桿半徑動態縮放速度 0.35 ~ 1.0）
      const clampedMag = Math.min(1.0, Math.max(0.05, input.virtualAxisMagnitude));
      analogSpeedScale = 0.35 + ((clampedMag - 0.05) / 0.95) * (1.0 - 0.35);
    } else {
      if (input.forward) _playerMoveDir.add(forwardVec);
      if (input.backward) _playerMoveDir.sub(forwardVec);
      if (input.right) _playerMoveDir.add(rightVec);
      if (input.left) _playerMoveDir.sub(rightVec);
      if (_playerMoveDir.lengthSq() > 0.001) {
        _playerMoveDir.normalize();
      }
      analogSpeedScale = 1.0;
    }

    const isMoving = _playerMoveDir.lengthSq() > 0.001;
    this.isMoving = isMoving;

    // 潛龍諜影潛行步態 (MGS Sneak Mode)
    // 電腦版：按住滑鼠右鍵進入靜音蹲伏。
    // 手機版 (特訓院)：預設為潛行姿態，搖桿推至半徑 90% 內 (含靜止不動) 皆維持潛行，超過 90% 才改為一般步行，按「跑」則取消潛行改為衝刺。
    // 躲入草堆掩體時一律保持潛行，不受搖桿影響。
    const isSneakTriggered = !locked && input.mouseButtons.right;
    const isJoystickSneak = !locked && input.isTouchDevice && input.joystickSneakEnabled && !hasKeyboard && !this.isSwimming &&
      input.virtualAxisMagnitude <= JOYSTICK_SNEAK_RADIUS && !(wantsSprint && isMoving);
    this.isSneaking = this.isHidingInCover || isSneakTriggered || isJoystickSneak;

    // 2. 衝刺、潛行與體力消耗 (Sprint, Sneak & Stamina)
    let currentSpeed = this.walkSpeed;
    // 是否處於衝刺：於決定速度的分支直接記錄 (搖桿類比縮放後速度不等於 sprintSpeed，不可用速度比對)
    let sprintActive = false;
    if (this.isSneaking) {
      if (wantsSprint && isMoving && this.stamina > 5) {
        // 刺客疾速潛行 (Crouch-Sprint 疾速低姿滑行 6.5 m/s，依舊 0 噪音，消耗極少體力)
        currentSpeed = 6.5;
        this.stamina = Math.max(0, this.stamina - delta * 12.0);
      } else {
        // 基礎敏捷潛行步速：自原先 2.4 m/s 大幅提速至 4.0 m/s (提升 67%，快速拉近與 1.45 m/s 巡邏警衛的距離)
        currentSpeed = 4.0;
        this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
      }
    } else {
      if (this.isSwimming) {
        currentSpeed = wantsSprint && this.stamina > 5 ? this.swimSprintSpeed : this.swimSpeed;
        if (wantsSprint && isMoving && this.stamina > 5) {
          sprintActive = true;
          this.stamina = Math.max(0, this.stamina - delta * 14.0);
        } else {
          this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
        }
      } else if (wantsSprint && isMoving && this.stamina > 5) {
        currentSpeed = this.sprintSpeed;
        sprintActive = true;
        this.stamina = Math.max(0, this.stamina - delta * 24.0);
      } else {
        // 體力自動恢復
        this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
      }
    }

    currentSpeed *= analogSpeedScale;

    // 出招中 (至可接招點前) 紮穩馬步只能小幅移動；收招階段一移動即提前收招回到跑步動作
    if (this.kf.move && !this.isSwimming) {
      if (!this.kf.canChain) currentSpeed *= 0.3;
      else if (isMoving && !this.attackQueued) {
        this.kf.release();
        this.isAttacking = false;
      }
    }

    // 蹲姿插值平滑過渡 (Smooth Crouch Transition - 潛行與草堆匿蹤均觸發蹲下身姿)
    const targetCrouch = (this.isSneaking || this.isHidingInCover) ? 1.0 : 0.0;
    this.crouchRatio = THREE.MathUtils.lerp(this.crouchRatio, targetCrouch, Math.min(delta * 14.0, 1.0));

    // 刺客草堆掩體半透明隱蔽視覺表現
    if (this.isHidingInCover) {
      this.setBodyFade(0.45);
    } else if (!this.isDodging && !this.isBearShaking && this.hitCooldown <= 0) {
      this.setBodyFade(1);
    }

    // 3. 水平移動速度與擊飛拋物線物理 (Knockback & Launch-Flying)
    if (this.isKnockedFlying) {
      // 處於被擊飛滯空狀態：衝量主導，水平速度衰減，允許微量空中微調
      this.knockVelocity.x *= Math.max(0, 1 - delta * 3.5);
      this.knockVelocity.z *= Math.max(0, 1 - delta * 3.5);

      this.velocity.x = this.knockVelocity.x + _playerMoveDir.x * currentSpeed * 0.15;
      this.velocity.z = this.knockVelocity.z + _playerMoveDir.z * currentSpeed * 0.15;

      // 垂直拋物線重力
      this.knockVelocity.y += this.gravity * delta;
      this.velocity.y = this.knockVelocity.y;

      this.knockTimer -= delta;

      // 受擊傾斜動畫
      this.mesh.rotation.z = Math.sin(this.knockTimer * 12) * 0.25;
    } else {
      // 正常地面或水上移動控制
      if (this.isBackflipping) {
        this.backflipTimer -= delta;
        this.velocity.x = this.backflipDir.x * this.backflipSpeed;
        this.velocity.z = this.backflipDir.z * this.backflipSpeed;
      } else if (this.isParrySkidding) {
        // 速度 v(t) = 2d/T × (1 - t/T)，以本幀中點取樣使總位移 = d
        const prev = this.skidTimer;
        this.skidTimer = Math.max(0, prev - delta);
        const step = prev - this.skidTimer;
        const mid = (prev + this.skidTimer) * 0.5;
        const v = step > 0 ? (2 * this.skidDistance / this.skidDuration) * (mid / this.skidDuration) * (step / Math.max(delta, 1e-6)) : 0;
        this.velocity.x = this.skidDir.x * v;
        this.velocity.z = this.skidDir.z * v;
        if (this.skidTimer <= 0) this.isParrySkidding = false;
      } else if (this.isDodging) {
        this.dodgeTimer -= delta;
        if (this.dodgeTimer <= 0) {
          this.isDodging = false;
          this.mesh.rotation.z = 0;
          this.setBodyFade(1);
        } else {
          this.velocity.x = this.dodgeDir.x * this.dodgeSpeed;
          this.velocity.z = this.dodgeDir.z * this.dodgeSpeed;

          // 定期產生青色破空殘影 (每 0.05 秒一個)
          this.afterimageSpawnTimer -= delta;
          if (this.afterimageSpawnTimer <= 0) {
            this.afterimageSpawnTimer = 0.05;
            this.spawnAfterimage(0x38bdf8, 0.28);
          }

          // 閃身側向微傾斜動畫
          const progress = 1.0 - (this.dodgeTimer / this.dodgeDuration);
          this.mesh.rotation.z = -this.dodgeSideSign * 0.22 * Math.sin(progress * Math.PI);

          // 閃爍微光
          const flicker = 0.5 + Math.sin(this.dodgeTimer * 35.0) * 0.25;
          this.setBodyFade(flicker);
        }
      } else {
        // 突進中鎖定移動方向 (不接受轉向輸入)，路徑維持直線以符合 PATH 命中判定
        const lunging = this.isLunging;
        this.velocity.x = lunging ? 0 : _playerMoveDir.x * currentSpeed;
        this.velocity.z = lunging ? 0 : _playerMoveDir.z * currentSpeed;
        // 招式突進：沿面向前衝 (本幀位移換算為速度，交由一般碰撞處理，遇牆即停)
        const lunge = this.lungeSpeed(delta);
        if (lunge > 0) {
          this.velocity.x += Math.sin(this.rotationY) * lunge;
          this.velocity.z += Math.cos(this.rotationY) * lunge;
        }
      }

      if (this.isSwimming) {
        // 水中浮力與踏水跳躍物理
        if (wantsJump) {
          // 水中踏水躍起 / 攀上池畔
          this.velocity.y = 6.8;
          this.isGrounded = false;
          soundManager.playJump();
        } else {
          // 水面自然浮力平衡：依身體俯仰角計算雙腳深度，使身體沒入水中
          // 踩水直立 (0.32 rad)：下巴略高於水面；自由式俯趴 (1.18 rad 以上)：軀幹中線貼齊水面
          const pitch = this.mesh.rotation.x;
          const proneT = THREE.MathUtils.clamp((pitch - 0.32) / (1.18 - 0.32), 0, 1);
          const feetDepth = THREE.MathUtils.lerp(1.30, 0.05 + 1.05 * Math.cos(pitch), proneT);
          const bob = isMoving ? Math.sin(this.animTimer * 2.0) * 0.025 : Math.sin(this.animTimer) * 0.035;
          const targetWaterY = Math.max(this.swimBottomY, this.swimSurfaceY - feetDepth + bob);
          const yDiff = targetWaterY - this.position.y;
          this.velocity.y = THREE.MathUtils.clamp(yDiff * 8.0, -2.5, 4.0);
          this.isGrounded = false;
        }
      } else {
        // 重力與跳躍
        if (this.isGrounded) {
          this.velocity.y = 0;
          if (wantsJump) {
            this.velocity.y = this.jumpStrength;
            this.isGrounded = false;
            soundManager.playJump();
          }
        } else {
          // 後空翻以半步積分 (位移前後各加半步重力)，頂點高度與滯空時間不受幀率影響
          this.velocity.y += this.isBackflipping ? this.backflipGravity * delta * 0.5 : this.gravity * delta;
        }
      }
      if (!this.isSwimming && !this.isDodging && !this.isKnockedFlying) this.mesh.rotation.z = 0;
    }

    // 5. 碰撞檢測與位移更新 (AABB Collision with Step Climbing)
    this.applyMovementAndCollision(delta, colliders);
    if (this.isBackflipping && !this.isGrounded && !this.isSwimming) this.velocity.y += this.backflipGravity * delta * 0.5;

    // 落地檢測恢復正常控制
    if (this.isGrounded && this.isKnockedFlying && this.knockTimer <= 0.25) {
      this.isKnockedFlying = false;
      this.knockVelocity.set(0, 0, 0);
      this.mesh.rotation.z = 0;
    }

    // 6. 朝向旋轉 (Facing Direction)
    if (isMoving && !this.isKnockedFlying && !this.isBackflipping && !this.isLunging) {
      const targetRotation = Math.atan2(_playerMoveDir.x, _playerMoveDir.z);
      // Smooth angle slerp
      const diff = Math.atan2(Math.sin(targetRotation - this.rotationY), Math.cos(targetRotation - this.rotationY));
      const turnRate = this.isSwimming ? 16.0 : 14.0;
      this.rotationY += diff * Math.min(delta * turnRate, 1.0);
      this.mesh.rotation.y = this.rotationY;
    } else {
      this.mesh.rotation.y = this.rotationY;
    }

    // 7. 人物走動與攻擊動畫擺動 (Procedural Animation)
    const isSprinting = isMoving && sprintActive;
    this.isSprinting = isSprinting;
    this.animatePlayer(delta, isMoving, isSprinting, currentSpeed);
    this.updateKungFu(delta);

    // 後空翻：覆寫翻轉姿勢；時間到且落地後收招站穩
    if (this.isBackflipping) {
      if (this.backflipTimer <= 0 && (this.isGrounded || this.backflipTimer < -0.4)) {
        this.isBackflipping = false;
        this.mesh.rotation.x = 0;
        this.mesh.position.copy(this.position);
        this.velocity.x = 0;
        this.velocity.z = 0;
      } else {
        this.applyBackflipPose(delta);
      }
    }

    // 被摔倒地：仰躺於地面 (落地前維持拋飛動作)；起身由一般動作平滑回正
    if (isDowned && !this.isKnockedFlying) {
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.rotation.z = 0;
      this.mesh.position.y = this.position.y + 0.25;
    }
  }

  private applyMovementAndCollision(delta: number, colliders: CollidableBox[]) {
    const halfWidth = 0.35;
    const height = 1.8;
    const stepHeight = 0.65; // 階梯平滑攀爬容許度
    const skin = 0.001; // 貼牆間隙，避免浮點誤差造成重疊
    const maxSubStep = 0.2; // 單一子步最大位移 (小於 halfWidth，防止高速穿牆)

    // 水平位移切成子步，分軸檢測後直接貼齊碰撞面 (不再整步丟棄位移)
    const totalDx = this.velocity.x * delta;
    const totalDz = this.velocity.z * delta;
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(totalDx), Math.abs(totalDz)) / maxSubStep));
    const stepDx = totalDx / subSteps;
    const stepDz = totalDz / subSteps;
    let collidedX = false;
    let collidedZ = false;
    // 只取整段子步範圍內的鄰近碰撞盒 (位移只會被夾在起點與終點之間，候選集合足以涵蓋)
    const sweep = queryColliders(
      colliders,
      Math.min(this.position.x, this.position.x + totalDx) - halfWidth - 0.1,
      Math.max(this.position.x, this.position.x + totalDx) + halfWidth + 0.1,
      Math.min(this.position.z, this.position.z + totalDz) - halfWidth - 0.1,
      Math.max(this.position.z, this.position.z + totalDz) + halfWidth + 0.1,
      _sweepNear
    );

    for (let s = 0; s < subSteps; s++) {
      // X 軸移動
      if (stepDx !== 0 && !collidedX) {
        let newX = this.position.x + stepDx;
        for (let i = 0; i < sweep.length; i++) {
          const box = sweep[i];
          if (box.isFloorOnly) continue; // 地板/坡道不阻擋水平位移
          if (this.position.y + height <= box.min.y || this.position.y + stepHeight >= box.max.y) continue;
          if (this.position.z + halfWidth <= box.min.z || this.position.z - halfWidth >= box.max.z) continue;
          if (newX + halfWidth <= box.min.x || newX - halfWidth >= box.max.x) continue;
          // 起點已重疊的障礙物不阻擋，交由下方擠出修正處理
          if (this.position.x + halfWidth > box.min.x && this.position.x - halfWidth < box.max.x) continue;
          if (stepDx > 0) {
            newX = Math.min(newX, box.min.x - halfWidth - skin);
          } else {
            newX = Math.max(newX, box.max.x + halfWidth + skin);
          }
          collidedX = true;
        }
        this.position.x = newX;
      }

      // Z 軸移動
      if (stepDz !== 0 && !collidedZ) {
        let newZ = this.position.z + stepDz;
        for (let i = 0; i < sweep.length; i++) {
          const box = sweep[i];
          if (box.isFloorOnly) continue;
          if (this.position.y + height <= box.min.y || this.position.y + stepHeight >= box.max.y) continue;
          if (this.position.x + halfWidth <= box.min.x || this.position.x - halfWidth >= box.max.x) continue;
          if (newZ + halfWidth <= box.min.z || newZ - halfWidth >= box.max.z) continue;
          if (this.position.z + halfWidth > box.min.z && this.position.z - halfWidth < box.max.z) continue;
          if (stepDz > 0) {
            newZ = Math.min(newZ, box.min.z - halfWidth - skin);
          } else {
            newZ = Math.max(newZ, box.max.z + halfWidth + skin);
          }
          collidedZ = true;
        }
        this.position.z = newZ;
      }
    }

    if (collidedX) {
      this.velocity.x = 0;
      this.knockVelocity.x = 0;
    }
    if (collidedZ) {
      this.velocity.z = 0;
      this.knockVelocity.z = 0;
    }

    // 防卡牆與牆角擠壓自解修復 (Depenetration / Anti-Stuck Auto Ejection)
    // 最多 4 輪迭代，沿最小穿透軸擠出；無重疊即提前結束，避免牆角/窄縫來回彈跳
    const pushed = depenetrateXZ(colliders, this.position, halfWidth, stepHeight, height, skin, 4, 'player');
    if (pushed & DEPEN_PUSH_X) {
      this.velocity.x = 0;
      this.knockVelocity.x = 0;
    }
    if (pushed & DEPEN_PUSH_Z) {
      this.velocity.z = 0;
      this.knockVelocity.z = 0;
    }

    // 出水攀岸判定：剛脫離水體且雙腳仍低於水面時，放寬落腳高度並平滑抬升至池畔
    if (this.isSwimming) {
      this.isClimbingOutOfWater = false;
    } else if (this.wasSwimming && this.position.y < this.swimSurfaceY) {
      this.isClimbingOutOfWater = true;
    }
    const groundReach = this.isClimbingOutOfWater ? 1.6 : 0.65;

    // Y 軸移動 (重力與垂直檢測，支援水平層板與連續坡道階梯)
    let targetY = this.position.y + this.velocity.y * delta;
    let groundY = 0; // 地面水平面
    const footprint = queryColliders(
      colliders,
      this.position.x - halfWidth, this.position.x + halfWidth,
      this.position.z - halfWidth, this.position.z + halfWidth,
      _footprintNear
    );

    // 頭頂天花板檢測：上升時頭部不可穿入上方障礙物 (僅檢查目前位於頭頂之上的物件)
    if (targetY > this.position.y) {
      const headY = this.position.y + height;
      for (let i = 0; i < footprint.length; i++) {
        const box = footprint[i];
        if (box.isRamp || box.min.y < headY - skin) continue;
        if (targetY + height <= box.min.y) continue;
        if (this.position.x + halfWidth <= box.min.x || this.position.x - halfWidth >= box.max.x) continue;
        if (this.position.z + halfWidth <= box.min.z || this.position.z - halfWidth >= box.max.z) continue;
        targetY = box.min.y - height - skin;
        this.velocity.y = 0;
        this.knockVelocity.y = 0;
      }
    }

    for (const box of footprint) {
      if (
        this.position.x + halfWidth > box.min.x &&
        this.position.x - halfWidth < box.max.x &&
        this.position.z + halfWidth > box.min.z &&
        this.position.z - halfWidth < box.max.z
      ) {
        if (box.isRamp && box.rampMinZ !== undefined && box.rampMaxZ !== undefined && box.rampYAtMinZ !== undefined && box.rampYAtMaxZ !== undefined) {
          const t = THREE.MathUtils.clamp((this.position.z - box.rampMinZ) / (box.rampMaxZ - box.rampMinZ), 0, 1);
          const rampY = box.rampYAtMinZ + t * (box.rampYAtMaxZ - box.rampYAtMinZ);
          if (rampY <= this.position.y + 0.85 && rampY > groundY) {
            groundY = rampY;
          }
        } else {
          // 標準水平樓地板或物件頂部
          if (box.max.y <= this.position.y + groundReach && box.max.y > groundY) {
            groundY = box.max.y;
          }
        }
      }
    }

    // 已站上地面或主動起跳時結束攀岸狀態
    if (this.isClimbingOutOfWater && (groundY <= this.position.y || this.velocity.y > 0)) {
      this.isClimbingOutOfWater = false;
    }

    // 落地檢測與貼地 (Ground-snapping 下樓防抖動)
    if (this.isSwimming) {
      // 游泳狀態下由浮力主導高度，防止穿透泳池底層
      this.position.y = Math.max(this.swimBottomY, targetY);
      this.isGrounded = false;
    } else if (this.isClimbingOutOfWater) {
      // 攀上池畔：以固定速度平滑抬升，抵達地面後恢復一般落地邏輯
      this.position.y = Math.min(groundY, this.position.y + 3.0 * delta);
      this.velocity.y = 0;
      this.isGrounded = true;
      if (this.position.y >= groundY) this.isClimbingOutOfWater = false;
    } else if (targetY <= groundY || (this.isGrounded && this.position.y - groundY <= 0.65 && this.velocity.y <= 0)) {
      const landingSpeedY = this.velocity.y;
      this.position.y = groundY;
      this.velocity.y = 0;
      this.isGrounded = true;

      // 4. 墜落傷害機制 (Fall Damage)
      if (landingSpeedY < -13.0) {
        const excessSpeed = -landingSpeedY - 13.0;
        const fallDmg = Math.round(excessSpeed * 4.5);
        soundManager.playFallHit();
        this.takeDamage(fallDmg, '墜落摔傷');
      }
    } else {
      this.position.y = targetY;
      this.isGrounded = false;
    }

    this.mesh.position.copy(this.position);
    this.updateSkillBubble(delta);
    this.updateAfterimages(delta);
  }

  // 過場動畫期間玩家不執行 update，由過場驅動走路/站立動作
  public animateCutscene(delta: number, isMoving: boolean, speed: number = 2.5) {
    this.animatePlayer(delta, isMoving, false, speed);
  }

  private animatePlayer(delta: number, isMoving: boolean, isSprinting: boolean, currentSpeed: number = 5.0) {
    if (this.isSwimming !== this.isSwimOutfit) this.setSwimOutfit(this.isSwimming);
    if (this.isSwimming) {
      if (this.armRigScale !== 1) this.updateArmRig(0, 0); // 游泳時還原雙臂骨架 (原尺寸、站立肩高)
      // 1. 身體俯仰趴平姿態 (Prone Freestyle vs Treading Water)
      // 自由式划水衝刺/前進時：前傾俯趴約 70~75 度 (1.20 ~ 1.28 rad)
      // 靜止浮水踩水時：約 18~22 度 (0.32 ~ 0.38 rad)，身體立起、頭部浮出水面踏水
      const targetPitch = isMoving ? (isSprinting ? 1.28 : 1.18) : 0.32;
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, targetPitch, Math.min(delta * 7.0, 1.0));

      if (isMoving) {
        // 自由式划水衝刺/游泳姿態
        const strokeRate = isSprinting ? 8.0 : 5.5; // 配合放慢後的游速，划水頻率同步降低
        this.animTimer += delta * strokeRate;

        // 自由式手臂大輪迴風車劃水動作 (Windmill Crawl Strokes)
        this.leftArm.rotation.x = Math.sin(this.animTimer) * 2.2 - 0.4;
        this.leftArm.rotation.z = Math.cos(this.animTimer) * 0.4;
        this.rightArm.rotation.x = Math.sin(this.animTimer + Math.PI) * 2.2 - 0.4;
        this.rightArm.rotation.z = -Math.cos(this.animTimer) * 0.4;

        // 雙腿水平快速上下交替拍水 (Flutter Kick)
        const kick = Math.sin(this.animTimer * 3.5) * 0.45;
        this.leftLeg.rotation.x = kick;
        this.rightLeg.rotation.x = -kick;
        this.leftLeg.rotation.z = 0;
        this.rightLeg.rotation.z = 0;

        // 游泳時頭部換氣側頭與仰頭（臉部浮出水面）
        this.headMesh.rotation.y = Math.sin(this.animTimer * 0.5) * 0.42;
        this.headMesh.rotation.x = -0.35;

        // 自由式身體微幅側滾 (Body Roll) 與浮力波浪
        this.mesh.rotation.z = Math.sin(this.animTimer) * 0.12;
        this.bodyMesh.position.y = 1.05 + Math.sin(this.animTimer * 2.0) * 0.04;
      } else {
        // 靜止浮水踩水 (Treading water)
        this.animTimer += delta * 3.0;

        // 雙手水平輕推踏水 (Sculling)
        this.leftArm.rotation.x = 0.25 + Math.sin(this.animTimer) * 0.18;
        this.leftArm.rotation.z = 0.42 + Math.cos(this.animTimer) * 0.22;
        this.rightArm.rotation.x = 0.25 + Math.sin(this.animTimer) * 0.18;
        this.rightArm.rotation.z = -0.42 - Math.cos(this.animTimer) * 0.22;

        // 雙腿交替輕柔踩水 (Gentle tread kick)
        this.leftLeg.rotation.x = 0.15 + Math.sin(this.animTimer * 0.8) * 0.22;
        this.rightLeg.rotation.x = 0.15 - Math.sin(this.animTimer * 0.8) * 0.22;
        this.leftLeg.rotation.z = 0.12;
        this.rightLeg.rotation.z = -0.12;

        // 頭部放正向前、直立浮水微幅起伏
        this.headMesh.rotation.y = THREE.MathUtils.lerp(this.headMesh.rotation.y, 0, delta * 6.0);
        this.headMesh.rotation.x = -0.15;
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, delta * 6.0);
        this.bodyMesh.position.y = 1.05 + Math.sin(this.animTimer) * 0.035;
      }
      this.wasSwimming = true;
      return;
    } else {
      // 脫離水體 / 陸地上：平滑復原身體俯仰與側滾至站立行走姿態
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, Math.min(delta * 9.0, 1.0));
      if (!this.isDodging && !this.isKnockedFlying) {
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, Math.min(delta * 9.0, 1.0));
      }
      this.headMesh.rotation.x = THREE.MathUtils.lerp(this.headMesh.rotation.x, 0, Math.min(delta * 9.0, 1.0));
      this.headMesh.rotation.y = THREE.MathUtils.lerp(this.headMesh.rotation.y, 0, Math.min(delta * 9.0, 1.0));
      this.leftLeg.rotation.z = THREE.MathUtils.lerp(this.leftLeg.rotation.z, 0, Math.min(delta * 9.0, 1.0));
      this.rightLeg.rotation.z = THREE.MathUtils.lerp(this.rightLeg.rotation.z, 0, Math.min(delta * 9.0, 1.0));

      // 修復：徹底復原手臂在游泳時被扭轉的 Y 與 Z 軸旋轉姿態，防止切換回走路或常規狀態時手臂外翻或姿勢不正確
      if (!this.isHoldingUmbrella) {
        this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0, Math.min(delta * 14.0, 1.0));
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0, Math.min(delta * 14.0, 1.0));
      }
      if (!this.kf.engaged) {
        this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0, Math.min(delta * 14.0, 1.0));
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0, Math.min(delta * 14.0, 1.0));
      }

      if (this.wasSwimming) {
        // 從游泳狀態剛切換回陸地：瞬間矯正手臂初始姿態與位置
        if (!this.isHoldingUmbrella) {
          this.leftArm.rotation.y = 0;
          this.leftArm.rotation.z = 0;
        }
        this.leftArm.position.set(-0.45, 1.05, 0);
        if (!this.kf.engaged) {
          this.rightArm.rotation.y = 0;
          this.rightArm.rotation.z = 0;
          this.rightArm.position.set(0.45, 1.05, 0);
        }
        this.leftLeg.rotation.z = 0;
        this.rightLeg.rotation.z = 0;
        this.wasSwimming = false;
      }

      if (Math.abs(this.mesh.rotation.x) < 0.005) this.mesh.rotation.x = 0;
      if (!this.isDodging && !this.isKnockedFlying && Math.abs(this.mesh.rotation.z) < 0.005) this.mesh.rotation.z = 0;
      if (!this.isHoldingUmbrella) {
        if (Math.abs(this.leftArm.rotation.y) < 0.005) this.leftArm.rotation.y = 0;
        if (Math.abs(this.leftArm.rotation.z) < 0.005) this.leftArm.rotation.z = 0;
      }
      if (!this.kf.engaged) {
        if (Math.abs(this.rightArm.rotation.y) < 0.005) this.rightArm.rotation.y = 0;
        if (Math.abs(this.rightArm.rotation.z) < 0.005) this.rightArm.rotation.z = 0;
      }
    }

    // 潛行蹲姿重心與肢體形變參數 (依 crouchRatio 平滑變換)
    const crouchY = THREE.MathUtils.lerp(1.05, 0.68, this.crouchRatio);
    const headCrouchY = THREE.MathUtils.lerp(1.62, 1.15, this.crouchRatio);
    const forwardTilt = THREE.MathUtils.lerp(0, 0.28, this.crouchRatio);
    const legY = THREE.MathUtils.lerp(0.35, 0.22, this.crouchRatio);
    const legScaleY = THREE.MathUtils.lerp(1.0, 0.65, this.crouchRatio);

    this.bodyMesh.rotation.x = forwardTilt;
    this.headMesh.rotation.x = -forwardTilt * 0.4;
    this.leftLeg.position.y = legY;
    this.leftLeg.scale.y = legScaleY;
    this.rightLeg.position.y = legY;
    this.rightLeg.scale.y = legScaleY;

    if (isMoving) {
      if (this.isSneaking) {
        // 潛行蹲姿移動：依移動速度動態縮放擺幅與步頻 (4.0 m/s 敏捷潛行，6.5 m/s 疾行潛行)；步幅較大、步頻較慢、起伏較小
        const sneakAnimRate = (currentSpeed / 4.0) * 8.5;
        this.animTimer += delta * sneakAnimRate;
        const swingMag = currentSpeed > 5.0 ? 0.48 : 0.36;
        const swing = Math.sin(this.animTimer) * swingMag;
        if (this.isHoldingUmbrella) {
          const bob = Math.sin(this.animTimer) * 0.02;
          this.leftArm.rotation.set(-Math.PI * 0.65 + bob, -0.12, 0.12);
        } else {
          this.leftArm.rotation.set(-swing * 0.5, 0, 0);
        }
        this.rightArm.rotation.set(swing * 0.5, 0, 0);
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;

        const bob = Math.abs(Math.sin(this.animTimer * 2)) * 0.015;
        this.bodyMesh.position.y = crouchY + bob;
        this.headMesh.position.y = headCrouchY + bob;
      } else {
        const animSpeed = isSprinting ? 18 : 12;
        this.animTimer += delta * animSpeed;

        const swing = Math.sin(this.animTimer) * (isSprinting ? 0.75 : 0.45);
        if (this.isHoldingUmbrella) {
          // 下雨天撐傘跑步行走：左手維持高舉握傘平穩微晃，右手與雙腿維持自然跑步擺動
          const bob = Math.sin(this.animTimer) * 0.025;
          this.leftArm.rotation.set(-Math.PI * 0.65 + bob, -0.12, 0.12);
        } else {
          this.leftArm.rotation.x = -swing;
          this.leftArm.rotation.y = 0;
          this.leftArm.rotation.z = 0;
        }
        this.rightArm.rotation.x = swing;
        this.rightArm.rotation.y = 0;
        this.rightArm.rotation.z = 0;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;

        // 跑步上下顛簸
        this.bodyMesh.position.y = 1.05 + Math.abs(Math.sin(this.animTimer * 2)) * 0.06;
        this.headMesh.position.y = 1.62 + Math.abs(Math.sin(this.animTimer * 2)) * 0.06;
      }
    } else {
      // 靜止閒置姿態
      // 雙臂回到站立待機 (蹲姿時再由持棍戒備姿勢依蹲姿比例混合)
      if (this.isHoldingUmbrella) {
        // 閒置站立時左手維持穩固握傘高舉姿態
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -Math.PI * 0.65, delta * 12.0);
        this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, -0.12, delta * 12.0);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.12, delta * 12.0);
      } else {
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, delta * 10);
        this.leftArm.rotation.y = 0;
        this.leftArm.rotation.z = 0;
      }
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 10);
      this.rightArm.rotation.y = 0;
      this.rightArm.rotation.z = 0;
      if (this.crouchRatio > 0.05) {
        // 蹲下靜止待機 (刺客蹲姿)
        this.bodyMesh.position.y = crouchY;
        this.headMesh.position.y = headCrouchY;
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.15, delta * 10);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -0.15, delta * 10);
      } else {
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, delta * 10);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, delta * 10);
        this.bodyMesh.position.y = 1.05;
        this.headMesh.position.y = 1.62;
      }
    }

    this.applyDualStance(delta);
    this.applyCrouchReadyPose(isMoving);
  }

  // 雙持架勢 (readyPose 'DUAL')：雙臂固定為倒提雙拍姿勢，不隨步伐擺動 (跑步時只隨步伐小幅晃動)，雙腿照常；蹲姿時淡出
  private applyDualStance(delta: number) {
    const wants = this.displayLoadout.readyPose === 'DUAL' && !this.isHoldingUmbrella;
    const target = wants ? 1 - this.crouchRatio : 0;
    this.dualRatio = THREE.MathUtils.lerp(this.dualRatio, target, Math.min(delta * 10, 1));
    if (target === 0 && this.dualRatio < 0.002) this.dualRatio = 0;
    const d = this.dualRatio;
    const S = DUAL_STANCE;
    this.dualWrist = d === 0 ? 0 : THREE.MathUtils.lerp(this.dualWrist, this.kf.engaged ? 0 : 1, Math.min(delta * 12, 1));
    const wrist = THREE.MathUtils.lerp(RACKET_MOUNT_X, S.wrist, this.dualWrist * d);
    const racketR = this.weaponRig.part('DUAL_RACKET', 'R');
    const racketL = this.weaponRig.part('DUAL_RACKET', 'L');
    if (racketR) racketR.rotation.x = wrist;
    if (racketL) racketL.rotation.x = wrist;
    if (d === 0) return;
    const sway = this.isSprinting ? 0.06 : 0.035;
    const bob = Math.sin(this.animTimer) * (this.isMoving ? sway : 0.012);
    const ra = this.rightArm.rotation;
    const la = this.leftArm.rotation;
    ra.set(
      THREE.MathUtils.lerp(ra.x, S.rightArm.x + bob, d),
      THREE.MathUtils.lerp(ra.y, S.rightArm.y, d),
      THREE.MathUtils.lerp(ra.z, S.rightArm.z, d)
    );
    la.set(
      THREE.MathUtils.lerp(la.x, S.leftArm.x - bob, d),
      THREE.MathUtils.lerp(la.y, S.leftArm.y, d),
      THREE.MathUtils.lerp(la.z, S.leftArm.z, d)
    );
  }

  // 潛行姿勢 A「持棍戒備」：依蹲姿比例混合雙臂姿勢 (右手持武器斜擋身前 / 徒手握拳、左臂半舉前伸平衡，移動時小幅擺動)、
  // 雙腳略為外開，並讓雙臂肩部隨身體下沉、手臂縮短
  private applyCrouchReadyPose(isMoving: boolean) {
    const c = this.crouchRatio;
    if (c > 0.001) {
      const sway = isMoving ? Math.sin(this.animTimer) * 0.08 : 0;
      const right = this.displayLoadout.readyPose === 'FIST' ? READY_RIGHT_FIST : READY_RIGHT_WEAPON;
      const ra = this.rightArm.rotation;
      ra.set(
        THREE.MathUtils.lerp(ra.x, right.x + sway * 0.5, c),
        THREE.MathUtils.lerp(ra.y, right.y, c),
        THREE.MathUtils.lerp(ra.z, right.z, c)
      );
      if (!this.isHoldingUmbrella) {
        const la = this.leftArm.rotation;
        la.set(
          THREE.MathUtils.lerp(la.x, READY_LEFT.x - sway, c),
          THREE.MathUtils.lerp(la.y, READY_LEFT.y, c),
          THREE.MathUtils.lerp(la.z, READY_LEFT.z, c)
        );
      }
      this.leftLeg.rotation.z = -0.07 * c;
      this.rightLeg.rotation.z = 0.07 * c;
    }
    this.updateArmRig(c, Math.max(c, this.dualRatio));
  }

  // 雙臂骨架：縮放、肩部基準位置 (站立維持原本以手臂中心為軸；蹲姿以肩為軸) 並同步給出招圖層
  private armRigScale: number = 1;
  private armPivot: number = 0; // 雙臂以肩為軸的比例 (= 蹲姿比例)
  private readonly armRest = new THREE.Vector3(ARM_X, ARM_STAND_Y, 0);
  private updateArmRig(crouch: number, pivot: number) {
    const c = crouch < 0.001 ? 0 : crouch;
    const pv = pivot < 0.001 ? 0 : pivot;
    this.armPivot = pv;
    const scale = THREE.MathUtils.lerp(1, CROUCH_ARM_SCALE, c);
    if (scale !== this.armRigScale) {
      this.armRigScale = scale;
      this.leftArm.scale.setScalar(scale);
      this.rightArm.scale.setScalar(scale);
      // 手上物件維持原尺寸 (只隨手臂位置移動)
      const inv = 1 / scale;
      this.umbrellaMesh.scale.setScalar(inv);
      this.weaponRig.setInvScale(inv);
    }
    // 肩部位置：身體中心上方 ARM_HALF，隨前傾角度前移
    const tilt = this.bodyMesh.rotation.x;
    const h = ARM_HALF * scale;
    const shoulderY = this.bodyMesh.position.y + ARM_HALF * Math.cos(tilt);
    const restY = THREE.MathUtils.lerp(ARM_STAND_Y, shoulderY - h, pv);
    const restZ = ARM_HALF * Math.sin(tilt) * pv;
    this.armRest.set(ARM_X, restY, restZ);
    if (!this.kf.engaged) this.applyArmPivot();
  }

  // 依目前手臂旋轉設定位置：蹲姿比例越高越以肩為軸 (補償旋轉位移使肩部固定)
  private applyArmPivot() {
    const c = this.armPivot;
    const h = ARM_HALF * this.armRigScale;
    const rest = this.armRest;
    for (let i = 0; i < 2; i++) {
      const arm = i === 0 ? this.leftArm : this.rightArm;
      const x = i === 0 ? -rest.x : rest.x;
      if (c === 0) {
        arm.position.set(x, rest.y, rest.z);
        continue;
      }
      _armTop.set(0, h, 0).applyEuler(arm.rotation);
      arm.position.set(x - _armTop.x * c, rest.y + (h - _armTop.y) * c, rest.z - _armTop.z * c);
    }
  }

  // 快取角色身上所有網格材質 (去重) 與其原始不透明度/透明旗標，供淡化特效重複使用
  private collectFadeMaterials() {
    const seen = new Set<THREE.Material>();
    this.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        this.fadeMaterials.push({ mat, baseOpacity: mat.opacity, baseTransparent: mat.transparent });
      }
    });
  }

  // 套用全身淡化 (1 = 原貌)：以原始不透明度等比縮放 (半透明網線維持相對透明度)，回到 1 時還原透明旗標
  private setBodyFade(alpha: number) {
    if (alpha === this.currentFade) return;
    this.currentFade = alpha;
    for (let i = 0; i < this.fadeMaterials.length; i++) {
      const entry = this.fadeMaterials[i];
      entry.mat.opacity = entry.baseOpacity * alpha;
      const transparent = entry.baseTransparent || alpha < 1;
      if (entry.mat.transparent !== transparent) {
        entry.mat.transparent = transparent;
        entry.mat.needsUpdate = true;
      }
    }
  }

  // 資源釋放處置 (Resource Disposal)
  public dispose(scene?: THREE.Scene) {
    // 未掛載中的陸上/泳裝備用幾何體需一併釋放
    for (const node of this.outfitNodes) {
      if (node.mesh.geometry !== node.land) node.land.dispose();
      if (node.mesh.geometry !== node.swim) node.swim.dispose();
    }
    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });
    this.afterimagePool.dispose(scene);
    if (scene) {
      scene.remove(this.mesh);
    } else if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
