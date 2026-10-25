import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { soundManager } from '../audio/SoundEffects';

export type NPCRole = 'STUDENT' | 'INSPECTOR' | 'TEACHER' | 'INSTRUCTOR' | 'DOG' | 'BIKE_PATROL' | 'BANDIT' | 'PE_TEACHER_BOSS';

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
const _npcToPlayer = new THREE.Vector3();
const _npcForward = new THREE.Vector3();
const _npcEyePos = new THREE.Vector3();
const _npcTargetEye = new THREE.Vector3();
const _npcLookTarget = new THREE.Vector3();

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
  public reviveTimer: number = 0;

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

  private patrolWaypoints: THREE.Vector3[] = [];
  private currentWaypointIdx: number = 0;
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

  constructor(scene: THREE.Scene, startPos: THREE.Vector3, role: NPCRole, waypoints: THREE.Vector3[] = []) {
    this.position = startPos.clone();
    this.baseFloorY = startPos.y; // 鎖定 NPC 所屬樓層高度基準
    this.role = role;
    this.patrolWaypoints = waypoints.length > 0 ? waypoints : [startPos.clone(), new THREE.Vector3(startPos.x + 8, startPos.y, startPos.z)];

    // 初始化各角色數值：行走 5.0 | 跑步 10.0 | 騎車 15.0
    if (role === 'PE_TEACHER_BOSS') {
      // 大如老師 (4F 羽球教練)：血量 950，行走 4.2，跑步 8.5，近戰 28，反擊範圍 2.4
      this.maxHp = 950;
      this.speed = 4.2;
      this.chaseSpeed = 8.5;
      this.attackPower = 28;
      this.attackRange = 2.4;
    } else if (role === 'TEACHER' || role === 'INSTRUCTOR') {
      // 生教組長 / 教官：血量 315，行走 5.0，跑步 10.0
      this.maxHp = 315;
      this.speed = 5.0;
      this.chaseSpeed = 10.0;
      this.attackPower = 36;
      this.attackRange = 1.8;
    } else if (role === 'BANDIT') {
      // 校外強盜：走路 8.5 (比單車巡邏快)，跑步 16.5 (超越單車極速 15.0)，攻擊力提高為兩倍 44
      this.maxHp = 180;
      this.speed = 8.5;
      this.chaseSpeed = 16.5;
      this.attackPower = 44;
      this.attackRange = 1.9;
    } else if (role === 'DOG') {
      // 校犬柴柴：敏捷四足犬，巡邏步態 3.8，追捕奔馳 11.5，極速狂飆 13.8
      this.maxHp = 630;
      this.speed = 3.8;
      this.chaseSpeed = 11.5;
      this.attackPower = 30;
      this.attackRange = 2.0;
    } else if (role === 'BIKE_PATROL') {
      // 火柴人自行車騎士：巡邏與追捕速度統一為 15.0 (與玩家騎乘火柴人自行車極速完全一致)
      this.maxHp = 225;
      this.speed = 15.0;
      this.chaseSpeed = 15.0;
      this.attackPower = 26;
      this.attackRange = 2.4;
    } else if (role === 'INSPECTOR') {
      // 風紀糾察 (步巡)：血量 158，行走 5.0，跑步 10.0
      this.maxHp = 158;
      this.speed = 5.0;
      this.chaseSpeed = 10.0;
      this.attackPower = 18;
      this.attackRange = 1.8;
    } else {
      // 平民學生：血量 112，行走 5.0，跑步 10.0
      this.maxHp = 112;
      this.speed = 5.0;
      this.chaseSpeed = 10.0;
      this.attackPower = 12;
      this.attackRange = 1.6;
    }
    this.hp = this.maxHp;
    this.chasePacingTimer = 1.5 + Math.random() * 2.0;
    this.dynamicSpeed = this.speed;

    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ';
    this.mesh.position.copy(this.position);

    // 依角色建造不同 3D 外觀模型
    if (role === 'DOG') {
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
    const hpY = role === 'DOG' ? 1.05 : 2.05;
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
  }

  // 更新昏迷休養倒數秒數告示牌 (加入 lastKoBadgeSec 快取節流，僅在秒數變更時重繪)
  private updateKOBadge(secondsLeft: number) {
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

  // 1. 建造校犬柴柴（赤柴犬）3D 模型 (經典赤柴黃棕毛色、胸腹白毛裏白、白眉毛、捲尾巴、四足白襪、紅項圈與金鈴鐺)
  private buildDogModel() {
    // 柴犬經典配色材質
    const shibaTanMat = new THREE.MeshLambertMaterial({ color: 0xc87a32 }); // 赤柴經典溫暖金棕橘色
    const shibaWhiteMat = new THREE.MeshLambertMaterial({ color: 0xfff6ea }); // 柴犬標誌性裏白 (Urajiro) 象牙奶白
    const noseBlackMat = new THREE.MeshLambertMaterial({ color: 0x1e272e }); // 黑鼻子與嘴唇線
    const innerEarMat = new THREE.MeshLambertMaterial({ color: 0xf5d5c5 }); // 粉嫩耳朵內側
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c }); // 日式紅色項圈
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f }); // 金色金屬鈴鐺/狗牌
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
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
    }

    // 頭部
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    addHumanoidPart(head);

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
    }

    // 手腳
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    this.leftArm = new THREE.Mesh(armGeo, shirtMat);
    this.leftArm.position.set(-0.45, 1.05, 0);
    addHumanoidPart(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, shirtMat);
    this.rightArm.position.set(0.45, 1.05, 0);
    addHumanoidPart(this.rightArm);

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

    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.18, 0.35, 0);
    addHumanoidPart(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.18, 0.35, 0);
    addHumanoidPart(this.rightLeg);
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
    if (this.isKnockedDown) return false;

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

    // 血量歸零：倒地倒下，碰撞箱全面失效，10 秒後滿血復活
    if (this.hp <= 0) {
      this.isKnockedDown = true;
      this.isChasing = false;
      this.isBurstSprinting = false;
      this.dynamicSpeed = this.speed;
      this.reviveTimer = 10.0;
      this.hpBarBgMesh.visible = false;
      this.hpBarMesh.visible = false;

      this.lastKoBadgeSec = -1;
      this.updateKOBadge(10.0);
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
    if (this.isKnockedDown) return false;
    if (this.hitCooldown > 0) return false;
    this.hitCooldown = 0.65; // 0.65秒受擊保護

    const wasKnockedDown = this.takeDamage(damage);
    if (!this.isKnockedDown && this.hp > 0) {
      this.isChasing = true; // 存活時被撞激怒追擊
    } else {
      this.isChasing = false;
    }

    // 計算擊飛拋物線：強烈向上拋射 + 水平擊飛
    this.isKnockedFlying = true;
    const horizontalForce = Math.max(force * 1.3, 10.0);
    const verticalForce = Math.min(force * 0.7 + 6.5, 13.0);

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
    if (this.role === 'DOG') {
      soundManager.playDogBark();
    } else if (this.role === 'BIKE_PATROL') {
      soundManager.playBicycleBell();
    } else if (this.role === 'BANDIT') {
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
      case 'PE_TEACHER_BOSS':
        // 大如老師：羽球拍近戰殺球重扣，極高傷害與震飛
        return { damage: 28, hForce: 13.0, vForce: 7.0 };
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

    // 大如老師：處於和平教學與挑戰模式，不主動鎖定或追捕玩家
    if (this.role === 'PE_TEACHER_BOSS') {
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
    const maxViewDist = this.role === 'DOG' ? 18.0 : this.role === 'BIKE_PATROL' ? 16.0 : 13.0;
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
    isPlayerDead: boolean
  ) {
    if (isPlayerDead) {
      this.resetAggro();
      return;
    }

    // 校外強盜專屬仇恨邏輯
    if (this.role === 'BANDIT') {
      const isPlayerOutside = playerPos.z >= 105.5 || Math.abs(playerPos.x) >= 105.5 || playerPos.z <= -105.5;
      const distSq = this.position.distanceToSquared(playerPos);
      if (isPlayerOutside && distSq < 2025.0) { // 45.0m
        this.isChasing = true;
        this.lostSightTimer = 0;
        this.lastKnownPos.copy(playerPos);
        onSpotPlayer();
      } else {
        this.resetAggro();
      }
      return;
    }

    // 通緝星級為 0 時，非學生 NPC 解除追捕
    if (wantedLevel === 0 && this.role !== 'STUDENT') {
      this.resetAggro();
      return;
    }

    // 校犬專屬仇恨邏輯：教學大樓保護禁區
    if (this.role === 'DOG' && NPC.isInsideTeachingBuilding(playerPos)) {
      this.resetAggro();
      return;
    }

    // 通用視線與追逐判定 (校犬、教官、巡堂老師、糾察隊、激怒學生)
    const distSq = this.position.distanceToSquared(playerPos);
    const seesPlayer = this.canSeePlayer(playerPos, colliders);

    // 發現玩家觸發追逐 (通緝中且在視距內)
    const spotDistSq = this.role === 'DOG' ? 400.0 : 324.0; // 20m vs 18m
    if (wantedLevel > 0 && seesPlayer && distSq < spotDistSq && this.role !== 'STUDENT') {
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

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    wantedLevel: number,
    colliders: CollidableBox[],
    onSpotPlayer: () => void,
    isPlayerRidingBike: boolean = false,
    isPlayerDead: boolean = false
  ) {
    if (this.hitCooldown > 0) this.hitCooldown -= delta;

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
          // 血量歸零：倒地倒下，10 秒後滿血復活
          this.isKnockedDown = true;
          this.isChasing = false;
          this.isBurstSprinting = false;
          this.reviveTimer = 10.0;
          this.hpBarBgMesh.visible = false;
          this.hpBarMesh.visible = false;
          this.lastKoBadgeSec = -1;
          this.updateKOBadge(10.0);
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

    // 1. 倒地狀態處理：倒下 10 秒後滿血復活，期間碰撞箱完全無效
    if (this.isKnockedDown) {
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

    if (this.whistleCooldown > 0) this.whistleCooldown -= delta;
    if (this.attackAnimTimer > 0) this.attackAnimTimer -= delta;
    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    if (this.shuttlecockCooldown > 0) this.shuttlecockCooldown -= delta;

    // 2. 仇恨判定 (AI 狀態機)
    this.updateAggroState(delta, playerPos, wantedLevel, colliders, onSpotPlayer, isPlayerDead);

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
      this.dynamicSpeed = this.speed;
      currentSpeed = this.speed;

      targetPos = this.patrolWaypoints[this.currentWaypointIdx];
      const wpDistSq = this.role === 'BIKE_PATROL' ? 12.25 : 3.24; // 火柴人自行車 15m/s 適度擴大檢查半徑 (3.5m) 避免高速繞圈
      if (this.position.distanceToSquared(targetPos) < wpDistSq) {
        this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.patrolWaypoints.length;
      }
    }

    // 4. 計算移動方向與位移 (0-GC 重複利用 Scratch Vector)
    _npcMoveDir.subVectors(targetPos, this.position);
    _npcMoveDir.y = 0;

    if (_npcMoveDir.lengthSq() > 0.05) {
      _npcMoveDir.normalize();

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
        : (this.isChasing ? (this.isBurstSprinting ? 16.0 : 9.5) : 8.0);
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
        // 人型 NPC 擺手走路與攻擊動作
        const swingMag = this.isChasing ? (this.isBurstSprinting ? 0.70 : 0.38) : 0.35;
        const swing = Math.sin(this.animTimer) * swingMag;
        if (this.leftArm) this.leftArm.rotation.x = -swing;
        if (this.rightArm) {
          if (this.attackAnimTimer > 0) {
            this.rightArm.rotation.x = -Math.PI / 2; // 出拳揮打
          } else {
            this.rightArm.rotation.x = swing;
          }
        }
        if (this.leftLeg) this.leftLeg.rotation.x = swing;
        if (this.rightLeg) this.rightLeg.rotation.x = -swing;
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
  }

  // 完整釋放 NPC 佔用的幾何體、材質、畫布與 GPU 紋理 (Resource Disposal)
  public dispose(scene?: THREE.Scene) {
    if (this.koBadgeTexture) {
      this.koBadgeTexture.dispose();
    }
    if (this.koBadgeSprite?.material) {
      this.koBadgeSprite.material.dispose();
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
