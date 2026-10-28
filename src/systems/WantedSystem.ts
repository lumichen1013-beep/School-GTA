import { soundManager } from '../audio/SoundEffects';

export class WantedSystem {
  public stars: number = 0; // 0 ~ 5 級記過懲戒
  public escapeTimer: number = 0;
  public isEvading: boolean = false;
  public currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
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

  public updateHUDStars() {
    // 支援記過懲戒標籤 (.demerit-badge) 以及相容原本的 (.star)
    const demeritBadges = document.querySelectorAll('.demerit-badge');
    demeritBadges.forEach((el, idx) => {
      if (idx < this.stars) {
        el.classList.add('active');
        if (this.isEvading) {
          el.classList.add('evading');
        } else {
          el.classList.remove('evading');
        }
        if (this.stars >= 4) {
          el.classList.add('danger');
        } else {
          el.classList.remove('danger');
        }
      } else {
        el.classList.remove('active', 'danger', 'evading');
      }
    });

    const starEls = document.querySelectorAll('.wanted-stars .star');
    starEls.forEach((el, idx) => {
      if (idx < this.stars) {
        el.classList.add('active');
        if (this.isEvading) el.classList.add('evading');
        else el.classList.remove('evading');
        if (this.stars >= 4) el.classList.add('danger');
        else el.classList.remove('danger');
      } else {
        el.classList.remove('active', 'danger', 'evading');
      }
    });

    const statusTitleEl = document.getElementById('demerit-status-title');
    if (statusTitleEl) {
      if (this.stars === 0) {
        statusTitleEl.textContent = this.currentWorld === 'DETENTION' ? '隱蔽安全' : '操行良好';
        statusTitleEl.style.color = '#2ecc71';
      } else {
        statusTitleEl.textContent = this.getDemeritLevelTitle(this.stars);
        statusTitleEl.style.color = this.stars >= 4 ? '#ff4d4d' : '#f1c40f';
      }
    }
  }

  public showBanner(text: string, duration: number = 3000) {
    const banner = document.getElementById('hud-banner');
    if (!banner) return;

    banner.textContent = text;
    banner.classList.add('show');

    if (this.bannerTimeout) window.clearTimeout(this.bannerTimeout);
    this.bannerTimeout = window.setTimeout(() => {
      banner.classList.remove('show');
    }, duration);
  }
}
