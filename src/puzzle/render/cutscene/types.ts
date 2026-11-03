import type { Palette, Room2dPalette } from '../themes';

/** 轉場種類 (與 content/cutsceneTypes 的 CutTransition 同形；render 不 import content) */
export type CutTransitionKind = 'fade' | 'crossfade' | 'inkBleed' | 'pageTurn' | 'paperTear' | 'cut';

/** 一個鏡頭在某一刻的狀態 */
export interface ShotFrame {
  sceneId: string;
  /** 畫面內要寫的字 (已解析) */
  labels: Readonly<Record<string, string>>;
  /** 鏡頭開始後的秒數 (含轉場) */
  shotSec: number;
  /** 運鏡時鐘 (文字淡入時減半) */
  motionSec: number;
  motion?: { push?: number; parallax?: number; panX?: number; durSec?: number };
}

export interface CutsceneFrame {
  cur: ShotFrame;
  /** 轉場中：上一鏡 (停在最後一幀)；第一鏡沒有上一鏡 = 從黑底淡入 */
  prev: ShotFrame | null;
  transition: { kind: CutTransitionKind; p: number } | null;
  reduceMotion: boolean;
}

/** 分鏡繪製函式收到的資料：g 已套好虛擬座標 (安全區 900 × 700，構圖重點在內；背景請畫滿 view) */
export interface SceneCtx {
  g: CanvasRenderingContext2D;
  /** 鏡頭秒數 */
  t: number;
  /** 運鏡進度 0..1 (已緩動；減弱動態時為 0) */
  m: number;
  motion: NonNullable<ShotFrame['motion']>;
  labels: Readonly<Record<string, string>>;
  pal: Palette;
  room2d: Room2dPalette;
  reduce: boolean;
  /** 目前畫面可見的虛擬座標範圍 (含字幕帶下方) */
  view: { x0: number; y0: number; x1: number; y1: number };
}

export type SceneDraw = (s: SceneCtx) => void;

/** 虛擬安全區 (構圖重點都放在這裡；字幕帶在其下方) */
export const SAFE_W = 900;
export const SAFE_H = 700;
