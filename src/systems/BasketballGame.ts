import * as THREE from 'three';
import { ShootingHotspot } from '../world/CampusWorld';
import { Player } from '../entities/Player';
import { HUD } from '../ui/HUD';
import { WantedSystem } from './WantedSystem';
import { soundManager } from '../audio/SoundEffects';
import { InputManager } from '../core/InputManager';

// 籃球第一次落地後，經過此秒數自動回到發球點
const BALL_RESET_DELAY_SEC = 1.0;

const _scratchCamDir = new THREE.Vector3();
const _scratchCamHoriz = new THREE.Vector3();
const _scratchToHoop = new THREE.Vector3();
const _scratchToHoopHoriz = new THREE.Vector3();
const _scratchAimPoint = new THREE.Vector3();
const _scratchAimVec = new THREE.Vector3();
const _scratchLaunchHoriz = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();
const _scratchRight = new THREE.Vector3();

export class BasketballGame {
  public basketballMesh: THREE.Mesh;
  public isHolding: boolean = false;
  public isBallInAir: boolean = false;
  public isChargingShot: boolean = false;
  public shotChargeRatio: number = 0;
  public currentActiveHotspot: ShootingHotspot | null = null;
  public scoreStreak: number = 0;
  public bestStreak: number = 0;
  public totalMade: number = 0; // 累計進球數 (PERFECT / GOOD 入網；解鎖開發中武器用，只計小遊戲籃球)

  private ballVelocity: THREE.Vector3 = new THREE.Vector3();
  private ballResetTimer: number = 0;
  private dribbleSoundTimer: number = 0;
  private targetShotQuality: 'PERFECT' | 'GOOD' | 'BAD' = 'BAD';
  private hasScoredThisShot: boolean = false;
  private spawnPos: THREE.Vector3;

  constructor(scene: THREE.Scene, spawnPos: THREE.Vector3) {
    this.spawnPos = spawnPos.clone();

    // 建立 3D 經典籃球與黑色十字骨架刻線
    const ballGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    this.basketballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.basketballMesh.castShadow = true;
    this.basketballMesh.position.copy(this.spawnPos);

    const ringGeo = new THREE.TorusGeometry(0.241, 0.012, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    this.basketballMesh.add(ring1);
    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.x = Math.PI / 2;
    this.basketballMesh.add(ring2);

    scene.add(this.basketballMesh);
  }

  public pickup(player: Player, hud: HUD, wantedSystem: WantedSystem): boolean {
    if (this.isHolding || this.isBallInAir) return false;
    this.isHolding = true;
    this.ballResetTimer = 0; // 撿起即取消回場倒數
    this.isChargingShot = false;
    this.shotChargeRatio = 0;
    player.isInvisible = true;
    hud.setBasketballAiming(true);
    wantedSystem.showBanner('🏀 拿起籃球！按住滑鼠左鍵蓄力，綠色時機放開出手！(站在標線上命中率大增)', 4000);
    return true;
  }

  public drop(player: Player, hud: HUD, wantedSystem: WantedSystem) {
    if (!this.isHolding) return;
    this.isHolding = false;
    this.isChargingShot = false;
    player.isInvisible = false;
    hud.setBasketballAiming(false);
    hud.hideShotMeter();
    this.basketballMesh.position.y = 0.24;
    wantedSystem.showBanner('放下籃球 (恢復第三人稱角色顯示)', 1500);
  }

  public startCharging(hud: HUD) {
    if (!this.isHolding || this.isChargingShot) return;
    this.isChargingShot = true;
    this.shotChargeRatio = 0;
    const sweetMin = this.currentActiveHotspot ? 0.62 : 0.68;
    const sweetMax = this.currentActiveHotspot ? 0.88 : 0.84;
    hud.showShotMeter(sweetMin, sweetMax);
  }

  public releaseShot(
    player: Player,
    camera: THREE.Camera,
    hud: HUD,
    hoopTargets: THREE.Vector3[]
  ) {
    if (!this.isHolding || !this.isChargingShot) return;
    this.isChargingShot = false;

    const ratio = this.shotChargeRatio;
    const sweetMin = this.currentActiveHotspot ? 0.62 : 0.68;
    const sweetMax = this.currentActiveHotspot ? 0.88 : 0.84;

    let quality: 'PERFECT' | 'GOOD' | 'BAD' = 'BAD';
    let feedbackType: 'PERFECT' | 'GOOD' | 'LATE' | 'EARLY' = 'EARLY';

    if (ratio >= sweetMin && ratio <= sweetMax) {
      quality = 'PERFECT';
      feedbackType = 'PERFECT';
    } else if (ratio >= sweetMin - 0.14 && ratio <= sweetMax + 0.10) {
      quality = 'GOOD';
      feedbackType = 'GOOD';
    } else if (ratio > sweetMax + 0.10) {
      quality = 'BAD';
      feedbackType = 'LATE';
    } else {
      quality = 'BAD';
      feedbackType = 'EARLY';
    }

    hud.showShotFeedback(feedbackType);

    // 投出三分球！角色恢復顯示
    this.isHolding = false;
    player.isInvisible = false;
    hud.setBasketballAiming(false);
    this.isBallInAir = true;
    this.ballResetTimer = 0; // 尚未落地，回場倒數於第一次觸地時才啟動
    this.targetShotQuality = quality;
    this.hasScoredThisShot = false;

    // 尋找鏡頭中央準心所對準的最佳目標籃框
    camera.getWorldDirection(_scratchCamDir);
    _scratchCamHoriz.set(_scratchCamDir.x, 0, _scratchCamDir.z).normalize();

    let bestHoop = hoopTargets[0];
    let bestScore = -999;
    for (const hoop of hoopTargets) {
      _scratchToHoop.subVectors(hoop, player.position);
      _scratchToHoopHoriz.set(_scratchToHoop.x, 0, _scratchToHoop.z).normalize();
      const dot = _scratchCamHoriz.dot(_scratchToHoopHoriz);
      const dist = _scratchToHoop.length();
      if (dot > 0.15 && dist < 36) {
        const score = dot * 10 - dist * 0.15;
        if (score > bestScore) {
          bestScore = score;
          bestHoop = hoop;
        }
      }
    }

    // 計算高拋物線彈道
    _scratchToHoop.subVectors(bestHoop, player.position);
    const horizDist = Math.max(3.0, Math.sqrt(_scratchToHoop.x * _scratchToHoop.x + _scratchToHoop.z * _scratchToHoop.z));
    const heightDiff = bestHoop.y - (player.position.y + 1.1);
    const g = 19.0;
    const flightTime = 0.82 + horizDist * 0.038;

    let targetOffsetX = 0;
    let targetOffsetY = 0;
    let targetOffsetZ = 0;
    if (quality === 'PERFECT') {
      targetOffsetX = 0;
      targetOffsetY = 0;
      targetOffsetZ = 0;
    } else if (quality === 'GOOD') {
      const side = Math.random() > 0.5 ? 0.15 : -0.15;
      targetOffsetX = side;
      targetOffsetY = 0.05;
      targetOffsetZ = (Math.random() - 0.5) * 0.15;
    } else {
      const sign = (feedbackType === 'LATE') ? 0.65 : -0.55;
      targetOffsetX = (Math.random() - 0.5) * 0.7;
      targetOffsetY = (Math.random() - 0.5) * 0.3;
      targetOffsetZ = sign;
    }

    _scratchAimPoint.set(
      bestHoop.x + targetOffsetX,
      bestHoop.y + targetOffsetY,
      bestHoop.z + targetOffsetZ
    );
    _scratchAimVec.subVectors(_scratchAimPoint, player.position);

    const reqHorizSpeed = horizDist / flightTime;
    const reqUpwardSpeed = (heightDiff + 0.5 * g * flightTime * flightTime) / flightTime;

    _scratchLaunchHoriz.set(_scratchAimVec.x, 0, _scratchAimVec.z).normalize();
    this.ballVelocity.set(
      _scratchLaunchHoriz.x * reqHorizSpeed,
      reqUpwardSpeed,
      _scratchLaunchHoriz.z * reqHorizSpeed
    );

    soundManager.playPunch(this.basketballMesh.position);
  }

  public update(
    delta: number,
    player: Player,
    input: InputManager,
    hud: HUD,
    wantedSystem: WantedSystem,
    hoopTargets: THREE.Vector3[],
    hotspots: ShootingHotspot[],
    camera: THREE.Camera
  ) {
    if (this.isHolding) {
      // 籃球持球位置：位於胸前右下方
      _scratchForward.set(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
      _scratchRight.set(-_scratchForward.z, 0, _scratchForward.x);
      this.basketballMesh.position.set(
        player.position.x + _scratchForward.x * 0.55 + _scratchRight.x * 0.28,
        player.position.y + 0.88,
        player.position.z + _scratchForward.z * 0.55 + _scratchRight.z * 0.28
      );
      this.basketballMesh.rotation.y += delta * 3.0;

      // 熱區檢測
      this.currentActiveHotspot = null;
      for (const spot of hotspots) {
        const dist = player.position.distanceTo(spot.position);
        if (dist < spot.radius) {
          this.currentActiveHotspot = spot;
          const mat = spot.ringMesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.95;
          spot.ringMesh.scale.set(1.15, 1.15, 1.15);
        } else {
          const mat = spot.ringMesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.55;
          spot.ringMesh.scale.set(1.0, 1.0, 1.0);
        }
      }

      if (this.currentActiveHotspot) {
        hud.showPrompt('長按左鍵', `🎯【${this.currentActiveHotspot.name}】蓄力出手 (獎勵 +${this.currentActiveHotspot.bonusPoints}分)`);
      } else {
        hud.showPrompt('長按左鍵', '🏀【自由投籃】蓄力出手 (按 E 放下 / R 鍵快速發球)');
      }

      // 運球音效
      if (input.forward || input.backward || input.left || input.right) {
        this.dribbleSoundTimer -= delta;
        if (this.dribbleSoundTimer <= 0) {
          soundManager.playDribble(this.basketballMesh.position);
          this.dribbleSoundTimer = 0.36;
        }
      }

      // 蓄力狀態推進
      if (this.isChargingShot) {
        if (input.mouseButtons.left) {
          this.shotChargeRatio += delta * 1.35;
          hud.updateShotMeter(this.shotChargeRatio);
          if (this.shotChargeRatio >= 1.08) {
            // 自動出手
            this.releaseShot(player, camera, hud, hoopTargets);
          }
        } else {
          // 電腦版玩家鬆開滑鼠左鍵，蓄力出手投籃！
          this.releaseShot(player, camera, hud, hoopTargets);
        }
      }
    } else if (this.isBallInAir) {
      this.ballVelocity.y -= 19.0 * delta;
      this.basketballMesh.position.addScaledVector(this.ballVelocity, delta);
      this.basketballMesh.rotation.x += delta * 12.0;

      // 命中籃框檢測
      if (!this.hasScoredThisShot) {
        for (const hoop of hoopTargets) {
          const distToHoop = this.basketballMesh.position.distanceTo(hoop);
          if (distToHoop < 0.95 && this.ballVelocity.y < 0) {
            this.hasScoredThisShot = true;

            if (this.targetShotQuality === 'PERFECT') {
              soundManager.playSwish(this.basketballMesh.position);
              this.scoreStreak++;
              this.totalMade++;
              if (this.scoreStreak > this.bestStreak) {
                this.bestStreak = this.scoreStreak;
              }
              const basePts = this.currentActiveHotspot ? this.currentActiveHotspot.bonusPoints : 150;
              const streakBonus = (this.scoreStreak > 1) ? ` (連進 ${this.scoreStreak} 球🔥)` : '';
              wantedSystem.showBanner(`🏀【PERFECT! 完美空心入網！】得分 +${basePts}！精力回滿！${streakBonus}`, 4000);
              player.stamina = player.maxStamina;
              this.ballVelocity.set(this.ballVelocity.x * 0.1, -4.8, this.ballVelocity.z * 0.1);
            } else if (this.targetShotQuality === 'GOOD') {
              soundManager.playRimHit(this.basketballMesh.position);
              setTimeout(() => soundManager.playSwish(this.basketballMesh.position), 180);
              this.scoreStreak++;
              this.totalMade++;
              if (this.scoreStreak > this.bestStreak) {
                this.bestStreak = this.scoreStreak;
              }
              const basePts = 100;
              wantedSystem.showBanner(`🏀【擦板彈框入網！】得分 +${basePts}！`, 3500);
              this.ballVelocity.set(this.ballVelocity.x * 0.25, -4.0, this.ballVelocity.z * 0.25);
            } else {
              soundManager.playRimHit(this.basketballMesh.position);
              this.scoreStreak = 0;
              wantedSystem.showBanner('🏀【打鐵不進！】請抓準綠色完美出手時機！', 2500);
              this.ballVelocity.x *= -0.6;
              this.ballVelocity.y = 3.8;
              this.ballVelocity.z *= -0.6;
            }
            break;
          }
        }
      }

      // 地面彈跳檢測
      if (this.basketballMesh.position.y <= 0.24) {
        this.basketballMesh.position.y = 0.24;
        // 第一次觸地才啟動回場倒數，之後的彈跳不重設
        if (this.ballResetTimer <= 0) this.ballResetTimer = BALL_RESET_DELAY_SEC;
        const horizSpeed = Math.sqrt(this.ballVelocity.x * this.ballVelocity.x + this.ballVelocity.z * this.ballVelocity.z);
        if (Math.abs(this.ballVelocity.y) > 1.2 || horizSpeed > 0.8) {
          this.ballVelocity.y = Math.abs(this.ballVelocity.y) * 0.52;
          this.ballVelocity.x *= 0.68;
          this.ballVelocity.z *= 0.68;
          soundManager.playDribble(this.basketballMesh.position);
        } else {
          this.ballVelocity.set(0, 0, 0);
          this.isBallInAir = false;
        }
      }
    }

    // 回場倒數：球在空中、彈跳或靜止時皆計時；持球時已於 pickup 取消
    if (!this.isHolding && this.ballResetTimer > 0) {
      this.ballResetTimer -= delta;
      if (this.ballResetTimer <= 0) {
        this.ballResetTimer = 0;
        this.isBallInAir = false;
        this.basketballMesh.position.copy(this.spawnPos);
        this.ballVelocity.set(0, 0, 0);
      }
    }
  }
}
