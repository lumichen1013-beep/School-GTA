import { describe, it, expect } from 'vitest';
import {
  CutscenePlayer, HOLD_SKIP_SEC, MIN_DWELL_SEC, MIN_DWELL_SEEN_SEC, planCutscene, TEXT_FADE_IN_SEC, TEXT_FADE_OUT_SEC,
  type CutsceneEvent, type PlayerOptions
} from '../../../src/puzzle/app/cutscene';
import { CONFIRM_GUARD_MS } from '../../../src/puzzle/app/restartConfirm';
import { CUTSCENES, cutsceneById, PROLOGUE_ID, TRANSITION_SEC } from '../../../src/puzzle/content/cutscenes';
import type { CutsceneDef } from '../../../src/puzzle/content/cutsceneTypes';
import { NAME_MAX } from '../../../src/puzzle/meta/save';
import { readingSeconds } from '../../../src/puzzle/text/readingTime';
import { TEXT } from '../msgs';
import { createText } from '../../../src/puzzle/text/text';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';

const DT = 1 / 60;
const NAME12 = '一二三四五六七八九十一二';
const prologue = cutsceneById(PROLOGUE_ID)!;
/** 新序章不含 {name}：插值測試用的文字表 (第 2 鏡第 2 段換成含 {name} 的句子) */
const NAMED_TEXT = createText({ ...zhHant, 'cs.prologue.2.2': '「{name}。」' });
const plan = (def: CutsceneDef = prologue, o: Partial<{ speed: 'normal' | 'slow'; reduceMotion: boolean; name: string; text: typeof TEXT }> = {}) => {
  const { text = TEXT, ...rest } = o;
  return planCutscene(def, text, { speed: 'normal', reduceMotion: false, name: '阿青', ...rest });
};
const player = (o: Partial<PlayerOptions> = {}, def: CutsceneDef = prologue) =>
  new CutscenePlayer(plan(def), { autoAdvance: false, skipConfirm: true, replay: false, seen: false, ...o });
/** 以固定步長推進 sec 秒 */
const run = (p: CutscenePlayer, sec: number) => { for (let t = 0; t < sec - 1e-9; t += DT) p.tick(Math.min(DT, sec - t)); };
const ends = (es: CutsceneEvent[]) => es.filter(e => e.type === 'end');

/** 兩鏡的小過場：鏡 1 淡入 1.0 + 一段；鏡 2 切 + 兩段 */
const mini: CutsceneDef = {
  id: 'cs:ch1', titleKey: 'cs.prologue.title', trigger: {}, replayable: true,
  shots: [
    { art: { kind: 'paper', sceneId: 'x' }, transitionIn: 'fade', lines: ['cs.prologue.2.1'], audio: [{ at: 'start', cue: 'a' }, { at: 'end', cue: 'b' }] },
    { art: { kind: 'paper', sceneId: 'y' }, transitionIn: 'cut', lines: ['cs.prologue.10.1', 'cs.prologue.8.1'], audio: [{ at: 'line', line: 2, cue: 'c' }] }
  ]
};

describe('序章資料 (12 鏡新版)', () => {
  it('12 鏡；每段都有文字；總長 (自動播放、一般速度、暱稱 12 字) 約 108.4 秒 (±1，在 60～110 內)', () => {
    expect(CUTSCENES.map(c => c.id)).toEqual(['cs:prologue', 'cs:ch2', 'cs:ch3', 'cs:night']); // 序章 + 第二章末 (cs:ch2) + 第三章末 (cs:ch3，第四章骨架) + 第四章末 (cs:night，第五章骨架)
    expect(prologue.shots.length).toBe(12);
    const p = plan(prologue, { name: NAME12 });
    expect(p.totalSec).toBeGreaterThan(107.4);
    expect(p.totalSec).toBeLessThan(109.4);
    // 每鏡秒數與分鏡表 (四捨五入到 0.1 的值) 相差 < 0.15
    const DOC = [9.0, 7.7, 9.7, 11.0, 8.5, 8.5, 7.0, 8.0, 10.0, 12.0, 11.9, 5.0];
    p.shots.forEach((s, i) => expect(Math.abs(s.sec - DOC[i])).toBeLessThan(0.15));
    // 新逐字稿沒有 {name}：以加了 {name} 段落的文字表確認 12 字暱稱的插值
    expect(plan(prologue, { name: NAME12, text: NAMED_TEXT }).shots[1].segments[1].text).toBe(`「${NAME12}。」`);
  });

  it('秒數由公式算出：鏡頭秒數 = max(各段 T 和, 視覺最短秒) + 轉場；資料裡沒有秒數欄位', () => {
    const p = plan();
    for (const s of p.shots) {
      const sum = s.segments.reduce((a, g) => a + readingSeconds(g.text, { cps: 6 }), 0);
      expect(s.sec).toBeCloseTo(Math.max(sum, s.minVisualSec) + TRANSITION_SEC[s.def.transitionIn]);
    }
    for (const s of prologue.shots) expect(Object.keys(s).filter(k => /sec|dur|time/i.test(k) && k !== 'minVisualSec')).toEqual([]);
  });

  it('慢速比一般長；減弱動態轉場一律 0.6 秒淡入淡出 (切仍為切)', () => {
    expect(plan(prologue, { speed: 'slow' }).totalSec).toBeGreaterThan(plan().totalSec + 10);
    const r = plan(prologue, { reduceMotion: true });
    expect(r.shots.map(s => [s.transition, s.transitionSec])).toEqual(prologue.shots.map(s => (s.transitionIn === 'cut' ? ['cut', 0] : ['fade', 0.6])));
  });

  it('暱稱插值：畫面字也解析', () => {
    const p = plan(prologue, { name: '小桐', text: NAMED_TEXT });
    expect(p.shots[1].segments[1].lines).toEqual(['「小桐。」']);
    expect(p.shots[8].labels.engrave).toBe(TEXT('cs.prologue.art.engrave'));
    expect(NAME_MAX).toBe(12);
  });
});

describe('時間軸：手動推進與 minDwell 1.2 秒', () => {
  it('轉場與淡入中、完全淡入後 1.2 秒內的推進都被丟棄；之後才接受', () => {
    const p = player({}, mini);
    expect(p.view().phase).toBe('transition');
    expect(p.advance()).toBe(false);
    run(p, TRANSITION_SEC.fade);
    expect(p.view().phase).toBe('fadeIn');
    expect(p.advance()).toBe(false);
    run(p, TEXT_FADE_IN_SEC);
    expect(p.view().phase).toBe('hold');
    run(p, MIN_DWELL_SEC - 0.05);
    expect(p.advance()).toBe(false);
    expect(p.view().segment!.canAdvance).toBe(false);
    run(p, 0.06);
    expect(p.view().segment!.canAdvance).toBe(true);
    expect(p.advance()).toBe(true);
    expect(p.view().phase).toBe('fadeOut');
    expect(p.advance()).toBe(false);
  });

  it('手動模式不會自己往下走 (停留無限)', () => {
    const p = player({}, mini);
    run(p, 60);
    expect(p.current).toMatchObject({ shot: 0, segment: 0, phase: 'hold' });
  });

  it('依序推進到結束：鏡頭 / 段落 / 音訊掛點 / 結束事件', () => {
    const p = player({}, mini);
    const evs: CutsceneEvent[] = [...p.drain()];
    const step = () => { run(p, 2); expect(p.advance()).toBe(true); run(p, TEXT_FADE_OUT_SEC + DT); evs.push(...p.drain()); };
    run(p, 1); step(); step();
    expect(p.done).toBe(false);
    step();
    expect(p.done).toBe(true);
    expect(p.skipped).toBe(false);
    expect(evs.map(e => (e.type === 'audio' ? `audio:${e.cue}` : e.type === 'segment' ? `seg:${e.shot}.${e.index}` : e.type === 'shot' ? `shot:${e.index}` : e.type)))
      .toEqual(['shot:0', 'audio:a', 'seg:0.0', 'audio:b', 'shot:1', 'seg:1.0', 'seg:1.1', 'audio:c', 'end']);
  });

  it('已看過：minDwell 降到 0.4 秒', () => {
    const p = player({ seen: true }, mini);
    expect(p.minDwellSec).toBe(MIN_DWELL_SEEN_SEC);
    run(p, TRANSITION_SEC.fade + TEXT_FADE_IN_SEC + MIN_DWELL_SEEN_SEC + 0.01);
    expect(p.advance()).toBe(true);
  });

  it('Enter / E / 空白鍵 = 推進；Esc = 要求跳過', () => {
    const p = player();
    run(p, 3);
    p.press(['confirm']);
    expect(p.view().phase).toBe('fadeOut');
    run(p, 3);
    p.press([], true);
    expect(p.view().phase).toBe('fadeOut');
    run(p, 3);
    p.press(['interact']);
    expect(p.view().phase).toBe('fadeOut');
    run(p, 3);
    p.press(['cancel']);
    expect(p.confirmOpen).toBe(true);
  });

  it('暫停 (失焦) 時時間軸不動', () => {
    const p = player({ autoAdvance: true }, mini);
    run(p, 0.5);
    p.pause();
    run(p, 30);
    expect(p.current).toMatchObject({ shot: 0, phase: 'transition' });
    expect(p.advance()).toBe(false);
    p.resume();
    run(p, 0.6);
    expect(p.view().phase).toBe('fadeIn');
  });
});

describe('時間軸：自動播放', () => {
  it('每段停留 T 秒後自動前進；總長 = 計畫秒數', () => {
    const pl = plan(mini);
    const p = new CutscenePlayer(pl, { autoAdvance: true, skipConfirm: true, replay: false, seen: false });
    run(p, pl.totalSec - 0.05);
    expect(p.done).toBe(false);
    run(p, 0.1);
    expect(p.done).toBe(true);
    expect(ends(p.drain())).toEqual([{ type: 'end', skipped: false }]);
  });

  it('段落時間 = readingSeconds：第 1 段 T 秒後正好換第 2 段', () => {
    const pl = plan(mini);
    const p = new CutscenePlayer(pl, { autoAdvance: true, skipConfirm: true, replay: false, seen: false });
    run(p, 1); // 切到鏡 2 前：鏡 1 = 淡入 1.0 + T
    run(p, pl.shots[0].segments[0].sec + 0.02);
    expect(p.current).toMatchObject({ shot: 1, segment: 0, phase: 'fadeIn' });
    run(p, pl.shots[1].segments[0].sec - 0.04);
    expect(p.current.segment).toBe(0);
    run(p, 0.06);
    expect(p.current.segment).toBe(1);
  });

  it('自動播放時推進可提前 (minDwell 後)', () => {
    const p = player({ autoAdvance: true }, mini);
    run(p, 1 + TEXT_FADE_IN_SEC + MIN_DWELL_SEC + 0.02);
    expect(p.advance()).toBe(true);
  });

  it('視覺最短秒：標題卡 (一段約 3.2 秒、視覺 4 秒) 自動播放時停滿 4 秒', () => {
    const pl = plan();
    const last = pl.shots[11];
    expect(last.segments[0].sec).toBeCloseTo(3.23, 2);
    expect([last.minVisualSec, last.sec]).toEqual([4, 5]);
  });

  it('大步長 (分頁切回) 也照時間軸走，不跳過整段', () => {
    const pl = plan(mini);
    const p = new CutscenePlayer(pl, { autoAdvance: true, skipConfirm: true, replay: false, seen: false });
    p.tick(pl.shots[0].sec + 0.01);
    expect(p.current.shot).toBe(1);
  });
});

describe('時間軸：跳過', () => {
  it('需確認 (預設)：開確認窗 = 暫停；Enter 在 300 ms 內忽略，之後確認 → 結束 (skipped)', () => {
    const p = player({}, mini);
    run(p, 2);
    expect(p.requestSkip()).toBe('confirm');
    const before = p.current;
    run(p, 5);
    expect(p.current).toEqual(before);
    p.press(['confirm']); // 開窗已 5 秒 (> 300 ms)
    expect([p.confirmOpen, p.done, p.skipped]).toEqual([false, true, true]);
  });

  it('300 ms 保護：開窗後立即 Enter 無效；Esc 取消後繼續播放', () => {
    const p = player({}, mini);
    run(p, 2);
    p.press(['cancel']);
    expect(p.confirmOpen).toBe(true);
    p.press(['confirm']);
    expect(p.confirmOpen).toBe(true);
    run(p, (CONFIRM_GUARD_MS - 20) / 1000);
    p.press(['confirm']);
    expect(p.confirmOpen).toBe(true);
    p.press(['cancel']);
    expect(p.confirmOpen).toBe(false);
    expect(p.done).toBe(false);
    run(p, (CONFIRM_GUARD_MS + 50) / 1000);
    p.press(['cancel']);
    run(p, (CONFIRM_GUARD_MS + 10) / 1000);
    p.press(['confirm']);
    expect(p.done).toBe(true);
    expect(p.skipped).toBe(true);
    expect(ends(p.drain())).toEqual([{ type: 'end', skipped: true }]);
  });

  it('確認窗按鈕：取消 → 繼續；確認 → 結束', () => {
    const p = player({}, mini);
    p.requestSkip();
    p.cancelSkip();
    expect([p.confirmOpen, p.done]).toEqual([false, false]);
    p.requestSkip();
    p.confirmSkip();
    expect([p.done, p.skipped]).toEqual([true, true]);
  });

  it('skipConfirm 關閉或重看：直接跳過，不需確認', () => {
    const a = player({ skipConfirm: false }, mini);
    expect(a.requestSkip()).toBe('skipped');
    expect(a.skipped).toBe(true);
    const b = player({ replay: true }, mini);
    expect(b.needsConfirm).toBe(false);
    expect(b.requestSkip()).toBe('skipped');
  });

  it('長按 1 秒 = 要求跳過 (需確認)；短按放開 = 推進；中途放開不算', () => {
    const p = player({}, mini);
    run(p, 3);
    p.pointerDown();
    run(p, 0.2);
    expect(p.view().holdProgress).toBeCloseTo(0.2 / HOLD_SKIP_SEC, 1);
    p.pointerUp();
    expect(p.view().phase).toBe('fadeOut'); // 短按 = 推進
    run(p, 3);
    p.pointerDown();
    run(p, 0.7);
    p.pointerUp();
    expect([p.view().phase, p.confirmOpen]).toEqual(['hold', false]);
    p.pointerDown();
    run(p, HOLD_SKIP_SEC + DT);
    expect(p.confirmOpen).toBe(true);
    const q = player({ replay: true }, mini);
    q.pointerDown();
    run(q, HOLD_SKIP_SEC + DT);
    expect([q.done, q.skipped]).toEqual([true, true]);
  });

  it('結束後輸入一律忽略', () => {
    const p = player({ skipConfirm: false }, mini);
    p.requestSkip();
    p.drain();
    expect(p.requestSkip()).toBe('ignored');
    expect(p.advance()).toBe(false);
    run(p, 5);
    expect(p.drain()).toEqual([]);
  });
});
