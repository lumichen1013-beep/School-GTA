import { describe, it, expect } from 'vitest';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { validateEntry, validateLevel, type LevelIssue } from '../../../src/puzzle/devtools/validateLevel';
import type { AbilityId, LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import type { LevelEntry } from '../../../src/puzzle/content/levels';

const ctx = { mechanics: DEFAULT_MECHANICS, bundle: zhHant };
const reg = { ...ctx, levels: LEVELS, chapters: CHAPTERS };
const codes = (issues: LevelIssue[]) => issues.map(i => [i.code, i.obj ?? null]);
/** 複製玄關並改動物件 (id 對應的物件以 patch 覆寫；patch 為 null 則移除) */
function foyerWith(patch: Record<string, Partial<ObjDef> | null>, extra: ObjDef[] = []): LevelDef {
  const objects = foyer.objects.flatMap(o => (o.id in patch ? (patch[o.id] === null ? [] : [{ ...o, ...patch[o.id] } as ObjDef]) : [o]));
  return { ...foyer, objects: [...objects, ...extra] };
}

describe('validateLevel：玄關', () => {
  it('玄關 1-2 零問題 (關卡與登錄表)', () => {
    expect(validateLevel(foyer, ctx)).toEqual([]);
    expect(LEVELS.flatMap(e => validateEntry(e, reg))).toEqual([]);
  });
});

describe('validateLevel：故意壞掉的關卡逐項回報', () => {
  it('缺文字 key → text.missing (附物件 id)', () => {
    const bad = foyerWith({ crate: { labelKey: 'lvl.1-2.nope' } });
    expect(codes(validateLevel(bad, ctx))).toEqual([['text.missing', 'crate']]);
    expect(codes(validateLevel({ ...foyer, narrationKey: 'lvl.x.nope' }, ctx))).toEqual([['text.missing', null]]);
  });

  it('opens 指向不存在的 id / 自己 → ref.opens', () => {
    expect(codes(validateLevel(foyerWith({ plate: { opens: 'gateX' } }), ctx))).toEqual([['ref.opens', 'plate']]);
    expect(codes(validateLevel(foyerWith({ plate: { opens: 'plate' } }), ctx))).toEqual([['ref.opens', 'plate']]);
  });

  it('requires 的物品本關取不到 → ref.requires；開場能力白名單可滿足', () => {
    const noKey = foyerWith({ key: null });
    expect(codes(validateLevel(noKey, ctx))).toEqual([['ref.requires', 'valve']]);
    expect(validateLevel(noKey, { ...ctx, abilities: ['nib'] as AbilityId[] })).toEqual([]);
  });

  it('重複 id → obj.dupId', () => {
    const dup = foyerWith({}, [{ ...foyer.objects.find(o => o.id === 'note')!, x: -16 }]);
    expect(codes(validateLevel(dup, ctx))).toEqual([['object.dupId', 'note']]);
  });

  it('未註冊類型 → obj.unknownType；機制表少了 exit 時門也是未知類型', () => {
    const unk = foyerWith({}, [{ id: 'lamp1', type: 'lamp', x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, visible: 'both', solid: false } as unknown as ObjDef]);
    expect(codes(validateLevel(unk, ctx))).toEqual([['object.unknownType', 'lamp1']]);
    const noExit = DEFAULT_MECHANICS.filter(m => m.id !== 'exit');
    expect(codes(validateLevel(foyer, { ...ctx, mechanics: noExit }))).toEqual([['object.unknownType', 'door']]);
  });

  it('schema：尺寸、欄位型別、可見模式、出界', () => {
    expect(codes(validateLevel(foyerWith({ crate: { w: 0 } }), ctx))).toEqual([['object.size', 'crate']]);
    expect(codes(validateLevel(foyerWith({ crate: { x: Number.NaN } }), ctx))).toEqual([['object.field', 'crate']]);
    expect(codes(validateLevel(foyerWith({ crate: { visible: 'paper' as never } }), ctx))).toEqual([['object.visible', 'crate']]);
    expect(codes(validateLevel(foyerWith({ valve: { interactIn: '3d' } }), ctx))).toEqual([['object.visible', 'valve']]);
    expect(codes(validateLevel(foyerWith({ note: { x: -25 } }), ctx))).toEqual([['object.outOfBounds', 'note']]);
    expect(codes(validateLevel({ ...foyer, bounds: { ...foyer.bounds, minX: 30 } }, ctx))).toEqual([['level.bounds', null]]);
    expect(codes(validateLevel({ ...foyer, titleKey: '' }, ctx))).toEqual([['level.field', null], ['text.missing', null]]);
  });

  it('出口：沒有門 → level.noExit；門沒人開 → ref.exitLocked', () => {
    expect(codes(validateLevel(foyerWith({ door: null }), ctx))).toEqual([['ref.opens', 'valve'], ['level.noExit', null]]);
    expect(codes(validateLevel(foyerWith({ valve: { opens: 'gate' } }), ctx))).toEqual([['ref.exitLocked', 'door']]);
  });

  it('起點 / 檢查點：懸空或卡在實體裡 → level.start / level.checkpoint', () => {
    expect(codes(validateLevel({ ...foyer, start: { x: -8, y: 0, z: 2 } }, ctx))).toEqual([['level.start', null]]);   // 缺口上方
    expect(codes(validateLevel({ ...foyer, start: { x: 8.5, y: 0, z: -4.5 } }, ctx))).toEqual([['level.start', null]]); // 高台裡
    expect(codes(validateLevel({ ...foyer, checkpoints: [{ minX: -5.7, x: -4, y: 0.5, z: 2 }] }, ctx))).toEqual([['level.checkpoint', null]]);
    const twice = [{ minX: -5.7, x: -4, y: 0, z: 2 }, { minX: -5.7, x: -3, y: 0, z: 2 }];
    expect(codes(validateLevel({ ...foyer, checkpoints: twice }, ctx))).toEqual([['level.checkpoint', null]]);
  });

  it('登錄表：id / titleKey 不一致、未知能力、解鎖前置不存在、章節未列入', () => {
    const e = LEVELS[0];
    const bad: LevelEntry = { ...e, id: '1-9', titleKey: 'lvl.1-9.title', abilities: ['wings' as AbilityId], unlock: { after: ['0-0'] } };
    expect(validateEntry(bad, reg).map(i => i.code)).toEqual(['entry.mismatch', 'entry.mismatch', 'entry.ability', 'entry.unlock', 'entry.chapter']);
    expect(validateEntry({ ...e, chapter: 9 }, reg).map(i => i.code)).toEqual(['entry.chapter']);
  });
});
