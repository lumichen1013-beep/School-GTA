// 過場驗證器 (cutscenes-v0.1 2.2、6.3；architecture 4.15)：純函式，不 import three / DOM
import type { CutsceneDef, CutTransition } from '../content/cutsceneTypes';
import { TRANSITION_SEC } from '../content/cutscenes';
import { NAME_MAX } from '../meta/save';
import { createText } from '../text/text';
import { checkLines, CPS, LEAD_SEC, MIN_SEGMENT_SEC, charCount, pauseSeconds, readingSeconds, shotSeconds } from '../text/readingTime';

export type CutsceneIssueCode =
  | 'cutscene.field'        // 欄位缺漏 / 型別錯 / 不認得的鏡頭欄位
  | 'cutscene.hardcodedSec' // 鏡頭資料寫了秒數 (秒數必須由公式算出)
  | 'cutscene.transition'   // 轉場名不合法
  | 'cutscene.textMissing'  // 文字 key 不存在
  | 'cutscene.keyFormat'    // 段落 key 不是 cs.<id>.<鏡>.<段>
  | 'cutscene.tooManyLines' // 一段超過 2 行
  | 'cutscene.lineTooLong'  // 一行超過 16 字 (或沒有可斷點、只能硬斷)
  | 'cutscene.dwellShort'   // 停留時間短於閱讀時間公式 (或 < 3 秒)
  | 'cutscene.speed'        // 停留時間內的閱讀速度超過上限
  | 'cutscene.duration'     // 總長不在設計範圍
  | 'cutscene.engine'       // 日後換引擎鏡頭的關卡未登錄
  | 'cutscene.audio';       // 音訊提示不合法 (含驚嚇提示：過場內不放驚嚇)

export interface CutsceneIssue { cutscene: string; shot?: number; line?: number; code: CutsceneIssueCode; message: string }

/** 時間軸 (播放器實際使用的秒數；app/cutscene 的 planCutscene 結果符合此形狀) */
export interface TimelineShot { transitionSec: number; minVisualSec: number; sec: number; segments: ReadonlyArray<{ text: string; sec: number }> }

export interface CutsceneContext {
  bundle: Readonly<Record<string, string>>;
  /** 已登錄的關卡 id (engineCandidate 檢查) */
  levelIds: readonly string[];
  /** 驗證速度 (每秒字數)；預設一般 6 */
  cps?: number;
  /** {name} 以幾字計；預設 NAME_MAX */
  nameLen?: number;
  /** 要檢查的實際時間軸 (例：播放器的計畫)；未給 = 由公式從資料算出 */
  timeline?: readonly TimelineShot[];
}

/** 總長設計範圍 (cutscenes-v0.1 6.3)：序章 / 結局 60～90 秒、其他 20～45 秒 */
export function durationRange(def: CutsceneDef): [number, number] {
  return def.trigger.beforeFirst !== undefined || def.trigger.ending !== undefined ? [60, 90] : [20, 45];
}

const SHOT_KEYS = new Set(['art', 'motion', 'transitionIn', 'lines', 'minVisualSec', 'audio']);
const SEC_LIKE = /sec|dur|time|ms$/i;
const SCARE = /scare|jump|shriek|scream/i;
const EPS = 1e-6;

/** 一段字幕的停留 sec 是否符合速度規則 (≥ 3 秒、≥ 公式、讀速 ≤ cps)；回傳問題代碼 */
export function dwellIssues(text: string, sec: number, opt: { cps: number; nameLen?: number }): CutsceneIssueCode[] {
  const out: CutsceneIssueCode[] = [];
  if (sec + EPS < MIN_SEGMENT_SEC || sec + EPS < readingSeconds(text, opt)) out.push('cutscene.dwellShort');
  const readable = sec - LEAD_SEC - pauseSeconds(text, opt);
  const n = charCount(text, opt);
  if (n > 0 && (readable <= 0 || n / readable > opt.cps + EPS)) out.push('cutscene.speed');
  return out;
}

export function validateCutscene(def: CutsceneDef, ctx: CutsceneContext): CutsceneIssue[] {
  const issues: CutsceneIssue[] = [];
  const id = typeof def.id === 'string' ? def.id : '?';
  const add = (code: CutsceneIssueCode, message: string, shot?: number, line?: number): void => {
    issues.push({ cutscene: id, ...(shot !== undefined ? { shot } : {}), ...(line !== undefined ? { line } : {}), code, message });
  };
  const cps = ctx.cps ?? CPS.normal;
  const nameLen = ctx.nameLen ?? NAME_MAX;
  const t = createText(ctx.bundle);
  const has = (k: string) => k in ctx.bundle;

  if (!/^cs:\w+$/.test(id)) add('cutscene.field', 'id must look like cs:<name>');
  if (typeof def.titleKey !== 'string' || !has(def.titleKey)) add('cutscene.textMissing', `title key "${String(def.titleKey)}" is missing`);
  if (!Array.isArray(def.shots) || def.shots.length === 0) { add('cutscene.field', 'shots must be a non-empty array'); return issues; }
  const short = id.slice(3);

  const computed: TimelineShot[] = [];
  def.shots.forEach((s, i) => {
    const shot = i + 1;
    for (const k of Object.keys(s)) {
      if (!SHOT_KEYS.has(k)) add(SEC_LIKE.test(k) ? 'cutscene.hardcodedSec' : 'cutscene.field', `unknown shot field "${k}"`, shot);
    }
    if (!s.art || s.art.kind !== 'paper' || typeof s.art.sceneId !== 'string' || s.art.sceneId === '') add('cutscene.field', 'art must be { kind: paper, sceneId }', shot);
    if (!((s.transitionIn as string) in TRANSITION_SEC)) add('cutscene.transition', `unknown transition "${String(s.transitionIn)}"`, shot);
    if (s.minVisualSec !== undefined && !(typeof s.minVisualSec === 'number' && s.minVisualSec >= 0)) add('cutscene.field', 'minVisualSec must be ≥ 0', shot);
    for (const key of Object.values(s.art?.labels ?? {}) as string[]) if (!has(key)) add('cutscene.textMissing', `label key "${key}" is missing`, shot);
    const lvl = s.art?.engineCandidate?.levelId;
    if (lvl !== undefined && !ctx.levelIds.includes(lvl)) add('cutscene.engine', `engine level "${lvl}" is not registered`, shot);
    for (const c of s.audio ?? []) {
      if (typeof c.cue !== 'string' || !/^[a-z][\w.]*$/i.test(c.cue)) add('cutscene.audio', `bad cue "${String(c.cue)}"`, shot);
      else if (SCARE.test(c.cue)) add('cutscene.audio', `scare cue "${c.cue}" not allowed in cutscenes`, shot);
      if (c.at === 'line' && !(Number.isInteger(c.line) && (c.line as number) >= 1 && (c.line as number) <= s.lines.length)) add('cutscene.audio', 'line cue must point at an existing line', shot);
    }
    const segs: Array<{ text: string; sec: number }> = [];
    ((Array.isArray(s.lines) ? s.lines : []) as readonly string[]).forEach((key: string, j: number) => {
      const line = j + 1;
      if (key !== `cs.${short}.${shot}.${line}`) add('cutscene.keyFormat', `line key "${key}" should be cs.${short}.${shot}.${line}`, shot, line);
      if (!has(key)) { add('cutscene.textMissing', `text key "${key}" is missing`, shot, line); return; }
      const text = t(key);
      const c = checkLines(text, { nameLen });
      if (c.tooManyLines) add('cutscene.tooManyLines', `"${text}" needs ${c.lines.length} lines (max 2)`, shot, line);
      if (c.longLines.length || c.hardBreak) add('cutscene.lineTooLong', `"${text}" has a line over 16 characters`, shot, line);
      segs.push({ text, sec: readingSeconds(text, { cps, nameLen }) });
    });
    const tr = TRANSITION_SEC[s.transitionIn as CutTransition] ?? 0;
    computed.push({ transitionSec: tr, minVisualSec: s.minVisualSec ?? 0, segments: segs, sec: shotSeconds(segs.map(g => g.sec), s.minVisualSec ?? 0, tr) });
  });

  // 時間軸：每段停留符合速度規則、鏡頭秒數 = 公式
  const timeline = ctx.timeline ?? computed;
  timeline.forEach((s, i) => {
    s.segments.forEach((g, j) => {
      for (const code of dwellIssues(g.text, g.sec, { cps, nameLen: g.text.includes('{name}') ? nameLen : undefined })) {
        add(code, `"${g.text}" stays ${g.sec.toFixed(2)}s (formula ${readingSeconds(g.text, { cps, nameLen }).toFixed(2)}s)`, i + 1, j + 1);
      }
    });
    const formula = shotSeconds(s.segments.map(g => g.sec), s.minVisualSec, s.transitionSec);
    if (Math.abs(formula - s.sec) > 1e-3) add('cutscene.hardcodedSec', `shot seconds ${s.sec} ≠ formula ${formula.toFixed(2)}`, i + 1);
  });
  const total = timeline.reduce((a, s) => a + s.sec, 0);
  const [lo, hi] = durationRange(def);
  if (total < lo || total > hi) add('cutscene.duration', `total ${total.toFixed(1)}s is outside ${lo}–${hi}s`);
  return issues;
}
