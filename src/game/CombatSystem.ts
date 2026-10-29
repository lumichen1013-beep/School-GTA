import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import { queryColliders, isBlockedXZ } from '../physics/aabb';
import { requestCameraShake } from '../effects/cameraShake';
import type { CollidableBox } from '../world/CampusWorld';
import type { NPC } from '../entities/NPC';
import type { KfMove } from '../entities/shared/kungfu';
import type { GameContext } from './GameContext';
import { isBehindNpc, isBossStunOpening } from './DetentionMode';

const _scratchPlayerForward = new THREE.Vector3();
const _scratchImpactDir = new THREE.Vector3();
const _scratchBikeForward = new THREE.Vector3();
const _scratchBikeSideVec = new THREE.Vector3();
const _scratchBikeLaunchDir = new THREE.Vector3();
const _separationNear: CollidableBox[] = [];
const _scratchExecLook = new THREE.Vector3();
const _scratchExecEuler = new THREE.Euler();

// 總教官暗殺運鏡：背刺 → 倒地 → 後空翻 → 落地收尾，各階段以真實秒數計時並套用固定模擬倍率
type ExecPhase = 'NONE' | 'STAB' | 'FALL' | 'FLIP' | 'LAND';
type ActiveExecPhase = Exclude<ExecPhase, 'NONE'>;
const EXEC_NEXT: Record<ActiveExecPhase, ExecPhase> = { STAB: 'FALL', FALL: 'FLIP', FLIP: 'LAND', LAND: 'NONE' };
const EXEC_TIME_SCALE: Record<ActiveExecPhase, number> = { STAB: 0.25, FALL: 0.35, FLIP: 0.6, LAND: 1.0 };
const EXEC_DURATION_NORMAL: Record<ActiveExecPhase, number> = { STAB: 0.8, FALL: 0.8, FLIP: 1.0, LAND: 0.5 };
const EXEC_DURATION_FINAL: Record<ActiveExecPhase, number> = { STAB: 1.0, FALL: 1.4, FLIP: 1.0, LAND: 0.5 };
const EXEC_IMPACT_AT = 0.3; // 背刺命中時間點 (真實秒，終結一擊 +0.1)
const EXEC_HIT_STOP = 0.06; // 命中瞬間停格 (真實秒)
const EXEC_HIT_STOP_SCALE = 0.02;
const EXEC_SHOT_DISTANCE = 5.5; // 側面機位距離 (終結一擊 6.5)
const EXEC_SHOT_DOLLY = 0.5; // 倒地階段緩慢後拉
const EXEC_FINAL_ORBIT = THREE.MathUtils.degToRad(20); // 終結一擊整段緩慢環繞
const EXEC_FOCUS_TO_BOSS = 0.35; // 倒地階段視線往總教官偏移比例
const EXEC_STAGGER_DIST = 0.45; // 總教官向前踉蹌距離
const EXEC_LEAP_DIST = 4.0;
const EXEC_LEAP_SIM_TIME = 0.55; // 後空翻模擬秒數 (×0.6 ≈ 0.92 真實秒，於 1.0 秒階段內落地)
const BOSS_DOWN_TIME = 2.0;
const FRONTAL_LOCK = 0.34; // 正面攻擊守衛的出招間隔：命中點起算 0.34 秒 (加上預備動作約等於按鍵起 0.5 秒)
const HIT_STOP = 0.04; // 一般命中停格 (真實秒)
const HIT_STOP_FINISHER = 0.08; // 連段終結技命中停格
const HIT_STOP_SCALE = 0.05;
const NPC_STRIKE_REACH_GRACE = 0.35; // NPC 出招命中時的距離寬容 (預備動作期間玩家退出此範圍即落空)
const NPC_STRIKE_ARC = 0.25; // NPC 出招命中方向門檻 (面向與玩家方向內積下限，約正面 ±75°) // 總教官倒地秒數 (自玩家恢復操控起算)
const EXEC_LEAP_PEAK = 1.1; // 後空翻頂點高度 (m)
const EXEC_RESULT_SHOW_MS = 1800; // 恢復操控後 QTE 打擊橫幅顯示毫秒 (之後才播出運鏡期間暫存的頂部橫幅)

/**
 * 戰鬥系統：玩家攻擊判定、背後暗殺與慢動作特寫、NPC 擊倒結算、單車衝撞、NPC 攻擊玩家與角色推擠
 */
export class CombatSystem {
  // 總教官暗殺運鏡狀態機
  private execPhase: ExecPhase = 'NONE';
  private execPhaseTime: number = 0; // 本階段已經過真實秒數
  private execElapsed: number = 0; // 整段已經過真實秒數
  private execDurations: Record<ActiveExecPhase, number> = EXEC_DURATION_NORMAL;
  private execTarget: NPC | null = null;
  private execIsFinal: boolean = false;
  private execFromHiding: boolean = false;
  private execImpactDone: boolean = false;
  private execHitStop: number = 0;
  private execStaggered: number = 0;
  private execBossLanded: boolean = false;
  private execFallRatio: number = 0; // 總教官倒地程度 (0 站立 ~ 1 俯臥)
  private readonly execStrikeDir = new THREE.Vector3();
  private damageText: THREE.Sprite | null = null;
  private wasBossWindingUp: boolean = false;
  private wasBossStunned: boolean = false;
  private hitStop: number = 0; // 一般攻擊命中停格剩餘真實秒數

  constructor(private readonly ctx: GameContext) {}

  // 切換世界時中止暗殺運鏡，避免在另一個世界延續
  public resetTransientState() {
    if (this.execPhase !== 'NONE') this.finishExecution(true);
    this.hitStop = 0;
    this.ctx.player.cancelAttack();
  }

  // 暗殺運鏡進行中：鎖定玩家操控，NPC 不攻擊玩家
  public get isExecutionActive(): boolean {
    return this.execPhase !== 'NONE';
  }

  // 推進暗殺運鏡階段 (真實時間) 並回傳套用時間倍率後的模擬時間步長
  public scaleDelta(rawDelta: number): number {
    if (this.execPhase === 'NONE') {
      if (this.hitStop > 0) {
        this.hitStop -= rawDelta;
        return rawDelta * HIT_STOP_SCALE;
      }
      return rawDelta;
    }
    this.execPhaseTime += rawDelta;
    this.execElapsed += rawDelta;
    let phase: ExecPhase = this.execPhase;
    while (phase !== 'NONE' && this.execPhaseTime >= this.execDurations[phase]) {
      this.execPhaseTime -= this.execDurations[phase];
      phase = EXEC_NEXT[phase];
      this.enterExecPhase(phase);
    }
    if (phase === 'NONE') return rawDelta;

    const impactAt = EXEC_IMPACT_AT + (this.execIsFinal ? 0.1 : 0);
    if (phase === 'STAB' && !this.execImpactDone && this.execPhaseTime >= impactAt) {
      this.applyExecutionImpact();
    }
    if (this.execHitStop > 0) {
      this.execHitStop -= rawDelta;
      return rawDelta * EXEC_HIT_STOP_SCALE;
    }
    return rawDelta * EXEC_TIME_SCALE[phase];
  }

  // 每幀於 NPC 更新之後、鏡頭更新之前呼叫：覆寫總教官倒地動作、傷害數字與運鏡機位
  public updateExecution(rawDelta: number) {
    const target = this.execTarget;
    if (this.execPhase === 'NONE' || !target) return;
    const { player, cameraCtrl } = this.ctx;

    if (this.execImpactDone) {
      this.updateExecutionBossPose(target);
      // 倒地倒數凍結至玩家恢復操控為止 (起身與 3 秒護盾皆自恢復操控後起算)
      if (!target.isPermanentlyKnockedOut) target.reviveTimer = BOSS_DOWN_TIME;
    }
    // 運鏡期間隱藏頭頂倒地告示牌，避免與 -100 傷害數字搶畫面 (恢復操控後重新顯示並開始倒數)
    target.setKOBadgeVisible(false);
    this.updateDamageText(target);

    if (this.execPhase === 'LAND') {
      const t = Math.min(1, this.execPhaseTime / this.execDurations.LAND);
      cameraCtrl.blendExecutionToBehind(player.position, player.rotationY + Math.PI, t, rawDelta);
      return;
    }

    // 視線：倒地階段逐漸偏向總教官，其餘階段看玩家與總教官目前位置的中點
    // (總教官倒下後以身體中心計算，俯臥身軀沿打擊方向延伸約 0.9m)
    const look = _scratchExecLook.copy(target.position).addScaledVector(this.execStrikeDir, 0.9 * this.execFallRatio);
    look.add(player.position).multiplyScalar(0.5);
    let dolly = 0;
    if (this.execPhase === 'FALL') {
      const u = this.execPhaseTime / this.execDurations.FALL;
      const k = u * u * (3 - 2 * u);
      dolly = EXEC_SHOT_DOLLY * k;
      look.lerp(target.position, EXEC_FOCUS_TO_BOSS * k);
      look.addScaledVector(this.execStrikeDir, 0.9 * this.execFallRatio * EXEC_FOCUS_TO_BOSS * k);
    } else if (this.execPhase === 'FLIP') {
      dolly = EXEC_SHOT_DOLLY;
    }
    let orbit = 0;
    if (this.execIsFinal) {
      const d = this.execDurations;
      const u = Math.min(1, this.execElapsed / (d.STAB + d.FALL + d.FLIP));
      orbit = EXEC_FINAL_ORBIT * u * u * (3 - 2 * u);
    }
    cameraCtrl.updateExecutionShot(dolly, orbit, look, rawDelta);
  }

  private startExecution(target: NPC, isFinal: boolean, isFromHiding: boolean) {
    const { player, cameraCtrl, hud, wantedSystem } = this.ctx;
    this.execTarget = target;
    this.execIsFinal = isFinal;
    this.execFromHiding = isFromHiding;
    this.execDurations = isFinal ? EXEC_DURATION_FINAL : EXEC_DURATION_NORMAL;
    this.execImpactDone = false;
    this.execHitStop = 0;
    this.execStaggered = 0;
    this.execBossLanded = false;
    this.execFallRatio = 0;
    this.execElapsed = 0;

    this.execStrikeDir.subVectors(target.position, player.position).setY(0);
    if (this.execStrikeDir.lengthSq() < 0.01) this.execStrikeDir.set(0, 0, 1);
    else this.execStrikeDir.normalize();

    // 面向總教官出刀，鎖定操控並免疫傷害
    player.rotationY = Math.atan2(this.execStrikeDir.x, this.execStrikeDir.z);
    player.mesh.rotation.y = player.rotationY;
    player.isCinematicLocked = true;
    player.performCinematicStrike((EXEC_IMPACT_AT + (isFinal ? 0.1 : 0)) * EXEC_TIME_SCALE.STAB);

    const orbit = isFinal ? EXEC_FINAL_ORBIT : 0;
    cameraCtrl.beginExecutionShot(player.position, target.position, isFinal ? EXEC_SHOT_DISTANCE + 1.0 : EXEC_SHOT_DISTANCE, EXEC_SHOT_DOLLY, orbit, this.ctx.activeColliders);
    // 電影黑邊持續至落地收尾結束；運鏡期間頂部橫幅暫存，QTE 打擊橫幅於恢復操控後才顯示
    wantedSystem.holdBanners();
    const qteTitle = isFinal
      ? (isFromHiding ? '🗡️【刺客教條·草堆終結】' : '🗡️【刺客教條·終極處決】')
      : (isFromHiding ? '🗡️【刺客教條·掩體突襲】' : '⚡【硬直破綻暴擊】');
    const qteSub = isFinal
      ? '徹底擊潰特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！'
      : isFromHiding
        ? `掩體突襲重擊要害！造成 100 傷害！(剩餘 HP: ${Math.max(0, target.hp - 100)}/${target.maxHp}，總教官倒地 2 秒！)`
        : `趁撞柱硬直重擊要害！造成 100 傷害！(剩餘 HP: ${Math.max(0, target.hp - 100)}/${target.maxHp}，總教官倒地 2 秒！)`;
    hud.beginCinematicExecution(qteTitle, qteSub);

    this.execPhase = 'STAB';
    this.execPhaseTime = 0;
  }

  private enterExecPhase(next: ExecPhase) {
    const { player, cameraCtrl } = this.ctx;
    const target = this.execTarget;
    // 保險：任何情況下都確保命中結算已發生
    if (!this.execImpactDone) this.applyExecutionImpact();
    this.execPhase = next;
    if (!target) return;

    if (next === 'FALL') {
      this.showDamageText(target);
    } else if (next === 'FLIP') {
      player.leapAwayFrom(target.position, EXEC_LEAP_DIST, EXEC_LEAP_SIM_TIME, EXEC_LEAP_PEAK);
    } else if (next === 'LAND') {
      // 落地面向總教官，鏡頭自運鏡機位平滑過渡至玩家正後方
      const dx = target.position.x - player.position.x;
      const dz = target.position.z - player.position.z;
      if (dx * dx + dz * dz > 0.0001) {
        player.rotationY = Math.atan2(dx, dz);
        player.mesh.rotation.y = player.rotationY;
      }
      if (this.damageText) this.damageText.visible = false;
      cameraCtrl.markExecutionBlendStart();
    } else if (next === 'NONE') {
      this.finishExecution();
    }
  }

  // 背刺命中：停格、震動與音效，結算 100 傷害並讓總教官進入倒地 (倒地動作由運鏡覆寫)
  private applyExecutionImpact() {
    const target = this.execTarget;
    this.execImpactDone = true;
    if (!target) return;
    const { wantedSystem, detention } = this.ctx;
    const isFromHiding = this.execFromHiding;
    this.execHitStop = EXEC_HIT_STOP;
    soundManager.playCinematicExecutionHit();
    requestCameraShake(0.55);

    // 每次精確造成 100 傷害，500 HP 需暗殺 5 次才能擊破
    target.isBossStunned = false;
    target.bossStunTimer = 0;
    target.isDownFaceDown = true;
    target.applyAssassinationDamage(100);

    if (target.hp <= 0) {
      target.knockoutSilently();
      detention.onBossDefeated(target);
      detention.takedownCount++;
      wantedSystem.showBanner(
        isFromHiding
          ? `🗡️【刺客教條·掩體致命突襲】一擊終結特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！`
          : '🏆 狂賀！終極暗殺擊破特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！',
        5000
      );
      soundManager.playSchoolBell();
    } else {
      // 傷害與倒地資訊由恢復操控後的 QTE 打擊橫幅呈現，不另發頂部橫幅
      target.knockdownBoss(BOSS_DOWN_TIME);
    }
  }

  // 總教官受擊後動作：命中微前傾 → 倒地階段向前踉蹌 (遇牆停止) → 向前撲倒為俯臥倒地姿勢
  private updateExecutionBossPose(target: NPC) {
    let tilt: number;
    if (this.execPhase === 'STAB') {
      tilt = 0.12;
    } else if (this.execPhase === 'FALL') {
      const s = Math.min(1, this.execPhaseTime / (this.execDurations.FALL * 0.75));
      if (s < 0.35) {
        const k = s / 0.35;
        tilt = 0.12 + 0.23 * Math.sin(k * Math.PI * 0.5);
        this.staggerBoss(target, EXEC_STAGGER_DIST * Math.sin(k * Math.PI * 0.5));
      } else {
        const k = (s - 0.35) / 0.65;
        tilt = 0.35 + (Math.PI / 2 - 0.35) * k * k;
        this.staggerBoss(target, EXEC_STAGGER_DIST);
      }
      if (s >= 1 && !this.execBossLanded) {
        this.execBossLanded = true;
        requestCameraShake(0.35);
        soundManager.playPunch();
      }
    } else {
      tilt = Math.PI / 2;
    }
    this.execFallRatio = tilt / (Math.PI / 2);
    target.mesh.quaternion.setFromEuler(_scratchExecEuler.set(tilt, target.rotationY, 0, 'YXZ'));
    target.mesh.position.set(target.position.x, target.baseFloorY + 0.25 * (tilt / (Math.PI / 2)), target.position.z);
  }

  // 沿打擊方向推移總教官至指定累計距離 (遇牆即停)
  private staggerBoss(target: NPC, dist: number) {
    const step = dist - this.execStaggered;
    if (step <= 0) return;
    this.execStaggered = dist;
    const nx = target.position.x + this.execStrikeDir.x * step;
    const nz = target.position.z + this.execStrikeDir.z * step;
    if (!isBlockedXZ(this.ctx.activeColliders, nx, nz, 0.45, target.position.y, 0.3, 1.6)) {
      target.position.x = nx;
      target.position.z = nz;
    }
  }

  // 結束暗殺運鏡：恢復操控與一般鏡頭 (總教官倒地倒數自此起算)；
  // 正常結束時短暫顯示 QTE 打擊橫幅後再播出暫存的頂部橫幅，中止 (切換世界) 時直接恢復
  private finishExecution(aborted: boolean = false) {
    const { player, cameraCtrl, hud, wantedSystem } = this.ctx;
    const target = this.execTarget;
    this.execPhase = 'NONE';
    this.execPhaseTime = 0;
    this.execHitStop = 0;
    this.execTarget = null;
    player.isCinematicLocked = false;
    if (this.damageText) this.damageText.visible = false;
    if (target && !aborted) target.setKOBadgeVisible(true);
    cameraCtrl.endExecutionShot(player.position, player.rotationY + Math.PI);
    hud.endCinematicExecution(aborted ? 0 : EXEC_RESULT_SHOW_MS, () => wantedSystem.releaseBannerHold());
  }

  // 總教官頭頂浮起的傷害數字 (首次使用時建立，之後重複使用)
  private showDamageText(target: NPC) {
    if (!this.damageText) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const g = canvas.getContext('2d')!;
      g.font = '900 96px "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = '#1f0a0a';
      g.strokeText('-100', 128, 64);
      g.fillStyle = '#ff3b30';
      g.fillText('-100', 128, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      this.damageText = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      this.damageText.scale.set(1.6, 0.8, 1);
      this.damageText.renderOrder = 999;
    }
    if (this.damageText.parent !== this.ctx.engine.scene) this.ctx.engine.scene.add(this.damageText);
    this.damageText.visible = true;
    this.updateDamageText(target);
  }

  // 傷害數字於倒地與後空翻階段緩慢上浮，後段淡出
  private updateDamageText(target: NPC) {
    const sprite = this.damageText;
    if (!sprite || !sprite.visible) return;
    const d = this.execDurations;
    const shown = this.execPhase === 'FALL' ? this.execPhaseTime : d.FALL + this.execPhaseTime;
    const u = Math.min(1, shown / (d.FALL + d.FLIP));
    sprite.position.set(target.position.x, target.baseFloorY + 1.9 + u * 0.5, target.position.z);
    (sprite.material as THREE.SpriteMaterial).opacity = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
  }

  // 滑鼠左鍵 / 手機攻擊鍵：投籃蓄力 / 單車鳴鈴 / 背後暗殺 / 揮動武器攻擊
  public readonly onAttack = () => {
    const { player, basketballGame, hud } = this.ctx;
    if (player.isDead || player.hp <= 0) return;

    if (this.ctx.currentWorldType === 'CAMPUS' && basketballGame.isHolding) {
      basketballGame.startCharging(hud);
      return;
    }

    if (this.ctx.currentRidingBike) {
      this.ctx.currentRidingBike.ringBell();
      return;
    }
    // 暗殺運鏡期間鎖定攻擊；出招中提早按下則預先輸入下一段連招
    if (this.execPhase !== 'NONE') return;
    if (!player.canAttack) {
      player.attack();
      return;
    }

    // 第二世界：若處於守衛身後觸發暗殺擊昏
    const cqcTarget = this.ctx.detention.nearbyCqcTarget;
    if (this.ctx.currentWorldType === 'DETENTION' && cqcTarget && !cqcTarget.isKnockedDown) {
      this.performCqcTakedown();
      return;
    }

    // 傷害於招式命中時間點 (預備動作之後) 才結算，見 updatePlayerStrike
    player.attack();
  };

  // 每幀於玩家更新後呼叫：招式到達命中時間點時結算傷害 (暗殺運鏡中的出刀僅為動作)
  public updatePlayerStrike() {
    const move = this.ctx.player.strikeMove;
    if (!move || this.execPhase !== 'NONE' || this.ctx.player.isDead) return;
    this.resolvePlayerHit(move);
  }

  // 命中回饋：短暫停格，終結技加長並震動鏡頭
  private onPlayerHitLanded(move: KfMove) {
    this.hitStop = move.finisher ? HIT_STOP_FINISHER : HIT_STOP;
    if (move.finisher) requestCameraShake(0.3);
  }

  private resolvePlayerHit(move: KfMove) {
    const { player, wantedSystem, ecologicalGarden } = this.ctx;
    const reach = player.getWeaponReach() * move.reach;
    const damage = Math.round(player.getWeaponDamage() * move.dmg);
    const knockback = player.getWeaponKnockback() * move.knock;

    _scratchPlayerForward.set(Math.sin(player.rotationY), 0, Math.cos(player.rotationY)).normalize();

    // 1. 檢測是否命中生態園植物生物
    const plantHit = ecologicalGarden.tryHitByPlayer(player.position, reach, damage, _scratchPlayerForward);
    if (plantHit.hit) {
      this.onPlayerHitLanded(move);
      if (plantHit.isBoss) {
        if (plantHit.defeated) {
          this.ctx.progression.cash += 500;
          wantedSystem.showBanner('👑 狂賀！斬殺秘境霸主【變異食人花王】！獲得通關巨額獎金 +$500！', 6000);
          player.hp = Math.min(player.maxHp, player.hp + 50);
        } else {
          wantedSystem.showBanner(`💥 命中【變異食人花王】！造成 ${damage} 傷害！(Boss HP: ${Math.ceil(ecologicalGarden.boss.hp)})`, 1500);
        }
      } else if (plantHit.defeated) {
        this.ctx.progression.cash += 40;
        wantedSystem.showBanner(`🌿 斬除【${plantHit.name}】！獲得冒險獎勵 +$40！`, 2500);
      } else {
        wantedSystem.showBanner(`🌿 擊中【${plantHit.name}】！造成 ${damage} 傷害！`, 1500);
      }
      return;
    }

    // 2. 檢測是否命中附近的 NPC (只結算第一個命中者；依招式攻擊範圍判定方向，旋身招式為全方位)
    for (const npc of this.ctx.npcs) {
      if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;
      const dx = npc.position.x - player.position.x;
      const dz = npc.position.z - player.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (npc.position.distanceTo(player.position) >= reach + 0.3) continue;
      if (move.arc > -1 && dist > 0.6 && (dx * _scratchPlayerForward.x + dz * _scratchPlayerForward.z) / dist < move.arc) continue;
      let actualKnockback = knockback;

      // 校園打人：附近同學依個性圍觀 / 起鬨 / 逃跑 / 叫老師 (打強盜可解救被勒索的同學)
      if (this.ctx.currentWorldType === 'CAMPUS') this.ctx.campusLife.onFight(npc);

      if (this.ctx.currentWorldType === 'DETENTION') {
        this.ctx.detention.onPlayerAttackedGuard(npc);

        if (npc.role === 'DETENTION_BOSS') {
          if (npc.isBossInvulnerable || npc.bossInvulnerableTimer > 0) {
            wantedSystem.showBanner(`🛡️ 總教官處於受創金鐘護盾無敵中 (${npc.bossInvulnerableTimer.toFixed(1)}s)！免疫傷害！`, 1500);
            soundManager.playPunch();
            player.setAttackCooldown(FRONTAL_LOCK);
            return;
          }
        }

        // 正面攻擊 (非背後盲區)：技能間隔 0.5 秒且擊退效果減半
        if (!isBehindNpc(npc, player.position.x, player.position.z)) {
          actualKnockback = knockback * 0.5;
          player.setAttackCooldown(FRONTAL_LOCK);
          wantedSystem.showBanner('🛡️ 正面衝擊守備防禦！技能間隔 0.5s，擊退力減半！', 1600);
        }
      }

      this.onPlayerHitLanded(move);
      // 擊退方向：玩家指向目標 (旋身招式可擊中側後方目標)
      if (dist > 0.3) _scratchImpactDir.set(dx / dist, 0, dz / dist);
      else _scratchImpactDir.copy(_scratchPlayerForward);
      if (npc.launchFlying(_scratchImpactDir, actualKnockback, damage)) {
        this.handleNpcDefeated(npc, 'ATTACK');
      } else {
        wantedSystem.reportCrime(1, this.ctx.currentWorldType === 'DETENTION' ? '院內襲擊守衛' : '校園打架鬥毆');
        npc.isChasing = true;
      }
      return;
    }
  }

  // 潛行背後暗殺擊昏 / 刺客教條草堆伏擊
  private performCqcTakedown() {
    const { player, wantedSystem, hud, detention } = this.ctx;
    const target = detention.nearbyCqcTarget;
    if (!target || target.isKnockedDown || player.isDead) return;
    const isFromHiding = player.isHidingInCover;
    const coverName = player.currentHidingSpotName || '草堆';

    // 嚴格暗殺判定：若已被敵人發現 (! 警戒狀態)，完全無法發動暗殺！
    if (target.alertState === 'ALERT') {
      if (!isBossStunOpening(target)) {
        wantedSystem.showBanner('⚠️ 敵人已發現你 (! 狀態)！無法發動暗殺！需脫離視線或誘敵硬直！', 2000);
        return;
      }
    }

    if (target.role === 'DETENTION_BOSS') {
      if (target.isBossInvulnerable || target.bossInvulnerableTimer > 0) {
        wantedSystem.showBanner(`🛡️ 總教官處於金鐘護盾無敵中 (${target.bossInvulnerableTimer.toFixed(1)}s)！免疫暗殺與傷害！`, 1800);
        return;
      }

      // 命中前維持硬直，避免慢動作期間總教官恢復行動
      target.bossStunTimer = Math.max(target.bossStunTimer, 1.0);
      this.startExecution(target, target.hp - 100 <= 0, isFromHiding);
    } else {
      target.knockoutSilently();
      detention.takedownCount++;
      soundManager.playPunch();
      if (isFromHiding) {
        wantedSystem.showBanner(`🗡️【刺客教條·掩體暗殺】將 ${target.getRoleTitle()} 拖入${coverName}無聲刺殺！無人察覺！`, 2500);
      } else {
        wantedSystem.showBanner(`🥷 潛行擊昏！(無聲排除 ${target.getRoleTitle()}，永久昏迷)`, 2000);
      }
    }

    detention.nearbyCqcTarget = null;
    hud.updateCqcPrompt(false);
  }

  // 統一 NPC 擊倒/擊敗結算 (獎金、成就解鎖、通緝與提示)
  public handleNpcDefeated(npc: NPC, source: 'ATTACK' | 'BIKE' | 'FALL' = 'ATTACK') {
    const { progression, wantedSystem, tennisGame } = this.ctx;
    const { reward, banner } = progression.recordDefeat(npc.role);
    if (banner) {
      wantedSystem.showBanner(banner.text, banner.duration);
    }
    if (npc.role === 'PE_TEACHER_BOSS' && tennisGame.tennisState !== 'IDLE') {
      tennisGame.endMatch(true, wantedSystem, this.ctx.hud, this.ctx.engine.scene, progression.addCash);
    }

    progression.addCash(reward);
    progression.checkSpecialBatUnlock();

    const sourceDesc = source === 'BIKE' ? '遭火柴人自行車強力撞飛' : source === 'FALL' ? '高處摔落' : '倒地';
    wantedSystem.reportCrime(1, `${npc.getRoleTitle()}${sourceDesc}`);
    // 第二世界 NPC 倒地即永久昏迷，不會復活
    const reviveNote = this.ctx.currentWorldType === 'DETENTION' ? '(永久昏迷)' : '(10秒後復活)';
    wantedSystem.showBanner(`${npc.getRoleTitle()} ${sourceDesc}！獲得獎金 +$${reward}！${reviveNote}`, 3500);
  }

  // 火柴人自行車高速衝撞 NPC (每幀最多撞飛一人)
  public updateBikeRam(targetPosition: THREE.Vector3, bikeRotY: number) {
    const bike = this.ctx.currentRidingBike;
    if (!bike || Math.abs(bike.speed) <= 4.0) return;
    for (const npc of this.ctx.npcs) {
      if (npc.position.distanceTo(targetPosition) < 2.5 && !npc.isKnockedDown && !npc.isKnockedFlying && npc.hitCooldown <= 0) {
        const speed = Math.abs(bike.speed);
        const dmg = Math.round(speed * 4.5 + 20);
        this.ctx.wantedSystem.reportCrime(2, '火柴人自行車高速衝撞師生');

        _scratchBikeForward.set(Math.sin(bikeRotY), 0, Math.cos(bikeRotY)).normalize();
        const relX = npc.position.x - targetPosition.x;
        const relZ = npc.position.z - targetPosition.z;
        const sideDot = -_scratchBikeForward.z * relX + _scratchBikeForward.x * relZ;
        const sideSign = sideDot >= 0 ? 1 : -1;
        _scratchBikeSideVec.set(-_scratchBikeForward.z, 0, _scratchBikeForward.x).multiplyScalar(sideSign * 0.45);
        _scratchBikeLaunchDir.copy(_scratchBikeForward).add(_scratchBikeSideVec).normalize();

        if (npc.launchFlying(_scratchBikeLaunchDir, speed, dmg)) {
          this.handleNpcDefeated(npc, 'BIKE');
        } else {
          this.ctx.wantedSystem.showBanner(`${npc.getRoleTitle()} 被火柴人自行車撞飛！`, 2000);
        }
        break;
      }
    }
  }

  private showDodgeBanner(text: string, advancedText: string, duration: number) {
    const isAdvanced = this.ctx.progression.isAdvancedDodge;
    this.ctx.wantedSystem.showBanner(isAdvanced ? advancedText : text, duration);
    soundManager.playDodge(isAdvanced);
  }

  // NPC 攻擊玩家判定 (含總教官衝撞命中、預警/眩暈提示)
  public updateNpcAttacks(targetPosition: THREE.Vector3, isSpawnGraceActive: boolean) {
    // 暗殺運鏡期間其他守衛暫停對玩家出手
    if (this.execPhase !== 'NONE') return;
    const { player, wantedSystem } = this.ctx;
    for (const npc of this.ctx.npcs) {
      if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;

      if (npc.role === 'DETENTION_BOSS') {
        // 總教官狂暴衝撞命中玩家判定
        if (npc.bossIsCharging && !player.isDead && npc.position.distanceTo(targetPosition) <= 2.2) {
          if (player.isDodging) {
            this.showDodgeBanner('💨 閃身步！極限側閃避開總教官衝撞！', '🐻 狗熊哆嗦毛！極限閃避總教官狂暴衝撞！', 1800);
          } else {
            npc.bossIsCharging = false;
            npc.pauseTimer = 1.0;
            npc.isPaused = true;
            if (npc.bossTelegraphGroup) npc.bossTelegraphGroup.visible = false;
            soundManager.playPunch();
            soundManager.playBatHit();
            wantedSystem.showBanner('💥 遭到總教官狂暴衝撞重創！擊飛！(-30 HP)', 2500);
            wantedSystem.notifyAttacked();
            if (player.launchFlying(npc.bossChargeDir, 16.0, 7.0, 21, '鐵面總長')) {
              this.ctx.handlePlayerDeath('被鐵面總長狂暴衝撞擊潰！');
            }
          }
        }

        // 總教官危險預警與眩暈狀態提示
        if (npc.isBossWindingUp && !this.wasBossWindingUp) {
          this.wasBossWindingUp = true;
          wantedSystem.showBanner('⚠️【危險警報】鐵面總長鎖定衝撞軌跡！立即側向閃避或引導撞柱！', 2200);
        } else if (!npc.isBossWindingUp) {
          this.wasBossWindingUp = false;
        }

        if (npc.isBossStunned && !this.wasBossStunned) {
          this.wasBossStunned = true;
          wantedSystem.showBanner('⚡ 總教官猛烈撞擊加固水泥柱！陷入 5 秒重度眩暈！快繞後刺殺！', 2500);
        } else if (!npc.isBossStunned) {
          this.wasBossStunned = false;
        }
      }

      // 人型 NPC 出招到達命中時間點：預備動作期間玩家已退出範圍或繞到側後方即落空
      const strike = npc.kfStrike;
      if (strike) {
        npc.kfStrike = null;
        if (!isSpawnGraceActive && !player.isDead && this.isNpcStrikeInRange(npc, targetPosition, strike)) {
          this.applyNpcHit(npc, targetPosition);
        }
      }

      if (npc.isBossWindingUp || npc.bossIsCharging || npc.isBossStunned) continue;

      const distToPlayer = npc.position.distanceTo(targetPosition);
      const attackDist = this.getNpcAttackDist(npc);

      // 兩個世界皆僅在追捕狀態 (通緝或被激怒) 且進入攻擊距離時發動攻擊，第一世界 NPC 不會無故主動攻擊
      const shouldAttack = !isSpawnGraceActive && npc.isChasing && distToPlayer <= attackDist;
      if (!shouldAttack || player.isDead || npc.attackCooldown > 0) continue;

      npc.attackCooldown = 0.85;
      // 人型角色先播預備動作，傷害延後至命中時間點；犬類與單車糾察立即結算
      if (npc.triggerAttackAnimation()) continue;
      this.applyNpcHit(npc, targetPosition);
    }
  }

  private getNpcAttackDist(npc: NPC): number {
    return (this.ctx.currentWorldType === 'DETENTION') ? 2.0 : Math.max(1.8, npc.attackRange);
  }

  private isNpcStrikeInRange(npc: NPC, targetPosition: THREE.Vector3, move: KfMove): boolean {
    const reach = this.getNpcAttackDist(npc) * move.reach + NPC_STRIKE_REACH_GRACE;
    if (npc.position.distanceToSquared(targetPosition) > reach * reach) return false;
    if (move.arc <= -1) return true;
    const dx = targetPosition.x - npc.position.x;
    const dz = targetPosition.z - npc.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.6) return true;
    return (dx * Math.sin(npc.rotationY) + dz * Math.cos(npc.rotationY)) / dist >= NPC_STRIKE_ARC;
  }

  // NPC 攻擊命中玩家結算 (閃避、騎車只扣血、擊飛)
  private applyNpcHit(npc: NPC, targetPosition: THREE.Vector3) {
    const { player, wantedSystem } = this.ctx;
    if (player.isDodging) {
      this.showDodgeBanner('💨 閃身步！成功規避攻擊！', '🐻 狗熊哆嗦毛！神速規避攻擊！', 1500);
      return;
    }

    _scratchImpactDir.subVectors(targetPosition, npc.position);
    _scratchImpactDir.y = 0;
    if (_scratchImpactDir.lengthSq() < 0.001) {
      _scratchImpactDir.set(0, 0, 1);
    } else {
      _scratchImpactDir.normalize();
    }

    const specs = npc.getAttackSpecs();
    // 騎車中被攻擊：只扣血不擊飛、不摔車 (沿用受擊保護時間避免連續秒殺)
    if (this.ctx.currentRidingBike) {
      if (player.hitCooldown > 0) return;
      player.hitCooldown = 0.55;
      soundManager.playPunch();
      wantedSystem.showBanner(`遭到${npc.getRoleTitle()}攻擊！穩住車身繼續騎行！`, 1500);
      wantedSystem.notifyAttacked();
      if (player.takeDamage(npc.attackPower, npc.getRoleTitle())) {
        this.ctx.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
      }
      return;
    }
    wantedSystem.showBanner(`遭到${npc.getRoleTitle()}重擊擊飛！`, 1500);

    wantedSystem.notifyAttacked();
    if (player.launchFlying(_scratchImpactDir, specs.hForce, specs.vForce, npc.attackPower, npc.getRoleTitle())) {
      this.ctx.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
    }
  }

  // 角色推擠排除：玩家與 NPC、NPC 與 NPC 互相推開 (玩家背後靠牆時由 NPC 全額退讓)
  public resolveCharacterSeparation() {
    const { player } = this.ctx;
    const npcs = this.ctx.npcs;
    const minDistance = 0.85;
    const minDistanceSq = minDistance * minDistance;
    const colliders = this.ctx.activeColliders;

    if (!player.isRidingVehicle && !player.isDead) {
      const playerRadius = 0.35;
      const playerHeight = 1.8;
      const stepHeight = 0.65;

      for (const npc of npcs) {
        if (npc.isKnockedDown || npc.isKnockedFlying) continue;

        const dx = npc.position.x - player.position.x;
        const dz = npc.position.z - player.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minDistanceSq || distSq <= 0.0001) continue;

        const dist = Math.sqrt(distSq);
        const totalOverlap = minDistance - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // 檢測將玩家推向 (-nx, -nz) 是否會撞牆或嵌進建築/牆角
        const testPlayerX = player.position.x - nx * totalOverlap * 0.5;
        const testPlayerZ = player.position.z - nz * totalOverlap * 0.5;

        let playerBlockedX = false;
        let playerBlockedZ = false;

        const minX = Math.min(testPlayerX, player.position.x) - playerRadius;
        const maxX = Math.max(testPlayerX, player.position.x) + playerRadius;
        const minZ = Math.min(testPlayerZ, player.position.z) - playerRadius;
        const maxZ = Math.max(testPlayerZ, player.position.z) + playerRadius;

        const near = queryColliders(colliders, minX, maxX, minZ, maxZ, _separationNear);
        for (let i = 0; i < near.length; i++) {
          const box = near[i];
          if (box.isFloorOnly) continue;
          if (box.max.x < minX || box.min.x > maxX || box.max.z < minZ || box.min.z > maxZ) continue;
          if (player.position.y + playerHeight > box.min.y && player.position.y + stepHeight < box.max.y) {
            if (
              testPlayerX + playerRadius > box.min.x &&
              testPlayerX - playerRadius < box.max.x &&
              player.position.z + playerRadius > box.min.z &&
              player.position.z - playerRadius < box.max.z
            ) {
              playerBlockedX = true;
            }
            if (
              player.position.x + playerRadius > box.min.x &&
              player.position.x - playerRadius < box.max.x &&
              testPlayerZ + playerRadius > box.min.z &&
              testPlayerZ - playerRadius < box.max.z
            ) {
              playerBlockedZ = true;
            }
          }
        }

        // 若玩家身後靠牆或身處死角，玩家堅定不移，由 NPC 全額退讓，徹底杜絕被推擠卡進牆體
        player.position.x += playerBlockedX ? 0 : -nx * totalOverlap * 0.5;
        player.position.z += playerBlockedZ ? 0 : -nz * totalOverlap * 0.5;
        npc.position.x += playerBlockedX ? nx * totalOverlap : nx * totalOverlap * 0.5;
        npc.position.z += playerBlockedZ ? nz * totalOverlap : nz * totalOverlap * 0.5;

        player.mesh.position.copy(player.position);
        npc.mesh.position.copy(npc.position);
      }
    }

    for (let i = 0; i < npcs.length; i++) {
      const a = npcs[i];
      if (a.isKnockedDown || a.isKnockedFlying) continue;
      for (let j = i + 1; j < npcs.length; j++) {
        const b = npcs[j];
        if (b.isKnockedDown || b.isKnockedFlying) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minDistanceSq || distSq <= 0.0001) continue;

        const dist = Math.sqrt(distSq);
        const overlap = (minDistance - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;

        a.position.x -= nx * overlap;
        a.position.z -= nz * overlap;
        b.position.x += nx * overlap;
        b.position.z += nz * overlap;

        a.mesh.position.copy(a.position);
        b.mesh.position.copy(b.position);
      }
    }
  }
}
