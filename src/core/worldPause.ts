// 選單暫停 (大地圖選單開啟期間整個遊戲世界停住)：純邏輯，無 DOM / three.js 依賴，可單元測試。
// main.tick 每個執行幀呼叫 step()：
// - 暫停中：不跑任何世界邏輯，只更新選單面板；3D 畫面只在進入暫停的第一幀與繪圖緩衝尺寸改變時重繪一次 (其餘幀沿用上一張)
// - 以實際時間計時的系統 (復活、增益、橫幅、越獄計時、處決計量表…) 改用 worldClock，由 main 在進入 / 結束暫停時停住
// - 恢復第一幀：delta 夾制到 RESUME_MAX_DT，避免暫停累積的時間造成跳幀

export type WorldPauseStep = 'run' | 'enter' | 'hold' | 'resume';

/** 恢復第一幀的 delta 上限 (秒) */
export const RESUME_MAX_DT = 1 / 60;

export class WorldPause {
  private _paused = false;
  private renderKey = '';

  public get paused(): boolean {
    return this._paused;
  }

  public step(want: boolean): WorldPauseStep {
    if (want) {
      if (!this._paused) {
        this._paused = true;
        this.renderKey = '';
        return 'enter';
      }
      return 'hold';
    }
    if (this._paused) {
      this._paused = false;
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
