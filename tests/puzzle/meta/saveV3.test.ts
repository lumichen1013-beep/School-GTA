// C5：SaveV3 骨架 (規格 8：chapters = 魔方 + 房間快照；v2 → v3 遷移；舊存檔已通關 1-2 免重做 1-2a / 1-2b)
import { describe, it, expect, vi } from 'vitest';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { defaultSave, loadSave, SAVE_KEY, writeSave, type Save } from '../../../src/puzzle/meta/save';
import { chapterSave, chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { captureState, enterRoom, openChapter, turn, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { CH1_CUBE, CH1_LEGACY } from '../../../src/puzzle/content/cubes/ch1';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import type { LevelDef } from '../../../src/puzzle/core/types';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const stub = (id: string): LevelDef => ({ ...foyer, id, objects: foyer.objects.filter(o => o.type === 'floor') });
/** 第一章的魔方 + 現有玄關 + 兩間占位 (只驗存檔，不驗房間內容) */
const SPEC: ChapterSpec = { chapter: 1, cube: CH1_CUBE, rooms: { foyer, stair: stub('stair'), closet: stub('closet') }, doors: [] };
const START = { room: 'foyer', door: null };

describe('遷移 v2 → v3', () => {
  it('合法 v2：版本升 3、能力只留 nib (pin / section / mark 隨機制退役)、其餘欄位原樣；寫回、沒有 chapters 欄', () => {
    const v2 = { v: 2, cleared: ['1-1', '1-2'], current: '1-2', abilities: ['nib', 'pin', 'mark'], diary: [1], scraps: [2], endings: { A: false, B: true }, name: '阿青', seenCutscenes: ['cs:prologue'] };
    const s = memoryStorage({ [SAVE_KEY]: JSON.stringify(v2) });
    const set = vi.spyOn(s, 'set');
    const save = loadSave(s);
    expect(save).toEqual({ ...v2, v: 3, abilities: ['nib'] });
    expect('chapters' in save).toBe(false);
    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.parse(s.get(SAVE_KEY)!)).toEqual(save);
  });

  it('v0 舊玄關 key → v3 一路遷移 (1-1、1-2 已通關、筆尖)', () => {
    const save = loadSave(memoryStorage({ 'puzzle:foyer:cleared': '1' }));
    expect(save).toEqual({ ...defaultSave(), cleared: ['1-1', '1-2'], abilities: ['nib'] });
    expect(save.v).toBe(3);
  });

  it('v3 章節快照來回一致；壞掉的章節 (缺 cube / at、格位不是整數) 丟掉、其餘欄位保留', () => {
    const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, START), OPTS);
    const good = withChapter({ ...defaultSave(), name: '小桐' }, captureState(cs));
    const s = memoryStorage();
    writeSave(s, good);
    expect(loadSave(s)).toEqual(good);
    const bad = { ...good, chapters: { ...good.chapters, 2: { rooms: {} }, 3: { ...good.chapters!['1'], cube: { pos: { foyer: [0, 0.5, 0] }, rot: {} } } } };
    const s2 = memoryStorage({ [SAVE_KEY]: JSON.stringify(bad) });
    expect(loadSave(s2)).toEqual(good);
  });
});

describe('chapterStart：開章', () => {
  it('新玩家：魔方 S0、從入口進玄關、沒有快照與道具', () => {
    const st = chapterStart(defaultSave(), SPEC, START);
    expect(st).toEqual({ chapter: 1, cube: { pos: { stair: [1, 0, 0], closet: [1, 1, 0], foyer: [0, 1, 0] }, rot: { stair: 0, closet: 0, foyer: 0 } }, room: 'foyer', door: null, rooms: {}, items: {}, flags: [], labels: {}, moved: {} });
  });

  it('舊存檔已通關 1-2：玄關預設 1-2a / 1-2b 已完成 (筆尖已拿、踏板已壓、鐵柵門已開) → 不必重做，直接走得進出口區', () => {
    const old: Save = { ...defaultSave(), cleared: ['1-1', '1-2'], abilities: ['nib'] };
    const cs = openChapter(SPEC, chapterStart(old, SPEC, START, CH1_LEGACY), OPTS);
    const w = cs.world;
    expect([w.byId.get('key')!.gone, w.byId.get('plate')!.used, w.byId.get('gate')!.used]).toEqual([true, true, true]);
    expect(hasItem(w, 'nib')).toBe(true);
    // 木箱與其他物件維持初值
    expect(w.byId.get('crate')!.x).toBe(foyer.objects.find(o => o.id === 'crate')!.x);
    // 沒通關 1-2 的存檔不套用
    const fresh = openChapter(SPEC, chapterStart({ ...defaultSave(), cleared: ['1-1'] }, SPEC, START, CH1_LEGACY), OPTS);
    expect([fresh.world.byId.get('key')!.gone, fresh.world.byId.get('gate')!.used, hasItem(fresh.world, 'nib')]).toEqual([false, false, false]);
  });

  it('存檔 (轉動 / 換房後) → 下次開章：魔方排列、所在房與門、房間快照、道具都接上；章節快照優先於舊存檔預設', () => {
    let cs: ChapterSession = openChapter(SPEC, chapterStart(defaultSave(), SPEC, START), OPTS);
    cs.world.byId.get('crate')!.x = 6;
    cs = turn(cs, { t: 'slide', room: 'foyer', dir: 'N' }) as ChapterSession;
    cs = enterRoom(cs, 'stair', null, OPTS);
    const save = withChapter({ ...defaultSave(), cleared: ['1-2'] }, captureState(cs));
    const st = chapterStart(save, SPEC, START, CH1_LEGACY);
    expect([st.room, st.door, st.cube!.pos.foyer]).toEqual(['stair', null, [0, 0, 0]]);
    expect(st.rooms.foyer.objs.find(o => o.id === 'crate')!.x).toBe(6);
    expect(st.rooms.foyer.objs.find(o => o.id === 'key')!.gone).toBe(false);
    expect(chapterSave(st)).toEqual(save.chapters!['1']);
  });

  it('存檔裡的房間 / 門不在本章 → 從入口進；排列缺房間 → 視為壞檔從頭', () => {
    const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, START), OPTS);
    const save = withChapter(defaultSave(), { ...captureState(cs), room: 'nope' });
    expect(chapterStart(save, SPEC, START).room).toBe('foyer');
    const broken = { ...save, chapters: { 1: { ...save.chapters!['1'], cube: { pos: { foyer: [0, 1, 0] as [number, number, number] }, rot: {} } } } };
    expect(chapterStart(broken, SPEC, START).cube).toEqual(chapterStart(defaultSave(), SPEC, START).cube);
  });
});
