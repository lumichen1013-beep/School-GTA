// 畫質檔位 (純資料與純函式，無 DOM / three.js 依賴，可單元測試)。
// 執行期套用、開局實測與設定儲存見 QualityManager。
import type { FxTier } from '../effects/fxQuality';

export type QualityTier = FxTier;
export type QualityMode = 'auto' | QualityTier;

export const QUALITY_MODES: readonly QualityMode[] = ['auto', 'high', 'medium', 'low'];

export interface QualityPreset {
  label: string;
  pixelRatioMax: number; // 像素比上限 (另受 devicePixelRatio 限制)
  shadowMapSize: number; // 陽光陰影貼圖邊長 (0 = 關閉陰影)
  npcLodScale: number;   // NPC 分級模型距離倍率 (<1 = 更早改用合併網格)
}

export const QUALITY_PRESETS: Readonly<Record<QualityTier, Readonly<QualityPreset>>> = {
  high: { label: '高', pixelRatioMax: 2, shadowMapSize: 2048, npcLodScale: 1 },
  medium: { label: '中', pixelRatioMax: 1.5, shadowMapSize: 1024, npcLodScale: 1 },
  low: { label: '低', pixelRatioMax: 1, shadowMapSize: 0, npcLodScale: 0.7 },
};

export const MODE_LABELS: Readonly<Record<QualityMode, string>> = { auto: '自動', high: '高', medium: '中', low: '低' };

export function isQualityMode(v: unknown): v is QualityMode {
  return typeof v === 'string' && (QUALITY_MODES as readonly string[]).includes(v);
}

export function isQualityTier(v: unknown): v is QualityTier {
  return v === 'low' || v === 'medium' || v === 'high';
}

// 實際像素比：取檔位上限與裝置像素比較小者 (裝置像素比異常時視為 1)
export function resolvePixelRatio(devicePixelRatio: number, tier: QualityTier): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, QUALITY_PRESETS[tier].pixelRatioMax);
}

// ---------------- 開局 FPS 實測 ----------------

// 偵測門檻 (60Hz 對照：升高檔需平均 ≥55fps 且 p95 <22ms；平均 <45fps 降低檔)
export const PROBE = {
  START_DELAY_MS: 1000,     // 進入世界並完成 shader 預熱後再等待的時間
  SETTLE_MS: 600,           // 切換檔位後丟棄的暖機時間 (陰影貼圖 / 繪圖緩衝重建)
  MEDIUM_MS: 3000,          // 中檔量測時長
  HIGH_MS: 2500,            // 試升高檔量測時長
  MIN_FRAMES: 20,           // 有效樣本下限 (不足則延長量測)
  MAX_EXTEND_MS: 3000,      // 樣本不足時最多延長的時間
  MAX_GAP_MS: 250,          // 單幀間隔超過此值 (切分頁、長暫停) 不列入統計
  TARGET_FPS_MAX: 60,       // 目標幀率上限：高更新率螢幕 (90/120Hz) 不要求超過 60fps
  TARGET_FPS_MIN: 50,       // 目標幀率下限：量到的最短幀間隔低於此 (例如省電鎖 30fps) 仍以 50fps 要求
  REFRESH_PERCENTILE: 0.05, // 以幀間隔第 5 百分位估計螢幕更新間隔 (排除偶發極短間隔)
  JANK_FACTOR: 1.5,         // 幀間隔超過目標的 1.5 倍視為掉幀
  UPGRADE_FPS_RATIO: 0.92,  // 中檔平均幀率 ≥ 目標 × 0.92 (60Hz ≈ 55fps)
  UPGRADE_P95_RATIO: 1.32,  // 且 p95 幀時間 ≤ 目標幀時間 × 1.32 (60Hz ≈ 22ms)
  UPGRADE_JANK_MAX: 0.08,   // 且掉幀比例 ≤ 8%
  KEEP_HIGH_FPS_RATIO: 0.88,// 高檔試跑：平均 ≥ 目標 × 0.88 (60Hz ≈ 53fps)
  KEEP_HIGH_P95_RATIO: 1.5, // 且 p95 ≤ 目標 × 1.5 (60Hz ≈ 25ms)
  KEEP_HIGH_JANK_MAX: 0.12, // 且掉幀比例 ≤ 12%
  DOWNGRADE_FPS_RATIO: 0.75,// 中檔平均 < 目標 × 0.75 (60Hz = 45fps) 降低檔
  DOWNGRADE_JANK_MIN: 0.25, // 或掉幀比例 > 25% 降低檔
} as const;

export interface FrameStats {
  frames: number;
  avgMs: number;
  p95Ms: number;
  refreshMs: number; // 估計的螢幕更新間隔
  targetMs: number;  // 判斷基準幀時間
  fps: number;       // 平均幀率
  fpsRatio: number;  // 平均幀率 / 目標幀率
  p95Ratio: number;  // p95 幀時間 / 目標幀時間
  jankRatio: number; // 掉幀比例
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

// 由 rAF 幀間隔 (毫秒) 計算統計；過長間隔 (> MAX_GAP_MS) 剔除
export function analyzeFrames(intervals: readonly number[]): FrameStats {
  const xs = intervals.filter((d) => d > 0 && d <= PROBE.MAX_GAP_MS).sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return { frames: 0, avgMs: 0, p95Ms: 0, refreshMs: 0, targetMs: 0, fps: 0, fpsRatio: 0, p95Ratio: Infinity, jankRatio: 1 };
  let sum = 0;
  for (const d of xs) sum += d;
  const avgMs = sum / n;
  const p95Ms = percentile(xs, 0.95);
  const refreshMs = percentile(xs, PROBE.REFRESH_PERCENTILE);
  // 判斷基準：裝置自身量到的更新間隔，夾在 [1/TARGET_FPS_MAX, 1/TARGET_FPS_MIN] 之間
  const targetMs = Math.min(1000 / PROBE.TARGET_FPS_MIN, Math.max(1000 / PROBE.TARGET_FPS_MAX, refreshMs));
  let jank = 0;
  for (const d of xs) if (d > targetMs * PROBE.JANK_FACTOR) jank++;
  return {
    frames: n, avgMs, p95Ms, refreshMs, targetMs,
    fps: 1000 / avgMs,
    fpsRatio: targetMs / avgMs,
    p95Ratio: p95Ms / targetMs,
    jankRatio: jank / n,
  };
}

// 中檔量測結果：'high' = 順暢可試升高檔；'low' = 不順需降檔；'medium' = 維持
export function decideFromMedium(s: FrameStats): QualityTier {
  if (s.frames === 0) return 'medium';
  if (s.fpsRatio < PROBE.DOWNGRADE_FPS_RATIO || s.jankRatio > PROBE.DOWNGRADE_JANK_MIN) return 'low';
  if (s.fpsRatio >= PROBE.UPGRADE_FPS_RATIO && s.p95Ratio <= PROBE.UPGRADE_P95_RATIO && s.jankRatio <= PROBE.UPGRADE_JANK_MAX) return 'high';
  return 'medium';
}

// 高檔試跑結果：順暢維持高檔，否則退回中檔
export function decideFromHigh(s: FrameStats): QualityTier {
  if (s.frames > 0 && s.fpsRatio >= PROBE.KEEP_HIGH_FPS_RATIO && s.p95Ratio <= PROBE.KEEP_HIGH_P95_RATIO && s.jankRatio <= PROBE.KEEP_HIGH_JANK_MAX) return 'high';
  return 'medium';
}

// ---------------- 設定儲存 ----------------

export const QUALITY_STORAGE_KEY = 'schoolgta.quality.v1';
// 視窗面積 (CSS 像素) 與上次偵測時相差超過此倍率即重新偵測 (例如切換全螢幕、分割畫面、換螢幕)
export const AREA_REDETECT_RATIO = 1.6;

export interface AutoResult {
  tier: QualityTier;
  fps: number;
  key: string;   // 裝置識別鍵 (螢幕尺寸 / 像素比 / 觸控 / GPU)
  area: number;  // 偵測當下視窗 CSS 面積
  at: number;    // 偵測時間 (epoch ms)
}

export interface StoredQuality {
  mode: QualityMode;
  auto: AutoResult | null;
}

export function parseStoredQuality(raw: string | null): StoredQuality {
  const fallback: StoredQuality = { mode: 'auto', auto: null };
  if (!raw) return fallback;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return fallback;
    const mode = isQualityMode(o.mode) ? o.mode : 'auto';
    const a = o.auto;
    const auto = a && typeof a === 'object' && isQualityTier(a.tier) && typeof a.key === 'string' &&
      Number.isFinite(a.fps) && Number.isFinite(a.area) && a.area > 0
      ? { tier: a.tier, fps: a.fps, key: a.key, area: a.area, at: Number.isFinite(a.at) ? a.at : 0 }
      : null;
    return { mode, auto };
  } catch {
    return fallback;
  }
}

export function serializeStoredQuality(s: StoredQuality): string {
  return JSON.stringify({ mode: s.mode, auto: s.auto });
}

export interface DeviceKeyInput {
  screenW: number;
  screenH: number;
  dpr: number;
  touch: boolean;
  gpu: string;
}

// 裝置識別鍵：螢幕尺寸不分直橫 (翻轉不變)、像素比取兩位小數；換裝置 / 換螢幕 / 換 GPU 即不同
export function makeDeviceKey(d: DeviceKeyInput): string {
  const a = Math.round(Math.max(d.screenW, d.screenH));
  const b = Math.round(Math.min(d.screenW, d.screenH));
  return `${a}x${b}@${d.dpr.toFixed(2)}|${d.touch ? 'touch' : 'mouse'}|${d.gpu}`;
}

export function areaChangedSignificantly(prevArea: number, area: number): boolean {
  if (!(prevArea > 0) || !(area > 0)) return true;
  const r = area / prevArea;
  return r > AREA_REDETECT_RATIO || r < 1 / AREA_REDETECT_RATIO;
}

// 啟動時決定初始檔位：手動模式直接採用；自動模式且已有同裝置、相近視窗面積的偵測結果則沿用，否則以中檔起跑並重新偵測
export function resolveStartupTier(stored: StoredQuality, key: string, area: number): { tier: QualityTier; needProbe: boolean } {
  if (stored.mode !== 'auto') return { tier: stored.mode, needProbe: false };
  const a = stored.auto;
  if (a && a.key === key && !areaChangedSignificantly(a.area, area)) return { tier: a.tier, needProbe: false };
  return { tier: 'medium', needProbe: true };
}
