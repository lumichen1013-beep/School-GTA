import { describe, it, expect } from 'vitest';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { defaultSettings, loadSettings, SETTINGS_KEY, writeSettings } from '../../../src/puzzle/meta/settings';
import { loadStats, recordPuzzle, STATS_KEY } from '../../../src/puzzle/meta/stats';

describe('設定 (puzzle:settings)', () => {
  it('預設值：calmTension / guideMode 預留且預設 false', () => {
    const d = loadSettings(memoryStorage());
    expect(d).toEqual(defaultSettings());
    expect([d.calmTension, d.guideMode, d.hints, d.inkPalette, d.reduceMotion]).toEqual([false, false, 'timed', 'default', false]);
  });

  it('壞 JSON 回預設；不合法欄位逐項回預設；keys 只收字串清單', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{bad' }))).toEqual(defaultSettings());
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ hints: 'never', calmTension: true, noteScale: 5, inkPalette: 'mono', keys: { flip: ['KeyG'], reset: [], jump: [1] } }) });
    expect(loadSettings(s)).toEqual({ ...defaultSettings(), calmTension: true, inkPalette: 'mono', keys: { flip: ['KeyG'] } });
  });

  it('寫入後讀回一致', () => {
    const s = memoryStorage();
    const v = { ...defaultSettings(), reduceMotion: true, noteScale: 1.2 };
    writeSettings(s, v);
    expect(loadSettings(s)).toEqual(v);
  });
});

describe('統計 (puzzle:stats)', () => {
  it('recordPuzzle 數值累加、布林取 OR；壞資料視為空', () => {
    const s = memoryStorage({ [STATS_KEY]: 'oops' });
    expect(loadStats(s)).toEqual({});
    recordPuzzle(s, '1-2a', { time: 30, resets: 1, notesRevealed: [true, false] });
    const r = recordPuzzle(s, '1-2a', { time: 12.5, notesRead: 2, guideOpened: true });
    expect(r).toEqual({ time: 42.5, notesRevealed: [true, false], notesRead: 2, guideOpened: true, skipped: false, resets: 1 });
    expect(loadStats(s)).toEqual({ '1-2a': r });
  });
});
