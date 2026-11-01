import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import type { NPC } from '../entities/NPC';
import type { DetentionRadarData } from '../ui/HUD';
import type { GameContext } from './GameContext';
import { SurroundCoordinator } from './SurroundCoordinator';

const _scratchCqcScreenPos = new THREE.Vector3();

// 第二世界全域警戒階段 (MGS 式)：NORMAL → ALERT (有守衛看見) → EVASION (失去目標、搜索最後目擊點並倒數) → CAUTION (提高戒備回崗) → NORMAL
type AlertPhase = 'NORMAL' | 'ALERT' | 'EVASION' | 'CAUTION';
const ALERT_HOLD_TIME = 1.0; // 短暫失去視線 (如總教官衝撞、轉角) 不立即轉入搜索，避免警戒橫幅閃爍
const EVASION_TIME = 5.0;
const CAUTION_TIME = 4.0;
const FIGHT_NOISE_RADIUS = 20.0; // 正面打鬥聲響傳播半徑 (m)；暗殺為無聲

/**
 * 第二世界【特訓院】潛入越獄玩法：門禁鑰匙卡、存檔點、探照燈警戒、背後暗殺目標鎖定、出生保護與通關結算
 */
// 總教官撞柱硬直且非護盾無敵期：唯一可在 ALERT 狀態下被暗殺的破綻
export function isBossStunOpening(npc: NPC): boolean {
  return npc.role === 'DETENTION_BOSS' && npc.isBossStunned && !npc.isBossInvulnerable && npc.bossInvulnerableTimer <= 0;
}

// 面向 rotY 的角色，來源方向 (toX, toZ)＝自角色指向攻擊來源 (不需正規化) 是否位於背後盲區
// (面向與來源方向夾角 dot < -0.15，約背後 162 度)；長度過短視為正面
export function isBehindFacing(rotY: number, toX: number, toZ: number): boolean {
  const dist = Math.sqrt(toX * toX + toZ * toZ);
  if (dist <= 0.001) return false;
  return (Math.sin(rotY) * toX + Math.cos(rotY) * toZ) / dist < -0.15;
}

// 指定位置是否位於 NPC 背後盲區 (近戰：攻擊來源 = 玩家位置)
export function isBehindNpc(npc: NPC, x: number, z: number): boolean {
  return isBehindFacing(npc.rotationY, x - npc.position.x, z - npc.position.z);
}

// 外部傳入攻擊行進方向 (dirX, dirZ)＝來源 → NPC (如投射物速度方向) 時是否來自背後：來源方向取其反向
export function isAttackFromBehind(npc: NPC, dirX: number, dirZ: number): boolean {
  return isBehindFacing(npc.rotationY, -dirX, -dirZ);
}

export class DetentionMode {
  // 越獄進度狀態
  public escapeStartTime: number = 0;
  public takedownCount: number = 0;
  public frontalKoCount: number = 0; // 以一般攻擊 (非暗殺) 擊倒的人數
  public readonly usedGymStations = new Set<string>(); // 本局已使用過的健身補給站 (每站限用一次)
  public alertCount: number = 0;
  public alertPhase: AlertPhase = 'NORMAL';
  public alertTimer: number = 0; // EVASION / CAUTION 階段剩餘秒數
  public hasKeycardA: boolean = false;
  public hasKeycardB: boolean = false;
  public hasMasterKeycard: boolean = false;
  public isBossDefeated: boolean = false;
  public isEscapeComplete: boolean = false;
  public spawnGraceTimer: number = 0;
  public nearbyCqcTarget: NPC | null = null;
  private searchlightAlertTimer: number = 0;
  private searchlightLocked: boolean = false;
  private alertHoldTimer: number = 0;
  private pendingSighting: boolean = false;
  private readonly surround = new SurroundCoordinator();

  private readonly radarData: DetentionRadarData = {
    isGateAOpen: false,
    isGateBOpen: false,
    isSouthGateOpen: false,
    hasKeycardA: false,
    hasKeycardB: false,
    hasMasterKeycard: false,
    keycardAPos: new THREE.Vector3(),
    keycardBPos: new THREE.Vector3(),
    masterKeycardPos: null,
    alertLevel: 'NORMAL',
    alertTimer: 0,
    checkpointPos: new THREE.Vector3(),
    checkpointName: 'A區收容車道起點'
  };

  constructor(private readonly ctx: GameContext) {}

  /** 選單暫停：越獄計時以實際時間計算，起點順延暫停的毫秒數 (暫停期間計時不前進) */
  public shiftClock(ms: number) {
    this.escapeStartTime += ms;
  }

  // 進入特訓院 (首次進入與「重新挑戰」共用) 時完整重置越獄進度：
  // 門禁、鑰匙卡、萬能卡、存檔點、全體守衛與總教官 (含永久擊昏者)，確保每次都是乾淨的新局
  public reset() {
    this.escapeStartTime = performance.now();
    this.takedownCount = 0;
    this.frontalKoCount = 0;
    this.usedGymStations.clear();
    this.alertCount = 0;
    this.hasKeycardA = false;
    this.hasKeycardB = false;
    this.hasMasterKeycard = false;
    this.isBossDefeated = false;
    this.isEscapeComplete = false;
    this.spawnGraceTimer = 5.0;
    this.nearbyCqcTarget = null;

    for (const n of this.ctx.detentionNPCs) {
      n.resetToInitialState();
    }
    this.resetAlertPhase();

    const dw = this.ctx.detentionWorld;
    dw.resetCheckpoint();
    dw.clearMasterKeycard();
    dw.hasPickedKeycardA = false;
    dw.hasPickedKeycardB = false;
    dw.keycardAMeshGroup.visible = true;
    dw.keycardBMeshGroup.visible = true;
    dw.isGateAOpen = false;
    dw.isGateBOpen = false;
    dw.isSouthGateOpen = false;
    dw.gateAMeshGroup.position.set(0, 0, 0);
    dw.gateBMeshGroup.position.set(0, 0, 0);
    dw.southGateMeshGroup.position.set(0, 0, 0);
    if (dw.gateACollider) {
      dw.gateACollider.min.y = 0;
      dw.gateACollider.max.y = 4.5;
    }
    if (dw.gateBCollider) {
      dw.gateBCollider.min.y = 0;
      dw.gateBCollider.max.y = 4.5;
    }
    if (dw.southGateCollider) {
      dw.southGateCollider.min.y = 0;
      dw.southGateCollider.max.y = 8.0;
    }
  }

  // 特訓院裝備：150 HP 與特訓防暴棒 (開場結束、重新挑戰、死亡重生共用)
  public applyLoadout() {
    const { player } = this.ctx;
    player.hasNormalBat = true;
    player.setWeapon('NORMAL_BAT');
    player.maxHp = 150;
    player.hp = 150;
  }

  // 正式開始潛入 (開場動畫結束或略過開場時)：配發裝備、出生保護並從此刻開始計時
  public startEscape() {
    this.applyLoadout();
    this.spawnGraceTimer = 5.0;
    this.escapeStartTime = performance.now();
  }

  // 總教官被擊敗 (暗殺或一般攻擊皆適用)：只觸發一次，掉落萬能逃脫鑰匙卡
  public onBossDefeated(boss: NPC): boolean {
    if (this.isBossDefeated) return false;
    this.isBossDefeated = true;
    this.ctx.detentionWorld.spawnMasterKeycard(boss.position);
    return true;
  }

  public setCheckpoint(pos: THREE.Vector3, name: string) {
    this.ctx.detentionWorld.setCheckpoint(pos, name);
    this.ctx.wantedSystem.showBanner(`🚩 存檔點已更新：【${name}】！死亡後將在此處重生。`, 3500);
    soundManager.playBroadcastChime(pos);
  }

  // 守衛全體回到初始崗位並清除警戒 (玩家倒地與復甦時)；已擊敗的總教官維持倒地，不因玩家死亡復活
  // 警戒次數 (評級依據) 不因死亡歸零，避免以死亡洗白評級
  public resetGuards() {
    for (const n of this.ctx.detentionNPCs) {
      if (this.isBossDefeated && n.role === 'DETENTION_BOSS') continue;
      n.resetToInitialState();
    }
    this.resetAlertPhase();
  }

  private resetAlertPhase() {
    this.alertPhase = 'NORMAL';
    this.alertTimer = 0;
    this.alertHoldTimer = 0;
    this.pendingSighting = false;
    this.searchlightAlertTimer = 0;
    this.searchlightLocked = false;
    for (const n of this.ctx.detentionNPCs) n.detentionHuntActive = false;
    this.ctx.hud.updateMgsAlert('NORMAL', 0);
  }

  // 攻擊守衛：打草驚蛇，該守衛立即追捕並視為一次目擊 (同一次警戒事件不重複計次)
  public onPlayerAttackedGuard(npc: NPC) {
    this.spawnGraceTimer = 0;
    npc.setAlertState('ALERT');
    npc.isChasing = true;
    npc.detentionHuntActive = true; // 本幀即生效，避免守衛在警戒階段推進前自行放棄
    npc.lastKnownPos.copy(this.ctx.player.position);
    this.pendingSighting = true;
  }

  // 正面打鬥聲響 (玩家一般攻擊命中、守衛攻擊命中)：半徑 20m 內未在追捕的守衛前往聲源察看 (不直接觸發警戒)
  public emitFightNoise(pos: THREE.Vector3) {
    const r2 = FIGHT_NOISE_RADIUS * FIGHT_NOISE_RADIUS;
    for (const n of this.ctx.detentionNPCs) {
      if (n.position.distanceToSquared(pos) <= r2) n.hearNoise(pos);
    }
  }

  // 每幀：草堆匿蹤、鑰匙卡/探照燈動畫、MGS 警戒倒數與背後暗殺目標鎖定
  public update(delta: number, targetPosition: THREE.Vector3, wardenBoss?: NPC) {
    const { player, hud, detentionWorld, wantedSystem } = this.ctx;

    // 總教官以一般攻擊 (非暗殺) 歸零倒下時同樣掉落萬能卡，避免南大門永遠無法開啟
    if (wardenBoss && !this.isBossDefeated && (wardenBoss.hp <= 0 || wardenBoss.isPermanentlyKnockedOut)) {
      if (this.onBossDefeated(wardenBoss)) {
        wantedSystem.showBanner('🏆 擊倒特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！', 5000);
        soundManager.playSchoolBell(wardenBoss.position);
      }
    }

    let inHidingSpot = false;
    let hidingSpotName = '';
    for (let i = 0; i < detentionWorld.hidingSpots.length; i++) {
      const spot = detentionWorld.hidingSpots[i];
      if (targetPosition.distanceTo(spot.position) < spot.radius) {
        inHidingSpot = true;
        hidingSpotName = spot.name;
        break;
      }
    }
    player.isHidingInCover = inHidingSpot;
    player.currentHidingSpotName = hidingSpotName;
    hud.updateStealthHiding(inHidingSpot, hidingSpotName);

    detentionWorld.updateKeycards(delta);
    const slState = detentionWorld.update(delta, targetPosition, inHidingSpot);
    if (slState.isDetectedBySearchlight) {
      this.searchlightAlertTimer += delta;
      if (this.searchlightAlertTimer >= 0.25) {
        // 探照燈鎖定視同目擊，交由全域警戒階段統一處理 (計次、音效、倒數)
        this.pendingSighting = true;
        if (!this.searchlightLocked) {
          this.searchlightLocked = true;
          soundManager.playWhistle(player.position);
          if (wantedSystem.stars < 2) {
            wantedSystem.reportCrime(2, '探照燈高空鎖定！發布緊急圍剿警報！');
          }
          wantedSystem.showBanner('🚨 探照燈高空鎖定！已發布全場警報，守衛部隊全面包夾追捕！', 2500);
        }

        // 核心機制：被探照燈照到時，半徑 65m 內所有少年院 NPC 全力往玩家位置衝刺聚集追捕
        for (const n of this.ctx.detentionNPCs) {
          if (!n.isKnockedDown && !n.isPermanentlyKnockedOut) {
            const d = n.position.distanceTo(targetPosition);
            if (d < 65.0) {
              if (n.isPaused) n.cancelPause();
              n.setAlertState('ALERT');
              n.isChasing = true;
              n.detentionHuntActive = true;
              n.isBurstSprinting = true;
              n.lostSightTimer = 0;
              n.lastKnownPos.copy(targetPosition);
            }
          }
        }
      }
    } else {
      this.searchlightAlertTimer = Math.max(0, this.searchlightAlertTimer - delta * 2.0);
      if (this.searchlightAlertTimer <= 0) this.searchlightLocked = false;
    }

    this.updateCqcTarget(targetPosition);
  }

  // 每幀 (NPC AI 更新之後)：彙整守衛實際目擊、探照燈與攻擊事件，推進唯一的全域警戒階段，
  // 並讓守衛行為 (搜索 / 收隊) 與 HUD 警戒橫幅、雷達同步
  public updateAlertPhase(delta: number, playerPos: THREE.Vector3) {
    const { wantedSystem, hud } = this.ctx;
    const npcs = this.ctx.detentionNPCs;

    let sighted = this.pendingSighting;
    this.pendingSighting = false;
    for (let i = 0; i < npcs.length && !sighted; i++) {
      const n = npcs[i];
      if (n.seesPlayerNow && !n.isKnockedDown && !n.isPermanentlyKnockedOut) sighted = true;
    }

    if (sighted) {
      if (this.alertPhase !== 'ALERT') {
        // 每次從平時或戒備狀態被發現才算一次警戒 (搜索中再被看見屬同一事件)
        if (this.alertPhase === 'NORMAL' || this.alertPhase === 'CAUTION') {
          this.alertCount++;
          soundManager.playAlert();
        }
        this.alertPhase = 'ALERT';
      }
      this.alertHoldTimer = ALERT_HOLD_TIME;
      this.alertTimer = 0;
      // 無線電通報：所有追捕中的守衛同步玩家目前位置
      for (let i = 0; i < npcs.length; i++) npcs[i].receiveSightingReport(playerPos);
    } else if (this.alertPhase === 'ALERT') {
      this.alertHoldTimer -= delta;
      if (this.alertHoldTimer <= 0) {
        this.alertPhase = 'EVASION';
        this.alertTimer = EVASION_TIME;
        wantedSystem.showBanner('⚠️ 守衛失去目標，正在搜索最後目擊位置！保持隱蔽直到倒數結束！', 2500);
      }
    } else if (this.alertPhase === 'EVASION') {
      this.alertTimer -= delta;
      if (this.alertTimer <= 0) {
        this.alertPhase = 'CAUTION';
        this.alertTimer = CAUTION_TIME;
        for (let i = 0; i < npcs.length; i++) {
          const n = npcs[i];
          if (n.isKnockedDown || n.isPermanentlyKnockedOut) continue;
          if (n.isChasing) n.resetAggro();
          n.setAlertState('CAUTION');
          n.cautionTimer = CAUTION_TIME;
        }
        wantedSystem.showBanner('❓ 搜索結束，守衛提高戒備返回巡邏。', 2500);
      }
    } else if (this.alertPhase === 'CAUTION') {
      this.alertTimer -= delta;
      if (this.alertTimer <= 0) {
        this.alertPhase = 'NORMAL';
        this.alertTimer = 0;
        for (let i = 0; i < npcs.length; i++) {
          const n = npcs[i];
          if (!n.isChasing && n.alertState !== 'NORMAL') n.setAlertState('NORMAL');
        }
        wantedSystem.showBanner('🌿 警戒解除，守衛恢復常態巡邏。', 2500);
      }
    }

    const hunt = this.alertPhase === 'ALERT' || this.alertPhase === 'EVASION';
    for (let i = 0; i < npcs.length; i++) npcs[i].detentionHuntActive = hunt;
    hud.updateMgsAlert(this.alertPhase, this.alertTimer);
  }

  // 多人包夾 (見 SurroundCoordinator)
  public updateSurround(delta: number, playerPos: THREE.Vector3) {
    this.surround.update(delta, this.ctx.detentionNPCs, playerPos);
  }

  // 背後暗殺擊昏判定 與 刺客教條草堆暗殺判定
  private updateCqcTarget(targetPosition: THREE.Vector3) {
    const { player, hud } = this.ctx;
    this.nearbyCqcTarget = null;
    // 暗殺時機計量表與運鏡期間不顯示暗殺提示
    if (!player.isDead && !this.ctx.combat.isExecutionActive) {
      for (const npc of this.ctx.detentionNPCs) {
        if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;

        // 1. 若被 NPC 發現 (! 警戒狀態)，完全無法發動暗殺！
        //    特殊破綻特例：總教官撞柱陷入重度眩暈硬直中 (isBossStunned) 且非無敵狀態除外
        if (npc.alertState === 'ALERT') {
          if (!isBossStunOpening(npc)) {
            continue;
          }
        }

        // 2. 總教官被暗殺後 3 秒金鐘護盾無敵期：無法被鎖定或暗殺 (防止連點擊殺)
        if (npc.role === 'DETENTION_BOSS' && (npc.isBossInvulnerable || npc.bossInvulnerableTimer > 0)) {
          continue;
        }

        const dist = npc.position.distanceTo(targetPosition);

        if (player.isHidingInCover) {
          // 刺客教條草堆暗殺：未發現玩家時，只要守衛經過草堆 3.0m 內，任意角度均可直接伏擊拖入刺殺！
          if (dist <= 3.0) {
            this.nearbyCqcTarget = npc;
            break;
          }
        } else if (dist <= 2.3) {
          // 正常潛行背刺：每個未發現玩家的 NPC (或總教官撞柱眩暈時) 均可在背後盲區觸發暗殺擊昏
          if (isBehindNpc(npc, targetPosition.x, targetPosition.z) || (npc.role === 'DETENTION_BOSS' && npc.isBossStunned)) {
            this.nearbyCqcTarget = npc;
            break;
          }
        }
      }
    }

    const target = this.nearbyCqcTarget;
    if (target && !target.isKnockedDown && !target.isPermanentlyKnockedOut) {
      // 暗殺/擊昏提示：出現在 NPC 頭頂上方 (只需顯示「擊暈」)
      const overheadOffset = (target.role === 'DOG' || target.role === 'DETENTION_WOLF') ? 1.30 : 2.45;
      _scratchCqcScreenPos.copy(target.position);
      _scratchCqcScreenPos.y += overheadOffset;
      _scratchCqcScreenPos.project(this.ctx.cameraCtrl.camera);

      if (_scratchCqcScreenPos.z < 1.0) {
        const screenX = (_scratchCqcScreenPos.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-_scratchCqcScreenPos.y * 0.5 + 0.5) * window.innerHeight;
        hud.updateCqcPrompt(true, screenX, screenY);
      } else {
        hud.updateCqcPrompt(false);
      }
    } else {
      hud.updateCqcPrompt(false);
    }
  }

  // 出生 5 秒保護計時，回傳本幀是否仍處於保護期
  public updateSpawnGrace(delta: number): boolean {
    if (this.spawnGraceTimer <= 0) return false;
    this.spawnGraceTimer -= delta;
    if (this.spawnGraceTimer <= 0) {
      this.spawnGraceTimer = 0;
      this.ctx.wantedSystem.showBanner('⚡ 5 秒隱蔽保護結束！特訓院守衛已恢復正常巡邏警戒！', 3000);
    }
    return true;
  }

  // 衝出南大門判定通關，顯示越獄結算
  public checkEscapeVictory(targetPosition: THREE.Vector3) {
    if (!this.ctx.detentionWorld.isSouthGateOpen || targetPosition.z < 95.0 || this.isEscapeComplete) return;
    this.isEscapeComplete = true;
    const totalTime = (performance.now() - this.escapeStartTime) / 1000;
    this.ctx.hud.showDetentionVictory(
      totalTime,
      this.takedownCount,
      this.frontalKoCount,
      this.alertCount,
      () => {
        this.ctx.switchWorld('DETENTION', true);
      },
      () => {
        // 通關後回主畫面：重新載入頁面完整重置所有世界狀態，避免第二世界進度混入天天國中
        window.location.reload();
      }
    );
  }

  public updateEscapeTracker(wardenBoss: NPC | undefined) {
    const dw = this.ctx.detentionWorld;
    this.ctx.hud.updateWorld2EscapeTracker(
      this.takedownCount,
      dw.isGateAOpen,
      dw.isGateBOpen,
      wardenBoss ? wardenBoss.hp : 0,
      wardenBoss ? wardenBoss.maxHp : 500,
      this.isBossDefeated,
      this.isEscapeComplete
    );
  }

  // 雷達小地圖資料 (重用同一物件，不於每幀配置)
  public getRadarData(): DetentionRadarData {
    let radarAlert: 'NORMAL' | 'CAUTION' | 'ALERT' = 'NORMAL';
    if (this.alertPhase === 'ALERT' || this.alertPhase === 'EVASION') {
      radarAlert = 'ALERT';
    } else if (this.alertPhase === 'CAUTION') {
      radarAlert = 'CAUTION';
    } else {
      for (const n of this.ctx.detentionNPCs) {
        if (n.alertState === 'CAUTION') {
          radarAlert = 'CAUTION';
          break;
        }
      }
    }

    const dw = this.ctx.detentionWorld;
    const radar = this.radarData;
    radar.isGateAOpen = dw.isGateAOpen;
    radar.isGateBOpen = dw.isGateBOpen;
    radar.isSouthGateOpen = dw.isSouthGateOpen;
    radar.hasKeycardA = this.hasKeycardA;
    radar.hasKeycardB = this.hasKeycardB;
    radar.hasMasterKeycard = this.hasMasterKeycard;
    radar.keycardAPos = dw.keycardAPos;
    radar.keycardBPos = dw.keycardBPos;
    radar.masterKeycardPos = dw.masterKeycardPos;
    radar.alertLevel = radarAlert;
    radar.alertTimer = this.alertPhase === 'EVASION' ? this.alertTimer : 0;
    radar.checkpointPos = dw.currentCheckpointPos;
    radar.checkpointName = dw.currentCheckpointName;
    return radar;
  }
}
