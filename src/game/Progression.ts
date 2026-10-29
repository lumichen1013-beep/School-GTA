import { soundManager } from '../audio/SoundEffects';
import type { WeaponType } from '../entities/Player';
import type { NPCRole } from '../entities/NPC';
import { getCommissaryPrice, type CommissaryItem } from '../ui/HUD';
import type { GameContext } from './GameContext';

// 武器切換提示文字 (第一世界 / 第二世界)
const WEAPON_EQUIP_BANNERS: Record<WeaponType, { campus: string; detention: string }> = {
  FIST: { campus: '🥊 切換武器：徒手拳擊 (ATK 25)', detention: '🥊 切換模式：徒手潛入 (支援背後暗殺)' },
  NORMAL_BAT: { campus: '🏏 切換武器：普通木質棒球棍 (ATK 55)', detention: '🏏 切換裝備：特訓防暴警棍 (ATK 55)' },
  SPECIAL_BAT: { campus: '⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)', detention: '⚡ 切換神兵：黃金雷霆防暴棍 (ATK 120)' }
};

// 擊敗各角色的獎金與擊倒統計計數 (未列出的角色預設獎金 20)
interface RoleDefeatReward {
  reward: number;
  banner?: { text: string; duration: number };
  counts?: Array<'student' | 'teacher' | 'dog' | 'bikePatrol' | 'inspector'>;
}
// 第二世界特訓賞金：暗殺 (背後暗殺 / 草堆伏擊 / 總教官終結暗殺) 全額，一般攻擊擊倒減半
interface DetentionBounty {
  full: number;
  icon: string;
  name: string;
  duration: number;
}
const ROLE_DEFEAT_REWARDS: Partial<Record<NPCRole, RoleDefeatReward>> = {
  STUDENT: { reward: 20, counts: ['student'] },
  INSPECTOR: { reward: 40, counts: ['inspector'] },
  BIKE_PATROL: { reward: 60, counts: ['bikePatrol', 'inspector'] },
  TEACHER: { reward: 80, counts: ['teacher'] },
  DISCIPLINE_CHIEF: { reward: 80, counts: ['teacher'] },
  BANDIT: { reward: 100 },
  DOG: { reward: 120, counts: ['dog'] },
  INSTRUCTOR: { reward: 150, counts: ['inspector', 'teacher'] },
  PE_TEACHER_BOSS: { reward: 180, banner: { text: '🏸 震撼勝利！擊倒【大如老師】！獲得獎金 +$180！', duration: 5000 } }
};
const DETENTION_BOUNTIES: Partial<Record<NPCRole, DetentionBounty>> = {
  DETENTION_GUARD: { full: 40, icon: '🛡️', name: '特訓院守衛', duration: 3000 },
  DETENTION_SENIOR: { full: 35, icon: '💪', name: '特訓資深守衛', duration: 3000 },
  DETENTION_WOLF: { full: 35, icon: '🐺', name: '特訓警戒犬', duration: 3000 },
  DETENTION_HEAVY: { full: 55, icon: '🏋️', name: '特訓重裝守衛', duration: 3500 },
  DETENTION_BOSS: { full: 250, icon: '🎖️', name: '鐵面總長', duration: 6000 }
};

// 第二世界賞金金額 (暗殺全額、一般攻擊擊倒減半並無條件捨去)
function getDetentionBounty(role: NPCRole, isTakedown: boolean): number {
  const b = DETENTION_BOUNTIES[role];
  if (!b) return 0;
  return isTakedown ? b.full : Math.floor(b.full / 2);
}

/**
 * 玩家成長進度：零用錢、擊倒統計、成就旗標、武器解鎖與身法技能
 */
export class Progression {
  public cash: number = 100;
  public studentDefeatedCount: number = 0;
  public teacherDefeatedCount: number = 0;
  public dogDefeatedCount: number = 0;
  public bikePatrolDefeatedCount: number = 0;
  public inspectorDefeatedCount: number = 0;
  public hasRiddenBike: boolean = false;
  public hasEscapedDog: boolean = false;
  public hasWishedPond: boolean = false;
  public hasTastedHotFood: boolean = false;
  // 身法技能系統 (閃身步 5s CD / 狗熊哆嗦毛 2s CD)
  public dodgeSkillLevel: number = 0; // 0: 未習得, 1: 閃身步, 2: 狗熊哆嗦毛
  public dodgeCooldownTimer: number = 0;

  constructor(private readonly ctx: GameContext) {}

  // 共用加錢回呼 (建構一次，可直接傳給小遊戲而不必每幀配置新閉包)
  public readonly addCash = (amt: number) => {
    this.cash += amt;
    this.ctx.hud.setCash(this.cash);
  };

  public openCommissary() {
    this.ctx.hud.openCommissary(this.cash, this.buyCommissaryItem, this.ctx.currentWorldType === 'DETENTION');
  }

  private readonly buyCommissaryItem = (item: CommissaryItem) => {
    const { player, hud, wantedSystem } = this.ctx;
    const price = getCommissaryPrice(item, this.ctx.currentWorldType === 'DETENTION');
    if (this.cash < price) {
      wantedSystem.showBanner(
        this.ctx.currentWorldType === 'DETENTION' ? '資金不足！暗殺守衛可賺取全額特訓賞金！' : '零用錢不足！快去探索校園賺錢吧！',
        2000
      );
      return;
    }

    this.hasTastedHotFood = true;
    if (this.ctx.currentWorldType === 'CAMPUS') this.ctx.campusLife.onPlayerAte(); // 柴柴聞香跟來討食
    this.cash -= price;
    player.hp = Math.min(player.maxHp, player.hp + item.healHp);
    if (item.restoreStamina) {
      player.stamina = player.maxStamina;
    }

    soundManager.playCashRegister();
    soundManager.playEatFood();
    hud.setCash(this.cash);
    wantedSystem.showBanner(
      this.ctx.currentWorldType === 'DETENTION'
        ? `🩹 補給了【${item.name}】！體力 +${item.healHp} HP！剩餘資金 $${this.cash}`
        : `😋 品嚐了【${item.name}】！體力 +${item.healHp} HP！剩餘零用錢 $${this.cash}`,
      3000
    );
    this.openCommissary();
  };

  // 記錄擊倒 (統計計數與普通球棒解鎖)，回傳該角色獎金與專屬提示；
  // 第二世界角色依擊倒方式發放特訓賞金 (isTakedown：暗殺全額，否則減半)
  public recordDefeat(role: NPCRole, isTakedown: boolean = false): RoleDefeatReward {
    const bounty = DETENTION_BOUNTIES[role];
    if (bounty) {
      const reward = getDetentionBounty(role, isTakedown);
      const text = isTakedown
        ? `${bounty.icon} 暗殺【${bounty.name}】！獲得全額特訓賞金 +$${reward}！`
        : `${bounty.icon} 正面擊倒【${bounty.name}】！特訓賞金減半 +$${reward}（暗殺可得 $${bounty.full}）`;
      return { reward, banner: { text, duration: bounty.duration } };
    }
    const entry = ROLE_DEFEAT_REWARDS[role] ?? { reward: 20 };
    if (entry.counts) {
      for (const c of entry.counts) {
        if (c === 'student') this.studentDefeatedCount++;
        else if (c === 'teacher') this.teacherDefeatedCount++;
        else if (c === 'dog') { this.dogDefeatedCount++; this.hasEscapedDog = true; }
        else if (c === 'bikePatrol') this.bikePatrolDefeatedCount++;
        else this.inspectorDefeatedCount++;
      }
    }
    const { player, wantedSystem } = this.ctx;
    if (role === 'STUDENT' && this.studentDefeatedCount >= 5 && !player.hasNormalBat) {
      player.hasNormalBat = true;
      player.setWeapon('NORMAL_BAT');
      wantedSystem.showBanner('🎉 達成【名揚校園】！擊敗5位普通同學，解鎖【普通球棒】！(按 2 裝備，ATK 55)', 6000);
      soundManager.playBatHit();
    }
    return entry;
  }

  // 傳奇成就【校園霸王】：擊倒生教、校犬與 5 名單車騎士解鎖神兵
  public checkSpecialBatUnlock() {
    const { player, wantedSystem } = this.ctx;
    if (this.teacherDefeatedCount >= 1 && this.dogDefeatedCount >= 1 && this.bikePatrolDefeatedCount >= 5 && !player.hasSpecialBat) {
      player.hasSpecialBat = true;
      player.setWeapon('SPECIAL_BAT');
      wantedSystem.showBanner('⚡ 達成傳奇成就【校園霸王】！擊倒生教組長、校犬與5名火柴人自行車騎士，解鎖神兵【黃金雷霆棒球棍】！(按 3 裝備，ATK 120)', 7000);
      soundManager.playSpecialBatHit();
    }
  }

  private equipWeapon(weapon: WeaponType) {
    this.ctx.player.setWeapon(weapon);
    const texts = WEAPON_EQUIP_BANNERS[weapon];
    this.ctx.wantedSystem.showBanner(this.ctx.currentWorldType === 'DETENTION' ? texts.detention : texts.campus, 1500);
  }

  // 數字鍵 1/2/3 直接切換武器 (未解鎖時顯示解鎖條件)
  public selectWeaponSlot(slot: 1 | 2 | 3) {
    const { player, wantedSystem } = this.ctx;
    const isDetention = this.ctx.currentWorldType === 'DETENTION';
    if (slot === 1) {
      this.equipWeapon('FIST');
    } else if (slot === 2) {
      if (player.hasNormalBat) {
        this.equipWeapon('NORMAL_BAT');
      } else {
        wantedSystem.showBanner(
          isDetention
            ? '🔒 防暴警棍未配發！完成特訓即可獲取裝備！'
            : `🔒 普通球棒未解鎖！需擊敗 5 位普通同學 (目前進度: ${this.studentDefeatedCount}/5)`,
          2500
        );
      }
    } else if (player.hasSpecialBat) {
      this.equipWeapon('SPECIAL_BAT');
    } else {
      wantedSystem.showBanner(
        isDetention
          ? '⚠️ 特訓院管制區：重型管制武器已遭沒收封存！'
          : `🔒 特殊棒球棍未解鎖！需擊敗生教(1)、校犬(1)、火柴人自行車騎士(5) (目前: 教${this.teacherDefeatedCount}/1 犬${this.dogDefeatedCount}/1 車${this.bikePatrolDefeatedCount}/5)`,
        2500
      );
    }
  }

  // 手機武器鍵：依序循環 徒手 → 普通球棒 → 神兵
  public readonly cycleWeapon = () => {
    const { player } = this.ctx;
    const current = player.currentWeapon;
    if (current === 'FIST') {
      if (player.hasNormalBat) {
        this.equipWeapon('NORMAL_BAT');
      } else if (player.hasSpecialBat) {
        this.equipWeapon('SPECIAL_BAT');
      } else {
        this.ctx.wantedSystem.showBanner(
          this.ctx.currentWorldType === 'DETENTION'
            ? '🔒 防暴警棍未配發！完成特訓即可獲取裝備！'
            : `🥊 目前僅有徒手！擊敗同學解鎖球棒 (${this.studentDefeatedCount}/5)`,
          1500
        );
      }
    } else if (current === 'NORMAL_BAT' && player.hasSpecialBat) {
      this.equipWeapon('SPECIAL_BAT');
    } else {
      this.equipWeapon('FIST');
    }
  };

  // 學習身法絕學 (閃身步 / 狗熊哆嗦毛)
  public readonly learnDodgeSkill = (targetLevel: number) => {
    const { hud, wantedSystem } = this.ctx;
    if (targetLevel === 1) {
      if (this.cash < 1000) {
        wantedSystem.showBanner('❌ 錢包餘額不足！學習【閃身步】需要 NT$ 1000！', 2500);
        return;
      }
      this.cash -= 1000;
      this.dodgeSkillLevel = 1;
      hud.setCash(this.cash);
      soundManager.playCashRegister();
      wantedSystem.showBanner('🥋 成功習得技能【閃身步】！冷卻時間 5 秒，按 [Q] 鍵或點擊 [閃] 按鈕即可規避敵人攻擊！', 5000);
    } else if (targetLevel === 2) {
      if (this.dodgeSkillLevel < 1) {
        wantedSystem.showBanner('❌ 前置條件未達成！必須先學會基礎【閃身步】！', 2500);
        return;
      }
      if (this.cash < 2000) {
        wantedSystem.showBanner('❌ 錢包餘額不足！領悟【狗熊哆嗦毛】需要 NT$ 2000！', 2500);
        return;
      }
      this.cash -= 2000;
      this.dodgeSkillLevel = 2;
      hud.setCash(this.cash);
      soundManager.playCashRegister();
      wantedSystem.showBanner('🐻 恭喜融會貫通進階【狗熊哆嗦毛】！技能如神，冷卻縮短至 2 秒！按 [Q] 鍵神速規避！', 5000);
    }
  };

  // 施展技能 (閃身步 / 狗熊哆嗦毛)
  public readonly triggerDodgeSkill = () => {
    const { player, wantedSystem } = this.ctx;
    if (player.isDead || player.hp <= 0) return;
    if (this.ctx.currentRidingBike) {
      wantedSystem.showBanner('🚲 騎乘自行車時無法施展技能！請先按 [E] 下車', 2000);
      return;
    }
    if (this.dodgeSkillLevel === 0) {
      wantedSystem.showBanner(
        this.ctx.currentWorldType === 'DETENTION'
          ? '🥋 尚未習得技能！需返回【天天國中】教學大樓尋訪「閃身步老師」學習【閃身步】！'
          : '🥋 尚未習得技能！請至教學大樓尋訪「閃身步老師」學習【閃身步】！',
        2500
      );
      return;
    }
    if (this.dodgeCooldownTimer > 0) {
      wantedSystem.showBanner(`⌛ 技能冷卻中 (${this.dodgeCooldownTimer.toFixed(1)}s)`, 1000);
      return;
    }

    const isAdvanced = this.dodgeSkillLevel === 2;
    this.dodgeCooldownTimer = isAdvanced ? 2.0 : 5.0;

    if (isAdvanced) {
      player.performBearShake(this.ctx.activeColliders);
    } else {
      player.performFlashStep();
    }

    wantedSystem.showBanner(
      isAdvanced ? '🐻 施展【狗熊哆嗦毛】！連續瞬移神速規避攻擊！(CD 2s)' : '💨 施展【閃身步】！左右破空閃身規避！(CD 5s)',
      1600
    );
  };

  // 閃避成功提示 (技能等級決定招式名稱)
  public get isAdvancedDodge(): boolean {
    return this.dodgeSkillLevel === 2;
  }

  // 每幀：技能冷卻計時與 HUD 更新
  public updateSkillCooldown(delta: number) {
    if (this.dodgeCooldownTimer > 0) {
      this.dodgeCooldownTimer = Math.max(0, this.dodgeCooldownTimer - delta);
    }
    const maxSkillCd = this.dodgeSkillLevel === 2 ? 2.0 : 5.0;
    this.ctx.hud.updateSkillHUD(this.dodgeSkillLevel, this.dodgeCooldownTimer, maxSkillCd, this.ctx.currentWorldType === 'DETENTION');
  }
}
