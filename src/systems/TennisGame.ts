import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NPC, ShuttlecockProjectile } from '../entities/NPC';
import { HUD } from '../ui/HUD';
import { WantedSystem } from './WantedSystem';
import { soundManager } from '../audio/SoundEffects';
import { InputManager } from '../core/InputManager';

const _scratchServeTarget = new THREE.Vector3();
const _scratchDirToCoach = new THREE.Vector3();
const _scratchLookTarget = new THREE.Vector3();

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

  public startMatch(
    hud: HUD,
    peCoach: NPC | undefined,
    scene: THREE.Scene,
    player?: Player,
    cameraCtrl?: any
  ) {
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

    // 定位教練至對面半場發球點 (77.0, 12.0, 31.0)，面朝 +Z 玩家半場
    if (peCoach) {
      peCoach.position.set(77.0, 12.0, 31.0);
      peCoach.mesh.position.copy(peCoach.position);
      peCoach.rotationY = 0;
      peCoach.mesh.rotation.y = 0;
      peCoach.isChasing = false;
      peCoach.shuttlecockCooldown = 0;
    }

    // 自動將玩家傳送至對面接球半場中心 (77.0, 12.0, 44.5)，面朝 -Z 教練發球點，相機置後對準球場
    if (player) {
      player.position.set(77.0, 12.0, 44.5);
      player.mesh.position.copy(player.position);
      player.rotationY = Math.PI;
      player.mesh.rotation.y = Math.PI;
      player.velocity.set(0, 0, 0);
    }
    if (cameraCtrl && player) {
      cameraCtrl.resetBehind(player.position, Math.PI);
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
        scoreboardEl.textContent = `🏸 比賽倒數: ${countSec} (搶5分勝)`;
      } else if (this.tennisState === 'PLAYING') {
        scoreboardEl.textContent = `🏸 羽球挑戰賽 | 玩家: ${this.playerScore} - ${this.coachScore} :大如老師 (搶5分勝)`;
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
    // 檢查玩家是否在 4F 羽球場內部
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
        wantedSystem.showBanner('🏸 已離開 4F 羽球場，挑戰賽已終止。', 2500);
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
          this.serveTimer = 2.4;
          peCoach.shuttlecockCooldown = 0;

          // 體育老師智慧球路多樣性系統 (4 大變速變線球路，動態判斷玩家站位，拒絕單一餵球)
          const playerDistFromNet = playerPos.z - 37.0; // 網子在 Z=37.0
          const rand = Math.random();

          let targetX = 77.0;
          let targetZ = 44.0;
          let shotSpeed = 11.5;
          let shotArc = 0.8;

          if (playerDistFromNet > 6.2 || (rand < 0.28 && playerDistFromNet > 4.5)) {
            // 1. 網前放小球 (Drop Shot)：玩家退太後時，吊網口急墜！
            targetX = 75.0 + Math.random() * 4.0; // 75.0 ~ 79.0
            targetZ = 40.2 + Math.random() * 1.5; // 40.2 ~ 41.7 (近網前)
            shotSpeed = 9.8;
            shotArc = 1.25;
            wantedSystem.showBanner('🏸 大如老師使出【網前放小球】！快前衝接球！', 1600);
          } else if (playerDistFromNet < 5.0 || (rand >= 0.28 && rand < 0.52)) {
            // 2. 後場高遠球 (Deep Lob)：玩家靠太近時，高拋底線死角！
            targetX = Math.random() < 0.5 ? (73.8 + Math.random() * 1.2) : (79.0 + Math.random() * 1.2);
            targetZ = 46.5 + Math.random() * 1.2; // 46.5 ~ 47.7 (底線深區)
            shotSpeed = 12.8;
            shotArc = 1.95; // 高挑彩虹弧線
            wantedSystem.showBanner('🏸 大如老師打出【後場底線高遠球】！迅速後撤回擊！', 1600);
          } else if (rand >= 0.52 && rand < 0.80) {
            // 3. 大對角斜線抽球 (Cross-Court Drive)：逼迫大跨步側移！
            if (playerPos.x < 77.0) {
              targetX = 79.6 + Math.random() * 1.2; // 逼打右側線
            } else {
              targetX = 73.2 + Math.random() * 1.2; // 逼打左側線
            }
            targetZ = 43.5 + Math.random() * 1.8;
            shotSpeed = 13.8;
            shotArc = 0.72;
            wantedSystem.showBanner('🏸 大如老師大角度【大對角斜線變線】！側步跨救！', 1600);
          } else {
            // 4. 凌空暴扣殺球 (Thunder Smash)：高速俯衝平壓！
            targetX = THREE.MathUtils.clamp(playerPos.x + (Math.random() - 0.5) * 2.2, 74.0, 80.0);
            targetZ = 42.8 + Math.random() * 1.6;
            shotSpeed = 16.5;
            shotArc = 0.35; // 銳角下壓
            wantedSystem.showBanner('⚡ 大如老師凌空起跳【雷霆暴扣殺球】！看準時機揮拍！', 1600);
          }

          _scratchServeTarget.set(targetX, 12.0, targetZ);
          const proj = peCoach.tryShootShuttlecock(_scratchServeTarget, scene, 2.2, shotSpeed, shotArc);
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

    // 更新飛行中的羽球
    for (let i = this.shuttlecocks.length - 1; i >= 0; i--) {
      const sc = this.shuttlecocks[i];
      sc.velocity.y -= 9.8 * delta;
      sc.position.addScaledVector(sc.velocity, delta);
      sc.mesh.position.copy(sc.position);

      // 飛行朝向 (Trajectory Orientation)：球頭始終指向速度向量，羽毛裙拖在後方，呈現真實羽球劃破空氣姿態
      if (sc.velocity.lengthSq() > 0.001) {
        _scratchLookTarget.copy(sc.position).add(sc.velocity);
        sc.mesh.lookAt(_scratchLookTarget);
        // 沿飛行軸自轉 (真實羽球旋轉下壓姿態)
        sc.mesh.rotateZ(sc.life * 22.0);
      }
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

      // 玩家打擊回擊羽球判定
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
            // 抽球反彈時，羽球即刻掉頭朝向對方場區飛行
            _scratchLookTarget.copy(sc.position).add(sc.velocity);
            sc.mesh.lookAt(_scratchLookTarget);
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
            player.takeDamage(2, '羽球衝擊');
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
