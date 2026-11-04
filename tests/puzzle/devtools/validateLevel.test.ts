import { describe, it, expect } from 'vitest';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';
import { closet } from '../../../src/puzzle/content/levels/ch1/closet';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { validateEntry, validateLevel, type LevelIssue } from '../../../src/puzzle/devtools/validateLevel';
import type { AbilityId, LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import type { LevelEntry } from '../../../src/puzzle/content/levels';
import { FOYER_V02 } from '../fixtures/foyerV02';
import { TEST_BUNDLE } from '../msgs';

/** zh-Hant + v0.2 凍結場景的文字 (C7 起 v0.2 才有的 key 不在 zh-Hant) */
const ctx = { mechanics: DEFAULT_MECHANICS, bundle: TEST_BUNDLE };
const reg = { ...ctx, levels: LEVELS, chapters: CHAPTERS };
const codes = (issues: LevelIssue[]) => issues.map(i => [i.code, i.obj ?? null]);
/** 複製 v0.2 玄關 (含墨水閥 / 出口門的固定場景) 並改動物件 (id 對應的物件以 patch 覆寫；patch 為 null 則移除) */
function foyerWith(patch: Record<string, Partial<ObjDef> | null>, extra: ObjDef[] = []): LevelDef {
  const objects = FOYER_V02.objects.flatMap(o => (o.id in patch ? (patch[o.id] === null ? [] : [{ ...o, ...patch[o.id] } as ObjDef]) : [o]));
  return { ...FOYER_V02, objects: [...objects, ...extra] };
}

describe('validateLevel：玄關', () => {
  it('玄關 1-2 零問題 (關卡與登錄表)', () => {
    expect(validateLevel(foyer, ctx)).toEqual([]);
    expect(LEVELS.flatMap(e => validateEntry(e, reg))).toEqual([]);
  });
});

describe('validateLevel：門廊 1-1', () => {
  it('門廊 1-1 零問題 (關卡與登錄表)；登錄表每關都驗 (C8 加 1-3)', () => {
    expect(validateLevel(porch, ctx)).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-1')!, reg)).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-2')!, reg)).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-3')!, reg)).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '2-1')!, reg)).toEqual([]);
    expect(LEVELS.map(e => e.id)).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3']);
  });

  it('沒有封印的門 (unsealed) 不需要打開它的物件；拿掉 unsealed 就回報 ref.exitLocked', () => {
    const sealed = { ...porch, objects: porch.objects.map(o => (o.id === 'door' ? { ...o, unsealed: false } : o)) };
    expect(codes(validateLevel(sealed, ctx))).toEqual([['ref.exitLocked', 'door']]);
    // 玄關的門照舊：要有物件 opens 它，unsealed 不影響其他門的檢查
    const two = foyerWith({}, [{ id: 'door2', type: 'door', x: -15, y: 0, z: -5.85, w: 1.6, h: 2.4, d: 0.3, visible: 'both', solid: false, interactable: true, unsealed: true }]);
    expect(validateLevel(two, ctx)).toEqual([]);
    expect(codes(validateLevel(foyerWith({ valve: { opens: 'gate' } }, [two.objects.at(-1)!]), ctx))).toEqual([['ref.exitLocked', 'door']]);
  });
});

describe('validateLevel：故意壞掉的關卡逐項回報', () => {
  it('缺文字 key → text.missing (附物件 id)', () => {
    const bad = foyerWith({ crate: { labelKey: 'lvl.1-2.nope' } });
    expect(codes(validateLevel(bad, ctx))).toEqual([['text.missing', 'crate']]);
    expect(codes(validateLevel({ ...FOYER_V02, narrationKey: 'lvl.x.nope' }, ctx))).toEqual([['text.missing', null]]);
  });

  it('標籤的缺卡說明 (label.noCardText) 也要在文字表裡 → 否則 text.missing', () => {
    const lever = closet.objects.find(o => o.id === 'lever')!;
    const bad = { ...closet, objects: closet.objects.map(o => (o.id === 'lever' ? { ...o, label: { ...lever.label!, noCardText: 'lvl.1-3.nope' } } : o)) };
    expect(codes(validateLevel(closet, ctx))).toEqual([]);
    expect(codes(validateLevel(bad, ctx))).toEqual([['text.missing', 'lever']]);
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
    const dup = foyerWith({}, [{ ...FOYER_V02.objects.find(o => o.id === 'note')!, x: -16 }]);
    expect(codes(validateLevel(dup, ctx))).toEqual([['object.dupId', 'note']]);
  });

  it('未註冊類型 → obj.unknownType；機制表少了 exit 時門也是未知類型', () => {
    const unk = foyerWith({}, [{ id: 'lamp1', type: 'lamp', x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, visible: 'both', solid: false } as unknown as ObjDef]);
    expect(codes(validateLevel(unk, ctx))).toEqual([['object.unknownType', 'lamp1']]);
    const noExit = DEFAULT_MECHANICS.filter(m => m.id !== 'exit');
    expect(codes(validateLevel(FOYER_V02, { ...ctx, mechanics: noExit }))).toEqual([['object.unknownType', 'door']]);
  });

  it('schema：尺寸、欄位型別、可見模式、出界', () => {
    expect(codes(validateLevel(foyerWith({ crate: { w: 0 } }), ctx))).toEqual([['object.size', 'crate']]);
    expect(codes(validateLevel(foyerWith({ crate: { x: Number.NaN } }), ctx))).toEqual([['object.field', 'crate']]);
    expect(codes(validateLevel(foyerWith({ crate: { visible: 'paper' as never } }), ctx))).toEqual([['object.visible', 'crate']]);
    expect(codes(validateLevel(foyerWith({ valve: { interactIn: '3d' } }), ctx))).toEqual([['object.visible', 'valve']]);
    expect(codes(validateLevel(foyerWith({ note: { x: -25 } }), ctx))).toEqual([['object.outOfBounds', 'note']]);
    expect(codes(validateLevel({ ...FOYER_V02, bounds: { ...FOYER_V02.bounds, minX: 30 } }, ctx))).toEqual([['level.bounds', null]]);
    expect(codes(validateLevel({ ...FOYER_V02, titleKey: '' }, ctx))).toEqual([['level.field', null], ['text.missing', null]]);
  });

  it('出口：沒有門 → level.noExit；門沒人開 → ref.exitLocked', () => {
    expect(codes(validateLevel(foyerWith({ door: null }), ctx))).toEqual([['ref.opens', 'valve'], ['level.noExit', null]]);
    expect(codes(validateLevel(foyerWith({ valve: { opens: 'gate' } }), ctx))).toEqual([['ref.exitLocked', 'door']]);
  });

  it('起點 / 檢查點：懸空或卡在實體裡 → level.start / level.checkpoint', () => {
    expect(codes(validateLevel({ ...FOYER_V02, start: { x: -8, y: 0, z: 2 } }, ctx))).toEqual([['level.start', null]]);   // 缺口上方
    expect(codes(validateLevel({ ...FOYER_V02, start: { x: 8.5, y: 0, z: -4.5 } }, ctx))).toEqual([['level.start', null]]); // 高台裡
    expect(codes(validateLevel({ ...FOYER_V02, checkpoints: [{ minX: -5.7, x: -4, y: 0.5, z: 2 }] }, ctx))).toEqual([['level.checkpoint', null]]);
    const twice = [{ minX: -5.7, x: -4, y: 0, z: 2 }, { minX: -5.7, x: -3, y: 0, z: 2 }];
    expect(codes(validateLevel({ ...FOYER_V02, checkpoints: twice }, ctx))).toEqual([['level.checkpoint', null]]);
  });

  it('登錄表：id / titleKey 不一致、未知能力、解鎖前置不存在、章節未列入', () => {
    const e = LEVELS[0];
    const bad: LevelEntry = { ...e, id: '1-9', titleKey: 'lvl.1-9.title', abilities: ['wings' as AbilityId], unlock: { after: ['0-0'] } };
    expect(validateEntry(bad, reg).map(i => i.code)).toEqual(['entry.mismatch', 'entry.mismatch', 'entry.ability', 'entry.unlock', 'entry.chapter']);
    expect(validateEntry({ ...e, chapter: 9 }, reg).map(i => i.code)).toEqual(['entry.chapter']);
  });
});
