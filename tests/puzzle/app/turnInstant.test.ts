// 直接轉 (settings.turnMode 'instant'，預設)：純函式 reduceTurnInstant / deriveTurnMode style / turnModeFrame via，
// 與 LevelSession 的連續輸入規則 (快速連按、轉場中輸入、被擋、墨不足、回退、舊設定相容、第一章不受影響)
import { describe, it, expect } from 'vitest';
import { activateDial, captureState, dialTurn, newChapterState, openChapter, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from '../../../src/puzzle/content/cubes/test-dial';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { defaultSettings, loadSettings, sanitizeSettings, SETTINGS_KEY } from '../../../src/puzzle/meta/settings';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { deriveTurnMode, reduceTurnInstant, reduceTurnMode, turnModeFrame, type TurnModeModel, type TurnStyle } from '../../../src/puzzle/app/cubeMapModel';
import { tipText } from '../../../src/puzzle/app/helpModel';
import { LevelSession, type SessionContext } from '../../../src/puzzle/app/levelSession';
import { DEFAULT_BINDINGS } from '../../../src/puzzle/input/bindings';
import type { InputFrame } from '../../../src/puzzle/input/types';
import type { Fx, Transition } from '../../../src/puzzle/render/transitions';
import type { PuzzleHud } from '../../../src/puzzle/ui/hud';
import { resolveTheme } from '../../../src/puzzle/render/themes';
import { place, run } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const SPEC: ChapterSpec = { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, doors: chapterDoors(PROTO_DIAL_ROOMS) };
const open = (): ChapterSession => {
  const cs = activateDial(openChapter(SPEC, newChapterState(SPEC, 'protoA', null), OPTS));
  place(cs.world, -2, 0, 1.5, '2d');
  run(cs.world, {}, 0.05);
  return cs;
};
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const frame = (f: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveZ: 0, jump: false, pressed: [], anyKey: false, ...f });
const step = (axis: 'h' | 'v', d: 1 | -1, via?: 'axis') => ({ t: 'step' as const, axis, d, ...(via ? { via } : {}) });

describe('deriveTurnMode style instant：說明列、鍵位、起始焦點', () => {
  it('instant：說明列 / 鍵位換成直接轉；home = 你所在的那一排 (上列，往右)；預設參數 = confirm (舊模型形狀不變)', () => {
    const m = deriveTurnMode(open(), TEXT, null, 'instant');
    expect([m.caption, m.text.keys, m.instant, m.home]).toEqual(['點箭頭就會轉；滑鼠停在箭頭上，可以先看轉後的樣子。', 'W S 換一排　方向鍵 直接轉　Z 回退　Esc 離開', true, { group: 'row0', dir: 1 }]);
    const c = deriveTurnMode(open(), TEXT, null);
    expect(['instant' in c, 'home' in c, c.caption]).toEqual([false, false, '點一排的箭頭看預覽，按「確認」才會轉。']);
  });
});

describe('reduceTurnInstant：方向鍵直接轉、WASD 換焦點', () => {
  const m = deriveTurnMode(open(), TEXT, { group: 'row0', dir: 1 }, 'instant');
  const r0 = { group: 'row0', dir: 1 as const };

  it('沿著焦點那一排的方向鍵 = 恰好一個 turn 指令 (← = 往左、→ = 往右)；焦點跟著方向', () => {
    expect(reduceTurnInstant(r0, step('h', 1), m)).toEqual({ sel: r0, command: { t: 'turn', turn: { group: 'row0', dir: 1 } }, exit: false });
    expect(reduceTurnInstant(r0, step('h', -1), m)).toEqual({ sel: { group: 'row0', dir: -1 }, command: { t: 'turn', turn: { group: 'row0', dir: -1 } }, exit: false });
  });

  it('另一個方向 (列上按 ↑↓) = 換到相鄰的列、不轉；WASD (via axis) = 依控制盤順序換組、不轉', () => {
    expect(reduceTurnInstant(r0, step('v', 1), m)).toEqual({ sel: { group: 'row1', dir: 1 }, command: null, exit: false });
    expect(reduceTurnInstant(r0, step('v', -1), m).sel).toEqual({ group: 'row1', dir: 1 });
    expect(reduceTurnInstant(r0, step('h', 1, 'axis'), m)).toEqual({ sel: { group: 'row1', dir: 1 }, command: null, exit: false });
    expect(reduceTurnInstant(r0, step('v', -1, 'axis'), m).sel).toEqual({ group: 'col2', dir: 1 });
  });

  it('行 (兩列 = 上下對調) 的 ↑ / ↓ 都轉它；←→ = 相鄰的行', () => {
    const c1 = { group: 'col1', dir: 1 as const };
    expect(reduceTurnInstant(c1, step('v', -1), m).command).toEqual({ t: 'turn', turn: { group: 'col1', dir: 1 } });
    expect(reduceTurnInstant(c1, step('v', 1), m).command).toEqual({ t: 'turn', turn: { group: 'col1', dir: 1 } });
    expect(reduceTurnInstant(c1, step('h', 1), m)).toEqual({ sel: { group: 'col2', dir: 1 }, command: null, exit: false });
  });

  it('點標頭 = 直接轉 (鎖著的也送出：外殼先查 dialBlocked 才排)；不存在的標頭不理會', () => {
    expect(reduceTurnInstant(null, { t: 'pick', group: 'row0', dir: -1 }, m).command).toEqual({ t: 'turn', turn: { group: 'row0', dir: -1 } });
    expect(reduceTurnInstant(null, { t: 'pick', group: 'row1', dir: 1 }, m).command).toEqual({ t: 'turn', turn: { group: 'row1', dir: 1 } });
    expect(reduceTurnInstant(r0, { t: 'pick', group: 'col9', dir: 1 }, m)).toEqual({ sel: r0, command: null, exit: false });
  });

  it('沒有焦點：第一個鍵只把焦點放到 home、不轉；Enter / 確認 = 不做事 (舊習慣「方向鍵 + Enter」不會多轉一次)；回退 / 離開同舊行為', () => {
    expect(reduceTurnInstant(null, step('h', 1), m)).toEqual({ sel: { group: 'row0', dir: 1 }, command: null, exit: false });
    expect(reduceTurnInstant(r0, { t: 'confirm' }, m)).toEqual({ sel: r0, command: null, exit: false });
    expect(reduceTurnInstant(r0, { t: 'undo' }, m).command).toBeNull();
    const turned = ok(dialTurn(open(), r0));
    expect(reduceTurnInstant(r0, { t: 'undo' }, deriveTurnMode(turned, TEXT, r0, 'instant')).command).toEqual({ t: 'undo' });
    expect(reduceTurnInstant(r0, { t: 'exit' }, m)).toEqual({ sel: null, command: null, exit: true });
  });

  it('confirm 模式的 reduceTurnMode 不變：方向鍵只選取、Enter 才轉', () => {
    const cm = deriveTurnMode(open(), TEXT, r0);
    expect(reduceTurnMode(r0, step('h', -1), cm)).toEqual({ sel: { group: 'row0', dir: -1 }, command: null, exit: false });
    expect(reduceTurnMode(r0, { t: 'confirm' }, cm).command).toEqual({ t: 'turn', turn: r0 });
  });

  it('turnModeFrame instant：方向鍵的一步不帶 via；只有移動軸 (WASD) 的一步帶 via axis；confirm 模式不帶', () => {
    expect(turnModeFrame(frame({ pressed: ['navRight'], moveX: 1 }), { x: 0, z: 0 }, 'instant').inputs).toEqual([{ t: 'step', axis: 'h', d: 1 }]);
    expect(turnModeFrame(frame({ moveZ: 1 }), { x: 0, z: 0 }, 'instant').inputs).toEqual([{ t: 'step', axis: 'v', d: 1, via: 'axis' }]);
    expect(turnModeFrame(frame({ moveZ: 1 }), { x: 0, z: 0 }).inputs).toEqual([{ t: 'step', axis: 'v', d: 1 }]);
  });
});

describe('reduceTurnInstant 滑動 (第三章)', () => {
  const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
  const S3: ChapterSpec = { chapter: 3, cube: CH3.cube, rooms: CH3.rooms, doors: chapterDoors(CH3.rooms) };
  const open3 = (): ChapterSession => {
    const cs = activateDial(openChapter(S3, chapterStart(defaultSave(), S3, CH3.start), { ...OPTS, abilities: ['nib' as const] }));
    cs.world.ext = { ...cs.world.ext, labels: { 'scale:root': ['card.xiao'] } };
    place(cs.world, 0, 0, 1.5, '2d');
    run(cs.world, {}, 0.05);
    return cs;
  };
  it('↑：兩間房能往上滑 → 先選第一間並說明 (不滑)；焦點在其中一間時再按 ↑ = 滑它；點只有一種滑法的房 = 直接滑', () => {
    const m = deriveTurnMode(open3(), TEXT, null, 'instant');
    expect([m.home, m.text.keys]).toEqual([null, '方向鍵 往那邊滑　WASD 只選不滑　Z 回退　Esc 離開']);
    const a = reduceTurnInstant(null, step('v', -1), m);
    expect(a).toEqual({ sel: { group: 'c3', dir: 'N' }, command: null, exit: false, note: { key: 'msg.dial.slidePick' } });
    expect(reduceTurnInstant(a.sel, step('v', -1), m).command).toEqual({ t: 'turn', turn: { group: 'c3', dir: 'N' } });
    expect(reduceTurnInstant(a.sel, step('v', -1, 'axis'), m)).toEqual({ sel: { group: 'c4', dir: 'N' }, command: null, exit: false });
    expect(reduceTurnInstant(null, { t: 'cell', x: 1, y: 1 }, m).command).toEqual({ t: 'turn', turn: { group: 'c4', dir: 'N' } });
    expect(reduceTurnInstant(null, step('h', 1), m).note).toEqual({ key: 'msg.dial.noDir' });
  });
});

// ── LevelSession：連續輸入 ──

/** node 沒有 canvas：場景的程序化紋理畫在吞掉所有呼叫的假 2D context 上 (同 render/coplanar.test) */
const sink: unknown = new Proxy(function () { /* noop */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink), apply: () => sink, set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => sink }) };

/** 假的轉場：sec 秒後結束 (中點換畫面) */
const fakeFx = (sec: number): Fx => {
  let t = 0;
  return { duration: sec, tick: dt => { const was = t; t += dt; return { done: t >= sec, swapNow: was < sec / 2 && t >= sec / 2 }; }, cancel: () => { t = sec; } };
};
const NO_TRANSITION: Transition = { duration: 0, start: () => {}, tick: () => ({ done: true, swapNow: false }), cancel: () => {} };
const session = (style: TurnStyle | undefined, fxSec = 1): LevelSession => {
  const state = captureState(activateDial(openChapter(SPEC, newChapterState(SPEC, 'protoA', null), OPTS)));
  const ctx: SessionContext = {
    renderer: {} as SessionContext['renderer'], text: TEXT, hud: { reset: () => {} } as unknown as PuzzleHud, bindings: DEFAULT_BINDINGS,
    transition: NO_TRANSITION, theme: resolveTheme(undefined), fx: () => fakeFx(fxSec), ...(style ? { turnStyle: () => style } : {})
  };
  const s = new LevelSession(ctx, SPEC, state, { abilities: [], onCleared: () => {} });
  place(s.world, -2, 0, 1.5, '2d');
  for (let i = 0; i < 6; i++) s.update(1 / 60, frame());
  s.toggleTurnMode();
  return s;
};
const ink = (s: LevelSession) => s.chapter.state.turns?.left ?? 6;
const tick = (s: LevelSession, f: Partial<InputFrame> = {}) => s.update(1 / 60, frame(f));
const settle = (s: LevelSession) => { for (let i = 0; i < 120 && s.busy; i++) tick(s); tick(s); };

describe('LevelSession 直接轉：連續快速輸入', () => {
  it('沒給設定 = instant；進轉動模式焦點 = 上列；→ 一下 = 轉一次、扣 1 滴、播轉場', () => {
    const s = session(undefined);
    expect([s.turnStyle, s.turnSelection]).toEqual(['instant', { group: 'row0', dir: 1 }]);
    tick(s, { pressed: ['navRight'], moveX: 1 });
    expect(s.pendingChapter).toBe(0);
    expect([ink(s), s.busy, s.chapter.state.cube!.pos.protoA]).toEqual([5, true, [1, 0, 0]]);
  });

  it('同一幀 ← + →、轉場中連按 → 都忽略 (不排隊、不重複扣墨)；轉場結束後再按才再轉一次；轉場中按住、之後仍按著的鍵不算一步', () => {
    const s = session('instant');
    tick(s, { pressed: ['navRight'], moveX: 1 });
    for (let i = 0; i < 20; i++) tick(s, { pressed: ['navRight', 'navLeft'], moveX: 1 });
    expect([ink(s), s.pendingChapter]).toEqual([5, 0]);
    s.turnInput({ t: 'pick', group: 'row0', dir: 1 });
    s.turnInput({ t: 'undo' });
    expect(s.pendingChapter).toBe(0);
    // → 按住穿過整段轉場：結束後仍按著 = 不是「剛按下」，不轉、焦點不變
    for (let i = 0; i < 120 && s.busy; i++) tick(s, { moveX: 1 });
    tick(s, { moveX: 1 });
    expect([ink(s), s.busy, s.turnSelection]).toEqual([5, false, { group: 'row0', dir: 1 }]);
    tick(s, { pressed: ['navRight'], moveX: 1 });
    expect(ink(s)).toBe(4);
  });

  it('同一個固定步之前連點兩下：只排第一個 (第二個忽略)', () => {
    const s = session('instant');
    s.turnInput({ t: 'pick', group: 'row0', dir: 1 });
    s.turnInput({ t: 'pick', group: 'row0', dir: 1 });
    expect(s.pendingChapter).toBe(1);
    tick(s);
    settle(s);
    expect(ink(s)).toBe(5);
  });

  it('被擋 (鎖著)：當場說「這一排鎖著。」、不排指令、不扣墨；墨乾：說「墨乾了。」、不扣墨', () => {
    const s = session('instant');
    s.turnInput({ t: 'pick', group: 'row1', dir: 1 });
    expect([s.world.msg, s.pendingChapter, ink(s)]).toEqual(['這一排鎖著。', 0, 6]);
    for (let i = 0; i < 6; i++) { s.turnInput({ t: 'pick', group: 'row0', dir: 1 }); tick(s); settle(s); }
    expect(ink(s)).toBe(0);
    s.turnInput({ t: 'pick', group: 'row0', dir: 1 });
    expect([s.world.msg, s.pendingChapter, ink(s)]).toEqual(['墨乾了。', 0, 0]);
  });

  it('回退 (Z)：退回一步、墨回來一滴；沒有可退的一步 → 說明', () => {
    const s = session('instant');
    s.turnInput({ t: 'undo' });
    expect(s.world.msg).toBe('沒有可以退回的一步。');
    tick(s, { pressed: ['navLeft'], moveX: -1 });
    settle(s);
    expect(ink(s)).toBe(5);
    tick(s, { pressed: ['undo'] });
    settle(s);
    expect([ink(s), s.chapter.state.cube!.pos.protoA]).toEqual([6, [0, 0, 0]]);
  });

  it('懸停 = 預覽 (不改焦點、不轉)；Enter 不轉', () => {
    const s = session('instant');
    s.turnInput({ t: 'hover', group: 'row0', dir: -1 });
    tick(s, { pressed: ['confirm'] });
    expect([s.turnSelection, ink(s), s.pendingChapter]).toEqual([{ group: 'row0', dir: 1 }, 6, 0]);
  });

  it('confirm 模式維持舊行為：方向鍵只選取、Enter 才轉', () => {
    const s = session('confirm');
    expect(s.turnSelection).toBeNull();
    tick(s, { pressed: ['navRight'], moveX: 1 });
    expect([s.turnSelection, ink(s)]).toEqual([{ group: 'row0', dir: 1 }, 6]);
    tick(s, { pressed: ['confirm'] });
    tick(s);
    expect(ink(s)).toBe(5);
  });
});

describe('設定 turnMode 與第一章', () => {
  it('預設 instant；舊設定缺欄 = instant；不認得的值回 instant；confirm 保留', () => {
    expect(defaultSettings().turnMode).toBe('instant');
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ hints: 'always' }) })).turnMode).toBe('instant');
    expect(sanitizeSettings({ turnMode: 'auto' }).turnMode).toBe('instant');
    expect(sanitizeSettings({ turnMode: 'confirm' }).turnMode).toBe('confirm');
  });

  it('一次性小提示：instant = 直接轉的鍵位 (≤ 28 字)；confirm = 舊字', () => {
    const t = tipText('turn', TEXT, DEFAULT_BINDINGS, 'instant');
    expect(t).toBe('WS 換一排　方向鍵直接轉　Z 回退　Tab 離開');
    expect(t.length).toBeLessThanOrEqual(28);
    expect(tipText('turn', TEXT, DEFAULT_BINDINGS, 'confirm')).toBe('方向鍵選一排　Enter 確認　Z 回退　Tab 離開');
  });

  it('第一章 (拉桿章節) 不受影響：沒有轉動模式，toggleTurnMode / turnInput 不做事', () => {
    const CH1 = CUBE_CHAPTERS.find(c => c.chapter === 1)!;
    const spec: ChapterSpec = { chapter: 1, cube: CH1.cube, rooms: CH1.rooms, doors: chapterDoors(CH1.rooms) };
    const ctx: SessionContext = { renderer: {} as SessionContext['renderer'], text: TEXT, hud: { reset: () => {} } as unknown as PuzzleHud, bindings: DEFAULT_BINDINGS, transition: NO_TRANSITION, theme: resolveTheme(undefined), turnStyle: () => 'instant' };
    const s = new LevelSession(ctx, spec, chapterStart(defaultSave(), spec, CH1.start), { abilities: [], onCleared: () => {} });
    const before = JSON.stringify(captureState(s.chapter));
    s.toggleTurnMode();
    s.turnInput({ t: 'pick', group: 'row0', dir: 1 });
    tick(s, { pressed: ['navRight', 'turnMode'] });
    expect([s.isTurnMode, s.pendingChapter, JSON.stringify(captureState(s.chapter))]).toEqual([false, 0, before]);
  });
});

// 型別檢查用：TurnModeModel 有 instant / home 欄位
export type _T = Pick<TurnModeModel, 'instant' | 'home'>;
