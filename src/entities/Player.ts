import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { InputManager } from '../core/InputManager';
import { soundManager } from '../audio/SoundEffects';
import { Bicycle } from '../vehicles/Bicycle';
import { IndoorManager } from '../systems/IndoorManager';

export type WeaponType = 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT';

interface AfterimageItem {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  life: number;
  maxLife: number;
}

// 模組頂層靜態共享 Scratch 物件 (0-GC 避免每幀垃圾回收引發微卡頓)
const DEFAULT_RESPAWN_POS = new THREE.Vector3(0, 0, 15);
const _playerMoveDir = new THREE.Vector3();
const _safeTeleportResult = new THREE.Vector3();

export class Player {
  public mesh: THREE.Group;
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 15);
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;

  // Attributes
  public hp: number = 100;
  public maxHp: number = 100;
  public stamina: number = 100;
  public maxStamina: number = 100;

  // 武器系統 (Weapon System)
  public currentWeapon: WeaponType = 'FIST';
  public hasNormalBat: boolean = false;
  public hasSpecialBat: boolean = false;
  private normalBatMesh!: THREE.Group;
  private specialBatMesh!: THREE.Group;

  // Speeds: 行走 5.0 | 跑步 10.0 (與教官、糾察隊在相同狀態下速度完全一致)
  public walkSpeed: number = 5.0;
  public sprintSpeed: number = 10.0;
  public jumpStrength: number = 8.5;
  public gravity: number = -24.0;
  public isGrounded: boolean = true;
  public isRidingVehicle: boolean = false;
  public isSwimming: boolean = false; // 游泳狀態
  private wasSwimming: boolean = false; // 游泳狀態切換檢測
  public isMoving: boolean = false;   // 當前是否正在移動推進
  public isSprinting: boolean = false; // 當前是否處於衝刺加速狀態
  public isSneaking: boolean = false;  // 潛龍諜影靜音潛行模式 (無腳步聲，背刺專用)
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
  private afterimages: AfterimageItem[] = [];
  private afterimageIndex: number = 0;

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

  // 頭頂技能名稱對話氣泡 (浮動微光膠囊框，0-GC 復用 Sprite)
  private skillBubbleSprite: THREE.Sprite;
  private skillBubbleCanvas: HTMLCanvasElement;
  private skillBubbleContext: CanvasRenderingContext2D;
  private skillBubbleTexture: THREE.CanvasTexture;
  private skillBubbleTimer: number = 0;
  private skillBubbleDuration: number = 1.35;
  private skillBubbleBaseY: number = 2.35;

  private animTimer: number = 0;
  private punchTimer: number = 0;
  public isAttacking: boolean = false;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ'; // 採用 Y(航向) -> X(俯仰) -> Z(側滾) 順序，避免自由式俯趴時歐拉角產生萬向節鎖(Gimbal Lock)並支援水中360度靈敏轉向
    this.mesh.position.copy(this.position);

    // 建立頭頂技能名稱對話方框 (3D Billboard Sprite)
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

    // 1. 建立角色外觀（台灣典型高校制服風格：深藍長褲、白襯衫配後背包）
    const uniformMat = new THREE.MeshLambertMaterial({ color: 0x1b263b }); // 深藍西裝褲
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0xf8f9fa }); // 白襯衫
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xfad390 }); // 膚色
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x222222 }); // 黑髮
    const bagMat = new THREE.MeshLambertMaterial({ color: 0x00b894 }); // 綠色校園斜背包

    // 身體軀幹 (Torso)
    const bodyGeo = new THREE.BoxGeometry(0.65, 0.75, 0.35);
    this.bodyMesh = new THREE.Mesh(bodyGeo, shirtMat);
    this.bodyMesh.position.y = 1.05;
    this.bodyMesh.castShadow = true;
    this.mesh.add(this.bodyMesh);

    // 校園側背包 (School Bag)
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.2), bagMat);
    bag.position.set(0, 0, -0.22);
    bag.castShadow = true;
    this.bodyMesh.add(bag);

    // 頭部與頭髮
    this.headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skinMat);
    this.headMesh.position.y = 1.62;
    this.headMesh.castShadow = true;
    this.mesh.add(this.headMesh);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.42), hairMat);
    hair.position.set(0, 0.16, 0);
    this.headMesh.add(hair);

    // 手臂 (Arms)
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    this.leftArm = new THREE.Mesh(armGeo, shirtMat);
    this.leftArm.position.set(-0.45, 1.05, 0);
    this.leftArm.castShadow = true;
    this.mesh.add(this.leftArm);

    // 建立下雨天專屬雨傘 3D 模型並掛載於左手 (leftArm，右手依然可正常揮棒或揮拳)
    this.umbrellaMesh = this.buildUmbrellaModel();
    this.umbrellaMesh.position.set(0, -0.28, 0.10);
    this.umbrellaMesh.rotation.set(Math.PI * 0.65, 0.12, -0.12);
    this.leftArm.add(this.umbrellaMesh);

    this.rightArm = new THREE.Mesh(armGeo, shirtMat);
    this.rightArm.position.set(0.45, 1.05, 0);
    this.rightArm.castShadow = true;
    this.mesh.add(this.rightArm);

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

    // 雙腿 (Legs)
    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    this.leftLeg = new THREE.Mesh(legGeo, uniformMat);
    this.leftLeg.position.set(-0.18, 0.35, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, uniformMat);
    this.rightLeg.position.set(0.18, 0.35, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);

    scene.add(this.mesh);

    // 建立 0-GC 角色殘影物件池 (8 個 Group，常駐場景，避免每幀垃圾回收)
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
  public performFlashStep(colliders: CollidableBox[] = []) {
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

  // 尋找瞬移安全目標點 (0-GC，檢測障礙物碰撞與地面高度，絕不穿牆)
  private findSafeTeleportPos(centerX: number, centerZ: number, currentY: number, colliders: CollidableBox[]): THREE.Vector3 {
    const halfWidth = 0.45;
    const height = 1.8;
    const minRadius = 2.0;
    const maxRadius = 4.2;

    // 嘗試在周圍隨機尋找安全空曠落點 (最多嘗試 12 次取樣)
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const candX = centerX + Math.cos(angle) * dist;
      const candZ = centerZ + Math.sin(angle) * dist;

      // 檢查是否與任何實體阻擋障礙物碰撞
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
        // 找到安全水平座標，計算該點地面高度
        let groundY = 0;
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
        _safeTeleportResult.set(candX, groundY, candZ);
        return _safeTeleportResult;
      }
    }

    // 若多次隨機取樣皆撞牆，退回當前起始中心安全點
    _safeTeleportResult.set(centerX, currentY, centerZ);
    return _safeTeleportResult;
  }

  // 兼容舊介面施展技能調用
  public performDodge(moveDir: THREE.Vector3, isAdvanced: boolean, colliders: CollidableBox[] = []) {
    if (isAdvanced) {
      this.performBearShake(colliders);
    } else {
      this.performFlashStep(colliders);
    }
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
    if (children[1]) children[1].rotation.copy(this.headMesh.rotation);
    if (children[2]) children[2].rotation.copy(this.leftArm.rotation);
    if (children[3]) children[3].rotation.copy(this.rightArm.rotation);
    if (children[4]) children[4].rotation.copy(this.leftLeg.rotation);
    if (children[5]) children[5].rotation.copy(this.rightLeg.rotation);

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

  // 繪製頭頂技能名稱對話方框 (CanvasTexture 0-GC)
  private drawSkillBubble(text: string, isAdvanced: boolean) {
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
    // 底部小三角箭頭指向角色頭頂
    ctx.lineTo(w / 2 + 12, y + bubbleH);
    ctx.lineTo(w / 2, y + bubbleH + 16);
    ctx.lineTo(w / 2 - 12, y + bubbleH);
    ctx.lineTo(x + r, y + bubbleH);
    ctx.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    // 半透明優雅暗色磨砂底色 (低調自然、不刺眼、不搶眼)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fill();

    // 細緻低調微光邊框 (淡青 / 淡紫)
    ctx.strokeStyle = isAdvanced ? 'rgba(168, 85, 247, 0.70)' : 'rgba(56, 189, 248, 0.70)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 技能文字 (簡潔柔白，微陰影提升辨識度)
    ctx.font = 'bold 38px "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, w / 2, y + bubbleH / 2 - 1);

    ctx.restore();
    this.skillBubbleTexture.needsUpdate = true;
  }

  public showSkillBubble(text: string, isAdvanced: boolean) {
    this.drawSkillBubble(text, isAdvanced);
    this.skillBubbleTimer = this.skillBubbleDuration;
    this.skillBubbleSprite.position.y = this.skillBubbleBaseY;
    (this.skillBubbleSprite.material as THREE.SpriteMaterial).opacity = 0.95;
    this.skillBubbleSprite.visible = true;
  }

  public updateSkillBubble(delta: number) {
    if (this.skillBubbleTimer > 0) {
      this.skillBubbleTimer -= delta;
      const progress = 1.0 - (this.skillBubbleTimer / this.skillBubbleDuration);
      // 輕微平緩上浮 (+0.25m)
      this.skillBubbleSprite.position.y = this.skillBubbleBaseY + progress * 0.25;

      // 前 60% 維持清晰，後 40% 平滑淡出 (Fade Out)
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

  public respawn(pos: THREE.Vector3 = DEFAULT_RESPAWN_POS) {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.isDead = false;
    this.isHoldingUmbrella = false;
    if (this.umbrellaMesh) this.umbrellaMesh.visible = false;
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
    this.skillBubbleSprite.visible = false;
    this.skillBubbleTimer = 0;
    for (const item of this.afterimages) {
      item.life = 0;
      item.group.visible = false;
    }
  }

  public setWeapon(type: WeaponType): boolean {
    if (type === 'NORMAL_BAT' && !this.hasNormalBat) return false;
    if (type === 'SPECIAL_BAT' && !this.hasSpecialBat) return false;

    this.currentWeapon = type;
    if (this.normalBatMesh) this.normalBatMesh.visible = (type === 'NORMAL_BAT');
    if (this.specialBatMesh) this.specialBatMesh.visible = (type === 'SPECIAL_BAT');
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

  // 建立 3D Low-Poly 專屬雨傘模型 (傘中棒、握把、10 角多邊形傘帽、傘尖)
  private buildUmbrellaModel(): THREE.Group {
    const umbrella = new THREE.Group();
    umbrella.name = 'player_umbrella';

    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.7, roughness: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.8 });
    const canopyMat = new THREE.MeshLambertMaterial({
      color: 0x1e3799, // 沉穩大氣的皇家海軍藍 (高校制服系)
      side: THREE.DoubleSide
    });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.85, roughness: 0.2 });

    // 內部微調容器 (向角色右側/中心補正，使傘頂中心精確懸浮於頭頂上方 0.4m 處)
    const rig = new THREE.Group();
    rig.position.set(0.26, 0, -0.08);

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
      if (this.currentWeapon === 'SPECIAL_BAT') {
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
        this.mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && child !== this.skillBubbleSprite) {
            const m = (child as THREE.Mesh).material as THREE.Material;
            if (m) m.opacity = 1.0;
          }
        });
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
        this.mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && child !== this.skillBubbleSprite) {
            const m = (child as THREE.Mesh).material as THREE.Material;
            if (m) {
              m.transparent = true;
              m.opacity = purpleFlicker;
            }
          }
        });

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
    // 鍵盤：支援 C 鍵與 Z 鍵（防 Windows/瀏覽器 Ctrl+W/A/S/D 快捷鍵衝突），亦相容 Ctrl；手機：虛擬搖桿推桿半徑小於 0.5
    const isSneakKeyPressed = !!(
      input.keys['KeyC'] ||
      input.keys['KeyZ'] ||
      input.keys['ControlLeft'] ||
      input.keys['ControlRight']
    );
    const isJoystickSneak = hasVirtualJoystick && input.virtualAxisMagnitude > 0.05 && input.virtualAxisMagnitude < 0.5;
    const wantsSneak = (isSneakKeyPressed || isJoystickSneak) && isMoving && !input.sprint;
    this.isSneaking = wantsSneak;

    // 2. 衝刺、潛行與體力消耗 (Sprint, Sneak & Stamina)
    let currentSpeed = this.walkSpeed;
    if (this.isSneaking) {
      currentSpeed = 2.4; // 靜音潛行步速 2.4 m/s (無腳步聲，NPC 無法在背後察覺)
      this.bodyMesh.position.y = 0.92; // 壓低身形潛行
    } else {
      this.bodyMesh.position.y = 1.05; // 恢復正常直立身姿
      if (this.isSwimming) {
        currentSpeed = input.sprint && this.stamina > 5 ? 7.8 : 4.5;
        if (input.sprint && isMoving && this.stamina > 5) {
          this.stamina = Math.max(0, this.stamina - delta * 24.0);
        } else {
          this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
        }
      } else if (input.sprint && isMoving && this.stamina > 5) {
        currentSpeed = this.sprintSpeed;
        this.stamina = Math.max(0, this.stamina - delta * 24.0);
      } else {
        // 體力自動恢復
        this.stamina = Math.min(this.maxStamina, this.stamina + delta * 15.0);
      }
    }

    currentSpeed *= analogSpeedScale;

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
          this.mesh.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child !== this.skillBubbleSprite) {
              const m = (child as THREE.Mesh).material as THREE.Material;
              if (m) m.opacity = 1.0;
            }
          });
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
          this.mesh.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child !== this.skillBubbleSprite) {
              const m = (child as THREE.Mesh).material as THREE.Material;
              if (m) {
                m.transparent = true;
                m.opacity = flicker;
              }
            }
          });
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
          // 水面自然浮力平衡 (水面高度約 0.18m，伴隨波浪起伏)
          const targetWaterY = 0.18 + (isMoving ? Math.sin(this.animTimer * 2.0) * 0.025 : Math.sin(this.animTimer) * 0.035);
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
    const isSprinting = currentSpeed === (this.isSwimming ? 7.8 : this.sprintSpeed);
    this.isSprinting = isMoving && isSprinting;
    this.animatePlayer(delta, isMoving, isSprinting);
  }

  private applyMovementAndCollision(delta: number, colliders: CollidableBox[]) {
    const halfWidth = 0.35;
    const height = 1.8;
    const stepHeight = 0.65; // 階梯平滑攀爬容許度

    // 分軸檢測：X 軸移動
    const targetX = this.position.x + this.velocity.x * delta;
    let collidedX = false;
    for (const box of colliders) {
      if (box.isFloorOnly) continue; // 地板/坡道不阻擋水平位移
      if (
        targetX + halfWidth > box.min.x &&
        targetX - halfWidth < box.max.x &&
        this.position.z + halfWidth > box.min.z &&
        this.position.z - halfWidth < box.max.z &&
        this.position.y + height > box.min.y &&
        this.position.y + stepHeight < box.max.y
      ) {
        collidedX = true;
        break;
      }
    }
    if (!collidedX) this.position.x = targetX;

    // Z 軸移動
    const targetZ = this.position.z + this.velocity.z * delta;
    let collidedZ = false;
    for (const box of colliders) {
      if (box.isFloorOnly) continue; // 地板/坡道不阻擋水平位移
      if (
        this.position.x + halfWidth > box.min.x &&
        this.position.x - halfWidth < box.max.x &&
        targetZ + halfWidth > box.min.z &&
        targetZ - halfWidth < box.max.z &&
        this.position.y + height > box.min.y &&
        this.position.y + stepHeight < box.max.y
      ) {
        collidedZ = true;
        break;
      }
    }
    if (!collidedZ) this.position.z = targetZ;

    // Y 軸移動 (重力與垂直檢測，支援水平層板與連續坡道階梯)
    const targetY = this.position.y + this.velocity.y * delta;
    let groundY = 0; // 地面水平面

    for (const box of colliders) {
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
          if (box.max.y <= this.position.y + 0.65 && box.max.y > groundY) {
            groundY = box.max.y;
          }
        }
      }
    }

    // 落地檢測與貼地 (Ground-snapping 下樓防抖動)
    if (this.isSwimming) {
      // 游泳狀態下由浮力主導高度，防止穿透泳池底層
      const poolBottomY = -1.1;
      this.position.y = Math.max(poolBottomY, targetY);
      this.isGrounded = false;
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

  private animatePlayer(delta: number, isMoving: boolean, isSprinting: boolean) {
    if (this.isSwimming) {
      // 1. 身體俯仰趴平姿態 (Prone Freestyle vs Treading Water)
      // 自由式划水衝刺/前進時：前傾俯趴約 70~75 度 (1.20 ~ 1.28 rad)
      // 靜止浮水踩水時：約 18~22 度 (0.32 ~ 0.38 rad)，身體立起、頭部浮出水面踏水
      const targetPitch = isMoving ? (isSprinting ? 1.28 : 1.18) : 0.32;
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, targetPitch, Math.min(delta * 7.0, 1.0));

      if (isMoving) {
        // 自由式划水衝刺/游泳姿態
        const strokeRate = isSprinting ? 12.0 : 8.0;
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

    if (this.punchTimer > 0) {
      this.punchTimer -= delta;
      // 若下雨天撐傘中，右手揮擊時左手依然穩健撐傘
      if (this.isHoldingUmbrella) {
        this.leftArm.rotation.set(-Math.PI * 0.65, -0.12, 0.12);
      }
      // 揮擊動作 (球棒寬幅橫掃 / 拳頭直擊)
      if (this.currentWeapon !== 'FIST') {
        const totalDuration = this.currentWeapon === 'SPECIAL_BAT' ? 0.48 : 0.42;
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
    } else {
      // 閒置回正
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

  // 資源釋放處置 (Resource Disposal)
  public dispose(scene?: THREE.Scene) {
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
    for (const item of this.afterimages) {
      if (scene) {
        scene.remove(item.group);
      } else if (item.group.parent) {
        item.group.parent.remove(item.group);
      }
      for (const m of item.materials) {
        m.dispose();
      }
    }
    if (scene) {
      scene.remove(this.mesh);
    } else if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
