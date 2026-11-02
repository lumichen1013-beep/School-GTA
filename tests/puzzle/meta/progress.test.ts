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
