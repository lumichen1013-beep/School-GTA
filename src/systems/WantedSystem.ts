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
    this.updateDemeritLabels();
    this.updateHUDStars();
  }
  private isSpottedThisFrame: boolean = false;
  private bannerTimeout: number = 0;
  public onWantedCleared?: () => void;
  // 處分升到最高級 (5 級) 時觸發 (校園：執法者傳送追捕)
  public onMaxWanted?: () => void;

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
    if (this.stars === 5 && oldStars < 5 && this.onMaxWanted) this.onMaxWanted();
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

  // 處分面板標題與五格徽章文字依世界切換 (校園：校規記過；特訓院：院內戒備等級)
  private static readonly BADGE_TEXT = {
    CAMPUS: ['警告', '小過', '小過二', '大過', '留校察看'],
    DETENTION: ['注意', '搜索', '升級', '封鎖', '圍剿']
  };
  private updateDemeritLabels() {
    if (typeof document === 'undefined') return;
    const label = document.querySelector('.demerit-label');
    if (label) label.textContent = this._currentWorld === 'DETENTION' ? '院內戒備:' : '校規處分:';
    const texts = WantedSystem.BADGE_TEXT[this._currentWorld];
    document.querySelectorAll<HTMLElement>('.demerit-badge').forEach((el, idx) => {
      if (idx >= texts.length) return;
      el.textContent = texts[idx];
      el.title = this.getDemeritLevelTitle(idx + 1);
    });
  }

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

    // 運鏡暫停期間：訊息暫存 (同類訊息以最新取代)，待 releaseBannerHold 時依序播出
    if (this.bannerHeld) {
      const key = WantedSystem.bannerKey(text);
      const held = this.bannerHeldList.find(h => h.key === key);
      if (held) {
        held.text = text;
        held.duration = duration;
      } else {
        this.bannerHeldList.push({ text, key, duration });
        if (this.bannerHeldList.length > WantedSystem.BANNER_MAX_QUEUE) this.bannerHeldList.shift();
      }
      return;
    }

    const key = WantedSystem.bannerKey(text);
    const now = performance.now();

    // 1. 與目前顯示中的橫幅相同 (或僅數字不同)：原地更新文字並延長顯示
    if (this.bannerCurrentKey === key) {
      // 文字相同時不重設跑馬燈 (避免持續更新的訊息每次從頭捲動)
      if (text !== this.bannerCurrentText) {
        this.bannerCurrentText = text;
        const marqueeMs = this.setBannerText(banner, text);
        this.bannerCurrentMinMs = Math.max(WantedSystem.BANNER_MIN_SHOW_MS, marqueeMs);
        duration = Math.max(duration, marqueeMs);
      }
      const remaining = this.bannerCurrentDuration - (now - this.bannerShownAt);
      if ((this.bannerQueue.length === 0 || this.bannerCurrentMinMs > WantedSystem.BANNER_MIN_SHOW_MS) && duration > remaining) {
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
    // 跑馬燈訊息至少完整捲動一次才輪替
    const minLeft = Math.max(0, this.bannerCurrentMinMs - elapsed);
    if (remaining > minLeft) {
      this.bannerCurrentDuration = elapsed + minLeft;
      this.scheduleBannerEnd(banner, minLeft);
    }
  }

  // 暫停橫幅 (如暗殺運鏡期間)：立即收起目前與排隊中的橫幅 (運鏡前的訊息已過時，直接捨棄)，之後的訊息改為暫存
  public holdBanners() {
    if (this.bannerHeld) return;
    this.bannerHeld = true;
    this.bannerHeldList = [];
    this.bannerQueue = [];
    if (this.bannerTimeout) window.clearTimeout(this.bannerTimeout);
    this.bannerTimeout = 0;
    this.bannerCurrentKey = null;
    document.getElementById('hud-banner')?.classList.remove('show');
  }

  // 恢復橫幅：依序播出暫停期間暫存的訊息
  public releaseBannerHold() {
    if (!this.bannerHeld) return;
    this.bannerHeld = false;
    const held = this.bannerHeldList;
    this.bannerHeldList = [];
    for (const h of held) this.showBanner(h.text, h.duration);
  }

  private bannerHeld: boolean = false;
  private bannerHeldList: { text: string; key: string; duration: number }[] = [];
  private static readonly BANNER_MAX_QUEUE = 3;
  private static readonly BANNER_MIN_SHOW_MS = 1400;
  private bannerQueue: { text: string; key: string; duration: number }[] = [];
  private bannerCurrentKey: string | null = null;
  private bannerShownAt: number = 0;
  private bannerCurrentDuration: number = 0;
  private bannerCurrentText: string = '';
  private bannerCurrentMinMs: number = WantedSystem.BANNER_MIN_SHOW_MS; // 本則最短停留 (跑馬燈需捲完)
  private bannerTextEl: HTMLSpanElement | null = null;

  // 跑馬燈參數：開頭停留、捲動速度 (px/s)、捲到底後停留
  private static readonly MARQUEE_LEAD_S = 0.9;
  private static readonly MARQUEE_SPEED = 70;
  private static readonly MARQUEE_TAIL_S = 1.2;

  // 寫入橫幅文字；超出橫幅寬度 (如手機窄螢幕) 時改為跑馬燈捲動，回傳完整捲完所需毫秒 (未超出回傳 0)
  private setBannerText(banner: HTMLElement, text: string): number {
    let span = this.bannerTextEl;
    if (!span || span.parentElement !== banner) {
      banner.textContent = '';
      span = document.createElement('span');
      span.className = 'hud-banner-text';
      banner.appendChild(span);
      this.bannerTextEl = span;
    }
    span.textContent = text;
    banner.classList.remove('marquee');
    span.style.animation = 'none';

    const cs = getComputedStyle(banner);
    const avail = banner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const overflow = span.offsetWidth - avail;
    if (avail <= 0 || overflow <= 4) return 0;

    const travelS = Math.max(1.2, overflow / WantedSystem.MARQUEE_SPEED);
    banner.classList.add('marquee');
    span.style.setProperty('--marquee-shift', `${-Math.ceil(overflow)}px`);
    void span.offsetWidth; // 重新觸發動畫
    span.style.animation = `hud-banner-marquee ${travelS.toFixed(2)}s linear ${WantedSystem.MARQUEE_LEAD_S}s forwards`;
    return Math.ceil((WantedSystem.MARQUEE_LEAD_S + travelS + WantedSystem.MARQUEE_TAIL_S) * 1000);
  }

  // 去除數字後的比對鍵，讓「來回 3 拍 / 來回 4 拍」等連續訊息視為同一則
  private static bannerKey(text: string): string {
    return text.replace(/[\d.]+/g, '#');
  }

  private displayBanner(banner: HTMLElement, text: string, key: string, duration: number) {
    const marqueeMs = this.setBannerText(banner, text);
    banner.classList.add('show');
    this.bannerCurrentKey = key;
    this.bannerCurrentText = text;
    this.bannerCurrentMinMs = Math.max(WantedSystem.BANNER_MIN_SHOW_MS, marqueeMs);
    this.bannerShownAt = performance.now();
    // 後方仍有排隊訊息時僅停留最短時間，加速輪替避免訊息過時；跑馬燈訊息至少停留到完整捲完
    const baseMs = this.bannerQueue.length > 0 ? Math.min(duration, WantedSystem.BANNER_MIN_SHOW_MS) : duration;
    const showMs = Math.max(baseMs, marqueeMs);
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
