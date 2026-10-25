import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { InputManager } from '../core/InputManager';
import { soundManager } from '../audio/SoundEffects';

export type WeaponType = 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT';

// 模組頂層靜態共享 Scratch 物件 (0-GC 避免每幀垃圾回收引發微卡頓)
const DEFAULT_RESPAWN_POS = new THREE.Vector3(0, 0, 15);
const _playerMoveDir = new THREE.Vector3();

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
  public isMoving: boolean = false;   // 當前是否正在移動推進
  public isSprinting: boolean = false; // 當前是否處於衝刺加速狀態
  public poisonTimer: number = 0;     // 中毒持續時間 (5秒)
  public poisonTickTimer: number = 0; // 中毒跳血計時
  public isInvisible: boolean = false; // 隱形模式 (如三分球投籃瞄準時不遮擋籃框與準心)
  public isDead: boolean = false;
  public deathTimer: number = 0;

  // 擊飛與擊退物理系統 (Knockback & Launch-flying)
  public knockVelocity: THREE.Vector3 = new THREE.Vector3();
  public isKnockedFlying: boolean = false;
  public knockTimer: number = 0;
  public hitCooldown: number = 0;

  public onTakeDamageCallback: ((amount: number, reason: string) => void) | null = null;
  public onDeathCallback: (() => void) | null = null;

  // Visual parts for animation
  private bodyMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;

  private animTimer: number = 0;
  private punchTimer: number = 0;
  public isAttacking: boolean = false;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ'; // 採用 Y(航向) -> X(俯仰) -> Z(側滾) 順序，避免自由式俯趴時歐拉角產生萬向節鎖(Gimbal Lock)並支援水中360度靈敏轉向
    this.mesh.position.copy(this.position);

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
  }

  public takeDamage(amount: number, reason: string = '受到傷害'): boolean {
    if (this.isDead) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.onTakeDamageCallback) {
      this.onTakeDamageCallback(amount, reason);
    }
    if (this.hp <= 0) {
      this.isDead = true;
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
    if (this.hitCooldown > 0) return false;

    this.hitCooldown = 0.55; // 0.55秒受擊保護，避免瞬間被多隻連續秒殺
    this.isKnockedFlying = true;
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

  public respawn(pos: THREE.Vector3 = DEFAULT_RESPAWN_POS) {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.isDead = false;
    this.isInvisible = false;
    this.deathTimer = 0;
    this.isKnockedFlying = false;
    this.knockVelocity.set(0, 0, 0);
    this.hitCooldown = 0;
    this.position.copy(pos);
    this.mesh.position.copy(pos);
    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
    this.velocity.set(0, 0, 0);
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

  public attack() {
    if (this.isDead || this.isSwimming) return; // 游泳狀態下雙手劃水，不可出拳揮棒
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
    }
  }

  public update(delta: number, input: InputManager, forwardVec: THREE.Vector3, rightVec: THREE.Vector3, colliders: CollidableBox[]) {
    if (this.isDead) {
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

    // 2. 衝刺與體力消耗 (Sprint & Stamina)
    let currentSpeed = this.walkSpeed;
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
      this.velocity.x = _playerMoveDir.x * currentSpeed;
      this.velocity.z = _playerMoveDir.z * currentSpeed;

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
      if (!this.isSwimming) this.mesh.rotation.z = 0;
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
      return;
    } else {
      // 脫離水體 / 陸地上：平滑復原身體俯仰與側滾至站立行走姿態
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, Math.min(delta * 9.0, 1.0));
      this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, Math.min(delta * 9.0, 1.0));
      this.headMesh.rotation.x = THREE.MathUtils.lerp(this.headMesh.rotation.x, 0, Math.min(delta * 9.0, 1.0));
      this.headMesh.rotation.y = THREE.MathUtils.lerp(this.headMesh.rotation.y, 0, Math.min(delta * 9.0, 1.0));
      this.leftLeg.rotation.z = THREE.MathUtils.lerp(this.leftLeg.rotation.z, 0, Math.min(delta * 9.0, 1.0));
      this.rightLeg.rotation.z = THREE.MathUtils.lerp(this.rightLeg.rotation.z, 0, Math.min(delta * 9.0, 1.0));
      if (Math.abs(this.mesh.rotation.x) < 0.005) this.mesh.rotation.x = 0;
      if (Math.abs(this.mesh.rotation.z) < 0.005) this.mesh.rotation.z = 0;
    }

    if (this.punchTimer > 0) {
      this.punchTimer -= delta;
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
        this.rightArm.position.z = 0;
      }
    } else if (isMoving) {
      const animSpeed = isSprinting ? 18 : 12;
      this.animTimer += delta * animSpeed;

      const swing = Math.sin(this.animTimer) * (isSprinting ? 0.75 : 0.45);
      this.leftArm.rotation.x = -swing;
      this.rightArm.rotation.x = swing;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;

      // 跑步上下顛簸
      this.bodyMesh.position.y = 1.05 + Math.abs(Math.sin(this.animTimer * 2)) * 0.06;
      this.headMesh.position.y = 1.62 + Math.abs(Math.sin(this.animTimer * 2)) * 0.06;
    } else {
      // 閒置回正
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, delta * 10);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 10);
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
    if (scene) {
      scene.remove(this.mesh);
    } else if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}
