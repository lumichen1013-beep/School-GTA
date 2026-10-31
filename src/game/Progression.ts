import { soundManager } from '../audio/SoundEffects';
import { getWeapon, isWeaponAvailable, isWeaponEnabled, resolveVariant, WEAPONS } from '../weapons/registry';
import type { WeaponDefinition, WeaponId, WeaponWorld } from '../weapons/types';
import type { NPCRole } from '../entities/NPC';
import { getCommissaryPrice, type CommissaryItem } from '../ui/HUD';
import type { GameContext } from './GameContext';
import { getWeaponSummary, type WeaponSummary } from './weaponStats';
import { RAPIER_UNLOCK_TEXT } from '../weapons/defs/rapier';

// 身法技能冷卻 (閃身步 / 狗熊哆嗦毛共用，秒) 與被動自動閃避機率 (被敵人攻擊命中瞬間)
const DODGE_SKILL_COOLDOWN = 1.0;
const AUTO_DODGE_CHANCE = 0.3;
// 被動自動閃避獨立冷卻 (秒)，與主動技能冷卻分開計時，避免連續觸發
const AUTO_DODGE_COOLDOWN = 1.0;
// 學習閃身步 (等級 1) / 狗熊哆嗦毛 (等級 2) 的學費
const DODGE_SKILL_FEES = [1000, 2000] as const;

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

// 大地圖【裝備】分頁的單列資料
export type WeaponEquipStatus = 'equipped' | 'unlocked' | 'locked' | 'unavailable';
export interface WeaponUnlockStep {
  label: string;
  cur: number;
  max: number;
}
// 武器解鎖橫幅：text/duration 為橫幅，sfx 為解鎖音效
export interface WeaponUnlockBanner {
  text: string;
  duration: number;
  sfx?: () => void;
  autoEquip?: boolean; // 解鎖後是否自動裝備 (預設 true；籃球因與小遊戲持球互斥設 false)
}
export interface WeaponEquipEntry {
  id: WeaponId;
  icon: string;
  name: string;
  baseName: string; // 武器本名 (name 為本世界變體名，如特訓院「防暴警棍」)
  damage: number;
  reach: number;
  knockback: number;
  status: WeaponEquipStatus;
  dev: boolean; // 開發中武器 (裝備頁標「🧪 開發中」)
  hint: string;
  summary: WeaponSummary; // 本世界連段估算 (秒傷 / 總傷 / 各招)
  unlockSteps: WeaponUnlockStep[]; // 解鎖進度 (徒手為空)
}

// 大地圖狀態快照 (學生證 / 受訓人員檔案、戰績、技能卡共用；每次呼叫就地更新同一物件)
export interface FullMapStatus {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  cash: number;
  stars: number;
  wantedTitle: string;
  dodgeLevel: number;
  dodgeCooldown: number;
  dodgeCooldownMax: number;
  autoDodgeChance: number;
  dodgeNextFee: number; // 0 = 已精通
  // 特訓院戰績
  takedowns: number;
  frontalKos: number;
  alerts: number;
  escapeSeconds: number; // -1 = 已逃脫
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
  // 新武器解鎖進度 (由 CampusMode.updateMissionTracker 每幀寫入)
  public basketballMade: number = 0;
  public swimWon: boolean = false;
  public trackWon: boolean = false;
  public inspectorDefeatedCount: number = 0;
  public hasRiddenBike: boolean = false;
  public hasEscapedDog: boolean = false;
  public hasWishedPond: boolean = false;
  public hasTastedHotFood: boolean = false;
  // 世界 Boss【花劍客】：首勝旗標 (任務 / 大地圖完成、細劍解鎖點) 與勝場數
  public fencerDefeated: boolean = false;
  public fencerWins: number = 0;
  private fencerSeenUndefeated = false; // 本次遊玩曾看過「未首勝」(區分當場打贏 vs 讀檔即已首勝)
  // 身法技能系統 (閃身步 / 狗熊哆嗦毛，冷卻皆 1s)
  public dodgeSkillLevel: number = 0; // 0: 未習得, 1: 閃身步, 2: 狗熊哆嗦毛
  public dodgeCooldownTimer: number = 0;
  public autoDodgeCooldownTimer: number = 0; // 被動自動閃避專用冷卻，不影響主動技能

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
    soundManager.playEatFood(player.position);
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
    const { player } = this.ctx;
    if (role === 'STUDENT' && this.studentDefeatedCount >= 5) {
      this.unlockWeapon('NORMAL_BAT', {
        text: '🎉 達成【名揚校園】！擊敗5位普通同學，解鎖【普通球棒】！(滾輪或大地圖【裝備】切換，ATK 35)',
        duration: 6000,
        sfx: () => soundManager.playBatHit(player.position)
      });
    }
    return entry;
  }

  // 傳奇成就【校園霸王】：擊倒生教、校犬與 5 名單車騎士解鎖神兵
  public checkSpecialBatUnlock() {
    const { player } = this.ctx;
    if (this.teacherDefeatedCount >= 1 && this.dogDefeatedCount >= 1 && this.bikePatrolDefeatedCount >= 5) {
      this.unlockWeapon('SPECIAL_BAT', {
        text: '⚡ 達成傳奇成就【校園霸王】！擊倒生教組長、校犬與5名火柴人自行車騎士，解鎖神兵【黃金雷霆棒球棍】！(滾輪或大地圖【裝備】切換，ATK 68)',
        duration: 7000,
        sfx: () => soundManager.playSpecialBatHit(player.position)
      });
    }
  }

  // 稀有成就【羽壇雙燕】：4F 羽球賽擊敗大如老師解鎖雙燕羽刃 (只限校園，呼叫端確認已擊敗；已解鎖時立即返回)
  public checkDualRacketUnlock() {
    this.unlockWeapon('DUAL_RACKET', {
      text: '🏸 達成【羽壇雙燕】！擊敗羽球大如老師，解鎖神兵【雙燕羽刃】！(滾輪或大地圖【裝備】切換，ATK 25×7 連擊)',
      duration: 7000,
      sfx: () => soundManager.playFanfare()
    });
  }

  // 花劍客首勝 → 玫瑰細劍 (每次更新任務看板時輪詢；已解鎖時立即返回)。fightActive = Boss 戰 / 過場進行中 → 延後到戰後恢復校園才解鎖，
  // 避免結界 / 首勝過場中被自動換武器打斷。啟動時就已首勝 (花劍客存檔讀回) → 靜默解鎖 (不重播橫幅 / 不自動裝備)
  public checkRapierUnlock(fightActive: boolean) {
    if (!this.fencerDefeated) { this.fencerSeenUndefeated = true; return; }
    if (fightActive || !isWeaponEnabled('RAPIER') || this.ctx.player.isWeaponUnlocked('RAPIER')) return;
    if (this.fencerSeenUndefeated) {
      this.unlockWeapon('RAPIER', { text: RAPIER_UNLOCK_TEXT, duration: 7000, sfx: () => soundManager.playFanfare() });
    } else {
      this.ctx.player.setWeaponUnlocked('RAPIER', true);
    }
  }

  // 解鎖武器並自動裝備 (banner.autoEquip 為 false 時不裝備)、顯示橫幅與音效；未啟用 (dev 武器且開關關閉) 或已解鎖者直接返回，不設旗標 / 不橫幅 / 不裝備
  public unlockWeapon(id: WeaponId, banner: WeaponUnlockBanner): boolean {
    if (!isWeaponEnabled(id)) return false;
    const { player, wantedSystem } = this.ctx;
    if (player.isWeaponUnlocked(id)) return false;
    player.setWeaponUnlocked(id, true);
    if (banner.autoEquip !== false) player.setWeapon(id);
    wantedSystem.showBanner(banner.text, banner.duration);
    banner.sfx?.();
    return true;
  }

  // 切換武器並顯示提示文字 (第一世界 / 第二世界，見武器定義 banner)
  private equipWeapon(weapon: WeaponId) {
    this.ctx.player.setWeapon(weapon);
    const texts = getWeapon(weapon).banner;
    this.ctx.wantedSystem.showBanner(this.ctx.currentWorldType === 'DETENTION' ? texts.detention : texts.campus, 1500);
  }

  // 已解鎖且本世界可用 (循環切換與大地圖裝備共用)
  private canEquip(def: WeaponDefinition): boolean {
    return this.ctx.player.isWeaponUnlocked(def.id) && isWeaponAvailable(def, this.ctx.currentWorldType);
  }

  // 無法裝備時的提示：已解鎖但本世界不可用 → 該世界專屬文案 (如特訓院「器材已遭沒收」)；未解鎖 → 解鎖條件 (本世界不可用者取校園版)
  private blockedHint(def: WeaponDefinition, world: WeaponWorld): string {
    if (!def.unlock) return '🚫 本世界不可使用此武器';
    return def.unlock.lockedHint(this, this.ctx.player.isWeaponUnlocked(def.id) || isWeaponAvailable(def, world) ? world : 'CAMPUS');
  }

  // 大地圖【裝備】分頁：依武器槽順序列出武器與狀態 (開啟 / 裝備後才呼叫，非每幀)
  public getWeaponEquipEntries(): WeaponEquipEntry[] {
    const world = this.ctx.currentWorldType;
    return WEAPONS.map((def) => {
      const status: WeaponEquipStatus = def.id === this.ctx.player.currentWeapon ? 'equipped'
        : !isWeaponAvailable(def, world) ? 'unavailable'
        : !this.ctx.player.isWeaponUnlocked(def.id) ? 'locked'
        : 'unlocked';
      return {
        dev: def.release === 'dev',
        id: def.id,
        icon: def.icon,
        name: resolveVariant(def.id, world).name,
        baseName: def.name,
        damage: def.stats.damage,
        reach: def.stats.reach,
        knockback: def.stats.knockback,
        status,
        hint: status === 'locked' || status === 'unavailable' ? this.blockedHint(def, world) : '',
        summary: getWeaponSummary(def.id, world),
        unlockSteps: this.getUnlockSteps(def.id)
      };
    });
  }

  // 武器解鎖進度條資料 (已解鎖者視為全滿)
  private getUnlockSteps(id: WeaponId): WeaponUnlockStep[] {
    const unlocked = this.ctx.player.isWeaponUnlocked(id);
    const step = (label: string, cur: number, max: number): WeaponUnlockStep => ({ label, cur: unlocked ? max : Math.min(cur, max), max });
    switch (id) {
      case 'NORMAL_BAT': return [step('擊敗普通同學', this.studentDefeatedCount, 5)];
      case 'SPECIAL_BAT': return [
        step('擊倒生教 / 老師', this.teacherDefeatedCount, 1),
        step('擊倒校犬', this.dogDefeatedCount, 1),
        step('擊倒單車糾察', this.bikePatrolDefeatedCount, 5)
      ];
      case 'DUAL_RACKET': return [step('擊敗羽球大如老師', 0, 1)];
      // 開發中武器 (BOOK_WHIP / BASKETBALL 等) 的步驟寫在武器定義 unlock.steps，正式版不打包其 id
      default: return (getWeapon(id).unlock?.steps?.(this) ?? []).map((s) => step(s.label, s.cur, s.max));
    }
  }

  private readonly fullMapStatus: FullMapStatus = {
    hp: 0, maxHp: 0, stamina: 0, maxStamina: 0, cash: 0, stars: 0, wantedTitle: '',
    dodgeLevel: 0, dodgeCooldown: 0, dodgeCooldownMax: DODGE_SKILL_COOLDOWN, autoDodgeChance: AUTO_DODGE_CHANCE, dodgeNextFee: 0,
    takedowns: 0, frontalKos: 0, alerts: 0, escapeSeconds: 0
  };

  // 大地圖開啟期間 (約 20Hz) 取得玩家狀態快照
  public getFullMapStatus(): FullMapStatus {
    const { player, wantedSystem, detention } = this.ctx;
    const st = this.fullMapStatus;
    st.hp = player.hp;
    st.maxHp = player.maxHp;
    st.stamina = player.stamina;
    st.maxStamina = player.maxStamina;
    st.cash = this.cash;
    st.stars = wantedSystem.stars;
    st.wantedTitle = wantedSystem.getDemeritLevelTitle(wantedSystem.stars);
    st.dodgeLevel = this.dodgeSkillLevel;
    st.dodgeCooldown = this.dodgeCooldownTimer;
    st.dodgeNextFee = this.dodgeSkillLevel < DODGE_SKILL_FEES.length ? DODGE_SKILL_FEES[this.dodgeSkillLevel] : 0;
    st.takedowns = detention.takedownCount;
    st.frontalKos = detention.frontalKoCount;
    st.alerts = detention.alertCount;
    st.escapeSeconds = detention.isEscapeComplete ? -1 : Math.max(0, Math.floor((performance.now() - detention.escapeStartTime) / 1000));
    return st;
  }

  // 大地圖點選裝備：檢查同 cycleWeapon，不可用時顯示解鎖條件橫幅
  public readonly equipById = (id: WeaponId): boolean => {
    if (!isWeaponEnabled(id)) return false;
    const def = getWeapon(id);
    const { player, wantedSystem } = this.ctx;
    if (!this.canEquip(def)) {
      const world = this.ctx.currentWorldType;
      wantedSystem.showBanner(this.blockedHint(def, world), 2000);
      return false;
    }
    if (id !== player.currentWeapon) this.equipWeapon(id);
    return true;
  };

  // 武器循環 (滾輪)：依武器槽順序循環至下一把已解鎖且本世界可用的武器 (徒手 → 普通球棒 → 神兵 → 徒手)
  public readonly cycleWeapon = () => {
    const { player } = this.ctx;
    const world = this.ctx.currentWorldType;
    const from = WEAPONS.findIndex((w) => w.id === player.currentWeapon);
    for (let i = 1; i <= WEAPONS.length; i++) {
      const def = WEAPONS[(from + i) % WEAPONS.length];
      if (!this.canEquip(def)) continue;
      if (def.id !== player.currentWeapon) {
        this.equipWeapon(def.id);
        return;
      }
      break;
    }
    // 沒有其他可切換的武器
    this.ctx.wantedSystem.showBanner(
      world === 'DETENTION'
        ? '🔒 防暴警棍未配發！完成特訓即可獲取裝備！'
        : `🥊 目前僅有徒手！擊敗同學解鎖球棒 (${this.studentDefeatedCount}/5)`,
      1500
    );
  };

  // 學習身法絕學 (閃身步 / 狗熊哆嗦毛)
  public readonly learnDodgeSkill = (targetLevel: number) => {
    const { hud, wantedSystem } = this.ctx;
    if (targetLevel === 1) {
      if (this.cash < DODGE_SKILL_FEES[0]) {
        wantedSystem.showBanner(`❌ 錢包餘額不足！學習【閃身步】需要 NT$ ${DODGE_SKILL_FEES[0]}！`, 2500);
        return;
      }
      this.cash -= DODGE_SKILL_FEES[0];
      this.dodgeSkillLevel = 1;
      hud.setCash(this.cash);
      soundManager.playCashRegister();
      wantedSystem.showBanner('🥋 成功習得技能【閃身步】！按 [Q] 鍵（手機點擊技能圖示）手動施放，冷卻 1 秒；被攻擊命中時另有 30% 機率自動閃避！', 5000);
    } else if (targetLevel === 2) {
      if (this.dodgeSkillLevel < 1) {
        wantedSystem.showBanner('❌ 前置條件未達成！必須先學會基礎【閃身步】！', 2500);
        return;
      }
      if (this.cash < DODGE_SKILL_FEES[1]) {
        wantedSystem.showBanner(`❌ 錢包餘額不足！領悟【狗熊哆嗦毛】需要 NT$ ${DODGE_SKILL_FEES[1]}！`, 2500);
        return;
      }
      this.cash -= DODGE_SKILL_FEES[1];
      this.dodgeSkillLevel = 2;
      hud.setCash(this.cash);
      soundManager.playCashRegister();
      wantedSystem.showBanner('🐻 恭喜融會貫通進階【狗熊哆嗦毛】！按 [Q] 鍵（手機點擊技能圖示）手動施放連續瞬移；被攻擊命中時仍有 30% 機率自動閃避！', 5000);
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
    this.dodgeCooldownTimer = DODGE_SKILL_COOLDOWN;

    if (isAdvanced) {
      player.performBearShake(this.ctx.activeColliders);
    } else {
      player.performFlashStep();
    }

    wantedSystem.showBanner(
      isAdvanced ? '🐻 施展【狗熊哆嗦毛】！連續瞬移神速規避攻擊！(CD 1s)' : '💨 施展【閃身步】！左右破空閃身規避！(CD 1s)',
      1600
    );
  };

  // 被動自動閃避 (升級獎勵，與主動技能分開)：已習得閃身步/狗熊哆嗦毛 (level >= 1) 時，被敵人攻擊命中瞬間
  // 有 AUTO_DODGE_CHANCE 機率自動施放對應等級的位移；使用獨立冷卻，不檢查也不消耗主動技能冷卻
  // 成功回傳 true，呼叫端應視為完全閃掉此次攻擊
  public readonly tryAutoDodge = (): boolean => {
    const { player, wantedSystem } = this.ctx;
    if (this.dodgeSkillLevel < 1 || this.autoDodgeCooldownTimer > 0) return false;
    if (player.isDead || player.isCinematicLocked || player.isDodging || player.hitCooldown > 0) return false;
    if (this.ctx.currentRidingBike || player.isRidingVehicle || player.isSwimming || player.knockdownTimer > 0) return false;
    if (Math.random() >= AUTO_DODGE_CHANCE) return false;
    this.autoDodgeCooldownTimer = AUTO_DODGE_COOLDOWN;
    const isAdvanced = this.dodgeSkillLevel === 2;
    // 突進斬衝刺中：判定閃避成功 (免傷、進入冷卻)，但不執行位移，避免中斷招式
    if (!player.isLunging) {
      if (isAdvanced) player.performBearShake(this.ctx.activeColliders);
      else player.performFlashStep();
    }
    wantedSystem.showBanner(
      isAdvanced ? '🐻 狗熊哆嗦毛自動發動！連續瞬移規避攻擊！' : '💨 閃身步自動發動！左右破空閃身規避！',
      1600
    );
    return true;
  };

  // 閃避成功提示 (技能等級決定招式名稱)
  public get isAdvancedDodge(): boolean {
    return this.dodgeSkillLevel === 2;
  }

  // 每幀：技能冷卻計時與 HUD 更新
  public updateSkillCooldown(delta: number) {
    if (this.autoDodgeCooldownTimer > 0) {
      this.autoDodgeCooldownTimer = Math.max(0, this.autoDodgeCooldownTimer - delta);
    }
    if (this.dodgeCooldownTimer > 0) {
      this.dodgeCooldownTimer = Math.max(0, this.dodgeCooldownTimer - delta);
    }
    this.ctx.hud.updateSkillHUD(this.dodgeSkillLevel, this.dodgeCooldownTimer, DODGE_SKILL_COOLDOWN, this.ctx.currentWorldType === 'DETENTION');
  }
}
