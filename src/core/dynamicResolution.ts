// 動態解析度 (觸控裝置中檔的備援)：實測 FPS < 55 持續 2 秒降像素比 0.1 (下限 1.0)，
// > 58 持續 5 秒升 0.1 (上限為該檔原像素比)。純邏輯，無 DOM / three.js 依賴，可單元測試。
// 遲滯：55~58 之間為死區 (兩邊計時都歸零)；每次調整後丟棄 1 秒 (繪圖緩衝重配的暖機)；
// 升級後 10 秒內又被迫降級，視為該級撐不住，60 秒內不再升回該級，避免來回切換。

export const DYN_RES = {
  DOWN_FPS: 55,
  UP_FPS: 58,
  DOWN_HOLD_MS: 2000,
  UP_HOLD_MS: 5000,
  STEP: 0.1,
  MIN: 1.0,
  WINDOW_MS: 500,       // 每 0.5 秒結算一次平均 FPS
  SETTLE_MS: 1000,      // 調整後丟棄的暖機時間
  BOUNCE_MS: 10000,     // 升級後多久內又降級視為來回
  BOUNCE_LOCK_MS: 60000,// 來回後鎖住升級的時間
  RESUME_QUIET_MS: 2000,// 過場 / 場景切換結束後不計入取樣的緩衝時間 (過場尾端的尖峰不觸發降級)
  MAX_GAP_MS: 250,      // 單幀間隔超過此值 (切分頁、長暫停) 視為中斷，重新累計
} as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

export class DynamicResolutionController {
  private _ratio: number;
  private _max: number;
  private winMs = 0;
  private winFrames = 0;
  private lowMs = 0;
  private highMs = 0;
  private settleUntil = 0;
  private lastUpAt = -Infinity;
  private upCap = Infinity;
  private upCapUntil = -Infinity;
  private quietUntil = 0;

  constructor(max: number) {
    this._max = max;
    this._ratio = max;
  }

  get ratio(): number { return this._ratio; }
  get max(): number { return this._max; }
  get min(): number { return Math.min(DYN_RES.MIN, this._max); }

  /** 重新開始 (檔位 / 原像素比改變、停用後重新啟用)：回到上限 */
  public reset(max: number, now: number = 0) {
    this._max = max;
    this._ratio = max;
    this.lowMs = 0;
    this.highMs = 0;
    this.winMs = 0;
    this.winFrames = 0;
    this.settleUntil = now + DYN_RES.SETTLE_MS;
    this.lastUpAt = -Infinity;
    this.upCap = Infinity;
    this.upCapUntil = -Infinity;
    this.quietUntil = 0;
  }

  /** 每個實際執行幀回報 (now = 時間戳 ms，dtMs = 與上一執行幀的間隔)；像素比有變化時回傳新值，否則 null */
  public onFrame(now: number, dtMs: number, paused: boolean = false): number | null {
    // 過場 / 場景切換期間：不取樣、不調整，結束後再緩衝 RESUME_QUIET_MS
    if (paused) {
      this.winMs = 0;
      this.winFrames = 0;
      this.lowMs = 0;
      this.highMs = 0;
      this.quietUntil = now + DYN_RES.RESUME_QUIET_MS;
      return null;
    }
    if (now < this.quietUntil) return null;
    if (!(dtMs > 0) || dtMs > DYN_RES.MAX_GAP_MS) {
      this.winMs = 0;
      this.winFrames = 0;
      this.lowMs = 0;
      this.highMs = 0;
      return null;
    }
    if (now < this.settleUntil) return null;
    this.winMs += dtMs;
    this.winFrames++;
    if (this.winMs < DYN_RES.WINDOW_MS) return null;
    const fps = (this.winFrames * 1000) / this.winMs;
    const span = this.winMs;
    this.winMs = 0;
    this.winFrames = 0;
    if (fps < DYN_RES.DOWN_FPS) { this.lowMs += span; this.highMs = 0; }
    else if (fps > DYN_RES.UP_FPS) { this.highMs += span; this.lowMs = 0; }
    else { this.lowMs = 0; this.highMs = 0; }

    if (this.lowMs >= DYN_RES.DOWN_HOLD_MS && this._ratio > this.min + 1e-6) {
      const next = Math.max(this.min, round2(this._ratio - DYN_RES.STEP));
      if (now - this.lastUpAt < DYN_RES.BOUNCE_MS) {
        this.upCap = next; // 剛升上去就撐不住：暫時鎖在降級後的值
        this.upCapUntil = now + DYN_RES.BOUNCE_LOCK_MS;
      }
      return this.apply(next, now);
    }
    if (this.highMs >= DYN_RES.UP_HOLD_MS && this._ratio < this._max - 1e-6) {
      const cap = now < this.upCapUntil ? this.upCap : Infinity;
      if (this._ratio >= cap - 1e-6) { this.highMs = 0; return null; }
      const next = Math.min(this._max, cap, round2(this._ratio + DYN_RES.STEP));
      this.lastUpAt = now;
      return this.apply(next, now);
    }
    return null;
  }

  private apply(next: number, now: number): number {
    this._ratio = next;
    this.lowMs = 0;
    this.highMs = 0;
    this.settleUntil = now + DYN_RES.SETTLE_MS;
    return next;
  }
}
