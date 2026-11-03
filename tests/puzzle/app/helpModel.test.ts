// 操作說明面板 (預設收合、H 開合、遇到疊層自動讓位) 與一次性操作小提示 (app/helpModel；使用者回報「操作說明擋住了畫面」)
import { describe, it, expect } from 'vitest';
import { TEXT } from '../msgs';
import { deriveHelpView, pendingTip, tipText, TIP_MS, type HelpContext } from '../../../src/puzzle/app/helpModel';
import { DEFAULT_BINDINGS, INPUT_ACTIONS, mergeBindings } from '../../../src/puzzle/input/bindings';
import { defaultSettings, loadSettings, SETTINGS_KEY, writeSettings } from '../../../src/puzzle/meta/settings';
import { memoryStorage } from '../../../src/puzzle/meta/storage';

const ctx = (o: Partial<HelpContext> = {}): HelpContext => ({ inLevel: true, mapOpen: false, trayOpen: false, turnMode: false, busy: false, ...o });

describe('操作說明面板 (deriveHelpView)', () => {
  it('預設收合：只有小鈕「H　操作說明」、面板不展開；H 是預設按鍵', () => {
    expect(defaultSettings().helpOpen).toBe(false);
    expect(DEFAULT_BINDINGS.help).toEqual(['KeyH']);
    expect(INPUT_ACTIONS).toContain('help');
    expect(deriveHelpView(false, ctx(), TEXT, DEFAULT_BINDINGS)).toEqual({ button: true, expanded: false, yielded: false, label: 'H　操作說明' });
  });

  it('展開：面板顯示、小鈕改「收起說明」；重綁後鍵名跟著變', () => {
    expect(deriveHelpView(true, ctx(), TEXT, DEFAULT_BINDINGS)).toEqual({ button: true, expanded: true, yielded: false, label: 'H　收起說明' });
    expect(deriveHelpView(false, ctx(), TEXT, mergeBindings(DEFAULT_BINDINGS, { help: ['Slash'] })).label).toBe('Slash　操作說明');
  });

  it('展開時遇到展開圖 / 字卡匣 / 轉動模式 → 自動讓位 (面板收起、偏好不變)；疊層關掉就回來', () => {
    for (const o of [{ mapOpen: true }, { trayOpen: true }, { turnMode: true, mapOpen: true }]) {
      expect(deriveHelpView(true, ctx(o), TEXT, DEFAULT_BINDINGS)).toMatchObject({ expanded: false, yielded: true });
    }
    expect(deriveHelpView(true, ctx(), TEXT, DEFAULT_BINDINGS).expanded).toBe(true);
  });

  it('不在關卡裡 (選單 / 通關畫面 / 過場)：小鈕與面板都不顯示', () => {
    expect(deriveHelpView(true, ctx({ inLevel: false }), TEXT, DEFAULT_BINDINGS)).toMatchObject({ button: false, expanded: false, yielded: false });
  });
});

describe('一次性操作小提示 (pendingTip / tipText)', () => {
  it('第一次進關：說一次怎麼打開操作說明；說過就不再說', () => {
    expect(pendingTip([], ctx())).toBe('help');
    expect(pendingTip(['help'], ctx())).toBe(null);
    expect(tipText('help', TEXT, DEFAULT_BINDINGS)).toBe('按 H 可以打開操作說明。');
  });

  it('第一次打開字卡匣 / 轉動模式：說該操作的鍵 (優先於操作說明)；各說一次', () => {
    expect(pendingTip([], ctx({ trayOpen: true }))).toBe('cards');
    expect(pendingTip(['cards'], ctx({ trayOpen: true }))).toBe(null);
    expect(pendingTip(['help'], ctx({ turnMode: true, mapOpen: true }))).toBe('turn');
    expect(pendingTip(['help', 'turn'], ctx({ turnMode: true, mapOpen: true }))).toBe(null);
    expect(tipText('cards', TEXT, DEFAULT_BINDINGS)).toBe('1～3 貼卡　X 取下　Escape 關閉');
    expect(tipText('turn', TEXT, DEFAULT_BINDINGS)).toBe('方向鍵選一排　Enter 確認　Z 回退　Tab 離開');
  });

  it('過場 / 旁白中、不在關卡裡：不說；停留 < 3 秒 (自動消失)', () => {
    expect([pendingTip([], ctx({ busy: true })), pendingTip([], ctx({ inLevel: false }))]).toEqual([null, null]);
    expect(TIP_MS).toBeLessThanOrEqual(3000);
  });

  it('小提示一行放得下手機直屏 (≤ 28 字)', () => {
    for (const id of ['help', 'cards', 'turn'] as const) expect([id, tipText(id, TEXT, DEFAULT_BINDINGS).length <= 28]).toEqual([id, true]);
  });
});

describe('設定：helpOpen / tipsSeen (舊設定相容)', () => {
  it('舊設定沒有這兩欄 → 預設收合、沒說過任何小提示；其他欄照舊', () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ hints: 'always', reduceMotion: true }) });
    expect(loadSettings(s)).toEqual({ ...defaultSettings(), hints: 'always', reduceMotion: true, helpOpen: false, tipsSeen: [] });
  });

  it('型別不符回預設；tipsSeen 只收字串、去重；寫入讀回一致', () => {
    const bad = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ helpOpen: 'yes', tipsSeen: ['help', 3, 'help', 'cards'] }) });
    expect([loadSettings(bad).helpOpen, loadSettings(bad).tipsSeen]).toEqual([false, ['help', 'cards']]);
    const s = memoryStorage();
    const v = { ...defaultSettings(), helpOpen: true, tipsSeen: ['help'] };
    writeSettings(s, v);
    expect(loadSettings(s)).toEqual(v);
  });
});
