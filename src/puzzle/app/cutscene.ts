// 過場時間軸 (cutscenes-v0.1 2.3、6；architecture 4.15)：純邏輯、確定性，不碰 DOM / three / Canvas
// 每鏡：轉場 → 各段 (淡入 0.4 → 停留 → 淡出 0.3) →（自動播放時補足視覺最短秒）→ 下一鏡
import type { CutTransition, CutsceneDef, CutsceneId, ShotDef } from '../content/cutsceneTypes';
import { REDUCED_TRANSITION_SEC, TRANSITION_SEC } from '../content/cutscenes';
import { CPS, layoutLines, readingSeconds, shotSeconds, type TextSpeed } from '../text/readingTime';
import type { InputAction } from '../input/types';
import { RestartConfirm } from './restartConfirm';

/** 文字整段淡入 / 淡出秒數 (cutscenes-v0.1 2.4) */
export const TEXT_FADE_IN_SEC = 0.4;
export const TEXT_FADE_OUT_SEC = 0.3;
/** 完全淡入後過這麼久才接受推進 (防誤觸)；已看過的過場降到 0.4 秒 (cutscenes-v0.1 7 風險 7) */
export const MIN_DWELL_SEC = 1.2;
export const MIN_DWELL_SEEN_SEC = 0.4;
/** 長按跳過的秒數；短於 TAP_MAX_SEC 放開 = 點一下 (推進) */
export const HOLD_SKIP_SEC = 1.0;
export const TAP_MAX_SEC = 0.5;
/** 文字淡入期間運鏡速度減半 */
const MOTION_SLOW_DURING_FADE = 0.5;

// ── 計畫：把資料 + 文字 + 設定算成秒數 (秒數一律來自公式，資料裡不寫) ──

export interface PlannedSegment { key: string; text: string; lines: string[]; sec: number }
export interface PlannedShot {
  index: number;
  def: ShotDef;
  transition: CutTransition;
  transitionSec: number;
  minVisualSec: number;
  segments: PlannedSegment[];
  /** 畫面內的字 (labels 的 key 已解析) */
  labels: Record<string, string>;
  /** 自動播放時這一鏡的秒數 = max(各段 T 之和, 視覺最短秒) + 轉場 */
  sec: number;
}
export interface CutscenePlan { id: CutsceneId; shots: PlannedShot[]; totalSec: number }

export interface PlanOptions { speed: TextSpeed; reduceMotion: boolean; name: string }
export type Resolve = (key: string, params?: Readonly<Record<string, string>>) => string;

export function planCutscene(def: CutsceneDef, t: Resolve, opt: PlanOptions): CutscenePlan {
  const cps = CPS[opt.speed];
  const shots = def.shots.map((s, index): PlannedShot => {
    const reduce = opt.reduceMotion && s.transitionIn !== 'cut';
    const transition: CutTransition = reduce ? 'fade' : s.transitionIn;
    const transitionSec = reduce ? REDUCED_TRANSITION_SEC : TRANSITION_SEC[s.transitionIn];
    const segments = s.lines.map(key => {
      const text = t(key, { name: opt.name });
      return { key, text, lines: layoutLines(text), sec: readingSeconds(text, { cps }) };
    });
    const minVisualSec = s.minVisualSec ?? 0;
    const labels = Object.fromEntries(Object.entries(s.art.labels ?? {}).map(([k, key]) => [k, t(key, { name: opt.name })]));
    return { index, def: s, transition, transitionSec, minVisualSec, segments, labels, sec: shotSeconds(segments.map(g => g.sec), minVisualSec, transitionSec) };
  });
  return { id: def.id, shots, totalSec: shots.reduce((a, s) => a + s.sec, 0) };
}

// ── 播放器 ──

export type CutsceneEvent =
  | { type: 'shot'; index: number }
  | { type: 'segment'; shot: number; index: number }
  /** 音訊掛點 (音訊模組實作前 app 不做事) */
  | { type: 'audio'; shot: number; cue: string; at: 'start' | 'line' | 'end' }
  | { type: 'confirmOpen' }
  | { type: 'confirmClose' }
  | { type: 'end'; skipped: boolean };

export type CutscenePhase = 'transition' | 'fadeIn' | 'hold' | 'fadeOut' | 'pad' | 'done';

export interface PlayerOptions {
  autoAdvance: boolean;
  /** 跳過前需確認 (設定 skipConfirm)；重看時一律不需確認 */
  skipConfirm: boolean;
  /** 從回憶頁重看 */
  replay: boolean;
  /** 已看過 (minDwell 降到 0.4 秒) */
  seen: boolean;
}

export interface CutsceneView {
  shot: PlannedShot;
  shotSec: number;
  /** 運鏡時鐘 (文字淡入時減半) */
  motionSec: number;
  /** 轉場中：上一鏡停在最後一幀 */
  prev: { shot: PlannedShot; shotSec: number; motionSec: number } | null;
  transition: { kind: CutTransition; p: number } | null;
  segment: { index: number; lines: string[]; alpha: number; canAdvance: boolean } | null;
  holdProgress: number;
  confirmOpen: boolean;
  paused: boolean;
  done: boolean;
  phase: CutscenePhase;
}

export class CutscenePlayer {
  readonly minDwellSec: number;
  private shotIndex = 0;
  private seg = 0;
  private phase: CutscenePhase = 'transition';
  private phaseSec = 0;
  private shotSec = 0;
  private motionSec = 0;
  private prevEnd: { shot: PlannedShot; shotSec: number; motionSec: number } | null = null;
  private paused = false;
  private holdSec: number | null = null;
  private gate = new RestartConfirm();
  private realMs = 0;
  private events: CutsceneEvent[] = [];
  private skippedFlag = false;

  constructor(readonly plan: CutscenePlan, private opt: PlayerOptions) {
    this.minDwellSec = opt.seen ? MIN_DWELL_SEEN_SEC : MIN_DWELL_SEC;
    this.enterShot(0);
  }

  get done(): boolean { return this.phase === 'done'; }
  get skipped(): boolean { return this.skippedFlag; }
  get confirmOpen(): boolean { return this.gate.isOpen; }
  get needsConfirm(): boolean { return this.opt.skipConfirm && !this.opt.replay; }
  get current(): { shot: number; segment: number; phase: CutscenePhase; phaseSec: number } {
    return { shot: this.shotIndex, segment: this.seg, phase: this.phase, phaseSec: this.phaseSec };
  }

  setAutoAdvance(on: boolean): void { this.opt = { ...this.opt, autoAdvance: on }; }

  /** 取走累積的事件 */
  drain(): CutsceneEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private get shotPlan(): PlannedShot { return this.plan.shots[this.shotIndex]; }

  private enterShot(i: number): void {
    this.shotIndex = i;
    this.shotSec = 0;
    this.motionSec = 0;
    this.seg = 0;
    this.events.push({ type: 'shot', index: i });
    this.cues('start');
    if (this.shotPlan.transitionSec > 0) { this.phase = 'transition'; this.phaseSec = 0; } else this.startSegment(0);
  }

  private cues(at: 'start' | 'line' | 'end', line?: number): void {
    for (const c of this.shotPlan.def.audio ?? []) {
      if (c.at === at && (at !== 'line' || (c.line ?? 1) === line)) this.events.push({ type: 'audio', shot: this.shotIndex, cue: c.cue, at });
    }
  }

  private startSegment(j: number): void {
    const s = this.shotPlan;
    this.phaseSec = 0;
    if (j < s.segments.length) {
      this.seg = j;
      this.phase = 'fadeIn';
      this.events.push({ type: 'segment', shot: this.shotIndex, index: j });
      this.cues('line', j + 1);
      return;
    }
    // 各段都讀完：自動播放 (或沒有文字的鏡頭) 補足視覺最短秒，否則直接下一鏡
    const needPad = (this.opt.autoAdvance || s.segments.length === 0) && this.shotSec < s.transitionSec + s.minVisualSec;
    if (needPad) this.phase = 'pad'; else this.nextShot();
  }

  private nextShot(): void {
    this.cues('end');
    this.prevEnd = { shot: this.shotPlan, shotSec: this.shotSec, motionSec: this.motionSec };
    if (this.shotIndex + 1 < this.plan.shots.length) this.enterShot(this.shotIndex + 1);
    else this.finish(false);
  }

  private finish(skipped: boolean): void {
    if (this.phase === 'done') return;
    if (this.gate.isOpen) { this.gate.close(); this.events.push({ type: 'confirmClose' }); }
    this.phase = 'done';
    this.phaseSec = 0;
    this.holdSec = null;
    this.skippedFlag = skipped;
    this.events.push({ type: 'end', skipped });
  }

  /** 目前階段還剩幾秒 (手動推進的停留 = 無限) */
  private remaining(): number {
    const s = this.shotPlan;
    switch (this.phase) {
      case 'transition': return s.transitionSec - this.phaseSec;
      case 'fadeIn': return TEXT_FADE_IN_SEC - this.phaseSec;
      case 'hold': return this.opt.autoAdvance
        ? Math.max(s.segments[this.seg].sec - TEXT_FADE_IN_SEC - TEXT_FADE_OUT_SEC - this.phaseSec, 0)
        : Infinity;
      case 'fadeOut': return TEXT_FADE_OUT_SEC - this.phaseSec;
      case 'pad': return Math.max(s.transitionSec + s.minVisualSec - this.shotSec, 0);
      default: return Infinity;
    }
  }

  private completePhase(): void {
    switch (this.phase) {
      case 'transition': this.prevEnd = null; this.startSegment(0); break;
      case 'fadeIn': this.phase = 'hold'; this.phaseSec = 0; break;
      case 'hold': this.phase = 'fadeOut'; this.phaseSec = 0; break;
      case 'fadeOut': this.startSegment(this.seg + 1); break;
      case 'pad': this.nextShot(); break;
      default: break;
    }
  }

  /** 推進時間 (秒)；暫停或確認窗開著時時間軸不動 */
  tick(dt: number): void {
    this.realMs += dt * 1000;
    if (this.phase === 'done' || this.paused || this.gate.isOpen) return;
    if (this.holdSec !== null) {
      this.holdSec += dt;
      if (this.holdSec >= HOLD_SKIP_SEC) { this.holdSec = null; this.requestSkip(); if (this.gate.isOpen || this.done) return; }
    }
    let left = dt;
    for (let guard = 0; left > 0 && guard < 1000 && !this.done; guard++) {
      const rem = this.remaining();
      const step = Math.min(left, rem);
      this.phaseSec += step;
      this.shotSec += step;
      this.motionSec += step * (this.phase === 'fadeIn' ? MOTION_SLOW_DURING_FADE : 1);
      left -= step;
      if (step >= rem - 1e-9) this.completePhase();
      else break;
    }
  }

  /** 推進一段：完全淡入後 minDwell 秒內、淡入 / 淡出 / 轉場中的輸入丟棄；回傳是否接受 */
  advance(): boolean {
    if (this.paused || this.gate.isOpen) return false;
    if (this.phase === 'hold' && this.phaseSec >= this.minDwellSec - 1e-9) { this.phase = 'fadeOut'; this.phaseSec = 0; return true; }
    if (this.phase === 'pad') { this.nextShot(); return true; }
    return false;
  }

  /** 要求跳過整段：需確認時開確認窗 (暫停)，否則直接結束 */
  requestSkip(): 'confirm' | 'skipped' | 'ignored' {
    if (this.phase === 'done' || this.gate.isOpen) return 'ignored';
    this.holdSec = null;
    if (this.needsConfirm) {
      this.gate.open(this.realMs);
      this.events.push({ type: 'confirmOpen' });
      return 'confirm';
    }
    this.finish(true);
    return 'skipped';
  }

  /** 確認窗按鈕 (滑鼠 / 觸控)；鍵盤走 press() 的 300 ms 保護 */
  confirmSkip(): void { if (this.gate.isOpen) this.finish(true); }
  cancelSkip(): void {
    if (!this.gate.isOpen) return;
    this.gate.close();
    this.events.push({ type: 'confirmClose' });
  }

  /**
   * 鍵盤動作：確認窗開著時 Enter (開窗 300 ms 後) 確認、Esc 取消；
   * 否則 Esc = 要求跳過，Enter / E (與 advanceKey：空白鍵) = 推進
   */
  press(pressed: readonly InputAction[], advanceKey = false): void {
    if (this.phase === 'done') return;
    if (this.gate.isOpen) {
      const r = this.gate.press(pressed, this.realMs);
      if (r === 'confirm') this.finish(true);
      else if (r === 'cancel') this.events.push({ type: 'confirmClose' });
      return;
    }
    if (pressed.includes('cancel')) { this.requestSkip(); return; }
    if (advanceKey || pressed.includes('confirm') || pressed.includes('interact')) this.advance();
  }

  /** 指標按下 / 放開：短按 = 推進；長按 1 秒 = 要求跳過 */
  pointerDown(): void { if (this.phase !== 'done' && !this.gate.isOpen) this.holdSec = 0; }
  pointerUp(): void {
    if (this.holdSec === null) return;
    const tap = this.holdSec < TAP_MAX_SEC;
    this.holdSec = null;
    if (tap) this.advance();
  }
  pointerCancel(): void { this.holdSec = null; }

  /** 失焦 / 切到背景：暫停時間軸 */
  pause(): void { this.paused = true; this.holdSec = null; }
  resume(): void { this.paused = false; }

  view(): CutsceneView {
    const s = this.shotPlan;
    const p = this.phase;
    let segment: CutsceneView['segment'] = null;
    if (p === 'fadeIn' || p === 'hold' || p === 'fadeOut') {
      const alpha = p === 'fadeIn' ? this.phaseSec / TEXT_FADE_IN_SEC : p === 'fadeOut' ? 1 - this.phaseSec / TEXT_FADE_OUT_SEC : 1;
      segment = {
        index: this.seg,
        lines: s.segments[this.seg].lines,
        alpha: Math.min(Math.max(alpha, 0), 1),
        canAdvance: p === 'hold' && this.phaseSec >= this.minDwellSec - 1e-9
      };
    }
    return {
      shot: s,
      shotSec: this.shotSec,
      motionSec: this.motionSec,
      prev: p === 'transition' ? this.prevEnd : null,
      transition: p === 'transition' ? { kind: s.transition, p: s.transitionSec > 0 ? this.phaseSec / s.transitionSec : 1 } : null,
      segment,
      holdProgress: this.holdSec === null ? 0 : Math.min(this.holdSec / HOLD_SKIP_SEC, 1),
      confirmOpen: this.gate.isOpen,
      paused: this.paused,
      done: p === 'done',
      phase: p
    };
  }
}
