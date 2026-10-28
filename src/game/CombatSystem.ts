import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import { queryColliders } from '../physics/aabb';
import type { CollidableBox } from '../world/CampusWorld';
import type { NPC } from '../entities/NPC';
import type { GameContext } from './GameContext';

const _scratchPlayerForward = new THREE.Vector3();
const _scratchImpactDir = new THREE.Vector3();
const _scratchBikeForward = new THREE.Vector3();
const _scratchBikeSideVec = new THREE.Vector3();
const _scratchBikeLaunchDir = new THREE.Vector3();
const _separationNear: CollidableBox[] = [];

/**
 * 戰鬥系統：玩家攻擊判定、背後暗殺與慢動作特寫、NPC 擊倒結算、單車衝撞、NPC 攻擊玩家與角色推擠
 */
export class CombatSystem {
  // 慢動作特寫與時間膨脹 (Bullet Time & Boss Cinematic Execution)
  private bulletTimeTimer: number = 0;
  private bulletTimeDuration: number = 0;
  private bulletTimeScale: number = 0.15;
  private bossJumpDelayTimer: number = 0;
  private readonly bossJumpTargetPos = new THREE.Vector3();
  private wasBossWindingUp: boolean = false;
  private wasBossStunned: boolean = false;

  constructor(private readonly ctx: GameContext) {}

  // 套用慢動作時間膨脹後的模擬時間步長
  public scaleDelta(rawDelta: number): number {
    if (this.bulletTimeTimer <= 0) return rawDelta;
    this.bulletTimeTimer -= rawDelta;
    const progress = Math.max(0, this.bulletTimeTimer / this.bulletTimeDuration);
    // 特寫打擊慢動作平滑曲線：前期強烈時間膨脹，末期順滑恢復標準時間
    const currentScale = THREE.MathUtils.lerp(1.0, this.bulletTimeScale, Math.pow(progress, 0.7));
    return rawDelta * currentScale;
  }

  // 暗殺動畫播畢後玩家朝遠離 BOSS 方向後跳/跳離 4 個身位（約 4.8~5.2m），落地時面向 BOSS
  public updateBossLeap(rawDelta: number) {
    if (this.bossJumpDelayTimer <= 0) return;
    this.bossJumpDelayTimer -= rawDelta;
    if (this.bossJumpDelayTimer <= 0) {
      this.bossJumpDelayTimer = 0;
      const { player, cameraCtrl } = this.ctx;
      player.leapAwayFrom(this.bossJumpTargetPos, this.ctx.activeColliders, 5.0);
      cameraCtrl.resetBehind(player.position, player.rotationY);
    }
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
    // 若玩家處於攻擊間隔冷卻中，不執行攻擊
    if (!player.canAttack) return;

    // 第二世界：若處於守衛身後觸發暗殺擊昏
    const cqcTarget = this.ctx.detention.nearbyCqcTarget;
    if (this.ctx.currentWorldType === 'DETENTION' && cqcTarget && !cqcTarget.isKnockedDown) {
      this.performCqcTakedown();
      return;
    }

    if (!player.attack()) return;
    this.resolvePlayerHit();
  };

  private resolvePlayerHit() {
    const { player, wantedSystem, ecologicalGarden } = this.ctx;
    const reach = player.getWeaponReach();
    const damage = player.getWeaponDamage();
    const knockback = player.getWeaponKnockback();

    _scratchPlayerForward.set(Math.sin(player.rotationY), 0, Math.cos(player.rotationY)).normalize();

    // 1. 檢測是否命中生態園植物生物
    const plantHit = ecologicalGarden.tryHitByPlayer(player.position, reach, damage, _scratchPlayerForward);
    if (plantHit.hit) {
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

    // 2. 檢測是否命中附近的 NPC (只結算第一個命中者)
    for (const npc of this.ctx.npcs) {
      if (npc.position.distanceTo(player.position) < reach + 0.3 && !npc.isKnockedDown && !npc.isPermanentlyKnockedOut) {
        let actualKnockback = knockback;

        if (this.ctx.currentWorldType === 'DETENTION') {
          this.ctx.detention.onPlayerAttackedGuard(npc);

          if (npc.role === 'DETENTION_BOSS') {
            if (npc.isBossInvulnerable || npc.bossInvulnerableTimer > 0) {
              wantedSystem.showBanner(`🛡️ 總教官處於受創金鐘護盾無敵中 (${npc.bossInvulnerableTimer.toFixed(1)}s)！免疫傷害！`, 1500);
              soundManager.playPunch();
              player.setAttackCooldown(0.5);
              return;
            }
            if (!npc.isBossStunned) {
              wantedSystem.showBanner('🛡️ 總教官正面持盾防禦！正面攻擊無效！需誘使撞柱硬直破盾！', 2500);
              soundManager.playPunch();
              player.setAttackCooldown(0.5);
              return;
            }
          }

          // 判定是否為正面攻擊 (dot >= -0.15，非背後盲區)：技能間隔 0.5 秒且擊退效果減半
          const guardFwdX = Math.sin(npc.rotationY);
          const guardFwdZ = Math.cos(npc.rotationY);
          const toPlayerX = player.position.x - npc.position.x;
          const toPlayerZ = player.position.z - npc.position.z;
          const dist = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);
          const dot = dist > 0.001 ? guardFwdX * (toPlayerX / dist) + guardFwdZ * (toPlayerZ / dist) : 1;
          if (dot >= -0.15) {
            actualKnockback = knockback * 0.5;
            player.setAttackCooldown(0.5);
            wantedSystem.showBanner('🛡️ 正面衝擊守備防禦！技能間隔 0.5s，擊退力減半！', 1600);
          }
        }

        if (npc.launchFlying(_scratchPlayerForward, actualKnockback, damage)) {
          this.handleNpcDefeated(npc, 'ATTACK');
        } else {
          wantedSystem.reportCrime(1, '校園打架鬥毆');
          npc.isChasing = true;
        }
        return;
      }
    }
  }

  // 潛行背後暗殺擊昏 / 刺客教條草堆伏擊
  private performCqcTakedown() {
    const { player, wantedSystem, hud, cameraCtrl, detention } = this.ctx;
    const target = detention.nearbyCqcTarget;
    if (!target || target.isKnockedDown || player.isDead) return;
    const isFromHiding = player.isHidingInCover;
    const coverName = player.currentHidingSpotName || '草堆';

    // 嚴格暗殺判定：若已被敵人發現 (! 警戒狀態)，完全無法發動暗殺！
    if (target.alertState === 'ALERT') {
      const isStunnedBoss = (target.role === 'DETENTION_BOSS' && target.isBossStunned && !target.isBossInvulnerable && target.bossInvulnerableTimer <= 0);
      if (!isStunnedBoss) {
        wantedSystem.showBanner('⚠️ 敵人已發現你 (! 狀態)！無法發動暗殺！需脫離視線或誘敵硬直！', 2000);
        return;
      }
    }

    if (target.role === 'DETENTION_BOSS') {
      if (target.isBossInvulnerable || target.bossInvulnerableTimer > 0) {
        wantedSystem.showBanner(`🛡️ 總教官處於金鐘護盾無敵中 (${target.bossInvulnerableTimer.toFixed(1)}s)！免疫暗殺與傷害！`, 1800);
        return;
      }

      player.attack();

      const isFinalBlow = (target.hp - 100) <= 0;
      const bulletDuration = isFinalBlow ? 1.5 : 0.95;
      this.bulletTimeTimer = bulletDuration;
      this.bulletTimeDuration = bulletDuration;
      this.bulletTimeScale = isFinalBlow ? 0.08 : 0.16;

      soundManager.playCinematicExecutionHit();
      cameraCtrl.triggerCinematicExecution(target.position, player.position, bulletDuration, isFinalBlow, this.ctx.activeColliders);

      // 受創向外踉蹌微推
      _scratchImpactDir.subVectors(target.position, player.position).setY(0);
      if (_scratchImpactDir.lengthSq() < 0.01) _scratchImpactDir.set(0, 0, 1);
      else _scratchImpactDir.normalize();
      target.position.addScaledVector(_scratchImpactDir, 0.45);
      target.mesh.position.copy(target.position);

      // 每次精確造成 100 傷害，500 HP 需暗殺 5 次才能擊破
      target.isBossStunned = false;
      target.bossStunTimer = 0;
      target.applyAssassinationDamage(100);

      const qteTitle = isFinalBlow
        ? (isFromHiding ? '🗡️【刺客教條·草堆終結】' : '🗡️【刺客教條·終極處決】')
        : (isFromHiding ? '🗡️【刺客教條·掩體突襲】' : '⚡【弱點破甲暴擊】');
      const qteSub = isFinalBlow
        ? '徹底擊潰特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！'
        : `破除防暴護甲！造成 100 重傷！(剩餘 HP: ${target.hp}/${target.maxHp}，總教官倒地癱瘓 2 秒！)`;
      hud.triggerCinematicExecution(qteTitle, qteSub, bulletDuration);

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
        // 暗殺 BOSS 後，BOSS 倒地癱瘓 2 秒不能動
        target.knockdownBoss(2.0);
        wantedSystem.showBanner(
          isFromHiding
            ? `🗡️【掩體突襲重創】造成 100 傷害！(剩餘 HP: ${target.hp}/${target.maxHp}) 總教官倒地癱瘓 2 秒！`
            : `⚡【破甲重創】造成 100 傷害！(剩餘 HP: ${target.hp}/${target.maxHp}) 總教官倒地癱瘓 2 秒！`,
          3000
        );
      }

      this.bossJumpDelayTimer = bulletDuration;
      this.bossJumpTargetPos.copy(target.position);
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
    wantedSystem.showBanner(`${npc.getRoleTitle()} ${sourceDesc}！獲得獎金 +$${reward}！(10秒後復活)`, 3500);
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
            if (player.launchFlying(npc.bossChargeDir, 16.0, 7.0, 30, '鐵面總教官')) {
              this.ctx.handlePlayerDeath('被鐵面總教官狂暴衝撞擊潰！');
            }
          }
        }

        // 總教官危險預警與眩暈狀態提示
        if (npc.isBossWindingUp && !this.wasBossWindingUp) {
          this.wasBossWindingUp = true;
          wantedSystem.showBanner('⚠️【危險警報】鐵面總教官鎖定衝撞軌跡！立即側向閃避或引導撞柱！', 2200);
        } else if (!npc.isBossWindingUp) {
          this.wasBossWindingUp = false;
        }

        if (npc.isBossStunned && !this.wasBossStunned) {
          this.wasBossStunned = true;
          wantedSystem.showBanner('⚡ 總教官猛烈撞擊加固水泥柱！陷入 3.5 秒重度眩暈！快繞後刺殺！', 2500);
        } else if (!npc.isBossStunned) {
          this.wasBossStunned = false;
        }
      }

      if (npc.isBossWindingUp || npc.bossIsCharging || npc.isBossStunned) continue;

      const distToPlayer = npc.position.distanceTo(targetPosition);
      const attackDist = (this.ctx.currentWorldType === 'DETENTION') ? 2.0 : Math.max(1.8, npc.attackRange);

      // 兩個世界皆僅在追捕狀態 (通緝或被激怒) 且進入攻擊距離時發動攻擊，第一世界 NPC 不會無故主動攻擊
      const shouldAttack = !isSpawnGraceActive && npc.isChasing && distToPlayer <= attackDist;
      if (!shouldAttack || player.isDead || npc.attackCooldown > 0) continue;

      npc.attackCooldown = 0.85;
      npc.triggerAttackAnimation();
      if (player.isDodging) {
        this.showDodgeBanner('💨 閃身步！成功規避攻擊！', '🐻 狗熊哆嗦毛！神速規避攻擊！', 1500);
        continue;
      }

      _scratchImpactDir.subVectors(targetPosition, npc.position);
      _scratchImpactDir.y = 0;
      if (_scratchImpactDir.lengthSq() < 0.001) {
        _scratchImpactDir.set(0, 0, 1);
      } else {
        _scratchImpactDir.normalize();
      }

      const specs = npc.getAttackSpecs();
      if (this.ctx.currentRidingBike) {
        this.ctx.forceDismount();
        wantedSystem.showBanner(`遭到${npc.getRoleTitle()}猛烈衝擊，被擊飛摔下火柴人自行車！`, 2500);
      } else {
        wantedSystem.showBanner(`遭到${npc.getRoleTitle()}重擊擊飛！`, 1500);
      }

      wantedSystem.notifyAttacked();
      if (player.launchFlying(_scratchImpactDir, specs.hForce, specs.vForce, specs.damage, npc.getRoleTitle())) {
        this.ctx.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
      }
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
