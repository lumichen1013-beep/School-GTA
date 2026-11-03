// 閱讀時間與字幕版面 (cutscenes-v0.1 2.2)：純函式，不 import 任何其他層
// T = max(3.0, 1.5 + n ÷ cps + 停頓)；n：中文 / 全形 1、半形英數 0.5、標點不計；{name} 驗證時以 nameLen 計

/** 一般 / 慢速的每秒字數 (設定 textSpeed) */
export const CPS = { normal: 6, slow: 4.5 } as const;
export type TextSpeed = keyof typeof CPS;
/** 任何一段的最短停留秒數 */
export const MIN_SEGMENT_SEC = 3;
/** 開始讀之前的定位時間 */
export const LEAD_SEC = 1.5;
/** 每行字數上限、每段行數上限 */
export const LINE_MAX = 16;
export const LINES_MAX = 2;

const PAUSE_SHORT = 0.2; // ，、；：
const PAUSE_LONG = 0.4;  // 。！？
const PAUSE_ELLIPSIS = 0.6; // …… (一串算一次)

// 標點以正規式常值表示 (不用字串常值：程式中的字串不得含 CJK，見 textKeys.test)
const SHORT = /^[\uFF0C\u3001\uFF1B\uFF1A,;:]$/;
const LONG = /^[\u3002\uFF01\uFF1F!?]$/;
const ELLIPSIS = /^\u2026$/;
/** 破折號：不在其前後斷行 */
const DASH = /^[\u2014\u2015]$/;
/** 開括號 (不在其後斷行) / 閉括號 (不放行首) */
const OPEN = /^[\u300C\u300E\uFF08\u300A\u3008\u3014\u3010([{]$/;
const CLOSE = /^[\u300D\u300F\uFF09\u300B\u3009\u3015\u3011)\]}]$/;
/** 標點：全形標點區 (U+3000–303F)、全形符號、破折號、刪節號、間隔號、ASCII 標點與空白 */
const isPunct = (c: string): boolean =>
  /[\u3000-\u303F\u2010-\u2027\u00B7\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(c) || /[\s!-/:-@[-`{-~]/.test(c);
const isHalfAlnum = (c: string): boolean => /[A-Za-z0-9]/.test(c);
const isHalf = (c: string): boolean => c.length === 1 && c.charCodeAt(0) < 0x2000 && !/[·]/.test(c);

/** 一個顯示單位：s 為原文片段 ({name} 只放在展開的第一格)；w 顯示寬；n 計字；pause 停頓秒 */
export interface Glyph { s: string; w: number; n: number; pause: number; punct: boolean; open: boolean; close: boolean }

export interface CountOptions {
  /** 驗證時 {name} 以幾個全形字計 (例：NAME_MAX = 12)；未給 = {name} 已被插值成實際暱稱 */
  nameLen?: number;
}

const NAME_TOKEN = '{name}';

/** 拆成顯示單位 */
export function glyphs(s: string, opt: CountOptions = {}): Glyph[] {
  const out: Glyph[] = [];
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    if (opt.nameLen !== undefined && chars.slice(i, i + NAME_TOKEN.length).join('') === NAME_TOKEN) {
      for (let k = 0; k < opt.nameLen; k++) out.push({ s: k === 0 ? NAME_TOKEN : '', w: 1, n: 1, pause: 0, punct: false, open: false, close: false });
      if (opt.nameLen === 0) out.push({ s: NAME_TOKEN, w: 0, n: 0, pause: 0, punct: false, open: false, close: false });
      i += NAME_TOKEN.length - 1;
      continue;
    }
    const c = chars[i];
    const punct = isPunct(c);
    let pause = 0;
    if (SHORT.test(c)) pause = PAUSE_SHORT;
    else if (LONG.test(c)) pause = PAUSE_LONG;
    else if (ELLIPSIS.test(c) && !ELLIPSIS.test(chars[i - 1] ?? '')) pause = PAUSE_ELLIPSIS;
    out.push({
      s: c,
      w: isHalf(c) ? 0.5 : 1,
      n: punct ? 0 : isHalfAlnum(c) ? 0.5 : 1,
      pause,
      punct,
      open: OPEN.test(c) || DASH.test(c),
      close: CLOSE.test(c) || SHORT.test(c) || LONG.test(c) || ELLIPSIS.test(c) || DASH.test(c)
    });
  }
  return out;
}

/** 計字 n (標點不計、半形英數 0.5) */
export const charCount = (s: string, opt: CountOptions = {}): number => glyphs(s, opt).reduce((a, g) => a + g.n, 0);
/** 標點停頓秒數 */
export const pauseSeconds = (s: string, opt: CountOptions = {}): number => glyphs(s, opt).reduce((a, g) => a + g.pause, 0);
/** 顯示寬 (全形 1、半形 0.5；標點也佔寬) */
export const displayWidth = (s: string, opt: CountOptions = {}): number => glyphs(s, opt).reduce((a, g) => a + g.w, 0);

/** 每段停留秒數 T = max(3, 1.5 + n ÷ cps + 停頓) */
export function readingSeconds(s: string, opt: CountOptions & { cps: number }): number {
  const g = glyphs(s, opt);
  const n = g.reduce((a, x) => a + x.n, 0);
  const pause = g.reduce((a, x) => a + x.pause, 0);
  return Math.max(MIN_SEGMENT_SEC, LEAD_SEC + n / opt.cps + pause);
}

/** 鏡頭秒數 = max(各段 T 之和, 視覺最短秒) + 轉場秒 (cutscenes-v0.1 2.2) */
export function shotSeconds(segmentSecs: readonly number[], minVisualSec: number, transitionSec: number): number {
  return Math.max(segmentSecs.reduce((a, b) => a + b, 0), minVisualSec) + transitionSec;
}

const join = (gs: readonly Glyph[]): string => gs.map(g => g.s).join('');
const width = (gs: readonly Glyph[]): number => gs.reduce((a, g) => a + g.w, 0);

/**
 * 字幕斷行：含 \n = 作者指定的行，原樣保留 (不再自動斷)；否則放得下就一行，
 * 放不下就在標點後斷 (不讓閉括號 / 句讀落在行首、不在開括號與破折號旁斷)，兩行都放得下時取兩行最平均的位置；
 * 都不行時取最遠的可斷點再遞迴；沒有可斷點時硬斷在上限 (hardBreak = true，驗證器視為超長一行)。
 */
export function layout(s: string, opt: CountOptions & { max?: number } = {}): { lines: string[]; hardBreak: boolean } {
  const max = opt.max ?? LINE_MAX;
  if (s.includes('\n')) return { lines: s.split('\n'), hardBreak: false };
  const st = { hard: false };
  return { lines: breakGlyphs(glyphs(s, opt), max, st).map(join), hardBreak: st.hard };
}

export const layoutLines = (s: string, opt: CountOptions & { max?: number } = {}): string[] => layout(s, opt).lines;

function breakGlyphs(gs: Glyph[], max: number, st: { hard: boolean }): Glyph[][] {
  if (width(gs) <= max || gs.length <= 1) return [gs];
  const cands: number[] = []; // 在 gs[i] 之後斷
  for (let i = 0; i < gs.length - 1; i++) {
    if (gs[i].punct && !gs[i].open && !gs[i + 1].close) cands.push(i);
  }
  let best = -1, bestScore = Infinity;
  for (const i of cands) {
    const a = width(gs.slice(0, i + 1)), b = width(gs.slice(i + 1));
    if (a <= max && b <= max && Math.max(a, b) <= bestScore) { best = i; bestScore = Math.max(a, b); }
  }
  if (best >= 0) return [gs.slice(0, best + 1), gs.slice(best + 1)];
  const fit = cands.filter(i => width(gs.slice(0, i + 1)) <= max);
  let cut: number;
  if (fit.length) cut = fit[fit.length - 1] + 1;
  else {
    st.hard = true;
    let w = 0;
    cut = 0;
    while (cut < gs.length && w + gs[cut].w <= max) w += gs[cut++].w;
    cut = Math.max(cut, 1);
  }
  return [gs.slice(0, cut), ...breakGlyphs(gs.slice(cut), max, st)];
}

export interface LineCheck {
  lines: string[];
  /** 各行顯示寬 */
  widths: number[];
  tooManyLines: boolean;
  /** 超過每行上限的行索引 (作者指定的行)，或沒有可斷點而被硬斷 */
  longLines: number[];
  hardBreak: boolean;
}

/** 一段字幕的版面檢查 (≤ 2 行 × 16 字；{name} 以 nameLen 計) */
export function checkLines(s: string, opt: CountOptions & { max?: number; maxLines?: number } = {}): LineCheck {
  const max = opt.max ?? LINE_MAX;
  const { lines, hardBreak } = layout(s, opt);
  const widths = lines.map(l => displayWidth(l, opt));
  return {
    lines,
    widths,
    tooManyLines: lines.length > (opt.maxLines ?? LINES_MAX),
    longLines: widths.flatMap((w, i) => (w > max ? [i] : [])),
    hardBreak
  };
}
