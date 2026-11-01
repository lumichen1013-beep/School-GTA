// 過場劇情播放器 (純邏輯，無 three.js / DOM 依賴，可單元測試)：資料驅動 —— 台詞陣列 + 事件掛在句子上，
// 每句顯示時間依字數自動計算 (換台詞不必改計時)；支援點擊前進下一句 (每句至少顯示 ADVANCE_MIN_SEC) 與長按跳過。

/** 過場事件：掛在某句上，於該句開始後 at 秒觸發 (at < 0 = 該句結束前 |at| 秒；超出該句長度時夾在句尾)。跳句 / 跳過時立即補發 */
export interface StoryCue {
  id: string;
  at?: number;
}

/** 一句台詞 (字幕 / Boss框 / 玩家框)；events 為掛在本句的過場事件；hold 為依字數時長之外的額外停留 (演出需要) */
export interface StoryLine {
  text: string;
  who?: 'SUB' | 'BOSS' | 'PLAYER';
  events?: readonly StoryCue[];
  hold?: number;
}

export const READ_SEC_PER_CHAR = 0.14;
export const READ_BASE_SEC = 0.5;
export const READ_MIN_SEC = 2.0;
/** 點擊前進：本句至少已顯示這麼久才接受 (防連點跳過) */
export const ADVANCE_MIN_SEC = 0.6;
/** 長按跳過整段 */
export const HOLD_SKIP_SEC = 1.0;

// 閱讀字數：不計 emoji (含變體選擇符 / ZWJ) 與引號括號
const NON_READ = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}「」『』（）()]/u;
export function readingLength(text: string): number {
  let n = 0;
  for (const ch of text) if (!NON_READ.test(ch)) n++;
  return n;
}

/** 一句台詞的顯示秒數 = max(2, 字數 × 0.14 + 0.5) + hold */
export function lineDuration(line: Pick<StoryLine, 'text' | 'hold'>): number {
  return Math.max(READ_MIN_SEC, readingLength(line.text) * READ_SEC_PER_CHAR + READ_BASE_SEC) + (line.hold ?? 0);
}

/** 整段總長 (lead + 各句 + tail) */
export function storyTotal(lines: readonly StoryLine[], lead: number = 0, tail: number = 0): number {
  let t = lead + tail;
  for (const l of lines) t += lineDuration(l);
  return t;
}

export interface StoryHandler {
  onLine(index: number, line: StoryLine, duration: number): void;
  onEvent(id: string): void;
}

/**
 * 播放器：lead 秒後播第一句，各句依 lineDuration 自動前進，最後一句後再等 tail 秒結束。
 * 事件在所屬句子時間內觸發；advance() / finish() 時補發被跳過的事件 (順序不變)，保證世界狀態一致。
 */
export class StoryPlayer {
  public index = -1;       // 目前句 (-1 = lead 中；lines.length = tail 中)
  public lineTime = 0;     // 目前句已顯示秒數 (lead / tail 中為該段已過秒數)
  public elapsed = 0;      // 整段已過秒數
  public done = false;
  private fired: boolean[] = [];
  private durations: number[] = [];

  constructor(
    public readonly lines: readonly StoryLine[],
    private readonly handler: StoryHandler,
    public readonly lead: number = 0,
    public readonly tail: number = 0
  ) {
    this.durations = lines.map((l) => lineDuration(l));
    if (lead <= 0) this.enterLine(0);
  }

  public get total(): number {
    return this.lead + this.tail + this.durations.reduce((a, b) => a + b, 0);
  }

  /** 目前句長度 (lead / tail 中回傳該段長度) */
  public get currentDuration(): number {
    if (this.index < 0) return this.lead;
    if (this.index >= this.lines.length) return this.tail;
    return this.durations[this.index];
  }

  public update(dt: number) {
    if (this.done) return;
    this.elapsed += dt;
    this.lineTime += dt;
    // 單幀可能跨越多句 (大 dt)：逐句推進
    for (let guard = 0; guard < 64 && !this.done; guard++) {
      if (this.index >= 0 && this.index < this.lines.length) this.fireDue(false);
      if (this.lineTime < this.currentDuration) break;
      const over = this.lineTime - this.currentDuration;
      this.next();
      this.lineTime = over;
    }
  }

  /** 點擊前進：本句已顯示 ≥ ADVANCE_MIN_SEC 才跳到下一句 (lead 中直接開始第一句)；回傳是否有前進 */
  public advance(): boolean {
    if (this.done) return false;
    if (this.index >= this.lines.length) return false; // tail 中不接受 (避免把收尾鏡頭切掉)
    if (this.index >= 0 && this.lineTime < ADVANCE_MIN_SEC) return false;
    if (this.index >= 0) this.fireDue(true);
    this.elapsed += Math.max(0, this.currentDuration - this.lineTime);
    this.lineTime = 0;
    this.next();
    return true;
  }

  /** 跳過整段：依序補發所有未觸發事件 (不再顯示台詞) 後結束 */
  public finish() {
    if (this.done) return;
    for (let i = Math.max(0, this.index); i < this.lines.length; i++) {
      if (i !== this.index) { this.index = i; this.fired = this.lines[i].events?.map(() => false) ?? []; }
      this.fireDue(true);
    }
    this.index = this.lines.length;
    this.done = true;
  }

  private next() {
    if (this.index + 1 < this.lines.length) this.enterLine(this.index + 1);
    else if (this.index < this.lines.length) {
      this.index = this.lines.length;
      if (this.tail <= 0) this.done = true;
    } else this.done = true;
  }

  private enterLine(i: number) {
    this.index = i;
    this.lineTime = 0;
    const line = this.lines[i];
    this.fired = line.events?.map(() => false) ?? [];
    this.handler.onLine(i, line, this.durations[i]);
    this.fireDue(false);
  }

  /** 觸發本句到時間的事件 (all = 全部補發) */
  private fireDue(all: boolean) {
    const evs = this.lines[this.index]?.events;
    if (!evs) return;
    const dur = this.durations[this.index];
    for (let k = 0; k < evs.length; k++) {
      if (this.fired[k]) continue;
      const at = evs[k].at ?? 0;
      const when = Math.min(dur, Math.max(0, at < 0 ? dur + at : at));
      if (all || this.lineTime >= when) {
        this.fired[k] = true;
        this.handler.onEvent(evs[k].id);
      }
    }
  }
}

/**
 * 點擊 / 按鍵前進與長按跳過 (時間以秒傳入)：按下後 HOLD_SKIP_SEC 內放開 = 前進一句；按住滿 HOLD_SKIP_SEC = 跳過整段 (只觸發一次)。
 */
export class CutsceneInput {
  private downAt = -1;
  private skipped = false;

  public press(now: number) {
    if (this.downAt >= 0) return;
    this.downAt = now;
    this.skipped = false;
  }

  /** 放開：未達長按門檻回傳 'ADVANCE' */
  public release(now: number): 'ADVANCE' | null {
    if (this.downAt < 0) return null;
    const held = now - this.downAt;
    this.downAt = -1;
    return !this.skipped && held < HOLD_SKIP_SEC ? 'ADVANCE' : null;
  }

  /** 每幀：按住滿門檻回傳 'SKIP' (一次) */
  public update(now: number): 'SKIP' | null {
    if (this.downAt < 0 || this.skipped) return null;
    if (now - this.downAt >= HOLD_SKIP_SEC) {
      this.skipped = true;
      return 'SKIP';
    }
    return null;
  }

  /** 長按進度 0~1 (未按 0) */
  public progress(now: number): number {
    if (this.downAt < 0 || this.skipped) return 0;
    return Math.min(1, (now - this.downAt) / HOLD_SKIP_SEC);
  }

  public reset() {
    this.downAt = -1;
    this.skipped = false;
  }
}
