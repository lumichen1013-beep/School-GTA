import { describe, it, expect } from 'vitest';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { isUnlocked, levelState, recordClear, startAbilities } from '../../../src/puzzle/meta/progress';
import { LEVELS, levelById, type LevelEntry } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { newWorld, place } from '../helpers';
import { interact } from '../../../src/puzzle/core/interact';
import { createWorld } from '../../../src/puzzle/core/world';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';

const entry = (id: string, after: string[], abilities: LevelEntry['abilities'] = []): LevelEntry =>
  ({ id, chapter: 1, titleKey: `lvl.${id}.title`, abilities, unlock: { after }, load: () => foyer });

describe('關卡登錄表與章節', () => {
  it('玄關登錄為 1-2，載入現有關卡資料；白名單為空 (重玩仍要先撿筆尖)', () => {
    const e = levelById('1-2')!;
    expect(e.load()).toBe(foyer);
    expect(e.load().id).toBe('1-2');
    expect([e.chapter, e.abilities]).toEqual([1, []]);
    expect(levelById('foyer')).toBeUndefined();
  });

  it('id 唯一；章節只引用已登錄的關卡；標題 key 都存在', () => {
    const ids = LEVELS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ch of CHAPTERS) {
      expect(ch.titleKey in zhHant).toBe(true);
      for (const id of ch.levels) expect(levelById(id)?.chapter).toBe(ch.id);
    }
    for (const e of LEVELS) expect(e.titleKey in zhHant).toBe(true);
  });
});

describe('線性解鎖與能力', () => {
  it('前置全部通關才解鎖；狀態 locked / open / cleared', () => {
    const a = entry('1-1', []); const b = entry('1-2', ['1-1']); const c = entry('5-5', ['5-2', '5-3', '5-4']);
    const save = { ...defaultSave(), cleared: ['1-1', '5-2', '5-4'] };
    expect([isUnlocked(a, save), isUnlocked(b, save), isUnlocked(c, save)]).toEqual([true, true, false]);
    expect([levelState(a, save), levelState(b, save), levelState(c, save)]).toEqual(['cleared', 'open', 'locked']);
    expect(levelState(c, { ...save, cleared: [...save.cleared, '5-3'] })).toBe('open');
    expect(levelState(LEVELS[0], defaultSave())).toBe('open');
  });

  it('開場能力 = 白名單 ∩ 存檔能力，並傳入 createWorld', () => {
    const save = { ...defaultSave(), abilities: ['nib', 'pin'] as const };
    const e = entry('2-3', [], ['pin', 'section']);
    expect(startAbilities(e, { ...save, abilities: [...save.abilities] })).toEqual(['pin']);
    expect(startAbilities(levelById('1-2')!, { ...save, abilities: [...save.abilities] })).toEqual([]);
    const w = createWorld(foyer, { mechanics: DEFAULT_MECHANICS, abilities: ['pin'] });
    expect(w.abilities).toEqual(['pin']);
    expect(newWorld().abilities).toEqual([]);
  });

  it('通關記錄：cleared 不重複、current、取得的筆尖寫入 abilities', () => {
    const w = newWorld();
    place(w, 8.5, 2.5, -4.5, '2d'); interact(w);
    const s1 = recordClear(defaultSave(), '1-2', w);
    expect([s1.cleared, s1.current, s1.abilities]).toEqual([['1-2'], '1-2', ['nib']]);
    expect(recordClear(s1, '1-2', newWorld()).cleared).toEqual(['1-2']);
    expect(recordClear(s1, '1-2', newWorld()).abilities).toEqual(['nib']);
  });
});

describe('第一章：1-1 門廊 → 1-2 玄關', () => {
  const s = (cleared: string[]) => ({ ...defaultSave(), cleared });
  const states = (save: ReturnType<typeof defaultSave>) => LEVELS.map(e => [e.id, levelState(e, save)]);

  it('登錄順序：1-1 在章節 levels 最前面；1-1 無前置、白名單為空；1-2 前置為 1-1', () => {
    expect(CHAPTERS.find(c => c.id === 1)!.levels).toEqual(['1-1', '1-2', '1-3']);
    expect(LEVELS[0].id).toBe('1-1');
    const e = levelById('1-1')!;
    expect([e.chapter, e.abilities, e.unlock.after, e.load().id]).toEqual([1, [], [], '1-1']);
    expect(levelById('1-2')!.unlock.after).toEqual(['1-1']);
    expect(levelById('1-3')!.unlock.after).toEqual(['1-2']);
  });

  it('全新存檔只能玩 1-1；通關 1-1 後 1-2 開放', () => {
    expect(states(defaultSave())).toEqual([['1-1', 'open'], ['1-2', 'locked'], ['1-3', 'locked'], ['2-1', 'locked'], ['2-2', 'locked'], ['2-3', 'locked'], ['2-4', 'locked'], ['2-5', 'locked'], ['H1', 'locked'], ['3-1', 'locked'], ['3-2', 'locked'], ['3-3', 'locked'], ['3-4', 'locked'], ['4-1', 'locked'], ['4-2', 'locked'], ['4-3', 'locked'], ['4-4', 'locked']]);
    expect(states(s(['1-1']))).toEqual([['1-1', 'cleared'], ['1-2', 'open'], ['1-3', 'locked'], ['2-1', 'locked'], ['2-2', 'locked'], ['2-3', 'locked'], ['2-4', 'locked'], ['2-5', 'locked'], ['H1', 'locked'], ['3-1', 'locked'], ['3-2', 'locked'], ['3-3', 'locked'], ['3-4', 'locked'], ['4-1', 'locked'], ['4-2', 'locked'], ['4-3', 'locked'], ['4-4', 'locked']]);
    expect(states(s(['1-1', '1-2']))).toEqual([['1-1', 'cleared'], ['1-2', 'cleared'], ['1-3', 'open'], ['2-1', 'locked'], ['2-2', 'locked'], ['2-3', 'locked'], ['2-4', 'locked'], ['2-5', 'locked'], ['H1', 'locked'], ['3-1', 'locked'], ['3-2', 'locked'], ['3-3', 'locked'], ['3-4', 'locked'], ['4-1', 'locked'], ['4-2', 'locked'], ['4-3', 'locked'], ['4-4', 'locked']]);
  });

  it('已通關 1-2 (1-1 加入前的存檔) 不被擋：1-2 仍可玩，1-1 也可玩', () => {
    expect(states(s(['1-2']))).toEqual([['1-1', 'open'], ['1-2', 'cleared'], ['1-3', 'open'], ['2-1', 'locked'], ['2-2', 'locked'], ['2-3', 'locked'], ['2-4', 'locked'], ['2-5', 'locked'], ['H1', 'locked'], ['3-1', 'locked'], ['3-2', 'locked'], ['3-3', 'locked'], ['3-4', 'locked'], ['4-1', 'locked'], ['4-2', 'locked'], ['4-3', 'locked'], ['4-4', 'locked']]);
    expect(isUnlocked(levelById('1-2')!, s(['1-2']))).toBe(true);
  });

  it('本關或以本關為 (遞移) 前置的後續關已通關 → 保持可玩；無關的關卡不算', () => {
    const levels = [entry('1-1', []), entry('1-2', ['1-1']), entry('1-3', ['1-2']), entry('9-9', [])];
    const [a, b, c] = levels;
    expect(isUnlocked(b, s(['1-3']), levels)).toBe(true);   // 後續的後續
    expect(isUnlocked(c, s(['1-3']), levels)).toBe(true);   // 本關
    expect(isUnlocked(c, s(['9-9']), levels)).toBe(false);  // 不依賴 1-3 的關卡
    expect(isUnlocked(b, s([]), levels)).toBe(false);
    expect(isUnlocked(a, s([]), levels)).toBe(true);
  });

  it('舊玄關存檔遷移 (cleared 1-1、1-2)：兩關都是已通關', () => {
    expect(states(s(['1-1', '1-2']))).toEqual([['1-1', 'cleared'], ['1-2', 'cleared'], ['1-3', 'open'], ['2-1', 'locked'], ['2-2', 'locked'], ['2-3', 'locked'], ['2-4', 'locked'], ['2-5', 'locked'], ['H1', 'locked'], ['3-1', 'locked'], ['3-2', 'locked'], ['3-3', 'locked'], ['3-4', 'locked'], ['4-1', 'locked'], ['4-2', 'locked'], ['4-3', 'locked'], ['4-4', 'locked']]);
  });
});
