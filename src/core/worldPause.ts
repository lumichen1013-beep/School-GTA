// 選單暫停 (大地圖選單開啟期間整個遊戲世界停住)：純邏輯，無 DOM / three.js 依賴，可單元測試。
// main.tick 每個執行幀呼叫 step()：
// - 暫停中：不跑任何世界邏輯，只更新選單面板；3D 畫面只在進入暫停的第一幀與繪圖緩衝尺寸改變時重繪一次 (其餘幀沿用上一張)
// - heldMs：本幀距上一個暫停幀的實際毫秒，供以 performance.now() 計時的系統 (逃脫計時、處決 QTE) 平移起點
// - 恢復第一幀：delta 夾制到 RESUME_MAX_DT，避免暫停累積的時間造成跳幀

export type WorldPauseStep = 'run' | 'enter' | 'hold' | 'resume';

/** 恢復第一幀的 delta 上限 (秒) */
export const RESUME_MAX_DT = 1 / 60;

export class WorldPause {
  private _paused = false;
  private lastNow = 0;
  private renderKey = '';
  /** 本幀距上一個暫停幀的實際毫秒 (僅 hold / resume 幀有值) */
  public heldMs = 0;

  public get paused(): boolean {
    return this._paused;
  }

  public step(want: boolean, now: number): WorldPauseStep {
    this.heldMs = 0;
    if (want) {
      if (!this._paused) {
        this._paused = true;
        this.lastNow = now;
        this.renderKey = '';
        return 'enter';
      }
      this.heldMs = Math.max(0, now - this.lastNow);
      this.lastNow = now;
      return 'hold';
    }
    if (this._paused) {
      this._paused = false;
      this.heldMs = Math.max(0, now - this.lastNow);
      return 'resume';
    }
    return 'run';
  }

  /** 暫停中是否需要重繪 3D 畫面：進入暫停後第一次、或繪圖緩衝尺寸 (縮放 / 翻轉 / 畫質) 改變時 */
  public needsRender(key: string): boolean {
    if (key === this.renderKey) return false;
    this.renderKey = key;
    return true;
  }

  public static clampResumeDelta(dt: number): number {
    return Math.min(dt, RESUME_MAX_DT);
  }
}
