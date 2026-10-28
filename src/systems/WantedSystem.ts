import { soundManager } from '../audio/SoundEffects';

export class WantedSystem {
  public stars: number = 0; // 0 ~ 5 級記過懲戒
  public escapeTimer: number = 0;
  public isEvading: boolean = false;
  private _currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
  // 切換世界時立即刷新處分狀態標籤 (避免切回校園仍顯示第二世界的「隱蔽安全」)
  public get currentWorld(): 'CAMPUS' | 'DETENTION' {
    return this._currentWorld;
  }
  public set currentWorld(world: 'CAMPUS' | 'DETENTION') {
    if (world === this._currentWorld) return;
    this._currentWorld = world;
    this.updateHUDStars();
  }
  private isSpottedThisFrame: boolean = false;
  private bannerTimeout: number = 0;
  public onWantedCleared?: () => void;

  constructor() {
    this.updateHUDStars();
  }

  // 獲取當前記過處分或特訓院警戒等級稱號
  public getDemeritLevelTitle(level: number): string {
    if (this.currentWorld === 'DETENTION') {
      switch (level) {
        case 1: return '一級戒備 (警衛注意)';
        case 2: return '二級戒備 (哨戒搜索)';
        case 3: return '三級戒備 (警戒升級)';
        case 4: return '四級戒備 (區域封鎖)';
        case 5: return '五級戒備 (全院圍剿追捕)';
        default: return '隱蔽安全';
      }
    }
    switch (level) {
      case 1: return '警告 1 次';
      case 2: return '記小過 1 次';
      case 3: return '記小過 2 次';
      case 4: return '記大過 1 次';
      case 5: return '記大過 2 次 (留校察看)';
      default: return '操行優良';
    }
  }

  public reportCrime(amount: number = 1, reason: string = '校規違紀行為') {
    const oldStars = this.stars;
    this.stars = Math.min(5, Math.max(1, this.stars + amount));
    this.escapeTimer = 5.0; // 5 秒逃脫冷卻
    this.isEvading = false;

    if (this.stars > oldStars) {
      soundManager.playAlert();
      const title = this.getDemeritLevelTitle(this.stars);
      if (this.currentWorld === 'DETENTION') {
        this.showBanner(`🚨 院內警戒升級：【${title}】！[${reason}]`);
      } else {
        this.showBanner(`📋 記過處分登記：【${title}】！[${reason}]`);
      }
    }

    this.updateHUDStars();
  }

  public markSpotted() {
    this.isSpottedThisFrame = true;
    this.escapeTimer = 5.0;
    this.isEvading = false;
  }

  public notifyAttacked() {
    // 玩家遭受攻擊時重置逃脫冷卻
    this.escapeTimer = 5.0;
    this.isEvading = false;
  }

  public clearWanted() {
    this.stars = 0;
    this.escapeTimer = 0;
    this.isEvading = false;
    this.isSpottedThisFrame = false;
    this.updateHUDStars();
    if (this.onWantedCleared) {
      this.onWantedCleared();
    }
  }

  public update(delta: number, isAnyChasing: boolean = false) {
    if (this.stars > 0) {
      if (!this.isSpottedThisFrame && !isAnyChasing) {
        // 沒有任何 NPC 處於追擊狀態且不在任何 NPC 視線內：進入躲藏逃脫倒數！
        this.isEvading = true;
        this.escapeTimer -= delta;

        if (this.escapeTimer <= 0) {
          // 成功躲避 5 秒：全面銷過！
          soundManager.playBroadcastChime();
          if (this.currentWorld === 'DETENTION') {
            this.showBanner('🕊️ 警戒解除：成功避開巡邏守衛視線，院內戒備已撤除！', 3500);
          } else {
            this.showBanner('🕊️ 處分銷除：成功避開生教與教官視線，記過處分已撤銷！', 3500);
          }
          this.clearWanted();
          return;
        }
      } else {
        // 仍被追捕中或處於 NPC 視線內
        this.isEvading = false;
        this.escapeTimer = 5.0;
      }
      this.updateHUDStars();
    }
    this.isSpottedThisFrame = false;
  }

  // 處分徽章與狀態標籤 DOM 快取，以及上次繪製的狀態 (星數/躲藏中/世界未變時略過 DOM 寫入)
  private demeritBadgeEls: NodeListOf<Element> | null = null;
  private demeritStatusTitleEl: HTMLElement | null = null;
  private lastHUDStarsKey = -1;

  public updateHUDStars() {
    // 數值狀態鍵 (星級 / 逃脫中 / 世界)：每幀呼叫時不組字串
    const stateKey = this.stars * 4 + (this.isEvading ? 2 : 0) + (this._currentWorld === 'DETENTION' ? 1 : 0);
    if (stateKey === this.lastHUDStarsKey) return;
    this.lastHUDStarsKey = stateKey;

    if (!this.demeritBadgeEls) this.demeritBadgeEls = document.querySelectorAll('.demerit-badge');
    if (!this.demeritStatusTitleEl) this.demeritStatusTitleEl = document.getElementById('demerit-status-title');

    this.demeritBadgeEls.forEach((el, idx) => {
      if (idx < this.stars) {
        el.classList.add('active');
        el.classList.toggle('evading', this.isEvading);
        el.classList.toggle('danger', this.stars >= 4);
      } else {
        el.classList.remove('active', 'danger', 'evading');
      }
    });

    const statusTitleEl = this.demeritStatusTitleEl;
    if (statusTitleEl) {
      if (this.stars === 0) {
        statusTitleEl.textContent = this._currentWorld === 'DETENTION' ? '隱蔽安全' : '操行良好';
        statusTitleEl.style.color = '#2ecc71';
      } else {
        statusTitleEl.textContent = this.getDemeritLevelTitle(this.stars);
        statusTitleEl.style.color = this.stars >= 4 ? '#ff4d4d' : '#f1c40f';
      }
    }
  }

  // 橫幅佇列：同時僅顯示一則；相同 (僅數字不同) 訊息原地更新並延長，不重複排隊；
  // 有訊息排隊時目前橫幅最少停留 BANNER_MIN_SHOW_MS 後即輪替，佇列滿時捨棄最舊的一則
  public showBanner(text: string, duration: number = 3000) {
    const banner = document.getElementById('hud-banner');
    if (!banner) return;

    const key = WantedSystem.bannerKey(text);
    const now = performance.now();

    // 1. 與目前顯示中的橫幅相同 (或僅數字不同)：原地更新文字並延長顯示
    if (this.bannerCurrentKey === key) {
      banner.textContent = text;
      const remaining = this.bannerCurrentDuration - (now - this.bannerShownAt);
      if (this.bannerQueue.length === 0 && duration > remaining) {
        this.bannerShownAt = now;
        this.bannerCurrentDuration = duration;
        this.scheduleBannerEnd(banner, duration);
      }
      return;
    }

    // 2. 已在佇列中的同類訊息：以最新文字取代，不重複排隊
    for (const queued of this.bannerQueue) {
      if (queued.key === key) {
        queued.text = text;
        queued.duration = duration;
        return;
      }
    }

    // 3. 目前無橫幅：立即顯示
    if (this.bannerCurrentKey === null) {
      this.displayBanner(banner, text, key, duration);
      return;
    }

    // 4. 排隊等候，並縮短目前橫幅的剩餘時間
    this.bannerQueue.push({ text, key, duration });
    if (this.bannerQueue.length > WantedSystem.BANNER_MAX_QUEUE) {
      this.bannerQueue.shift();
    }
    const elapsed = now - this.bannerShownAt;
    const remaining = this.bannerCurrentDuration - elapsed;
    const minLeft = Math.max(0, WantedSystem.BANNER_MIN_SHOW_MS - elapsed);
    if (remaining > minLeft) {
      this.bannerCurrentDuration = elapsed + minLeft;
      this.scheduleBannerEnd(banner, minLeft);
    }
  }

  private static readonly BANNER_MAX_QUEUE = 3;
  private static readonly BANNER_MIN_SHOW_MS = 1400;
  private bannerQueue: { text: string; key: string; duration: number }[] = [];
  private bannerCurrentKey: string | null = null;
  private bannerShownAt: number = 0;
  private bannerCurrentDuration: number = 0;

  // 去除數字後的比對鍵，讓「來回 3 拍 / 來回 4 拍」等連續訊息視為同一則
  private static bannerKey(text: string): string {
    return text.replace(/[\d.]+/g, '#');
  }

  private displayBanner(banner: HTMLElement, text: string, key: string, duration: number) {
    banner.textContent = text;
    banner.classList.add('show');
    this.bannerCurrentKey = key;
    this.bannerShownAt = performance.now();
    // 後方仍有排隊訊息時僅停留最短時間，加速輪替避免訊息過時
    const showMs = this.bannerQueue.length > 0 ? Math.min(duration, WantedSystem.BANNER_MIN_SHOW_MS) : duration;
    this.bannerCurrentDuration = showMs;
    this.scheduleBannerEnd(banner, showMs);
  }

  private scheduleBannerEnd(banner: HTMLElement, ms: number) {
    if (this.bannerTimeout) window.clearTimeout(this.bannerTimeout);
    this.bannerTimeout = window.setTimeout(() => {
      const next = this.bannerQueue.shift();
      if (next) {
        this.displayBanner(banner, next.text, next.key, next.duration);
      } else {
        banner.classList.remove('show');
        this.bannerCurrentKey = null;
      }
    }, ms);
  }
}
