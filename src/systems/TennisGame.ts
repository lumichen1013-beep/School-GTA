import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NPC, ShuttlecockProjectile } from '../entities/NPC';
import { HUD } from '../ui/HUD';
import { WantedSystem } from './WantedSystem';
import { soundManager } from '../audio/SoundEffects';
import { InputManager } from '../core/InputManager';

const _scratchServeTarget = new THREE.Vector3();
const _scratchDirToCoach = new THREE.Vector3();

export class TennisGame {
  public tennisState: 'IDLE' | 'STARTING' | 'PLAYING' | 'FINISHED' = 'IDLE';
  public playerScore: number = 0;
  public coachScore: number = 0;
  public countdownTimer: number = 0;
  public lastCountdownSec: number = -1;
  public serveTimer: number = 0;
  public finishedTimer: number = 0;
  public coachDefeated: boolean = false;
  public shuttlecocks: ShuttlecockProjectile[] = [];

  public openDialog(hud: HUD, onStart: () => void) {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    hud.openTennisDialog(onStart);
  }

  public startMatch(hud: HUD, peCoach: NPC | undefined, scene: THREE.Scene) {
    hud.closeTennisDialog();
    this.tennisState = 'STARTING';
    this.playerScore = 0;
    this.coachScore = 0;
    this.countdownTimer = 3.0;
    this.lastCountdownSec = 3;
    this.serveTimer = 0.5;
    this.finishedTimer = 0;

    // 清空場上既有球體並處置資源
    for (const sc of this.shuttlecocks) {
      NPC.disposeProjectile(sc, scene);
    }
    this.shuttlecocks = [];

    // 定位教練
    if (peCoach) {
      peCoach.position.set(77.0, 12.0, 31.0);
      peCoach.mesh.position.copy(peCoach.position);
      peCoach.rotationY = 0;
      peCoach.mesh.rotation.y = 0;
      peCoach.isChasing = false;
      peCoach.shuttlecockCooldown = 0;
    }

    hud.hidePrompt();
    this.updateScoreboard();
    soundManager.playWhistle();
  }

  public endMatch(
    playerWon: boolean,
    wantedSystem: WantedSystem,
    hud: HUD,
    scene: THREE.Scene,
    onRewardCash: (amount: number) => void
  ) {
    this.tennisState = 'FINISHED';
    this.finishedTimer = 4.0;

    for (const sc of this.shuttlecocks) {
      NPC.disposeProjectile(sc, scene);
    }
    this.shuttlecocks = [];

    if (playerWon) {
      this.coachDefeated = true;
      soundManager.playFanfare();
      soundManager.playCashRegister();
      onRewardCash(200);
      wantedSystem.clearWanted();
      wantedSystem.showBanner(
        `🏆 挑戰成功！大如老師讚許：「打得好！很有運動天賦！」獎勵 NT$ 200 與操行優良！【${this.playerScore} - ${this.coachScore}】`,
        6000
      );
    } else {
      soundManager.playPunch();
      soundManager.playWhistle();
      wantedSystem.showBanner(
        `❌ 挑戰失敗！大如老師：「體力或反應不足，再接再厲！」【${this.playerScore} - ${this.coachScore}】`,
        4500
      );
    }

    hud.hidePrompt();
    this.updateScoreboard();
  }

  public updateScoreboard() {
    const scoreboardEl = document.getElementById('tennis-scoreboard');
    if (scoreboardEl) {
      if (this.tennisState === 'STARTING') {
        const countSec = Math.max(1, Math.ceil(this.countdownTimer));
        scoreboardEl.textContent = `🎾 比賽倒數: ${countSec} (搶5分勝)`;
      } else if (this.tennisState === 'PLAYING') {
        scoreboardEl.textContent = `🎾 網球挑戰賽 | 玩家: ${this.playerScore} - ${this.coachScore} :大如老師 (搶5分勝)`;
      }
      scoreboardEl.style.display = (this.tennisState === 'PLAYING' || this.tennisState === 'STARTING') ? 'flex' : 'none';
    }
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    peCoach: NPC | undefined,
    player: Player,
    input: InputManager,
    scene: THREE.Scene,
    wantedSystem: WantedSystem,
    hud: HUD,
    onRewardCash: (amount: number) => void
  ) {
    // 檢查玩家是否在 4F 網球場內部
    const isPlayerInCourt =
      playerPos.y >= 11.2 && playerPos.y <= 17.0 &&
      playerPos.x >= 63.0 && playerPos.x <= 85.0 &&
      playerPos.z >= 23.0 && playerPos.z <= 53.0;

    // 比賽中離場或死亡終止
    if (this.tennisState === 'STARTING' || this.tennisState === 'PLAYING') {
      if (!isPlayerInCourt || player.isDead || (peCoach && peCoach.isKnockedDown)) {
        this.tennisState = 'IDLE';
        for (const sc of this.shuttlecocks) {
          NPC.disposeProjectile(sc, scene);
        }
        this.shuttlecocks = [];
        this.updateScoreboard();
        wantedSystem.showBanner('🎾 已離開 4F 網球場，挑戰賽已終止。', 2500);
      }
    }

    if (this.tennisState === 'STARTING') {
      this.countdownTimer -= delta;
      const countSec = Math.max(1, Math.ceil(this.countdownTimer));
      if (countSec > 0 && countSec !== this.lastCountdownSec) {
        this.lastCountdownSec = countSec;
        soundManager.playBroadcastChime();
        this.updateScoreboard();
      }
      if (this.countdownTimer <= 0) {
        this.tennisState = 'PLAYING';
        this.serveTimer = 0.8;
        soundManager.playWhistle();
        this.updateScoreboard();
      }
    } else if (this.tennisState === 'PLAYING') {
      if (peCoach) {
        peCoach.position.set(77.0, 12.0, 31.0);
        peCoach.mesh.position.copy(peCoach.position);
        peCoach.rotationY = 0;
        peCoach.mesh.rotation.y = 0;
        peCoach.isChasing = false;

        this.serveTimer -= delta;
        if (this.shuttlecocks.length === 0 && this.serveTimer <= 0) {
          this.serveTimer = 2.2;
          const targetX = THREE.MathUtils.clamp(playerPos.x, 72.0, 82.0);
          const targetZ = THREE.MathUtils.clamp(playerPos.z, 42.0, 47.0);
          _scratchServeTarget.set(targetX, 12.0, targetZ);
          peCoach.shuttlecockCooldown = 0;
          const proj = peCoach.tryShootShuttlecock(_scratchServeTarget, scene, 2.2);
          if (proj) {
            this.shuttlecocks.push(proj);
          }
        }
      }
    } else if (this.tennisState === 'FINISHED') {
      this.finishedTimer -= delta;
      if (this.finishedTimer <= 0) {
        this.tennisState = 'IDLE';
        this.updateScoreboard();
      }
    }

    // 更新飛行中的網球
    for (let i = this.shuttlecocks.length - 1; i >= 0; i--) {
      const sc = this.shuttlecocks[i];
      sc.velocity.y -= 9.8 * delta;
      sc.position.addScaledVector(sc.velocity, delta);
      sc.mesh.position.copy(sc.position);
      sc.mesh.rotation.x += delta * 12.0;
      sc.mesh.rotation.y += delta * 8.0;
      sc.life -= delta;

      // 出界判定
      if (
        sc.position.x < 62.8 || sc.position.x > 85.2 ||
        sc.position.z < 22.8 || sc.position.z > 53.2 ||
        sc.position.y < 11.5 || sc.position.y > 17.5
      ) {
        if (!sc.hasHitOrMissed && !sc.isReturned && this.tennisState === 'PLAYING') {
          sc.hasHitOrMissed = true;
          this.coachScore += 1;
          this.updateScoreboard();
          soundManager.playWhistle();
          if (this.coachScore >= 5) {
            this.endMatch(false, wantedSystem, hud, scene, onRewardCash);
          } else {
            this.serveTimer = 2.0;
          }
        }
        NPC.disposeProjectile(sc, scene);
        this.shuttlecocks.splice(i, 1);
        continue;
      }

      // 玩家打擊回擊網球判定
      if (this.tennisState === 'PLAYING' && !sc.isReturned && !sc.hasHitOrMissed && sc.position.distanceTo(playerPos) < 3.0) {
        if (player.isAttacking || input.mouseButtons.left) {
          sc.isReturned = true;
          sc.hasHitOrMissed = true;
          soundManager.playBadmintonHit();
          this.playerScore += 1;
          this.updateScoreboard();
          if (peCoach) {
            _scratchDirToCoach.set(peCoach.position.x, peCoach.position.y + 1.2, peCoach.position.z)
              .sub(sc.position).normalize();
            sc.velocity.copy(_scratchDirToCoach.multiplyScalar(22.0));
          }
          if (this.playerScore >= 5) {
            this.endMatch(true, wantedSystem, hud, scene, onRewardCash);
            continue;
          } else {
            this.serveTimer = 2.0;
          }
          continue;
        }
      }

      // 成功回擊給教練：球飛回教練半場
      if (sc.isReturned && peCoach) {
        if (sc.position.distanceTo(peCoach.position) < 2.2 || sc.position.z <= 29.5 || sc.position.y <= 12.12) {
          soundManager.playBadmintonHit();
          NPC.disposeProjectile(sc, scene);
          this.shuttlecocks.splice(i, 1);
          this.serveTimer = 2.0;
          continue;
        }
      }

      // 漏球失誤或被砸中判定
      if (this.tennisState === 'PLAYING' && !sc.hasHitOrMissed && !sc.isReturned) {
        const distToPlayer = sc.position.distanceTo(playerPos);
        const isHit = distToPlayer < 0.95;
        const isPast = sc.position.z > playerPos.z + 1.2;
        const isLanded = sc.position.y <= 12.12 && sc.position.z >= 38.0;

        if (isHit || isPast || isLanded) {
          sc.hasHitOrMissed = true;
          soundManager.playPunch();
          soundManager.playWhistle();
          if (isHit) {
            player.takeDamage(2, '網球衝擊');
          }
          this.coachScore += 1;
          this.updateScoreboard();
          NPC.disposeProjectile(sc, scene);
          this.shuttlecocks.splice(i, 1);
          if (this.coachScore >= 5) {
            this.endMatch(false, wantedSystem, hud, scene, onRewardCash);
          } else {
            this.serveTimer = 2.0;
          }
          continue;
        }
      }

      // 壽命結束
      if (sc.life <= 0) {
        NPC.disposeProjectile(sc, scene);
        this.shuttlecocks.splice(i, 1);
      }
    }
  }
}
