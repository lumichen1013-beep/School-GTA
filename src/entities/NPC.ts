import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollidableBox } from '../world/CampusWorld';
import { queryColliders, isBlockedXZ, depenetrateXZ, getSupportFloorY, DEPEN_PUSH_X, DEPEN_PUSH_Z } from '../physics/aabb';
import { soundManager } from '../audio/SoundEffects';
import { IndoorManager } from '../systems/IndoorManager';
import type { Bicycle } from '../vehicles/Bicycle';
import { bakeNode, bakeStaticParts, disposeNonShared, getHpBarMaterial, getHpBarResources } from './npc/modelCache';
import { SkillBubble } from './shared/SkillBubble';
import { AfterimagePool } from './shared/AfterimagePool';
import { findSafeTeleportPos } from './shared/teleport';
import { buildUmbrella } from './shared/umbrella';
import { ROLE_CONFIG, STUDENT_STYLE_STATS, NPCRoleConfig } from './npc/roleConfig';
import { impactDust } from '../effects/ImpactDust';
import { requestCameraShake } from '../effects/cameraShake';

export type NPCRole =
  | 'STUDENT'
  | 'INSPECTOR'
  | 'TEACHER'
  | 'INSTRUCTOR'
  | 'DOG'
  | 'BIKE_PATROL'
  | 'BANDIT'
  | 'PE_TEACHER_BOSS'
  | 'DODGE_TEACHER'
  | 'DETENTION_GUARD'
  | 'DETENTION_SENIOR'
  | 'DETENTION_HEAVY'
  | 'DETENTION_WOLF'
  | 'DETENTION_BOSS';

export type NPCIdleBehavior = 'LOOK_AROUND' | 'PHONE' | 'STRETCH' | 'HANDS_BEHIND_BACK' | 'CHAT' | 'DOG_SNIFF' | 'DOG_SIT';
export type NPCMovementStyle = 'CASUAL_WALK' | 'HURRIED_WALK' | 'JOGGING' | 'OFFICER_PATROL';

export interface ShuttlecockProjectile {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  hasHitOrMissed?: boolean;
  isReturned?: boolean;
}

// 模組頂層靜態共享 Scratch Vectors (0-GC 避免每幀垃圾回收引發微卡頓)
const _npcMoveDir = new THREE.Vector3();
const _npcLookTarget = new THREE.Vector3();
const _npcSafeTeleportResult = new THREE.Vector3();
// NPC 技能/對話氣泡外觀 (字級依文字長度縮放)
const NPC_BUBBLE_STYLE = { fillAlpha: 0.85, strokeAlpha: 0.85, fontSize: (text: string) => (text.length > 9 ? 24 : (text.length > 6 ? 28 : 34)) };
const _npcSightNear: CollidableBox[] = [];
const _bossNear: CollidableBox[] = [];
const _bossKnockDir = new THREE.Vector3();
const _bossImpactPoint = new THREE.Vector3();
// 總教官硬直頭頂旋轉星星 (所有實例共用幾何與材質)
let _stunStarGeo: THREE.OctahedronGeometry | null = null;
let _stunStarMat: THREE.MeshBasicMaterial | null = null;

// 各角色攻擊傷害與擊飛衝量靜態常數快取 (0-GC，免除每幀攻擊判定重複配置物件)
export interface AttackSpec {
  damage: number;
  hForce: number;
  vForce: number;
}

const _ATTACK_SPECS: Record<string, AttackSpec> = {
  DODGE_TEACHER: { damage: 0, hForce: 5.0, vForce: 2.0 },
  PE_TEACHER_BOSS: { damage: 28, hForce: 13.0, vForce: 7.0 },
  DETENTION_BOSS: { damage: 20, hForce: 10.0, vForce: 4.5 },
  DETENTION_HEAVY: { damage: 18, hForce: 12.0, vForce: 5.0 },
  DETENTION_WOLF: { damage: 10, hForce: 7.0, vForce: 3.5 },
  DETENTION_GUARD: { damage: 12, hForce: 7.0, vForce: 3.0 },
  DETENTION_SENIOR: { damage: 14, hForce: 8.0, vForce: 3.5 },
  BANDIT: { damage: 44, hForce: 10.0, vForce: 5.5 },
  TEACHER: { damage: 28, hForce: 10.0, vForce: 6.0 },
  DOG: { damage: 24, hForce: 11.5, vForce: 5.0 },
  BIKE_PATROL: { damage: 22, hForce: 12.5, vForce: 6.5 },
  INSPECTOR: { damage: 18, hForce: 8.0, vForce: 4.5 },
  STUDENT: { damage: 12, hForce: 6.0, vForce: 3.5 }
};
const _DEFAULT_ATTACK_SPEC: AttackSpec = { damage: 12, hForce: 6.0, vForce: 3.5 };

// 3D 羽球靜態共享幾何體與材質 (0-GC 全域快取複用，杜絕頻繁發球引發 GC 微卡頓或 GPU 洩漏)
// 1. 軟木塞球頭 (Cork Head)：半徑約 0.075m 橢圓小球，位於飛行方向最前端 (+Z)
const _shuttleCorkGeo = new THREE.SphereGeometry(0.075, 16, 12);
_shuttleCorkGeo.scale(1.0, 1.0, 1.15);
_shuttleCorkGeo.translate(0, 0, 0.02);
const _shuttleCorkMat = new THREE.MeshLambertMaterial({ color: 0xf5f6fa });

// 2. 軟木塞與羽毛交界處飾條 (經典深綠色膠帶貼條)
const _shuttleBandGeo = new THREE.CylinderGeometry(0.076, 0.076, 0.02, 16, 1, true);
_shuttleBandGeo.rotateX(-Math.PI / 2);
_shuttleBandGeo.translate(0, 0, 0.005);
const _shuttleBandMat = new THREE.MeshLambertMaterial({ color: 0x1b4332, side: THREE.DoubleSide });

// 3. 羽毛裙 (Feather Skirt)：16 根向後擴散外張漏斗錐台羽毛 (前端半徑 0.075, 後端張開 0.16, 長度 0.22)
const _shuttleSkirtGeo = new THREE.CylinderGeometry(0.16, 0.075, 0.22, 16, 1, true);
_shuttleSkirtGeo.rotateX(-Math.PI / 2);
_shuttleSkirtGeo.translate(0, 0, -0.11);
const _shuttleSkirtMat = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  flatShading: true
});

// 4. 羽毛裙羽線箍環 (固定羽毛的細 Torus 線圈)
const _shuttleThread1Geo = new THREE.TorusGeometry(0.13, 0.004, 4, 16);
_shuttleThread1Geo.translate(0, 0, -0.14);
const _shuttleThread2Geo = new THREE.TorusGeometry(0.10, 0.004, 4, 16);
_shuttleThread2Geo.translate(0, 0, -0.07);
const _shuttleThreadMat = new THREE.MeshBasicMaterial({ color: 0xdcdde1 });

// 羽球 3D 模型物件池 (0-GC，循環復用 Group)
const _shuttlecockPool: THREE.Group[] = [];

export class NPC {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public readonly initialPosition: THREE.Vector3;
  public readonly initialRotationY: number = 0;
  public baseFloorY: number = 0; // 支援多樓層 (1F: 0, 2F: 6.0, 3F: 12.0)
  public role: NPCRole;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;
  public isChasing: boolean = false;
  public speed: number = 5.0; // 統一基準行走速度
  public chaseSpeed: number = 10.0; // 統一基準跑步速度
  public attackPower: number = 12;
  public attackRange: number = 1.6;
  public shuttlecockCooldown: number = 0; // 羽球發射遠程冷卻
  public isInBadmintonMatch: boolean = false; // 是否正處於 4F 羽球挑戰賽中 (由 TennisGame 控制專業跑位步法)

  // HP 系統與倒地復活機制
  public hp: number;
  public maxHp: number;
  public isKnockedDown: boolean = false;
  public isPermanentlyKnockedOut: boolean = false; // 潛龍諜影擊昏永久不重生
  public alertState: 'NORMAL' | 'CAUTION' | 'ALERT' = 'NORMAL'; // 警戒狀態 (綠/黃/紅)
  public cautionTimer: number = 0;
  public reviveTimer: number = 0;

  // 小 Boss【鐵面總教官】專屬破盾與衝撞硬直機制
  public isBossStunned: boolean = false;
  public bossStunTimer: number = 0;
  public bossInvulnerableTimer: number = 0;
  public isBossInvulnerable: boolean = false;
  public bossChargeCooldown: number = 3.0; // 進入戰鬥後約 3 秒即可發動首次衝撞
  public isBossWindingUp: boolean = false;
  private bossMeleeTimer: number = 0; // 玩家持續貼身纏鬥的累計秒數 (超過門檻即後撤拉開距離後衝撞)
  private bossBackstepTimer: number = 0; // 後撤步剩餘時間 (結束後進入衝撞蓄力)
  private bossBackstepDir: THREE.Vector3 = new THREE.Vector3();
  private bossStunElapsed: number = 0; // 本次硬直已經過秒數 (驅動後仰與暈眩搖晃動畫)
  private bossRecoverTimer: number = 0; // 硬直結束後甩頭回神的剩餘時間
  private bossStunStars?: THREE.Group;
  public bossWindupTimer: number = 0;
  public bossIsCharging: boolean = false;
  public bossChargeTraveled: number = 0;
  public bossChargeMaxDist: number = 24.0;
  public bossChargeDir: THREE.Vector3 = new THREE.Vector3();
  public bossTelegraphGroup?: THREE.Group;
  private bossTelegraphMat?: THREE.MeshBasicMaterial;
  public bossBarrierMesh?: THREE.Mesh;

  // 單車衝撞擊飛與無敵幀 (避免持續性傷害)
  public isKnockedFlying: boolean = false;
  public knockVelocity: THREE.Vector3 = new THREE.Vector3();
  public hitCooldown: number = 0;
  public attackCooldown: number = 0; // 攻擊冷卻時間
  public freezeTimer: number = 0;   // 全校廣播定格發呆時間

  // 追捕動態節奏系統 (忽快忽慢：衝刺爆發期 vs 喘氣調息期，給玩家合理甩脫機會)
  public isBurstSprinting: boolean = true;
  private chasePacingTimer: number = 0;
  private dynamicSpeed: number = 5.0;

  public lostSightTimer: number = 0; // 失去玩家視線計時器
  public lastKnownPos: THREE.Vector3 = new THREE.Vector3(); // 玩家最後被目擊位置
  // 第二世界全域警戒 (由 DetentionMode 統一驅動)：本幀是否親眼看見玩家、是否處於全域搜捕 (ALERT/EVASION) 期間
  public seesPlayerNow: boolean = false;
  public detentionHuntActive: boolean = false;
  private searchAnchor: THREE.Vector3 = new THREE.Vector3(); // 搜索期間以最後目擊點為中心巡查

  // NPC 多樣性行為與移動風格系統
  public movementStyle: NPCMovementStyle = 'CASUAL_WALK';
  public currentIdleBehavior: NPCIdleBehavior = 'LOOK_AROUND';
  public isPaused: boolean = false;
  public pauseTimer: number = 0;
  public pauseAnimTimer: number = 0;
  public pauseChance: number = 0.55;
  public headMesh?: THREE.Mesh;

  private patrolWaypoints: THREE.Vector3[] = [];
  private currentWaypointIdx: number = 0;
  private stuckCheckTimer: number = 0;
  private lastRecordedPos: THREE.Vector3 = new THREE.Vector3();
  private animTimer: number = 0;
  private whistleCooldown: number = 0;
  private attackAnimTimer: number = 0;

  // 人型角色肢體
  private humanoidParts: THREE.Object3D[] = [];
  private leftArm?: THREE.Mesh;
  private rightArm?: THREE.Mesh;
  private leftLeg?: THREE.Mesh;
  private rightLeg?: THREE.Mesh;

  // 校犬肢體
  private dogFrontLeftLeg?: THREE.Object3D;
  private dogFrontRightLeg?: THREE.Object3D;
  private dogBackLeftLeg?: THREE.Object3D;
  private dogBackRightLeg?: THREE.Object3D;
  private dogTail?: THREE.Object3D;
  private dogHead?: THREE.Object3D;

  // 單車糾察隊與單車組件追蹤
  public isOriginalBikePatrol: boolean = false;
  // 第一世界學生服裝 (生成時隨機決定並保留，搶車/復活重建模型時維持同一套)：米白襯衫配深綠長褲制服，或藍紫色運動服
  private readonly studentOutfit: { shirt: number; pants: number } =
    Math.random() < 0.5 ? { shirt: 0xf3ead3, pants: 0x2f4a36 } : { shirt: 0x5a4fcf, pants: 0x4a3fb8 };
  // 被玩家搶走的自行車 (車主綁定)：復活後步行回到愛車旁牽回，避免憑空變出新車導致單車堆積
  public ownedBike: Bicycle | null = null;
  public isReclaimingBike: boolean = false;
  public wantsBikeReclaim: boolean = false; // 已抵達愛車 (或逾時)，由主迴圈移除路邊單車並恢復騎乘
  private reclaimTimer: number = 0;
  private bikeFrontWheel?: THREE.Mesh;
  private bikeRearWheel?: THREE.Mesh;
  private bikeParts: THREE.Object3D[] = [];
  private bikeModelParts: THREE.Object3D[] = []; // 騎車姿態模型全部零件 (單車 + 坐姿騎士)

  private hpBarGroup: THREE.Group;
  private hpBarBgMesh: THREE.Mesh;
  private hpBarMesh: THREE.Mesh;
  private koBadgeSprite: THREE.Sprite;
  // 頭頂告示牌畫布於首次繪製時才建立 (多數 NPC 從未倒地，省下每隻 256x64 畫布與貼圖記憶體)
  private koBadgeCanvas: HTMLCanvasElement | null = null;
  private koBadgeTexture: THREE.CanvasTexture | null = null;
  private lastKoBadgeSec: number = -1;
  private lastStatusBadgeKey: string = '';

  // 閃身步老師 (DODGE_TEACHER) 專屬宗師身法系統
  private lastColliders: CollidableBox[] = [];
  public isConversing: boolean = false;
  private isDodging: boolean = false;
  private dodgeTimer: number = 0;
  private dodgeDuration: number = 0.24;
  private dodgeSpeed: number = 8.0;
  private dodgeSideSign: number = 1;
  private dodgeDir: THREE.Vector3 = new THREE.Vector3();
  private afterimageSpawnTimer: number = 0;

  // 狗熊哆嗦毛 (連續瞬移 3 次，間隔 0.5s)
  private isBearShaking: boolean = false;
  private bearBlinkCount: number = 0;
  private bearBlinkTimer: number = 0;
  private bearOriginCenter: THREE.Vector3 = new THREE.Vector3();

  // 自主演練身法計時器 (每 8~14 秒演練一次)
  private dodgeTeacherPracticeTimer: number = 0;
  private dodgeTeacherNextPracticeTime: number = 10.0;

  // 0-GC 殘影物件池
  private afterimagePool?: AfterimagePool;

  // 下雨天撐傘與避雨行為
  public hasUmbrella: boolean = false;
  private umbrellaMesh?: THREE.Group;
  private rainChatTimer: number = 0;
  private rainChatNextTime: number = 6.0;
  private isDogSheltering: boolean = false;
  private originalDogWaypoints: THREE.Vector3[] = [];
  public static readonly DOG_SHELTER_POS = new THREE.Vector3(24.0, 0, 15.0);

  // 頭頂技能名稱對話氣泡 (3D Billboard Sprite)
  private skillBubble!: SkillBubble;

  // 目前角色的數值設定 (角色可於執行期切換，如單車巡邏被搶車後改為徒步)
  private get cfg(): NPCRoleConfig {
    return ROLE_CONFIG[this.role];
  }

  constructor(
    scene: THREE.Scene,
    startPos: THREE.Vector3,
    role: NPCRole,
    waypoints: THREE.Vector3[] = [],
    movementStyle?: NPCMovementStyle
  ) {
    this.position = startPos.clone();
    this.initialPosition = startPos.clone();
    this.baseFloorY = startPos.y; // 鎖定 NPC 所屬樓層高度基準
    this.role = role;
    this.patrolWaypoints = waypoints.length > 0 ? waypoints : [startPos.clone(), new THREE.Vector3(startPos.x + 8, startPos.y, startPos.z)];

    // 隨機速度自然微擾動 (+/- 0.25 m/s)，破除千篇一律的僵硬同速
    const speedJitter = (Math.random() - 0.5) * 0.5;

    // 初始化各角色數值與多樣性風格 (數值集中於 ROLE_CONFIG 設定表)
    const cfg = ROLE_CONFIG[role];
    this.maxHp = cfg.maxHp;
    this.attackPower = cfg.attackPower;
    this.attackRange = cfg.attackRange;
    if (cfg.defaultStyle === null) {
      // 平民學生 (多樣風格：散步、疾走、慢跑等)
      this.movementStyle = movementStyle || (Math.random() < 0.25 ? 'HURRIED_WALK' : 'CASUAL_WALK');
      const styleStats = STUDENT_STYLE_STATS[this.movementStyle];
      this.speed = styleStats.speed + speedJitter * styleStats.jitterScale;
      this.chaseSpeed = styleStats.chaseSpeed;
      this.pauseChance = styleStats.pauseChance;
    } else {
      this.movementStyle = cfg.styleFixed ? cfg.defaultStyle : (movementStyle || cfg.defaultStyle);
      this.speed = cfg.baseSpeed + speedJitter * cfg.jitterScale;
      this.chaseSpeed = cfg.chaseSpeed;
      this.pauseChance = cfg.pauseChance;
    }
    this.hp = this.maxHp;
    this.chasePacingTimer = 1.5 + Math.random() * 2.0;
    this.dynamicSpeed = this.speed;

    // 下雨天隨身攜帶雨傘機率 (平民學生與師長約 75% 攜傘，25% 無傘；少年院特訓群不持傘)
    if (cfg.canCarryUmbrella) {
      this.hasUmbrella = Math.random() < 0.75;
    }

    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ';
    this.mesh.position.copy(this.position);
    this.skillBubble = new SkillBubble(this.mesh, 2.45, NPC_BUBBLE_STYLE);

    // 依角色建造不同 3D 外觀模型
    if (cfg.isCanine) {
      this.buildDogModel();
    } else if (role === 'BIKE_PATROL') {
      this.isOriginalBikePatrol = true;
      this.buildBikePatrolModel();
      // 記錄騎士身體(軀幹/頭/帽/臂/腿)與單車全部子物件，被搶車時一併移除
      this.bikeModelParts = this.mesh.children.slice();
    } else if (role === 'BANDIT') {
      this.buildBanditModel();
    } else {
      this.buildHumanoidModel();
      if (role === 'DETENTION_BOSS') {
        this.bossTelegraphGroup = this.buildBossTelegraphMesh();
        this.mesh.add(this.bossTelegraphGroup);

        const barrierGeo = new THREE.SphereGeometry(1.35, 16, 12);
        const barrierMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.38,
          wireframe: true,
          depthWrite: false
        });
        this.bossBarrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
        this.bossBarrierMesh.position.set(0, 1.05, 0);
        this.bossBarrierMesh.visible = false;
        this.mesh.add(this.bossBarrierMesh);
      }
    }

    // 頭頂 3D 浮動血條與昏迷倒數告示牌組 (面朝攝影機視角，清晰易辨)
    const hpY = cfg.hpBarY;
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, hpY, 0);

    // 1. 血條深色底襯框 (全體 NPC 共用幾何體與材質)
    const hpRes = getHpBarResources();
    this.hpBarBgMesh = new THREE.Mesh(hpRes.bgGeo, hpRes.bgMat);
    this.hpBarGroup.add(this.hpBarBgMesh);

    // 2. 綠色/黃色/紅色動態血條 (錨點設在左側，縮放時從左向右展開；狀態色以切換共用材質呈現)
    this.hpBarMesh = new THREE.Mesh(hpRes.barGeo, getHpBarMaterial(0x2ecc71));
    this.hpBarMesh.position.set(-0.40, 0, 0.01);
    this.hpBarGroup.add(this.hpBarMesh);

    // 3. 昏睡倒地狀態告示牌 (CanvasTexture 呈現動態倒數秒數)
    // 尚未繪製前以全透明呈現，首次繪製時才掛上畫布貼圖
    const spriteMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false });
    this.koBadgeSprite = new THREE.Sprite(spriteMat);
    this.koBadgeSprite.scale.set(1.4, 0.35, 1);
    this.koBadgeSprite.position.set(0, 0.28, 0);
    this.koBadgeSprite.visible = false;
    this.hpBarGroup.add(this.koBadgeSprite);

    this.mesh.add(this.hpBarGroup);

    scene.add(this.mesh);
    // 閃身步老師 (DODGE_TEACHER) 專屬技能對話氣泡與 0-GC 殘影物件池
    if (this.role === 'DODGE_TEACHER') {
      this.skillBubble.ensure();
      // 初始化 8 組常駐殘影物件池 (0-GC，常駐場景)
      this.afterimagePool = new AfterimagePool(scene, 8);
    }
  }

  // 取得頭頂告示牌繪圖環境 (首次呼叫時建立畫布與貼圖並掛上 Sprite)
  private getBadgeContext(): CanvasRenderingContext2D | null {
    if (!this.koBadgeCanvas) {
      this.koBadgeCanvas = document.createElement('canvas');
      this.koBadgeCanvas.width = 256;
      this.koBadgeCanvas.height = 64;
      this.koBadgeTexture = new THREE.CanvasTexture(this.koBadgeCanvas);
      const mat = this.koBadgeSprite.material;
      mat.map = this.koBadgeTexture;
      mat.opacity = 1;
      mat.needsUpdate = true;
    }
    return this.koBadgeCanvas.getContext('2d');
  }

  // 更新昏迷休養倒數秒數告示牌 (加入 lastKoBadgeSec 快取節流，僅在秒數變更時重繪)
  private updateKOBadge(secondsLeft: number) {
    if (this.isPermanentlyKnockedOut) {
      if (this.lastKoBadgeSec === -999) return;
      this.lastKoBadgeSec = -999;
      const ctx = this.getBadgeContext();
      if (!ctx) return;
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
      ctx.beginPath();
      ctx.roundRect(8, 4, 240, 56, 12);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💫 永久擊昏', 128, 32);
      this.koBadgeTexture!.needsUpdate = true;
      this.koBadgeSprite.visible = true;
      return;
    }

    const sec = Math.ceil(Math.max(0, secondsLeft));
    if (sec === this.lastKoBadgeSec) return;
    this.lastKoBadgeSec = sec;

    const ctx = this.getBadgeContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 64);

    // 繪製圓角半透明漸層紅色徽章
    ctx.fillStyle = 'rgba(231, 76, 60, 0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`💫 昏迷中 (${sec}s)`, 128, 32);

    this.koBadgeTexture!.needsUpdate = true;
  }

  // 顯示自定義頭頂動態文字徽章 (如金鐘護體、破盾硬直等)
  public showStatusBadge(text: string, bgColor: string = 'rgba(234, 88, 12, 0.95)', borderColor: string = '#fde047') {
    // 內容未變且仍在顯示中則略過重繪 (護盾倒數每幀呼叫，只在文字變動時重繪畫布並上傳貼圖)
    const key = text + bgColor + borderColor;
    if (this.lastKoBadgeSec === -105 && this.lastStatusBadgeKey === key && this.koBadgeSprite.visible) return;
    const ctx = this.getBadgeContext();
    if (!ctx) return;
    this.lastKoBadgeSec = -105;
    this.lastStatusBadgeKey = key;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(8, 4, 240, 56, 12);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    this.koBadgeTexture!.needsUpdate = true;
    this.koBadgeSprite.visible = true;
  }

  // 隱藏頭頂動態文字徽章
  public hideStatusBadge() {
    this.koBadgeSprite.visible = false;
    this.lastKoBadgeSec = -1;
  }

  // 設定 MGS 警戒狀態並更新頭頂懸浮圖示 (❓ / ❗)
  public setAlertState(state: 'NORMAL' | 'CAUTION' | 'ALERT') {
    if (this.isKnockedDown || this.isPermanentlyKnockedOut) return;
    this.alertState = state;
    const ctx = this.getBadgeContext();
    if (!ctx) return;

    if (state === 'NORMAL') {
      this.koBadgeSprite.visible = false;
      this.lastKoBadgeSec = -1;
    } else if (state === 'CAUTION') {
      this.lastKoBadgeSec = -101;
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
      ctx.beginPath();
      ctx.roundRect(50, 4, 156, 56, 14);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❓', 128, 32);
      this.koBadgeTexture!.needsUpdate = true;
      this.koBadgeSprite.visible = true;
    } else if (state === 'ALERT') {
      this.lastKoBadgeSec = -102;
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.beginPath();
      ctx.roundRect(50, 4, 156, 56, 14);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❗', 128, 32);
      this.koBadgeTexture!.needsUpdate = true;
      this.koBadgeSprite.visible = true;
    }
  }

  // 潛行背後暗殺擊昏 (從 NPC 背後盲區發動，永久擊昏癱瘓不重生)
  public knockoutSilently() {
    this.hp = 0;
    this.isKnockedDown = true;
    this.isPermanentlyKnockedOut = true;
    this.reviveTimer = 999999;
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.alertState = 'NORMAL';
    this.isBossWindingUp = false;
    this.bossIsCharging = false;
    if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;

    if (this.hpBarBgMesh) this.hpBarBgMesh.visible = false;
    if (this.hpBarMesh) this.hpBarMesh.visible = false;
    if (this.umbrellaMesh) this.umbrellaMesh.visible = false;

    this.updateKOBadge(999999);

    // 肢體鬆開平貼地面
    if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
    if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);

    if (this.cfg.isCanine) {
      this.mesh.rotation.set(0, this.rotationY, Math.PI / 2);
      this.mesh.position.y = this.baseFloorY + 0.2;
    } else {
      this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
      this.mesh.position.y = this.baseFloorY + 0.25;
    }
  }

  // 總教官撞柱硬直機制 (Stunned)
  private static readonly BOSS_BACKSTEP_TIME = 0.35;
  private static readonly BOSS_BACKSTEP_SPEED = 7.0;
  private static readonly BOSS_CHARGE_SPEED = 14.0;
  private static readonly BOSS_CHARGE_RADIUS = 0.65;
  private static readonly BOSS_SUBSTEP = 0.3;

  // 鎖定當前玩家方向進入 1.25 秒蓄力預警 (玩家可於預警期間側向閃躲)
  private startBossWindup(playerPos: THREE.Vector3) {
    this.bossChargeDir.subVectors(playerPos, this.position).setY(0);
    if (this.bossChargeDir.lengthSq() < 0.0001) this.bossChargeDir.set(Math.sin(this.rotationY), 0, Math.cos(this.rotationY));
    this.bossChargeDir.normalize();
    this.isBossWindingUp = true;
    this.bossWindupTimer = 1.25;
    this.bossChargeCooldown = 7.5;
    this.bossMeleeTimer = 0;
    this.rotationY = Math.atan2(this.bossChargeDir.x, this.bossChargeDir.z);
    this.mesh.rotation.y = this.rotationY;
    if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = true;
    soundManager.playWhistle();
  }

  // 總教官身體 (腳底 +0.3 ~ +1.9m) 於 (x, z) 是否撞上阻擋物；起點已重疊的碰撞盒忽略 (允許自行脫離)
  private bossBodyBlockedAt(colliders: CollidableBox[], x: number, z: number, startX: number, startZ: number): boolean {
    const r = NPC.BOSS_CHARGE_RADIUS;
    const y = this.position.y;
    const near = queryColliders(colliders, Math.min(x, startX) - r, Math.max(x, startX) + r, Math.min(z, startZ) - r, Math.max(z, startZ) + r, _bossNear);
    for (let i = 0; i < near.length; i++) {
      const box = near[i];
      if (box.isFloorOnly) continue;
      if (!(y + 0.3 < box.max.y && y + 1.9 > box.min.y)) continue;
      if (x + r <= box.min.x || x - r >= box.max.x || z + r <= box.min.z || z - r >= box.max.z) continue;
      if (startX + r > box.min.x && startX - r < box.max.x && startZ + r > box.min.z && startZ - r < box.max.z) continue;
      return true;
    }
    return false;
  }

  // 沿 dir 以 ≤0.3m 子步移動 dist，撞到阻擋物時停在貼齊接觸面處；回傳是否撞上
  private moveBossSwept(colliders: CollidableBox[], dir: THREE.Vector3, dist: number): boolean {
    const steps = Math.max(1, Math.ceil(dist / NPC.BOSS_SUBSTEP));
    const stepLen = dist / steps;
    for (let i = 0; i < steps; i++) {
      const sx = this.position.x;
      const sz = this.position.z;
      const tx = sx + dir.x * stepLen;
      const tz = sz + dir.z * stepLen;
      if (!this.bossBodyBlockedAt(colliders, tx, tz, sx, sz)) {
        this.position.x = tx;
        this.position.z = tz;
        continue;
      }
      // 二分逼近接觸點，停在貼齊阻擋面 (不嵌入牆體)
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * 0.5;
        if (this.bossBodyBlockedAt(colliders, sx + (tx - sx) * mid, sz + (tz - sz) * mid, sx, sz)) hi = mid;
        else lo = mid;
      }
      this.position.x = sx + (tx - sx) * lo;
      this.position.z = sz + (tz - sz) * lo;
      return true;
    }
    return false;
  }

  // 頭頂 3 顆環繞旋轉的暈眩星星 (首次硬直時才建立)
  private getStunStars(): THREE.Group {
    if (!this.bossStunStars) {
      if (!_stunStarGeo) _stunStarGeo = new THREE.OctahedronGeometry(0.11, 0);
      if (!_stunStarMat) _stunStarMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      const stars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const star = new THREE.Mesh(_stunStarGeo, _stunStarMat);
        const ang = (i / 3) * Math.PI * 2;
        star.position.set(Math.cos(ang) * 0.42, 0, Math.sin(ang) * 0.42);
        star.userData.shared = true;
        stars.add(star);
      }
      stars.position.set(0, 2.2, 0);
      stars.visible = false;
      this.mesh.add(stars);
      this.bossStunStars = stars;
    }
    return this.bossStunStars;
  }

  // 硬直期間姿勢：撞擊瞬間後仰，之後身體與頭部畫圓暈眩搖晃、雙臂下垂 (原地凍結不移動)
  private applyBossStunPose() {
    const t = this.bossStunElapsed;
    const lean = Math.max(0, 1 - t / 0.25);
    const wobble = 1 - lean;
    this.mesh.rotation.set(
      -0.42 * lean + Math.sin(t * 3.2) * 0.12 * wobble,
      this.rotationY,
      Math.cos(t * 3.2) * 0.12 * wobble
    );
    if (this.headMesh) this.headMesh.rotation.set(Math.sin(t * 3.2 + 1.2) * 0.18, 0, Math.cos(t * 3.2 + 1.2) * 0.25);
    if (this.leftArm) this.leftArm.rotation.set(0.15 + Math.sin(t * 3.2) * 0.08, 0, 0.12);
    if (this.rightArm) this.rightArm.rotation.set(0.15 - Math.sin(t * 3.2) * 0.08, 0, -0.12);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
    if (this.bossStunStars) this.bossStunStars.rotation.y = t * 5.0;
  }

  public stunBoss(duration: number = 3.5) {
    if (this.role !== 'DETENTION_BOSS' || this.isKnockedDown) return;
    this.isBossStunned = true;
    this.bossStunTimer = duration;
    this.bossStunElapsed = 0;
    this.bossRecoverTimer = 0;
    this.bossBackstepTimer = 0;
    this.isBossWindingUp = false;
    this.bossIsCharging = false;
    this.isChasing = false;
    this.isPaused = false;
    if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;
    this.getStunStars().visible = true;

    // 顯示硬直星星
    const ctx = this.getBadgeContext();
    if (ctx) {
      this.lastKoBadgeSec = -103;
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.95)';
      ctx.beginPath();
      ctx.roundRect(8, 4, 240, 56, 12);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ 破盾硬直！快繞背！', 128, 32);
      this.koBadgeTexture!.needsUpdate = true;
      this.koBadgeSprite.visible = true;
    }
  }

  // 1. 建造校犬柴柴 / 特訓狼犬 3D 模型
  private buildDogModel() {
    const isWolf = this.role === 'DETENTION_WOLF';
    if (isWolf) {
      this.mesh.scale.set(1.15, 1.15, 1.15);
    }

    // 經典配色材質 (柴犬: 暖金棕配奶白 / 特訓狼犬: 鐵甲黑背毛配棕褐)
    const bodyColor = isWolf ? 0x222831 : 0xc87a32;
    const underColor = isWolf ? 0x8b5a2b : 0xfff6ea;
    const collarColor = isWolf ? 0xc0392b : 0xe74c3c;

    const shibaTanMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const shibaWhiteMat = new THREE.MeshLambertMaterial({ color: underColor });
    const noseBlackMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const innerEarMat = new THREE.MeshLambertMaterial({ color: isWolf ? 0x5a3e2b : 0xf5d5c5 });
    const collarMat = new THREE.MeshLambertMaterial({ color: collarColor });
    const goldMat = new THREE.MeshLambertMaterial({ color: isWolf ? 0x95a5a6 : 0xf1c40f });
    const eyeMat = new THREE.MeshBasicMaterial({ color: isWolf ? 0xf1c40f : 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // A. 身體主幹 (背部金棕毛色)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.44, 0.88), shibaTanMat);
    body.position.set(0, 0.45, 0);
    body.castShadow = true;
    this.mesh.add(body);

    // B. 胸前大片裏白毛 (Urajiro Chest Bib)
    const chestBib = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.24), shibaWhiteMat);
    chestBib.position.set(0, 0.43, 0.36);
    this.mesh.add(chestBib);

    // C. 腹部白色毛皮 (White Underbelly)
    const bellyWhite = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.60), shibaWhiteMat);
    bellyWhite.position.set(0, 0.25, -0.05);
    this.mesh.add(bellyWhite);

    // D. 狗頭部 (Shiba Inu Head)
    this.dogHead = new THREE.Group();
    this.dogHead.position.set(0, 0.65, 0.48);
    this.mesh.add(this.dogHead);

    const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.38, 0.44), shibaTanMat);
    headBase.castShadow = true;
    this.dogHead.add(headBase);

    // 柴柴圓鼓鼓的白腮幫子 (Urajiro White Cheeks)
    const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.26), shibaWhiteMat);
    cheekL.position.set(-0.17, -0.06, 0.10);
    this.dogHead.add(cheekL);

    const cheekR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.26), shibaWhiteMat);
    cheekR.position.set(0.17, -0.06, 0.10);
    this.dogHead.add(cheekR);

    // 柴犬口鼻部 (White Muzzle)
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.19, 0.26), shibaWhiteMat);
    snout.position.set(0, -0.08, 0.32);
    snout.castShadow = true;
    this.dogHead.add(snout);

    // 黑鼻頭 (Black Nose Button)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.06), noseBlackMat);
    nose.position.set(0, 0.065, 0.12);
    snout.add(nose);

    // 經典黑嘴角線
    const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.04), noseBlackMat);
    mouthLine.position.set(0, -0.04, 0.12);
    snout.add(mouthLine);

    // 柴犬標誌性白麻糬眉毛 (Iconic White Dot Eyebrows)
    const browGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const browL = new THREE.Mesh(browGeo, shibaWhiteMat);
    browL.position.set(-0.10, 0.15, 0.22);
    browL.scale.set(1.2, 0.8, 0.4);
    this.dogHead.add(browL);

    const browR = new THREE.Mesh(browGeo, shibaWhiteMat);
    browR.position.set(0.10, 0.15, 0.22);
    browR.scale.set(1.2, 0.8, 0.4);
    this.dogHead.add(browR);

    // 柴柴黑亮眼睛 (Eyes with White Specular)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    eyeL.position.set(-0.12, 0.07, 0.22);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat);
    pupilL.position.set(0, 0, 0.025);
    eyeL.add(pupilL);
    this.dogHead.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    eyeR.position.set(0.12, 0.07, 0.22);
    const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat);
    pupilR.position.set(0, 0, 0.025);
    eyeR.add(pupilR);
    this.dogHead.add(eyeR);

    // 柴犬直立三角形萌耳 (Erect Shiba Ears with Inner Lining)
    const earLGroup = new THREE.Group();
    earLGroup.position.set(-0.16, 0.24, -0.04);
    earLGroup.rotation.z = -0.25;
    const earLOuter = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), shibaTanMat);
    earLOuter.rotation.y = Math.PI / 4;
    earLGroup.add(earLOuter);
    const earLInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), innerEarMat);
    earLInner.position.set(0, -0.01, 0.02);
    earLInner.rotation.y = Math.PI / 4;
    earLGroup.add(earLInner);
    this.dogHead.add(earLGroup);

    const earRGroup = new THREE.Group();
    earRGroup.position.set(0.16, 0.24, -0.04);
    earRGroup.rotation.z = 0.25;
    const earROuter = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), shibaTanMat);
    earROuter.rotation.y = Math.PI / 4;
    earRGroup.add(earROuter);
    const earRInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), innerEarMat);
    earRInner.position.set(0, -0.01, 0.02);
    earRInner.rotation.y = Math.PI / 4;
    earRGroup.add(earRInner);
    this.dogHead.add(earRGroup);

    // E. 日式紅色項圈與金色鈴鐺 (Red Collar & Gold Bell)
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.44), collarMat);
    collar.position.set(0, 0.52, 0.35);
    this.mesh.add(collar);

    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), goldMat);
    bell.position.set(0, 0.46, 0.58);
    this.mesh.add(bell);

    // F. 柴犬經典高翹甜甜圈捲尾巴 (Iconic Curled Sickle Tail)
    this.dogTail = new THREE.Group();
    this.dogTail.position.set(0, 0.62, -0.42);
    this.mesh.add(this.dogTail);

    const tailTorus = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 16, Math.PI * 1.3), shibaTanMat);
    tailTorus.rotation.y = Math.PI / 2;
    tailTorus.rotation.x = 0.3;
    tailTorus.position.set(0, 0.14, -0.05);
    tailTorus.castShadow = true;
    this.dogTail.add(tailTorus);

    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), shibaWhiteMat);
    tailTip.position.set(0, 0.24, 0.08);
    this.dogTail.add(tailTip);

    // G. 四隻腳：上截金棕、下截白襪子爪爪 (White Socks Shiba Legs)
    const createShibaLeg = (x: number, z: number): THREE.Group => {
      const legGroup = new THREE.Group();
      legGroup.position.set(x, 0.38, z); // 旋轉關節軸設在 Y = 0.38m

      // 上截腿部 (Tan Upper Leg)
      const upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), shibaTanMat);
      upperLeg.position.set(0, -0.11, 0);
      upperLeg.castShadow = true;
      legGroup.add(upperLeg);

      // 下截白襪子小爪子 (White Socks Paws)
      const whiteSock = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.16, 0.142), shibaWhiteMat);
      whiteSock.position.set(0, -0.30, 0);
      whiteSock.castShadow = true;
      legGroup.add(whiteSock);

      this.mesh.add(legGroup);
      return legGroup;
    };

    this.dogFrontLeftLeg = createShibaLeg(-0.18, 0.32);
    this.dogFrontRightLeg = createShibaLeg(0.18, 0.32);
    this.dogBackLeftLeg = createShibaLeg(-0.18, -0.32);
    this.dogBackRightLeg = createShibaLeg(0.18, -0.32);

    // 烘焙合併：頭、尾、四腿各自保留動畫關節，其餘身體零件合併為單一靜態網格 (同品種共用幾何體)
    const animatedParts: THREE.Object3D[] = [
      this.dogHead, this.dogTail,
      this.dogFrontLeftLeg, this.dogFrontRightLeg, this.dogBackLeftLeg, this.dogBackRightLeg
    ];
    bakeNode(this.dogHead, `${this.role}|head`);
    bakeNode(this.dogTail, `${this.role}|tail`);
    for (let i = 2; i < animatedParts.length; i++) bakeNode(animatedParts[i], `${this.role}|leg`);
    bakeStaticParts(this.mesh, this.mesh.children.filter(c => !animatedParts.includes(c)), `${this.role}|body`);
  }

  // 2. 建造騎單車糾察隊 3D 模型
  private buildBikePatrolModel() {
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const rubberMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const shirtMat = new THREE.MeshLambertMaterial({ color: this.studentOutfit.shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: this.studentOutfit.pants });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xfad390 });
    const armBandMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });

    // 單車前後輪
    const wheelGeo = new THREE.TorusGeometry(0.38, 0.045, 8, 20);
    this.bikeRearWheel = new THREE.Mesh(wheelGeo, rubberMat);
    this.bikeRearWheel.position.set(0, 0.38, -0.75);
    this.mesh.add(this.bikeRearWheel);

    this.bikeFrontWheel = new THREE.Mesh(wheelGeo, rubberMat);
    this.bikeFrontWheel.position.set(0, 0.38, 0.75);
    this.mesh.add(this.bikeFrontWheel);

    // 車架
    const frameTube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8), frameMat);
    frameTube.rotation.x = Math.PI / 2;
    frameTube.position.set(0, 0.65, 0);
    this.mesh.add(frameTube);

    // 龍頭車把
    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.05), frameMat);
    handlebar.position.set(0, 0.95, 0.65);
    this.mesh.add(handlebar);

    // 糾察隊員 (騎坐在車上)
    const riderTorso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirtMat);
    riderTorso.position.set(0, 1.15, -0.15);
    riderTorso.rotation.x = 0.25;
    this.mesh.add(riderTorso);

    // 紅色值星臂章
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), armBandMat);
    band.position.set(-0.35, 1.3, -0.15);
    this.mesh.add(band);

    // 頭部
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 0.35), skinMat);
    head.position.set(0, 1.62, 0.0);
    this.mesh.add(head);
    this.headMesh = head;

    // 帽子 (糾察隊白便帽)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.44), shirtMat);
    cap.position.set(0, 1.82, 0.04);
    this.mesh.add(cap);

    // 騎車手臂伸向前把手
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.65, 6), shirtMat);
    armL.position.set(-0.25, 1.05, 0.25);
    armL.rotation.x = 0.75;
    this.mesh.add(armL);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.65, 6), shirtMat);
    armR.position.set(0.25, 1.05, 0.25);
    armR.rotation.x = 0.75;
    this.mesh.add(armR);

    // 彎曲雙腿踩在腳踏板
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), pantsMat);
    legL.position.set(-0.2, 0.65, -0.1);
    legL.rotation.x = 0.5;
    this.mesh.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), pantsMat);
    legR.position.set(0.2, 0.65, -0.1);
    legR.rotation.x = 0.5;
    this.mesh.add(legR);

    // 烘焙合併：前後輪 (會轉動) 與頭部 (會轉頭) 保留，車架與坐姿騎士合併為單一靜態網格
    const outfitKey = `${this.studentOutfit.shirt}|${this.studentOutfit.pants}`;
    bakeNode(this.bikeRearWheel, 'BIKE_PATROL|wheel');
    bakeNode(this.bikeFrontWheel, 'BIKE_PATROL|wheel');
    bakeNode(head, 'BIKE_PATROL|head');
    const staticParts = [frameTube, handlebar, riderTorso, band, cap, armL, armR, legL, legR];
    const body = bakeStaticParts(this.mesh, staticParts, `BIKE_PATROL|${outfitKey}|body`);
    this.bikeParts = [this.bikeRearWheel, this.bikeFrontWheel, body];
  }

  // 3. 建造普通人型 NPC 3D 模型 (生教、步巡糾察、普通學生)
  private buildHumanoidModel() {
    this.humanoidParts = [];
    const addHumanoidPart = (part: THREE.Object3D) => {
      this.mesh.add(part);
      this.humanoidParts.push(part);
    };

    // 學生、糾察隊、單車巡邏同學 (徒步) 預設穿著學生服裝
    let shirtColor = this.studentOutfit.shirt;
    let pantsColor = this.studentOutfit.pants;

    if (this.role === 'TEACHER') {
      shirtColor = 0x2c3e50;
      pantsColor = 0x34495e;
    } else if (this.role === 'INSTRUCTOR') {
      // 教官卡其色軍訓制服
      shirtColor = 0xbeb698;
      pantsColor = 0x82775c;
    } else if (this.role === 'PE_TEACHER_BOSS') {
      // 大如老師：熱血深紅運動夾克與黑色運動長褲
      shirtColor = 0xc0392b;
      pantsColor = 0x2c3e50;
    } else if (this.role === 'DODGE_TEACHER') {
      // 閃身步老師：神秘深紫武術長袍配墨黑勁裝
      shirtColor = 0x582c87;
      pantsColor = 0x1e272e;
    } else if (this.role === 'DETENTION_GUARD') {
      // 特訓教官：高對比海軍藍警備制服與深灰長褲
      shirtColor = 0x2980b9;
      pantsColor = 0x34495e;
    } else if (this.role === 'DETENTION_SENIOR') {
      // 特訓資深學長：高可視度亮橘運動背心與休閒淺灰運動褲
      shirtColor = 0xe67e22;
      pantsColor = 0x718093;
    } else if (this.role === 'DETENTION_HEAVY') {
      // 重訓霸榜生：石墨炭灰重訓背心與深海軍藍短褲
      shirtColor = 0x485460;
      pantsColor = 0x2c3e50;
    } else if (this.role === 'DETENTION_BOSS') {
      // 鐵面總長：威嚴深海軍藍金邊將官大衣
      shirtColor = 0x2c3a47;
      pantsColor = 0x1e272e;
    }

    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xfad390 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // 軀幹
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.35), shirtMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    addHumanoidPart(torso);

    // 角色專屬配飾 (臂章、反光背心、裁判哨)
    if (this.role === 'INSPECTOR') {
      const armBandMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), armBandMat);
      band.position.set(-0.45, 1.25, 0);
      addHumanoidPart(band);
    } else if (this.role === 'TEACHER') {
      // 生教組長螢光背心
      const vestMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.7, 0.38), vestMat);
      vest.position.y = 1.05;
      addHumanoidPart(vest);
    } else if (this.role === 'PE_TEACHER_BOSS') {
      // 體育組長胸前裁判金屬哨子與白色運動條紋
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.36), stripeMat);
      stripeL.position.set(-0.25, 1.05, 0);
      addHumanoidPart(stripeL);
      const stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.36), stripeMat);
      stripeR.position.set(0.25, 1.05, 0);
      addHumanoidPart(stripeR);

      const whistleMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.85, roughness: 0.2 });
      const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), whistleMat);
      whistle.position.set(0, 1.22, 0.2);
      addHumanoidPart(whistle);
    } else if (this.role === 'DODGE_TEACHER') {
      // 閃身步老師：金色太極武術腰帶與身法束髮帶
      const sashMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.38), sashMat);
      sash.position.y = 0.72;
      addHumanoidPart(sash);

      const headBandMat = new THREE.MeshLambertMaterial({ color: 0xf5f6fa });
      const headBand = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), headBandMat);
      headBand.position.y = 1.76;
      addHumanoidPart(headBand);
    } else if (this.role === 'DETENTION_HEAVY') {
      // 重訓霸榜生：粗獷體格與深褐牛皮健美舉重腰帶
      torso.scale.set(1.28, 1.05, 1.25);
      const beltMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.42), beltMat);
      belt.position.y = 0.75;
      addHumanoidPart(belt);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.44), new THREE.MeshLambertMaterial({ color: 0xbdc3c7 }));
      buckle.position.set(0, 0.75, 0);
      addHumanoidPart(buckle);
    } else if (this.role === 'DETENTION_BOSS') {
      // 鐵面總長：金色將官肩章與金屬哨鍊
      const epL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.38), new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
      epL.position.set(-0.35, 1.44, 0);
      addHumanoidPart(epL);
      const epR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.38), new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
      epR.position.set(0.35, 1.44, 0);
      addHumanoidPart(epR);

      const bWhistle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0xdcdde1 }));
      bWhistle.position.set(0, 1.25, 0.2);
      addHumanoidPart(bWhistle);
    }

    // 第二世界特訓院人形角色 (教官、資深學長、霸榜生、總教官)：
    // 正面配備戰術防彈插板與發光巡邏手電筒 (前向光錐)，背面配備戰術大背包與無線電天線，徹底解決「分不出正面背面」問題
    const isDetentionHuman = (
      this.role === 'DETENTION_GUARD' ||
      this.role === 'DETENTION_SENIOR' ||
      this.role === 'DETENTION_HEAVY' ||
      this.role === 'DETENTION_BOSS'
    );

    if (isDetentionHuman) {
      // 1. 【正面 +Z 標誌】：戰術防彈胸板與金屬扣鎖
      const vestMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
      const vestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.06), vestMat);
      vestPlate.position.set(0, 0.04, 0.185);
      torso.add(vestPlate);

      const buckleMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
      const bL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.07), buckleMat);
      bL.position.set(-0.16, 0.14, 0.19);
      const bR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.07), buckleMat);
      bR.position.set(0.16, 0.14, 0.19);
      torso.add(bL, bR);

      // 2. 【正面 +Z 戰術手電筒與前向光錐】：一眼看清巡邏視線朝向！
      const torchGroup = new THREE.Group();
      const torchBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      torchBody.rotation.x = Math.PI / 2;
      torchGroup.add(torchBody);

      const lensMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
      const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), lensMat);
      torchLens.position.set(0, 0, 0.081);
      torchGroup.add(torchLens);

      // 前向柔和半透明光錐 (朝向正面 +Z，遠距離或背對時均清晰可見視野朝向)
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfffae0,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
      });
      const beamGeo = new THREE.ConeGeometry(0.48, 2.8, 8, 1, true);
      beamGeo.rotateX(-Math.PI / 2);
      beamGeo.translate(0, 0, 1.4);
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      torchGroup.add(beamMesh);

      torchGroup.position.set(0.20, 0.16, 0.19);
      torso.add(torchGroup);

      // 3. 【背面 -Z 標誌】：戰術作戰背包與無線電鞭狀天線 (背面絕無視線特徵)
      const packMat = new THREE.MeshLambertMaterial({ color: 0x151b22 });
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.54, 0.16), packMat);
      pack.position.set(0, 0.02, -0.22);
      torso.add(pack);

      const antennaMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.60, 6), antennaMat);
      antenna.position.set(0.20, 0.40, -0.20);
      antenna.rotation.x = -0.15;
      torso.add(antenna);
    }

    // 頭部
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    addHumanoidPart(head);
    this.headMesh = head;

    // 眼睛與五官 (正面 +Z 方向專屬標記)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), eyeMat);
    eyeL.position.set(-0.09, 0.03, 0.20);
    head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), eyeMat);
    eyeR.position.set(0.09, 0.03, 0.20);
    head.add(eyeR);

    if (this.role === 'PE_TEACHER_BOSS') {
      // 大如老師：熱血濃眉 (加強羽球教練神韻)
      const browMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const browL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), browMat);
      browL.position.set(-0.09, 0.068, 0.202);
      browL.rotation.z = -0.15;
      head.add(browL);

      const browR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), browMat);
      browR.position.set(0.09, 0.068, 0.202);
      browR.rotation.z = 0.15;
      head.add(browR);

      // 大如老師：專屬招牌喜感立體蓬鬆爆炸頭 (Afro) 與運動吸汗頭帶
      const afro = this.buildAfroHair();
      head.add(afro);
    } else {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), hairMat);
      hair.position.set(0, 0.16, 0);
      head.add(hair);
    }

    // 教官大盤帽 (Military Cap)
    if (this.role === 'INSTRUCTOR') {
      const capMat = new THREE.MeshLambertMaterial({ color: 0x6e6650 });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.12, 12), capMat);
      cap.position.set(0, 0.25, 0);
      head.add(cap);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      visor.position.set(0, 0.21, 0.14);
      head.add(visor);
    } else if (this.role === 'DETENTION_GUARD') {
      // 特訓教官防暴貝雷帽
      const beret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.22, 0.12, 12),
        new THREE.MeshLambertMaterial({ color: 0x11161d })
      );
      beret.position.set(0, 0.24, 0);
      head.add(beret);

      // 正面戰術防暴護目鏡 (亮琥珀金夜視感測光條，正面一眼可見)
      const goggleMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
      const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.06), goggleMat);
      goggles.position.set(0, 0.04, 0.20);
      head.add(goggles);
      const sensorMat = new THREE.MeshBasicMaterial({ color: 0xf39c12 });
      const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.07), sensorMat);
      sensor.position.set(0, 0.04, 0.20);
      head.add(sensor);
    } else if (this.role === 'DETENTION_SENIOR') {
      // 資深學長：正面運動吸汗頭帶
      const headBandMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const headBand = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.08, 0.40), headBandMat);
      headBand.position.set(0, 0.14, 0);
      head.add(headBand);
    } else if (this.role === 'DETENTION_BOSS') {
      // 鐵面總長大盤帽與金徽章、金屬鐵面遮面
      const bCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.22, 0.14, 12),
        new THREE.MeshLambertMaterial({ color: 0x11161d })
      );
      bCap.position.set(0, 0.26, 0);
      head.add(bCap);

      const bVisor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.03, 0.18),
        new THREE.MeshLambertMaterial({ color: 0x050505 })
      );
      bVisor.position.set(0, 0.22, 0.16);
      bVisor.rotation.x = 0.2;
      head.add(bVisor);

      const bBadge = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.02),
        new THREE.MeshLambertMaterial({ color: 0xf1c40f })
      );
      bBadge.position.set(0, 0.28, 0.22);
      head.add(bBadge);

      const bossMask = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.12, 0.15),
        new THREE.MeshLambertMaterial({ color: 0x7f8c8d })
      );
      bossMask.position.set(0, 0.04, 0.18);
      head.add(bossMask);
    }

    // 手腳
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    this.leftArm = new THREE.Mesh(armGeo, shirtMat);
    this.leftArm.position.set(-0.45, 1.05, 0);
    addHumanoidPart(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, shirtMat);
    this.rightArm.position.set(0.45, 1.05, 0);
    addHumanoidPart(this.rightArm);

    // 重訓霸榜生增粗手臂
    if (this.role === 'DETENTION_HEAVY') {
      this.leftArm.scale.set(1.3, 1.0, 1.3);
      this.rightArm.scale.set(1.3, 1.0, 1.3);
    }

    // 特訓教官手持防暴海綿盾 (左手) 與防暴警棍 (右手)
    if (this.role === 'DETENTION_GUARD') {
      const shieldMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.52), shieldMat);
      shield.position.set(-0.1, -0.05, 0.22);
      this.leftArm.add(shield);

      const shieldStripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.53), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
      shieldStripe.position.set(-0.1, -0.05, 0.22);
      this.leftArm.add(shieldStripe);

      const baton = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      baton.position.set(0, -0.22, 0.15);
      this.rightArm.add(baton);
    }

    // 體育老師專屬羽球拍 3D 裝備 (Attached to right arm)
    if (this.role === 'PE_TEACHER_BOSS') {
      const racketGroup = new THREE.Group();
      // 握把 (Grip)
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      grip.position.y = 0.12;
      racketGroup.add(grip);
      // 中桿 (Shaft)
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8),
        new THREE.MeshLambertMaterial({ color: 0x2d3436 })
      );
      shaft.position.y = 0.45;
      racketGroup.add(shaft);
      // 拍框 (Frame)
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.016, 8, 16),
        new THREE.MeshLambertMaterial({ color: 0xe74c3c })
      );
      frame.position.y = 0.82;
      racketGroup.add(frame);
      // 拍線網面 (Strings)
      const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
      const strings = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), stringMat);
      strings.position.y = 0.82;
      racketGroup.add(strings);

      racketGroup.position.set(0, -0.28, 0.12);
      racketGroup.rotation.x = Math.PI / 3; // 正角度朝向前方+Z
      this.rightArm.add(racketGroup);
    }

    // 下雨天 3D Low-Poly 雨傘裝備 (Attached to right arm)
    if (this.hasUmbrella) {
      this.umbrellaMesh = this.buildUmbrellaModel();
      this.umbrellaMesh.position.set(0, -0.28, 0.10);
      this.umbrellaMesh.rotation.set(Math.PI * 0.65, -0.12, 0.12);
      this.rightArm.add(this.umbrellaMesh);
    }

    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.18, 0.35, 0);
    addHumanoidPart(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.18, 0.35, 0);
    addHumanoidPart(this.rightLeg);

    // 烘焙合併：頭與四肢保留各自動畫關節 (手持裝備併入手臂、雨傘保留可切換顯示)，
    // 軀幹與配飾合併為單一靜態網格；同角色同服裝的 NPC 共用同一份幾何體
    const lookKey = `${this.role}|${shirtColor}|${pantsColor}`;
    const umbrella = this.umbrellaMesh;
    bakeNode(head, `${lookKey}|head`);
    bakeNode(this.leftArm, `${lookKey}|armL`);
    bakeNode(this.rightArm, `${lookKey}|armR`, obj => obj === umbrella);
    bakeNode(this.leftLeg, `${lookKey}|leg`);
    bakeNode(this.rightLeg, `${lookKey}|leg`);
    const animated: THREE.Object3D[] = [head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg];
    const body = bakeStaticParts(this.mesh, this.humanoidParts.filter(p => !animated.includes(p)), `${lookKey}|body`);
    this.humanoidParts = [body, ...animated];
  }

  // 建造大如老師專屬 3D 經典蓬鬆喜感爆炸頭 (Afro) 與運動吸汗頭帶
  private buildAfroHair(): THREE.Group {
    const afro = new THREE.Group();
    afro.name = 'daru_afro_hair';

    // 爆炸頭深色捲髮材質 (flatShading 突顯多面體蓬鬆捲曲質感與光影立體層次)
    const afroMat = new THREE.MeshLambertMaterial({
      color: 0x161311,
      flatShading: true
    });
    const afroMatHighlight = new THREE.MeshLambertMaterial({
      color: 0x241d1a,
      flatShading: true
    });

    // 爆炸頭多組交疊微偏的十二面體叢集，打造立體飽滿、圓潤且富有喜感的蓬鬆輪廓
    const puffDefs: Array<{
      x: number;
      y: number;
      z: number;
      r: number;
      detail?: number;
      highlight?: boolean;
      scale?: [number, number, number];
    }> = [
      // 1. 核心大髮量基座
      { x: 0, y: 0.20, z: -0.04, r: 0.28, detail: 1, scale: [1.12, 0.98, 1.08] },

      // 2. 頂部高聳髮冠 (Crown / Top dome)
      { x: 0, y: 0.36, z: -0.05, r: 0.21, detail: 1 },
      { x: -0.14, y: 0.33, z: -0.03, r: 0.19, detail: 1 },
      { x: 0.14, y: 0.33, z: -0.03, r: 0.19, detail: 1 },
      { x: 0, y: 0.33, z: 0.09, r: 0.17, detail: 1, highlight: true },
      { x: 0, y: 0.30, z: -0.19, r: 0.19, detail: 1 },
      { x: -0.12, y: 0.35, z: 0.05, r: 0.16, detail: 1 },
      { x: 0.12, y: 0.35, z: 0.05, r: 0.16, detail: 1 },
      { x: -0.11, y: 0.32, z: -0.15, r: 0.17, detail: 1 },
      { x: 0.11, y: 0.32, z: -0.15, r: 0.17, detail: 1 },

      // 3. 左側蓬鬆外擴 (Left Afro flank)
      { x: -0.26, y: 0.22, z: -0.04, r: 0.21, detail: 1 },
      { x: -0.29, y: 0.12, z: -0.06, r: 0.20, detail: 1, highlight: true },
      { x: -0.24, y: 0.01, z: -0.06, r: 0.16, detail: 1 },
      { x: -0.23, y: 0.18, z: 0.08, r: 0.17, detail: 1 },
      { x: -0.23, y: 0.18, z: -0.18, r: 0.18, detail: 1 },
      { x: -0.25, y: 0.07, z: 0.06, r: 0.15, detail: 1 },
      { x: -0.25, y: 0.06, z: -0.16, r: 0.16, detail: 1 },

      // 4. 右側蓬鬆外擴 (Right Afro flank)
      { x: 0.26, y: 0.22, z: -0.04, r: 0.21, detail: 1 },
      { x: 0.29, y: 0.12, z: -0.06, r: 0.20, detail: 1, highlight: true },
      { x: 0.24, y: 0.01, z: -0.06, r: 0.16, detail: 1 },
      { x: 0.23, y: 0.18, z: 0.08, r: 0.17, detail: 1 },
      { x: 0.23, y: 0.18, z: -0.18, r: 0.18, detail: 1 },
      { x: 0.25, y: 0.07, z: 0.06, r: 0.15, detail: 1 },
      { x: 0.25, y: 0.06, z: -0.16, r: 0.16, detail: 1 },

      // 5. 後腦勺與頸後濃密包覆 (Rear skull & nape)
      { x: 0, y: 0.22, z: -0.23, r: 0.22, detail: 1 },
      { x: 0, y: 0.11, z: -0.24, r: 0.21, detail: 1 },
      { x: -0.14, y: 0.11, z: -0.21, r: 0.19, detail: 1 },
      { x: 0.14, y: 0.11, z: -0.21, r: 0.19, detail: 1 },
      { x: 0, y: -0.01, z: -0.21, r: 0.16, detail: 1 },
      { x: -0.11, y: 0.00, z: -0.19, r: 0.15, detail: 1 },
      { x: 0.11, y: 0.00, z: -0.19, r: 0.15, detail: 1 },

      // 6. 前額瀏海與鬢角自然包覆 (Forehead & temple, 不遮擋眼睛)
      { x: 0, y: 0.22, z: 0.15, r: 0.15, detail: 1 },
      { x: -0.13, y: 0.19, z: 0.15, r: 0.14, detail: 1, highlight: true },
      { x: 0.13, y: 0.19, z: 0.15, r: 0.14, detail: 1, highlight: true },
      { x: -0.19, y: 0.10, z: 0.12, r: 0.13, detail: 1 },
      { x: 0.19, y: 0.10, z: 0.12, r: 0.13, detail: 1 },

      // 7. 外圍俏皮捲髮微突顆粒 (Accent curls / Textured perimeter frizz)
      { x: -0.33, y: 0.25, z: -0.02, r: 0.11, detail: 0, highlight: true },
      { x: 0.33, y: 0.25, z: -0.02, r: 0.11, detail: 0, highlight: true },
      { x: 0, y: 0.44, z: -0.04, r: 0.12, detail: 0, highlight: true },
      { x: -0.17, y: 0.41, z: -0.05, r: 0.10, detail: 0 },
      { x: 0.17, y: 0.41, z: -0.05, r: 0.10, detail: 0 },
      { x: -0.24, y: 0.33, z: 0.08, r: 0.10, detail: 0 },
      { x: 0.24, y: 0.33, z: 0.08, r: 0.10, detail: 0 },
      { x: 0, y: 0.39, z: 0.12, r: 0.10, detail: 0, highlight: true },
      { x: 0, y: 0.35, z: -0.23, r: 0.11, detail: 0 },
      { x: -0.20, y: 0.23, z: -0.22, r: 0.11, detail: 0 },
      { x: 0.20, y: 0.23, z: -0.22, r: 0.11, detail: 0 },
      { x: -0.32, y: 0.06, z: -0.07, r: 0.10, detail: 0 },
      { x: 0.32, y: 0.06, z: -0.07, r: 0.10, detail: 0 },
    ];

    // 依材質將數十顆髮球烘焙合併為 2 個 Mesh (深色髮量 + 高光髮束)，大幅減少 Draw Call
    const baseGeos: THREE.BufferGeometry[] = [];
    const highlightGeos: THREE.BufferGeometry[] = [];
    for (const p of puffDefs) {
      const geo = new THREE.DodecahedronGeometry(p.r, p.detail ?? 1);
      if (p.scale) {
        geo.scale(p.scale[0], p.scale[1], p.scale[2]);
      }
      geo.translate(p.x, p.y, p.z);
      (p.highlight ? highlightGeos : baseGeos).push(geo);
    }
    for (const [geos, mat] of [[baseGeos, afroMat], [highlightGeos, afroMatHighlight]] as const) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      afro.add(mesh);
    }

    // 8. 體育老師專屬經典運動吸汗頭帶 (Retro PE Sweatband)
    const bandMat = new THREE.MeshLambertMaterial({ color: 0xf8f9fa });
    const sweatband = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.06, 0.40), bandMat);
    sweatband.position.set(0, 0.115, 0);
    sweatband.castShadow = true;
    afro.add(sweatband);

    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc0392b }); // 呼應紅色運動外套
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.406, 0.02, 0.406), stripeMat);
    stripe.position.set(0, 0.115, 0);
    afro.add(stripe);

    // 正面額前金牌羽球標章 (Gold Sports Emblem)
    const emblem = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.015),
      new THREE.MeshLambertMaterial({ color: 0xf1c40f })
    );
    emblem.position.set(0, 0.115, 0.205);
    afro.add(emblem);

    // 9. 喜感羽球教練彩蛋：插在爆炸頭側邊的羽毛球髮飾 (Badminton Shuttlecock tucked in afro)
    const shuttlePin = new THREE.Group();
    shuttlePin.name = 'afro_shuttlecock';
    shuttlePin.position.set(0.31, 0.28, 0.06);
    shuttlePin.rotation.set(-0.25, 0.2, -Math.PI / 4.2);

    // 球頭 (軟木塞底座)
    const corkMat = new THREE.MeshLambertMaterial({ color: 0xdfe4ea });
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), corkMat);
    cork.position.set(0, -0.035, 0);
    cork.castShadow = true;
    shuttlePin.add(cork);

    // 軟木塞紅膠帶
    const tape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.027, 0.027, 0.009, 8),
      new THREE.MeshBasicMaterial({ color: 0xe74c3c })
    );
    tape.position.set(0, -0.025, 0);
    shuttlePin.add(tape);

    // 羽毛裙身
    const featherMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const skirt = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.07, 8, 1, true),
      featherMat
    );
    skirt.position.set(0, 0.015, 0);
    skirt.rotation.x = Math.PI;
    skirt.castShadow = true;
    shuttlePin.add(skirt);

    afro.add(shuttlePin);

    return afro;
  }

  // 建造總教官狂暴衝撞 3D 地面紅色危險預警軌跡線 (Telegraph Danger Corridor)
  private buildBossTelegraphMesh(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'boss_telegraph';
    group.visible = false;

    // 地面警示紅毯 (2.4m 寬，22.0m 長，自腳下向前方 +Z 延伸)
    const planeGeo = new THREE.PlaneGeometry(2.4, 22.0);
    planeGeo.rotateX(-Math.PI / 2);
    planeGeo.translate(0, 0.02, 11.0);

    this.bossTelegraphMat = new THREE.MeshBasicMaterial({
      color: 0xff1744,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const groundPlane = new THREE.Mesh(planeGeo, this.bossTelegraphMat);
    group.add(groundPlane);

    // 左右兩側發光紅霓虹導軌邊界 (Left & Right Glowing Laser Rails)
    const railMat = new THREE.MeshBasicMaterial({ color: 0xff3838, depthWrite: false });
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 22.0), railMat);
    leftRail.position.set(-1.2, 0.03, 11.0);
    group.add(leftRail);

    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 22.0), railMat);
    rightRail.position.set(1.2, 0.03, 11.0);
    group.add(rightRail);

    // 衝撞前進動態導向箭頭 (Forward Chevrons >>>)
    const chevronMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    for (let i = 1; i <= 6; i++) {
      const zPos = i * 3.4;
      // V 字型人字箭頭
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.95), chevronMat);
      armL.position.set(-0.35, 0.035, zPos);
      armL.rotation.y = Math.PI / 4;
      group.add(armL);

      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.95), chevronMat);
      armR.position.set(0.35, 0.035, zPos);
      armR.rotation.y = -Math.PI / 4;
      group.add(armR);
    }

    // 衝撞落點危險警示橫桿 (End Impact Danger Barrier)
    const endBarMat = new THREE.MeshBasicMaterial({ color: 0xff0033, depthWrite: false });
    const endBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.4), endBarMat);
    endBar.position.set(0, 0.035, 22.0);
    group.add(endBar);

    // 腳底起點警示條
    const startBarMat = new THREE.MeshBasicMaterial({ color: 0xffd32a, depthWrite: false });
    const startBar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.25), startBarMat);
    startBar.position.set(0, 0.035, 0.35);
    group.add(startBar);

    return group;
  }

  // 建造 3D Low-Poly 雨傘模型 (傘中棒、握把、10 角多邊傘面、頂端金屬針)
  private buildUmbrellaModel(): THREE.Group {
    // 隨機豐富傘面顏色 (8 款經典色調：黑、海軍藍、黃、紅、綠、紫、珊瑚粉、雅灰)
    const umbrellaColors = [
      0x1e272e, // 紳士墨黑
      0x1e3799, // 皇家海軍藍
      0xf6b93b, // 活力亮黃
      0xe55039, // 熱情朱紅
      0x079992, // 森林翡翠綠
      0x6a0dad, // 優雅薰衣紫
      0xff6b6b, // 珊瑚粉橘
      0x7f8c8d  // 簡約雅灰
    ];
    const canopyColor = umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)];

    const umbrella = buildUmbrella({
      name: 'umbrella',
      canopyColor,
      shaftMetalness: 0.6,
      handleColor: 0x111111,
      tipMetalness: 0.8,
      rigX: -0.16,
      rigZ: -0.06
    });
    // 同色雨傘共用合併幾何體 (傘柄/傘骨/傘面/尖端合併)
    bakeNode(umbrella, `umbrella|${canopyColor}`);
    return umbrella;
  }

  // 建造校外強盜 3D 外觀 (蒙面黑衣、手持鋼刀/砍刀)
  private buildBanditModel() {
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xdfb48c });
    const maskMat = new THREE.MeshLambertMaterial({ color: 0x1e272e }); // 黑面罩
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x2f3542 }); // 黑灰夾克
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1e272e }); // 黑色長褲
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.85, roughness: 0.2 });
    const hiltMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 });

    // 軀幹
    const bodyGeo = new THREE.BoxGeometry(0.64, 0.75, 0.34);
    const body = new THREE.Mesh(bodyGeo, shirtMat);
    body.position.y = 1.05;
    body.castShadow = true;
    this.mesh.add(body);

    // 頭部與蒙面頭套
    const headGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    this.mesh.add(head);
    this.headMesh = head;

    // 黑色蒙面布 (覆蓋口鼻)
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.22, 0.39), maskMat);
    mask.position.set(0, 1.54, 0.01);
    this.mesh.add(mask);

    // 兇惡紅瞳眼神
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), eyeMat);
    eyeL.position.set(-0.09, 1.67, 0.20);
    this.mesh.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), eyeMat);
    eyeR.position.set(0.09, 1.67, 0.20);
    this.mesh.add(eyeR);

    // 肢體
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
    this.leftArm = new THREE.Mesh(armGeo, shirtMat);
    this.leftArm.position.set(-0.44, 1.05, 0);
    this.mesh.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, shirtMat);
    this.rightArm.position.set(0.44, 1.05, 0);
    this.mesh.add(this.rightArm);

    // 右手手持砍刀武器 (Machete)
    const macheteGroup = new THREE.Group();
    macheteGroup.position.set(0, -0.32, 0.15);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), hiltMat);
    hilt.rotation.x = Math.PI / 2;
    macheteGroup.add(hilt);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.65, 0.12), steelMat);
    blade.position.set(0, 0.32, 0.12);
    blade.rotation.x = 0.2;
    blade.castShadow = true;
    macheteGroup.add(blade);
    this.rightArm.add(macheteGroup);

    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.18, 0.35, 0);
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.18, 0.35, 0);
    this.mesh.add(this.rightLeg);

    // 烘焙合併：頭與四肢保留動畫關節 (砍刀併入右臂)，軀幹、面罩與紅瞳合併為靜態網格
    bakeNode(head, 'BANDIT|head');
    bakeNode(this.leftArm, 'BANDIT|armL');
    bakeNode(this.rightArm, 'BANDIT|armR');
    bakeNode(this.leftLeg, 'BANDIT|leg');
    bakeNode(this.rightLeg, 'BANDIT|leg');
    const animated: THREE.Object3D[] = [head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg];
    bakeStaticParts(this.mesh, this.mesh.children.filter(c => !animated.includes(c)), 'BANDIT|body');
  }

  public getRoleTitle(): string {
    switch (this.role) {
      case 'DODGE_TEACHER': return '閃身步老師';
      case 'PE_TEACHER_BOSS': return '大如老師';
      case 'BANDIT': return '校外強盜';
      case 'TEACHER': return '巡堂老師';
      case 'INSTRUCTOR': return '主任教官';
      case 'DOG': return '校犬柴柴';
      case 'BIKE_PATROL': return '火柴人自行車騎士';
      case 'INSPECTOR': return '風紀糾察';
      case 'DETENTION_GUARD': return '特訓院守衛';
      case 'DETENTION_SENIOR': return '特訓資深守衛';
      case 'DETENTION_HEAVY': return '特訓重裝守衛';
      case 'DETENTION_WOLF': return '特訓警戒犬';
      case 'DETENTION_BOSS': return '特訓總教官';
      case 'STUDENT': default: return '同學';
    }
  }

  // 第二世界 BOSS 被暗殺後專用倒地癱瘓 (倒地癱瘓 duration 秒，不能動，時間到後起身，不回滿血)
  public knockdownBoss(duration: number = 2.0) {
    if (this.role !== 'DETENTION_BOSS') return;
    this.isKnockedDown = true;
    this.isPermanentlyKnockedOut = false;
    this.reviveTimer = duration;
    this.isBossStunned = true;
    this.bossStunTimer = duration;
    this.bossRecoverTimer = 0;
    this.bossBackstepTimer = 0;
    if (this.bossStunStars) this.bossStunStars.visible = false;
    this.bossIsCharging = false;
    this.isBossWindingUp = false;
    this.bossWindupTimer = 0;
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.dynamicSpeed = this.speed;

    if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
    if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);

    // 倒地姿勢與擊昏圖示
    this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
    this.mesh.position.y = this.baseFloorY + 0.25;
    if (this.koBadgeSprite) {
      this.koBadgeSprite.visible = true;
      this.updateKOBadge(this.reviveTimer);
    }
  }

  // 更新血條比例與顏色
  public updateHpBar() {
    if (!this.hpBarMesh) return;
    const ratio = Math.max(0.01, this.hp / this.maxHp);
    this.hpBarMesh.scale.x = ratio;
    if (ratio < 0.35) {
      this.hpBarMesh.material = getHpBarMaterial(0xe74c3c);
    } else if (ratio < 0.65) {
      this.hpBarMesh.material = getHpBarMaterial(0xf39c12);
    } else {
      this.hpBarMesh.material = getHpBarMaterial(0x2ecc71);
    }
  }

  // 總教官被暗殺/草堆伏擊扣血專用 (精確扣除指定血量並更新血條，不觸發閃身步免傷)
  public applyAssassinationDamage(amount: number = 100): boolean {
    if (this.isKnockedDown || this.isPermanentlyKnockedOut) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.updateHpBar();
    soundManager.playPunch();

    if (this.hp <= 0) {
      this.isKnockedDown = true;
      this.isPermanentlyKnockedOut = true;
      if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
      this.isChasing = false;
      this.isBurstSprinting = false;
      this.dynamicSpeed = this.speed;
      if (this.hpBarBgMesh) this.hpBarBgMesh.visible = false;
      if (this.hpBarMesh) this.hpBarMesh.visible = false;
      if (this.koBadgeSprite) this.koBadgeSprite.visible = true;
      if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
      if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
      if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
      if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
      this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
      this.mesh.position.y = this.baseFloorY + 0.25;
      return true; // 擊倒KO
    }
    return false;
  }

  // 受到傷害
  public takeDamage(amount: number): boolean {
    if (this.isKnockedDown || this.isPermanentlyKnockedOut) return false;
    if (this.isBossInvulnerable) {
      soundManager.playBanditSlash();
      return false; // 金鐘護盾無敵期間免疫一切正面攻擊
    }
    if (this.isPaused) this.cancelPause();
    if (this.role === 'DODGE_TEACHER') {
      if (this.isDodging || this.isBearShaking) return false;
      // 閃身步老師受擊防衛：50% 機率隨機施展「閃身步」或「狗熊哆嗦毛」
      if (Math.random() < 0.5) {
        this.performFlashStep();
      } else {
        this.performBearShake(this.lastColliders);
      }
      return false;
    } else if (this.role === 'DETENTION_GUARD') {
      // 特訓教官防暴海綿盾格擋：免傷 35%，吹哨冷卻拉長至 12 秒且低血量才吹哨
      amount = Math.max(1, Math.round(amount * 0.65));
      soundManager.playBanditSlash();
      if (this.hp < this.maxHp * 0.40 && this.whistleCooldown <= 0) {
        soundManager.playWhistle();
        this.whistleCooldown = 12.0;
      }
    } else if (this.role === 'DETENTION_BOSS') {
      // 鐵面總長受擊：20% 機率施展「閃身步」避開攻擊，反擊前搖留有公平反應間隔
      if (!this.isDodging && Math.random() < 0.20) {
        this.performFlashStep();
        this.attackCooldown = 0.65;
        return false;
      }
      if (this.hp < this.maxHp * 0.35 && this.whistleCooldown <= 0) {
        soundManager.playWhistle();
        this.whistleCooldown = 16.0;
      }
    }

    this.hp = Math.max(0, this.hp - amount);
    soundManager.playPunch();

    // 更新血條比例
    const ratio = Math.max(0.01, this.hp / this.maxHp);
    this.hpBarMesh.scale.x = ratio;
    if (ratio < 0.35) {
      this.hpBarMesh.material = getHpBarMaterial(0xe74c3c);
    } else if (ratio < 0.65) {
      this.hpBarMesh.material = getHpBarMaterial(0xf39c12);
    } else {
      this.hpBarMesh.material = getHpBarMaterial(0x2ecc71);
    }

    // 血量歸零：倒地倒下，碰撞箱全面失效 (第二世界永久擊昏不重生)
    if (this.hp <= 0) {
      this.isKnockedDown = true;
      if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
      this.isChasing = false;
      this.isBurstSprinting = false;
      this.dynamicSpeed = this.speed;

      const isDetention = this.cfg.isDetention;
      if (isDetention) {
        this.isPermanentlyKnockedOut = true;
        this.reviveTimer = 999999;
        this.updateKOBadge(999999);
      } else {
        this.reviveTimer = 10.0;
        this.lastKoBadgeSec = -1;
        this.updateKOBadge(10.0);
      }
      this.hpBarBgMesh.visible = false;
      this.hpBarMesh.visible = false;
      this.koBadgeSprite.visible = true;

      // 肢體鬆開平貼地面
      if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
      if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
      if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
      if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);

      // 倒地姿勢與高度 (依所在樓層基準貼地)
      if (this.role === 'DOG' || this.role === 'BIKE_PATROL') {
        this.mesh.rotation.set(0, this.rotationY, Math.PI / 2);
        this.mesh.position.y = this.baseFloorY + 0.2;
      } else {
        this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
        this.mesh.position.y = this.baseFloorY + 0.25;
      }
      return true;
    }

    return false;
  }

  // 單車衝撞與武器擊飛效果
  public launchFlying(impactDir: THREE.Vector3, force: number, damage: number): boolean {
    if (this.isKnockedDown || this.isPermanentlyKnockedOut) return false;
    if (this.role === 'DODGE_TEACHER') {
      if (this.isDodging || this.isBearShaking) return false;
      // 閃身步老師衝撞防衛：50% 機率隨機施展「閃身步」或「狗熊哆嗦毛」
      if (Math.random() < 0.5) {
        this.performFlashStep();
      } else {
        this.performBearShake(this.lastColliders);
      }
      return false;
    }
    if (this.hitCooldown > 0) return false;
    this.hitCooldown = 0.65; // 0.65秒受擊保護

    const wasKnockedDown = this.takeDamage(damage);
    if (!this.isKnockedDown && this.hp > 0) {
      this.isChasing = true; // 存活時被撞激怒追擊
    } else {
      this.isChasing = false;
    }

    // 重訓霸榜生高血量霸體：半血以上免疫衝撞擊飛，低於半血後可被擊退
    if (this.role === 'DETENTION_HEAVY' && this.hp > this.maxHp * 0.5) {
      this.isKnockedFlying = false;
      return wasKnockedDown;
    }

    // 計算擊飛拋物線：向上拋射 + 合理水平擊飛 (受物理阻擋，絕不飛越圍牆或穿透建物)
    this.isKnockedFlying = true;
    const horizontalForce = Math.min(Math.max(force * 1.1, 3.0), 16.5);
    const verticalForce = Math.min(Math.max(force * 0.6, 2.0), 10.5);

    this.knockVelocity.set(
      impactDir.x * horizontalForce,
      verticalForce,
      impactDir.z * horizontalForce
    );

    return wasKnockedDown;
  }

  // 觸發攻擊動作動畫 (近戰出拳、狗咬、單車衝撞、強盜劈砍、羽球拍扣殺)
  public triggerAttackAnimation() {
    this.attackAnimTimer = 0.35;
    if (this.cfg.isCanine) {
      soundManager.playDogBark();
    } else if (this.role === 'BIKE_PATROL') {
      soundManager.playBicycleBell();
    } else if (this.role === 'BANDIT' || this.role === 'DETENTION_GUARD') {
      soundManager.playBanditSlash();
    } else if (this.role === 'PE_TEACHER_BOSS') {
      soundManager.playBadmintonWhoosh();
    } else {
      soundManager.playPunch();
    }
  }

  // 獲取各角色攻擊傷害與擊飛衝量規格 (0-GC，查表常數快取)
  public getAttackSpecs(): AttackSpec {
    return _ATTACK_SPECS[this.role] || _DEFAULT_ATTACK_SPEC;
  }

  // 失去自行車 (遭到玩家搶奪，妥善卸除並釋放單車零件與幾何體)
  public loseBike() {
    if (this.isPaused) this.cancelPause();
    for (let i = 0; i < this.bikeParts.length; i++) {
      this.mesh.remove(this.bikeParts[i]);
    }
    this.bikeParts.length = 0;
    // 移除坐姿騎士身體與單車 (共用的烘焙幾何體與材質由快取持有，不釋放)
    for (const part of this.bikeModelParts) {
      this.mesh.remove(part);
      disposeNonShared(part);
    }
    this.bikeModelParts.length = 0;
    this.bikeFrontWheel = undefined;
    this.bikeRearWheel = undefined;
    this.role = 'STUDENT';
    // 重建站立步行人形模型，並還原姿態
    this.buildHumanoidModel();
    this.position.y = this.baseFloorY;
    this.isKnockedFlying = false;
    this.knockVelocity.set(0, 0, 0);
    this.mesh.rotation.set(0, this.rotationY, 0);
    this.mesh.position.set(this.position.x, this.baseFloorY, this.position.z);
    this.dynamicSpeed = 5.0;
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.attackAnimTimer = 0;
    this.maxHp = 112;
    this.hp = Math.min(this.hp, this.maxHp);
    this.speed = 5.0;
    this.chaseSpeed = 10.0;
    this.isKnockedDown = true;
    this.reviveTimer = 3.0;
  }

  // 牽回被搶的愛車：抵達車旁時站到車子位置與車頭朝向後恢復騎乘；逾時則原地恢復，避免瞬移到無法抵達處 (路邊單車實體由主迴圈移除)
  public completeBikeReclaim() {
    const bike = this.ownedBike;
    if (bike && this.position.distanceToSquared(bike.position) < 2.25) {
      this.position.x = bike.position.x;
      this.position.z = bike.position.z;
      this.rotationY = bike.rotationY;
    }
    this.clearOwnedBike();
    this.restoreBikePatrol();
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
  }

  // 解除車主綁定 (愛車被牽回或被超量回收)
  public clearOwnedBike() {
    this.ownedBike = null;
    this.isReclaimingBike = false;
    this.wantsBikeReclaim = false;
    this.reclaimTimer = 0;
  }

  // 恢復騎乘單車巡邏狀態 (復活時還原為單車巡邏同學)
  public restoreBikePatrol() {
    // 從 this.mesh 移除步行人形零件 (僅釋放非共用資源，共用烘焙幾何體與材質由快取持有)
    for (const part of this.humanoidParts) {
      this.mesh.remove(part);
      disposeNonShared(part);
    }
    this.umbrellaMesh = undefined;
    this.humanoidParts.length = 0;
    this.leftArm = undefined;
    this.rightArm = undefined;
    this.leftLeg = undefined;
    this.rightLeg = undefined;

    // 設定角色為 BIKE_PATROL 並重新組裝模型
    this.role = 'BIKE_PATROL';
    this.buildBikePatrolModel();
    this.bikeModelParts = this.mesh.children.filter(c => c !== this.hpBarGroup && c !== this.koBadgeSprite);

    // 恢復火柴人自行車巡邏數值 (速度統一為 15.0)
    this.maxHp = 225;
    this.hp = 225;
    this.speed = 15.0;
    this.chaseSpeed = 15.0;
    this.attackPower = 26;
    this.dynamicSpeed = 15.0;
    this.attackRange = 2.4;

    // 旋轉與姿勢回正
    this.mesh.rotation.set(0, this.rotationY, 0);
    this.mesh.position.y = this.baseFloorY;

    // 播放清脆自行車鈴聲
    soundManager.playBicycleBell();
  }

  // 建立標準 3D 羽球模型 (共享幾何體與材質 + 物件池復用 0-GC)
  public static createShuttlecockMesh(): THREE.Group {
    if (_shuttlecockPool.length > 0) {
      const pooled = _shuttlecockPool.pop()!;
      pooled.visible = true;
      return pooled;
    }
    const group = new THREE.Group();

    // 1. 軟木塞球頭 (Cork Head)
    const cork = new THREE.Mesh(_shuttleCorkGeo, _shuttleCorkMat);
    cork.castShadow = true;
    group.add(cork);

    // 2. 軟木塞與羽毛交界處飾條
    const band = new THREE.Mesh(_shuttleBandGeo, _shuttleBandMat);
    group.add(band);

    // 3. 16 根向後外張漏斗錐台羽毛裙
    const skirt = new THREE.Mesh(_shuttleSkirtGeo, _shuttleSkirtMat);
    skirt.castShadow = true;
    group.add(skirt);

    // 4. 羽毛裙羽線固定箍環
    const thread1 = new THREE.Mesh(_shuttleThread1Geo, _shuttleThreadMat);
    group.add(thread1);
    const thread2 = new THREE.Mesh(_shuttleThread2Geo, _shuttleThreadMat);
    group.add(thread2);

    return group;
  }

  // 羽球投射物專屬安全銷毀處置 (0-GC 回收至物件池)
  public static disposeProjectile(projectile: ShuttlecockProjectile, scene?: THREE.Scene) {
    if (scene) {
      scene.remove(projectile.mesh);
    } else if (projectile.mesh.parent) {
      projectile.mesh.parent.remove(projectile.mesh);
    }
    projectile.mesh.visible = false;
    if (!_shuttlecockPool.includes(projectile.mesh)) {
      _shuttlecockPool.push(projectile.mesh);
    }
  }

  // 羽球教練發射羽球 (羽球小遊戲：飛行速度、變速扣殺與過網弧線可自訂，0-GC)
  public tryShootShuttlecock(
    targetPos: THREE.Vector3,
    scene: THREE.Scene,
    cooldown: number = 2.2,
    customSpeed: number = 11.5,
    customArc: number = 0.8
  ): ShuttlecockProjectile | null {
    if (this.role !== 'PE_TEACHER_BOSS' || this.isKnockedDown || this.hp <= 0) return null;
    if (this.shuttlecockCooldown > 0) return null;

    // 嚴格限制：羽球目標必須在 4F 羽球場內部 (Y: 11.2 ~ 17.0, X: 63.0 ~ 85.0, Z: 23.0 ~ 53.0)
    if (
      targetPos.y < 11.2 || targetPos.y > 17.0 ||
      targetPos.x < 63.0 || targetPos.x > 85.0 ||
      targetPos.z < 23.0 || targetPos.z > 53.0
    ) {
      return null;
    }

    const distSq = this.position.distanceToSquared(targetPos);
    if (distSq < 6.25 || distSq > 484.0) return null; // 2.5m ~ 22.0m

    this.shuttlecockCooldown = cooldown; // 發球間隔
    soundManager.playBadmintonWhoosh();
    this.triggerAttackAnimation();

    // 建立/復用標準羽球 3D 模型 (共享幾何體與材質，徹底避免反覆創建洩漏 0-GC)
    const group = NPC.createShuttlecockMesh();

    const startPos = new THREE.Vector3(this.position.x, this.position.y + 1.35, this.position.z);
    group.position.copy(startPos);

    // 羽球飛行速度與向上拋物線弧線動態運算 (純純量運算，0 暫存 Vector3 分配)
    const toTargetX = targetPos.x - startPos.x;
    const toTargetY = (targetPos.y + 0.9) - startPos.y;
    const toTargetZ = targetPos.z - startPos.z;
    const horizDist = Math.max(2.0, Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ));
    const speed = customSpeed;
    const flightTime = horizDist / speed;

    const velX = toTargetX / flightTime;
    const velZ = toTargetZ / flightTime;
    // 確保羽球初始具有充足向上拋物線弧度，絕對越過 Y=13.55m 球網，杜絕觸網
    const velY = (toTargetY / flightTime) + 0.5 * 9.8 * flightTime + Math.max(1.8, customArc);

    const vel = new THREE.Vector3(velX, velY, velZ);

    // 飛行朝向初始化：球頭始終朝向初速度飛行方向，羽毛裙拖在後方
    _npcLookTarget.copy(startPos).add(vel);
    group.lookAt(_npcLookTarget);

    scene.add(group);

    return {
      mesh: group,
      position: startPos,
      velocity: vel,
      life: 3.5,
      hasHitOrMissed: false,
      isReturned: false
    };
  }

  // 進入待機/發呆模式 (0-GC，隨機選取符合角色設定的多樣化行為)
  public enterPauseState() {
    this.isPaused = true;
    this.pauseAnimTimer = 0;

    if (this.cfg.isCanine) {
      if (this.role === 'DETENTION_WOLF') {
        // 特訓狼犬：定點警戒嗅聞 4.5 秒 (充足靜止暗殺空檔)
        this.currentIdleBehavior = 'DOG_SNIFF';
        this.pauseTimer = 4.5;
      } else {
        this.currentIdleBehavior = Math.random() < 0.6 ? 'DOG_SNIFF' : 'DOG_SIT';
        this.pauseTimer = this.currentIdleBehavior === 'DOG_SNIFF'
          ? (3.0 + Math.random() * 2.5)
          : (4.0 + Math.random() * 3.0);
      }
    } else if (this.cfg.isDetention) {
      // 特訓院哨兵守衛：100% 固定立正環顧警戒，固定 4.5 秒 (Boss 5.0 秒)，背後暴露充足靜止暗殺空檔
      this.currentIdleBehavior = 'LOOK_AROUND';
      this.pauseTimer = this.role === 'DETENTION_BOSS' ? 5.0 : 4.5;
    } else if (this.role === 'BIKE_PATROL') {
      this.currentIdleBehavior = 'LOOK_AROUND';
      this.pauseTimer = 2.0 + Math.random() * 2.0;
    } else if (this.role === 'BANDIT') {
      this.currentIdleBehavior = Math.random() < 0.7 ? 'LOOK_AROUND' : 'PHONE';
      this.pauseTimer = 2.5 + Math.random() * 2.5;
    } else if (
      this.role === 'TEACHER' ||
      this.role === 'INSTRUCTOR' ||
      this.role === 'INSPECTOR' ||
      this.role === 'DODGE_TEACHER' ||
      this.role === 'PE_TEACHER_BOSS'
    ) {
      const roll = Math.random();
      if (roll < 0.55) {
        this.currentIdleBehavior = 'HANDS_BEHIND_BACK';
        this.pauseTimer = 3.5 + Math.random() * 2.5;
      } else if (roll < 0.85) {
        this.currentIdleBehavior = 'LOOK_AROUND';
        this.pauseTimer = 3.0 + Math.random() * 2.0;
      } else {
        this.currentIdleBehavior = 'STRETCH';
        this.pauseTimer = 2.5 + Math.random() * 1.5;
      }
    } else {
      // 普通學生 STUDENT
      if (this.movementStyle === 'JOGGING') {
        this.currentIdleBehavior = Math.random() < 0.6 ? 'STRETCH' : 'LOOK_AROUND';
        this.pauseTimer = 2.5 + Math.random() * 2.0;
      } else {
        const roll = Math.random();
        if (roll < 0.40) {
          this.currentIdleBehavior = 'PHONE';
          this.pauseTimer = 3.5 + Math.random() * 2.5;
        } else if (roll < 0.65) {
          this.currentIdleBehavior = 'LOOK_AROUND';
          this.pauseTimer = 2.5 + Math.random() * 2.0;
        } else if (roll < 0.85) {
          this.currentIdleBehavior = 'CHAT';
          this.pauseTimer = 3.5 + Math.random() * 3.0;
        } else {
          this.currentIdleBehavior = 'STRETCH';
          this.pauseTimer = 2.5 + Math.random() * 1.5;
        }
      }
    }
  }

  // 中斷發呆狀態並還原姿態 (受擊、被通緝發現、廣播定格等即時響應)
  public cancelPause() {
    this.isPaused = false;
    this.pauseTimer = 0;
    this.resetPose();
  }

  // 過場動畫演員模式：隱藏血條、昏迷告示、護盾與衝撞預警，只保留角色外觀 (不加入 NPC 清單、不跑 AI)
  public setCutsceneActor() {
    this.hpBarGroup.visible = false;
    this.koBadgeSprite.visible = false;
    if (this.bossBarrierMesh) this.bossBarrierMesh.visible = false;
    if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;
  }

  // 過場步行週期：speed > 0 時擺動雙腿與雙臂，停下時回到站姿 (0-GC)
  public animateCutsceneWalk(delta: number, speed: number) {
    if (speed <= 0.05) {
      if (this.leftLeg) this.leftLeg.rotation.x = 0;
      if (this.rightLeg) this.rightLeg.rotation.x = 0;
      if (this.leftArm) this.leftArm.rotation.x = 0;
      return;
    }
    this.animTimer += delta * Math.max(6.0, speed * 2.4);
    const swing = Math.sin(this.animTimer) * Math.min(0.6, 0.25 + speed * 0.12);
    if (this.leftLeg) this.leftLeg.rotation.x = swing;
    if (this.rightLeg) this.rightLeg.rotation.x = -swing;
    if (this.leftArm) this.leftArm.rotation.x = -swing * 0.7;
    if (this.rightArm) this.rightArm.rotation.x = swing * 0.7;
  }

  // 過場右臂姿勢 (例：總長舉手吹哨)
  public setCutsceneRightArm(pitch: number) {
    if (this.rightArm) this.rightArm.rotation.set(pitch, 0, 0);
  }

  // 重置 NPC 所有關節姿態至自然站立基準 (0-GC)
  public resetPose() {
    if (this.headMesh) {
      this.headMesh.rotation.set(0, 0, 0);
    }
    if (this.dogHead) {
      this.dogHead.rotation.set(0, 0, 0);
      this.dogHead.position.set(0, 0.65, 0.48);
    }
    if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
    if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
    if (this.dogFrontLeftLeg) this.dogFrontLeftLeg.rotation.set(0, 0, 0);
    if (this.dogFrontRightLeg) this.dogFrontRightLeg.rotation.set(0, 0, 0);
    if (this.dogBackLeftLeg) this.dogBackLeftLeg.rotation.set(0, 0, 0);
    if (this.dogBackRightLeg) this.dogBackRightLeg.rotation.set(0, 0, 0);
    if (this.dogTail) this.dogTail.rotation.set(0, 0, 0);
    if (this.mesh) {
      this.mesh.rotation.x = 0;
      this.mesh.rotation.z = 0;
      this.mesh.position.y = this.baseFloorY;
    }
  }

  // 羽球專屬跑位、擊球與準備步態動畫 (0-GC，專業羽球米字步法與架拍防守姿態)
  public animateBadmintonAction(
    delta: number,
    currentSpeed: number,
    isMoving: boolean,
    isSwinging: boolean = false
  ) {
    if (this.role !== 'PE_TEACHER_BOSS') return;

    if (isSwinging || this.attackAnimTimer > 0) {
      // 揮拍暴扣/抽球動作：右手大幅向前下壓揮動球拍，左手平衡輔助
      if (this.rightArm) {
        this.rightArm.rotation.set(-Math.PI * 0.55 + Math.sin(this.attackAnimTimer * 12.0) * 0.45, 0, 0);
      }
      if (this.leftArm) {
        this.leftArm.rotation.set(0.35, 0.2, -0.2);
      }
    } else if (isMoving && currentSpeed > 0.2) {
      // 跑位步法 (米字步法衝刺/跨步跑動)：手臂與雙腿動態快速擺動
      this.animTimer += delta * Math.min(18.0, Math.max(8.0, currentSpeed * 2.2));
      const swingMag = Math.min(0.75, 0.35 + (currentSpeed / 8.0) * 0.4);
      const legSwing = Math.sin(this.animTimer) * swingMag;

      if (this.leftLeg) this.leftLeg.rotation.set(legSwing, 0, 0);
      if (this.rightLeg) this.rightLeg.rotation.set(-legSwing, 0, 0);
      if (this.leftArm) this.leftArm.rotation.set(-legSwing * 0.8, 0, -0.15);
      if (this.rightArm) {
        // 右手持拍半舉向前，隨跑動節奏自然微幅擺動
        this.rightArm.rotation.set(-0.55 + legSwing * 0.5, 0.15, 0.15);
      }
      // 衝刺時身體微幅前傾與起伏
      this.mesh.rotation.x = Math.min(0.12, currentSpeed * 0.015);
      this.mesh.position.y = this.baseFloorY + Math.abs(Math.sin(this.animTimer * 2.0)) * 0.04;
    } else {
      // 待機/防守準備姿態 (Badminton Ready Bounce / 雙腳微屈彈跳墊步、提拍準備迎球)
      this.animTimer += delta * 4.5;
      const bounce = Math.abs(Math.sin(this.animTimer)) * 0.035;
      this.mesh.position.y = this.baseFloorY + bounce;
      this.mesh.rotation.x = 0.04; // 身體微前傾備戰

      // 膝蓋微曲預備姿態
      if (this.leftLeg) this.leftLeg.rotation.set(0.10, 0, -0.06);
      if (this.rightLeg) this.rightLeg.rotation.set(0.10, 0, 0.06);

      // 雙手在胸前架拍準備姿態 (經典羽球防守架拍)
      if (this.rightArm) this.rightArm.rotation.set(-0.75, 0.20, 0.20);
      if (this.leftArm) this.leftArm.rotation.set(-0.45, -0.20, -0.20);
    }
  }

  // 待機/發呆行為多樣性程序化動作 (0-GC 純量運算)
  private applyIdleAnimation() {
    if (this.cfg.isCanine) {
      if (this.currentIdleBehavior === 'DOG_SNIFF') {
        // 低頭嗅聞青草，尾巴歡快輕搖
        if (this.dogHead) {
          this.dogHead.rotation.x = 0.42 + Math.sin(this.pauseAnimTimer * 3.5) * 0.05;
          this.dogHead.position.set(0, 0.42, 0.58);
        }
        if (this.dogTail) {
          this.dogTail.rotation.y = Math.sin(this.pauseAnimTimer * 5.0) * 0.42;
        }
        if (this.dogFrontLeftLeg) this.dogFrontLeftLeg.rotation.x = 0;
        if (this.dogFrontRightLeg) this.dogFrontRightLeg.rotation.x = 0;
        if (this.dogBackLeftLeg) this.dogBackLeftLeg.rotation.x = 0;
        if (this.dogBackRightLeg) this.dogBackRightLeg.rotation.x = 0;
      } else {
        // DOG_SIT 乖巧端坐，警覺環顧
        this.mesh.rotation.x = -0.32;
        this.mesh.position.y = this.baseFloorY + 0.08;
        if (this.dogHead) {
          this.dogHead.rotation.x = 0.32;
          this.dogHead.rotation.y = Math.sin(this.pauseAnimTimer * 1.2) * 0.38;
          this.dogHead.position.set(0, 0.65, 0.48);
        }
        if (this.dogFrontLeftLeg) this.dogFrontLeftLeg.rotation.x = 0.32;
        if (this.dogFrontRightLeg) this.dogFrontRightLeg.rotation.x = 0.32;
        if (this.dogBackLeftLeg) this.dogBackLeftLeg.rotation.x = -0.7;
        if (this.dogBackRightLeg) this.dogBackRightLeg.rotation.x = -0.7;
        if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.pauseAnimTimer * 1.5) * 0.15;
      }
      return;
    }

    if (this.role === 'BIKE_PATROL') {
      // 單車巡邏暫停：轉頭巡視路口
      if (this.headMesh) {
        this.headMesh.rotation.y = Math.sin(this.pauseAnimTimer * 1.5) * 0.5;
      }
      return;
    }

    // 人型角色肢體動作
    switch (this.currentIdleBehavior) {
      case 'PHONE': {
        // 低頭滑手機 (頭部前傾約 20 度，雙手曲肘於胸前捧著手機操作)
        if (this.headMesh) {
          this.headMesh.rotation.x = 0.36 + Math.sin(this.pauseAnimTimer * 2.0) * 0.02;
          this.headMesh.rotation.y = 0;
        }
        if (this.leftArm) this.leftArm.rotation.set(-0.95 + Math.sin(this.pauseAnimTimer * 2.0) * 0.03, 0.35, -0.15);
        if (this.rightArm) this.rightArm.rotation.set(-1.00 + Math.sin(this.pauseAnimTimer * 2.0) * 0.03, -0.35, 0.15);
        if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
        if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
        break;
      }
      case 'STRETCH': {
        // 伸懶腰、深呼吸擴胸、上身微仰、手臂大張伸展
        if (this.headMesh) this.headMesh.rotation.x = -0.22;
        this.mesh.rotation.x = -0.08;
        const stretchBob = Math.sin(this.pauseAnimTimer * 2.5) * 0.12;
        if (this.leftArm) this.leftArm.rotation.set(-2.45 + stretchBob, 0, -0.45);
        if (this.rightArm) this.rightArm.rotation.set(-2.45 + stretchBob, 0, 0.45);
        if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
        if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
        break;
      }
      case 'LOOK_AROUND': {
        // 站立環顧四周、頭部平滑向左向右巡視
        if (this.headMesh) {
          this.headMesh.rotation.y = Math.sin(this.pauseAnimTimer * 1.4) * 0.65;
          this.headMesh.rotation.x = Math.sin(this.pauseAnimTimer * 0.7) * 0.08;
        }
        if (this.movementStyle === 'OFFICER_PATROL') {
          // 巡邏哨兵威嚴雙手負於身後，立正戒備，背後暴露
          if (this.leftArm) this.leftArm.rotation.set(0.38, 0.25, -0.15);
          if (this.rightArm) this.rightArm.rotation.set(0.38, -0.25, 0.15);
        } else {
          if (this.leftArm) this.leftArm.rotation.set(0, 0, -0.05);
          if (this.rightArm) this.rightArm.rotation.set(0, 0, 0.05);
        }
        if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
        if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
        break;
      }
      case 'HANDS_BEHIND_BACK': {
        // 威嚴負手 (老師/教官/糾察專屬，雙手背身後，姿態挺拔)
        if (this.headMesh) {
          this.headMesh.rotation.x = 0;
          this.headMesh.rotation.y = Math.sin(this.pauseAnimTimer * 0.9) * 0.18;
        }
        if (this.leftArm) this.leftArm.rotation.set(0.38, 0.25, -0.15);
        if (this.rightArm) this.rightArm.rotation.set(0.38, -0.25, 0.15);
        if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
        if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
        break;
      }
      case 'CHAT': {
        // 學生交談互動、點頭回應、手勢比劃
        if (this.headMesh) {
          this.headMesh.rotation.x = 0.06 + Math.sin(this.pauseAnimTimer * 3.5) * 0.07;
          this.headMesh.rotation.y = Math.sin(this.pauseAnimTimer * 1.5) * 0.22;
        }
        const g = Math.sin(this.pauseAnimTimer * 2.8);
        if (this.rightArm) this.rightArm.rotation.set(-0.75 + g * 0.25, -0.2, 0.2);
        if (this.leftArm) this.leftArm.rotation.set(-0.25 + Math.sin(this.pauseAnimTimer * 1.8) * 0.1, 0.1, -0.1);
        if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
        if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
        break;
      }
    }

    // 若下雨天正撐著傘，右手始終穩固高舉雨傘於頭頂上方
    if (this.umbrellaMesh?.visible && this.rightArm) {
      this.rightArm.rotation.set(-Math.PI * 0.65, 0.12, -0.12);
    }
  }

  // 第二世界無線電通報：其他守衛目擊時同步最後目擊位置 (自己正看見玩家時不覆寫)
  public receiveSightingReport(pos: THREE.Vector3) {
    if (!this.isChasing || this.seesPlayerNow) return;
    this.lastKnownPos.copy(pos);
    this.searchAnchor.copy(pos);
    if (this.lostSightTimer <= 0) this.lostSightTimer = 0.01;
  }

  // 清除仇恨與追擊狀態
  public resetAggro() {
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.dynamicSpeed = this.speed;
    this.chasePacingTimer = 1.5 + Math.random() * 2.0;
    this.whistleCooldown = 3.0;
    this.lostSightTimer = 0;
    if (this.role === 'DETENTION_BOSS') {
      this.isBossWindingUp = false;
      this.bossIsCharging = false;
      if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;
    }
  }

  // 玩家死亡重生時完整重置 NPC 至初始狀態 (位置、警戒狀態、巡邏狀態、HP 與肢體)
  public resetToInitialState() {
    this.position.copy(this.initialPosition);
    this.mesh.position.copy(this.initialPosition);
    this.velocity.set(0, 0, 0);
    this.rotationY = this.initialRotationY;
    this.mesh.rotation.y = this.initialRotationY;
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.dynamicSpeed = this.speed;
    this.chasePacingTimer = 1.5;
    this.lostSightTimer = 0;
    this.alertState = 'NORMAL';
    this.cautionTimer = 0;
    this.currentWaypointIdx = 0;
    this.stuckCheckTimer = 0;
    this.isPaused = false;
    this.pauseTimer = 0;
    this.isKnockedFlying = false;
    this.hitCooldown = 0;
    this.attackCooldown = 0;
    this.freezeTimer = 0;
    this.lastRecordedPos.copy(this.initialPosition);

    // 生命值與倒地狀態復原
    this.hp = this.maxHp;
    this.isKnockedDown = false;
    this.isPermanentlyKnockedOut = false;
    this.reviveTimer = 0;
    this.mesh.visible = true;

    // Boss 專屬狀態重置
    if (this.role === 'DETENTION_BOSS') {
      this.isBossStunned = false;
      this.bossStunTimer = 0;
      this.bossInvulnerableTimer = 0;
      this.isBossInvulnerable = false;
      this.isBossWindingUp = false;
      this.bossWindupTimer = 0;
      this.bossIsCharging = false;
      this.bossChargeTraveled = 0;
      this.bossChargeCooldown = 3.0;
      this.bossMeleeTimer = 0;
      this.bossBackstepTimer = 0;
      this.bossRecoverTimer = 0;
      this.bossStunElapsed = 0;
      if (this.bossStunStars) this.bossStunStars.visible = false;
      this.koBadgeSprite.visible = false;
      this.lastKoBadgeSec = -1;
      if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;
      if (this.bossBarrierMesh) this.bossBarrierMesh.visible = true;
    }

    this.resetPose();
    this.updateHpBar();
  }

  // 觸發全校廣播立正定格發呆
  public freeze(duration: number = 4.0) {
    if (this.isPaused) this.cancelPause();
    this.freezeTimer = duration;
    this.isChasing = false;
    this.isBurstSprinting = false;
  }

  // 檢測目標位置是否處於教學大樓複合區域 (A 棟、B 棟、空中天橋、教室走廊與樓梯天台)
  public static isInsideTeachingBuilding(pos: THREE.Vector3): boolean {
    if (pos.y > 0.8) return true; // 上樓梯、天橋、天台、2F、3F
    return pos.x >= 25.0 && pos.z >= -10.0 && pos.z <= 100.0;
  }

  // 3D 線段與軸對齊包圍盒 (AABB) 高效相交檢測 (純純量運算，0 記憶體配置)
  public static segmentIntersectsAABBCoords(
    p1x: number, p1y: number, p1z: number,
    p2x: number, p2y: number, p2z: number,
    min: THREE.Vector3, max: THREE.Vector3
  ): boolean {
    const dx = p2x - p1x;
    const dy = p2y - p1y;
    const dz = p2z - p1z;

    let tMin = 0.0;
    let tMax = 1.0;

    // X 軸
    if (Math.abs(dx) < 1e-6) {
      if (p1x < min.x || p1x > max.x) return false;
    } else {
      const inv = 1.0 / dx;
      let t1 = (min.x - p1x) * inv;
      let t2 = (max.x - p1x) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return false;
    }

    // Y 軸
    if (Math.abs(dy) < 1e-6) {
      if (p1y < min.y || p1y > max.y) return false;
    } else {
      const inv = 1.0 / dy;
      let t1 = (min.y - p1y) * inv;
      let t2 = (max.y - p1y) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return false;
    }

    // Z 軸
    if (Math.abs(dz) < 1e-6) {
      if (p1z < min.z || p1z > max.z) return false;
    } else {
      const inv = 1.0 / dz;
      let t1 = (min.z - p1z) * inv;
      let t2 = (max.z - p1z) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return false;
    }

    return true;
  }

  // 3D 視錐與障礙物遮擋檢測 (Line of Sight with Obstacle Occlusion, 0-GC 純純量運算)
  public canSeePlayer(
    playerPos: THREE.Vector3,
    colliders: CollidableBox[] = [],
    isPlayerHiding: boolean = false,
    isPlayerSneaking: boolean = false
  ): boolean {
    if (this.isKnockedDown) return false;
    // 刺客教條草堆掩體匿蹤：NPC 絕對無法察覺身處草堆中的刺客！
    if (isPlayerHiding) return false;

    // 校犬禁止靠近或進入教學大樓，當玩家處於教學樓區域時，校犬無法鎖定與追逐玩家
    if (this.role === 'DOG' && NPC.isInsideTeachingBuilding(playerPos)) {
      return false;
    }

    // 大如老師 / 閃身步老師：處於和平教學與身法傳授模式，不主動鎖定或追捕玩家
    if (this.role === 'PE_TEACHER_BOSS' || this.role === 'DODGE_TEACHER') {
      return false;
    }

    // 垂直高度差檢測：若垂直高度差超過 2.6m（位於不同樓層），視線被樓板與天花板遮擋
    if (Math.abs(playerPos.y - this.position.y) > 2.6) {
      return false;
    }

    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    const dz = playerPos.z - this.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    // 視距半徑
    const maxViewDist = this.cfg.viewDist;
    if (distSq > maxViewDist * maxViewDist) return false;

    // 視錐夾角檢測 (水平前向向量與目標方向向量的點積)
    const horizDistSq = dx * dx + dz * dz;
    if (horizDistSq < 1e-4) return true; // 緊貼著直接可見
    const invHoriz = 1.0 / Math.sqrt(horizDistSq);
    const dirX = dx * invHoriz;
    const dirZ = dz * invHoriz;
    const fwdX = Math.sin(this.rotationY);
    const fwdZ = Math.cos(this.rotationY);
    const dot = fwdX * dirX + fwdZ * dirZ;
    if (dot <= (this.role === 'DOG' ? 0.2 : 0.4)) {
      return false; // 不在視野角內
    }

    // 3D 視線障礙物遮擋檢測 (Line of Sight Raycast with AABB Broadphase Culling)
    if (colliders.length > 0) {
      const eyeY = this.cfg.eyeHeight;
      const eyePosX = this.position.x;
      const eyePosY = this.position.y + eyeY;
      const eyePosZ = this.position.z;
      const targetEyeX = playerPos.x;
      // 潛行蹲姿有效降低視線高度至 0.75m，使 1.2m ~ 1.5m 的半高沙包與木箱能徹底阻隔射線！
      const targetEyeY = playerPos.y + (isPlayerSneaking ? 0.75 : 1.2);
      const targetEyeZ = playerPos.z;

      // 視線光線包圍盒粗篩 (Broadphase 提早剔除遠處 90% 障礙物)
      const minRayX = Math.min(eyePosX, targetEyeX);
      const maxRayX = Math.max(eyePosX, targetEyeX);
      const minRayY = Math.min(eyePosY, targetEyeY);
      const maxRayY = Math.max(eyePosY, targetEyeY);
      const minRayZ = Math.min(eyePosZ, targetEyeZ);
      const maxRayZ = Math.max(eyePosZ, targetEyeZ);

      const sightNear = queryColliders(colliders, minRayX, maxRayX, minRayZ, maxRayZ, _npcSightNear);
      for (let i = 0; i < sightNear.length; i++) {
        const box = sightNear[i];
        if (box.isFloorOnly) continue; // 地板/坡道不遮擋水平視線
        if (box.min.x > maxRayX || box.max.x < minRayX ||
            box.min.y > maxRayY || box.max.y < minRayY ||
            box.min.z > maxRayZ || box.max.z < minRayZ) {
          continue; // 粗篩直接排除不相交的遠端障礙物
        }
        if (NPC.segmentIntersectsAABBCoords(eyePosX, eyePosY, eyePosZ, targetEyeX, targetEyeY, targetEyeZ, box.min, box.max)) {
          return false; // 視線被實體牆壁、門框或障礙物阻擋！
        }
      }
    }

    return true;
  }

  // AI 狀態機：仇恨追捕、視線丟失與放棄邏輯 (降低圈複雜度與重複運算)
  private updateAggroState(
    delta: number,
    playerPos: THREE.Vector3,
    wantedLevel: number,
    colliders: CollidableBox[],
    onSpotPlayer: () => void,
    isPlayerDead: boolean,
    isSpawnGraceActive: boolean = false,
    isPlayerSneaking: boolean = false,
    isPlayerSprinting: boolean = false,
    isPlayerHiding: boolean = false
  ) {
    if (isPlayerDead || this.isPermanentlyKnockedOut) {
      this.resetAggro();
      return;
    }

    // 小 Boss 硬直狀態：無法行動與追逐 (倒數與回神由 update 的硬直區塊處理)
    if (this.isBossStunned) return;

    // 校外強盜專屬仇恨邏輯
    if (this.role === 'BANDIT') {
      const isPlayerOutside = playerPos.z >= 105.5 || Math.abs(playerPos.x) >= 105.5 || playerPos.z <= -105.5;
      const distSq = this.position.distanceToSquared(playerPos);
      if (isPlayerOutside && distSq < 2025.0) { // 45.0m
        if (this.isPaused) this.cancelPause();
        this.isChasing = true;
        this.lostSightTimer = 0;
        this.lastKnownPos.copy(playerPos);
        onSpotPlayer();
      } else {
        this.resetAggro();
      }
      return;
    }

    const isDetentionRole = this.cfg.isDetention;

    // 第二世界專屬 MGS 潛入與警戒 AI
    if (isDetentionRole) {
      if (isSpawnGraceActive) {
        if (this.isChasing) this.resetAggro();
        return;
      }

      const distSq = this.position.distanceToSquared(playerPos);
      const seesPlayer = this.canSeePlayer(playerPos, colliders, isPlayerHiding, isPlayerSneaking);

      // 總教官衝鋒衝撞冷卻與危險預警軌跡線觸發 (1.25 秒蓄力前置預警)
      // 冷卻於戰鬥中 (追捕或警戒) 持續倒數；3m~22m 直接蓄力，貼身纏鬥超過 2.5 秒則先後撤拉開距離再衝撞
      if (
        this.role === 'DETENTION_BOSS' &&
        (this.isChasing || this.alertState === 'ALERT') &&
        !this.bossIsCharging &&
        !this.isBossWindingUp &&
        this.bossBackstepTimer <= 0 &&
        !this.isBossStunned &&
        !this.isKnockedDown
      ) {
        if (this.bossChargeCooldown > 0) this.bossChargeCooldown -= delta;
        this.bossMeleeTimer = distSq <= 9.0 ? this.bossMeleeTimer + delta : 0;

        if (this.isChasing && this.bossChargeCooldown <= 0 && !this.isBossInvulnerable) {
          if (distSq > 9.0 && distSq < 484.0) {
            this.startBossWindup(playerPos);
          } else if (distSq <= 9.0 && this.bossMeleeTimer >= 2.5) {
            // 後撤步：朝遠離玩家方向退開約 2.5m，結束後立即蓄力衝撞
            this.bossBackstepDir.subVectors(this.position, playerPos).setY(0);
            if (this.bossBackstepDir.lengthSq() < 0.0001) this.bossBackstepDir.set(-Math.sin(this.rotationY), 0, -Math.cos(this.rotationY));
            this.bossBackstepDir.normalize();
            this.bossBackstepTimer = NPC.BOSS_BACKSTEP_TIME;
            this.bossMeleeTimer = 0;
          }
        }
      }

      // 1. 視覺發現判定 (正面 90 度視線錐 + 射線無障礙)；全域警戒階段由 DetentionMode 依 seesPlayerNow 彙整
      if (seesPlayer) {
        if (this.isPaused) this.cancelPause();
        const wasChasing = this.isChasing;
        this.seesPlayerNow = true;
        this.setAlertState('ALERT');
        this.isChasing = true;
        this.lostSightTimer = 0;
        this.lastKnownPos.copy(playerPos);
        this.searchAnchor.copy(playerPos);

        // 僅在初次發現時吹哨/吠叫 (追捕中持續看見不重複鳴響)
        if (!wasChasing && this.whistleCooldown <= 0) {
          if (this.role === 'DETENTION_WOLF') soundManager.playDogBark();
          else if (this.role === 'DETENTION_GUARD' || this.role === 'DETENTION_BOSS') soundManager.playWhistle();
          this.whistleCooldown = 8.0;
        }
        onSpotPlayer();
        return;
      }

      // 2. 聽覺音效判定 (當未看見玩家時，判定腳步噪音)
      if (!this.isChasing) {
        if (isPlayerHiding || isPlayerSneaking) {
          // 刺客草堆匿蹤掩體中 或 靜音潛行 (右鍵/Ctrl/輕推搖桿)：0 噪音！守衛不會察覺背後接近
        } else if (isPlayerSprinting && distSq < 72.25) { // 疾跑 8.5m 內
          this.setAlertState('CAUTION');
          this.cautionTimer = 3.5;
          // 轉身看向聲響方位
          this.rotationY = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
        } else if (!isPlayerSneaking && distSq < 12.25) { // 正常走動 3.5m 內
          this.setAlertState('CAUTION');
          this.cautionTimer = 2.5;
          this.rotationY = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
        }

        if (this.alertState === 'CAUTION') {
          this.cautionTimer -= delta;
          if (this.cautionTimer <= 0) {
            this.setAlertState('NORMAL');
          }
        }
      }

      // 3. 追逐中的脫離與搜索 (刺客教條跳入草堆快速脫逃機制)
      if (this.isChasing) {
        if (!seesPlayer) {
          this.lostSightTimer += delta;
          if (this.detentionHuntActive) {
            // 全域 ALERT/EVASION：不自行放棄，前往最後目擊點後在周邊 4m 內輪流搜索，何時收隊由 DetentionMode 決定
            if (this.position.distanceToSquared(this.lastKnownPos) < 2.25) {
              const a = Math.random() * Math.PI * 2;
              const r = 1.5 + Math.random() * 2.5;
              this.lastKnownPos.set(this.searchAnchor.x + Math.cos(a) * r, this.searchAnchor.y, this.searchAnchor.z + Math.sin(a) * r);
            }
          } else {
            const maxLostTime = isPlayerHiding ? 1.5 : (this.role === 'DETENTION_WOLF' ? 6.5 : 5.0);
            const maxDistSq = 3600.0; // 60m 警報追捕搜索範圍
            if (this.lostSightTimer >= maxLostTime || distSq > maxDistSq) {
              this.resetAggro();
              this.setAlertState('NORMAL');
            }
          }
        } else {
          this.lostSightTimer = 0;
          this.lastKnownPos.copy(playerPos);
          onSpotPlayer();
        }
        return;
      }

      if (wantedLevel === 0) {
        return;
      }
    }

    const distSq = this.position.distanceToSquared(playerPos);

    // 通緝星級為 0 時，失去視線超過 3.5 秒或距離超過 20m 即脫離追捕，恢復巡邏崗位
    if (wantedLevel === 0) {
      if (this.role !== 'STUDENT' && (!this.isChasing || this.lostSightTimer > 3.5 || distSq > 400.0)) {
        this.resetAggro();
        return;
      }
    }

    // 校犬專屬仇恨邏輯：教學大樓保護禁區
    if (this.role === 'DOG' && NPC.isInsideTeachingBuilding(playerPos)) {
      this.resetAggro();
      return;
    }

    // 通用視線與追逐判定 (校犬、教官、巡堂老師、糾察隊、激怒學生)
    const seesPlayer = this.canSeePlayer(playerPos, colliders, isPlayerHiding, isPlayerSneaking);

    // 發現玩家觸發追逐 (通緝中且在視距內)
    const spotDistSq = this.role === 'DOG' ? 400.0 : 324.0; // 20m vs 18m
    if (wantedLevel > 0 && seesPlayer && distSq < spotDistSq && this.role !== 'STUDENT') {
      if (this.isPaused) this.cancelPause();
      this.isChasing = true;
      this.lostSightTimer = 0;
      this.lastKnownPos.copy(playerPos);
      if (this.whistleCooldown <= 0) {
        if (this.role === 'DOG') soundManager.playDogBark();
        else if (this.role === 'BIKE_PATROL') soundManager.playBicycleBell();
        else soundManager.playWhistle();
        this.whistleCooldown = this.role === 'DOG' ? 4.0 : 5.0;
      }
      onSpotPlayer();
    } else if (this.isChasing) {
      if (!seesPlayer) {
        this.lostSightTimer += delta;
        const maxLostTime = this.role === 'DOG' ? 4.0 : (this.role === 'STUDENT' ? 3.0 : 3.5);
        const maxDistSq = this.role === 'DOG' ? 1024.0 : (this.role === 'STUDENT' ? 625.0 : 900.0); // 32m, 25m, 30m
        if (this.lostSightTimer >= maxLostTime || distSq > maxDistSq) {
          this.resetAggro();
        }
      } else {
        this.lostSightTimer = 0;
        this.lastKnownPos.copy(playerPos);
        if (this.role !== 'STUDENT') {
          onSpotPlayer();
        }
      }
    }
  }

  // 計算追捕移動速度 (包含火柴人自行車騎士 15.0、校犬敏捷變頻追逐、衝刺爆發與喘氣放緩)
  private calculateTargetChaseSpeed(isPlayerRidingBike: boolean, distToPlayerSq: number): number {
    if (this.role === 'BIKE_PATROL') {
      return 15.0;
    }

    if (this.role === 'DOG') {
      if (isPlayerRidingBike) {
        this.isBurstSprinting = true;
        return 13.8;
      }
      if (distToPlayerSq > 144.0) { // > 12m
        this.isBurstSprinting = true;
        return 12.2;
      }
      if (distToPlayerSq > 30.25) { // > 5.5m
        return this.isBurstSprinting ? 11.5 : 8.8;
      }
      return this.isBurstSprinting ? 9.8 : 7.8;
    }

    if (this.isBurstSprinting) {
      return this.chaseSpeed;
    }

    if (this.role === 'BANDIT') return 8.5;
    return this.speed;
  }

  // 施展技能：閃身步 (朝角色面朝方向的左右橫向衝刺 2 個身位，破空殘影，絕不穿牆)
  public performFlashStep() {
    if (this.isKnockedDown) return;

    this.isDodging = true;
    this.dodgeDuration = 0.24;
    this.dodgeTimer = this.dodgeDuration;
    this.dodgeSpeed = 8.0; // 8.0 m/s * 0.24s = 1.92m (恰好 2 個身位寬度)
    this.afterimageSpawnTimer = 0;

    // 隨機 50% 機率朝左或朝右橫向閃身
    this.dodgeSideSign = Math.random() < 0.5 ? -1 : 1;
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
    if (this.isKnockedDown) return;

    this.isBearShaking = true;
    this.isDodging = true;
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
    const purpleColors = [0xa855f7, 0x9333ea, 0xc084fc];
    const color = purpleColors[this.bearBlinkCount % purpleColors.length];
    this.spawnAfterimage(color, 0.7);

    const safePos = this.findSafeTeleportPos(
      this.bearOriginCenter.x,
      this.bearOriginCenter.z,
      this.bearOriginCenter.y,
      colliders.length > 0 ? colliders : this.lastColliders
    );

    this.position.copy(safePos);
    this.mesh.position.copy(safePos);

    this.rotationY = Math.random() * Math.PI * 2;
    this.mesh.rotation.y = this.rotationY;

    soundManager.playDodge(true);
    this.bearBlinkCount++;
  }

  // 尋找瞬移安全目標點 (0-GC，檢測障礙物碰撞與地面高度，絕不穿出走廊外牆)
  private findSafeTeleportPos(centerX: number, centerZ: number, currentY: number, colliders: CollidableBox[]): THREE.Vector3 {
    return findSafeTeleportPos(_npcSafeTeleportResult, centerX, centerZ, currentY, colliders, {
      minRadius: 1.8,
      maxRadius: 4.2,
      attempts: 14,
      baseGroundY: this.baseFloorY
    });
  }

  // 產生 0-GC 角色殘影
  private spawnAfterimage(colorHex: number, duration: number) {
    this.afterimagePool?.spawn(colorHex, duration, this.position, this.mesh.rotation, this.headMesh, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  // 每幀更新殘影透明度與生命週期
  public updateAfterimages(delta: number) {
    this.afterimagePool?.update(delta);
  }

  // 通用頭頂氣泡對話彈出方法 (可自訂顯示時間)
  public showSpeechBubble(text: string, isSpecial: boolean = false, duration: number = 2.4) {
    this.skillBubble.show(text, isSpecial, duration);
  }

  // 相容閃身步技能氣泡
  public showSkillBubble(text: string, isAdvanced: boolean) {
    this.showSpeechBubble(text, isAdvanced, 1.35);
  }

  public updateSkillBubble(delta: number) {
    this.skillBubble.update(delta);
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    wantedLevel: number,
    colliders: CollidableBox[],
    onSpotPlayer: () => void,
    isPlayerRidingBike: boolean = false,
    isPlayerDead: boolean = false,
    isRaining: boolean = false,
    isThunderstorm: boolean = false,
    isSpawnGraceActive: boolean = false,
    isPlayerSneaking: boolean = false,
    isPlayerSprinting: boolean = false,
    isPlayerHiding: boolean = false
  ) {
    if (this.hitCooldown > 0) this.hitCooldown -= delta;
    this.seesPlayerNow = false;
    this.lastColliders = colliders;
    if (this.role === 'DETENTION_BOSS') impactDust.update(delta);

    // 依 NPC 所屬世界套用對應室內區域 (少年院守衛不可誤用天天國中的室內範圍)
    const isOutdoor = !IndoorManager.isIndoors(this.position, this.cfg.isDetention ? 'DETENTION' : 'CAMPUS');
    const isOutdoorHumanoid = isOutdoor && this.role !== 'DOG' && this.role !== 'BIKE_PATROL' && this.role !== 'BANDIT';

    // 傘的顯示與收納狀態更新 (室內、倒地、追捕或雨停時自動收傘)
    if (this.umbrellaMesh) {
      if (isRaining && isOutdoorHumanoid && this.hasUmbrella && !this.isKnockedDown && !this.isChasing) {
        this.umbrellaMesh.visible = true;
      } else {
        this.umbrellaMesh.visible = false;
      }
    }

    // 校犬柴柴避雨邏輯：下雨時主動前往避雨走廊端坐，雨停後解除並恢復原校園巡邏路徑
    if (this.role === 'DOG') {
      if (isRaining && !this.isChasing && !this.isKnockedDown) {
        if (!this.isDogSheltering) {
          this.isDogSheltering = true;
          this.originalDogWaypoints = [...this.patrolWaypoints];
          this.patrolWaypoints = [NPC.DOG_SHELTER_POS.clone()];
          this.currentWaypointIdx = 0;
          this.showSpeechBubble('🐾 汪！(跑去走廊躲雨)', false, 2.2);
        }
        if (this.position.distanceTo(NPC.DOG_SHELTER_POS) < 1.4) {
          if (!this.isPaused || this.currentIdleBehavior !== 'DOG_SIT') {
            this.isPaused = true;
            this.currentIdleBehavior = 'DOG_SIT';
            this.pauseTimer = 999999;
            this.mesh.rotation.y = -Math.PI * 0.5; // 面朝西側草坪雨景
          }
        }
      } else if (!isRaining && this.isDogSheltering) {
        this.isDogSheltering = false;
        if (this.originalDogWaypoints.length > 0) {
          this.patrolWaypoints = this.originalDogWaypoints;
        }
        if (this.isPaused && this.currentIdleBehavior === 'DOG_SIT') {
          this.cancelPause();
          this.resetPose();
        }
      }
    }

    // 閃身步老師 (DODGE_TEACHER) 專屬宗師身法邏輯更新
    if (this.role === 'DODGE_TEACHER') {
      // 演武計時器 (若未倒地、未處於對話中、未在施展身法中，每 8~14 秒自主展示身法絕學)
      if (!this.isKnockedDown && !this.isConversing && !this.isDodging && !this.isBearShaking) {
        this.dodgeTeacherPracticeTimer += delta;
        if (this.dodgeTeacherPracticeTimer >= this.dodgeTeacherNextPracticeTime) {
          this.dodgeTeacherPracticeTimer = 0;
          this.dodgeTeacherNextPracticeTime = 8.0 + Math.random() * 6.0;
          if (Math.random() < 0.5) {
            this.performFlashStep();
          } else {
            this.performBearShake(colliders);
          }
        }
      }

      // 狗熊哆嗦毛連續瞬移中 (連續瞬移 3 次，間隔 0.5s)
      if (this.isBearShaking) {
        this.bearBlinkTimer += delta;

        if (this.bearBlinkCount === 1 && this.bearBlinkTimer >= 0.5) {
          this.executeBearBlink(colliders);
        } else if (this.bearBlinkCount === 2 && this.bearBlinkTimer >= 1.0) {
          this.executeBearBlink(colliders);
        } else if (this.bearBlinkTimer >= 1.5) {
          this.isBearShaking = false;
          this.isDodging = false;
          this.mesh.rotation.z = 0;
        }

        if (this.isBearShaking) {
          const shakePhase = this.bearBlinkTimer * 45.0;
          this.mesh.rotation.z = Math.sin(shakePhase) * 0.16;
          if (this.leftArm) this.leftArm.rotation.z = 0.35 + Math.cos(shakePhase) * 0.28;
          if (this.rightArm) this.rightArm.rotation.z = -0.35 - Math.cos(shakePhase) * 0.28;
          if (this.headMesh) this.headMesh.rotation.y = Math.sin(shakePhase * 0.9) * 0.25;

          this.mesh.position.copy(this.position);
          this.updateSkillBubble(delta);
          this.updateAfterimages(delta);
          return;
        }
      }

      // 閃身步橫向破空衝刺中 (位移 2 個身位 ~1.92m，沿障礙物滑動不穿牆)
      if (this.isDodging) {
        this.dodgeTimer -= delta;
        if (this.dodgeTimer <= 0) {
          this.isDodging = false;
          this.mesh.rotation.z = 0;
        } else {
          const moveStepX = this.dodgeDir.x * this.dodgeSpeed * delta;
          const moveStepZ = this.dodgeDir.z * this.dodgeSpeed * delta;
          const radius = 0.45;

          // X 軸防穿牆檢測
          const nextX = this.position.x + moveStepX;
          if (!isBlockedXZ(colliders, nextX, this.position.z, radius, this.position.y, 0.3, 1.6)) this.position.x = nextX;

          // Z 軸防穿牆檢測
          const nextZ = this.position.z + moveStepZ;
          if (!isBlockedXZ(colliders, this.position.x, nextZ, radius, this.position.y, 0.3, 1.6)) this.position.z = nextZ;

          // 定期產生青色破空殘影
          this.afterimageSpawnTimer -= delta;
          if (this.afterimageSpawnTimer <= 0) {
            this.afterimageSpawnTimer = 0.05;
            this.spawnAfterimage(0x38bdf8, 0.28);
          }

          // 側向傾斜
          const progress = 1.0 - (this.dodgeTimer / this.dodgeDuration);
          this.mesh.rotation.z = -this.dodgeSideSign * 0.22 * Math.sin(progress * Math.PI);

          this.mesh.position.copy(this.position);
          this.updateSkillBubble(delta);
          this.updateAfterimages(delta);
          return;
        }
      }

      this.updateSkillBubble(delta);
      this.updateAfterimages(delta);
    }

    // 全校廣播定格發呆 (聽廣播立正站好，中斷一切追擊與攻擊動作)
    if (this.freezeTimer > 0) {
      this.freezeTimer -= delta;
      if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
      if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
      if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
      if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
      return;
    }

    // 0. 被單車/武器擊飛狀態處理 (空中拋物線、翻滾與落地)
    if (this.isKnockedFlying) {
      this.knockVelocity.y += -26.0 * delta; // 重力加速度

      this.position.x += this.knockVelocity.x * delta;
      this.position.z += this.knockVelocity.z * delta;
      this.position.y += this.knockVelocity.y * delta;

      // 1. 外圍圍牆與世界邊界阻擋 (絕不飛出圍牆之外，全地圖 X/Z 限制在 ±91.5m 內)
      const boundLimit = 91.5;
      if (this.position.x < -boundLimit) {
        this.position.x = -boundLimit;
        this.knockVelocity.x = -this.knockVelocity.x * 0.2;
      } else if (this.position.x > boundLimit) {
        this.position.x = boundLimit;
        this.knockVelocity.x = -this.knockVelocity.x * 0.2;
      }
      if (this.position.z < -boundLimit) {
        this.position.z = -boundLimit;
        this.knockVelocity.z = -this.knockVelocity.z * 0.2;
      } else if (this.position.z > boundLimit) {
        this.position.z = boundLimit;
        this.knockVelocity.z = -this.knockVelocity.z * 0.2;
      }

      // 2. 建築物與掩體防穿透阻擋 (絕不卡進建築物內部，碰撞後貼牆阻停)
      const flyPushed = depenetrateXZ(colliders, this.position, 0.55, 0.2, 1.6, 0.05, 1, 'npc');
      if (flyPushed & DEPEN_PUSH_X) this.knockVelocity.x = 0;
      if (flyPushed & DEPEN_PUSH_Z) this.knockVelocity.z = 0;

      // 空中旋轉翻滾
      this.mesh.rotation.x += delta * 12.0;
      this.mesh.rotation.z += delta * 8.0;

      // 計算 NPC 當前 (X, Z) 位置下方的真實支撐面 (最高樓板或地面 Y = 0)
      const supportFloorY = getSupportFloorY(colliders, this.position.x, this.position.y, this.position.z, 0.6);

      // 著地檢測：只有落到真實支撐面 (supportFloorY 或校園地面 Y = 0) 時才著地！
      if (this.position.y <= supportFloorY) {
        const fallDistance = this.baseFloorY - supportFloorY;
        this.position.y = supportFloorY;
        this.baseFloorY = supportFloorY; // 墜樓後著地，更新所在樓層基準為新高度
        this.isKnockedFlying = false;
        this.knockVelocity.set(0, 0, 0);

        if (fallDistance > 3.0) {
          // 高空摔出大樓墜樓重擊傷害與音效
          this.takeDamage(Math.round(fallDistance * 11));
          soundManager.playFallHit();
        }

        if (this.hp <= 0) {
          // 血量歸零：倒地倒下 (第二世界永久擊昏不重生)
          this.isKnockedDown = true;
          this.isChasing = false;
          this.isBurstSprinting = false;

          const isDetention = this.cfg.isDetention;
          if (isDetention) {
            this.isPermanentlyKnockedOut = true;
            this.reviveTimer = 999999;
            this.updateKOBadge(999999);
          } else {
            this.reviveTimer = 10.0;
            this.lastKoBadgeSec = -1;
            this.updateKOBadge(10.0);
          }
          this.hpBarBgMesh.visible = false;
          this.hpBarMesh.visible = false;
          this.koBadgeSprite.visible = true;

          if (this.role === 'DOG' || this.role === 'BIKE_PATROL') {
            this.mesh.rotation.set(0, this.rotationY, Math.PI / 2);
            this.mesh.position.y = this.baseFloorY + 0.2;
          } else {
            this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
            this.mesh.position.y = this.baseFloorY + 0.25;
          }
        } else {
          // 存活落地：站穩回正
          this.mesh.rotation.set(0, this.rotationY, 0);
          this.mesh.position.y = this.baseFloorY;
        }
      }

      this.mesh.position.copy(this.position);
      return;
    }

    // 1. 倒地狀態處理 (永久擊昏絕不重生)
    if (this.isKnockedDown) {
      if (this.isPermanentlyKnockedOut) {
        // 永久擊昏，絕不再站立或重設倒數
        return;
      }
      this.reviveTimer -= delta;
      this.updateKOBadge(this.reviveTimer);

      // 倒地重力墜落檢測 (若被打出大樓邊界懸空倒地，持續自由落體墜落至地面)
      const supportFloorY = getSupportFloorY(colliders, this.position.x, this.position.y, this.position.z, 0.6);
      if (this.position.y > supportFloorY) {
        this.position.y = Math.max(supportFloorY, this.position.y - 22.0 * delta);
        this.baseFloorY = supportFloorY;
      }

      if (this.reviveTimer <= 0) {
        if (this.role === 'DETENTION_BOSS') {
          // 特訓總教官暗殺倒地癱瘓結束：起身恢復戰鬥，保留剩餘血量不回滿血！
          this.isKnockedDown = false;
          this.isBossStunned = false;
          this.bossStunTimer = 0;
          this.koBadgeSprite.visible = false;
          this.lastKoBadgeSec = -1;
          this.mesh.rotation.set(0, this.rotationY, 0);
          this.mesh.position.y = this.baseFloorY;
          this.alertState = 'ALERT';
          this.isChasing = true;
          this.isBurstSprinting = false;
          this.dynamicSpeed = this.speed * 1.25;
          this.lostSightTimer = 0;
          this.attackCooldown = 0.5;
          this.bossChargeCooldown = 2.0;
          this.bossInvulnerableTimer = 3.0;
          this.isBossInvulnerable = true;
        } else {
          // 滿血復活！
          this.isKnockedDown = false;
          this.hp = this.maxHp;
          this.hpBarMesh.scale.x = 1.0;
          this.hpBarMesh.material = getHpBarMaterial(0x2ecc71);
          this.hpBarBgMesh.visible = true;
          this.hpBarMesh.visible = true;
          this.koBadgeSprite.visible = false;
          this.lastKoBadgeSec = -1;

          if (this.isOriginalBikePatrol && this.role !== 'BIKE_PATROL' && !this.ownedBike) {
            // 愛車已不存在 (被上限回收)：直接恢復騎乘巡邏
            this.restoreBikePatrol();
          } else {
            // 愛車仍在路邊：先徒步起身，再走回車旁牽車
            if (this.ownedBike) {
              this.isReclaimingBike = true;
              this.reclaimTimer = 0;
            }
            // 重新站立回正
            this.mesh.rotation.x = 0;
            this.mesh.rotation.z = 0;
            this.mesh.position.y = this.baseFloorY;
            this.isChasing = false;
            this.isBurstSprinting = false;
            this.dynamicSpeed = this.speed;
            this.lostSightTimer = 0;
          }
        }
      } else {
        // 維持倒地姿勢與高度
        if (this.role === 'DOG' || this.role === 'BIKE_PATROL') {
          this.mesh.rotation.set(0, this.rotationY, Math.PI / 2);
          this.mesh.position.y = this.baseFloorY + 0.2;
        } else {
          this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
          this.mesh.position.y = this.baseFloorY + 0.25;
        }
      }
      this.mesh.position.x = this.position.x;
      this.mesh.position.z = this.position.z;

      // 血條與告示牌面朝玩家視角 (0-GC 純純量計算)
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      if (dx * dx + dz * dz > 0.01) {
        const ang = Math.atan2(dx, dz);
        this.hpBarGroup.rotation.y = ang - this.rotationY;
      }
      return;
    }

    // 總教官被暗殺受創後之 3 秒金鐘護盾無敵期 (防止被連續快速背刺秒殺)
    if (this.role === 'DETENTION_BOSS' && this.bossInvulnerableTimer > 0 && !this.isKnockedDown) {
      this.bossInvulnerableTimer -= delta;
      this.isBossInvulnerable = true;

      if (this.bossBarrierMesh) {
        this.bossBarrierMesh.visible = true;
        this.bossBarrierMesh.rotation.y += delta * 3.5;
        (this.bossBarrierMesh.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(this.bossInvulnerableTimer * 16.0) * 0.2;
      }

      this.showStatusBadge(`🛡️ 護盾中 (${this.bossInvulnerableTimer.toFixed(1)}s)`, 'rgba(234, 88, 12, 0.95)', '#fde047');

      if (this.bossInvulnerableTimer <= 0) {
        this.bossInvulnerableTimer = 0;
        this.isBossInvulnerable = false;
        if (this.bossBarrierMesh) this.bossBarrierMesh.visible = false;
        this.hideStatusBadge();
        this.setAlertState('ALERT');
        this.isChasing = true;
        this.bossChargeCooldown = 3.5;
      }
    } else if (this.bossBarrierMesh && this.bossBarrierMesh.visible && this.bossInvulnerableTimer <= 0) {
      this.bossBarrierMesh.visible = false;
    }

    // 總教官破盾硬直：原地凍結 (不受 AI 移動與轉向)，暈眩搖晃 + 頭頂星星，結束後甩頭回神再恢復戰鬥
    if (this.role === 'DETENTION_BOSS' && !this.isKnockedDown && (this.isBossStunned || this.bossRecoverTimer > 0)) {
      if (this.isBossStunned) {
        this.bossStunTimer -= delta;
        this.bossStunElapsed += delta;
        this.applyBossStunPose();
        if (this.bossStunTimer <= 0) {
          this.isBossStunned = false;
          this.bossStunTimer = 0;
          this.bossRecoverTimer = 0.3;
          if (this.bossStunStars) this.bossStunStars.visible = false;
        }
      } else {
        this.bossRecoverTimer -= delta;
        const k = Math.max(0, this.bossRecoverTimer / 0.3);
        if (this.headMesh) this.headMesh.rotation.set(0, Math.sin(this.bossRecoverTimer * 42.0) * 0.4 * k, 0);
        this.mesh.rotation.set(this.mesh.rotation.x * k, this.rotationY, this.mesh.rotation.z * k);
        if (this.bossRecoverTimer <= 0) {
          this.bossRecoverTimer = 0;
          this.resetPose();
          this.mesh.rotation.set(0, this.rotationY, 0);
          this.koBadgeSprite.visible = false;
          this.lastKoBadgeSec = -1;
          this.setAlertState('ALERT');
          this.isChasing = true;
          this.lostSightTimer = 0;
          this.lastKnownPos.copy(playerPos);
        }
      }
      this.mesh.position.set(this.position.x, this.baseFloorY, this.position.z);
      return;
    }

    // 總教官貼身纏鬥後撤步 (拉開距離後立即進入衝撞蓄力)
    if (this.bossBackstepTimer > 0 && this.role === 'DETENTION_BOSS' && !this.isBossStunned && !this.isKnockedDown) {
      const stepTime = Math.min(delta, this.bossBackstepTimer);
      this.bossBackstepTimer -= delta;
      this.moveBossSwept(colliders, this.bossBackstepDir, NPC.BOSS_BACKSTEP_SPEED * stepTime);
      this.rotationY = Math.atan2(-this.bossBackstepDir.x, -this.bossBackstepDir.z); // 後退時仍面向玩家
      this.mesh.rotation.y = this.rotationY;
      this.mesh.position.copy(this.position);
      if (this.bossBackstepTimer <= 0) {
        this.bossBackstepTimer = 0;
        this.startBossWindup(playerPos);
      }
      return;
    }

    // 總教官衝撞前置危險預警階段 (Windup Telegraph)
    if (this.isBossWindingUp && this.role === 'DETENTION_BOSS' && !this.isBossStunned && !this.isKnockedDown) {
      this.bossWindupTimer -= delta;

      // 地面預警軌跡線脈動閃爍 (頻率隨蓄力倒數加快)
      if (this.bossTelegraphMat) {
        const pulseRate = 14.0 + (1.25 - Math.max(0, this.bossWindupTimer)) * 14.0;
        this.bossTelegraphMat.opacity = 0.35 + Math.sin(this.bossWindupTimer * pulseRate) * 0.35;
      }

      // 蓄力戰術衝鋒動作：微蹲、雙臂/盾牌架於胸前向前抵禦、地面微顫
      this.mesh.position.y = this.baseFloorY - 0.12;
      this.mesh.position.x = this.position.x + (Math.random() - 0.5) * 0.04;
      this.mesh.position.z = this.position.z + (Math.random() - 0.5) * 0.04;
      this.rotationY = Math.atan2(this.bossChargeDir.x, this.bossChargeDir.z);
      this.mesh.rotation.y = this.rotationY;

      if (this.leftArm) this.leftArm.rotation.set(-1.1, 0.35, -0.35);
      if (this.rightArm) this.rightArm.rotation.set(-1.1, -0.35, 0.35);

      if (this.bossWindupTimer <= 0) {
        this.isBossWindingUp = false;
        this.bossIsCharging = true;
        this.bossChargeTraveled = 0;
        this.mesh.position.copy(this.position);
        if (this.bossTelegraphGroup) {
          this.bossTelegraphGroup.visible = false;
        }
      }
      return;
    }

    // 總教官狂暴衝鋒判定 (狂暴衝刺 14 m/s + 撞柱重度眩暈 + 距離上限)
    if (this.bossIsCharging && this.role === 'DETENTION_BOSS' && !this.isBossStunned && !this.isKnockedDown) {
      // 子步掃掠移動 (每步 ≤0.3m)，撞上身體高度範圍內的阻擋物時停在接觸面，避免嵌牆或高速穿牆
      const stepDist = Math.min(NPC.BOSS_CHARGE_SPEED * delta, this.bossChargeMaxDist - this.bossChargeTraveled);
      const hitWall = this.moveBossSwept(colliders, this.bossChargeDir, Math.max(0, stepDist));
      this.bossChargeTraveled += stepDist;
      this.rotationY = Math.atan2(this.bossChargeDir.x, this.bossChargeDir.z);

      // 雙臂前推衝鋒姿勢
      if (this.leftArm) this.leftArm.rotation.set(-1.3, 0.2, -0.2);
      if (this.rightArm) this.rightArm.rotation.set(-1.3, -0.2, 0.2);

      // 檢測是否撞上水泥加固柱或障礙盒
      let hitObstacle = false;
      if (hitWall) {
        hitObstacle = true;
        // 撞擊點碎石爆散、反彈後退約 0.5m、玩家 25m 內鏡頭震動
        _bossImpactPoint.set(
          this.position.x + this.bossChargeDir.x * NPC.BOSS_CHARGE_RADIUS,
          this.position.y + 1.2,
          this.position.z + this.bossChargeDir.z * NPC.BOSS_CHARGE_RADIUS
        );
        _bossKnockDir.copy(this.bossChargeDir).negate();
        if (this.mesh.parent) impactDust.burst(this.mesh.parent, _bossImpactPoint, _bossKnockDir);
        this.moveBossSwept(colliders, _bossKnockDir, 0.5);
        if (this.position.distanceToSquared(playerPos) < 625.0) requestCameraShake(0.85);
        // 猛烈撞擊加固水泥柱！陷入 3.5 秒重度眩暈硬直！
        this.stunBoss(3.5);
        soundManager.playPunch();
        soundManager.playBatHit();
        if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;
      }

      if (!hitObstacle && this.bossChargeTraveled >= this.bossChargeMaxDist) {
        // 超過衝撞最大距離 (24m)，煞車收招
        this.bossIsCharging = false;
        this.pauseTimer = 0.8;
        this.isPaused = true;
        this.resetPose();
        if (this.bossTelegraphGroup) this.bossTelegraphGroup.visible = false;
      }

      this.mesh.position.copy(this.position);
      return;
    }

    if (this.whistleCooldown > 0) this.whistleCooldown -= delta;
    if (this.attackAnimTimer > 0) this.attackAnimTimer -= delta;
    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    if (this.shuttlecockCooldown > 0) this.shuttlecockCooldown -= delta;

    // 4F 羽球比賽中：交由 TennisGame 全權精準控制大如老師的跑位、步法與接發球動作
    if (this.role === 'PE_TEACHER_BOSS' && this.isInBadmintonMatch) {
      this.updateHpBar();
      return;
    }

    // 2. 仇恨判定 (AI 狀態機)
    this.updateAggroState(
      delta,
      playerPos,
      wantedLevel,
      colliders,
      onSpotPlayer,
      isPlayerDead,
      isSpawnGraceActive,
      isPlayerSneaking,
      isPlayerSprinting,
      isPlayerHiding
    );

    // 3. 移動目標判定與「忽快忽慢」追捕節奏 (Burst Sprinting vs Fatigue Recovery)
    let targetPos: THREE.Vector3;
    let currentSpeed = this.speed;

    if (this.isChasing) {
      // 若看得見玩家直接追擊；若剛失去視線則前往最後目擊位置搜索
      targetPos = this.lostSightTimer > 0 ? this.lastKnownPos : playerPos;

      // 追捕動態節奏計時 (忽快忽慢：爆發衝刺 vs 喘氣慢跑)
      if (this.role === 'BIKE_PATROL') {
        this.isBurstSprinting = true;
        this.chasePacingTimer = 2.0;
        if (Math.random() < 0.05 && this.whistleCooldown <= 0) {
          soundManager.playBicycleBell();
          this.whistleCooldown = 4.0;
        }
      } else if (isPlayerRidingBike) {
        this.isBurstSprinting = true;
        this.chasePacingTimer = 2.0;
      } else {
        this.chasePacingTimer -= delta;
        if (this.chasePacingTimer <= 0) {
          this.isBurstSprinting = !this.isBurstSprinting;
          if (this.isBurstSprinting) {
            this.chasePacingTimer = this.role === 'DOG' ? (2.0 + Math.random() * 1.5) : (0.5 + Math.random() * 1.0);
            if (Math.random() < 0.25 && this.whistleCooldown <= 0) {
              if (this.role === 'DOG') soundManager.playDogBark();
              else soundManager.playWhistle();
              this.whistleCooldown = 4.0;
            }
          } else {
            this.chasePacingTimer = this.role === 'DOG' ? (1.5 + Math.random() * 1.0) : (3.5 + (Math.random() * 0.6 - 0.3));
          }
        }
      }

      // 目標速度計算 (0-GC 避免重複距離計算)
      const distToPlayerSq = this.position.distanceToSquared(playerPos);
      const targetChaseSpeed = this.calculateTargetChaseSpeed(isPlayerRidingBike, distToPlayerSq);

      // 平滑速度過渡
      const accelRate = this.cfg.chaseAccelRate;
      this.dynamicSpeed += (targetChaseSpeed - this.dynamicSpeed) * Math.min(delta * accelRate, 1.0);
      currentSpeed = this.dynamicSpeed;
    } else if (this.isReclaimingBike && this.ownedBike && !this.ownedBike.isMounted) {
      // 走回被搶的愛車旁牽車 (玩家正在騎乘時改為一般巡邏，待玩家下車後再前往)
      this.isBurstSprinting = false;
      if (this.isPaused) this.cancelPause();
      currentSpeed = this.speed * 1.3;
      this.dynamicSpeed = currentSpeed;
      targetPos = this.ownedBike.position;
      this.reclaimTimer += delta;
      // 抵達車旁 1.5m 內，或 20 秒仍走不到 (受阻/卡住) 時強制牽回
      if (this.position.distanceToSquared(targetPos) < 2.25 || this.reclaimTimer > 20.0) {
        this.wantsBikeReclaim = true;
      }
    } else {
      this.isBurstSprinting = false;

      // 下雨天沒帶傘的 NPC：1.45 倍速度前傾快步避雨
      if (isRaining && isOutdoorHumanoid && !this.hasUmbrella) {
        if (this.isPaused) this.cancelPause();
        currentSpeed = this.speed * 1.45;
        this.dynamicSpeed = currentSpeed;
      } else {
        this.dynamicSpeed = this.speed;
        currentSpeed = this.speed;
      }

      // 若處於發呆/待機中，執行待機行為動畫，暫停前進
      if (this.isPaused) {
        this.pauseTimer -= delta;
        this.pauseAnimTimer += delta;
        this.applyIdleAnimation();

        if (this.pauseTimer <= 0) {
          this.isPaused = false;
          this.resetPose();
          this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.patrolWaypoints.length;
          this.lastRecordedPos.copy(this.position);
          this.stuckCheckTimer = 0;
        }

        // 頭頂 3D 浮動血條永遠面朝視角/玩家
        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        if (dx * dx + dz * dz > 0.01) {
          const ang = Math.atan2(dx, dz);
          this.hpBarGroup.rotation.y = ang - this.rotationY;
        }
        return;
      }

      targetPos = this.patrolWaypoints[this.currentWaypointIdx];
      const isDetention = this.cfg.isDetention;
      const wpDistSq = isDetention ? 2.25 : (this.role === 'BIKE_PATROL' ? 12.25 : (this.movementStyle === 'JOGGING' ? 4.84 : 3.24));
      if (this.position.distanceToSquared(targetPos) < wpDistSq) {
        // 下雨天沒帶傘時絕不停留發呆，持續快步尋找遮蔽處；第二世界特訓守衛 100% 固定駐足警戒 3.5s
        const canPause = isDetention ? true : ((!isRaining || !isOutdoorHumanoid || this.hasUmbrella) && Math.random() < this.pauseChance);
        if (canPause) {
          this.enterPauseState();
          const dx = playerPos.x - this.position.x;
          const dz = playerPos.z - this.position.z;
          if (dx * dx + dz * dz > 0.01) {
            const ang = Math.atan2(dx, dz);
            this.hpBarGroup.rotation.y = ang - this.rotationY;
          }
          return;
        } else {
          this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.patrolWaypoints.length;
          targetPos = this.patrolWaypoints[this.currentWaypointIdx];
        }
      }

      // 防卡死巡邏哨兵看門狗 (Anti-stuck Watchdog Timer)
      // 若 NPC 在巡邏途中撞牆受阻 1.2 秒無實質位移，自動切換至下一個巡邏檢查點
      this.stuckCheckTimer += delta;
      if (this.stuckCheckTimer >= 1.2) {
        const dxFromLast = this.position.x - this.lastRecordedPos.x;
        const dzFromLast = this.position.z - this.lastRecordedPos.z;
        if (dxFromLast * dxFromLast + dzFromLast * dzFromLast < 0.04) {
          this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.patrolWaypoints.length;
          targetPos = this.patrolWaypoints[this.currentWaypointIdx];
        }
        this.lastRecordedPos.copy(this.position);
        this.stuckCheckTimer = 0;
      }
    }

    // 4. 計算移動方向與位移 (0-GC 重複利用 Scratch Vector)
    _npcMoveDir.subVectors(targetPos, this.position);
    _npcMoveDir.y = 0;
    const distToTargetSq = _npcMoveDir.lengthSq();

    if (distToTargetSq > 0.05) {
      _npcMoveDir.normalize();

      // 近戰警戒距離停止前進：當追捕中看得見玩家且距離小於 1.15m 時，站在近戰打擊範圍內專注攻擊，避免強推玩家進牆角
      const isTooCloseToPlayer = this.isChasing && this.lostSightTimer <= 0 && distToTargetSq < 1.32; // ~1.15m

      if (!isTooCloseToPlayer) {
        const moveStepX = _npcMoveDir.x * currentSpeed * delta;
        const moveStepZ = _npcMoveDir.z * currentSpeed * delta;
        const radius = this.cfg.isCanine ? 0.35 : 0.45;

        // X 軸移動檢測
        let nextX = this.position.x + moveStepX;
        let hitX = false;

        // 校犬嚴格禁止靠近或跨入教學樓邊界 (X: 24.5 以東)
        if (this.role === 'DOG' && nextX >= 24.5 && this.position.z >= -10.0 && this.position.z <= 100.0) {
          hitX = true;
        }

        // 強盜嚴格禁止跨入校園內部
        if (this.role === 'BANDIT' && nextX > -118.0 && nextX < 118.0 && this.position.z < 107.0) {
          hitX = true;
        }

        if (!hitX) {
          hitX = isBlockedXZ(colliders, nextX, this.position.z, radius, this.position.y, 0.3, 1.6);
        }
        if (!hitX) this.position.x = nextX;

        // Z 軸移動檢測
        let nextZ = this.position.z + moveStepZ;
        let hitZ = false;

        // 校犬嚴格禁止靠近教學樓
        if (this.role === 'DOG' && this.position.x >= 24.5 && nextZ >= -10.0 && nextZ <= 100.0) {
          hitZ = true;
        }

        // 強盜嚴格禁止跨入校門進入校園 (Z <= 106.8)
        if (this.role === 'BANDIT' && nextZ < 107.2 && Math.abs(this.position.x) < 118.0) {
          hitZ = true;
        }

        if (!hitZ) {
          hitZ = isBlockedXZ(colliders, this.position.x, nextZ, radius, this.position.y, 0.3, 1.6);
        }
        if (!hitZ) this.position.z = nextZ;

        // 校犬位置邊界修正與維持地面
        if (this.role === 'DOG') {
          if (this.position.x > 24.2 && this.position.z >= -10.0 && this.position.z <= 100.0) {
            this.position.x = 24.2;
          }
          this.position.y = 0;
        }

        // 強盜邊界回推：絕不能在校園內
        if (this.role === 'BANDIT') {
          if (this.position.z < 107.2 && Math.abs(this.position.x) < 118.0) {
            this.position.z = 107.2;
          }
        }

        // 大如老師 邊界回推：嚴格鎖定在 4F 羽球場北側發球半場內，絕對不會離開球場
        if (this.role === 'PE_TEACHER_BOSS') {
          this.position.x = THREE.MathUtils.clamp(this.position.x, 63.8, 84.2);
          this.position.z = THREE.MathUtils.clamp(this.position.z, 23.8, 37.0);
          this.position.y = 12.0;
        }

        // 5. 防穿牆與卡牆修復 (永遠朝外側退回，絕不向建築內部彈射)
        depenetrateXZ(colliders, this.position, radius, 0.3, 1.6, 0.02, 1, 'npc');
      }

      // 轉向與俯仰姿態
      const targetRotation = Math.atan2(_npcMoveDir.x, _npcMoveDir.z);
      const diff = Math.atan2(Math.sin(targetRotation - this.rotationY), Math.cos(targetRotation - this.rotationY));
      const isDetention = this.cfg.isDetention;
      const isCanine = this.cfg.isCanine;
      const turnRate = isCanine
        ? (this.isChasing ? 14.0 : 4.0)
        : (this.role === 'BIKE_PATROL'
          ? 12.0
          : (isDetention && !this.isChasing ? 3.2 : 10.0));
      this.rotationY += diff * Math.min(delta * turnRate, 1.0);
      this.mesh.rotation.y = this.rotationY;

      // 追捕姿態視覺回饋：衝刺時前傾壓低、調息時微喘
      if (!isCanine && this.role !== 'BIKE_PATROL') {
        if (this.isChasing) {
          const targetTilt = this.isBurstSprinting ? 0.14 : (0.05 + Math.sin(this.animTimer * 2.5) * 0.03);
          this.mesh.rotation.x += (targetTilt - this.mesh.rotation.x) * Math.min(delta * 6.0, 1.0);
        } else {
          this.mesh.rotation.x += (0 - this.mesh.rotation.x) * Math.min(delta * 6.0, 1.0);
        }
      }

      // 6. 專屬動作動畫
      // 動態步頻：步態頻率與實際位移速度嚴格成比例！避免慢走時太空步滑步
      const animRate = isCanine
        ? (this.isChasing ? 12.0 : Math.max(3.2, currentSpeed * 2.4))
        : (this.isChasing
          ? (this.isBurstSprinting ? 16.0 : 9.5)
          : (isDetention
            ? Math.max(2.6, currentSpeed * 2.6)
            : (this.movementStyle === 'JOGGING' ? 12.0 : (this.movementStyle === 'HURRIED_WALK' ? 9.5 : 7.5))));
      this.animTimer += delta * animRate;

      if (isCanine) {
        // 犬科四足奔馳/慢巡步態動畫：跨步幅度隨速度動態放大 (Gallop / Prowl stride scaling)
        const strideMag = Math.min(0.85, 0.35 + (currentSpeed / 12.0) * 0.45);
        const dogRun = Math.sin(this.animTimer) * strideMag;
        if (this.dogFrontLeftLeg) this.dogFrontLeftLeg.rotation.x = dogRun;
        if (this.dogFrontRightLeg) this.dogFrontRightLeg.rotation.x = -dogRun;
        if (this.dogBackLeftLeg) this.dogBackLeftLeg.rotation.x = -dogRun;
        if (this.dogBackRightLeg) this.dogBackRightLeg.rotation.x = dogRun;

        // 奔馳時尾巴興奮擺動頻率隨速度加快
        const tailRate = this.isChasing ? 2.5 : 1.8;
        if (this.dogTail) this.dogTail.rotation.y = Math.sin(this.animTimer * tailRate) * 0.52;

        // 四足奔馳上下顛簸 (Canine gallop vertical bounce)
        if (this.attackAnimTimer > 0) {
          if (this.dogHead) this.dogHead.position.z = 0.63; // 撲咬伸頸
        } else {
          if (this.dogHead) this.dogHead.position.z = 0.48;
        }
        this.mesh.position.y = this.baseFloorY + Math.abs(Math.sin(this.animTimer * 2)) * (currentSpeed > 6.0 ? 0.045 : 0.015);
      } else if (this.role === 'BIKE_PATROL') {
        // 單車糾察隊輪胎旋轉
        const spin = (currentSpeed / 0.38) * delta;
        if (this.bikeFrontWheel) this.bikeFrontWheel.rotation.x += spin;
        if (this.bikeRearWheel) this.bikeRearWheel.rotation.x += spin;
      } else {
        // 人型 NPC 動作 (追捕揮拳 vs 各類步行風格)
        if (this.isChasing) {
          const swingMag = this.isBurstSprinting ? 0.70 : 0.38;
          const swing = Math.sin(this.animTimer) * swingMag;
          if (this.leftArm) this.leftArm.rotation.set(-swing, 0, 0);
          if (this.rightArm) {
            if (this.attackAnimTimer > 0) {
              this.rightArm.rotation.set(-Math.PI / 2, 0, 0); // 出拳揮打
            } else {
              this.rightArm.rotation.set(swing, 0, 0);
            }
          }
          if (this.leftLeg) this.leftLeg.rotation.set(swing, 0, 0);
          if (this.rightLeg) this.rightLeg.rotation.set(-swing, 0, 0);
        } else {
          if (this.umbrellaMesh?.visible) {
            // 下雨天撐傘步行動作：右手高舉撐傘於頭頂上方，左手輕快單側擺動，步態悠閒穩定
            if (this.rightArm) this.rightArm.rotation.set(-Math.PI * 0.65, 0.12, -0.12);
            const swing = Math.sin(this.animTimer) * 0.32;
            if (this.leftArm) this.leftArm.rotation.set(-swing, 0, 0);
            if (this.leftLeg) this.leftLeg.rotation.set(swing, 0, 0);
            if (this.rightLeg) this.rightLeg.rotation.set(-swing, 0, 0);
            this.mesh.rotation.x = 0;
            if (this.headMesh) this.headMesh.rotation.x = 0;
          } else if (isRaining && isOutdoorHumanoid && !this.hasUmbrella) {
            // 下雨天沒帶傘快步避雨動作：低頭縮頸、上身前傾 12 度、雙臂急促擺動小跑步尋找掩蔽
            const swing = Math.sin(this.animTimer * 1.35) * 0.54;
            if (this.leftArm) this.leftArm.rotation.set(-swing - 0.25, 0, -0.1);
            if (this.rightArm) this.rightArm.rotation.set(swing - 0.25, 0, 0.1);
            if (this.leftLeg) this.leftLeg.rotation.set(swing * 0.95, 0, 0);
            if (this.rightLeg) this.rightLeg.rotation.set(-swing * 0.95, 0, 0);
            this.mesh.rotation.x = 0.14; // 上身前傾衝刺
            if (this.headMesh) this.headMesh.rotation.x = 0.30; // 低頭縮頸避雨
            this.mesh.position.y += Math.abs(Math.sin(this.animTimer * 2.0)) * 0.04;
          } else {
            // 晴天或非雨天：重置低頭與前傾
            if (this.headMesh && Math.abs(this.headMesh.rotation.x) > 0.01) {
              this.headMesh.rotation.x = 0;
            }
            if (this.mesh && Math.abs(this.mesh.rotation.x) > 0.01 && this.movementStyle !== 'HURRIED_WALK') {
              this.mesh.rotation.x = 0;
            }

            // 非追擊時根據 movementStyle 呈現豐富步行風格
            if (this.movementStyle === 'JOGGING') {
              // 操場跑者慢跑：雙臂 90 度屈肘前後大幅度擺動，步伐輕快且帶有垂直律動
              const swing = Math.sin(this.animTimer) * 0.52;
              if (this.leftArm) this.leftArm.rotation.set(-0.75 - swing, 0, -0.15);
              if (this.rightArm) this.rightArm.rotation.set(-0.75 + swing, 0, 0.15);
              if (this.leftLeg) this.leftLeg.rotation.set(swing * 0.9, 0, 0);
              if (this.rightLeg) this.rightLeg.rotation.set(-swing * 0.9, 0, 0);
              this.mesh.position.y += Math.abs(Math.sin(this.animTimer * 2)) * 0.04;
            } else if (this.movementStyle === 'OFFICER_PATROL') {
              // 師長/糾察威嚴步巡：雙手背在身後，步伐沉穩有力
              if (this.leftArm) this.leftArm.rotation.set(0.38, 0.25, -0.15);
              if (this.rightArm) this.rightArm.rotation.set(0.38, -0.25, 0.15);
              const swing = Math.sin(this.animTimer) * 0.30;
              if (this.leftLeg) this.leftLeg.rotation.set(swing, 0, 0);
              if (this.rightLeg) this.rightLeg.rotation.set(-swing, 0, 0);
            } else if (this.movementStyle === 'HURRIED_WALK') {
              // 趕課疾走：手臂擺動大且身軀微微前傾
              const swing = Math.sin(this.animTimer) * 0.46;
              if (this.leftArm) this.leftArm.rotation.set(-swing, 0, 0);
              if (this.rightArm) this.rightArm.rotation.set(swing, 0, 0);
              if (this.leftLeg) this.leftLeg.rotation.set(swing, 0, 0);
              if (this.rightLeg) this.rightLeg.rotation.set(-swing, 0, 0);
              this.mesh.rotation.x = 0.06;
            } else {
              // CASUAL_WALK 輕鬆散步
              const swing = Math.sin(this.animTimer) * 0.32;
              if (this.leftArm) this.leftArm.rotation.set(-swing, 0, 0);
              if (this.rightArm) this.rightArm.rotation.set(swing, 0, 0);
              if (this.leftLeg) this.leftLeg.rotation.set(swing, 0, 0);
              if (this.rightLeg) this.rightLeg.rotation.set(-swing, 0, 0);
            }
          }
        }
      }
    }

    this.mesh.position.copy(this.position);
    // 犬科四足奔馳顛簸保留：修復覆蓋 Y 軸動畫起伏問題，保留垂直四足奔跑顛簸
    const isCanineRole = this.cfg.isCanine;
    if (isCanineRole && _npcMoveDir.lengthSq() > 0.05) {
      this.mesh.position.y += Math.abs(Math.sin(this.animTimer * 2)) * (currentSpeed > 6.0 ? 0.045 : 0.015);
    }

    // 頭頂 3D 浮動血條與告示牌永遠面朝視角/玩家 (0-GC 純量計算)
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    if (dx * dx + dz * dz > 0.01) {
      const ang = Math.atan2(dx, dz);
      this.hpBarGroup.rotation.y = ang - this.rotationY;
    }

    // 下雨天隨機對話氣泡 (限玩家周圍 25 米內，避免全場嘈雜，0-GC)
    if (isRaining && isOutdoorHumanoid && !this.isKnockedDown && !this.isChasing) {
      const distToPlayerSq = this.position.distanceToSquared(playerPos);
      if (distToPlayerSq < 625.0) { // < 25m
        this.rainChatTimer += delta;
        if (this.rainChatTimer >= this.rainChatNextTime) {
          this.rainChatTimer = 0;
          this.rainChatNextTime = 8.0 + Math.random() * 12.0;

          if (isThunderstorm && Math.random() < 0.40) {
            this.showSpeechBubble('⚡ 哇！這雷好嚇人！', true, 2.6);
          } else if (this.hasUmbrella) {
            const umbrellaLines = [
              '☔ 還好有帶傘',
              '☔ 幸好今天有帶傘！',
              '🌧️ 這雨下得真大...',
              '☔ 撐好傘慢慢走～'
            ];
            this.showSpeechBubble(umbrellaLines[Math.floor(Math.random() * umbrellaLines.length)], false, 2.5);
          } else {
            const noUmbrellaLines = [
              '🌧️ 雨好大！沒帶傘慘了！',
              '🏃 完蛋了沒帶傘！快跑！',
              '💦 衣服都要淋濕了！',
              '🏃 趕快找地方避雨！'
            ];
            this.showSpeechBubble(noUmbrellaLines[Math.floor(Math.random() * noUmbrellaLines.length)], true, 2.5);
          }
        }
      }
    } else {
      this.rainChatTimer = 0;
    }

    // 更新頭頂對話氣泡 (任何角色若有對話氣泡皆能正常更新淡出)
    if (this.skillBubble.isActive) {
      this.updateSkillBubble(delta);
    }
  }

  // 完整釋放 NPC 佔用的幾何體、材質、畫布與 GPU 紋理 (Resource Disposal)
  public dispose(scene?: THREE.Scene) {
    if (this.koBadgeTexture) {
      this.koBadgeTexture.dispose();
    }
    if (this.koBadgeSprite?.material) {
      this.koBadgeSprite.material.dispose();
    }
    this.skillBubble.dispose();
    this.afterimagePool?.dispose(scene);
    disposeNonShared(this.mesh);
    if (scene) {
      scene.remove(this.mesh);
    } else if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
