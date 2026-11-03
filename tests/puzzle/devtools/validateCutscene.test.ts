import { describe, it, expect } from 'vitest';
import { CUTSCENES, cutsceneById } from '../../../src/puzzle/content/cutscenes';
import type { CutsceneDef, ShotDef } from '../../../src/puzzle/content/cutsceneTypes';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { planCutscene } from '../../../src/puzzle/app/cutscene';
import { dwellIssues, durationRange, validateCutscene, type CutsceneIssue } from '../../../src/puzzle/devtools/validateCutscene';
import { TEXT } from '../msgs';

const ctx = { bundle: zhHant, levelIds: LEVELS.map(e => e.id) };
const prologue = cutsceneById('cs:prologue')!;
const codes = (is: CutsceneIssue[]) => is.map(i => [i.code, i.shot ?? null, i.line ?? null]);
const withShot = (i: number, patch: Partial<ShotDef> & Record<string, unknown>): CutsceneDef =>
  ({ ...prologue, shots: prologue.shots.map((s, k) => (k === i ? { ...s, ...patch } as ShotDef : s)) });

describe('過場驗證器：序章', () => {
  it('所有過場零問題 (暱稱以 12 字計、一般速度)', () => {
    expect(CUTSCENES.flatMap(c => validateCutscene(c, ctx))).toEqual([]);
    expect(durationRange(prologue)).toEqual([60, 90]);
  });

  it('播放器的實際計畫 (12 字暱稱) 也符合速度規則；慢速計畫以 4.5 字檢查也通過 (總長除外)', () => {
    const plan = planCutscene(prologue, TEXT, { speed: 'normal', reduceMotion: false, name: '一二三四五六七八九十一二' });
    expect(validateCutscene(prologue, { ...ctx, timeline: plan.shots })).toEqual([]);
    const slow = planCutscene(prologue, TEXT, { speed: 'slow', reduceMotion: false, name: '阿青' });
    expect(validateCutscene(prologue, { ...ctx, cps: 4.5, timeline: slow.shots }).filter(i => i.code !== 'cutscene.duration')).toEqual([]);
  });
});

describe('過場驗證器：偵測', () => {
  it('太短的停留：段落秒數低於公式或 3 秒 → dwellShort；讀速超過上限 → speed', () => {
    const plan = planCutscene(prologue, TEXT, { speed: 'normal', reduceMotion: false, name: '阿青' });
    const tampered = plan.shots.map((s, i) => (i === 0 ? { ...s, segments: [{ ...s.segments[0], sec: 2 }], sec: 3 } : s));
    expect(codes(validateCutscene(prologue, { ...ctx, timeline: tampered }))).toEqual([['cutscene.dwellShort', 1, 1], ['cutscene.speed', 1, 1]]);
    expect(dwellIssues('老宅在山上。', 2.9, { cps: 6 })).toEqual(['cutscene.dwellShort']);
    expect(dwellIssues('老宅在山上。', 3, { cps: 6 })).toEqual([]);
    expect(dwellIssues('暑假最後一個週五，你收到一封信。', 4.0, { cps: 6 })).toEqual(['cutscene.dwellShort', 'cutscene.speed']);
  });

  it('鏡頭秒數寫死：資料有秒數欄位，或時間軸秒數與公式不符 → hardcodedSec', () => {
    expect(codes(validateCutscene(withShot(2, { durationSec: 9.8 }), ctx))).toEqual([['cutscene.hardcodedSec', 3, null]]);
    const plan = planCutscene(prologue, TEXT, { speed: 'normal', reduceMotion: false, name: '阿青' });
    const fixed = plan.shots.map((s, i) => (i === 4 ? { ...s, sec: 7 } : s));
    expect(codes(validateCutscene(prologue, { ...ctx, timeline: fixed })).filter(c => c[0] === 'cutscene.hardcodedSec')).toEqual([['cutscene.hardcodedSec', 5, null]]);
  });

  it('超長一行 (作者斷行超過 16 字、或沒有可斷點) → lineTooLong；超過 2 行 → tooManyLines', () => {
    const b1 = { ...zhHant, 'cs.prologue.5.1': '老宅在山上\n一條很長很長很長很長很長很長的山路' };
    expect(codes(validateCutscene(prologue, { ...ctx, bundle: b1 }))).toEqual([['cutscene.lineTooLong', 5, 1]]);
    const b2 = { ...zhHant, 'cs.prologue.5.1': '一條很長很長很長很長很長很長的山路' };
    expect(codes(validateCutscene(prologue, { ...ctx, bundle: b2 }))).toEqual([['cutscene.lineTooLong', 5, 1]]);
    const b3 = { ...zhHant, 'cs.prologue.5.1': '老宅在山上，山路很長很長很長很長，車子開了很久很久很久很久，訊號一格一格消失了。' };
    // 這段太長也讓總長超過 90 秒 (另報 duration)
    expect(codes(validateCutscene(prologue, { ...ctx, bundle: b3 })).filter(c => c[0] !== 'cutscene.duration')).toEqual([['cutscene.tooManyLines', 5, 1]]);
  });

  it('{name} 以 12 字計：會把一行撐超過 16 字的寫法被抓出', () => {
    const b = { ...zhHant, 'cs.prologue.2.2': '親愛的{name}先生' }; // 3 + 12 + 2 = 17，沒有可斷點
    expect(codes(validateCutscene(prologue, { ...ctx, bundle: b }))).toEqual([['cutscene.lineTooLong', 2, 2]]);
    const ok = { ...zhHant, 'cs.prologue.2.2': '「{name}，你好嗎。」' }; // 在逗號後斷成兩行
    expect(validateCutscene(prologue, { ...ctx, bundle: ok })).toEqual([]);
  });

  it('缺 key：段落 / 標題 / 畫面字 → textMissing；段落 key 格式不符 → keyFormat', () => {
    const { ['cs.prologue.3.2']: _drop, ['cs.prologue.title']: _t, ['cs.prologue.art.seal']: _s, ...rest } = zhHant;
    expect(codes(validateCutscene(prologue, { ...ctx, bundle: rest }))).toEqual([
      ['cutscene.textMissing', null, null], ['cutscene.textMissing', 1, null], ['cutscene.textMissing', 3, 2]
    ]);
    expect(codes(validateCutscene(withShot(0, { lines: ['cs.prologue.5.1'] }), ctx))).toEqual([['cutscene.keyFormat', 1, 1]]);
  });

  it('轉場名、引擎關卡、驚嚇音、line 提示、總長範圍', () => {
    expect(codes(validateCutscene(withShot(0, { transitionIn: 'spin' as never }), ctx))[0]).toEqual(['cutscene.transition', 1, null]);
    expect(codes(validateCutscene(withShot(6, { art: { kind: 'paper', sceneId: 'prologue.porch', engineCandidate: { levelId: '9-9' } } }), ctx)))
      .toEqual([['cutscene.engine', 7, null]]);
    expect(codes(validateCutscene(withShot(0, { audio: [{ at: 'start', cue: 'scare.sting' }, { at: 'line', line: 3, cue: 'x' }] }), ctx)))
      .toEqual([['cutscene.audio', 1, null], ['cutscene.audio', 1, null]]);
    const short: CutsceneDef = { ...prologue, shots: prologue.shots.slice(0, 3) };
    expect(codes(validateCutscene(short, ctx))).toEqual([['cutscene.duration', null, null]]);
  });
});
