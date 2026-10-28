import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import type { GameContext, WorldType } from './GameContext';

// 互動距離常數 (提示與 E 鍵判定共用同一張表，結構上杜絕「看得到提示卻按不出動作」)
const KEYCARD_PICKUP_RANGE = 2.5;
const GATE_CONSOLE_RANGE = 3.8;
const SOUTH_GATE_CONSOLE_RANGE = 4.5;
const MUSHROOM_PICK_RANGE = 2.2; // 與 EcologicalGarden.tryPickMushroom 判定半徑一致

interface Interaction {
  /** 限定世界 (未指定則兩個世界皆可) */
  world?: WorldType;
  when: (pos: THREE.Vector3) => boolean;
  /** 顯示互動提示 (未提供 = 僅 E 鍵動作，不影響提示) */
  prompt?: () => void;
  /** E 鍵動作 (未提供 = 僅狀態提示)；回傳 false 表示未處理，繼續往下比對 */
  act?: () => boolean | void;
}

/**
 * 互動系統：依優先順序排列的單一互動表，每幀提示與 E 鍵動作共用同一套條件與距離門檻
 */
export class InteractionSystem {
  private readonly interactions: Interaction[];

  constructor(private readonly ctx: GameContext) {
    this.interactions = [...this.buildDetentionInteractions(), ...this.buildCampusInteractions()];
  }

  // 每幀：顯示第一個符合條件的互動提示
  public updatePrompt(pos: THREE.Vector3) {
    const world = this.ctx.currentWorldType;
    for (const it of this.interactions) {
      if (!it.prompt || (it.world && it.world !== world) || !it.when(pos)) continue;
      it.prompt();
      return;
    }
    this.ctx.hud.hidePrompt();
  }

  // E 鍵：執行第一個符合條件的互動動作
  public readonly interact = () => {
    const { player } = this.ctx;
    if (player.isDead || player.hp <= 0) return;
    const world = this.ctx.currentWorldType;
    const pos = player.position;
    for (const it of this.interactions) {
      if (!it.act || (it.world && it.world !== world) || !it.when(pos)) continue;
      if (it.act() !== false) return;
    }
  };

  private showPrompt(text: string, icon: string = 'E') {
    this.ctx.hud.showPrompt(icon, text);
  }

  // ===== 第二世界【特訓院】：鑰匙卡、管制閘門、南大門與特訓設施 =====
  private buildDetentionInteractions(): Interaction[] {
    const ctx = this.ctx;
    const dw = () => ctx.detentionWorld;
    const det = () => ctx.detention;
    const W: WorldType = 'DETENTION';

    return [
      {
        world: W,
        when: (p) => !det().hasKeycardA && p.distanceTo(dw().keycardAPos) < KEYCARD_PICKUP_RANGE,
        prompt: () => this.showPrompt('💳 拾取【藍色門禁卡 A】(開啟管制閘門 1)'),
        act: () => {
          det().hasKeycardA = true;
          dw().hasPickedKeycardA = true;
          dw().keycardAMeshGroup.visible = false;
          ctx.wantedSystem.showBanner('💳 獲得【藍色門禁卡 A】！可用於開啟管制閘門 1！', 4000);
          det().setCheckpoint(new THREE.Vector3(5, 0, -60), 'A區安全崗亭');
          soundManager.playPunch();
        }
      },
      {
        world: W,
        when: (p) => !det().hasKeycardB && p.distanceTo(dw().keycardBPos) < KEYCARD_PICKUP_RANGE,
        prompt: () => this.showPrompt('💳 拾取【黃色門禁卡 B】(開啟管制閘門 2)'),
        act: () => {
          det().hasKeycardB = true;
          dw().hasPickedKeycardB = true;
          dw().keycardBMeshGroup.visible = false;
          ctx.wantedSystem.showBanner('💳 獲得【黃色門禁卡 B】！可用於開啟管制閘門 2！', 4000);
          det().setCheckpoint(new THREE.Vector3(24, 0, 14), 'B區貨櫃掩體');
          soundManager.playPunch();
        }
      },
      {
        world: W,
        when: (p) => {
          const mk = dw().masterKeycardPos;
          return !!mk && !det().hasMasterKeycard && p.distanceTo(mk) < KEYCARD_PICKUP_RANGE;
        },
        prompt: () => this.showPrompt('🔑 拾取【萬能逃脫鑰匙卡】(開啟南側大門)'),
        act: () => {
          det().hasMasterKeycard = true;
          dw().hasPickedMasterKeycard = true;
          dw().masterKeycardMeshGroup.visible = false;
          ctx.wantedSystem.showBanner('🔑 獲得【萬能逃脫鑰匙卡】！快前往南大門開啟大門撤離！', 5000);
          det().setCheckpoint(new THREE.Vector3(0, 0, 68), 'C區決戰勝利點');
          soundManager.playSchoolBell();
        }
      },
      {
        world: W,
        when: (p) => !dw().isGateAOpen && p.distanceTo(dw().gateAPos) < GATE_CONSOLE_RANGE,
        prompt: () => this.showPrompt(det().hasKeycardA ? '🔓 刷卡開啟【管制閘門 1】' : '🔒 管制閘門 1 (需要藍色門禁卡 A)'),
        act: () => {
          if (det().hasKeycardA) {
            dw().openGateA();
            ctx.wantedSystem.showBanner('🔓 管制閘門 1 已開啟！進入 B 區貨櫃掩體迷宮！', 3500);
            det().setCheckpoint(new THREE.Vector3(0, 0, -22), 'B區門前安全區');
            soundManager.playSchoolBell();
          } else {
            ctx.wantedSystem.showBanner('🔒 門禁鎖死！需要【藍色門禁卡 A】才能開啟閘門 1！', 3000);
          }
        }
      },
      {
        world: W,
        when: (p) => !dw().isGateBOpen && p.distanceTo(dw().gateBPos) < GATE_CONSOLE_RANGE,
        prompt: () => this.showPrompt(det().hasKeycardB ? '🔓 刷卡開啟【管制閘門 2】' : '🔒 管制閘門 2 (需要黃色門禁卡 B)'),
        act: () => {
          if (det().hasKeycardB) {
            dw().openGateB();
            ctx.wantedSystem.showBanner('🔓 管制閘門 2 已開啟！進入 C 區終極哨戒門庭！', 3500);
            det().setCheckpoint(new THREE.Vector3(0, 0, 42), 'C區決戰前哨');
            soundManager.playSchoolBell();
          } else {
            ctx.wantedSystem.showBanner('🔒 門禁鎖死！需要【黃色門禁卡 B】才能開啟閘門 2！', 3000);
          }
        }
      },
      {
        world: W,
        when: (p) => !dw().isSouthGateOpen && p.distanceTo(dw().southGateConsolePos) < SOUTH_GATE_CONSOLE_RANGE,
        prompt: () => this.showPrompt(det().hasMasterKeycard ? '🚪 刷卡解鎖【南側絕境逃脫大門】！' : '🔒 終極防暴大門 (需要萬能逃脫鑰匙卡)'),
        act: () => {
          if (det().hasMasterKeycard) {
            dw().openSouthGate();
            ctx.wantedSystem.showBanner('🚪 南側絕境大門全面解鎖升起！快衝出大門逃出生天！', 5000);
            det().setCheckpoint(new THREE.Vector3(-7.5, 0, 91), '南大門逃脫點');
            soundManager.playSchoolBell();
          } else {
            ctx.wantedSystem.showBanner('🔒 終極防暴大門鎖死！需要擊破特訓總教官取得【萬能逃脫鑰匙卡】！', 3500);
          }
        }
      },
      {
        world: W,
        when: (p) => p.distanceTo(dw().commissaryPos) < 4.2,
        prompt: () => this.showPrompt('🏪 特訓小賣部 (購買體能與急救補給品)'),
        act: () => ctx.progression.openCommissary()
      },
      {
        world: W,
        when: (p) => p.distanceTo(dw().pullupStationPos) < 3.0,
        prompt: () => this.showPrompt('💪 引體向上特訓 (恢復精力)'),
        act: () => {
          const { player } = ctx;
          player.stamina = Math.min(player.maxStamina, player.stamina + 60);
          player.hp = Math.min(player.maxHp, player.hp + 25);
          ctx.wantedSystem.showBanner('💪【特訓單槓】引體向上特訓！體力 +25 HP，精力大幅恢復 +60！', 2500);
          soundManager.playPunch();
        }
      },
      {
        world: W,
        when: (p) => p.distanceTo(dw().benchpressStationPos) < 3.0,
        prompt: () => this.showPrompt('🏋️ 鐵血大重量臥推 (恢復體力)'),
        act: () => {
          const { player } = ctx;
          player.hp = Math.min(player.maxHp, player.hp + 50);
          ctx.wantedSystem.showBanner('🏋️【特訓大重量臥推】極限力量爆發！體力強效恢復 +50 HP！', 2500);
          soundManager.playBanditSlash();
        }
      },
      {
        world: W,
        when: (p) => p.distanceTo(dw().tireStationPos) < 3.5,
        prompt: () => this.showPrompt('🛞 翻滾巨型重裝輪胎 (解鎖狂暴極速衝刺)'),
        act: () => {
          const { player } = ctx;
          player.hp = Math.min(player.maxHp, player.hp + 15);
          ctx.wantedSystem.showBanner('🛞【巨型輪胎翻滾特訓】重裝肌耐力翻滾！體力 +15 HP，解鎖 8 秒狂暴極速衝刺！', 3000);
          player.sprintSpeed = 14.0;
          setTimeout(() => { player.sprintSpeed = 10.0; }, 8000);
          soundManager.playBanditSlash();
        }
      }
    ];
  }

  // ===== 第一世界【天天國中】 =====
  private buildCampusInteractions(): Interaction[] {
    const ctx = this.ctx;
    const W: WorldType = 'CAMPUS';
    const tennisBusy = () => {
      const s = ctx.tennisGame.tennisState;
      return s === 'STARTING' || s === 'PLAYING' || s === 'FINISHED';
    };

    return [
      // 羽球比賽進行中：隱藏所有互動提示
      { world: W, when: tennisBusy, prompt: () => ctx.hud.hidePrompt() },
      // 騎乘中按 E 一律下車 (兩個世界皆適用)
      {
        when: () => ctx.currentRidingBike !== null,
        prompt: () => this.showPrompt('下車 (停放火柴人自行車)'),
        act: () => ctx.forceDismount()
      },
      {
        world: W,
        when: (p) => p.distanceTo(ctx.world.commissaryPos) < 3.8,
        prompt: () => this.showPrompt('天天合作社 (買熱食補血)'),
        act: () => ctx.progression.openCommissary()
      },
      // 競速進行中：顯示即時名次與計時
      {
        world: W,
        when: () => ctx.racingGame.isRacingTrack,
        prompt: () => {
          const rg = ctx.racingGame;
          this.showPrompt(`${rg.trackStandingText} | 操場計時: ${rg.raceTimer.toFixed(1)}s (檢查點 ${rg.raceCheckpointIdx + 1}/${ctx.world.trackCheckpoints.length})`, '⏱️');
        }
      },
      {
        world: W,
        when: () => ctx.racingGame.isSwimmingRace,
        prompt: () => {
          const rg = ctx.racingGame;
          this.showPrompt(`${rg.swimStandingText} | 泳池計時: ${rg.swimRaceTimer.toFixed(1)}s (檢查點 ${rg.swimCheckpointIdx + 1}/${ctx.world.swimCheckpoints.length})`, '🏊');
        }
      },
      {
        world: W,
        when: (p) => {
          for (const m of ctx.ecologicalGarden.mushrooms) {
            if (!m.isPicked && p.distanceTo(m.position) < MUSHROOM_PICK_RANGE) return true;
          }
          return false;
        },
        prompt: () => this.showPrompt('🍄 採摘野生奇異菇 (效果隨機)'),
        act: () => this.pickMushroom()
      },
      {
        world: W,
        when: (p) => ctx.ecologicalGarden.isNearWishingPond(p),
        prompt: () => this.showPrompt('🪙 向生態池許願投幣 ($30)'),
        act: () => this.tossCoinToPond()
      },
      {
        world: W,
        when: (p) => !ctx.campus.elevatorTransition && ctx.world.isNear1FElevator(p),
        prompt: () => this.showPrompt('🛗 搭乘直達電梯 ➜ 4F 羽球場 (大如老師)'),
        act: () => ctx.campus.startElevator(true)
      },
      {
        world: W,
        when: (p) => !ctx.campus.elevatorTransition && ctx.world.isNear4FElevator(p),
        prompt: () => this.showPrompt('🛗 搭乘直達電梯 ➜ 1F 演藝廳門廳'),
        act: () => ctx.campus.startElevator(false)
      },
      // 對話視窗開啟中：E 鍵確認 (不影響提示)
      { world: W, when: () => ctx.hud.isTennisDialogOpen, act: () => ctx.startTennisMatch() },
      { world: W, when: () => ctx.hud.isDodgeDialogOpen, act: () => ctx.hud.confirmDodgeLearn() },
      {
        world: W,
        when: (p) => {
          const coach = ctx.peCoachNpc;
          return !!coach && p.distanceTo(coach.position) < 3.2 && !coach.isKnockedDown && ctx.tennisGame.tennisState === 'IDLE';
        },
        prompt: () => this.showPrompt('🏸 與大如老師對話 / 挑戰羽球賽'),
        act: () => ctx.tennisGame.openDialog(ctx.hud, () => ctx.startTennisMatch())
      },
      {
        world: W,
        when: (p) => {
          const teacher = ctx.dodgeTeacherNpc;
          return !!teacher && p.distanceTo(teacher.position) < 3.2;
        },
        prompt: () => {
          const lvl = ctx.progression.dodgeSkillLevel;
          if (lvl === 0) this.showPrompt('🥋 與閃身步老師對話 / 學習【閃身步】($1000)');
          else if (lvl === 1) this.showPrompt('🐻 與閃身步老師對話 / 領悟【狗熊哆嗦毛】($2000)');
          else this.showPrompt('🥋 與閃身步老師對話 (技能已大成)');
        },
        act: () => ctx.hud.openDodgeDialog(ctx.progression.cash, ctx.progression.dodgeSkillLevel, ctx.progression.learnDodgeSkill)
      },
      // 持球中：提示由籃球系統自行顯示，E 鍵放下籃球
      {
        world: W,
        when: () => ctx.basketballGame.isHolding,
        prompt: () => { },
        act: () => ctx.basketballGame.drop(ctx.player, ctx.hud, ctx.wantedSystem)
      },
      {
        world: W,
        when: (p) => p.distanceTo(ctx.world.broadcastStationPos) < 2.5,
        prompt: () => {
          const cd = ctx.campus.broadcastCooldown;
          if (cd <= 0) this.showPrompt('佔領全校廣播麥克風惡搞');
          else this.showPrompt(`廣播冷卻中 (${Math.ceil(cd)}s)`, '📢');
        },
        act: () => ctx.campus.useBroadcastStation()
      },
      {
        world: W,
        when: (p) => !ctx.currentRidingBike && !ctx.racingGame.isRacingTrack && p.distanceTo(ctx.world.trackStartPos) < 4.5,
        prompt: () => this.showPrompt('參加 200m 操場極速挑戰 (逆時針方向)'),
        act: () => ctx.racingGame.startTrackRace(ctx.wantedSystem, ctx.player.position, ctx.world.trackCheckpoints)
      },
      {
        world: W,
        when: (p) => !ctx.currentRidingBike && !ctx.racingGame.isSwimmingRace && p.distanceTo(ctx.world.swimmingPoolPos) < 4.5,
        prompt: () => this.showPrompt('參加 50m 自由式水上競速挑戰'),
        act: () => ctx.racingGame.startSwimRace(ctx.wantedSystem, ctx.player.position, ctx.world.swimCheckpoints)
      },
      {
        world: W,
        when: (p) => !ctx.currentRidingBike && !ctx.basketballGame.isBallInAir && ctx.basketballGame.basketballMesh.position.distanceTo(p) < 2.5,
        prompt: () => this.showPrompt('拿起籃球 (三分球挑戰)'),
        act: () => ctx.basketballGame.pickup(ctx.player, ctx.hud, ctx.wantedSystem)
      },
      {
        world: W,
        when: (p) => ctx.campus.findNearbyBikePatrol(p) !== null,
        prompt: () => this.showPrompt('🚲 搶奪火柴人自行車！'),
        act: () => ctx.campus.hijackBike(ctx.campus.findNearbyBikePatrol(ctx.player.position)!)
      },
      {
        world: W,
        when: (p) => !ctx.player.isDead && ctx.campus.findNearbyBike(p) !== null,
        prompt: () => this.showPrompt('騎乘火柴人自行車'),
        act: () => ctx.campus.rideBike(ctx.campus.findNearbyBike(ctx.player.position)!)
      }
    ];
  }

  // 野生奇異菇採摘：隨機補血、回精力、中毒、麻痺、撿到金幣或超級跳躍
  private pickMushroom(): boolean {
    const { player, ecologicalGarden, wantedSystem, progression, hud } = this.ctx;
    const result = ecologicalGarden.tryPickMushroom(player.position);
    if (!result.picked || !result.effect) return false;
    switch (result.effect) {
      case 'HEAL':
        player.hp = Math.min(player.maxHp, player.hp + 45);
        soundManager.playEatFood();
        break;
      case 'STAMINA':
        player.stamina = player.maxStamina;
        player.hp = Math.min(player.maxHp, player.hp + 20);
        soundManager.playEatFood();
        break;
      case 'POISON':
        player.takeDamage(12, '奇異毒菇');
        player.poisonTimer = 5.0;
        player.poisonTickTimer = 0.0;
        soundManager.playPoisonTick();
        break;
      case 'PARALYSIS':
        player.takeDamage(8, '麻痺孢子');
        player.walkSpeed = 2.5;
        player.sprintSpeed = 5.0;
        setTimeout(() => {
          player.walkSpeed = 5.0;
          player.sprintSpeed = 10.0;
        }, 5000);
        break;
      case 'LUCKY_GOLD':
        progression.cash += 80;
        hud.setCash(progression.cash);
        soundManager.playCoinToss();
        break;
      case 'SUPER_JUMP':
        player.jumpStrength = 14.5;
        setTimeout(() => {
          player.jumpStrength = 8.5;
        }, 8000);
        break;
    }
    wantedSystem.showBanner(`${result.title} ${result.desc}`, 3500);
    return true;
  }

  // 自然生態池許願投幣 ($30)：隨機獎金、回復或加速祝福
  private tossCoinToPond() {
    const { player, ecologicalGarden, wantedSystem, progression, hud } = this.ctx;
    const pondResult = ecologicalGarden.tossCoinToPond(progression.cash);
    if (pondResult.success) {
      progression.hasWishedPond = true;
      progression.cash = Math.max(0, progression.cash - 30 + pondResult.rewardCash);
      hud.setCash(progression.cash);
      if (pondResult.healHp > 0) {
        player.hp = Math.min(player.maxHp, player.hp + pondResult.healHp);
        player.stamina = player.maxStamina;
      }
      if (pondResult.speedBoostDuration > 0) {
        player.walkSpeed = 8.5;
        player.sprintSpeed = 16.0;
        setTimeout(() => {
          player.walkSpeed = 5.0;
          player.sprintSpeed = 10.0;
        }, pondResult.speedBoostDuration * 1000);
      }
    }
    wantedSystem.showBanner(pondResult.message, 4500);
  }
}
