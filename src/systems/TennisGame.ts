import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NPC, ShuttlecockProjectile } from '../entities/NPC';
import { HUD } from '../ui/HUD';
import { WantedSystem } from './WantedSystem';
import { soundManager } from '../audio/SoundEffects';
import { InputManager } from '../core/InputManager';

const _scratchServeTarget = new THREE.Vector3();
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

  // 大如老師 (羽球 BOSS) 動態步法與跑位 AI 系統
  public peCoachRef?: NPC;
  public coachTargetPos: THREE.Vector3 = new THREE.Vector3(77.0, 12.0, 31.0);
  public coachMoveSpeed: number = 6.5;
  public coachFootworkTimer: number = 0;
  public coachCurrentAction: 'READY' | 'POSITIONING_SERVE' | 'SERVING' | 'RECOVERING' | 'CHASING' = 'READY';

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
    this.serveTimer = 1.0;
    this.finishedTimer = 0;
    this.peCoachRef = peCoach;
    this.coachFootworkTimer = 0;
    this.coachCurrentAction = 'READY';

    // 清空場上既有球體並處置資源
    for (const sc of this.shuttlecocks) {
      NPC.disposeProjectile(sc, scene);
    }
    this.shuttlecocks = [];

    // 定位教練至對面半場發球點 (77.0, 12.0, 31.0)，面朝 +Z 玩家半場
    if (peCoach) {
      peCoach.isInBadmintonMatch = true;
      peCoach.position.set(77.0, 12.0, 31.0);
      peCoach.mesh.position.copy(peCoach.position);
      peCoach.rotationY = 0;
      peCoach.mesh.rotation.y = 0;
      peCoach.isChasing = false;
      peCoach.shuttlecockCooldown = 0;
      this.coachTargetPos.set(77.0, 12.0, 31.0);
    }

    // 自動將玩家傳送至對面接球半場中心 (77.0, 12.0, 44.5)，面朝 -Z 教練發球點，相機置後對準球場正對 BOSS
    if (player) {
      player.position.set(77.0, 12.0, 44.5);
      player.mesh.position.copy(player.position);
      player.rotationY = Math.PI;
      player.mesh.rotation.y = Math.PI;
      player.velocity.set(0, 0, 0);
      player.equipBadmintonRacket(true); // 手上改為拿羽球拍 (造型)
    }
    if (cameraCtrl && player) {
      cameraCtrl.resetBehind(player.position, 0); // yaw = 0 使攝影機置於玩家正後方 (+Z)，鏡頭朝向 -Z 正面直對教練 BOSS！
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
    onRewardCash: (amount: number) => void,
    player?: Player,
    peCoach?: NPC
  ) {
    this.tennisState = 'FINISHED';
    this.finishedTimer = 4.0;

    // 比賽結束立即還原手上球拍造型為原本武器/空手
    if (player) {
      player.equipBadmintonRacket(false);
    }

    const coach = peCoach || this.peCoachRef;
    if (coach) {
      coach.isInBadmintonMatch = false;
      coach.resetPose();
    }

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

  // 重設/中止羽球比賽 (例如搭電梯、離場或切換世界時)
  public resetMatch(scene: THREE.Scene, player?: Player, peCoach?: NPC) {
    this.tennisState = 'IDLE';
    this.finishedTimer = 0;
    for (const sc of this.shuttlecocks) {
      NPC.disposeProjectile(sc, scene);
    }
    this.shuttlecocks = [];
    this.updateScoreboard();
    if (player) {
      player.equipBadmintonRacket(false);
    }
    const coach = peCoach || this.peCoachRef;
    if (coach) {
      coach.isInBadmintonMatch = false;
      coach.resetPose();
    }
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
        player.equipBadmintonRacket(false);
        if (peCoach) {
          peCoach.isInBadmintonMatch = false;
          peCoach.resetPose();
        }
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
      if (peCoach) {
        peCoach.rotationY = 0;
        peCoach.mesh.rotation.y = 0;
        peCoach.animateBadmintonAction(delta, 0, false, false);
      }
      if (this.countdownTimer <= 0) {
        this.tennisState = 'PLAYING';
        this.serveTimer = 1.0;
        soundManager.playWhistle();
        this.updateScoreboard();
      }
    } else if (this.tennisState === 'PLAYING') {
      if (peCoach) {
        peCoach.isInBadmintonMatch = true;
        peCoach.isChasing = false;
        this.coachFootworkTimer += delta;

        // 判斷當前羽球狀態：是否有球在場上？
        const activeShuttle = this.shuttlecocks.length > 0 ? this.shuttlecocks[0] : null;

        if (activeShuttle && activeShuttle.isReturned) {
          // ==========================================
          // 狀態 A：玩家已擊球回擊，教練全力飛奔迎球撲救 (CHASING)
          // ==========================================
          this.coachCurrentAction = 'CHASING';
          this.coachMoveSpeed = 8.8; // 撲救高速衝刺步法

          // 預測羽球落點或攔截點：羽球朝 -Z 方向飛向教練半場
          let predX = activeShuttle.position.x;
          let predZ = activeShuttle.position.z;
          if (activeShuttle.velocity.z < -0.1) {
            // 估算羽球到達 Z ≈ 31.5 (攔截深度) 的時間
            const t = Math.max(0, (31.5 - activeShuttle.position.z) / activeShuttle.velocity.z);
            predX = activeShuttle.position.x + activeShuttle.velocity.x * t;
            predZ = 31.5;
          }
          // 嚴格夾持在教練守備半場內 (X: 72.8 ~ 81.2, Z: 27.5 ~ 35.5)
          this.coachTargetPos.x = THREE.MathUtils.clamp(predX, 72.8, 81.2);
          this.coachTargetPos.z = THREE.MathUtils.clamp(predZ, 27.5, 35.5);
          this.coachTargetPos.y = 12.0;

        } else if (activeShuttle && !activeShuttle.isReturned) {
          // ==========================================
          // 狀態 B：球正飛向玩家半場，教練發球後迅速回防中場 T 點 (RECOVERING)
          // ==========================================
          this.coachCurrentAction = 'RECOVERING';
          this.coachMoveSpeed = 6.2;
          // 回防中場 T 點 (77.0, 12.0, 31.0)，並帶有微幅戰術側移墊步
          const tacticalSway = Math.sin(this.coachFootworkTimer * 2.5) * 0.7;
          this.coachTargetPos.set(77.0 + tacticalSway, 12.0, 31.0);

        } else {
          // ==========================================
          // 狀態 C：場上無球，教練走位至發球區準備發球 (POSITIONING_SERVE)
          // ==========================================
          this.coachCurrentAction = 'POSITIONING_SERVE';
          this.coachMoveSpeed = 5.5;

          // 根據局分輪流站位：雙數分右發球區 (X≈79.2)，單數分左發球區 (X≈74.8)
          const totalPoints = this.playerScore + this.coachScore;
          const serveX = (totalPoints % 2 === 0) ? 79.2 : 74.8;
          const serveZ = 32.5;
          this.coachTargetPos.set(serveX, 12.0, serveZ);

          // 發球倒數計時
          this.serveTimer -= delta;
          if (this.serveTimer <= 0) {
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
              // 1. 網前放小球 (Drop Shot)：玩家退太後時，向上拋過網口急墜！
              targetX = 75.0 + Math.random() * 4.0; // 75.0 ~ 79.0
              targetZ = 40.2 + Math.random() * 1.5; // 40.2 ~ 41.7 (近網前)
              shotSpeed = 10.2;
              shotArc = 2.4; // 充足向上拋物線，高挑越過球網急墜
              wantedSystem.showBanner('🏸 大如老師使出【網前放小球】！快前衝接球！', 1600);
            } else if (playerDistFromNet < 5.0 || (rand >= 0.28 && rand < 0.52)) {
              // 2. 後場高遠球 (Deep Lob)：玩家靠太近時，高拋底線死角！
              targetX = Math.random() < 0.5 ? (73.8 + Math.random() * 1.2) : (79.0 + Math.random() * 1.2);
              targetZ = 46.5 + Math.random() * 1.2; // 46.5 ~ 47.7 (底線深區)
              shotSpeed = 12.2;
              shotArc = 2.8; // 高挑彩虹向上拋物線
              wantedSystem.showBanner('🏸 大如老師打出【後場底線高遠球】！迅速後撤回擊！', 1600);
            } else if (rand >= 0.52 && rand < 0.80) {
              // 3. 大對角斜線抽球 (Cross-Court Drive)：逼迫大跨步側移！
              if (playerPos.x < 77.0) {
                targetX = 79.6 + Math.random() * 1.2; // 逼打右側線
              } else {
                targetX = 73.2 + Math.random() * 1.2; // 逼打左側線
              }
              targetZ = 43.5 + Math.random() * 1.8;
              shotSpeed = 12.0;
              shotArc = 2.2; // 向上拋物線越網
              wantedSystem.showBanner('🏸 大如老師大角度【大對角斜線變線】！側步跨救！', 1600);
            } else {
              // 4. 凌空暴扣殺球 (Thunder Smash)：高點下壓殺球，同樣具備向上起弧越網！
              targetX = THREE.MathUtils.clamp(playerPos.x + (Math.random() - 0.5) * 2.2, 74.0, 80.0);
              targetZ = 43.0 + Math.random() * 1.5;
              shotSpeed = 13.5;
              shotArc = 1.9; // 向上拋物線過網後俯衝
              wantedSystem.showBanner('⚡ 大如老師凌空起跳【雷霆暴扣殺球】！看準時機揮拍！', 1600);
            }

            _scratchServeTarget.set(targetX, 12.0, targetZ);
            const proj = peCoach.tryShootShuttlecock(_scratchServeTarget, scene, 2.2, shotSpeed, shotArc);
            if (proj) {
              this.shuttlecocks.push(proj);
            }
          }
        }

        // ==========================================
        // 實施教練步法平滑移動與方向插值 (0-GC 物理運動與動畫更新)
        // ==========================================
        const toTargetX = this.coachTargetPos.x - peCoach.position.x;
        const toTargetZ = this.coachTargetPos.z - peCoach.position.z;
        const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);

        if (distToTarget > 0.08) {
          const step = Math.min(distToTarget, this.coachMoveSpeed * delta);
          peCoach.position.x += (toTargetX / distToTarget) * step;
          peCoach.position.z += (toTargetZ / distToTarget) * step;
          peCoach.position.y = 12.0;

          // 嚴格夾持在 4F 羽球場北半場
          peCoach.position.x = THREE.MathUtils.clamp(peCoach.position.x, 72.8, 81.2);
          peCoach.position.z = THREE.MathUtils.clamp(peCoach.position.z, 27.2, 35.8);
          peCoach.mesh.position.copy(peCoach.position);

          // 跑位時面向：撲救時面向目標落點，回防與發球時面向玩家 (+Z)
          let targetAngle = 0;
          if (this.coachCurrentAction === 'CHASING') {
            targetAngle = Math.atan2(toTargetX, toTargetZ);
          }
          let diff = targetAngle - peCoach.rotationY;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          peCoach.rotationY += diff * Math.min(delta * 9.0, 1.0);
          peCoach.mesh.rotation.y = peCoach.rotationY;

          peCoach.animateBadmintonAction(delta, this.coachMoveSpeed, true);
        } else {
          // 到達目標定點：教練保持面朝玩家，執行羽球防守準備墊步姿態 (Ready Bounce)
          peCoach.position.x = this.coachTargetPos.x;
          peCoach.position.z = this.coachTargetPos.z;
          peCoach.position.y = 12.0;
          peCoach.mesh.position.copy(peCoach.position);

          let diff = 0 - peCoach.rotationY;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          peCoach.rotationY += diff * Math.min(delta * 8.0, 1.0);
          peCoach.mesh.rotation.y = peCoach.rotationY;

          peCoach.animateBadmintonAction(delta, 0, false);
        }
      }
    } else if (this.tennisState === 'FINISHED') {
      this.finishedTimer -= delta;
      if (this.finishedTimer <= 0) {
        this.tennisState = 'IDLE';
        this.updateScoreboard();
        player.equipBadmintonRacket(false);
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
            this.endMatch(false, wantedSystem, hud, scene, onRewardCash, player);
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
            // 玩家擊球回擊：計算向上的彩虹高遠拋物線，巧妙打向教練半場的不同戰術落點 (左右大角、前場小球或底線)
            let returnX = 77.0;
            let returnZ = 31.0;
            const rand = Math.random();

            if (peCoach.position.x >= 77.0) {
              // 教練偏右，玩家反抽左側大角度！
              returnX = 73.8 + Math.random() * 1.6;
            } else {
              // 教練偏左，玩家抽向右側大角度！
              returnX = 78.6 + Math.random() * 1.6;
            }

            if (rand < 0.35) {
              // 前場吊球
              returnZ = 34.2 + Math.random() * 1.2;
            } else if (rand < 0.70) {
              // 底線深遠球
              returnZ = 28.2 + Math.random() * 1.5;
            } else {
              // 中場平抽
              returnZ = 31.0 + Math.random() * 1.5;
            }

            const targetX = returnX;
            const targetY = 12.0 + 1.35;
            const targetZ = returnZ;

            const dx = targetX - sc.position.x;
            const dz = targetZ - sc.position.z;
            const flightTime = 1.18; // 1.18 秒高挑回擊飛行時間

            const velX = dx / flightTime;
            const velZ = dz / flightTime;
            // 向上拋物線垂直速度：確保在網頂 (Z=38.0) 處高度達到 15.2m 以上，遠高於 13.55m 球網
            const velY = ((targetY - sc.position.y) / flightTime) + 0.5 * 9.8 * flightTime + 2.2;

            sc.velocity.set(velX, velY, velZ);

            // 抽球反彈時，羽球即刻掉頭朝向初速度飛行方向
            _scratchLookTarget.copy(sc.position).add(sc.velocity);
            sc.mesh.lookAt(_scratchLookTarget);
          }
          if (this.playerScore >= 5) {
            this.endMatch(true, wantedSystem, hud, scene, onRewardCash, player);
            continue;
          } else {
            this.serveTimer = 2.0;
          }
          continue;
        }
      }

      // 成功回擊給教練：球飛回教練半場
      if (sc.isReturned && peCoach) {
        const distToCoach = sc.position.distanceTo(peCoach.position);
        const isLanded = sc.position.y <= 12.18 && sc.position.z <= 37.0;
        if (distToCoach < 2.5 || sc.position.z <= 27.2 || isLanded) {
          soundManager.playBadmintonHit();
          peCoach.triggerAttackAnimation();
          NPC.disposeProjectile(sc, scene);
          this.shuttlecocks.splice(i, 1);
          this.serveTimer = 2.0;
          if (distToCoach < 2.5) {
            wantedSystem.showBanner('🏸 大如老師飛身撲救截擊！精采來回！', 1600);
          } else {
            wantedSystem.showBanner('🏸 大如老師救球不及！玩家漂亮得分！', 1600);
          }
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
            this.endMatch(false, wantedSystem, hud, scene, onRewardCash, player);
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
