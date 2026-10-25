import * as THREE from 'three';
import { Player } from '../entities/Player';
import { WantedSystem } from './WantedSystem';
import { soundManager } from '../audio/SoundEffects';
import { WaterSplashVFX } from '../effects/WaterSplashVFX';

export class RacingGame {
  // 操場 200m 賽跑計時挑戰
  public isRacingTrack: boolean = false;
  public raceTimer: number = 0;
  public raceCheckpointIdx: number = 0;
  public checkpointMarker: THREE.Mesh;
  public bestTrackTime: number | null = null;

  // 游泳池 50m 水上競速挑戰
  public isSwimmingRace: boolean = false;
  public swimRaceTimer: number = 0;
  public swimCheckpointIdx: number = 0;
  public swimCheckpointMarker: THREE.Mesh;
  public bestSwimTime: number | null = null;

  constructor(scene: THREE.Scene) {
    // 操場檢查點綠色光圈
    const cpGeo = new THREE.TorusGeometry(1.6, 0.12, 8, 24);
    const cpMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.85 });
    this.checkpointMarker = new THREE.Mesh(cpGeo, cpMat);
    this.checkpointMarker.visible = false;
    scene.add(this.checkpointMarker);

    // 泳池檢查點青水色光圈
    const swimCpGeo = new THREE.TorusGeometry(1.5, 0.12, 8, 24);
    const swimCpMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.88 });
    this.swimCheckpointMarker = new THREE.Mesh(swimCpGeo, swimCpMat);
    this.swimCheckpointMarker.visible = false;
    scene.add(this.swimCheckpointMarker);
  }

  public startTrackRace(wantedSystem: WantedSystem) {
    this.isRacingTrack = true;
    this.raceTimer = 0;
    this.raceCheckpointIdx = 0;
    soundManager.playWhistle();
    wantedSystem.showBanner('⏱️【200m 操場極速挑戰賽開始！】請沿著跑道「逆時針方向」全力衝刺！', 3500);
  }

  public startSwimRace(wantedSystem: WantedSystem) {
    this.isSwimmingRace = true;
    this.swimRaceTimer = 0;
    this.swimCheckpointIdx = 0;
    soundManager.playWhistle();
    wantedSystem.showBanner('🏊【50m 自由式水上競速賽開始！】跳入泳池游過青色檢查點！', 4000);
  }

  public updateTrack(
    delta: number,
    playerPos: THREE.Vector3,
    checkpoints: THREE.Vector3[],
    wantedSystem: WantedSystem,
    player: Player
  ) {
    if (!this.isRacingTrack) {
      this.checkpointMarker.visible = false;
      return;
    }

    this.raceTimer += delta;
    const targetCp = checkpoints[this.raceCheckpointIdx];
    this.checkpointMarker.visible = true;
    this.checkpointMarker.position.copy(targetCp);
    this.checkpointMarker.rotation.y += delta * 2.5;

    if (playerPos.distanceTo(targetCp) < 4.8) {
      soundManager.playBicycleBell();
      this.raceCheckpointIdx++;
      if (this.raceCheckpointIdx >= checkpoints.length) {
        this.isRacingTrack = false;
        this.checkpointMarker.visible = false;
        soundManager.playFanfare();
        if (!this.bestTrackTime || this.raceTimer < this.bestTrackTime) {
          this.bestTrackTime = this.raceTimer;
        }
        wantedSystem.showBanner(
          `🏆【挑戰成功！】完賽成績: ${this.raceTimer.toFixed(1)} 秒！獲得「校園飛毛腿」稱號！耐力上限提升至 130！`,
          5000
        );
        player.maxStamina = 130;
        player.stamina = 130;
      }
    }
  }

  public updateSwim(
    delta: number,
    playerPos: THREE.Vector3,
    checkpoints: THREE.Vector3[],
    wantedSystem: WantedSystem,
    player: Player,
    waterSplashVFX: WaterSplashVFX,
    onRewardCash: (amount: number) => void
  ) {
    if (!this.isSwimmingRace) {
      this.swimCheckpointMarker.visible = false;
      return;
    }

    this.swimRaceTimer += delta;
    const targetSwimCp = checkpoints[this.swimCheckpointIdx];
    this.swimCheckpointMarker.visible = true;
    this.swimCheckpointMarker.position.copy(targetSwimCp);
    this.swimCheckpointMarker.rotation.y += delta * 3.0;

    if (playerPos.distanceTo(targetSwimCp) < 3.2) {
      soundManager.playWaterSplash();
      waterSplashVFX.triggerSplashBurst(player.position, player.rotationY, true, 0.25);
      this.swimCheckpointIdx++;
      if (this.swimCheckpointIdx >= checkpoints.length) {
        this.isSwimmingRace = false;
        this.swimCheckpointMarker.visible = false;
        soundManager.playFanfare();
        if (!this.bestSwimTime || this.swimRaceTimer < this.bestSwimTime) {
          this.bestSwimTime = this.swimRaceTimer;
        }
        onRewardCash(150);
        player.maxStamina = Math.max(player.maxStamina, 150);
        player.stamina = player.maxStamina;
        wantedSystem.showBanner(
          `🏊【水上飛魚！】50m 游泳完賽！成績: ${this.swimRaceTimer.toFixed(1)} 秒！獲得獎金 +$150，精力上限躍升至 150！`,
          5000
        );
      }
    }
  }
}
