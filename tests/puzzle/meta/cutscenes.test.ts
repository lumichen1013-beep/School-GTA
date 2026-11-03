import { describe, it, expect, vi } from 'vitest';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { defaultSave, loadSave, SAVE_KEY, seenCutscenes, skippedCutscenes, writeSave } from '../../../src/puzzle/meta/save';
import { defaultSettings, loadSettings, SETTINGS_KEY, writeSettings } from '../../../src/puzzle/meta/settings';
import { memoryEntries, recordCutscene, shouldAutoPlayPrologue } from '../../../src/puzzle/meta/cutscenes';

describe('存檔：過場紀錄欄位 (規格 8：seenCutscenes / skippedCutscenes)', () => {
  it('M1C 之前的存檔沒有新欄位 (以目前版本 v3 表示)：讀取不改寫、讀值為空清單 (安全預設)', () => {
    const old = { v: 3, cleared: ['1-1'], current: '1-1', abilities: [], diary: [], scraps: [], endings: { A: false, B: false }, name: '阿青' };
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify(old) });
    const set = vi.spyOn(s, 'set');
    const save = loadSave(s);
    expect(set).not.toHaveBeenCalled();
    expect([seenCutscenes(save), skippedCutscenes(save)]).toEqual([[], []]);
  });

  it('v0 / v1 遷移後也是空清單；全新存檔同', () => {
    expect(seenCutscenes(loadSave(memoryStorage({ 'puzzle:foyer:cleared': '1' })))).toEqual([]);
    expect(seenCutscenes(loadSave(memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, cleared: [] }) })))).toEqual([]);
    expect(skippedCutscenes(loadSave(memoryStorage()))).toEqual([]);
  });

  it('欄位存在時校正 (非字串去掉、去重)、型別錯回空清單；來回一致', () => {
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...defaultSave(), seenCutscenes: ['cs:prologue', 3, 'cs:prologue'], skippedCutscenes: 'x' }) });
    const save = loadSave(s);
    expect([save.seenCutscenes, save.skippedCutscenes]).toEqual([['cs:prologue'], []]);
    const s2 = memoryStorage();
    const v = { ...defaultSave(), name: '小桐', seenCutscenes: ['cs:prologue'], skippedCutscenes: ['cs:prologue'] };
    writeSave(s2, v);
    expect(loadSave(s2)).toEqual(v);
  });
});

describe('設定：autoAdvance / textSpeed / skipConfirm', () => {
  it('預設：手動推進、一般速度、跳過需確認；舊設定沒有新欄位時取預設', () => {
    const d = defaultSettings();
    expect([d.autoAdvance, d.textSpeed, d.skipConfirm]).toEqual([false, 'normal', true]);
    const old = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ hints: 'always', reduceMotion: true }) });
    expect(loadSettings(old)).toEqual({ ...defaultSettings(), hints: 'always', reduceMotion: true });
  });

  it('不合法值回預設；寫入後讀回一致', () => {
    const bad = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ autoAdvance: 'yes', textSpeed: 'fast', skipConfirm: 0 }) });
    expect(loadSettings(bad)).toEqual(defaultSettings());
    const s = memoryStorage();
    const v = { ...defaultSettings(), autoAdvance: true, textSpeed: 'slow' as const, skipConfirm: false };
    writeSettings(s, v);
    expect(loadSettings(s)).toEqual(v);
  });
});

describe('過場紀錄規則', () => {
  const named = { ...defaultSave(), name: '阿青' };

  it('序章自動播放：有暱稱、未看過、無通關進度；既有進度存檔不自動播', () => {
    expect(shouldAutoPlayPrologue(named)).toBe(true);
    expect(shouldAutoPlayPrologue(defaultSave())).toBe(false);
    expect(shouldAutoPlayPrologue({ ...named, cleared: ['1-1'] })).toBe(false);
    expect(shouldAutoPlayPrologue(recordCutscene(named, 'cs:prologue', true))).toBe(false);
  });

  it('看完 → seen；跳過 → seen + skipped (未看完)；之後看完 → 移出 skipped；已看完再跳過不降級', () => {
    const a = recordCutscene(named, 'cs:prologue', true);
    expect([a.seenCutscenes, a.skippedCutscenes]).toEqual([['cs:prologue'], ['cs:prologue']]);
    const b = recordCutscene(a, 'cs:prologue', false);
    expect([b.seenCutscenes, b.skippedCutscenes]).toEqual([['cs:prologue'], []]);
    const c = recordCutscene(b, 'cs:prologue', true);
    expect([c.seenCutscenes, c.skippedCutscenes]).toEqual([['cs:prologue'], []]);
    expect(named.seenCutscenes).toBeUndefined(); // 不改原物件
  });

  it('回憶頁：序章有暱稱即列出；未看過 / 未看完 / 看過分別標示；沒有暱稱時不列', () => {
    expect(memoryEntries(defaultSave())).toEqual([]);
    expect(memoryEntries({ ...named, cleared: ['1-1', '1-2'] })).toEqual([{ id: 'cs:prologue', titleKey: 'cs.prologue.title', status: 'unseen' }]);
    expect(memoryEntries(recordCutscene(named, 'cs:prologue', true))[0].status).toBe('unfinished');
    expect(memoryEntries(recordCutscene(named, 'cs:prologue', false))[0].status).toBe('seen');
  });

  it('章末過場：通關觸發關後才列出', () => {
    const def = { id: 'cs:ch1' as const, titleKey: 't', trigger: { afterClear: '1-3' }, replayable: true as const, shots: [] };
    expect(memoryEntries(named, [def])).toEqual([]);
    expect(memoryEntries({ ...named, cleared: ['1-3'] }, [def]).map(e => e.status)).toEqual(['unseen']);
  });
});
