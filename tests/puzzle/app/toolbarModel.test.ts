// 畫面上方的工具列 (app/toolbarModel)：重置 / 魔方 / 2D / 3D 的顯示、高亮、停用與點擊的意圖；LevelSession.requestMode
import { describe, it, expect } from 'vitest';
import { activeMode, deriveToolbar, modeIntent, type ToolbarContext } from '../../../src/puzzle/app/toolbarModel';
import { TEXT } from '../msgs';
import { activateDial, captureState, newChapterState, openChapter, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from '../../../src/puzzle/content/cubes/test-dial';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { LevelSession, type SessionContext } from '../../../src/puzzle/app/levelSession';
import { DEFAULT_BINDINGS } from '../../../src/puzzle/input/bindings';
import type { Transition } from '../../../src/puzzle/render/transitions';
import type { PuzzleHud } from '../../../src/puzzle/ui/hud';
import { resolveTheme } from '../../../src/puzzle/render/themes';
import { place } from '../helpers';

const ctx = (o: Partial<ToolbarContext> = {}): ToolbarContext => ({ inLevel: true, renderMode: '3d', onCube: true, dialChapter: true, dialActive: true, mapOpen: false, itemCount: 0, itemsOpen: false, settingsOpen: false, ...o });
const ids = (c: ToolbarContext) => deriveToolbar(c, TEXT).buttons.map(b => [b.id, b.label, b.active, b.enabled]);

describe('deriveToolbar', () => {
  it('控制盤章節、已啟動：重置 + 魔方 / 2D / 3D，目前模式高亮 (實景 = 3D)', () => {
    expect(ids(ctx())).toEqual([['reset', '重置', false, true], ['cube', '魔方', false, true], ['2d', '2D', false, true], ['3d', '3D', true, true], ['items', '道具', false, true], ['settings', '設定', false, true]]);
    expect(deriveToolbar(ctx(), TEXT).show).toBe(true);
  });

  it('藏寶圖 = 2D 高亮；展開圖 / 轉動模式開著 = 魔方高亮', () => {
    expect(activeMode(ctx({ renderMode: '2d' }))).toBe('2d');
    expect(activeMode(ctx({ renderMode: '2d', mapOpen: true }))).toBe('cube');
    expect(ids(ctx({ renderMode: '2d', mapOpen: true })).map(b => b[2])).toEqual([false, true, false, false, false, false]);
  });

  it('魔方儀未啟動 / 第一章 (拉桿) = 魔方鈕停用；第一章開著展開圖 = 2D 高亮；單房關卡沒有魔方鈕；不在關卡 = 不顯示', () => {
    expect(ids(ctx({ dialActive: false }))[1]).toEqual(['cube', '魔方', false, false]);
    expect(ids(ctx({ dialChapter: false, dialActive: false, renderMode: '2d', mapOpen: true }))[1]).toEqual(['cube', '魔方', false, false]);
    expect(activeMode(ctx({ dialChapter: false, renderMode: '2d', mapOpen: true }))).toBe('2d');
    expect(ids(ctx({ onCube: false, dialChapter: false })).map(b => b[0])).toEqual(['reset', '2d', '3d', 'items', 'settings']);
    expect(deriveToolbar(ctx({ inLevel: false }), TEXT).show).toBe(false);
  });

  it('觸控 / 輔助技術：每顆都有說明 (aria)', () => {
    expect(deriveToolbar(ctx(), TEXT).buttons.map(b => b.aria)).toEqual(['重新進房（需確認）', '展開圖與轉動模式', '切到藏寶圖（2D）', '切到實景（3D）', '道具欄（0 件）', '設定（Esc）']);
    expect(deriveToolbar(ctx({ settingsOpen: true }), TEXT).buttons.at(-1)!.active).toBe(true);
  });

  it('道具鈕：角標 = 持有總數 (0 = 不畫)；道具欄開著 = 高亮', () => {
    const items = (c: ToolbarContext) => deriveToolbar(c, TEXT).buttons.find(b => b.id === 'items')!;
    expect(['badge' in items(ctx()), items(ctx({ itemCount: 5, itemsOpen: true }))]).toEqual([false, { id: 'items', label: '道具', aria: '道具欄（5 件）', active: true, enabled: true, badge: 5 }]);
  });
});

describe('modeIntent', () => {
  it('魔方：控制盤章節 = 進轉動模式 (條件由 toggleTurnMode 判斷)；開著 = 收起；第一章 = 說明；單房 = 不做事', () => {
    expect(modeIntent('cube', ctx({ renderMode: '2d' }))).toEqual({ turnMode: true });
    expect(modeIntent('cube', ctx())).toEqual({ turnMode: true });
    expect(modeIntent('cube', ctx({ renderMode: '2d', mapOpen: true }))).toEqual({ closeMap: true });
    expect(modeIntent('cube', ctx({ dialChapter: false }))).toEqual({ say: 'msg.bar.leverCube' });
    expect(TEXT('msg.bar.leverCube')).toBe('這裡的魔方靠房間裡的拉桿轉。展開圖可以點「圖」打開。');
    expect(modeIntent('cube', ctx({ onCube: false }))).toEqual({});
  });

  it('2D：實景 → 切換；魔方中 → 收起展開圖 (留在藏寶圖)；已在 2D = 不做事。3D：藏寶圖 → (收起展開圖並) 切換；已在 3D = 不做事', () => {
    expect(modeIntent('2d', ctx())).toEqual({ flip: true });
    expect(modeIntent('2d', ctx({ renderMode: '2d', mapOpen: true }))).toEqual({ closeMap: true });
    expect(modeIntent('2d', ctx({ renderMode: '2d' }))).toEqual({});
    expect(modeIntent('3d', ctx({ renderMode: '2d' }))).toEqual({ flip: true });
    expect(modeIntent('3d', ctx({ renderMode: '2d', mapOpen: true }))).toEqual({ closeMap: true, flip: true });
    expect(modeIntent('3d', ctx())).toEqual({});
  });
});

// ── LevelSession.requestMode (工具列的模式鈕) ──

const sink: unknown = new Proxy(function () { /* noop */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink), apply: () => sink, set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => sink }) };

describe('LevelSession.requestMode', () => {
  const SPEC: ChapterSpec = { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, doors: chapterDoors(PROTO_DIAL_ROOMS) };
  /** 切換過場：一步就換畫面並結束 */
  const SNAP: Transition = { duration: 0, start: () => {}, tick: () => ({ done: true, swapNow: true }), cancel: () => {} };
  const frame = { moveX: 0, moveZ: 0, jump: false, pressed: [], anyKey: false };
  const make = (dial: boolean) => {
    const cs = openChapter(SPEC, newChapterState(SPEC, 'protoA', null), { mechanics: DEFAULT_MECHANICS, text: TEXT });
    const ctx: SessionContext = { renderer: {} as SessionContext['renderer'], text: TEXT, hud: { reset: () => {} } as unknown as PuzzleHud, bindings: DEFAULT_BINDINGS, transition: SNAP, theme: resolveTheme(undefined) };
    const s = new LevelSession(ctx, SPEC, captureState(dial ? activateDial(cs) : cs), { abilities: ['nib'], onCleared: () => {} });
    place(s.world, -2, 0, 1.5, '3d');
    return s;
  };
  const ticks = (s: LevelSession, n = 10) => { for (let i = 0; i < n; i++) s.update(1 / 60, frame); };

  it('3D → 點 2D = 切到藏寶圖；點魔方 = 進轉動模式 (魔方高亮)；再點魔方 = 收起；點 3D = 收起並切回實景', () => {
    const s = make(true);
    ticks(s, 3);
    s.requestMode('2d');
    ticks(s);
    expect([s.world.player.mode, s.toolbarContext.renderMode]).toEqual(['2d', '2d']);
    s.requestMode('cube');
    expect([s.isTurnMode, activeMode({ inLevel: true, ...s.toolbarContext })]).toEqual([true, 'cube']);
    s.requestMode('cube');
    expect([s.isTurnMode, s.isMapOpen]).toEqual([false, false]);
    s.requestMode('cube');
    s.requestMode('3d');
    expect(s.isTurnMode).toBe(false);
    ticks(s);
    expect([s.world.player.mode, s.toolbarContext.renderMode]).toEqual(['3d', '3d']);
  });

  it('魔方儀未啟動：點魔方 = 說明「控制盤還沒啟動。」、不進轉動模式；實景點魔方 = 說明只在藏寶圖', () => {
    const s = make(false);
    s.requestMode('2d');
    ticks(s);
    s.requestMode('cube');
    expect([s.isTurnMode, s.world.msg]).toEqual([false, '控制盤還沒啟動。']);
    const t = make(true);
    ticks(t, 3);
    t.requestMode('cube');
    expect([t.isTurnMode, t.world.msg]).toEqual([false, '控制盤畫在藏寶圖上。']);
  });
});
