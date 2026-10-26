import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { soundManager } from '../audio/SoundEffects';
import { IndoorManager } from '../systems/IndoorManager';

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

export interface NPCAfterimageItem {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  life: number;
  maxLife: number;
}

// 模組頂層靜態共享 Scratch Vectors (0-GC 避免每幀垃圾回收引發微卡頓)
const _npcMoveDir = new THREE.Vector3();
const _npcToPlayer = new THREE.Vector3();
const _npcForward = new THREE.Vector3();
const _npcEyePos = new THREE.Vector3();
const _npcTargetEye = new THREE.Vector3();
const _npcLookTarget = new THREE.Vector3();
const _npcSafeTeleportResult = new THREE.Vector3();

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
  public bossChargeCooldown: number = 5.0;
  public bossIsCharging: boolean = false;
  public bossChargeDir: THREE.Vector3 = new THREE.Vector3();
  public bossShieldCharges: number = 3;

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
  private bikeFrontWheel?: THREE.Mesh;
  private bikeRearWheel?: THREE.Mesh;
  private bikeParts: THREE.Object3D[] = [];
  private bikeModelParts: THREE.Object3D[] = []; // 騎車姿態模型全部零件 (單車 + 坐姿騎士)

  private hpBarGroup: THREE.Group;
  private hpBarBgMesh: THREE.Mesh;
  private hpBarMesh: THREE.Mesh;
  private koBadgeSprite: THREE.Sprite;
  private koBadgeCanvas: HTMLCanvasElement;
  private koBadgeTexture: THREE.CanvasTexture;
  private lastKoBadgeSec: number = -1;

  // 閃身步老師 (DODGE_TEACHER) 專屬宗師身法系統
  private sceneRef?: THREE.Scene;
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
  private afterimages: NPCAfterimageItem[] = [];
  private afterimageIndex: number = 0;

  // 下雨天撐傘與避雨行為
  public hasUmbrella: boolean = false;
  private umbrellaMesh?: THREE.Group;
  private rainChatTimer: number = 0;
  private rainChatNextTime: number = 6.0;
  private isDogSheltering: boolean = false;
  private originalDogWaypoints: THREE.Vector3[] = [];
  public static readonly DOG_SHELTER_POS = new THREE.Vector3(24.0, 0, 15.0);

  // 頭頂技能名稱對話氣泡 (3D Billboard Sprite)
  private skillBubbleSprite?: THREE.Sprite;
  private skillBubbleCanvas?: HTMLCanvasElement;
  private skillBubbleContext?: CanvasRenderingContext2D;
  private skillBubbleTexture?: THREE.CanvasTexture;
  private skillBubbleTimer: number = 0;
  private skillBubbleDuration: number = 1.35;
  private skillBubbleBaseY: number = 2.45;

  constructor(
    scene: THREE.Scene,
    startPos: THREE.Vector3,
    role: NPCRole,
    waypoints: THREE.Vector3[] = [],
    movementStyle?: NPCMovementStyle
  ) {
    this.position = startPos.clone();
    this.baseFloorY = startPos.y; // 鎖定 NPC 所屬樓層高度基準
    this.role = role;
    this.sceneRef = scene;
    this.patrolWaypoints = waypoints.length > 0 ? waypoints : [startPos.clone(), new THREE.Vector3(startPos.x + 8, startPos.y, startPos.z)];

    // 隨機速度自然微擾動 (+/- 0.25 m/s)，破除千篇一律的僵硬同速
    const speedJitter = (Math.random() - 0.5) * 0.5;

    // 初始化各角色數值與多樣性風格
    if (role === 'DODGE_TEACHER') {
      // 閃身步老師 (教學大樓身法宗師)：血量 9999，行走 4.5，跑步 9.0
      this.maxHp = 9999;
      this.speed = 4.5;
      this.chaseSpeed = 9.0;
      this.attackPower = 0;
      this.attackRange = 2.0;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.50;
    } else if (role === 'PE_TEACHER_BOSS') {
      // 大如老師 (4F 羽球教練)：血量 950，行走 4.2，跑步 8.5，近戰 28，反擊範圍 2.4
      this.maxHp = 950;
      this.speed = 4.2;
      this.chaseSpeed = 8.5;
      this.attackPower = 28;
      this.attackRange = 2.4;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.40;
    } else if (role === 'TEACHER' || role === 'INSTRUCTOR') {
      // 生教組長 / 教官：血量 315，威嚴步巡
      this.maxHp = 315;
      this.speed = 4.8 + speedJitter;
      this.chaseSpeed = 10.0;
      this.attackPower = 36;
      this.attackRange = 1.8;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.55;
    } else if (role === 'BANDIT') {
      // 校外強盜：手持砍刀在圍牆外徘徊
      this.maxHp = 180;
      this.speed = 8.5 + speedJitter * 0.6;
      this.chaseSpeed = 16.5;
      this.attackPower = 44;
      this.attackRange = 1.9;
      this.movementStyle = movementStyle || 'CASUAL_WALK';
      this.pauseChance = 0.40;
    } else if (role === 'DOG') {
      // 校犬柴柴：敏捷四足犬，草皮漫步嗅聞與端坐休養
      this.maxHp = 630;
      this.speed = 3.8 + speedJitter * 0.4;
      this.chaseSpeed = 11.5;
      this.attackPower = 30;
      this.attackRange = 2.0;
      this.movementStyle = 'CASUAL_WALK';
      this.pauseChance = 0.65;
    } else if (role === 'BIKE_PATROL') {
      // 火柴人自行車騎士：巡邏與追捕速度統一為 15.0
      this.maxHp = 225;
      this.speed = 15.0;
      this.chaseSpeed = 15.0;
      this.attackPower = 26;
      this.attackRange = 2.4;
      this.movementStyle = 'CASUAL_WALK';
      this.pauseChance = 0.30;
    } else if (role === 'DETENTION_GUARD') {
      // 特訓教官：血量 160，防暴海綿盾與指揮棒，格擋免傷 35%，吹哨召集同伴
      this.maxHp = 160;
      this.speed = 4.2 + speedJitter * 0.3;
      this.chaseSpeed = 7.6;
      this.attackPower = 12;
      this.attackRange = 2.0;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.45;
    } else if (role === 'DETENTION_SENIOR') {
      // 特訓資深學長：血量 130，移動敏捷，遵循切磋規矩 (不主動圍毆)
      this.maxHp = 130;
      this.speed = 4.8 + speedJitter * 0.4;
      this.chaseSpeed = 8.2;
      this.attackPower = 14;
      this.attackRange = 2.0;
      this.movementStyle = movementStyle || 'HURRIED_WALK';
      this.pauseChance = 0.40;
    } else if (role === 'DETENTION_HEAVY') {
      // 重訓霸榜生：血量 220，重拳霸體，移動緩慢易拉扯
      this.maxHp = 220;
      this.speed = 3.6 + speedJitter * 0.3;
      this.chaseSpeed = 6.6;
      this.attackPower = 18;
      this.attackRange = 2.0;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.50;
    } else if (role === 'DETENTION_WOLF') {
      // 特訓狼犬：血量 105 (脆皮敏捷)，速度平衡為 8.6 m/s (玩家疾跑 10.0 m/s 可擺脫)
      this.maxHp = 105;
      this.speed = 4.2 + speedJitter * 0.3;
      this.chaseSpeed = 8.6;
      this.attackPower = 10;
      this.attackRange = 2.0;
      this.movementStyle = 'JOGGING';
      this.pauseChance = 0.40;
    } else if (role === 'DETENTION_BOSS') {
      // 總教官 Boss【鐵面總長】：血量 420，威嚴寸勁重拳與身法反擊
      this.maxHp = 420;
      this.speed = 4.2;
      this.chaseSpeed = 8.0;
      this.attackPower = 20;
      this.attackRange = 2.0;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.35;
    } else if (role === 'INSPECTOR') {
      // 風紀糾察 (步巡)：雙手負後巡查校園
      this.maxHp = 158;
      this.speed = 4.9 + speedJitter;
      this.chaseSpeed = 10.0;
      this.attackPower = 18;
      this.attackRange = 1.8;
      this.movementStyle = movementStyle || 'OFFICER_PATROL';
      this.pauseChance = 0.55;
    } else {
      // 平民學生 (多樣風格：散步、疾走、慢跑等)
      this.maxHp = 112;
      this.movementStyle = movementStyle || (Math.random() < 0.25 ? 'HURRIED_WALK' : 'CASUAL_WALK');
      if (this.movementStyle === 'JOGGING') {
        this.speed = 7.6 + speedJitter * 0.8; // 7.2 ~ 8.0 m/s
        this.chaseSpeed = 10.8;
        this.pauseChance = 0.25;
      } else if (this.movementStyle === 'HURRIED_WALK') {
        this.speed = 5.9 + speedJitter * 0.6; // 5.6 ~ 6.2 m/s
        this.chaseSpeed = 10.0;
        this.pauseChance = 0.45;
      } else if (this.movementStyle === 'OFFICER_PATROL') {
        this.speed = 4.8 + speedJitter;
        this.chaseSpeed = 10.0;
        this.pauseChance = 0.55;
      } else {
        // CASUAL_WALK 輕鬆散步學生
        this.speed = 4.4 + speedJitter * 0.6; // 4.1 ~ 4.7 m/s
        this.chaseSpeed = 9.8;
        this.pauseChance = 0.60;
      }
      this.attackPower = 12;
      this.attackRange = 1.6;
    }
    this.hp = this.maxHp;
    this.chasePacingTimer = 1.5 + Math.random() * 2.0;
    this.dynamicSpeed = this.speed;

    // 下雨天隨身攜帶雨傘機率 (平民學生與師長約 75% 攜傘，25% 無傘；少年院特訓群不持傘)
    if (
      role !== 'DOG' &&
      role !== 'BIKE_PATROL' &&
      role !== 'BANDIT' &&
      role !== 'PE_TEACHER_BOSS' &&
      role !== 'DETENTION_GUARD' &&
      role !== 'DETENTION_SENIOR' &&
      role !== 'DETENTION_HEAVY' &&
      role !== 'DETENTION_WOLF' &&
      role !== 'DETENTION_BOSS'
    ) {
      this.hasUmbrella = Math.random() < 0.75;
    }

    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ';
    this.mesh.position.copy(this.position);

    // 依角色建造不同 3D 外觀模型
    if (role === 'DOG' || role === 'DETENTION_WOLF') {
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
    }

    // 頭頂 3D 浮動血條與昏迷倒數告示牌組 (面朝攝影機視角，清晰易辨)
    const hpY = (role === 'DOG' || role === 'DETENTION_WOLF') ? 1.05 : 2.05;
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, hpY, 0);

    // 1. 血條深色底襯框
    const bgGeo = new THREE.BoxGeometry(0.84, 0.11, 0.05);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.hpBarBgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.hpBarGroup.add(this.hpBarBgMesh);

    // 2. 綠色/黃色/紅色動態血條 (幾何體自左側向右縮放)
    const hpGeo = new THREE.BoxGeometry(0.80, 0.07, 0.07);
    hpGeo.translate(0.40, 0, 0); // 錨點設在左側，縮放時從左向右展開
    const hpMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    this.hpBarMesh = new THREE.Mesh(hpGeo, hpMat);
    this.hpBarMesh.position.set(-0.40, 0, 0.01);
    this.hpBarGroup.add(this.hpBarMesh);

    // 3. 昏睡倒地狀態告示牌 (CanvasTexture 呈現動態倒數秒數)
    this.koBadgeCanvas = document.createElement('canvas');
    this.koBadgeCanvas.width = 256;
    this.koBadgeCanvas.height = 64;
    this.koBadgeTexture = new THREE.CanvasTexture(this.koBadgeCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: this.koBadgeTexture, transparent: true, depthTest: false });
    this.koBadgeSprite = new THREE.Sprite(spriteMat);
    this.koBadgeSprite.scale.set(1.4, 0.35, 1);
    this.koBadgeSprite.position.set(0, 0.28, 0);
    this.koBadgeSprite.visible = false;
    this.hpBarGroup.add(this.koBadgeSprite);

    this.mesh.add(this.hpBarGroup);

    scene.add(this.mesh);

    // 閃身步老師 (DODGE_TEACHER) 專屬技能對話氣泡與 0-GC 殘影物件池
    if (this.role === 'DODGE_TEACHER') {
      this.initSkillBubble();

      // 初始化 8 組常駐殘影物件池 (0-GC，常駐場景)
      const afterimageTorsoGeo = new THREE.BoxGeometry(0.65, 0.75, 0.35);
      const afterimageHeadGeo = new THREE.BoxGeometry(0.38, 0.4, 0.38);
      const afterimageArmGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
      const afterimageLegGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);

      for (let i = 0; i < 8; i++) {
        const g = new THREE.Group();
        g.rotation.order = 'YXZ';
        const mat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0,
          depthWrite: false
        });

        const bMesh = new THREE.Mesh(afterimageTorsoGeo, mat);
        bMesh.position.y = 1.05;
        g.add(bMesh);

        const hMesh = new THREE.Mesh(afterimageHeadGeo, mat);
        hMesh.position.y = 1.62;
        g.add(hMesh);

        const lArmMesh = new THREE.Mesh(afterimageArmGeo, mat);
        lArmMesh.position.set(-0.45, 1.05, 0);
        g.add(lArmMesh);

        const rArmMesh = new THREE.Mesh(afterimageArmGeo, mat);
        rArmMesh.position.set(0.45, 1.05, 0);
        g.add(rArmMesh);

        const lLegMesh = new THREE.Mesh(afterimageLegGeo, mat);
        lLegMesh.position.set(-0.18, 0.35, 0);
        g.add(lLegMesh);

        const rLegMesh = new THREE.Mesh(afterimageLegGeo, mat);
        rLegMesh.position.set(0.18, 0.35, 0);
        g.add(rLegMesh);

        g.visible = false;
        scene.add(g);

        this.afterimages.push({
          group: g,
          materials: [mat],
          life: 0,
          maxLife: 0.3
        });
      }
    }
  }

  // 更新昏迷休養倒數秒數告示牌 (加入 lastKoBadgeSec 快取節流，僅在秒數變更時重繪)
  private updateKOBadge(secondsLeft: number) {
    if (this.isPermanentlyKnockedOut) {
      if (this.lastKoBadgeSec === -999) return;
      this.lastKoBadgeSec = -999;
      const ctx = this.koBadgeCanvas.getContext('2d');
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
      this.koBadgeTexture.needsUpdate = true;
      this.koBadgeSprite.visible = true;
      return;
    }

    const sec = Math.ceil(Math.max(0, secondsLeft));
    if (sec === this.lastKoBadgeSec) return;
    this.lastKoBadgeSec = sec;

    const ctx = this.koBadgeCanvas.getContext('2d');
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

    this.koBadgeTexture.needsUpdate = true;
  }

  // 設定 MGS 警戒狀態並更新頭頂懸浮圖示 (❓ / ❗)
  public setAlertState(state: 'NORMAL' | 'CAUTION' | 'ALERT') {
    if (this.isKnockedDown || this.isPermanentlyKnockedOut) return;
    this.alertState = state;
    const ctx = this.koBadgeCanvas.getContext('2d');
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
      this.koBadgeTexture.needsUpdate = true;
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
      this.koBadgeTexture.needsUpdate = true;
      this.koBadgeSprite.visible = true;
    }
  }

  // 潛龍諜影無聲 CQC 擊昏 (從 NPC 背後 1.8m 內發動，永久癱瘓不重生)
  public knockoutSilently() {
    this.hp = 0;
    this.isKnockedDown = true;
    this.isPermanentlyKnockedOut = true;
    this.reviveTimer = 999999;
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.alertState = 'NORMAL';

    if (this.hpBarBgMesh) this.hpBarBgMesh.visible = false;
    if (this.hpBarMesh) this.hpBarMesh.visible = false;
    if (this.umbrellaMesh) this.umbrellaMesh.visible = false;

    this.updateKOBadge(999999);

    // 肢體鬆開平貼地面
    if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
    if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);

    if (this.role === 'DETENTION_WOLF' || this.role === 'DOG') {
      this.mesh.rotation.set(0, this.rotationY, Math.PI / 2);
      this.mesh.position.y = this.baseFloorY + 0.2;
    } else {
      this.mesh.rotation.set(-Math.PI / 2, 0, this.rotationY);
      this.mesh.position.y = this.baseFloorY + 0.25;
    }
  }

  // 總教官撞柱硬直機制 (Stunned)
  public stunBoss(duration: number = 3.5) {
    if (this.role !== 'DETENTION_BOSS' || this.isKnockedDown) return;
    this.isBossStunned = true;
    this.bossStunTimer = duration;
    this.bossIsCharging = false;
    this.isChasing = false;

    // 顯示硬直星星
    const ctx = this.koBadgeCanvas.getContext('2d');
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
      this.koBadgeTexture.needsUpdate = true;
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
  }

  // 2. 建造騎單車糾察隊 3D 模型
  private buildBikePatrolModel() {
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const rubberMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1b263b });
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

    // 註冊單車專屬零件供失竊時清理與處置
    this.bikeParts = [this.bikeRearWheel, this.bikeFrontWheel, frameTube, handlebar];

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
  }

  // 3. 建造普通人型 NPC 3D 模型 (生教、步巡糾察、普通學生)
  private buildHumanoidModel() {
    this.humanoidParts = [];
    const addHumanoidPart = (part: THREE.Object3D) => {
      this.mesh.add(part);
      this.humanoidParts.push(part);
    };

    let shirtColor = 0xf8f9fa;
    let pantsColor = 0x1b263b;

    if (this.role === 'INSPECTOR') {
      shirtColor = 0xffffff;
      pantsColor = 0x1b263b;
    } else if (this.role === 'TEACHER') {
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

    // 頭部
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    addHumanoidPart(head);
    this.headMesh = head;

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), hairMat);
    hair.position.set(0, 0.16, 0);
    head.add(hair);

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
  }

  // 建造 3D Low-Poly 雨傘模型 (傘中棒、握把、10 角多邊傘面、頂端金屬針)
  private buildUmbrellaModel(): THREE.Group {
    const umbrella = new THREE.Group();
    umbrella.name = 'umbrella';

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

    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.6, roughness: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const canopyMat = new THREE.MeshLambertMaterial({
      color: canopyColor,
      side: THREE.DoubleSide
    });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.8, roughness: 0.2 });

    // 內部微調容器 (使傘面中心精確位於頭頂中央上方)
    const rig = new THREE.Group();
    rig.position.set(-0.16, 0, -0.06);

    // 1. 傘中棒 (Shaft) - 向上延伸 1.15m
    const shaftGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.15, 8);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 0.50;
    rig.add(shaft);

    // 2. 傘柄握把 (Grip)
    const handleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -0.05;
    rig.add(handle);

    // 3. 傘帽圓錐 (Canopy) - 10 角傘骨造型
    const canopyGeo = new THREE.ConeGeometry(0.68, 0.34, 10, 1, true);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 0.96;
    canopy.castShadow = true;
    rig.add(canopy);

    // 4. 傘頂金屬尖端 (Ferrule Tip)
    const tipGeo = new THREE.CylinderGeometry(0.01, 0.02, 0.10, 8);
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 1.16;
    rig.add(tip);

    umbrella.add(rig);
    umbrella.visible = false;
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
      case 'STUDENT': default: return '同學';
    }
  }

  // 受到傷害
  public takeDamage(amount: number): boolean {
    if (this.isKnockedDown || this.isPermanentlyKnockedOut) return false;
    if (this.isPaused) this.cancelPause();
    if (this.role === 'DODGE_TEACHER') {
      if (this.isDodging || this.isBearShaking) return false;
      // 閃身步老師受擊防衛：50% 機率隨機施展「閃身步」或「狗熊哆嗦毛」
      if (Math.random() < 0.5) {
        this.performFlashStep(this.lastColliders);
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
        this.performFlashStep(this.lastColliders);
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
      (this.hpBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0xe74c3c);
    } else if (ratio < 0.65) {
      (this.hpBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0xf39c12);
    } else {
      (this.hpBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0x2ecc71);
    }

    // 血量歸零：倒地倒下，碰撞箱全面失效 (第二世界永久擊昏不重生)
    if (this.hp <= 0) {
      this.isKnockedDown = true;
      if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
      this.isChasing = false;
      this.isBurstSprinting = false;
      this.dynamicSpeed = this.speed;

      const isDetention = this.role.startsWith('DETENTION');
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
        this.performFlashStep(this.lastColliders);
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
  public triggerAttackAnimation(delta: number = 0.016) {
    this.attackAnimTimer = 0.35;
    if (this.role === 'DOG' || this.role === 'DETENTION_WOLF') {
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

  // 獲取各角色攻擊傷害與擊飛衝量規格
  public getAttackSpecs(): { damage: number; hForce: number; vForce: number } {
    switch (this.role) {
      case 'DODGE_TEACHER':
        return { damage: 0, hForce: 5.0, vForce: 2.0 };
      case 'PE_TEACHER_BOSS':
        // 大如老師：羽球拍近戰殺球重扣，極高傷害與震飛
        return { damage: 28, hForce: 13.0, vForce: 7.0 };
      case 'DETENTION_BOSS':
        // 鐵面總長：威嚴寸勁重拳 (傷害 20，衝量平衡)
        return { damage: 20, hForce: 10.0, vForce: 4.5 };
      case 'DETENTION_HEAVY':
        // 重訓霸榜生：超重拳出擊 (傷害 18，強力擊退拉開距離，避免連擊秒殺)
        return { damage: 18, hForce: 12.0, vForce: 5.0 };
      case 'DETENTION_WOLF':
        // 特訓狼犬：飛撲咬擊 (傷害 10，玩家可從容反擊)
        return { damage: 10, hForce: 7.0, vForce: 3.5 };
      case 'DETENTION_GUARD':
        // 特訓教官：防暴警棍猛擊 (傷害 12)
        return { damage: 12, hForce: 7.0, vForce: 3.0 };
      case 'DETENTION_SENIOR':
        // 特訓資深學長：切磋拳法 (傷害 14)
        return { damage: 14, hForce: 8.0, vForce: 3.5 };
      case 'BANDIT':
        // 校外強盜：手持利刃猛烈劈砍，攻速快且傷害高 (攻擊力提高兩倍)
        return { damage: 44, hForce: 10.0, vForce: 5.5 };
      case 'TEACHER':
        // 生教組長/教官：強烈教官拳擊，強力擊退擊飛
        return { damage: 28, hForce: 10.0, vForce: 6.0 };
      case 'DOG':
        // 校犬柴柴：兇猛飛撲咬擊，極高水平衝撞力
        return { damage: 24, hForce: 11.5, vForce: 5.0 };
      case 'BIKE_PATROL':
        // 單車糾察隊：單車前輪猛烈撞擊，高拋擊飛
        return { damage: 22, hForce: 12.5, vForce: 6.5 };
      case 'INSPECTOR':
        // 風紀糾察：維安揮擊
        return { damage: 18, hForce: 8.0, vForce: 4.5 };
      case 'STUDENT':
      default:
        // 平民學生：反擊揮拳
        return { damage: 12, hForce: 6.0, vForce: 3.5 };
    }
  }

  // 失去自行車 (遭到玩家搶奪，妥善卸除並釋放單車零件與幾何體)
  public loseBike() {
    if (this.isPaused) this.cancelPause();
    for (let i = 0; i < this.bikeParts.length; i++) {
      const part = this.bikeParts[i];
      part.visible = false;
      this.mesh.remove(part);
      if ((part as THREE.Mesh).isMesh) {
        const mesh = part as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      }
    }
    this.bikeParts.length = 0;
    // 移除並釋放坐姿騎士身體 (軀幹、頭、帽、臂章、手臂、彎曲雙腿)
    for (const part of this.bikeModelParts) {
      this.mesh.remove(part);
      const m = part as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
      if (m.isMesh && m.material) {
        if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
        else m.material.dispose();
      }
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

  // 恢復騎乘單車巡邏狀態 (復活時還原為單車巡邏同學)
  public restoreBikePatrol() {
    // 妥善銷毀並從 this.mesh 移除 this.humanoidParts 的幾何體與材質
    for (const part of this.humanoidParts) {
      this.mesh.remove(part);
      part.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          if (m.geometry) m.geometry.dispose();
          if (m.material) {
            if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
            else m.material.dispose();
          }
        }
      });
    }
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

  // 羽球教練發射羽球 (羽球小遊戲：飛行速度 11.5 m/s，高弧度過網，靜態幾何複用 0-GC)
  public tryShootShuttlecock(targetPos: THREE.Vector3, scene: THREE.Scene, cooldown: number = 2.2): ShuttlecockProjectile | null {
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

    // 合理化羽球飛行速度：11.5 m/s，並略帶微弧線上拋過網 (純純量運算，0 暫存 Vector3 分配)
    const toTargetX = targetPos.x - startPos.x;
    const toTargetY = (targetPos.y + 0.8) - startPos.y;
    const toTargetZ = targetPos.z - startPos.z;
    const horizDist = Math.max(2.0, Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ));
    const speed = 11.5; // 合理羽球速度 (11.5 m/s)
    const flightTime = horizDist / speed;

    const velX = toTargetX / flightTime;
    const velZ = toTargetZ / flightTime;
    // 考慮網高與重力：過網弧線
    const velY = (toTargetY / flightTime) + 0.5 * 9.8 * flightTime + 0.8;

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

    if (this.role === 'DOG') {
      this.currentIdleBehavior = Math.random() < 0.6 ? 'DOG_SNIFF' : 'DOG_SIT';
      this.pauseTimer = this.currentIdleBehavior === 'DOG_SNIFF'
        ? (3.0 + Math.random() * 2.5)
        : (4.0 + Math.random() * 3.0);
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
      if (this.role === 'DOG') {
        this.mesh.position.y = this.baseFloorY;
      }
    }
  }

  // 待機/發呆行為多樣性程序化動作 (0-GC 純量運算)
  private applyIdleAnimation(delta: number) {
    if (this.role === 'DOG') {
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
        if (this.leftArm) this.leftArm.rotation.set(0, 0, -0.05);
        if (this.rightArm) this.rightArm.rotation.set(0, 0, 0.05);
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

  // 清除仇恨與追擊狀態
  public resetAggro() {
    this.isChasing = false;
    this.isBurstSprinting = false;
    this.dynamicSpeed = this.speed;
    this.chasePacingTimer = 1.5 + Math.random() * 2.0;
    this.whistleCooldown = 3.0;
    this.lostSightTimer = 0;
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

  // 3D 線段與軸對齊包圍盒 (AABB) 相交檢測
  private segmentIntersectsAABB(p1: THREE.Vector3, p2: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): boolean {
    return NPC.segmentIntersectsAABBCoords(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, min, max);
  }

  // 3D 視錐與障礙物遮擋檢測 (Line of Sight with Obstacle Occlusion, 0-GC 純純量運算)
  public canSeePlayer(playerPos: THREE.Vector3, colliders: CollidableBox[] = []): boolean {
    if (this.isKnockedDown) return false;

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
    const maxViewDist = (this.role === 'DOG' || this.role === 'DETENTION_WOLF') ? 22.0 :
      (this.role === 'DETENTION_BOSS' || this.role === 'DETENTION_GUARD') ? 22.0 :
      this.role === 'BIKE_PATROL' ? 16.0 : 14.0;
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

    // 3D 視線障礙物遮擋檢測 (Line of Sight Raycast against Walls & Solid Objects)
    if (colliders.length > 0) {
      const eyeY = this.role === 'DOG' ? 0.6 : 1.5;
      const eyePosX = this.position.x;
      const eyePosY = this.position.y + eyeY;
      const eyePosZ = this.position.z;
      const targetEyeX = playerPos.x;
      const targetEyeY = playerPos.y + 1.2;
      const targetEyeZ = playerPos.z;

      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        if (box.isFloorOnly) continue; // 地板/坡道不遮擋水平視線
        if (NPC.segmentIntersectsAABBCoords(eyePosX, eyePosY, eyePosZ, targetEyeX, targetEyeY, targetEyeZ, box.min, box.max)) {
          return false; // 視線被實體牆壁、門框或障礙物阻擋！
        }
      }
    }

    return true;
  }

  // 檢測指定 (X, Z) 位置下方的真實支撐面 (最高樓板、坡道或地面 Y = 0)
  private getFloorHeightAt(posX: number, posY: number, posZ: number, colliders: CollidableBox[]): number {
    let supportFloorY = 0;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box.isFloorOnly || box.isRamp) {
        if (
          posX >= box.min.x && posX <= box.max.x &&
          posZ >= box.min.z && posZ <= box.max.z
        ) {
          let floorTop = box.max.y;
          if (box.isRamp && box.rampMinZ !== undefined && box.rampMaxZ !== undefined && box.rampYAtMinZ !== undefined && box.rampYAtMaxZ !== undefined) {
            const t = THREE.MathUtils.clamp((posZ - box.rampMinZ) / (box.rampMaxZ - box.rampMinZ), 0, 1);
            floorTop = box.rampYAtMinZ + t * (box.rampYAtMaxZ - box.rampYAtMinZ);
          }
          if (floorTop <= posY + 0.6 && floorTop > supportFloorY) {
            supportFloorY = floorTop;
          }
        }
      }
    }
    return supportFloorY;
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
    isPlayerSprinting: boolean = false
  ) {
    if (isPlayerDead || this.isPermanentlyKnockedOut) {
      this.resetAggro();
      return;
    }

    // 小 Boss 硬直狀態：無法行動與追逐
    if (this.isBossStunned) {
      this.bossStunTimer -= delta;
      if (this.bossStunTimer <= 0) {
        this.isBossStunned = false;
        this.setAlertState('ALERT');
        this.isChasing = true;
      }
      return;
    }

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

    const isDetentionRole =
      this.role === 'DETENTION_GUARD' ||
      this.role === 'DETENTION_SENIOR' ||
      this.role === 'DETENTION_HEAVY' ||
      this.role === 'DETENTION_WOLF' ||
      this.role === 'DETENTION_BOSS';

    // 第二世界專屬 MGS 潛入與警戒 AI
    if (isDetentionRole) {
      if (isSpawnGraceActive) {
        if (this.isChasing) this.resetAggro();
        return;
      }

      const distSq = this.position.distanceToSquared(playerPos);
      const seesPlayer = this.canSeePlayer(playerPos, colliders);

      // 總教官衝鋒衝撞冷卻與觸發
      if (this.role === 'DETENTION_BOSS' && this.isChasing && !this.bossIsCharging && !this.isBossStunned) {
        this.bossChargeCooldown -= delta;
        if (this.bossChargeCooldown <= 0 && distSq > 36.0 && distSq < 400.0) {
          this.bossIsCharging = true;
          this.bossChargeCooldown = 6.5;
          this.bossChargeDir.subVectors(playerPos, this.position).setY(0).normalize();
        }
      }

      // 1. 視覺發現判定 (正面 90 度視線錐 + 射線無障礙)
      if (seesPlayer) {
        if (this.isPaused) this.cancelPause();
        this.setAlertState('ALERT');
        this.isChasing = true;
        this.lostSightTimer = 0;
        this.lastKnownPos.copy(playerPos);

        if (this.whistleCooldown <= 0) {
          if (this.role === 'DETENTION_WOLF') soundManager.playDogBark();
          else if (this.role === 'DETENTION_GUARD' || this.role === 'DETENTION_BOSS') soundManager.playWhistle();
          this.whistleCooldown = 8.0;
        }
        onSpotPlayer();
        return;
      }

      // 2. 聽覺音效判定 (當未看見玩家時，判定腳步噪音)
      if (!this.isChasing) {
        if (isPlayerSneaking) {
          // 靜音潛行 (Ctrl / 搖桿 < 0.5)：0 噪音！守衛不會察覺背後接近
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

      // 3. 追逐中的脫離與搜索
      if (this.isChasing) {
        if (!seesPlayer) {
          this.lostSightTimer += delta;
          const maxLostTime = this.role === 'DETENTION_WOLF' ? 6.5 : 5.0;
          const maxDistSq = 3600.0; // 60m 警報追捕搜索範圍
          if (this.lostSightTimer >= maxLostTime || distSq > maxDistSq) {
            this.resetAggro();
            this.setAlertState('NORMAL');
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
    const seesPlayer = this.canSeePlayer(playerPos, colliders);

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
  public performFlashStep(colliders: CollidableBox[] = []) {
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
    const halfWidth = 0.45;
    const height = 1.8;
    const minRadius = 1.8;
    const maxRadius = 4.2;

    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const candX = centerX + Math.cos(angle) * dist;
      const candZ = centerZ + Math.sin(angle) * dist;

      let blocked = false;
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        if (box.isFloorOnly) continue;
        if (
          candX + halfWidth > box.min.x &&
          candX - halfWidth < box.max.x &&
          candZ + halfWidth > box.min.z &&
          candZ - halfWidth < box.max.z &&
          currentY + height > box.min.y &&
          currentY + 0.3 < box.max.y
        ) {
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        let groundY = this.baseFloorY;
        for (let i = 0; i < colliders.length; i++) {
          const box = colliders[i];
          if (
            candX + halfWidth > box.min.x &&
            candX - halfWidth < box.max.x &&
            candZ + halfWidth > box.min.z &&
            candZ - halfWidth < box.max.z
          ) {
            if (box.isRamp && box.rampMinZ !== undefined && box.rampMaxZ !== undefined && box.rampYAtMinZ !== undefined && box.rampYAtMaxZ !== undefined) {
              const t = THREE.MathUtils.clamp((candZ - box.rampMinZ) / (box.rampMaxZ - box.rampMinZ), 0, 1);
              const rampY = box.rampYAtMinZ + t * (box.rampYAtMaxZ - box.rampYAtMinZ);
              if (rampY <= currentY + 0.85 && rampY > groundY) {
                groundY = rampY;
              }
            } else {
              if (box.max.y <= currentY + 0.85 && box.max.y > groundY) {
                groundY = box.max.y;
              }
            }
          }
        }
        _npcSafeTeleportResult.set(candX, groundY, candZ);
        return _npcSafeTeleportResult;
      }
    }

    _npcSafeTeleportResult.set(centerX, currentY, centerZ);
    return _npcSafeTeleportResult;
  }

  // 產生 0-GC 角色殘影
  private spawnAfterimage(colorHex: number, duration: number) {
    if (this.afterimages.length === 0) return;
    const item = this.afterimages[this.afterimageIndex];
    this.afterimageIndex = (this.afterimageIndex + 1) % this.afterimages.length;

    item.materials[0].color.setHex(colorHex);
    item.materials[0].opacity = 0.75;
    item.life = duration;
    item.maxLife = duration;

    item.group.position.copy(this.position);
    item.group.rotation.copy(this.mesh.rotation);

    const children = item.group.children;
    if (this.headMesh && children[1]) children[1].rotation.copy(this.headMesh.rotation);
    if (this.leftArm && children[2]) children[2].rotation.copy(this.leftArm.rotation);
    if (this.rightArm && children[3]) children[3].rotation.copy(this.rightArm.rotation);
    if (this.leftLeg && children[4]) children[4].rotation.copy(this.leftLeg.rotation);
    if (this.rightLeg && children[5]) children[5].rotation.copy(this.rightLeg.rotation);

    item.group.visible = true;
  }

  // 每幀更新殘影透明度與生命週期
  public updateAfterimages(delta: number) {
    for (let i = 0; i < this.afterimages.length; i++) {
      const item = this.afterimages[i];
      if (item.life > 0) {
        item.life -= delta;
        if (item.life <= 0) {
          item.life = 0;
          item.group.visible = false;
        } else {
          const ratio = item.life / item.maxLife;
          item.materials[0].opacity = 0.75 * Math.sin(ratio * Math.PI * 0.5);
        }
      }
    }
  }

  // 延遲初始化對話氣泡 Sprite (0-GC，按需建立畫布與紋理)
  private initSkillBubble() {
    if (this.skillBubbleSprite) return;

    this.skillBubbleCanvas = document.createElement('canvas');
    this.skillBubbleCanvas.width = 380;
    this.skillBubbleCanvas.height = 110;
    this.skillBubbleContext = this.skillBubbleCanvas.getContext('2d')!;
    this.skillBubbleTexture = new THREE.CanvasTexture(this.skillBubbleCanvas);
    this.skillBubbleTexture.minFilter = THREE.LinearFilter;

    const bubbleMat = new THREE.SpriteMaterial({
      map: this.skillBubbleTexture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false
    });
    this.skillBubbleSprite = new THREE.Sprite(bubbleMat);
    this.skillBubbleSprite.scale.set(2.2, 0.64, 1.0);
    this.skillBubbleSprite.position.set(0, this.skillBubbleBaseY, 0);
    this.skillBubbleSprite.visible = false;
    this.mesh.add(this.skillBubbleSprite);
  }

  // 繪製頭頂技能名稱對話方框 (CanvasTexture 0-GC)
  private drawSkillBubble(text: string, isAdvanced: boolean) {
    this.initSkillBubble();
    if (!this.skillBubbleContext || !this.skillBubbleCanvas) return;
    const ctx = this.skillBubbleContext;
    const w = this.skillBubbleCanvas.width;
    const h = this.skillBubbleCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const bubbleW = w - 24;
    const bubbleH = h - 28;
    const x = 12;
    const y = 8;
    const r = 22;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bubbleW - r, y);
    ctx.quadraticCurveTo(x + bubbleW, y, x + bubbleW, y + r);
    ctx.lineTo(x + bubbleW, y + bubbleH - r);
    ctx.quadraticCurveTo(x + bubbleW, y + bubbleH, x + bubbleW - r, y + bubbleH);
    ctx.lineTo(w / 2 + 12, y + bubbleH);
    ctx.lineTo(w / 2, y + bubbleH + 16);
    ctx.lineTo(w / 2 - 12, y + bubbleH);
    ctx.lineTo(x + r, y + bubbleH);
    ctx.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();

    ctx.strokeStyle = isAdvanced ? 'rgba(168, 85, 247, 0.85)' : 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    const fontSize = text.length > 9 ? 24 : (text.length > 6 ? 28 : 34);
    ctx.font = `bold ${fontSize}px "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, w / 2, y + bubbleH / 2 - 1);

    ctx.restore();
    if (this.skillBubbleTexture) this.skillBubbleTexture.needsUpdate = true;
  }

  // 通用頭頂氣泡對話彈出方法 (可自訂顯示時間)
  public showSpeechBubble(text: string, isSpecial: boolean = false, duration: number = 2.4) {
    this.initSkillBubble();
    this.skillBubbleDuration = duration;
    this.drawSkillBubble(text, isSpecial);
    this.skillBubbleTimer = this.skillBubbleDuration;
    if (this.skillBubbleSprite) {
      this.skillBubbleSprite.position.y = this.skillBubbleBaseY;
      (this.skillBubbleSprite.material as THREE.SpriteMaterial).opacity = 0.95;
      this.skillBubbleSprite.visible = true;
    }
  }

  // 相容閃身步技能氣泡
  public showSkillBubble(text: string, isAdvanced: boolean) {
    this.showSpeechBubble(text, isAdvanced, 1.35);
  }

  public updateSkillBubble(delta: number) {
    if (this.skillBubbleTimer > 0 && this.skillBubbleSprite) {
      this.skillBubbleTimer -= delta;
      const progress = 1.0 - (this.skillBubbleTimer / this.skillBubbleDuration);
      this.skillBubbleSprite.position.y = this.skillBubbleBaseY + progress * 0.25;

      const mat = this.skillBubbleSprite.material as THREE.SpriteMaterial;
      if (progress < 0.60) {
        mat.opacity = 0.95;
      } else {
        mat.opacity = 0.95 * (1.0 - (progress - 0.60) / 0.40);
      }

      if (this.skillBubbleTimer <= 0) {
        this.skillBubbleSprite.visible = false;
        mat.opacity = 0;
      }
    }
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
    isPlayerSprinting: boolean = false
  ) {
    if (this.hitCooldown > 0) this.hitCooldown -= delta;
    this.lastColliders = colliders;

    const isOutdoor = !IndoorManager.isIndoors(this.position);
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
            this.performFlashStep(colliders);
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
          let hitX = false;
          for (let i = 0; i < colliders.length; i++) {
            const box = colliders[i];
            if (box.isFloorOnly) continue;
            if (
              nextX + radius > box.min.x &&
              nextX - radius < box.max.x &&
              this.position.z + radius > box.min.z &&
              this.position.z - radius < box.max.z &&
              this.position.y + 0.3 < box.max.y &&
              this.position.y + 1.6 > box.min.y
            ) {
              hitX = true;
              break;
            }
          }
          if (!hitX) this.position.x = nextX;

          // Z 軸防穿牆檢測
          const nextZ = this.position.z + moveStepZ;
          let hitZ = false;
          for (let i = 0; i < colliders.length; i++) {
            const box = colliders[i];
            if (box.isFloorOnly) continue;
            if (
              this.position.x + radius > box.min.x &&
              this.position.x - radius < box.max.x &&
              nextZ + radius > box.min.z &&
              nextZ - radius < box.max.z &&
              this.position.y + 0.3 < box.max.y &&
              this.position.y + 1.6 > box.min.y
            ) {
              hitZ = true;
              break;
            }
          }
          if (!hitZ) this.position.z = nextZ;

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
      const flyRadius = 0.55;
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        if (box.isFloorOnly) continue;
        if (this.position.y + 0.2 < box.max.y && this.position.y + 1.6 > box.min.y) {
          if (
            this.position.x + flyRadius > box.min.x &&
            this.position.x - flyRadius < box.max.x &&
            this.position.z + flyRadius > box.min.z &&
            this.position.z - flyRadius < box.max.z
          ) {
            const boxCenterX = (box.min.x + box.max.x) * 0.5;
            const boxCenterZ = (box.min.z + box.max.z) * 0.5;
            const halfBoxX = (box.max.x - box.min.x) * 0.5;
            const halfBoxZ = (box.max.z - box.min.z) * 0.5;

            const overlapX = (halfBoxX + flyRadius) - Math.abs(this.position.x - boxCenterX);
            const overlapZ = (halfBoxZ + flyRadius) - Math.abs(this.position.z - boxCenterZ);

            if (overlapX < overlapZ) {
              this.position.x = this.position.x >= boxCenterX ? box.max.x + flyRadius + 0.05 : box.min.x - flyRadius - 0.05;
              this.knockVelocity.x = 0;
            } else {
              this.position.z = this.position.z >= boxCenterZ ? box.max.z + flyRadius + 0.05 : box.min.z - flyRadius - 0.05;
              this.knockVelocity.z = 0;
            }
          }
        }
      }

      // 空中旋轉翻滾
      this.mesh.rotation.x += delta * 12.0;
      this.mesh.rotation.z += delta * 8.0;

      // 計算 NPC 當前 (X, Z) 位置下方的真實支撐面 (最高樓板或地面 Y = 0)
      const supportFloorY = this.getFloorHeightAt(this.position.x, this.position.y, this.position.z, colliders);

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

          const isDetention = this.role.startsWith('DETENTION');
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
      const supportFloorY = this.getFloorHeightAt(this.position.x, this.position.y, this.position.z, colliders);
      if (this.position.y > supportFloorY) {
        this.position.y = Math.max(supportFloorY, this.position.y - 22.0 * delta);
        this.baseFloorY = supportFloorY;
      }

      if (this.reviveTimer <= 0) {
        // 滿血復活！
        this.isKnockedDown = false;
        this.hp = this.maxHp;
        this.hpBarMesh.scale.x = 1.0;
        (this.hpBarMesh.material as THREE.MeshBasicMaterial).color.setHex(0x2ecc71);
        this.hpBarBgMesh.visible = true;
        this.hpBarMesh.visible = true;
        this.koBadgeSprite.visible = false;
        this.lastKoBadgeSec = -1;

        if (this.isOriginalBikePatrol && this.role !== 'BIKE_PATROL') {
          this.restoreBikePatrol();
        } else {
          // 重新站立回正
          this.mesh.rotation.x = 0;
          this.mesh.rotation.z = 0;
          this.mesh.position.y = this.baseFloorY;
          this.isChasing = false;
          this.isBurstSprinting = false;
          this.dynamicSpeed = this.speed;
          this.lostSightTimer = 0;
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

    // 總教官衝鋒撞柱判定
    if (this.bossIsCharging && this.role === 'DETENTION_BOSS' && !this.isBossStunned && !this.isKnockedDown) {
      this.position.x += this.bossChargeDir.x * 12.0 * delta;
      this.position.z += this.bossChargeDir.z * 12.0 * delta;
      this.rotationY = Math.atan2(this.bossChargeDir.x, this.bossChargeDir.z);

      // 檢測是否撞上水泥加固柱或障礙盒
      for (const box of colliders) {
        if (box.isFloorOnly) continue;
        if (
          this.position.x + 0.6 > box.min.x &&
          this.position.x - 0.6 < box.max.x &&
          this.position.z + 0.6 > box.min.z &&
          this.position.z - 0.6 < box.max.z
        ) {
          // 猛烈撞擊！陷入 3.5 秒眩暈硬直！
          this.stunBoss(3.5);
          soundManager.playPunch();
          break;
        }
      }
      this.mesh.position.copy(this.position);
      return;
    }

    if (this.whistleCooldown > 0) this.whistleCooldown -= delta;
    if (this.attackAnimTimer > 0) this.attackAnimTimer -= delta;
    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    if (this.shuttlecockCooldown > 0) this.shuttlecockCooldown -= delta;

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
      isPlayerSprinting
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
      const accelRate = this.role === 'DOG' ? 6.0 : (this.role === 'BIKE_PATROL' ? 8.0 : 4.0);
      this.dynamicSpeed += (targetChaseSpeed - this.dynamicSpeed) * Math.min(delta * accelRate, 1.0);
      currentSpeed = this.dynamicSpeed;
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
        this.applyIdleAnimation(delta);

        if (this.pauseTimer <= 0) {
          this.isPaused = false;
          this.resetPose();
          this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.patrolWaypoints.length;
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
      const wpDistSq = this.role === 'BIKE_PATROL' ? 12.25 : (this.movementStyle === 'JOGGING' ? 4.84 : 3.24); // 火柴人自行車 15m/s 適度擴大檢查半徑 (3.5m) 避免高速繞圈
      if (this.position.distanceToSquared(targetPos) < wpDistSq) {
        // 下雨天沒帶傘時絕不停留發呆，持續快步尋找遮蔽處
        const canPause = (!isRaining || !isOutdoorHumanoid || this.hasUmbrella) && Math.random() < this.pauseChance;
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
        const radius = this.role === 'DOG' ? 0.35 : 0.45;

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
          for (const box of colliders) {
            if (box.isFloorOnly) continue;
            if (
              nextX + radius > box.min.x &&
              nextX - radius < box.max.x &&
              this.position.z + radius > box.min.z &&
              this.position.z - radius < box.max.z &&
              this.position.y + 0.3 < box.max.y &&
              this.position.y + 1.6 > box.min.y
            ) {
              hitX = true;
              break;
            }
          }
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
          for (const box of colliders) {
            if (box.isFloorOnly) continue;
            if (
              this.position.x + radius > box.min.x &&
              this.position.x - radius < box.max.x &&
              nextZ + radius > box.min.z &&
              nextZ - radius < box.max.z &&
              this.position.y + 0.3 < box.max.y &&
              this.position.y + 1.6 > box.min.y
            ) {
              hitZ = true;
              break;
            }
          }
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
        for (const box of colliders) {
          if (box.isFloorOnly) continue;
          if (this.position.y + 0.3 < box.max.y && this.position.y + 1.6 > box.min.y) {
            if (
              this.position.x + radius > box.min.x &&
              this.position.x - radius < box.max.x &&
              this.position.z + radius > box.min.z &&
              this.position.z - radius < box.max.z
            ) {
              // 計算自幾何中心往外的方向
              const boxCenterX = (box.min.x + box.max.x) * 0.5;
              const boxCenterZ = (box.min.z + box.max.z) * 0.5;
              const halfBoxX = (box.max.x - box.min.x) * 0.5;
              const halfBoxZ = (box.max.z - box.min.z) * 0.5;

              const overlapX = (halfBoxX + radius) - Math.abs(this.position.x - boxCenterX);
              const overlapZ = (halfBoxZ + radius) - Math.abs(this.position.z - boxCenterZ);

              if (overlapX < overlapZ) {
                this.position.x = this.position.x >= boxCenterX ? box.max.x + radius + 0.02 : box.min.x - radius - 0.02;
              } else {
                this.position.z = this.position.z >= boxCenterZ ? box.max.z + radius + 0.02 : box.min.z - radius - 0.02;
              }
            }
          }
        }
      }

      // 轉向與俯仰姿態
      const targetRotation = Math.atan2(_npcMoveDir.x, _npcMoveDir.z);
      const diff = Math.atan2(Math.sin(targetRotation - this.rotationY), Math.cos(targetRotation - this.rotationY));
      const turnRate = this.role === 'DOG' ? 14.0 : (this.role === 'BIKE_PATROL' ? 12.0 : 10.0);
      this.rotationY += diff * Math.min(delta * turnRate, 1.0);
      this.mesh.rotation.y = this.rotationY;

      // 追捕姿態視覺回饋：衝刺時前傾壓低、調息時微喘
      if (this.role !== 'DOG' && this.role !== 'BIKE_PATROL') {
        if (this.isChasing) {
          const targetTilt = this.isBurstSprinting ? 0.14 : (0.05 + Math.sin(this.animTimer * 2.5) * 0.03);
          this.mesh.rotation.x += (targetTilt - this.mesh.rotation.x) * Math.min(delta * 6.0, 1.0);
        } else {
          this.mesh.rotation.x += (0 - this.mesh.rotation.x) * Math.min(delta * 6.0, 1.0);
        }
      }

      // 6. 專屬動作動畫
      // 動態步頻：步態頻率與實際位移速度嚴格成比例！
      const animRate = this.role === 'DOG'
        ? Math.max(8.0, currentSpeed * 2.2 + 2.0)
        : (this.isChasing
          ? (this.isBurstSprinting ? 16.0 : 9.5)
          : (this.movementStyle === 'JOGGING' ? 12.0 : (this.movementStyle === 'HURRIED_WALK' ? 9.5 : 7.5)));
      this.animTimer += delta * animRate;

      if (this.role === 'DOG') {
        // 校犬四足奔馳動畫：跨步幅度隨速度動態放大 (Gallop stride scaling)
        const strideMag = Math.min(0.85, 0.40 + (currentSpeed / 12.0) * 0.42);
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
        this.mesh.position.y = this.baseFloorY + Math.abs(Math.sin(this.animTimer * 2)) * (currentSpeed > 6.0 ? 0.045 : 0.02);
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
    // 柴柴奔馳顛簸保留：修復覆蓋 Y 軸動畫起伏問題，保留垂直四足奔跑顛簸
    if (this.role === 'DOG' && _npcMoveDir.lengthSq() > 0.05) {
      this.mesh.position.y += Math.abs(Math.sin(this.animTimer * 2)) * (currentSpeed > 6.0 ? 0.045 : 0.02);
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
    if (this.skillBubbleTimer > 0) {
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
    if (this.skillBubbleTexture) {
      this.skillBubbleTexture.dispose();
    }
    if (this.skillBubbleSprite?.material) {
      (this.skillBubbleSprite.material as THREE.Material).dispose();
    }
    for (const item of this.afterimages) {
      if (scene) scene.remove(item.group);
      else if (item.group.parent) item.group.parent.remove(item.group);
      for (const m of item.materials) {
        m.dispose();
      }
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
    if (scene) {
      scene.remove(this.mesh);
    } else if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
