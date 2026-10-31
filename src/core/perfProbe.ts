// 診斷計時 (只在 ?diag= 時啟用；未啟用時 main 不呼叫 performance.now，零成本)。
// 滾動視窗統計為純資料結構，可單元測試。
import { percentile } from './quality';

export class RollingWindow {
  private ts: number[] = [];
  private vs: number[] = [];
  constructor(private readonly spanMs: number) {}

  push(now: number, v: number) {
    this.ts.push(now);
    this.vs.push(v);
    this.prune(now);
  }

  private prune(now: number) {
    let i = 0;
    while (i < this.ts.length && now - this.ts[i] > this.spanMs) i++;
    if (i > 0) { this.ts.splice(0, i); this.vs.splice(0, i); }
  }

  stats(now: number): { count: number; avg: number; p50: number; p95: number } {
    this.prune(now);
    const n = this.vs.length;
    if (n === 0) return { count: 0, avg: 0, p50: 0, p95: 0 };
    let sum = 0;
    for (const v of this.vs) sum += v;
    const sorted = [...this.vs].sort((a, b) => a - b);
    return { count: n, avg: sum / n, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
  }
}

const SPAN_MS = 2000;

class PerfProbe {
  public enabled = false;
  public readonly logic = new RollingWindow(SPAN_MS);
  public readonly render = new RollingWindow(SPAN_MS);
  public readonly raf = new RollingWindow(SPAN_MS); // 實際執行幀 (邏輯 + render) 的間隔，鎖幀時為鎖幀後的間隔
  public readonly rawRaf = new RollingWindow(SPAN_MS); // 每個 rAF 回呼的間隔 (含被略過的)，用來估計螢幕更新率
  private lastRun = 0;
  private lastRaw = 0;

  public onRaf(now: number) {
    if (this.lastRaw > 0) this.rawRaf.push(now, now - this.lastRaw);
    this.lastRaw = now;
  }

  public onFrameRun(now: number) {
    if (this.lastRun > 0) this.raf.push(now, now - this.lastRun);
    this.lastRun = now;
  }
}

export const perfProbe = new PerfProbe();
