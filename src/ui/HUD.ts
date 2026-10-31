import * as THREE from 'three';
import { DETENTION_MAP_FEATURES, DETENTION_MAP_AREA_LABELS, DETENTION_ROADS, DETENTION_TOWERS, SEARCHLIGHT_TOWER, GATE_WALLS, GATE_A_Z, GATE_B_Z, DetentionMapKind } from '../world/detentionLayout';

type FullMapTab = 'map' | 'gear' | 'quest';

// 第二世界雷達與大地圖的場景分類配色
const DETENTION_RADAR_COLORS: Record<DetentionMapKind, string> = {
  building: '#10b981', structure: '#38bdf8', fence: '#34d399', barrier: '#a3e635', container: '#059669', pillar: '#eab308'
};
const DETENTION_FULLMAP_STYLES: Record<DetentionMapKind, { fill: string; stroke: string }> = {
  building: { fill: 'rgba(6, 78, 59, 0.65)', stroke: '#10b981' },
  structure: { fill: 'rgba(56, 189, 248, 0.3)', stroke: '#38bdf8' },
  fence: { fill: 'rgba(16, 185, 129, 0.5)', stroke: '#34d399' },
  barrier: { fill: 'rgba(163, 230, 53, 0.35)', stroke: '#a3e635' },
  container: { fill: 'rgba(5, 150, 105, 0.45)', stroke: '#059669' },
  pillar: { fill: 'rgba(234, 179, 8, 0.4)', stroke: '#eab308' }
};
import { NPC, NPCRole } from '../entities/NPC';
import { Bicycle } from '../vehicles/Bicycle';
import type { FullMapStatus, WeaponEquipEntry } from '../game/Progression';
import type { WeaponId } from '../weapons/types';
import { CAMPUS_MAP_RECTS, CAMPUS_TRACK, CAMPUS_POIS, CAMPUS_WALL_HALF, CAMPUS_GATE, CAMPUS_GUARD_HOUSE, getCampusZoneName } from '../world/campusLayout';
import { FullMapPanels } from './FullMapPanels';
import { isTouchDevice } from '../core/device';
import { qualityManager } from '../core/QualityManager';
import { QUALITY_PRESETS } from '../core/quality';
import { getDiagFlags } from '../core/diagFlags';
import { fencerQuestText } from '../game/fencer/fencerStory';
import { pickCampusGoal, pickDetentionGoal, campusPoiDoneMask, isCampusPoiDone, isCampusPoiHidden, type FullMapGoal } from './fullMapGoals';

// 小地圖與大地圖共用的 NPC 標記樣式 (顏色以大地圖為準；radius 為小地圖標記半徑)
const NPC_ROLE_MAP_STYLE: Partial<Record<NPCRole, { color: string; radius: number }>> = {
  DETENTION_BOSS: { color: '#ff2222', radius: 6.5 },
  DETENTION_GUARD: { color: '#2563eb', radius: 5.2 },
  DETENTION_HEAVY: { color: '#7c3aed', radius: 5.8 },
  DETENTION_SENIOR: { color: '#f59e0b', radius: 4.5 },
  DETENTION_WOLF: { color: '#ea580c', radius: 4.6 },
  TEACHER: { color: '#dc2626', radius: 5.5 },
  DISCIPLINE_CHIEF: { color: '#dc2626', radius: 5.5 },
  INSTRUCTOR: { color: '#b91c1c', radius: 5.5 },
  BANDIT: { color: '#be123c', radius: 5.0 },
  DOG: { color: '#f59e0b', radius: 4.5 },
  BIKE_PATROL: { color: '#8b5cf6', radius: 5.0 },
  INSPECTOR: { color: '#ef4444', radius: 4.0 }
};
const DEFAULT_NPC_MAP_STYLE = { color: '#cbd5e1', radius: 3.5 };

// 特訓院守衛雷達/大地圖警戒色階：0 正常、1 追捕/警戒、2 疑惑、3 Boss (正常狀態)
function guardAlertTier(npc: NPC): number {
  if (npc.alertState === 'ALERT' || npc.isChasing) return 1;
  if (npc.alertState === 'CAUTION') return 2;
  return npc.role === 'DETENTION_BOSS' ? 3 : 0;
}
const GUARD_DOT_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#ff2222'];
const GUARD_CONE_COLORS_RADAR = ['rgba(34, 197, 94, 0.24)', 'rgba(239, 68, 68, 0.38)', 'rgba(245, 158, 11, 0.32)', 'rgba(255, 34, 34, 0.28)'];
const GUARD_CONE_COLORS_FULLMAP = ['rgba(34, 197, 94, 0.22)', 'rgba(239, 68, 68, 0.35)', 'rgba(245, 158, 11, 0.28)', 'rgba(255, 34, 34, 0.25)'];

export interface CommissaryItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  healHp: number;
  restoreStamina: boolean;
  desc: string;
}

// 越獄評級 (潛行優先)：幽靈 = 0 警戒 + 0 正面擊倒 + 180 秒內；S = 0 警戒 + 正面擊倒 ≤ 2 + 180 秒內；
// 其餘依警戒次數與時間：警戒 ≤ 3 且 300 秒內為 A，否則 B (正面擊倒 3 人以上最高只到 A)
const ESCAPE_S_TIME = 180;
const ESCAPE_A_TIME = 300;
const ESCAPE_S_MAX_FRONTAL = 2;
const ESCAPE_A_MAX_ALERTS = 3;
export function getEscapeRank(escapeTimeSec: number, alerts: number, frontalKos: number): { rank: string; title: string; color: string } {
  if (alerts === 0 && escapeTimeSec <= ESCAPE_S_TIME) {
    if (frontalKos === 0) return { rank: '幽靈', title: '無影幽靈 (GHOST)', color: '#e2e8f0' };
    if (frontalKos <= ESCAPE_S_MAX_FRONTAL) return { rank: 'S', title: '傳奇特務 (BIG BOSS)', color: '#fbbf24' };
  }
  if (alerts <= ESCAPE_A_MAX_ALERTS && escapeTimeSec <= ESCAPE_A_TIME) return { rank: 'A', title: '潛入專家 (INFILTRATOR)', color: '#38bdf8' };
  return { rank: 'B', title: '逃獄狂徒 (RENEGADE)', color: '#f87171' };
}

// 第二世界特訓小賣部物價為校園合作社 2 倍 (共用同一份菜單，顯示與結帳皆經此換算)
const DETENTION_PRICE_MULTIPLIER = 2;
export function getCommissaryPrice(item: CommissaryItem, isDetention: boolean): number {
  return isDetention ? item.price * DETENTION_PRICE_MULTIPLIER : item.price;
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
  fencerDefeated: boolean;
  /** 花劍客任務揭露段：0 未知 (操場中央的怪花)、1 已遭遇、2 完成 */
  fencerStage: number;
  /** 已發現怪苗 (發現前任務看板 / 大地圖不顯示) 與成長階段 0~10 */
  fencerDiscovered: boolean;
  fencerGrowth: number;
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
  checkpointPos?: THREE.Vector3;
  checkpointName?: string;
}

export class HUD {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  // 小地圖/雷達固定以 120 單位邏輯座標繪製，實際像素依 CSS 尺寸 × DPR 縮放 (放大後顯示同範圍、圖示等比放大且清晰)
  private static readonly MINIMAP_LOGICAL_SIZE = 120;
  private minimapPixelScale: number = 1;

  // 雷達外圈 HP 弧 (數值變化才更新) 與角色身旁精力環
  private hpRingEl: Element | null;
  private hpRingFillEl: Element | null;
  private hpRingTrailEl: Element | null;
  private hpRingNumEl: HTMLElement | null;
  private staminaRingEl: HTMLElement | null;
  private staminaRingFillEl: Element | null;
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

  // 慢動作處決特寫與電影黑邊
  private cinematicBarsEl: HTMLElement | null;
  private cinemaFlashEl: HTMLElement | null;
  private cinemaQteBadgeEl: HTMLElement | null;
  private cinemaQteSubEl: HTMLElement | null;
  private cinemaDismissTimer: any = null;

  // 雙世界切換與空間傳送 Modal
  private worldBadgeEl: HTMLElement | null;
  private worldTextEl: HTMLElement | null;
  public onWorldToggle?: () => void;
  // 每幀更新的 HUD 髒檢查快取
  private lastSkillKey: number = -1;
  private lastBossShown: boolean | null = null;
  private lastBossHp: number = -2;
  private lastBossMaxHp: number = -1;
  private lastBossName: string | undefined = undefined;
  private lastBossBar: number = -1;
  // 關閉全螢幕地圖時請求重新鎖定滑鼠 (由 main 接到 InputManager.requestPointerLock)
  public onRequestPointerLock?: () => void;
  private worldModalEl: HTMLElement | null;
  private worldModalCloseBtnEl: HTMLElement | null;
  private modalCardCampusEl: HTMLElement | null;
  private modalCardDetentionEl: HTMLElement | null;
  private worldModalCurrent: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
  private modalCurrentCampusEl: HTMLElement | null;
  private modalCurrentDetentionEl: HTMLElement | null;
  public isWorldModalOpen: boolean = false;
  private onWorldSwitchCallback?: (targetWorld: 'CAMPUS' | 'DETENTION') => void;

  // 任務提示中心字幕 (Center Mission Directive Toast)
  private missionCenterPromptEl: HTMLElement | null;
  private missionCenterTextEl: HTMLElement | null;
  private missionCenterSubEl: HTMLElement | null;
  private missionCenterTimer: any = null;

  // 全螢幕大地圖視窗 (Full Map Modal)
  private fullmapModalEl: HTMLElement | null;
  private fullmapCanvas: HTMLCanvasElement | null;
  private fullmapCtx: CanvasRenderingContext2D | null = null;
  private fullmapCloseBtnEl: HTMLElement | null;
  private fullmapTitleEl: HTMLElement | null;
  private fullmapLegendCampusEl: HTMLElement | null;
  private fullmapLegendDetentionEl: HTMLElement | null;
  private lastFullmapLegendWorld: 'CAMPUS' | 'DETENTION' | null = null;
  private minimapWrapperEl: HTMLElement | null;
  public isFullMapOpen: boolean = false;
  // 大地圖分頁：每次開啟預設回到【地圖】(任務小介面則直接開【任務】)；地圖畫布僅在【地圖】分頁時繪製
  private fullmapTab: FullMapTab = 'map';
  private fullmapTabBtns: HTMLElement[] = [];
  private fullmapPanes: HTMLElement[] = [];
  // 大地圖側欄 / 裝備詳情 / 戰績面板 (學生證、下一步目標、武器詳情、成就)
  private fullmapPanels: FullMapPanels;
  // 【裝備】分頁資料與裝備回呼、玩家狀態快照 (由 main 接 Progression)
  public getWeaponEquipEntries?: () => WeaponEquipEntry[];
  public onEquipWeapon?: (id: WeaponId) => boolean;
  public getFullMapStatus?: () => FullMapStatus;

  constructor() {
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.hpRingEl = document.getElementById('hp-ring');
    this.hpRingFillEl = document.getElementById('hp-ring-fill');
    this.hpRingTrailEl = document.getElementById('hp-ring-trail');
    this.hpRingNumEl = document.getElementById('hp-ring-num');
    this.staminaRingEl = document.getElementById('stamina-ring');
    this.staminaRingFillEl = document.getElementById('stamina-ring-fill');
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

    // ⚙️ 設定選單 (全螢幕 / 觸控操作)：點擊展開/收合，點選單外任意處自動收合
    const settingsBtnEl = document.getElementById('hud-settings-btn');
    const settingsMenuEl = document.getElementById('hud-settings-menu');
    if (settingsBtnEl && settingsMenuEl) {
      const setSettingsOpen = (open: boolean) => {
        settingsMenuEl.classList.toggle('open', open);
        settingsBtnEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      settingsBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setSettingsOpen(!settingsMenuEl.classList.contains('open'));
      });
      document.addEventListener('pointerdown', (e) => {
        if (!settingsMenuEl.classList.contains('open')) return;
        const target = e.target as Node;
        if (!settingsMenuEl.contains(target) && !settingsBtnEl.contains(target)) {
          setSettingsOpen(false);
        }
      }, true);
    }

    this.worldBadgeEl = document.getElementById('world-badge');
    this.worldTextEl = document.getElementById('world-text');
    if (this.worldBadgeEl) {
      // 大地圖工具列的「切換世界」：先關閉大地圖再開啟世界選擇視窗 
      this.worldBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeFullMap(false); // 接著開啟世界選擇視窗，維持滑鼠解鎖以便點選
        if (this.onWorldToggle) this.onWorldToggle();
      });
    }

    this.worldModalEl = document.getElementById('world-modal');
    this.worldModalCloseBtnEl = document.getElementById('world-modal-close-btn');
    this.modalCardCampusEl = document.getElementById('modal-card-campus');
    this.modalCardDetentionEl = document.getElementById('modal-card-detention');
    this.modalCurrentCampusEl = document.getElementById('modal-current-campus');
    this.modalCurrentDetentionEl = document.getElementById('modal-current-detention');

    this.cinematicBarsEl = document.getElementById('cinematic-bars');
    this.cinemaFlashEl = document.getElementById('cinema-flash');
    this.cinemaQteBadgeEl = document.getElementById('cinema-qte-badge');
    this.cinemaQteSubEl = document.getElementById('cinema-qte-sub');

    if (this.worldModalCloseBtnEl) {
      this.worldModalCloseBtnEl.addEventListener('click', () => this.closeWorldModal());
    }
    // 整張世界卡片即選擇鍵：觸控 touchend 先擋下以免穿透到底下鏡頭拖曳/攻擊，並避免 click 重複觸發
    const bindWorldCard = (card: HTMLElement | null, world: 'CAMPUS' | 'DETENTION') => {
      if (!card) return;
      const pick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const cb = this.onWorldSwitchCallback;
        const same = world === this.worldModalCurrent;
        this.closeWorldModal();
        if (cb && !same) cb(world);
      };
      card.addEventListener('click', pick);
      card.addEventListener('touchend', pick, { passive: false });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') pick(e);
      });
    };
    bindWorldCard(this.modalCardCampusEl, 'CAMPUS');
    bindWorldCard(this.modalCardDetentionEl, 'DETENTION');
    if (this.worldModalEl) {
      // 點背景（卡片外）關閉
      this.worldModalEl.addEventListener('click', (e) => {
        if (e.target === this.worldModalEl) this.closeWorldModal();
      });
    }

    // 初始化任務中央醒目提示元素
    this.missionCenterPromptEl = document.getElementById('mission-center-prompt');
    this.missionCenterTextEl = document.getElementById('mission-center-text');
    this.missionCenterSubEl = document.getElementById('mission-center-sub');

    // 初始化全螢幕大地圖元素與事件
    this.fullmapModalEl = document.getElementById('fullmap-modal');
    this.fullmapCanvas = document.getElementById('fullmap-canvas') as HTMLCanvasElement;
    if (this.fullmapCanvas) {
      this.fullmapCtx = this.fullmapCanvas.getContext('2d');
      // 大地圖依實際顯示尺寸 × DPR (上限 2) 調整畫布解析度；尺寸變更時才重設，並觸發立即重繪
      const canvas = this.fullmapCanvas;
      const syncFullmapResolution = () => {
        const cssSide = canvas.clientWidth;
        if (cssSide <= 0) return;
        const side = Math.round(cssSide * Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[qualityManager.tier].minimapDprMax));
        this.fullmapCssSide = cssSide;
        if (canvas.width !== side) {
          canvas.width = side;
          canvas.height = side;
        }
        this.lastFullmapRenderAt = 0;
      };
      new ResizeObserver(syncFullmapResolution).observe(canvas);
      qualityManager.onChange(syncFullmapResolution); // 切換檔位時依新的 DPR 上限重設畫布
    }
    this.fullmapCloseBtnEl = document.getElementById('fullmap-close-btn');
    this.fullmapTitleEl = document.getElementById('fullmap-title');
    this.fullmapLegendCampusEl = document.getElementById('fullmap-legend-campus');
    this.fullmapLegendDetentionEl = document.getElementById('fullmap-legend-detention');
    this.minimapWrapperEl = document.getElementById('minimap-wrapper');

    // 頂部兩欄尺寸寫入 CSS 變數供橫幅定位：--hud-top-bottom (兩欄底緣，直屏橫幅置於其下)、
    // --hud-side-w (較寬欄位寬度，桌面/橫屏橫幅置於兩欄之間的中央留白)
    const hudTopEl = document.querySelector('.hud-top') as HTMLElement | null;
    if (hudTopEl && 'ResizeObserver' in window) {
      const leftEl = document.getElementById('hud-top-left');
      const rightEl = hudTopEl.querySelector('.hud-top-right') as HTMLElement | null;
      const syncHudTopBottom = () => {
        const rootStyle = document.documentElement.style;
        const bottom = Math.round(hudTopEl.getBoundingClientRect().bottom);
        if (bottom > 0) rootStyle.setProperty('--hud-top-bottom', `${bottom}px`);
        const leftR = leftEl ? leftEl.getBoundingClientRect() : null;
        const rightR = rightEl ? rightEl.getBoundingClientRect() : null;
        const sideW = Math.round(Math.max(leftR ? leftR.right : 0, rightR ? window.innerWidth - rightR.left : 0));
        if (sideW > 0) rootStyle.setProperty('--hud-side-w', `${sideW}px`);
      };
      const ro = new ResizeObserver(syncHudTopBottom);
      ro.observe(hudTopEl);
      if (leftEl) ro.observe(leftEl);
      if (rightEl) ro.observe(rightEl);
      // Engine 於縮放/翻轉後 (含穩定前的分段補量) 廣播 app-layout-change，位置改變但尺寸未變時也能重新同步
      window.addEventListener('app-layout-change', syncHudTopBottom);
      syncHudTopBottom();
    }

    // 雷達畫布像素尺寸跟隨 CSS 尺寸 × DPR (上限依畫質檔位：低 1 / 中高 2)，僅於尺寸或檔位變動時重設，無每幀成本
    const syncMinimapResolution = () => {
      const cssSize = this.canvas.clientWidth;
      if (cssSize <= 0) return;
      const px = Math.round(cssSize * Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[qualityManager.tier].minimapDprMax));
      if (this.canvas.width !== px) {
        this.canvas.width = px;
        this.canvas.height = px;
      }
      this.minimapPixelScale = px / HUD.MINIMAP_LOGICAL_SIZE;
    };
    if ('ResizeObserver' in window) new ResizeObserver(syncMinimapResolution).observe(this.canvas);
    window.addEventListener('app-layout-change', syncMinimapResolution);
    qualityManager.onChange(syncMinimapResolution);
    syncMinimapResolution();

    // 大地圖分頁列 (點擊 / 觸控切換)
    this.fullmapTabBtns = Array.from(document.querySelectorAll<HTMLElement>('.fm-tab-btn'));
    this.fullmapPanes = Array.from(document.querySelectorAll<HTMLElement>('.fullmap-pane'));
    this.fullmapPanels = new FullMapPanels({
      getEntries: () => this.getWeaponEquipEntries?.() ?? [],
      equip: (id) => this.onEquipWeapon?.(id) ?? false,
      getStatus: () => this.getFullMapStatus?.() ?? null
    });
    for (const btn of this.fullmapTabBtns) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setFullMapTab(btn.dataset.fmTab as FullMapTab);
      });
    }

    if (this.minimapWrapperEl) {
      this.minimapWrapperEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFullMap();
      });
    }

    if (this.fullmapCloseBtnEl) {
      this.fullmapCloseBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeFullMap();
      });
    }

    if (this.fullmapModalEl) {
      this.fullmapModalEl.addEventListener('click', (e) => {
        if (e.target === this.fullmapModalEl) {
          this.closeFullMap();
        }
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
    this.qTotalProgress = document.getElementById('q-total-progress');
    this.qTotalBar = document.getElementById('q-total-bar');
    this.qTitleText = document.getElementById('q-title-text');
    this.fmQuestTitle = document.getElementById('fm-quest-title');
    this.fmQTotalProgress = document.getElementById('fm-q-total-progress');
    this.fmQTotalBar = document.getElementById('fm-q-total-bar');
    this.questTabsBar = document.getElementById('quest-tabs-bar');

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
    this.qFencerItem = document.getElementById('q-fencer-item');
    this.qFencerStatus = document.getElementById('q-fencer-status');
    this.qFencerIcon = document.getElementById('q-fencer-icon');
    this.qFencerName = document.getElementById('q-fencer-name');
    this.qFencerDesc = document.getElementById('q-fencer-desc');

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

    // 任務小介面：點擊開啟整合任務清單的大地圖
    if (this.questTrackerPanel) {
      this.questTrackerPanel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleQuestTracker(true);
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
  }

  // 頂部任務介面屬性
  private questTrackerPanel: HTMLElement | null;
  private qTotalProgress: HTMLElement | null;
  private qTotalBar: HTMLElement | null;
  // 大地圖任務側欄的標題與總進度 (與任務小介面同步)
  private qTitleText: HTMLElement | null;
  private fmQuestTitle: HTMLElement | null;
  private fmQTotalProgress: HTMLElement | null;
  private fmQTotalBar: HTMLElement | null;
  private questTabsBar: HTMLElement | null;

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
  private qFencerItem: HTMLElement | null;
  private qFencerStatus: HTMLElement | null;
  private qFencerIcon: HTMLElement | null;
  private qFencerName: HTMLElement | null;
  private qFencerDesc: HTMLElement | null;

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


  // 效能優化節流與髒檢查 (Perf 6)
  private minimapDeltaAccumulator: number = 0;
  private lastMinimapTime: number = 0;
  private lastCash: number = -1;
  private lastMissionData: MissionTrackerData | null = null;
  private lastWeaponIcon = '';
  private lastWeaponAtk = -1;
  private lastHp: number = -1;
  private lastHpLevel: string = '';
  // 花劍客戰：雷達暫停 (隱藏小地圖、不重繪) 與血量環脫戰回血狀態
  private radarSuspended = false;
  private hpRegenOn = false;
  private hpRegenTag: HTMLElement | null = null;
  private lastStamina: number = -1;
  private staminaRingVisible: boolean = false;
  private staminaFullTimer: number = 0;
  private lastStaminaExhausted: boolean = false;
  private lastLocationZone: string = '';
  private lastBeingChased: boolean | null = null;
  private lastHighDanger: boolean | null = null;
  private lastPoisonActive: boolean | null = null;

  private shotMeterEl: HTMLElement | null;
  private shotSweetspotEl: HTMLElement | null;
  private shotFillEl: HTMLElement | null;
  private shotNeedleEl: HTMLElement | null;
  private shotFeedbackEl: HTMLElement | null;

  // 每幀更新路徑使用的 DOM 元素快取 (元素僅搬移不重建，查詢一次後重複使用)
  private domCache = new Map<string, HTMLElement | null>();
  private $(id: string): HTMLElement | null {
    let el = this.domCache.get(id);
    if (el === undefined) {
      el = document.getElementById(id);
      this.domCache.set(id, el);
    }
    return el;
  }

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

  // 總教官暗殺時機計量表 (沿用投籃計量表外觀)：zoneStart/zoneWidth 為綠區位置 (0~1)
  public showTakedownMeter(zoneStart: number, zoneWidth: number, hint: string) {
    const el = this.$('takedown-meter');
    if (!el) return;
    const zone = this.$('takedown-sweetspot');
    if (zone) {
      zone.style.left = `${zoneStart * 100}%`;
      zone.style.width = `${zoneWidth * 100}%`;
    }
    const hintEl = this.$('takedown-meter-hint');
    if (hintEl) hintEl.textContent = hint;
    this.updateTakedownMeter(0);
    el.style.display = 'block';
  }

  public updateTakedownMeter(ratio: number) {
    const needle = this.$('takedown-needle');
    if (needle) needle.style.left = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  public hideTakedownMeter() {
    const el = this.$('takedown-meter');
    if (el) el.style.display = 'none';
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

  // BGM 標籤依所在世界顯示 (切換世界時以上次狀態重繪)
  private bgmWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
  private lastBgmMode: 'EXPLORE' | 'PURSUIT' = 'EXPLORE';
  private lastBgmMuted = false;
  public setBGMWorld(world: 'CAMPUS' | 'DETENTION') {
    this.bgmWorld = world;
    this.updateBGMStatus(this.lastBgmMode, this.lastBgmMuted);
  }

  public updateBGMStatus(mode: 'EXPLORE' | 'PURSUIT', isMuted: boolean) {
    this.lastBgmMode = mode;
    this.lastBgmMuted = isMuted;
    const isDetention = this.bgmWorld === 'DETENTION';
    if (!this.bgmBadgeEl || !this.bgmIconEl || !this.bgmTextEl || !this.bgmToggleBtnEl) return;

    if (isMuted) {
      this.bgmBadgeEl.className = 'bgm-badge muted';
      this.bgmIconEl.textContent = '🔇';
      this.bgmTextEl.textContent = 'BGM: 靜音';
      this.bgmToggleBtnEl.textContent = '[關]';
    } else if (mode === 'PURSUIT') {
      this.bgmBadgeEl.className = 'bgm-badge pursuit';
      this.bgmIconEl.textContent = '🚨';
      this.bgmTextEl.textContent = isDetention ? 'BGM: 警戒追捕!' : 'BGM: 通緝追逐!';
      this.bgmToggleBtnEl.textContent = '[開]';
    } else {
      this.bgmBadgeEl.className = 'bgm-badge';
      this.bgmIconEl.textContent = '🎵';
      this.bgmTextEl.textContent = isDetention ? 'BGM: 暗夜潛入' : 'BGM: 校園漫步';
      this.bgmToggleBtnEl.textContent = '[開]';
    }
  }

  private lastWeatherBadge = '';
  public updateWeatherHUD(badgeText: string) {
    this.lastWeatherBadge = badgeText;
    if (this.weatherTextEl && this.weatherTextEl.textContent !== badgeText) {
      this.weatherTextEl.textContent = badgeText;
    }
  }

  // 觸控操作提示 (按鍵顯示為 [動] 等)：觸控裝置，或桌機手動開啟了觸控虛擬按鍵；不看視窗寬度
  public isMobile(): boolean {
    return isTouchDevice() || document.body.classList.contains('touch-mode-active');
  }

  private lastPromptKey = '';
  private lastPromptText = '';
  private isPromptVisible = false;

  public showPrompt(key: string, text: string) {
    // 每幀呼叫：內容與可見狀態未變時直接略過 (省去 regex 與 DOM 寫入)
    if (this.isPromptVisible && key === this.lastPromptKey && text === this.lastPromptText) return;
    if (this.actionPrompt && this.promptKey && this.promptText) {
      this.lastPromptKey = key;
      this.lastPromptText = text;
      this.isPromptVisible = true;
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

  // 顯示畫面中央任務醒目字體提示 (停留片刻後平滑淡出)
  public showCenterPrompt(title: string, subtitle: string = 'SECTOR CLEARANCE DIRECTIVE', duration: number = 3500) {
    if (!this.missionCenterPromptEl) return;
    if (this.missionCenterTextEl) {
      this.missionCenterTextEl.textContent = title;
    }
    if (this.missionCenterSubEl) {
      this.missionCenterSubEl.textContent = subtitle;
    }
    if (this.missionCenterTimer) {
      clearTimeout(this.missionCenterTimer);
      this.missionCenterTimer = null;
    }

    this.missionCenterPromptEl.classList.remove('fade-out');
    this.missionCenterPromptEl.classList.add('show');

    this.missionCenterTimer = setTimeout(() => {
      if (this.missionCenterPromptEl) {
        this.missionCenterPromptEl.classList.remove('show');
        this.missionCenterPromptEl.classList.add('fade-out');
        setTimeout(() => {
          if (this.missionCenterPromptEl) {
            this.missionCenterPromptEl.classList.remove('fade-out');
          }
        }, 1800);
      }
    }, duration);
  }

  // 切換大地圖分頁；裝備詳情僅在切入時渲染，地圖畫布僅在【地圖】分頁時繪製
  private setFullMapTab(tab: FullMapTab) {
    this.fullmapTab = tab;
    for (const btn of this.fullmapTabBtns) {
      const active = btn.dataset.fmTab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const pane of this.fullmapPanes) pane.hidden = pane.dataset.fmPane !== tab;
    if (tab === 'gear') this.fullmapPanels.renderGear(true);
    this.lastFullmapRenderAt = 0; // 學生證 / 戰績立即快照
  }

  // 開啟全螢幕大地圖 (預設【地圖】分頁)
  public openFullMap(tab: FullMapTab = 'map') {
    this.isFullMapOpen = true;
    this.setFullMapTab(tab);
    this.lastFullmapRenderAt = 0; // 開啟時立即繪製第一幀
    // 解除滑鼠指標鎖定，使 PC 玩家可點選任務分類與捲動清單 (按 J 開啟時仍處於鎖定)
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (this.fullmapModalEl) {
      this.fullmapModalEl.style.display = 'flex';
    }
  }

  // 關閉全螢幕大地圖
  public closeFullMap(relockPointer: boolean = true) {
    this.isFullMapOpen = false;
    if (this.fullmapModalEl) {
      this.fullmapModalEl.style.display = 'none';
    }
    // 關閉地圖 (J 鍵或點擊關閉鈕) 時重新鎖定滑鼠，PC 玩家不需再點一次畫面即可轉動視角
    if (relockPointer && this.onRequestPointerLock) this.onRequestPointerLock();
  }

  // 切換全螢幕大地圖
  public toggleFullMap() {
    if (this.isFullMapOpen) {
      this.closeFullMap();
    } else {
      this.openFullMap();
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

    // 髒檢查：每幀呼叫，僅在顯示狀態、血量 (取整) 或名稱變動時寫入 DOM
    const shown = visible && currentHp > 0;
    const hpKey = shown ? Math.ceil(currentHp) : -1;
    if (shown === this.lastBossShown && hpKey === this.lastBossHp && maxHp === this.lastBossMaxHp && bossName === this.lastBossName) return;
    this.lastBossShown = shown;
    this.lastBossHp = hpKey;
    this.lastBossMaxHp = maxHp;
    this.lastBossName = bossName;
    this.lastBossBar = -1;
    this.bossHudEl.classList.remove('boss-hud-fencer', 'bar-flash');

    if (!shown) {
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

  /**
   * 花劍客 Boss 血條：同一條血條呈現三管 (無文字)。fill = 整場剩餘 / 總量，兩條細分隔線標示三段，
   * 顏色隨管數 (bar 0~2) 變化，換管時閃光一次。僅寫 class / width，並做髒檢查。
   */
  public setFencerBossHealth(totalHp: number, totalMax: number, bar: number, visible: boolean) {
    if (!this.bossHudEl || !this.bossBarFillEl) return;
    const shown = visible && totalHp > 0;
    const pct = shown ? Math.max(0, Math.min(100, Math.round((totalHp / totalMax) * 200) / 2)) : -1;
    if (shown === this.lastBossShown && pct === this.lastBossHp && bar === this.lastBossBar && this.lastBossName === '__fencer') return;
    const barChanged = bar !== this.lastBossBar;
    this.lastBossShown = shown;
    this.lastBossHp = pct;
    this.lastBossBar = bar;
    this.lastBossMaxHp = totalMax;
    this.lastBossName = '__fencer';
    const el = this.bossHudEl;
    if (!shown) {
      el.style.display = 'none';
      el.classList.remove('boss-hud-fencer');
      this.lastBossBar = -1;
      return;
    }
    el.style.display = 'block';
    el.classList.add('boss-hud-fencer');
    el.dataset.bar = String(bar);
    this.bossBarFillEl.style.width = `${pct}%`;
    if (barChanged) {
      el.classList.remove('bar-flash');
      void el.offsetWidth;
      el.classList.add('bar-flash');
    }
  }

  /** 花劍客戰鬥中精簡 HUD：只切 body class (CSS 隱藏校園歷練 / 地點資訊 / 零用錢 / 校規處分) */
  public setBossFightHud(on: boolean) {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('boss-fight-hud', on);
  }

  // 任務清單已整合進大地圖【任務】分頁：開啟 / 關閉 / 切換 (J 鍵開地圖分頁；任務小介面直達任務分頁)
  public toggleQuestTracker(expand?: boolean) {
    if (expand === undefined) {
      this.toggleFullMap();
    } else if (expand) {
      this.openFullMap('quest');
    } else {
      this.closeFullMap();
    }
  }

  // 同步任務小介面與大地圖任務側欄的標題、總進度與進度條
  private setQuestSummary(title: string, done: number, total: number) {
    const progressText = `${done}/${total}`;
    const pct = `${Math.min(100, Math.round((done / total) * 100))}%`;
    if (this.qTitleText && this.qTitleText.textContent !== title) this.qTitleText.textContent = title;
    if (this.fmQuestTitle && this.fmQuestTitle.textContent !== title) this.fmQuestTitle.textContent = title;
    if (this.qTotalProgress && this.qTotalProgress.textContent !== progressText) this.qTotalProgress.textContent = progressText;
    if (this.fmQTotalProgress && this.fmQTotalProgress.textContent !== progressText) this.fmQTotalProgress.textContent = progressText;
    if (this.qTotalBar && this.qTotalBar.style.width !== pct) this.qTotalBar.style.width = pct;
    this.fullmapPanels.setRing(done, total);
    if (this.fmQTotalBar && this.fmQTotalBar.style.width !== pct) this.fmQTotalBar.style.width = pct;
  }

  // 即時更新頂端任務看板資訊 (進度、達成狀態、Boss狀態、運動紀錄與探索，含髒檢查 Dirty check)
  // 任務項目完成狀態：切換 completed 樣式並更新狀態文字
  private setQuestState(
    item: HTMLElement | null,
    statusEl: HTMLElement | null,
    done: boolean,
    doneText: string = '已達成 ✅',
    pendingText: string = '進行中'
  ) {
    if (item) item.classList.toggle('completed', done);
    if (statusEl) {
      statusEl.textContent = done ? doneText : pendingText;
      statusEl.className = done ? 'q-status done' : 'q-status';
    }
  }

  // 記錄目前武器圖示 / ATK，供大地圖學生證狀態卡顯示 (不寫 DOM)
  public setWeaponInfo(icon: string, atk: number) {
    this.lastWeaponIcon = icon;
    this.lastWeaponAtk = atk;
  }

  public updateMissionTracker(data: MissionTrackerData) {
    const campusWrapper = this.$('campus-quest-wrapper');
    const detentionWrapper = this.$('detention-quest-wrapper');
    if (campusWrapper && detentionWrapper && campusWrapper.style.display === 'none') {
      campusWrapper.style.display = 'block';
      detentionWrapper.style.display = 'none';
      if (this.questTabsBar) this.questTabsBar.style.display = '';
      this.lastMissionData = null; // 世界切換回校園：強制重繪任務標題與進度
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
      last.hasTastedHotFood === data.hasTastedHotFood &&
      last.dodgeSkillLevel === data.dodgeSkillLevel &&
      last.fencerDefeated === data.fencerDefeated &&
      last.fencerStage === data.fencerStage &&
      last.fencerDiscovered === data.fencerDiscovered &&
      last.fencerGrowth === data.fencerGrowth
    ) {
      return;
    }
    this.lastMissionData = { ...data };
    this.fullmapPanels.setCampusStats(data);

    // 1. 普通球棒 / 擊敗普通同學 (5位)
    const batDone = data.hasNormalBat || data.studentDefeated >= 5;
    if (this.qBatProgress) this.qBatProgress.textContent = `${Math.min(5, data.studentDefeated)}/5`;
    this.setQuestState(this.qBatItem, this.qBatStatus, batDone);

    // 2. 特殊神兵球棒 / 校園霸王 (生教 x1, 校犬 x1, 單車巡邏 x5)
    const specialDone = data.hasSpecialBat || (data.teacherDefeated >= 1 && data.dogDefeated >= 1 && data.bikeDefeated >= 5);
    if (this.qTeacherProg) this.qTeacherProg.textContent = `${Math.min(1, data.teacherDefeated)}/1`;
    if (this.qDogProg) this.qDogProg.textContent = `${Math.min(1, data.dogDefeated)}/1`;
    if (this.qBikeProg) this.qBikeProg.textContent = `${Math.min(5, data.bikeDefeated)}/5`;
    this.setQuestState(this.qSpecialItem, this.qSpecialStatus, specialDone);

    // 2. 挑戰羽球大如老師
    const peDone = data.peBossDefeated;
    this.setQuestState(this.qPeItem, this.qPeStatus, peDone);

    // 3. 挑戰溫室食人花 Boss
    const plantDone = data.plantBossDefeated;
    this.setQuestState(this.qPlantItem, this.qPlantStatus, plantDone);

    // 4. 擊倒教官與步巡隊
    const inspectorDone = data.inspectorDefeated > 0;
    if (this.qInspectorProg) this.qInspectorProg.textContent = `${Math.min(1, data.inspectorDefeated)}/1`;
    this.setQuestState(this.qInspectorItem, this.qInspectorStatus, inspectorDone);

    // 5. 經典三分球投籃挑戰
    const bballDone = data.basketballRecord > 0 || data.basketballStreak > 0;
    if (this.qBasketStreak) this.qBasketStreak.textContent = `${Math.max(data.basketballStreak, data.basketballRecord)}顆`;
    this.setQuestState(this.qBasketballItem, this.qBasketballStatus, bballDone);

    // 6. 操場跑道 400m 競速
    const trackDone = Boolean(data.trackRecordText && data.trackRecordText !== '未完成');
    if (this.qTrackTime) this.qTrackTime.textContent = data.trackRecordText;
    this.setQuestState(this.qTrackItem, this.qTrackStatus, trackDone);

    // 7. 25m 水上競速挑戰
    const swimDone = Boolean(data.swimRecordText && data.swimRecordText !== '未完成');
    if (this.qSwimTime) this.qSwimTime.textContent = data.swimRecordText;
    this.setQuestState(this.qSwimItem, this.qSwimStatus, swimDone);

    // 8. 自由騎乘校園自行車
    const bikeDone = data.hasRiddenBike;
    this.setQuestState(this.qBikeItem, this.qBikeStatus, bikeDone);

    // 9. 擺脫校犬柴柴追捕
    const dogDone = data.hasEscapedDog;
    this.setQuestState(this.qDogItem, this.qDogStatus, dogDone);

    // 10. 生態池許願池投幣
    const pondDone = data.hasWishedPond;
    this.setQuestState(this.qPondItem, this.qPondStatus, pondDone);

    // 11. 天天合作社品嚐熱食
    const hotfoodDone = data.hasTastedHotFood;
    this.setQuestState(this.qHotfoodItem, this.qHotfoodStatus, hotfoodDone);

    // 12. 獨門技能修煉 (閃身步 / 狗熊哆嗦毛)
    const dodgeLvl = data.dodgeSkillLevel || 0;
    const dodgeDone = dodgeLvl >= 1;
    if (this.qDodgeDesc) {
      if (dodgeLvl === 0) this.qDodgeDesc.textContent = '尋訪教學大樓「閃身步老師」學習技能【閃身步】 (0/2)';
      else if (dodgeLvl === 1) this.qDodgeDesc.textContent = '已習得【閃身步】(冷卻1s)，可進階狗熊哆嗦毛 (1/2)';
      else this.qDodgeDesc.textContent = '已融會貫通【狗熊哆嗦毛】(冷卻1s，完全精通) (2/2)';
    }
    this.setQuestState(this.qDodgeItem, this.qDodgeStatus, dodgeDone, dodgeLvl >= 2 ? '大成 🌟' : '閃身步 ✅', '未習得');

    // 13. 世界 Boss：擊敗操場花劍客
    const fencerDone = data.fencerDefeated;
    const fencerText = fencerQuestText(data.fencerStage, data.fencerGrowth);
    if (this.qFencerItem) this.qFencerItem.style.display = data.fencerDiscovered ? '' : 'none';
    if (this.qFencerIcon) this.qFencerIcon.textContent = fencerText.goalIcon;
    if (this.qFencerName) this.qFencerName.textContent = fencerText.name;
    if (this.qFencerDesc) this.qFencerDesc.textContent = fencerText.desc;
    this.setQuestState(this.qFencerItem, this.qFencerStatus, fencerDone);

    const completedCount = [
      batDone, specialDone, peDone, plantDone, inspectorDone, bballDone, trackDone,
      swimDone, bikeDone, dogDone, pondDone, hotfoodDone, dodgeDone, fencerDone
    ].filter(Boolean).length;

    // 更新總進度與進度條 (任務小介面與大地圖側欄同步)
    this.setQuestSummary('📜 校園歷練', completedCount, data.fencerDiscovered ? 14 : 13);
  }

  // 合作社 (熱食補血部) 彈出式選單
  public openCommissary(playerCash: number, onBuyItem: (item: CommissaryItem) => void, isDetention: boolean = false) {
    if (!this.commissaryModalEl || !this.commissaryGridEl || !this.commissaryCashValEl) return;

    // 第二世界共用同一菜單，標題與說明改為特訓小賣部
    const titleEl = this.commissaryModalEl.querySelector('.commissary-title');
    if (titleEl) titleEl.textContent = isDetention ? '🏪 特訓小賣部 (體能急救補給)' : '🏪 天天合作社 (熱食補血部)';
    const descEl = this.commissaryModalEl.querySelector('.commissary-desc');
    if (descEl) descEl.textContent = isDetention ? '購買體能與急救補給品，立刻恢復 HP 體力與精力！' : '吃熱騰騰美味餐點，立刻恢復 HP 體力與精力！';

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

      const itemPrice = getCommissaryPrice(item, isDetention);
      const price = document.createElement('div');
      price.className = 'food-price';
      price.textContent = `NT$ ${itemPrice}`;

      info.appendChild(name);
      info.appendChild(effect);
      info.appendChild(price);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'food-buy-btn';
      buyBtn.textContent = '購買品嚐';
      if (playerCash < itemPrice) {
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
  // egg：首勝花劍客後句末接上的彩蛋台詞 (閃身步源自爵士老師的西洋劍步法)
  public openDodgeDialog(cash: number, skillLevel: number, onLearn: (targetLevel: number) => void, egg?: string) {
    if (!this.dodgeTeacherModalEl) return;
    this.isDodgeDialogOpen = true;

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
        '閃身步老師：「同學，看你腳步浮躁，在校園裡橫衝直撞很容易吃虧！老夫傳授你入門絕技『閃身步』，施展時身輕如燕、規避敵人一切攻擊！（冷卻時間 1 秒，學費 NT$ 1000）」';
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
        '閃身步老師：「好徒兒！你已精通基礎『閃身步』。老夫這裡還有更精妙的至高真傳——進階版『狗熊哆嗦毛』！施展時如靈熊抖擻毫毛，無影無形，連續瞬移神速規避！（學費 NT$ 2000）」';
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
    if (egg) this.dodgeDialogTextEl.textContent += egg;

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
    // 解除滑鼠指標鎖定，使 PC 玩家 可點選世界卡片
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.onWorldSwitchCallback = onSwitch;
    this.worldModalCurrent = currentWorld;

    if (this.modalCurrentCampusEl && this.modalCurrentDetentionEl) {
      if (currentWorld === 'CAMPUS') {
        this.modalCurrentCampusEl.textContent = '✅ 當前所在世界';
        this.modalCurrentCampusEl.style.color = '#2ecc71';
        this.modalCurrentDetentionEl.textContent = '未在此世界 (點擊卡片傳送)';
        this.modalCurrentDetentionEl.style.color = '#e74c3c';
      } else {
        this.modalCurrentCampusEl.textContent = '未在此世界 (點擊卡片傳送)';
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
  public updateSkillHUD(skillLevel: number, cdRemaining: number, maxCd: number, isDetention: boolean = false) {
    if (!this.skillHudCardEl || !this.skillIconEl || !this.skillNameEl || !this.skillDescEl || !this.skillCdNumberEl || !this.skillCooldownOverlayEl) {
      return;
    }
    // 髒檢查：每幀呼叫，僅在技能等級或冷卻顯示值 (0.1s 精度) 變動時寫入 DOM
    const skillKey = (skillLevel * 100000 + (cdRemaining > 0 ? Math.ceil(cdRemaining * 10) : 0)) * 2 + (isDetention ? 1 : 0);
    if (skillKey === this.lastSkillKey) return;
    this.lastSkillKey = skillKey;

    if (skillLevel === 0) {
      this.skillIconEl.textContent = '🔒';
      this.skillNameEl.textContent = '閃身步 (未習得)';
      this.skillDescEl.textContent = isDetention ? '回天天國中教學大樓習得' : '教學大樓尋找閃身步老師';
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
      this.skillDescEl.textContent = '規避敵人攻擊 (冷卻 1s)';
    } else {
      this.skillIconEl.textContent = '🐻';
      this.skillNameEl.textContent = '狗熊哆嗦毛';
      this.skillDescEl.textContent = '極速閃避攻擊 (冷卻 1s)';
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
    if (!this.isPromptVisible) return;
    this.isPromptVisible = false;
    if (this.actionPrompt) {
      this.actionPrompt.style.display = 'none';
    }
  }

  // 精力環：精力未滿時浮現於角色身旁 (screenX/Y 為角色肩部投影座標)，回滿 0.8 秒後淡出；
  // 僅可見期間每幀以 transform 定位，隱藏時不觸碰 DOM
  public updateStaminaRing(screenX: number, screenY: number, allowed: boolean, delta: number) {
    const el = this.staminaRingEl;
    if (!el) return;
    const stamina = this.lastStamina;
    let want = false;
    if (allowed) {
      if (stamina < 99.5) {
        this.staminaFullTimer = 0.8;
        want = true;
      } else if (this.staminaFullTimer > 0) {
        this.staminaFullTimer -= delta;
        want = this.staminaFullTimer > 0;
      }
    } else {
      this.staminaFullTimer = 0;
    }

    if (want !== this.staminaRingVisible) {
      this.staminaRingVisible = want;
      el.classList.toggle('visible', want);
    }
    if (!want) return;

    // 錨點已位於角色右側 (main.ts 以世界座標偏移)，此處再外推半個環寬並夾持於畫面內
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(vw - 28, Math.max(28, screenX + 20));
    const y = Math.min(vh - 28, Math.max(28, screenY));
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;

    const rounded = Math.round(stamina);
    if (this.staminaRingFillEl && this.staminaRingFillEl.getAttribute('data-v') !== `${rounded}`) {
      this.staminaRingFillEl.setAttribute('data-v', `${rounded}`);
      this.staminaRingFillEl.setAttribute('style', `stroke-dasharray:${rounded} 100`);
    }
    const exhausted = stamina < 20;
    if (exhausted !== this.lastStaminaExhausted) {
      this.lastStaminaExhausted = exhausted;
      el.classList.toggle('exhausted', exhausted);
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
    // 1. 雷達外圈 HP 弧 (髒檢查：數值變化時才更新 DOM，避免幀重繪 layout thrashing)
    //    hp 為百分比；弧長佔圓周 3/4 (pathLength=100 → 滿血 75)
    const roundedHp = Math.round(Math.max(0, Math.min(100, hp)));
    if (this.lastHp !== roundedHp) {
      this.lastHp = roundedHp;
      const dash = `${(roundedHp * 0.75).toFixed(2)} 100`;
      this.hpRingFillEl?.setAttribute('style', `stroke-dasharray:${dash}`);
      this.hpRingTrailEl?.setAttribute('style', `stroke-dasharray:${dash}`);
      if (this.hpRingNumEl) this.hpRingNumEl.textContent = `${roundedHp}`;
      const level = roundedHp > 50 ? '' : (roundedHp > 25 ? 'hp-mid' : 'hp-low');
      if (level !== this.lastHpLevel) {
        this.lastHpLevel = level;
        this.hpRingEl?.classList.remove('hp-mid', 'hp-low');
        if (level) this.hpRingEl?.classList.add(level);
      }
    }
    this.lastStamina = Math.max(0, Math.min(100, stamina));

    // 2. 地點分區偵測 (髒檢查)
    this.updateLocationZone(playerPos, currentWorld);

    // 3. 繪製 3D 雷達小地圖 (Minimap / MGS Soliton Radar，25fps 節流控制)
    this.renderMinimap(playerPos, playerRotY, npcs, bicycles, delta, currentWorld, detentionData);

    // 3.1 全螢幕大地圖 (若開啟中，同步繪製全景大地圖)
    // 節流至約 20fps：大地圖為導覽用途，無需逐幀重繪；畫布僅在【地圖】分頁繪製，學生證 / 戰績同節流且值變才寫 DOM
    if (this.isFullMapOpen) {
      const nowMs = performance.now();
      // 頻率依畫質檔位 (中高 20Hz / 低 10Hz)，容差 4ms 避免 30fps 鎖幀時因差一點點而多等一幀
      if (nowMs - this.lastFullmapRenderAt >= 1000 / QUALITY_PRESETS[qualityManager.tier].fullmapHz - 4) {
        this.lastFullmapRenderAt = nowMs;
        this.refreshFullMapPanels(playerPos, npcs, currentWorld, detentionData);
        if (this.fullmapTab === 'map') this.renderFullMap(playerPos, playerRotY, npcs, bicycles, currentWorld, detentionData);
      }
    }

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

  private lastLocationWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
  private updateLocationZone(pos: THREE.Vector3, currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS') {
    if (!this.locationEl) return;

    let zone: string;
    if (currentWorld === 'DETENTION') {
      if (pos.z < -28) {
        zone = '⛓️ A 區：監區 (中央警衛室取門禁卡 A)';
      } else if (pos.z >= -28 && pos.z <= 35) {
        zone = '📦 B 區：訓練場 (東側器材庫取門禁卡 B)';
      } else if (pos.z > 35 && pos.z <= 95) {
        zone = '⚡ C 區：決戰區 (擊破總教官取得萬能鑰匙卡)';
      } else {
        zone = '🚪 絕境安全脫逃通道 (任務完成)';
      }
    } else {
      zone = getCampusZoneName(pos.x, pos.y, pos.z);
    }

    if (this.lastLocationZone !== zone) {
      this.lastLocationZone = zone;
      this.locationEl.textContent = zone;
    }
    // 地點卡片上方的所屬機構名稱 (切換世界時更新)
    if (this.lastLocationWorld !== currentWorld) {
      this.lastLocationWorld = currentWorld;
      const badge = document.querySelector('.school-badge');
      if (badge) badge.textContent = currentWorld === 'DETENTION' ? '第七少年特訓院 · 潛入越獄' : '新北市立天天國中 · 自由沙盒';
    }
  }

  // 雷達暫停：隱藏小地圖畫布並停止重繪 (血量環照常)；恢復時下一幀立即重繪
  public setRadarSuspended(suspended: boolean) {
    if (this.radarSuspended === suspended) return;
    this.radarSuspended = suspended;
    const wrap = document.getElementById('minimap-wrapper');
    if (wrap) wrap.style.visibility = suspended ? 'hidden' : '';
    if (!suspended) this.minimapDeltaAccumulator = 999;
  }

  // 血量環脫戰快速回血：綠色呼吸 + 「+12/s」標籤 (狀態切換時才改 class)
  public setHpRegen(on: boolean, label: string = '+12/s') {
    if (this.hpRegenOn === on) return;
    this.hpRegenOn = on;
    this.hpRingEl?.classList.toggle('hp-ring--regen', on);
    if (!this.hpRegenTag) {
      const host = this.hpRingNumEl?.parentElement;
      if (!host) return;
      this.hpRegenTag = document.createElement('span');
      this.hpRegenTag.className = 'hp-ring-regen-tag';
      host.appendChild(this.hpRegenTag);
    }
    this.hpRegenTag.textContent = label;
    this.hpRegenTag.style.display = on ? '' : 'none';
  }

  // 脫戰被打斷：血量環閃紅一次
  public flashHpRingInterrupt() {
    const el = this.hpRingEl as HTMLElement | SVGElement | null;
    if (!el) return;
    el.classList.remove('hp-ring--interrupt');
    void (el as SVGElement).getBoundingClientRect();
    el.classList.add('hp-ring--interrupt');
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
    if (getDiagFlags().map === false || this.radarSuspended) return; // ?diag=&map=0 / 花劍客戰：停止小地圖重繪
    const now = performance.now();
    const dt = delta !== undefined ? delta : (this.lastMinimapTime > 0 ? (now - this.lastMinimapTime) / 1000 : 0.04);
    this.lastMinimapTime = now;
    this.minimapDeltaAccumulator += dt;

    // 控制小地圖繪製頻率（中高檔 25Hz / 低檔 10Hz，省去每幀無意義 2D Canvas 重繪開銷）；
    // 容差 2ms 避免 30fps 鎖幀時累積值差一點點而多等一幀，扣除後保留餘量 (落後過多則歸零避免連發)
    const minimapInterval = 1 / QUALITY_PRESETS[qualityManager.tier].minimapHz;
    if (this.minimapDeltaAccumulator < minimapInterval - 0.002) {
      return;
    }
    this.minimapDeltaAccumulator = this.minimapDeltaAccumulator >= minimapInterval * 2 ? 0 : this.minimapDeltaAccumulator - minimapInterval;

    const ctx = this.ctx;
    const w = HUD.MINIMAP_LOGICAL_SIZE;
    const h = HUD.MINIMAP_LOGICAL_SIZE;
    const centerX = w / 2;
    const centerY = h / 2;
    const mapScale = 1.35; // 縮放比 (邏輯單位/公尺，顯示半徑約 44m)

    ctx.setTransform(this.minimapPixelScale, 0, 0, this.minimapPixelScale, 0, 0);
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
      // 小地圖方位鎖定固定 (固定北方朝上，不隨玩家面向旋轉)

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

      // 場景建物、圍籬、貨櫃與掩體 (與 DetentionWorld 共用配置資料)
      for (const f of DETENTION_MAP_FEATURES) {
        drawTacticalBox((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2, f.maxX - f.minX, f.maxZ - f.minZ, DETENTION_RADAR_COLORS[f.kind]);
      }

      // 管制閘門 1 (Z = -28) 與閘門 2 (Z = 35) 隔斷牆
      for (const w of GATE_WALLS) {
        drawTacticalBox((w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2, w.maxX - w.minX, 1.5, '#34d399');
      }
      drawTacticalBox(0, GATE_A_Z, 7.2, 1.2, detentionData?.isGateAOpen ? '#22c55e' : '#38bdf8');
      drawTacticalBox(0, GATE_B_Z, 7.2, 1.2, detentionData?.isGateBOpen ? '#22c55e' : '#facc15');

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
          HUD.drawPulseMarker(ctx, kx, kz, '#38bdf8', 'rgba(56, 189, 248, 0.65)', 6.5 * pulse, 1.8, 4.2, 1.2);
          HUD.drawMarkerLabel(ctx, '🔑KEY A', kx, kz - 8, 'bold 9px sans-serif', '#38bdf8');
        }

        // 2. 黃色門禁卡 B
        if (!detentionData.hasKeycardB) {
          const kx = (detentionData.keycardBPos.x - playerPos.x) * mapScale;
          const kz = (detentionData.keycardBPos.z - playerPos.z) * mapScale;
          HUD.drawPulseMarker(ctx, kx, kz, '#facc15', 'rgba(250, 204, 21, 0.65)', 6.5 * pulse, 1.8, 4.2, 1.2);
          HUD.drawMarkerLabel(ctx, '🔑KEY B', kx, kz - 8, 'bold 9px sans-serif', '#facc15');
        }

        // 3. 萬能逃脫鑰匙卡 (金黃色傳奇標記)
        if (detentionData.masterKeycardPos && !detentionData.hasMasterKeycard) {
          const kx = (detentionData.masterKeycardPos.x - playerPos.x) * mapScale;
          const kz = (detentionData.masterKeycardPos.z - playerPos.z) * mapScale;
          HUD.drawPulseMarker(ctx, kx, kz, '#ffd700', 'rgba(255, 215, 0, 0.85)', 8.0 * pulse, 2.2, 5.0, 1.5);
          HUD.drawMarkerLabel(ctx, '★MASTER KEY', kx, kz - 10, 'bold 10px sans-serif', '#ffd700');
        }

        // 4. 重生存檔點 (綠色旗幟標記)
        if (detentionData.checkpointPos) {
          const cpx = (detentionData.checkpointPos.x - playerPos.x) * mapScale;
          const cpz = (detentionData.checkpointPos.z - playerPos.z) * mapScale;
          HUD.drawPulseMarker(ctx, cpx, cpz, '#22c55e', 'rgba(34, 197, 94, 0.75)', 6.0 * pulse, 1.5, 3.8, 1);
          HUD.drawMarkerLabel(ctx, '🚩CP', cpx, cpz - 8, 'bold 8.5px sans-serif', '#22c55e');
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
        const tier = guardAlertTier(npc);
        const dotColor = GUARD_DOT_COLORS[tier];
        const coneColor = GUARD_CONE_COLORS_RADAR[tier];

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
          HUD.drawMarkerLabel(ctx, '★BOSS [KEY]', nx, nz - 10, 'bold 9px sans-serif', '#ff4444');
        }
      }

      ctx.restore();

      // 玩家中央圖示 (地圖方位鎖定固定，以箭頭旋轉指出當前朝向)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(playerRotY);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 潛行模式指示 (玩家外圍柔和虛線圈；仍在玩家平移座標內，畫完重設虛線避免外洩至下一幀網格)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
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

    // 操場跑道與校園建築 (共用校園平面配置)
    this.drawCampusTrack(ctx, (CAMPUS_TRACK.x - playerPos.x) * mapScale, (CAMPUS_TRACK.z - playerPos.z) * mapScale, mapScale);
    for (const r of CAMPUS_MAP_RECTS) {
      drawBuilding(r.x, r.z, r.w, r.d, r.color);
    }

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
      const style = NPC_ROLE_MAP_STYLE[npc.role] || DEFAULT_NPC_MAP_STYLE;
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(nx, nz, style.radius, 0, Math.PI * 2);
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

  // 更新暗殺/擊昏提示 (動態浮動於目標 NPC 頭頂上方，僅顯示「擊暈」)
  private lastCqcVisible = false;
  private lastCqcX = -1;
  private lastCqcY = -1;

  public updateCqcPrompt(
    visible: boolean,
    screenX: number = 0,
    screenY: number = 0
  ) {
    const el = this.$('cqc-prompt-container');
    const x = Math.round(screenX);
    const y = Math.round(screenY);

    // 可見時僅於座標變動才更新位置；可見狀態切換才更新顯示與手機攻擊鈕
    if (el && visible && (x !== this.lastCqcX || y !== this.lastCqcY || !this.lastCqcVisible)) {
      // 以 transform 定位 (僅合成層更新，不觸發版面重排)；錨點為提示框底部中央
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      this.lastCqcX = x;
      this.lastCqcY = y;
    }
    if (visible === this.lastCqcVisible) return;
    this.lastCqcVisible = visible;

    const textEl = this.$('cqc-btn-text');
    const mobileAttackBtn = this.$('m-btn-attack');

    if (el) {
      if (visible) {
        el.style.display = 'flex';
        if (textEl) {
          textEl.textContent = '擊暈';
        }
      } else {
        el.style.display = 'none';
      }
    }

    // 手機端：直接聯動既有攻擊按鈕 (打 -> 擊暈)
    if (mobileAttackBtn) {
      if (visible) {
        mobileAttackBtn.classList.add('cqc-active');
        mobileAttackBtn.textContent = '擊暈';
      } else {
        mobileAttackBtn.classList.remove('cqc-active');
        mobileAttackBtn.textContent = '打';
      }
    }
  }

  // 刺客教條匿蹤藏匿提示 (身處草堆或隱蔽物中)
  private lastStealthKey: string | null = null;

  public updateStealthHiding(isHiding: boolean, spotName: string = '') {
    // 每幀呼叫：藏匿狀態與地點未變時略過 DOM 寫入
    const stateKey = isHiding ? spotName : '';
    if (stateKey === this.lastStealthKey) return;
    this.lastStealthKey = stateKey;
    const badge = this.$('ac-stealth-badge');
    const text = this.$('ac-stealth-badge-text');
    if (badge) {
      if (isHiding) {
        badge.style.display = 'flex';
        if (text) {
          text.textContent = `🥷 已匿蹤於 ${spotName} 中 (NPC 與探照燈無視)`;
        }
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // 更新 MGS 警戒倒數計時器
  private lastMgsPhase: 'NORMAL' | 'ALERT' | 'EVASION' | 'CAUTION' | null = null;

  // 第二世界全域警戒橫幅：ALERT (紅，被看見中不倒數) / EVASION (橘，搜索倒數) / CAUTION (黃，戒備倒數) / NORMAL 隱藏
  public updateMgsAlert(phase: 'NORMAL' | 'ALERT' | 'EVASION' | 'CAUTION', timer: number) {
    const banner = this.$('mgs-alert-banner');
    const label = this.$('mgs-alert-label');
    const val = this.$('mgs-alert-timer');
    if (!banner || !label || !val) return;
    if (phase !== this.lastMgsPhase) {
      this.lastMgsPhase = phase;
      // 警戒列顯示時標記 body，直屏橫幅據此下移避開 (僅於階段切換時更新，無每幀版面讀取)
      document.body.classList.toggle('mgs-alert-active', phase !== 'NORMAL');
      if (phase === 'NORMAL') {
        banner.style.display = 'none';
        return;
      }
      banner.style.display = 'flex';
      banner.classList.remove('mgs-phase-alert', 'mgs-phase-evasion', 'mgs-phase-caution');
      banner.classList.add(`mgs-phase-${phase.toLowerCase()}`);
      label.textContent = HUD.MGS_PHASE_LABEL[phase];
      if (phase === 'ALERT') val.textContent = '';
      this.lastMgsTimerTenths = -1;
    }
    if (phase === 'EVASION' || phase === 'CAUTION') {
      // 倒數顯示 0.1 秒精度：僅在顯示值變動時才格式化字串並寫入 DOM
      const tenths = Math.ceil(Math.max(0, timer) * 10);
      if (tenths !== this.lastMgsTimerTenths) {
        this.lastMgsTimerTenths = tenths;
        val.textContent = (tenths / 10).toFixed(1);
      }
    }
  }
  private lastMgsTimerTenths: number = -1;

  private static readonly MGS_PHASE_LABEL = {
    ALERT: '🚨 ALERT',
    EVASION: '⚠️ EVASION',
    CAUTION: '❓ CAUTION'
  } as const;

  // 慢動作處決特寫開始：電影黑邊與受擊閃白 (運鏡期間不顯示 QTE 打擊橫幅，避免遮擋畫面)
  public beginCinematicExecution(title: string, subtitle: string) {
    if (!this.cinematicBarsEl) return;
    if (this.cinemaQteBadgeEl) this.cinemaQteBadgeEl.textContent = title;
    if (this.cinemaQteSubEl) this.cinemaQteSubEl.textContent = subtitle;
    if (this.cinemaDismissTimer) clearTimeout(this.cinemaDismissTimer);
    this.cinemaDismissTimer = null;

    this.cinematicBarsEl.classList.remove('qte-show');
    this.cinematicBarsEl.classList.add('active');
    if (this.cinemaFlashEl) {
      this.cinemaFlashEl.classList.add('flash');
      setTimeout(() => {
        if (this.cinemaFlashEl) this.cinemaFlashEl.classList.remove('flash');
      }, 140);
    }
  }

  // 處決特寫結束：收起黑邊，恢復操控後短暫顯示 QTE 打擊橫幅 (resultMs 為 0 則不顯示)，結束後呼叫 onDone
  public endCinematicExecution(resultMs: number, onDone?: () => void) {
    if (this.cinemaDismissTimer) clearTimeout(this.cinemaDismissTimer);
    this.cinemaDismissTimer = null;
    const bars = this.cinematicBarsEl;
    if (!bars) {
      onDone?.();
      return;
    }
    bars.classList.remove('active');
    if (resultMs <= 0) {
      bars.classList.remove('qte-show');
      onDone?.();
      return;
    }
    bars.classList.add('qte-show');
    this.cinemaDismissTimer = setTimeout(() => {
      this.cinemaDismissTimer = null;
      bars.classList.remove('qte-show');
      onDone?.();
    }, resultMs);
  }

  // 顯示特訓院絕境越獄通關結算對話框
  public showDetentionVictory(
    escapeTimeSec: number,
    takedowns: number,
    frontalKos: number,
    alerts: number,
    onReplay: () => void,
    onReturnCampus: () => void
  ) {
    const modal = document.getElementById('detention-victory-modal');
    if (!modal) return;

    // 1. 立即解除滑鼠指標鎖定 (Pointer Lock)，使 PC 玩家滑鼠指標可自由點選操作
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    modal.style.display = 'flex';

    const min = Math.floor(escapeTimeSec / 60).toString().padStart(2, '0');
    const sec = Math.floor(escapeTimeSec % 60).toString().padStart(2, '0');
    const timeEl = document.getElementById('stat-escape-time');
    const takedownsEl = document.getElementById('stat-escape-takedowns');
    const frontalEl = document.getElementById('stat-escape-frontal');
    const ratioEl = document.getElementById('stat-escape-ratio');
    const alertsEl = document.getElementById('stat-escape-alerts');
    const badgeEl = document.getElementById('escape-rank-badge');
    const titleEl = document.getElementById('escape-rank-title');

    if (timeEl) timeEl.textContent = `${min}:${sec}`;
    if (takedownsEl) takedownsEl.textContent = `${takedowns} 人`;
    if (frontalEl) frontalEl.textContent = `${frontalKos} 人`;
    if (ratioEl) ratioEl.textContent = `${takedowns} : ${frontalKos}`;
    if (alertsEl) alertsEl.textContent = `${alerts} 次`;

    const { rank, title, color } = getEscapeRank(escapeTimeSec, alerts, frontalKos);

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

    // 防誤觸保護期 (300ms)：避免玩家在通關那一瞬的按鍵/點擊立刻將結算跳過
    let canDismiss = false;
    const dismissTimer = setTimeout(() => {
      canDismiss = true;
    }, 300);

    const cleanupAndDismiss = (action: () => void) => {
      clearTimeout(dismissTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onGlobalClick);
      window.removeEventListener('touchend', onGlobalTouch);
      modal.style.display = 'none';
      action();
    };

    // PC 端：空白鍵 (Space) / Enter / Escape 回主畫面
    const onKeyDown = (e: KeyboardEvent) => {
      if (!canDismiss) return;
      if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanupAndDismiss(onReturnCampus);
      }
    };

    // Mobile 手機端任意點擊 / 觸控 或 PC 滑鼠點擊回主畫面 (點「重新挑戰」除外)
    const onGlobalClick = (e: MouseEvent) => {
      if (!canDismiss) return;
      if (replayBtn && replayBtn.contains(e.target as Node)) {
        cleanupAndDismiss(onReplay);
      } else {
        cleanupAndDismiss(onReturnCampus);
      }
    };

    const onGlobalTouch = (e: TouchEvent) => {
      if (!canDismiss) return;
      if (replayBtn && replayBtn.contains(e.target as Node)) {
        cleanupAndDismiss(onReplay);
      } else {
        cleanupAndDismiss(onReturnCampus);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    setTimeout(() => {
      window.addEventListener('click', onGlobalClick);
      window.addEventListener('touchend', onGlobalTouch);
    }, 150);

    if (replayBtn) {
      replayBtn.onclick = (e) => {
        e.stopPropagation();
        cleanupAndDismiss(onReplay);
      };
    }
    if (campusBtn) {
      campusBtn.onclick = (e) => {
        e.stopPropagation();
        cleanupAndDismiss(onReturnCampus);
      };
    }
  }

  // 更新特訓院越獄任務面板
  private lastEscapeTrackerKey = -1;

  public updateWorld2EscapeTracker(
    takedowns: number,
    gateAOpen: boolean,
    gateBOpen: boolean,
    bossHp: number,
    bossMaxHp: number,
    isBossDefeated: boolean,
    isEscapeComplete: boolean
  ) {
    // 每幀呼叫：所有輸入值未變時略過 DOM 寫入
    // 數值鍵 (不產生每幀字串)：擊昏數、Boss 血量/上限與四個旗標
    const flags = (gateAOpen ? 1 : 0) | (gateBOpen ? 2 : 0) | (isBossDefeated ? 4 : 0) | (isEscapeComplete ? 8 : 0);
    const stateKey = ((takedowns * 10000 + Math.ceil(bossHp)) * 10000 + bossMaxHp) * 16 + flags;
    const campusWrapper = this.$('campus-quest-wrapper');
    const detentionWrapper = this.$('detention-quest-wrapper');
    if (stateKey === this.lastEscapeTrackerKey && detentionWrapper && detentionWrapper.style.display === 'block') return;
    this.lastEscapeTrackerKey = stateKey;
    if (campusWrapper && detentionWrapper) {
      campusWrapper.style.display = 'none';
      detentionWrapper.style.display = 'block';
    }
    // 特訓院僅單一任務分類，隱藏分類標籤並顯示逃脫任務總進度
    if (this.questTabsBar) this.questTabsBar.style.display = 'none';
    const escapeDone = (takedowns > 0 ? 1 : 0) + (gateAOpen ? 1 : 0) + (gateBOpen ? 1 : 0) + (isBossDefeated ? 1 : 0) + (isEscapeComplete ? 1 : 0);
    this.setQuestSummary('⛓️ 逃脫任務', escapeDone, 5);

    const koCountEl = this.$('det-ko-count');
    const koStatusEl = this.$('det-ko-status');
    if (koCountEl) koCountEl.textContent = `${takedowns}`;
    if (koStatusEl) {
      koStatusEl.textContent = takedowns > 0 ? `已排除 ${takedowns}` : '進行中';
      koStatusEl.className = 'q-status completed';
    }

    const g1El = this.$('det-gate1-status');
    if (g1El) {
      g1El.textContent = gateAOpen ? '已開啟' : '未解鎖';
      g1El.className = gateAOpen ? 'q-status completed' : 'q-status';
    }

    const g2El = this.$('det-gate2-status');
    if (g2El) {
      g2El.textContent = gateBOpen ? '已開啟' : '未解鎖';
      g2El.className = gateBOpen ? 'q-status completed' : 'q-status';
    }

    const bossEl = this.$('det-boss-status');
    if (bossEl) {
      bossEl.textContent = isBossDefeated ? '已擊破' : `${bossHp}/${bossMaxHp}`;
      bossEl.className = isBossDefeated ? 'q-status completed' : 'q-status';
    }

    const escEl = this.$('det-escape-status');
    if (escEl) {
      escEl.textContent = isEscapeComplete ? '已逃脫' : '未完成';
      escEl.className = isEscapeComplete ? 'q-status completed' : 'q-status';
    }
  }

  // 繪製全螢幕全域態勢戰術大地圖 (Full Map Modal Canvas)
  // 大地圖靜態底圖離屏快取
  private fullmapStaticCanvas: HTMLCanvasElement | null = null;
  private fullmapStaticKey = '';
  private lastFullmapHeaderWorld: 'CAMPUS' | 'DETENTION' | null = null;
  private lastFullmapRenderAt = 0;
  private fullmapCssSide = 700;
  // 大地圖以 700×700 邏輯座標繪製，經 setTransform 縮放至實際畫布解析度
  private static readonly FULLMAP_LOGICAL = 700;

  // 大地圖標籤字級：隨地圖尺寸放大，且不低於 13px (窄螢幕 11px) 的實際顯示字級
  // 雷達/大地圖共用的脈衝標記 (外圈擴散環 + 核心光點；coreStrokeWidth > 0 時核心加白色描邊)
  private static drawPulseMarker(
    ctx: CanvasRenderingContext2D, x: number, y: number, color: string,
    ringColor: string, ringR: number, ringWidth: number, coreR: number, coreStrokeWidth: number
  ) {
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();
    if (coreStrokeWidth > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = coreStrokeWidth;
      ctx.stroke();
    }
  }

  // 雷達直立文字標籤 (雷達畫面不旋轉，直接置中繪製，無需 save/translate/restore)
  private static drawMarkerLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private fmFont(size: number): string {
    const minCss = this.fullmapCssSide < 520 ? 11 : 13;
    const minLogical = minCss * HUD.FULLMAP_LOGICAL / this.fullmapCssSide;
    return `bold ${Math.max(size * 1.45, minLogical).toFixed(1)}px sans-serif`;
  }

  // 大地圖標籤：深色描邊光暈 + 填色，確保壓在建築與網格上仍清晰可讀
  private fmText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    const prevStroke = ctx.strokeStyle;
    const prevWidth = ctx.lineWidth;
    const px = parseFloat(ctx.font.split(' ')[1]) || 12;
    ctx.strokeStyle = 'rgba(2, 6, 11, 0.92)';
    ctx.lineWidth = px * 0.3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.strokeStyle = prevStroke;
    ctx.lineWidth = prevWidth;
  }

  private getFullmapStaticCtx(w: number, h: number): CanvasRenderingContext2D {
    if (!this.fullmapStaticCanvas) this.fullmapStaticCanvas = document.createElement('canvas');
    this.fullmapStaticCanvas.width = w;
    this.fullmapStaticCanvas.height = h;
    return this.fullmapStaticCanvas.getContext('2d')!;
  }

  // 繪製操場橢圓跑道 (紅磚 PU 跑道 + 內圈草皮)，cx/cz 為跑道中心於畫布上的位置
  private drawCampusTrack(ctx: CanvasRenderingContext2D, cx: number, cz: number, scale: number) {
    const sHalf = CAMPUS_TRACK.straightHalf * scale;
    const rInner = CAMPUS_TRACK.innerR * scale;
    const rLane = (CAMPUS_TRACK.innerR + CAMPUS_TRACK.outerR) / 2 * scale;

    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = (CAMPUS_TRACK.outerR - CAMPUS_TRACK.innerR) * scale;
    ctx.beginPath();
    ctx.moveTo(cx + rLane, cz - sHalf);
    ctx.lineTo(cx + rLane, cz + sHalf);
    ctx.arc(cx, cz + sHalf, rLane, 0, Math.PI, false);
    ctx.lineTo(cx - rLane, cz - sHalf);
    ctx.arc(cx, cz - sHalf, rLane, Math.PI, Math.PI * 2, false);
    ctx.stroke();

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(cx + rInner, cz - sHalf);
    ctx.lineTo(cx + rInner, cz + sHalf);
    ctx.arc(cx, cz + sHalf, rInner, 0, Math.PI, false);
    ctx.lineTo(cx - rInner, cz - sHalf);
    ctx.arc(cx, cz - sHalf, rInner, Math.PI, Math.PI * 2, false);
    ctx.fill();
  }

  // 大地圖標題列 / 圖例 / 學生證 / 下一步目標 / 戰績 (約 20Hz；所有寫入皆為髒檢查)
  private fullmapGoal: FullMapGoal | null = null;
  private lastFullmapTitle = '';
  private refreshFullMapPanels(
    playerPos: THREE.Vector3,
    npcs: NPC[],
    currentWorld: 'CAMPUS' | 'DETENTION',
    detentionData?: DetentionRadarData
  ) {
    const panels = this.fullmapPanels;
    const isDet = currentWorld === 'DETENTION';
    panels.setWorld(currentWorld);
    if (this.lastFullmapHeaderWorld !== currentWorld) {
      this.lastFullmapHeaderWorld = currentWorld;
      if (this.fullmapLegendCampusEl) this.fullmapLegendCampusEl.style.display = isDet ? 'none' : 'flex';
      if (this.fullmapLegendDetentionEl) this.fullmapLegendDetentionEl.style.display = isDet ? 'flex' : 'none';
    }
    // 標題列小字：目前區域 (去掉括號補充說明) + 天氣圖示
    const weatherIcon = this.lastWeatherBadge.split(' ')[0];
    const title = `🗺️ ${this.lastLocationZone.replace(/\s*[（(].*?[）)]/g, '')}${weatherIcon ? `　${weatherIcon}` : ''}`;
    if (this.fullmapTitleEl && title !== this.lastFullmapTitle) {
      this.lastFullmapTitle = title;
      this.fullmapTitleEl.textContent = title;
    }

    const st = this.getFullMapStatus?.();
    if (!st) return;
    if (this.fullmapTab === 'quest') {
      if (isDet) panels.updateDetentionStats(st);
      return;
    }
    if (this.fullmapTab !== 'map') return;
    panels.updateIdCard(st, this.lastWeaponIcon, this.lastWeaponAtk, this.lastLocationZone);

    let goal: FullMapGoal | null = null;
    if (isDet) {
      if (detentionData) {
        let bossPos: { x: number; z: number } | null = null;
        for (const npc of npcs) {
          if (npc.role === 'DETENTION_BOSS' && !npc.isPermanentlyKnockedOut && npc.hp > 0) { bossPos = npc.position; break; }
        }
        goal = pickDetentionGoal(detentionData, bossPos);
      }
    } else if (this.lastMissionData) {
      goal = pickCampusGoal(this.lastMissionData);
    } else {
      return;
    }
    this.fullmapGoal = goal;
    const dist = goal ? `距離約 ${Math.round(Math.hypot(playerPos.x - goal.x, playerPos.z - goal.z))} m` : '';
    panels.updateGoal(goal, dist);
  }

  // 繪製指北針 (靜態圖層用)
  private drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(5, 0);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.font = this.fmFont(9);
    ctx.textAlign = 'center';
    this.fmText(ctx, 'N', 0, -17);
    ctx.restore();
  }

  // 繪製 20m 比例尺 (靜態圖層用)
  private drawScaleBar(ctx: CanvasRenderingContext2D, scale: number) {
    const x = 16;
    const y = HUD.FULLMAP_LOGICAL - 18;
    const len = 20 * scale;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x + len, y - 5);
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = this.fmFont(8.5);
    ctx.textAlign = 'left';
    this.fmText(ctx, '20 m', x, y - 9);
  }

  // 玩家座標小字 (動態圖層，緊鄰比例尺)
  private drawCoords(ctx: CanvasRenderingContext2D, pos: THREE.Vector3, scale: number) {
    ctx.font = this.fmFont(8.5);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    this.fmText(ctx, `X ${Math.round(pos.x)} · Z ${Math.round(pos.z)}`, 16 + 20 * scale + 12, HUD.FULLMAP_LOGICAL - 14);
    ctx.textAlign = 'center';
  }

  // 下一步目標脈衝環 (每幀最多 1 個)
  private drawGoalPulse(ctx: CanvasRenderingContext2D, x: number, y: number, pulse: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 15 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private renderFullMap(
    playerPos: THREE.Vector3,
    playerRotY: number,
    npcs: NPC[],
    bicycles: Bicycle[],
    currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS',
    detentionData?: DetentionRadarData
  ) {
    if (!this.fullmapCanvas || !this.fullmapCtx) return;
    const outCtx = this.fullmapCtx;
    // 靜態底圖 (建築、迷宮、跑道等) 繪於離屏畫布並快取；世界或閘門狀態變更時才重繪，每幀僅疊加動態標記
    let ctx: CanvasRenderingContext2D = outCtx;
    const bw = this.fullmapCanvas.width;
    const bh = this.fullmapCanvas.height;
    const k = bw / HUD.FULLMAP_LOGICAL;
    outCtx.setTransform(k, 0, 0, k, 0, 0);
    const w = HUD.FULLMAP_LOGICAL;
    const h = HUD.FULLMAP_LOGICAL;
    const cx = w / 2;
    const cy = h / 2;
    // 縮放比：校園全圖 200m 映射到約 630px；特訓院依院區範圍 (±97m) 自動貼合畫布
    const scale = currentWorld === 'DETENTION' ? (w - 20) / 194 : 3.15;

    const now = performance.now();
    const pulse = 1.0 + 0.3 * Math.sin(now * 0.008);

    if (currentWorld === 'DETENTION') {
      // 輔助函式：全圖坐標系轉換 (以世界原點 (0,0) 為中心，北方朝上 -Z)
      const toScreenX = (wx: number) => cx + wx * scale;
      const toScreenY = (wz: number) => cy + wz * scale;

      const drawBox = (bx: number, bz: number, bw: number, bd: number, fill: string, stroke: string) => {
        const sx = toScreenX(bx - bw / 2);
        const sy = toScreenY(bz - bd / 2);
        ctx.fillStyle = fill;
        ctx.fillRect(sx, sy, bw * scale, bd * scale);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx, sy, bw * scale, bd * scale);
      };

      const staticKey = `DETENTION|${detentionData?.isGateAOpen}|${detentionData?.isGateBOpen}|${detentionData?.isSouthGateOpen}|${bw}x${bh}`;
      if (this.fullmapStaticKey !== staticKey) {
      this.fullmapStaticKey = staticKey;
      ctx = this.getFullmapStaticCtx(bw, bh);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      // 1. 深邃軍規情報雷達底色
      ctx.fillStyle = '#02100b';
      ctx.fillRect(0, 0, w, h);

      // 戰略網格 (Grid Lines 每 20m 一條)
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.lineWidth = 1;
      for (let g = -100; g <= 100; g += 20) {
        const gx = cx + g * scale;
        const gy = cy + g * scale;
        ctx.beginPath();
        ctx.moveTo(gx, cy - 100 * scale);
        ctx.lineTo(gx, cy + 100 * scale);
        ctx.moveTo(cx - 100 * scale, gy);
        ctx.lineTo(cx + 100 * scale, gy);
        ctx.stroke();
      }

      // 同心圓環
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, 35 * scale, 0, Math.PI * 2);
      ctx.arc(cx, cy, 70 * scale, 0, Math.PI * 2);
      ctx.arc(cx, cy, 95 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // 外圍高壓電鐵絲網圍牆 (X: -95 ~ 95, Z: -95 ~ 95)
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(toScreenX(-95), toScreenY(-95), 190 * scale, 190 * scale);

      // 道路骨架 (收容車道、外圍巡邏路、中軸路、廣場路與服務巷)
      ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
      for (const r of DETENTION_ROADS) {
        ctx.fillRect(toScreenX(r.minX), toScreenY(r.minZ), (r.maxX - r.minX) * scale, (r.maxZ - r.minZ) * scale);
      }

      // 瞭望塔與中央探照燈塔
      for (const tw of DETENTION_TOWERS) {
        drawBox(tw.x, tw.z, 6.5, 6.5, 'rgba(56, 189, 248, 0.25)', '#38bdf8');
      }
      drawBox(SEARCHLIGHT_TOWER.x, SEARCHLIGHT_TOWER.z, 4, 4, 'rgba(250, 204, 21, 0.3)', '#facc15');

      // 場景建物、圍籬、貨櫃與掩體 (與 DetentionWorld 共用配置資料)
      for (const f of DETENTION_MAP_FEATURES) {
        const style = DETENTION_FULLMAP_STYLES[f.kind];
        drawBox((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2, f.maxX - f.minX, f.maxZ - f.minZ, style.fill, style.stroke);
      }

      // 標籤碰撞迴避：依序嘗試置中/上/下/左/右，與已放置標籤重疊則換位，全部重疊則省略
      const placedLabels: { x0: number; x1: number; y0: number; y1: number }[] = [];
      const reserveLabel = (x: number, y: number, halfW: number, halfH: number) => {
        placedLabels.push({ x0: x - halfW, x1: x + halfW, y0: y - halfH, y1: y + halfH });
      };
      // 閘門與南大門狀態標籤稍後繪製，先保留其位置
      reserveLabel(toScreenX(0), toScreenY(-28) - 10, 85, 9);
      reserveLabel(toScreenX(0), toScreenY(35) - 10, 85, 9);
      reserveLabel(toScreenX(0), toScreenY(95) + 10, 110, 9);
      const placeLabel = (text: string, x: number, y: number, size: number, color: string) => {
        ctx.font = this.fmFont(size);
        const halfW = ctx.measureText(text).width / 2 + 3;
        const halfH = (parseFloat(ctx.font.split(' ')[1]) || 12) * 0.6;
        const offsets = [[0, 0], [0, -halfH * 2.2], [0, halfH * 2.2], [halfW + 4, 0], [-halfW - 4, 0]];
        for (const [ox, oy] of offsets) {
          const lx = x + ox, ly = y + oy;
          if (lx - halfW < 0 || lx + halfW > w || ly - halfH < 0 || ly + halfH > h) continue;
          if (placedLabels.some((o) => !(lx + halfW < o.x0 || lx - halfW > o.x1 || ly + halfH < o.y0 || ly - halfH > o.y1))) continue;
          placedLabels.push({ x0: lx - halfW, x1: lx + halfW, y0: ly - halfH, y1: ly + halfH });
          ctx.fillStyle = color;
          this.fmText(ctx, text, lx, ly + halfH * 0.55);
          return;
        }
      };
      ctx.textAlign = 'center';
      // 字級依建物面積：大型樓房較大、小型崗哨較小
      const labeled = DETENTION_MAP_FEATURES.filter((f) => f.label)
        .map((f) => ({ f, area: (f.maxX - f.minX) * (f.maxZ - f.minZ) }))
        .sort((a, b) => b.area - a.area);
      for (const { f, area } of labeled) {
        const size = Math.min(12, Math.max(8, 6.5 + Math.sqrt(area) / 4));
        placeLabel(f.label!, toScreenX((f.minX + f.maxX) / 2), toScreenY((f.minZ + f.maxZ) / 2), size, f.kind === 'building' ? '#34d399' : '#a7f3d0');
      }
      for (const al of DETENTION_MAP_AREA_LABELS) {
        placeLabel(al.text, toScreenX(al.x), toScreenY(al.z), 8.5, 'rgba(203, 213, 225, 0.85)');
      }

      // 管制閘門 1 (Z = -28)
      const gate1Col = detentionData?.isGateAOpen ? '#22c55e' : '#38bdf8';
      for (const w of GATE_WALLS) {
        drawBox((w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2, w.maxX - w.minX, 1.2, 'rgba(6, 78, 59, 0.8)', '#34d399');
      }
      drawBox(0, GATE_A_Z, 7.2, 1.4, detentionData?.isGateAOpen ? 'rgba(34, 197, 94, 0.4)' : 'rgba(56, 189, 248, 0.5)', gate1Col);
      ctx.fillStyle = gate1Col;
      ctx.font = this.fmFont(9.5);
      this.fmText(ctx, detentionData?.isGateAOpen ? '閘門 1 [已解鎖]' : '閘門 1 [需 KEY A]', toScreenX(0), toScreenY(-28) - 6);

      // 管制閘門 2 (Z = 35)
      const gate2Col = detentionData?.isGateBOpen ? '#22c55e' : '#facc15';
      drawBox(0, GATE_B_Z, 7.2, 1.4, detentionData?.isGateBOpen ? 'rgba(34, 197, 94, 0.4)' : 'rgba(250, 204, 21, 0.5)', gate2Col);
      ctx.fillStyle = gate2Col;
      ctx.font = this.fmFont(9.5);
      this.fmText(ctx, detentionData?.isGateBOpen ? '閘門 2 [已解鎖]' : '閘門 2 [需 KEY B]', toScreenX(0), toScreenY(35) - 6);

      // 南側脫逃大門 (Z = 95)
      const southCol = detentionData?.isSouthGateOpen ? '#22c55e' : '#ef4444';
      drawBox(0, 95, 20.4, 2.0, detentionData?.isSouthGateOpen ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.5)', southCol);
      ctx.fillStyle = southCol;
      ctx.font = this.fmFont(10);
      this.fmText(ctx, detentionData?.isSouthGateOpen ? '南大門 [已升起脫逃通道]' : '南大門 [需要萬能鑰匙卡]', toScreenX(0), toScreenY(95) + 14);
      // 指北針與比例尺 (靜態元素併入快取圖層，不再每幀重繪)
      this.drawCompass(ctx, w - 38, 42);
      this.drawScaleBar(ctx, scale);
      ctx = outCtx;
      }
      outCtx.setTransform(1, 0, 0, 1, 0, 0);
      outCtx.drawImage(this.fullmapStaticCanvas!, 0, 0);
      outCtx.setTransform(k, 0, 0, k, 0, 0);
      outCtx.textAlign = 'center';

      // 鑰匙卡標記
      if (detentionData) {
        // Keycard A
        if (!detentionData.hasKeycardA) {
          const kx = toScreenX(detentionData.keycardAPos.x);
          const ky = toScreenY(detentionData.keycardAPos.z);
          HUD.drawPulseMarker(ctx, kx, ky, '#38bdf8', '#38bdf8', 8 * pulse, 2, 5, 0);
          ctx.font = this.fmFont(10);
          this.fmText(ctx, '🔑 KEY A', kx, ky - 10);
        }
        // Keycard B
        if (!detentionData.hasKeycardB) {
          const kx = toScreenX(detentionData.keycardBPos.x);
          const ky = toScreenY(detentionData.keycardBPos.z);
          HUD.drawPulseMarker(ctx, kx, ky, '#facc15', '#facc15', 8 * pulse, 2, 5, 0);
          ctx.font = this.fmFont(10);
          this.fmText(ctx, '🔑 KEY B', kx, ky - 10);
        }
        // Master Keycard
        if (detentionData.masterKeycardPos && !detentionData.hasMasterKeycard) {
          const kx = toScreenX(detentionData.masterKeycardPos.x);
          const ky = toScreenY(detentionData.masterKeycardPos.z);
          HUD.drawPulseMarker(ctx, kx, ky, '#ffd700', '#ffd700', 10 * pulse, 2.5, 6, 0);
          ctx.font = this.fmFont(10.5);
          this.fmText(ctx, '★ MASTER KEY', kx, ky - 12);
        }
      }

      // 重生存檔點標記 (當前活躍重生點)
      if (detentionData?.checkpointPos) {
        const cpx = toScreenX(detentionData.checkpointPos.x);
        const cpy = toScreenY(detentionData.checkpointPos.z);
        HUD.drawPulseMarker(ctx, cpx, cpy, '#22c55e', '#22c55e', 9 * pulse, 2.5, 5.5, 0);
        ctx.fillStyle = '#ffffff';
        ctx.font = this.fmFont(9.5);
        this.fmText(ctx, `🚩 重生點 [${detentionData.checkpointName || '存檔點'}]`, cpx, cpy + 16);
      }

      // 繪製敵方 NPC 及其 90° 視野錐
      for (const npc of npcs) {
        const nx = toScreenX(npc.position.x);
        const ny = toScreenY(npc.position.z);

        if (npc.isPermanentlyKnockedOut || (npc.hp <= 0 && npc.isKnockedDown)) {
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(nx - 4, ny - 4);
          ctx.lineTo(nx + 4, ny + 4);
          ctx.moveTo(nx + 4, ny - 4);
          ctx.lineTo(nx - 4, ny + 4);
          ctx.stroke();
          continue;
        }

        const isBoss = npc.role === 'DETENTION_BOSS';
        const tier = guardAlertTier(npc);
        const dotColor = GUARD_DOT_COLORS[tier];
        const coneColor = GUARD_CONE_COLORS_FULLMAP[tier];

        const ang = npc.rotationY;
        const coneDist = (isBoss ? 24 : 18) * scale;
        const fovHalf = Math.PI / 4;

        ctx.fillStyle = coneColor;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.arc(nx, ny, coneDist, ang - fovHalf + Math.PI / 2, ang + fovHalf + Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(nx, ny, isBoss ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (isBoss) {
          ctx.fillStyle = '#ff4444';
          ctx.font = this.fmFont(9.5);
          this.fmText(ctx, '★ 鐵面總長 (BOSS)', nx, ny - 10);
        }
      }

      if (this.fullmapGoal) this.drawGoalPulse(ctx, toScreenX(this.fullmapGoal.x), toScreenY(this.fullmapGoal.z), pulse, '#34d399');
      this.drawCoords(ctx, playerPos, scale);

      // 玩家圖示 (亮黃光芒 + 面向箭頭 + 脈衝雷達圈)
      const px = toScreenX(playerPos.x);
      const py = toScreenY(playerPos.z);

      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 11 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(playerRotY);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 3.5);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#facc15';
      ctx.font = this.fmFont(11);
      ctx.textAlign = 'center';
      this.fmText(ctx, 'YOU (主角)', px, py - 14);

      return;
    }

    // ==========================================
    // 天天國中 Campus World 大地圖
    // ==========================================
    const toScreenX = (wx: number) => cx + wx * scale;
    const toScreenY = (wz: number) => cy + wz * scale;

    const poiDoneMask = campusPoiDoneMask(this.lastMissionData);
    const campusStaticKey = `CAMPUS|${bw}x${bh}|${poiDoneMask}`;
    if (this.fullmapStaticKey !== campusStaticKey) {
    this.fullmapStaticKey = campusStaticKey;
    ctx = this.getFullmapStaticCtx(bw, bh);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // 校外街道底色 + 校園地面 (校牆 ±105m)
    ctx.fillStyle = '#070c14';
    ctx.fillRect(0, 0, w, h);
    const wallMin = toScreenX(-CAMPUS_WALL_HALF);
    const wallSize = CAMPUS_WALL_HALF * 2 * scale;
    ctx.fillStyle = '#0f1b2d';
    ctx.fillRect(wallMin, toScreenY(-CAMPUS_WALL_HALF), wallSize, wallSize);

    // 戰術網格 (每 20m 一條)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = -100; g <= 100; g += 20) {
      ctx.moveTo(toScreenX(g), toScreenY(-CAMPUS_WALL_HALF));
      ctx.lineTo(toScreenX(g), toScreenY(CAMPUS_WALL_HALF));
      ctx.moveTo(wallMin, toScreenY(g));
      ctx.lineTo(wallMin + wallSize, toScreenY(g));
    }
    ctx.stroke();

    const drawBuilding = (bx: number, bz: number, bw: number, bd: number, color: string, label?: string) => {
      const sx = toScreenX(bx - bw / 2);
      const sy = toScreenY(bz - bd / 2);
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, bw * scale, bd * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(sx, sy, bw * scale, bd * scale);
      if (label) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = this.fmFont(10);
        ctx.textAlign = 'center';
        // 建築內含興趣點圖示時，標籤改貼建築下緣避開圖示
        const hasPoi = CAMPUS_POIS.some((p) => p.icon && !isCampusPoiHidden(poiDoneMask, p.id) && Math.abs(p.x - bx) <= bw / 2 && Math.abs(p.z - bz) <= bd / 2);
        this.fmText(ctx, label, toScreenX(bx), hasPoi ? toScreenY(bz + bd / 2) - 3 : toScreenY(bz) + 3);
      }
    };

    // 操場跑道 (先繪於底層，建築標籤覆蓋其上)
    this.drawCampusTrack(ctx, toScreenX(CAMPUS_TRACK.x), toScreenY(CAMPUS_TRACK.z), scale);

    // 校園建築與設施 (共用校園平面配置)
    for (const r of CAMPUS_MAP_RECTS) {
      drawBuilding(r.x, r.z, r.w, r.d, r.color, r.label || undefined);
    }

    // 校牆、校門 (兩根門柱 + 金色門扇) 與警衛室
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(wallMin, toScreenY(-CAMPUS_WALL_HALF), wallSize, wallSize);
    const gateY = toScreenY(CAMPUS_GATE.z);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(toScreenX(CAMPUS_GATE.x - CAMPUS_GATE.pillarHalfSpan), gateY);
    ctx.lineTo(toScreenX(CAMPUS_GATE.x + CAMPUS_GATE.pillarHalfSpan), gateY);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    for (const sign of [-1, 1]) ctx.fillRect(toScreenX(CAMPUS_GATE.x + sign * CAMPUS_GATE.pillarHalfSpan) - 2.5 * scale, gateY - 1.5 * scale, 5 * scale, 3 * scale);
    drawBuilding(CAMPUS_GUARD_HOUSE.x, CAMPUS_GUARD_HOUSE.z, CAMPUS_GUARD_HOUSE.w, CAMPUS_GUARD_HOUSE.d, '#94a3b8');
    ctx.fillStyle = '#e2e8f0';
    ctx.font = this.fmFont(8.5);
    ctx.textAlign = 'center';
    this.fmText(ctx, '警衛室', toScreenX(CAMPUS_GUARD_HOUSE.x), toScreenY(CAMPUS_GUARD_HOUSE.z) - CAMPUS_GUARD_HOUSE.d / 2 * scale - 4);

    // 中庭標示
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = this.fmFont(10);
    this.fmText(ctx, '教學中庭', toScreenX(0), toScreenY(28));

    // 興趣點圖示 (已完成者變灰並加 ✓)
    const iconFont = `${Math.max(11 * 1.45, 13 * HUD.FULLMAP_LOGICAL / this.fullmapCssSide).toFixed(1)}px sans-serif`;
    ctx.font = iconFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const poi of CAMPUS_POIS) {
      if (!poi.icon || isCampusPoiHidden(poiDoneMask, poi.id)) continue;
      const done = isCampusPoiDone(poiDoneMask, poi.id);
      const px0 = toScreenX(poi.x);
      const py0 = toScreenY(poi.z);
      ctx.globalAlpha = done ? 0.4 : 1;
      ctx.fillStyle = 'rgba(2, 6, 11, 0.8)';
      ctx.beginPath();
      ctx.arc(px0, py0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = done ? '#64748b' : '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(poi.icon, px0, py0 + 1);
      ctx.globalAlpha = 1;
      if (done) {
        ctx.fillStyle = '#22c55e';
        ctx.font = `bold ${(10 * 1.45).toFixed(1)}px sans-serif`;
        ctx.fillText('✓', px0 + 9, py0 - 9);
        ctx.font = iconFont;
      }
    }
    ctx.textBaseline = 'alphabetic';

    this.drawCompass(ctx, w - 38, 42);
    this.drawScaleBar(ctx, scale);
    ctx = outCtx;
    }
    outCtx.setTransform(1, 0, 0, 1, 0, 0);
    outCtx.drawImage(this.fullmapStaticCanvas!, 0, 0);
    outCtx.setTransform(k, 0, 0, k, 0, 0);
    outCtx.textAlign = 'center';

    // 自行車
    for (const bike of bicycles) {
      const bx = toScreenX(bike.position.x);
      const bz = toScreenY(bike.position.z);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(bx, bz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // NPC
    for (const npc of npcs) {
      const nx = toScreenX(npc.position.x);
      const nz = toScreenY(npc.position.z);
      ctx.fillStyle = (NPC_ROLE_MAP_STYLE[npc.role] || DEFAULT_NPC_MAP_STYLE).color;
      ctx.beginPath();
      ctx.arc(nx, nz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 下一步目標脈衝環 + 玩家座標
    if (this.fullmapGoal) this.drawGoalPulse(ctx, toScreenX(this.fullmapGoal.x), toScreenY(this.fullmapGoal.z), pulse, '#38bdf8');
    this.drawCoords(ctx, playerPos, scale);

    // 玩家
    const px = toScreenX(playerPos.x);
    const py = toScreenY(playerPos.z);

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 10 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(playerRotY);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#facc15';
    ctx.font = this.fmFont(10);
    ctx.textAlign = 'center';
    this.fmText(ctx, 'YOU (主角)', px, py - 12);
  }
}
