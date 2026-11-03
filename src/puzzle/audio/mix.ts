// 混音規格 (audio-design 4；規格 9.1 聲音表)：上限常數、音量曲線、情境層增益、淡入淡出曲線、削波曲線；純函式
import type { Layer } from './score';

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g <= 0 ? -Infinity : 20 * Math.log10(g));

/** 規格 9.1 / 分鏡 2.5 的上限 (dBFS) */
export const LIMITS = {
  /** 總輸出峰值 (限幅器門檻) */
  peakDb: -6,
  /** 一般時段與過場的總輸出 */
  normalDb: -14,
  /** 環境音峰值、最短起音、同類最短間隔 */
  ambientDb: -24, ambientAttackSec: 0.15, ambientGapSec: 20,
  /** 關鍵動作回饋音 (80～120 Hz) */
  feedbackDb: -18, feedbackGapSec: 0.5, feedbackHz: [80, 120] as const,
  /** 驚嚇：長度、平靜版峰值；前安靜 / 後安靜 */
  scareMaxSec: 1.2, scareCalmDb: -24, scareQuietBeforeSec: 2, scareQuietAfterSec: 15,
  /** 低頻持續音增益 */
  droneGain: 0.03,
  /** 每個聲音的最短起音 / 釋音 (避免 pop) */
  minAttackSec: 0.005, minReleaseSec: 0.02
} as const;

/** 限幅器參數 (規格 9.1：門檻 −6、比例 ≥ 20:1、攻擊 ≤ 3 ms、釋放約 250 ms) */
export const LIMITER = { threshold: -6, knee: 0, ratio: 20, attack: 0.003, release: 0.25 } as const;
/** 削波器的硬上限 (線性；−6.2 dBFS) 與線性區 */
export const CLIP_CEIL = 0.49;
export const CLIP_LINEAR = 0.35;

/**
 * 瀏覽器 DynamicsCompressor 的自動補償增益 (Web Audio 規格：(1 / curve(1))^0.6)；限幅器後乘上倒數抵消，
 * 讓門檻以下的訊號維持原音量
 */
export function compressorMakeup(thresholdDb: number, ratio: number): number {
  const outDb = thresholdDb + (0 - thresholdDb) / ratio;
  return Math.pow(1 / dbToGain(outDb), 0.6);
}

/** 柔性削波曲線：|x| ≤ linear 線性，之後以 tanh 漸近 ceil；n 個取樣點 (−1～1) */
export function clipCurve(n = 2049, ceil = CLIP_CEIL, linear = CLIP_LINEAR): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  const room = ceil - linear;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= linear ? a : linear + room * Math.tanh((a - linear) / room);
    c[i] = Math.sign(x) * Math.min(ceil, y);
  }
  return c;
}

/** 音量滑桿 (0～1) → 增益：平方 (感知較線性)；越界夾住 */
export const volumeGain = (v: number): number => {
  const x = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  return x * x;
};

export interface Volumes { master: number; music: number; sfx: number; mute: boolean }
export const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.6, sfx: 0.8, mute: false };

/** 各匯流排實際增益 (mute → master 0) */
export function busGains(v: Volumes): { master: number; music: number; sfx: number } {
  return { master: v.mute ? 0 : volumeGain(v.master), music: volumeGain(v.music), sfx: volumeGain(v.sfx) };
}

// ── 情境層 (audio-design 2.4) ──

export type MusicContext = 'explore' | 'turn' | 'tension' | 'solved' | 'quiet';
export const MUSIC_CONTEXTS: readonly MusicContext[] = ['explore', 'turn', 'tension', 'solved', 'quiet'];

/** 各層的基準增益 (音符 vel 之外再乘；設計值讓音樂峰值 ≤ −16 dBFS) */
const LAYER_BASE: Readonly<Record<Layer, number>> = { pad: 0.07, bass: 0.06, melody: 0.11, arp: 0.06, texture: 0.05, pulse: 0.12 };

/**
 * 情境 × 強度 × 減弱緊張 → 各層增益。強度 0 = 只有墊音與低音；1 = + 旋律；2 = + 琶音 / 質感；3 = + 脈動。
 * calm：脈動 0、低音 (低頻衝擊) 降 6 dB。scorePulse = 這份配樂有沒有脈動層 (第三章輕脈動：強度 ≥ 1 就有)
 */
export function layerMix(ctx: MusicContext, intensity: number, calm: boolean, scorePulse = false): Record<Layer, number> {
  const i = Math.min(3, Math.max(0, Math.round(intensity)));
  const on = (cond: boolean, v: number) => (cond ? v : 0);
  const g: Record<Layer, number> = {
    pad: LAYER_BASE.pad,
    bass: LAYER_BASE.bass,
    melody: on(i >= 1, LAYER_BASE.melody),
    arp: on(i >= 2, LAYER_BASE.arp),
    texture: on(i >= 2, LAYER_BASE.texture),
    pulse: on(i >= 3 || (scorePulse && i >= 1), LAYER_BASE.pulse * (i >= 3 ? 1 : 0.5))
  };
  // 琶音在強度 1 也輕輕出現 (旋律以外的動態)，強度 2 起全量
  if (i === 1) g.arp = LAYER_BASE.arp * 0.5;
  switch (ctx) {
    case 'turn': g.melody *= 0.4; g.arp = LAYER_BASE.arp * 1.3; g.texture = LAYER_BASE.texture; break;
    case 'tension': g.melody = 0; g.arp *= 0.5; g.pad *= 0.8; g.pulse = LAYER_BASE.pulse; break;
    case 'solved': for (const k of Object.keys(g) as Layer[]) g[k] *= 0.35; break;
    case 'quiet': g.pad *= 0.5; g.bass *= 0.5; g.melody = 0; g.arp = 0; g.texture = 0; g.pulse = 0; break;
    default: break;
  }
  if (calm) { g.pulse = 0; g.bass *= 0.5; }
  return g;
}

/** 切換音色 (規格 9.1)：藏寶圖低通 1.2 kHz、實景 4 kHz，0.3 秒漸變 */
export const VIEW_CUTOFF = { '2d': 1200, '3d': 4000 } as const;
export const VIEW_RAMP_SEC = 0.3;

/** 淡入淡出秒數 */
export const FADES = { enter: 1.5, chapterCross: 2.5, cutsceneOut: 3, hideOut: 0.25, showIn: 0.6, mute: 0.12, volume: 0.05 } as const;

/** 等功率交叉淡化曲線：p 0～1 → [舊, 新] 增益 (端點 1/0、0/1；和的平方 = 1) */
export function crossfade(p: number): [number, number] {
  const x = Math.min(1, Math.max(0, p));
  return [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
}

/** 淡入 / 淡出曲線取樣 (setValueCurveAtTime 用)：from → to，n 點，等功率 (平方根) 形狀，單調 */
export function fadeCurve(from: number, to: number, n = 32): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const k = to > from ? Math.sin(p * Math.PI / 2) : 1 - Math.cos(p * Math.PI / 2);
    c[i] = from + (to - from) * k;
  }
  return c;
}
