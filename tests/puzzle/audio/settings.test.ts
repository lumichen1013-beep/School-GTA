// 聲音設定欄位 (audio-design 6)：舊設定相容、預設值、校正
import { describe, it, expect } from 'vitest';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { defaultSettings, loadSettings, sanitizeSettings, SETTINGS_KEY, writeSettings } from '../../../src/puzzle/meta/settings';
import { DEFAULT_VOLUMES } from '../../../src/puzzle/audio/mix';

describe('聲音設定', () => {
  it('預設值與 audio/mix 的預設音量一致；不靜音', () => {
    const d = defaultSettings();
    expect([d.masterVolume, d.musicVolume, d.sfxVolume, d.mute]).toEqual([DEFAULT_VOLUMES.master, DEFAULT_VOLUMES.music, DEFAULT_VOLUMES.sfx, DEFAULT_VOLUMES.mute]);
  });
  it('舊設定 (沒有音量欄位) → 預設值，其他欄位保留', () => {
    const s = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ hints: 'off', calmTension: true }) });
    const v = loadSettings(s);
    expect(v.hints).toBe('off');
    expect(v.calmTension).toBe(true);
    expect([v.masterVolume, v.musicVolume, v.sfxVolume, v.mute]).toEqual([0.8, 0.6, 0.8, false]);
  });
  it('越界夾到 0～1；型別錯 / NaN → 預設；寫入後讀回相同', () => {
    const v = sanitizeSettings({ masterVolume: 3, musicVolume: -1, sfxVolume: 'x', mute: 'yes' });
    expect([v.masterVolume, v.musicVolume, v.sfxVolume, v.mute]).toEqual([1, 0, 0.8, false]);
    expect(sanitizeSettings({ sfxVolume: Number.NaN }).sfxVolume).toBe(0.8);
    const s = memoryStorage();
    const w = { ...defaultSettings(), masterVolume: 0.35, musicVolume: 0, sfxVolume: 1, mute: true };
    writeSettings(s, w);
    expect(loadSettings(s)).toEqual(w);
  });
});
