import { describe, it, expect, vi } from 'vitest';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { defaultSave, LEGACY_FOYER_KEY, loadSave, SAVE_CORRUPT_KEY, SAVE_KEY, writeSave } from '../../../src/puzzle/meta/save';

describe('存檔遷移鏈 (puzzle:save v2)', () => {
  it('舊 key puzzle:foyer:cleared=1 → v2 (1-1、1-2 已通關、筆尖)，寫回後刪除舊 key', () => {
    const s = memoryStorage({ [LEGACY_FOYER_KEY]: '1' });
    const save = loadSave(s);
    expect(save).toEqual({ ...defaultSave(), cleared: ['1-1', '1-2'], abilities: ['nib'] });
    expect(JSON.parse(s.get(SAVE_KEY)!)).toEqual(save);
    expect(s.get(LEGACY_FOYER_KEY)).toBeNull();
  });

  it('全新玩家：預設存檔 (暱稱留空，由暱稱畫面填入)', () => {
    const s = memoryStorage();
    const save = loadSave(s);
    expect(save).toEqual(defaultSave());
    expect(save.name).toBe('');
    expect(Object.keys(s.dump())).toEqual([SAVE_KEY]);
  });

  it('舊 key 不是 1 也會被清掉，不算通關', () => {
    const s = memoryStorage({ [LEGACY_FOYER_KEY]: '0' });
    expect(loadSave(s).cleared).toEqual([]);
    expect(s.get(LEGACY_FOYER_KEY)).toBeNull();
  });

  it('壞 JSON：原字串備份到 puzzle:save:corrupt、回傳並寫入預設存檔、不丟例外', () => {
    const s = memoryStorage({ [SAVE_KEY]: '{"v":2,"cleared":[' });
    expect(() => loadSave(s)).not.toThrow();
    const s2 = memoryStorage({ [SAVE_KEY]: '{"v":2,"cleared":[' });
    expect(loadSave(s2)).toEqual(defaultSave());
    expect(s2.get(SAVE_CORRUPT_KEY)).toBe('{"v":2,"cleared":[');
    expect(JSON.parse(s2.get(SAVE_KEY)!)).toEqual(defaultSave());
  });

  it('不是物件 / 版本不明也視為壞資料', () => {
    for (const raw of ['[1,2]', '"x"', 'null', '{"v":9}', '{"v":"2"}', '{}']) {
      const s = memoryStorage({ [SAVE_KEY]: raw });
      expect(loadSave(s)).toEqual(defaultSave());
      expect(s.get(SAVE_CORRUPT_KEY)).toBe(raw);
    }
  });

  it('已是合法 v2：原樣回傳、不寫回', () => {
    const v2 = { v: 2, cleared: ['1-2'], current: '1-2', abilities: ['nib'], diary: [1], scraps: [], endings: { A: false, B: true }, name: '阿青' };
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify(v2) });
    const set = vi.spyOn(s, 'set');
    expect(loadSave(s)).toEqual(v2);
    expect(set).not.toHaveBeenCalled();
  });

  it('v2 欄位型別不符時校正並寫回；舊 key 不影響已有存檔', () => {
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 2, cleared: ['1-2', 3, '1-2'], abilities: ['nib', 'fly'], diary: [0, 2, 9], name: '  很長很長很長很長很長很長的名字  ', endings: 'x' }), [LEGACY_FOYER_KEY]: '1' });
    const save = loadSave(s);
    expect(save).toEqual({ ...defaultSave(), cleared: ['1-2'], abilities: ['nib'], diary: [2], name: '很長很長很長很長很長很長' });
    expect(JSON.parse(s.get(SAVE_KEY)!)).toEqual(save);
    expect(s.get(LEGACY_FOYER_KEY)).toBe('1');
  });

  it('v1 → v2 補齊欄位', () => {
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, cleared: ['1-2'], abilities: ['nib'] }) });
    expect(loadSave(s)).toEqual({ ...defaultSave(), cleared: ['1-2'], abilities: ['nib'] });
  });

  it('writeSave → loadSave 來回一致', () => {
    const s = memoryStorage();
    const save = { ...defaultSave(), name: '小桐', cleared: ['1-2'], current: '1-2' };
    writeSave(s, save);
    expect(loadSave(s)).toEqual(save);
  });
});
