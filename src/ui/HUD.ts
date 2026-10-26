import * as THREE from 'three';
import { NPC } from '../entities/NPC';
import { Bicycle } from '../vehicles/Bicycle';

export interface CommissaryItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  healHp: number;
  restoreStamina: boolean;
  desc: string;
}

export const COMMISSARY_MENU: CommissaryItem[] = [
  { id: 'first-aid', name: '戰術急救止血繃帶', icon: '🩹', price: 25, healHp: 40, restoreStamina: false, desc: '防暴常備急救物資，快速止血穩固傷勢！(+40 HP)' },
  { id: 'glucose', name: '高能葡萄糖補給液', icon: '💉', price: 45, healHp: 80, restoreStamina: false, desc: '極速吸收，強效重傷回血！(+80 HP)' },
  { id: 'combat-ration', name: '軍規高熱量特訓乾糧', icon: '🥫', price: 35, healHp: 55, restoreStamina: true, desc: '高能壓縮乾糧，全面補足體能與精力！(+55 HP & 精力滿)' },
  { id: 'sport-water', name: '超能電解質運動水', icon: '⚡', price: 20, healHp: 25, restoreStamina: true, desc: '深層補充微量元素，精力全滿！(+25 HP & 精力滿)' },
  { id: 'iron-pill', name: '鐵血生肌大補丸', icon: '🛡️', price: 65, healHp: 110, restoreStamina: true, desc: '特訓所頂級秘方，體力大幅填滿！(+110 HP & 精力滿)' },
  { id: 'bento', name: '特訓高蛋白厚切牛排便當', icon: '🍱', price: 50, healHp: 65, restoreStamina: false, desc: '古早風味厚切肉排，香氣四溢大補血！(+65 HP)' },
  { id: 'chicken', name: '香脆豪大大雞排', icon: '🍗', price: 40, healHp: 40, restoreStamina: false, desc: '外皮酥脆多汁，下課特訓必吃！(+40 HP)' },
  { id: 'boba', name: '波霸珍珠奶茶', icon: '🧋', price: 30, healHp: 30, restoreStamina: true, desc: '微糖微冰，體力與精力雙重滿足！(+30 HP & 精力滿)' }
];

export interface MissionTrackerData {
  studentDefeated: number;
  hasNormalBat: boolean;
  teacherDefeated: number;
  dogDefeated: number;
  bikeDefeated: number;
  inspectorDefeated: number;
  hasSpecialBat: boolean;
  plantBossDefeated: boolean;
  peBossDefeated: boolean;
  trackRecordText: string;
  swimRecordText: string;
  basketballStreak: number;
  basketballRecord: number;
  hasRiddenBike: boolean;
  hasEscapedDog: boolean;
  hasWishedPond: boolean;
  hasTastedHotFood: boolean;
  dodgeSkillLevel: number;
}

export interface DetentionRadarData {
  isGateAOpen: boolean;
  isGateBOpen: boolean;
  isSouthGateOpen: boolean;
  hasKeycardA: boolean;
  hasKeycardB: boolean;
  hasMasterKeycard: boolean;
  keycardAPos: THREE.Vector3;
  keycardBPos: THREE.Vector3;
  masterKeycardPos: THREE.Vector3 | null;
  alertLevel: 'NORMAL' | 'CAUTION' | 'ALERT';
  alertTimer: number;
}

export class HUD {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private hpBar: HTMLElement | null;
  private hpNum: HTMLElement | null;
  private staminaBar: HTMLElement | null;
  private staminaNum: HTMLElement | null;
  private locationEl: HTMLElement | null;
  private actionPrompt: HTMLElement | null;
  private promptKey: HTMLElement | null;
  private promptText: HTMLElement | null;
  private pursuitVignetteEl: HTMLElement | null;
  private bgmBadgeEl: HTMLElement | null;
  private bgmIconEl: HTMLElement | null;
  private bgmTextEl: HTMLElement | null;
  private bgmToggleBtnEl: HTMLElement | null;
  private crosshairEl: HTMLElement | null;
  private cashTextEl: HTMLElement | null;
  private poisonVignetteEl: HTMLElement | null;
  private weatherBadgeEl: HTMLElement | null;
  private weatherTextEl: HTMLElement | null;
  public onWeatherToggle?: () => void;

  // Boss HUD
  private bossHudEl: HTMLElement | null;
  private bossHpTextEl: HTMLElement | null;
  private bossBarFillEl: HTMLElement | null;
  private bossNameTextEl: HTMLElement | null;
  private bossIconEl: HTMLElement | null;

  // Weapon HUD - 已整合至頂端任務看板與換武器功能
  // (保留介面屬性避免外部呼叫報錯)

  // Commissary Modal
  private commissaryModalEl: HTMLElement | null;
  private commissaryCashValEl: HTMLElement | null;
  private commissaryGridEl: HTMLElement | null;
  private commissaryCloseBtnEl: HTMLElement | null;
  public isCommissaryOpen: boolean = false;

  // 4F 羽球挑戰賽對話視窗
  private tennisModalEl: HTMLElement | null;
  private tennisCloseBtnEl: HTMLElement | null;
  private tennisStartBtnEl: HTMLElement | null;
  private tennisCancelBtnEl: HTMLElement | null;
  public isTennisDialogOpen: boolean = false;
  private onTennisStartCallback?: () => void;

  // 教學大樓 閃身步老師對話視窗
  private dodgeTeacherModalEl: HTMLElement | null;
  private dodgeCloseBtnEl: HTMLElement | null;
  private dodgeLearnBtnEl: HTMLButtonElement | null;
  private dodgeCancelBtnEl: HTMLElement | null;
  private dodgeDialogTextEl: HTMLElement | null;
  private dodgeCashValEl: HTMLElement | null;
  public isDodgeDialogOpen: boolean = false;
  private onDodgeLearnCallback?: (targetLevel: number) => void;

  // 技能 HUD 展示槽
  private skillHudCardEl: HTMLElement | null;
  private skillIconEl: HTMLElement | null;
  private skillNameEl: HTMLElement | null;
  private skillDescEl: HTMLElement | null;
  private skillCdNumberEl: HTMLElement | null;
  private skillCooldownOverlayEl: HTMLElement | null;

  // 任務看板身法項目
  private qDodgeItem: HTMLElement | null;
  private qDodgeDesc: HTMLElement | null;
  private qDodgeStatus: HTMLElement | null;

  // 雙世界切換與空間傳送 Modal
  private worldBadgeEl: HTMLElement | null;
  private worldTextEl: HTMLElement | null;
  public onWorldToggle?: () => void;
  private worldModalEl: HTMLElement | null;
  private worldModalCloseBtnEl: HTMLElement | null;
  private modalBtnCampusEl: HTMLElement | null;
  private modalBtnDetentionEl: HTMLElement | null;
  private modalCurrentCampusEl: HTMLElement | null;
  private modalCurrentDetentionEl: HTMLElement | null;
  public isWorldModalOpen: boolean = false;
  private onWorldSwitchCallback?: (targetWorld: 'CAMPUS' | 'DETENTION') => void;

  constructor() {
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.hpBar = document.getElementById('hp-bar');
    this.hpNum = document.getElementById('hp-num');
    this.staminaBar = document.getElementById('stamina-bar');
    this.staminaNum = document.getElementById('stamina-num');
    this.locationEl = document.getElementById('current-zone');
    this.actionPrompt = document.getElementById('action-prompt');
    this.promptKey = document.getElementById('prompt-key');
    this.promptText = document.getElementById('prompt-text');
    this.pursuitVignetteEl = document.getElementById('pursuit-vignette');
    this.bgmBadgeEl = document.getElementById('bgm-badge');
    this.bgmIconEl = document.getElementById('bgm-icon');
    this.bgmTextEl = document.getElementById('bgm-text');
    this.bgmToggleBtnEl = document.getElementById('bgm-toggle-btn');
    this.crosshairEl = document.getElementById('crosshair');
    this.cashTextEl = document.getElementById('cash-text');
    this.poisonVignetteEl = document.getElementById('poison-vignette');
    this.weatherBadgeEl = document.getElementById('weather-badge');
    this.weatherTextEl = document.getElementById('weather-text');

    if (this.weatherBadgeEl) {
      this.weatherBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onWeatherToggle) this.onWeatherToggle();
      });
    }

    this.worldBadgeEl = document.getElementById('world-badge');
    this.worldTextEl = document.getElementById('world-text');
    if (this.worldBadgeEl) {
      this.worldBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onWorldToggle) this.onWorldToggle();
      });
    }

    this.worldModalEl = document.getElementById('world-modal');
    this.worldModalCloseBtnEl = document.getElementById('world-modal-close-btn');
    this.modalBtnCampusEl = document.getElementById('modal-btn-campus');
    this.modalBtnDetentionEl = document.getElementById('modal-btn-detention');
    this.modalCurrentCampusEl = document.getElementById('modal-current-campus');
    this.modalCurrentDetentionEl = document.getElementById('modal-current-detention');

    if (this.worldModalCloseBtnEl) {
      this.worldModalCloseBtnEl.addEventListener('click', () => this.closeWorldModal());
    }
    if (this.modalBtnCampusEl) {
      this.modalBtnCampusEl.addEventListener('click', () => {
        if (this.onWorldSwitchCallback) this.onWorldSwitchCallback('CAMPUS');
        this.closeWorldModal();
      });
    }
    if (this.modalBtnDetentionEl) {
      this.modalBtnDetentionEl.addEventListener('click', () => {
        if (this.onWorldSwitchCallback) this.onWorldSwitchCallback('DETENTION');
        this.closeWorldModal();
      });
    }

    this.bossHudEl = document.getElementById('boss-hud');
    this.bossHpTextEl = document.getElementById('boss-hp-text');
    this.bossBarFillEl = document.getElementById('boss-bar-fill');
    this.bossNameTextEl = document.getElementById('boss-name-text');
    this.bossIconEl = document.getElementById('boss-icon-el');

    this.commissaryModalEl = document.getElementById('commissary-modal');
    this.commissaryCashValEl = document.getElementById('commissary-cash-val');
    this.commissaryGridEl = document.getElementById('commissary-grid');
    this.commissaryCloseBtnEl = document.getElementById('commissary-close-btn');

    if (this.commissaryCloseBtnEl) {
      this.commissaryCloseBtnEl.addEventListener('click', () => {
        this.closeCommissary();
      });
    }

    this.tennisModalEl = document.getElementById('tennis-modal');
    this.tennisCloseBtnEl = document.getElementById('tennis-dialog-close-btn');
    this.tennisStartBtnEl = document.getElementById('tennis-btn-start');
    this.tennisCancelBtnEl = document.getElementById('tennis-btn-cancel');

    if (this.tennisCloseBtnEl) {
      this.tennisCloseBtnEl.addEventListener('click', () => {
        this.closeTennisDialog();
      });
    }
    if (this.tennisCancelBtnEl) {
      this.tennisCancelBtnEl.addEventListener('click', () => {
        this.closeTennisDialog();
      });
    }
    if (this.tennisStartBtnEl) {
      this.tennisStartBtnEl.addEventListener('click', () => {
        if (this.onTennisStartCallback) {
          const cb = this.onTennisStartCallback;
          this.closeTennisDialog();
          cb();
        }
      });
    }

    // 教學大樓 閃身步老師對話元素
    this.dodgeTeacherModalEl = document.getElementById('dodge-teacher-modal');
    this.dodgeCloseBtnEl = document.getElementById('dodge-dialog-close-btn');
    this.dodgeLearnBtnEl = document.getElementById('dodge-btn-learn') as HTMLButtonElement | null;
    this.dodgeCancelBtnEl = document.getElementById('dodge-btn-cancel');
    this.dodgeDialogTextEl = document.getElementById('dodge-dialog-text');
    this.dodgeCashValEl = document.getElementById('dodge-dialog-cash-val');

    if (this.dodgeCloseBtnEl) {
      this.dodgeCloseBtnEl.addEventListener('click', () => {
        this.closeDodgeDialog();
      });
    }
    if (this.dodgeCancelBtnEl) {
      this.dodgeCancelBtnEl.addEventListener('click', () => {
        this.closeDodgeDialog();
      });
    }

    // 技能 HUD 卡片元素
    this.skillHudCardEl = document.getElementById('skill-hud-card');
    this.skillIconEl = document.getElementById('skill-icon');
    this.skillNameEl = document.getElementById('skill-name');
    this.skillDescEl = document.getElementById('skill-desc-text');
    this.skillCdNumberEl = document.getElementById('skill-cd-number');
    this.skillCooldownOverlayEl = document.getElementById('skill-cooldown-overlay');

    this.shotMeterEl = document.getElementById('shot-meter');
    this.shotSweetspotEl = document.getElementById('shot-sweetspot');
    this.shotFillEl = document.getElementById('shot-fill');
    this.shotNeedleEl = document.getElementById('shot-needle');
    this.shotFeedbackEl = document.getElementById('shot-feedback');

    // 頂部專屬任務介面 (Mission Tracker Panel)
    this.questTrackerPanel = document.getElementById('quest-tracker-panel');
    this.questTrackerToggleBtn = document.getElementById('quest-tracker-toggle-btn');
    this.questToggleIndicator = document.getElementById('quest-toggle-indicator');
    this.questListContent = document.getElementById('quest-list-content');
    this.qTotalProgress = document.getElementById('q-total-progress');
    this.qTotalBar = document.getElementById('q-total-bar');

    // 12 項任務項目與數值元素 (含普通球棒與神兵球棒解鎖任務)
    this.qBatItem = document.getElementById('q-bat-item');
    this.qBatProgress = document.getElementById('q-bat-progress');
    this.qBatStatus = document.getElementById('q-bat-status');

    this.qSpecialItem = document.getElementById('q-special-item');
    this.qTeacherProg = document.getElementById('q-teacher-prog');
    this.qDogProg = document.getElementById('q-dog-prog');
    this.qBikeProg = document.getElementById('q-bike-prog');
    this.qSpecialStatus = document.getElementById('q-special-status');

    this.qPeItem = document.getElementById('q-pe-item');
    this.qPeStatus = document.getElementById('q-pe-status');

    this.qPlantItem = document.getElementById('q-plant-item');
    this.qPlantStatus = document.getElementById('q-plant-status');

    this.qInspectorItem = document.getElementById('q-inspector-item');
    this.qInspectorProg = document.getElementById('q-inspector-prog');
    this.qInspectorStatus = document.getElementById('q-inspector-status');

    this.qBasketballItem = document.getElementById('q-basketball-item');
    this.qBasketStreak = document.getElementById('q-basket-streak');
    this.qBasketballStatus = document.getElementById('q-basketball-status');

    this.qTrackItem = document.getElementById('q-track-item');
    this.qTrackTime = document.getElementById('q-track-time');
    this.qTrackStatus = document.getElementById('q-track-status');

    this.qSwimItem = document.getElementById('q-swim-item');
    this.qSwimTime = document.getElementById('q-swim-time');
    this.qSwimStatus = document.getElementById('q-swim-status');

    this.qBikeItem = document.getElementById('q-bike-item');
    this.qBikeStatus = document.getElementById('q-bike-status');

    this.qDogItem = document.getElementById('q-dog-item');
    this.qDogStatus = document.getElementById('q-dog-status');

    this.qPondItem = document.getElementById('q-pond-item');
    this.qPondStatus = document.getElementById('q-pond-status');

    this.qHotfoodItem = document.getElementById('q-hotfood-item');
    this.qHotfoodStatus = document.getElementById('q-hotfood-status');

    this.qDodgeItem = document.getElementById('q-dodge-item');
    this.qDodgeDesc = document.getElementById('q-dodge-desc');
    this.qDodgeStatus = document.getElementById('q-dodge-status');

    if (this.questTrackerToggleBtn) {
      this.questTrackerToggleBtn.addEventListener('click', () => {
        this.toggleQuestTracker();
      });
    }

    // 分類 Tab 切換監聽 (全部 / 戰鬥 / 競技 / 探索)
    const tabBtns = document.querySelectorAll<HTMLButtonElement>('.quest-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const targetCategory = btn.getAttribute('data-tab');
        const groups = document.querySelectorAll<HTMLElement>('.quest-category-group');
        groups.forEach((group) => {
          if (!targetCategory || targetCategory === 'all') {
            group.classList.remove('hidden');
          } else {
            if (group.getAttribute('data-category') === targetCategory) {
              group.classList.remove('hidden');
            } else {
              group.classList.add('hidden');
            }
          }
        });
      });
    });

    // 行動裝置或窄螢幕預設將任務看板收合，維持乾淨清爽的開放視野
    const isMobileDevice = window.innerWidth <= 900 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isMobileDevice) {
      this.toggleQuestTracker(false);
    }
  }

  // 頂部任務介面屬性
  private questTrackerPanel: HTMLElement | null;
  private questTrackerToggleBtn: HTMLElement | null;
  private questToggleIndicator: HTMLElement | null;
  private questListContent: HTMLElement | null;
  private qTotalProgress: HTMLElement | null;
  private qTotalBar: HTMLElement | null;

  // 12 項任務 DOM 參照
  private qBatItem: HTMLElement | null;
  private qBatProgress: HTMLElement | null;
  private qBatStatus: HTMLElement | null;

  private qSpecialItem: HTMLElement | null;
  private qTeacherProg: HTMLElement | null;
  private qDogProg: HTMLElement | null;
  private qBikeProg: HTMLElement | null;
  private qSpecialStatus: HTMLElement | null;

  private qPeItem: HTMLElement | null;
  private qPeStatus: HTMLElement | null;

  private qPlantItem: HTMLElement | null;
  private qPlantStatus: HTMLElement | null;

  private qInspectorItem: HTMLElement | null;
  private qInspectorProg: HTMLElement | null;
  private qInspectorStatus: HTMLElement | null;

  private qBasketballItem: HTMLElement | null;
  private qBasketStreak: HTMLElement | null;
  private qBasketballStatus: HTMLElement | null;

  private qTrackItem: HTMLElement | null;
  private qTrackTime: HTMLElement | null;
  private qTrackStatus: HTMLElement | null;

  private qSwimItem: HTMLElement | null;
  private qSwimTime: HTMLElement | null;
  private qSwimStatus: HTMLElement | null;

  private qBikeItem: HTMLElement | null;
  private qBikeStatus: HTMLElement | null;

  private qDogItem: HTMLElement | null;
  private qDogStatus: HTMLElement | null;

  private qPondItem: HTMLElement | null;
  private qPondStatus: HTMLElement | null;

  private qHotfoodItem: HTMLElement | null;
  private qHotfoodStatus: HTMLElement | null;

  private isQuestTrackerExpanded: boolean = true;

  // 效能優化節流與髒檢查 (Perf 6)
  private minimapDeltaAccumulator: number = 0;
  private lastMinimapTime: number = 0;
  private lastCash: number = -1;
  private lastMissionData: MissionTrackerData | null = null;
  private lastHp: number = -1;
  private lastStamina: number = -1;
  private lastLocationZone: string = '';
  private lastBeingChased: boolean | null = null;
  private lastHighDanger: boolean | null = null;
  private lastPoisonActive: boolean | null = null;

  private shotMeterEl: HTMLElement | null;
  private shotSweetspotEl: HTMLElement | null;
  private shotFillEl: HTMLElement | null;
  private shotNeedleEl: HTMLElement | null;
  private shotFeedbackEl: HTMLElement | null;

  public setBasketballAiming(isAiming: boolean) {
    if (this.crosshairEl) {
      if (isAiming) {
        this.crosshairEl.classList.add('aiming-basketball');
      } else {
        this.crosshairEl.classList.remove('aiming-basketball');
      }
    }
    if (!isAiming) {
      this.hideShotMeter();
    }
  }

  public showShotMeter(sweetMin: number = 0.68, sweetMax: number = 0.86) {
    if (this.shotMeterEl && this.shotSweetspotEl) {
      this.shotMeterEl.style.display = 'block';
      this.shotSweetspotEl.style.left = `${sweetMin * 100}%`;
      this.shotSweetspotEl.style.width = `${(sweetMax - sweetMin) * 100}%`;
      this.updateShotMeter(0);
      if (this.shotFeedbackEl) {
        this.shotFeedbackEl.style.display = 'none';
        this.shotFeedbackEl.className = 'shot-meter-feedback';
      }
    }
  }

  public updateShotMeter(ratio: number) {
    const clamped = Math.max(0, Math.min(1.0, ratio));
    if (this.shotFillEl) this.shotFillEl.style.width = `${clamped * 100}%`;
    if (this.shotNeedleEl) this.shotNeedleEl.style.left = `${clamped * 100}%`;
  }

  public showShotFeedback(result: 'PERFECT' | 'GOOD' | 'LATE' | 'EARLY') {
    if (this.shotFeedbackEl) {
      this.shotFeedbackEl.className = 'shot-meter-feedback';
      if (result === 'PERFECT') {
        this.shotFeedbackEl.textContent = '🔥 PERFECT! 完美空心！';
        this.shotFeedbackEl.classList.add('perfect');
      } else if (result === 'GOOD') {
        this.shotFeedbackEl.textContent = '✨ GOOD! 良好出手！';
        this.shotFeedbackEl.classList.add('good');
      } else if (result === 'LATE') {
        this.shotFeedbackEl.textContent = '❌ LATE! 出手太慢！';
        this.shotFeedbackEl.classList.add('bad');
      } else {
        this.shotFeedbackEl.textContent = '❌ EARLY! 蓄力不足！';
        this.shotFeedbackEl.classList.add('bad');
      }
      setTimeout(() => {
        this.hideShotMeter();
      }, 1000);
    } else {
      this.hideShotMeter();
    }
  }

  public hideShotMeter() {
    if (this.shotMeterEl) {
      this.shotMeterEl.style.display = 'none';
    }
  }

  public setupBGMClick(onToggle: () => void) {
    if (this.bgmBadgeEl) {
      this.bgmBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggle();
      });
    }
  }

  public updateBGMStatus(mode: 'EXPLORE' | 'PURSUIT', isMuted: boolean) {
    if (!this.bgmBadgeEl || !this.bgmIconEl || !this.bgmTextEl || !this.bgmToggleBtnEl) return;

    if (isMuted) {
      this.bgmBadgeEl.className = 'bgm-badge muted';
      this.bgmIconEl.textContent = '🔇';
      this.bgmTextEl.textContent = 'BGM: 靜音';
      this.bgmToggleBtnEl.textContent = '[關]';
    } else if (mode === 'PURSUIT') {
      this.bgmBadgeEl.className = 'bgm-badge pursuit';
      this.bgmIconEl.textContent = '🚨';
      this.bgmTextEl.textContent = 'BGM: 通緝追逐!';
      this.bgmToggleBtnEl.textContent = '[開]';
    } else {
      this.bgmBadgeEl.className = 'bgm-badge';
      this.bgmIconEl.textContent = '🎵';
      this.bgmTextEl.textContent = 'BGM: 校園漫步';
      this.bgmToggleBtnEl.textContent = '[開]';
    }
  }

  public updateWeatherHUD(badgeText: string) {
    if (this.weatherTextEl && this.weatherTextEl.textContent !== badgeText) {
      this.weatherTextEl.textContent = badgeText;
    }
  }

  public isMobile(): boolean {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 900 ||
      document.body.classList.contains('touch-mode-active')
    );
  }

  public showPrompt(key: string, text: string) {
    if (this.actionPrompt && this.promptKey && this.promptText) {
      const isMobile = this.isMobile();
      let displayKey = key;
      let displayText = text;

      if (isMobile) {
        if (displayKey.trim().toUpperCase() === 'E' || displayKey.trim().toUpperCase() === '[E]') {
          displayKey = '[動]';
        }
        displayText = displayText
          .replace(/\[E\]/gi, '[動]')
          .replace(/\(E\)/gi, '[動]')
          .replace(/按\s*E\b/gi, '按 [動]');
      }

      this.promptKey.textContent = displayKey;
      this.promptText.textContent = displayText;
      this.actionPrompt.style.display = 'block';
    }
  }

  public setCash(cash: number) {
    if (this.lastCash === cash) return;
    this.lastCash = cash;

    if (this.cashTextEl) {
      this.cashTextEl.textContent = `NT$ ${cash}`;
    }
    if (this.commissaryCashValEl) {
      this.commissaryCashValEl.textContent = `NT$ ${cash}`;
    }
  }

  // Boss 血條顯示與更新 (支援變異食人花王與體育老師林教頭)
  public setBossHealth(currentHp: number, maxHp: number, visible: boolean, bossName?: string, bossIcon?: string) {
    if (!this.bossHudEl || !this.bossHpTextEl || !this.bossBarFillEl) return;

    if (!visible || currentHp <= 0) {
      this.bossHudEl.style.display = 'none';
      return;
    }

    this.bossHudEl.style.display = 'block';
    if (this.bossNameTextEl && bossName) {
      this.bossNameTextEl.textContent = bossName;
    }
    if (this.bossIconEl && bossIcon) {
      this.bossIconEl.textContent = bossIcon;
    }
    const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
    this.bossBarFillEl.style.width = `${pct}%`;
    this.bossHpTextEl.textContent = `${Math.ceil(currentHp)} / ${maxHp}`;
  }

  // 武器 HUD 狀態更新 (依需求已移除右上角武器欄，狀態與進度統一由左側任務看板呈現)
  public updateWeaponHUD(
    _currentWeapon: 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT',
    _hasNormal: boolean,
    _hasSpecial: boolean,
    _studentDefeated: number,
    _teacherDefeated: number,
    _dogDefeated: number,
    _bikeDefeated: number
  ) {
    // 安全保留空函式，避免呼叫端報錯
  }

  // 切換任務介面收合/展開
  public toggleQuestTracker(expand?: boolean) {
    if (expand !== undefined) {
      this.isQuestTrackerExpanded = expand;
    } else {
      this.isQuestTrackerExpanded = !this.isQuestTrackerExpanded;
    }

    if (this.questTrackerPanel) {
      if (this.isQuestTrackerExpanded) {
        this.questTrackerPanel.classList.remove('collapsed');
      } else {
        this.questTrackerPanel.classList.add('collapsed');
      }
    }

    if (this.questListContent) {
      if (this.isQuestTrackerExpanded) {
        this.questListContent.classList.remove('collapsed');
      } else {
        this.questListContent.classList.add('collapsed');
      }
    }

    if (this.questToggleIndicator) {
      this.questToggleIndicator.textContent = this.isQuestTrackerExpanded ? '▲' : '▼';
    }
  }

  // 即時更新頂端任務看板資訊 (進度、達成狀態、Boss狀態、運動紀錄與探索，含髒檢查 Dirty check)
  public updateMissionTracker(data: MissionTrackerData) {
    const campusWrapper = document.getElementById('campus-quest-wrapper');
    const detentionWrapper = document.getElementById('detention-quest-wrapper');
    if (campusWrapper && detentionWrapper && campusWrapper.style.display === 'none') {
      campusWrapper.style.display = 'block';
      detentionWrapper.style.display = 'none';
    }

    const last = this.lastMissionData;
    if (
      last &&
      last.studentDefeated === data.studentDefeated &&
      last.hasNormalBat === data.hasNormalBat &&
      last.teacherDefeated === data.teacherDefeated &&
      last.dogDefeated === data.dogDefeated &&
      last.bikeDefeated === data.bikeDefeated &&
      last.inspectorDefeated === data.inspectorDefeated &&
      last.hasSpecialBat === data.hasSpecialBat &&
      last.plantBossDefeated === data.plantBossDefeated &&
      last.peBossDefeated === data.peBossDefeated &&
      last.trackRecordText === data.trackRecordText &&
      last.swimRecordText === data.swimRecordText &&
      last.basketballStreak === data.basketballStreak &&
      last.basketballRecord === data.basketballRecord &&
      last.hasRiddenBike === data.hasRiddenBike &&
      last.hasEscapedDog === data.hasEscapedDog &&
      last.hasWishedPond === data.hasWishedPond &&
      last.hasTastedHotFood === data.hasTastedHotFood
    ) {
      return;
    }
    this.lastMissionData = { ...data };

    let completedCount = 0;

    // 1. 普通球棒 / 擊敗普通同學 (5位)
    const batDone = data.hasNormalBat || data.studentDefeated >= 5;
    if (batDone) completedCount++;
    if (this.qBatItem) {
      if (batDone) this.qBatItem.classList.add('completed');
      else this.qBatItem.classList.remove('completed');
    }
    if (this.qBatProgress) {
      this.qBatProgress.textContent = `${Math.min(5, data.studentDefeated)}/5`;
    }
    if (this.qBatStatus) {
      if (batDone) {
        this.qBatStatus.textContent = '已達成 ✅';
        this.qBatStatus.className = 'q-status done';
      } else {
        this.qBatStatus.textContent = '進行中';
        this.qBatStatus.className = 'q-status';
      }
    }

    // 2. 特殊神兵球棒 / 校園霸王 (生教 x1, 校犬 x1, 單車巡邏 x5)
    const specialDone = data.hasSpecialBat || (data.teacherDefeated >= 1 && data.dogDefeated >= 1 && data.bikeDefeated >= 5);
    if (specialDone) completedCount++;
    if (this.qSpecialItem) {
      if (specialDone) this.qSpecialItem.classList.add('completed');
      else this.qSpecialItem.classList.remove('completed');
    }
    if (this.qTeacherProg) {
      this.qTeacherProg.textContent = `${Math.min(1, data.teacherDefeated)}/1`;
    }
    if (this.qDogProg) {
      this.qDogProg.textContent = `${Math.min(1, data.dogDefeated)}/1`;
    }
    if (this.qBikeProg) {
      this.qBikeProg.textContent = `${Math.min(5, data.bikeDefeated)}/5`;
    }
    if (this.qSpecialStatus) {
      if (specialDone) {
        this.qSpecialStatus.textContent = '已達成 ✅';
        this.qSpecialStatus.className = 'q-status done';
      } else {
        this.qSpecialStatus.textContent = '進行中';
        this.qSpecialStatus.className = 'q-status';
      }
    }

    // 2. 挑戰羽球大如老師
    const peDone = data.peBossDefeated;
    if (peDone) completedCount++;
    if (this.qPeItem) {
      if (peDone) this.qPeItem.classList.add('completed');
      else this.qPeItem.classList.remove('completed');
    }
    if (this.qPeStatus) {
      if (peDone) {
        this.qPeStatus.textContent = '已達成 ✅';
        this.qPeStatus.className = 'q-status done';
      } else {
        this.qPeStatus.textContent = '進行中';
        this.qPeStatus.className = 'q-status';
      }
    }

    // 3. 挑戰溫室食人花 Boss
    const plantDone = data.plantBossDefeated;
    if (plantDone) completedCount++;
    if (this.qPlantItem) {
      if (plantDone) this.qPlantItem.classList.add('completed');
      else this.qPlantItem.classList.remove('completed');
    }
    if (this.qPlantStatus) {
      if (plantDone) {
        this.qPlantStatus.textContent = '已達成 ✅';
        this.qPlantStatus.className = 'q-status done';
      } else {
        this.qPlantStatus.textContent = '進行中';
        this.qPlantStatus.className = 'q-status';
      }
    }

    // 4. 擊倒教官與步巡隊
    const inspectorDone = data.inspectorDefeated > 0;
    if (inspectorDone) completedCount++;
    if (this.qInspectorItem) {
      if (inspectorDone) this.qInspectorItem.classList.add('completed');
      else this.qInspectorItem.classList.remove('completed');
    }
    if (this.qInspectorProg) {
      this.qInspectorProg.textContent = `${Math.min(1, data.inspectorDefeated)}/1`;
    }
    if (this.qInspectorStatus) {
      if (inspectorDone) {
        this.qInspectorStatus.textContent = '已達成 ✅';
        this.qInspectorStatus.className = 'q-status done';
      } else {
        this.qInspectorStatus.textContent = '進行中';
        this.qInspectorStatus.className = 'q-status';
      }
    }

    // 5. 經典三分球投籃挑戰
    const bballDone = data.basketballRecord > 0 || data.basketballStreak > 0;
    if (bballDone) completedCount++;
    if (this.qBasketballItem) {
      if (bballDone) this.qBasketballItem.classList.add('completed');
      else this.qBasketballItem.classList.remove('completed');
    }
    if (this.qBasketStreak) {
      const displayScore = Math.max(data.basketballStreak, data.basketballRecord);
      this.qBasketStreak.textContent = `${displayScore}顆`;
    }
    if (this.qBasketballStatus) {
      if (bballDone) {
        this.qBasketballStatus.textContent = '已達成 ✅';
        this.qBasketballStatus.className = 'q-status done';
      } else {
        this.qBasketballStatus.textContent = '進行中';
        this.qBasketballStatus.className = 'q-status';
      }
    }

    // 6. 操場跑道 400m 競速
    const trackDone = Boolean(data.trackRecordText && data.trackRecordText !== '未完成');
    if (trackDone) completedCount++;
    if (this.qTrackItem) {
      if (trackDone) this.qTrackItem.classList.add('completed');
      else this.qTrackItem.classList.remove('completed');
    }
    if (this.qTrackTime) {
      this.qTrackTime.textContent = data.trackRecordText;
    }
    if (this.qTrackStatus) {
      if (trackDone) {
        this.qTrackStatus.textContent = '已達成 ✅';
        this.qTrackStatus.className = 'q-status done';
      } else {
        this.qTrackStatus.textContent = '進行中';
        this.qTrackStatus.className = 'q-status';
      }
    }

    // 7. 25m 水上競速挑戰
    const swimDone = Boolean(data.swimRecordText && data.swimRecordText !== '未完成');
    if (swimDone) completedCount++;
    if (this.qSwimItem) {
      if (swimDone) this.qSwimItem.classList.add('completed');
      else this.qSwimItem.classList.remove('completed');
    }
    if (this.qSwimTime) {
      this.qSwimTime.textContent = data.swimRecordText;
    }
    if (this.qSwimStatus) {
      if (swimDone) {
        this.qSwimStatus.textContent = '已達成 ✅';
        this.qSwimStatus.className = 'q-status done';
      } else {
        this.qSwimStatus.textContent = '進行中';
        this.qSwimStatus.className = 'q-status';
      }
    }

    // 8. 自由騎乘校園自行車
    const bikeDone = data.hasRiddenBike;
    if (bikeDone) completedCount++;
    if (this.qBikeItem) {
      if (bikeDone) this.qBikeItem.classList.add('completed');
      else this.qBikeItem.classList.remove('completed');
    }
    if (this.qBikeStatus) {
      if (bikeDone) {
        this.qBikeStatus.textContent = '已達成 ✅';
        this.qBikeStatus.className = 'q-status done';
      } else {
        this.qBikeStatus.textContent = '進行中';
        this.qBikeStatus.className = 'q-status';
      }
    }

    // 9. 擺脫校犬柴柴追捕
    const dogDone = data.hasEscapedDog;
    if (dogDone) completedCount++;
    if (this.qDogItem) {
      if (dogDone) this.qDogItem.classList.add('completed');
      else this.qDogItem.classList.remove('completed');
    }
    if (this.qDogStatus) {
      if (dogDone) {
        this.qDogStatus.textContent = '已達成 ✅';
        this.qDogStatus.className = 'q-status done';
      } else {
        this.qDogStatus.textContent = '進行中';
        this.qDogStatus.className = 'q-status';
      }
    }

    // 10. 生態池許願池投幣
    const pondDone = data.hasWishedPond;
    if (pondDone) completedCount++;
    if (this.qPondItem) {
      if (pondDone) this.qPondItem.classList.add('completed');
      else this.qPondItem.classList.remove('completed');
    }
    if (this.qPondStatus) {
      if (pondDone) {
        this.qPondStatus.textContent = '已達成 ✅';
        this.qPondStatus.className = 'q-status done';
      } else {
        this.qPondStatus.textContent = '進行中';
        this.qPondStatus.className = 'q-status';
      }
    }

    // 11. 天天合作社品嚐熱食
    const hotfoodDone = data.hasTastedHotFood;
    if (hotfoodDone) completedCount++;
    if (this.qHotfoodItem) {
      if (hotfoodDone) this.qHotfoodItem.classList.add('completed');
      else this.qHotfoodItem.classList.remove('completed');
    }
    if (this.qHotfoodStatus) {
      if (hotfoodDone) {
        this.qHotfoodStatus.textContent = '已達成 ✅';
        this.qHotfoodStatus.className = 'q-status done';
      } else {
        this.qHotfoodStatus.textContent = '進行中';
        this.qHotfoodStatus.className = 'q-status';
      }
    }

    // 12. 獨門技能修煉 (閃身步 / 狗熊哆嗦毛)
    const dodgeLvl = data.dodgeSkillLevel || 0;
    const dodgeDone = dodgeLvl >= 1;
    if (dodgeDone) completedCount++;
    if (this.qDodgeItem) {
      if (dodgeDone) this.qDodgeItem.classList.add('completed');
      else this.qDodgeItem.classList.remove('completed');
    }
    if (this.qDodgeDesc) {
      if (dodgeLvl === 0) this.qDodgeDesc.textContent = '尋訪教學大樓「閃身步老師」學習技能【閃身步】 (0/2)';
      else if (dodgeLvl === 1) this.qDodgeDesc.textContent = '已習得【閃身步】(冷卻5s)，可進階狗熊哆嗦毛 (1/2)';
      else this.qDodgeDesc.textContent = '已融會貫通【狗熊哆嗦毛】(冷卻2s，完全精通) (2/2)';
    }
    if (this.qDodgeStatus) {
      if (dodgeLvl === 0) {
        this.qDodgeStatus.textContent = '未習得';
        this.qDodgeStatus.className = 'q-status';
      } else if (dodgeLvl === 1) {
        this.qDodgeStatus.textContent = '閃身步 ✅';
        this.qDodgeStatus.className = 'q-status done';
      } else {
        this.qDodgeStatus.textContent = '大成 🌟';
        this.qDodgeStatus.className = 'q-status done';
      }
    }

    // 更新總進度與進度條
    if (this.qTotalProgress) {
      this.qTotalProgress.textContent = `${completedCount}/13`;
    }
    if (this.qTotalBar) {
      const totalPct = Math.round((completedCount / 13) * 100);
      this.qTotalBar.style.width = `${totalPct}%`;
    }
    if (this.qTotalBar) {
      const pct = Math.min(100, Math.round((completedCount / 12) * 100));
      this.qTotalBar.style.width = `${pct}%`;
    }
  }

  // 合作社 (熱食補血部) 彈出式選單
  public openCommissary(playerCash: number, onBuyItem: (item: CommissaryItem) => void) {
    if (!this.commissaryModalEl || !this.commissaryGridEl || !this.commissaryCashValEl) return;

    this.isCommissaryOpen = true;
    this.commissaryCashValEl.textContent = `NT$ ${playerCash}`;
    this.commissaryGridEl.innerHTML = '';

    COMMISSARY_MENU.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'food-card';

      const info = document.createElement('div');
      info.className = 'food-info';

      const name = document.createElement('div');
      name.className = 'food-name';
      name.textContent = `${item.icon} ${item.name}`;

      const effect = document.createElement('div');
      effect.className = 'food-effect';
      effect.textContent = item.restoreStamina
        ? `💚 +${item.healHp} HP & ⚡ 精力全滿`
        : `💚 +${item.healHp} HP 體力`;

      const price = document.createElement('div');
      price.className = 'food-price';
      price.textContent = `NT$ ${item.price}`;

      info.appendChild(name);
      info.appendChild(effect);
      info.appendChild(price);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'food-buy-btn';
      buyBtn.textContent = '購買品嚐';
      if (playerCash < item.price) {
        buyBtn.disabled = true;
        buyBtn.textContent = '餘額不足';
      } else {
        buyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onBuyItem(item);
        });
      }

      card.appendChild(info);
      card.appendChild(buyBtn);
      this.commissaryGridEl!.appendChild(card);
    });

    this.commissaryModalEl.style.display = 'flex';
  }

  public closeCommissary() {
    if (this.commissaryModalEl) {
      this.commissaryModalEl.style.display = 'none';
      this.isCommissaryOpen = false;
    }
  }

  public openTennisDialog(onStart: () => void) {
    if (!this.tennisModalEl) return;
    this.isTennisDialogOpen = true;
    this.onTennisStartCallback = onStart;
    if (this.tennisStartBtnEl) {
      const isMobile = this.isMobile();
      this.tennisStartBtnEl.textContent = isMobile ? '🏸 開始比賽 [動]' : '🏸 開始比賽 (E)';
    }
    if (this.tennisCancelBtnEl) {
      const isMobile = this.isMobile();
      this.tennisCancelBtnEl.textContent = isMobile ? '稍後再來' : '稍後再來 (Esc)';
    }
    this.tennisModalEl.style.display = 'flex';
  }

  public closeTennisDialog() {
    if (this.tennisModalEl) {
      this.tennisModalEl.style.display = 'none';
      this.isTennisDialogOpen = false;
      this.onTennisStartCallback = undefined;
    }
  }

  // 閃身步老師 (教學大樓身法教練) 對話視窗控制
  public openDodgeDialog(cash: number, skillLevel: number, onLearn: (targetLevel: number) => void) {
    if (!this.dodgeTeacherModalEl) return;
    this.isDodgeDialogOpen = true;
    this.onDodgeLearnCallback = onLearn;

    if (this.dodgeCashValEl) {
      this.dodgeCashValEl.textContent = `NT$ ${cash}`;
    }

    const isMobile = this.isMobile();
    if (this.dodgeCancelBtnEl) {
      this.dodgeCancelBtnEl.textContent = isMobile ? '稍後再來' : '稍後再來 (Esc)';
    }

    if (!this.dodgeLearnBtnEl || !this.dodgeDialogTextEl) return;

    if (skillLevel === 0) {
      // 學習閃身步 (1000 元)
      this.dodgeDialogTextEl.textContent =
        '閃身步老師：「同學，看你腳步浮躁，在校園裡橫衝直撞很容易吃虧！老夫傳授你入門絕技『閃身步』，施展時身輕如燕、規避敵人一切攻擊！（冷卻時間 5 秒，學費 NT$ 1000）」';
      if (cash >= 1000) {
        this.dodgeLearnBtnEl.disabled = false;
        this.dodgeLearnBtnEl.textContent = isMobile ? '🥋 學習【閃身步】($1000) [動]' : '🥋 學習【閃身步】(NT$ 1000) (E)';
        this.dodgeLearnBtnEl.onclick = () => {
          this.closeDodgeDialog();
          onLearn(1);
        };
      } else {
        this.dodgeLearnBtnEl.disabled = true;
        this.dodgeLearnBtnEl.textContent = `學費不足 (需 NT$ 1000，目前 NT$ ${cash})`;
        this.dodgeLearnBtnEl.onclick = null;
      }
    } else if (skillLevel === 1) {
      // 學習狗熊哆嗦毛 (2000 元，前置條件：已學會閃身步)
      this.dodgeDialogTextEl.textContent =
        '閃身步老師：「好徒兒！你已精通基礎『閃身步』。老夫這裡還有更精妙的至高真傳——進階版『狗熊哆嗦毛』！施展時如靈熊抖擻毫毛，無影無形，冷卻時間大幅縮短至 2 秒！（學費 NT$ 2000）」';
      if (cash >= 2000) {
        this.dodgeLearnBtnEl.disabled = false;
        this.dodgeLearnBtnEl.textContent = isMobile ? '🐻 領悟進階【狗熊哆嗦毛】($2000) [動]' : '🐻 領悟進階【狗熊哆嗦毛】(NT$ 2000) (E)';
        this.dodgeLearnBtnEl.onclick = () => {
          this.closeDodgeDialog();
          onLearn(2);
        };
      } else {
        this.dodgeLearnBtnEl.disabled = true;
        this.dodgeLearnBtnEl.textContent = `學費不足 (需 NT$ 2000，目前 NT$ ${cash})`;
        this.dodgeLearnBtnEl.onclick = null;
      }
    } else {
      // 已完全精通
      this.dodgeDialogTextEl.textContent =
        '閃身步老師：「哈哈哈哈！你已將『狗熊哆嗦毛』融會貫通，技能已登峰造極！全校已經無人能碰到你的衣角了！」';
      this.dodgeLearnBtnEl.disabled = true;
      this.dodgeLearnBtnEl.textContent = '✨ 技能已臻化境 (已完全精通)';
      this.dodgeLearnBtnEl.onclick = null;
    }

    this.dodgeTeacherModalEl.style.display = 'flex';
  }

  public confirmDodgeLearn() {
    if (this.dodgeLearnBtnEl && !this.dodgeLearnBtnEl.disabled && this.dodgeLearnBtnEl.onclick) {
      (this.dodgeLearnBtnEl.onclick as any)();
    }
  }

  public closeDodgeDialog() {
    if (this.dodgeTeacherModalEl) {
      this.dodgeTeacherModalEl.style.display = 'none';
      this.isDodgeDialogOpen = false;
      this.onDodgeLearnCallback = undefined;
    }
  }

  // 雙世界 HUD 與空間傳送 Modal 管理
  public updateWorldHUD(name: string) {
    if (this.worldTextEl) {
      this.worldTextEl.textContent = name;
    }
  }

  public openWorldModal(currentWorld: 'CAMPUS' | 'DETENTION', onSwitch: (world: 'CAMPUS' | 'DETENTION') => void) {
    if (!this.worldModalEl) return;
    this.isWorldModalOpen = true;
    this.onWorldSwitchCallback = onSwitch;

    if (this.modalCurrentCampusEl && this.modalCurrentDetentionEl) {
      if (currentWorld === 'CAMPUS') {
        this.modalCurrentCampusEl.textContent = '✅ 當前所在世界';
        this.modalCurrentCampusEl.style.color = '#2ecc71';
        this.modalCurrentDetentionEl.textContent = '未在此世界 (點擊傳送)';
        this.modalCurrentDetentionEl.style.color = '#e74c3c';
      } else {
        this.modalCurrentCampusEl.textContent = '未在此世界 (點擊傳送)';
        this.modalCurrentCampusEl.style.color = '#3498db';
        this.modalCurrentDetentionEl.textContent = '✅ 當前所在世界';
        this.modalCurrentDetentionEl.style.color = '#2ecc71';
      }
    }

    this.worldModalEl.style.display = 'flex';
  }

  public closeWorldModal() {
    if (this.worldModalEl) {
      this.worldModalEl.style.display = 'none';
      this.isWorldModalOpen = false;
    }
  }

  // 即時更新技能 HUD 狀態 (技能圖示、名稱、冷卻倒數與扇形遮罩)
  public updateSkillHUD(skillLevel: number, cdRemaining: number, maxCd: number) {
    if (!this.skillHudCardEl || !this.skillIconEl || !this.skillNameEl || !this.skillDescEl || !this.skillCdNumberEl || !this.skillCooldownOverlayEl) {
      return;
    }

    if (skillLevel === 0) {
      this.skillIconEl.textContent = '🔒';
      this.skillNameEl.textContent = '閃身步 (未習得)';
      this.skillDescEl.textContent = '教學大樓尋找閃身步老師';
      this.skillCdNumberEl.style.display = 'none';
      this.skillCooldownOverlayEl.style.height = '0%';
      this.skillHudCardEl.classList.add('locked');
      this.skillHudCardEl.classList.remove('on-cooldown');
      return;
    }

    this.skillHudCardEl.classList.remove('locked');
    if (skillLevel === 1) {
      this.skillIconEl.textContent = '🥋';
      this.skillNameEl.textContent = '閃身步';
      this.skillDescEl.textContent = '規避敵人攻擊 (冷卻 5s)';
    } else {
      this.skillIconEl.textContent = '🐻';
      this.skillNameEl.textContent = '狗熊哆嗦毛';
      this.skillDescEl.textContent = '極速閃避攻擊 (冷卻 2s)';
    }

    if (cdRemaining > 0) {
      this.skillCdNumberEl.style.display = 'block';
      this.skillCdNumberEl.textContent = cdRemaining.toFixed(1) + 's';
      const pct = Math.max(0, Math.min(100, (cdRemaining / Math.max(0.1, maxCd)) * 100));
      this.skillCooldownOverlayEl.style.height = `${pct}%`;
      this.skillHudCardEl.classList.add('on-cooldown');
    } else {
      this.skillCdNumberEl.style.display = 'none';
      this.skillCooldownOverlayEl.style.height = '0%';
      this.skillHudCardEl.classList.remove('on-cooldown');
    }
  }

  public hidePrompt() {
    if (this.actionPrompt) {
      this.actionPrompt.style.display = 'none';
    }
  }

  public update(
    playerPos: THREE.Vector3,
    playerRotY: number,
    hp: number,
    stamina: number,
    npcs: NPC[],
    bicycles: Bicycle[],
    isBeingChased: boolean = false,
    isHighDanger: boolean = false,
    delta?: number,
    currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS',
    detentionData?: DetentionRadarData
  ) {
    // 1. 生命值與體力數值 (髒檢查：數值變化時才更新 DOM，避免幀重繪 layout thrashing)
    const roundedHp = Math.round(Math.max(0, Math.min(100, hp)));
    if (this.lastHp !== roundedHp) {
      this.lastHp = roundedHp;
      if (this.hpBar) this.hpBar.style.width = `${roundedHp}%`;
      if (this.hpNum) this.hpNum.textContent = `${roundedHp}%`;
    }

    const roundedStamina = Math.round(Math.max(0, Math.min(100, stamina)));
    if (this.lastStamina !== roundedStamina) {
      this.lastStamina = roundedStamina;
      if (this.staminaBar) this.staminaBar.style.width = `${roundedStamina}%`;
      if (this.staminaNum) this.staminaNum.textContent = `${roundedStamina}%`;
    }

    // 2. 地點分區偵測 (髒檢查)
    this.updateLocationZone(playerPos, currentWorld);

    // 3. 繪製 3D 雷達小地圖 (Minimap / MGS Soliton Radar，25fps 節流控制)
    this.renderMinimap(playerPos, playerRotY, npcs, bicycles, delta, currentWorld, detentionData);

    // 4. 被追捕外框紅色閃爍特效 (Pursuit Alert Vignette，狀態變化時更新)
    if (this.pursuitVignetteEl) {
      if (this.lastBeingChased !== isBeingChased || this.lastHighDanger !== isHighDanger) {
        this.lastBeingChased = isBeingChased;
        this.lastHighDanger = isHighDanger;
        if (isBeingChased) {
          this.pursuitVignetteEl.classList.add('active');
          if (isHighDanger) {
            this.pursuitVignetteEl.classList.add('danger');
          } else {
            this.pursuitVignetteEl.classList.remove('danger');
          }
        } else {
          this.pursuitVignetteEl.classList.remove('active', 'danger');
        }
      }
    }
  }

  public setPoisonActive(active: boolean) {
    if (this.lastPoisonActive === active) return;
    this.lastPoisonActive = active;
    if (this.poisonVignetteEl) {
      if (active) {
        this.poisonVignetteEl.classList.add('active');
      } else {
        this.poisonVignetteEl.classList.remove('active');
      }
    }
  }

  private updateLocationZone(pos: THREE.Vector3, currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS') {
    if (!this.locationEl) return;

    let zone = '教學中庭廣場';
    if (currentWorld === 'DETENTION') {
      if (pos.z < -28) {
        zone = '⛓️ A 區：牢房走廊迷宮 (獲取門禁卡 A)';
      } else if (pos.z >= -28 && pos.z <= 35) {
        zone = '📦 B 區：操場貨櫃掩體迷宮 (獲取門禁卡 B)';
      } else if (pos.z > 35 && pos.z <= 95) {
        zone = '⚡ C 區：終極哨戒門庭 (小 Boss 決戰)';
      } else {
        zone = '🚪 絕境安全脫逃通道 (任務完成)';
      }
    } else {
      if (pos.z > 105.0 || pos.z < -105.0 || Math.abs(pos.x) > 105.0) {
        zone = '🏙️ 校外大街 (強盜出沒警戒區)';
      } else if (pos.x >= 63 && pos.x <= 87 && pos.z >= -55 && pos.z <= -15) {
        zone = '🏊 天天國中 25m 標準游泳館';
      } else if (pos.x >= -95 && pos.x <= -45 && pos.z >= -104 && pos.z <= -77) {
        zone = '🌿 自然生態探索園區 (秘境霸主)';
      } else if (pos.y > 8.0) {
        zone = '教學大樓 A 棟 · 天台高空';
      } else if (pos.x > 20 && pos.z < 0) {
        zone = '教學大樓 A 棟 (高三部走廊)';
      } else if (pos.x > 20 && pos.z > 20) {
        zone = '教學大樓 B 棟 (活動中心)';
      } else if (pos.x < -20 && pos.z > 10) {
        zone = '操場 PU 跑道 & 足球場';
      } else if (pos.x < -30 && pos.z < 5 && pos.z > -20) {
        zone = '全校升旗司令台';
      } else if (pos.x < 5 && pos.x > -25 && pos.z < -40) {
        zone = '🏪 天天合作社 (熱食補血部)';
      } else if (pos.x < -35 && pos.z < -40) {
        zone = '火柴人自行車棚';
      } else if (pos.z > 80) {
        zone = '校門口 & 警衛守衛室';
      }
    }

    if (this.lastLocationZone !== zone) {
      this.lastLocationZone = zone;
      this.locationEl.textContent = zone;
    }
  }

  private renderMinimap(
    playerPos: THREE.Vector3,
    playerRotY: number,
    npcs: NPC[],
    bicycles: Bicycle[],
    delta?: number,
    currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS',
    detentionData?: DetentionRadarData
  ) {
    const now = performance.now();
    const dt = delta !== undefined ? delta : (this.lastMinimapTime > 0 ? (now - this.lastMinimapTime) / 1000 : 0.04);
    this.lastMinimapTime = now;
    this.minimapDeltaAccumulator += dt;

    // 控制小地圖繪製頻率為約 25fps（每隔 0.04 秒重繪一次，省去每幀無意義 2D Canvas 重繪開銷）
    if (this.minimapDeltaAccumulator < 0.04) {
      return;
    }
    this.minimapDeltaAccumulator = this.minimapDeltaAccumulator % 0.04;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const mapScale = 1.35; // 縮放比

    ctx.clearRect(0, 0, w, h);

    if (currentWorld === 'DETENTION') {
      // ========================================================
      // 潛龍諜影戰術諜報雷達 (MGS Soliton Radar)
      // ========================================================
      ctx.fillStyle = '#021811';
      ctx.fillRect(0, 0, w, h);

      // 戰術綠同心圓網格與十字準星
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, w * 0.22, 0, Math.PI * 2);
      ctx.arc(centerX, centerY, w * 0.42, 0, Math.PI * 2);
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, h);
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(playerRotY);

      // 繪製戰術迷宮矩形
      const drawTacticalBox = (bx: number, bz: number, bw: number, bd: number, color: string = '#10b981') => {
        const x = (bx - playerPos.x - bw / 2) * mapScale;
        const z = (bz - playerPos.z - bd / 2) * mapScale;
        ctx.fillStyle = 'rgba(6, 78, 59, 0.55)';
        ctx.fillRect(x, z, bw * mapScale, bd * mapScale);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, z, bw * mapScale, bd * mapScale);
      };

      // 外圍圍牆
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect((-95 - playerPos.x) * mapScale, (-95 - playerPos.z) * mapScale, 190 * mapScale, 190 * mapScale);

      // A 區建築：營舍與食堂
      drawTacticalBox(-40, -60, 50, 30, '#10b981');
      drawTacticalBox(50, -60, 50, 30, '#10b981');

      // A 區走廊迷宮隔牆與安全崗亭
      drawTacticalBox(-10, -84, 0.6, 12, '#34d399'); // 北走廊屏障
      drawTacticalBox(5, -60, 6.5, 4, '#38bdf8');   // 中央安全崗亭 (Keycard A)
      drawTacticalBox(14, -50, 0.6, 10, '#34d399');  // 東側巡邏盲區阻隔壁
      drawTacticalBox(-15.5, -38, 19, 0.6, '#34d399'); // 南前庭西折返隔板
      drawTacticalBox(15.5, -38, 19, 0.6, '#34d399');  // 南前庭東折返隔板

      // 管制閘門 1 (Z = -28)
      const gate1Color = detentionData?.isGateAOpen ? '#22c55e' : '#38bdf8';
      drawTacticalBox(-46.75, -28, 86.5, 1.5, '#34d399');
      drawTacticalBox(46.75, -28, 86.5, 1.5, '#34d399');
      drawTacticalBox(0, -28, 7.2, 1.2, gate1Color);

      // B 區貨櫃迷宮群 (10 座高規格集裝箱)
      const conts = [
        [-22, -18, 10, 2.8], [22, -18, 10, 2.8],
        [-12, -6, 2.8, 10], [12, -6, 2.8, 10],
        [-22, 8, 10, 2.8], [0, 8, 10, 2.8], [22, 8, 10, 2.8],
        [-12, 20, 2.8, 10], [12, 20, 2.8, 10],
        [30, 14, 2.8, 10]
      ];
      for (const [cx, cz, cw, cd] of conts) {
        drawTacticalBox(cx, cz, cw, cd, '#059669');
      }

      // 管制閘門 2 (Z = 35)
      const gate2Color = detentionData?.isGateBOpen ? '#22c55e' : '#facc15';
      drawTacticalBox(-46.75, 35, 86.5, 1.5, '#34d399');
      drawTacticalBox(46.75, 35, 86.5, 1.5, '#34d399');
      drawTacticalBox(0, 35, 7.2, 1.2, gate2Color);

      // C 區：4 座發電機掩體柱
      drawTacticalBox(-16, 52, 3.4, 3.4, '#eab308');
      drawTacticalBox(16, 52, 3.4, 3.4, '#eab308');
      drawTacticalBox(-16, 74, 3.4, 3.4, '#eab308');
      drawTacticalBox(16, 74, 3.4, 3.4, '#eab308');

      // 南側脫逃大門 (Z = 95)
      const southGateColor = detentionData?.isSouthGateOpen ? '#22c55e' : '#ef4444';
      drawTacticalBox(0, 95, 20.4, 1.5, southGateColor);

      // 鑰匙卡高亮顯眼標記 (帶動態擴散脈衝光環與直立文字標籤)
      if (detentionData) {
        const pulse = 1.0 + 0.3 * Math.sin(now * 0.008);

        // 1. 藍色門禁卡 A
        if (!detentionData.hasKeycardA) {
          const kx = (detentionData.keycardAPos.x - playerPos.x) * mapScale;
          const kz = (detentionData.keycardAPos.z - playerPos.z) * mapScale;

          // 動態擴散外圈
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(kx, kz, 6.5 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // 核心光點
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(kx, kz, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // 直立文字標籤
          ctx.save();
          ctx.translate(kx, kz);
          ctx.rotate(-playerRotY);
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('🔑KEY A', 0, -8);
          ctx.restore();
        }

        // 2. 黃色門禁卡 B
        if (!detentionData.hasKeycardB) {
          const kx = (detentionData.keycardBPos.x - playerPos.x) * mapScale;
          const kz = (detentionData.keycardBPos.z - playerPos.z) * mapScale;

          // 動態擴散外圈
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(kx, kz, 6.5 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // 核心光點
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(kx, kz, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // 直立文字標籤
          ctx.save();
          ctx.translate(kx, kz);
          ctx.rotate(-playerRotY);
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#facc15';
          ctx.fillText('🔑KEY B', 0, -8);
          ctx.restore();
        }

        // 3. 萬能逃脫鑰匙卡 (金黃色傳奇標記)
        if (detentionData.masterKeycardPos && !detentionData.hasMasterKeycard) {
          const kx = (detentionData.masterKeycardPos.x - playerPos.x) * mapScale;
          const kz = (detentionData.masterKeycardPos.z - playerPos.z) * mapScale;

          // 金色耀眼動態光環
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(kx, kz, 8.0 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // 核心金鑽
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(kx, kz, 5.0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // 直立文字標籤
          ctx.save();
          ctx.translate(kx, kz);
          ctx.rotate(-playerRotY);
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffd700';
          ctx.fillText('★MASTER KEY', 0, -10);
          ctx.restore();
        }
      }

      // 繪製敵方 NPC 及其 90° 視野錐 (MGS Soliton Radar)
      for (const npc of npcs) {
        const nx = (npc.position.x - playerPos.x) * mapScale;
        const nz = (npc.position.z - playerPos.z) * mapScale;

        if (npc.isPermanentlyKnockedOut || (npc.hp <= 0 && npc.isKnockedDown)) {
          // 被擊昏守衛：淡灰 X 符號，無視野錐
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(nx - 3, nz - 3);
          ctx.lineTo(nx + 3, nz + 3);
          ctx.moveTo(nx + 3, nz - 3);
          ctx.lineTo(nx - 3, nz + 3);
          ctx.stroke();
          continue;
        }

        // 存活守衛
        const isBoss = npc.role === 'DETENTION_BOSS';
        const alertState = npc.alertState || 'NORMAL';

        let dotColor = '#22c55e';
        let coneColor = 'rgba(34, 197, 94, 0.24)';
        if (alertState === 'ALERT' || npc.isChasing) {
          dotColor = '#ef4444';
          coneColor = 'rgba(239, 68, 68, 0.38)';
        } else if (alertState === 'CAUTION') {
          dotColor = '#f59e0b';
          coneColor = 'rgba(245, 158, 11, 0.32)';
        } else if (isBoss) {
          dotColor = '#ff2222';
          coneColor = 'rgba(255, 34, 34, 0.28)';
        }

        const ang = npc.rotationY;
        const coneDist = (isBoss ? 24 : 18) * mapScale;
        const fovHalf = Math.PI / 4; // 45度半角 = 90度視野錐

        // 繪製視野錐扇形
        ctx.fillStyle = coneColor;
        ctx.beginPath();
        ctx.moveTo(nx, nz);
        ctx.arc(nx, nz, coneDist, ang - fovHalf + Math.PI / 2, ang + fovHalf + Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        // 繪製守衛圓點
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(nx, nz, isBoss ? 6.5 : 4.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 若 Boss 存活且尚未掉落萬能鑰匙卡，在雷達上直立標示 ★BOSS [KEY]
        if (isBoss && detentionData && !detentionData.hasMasterKeycard && !detentionData.masterKeycardPos) {
          ctx.save();
          ctx.translate(nx, nz);
          ctx.rotate(-playerRotY);
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ff4444';
          ctx.fillText('★BOSS [KEY]', 0, -10);
          ctx.restore();
        }
      }

      ctx.restore();

      // 玩家中央圖示
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();

      // 潛行模式指示 (外圍柔和虛線圈)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 警戒閃爍外框
      if (detentionData && (detentionData.alertTimer > 0 || detentionData.alertLevel === 'ALERT')) {
        const pulse = Math.sin(now * 0.015) > 0;
        ctx.strokeStyle = pulse ? '#ef4444' : 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);
      } else {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, w - 4, h - 4);
      }
      return;
    }

    // ========================================================
    // 天天國中校園常規小地圖 (Campus World)
    // ========================================================
    // 背景底色
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // 將小地圖中心移到玩家位置，並依玩家視角旋轉
    ctx.translate(centerX, centerY);
    ctx.rotate(playerRotY);

    // 繪製代表校園建築的矩形色塊
    const drawBuilding = (bx: number, bz: number, bw: number, bd: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect((bx - playerPos.x - bw / 2) * mapScale, (bz - playerPos.z - bd / 2) * mapScale, bw * mapScale, bd * mapScale);
    };

    // 生態探索園區 (西北深綠森林泥土地，位於北圍牆內側)
    drawBuilding(-70, -90.5, 50, 27, '#14532d');

    // 25m 標準游泳館
    drawBuilding(75, -35, 20, 32, '#0284c7');

    // 大樓 A, B
    drawBuilding(40, -30, 48, 18, '#334155');
    drawBuilding(40, 45, 48, 18, '#334155');
    // 天天合作社
    drawBuilding(-15, -60, 18, 14, '#b45309');
    // 車棚
    drawBuilding(-50, -55, 24, 8, '#0369a1');
    // 司令台
    drawBuilding(-45, -8, 16, 10, '#475569');

    // 操場跑道 (真實橢圓體育場造型)
    const tCenterX = (-55 - playerPos.x) * mapScale;
    const tCenterZ = (30 - playerPos.z) * mapScale;
    const sHalf = 16 * mapScale;
    const rOuter = 26 * mapScale;
    const rInner = 16 * mapScale;

    // 紅磚色 PU 跑道
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 9 * mapScale;
    ctx.beginPath();
    ctx.moveTo(tCenterX + rOuter - 4 * mapScale, tCenterZ - sHalf);
    ctx.lineTo(tCenterX + rOuter - 4 * mapScale, tCenterZ + sHalf);
    ctx.arc(tCenterX, tCenterZ + sHalf, rOuter - 4 * mapScale, 0, Math.PI, false);
    ctx.lineTo(tCenterX - (rOuter - 4 * mapScale), tCenterZ - sHalf);
    ctx.arc(tCenterX, tCenterZ - sHalf, rOuter - 4 * mapScale, Math.PI, Math.PI * 2, false);
    ctx.stroke();

    // 內圈綠色草皮
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(tCenterX + rInner, tCenterZ - sHalf);
    ctx.lineTo(tCenterX + rInner, tCenterZ + sHalf);
    ctx.arc(tCenterX, tCenterZ + sHalf, rInner, 0, Math.PI, false);
    ctx.lineTo(tCenterX - rInner, tCenterZ - sHalf);
    ctx.arc(tCenterX, tCenterZ - sHalf, rInner, Math.PI, Math.PI * 2, false);
    ctx.fill();

    // 繪製腳踏車標記 (藍色點)
    for (const bike of bicycles) {
      const bx = (bike.position.x - playerPos.x) * mapScale;
      const bz = (bike.position.z - playerPos.z) * mapScale;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(bx, bz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 繪製 NPC 標記 (生教:深紅, 糾察:紅, 單車糾察:紫, 校犬柴柴:赤柴橘黃, 學生:白)
    for (const npc of npcs) {
      const nx = (npc.position.x - playerPos.x) * mapScale;
      const nz = (npc.position.z - playerPos.z) * mapScale;
      let dotColor = '#e2e8f0';
      let dotRadius = 3.5;

      if (npc.role === 'DETENTION_BOSS') {
        dotColor = '#ff2222';
        dotRadius = 6.5;
      } else if (npc.role === 'DETENTION_GUARD') {
        dotColor = '#2563eb';
        dotRadius = 5.2;
      } else if (npc.role === 'DETENTION_HEAVY') {
        dotColor = '#7c3aed';
        dotRadius = 5.8;
      } else if (npc.role === 'DETENTION_SENIOR') {
        dotColor = '#f59e0b';
        dotRadius = 4.5;
      } else if (npc.role === 'DETENTION_WOLF') {
        dotColor = '#ea580c';
        dotRadius = 4.6;
      } else if (npc.role === 'TEACHER' || npc.role === 'INSTRUCTOR') {
        dotColor = '#dc2626';
        dotRadius = 5.5;
      } else if (npc.role === 'BANDIT') {
        dotColor = '#be123c';
        dotRadius = 5.0;
      } else if (npc.role === 'DOG') {
        dotColor = '#f97316';
        dotRadius = 4.5;
      } else if (npc.role === 'BIKE_PATROL') {
        dotColor = '#a855f7';
        dotRadius = 5.0;
      } else if (npc.role === 'INSPECTOR') {
        dotColor = '#ef4444';
        dotRadius = 4.0;
      }

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(nx, nz, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 玩家中央黃色箭頭標記
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 外框與刻度
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 更新 CQC 潛入擊昏提示 (HUD 戰術提示與手機攻擊按鈕聯動)
  public updateCqcPrompt(visible: boolean, targetNpcRole: string = '') {
    const el = document.getElementById('cqc-prompt-container');
    const textEl = document.getElementById('cqc-btn-text');
    const mobileAttackBtn = document.getElementById('m-btn-attack');

    if (el) {
      el.style.display = visible ? 'flex' : 'none';
      if (textEl && visible) {
        if (targetNpcRole === 'DETENTION_BOSS') {
          textEl.textContent = '⚡ [左鍵 / F / 攻擊鈕] 總教官弱點破盾重擊！';
        } else {
          textEl.textContent = '🥷 [左鍵 / F / 攻擊鈕] 絞喉擊昏 (CQC)';
        }
      }
    }

    // 手機端：直接聯動既有攻擊按鈕 (👊 -> 🥷 暗殺態，不需專屬 CQC 鈕)
    if (mobileAttackBtn) {
      if (visible) {
        mobileAttackBtn.classList.add('cqc-active');
        mobileAttackBtn.textContent = '🥷';
      } else {
        mobileAttackBtn.classList.remove('cqc-active');
        mobileAttackBtn.textContent = '👊';
      }
    }
  }

  // 更新 MGS 警戒倒數計時器
  public updateMgsAlert(timer: number) {
    const banner = document.getElementById('mgs-alert-banner');
    const val = document.getElementById('mgs-alert-timer');
    if (banner && val) {
      if (timer > 0) {
        banner.style.display = 'flex';
        val.textContent = timer.toFixed(2);
      } else {
        banner.style.display = 'none';
      }
    }
  }

  // 顯示特訓院絕境越獄通關結算對話框
  public showDetentionVictory(
    escapeTimeSec: number,
    takedowns: number,
    alerts: number,
    onReplay: () => void,
    onReturnCampus: () => void
  ) {
    const modal = document.getElementById('detention-victory-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const min = Math.floor(escapeTimeSec / 60).toString().padStart(2, '0');
    const sec = Math.floor(escapeTimeSec % 60).toString().padStart(2, '0');
    const timeEl = document.getElementById('stat-escape-time');
    const takedownsEl = document.getElementById('stat-escape-takedowns');
    const alertsEl = document.getElementById('stat-escape-alerts');
    const badgeEl = document.getElementById('escape-rank-badge');
    const titleEl = document.getElementById('escape-rank-title');

    if (timeEl) timeEl.textContent = `${min}:${sec}`;
    if (takedownsEl) takedownsEl.textContent = `${takedowns} 人`;
    if (alertsEl) alertsEl.textContent = `${alerts} 次`;

    // 評級計算
    let rank = 'S';
    let title = '傳奇特務 (BIG BOSS)';
    let color = '#fbbf24';
    if (alerts > 3 || escapeTimeSec > 300) {
      rank = 'B';
      title = '逃獄狂徒 (RENEGADE)';
      color = '#f87171';
    } else if (alerts > 0 || escapeTimeSec > 180) {
      rank = 'A';
      title = '潛入專家 (INFILTRATOR)';
      color = '#38bdf8';
    }

    if (badgeEl) {
      badgeEl.textContent = rank;
      badgeEl.style.color = color;
    }
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.style.color = color;
    }

    const replayBtn = document.getElementById('btn-replay-detention');
    const campusBtn = document.getElementById('btn-return-campus');
    if (replayBtn) {
      replayBtn.onclick = () => {
        modal.style.display = 'none';
        onReplay();
      };
    }
    if (campusBtn) {
      campusBtn.onclick = () => {
        modal.style.display = 'none';
        onReturnCampus();
      };
    }
  }

  // 更新特訓院越獄任務面板
  public updateWorld2EscapeTracker(
    takedowns: number,
    gateAOpen: boolean,
    gateBOpen: boolean,
    bossHp: number,
    bossMaxHp: number,
    isBossDefeated: boolean,
    isEscapeComplete: boolean
  ) {
    const campusWrapper = document.getElementById('campus-quest-wrapper');
    const detentionWrapper = document.getElementById('detention-quest-wrapper');
    if (campusWrapper && detentionWrapper) {
      campusWrapper.style.display = 'none';
      detentionWrapper.style.display = 'block';
    }

    const koCountEl = document.getElementById('det-ko-count');
    const koStatusEl = document.getElementById('det-ko-status');
    if (koCountEl) koCountEl.textContent = `${takedowns}`;
    if (koStatusEl) {
      koStatusEl.textContent = takedowns > 0 ? `已排除 ${takedowns}` : '進行中';
      koStatusEl.className = 'q-status completed';
    }

    const g1El = document.getElementById('det-gate1-status');
    if (g1El) {
      g1El.textContent = gateAOpen ? '已開啟' : '未解鎖';
      g1El.className = gateAOpen ? 'q-status completed' : 'q-status';
    }

    const g2El = document.getElementById('det-gate2-status');
    if (g2El) {
      g2El.textContent = gateBOpen ? '已開啟' : '未解鎖';
      g2El.className = gateBOpen ? 'q-status completed' : 'q-status';
    }

    const bossEl = document.getElementById('det-boss-status');
    if (bossEl) {
      bossEl.textContent = isBossDefeated ? '已擊破' : `${bossHp}/${bossMaxHp}`;
      bossEl.className = isBossDefeated ? 'q-status completed' : 'q-status';
    }

    const escEl = document.getElementById('det-escape-status');
    if (escEl) {
      escEl.textContent = isEscapeComplete ? '已逃脫' : '未完成';
      escEl.className = isEscapeComplete ? 'q-status completed' : 'q-status';
    }
  }
}
