// 關卡中的「設定」popup：Esc 的優先順序 (app/settingsModel escapeAction 與 LevelSession)、重置記錄 (meta/reset：只清 puzzle: 鍵、設定預設保留、失敗與記憶體版) 與兩段式確認
import { describe, it, expect } from 'vitest';
import { canConfirmReset, escapeAction, initialResetDialog } from '../../../src/puzzle/app/settingsModel';
import { resetRecords } from '../../../src/puzzle/meta/reset';
import { memoryStorage, type KeyValueStorage } from '../../../src/puzzle/meta/storage';
import { defaultSave, loadSave, SAVE_KEY } from '../../../src/puzzle/meta/save';
import { defaultSettings, loadSettings, SETTINGS_KEY } from '../../../src/puzzle/meta/settings';
import { STATS_KEY } from '../../../src/puzzle/meta/stats';
import { activateDial, captureState, newChapterState, openChapter, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from '../../../src/puzzle/content/cubes/test-dial';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { LevelSession, type SessionContext } from '../../../src/puzzle/app/levelSession';
import { DEFAULT_BINDINGS } from '../../../src/puzzle/input/bindings';
import type { InputFrame } from '../../../src/puzzle/input/types';
import type { Transition } from '../../../src/puzzle/render/transitions';
import type { PuzzleHud } from '../../../src/puzzle/ui/hud';
import { resolveTheme } from '../../../src/puzzle/render/themes';
import { place } from '../helpers';
import { TEXT } from '../msgs';

describe('escapeAction：浮層 > 轉動模式 / 字卡匣 > 開設定', () => {
  it('浮層開著 = 關浮層 (就算同時在轉動模式)；轉動模式 / 字卡匣 = 照舊交給它們；都沒有 = 開設定', () => {
    expect(escapeAction({ panel: 'items', turnMode: true, tray: false })).toBe('closePanel');
    expect(escapeAction({ panel: 'settings', turnMode: false, tray: false })).toBe('closePanel');
    expect(escapeAction({ panel: null, turnMode: true, tray: false })).toBe('pass');
    expect(escapeAction({ panel: null, turnMode: false, tray: true })).toBe('pass');
    expect(escapeAction({ panel: null, turnMode: false, tray: false })).toBe('openSettings');
  });
});

describe('重置記錄', () => {
  const seeded = () => memoryStorage({
    [SAVE_KEY]: JSON.stringify({ ...defaultSave(), name: '小晴', cleared: ['1-1', '1-2'] }), 'puzzle:save:corrupt': '{', [STATS_KEY]: '{}', 'puzzle:foyer:cleared': '1',
    [SETTINGS_KEY]: JSON.stringify({ ...defaultSettings(), turnMode: 'confirm', masterVolume: 0.3 }), 'gta:save': 'keep', 'other': 'keep'
  });
  it('只清 puzzle: 前綴的存檔；設定預設保留；其他前綴 (GTA) 不動；重置後讀檔 = 全新玩家 (defaultSave)、設定照舊', () => {
    const s = seeded();
    const r = resetRecords(s, { withSettings: false });
    expect(r).toEqual({ ok: true, cleared: [SAVE_KEY, 'puzzle:save:corrupt', STATS_KEY, 'puzzle:foyer:cleared'], memory: false });
    expect(Object.keys(s.dump()).sort()).toEqual(['gta:save', 'other', SETTINGS_KEY].sort());
    expect(loadSave(s)).toEqual(defaultSave());
    expect([loadSettings(s).turnMode, loadSettings(s).masterVolume]).toEqual(['confirm', 0.3]);
  });
  it('連設定一起重置：設定也清 → 讀回預設 (舊設定相容：缺欄 = 預設)', () => {
    const s = seeded();
    expect(resetRecords(s, { withSettings: true }).ok).toBe(true);
    expect(Object.keys(s.dump()).sort()).toEqual(['gta:save', 'other']);
    expect(loadSettings(s)).toEqual(defaultSettings());
  });
  it('刪不掉 (瀏覽器拒絕) → 失敗並列出鍵；記憶體版 (localStorage 不可用) → ok 但標 memory；沒有 keys() 的 storage 清已知的鍵', () => {
    const base = seeded();
    const stuck: KeyValueStorage = { ...base, remove: k => { if (k === SAVE_KEY) throw new Error('denied'); base.remove(k); } };
    expect(resetRecords(stuck, { withSettings: false })).toEqual({ ok: false, failed: [SAVE_KEY] });
    const mem = { ...seeded(), persistent: false };
    expect(resetRecords(mem, { withSettings: false })).toMatchObject({ ok: true, memory: true });
    const plain = seeded();
    const noKeys: KeyValueStorage = { get: plain.get, set: plain.set, remove: plain.remove };
    expect(resetRecords(noKeys, { withSettings: false })).toEqual({ ok: true, cleared: [SAVE_KEY, 'puzzle:save:corrupt', 'puzzle:foyer:cleared', STATS_KEY], memory: false });
    expect(plain.get(SETTINGS_KEY)).not.toBeNull();
  });
  it('兩段式：一開始不能按「確定重置」、連設定預設不勾；勾了「我了解」才可以', () => {
    const st = initialResetDialog();
    expect([st, canConfirmReset(st)]).toEqual([{ ack: false, withSettings: false }, false]);
    expect(canConfirmReset({ ack: true, withSettings: false })).toBe(true);
    expect(canConfirmReset({ ack: false, withSettings: true })).toBe(false);
  });
});

// ── LevelSession 的 Esc ──
const sink: unknown = new Proxy(function () { /* noop */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink), apply: () => sink, set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => sink }) };

describe('LevelSession：Esc 與設定 popup', () => {
  const SPEC: ChapterSpec = { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, doors: chapterDoors(PROTO_DIAL_ROOMS) };
  const SNAP: Transition = { duration: 0, start: () => {}, tick: () => ({ done: true, swapNow: true }), cancel: () => {} };
  const frame = (f: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveZ: 0, jump: false, pressed: [], anyKey: false, ...f });
  const make = () => {
    const cs = activateDial(openChapter(SPEC, newChapterState(SPEC, 'protoA', null), { mechanics: DEFAULT_MECHANICS, text: TEXT }));
    const ctx: SessionContext = { renderer: {} as SessionContext['renderer'], text: TEXT, hud: { reset: () => {} } as unknown as PuzzleHud, bindings: DEFAULT_BINDINGS, transition: SNAP, theme: resolveTheme(undefined) };
    const s = new LevelSession(ctx, SPEC, captureState(cs), { abilities: ['nib'], onCleared: () => {} });
    place(s.world, -2, 0, 1.5, '3d');
    return s;
  };
  const esc = (s: LevelSession) => s.update(1 / 60, frame({ pressed: ['cancel'] }));

  it('沒有浮層 / 轉動模式：Esc = 開設定 (角色不動、世界照常)；再 Esc = 關', () => {
    const s = make();
    esc(s);
    expect(s.isSettingsOpen).toBe(true);
    const x = s.world.player.x, t = s.world.time;
    for (let i = 0; i < 20; i++) s.update(1 / 60, frame({ moveX: 1 }));
    expect([s.world.player.x, s.world.time > t]).toEqual([x, true]);
    esc(s);
    expect(s.isSettingsOpen).toBe(false);
  });

  it('道具欄開著：Esc 先關道具欄 (不開設定)；轉動模式中：Esc = 離開轉動模式 (不開設定)；設定開著時進轉動模式 / 開道具欄 → 設定收起', () => {
    const s = make();
    s.toggleInventory();
    esc(s);
    expect([s.isInventoryOpen, s.isSettingsOpen]).toEqual([false, false]);
    s.requestMode('2d');
    for (let i = 0; i < 10; i++) s.update(1 / 60, frame());
    s.toggleTurnMode();
    expect(s.isTurnMode).toBe(true);
    esc(s);
    expect([s.isTurnMode, s.isSettingsOpen]).toEqual([false, false]);
    esc(s);
    expect(s.isSettingsOpen).toBe(true);
    s.toggleTurnMode();
    expect([s.isTurnMode, s.isSettingsOpen]).toEqual([true, false]);
    s.toggleSettings();
    s.toggleInventory();
    expect([s.isInventoryOpen, s.isSettingsOpen]).toEqual([true, false]);
  });
});
