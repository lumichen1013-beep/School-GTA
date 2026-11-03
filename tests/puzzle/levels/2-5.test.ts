// 2-5 書房深處 (規格 6「2-5 書房深處（細化）」；第二章章末)：資料與驗證器、擺設深度帶、平台高度 (D10)、2-5 區 validateDial、
// 通關腳本 (印房在正上方：推鉛字盤過「間」的洞 → 墊腳上平台 → 手記 → 鑰匙台 → 章門 = 第二章通關)、帶物轉運 (在別格推過去、轉回第 2 行)、反例、存檔、字條
import { describe, it, expect } from 'vitest';
import { deep } from '../../../src/puzzle/content/levels/ch2/2-5-deep';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH2_ZONE25 } from '../../../src/puzzle/content/cubes/ch2';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { JUMP_V_2D, JUMP_V_3D, GRAVITY } from '../../../src/puzzle/core/constants';
import type { Turn } from '../../../src/puzzle/core/cube';
import { applyChapterCommand, captureState, openChapter, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC: ChapterSpec = { chapter: 2, cube: CH2.cube, rooms: CH2.rooms, doors: chapterDoors(CH2.rooms) };
const def = (id: string): ObjDef => deep.objects.find(o => o.id === id)!;
const PARTS = { 'key.bow': 1, 'tooth.shelf': 1, 'tooth.reading': 1, 'tooth.manuscripts': 1 };
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');

function pump(cs: ChapterSession): { cs: ChapterSession; kinds: string[] } {
  const kinds: string[] = [];
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    const r = applyChapterEvent(cs, e, OPTS);
    kinds.push(r.kind);
    if (r.kind === 'enter') return { cs: r.next, kinds };
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return { cs, kinds };
}
const play = (cs: ChapterSession, cmds: Cmd[]) => { runScript(cs.world, cmds); return pump(cs); };
function turns(cs: ChapterSession, ts: Turn[]): ChapterSession {
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  for (const t of ts) { const r = applyChapterCommand(cs, { t: 'turn', turn: t }); if ('blocked' in r) throw new Error(`${t.group} ${t.dir}: ${r.blocked}`); cs = r; }
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
}
const T = (group: string, dir: 1 | -1 = 1): Turn => ({ group, dir });

// ── 路線 ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-6.5, -2.4] }, { act: 'interact' }];
const DOOR = (x: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [x, null] }, { act: 'interact' }];
const lane = (x: number, z: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [x, null] }, { walkTo: [null, z] }];
const PLATE: Cmd[] = [...lane(-3.2, -3.6), { act: 'interact' }, ...lane(-2.6, -2.2), { act: 'flip' }, { wait: 0.15 }, { act: 'interact' },
  { hold: { commands: [{ t: 'card', label: 'plate:print', card: 'card.ri' }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }];
/** 印房：鉛字盤 (4.0, 2.4) 往西推到拱門前 (x −2.6)，再往南推進南拱門 (前緣) */
const PUSH_TRAY: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 1.2] }, { walkTo: [5.4, null] }, { walkTo: [null, 2.4] }, { walkTo: [-1.7, null] },
  { walkTo: [null, 1.0] }, { walkTo: [-2.6, null] }, { walkTo: [null, 4.2] }];
const ARCH_S: Cmd[] = [{ wait: 0.1 }, { walkTo: [-2.6, null] }, { walkTo: [null, 3.9] }, { act: 'interact' }];
/** 書房深處：(鑰匙台前) 繞到鉛字盤北側 → 往南推到 z 0 → 繞到西側往東推到平台西緣 */
const TRAY_TO_LANDING: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, -3.9] }, { walkTo: [0, null] }, { walkTo: [null, -0.9] }, { walkTo: [-1.4, null] }, { walkTo: [null, 0] }, { walkTo: [1.9, null] }];
const CLIMB: Cmd[] = [{ hop: 1, until: w => w.player.onGround && w.player.y > 0.99 }, { wait: 0.2 }, { hop: 1, until: w => w.player.onGround && w.player.y > 1.99 }, { wait: 0.2 }];
const DIARY: Cmd[] = [{ walkTo: [4.4, -0.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('diary'), label: '手記' }, { act: 'interact' }];
const CHAPTER_DOOR: Cmd[] = [{ walkTo: [5.0, 0] }, { expect: w => expect(findTarget(w)?.def.id).toBe('chapterE'), label: '章門' }, { act: 'interact' }];
const BENCH: Cmd[] = [{ wait: 0.1 }, { walkTo: [-2.6, -3.3] }, { expect: w => expect(findTarget(w)?.def.id).toBe('keyBench'), label: '鑰匙台' }, { act: 'interact' }];

/** 開章 (帶著柄與三枚齒；前四關的成果) → 啟動 → 上列 ◀ → 印房 → 2-3a 門牌「間」 */
function printWithJian(): ChapterSession {
  const st = chapterStart(defaultSave(), SPEC, CH2.start);
  let cs = openChapter(SPEC, { ...st, items: { ...PARTS } }, OPTS);
  cs = play(cs, ACTIVATE).cs;
  cs = turns(cs, [T('row0', -1)]);
  cs = play(cs, DOOR(-9.3)).cs;
  expect(cs.state.room).toBe('print');
  cs = play(cs, PLATE).cs;
  expect(cs.world.ext.cube!.links.archS).toEqual({ to: 'room', room: 'manuscripts', door: 'doorN', kind: 'door' });
  return cs;
}
/** 推鉛字盤過南拱門 → 跟著穿過去 */
function trayIntoDeep(cs: ChapterSession): ChapterSession {
  let r = play(cs, PUSH_TRAY);
  expect([r.kinds, r.cs.state.moved.tray.room, Math.round(r.cs.state.moved.tray.z * 100) / 100]).toEqual([['state'], 'deep', -2.7]);
  r = play(r.cs, ARCH_S);
  expect([r.cs.state.room, r.cs.state.door]).toEqual(['deep', 'holeN']);
  return r.cs;
}
function finish(cs: ChapterSession): ChapterSession {
  let r = play(cs, BENCH);
  expect([hasItem(r.cs.world, 'key.study'), hasItem(r.cs.world, 'tooth.shelf'), r.cs.world.msg]).toEqual([true, false, '柄和三枚齒卡在一起，喀的一聲。是一把房間的銅鑰匙。']);
  r = play(r.cs, TRAY_TO_LANDING);
  expect(get(r.cs, 'tray').x).toBeCloseTo(2.8, 1);
  runScript(r.cs.world, CLIMB);
  r = play(r.cs, DIARY);
  expect([hasItem(r.cs.world, 'diary.2'), r.cs.world.msg]).toEqual([true, '許問津的手記，第二頁：「門是字，字是門。」']);
  runScript(r.cs.world, CHAPTER_DOOR);
  expect([r.cs.world.cleared, get(r.cs, 'chapterE').used, r.cs.world.msg]).toEqual([true, true, '門開了。外面的走廊，飄來泥土的味道。']);
  return r.cs;
}

describe('2-5 書房深處：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 2-5；登錄表 2-5 前置 2-4；第二章五關齊；章門 = key.study、刻著老宅圖', () => {
    expect(validateLevel(deep, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('2-5')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(deep.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['2-5 刻著同一個圖案']);
    const e = levelById('2-5')!;
    expect([e.chapter, e.unlock.after, CH2.levels['2-5'], cubeChapterOf('2-5'), CHAPTERS.find(c => c.id === 2)!.levels]).toEqual([2, ['2-4'], 'deep', CH2, ['2-1', '2-2', '2-3', '2-4', '2-5']]);
    const E = def('chapterE');
    expect(E.type === 'cubeDoor' && [E.kind, E.key, E.y, !!E.carving, E.doneFlag]).toEqual(['chapter', 'key.study', 2, true, '2-5']);
    expect([TEXT(deep.narrationKey), TEXT(deep.nextKey)]).toEqual(['最後一扇門上，刻著同一個圖案。', '書房和溫室，在牆後換了位置。第三章　溫室——還在路上。']);
  });

  it('擺設三帶；平台高度 (D10)：實景跳 1.25 / 藏寶圖跳 1.6 都 < 2.0；鉛字盤 1.0 + 1.25 ≥ 2.0 (餘裕 ≥ 0.15)；房裡沒有其他可推 / 可站的東西', () => {
    expect(layoutDepthIssues(deep)).toEqual([]);
    const h3 = JUMP_V_3D ** 2 / (2 * GRAVITY), h2 = JUMP_V_2D ** 2 / (2 * GRAVITY);
    const landing = def('landing').h;
    const tray = CH2.rooms.print.objects.find(o => o.id === 'tray')!;
    expect([h3 < landing, h2 < landing, tray.h + h3 - landing >= 0.15]).toEqual([true, true, true]);
    expect(deep.objects.filter(o => o.pushable || (o.solid && o.type !== 'floor' && o.type !== 'landing'))).toEqual([]);
  });
});

describe('validateDial：2-5 區', () => {
  const m = { ...dialModelOf(CH2_ZONE25.cube, CH2.rooms, CH2_ZONE25.puzzles, CH2_ZONE25.start, CH2_ZONE25.finish), plates: CH2_ZONE25.plates };
  const r = validateDial(m);
  it('可達排列 720、抽象狀態 113,942、有解、卡死 0 (含 R)；無問題', () => {
    expect([r.arrangements, r.states, r.solvable, r.deadlocks, r.needsRestart]).toEqual([720, 113942, true, [], 8927]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
  });
  it('2-5.tray (把印房轉到書房深處正上方)：最短 1、次短 2、本質不同 120 (列先 / 行先都行)；拿掉門牌 → 無解 (P7)', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.issues])).toEqual([
      ['2-1a', 1, 2, 3, 3, []], ['2-3a', 1, 1, 2, 2, []], ['2-5.tray', 1, 2, 338, 120, []], ['2-5', 0, null, 1, 1, []]
    ]);
    expect(validateDial({ ...m, plates: [] }).solvable).toBe(false);
  });
});

describe('通關腳本 (runScript)', () => {
  it('解法一：上列 ▶ (印房回到書房深處正上方) → 推鉛字盤過「間」的洞 → 鑰匙台組裝 → 墊腳上平台 → 手記第二頁 → 章門 = 第二章通關', () => {
    let cs = turns(printWithJian(), [T('row0', 1)]);
    expect([pos(cs, 'print'), pos(cs, 'deep'), cs.world.ext.cube!.links.archS]).toEqual(['20', '21', { to: 'room', room: 'deep', door: 'holeN', kind: 'arch' }]);
    cs = finish(trayIntoDeep(cs));
    const save = recordClear({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4'] }, '2-5', cs.world, Object.keys(CH2.levels));
    expect([save.cleared.includes('2-5'), save.diary]).toEqual([true, [2]]);
    expect(nextAfterClear('2-5', 'chapter', CHAPTERS)).toBe(null); // 第三章尚未製作：通關畫面沒有「前往」
  });

  it('解法二 (帶物轉運)：印房在第 1 行時正下方是手稿庫 (門，推不過)；下列 ◀ 讓書房深處來到印房正下方 → 推過去 → 下列 ▶ 帶著鉛字盤回到第 2 行', () => {
    // 印房在第 1 行 (正下方 = 手稿庫，有北門 → 一般門，推不過)；第 1 行 ⇅ + 下列 ◀ → 書房深處到印房正下方 (第 1 行)
    let cs = printWithJian();
    runScript(cs.world, PUSH_TRAY);
    expect(cs.world.msgKey).toBe('msg.cube.doorOnly'); // 對面是門 (手稿庫北門)：只有人過得去
    cs = pump(cs).cs;
    runScript(cs.world, [{ act: 'reset' }, { wait: 0.1 }]); // T：鉛字盤回到進房時的位置 (拱門口卡著時轉不動)
    cs = { ...cs, state: { ...cs.state, unlocked: [...(cs.state.unlocked ?? []), 'row1'] } }; // 2-1a 已完成 (下列的鎖扣)
    cs = turns(cs, [T('row1', -1)]);
    expect([pos(cs, 'print'), pos(cs, 'deep'), cs.world.ext.cube!.links.archS]).toEqual(['10', '11', { to: 'room', room: 'deep', door: 'holeN', kind: 'arch' }]);
    cs = trayIntoDeep(cs);
    // 書房深處在第 1 行：章門接不到屋框 (門後是牆) → 帶著鉛字盤轉回第 2 行 (下列 ▶)
    cs = turns(cs, [T('row1', 1)]);
    expect([pos(cs, 'deep'), cs.world.byId.has('tray')]).toEqual(['21', true]);
    finish(cs);
  });
});

describe('反例', () => {
  it('沒有墊腳：兩個視角都跳不上平台；章門沒有鑰匙 = 鎖著；鑰匙台缺件時說缺什麼', () => {
    const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'deep', door: 'doorW' }), OPTS);
    runScript(cs.world, [{ walkTo: [2.8, 0] }, { hop: 1, until: w => w.player.y > 1.99, seconds: 3, optional: true }, { wait: 1 }]);
    expect(cs.world.player.y).toBeLessThan(0.5);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { hop: 1, until: w => w.player.y > 1.99, seconds: 3, optional: true }, { wait: 1 }]);
    expect(cs.world.player.y).toBeLessThan(0.5);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, ...BENCH]);
    expect(cs.world.msg).toBe('鑰匙台上有一個柄的凹槽、三個齒的凹槽。還缺：銅鑰匙的柄、銅鑰匙的齒・一、銅鑰匙的齒・二、銅鑰匙的齒・三。');
    cs.world.player.y = 2; cs.world.player.x = 5.0; cs.world.player.z = 0;
    runScript(cs.world, [{ wait: 0.2 }, { act: 'interact' }]);
    expect([cs.world.cleared, cs.world.msgKey]).toEqual([false, 'msg.cube.chapterLocked']);
  });

  it('門牌不是「間」(取下「日」)：書房深處北牆沒有洞，鉛字盤推進拱門 → 「對面是牆」', () => {
    let cs = turns(printWithJian(), [T('row0', 1)]);
    cs = play(cs, [...lane(-2.6, -2.2), { act: 'flip' }, { wait: 0.15 }, { hold: { commands: [{ t: 'uncard', label: 'plate:print', card: 'card.ri' }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }]).cs;
    expect(cs.world.ext.cube!.links.archS).toEqual({ to: 'wall' });
    runScript(cs.world, PUSH_TRAY);
    expect([cs.world.msgKey, cs.world.byId.has('tray')]).toEqual(['msg.cube.archWall', true]);
  });

  it('存檔：鉛字盤在書房深處 (跨房物件) 讀回後照舊在原位', () => {
    const cs = trayIntoDeep(turns(printWithJian(), [T('row0', 1)]));
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['2-4'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH2.start), OPTS);
    expect([back.state.room, Math.round((back.world.byId.get('tray')?.z ?? 0) * 100) / 100, levelState(levelById('2-5')!, { ...defaultSave(), cleared: ['2-4'] })]).toEqual(['deep', -2.7, 'open']);
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = deep.objects.filter(o => o.type === 'note');
describe('2-5 字條：L1 + L2 (上限 2)、量表', () => {
  it('原文；L2 進房 4 分鐘浮現；H1 / H2 / H3 / H4 / H10；間距 ≥ 3', () => {
    expect(notes.map(o => [o.id, noteText(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', '太高了。這次，我的肩膀不在這裡。', undefined], ['noteA2', '墊得起你的東西，此刻在哪裡？', 240]
    ]);
    expect(notes.length).toBeLessThanOrEqual(deep.puzzles!.length + 1);
    for (const o of notes) {
      const t = noteText(o);
      expect([...t].length).toBeLessThanOrEqual(o.id === 'noteA' ? 24 : 30);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
      for (const term of ['轉', '鉛字盤', '印房', '間', '日', '拱門', '平台', '墨', '鎖', '一起', '跟著']) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    expect(Math.abs(notes[1].x - notes[0].x)).toBeGreaterThanOrEqual(3);
    for (const o of notes) {
      const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'deep', door: 'doorW' }), OPTS);
      runScript(cs.world, [{ place: [o.x, 0, o.z - 0.9] }]);
      expect(findTarget(cs.world)?.def.id).toBe(o.id);
      interact(cs.world);
      expect(cs.world.msg).toBe(o.id === 'noteA' ? noteText(o) : TEXT('msg.note.blank'));
    }
  });
});
