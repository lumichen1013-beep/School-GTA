import { describe, it, expect } from 'vitest';
import { charCount, checkLines, CPS, displayWidth, layoutLines, pauseSeconds, readingSeconds, shotSeconds } from '../../../src/puzzle/text/readingTime';

const T = (s: string, nameLen?: number, cps: number = CPS.normal) => Math.round(readingSeconds(s, { cps, nameLen }) * 10) / 10;

describe('閱讀時間公式 T = max(3, 1.5 + n/cps + 停頓) (cutscenes-v0.1 2.2)', () => {
  it('計字：中文 1、半形英數 0.5、標點不計；{name} 驗證時以 nameLen 計', () => {
    expect(charCount('暑假最後一週，你決定回去住。')).toBe(12);
    expect(charCount('ABC12')).toBe(2.5);
    expect(charCount('「」，。！？……——')).toBe(0);
    expect(charCount('「{name}。」', { nameLen: 12 })).toBe(12);
    expect(charCount('小桐')).toBe(2); // 執行時 {name} 已插值成實際暱稱
  });

  it('標點停頓：，、；： 0.2；。！？ 0.4；一串 …… 0.6', () => {
    expect(pauseSeconds('一，二、三；四：五')).toBeCloseTo(0.8);
    expect(pauseSeconds('好。真的！嗎？')).toBeCloseTo(1.2);
    expect(pauseSeconds('嗯……')).toBeCloseTo(0.6);
    expect(pauseSeconds('嗯……那……')).toBeCloseTo(1.2);
    expect(pauseSeconds('——爸')).toBe(0);
  });

  it('與分鏡表的各段秒數一致 (序章抽樣)', () => {
    expect(T('暑假最後一週，你決定回去住。')).toBe(4.1);
    expect(T('「如果你讀到這張紙，代表它認得你了。」')).toBe(4.6);
    expect(T('「{name}。」', 12)).toBe(3.9);
    expect(T('你當成玩笑。他卻沒笑，默默收起了筆記。')).toBe(5.2);
    expect(T('手機的訊號，一格一格消失。')).toBe(3.9);
    expect(T('小時候，爸爸說：「我們的祖先，是魔法師。」')).toBe(5.0);
    expect(T('「我試了一輩子，從沒成功。」')).toBe(3.8);
  });

  it('最短 3 秒', () => {
    expect(readingSeconds('老宅在山上。', { cps: 6 })).toBe(3);
    expect(readingSeconds('', { cps: 6 })).toBe(3);
    expect(readingSeconds('你按了一下。', { cps: 6 })).toBe(3);
  });

  it('慢速 4.5 字 / 秒：同一段比一般慢；字數越多差越大', () => {
    const s = '「如果你讀到這張紙，代表它認得你了。」';
    expect(readingSeconds(s, { cps: CPS.slow })).toBeCloseTo(1.5 + 15 / 4.5 + 0.6);
    expect(readingSeconds(s, { cps: CPS.slow })).toBeGreaterThan(readingSeconds(s, { cps: CPS.normal }));
  });

  it('鏡頭秒數 = max(各段和, 視覺最短秒) + 轉場', () => {
    expect(shotSeconds([4.4], 0, 1)).toBeCloseTo(5.4);
    expect(shotSeconds([3], 4, 1)).toBeCloseTo(5);
    expect(shotSeconds([], 2, 0)).toBe(2);
  });
});

describe('字幕斷行：每行 ≤ 16 字、≤ 2 行', () => {
  it('放得下就一行；超過時在標點後斷，閉括號 / 句讀不落行首、不拆破折號', () => {
    expect(layoutLines('你走進門廊。')).toEqual(['你走進門廊。']);
    expect(layoutLines('小時候，爸爸說：「我們的祖先，是魔法師。」')).toEqual(['小時候，爸爸說：', '「我們的祖先，是魔法師。」']);
    const lines = layoutLines('「慢慢來。先看清楚，再動手吧。——爸」');
    expect(lines.length).toBe(2);
    expect(lines.every(l => displayWidth(l) <= 16)).toBe(true);
    expect(lines.join('')).toBe('「慢慢來。先看清楚，再動手吧。——爸」');
    for (const l of lines.slice(1)) expect(/^[」，。！？、—]/.test(l)).toBe(false);
    expect(lines.some(l => l.endsWith('—'))).toBe(false);
  });

  it('明確的 \\n = 作者指定的行 (不再自動斷)；沒有可斷點時硬斷在上限並標記 hardBreak', () => {
    expect(layoutLines('第一行\n第二行')).toEqual(['第一行', '第二行']);
    expect(layoutLines('一二三四五六七八九十一二三四五六七八')).toEqual(['一二三四五六七八九十一二三四五六', '七八']);
    expect(checkLines('一二三四五六七八九十一二三四五六七八').hardBreak).toBe(true);
    expect(checkLines('小時候，爸爸說：「我們的祖先，是魔法師。」').hardBreak).toBe(false);
  });

  it('{name} 以 12 字計：「{name}。」一行 15 寬', () => {
    const c = checkLines('「{name}。」', { nameLen: 12 });
    expect(c.lines).toEqual(['「{name}。」']);
    expect(c.widths).toEqual([15]);
    expect([c.tooManyLines, c.longLines, c.hardBreak]).toEqual([false, [], false]);
  });

  it('超長一行 / 超過兩行都被檢查出來', () => {
    const explicit = checkLines('短的一行\n一二三四五六七八九十一二三四五六七');
    expect(explicit.longLines).toEqual([1]);
    const over = checkLines('一二三四五六七，八九十一二三四五六七八九，十一二三四五六七八九十一二三，四五');
    expect(over.lines.length).toBeGreaterThan(2);
    expect(over.tooManyLines).toBe(true);
    expect(checkLines('一二三，四五六', { max: 4, maxLines: 1 }).tooManyLines).toBe(true);
    // 姓名 12 字讓一行超過 16 寬 → 必須斷成兩行
    expect(checkLines('你好，{name}，好久不見。', { nameLen: 12 }).lines.length).toBe(2);
  });

  it('半形字寬 0.5', () => {
    expect(displayWidth('ABCD')).toBe(2);
    expect(displayWidth('A，')).toBe(1.5);
  });
});
