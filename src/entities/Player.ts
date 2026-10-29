import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SkillBubble } from './shared/SkillBubble';
import { AfterimagePool } from './shared/AfterimagePool';
import { findSafeTeleportPos } from './shared/teleport';
import { buildUmbrella } from './shared/umbrella';
import { CollidableBox } from '../world/CampusWorld';
import { queryColliders, depenetrateXZ, DEPEN_PUSH_X, DEPEN_PUSH_Z } from '../physics/aabb';
import { InputManager } from '../core/InputManager';
import { soundManager } from '../audio/SoundEffects';
import { IndoorManager } from '../systems/IndoorManager';

export type WeaponType = 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT';

// 模組頂層靜態共享 Scratch 物件 (0-GC 避免每幀垃圾回收引發微卡頓)
const DEFAULT_RESPAWN_POS = new THREE.Vector3(0, 0, 15);
const _playerMoveDir = new THREE.Vector3();
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

  // 武器系統 (Weapon System)
  public currentWeapon: WeaponType = 'FIST';
  public hasNormalBat: boolean = false;
  public hasSpecialBat: boolean = false;
  private normalBatMesh!: THREE.Group;
  private specialBatMesh!: THREE.Group;

  // 羽球拍造型 (Badminton Racket Model - 4F 羽球挑戰賽專屬造型)
  public isHoldingRacket: boolean = false;
  private racketMesh!: THREE.Group;

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

  // 下雨天專屬雨傘系統
  public isHoldingUmbrella: boolean = false;
  private umbrellaMesh!: THREE.Group;
  private hasShownRainBubble: boolean = false;

  public onTakeDamageCallback: ((amount: number, reason: string) => void) | null = null;
  public onDeathCallback: (() => void) | null = null;

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
  private punchTimer: number = 0;
  public isAttacking: boolean = false;

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

    // 建立球棒武器 3D 模型並掛載於右手 (Attached to right arm)
    // 1. 普通木質棒球棍 (Normal Wooden Baseball Bat)
    this.normalBatMesh = new THREE.Group();
    const batWoodMat = new THREE.MeshLambertMaterial({ color: 0xcd853f });
    const batGripMat = new THREE.MeshLambertMaterial({ color: 0x2d3436 });
    const grip1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), batGripMat);
    grip1.position.y = 0.14;
    this.normalBatMesh.add(grip1);
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.035, 0.62, 8), batWoodMat);
    barrel1.position.y = 0.58;
    this.normalBatMesh.add(barrel1);
    this.normalBatMesh.position.set(0, -0.28, 0.12);
    this.normalBatMesh.rotation.x = Math.PI / 3; // 正角度朝前方+Z上仰，避免朝後方背刺
    this.normalBatMesh.visible = false;
    this.rightArm.add(this.normalBatMesh);

    // 2. 特殊黃金雷霆棒球棍 (Special Golden Thunder Baseball Bat)
    this.specialBatMesh = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xf39c12,
      emissiveIntensity: 0.4
    });
    const specialGripMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
    const grip2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), specialGripMat);
    grip2.position.y = 0.15;
    this.specialBatMesh.add(grip2);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.72, 8), goldMat);
    barrel2.position.y = 0.65;
    this.specialBatMesh.add(barrel2);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xff4757, emissive: 0xff3838, emissiveIntensity: 0.5 });
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 6, 12), crownMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 1.02;
    this.specialBatMesh.add(crown);
    this.specialBatMesh.position.set(0, -0.28, 0.12);
    this.specialBatMesh.rotation.x = Math.PI / 3; // 正角度朝前方+Z上仰
    this.specialBatMesh.visible = false;
    this.rightArm.add(this.specialBatMesh);

    // 3. 羽球拍造型 (Badminton Racket Model - 4F 羽球挑戰賽專用造型，比賽結束或搭電梯時自動還原)
    this.racketMesh = new THREE.Group();
    const racketGripMat = new THREE.MeshLambertMaterial({ color: 0x3498db }); // 藍色防滑膠帶纏握把
    const racketShaftMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // 輕量化碳素中桿
    const racketFrameMat = new THREE.MeshLambertMaterial({ color: 0x2ecc71 }); // 亮青綠流線拍框
    const racketStringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }); // 網線

    const rGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8), racketGripMat);
    rGrip.position.y = 0.12;
    this.racketMesh.add(rGrip);

    const rShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), racketShaftMat);
    rShaft.position.y = 0.45;
    this.racketMesh.add(rShaft);

    const rFrame = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 8, 16), racketFrameMat);
    rFrame.position.y = 0.82;
    this.racketMesh.add(rFrame);

    const rStrings = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), racketStringMat);
    rStrings.position.y = 0.82;
    this.racketMesh.add(rStrings);

    this.racketMesh.position.set(0, -0.28, 0.12);
    this.racketMesh.rotation.x = Math.PI / 3; // 正角度朝前方+Z上仰
    this.racketMesh.visible = false;
    this.rightArm.add(this.racketMesh);

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

  public takeDamage(amount: number, reason: string = '受到傷害'): boolean {
    if (this.isDead) return false;
    if (this.isDodging || this.isBearShaking) {
      // 處於閃身/無敵或狗熊哆嗦毛瞬移判定狀態，免疫一切傷害！
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.onTakeDamageCallback) {
      this.onTakeDamageCallback(amount, reason);
    }
    if (this.hp <= 0) {
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
    if (this.isDead) return false;
    if (this.isDodging || this.isBearShaking) {
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
    if (this.isDead || this.isRidingVehicle || this.isSwimming) return;

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
    if (this.isDead || this.isRidingVehicle || this.isSwimming) return;

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

  // 刺客教條·暗殺 BOSS 後跳遠離 (後跳跳離約 4 個身位 ~5.0m，面向 BOSS)
  public leapAwayFrom(targetPos: THREE.Vector3, colliders: CollidableBox[] = [], jumpDist: number = 5.0) {
    if (this.isDead) return;

    // 計算遠離 target 的方向
    const awayDir = new THREE.Vector3().subVectors(this.position, targetPos).setY(0);
    if (awayDir.lengthSq() < 0.001) {
      awayDir.set(0, 0, 1);
    } else {
      awayDir.normalize();
    }

    // 落地時面向 BOSS: 朝向 targetPos
    const toBoss = new THREE.Vector3().subVectors(targetPos, this.position).setY(0).normalize();
    this.rotationY = Math.atan2(toBoss.x, toBoss.z);
    this.mesh.rotation.y = this.rotationY;

    // 步進防穿牆位移 (最高 jumpDist，約 4.8m ~ 5.2m)
    const step = 0.2;
    const steps = Math.floor(jumpDist / step);
    const halfWidth = 0.4;
    const height = 1.8;
    let currentX = this.position.x;
    let currentZ = this.position.z;

    for (let s = 0; s < steps; s++) {
      const nextX = currentX + awayDir.x * step;
      const nextZ = currentZ + awayDir.z * step;
      let blocked = false;

      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        if (box.isFloorOnly) continue;
        if (
          nextX + halfWidth > box.min.x &&
          nextX - halfWidth < box.max.x &&
          nextZ + halfWidth > box.min.z &&
          nextZ - halfWidth < box.max.z &&
          this.position.y + height > box.min.y &&
          this.position.y + 0.3 < box.max.y
        ) {
          blocked = true;
          break;
        }
      }

      if (blocked) break;
      currentX = nextX;
      currentZ = nextZ;
    }

    this.position.x = currentX;
    this.position.z = currentZ;
    this.mesh.position.copy(this.position);

    // 向上後跳騰空拋物線初速度
    this.velocity.y = 5.5;

    // 留下身法殘影與音效
    this.spawnAfterimage(0x38bdf8, 0.45);
    soundManager.playDodge(false);
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
    this.isBearShaking = false;
    this.bearBlinkCount = 0;
    this.bearBlinkTimer = 0;
    this.dodgeTimer = 0;
    this.deathTimer = 0;
    this.isKnockedFlying = false;
    this.knockVelocity.set(0, 0, 0);
    this.hitCooldown = 0;
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
    if (equip) {
      this.isHoldingRacket = true;
      if (this.racketMesh) this.racketMesh.visible = true;
      if (this.normalBatMesh) this.normalBatMesh.visible = false;
      if (this.specialBatMesh) this.specialBatMesh.visible = false;
    } else {
      if (this.isHoldingRacket) {
        this.isHoldingRacket = false;
        if (this.racketMesh) this.racketMesh.visible = false;
        // 還原原本的武器外觀
        if (this.normalBatMesh) this.normalBatMesh.visible = (this.currentWeapon === 'NORMAL_BAT');
        if (this.specialBatMesh) this.specialBatMesh.visible = (this.currentWeapon === 'SPECIAL_BAT');
      }
    }
  }

  public setWeapon(type: WeaponType): boolean {
    if (type === 'NORMAL_BAT' && !this.hasNormalBat) return false;
    if (type === 'SPECIAL_BAT' && !this.hasSpecialBat) return false;

    this.currentWeapon = type;
    if (this.isHoldingRacket) {
      if (this.racketMesh) this.racketMesh.visible = true;
      if (this.normalBatMesh) this.normalBatMesh.visible = false;
      if (this.specialBatMesh) this.specialBatMesh.visible = false;
    } else {
      if (this.normalBatMesh) this.normalBatMesh.visible = (type === 'NORMAL_BAT');
      if (this.specialBatMesh) this.specialBatMesh.visible = (type === 'SPECIAL_BAT');
    }
    return true;
  }

  public getWeaponDamage(): number {
    if (this.currentWeapon === 'SPECIAL_BAT') return 120;
    if (this.currentWeapon === 'NORMAL_BAT') return 55;
    return 25;
  }

  public getWeaponReach(): number {
    if (this.currentWeapon === 'SPECIAL_BAT') return 3.8;
    if (this.currentWeapon === 'NORMAL_BAT') return 3.2;
    return 2.2;
  }

  public getWeaponKnockback(): number {
    if (this.currentWeapon === 'SPECIAL_BAT') return 22.0;
    if (this.currentWeapon === 'NORMAL_BAT') return 14.0;
    return 7.5;
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
    // 少年院世界為鐵血特訓營舍，學員一律不持傘
    if (currentWorld === 'DETENTION') {
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

  public attack(): boolean {
    if (this.isDead || this.isSwimming) return false; // 游泳狀態下雙手劃水，不可出拳揮棒
    if (this.punchTimer <= 0) {
      if (this.isHoldingRacket) {
        this.punchTimer = 0.38;
        this.isAttacking = true;
        soundManager.playBadmintonWhoosh();
      } else if (this.currentWeapon === 'SPECIAL_BAT') {
        this.punchTimer = 0.48;
        this.isAttacking = true;
        soundManager.playSpecialBatHit();
      } else if (this.currentWeapon === 'NORMAL_BAT') {
        this.punchTimer = 0.42;
        this.isAttacking = true;
        soundManager.playBatHit();
      } else {
        this.punchTimer = 0.35;
        this.isAttacking = true;
        soundManager.playPunch();
      }
      return true;
    }
    return false;
  }

  // 設置玩家攻擊硬直/技能間隔冷卻 (如第二世界正面攻擊巡邏守衛時間隔 0.5 秒)
  public setAttackCooldown(seconds: number) {
    this.punchTimer = Math.max(this.punchTimer, seconds);
  }

  public get canAttack(): boolean {
    return !this.isDead && !this.isSwimming && this.punchTimer <= 0;
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

    const hasVirtualJoystick = input.virtualAxisMagnitude > 0.05;
    const hasKeyboard = !!(input.keys['KeyW'] || input.keys['ArrowUp'] ||
                          input.keys['KeyS'] || input.keys['ArrowDown'] ||
                          input.keys['KeyA'] || input.keys['ArrowLeft'] ||
                          input.keys['KeyD'] || input.keys['ArrowRight']);

    if (hasVirtualJoystick && !hasKeyboard) {
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
    // 電腦版：按住滑鼠右鍵進入靜音蹲伏（亦支援 Ctrl）。
    // 手機版 (特訓院)：預設為潛行姿態，搖桿推至半徑 90% 內 (含靜止不動) 皆維持潛行，超過 90% 才改為一般步行，按「跑」則取消潛行改為衝刺。
    // 躲入草堆掩體時一律保持潛行，不受搖桿影響。
    const isSneakTriggered = input.mouseButtons.right || !!(
      input.keys['ControlLeft'] ||
      input.keys['ControlRight']
    );
    const isJoystickSneak = input.isTouchDevice && input.joystickSneakEnabled && !hasKeyboard && !this.isSwimming &&
      input.virtualAxisMagnitude <= JOYSTICK_SNEAK_RADIUS && !(input.sprint && isMoving);
    this.isSneaking = this.isHidingInCover || isSneakTriggered || isJoystickSneak;

    // 2. 衝刺、潛行與體力消耗 (Sprint, Sneak & Stamina)
    let currentSpeed = this.walkSpeed;
    // 是否處於衝刺：於決定速度的分支直接記錄 (搖桿類比縮放後速度不等於 sprintSpeed，不可用速度比對)
    let sprintActive = false;
    if (this.isSneaking) {
      if (input.sprint && isMoving && this.stamina > 5) {
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
        currentSpeed = input.sprint && this.stamina > 5 ? this.swimSprintSpeed : this.swimSpeed;
        if (input.sprint && isMoving && this.stamina > 5) {
          sprintActive = true;
          this.stamina = Math.max(0, this.stamina - delta * 14.0);
        } else {
          this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
        }
      } else if (input.sprint && isMoving && this.stamina > 5) {
        currentSpeed = this.sprintSpeed;
        sprintActive = true;
        this.stamina = Math.max(0, this.stamina - delta * 24.0);
      } else {
        // 體力自動恢復
        this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
      }
    }

    currentSpeed *= analogSpeedScale;

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
      if (this.isDodging) {
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
        this.velocity.x = _playerMoveDir.x * currentSpeed;
        this.velocity.z = _playerMoveDir.z * currentSpeed;
      }

      if (this.isSwimming) {
        // 水中浮力與踏水跳躍物理
        if (input.jump) {
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
          if (input.jump) {
            this.velocity.y = this.jumpStrength;
            this.isGrounded = false;
            soundManager.playJump();
          }
        } else {
          this.velocity.y += this.gravity * delta;
        }
      }
      if (!this.isSwimming && !this.isDodging && !this.isKnockedFlying) this.mesh.rotation.z = 0;
    }

    // 5. 碰撞檢測與位移更新 (AABB Collision with Step Climbing)
    this.applyMovementAndCollision(delta, colliders);

    // 落地檢測恢復正常控制
    if (this.isGrounded && this.isKnockedFlying && this.knockTimer <= 0.25) {
      this.isKnockedFlying = false;
      this.knockVelocity.set(0, 0, 0);
      this.mesh.rotation.z = 0;
    }

    // 6. 朝向旋轉 (Facing Direction)
    if (isMoving && !this.isKnockedFlying) {
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
      if (this.punchTimer <= 0) {
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
        if (this.punchTimer <= 0) {
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
      if (this.punchTimer <= 0) {
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

    if (this.punchTimer > 0) {
      this.punchTimer -= delta;
      // 若下雨天撐傘中，右手揮擊時左手依然穩健撐傘
      if (this.isHoldingUmbrella) {
        this.leftArm.rotation.set(-Math.PI * 0.65, -0.12, 0.12);
      }
      // 揮擊動作 (球棒/羽球拍寬幅橫掃 / 拳頭直擊)
      if (this.currentWeapon !== 'FIST' || this.isHoldingRacket) {
        const totalDuration = this.isHoldingRacket ? 0.38 : (this.currentWeapon === 'SPECIAL_BAT' ? 0.48 : 0.42);
        const swingProgress = 1 - Math.max(0, this.punchTimer / totalDuration);
        const swingCurve = Math.sin(swingProgress * Math.PI);
        this.rightArm.rotation.x = -swingCurve * 1.1;
        this.rightArm.rotation.y = -swingCurve * 1.3;
        this.rightArm.position.z = swingCurve * 0.25;
      } else {
        this.rightArm.rotation.x = -Math.PI / 2 + Math.sin(this.punchTimer * 15) * 0.5;
        this.rightArm.rotation.y = 0;
        this.rightArm.position.z = 0.25;
      }
      if (this.punchTimer <= 0) {
        this.isAttacking = false;
        this.rightArm.rotation.x = 0;
        this.rightArm.rotation.y = 0;
        this.rightArm.rotation.z = 0;
        this.rightArm.position.z = 0;
      }
    } else if (isMoving) {
      if (this.isSneaking) {
        // 潛行蹲姿移動：依移動速度動態縮放擺幅與步頻 (4.0 m/s 敏捷潛行，6.5 m/s 疾行潛行)
        const sneakAnimRate = (currentSpeed / 4.0) * 10.5;
        this.animTimer += delta * sneakAnimRate;
        const swingMag = currentSpeed > 5.0 ? 0.42 : 0.30;
        const swing = Math.sin(this.animTimer) * swingMag;
        if (this.isHoldingUmbrella) {
          const bob = Math.sin(this.animTimer) * 0.02;
          this.leftArm.rotation.set(-Math.PI * 0.65 + bob, -0.12, 0.12);
        } else {
          this.leftArm.rotation.set(-swing * 0.5 - 0.2, 0, 0.22);
        }
        this.rightArm.rotation.set(swing * 0.5 - 0.2, 0, -0.22);
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;

        const bob = Math.abs(Math.sin(this.animTimer * 2)) * 0.025;
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
      if (this.crouchRatio > 0.05) {
        // 蹲下靜止待機 (單膝蹲伏/刺客蹲姿)
        this.bodyMesh.position.y = crouchY;
        this.headMesh.position.y = headCrouchY;
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.15, delta * 10);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -0.15, delta * 10);
        if (!this.isHoldingUmbrella) {
          this.leftArm.rotation.set(-0.25, 0, 0.2);
        }
        this.rightArm.rotation.set(-0.25, 0, -0.2);
      } else {
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
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, delta * 10);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, delta * 10);
        this.bodyMesh.position.y = 1.05;
        this.headMesh.position.y = 1.62;
      }
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
