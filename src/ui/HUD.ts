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
  { id: 'bento', name: '經典排骨便當', icon: '🍱', price: 50, healHp: 50, restoreStamina: false, desc: '古早味炸排骨，香氣四溢大補血！(+50 HP)' },
  { id: 'chicken', name: '香脆豪大大雞排', icon: '🍗', price: 40, healHp: 40, restoreStamina: false, desc: '外皮酥脆多汁，下課排隊必吃！(+40 HP)' },
  { id: 'boba', name: '波霸珍珠奶茶', icon: '🧋', price: 30, healHp: 30, restoreStamina: true, desc: '微糖微冰，體力與精力雙重滿足！(+30 HP & 精力滿)' },
  { id: 'sandwich', name: '火腿起司三明治', icon: '🥪', price: 20, healHp: 20, restoreStamina: false, desc: '新鮮土司夾蛋，清爽飽足！(+20 HP)' },
  { id: 'tea-egg', name: '香濃茶葉蛋', icon: '🥚', price: 12, healHp: 12, restoreStamina: false, desc: '合作社滷得最入味的經典！(+12 HP)' },
  { id: 'sport-drink', name: '活力運動飲料', icon: '⚡', price: 15, healHp: 10, restoreStamina: true, desc: '迅速補充水分電解質！(+10 HP & 精力全滿)' }
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

    // 更新總進度與進度條
    if (this.qTotalProgress) {
      this.qTotalProgress.textContent = `${completedCount}/12`;
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
    delta?: number
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
    this.updateLocationZone(playerPos);

    // 3. 繪製 3D 雷達小地圖 (Minimap，25fps 節流控制)
    this.renderMinimap(playerPos, playerRotY, npcs, bicycles, delta);

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

  private updateLocationZone(pos: THREE.Vector3) {
    if (!this.locationEl) return;

    let zone = '教學中庭廣場';
    if (pos.z > 107.0 || Math.abs(pos.x) > 118.0) {
      zone = '🏙️ 校外大街 (強盜出沒警戒區)';
    } else if (pos.x >= 63 && pos.x <= 87 && pos.z >= -55 && pos.z <= -15) {
      zone = '🏊 天天國中 25m 標準游泳館';
    } else if (pos.x < -45 && pos.z < -75) {
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
      zone = '腳踏車專用車棚';
    } else if (pos.z > 80) {
      zone = '校門口 & 警衛守衛室';
    }

    if (this.lastLocationZone !== zone) {
      this.lastLocationZone = zone;
      this.locationEl.textContent = zone;
    }
  }

  private renderMinimap(playerPos: THREE.Vector3, playerRotY: number, npcs: NPC[], bicycles: Bicycle[], delta?: number) {
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

    // 生態探索園區 (西北深綠森林泥土地)
    drawBuilding(-70, -98, 50, 42, '#14532d');

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

      if (npc.role === 'TEACHER' || npc.role === 'INSTRUCTOR') {
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
}
