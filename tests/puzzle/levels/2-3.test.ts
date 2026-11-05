// 2-3 印房 (規格 6「2-3 印房（細化）」；M1 第二章第三關)：資料與驗證器、擺設深度帶、門牌「間」與洞位、2-3 區 validateDial、
// 通關腳本 (runScript) 兩種解法 (先做 2-1a：2-3b 兩轉；不做 2-1a：2-3b 三轉、只用上列與行)、每題反例、盲轉取樣、R、存檔、進度、字條量表
import { describe, it, expect } from 'vitest';
import { print } from '../../../src/puzzle/content/levels/ch2/2-3-print';
import { manuscripts, mezz } from '../../../src/puzzle/content/levels/ch2/rooms';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH2_CUBE, CH2_ZONE23 } from '../../../src/puzzle/content/cubes/ch2';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { cardsOn, labelTarget } from '../../../src/puzzle/mechanics/labels';
import { routeCodes, wheelCode } from '../../../src/puzzle/mechanics/print';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { applyTurn, isBlocked, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, chapterLinks, clearedRooms, openChapter, restartRoom, roomCleared, turnBudgetFor,
  type ChapterSession, type ChapterSpec
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCardTray } from '../../../src/puzzle/app/cardTrayModel';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { LevelObserver, type LevelSnap, type ObjSnap } from '../../../src/puzzle/audio/events';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC: ChapterSpec = { chapter: 2, cube: CH2.cube, rooms: CH2.rooms, doors: chapterDoors(CH2.rooms) };
const def = (id: string): ObjDef => print.objects.find(o => o.id === id)!;
const PLATE = 'plate:print';

const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH2.start), OPTS);
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');

/** 取走事件交給章節層 (同 LevelSession：字卡匣的開匣事件由外殼處理；貼卡成功交給章節層重算門接法)；換房後同批事件丟棄 */
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
function play(cs: ChapterSession, cmds: Cmd[]): { cs: ChapterSession; kinds: string[] } {
  runScript(cs.world, cmds);
  return pump(cs);
}
/** 切到藏寶圖、站穩 → 依序轉 → 切回實景 */
function turns(cs: ChapterSession, ts: Turn[]): ChapterSession {
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  for (const t of ts) {
    const r = applyChapterCommand(cs, { t: 'turn', turn: t });
    if ('blocked' in r) throw new Error(`turn ${t.group} ${t.dir} blocked: ${r.blocked}`);
    cs = r;
  }
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
}
const T = (group: string, dir: 1 | -1 = 1): Turn => ({ group, dir });

// ── 路線 (座標見 2-3-print.ts；手稿庫的字輪見 rooms.ts) ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-6.5, -2.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '魔方儀' }, { act: 'interact' }];
const BOOKEND: Cmd[] = [{ walkTo: [null, -2.4] }, { walkTo: [8.7, null] }, { walkTo: [null, -3.6] }, { act: 'interact' }];
const DOOR = (x: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [x, null] }, { act: 'interact' }];
/** 印房裡沿 z = −2.2 的走道走 (印刷機在 z −1～0.2) */
const lane = (x: number, z: number, target: string): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [x, null] }, { walkTo: [null, z] }, { expect: w => expect(findTarget(w)?.def.id).toBe(target), label: target }];
const CASE: Cmd[] = [...lane(-3.2, -3.6, 'typeCase'), { act: 'interact' }];
const write = (card: string): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [-2.6, null] }, { act: 'flip' }, { wait: 0.15 },
  { expect: w => expect(labelTarget(w)?.def.id).toBe('plateS'), label: '門牌' }, { act: 'interact' },
  { hold: { commands: [{ t: 'card', label: PLATE, card }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }];
const PRESS: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [-1.5, null] }, { walkTo: [null, 1.2] }, { walkTo: [0.2, null] },
  { expect: w => expect(findTarget(w)?.def.id).toBe('press'), label: '印刷機' }, { act: 'interact' }];
/** 印房 → 東門 (從印刷機前繞過鉛字盤) */
const EXIT_E: Cmd[] = [{ wait: 0.1 }, { walkTo: [2.5, null] }, { walkTo: [null, 0] }, { walkTo: [5.3, null] }, { act: 'interact' }];
/** 手稿庫的字輪 i 轉 n 次 */
const spin = (i: number, n: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.4] }, { walkTo: [-4 + i, null] }, { walkTo: [null, -3.0] },
  { expect: w => expect(findTarget(w)?.def.id).toBe(`wheel${i}`), label: `字輪 ${i}` }, ...Array.from({ length: n }, (): Cmd => ({ act: 'interact' }))];
const GLYPH_INDEX: Readonly<Record<string, number>> = { 山: 0, 水: 1, 木: 2, 火: 3 };
const dial = (code: string): Cmd[] => [...code].flatMap((g, i) => spin(i, GLYPH_INDEX[g]));

/** 開章 → 啟動魔方儀 →（上列 dir 一次：印房東門接上迴廊西門）→ 迴廊西門 → 印房 */
function inPrint(dir: 1 | -1, withA: boolean): ChapterSession {
  let r = play(start(), ACTIVATE);
  expect(r.kinds).toEqual(['dial']);
  let cs = turns(r.cs, [T('row0', -1)]);
  if (withA) { r = play(cs, BOOKEND); expect(r.cs.state.unlocked).toEqual(['row1']); cs = r.cs; }
  if (dir === 1) cs = turns(cs, [T('row0', 1), T('row0', 1)]);
  r = play(cs, DOOR(-9.3));
  expect([r.cs.state.room, r.cs.state.door]).toEqual(['print', 'doorE']);
  return r.cs;
}
function solveA(cs: ChapterSession): ChapterSession {
  cs = play(cs, CASE).cs;
  expect(hasItem(cs.world, 'card.ri')).toBe(true);
  const r = play(cs, write('card.ri'));
  expect(r.kinds).toEqual(['state', 'state']); // done (三行解鎖) + 貼卡 (重算門接法)
  expect([get(r.cs, 'plateS').used, cardsOn(r.cs.world, PLATE), r.cs.state.unlocked]).toEqual([true, ['card.ri'], expect.arrayContaining(['col0', 'col1', 'col2'])]);
  return r.cs;
}
function solveB(cs: ChapterSession, ts: Turn[]): ChapterSession {
  cs = turns(cs, ts);
  const r = play(cs, PRESS);
  expect([r.kinds, get(r.cs, 'press').used, hasItem(r.cs.world, 'proof')]).toEqual([['state'], true, true]);
  return r.cs;
}
/** 2-3c：出印房到迴廊 (補墨) → 在迴廊轉出三扇門的路線 → 迴廊西門 → 手稿庫 → 轉字輪 */
function solveC(cs: ChapterSession, ts: Turn[], code: string): ChapterSession {
  let r = play(cs, EXIT_E);
  expect(r.cs.state.room).toBe('shelf');
  cs = turns(r.cs, ts);
  r = play(cs, DOOR(-9.3));
  expect(r.cs.state.room).toBe('manuscripts');
  expect(routeCodes(r.cs.world, 'print', 'manuscripts', 3).map(c => c.map(k => TEXT(k)).join(''))).toContain(code);
  r = play(r.cs, dial(code));
  expect([r.kinds, get(r.cs, 'typeLock').used, hasItem(r.cs.world, 'key.bow')]).toEqual([['state'], true, true]);
  return r.cs;
}

describe('2-3 印房：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 2-3a～2-3c；登錄表 2-3 前置 2-2；預算 6、2-3b 為 3', () => {
    expect(validateLevel(print, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('2-3')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(print.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['2-3a 門裡多一個日', '2-3b 墨只夠三次', '2-3c 沿路的符號']);
    const e = levelById('2-3')!;
    expect([e.chapter, e.unlock.after, e.abilities, print.turnBudget, print.theme]).toEqual([2, ['2-2'], ['nib'], { base: 6, puzzles: { '2-3b': 3 } }, 'study']);
    expect([CH2.levels['2-3'], cubeChapterOf('2-3'), CHAPTERS.find(c => c.id === 2)!.levels.slice(0, 3)]).toEqual(['print', CH2, ['2-1', '2-2', '2-3']]);
    expect([TEXT(print.narrationKey), TEXT(print.nextKey)]).toEqual(['一盤活字，每個字都缺了一角。', '印好的那張紙上，只有一行字：門後有人。']);
    expect([def('plateS').doneFlag, def('press').doneFlag, manuscripts.objects.find(o => o.id === 'typeLock')!.doneFlag]).toEqual(['2-3a', '2-3b', '2-3c']);
  });

  it('擺設規則：可互動物件同時落在後 / 中 / 前三帶 (layoutDepthIssues)；反例：全部推到後牆 → 報出缺的兩帶', () => {
    expect(layoutDepthIssues(print)).toEqual([]);
    const flat = { ...print, objects: print.objects.map(o => (o.interactable || o.label ? { ...o, z: -4 } : o)) };
    expect(layoutDepthIssues(flat).map(i => [i.code, i.message.split(' ')[5]])).toEqual([['layout.depth', 'mid'], ['layout.depth', 'front']]);
  });

  it('門旁的活字 (2-3c)：每扇非章門的門都刻了字；洞位不刻；印房南拱門有門牌', () => {
    const glyphs = SPEC.doors.filter(d => d.kind !== 'chapter' && !d.hole).map(d => `${d.room}.${d.door}:${TEXT(d.glyph ?? '')}`);
    expect(glyphs).toEqual(['shelf.doorW:木', 'shelf.doorE:山', 'reading.doorW:水', 'reading.doorS:火', 'print.doorE:山', 'print.archS:水', 'mezz.doorW:火', 'manuscripts.doorN:木', 'manuscripts.doorE:水', 'deep.doorW:山']);
    expect(SPEC.doors.filter(d => d.hole).every(d => d.glyph === undefined)).toBe(true);
  });
});

describe('門牌「間」與洞位', () => {
  it('貼「日」之前：南拱門正對沒有北門的房 = 門後是牆；正對手稿庫北門 = 一般接通 (kind door)', () => {
    let cs = inPrint(1, false); // 上列 ▶：印房在第 0 行，正下方是夾層
    expect([pos(cs, 'print'), cs.world.ext.cube!.links.archS]).toEqual(['00', { to: 'wall' }]);
    const s = applyTurn(CH2_CUBE, cs.state.cube!, T('row0', 1)) as CubeState; // 印房到第 1 行：正下方是手稿庫
    expect(chapterLinks(SPEC, s, {}).find(l => l.from.door === 'archS')).toEqual({ from: { room: 'print', door: 'archS' }, to: { room: 'manuscripts', door: 'doorN' }, kind: 'door' });
    cs = solveA(cs);
    // 「間」：夾層北牆開洞 (拱門形，兩邊都能穿過)；取下「日」→ 洞消失、旗標不退
    expect(cs.world.ext.cube!.links.archS).toEqual({ to: 'room', room: 'mezz', door: 'holeN', kind: 'arch' });
    expect(deriveCardTray(cs.world, TEXT, 0)).toBe(null);
    runScript(cs.world, [{ walkTo: [-2.6, null] }, { act: 'flip' }, { wait: 0.15 }]);
    expect(deriveCardTray(cs.world, TEXT, 0)!.title).toBe('間');
    cs = play(cs, [{ hold: { commands: [{ t: 'uncard', label: PLATE, card: 'card.ri' }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }]).cs;
    expect([cs.world.ext.cube!.links.archS, get(cs, 'plateS').used, hasItem(cs.world, 'card.ri')]).toEqual([{ to: 'wall' }, true, true]);
  });

  it('穿過洞：印房 → 夾層——洞的到達處被後面那面書櫃堵住 (H1)；量小之後進到後面 (洞位在場、北牆中點)，從洞回到印房南拱門內側；洞在別的時候不在場', () => {
    let cs = solveA(inPrint(1, false));
    const TO_ARCH: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 3.6] }, { walkTo: [-2.6, null] }, { walkTo: [null, 3.9] }, { act: 'interact' }];
    let r = play(cs, TO_ARCH);
    // 書櫃原尺寸：到達處 (0, −3.7) 被占住 → 不換房、說書櫃的 blockText
    expect([r.kinds, r.cs.state.room, r.cs.world.msgKey]).toEqual([['blocked'], 'print', 'lvl.H1.shelf.block']);
    // 量小之後 (書櫃標籤貼著「小」；H1 的前廳那一步)：到達處讓開 → 進到後面
    cs = r.cs;
    cs.world.ext = { ...cs.world.ext, labels: { ...cs.world.ext.labels, 'scale:innerShelf': ['card.xiao'] } };
    r = play(cs, TO_ARCH);
    expect([r.kinds, r.cs.state.room, r.cs.state.door]).toEqual([['enter'], 'mezz', 'holeN']);
    const hole = get(r.cs, 'holeN');
    expect([isActiveIn(r.cs.world, hole, '3d'), hole.def.x, hole.def.z, r.cs.world.player.z > -4, r.cs.world.player.z < -3.0]).toEqual([true, 0, -4.8, true, true]);
    r = play(r.cs, [{ wait: 0.1 }, { walkTo: [null, -4.4] }, { act: 'interact' }]);
    expect([r.cs.state.room, r.cs.state.door]).toEqual(['print', 'archS']);
    cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'mezz', door: null }), OPTS);
    expect(isActiveIn(cs.world, get(cs, 'holeN'), '3d')).toBe(false);
  });

  it('其他部件卡貼在門牌上無效 (「才」→「閉」：字顫動、卡片退回)；門牌只在藏寶圖、活字架只在實景', () => {
    let cs = inPrint(1, false);
    cs.world.inv['card.cai'] = 1;
    cs = play(cs, write('card.cai')).cs;
    expect([cs.world.msgKey, get(cs, 'plateS').used, hasItem(cs.world, 'card.cai'), cs.world.ext.cube!.links.archS]).toEqual(['msg.label.invalid', false, true, { to: 'wall' }]);
    expect([isActiveIn(cs.world, get(cs, 'plateS'), '3d'), isActiveIn(cs.world, get(cs, 'plateS'), '2d')]).toEqual([false, true]);
    runScript(cs.world, [...lane(-3.2, -3.6, 'typeCase'), { act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect(hasItem(cs.world, 'card.ri')).toBe(false);
  });
});

describe('validateDial：2-3 區 (兩列 + 三行；門牌以 plates 表示；夾層的後面以 areas 表示)', () => {
  const m = { ...dialModelOf(CH2_ZONE23.cube, CH2.rooms, CH2_ZONE23.puzzles, CH2_ZONE23.start, CH2_ZONE23.finish, { areas: CH2_ZONE23.areas }), plates: CH2_ZONE23.plates };
  const r = validateDial(m);

  it('可達排列 720、抽象狀態 107,246 (H1 之前 108,098：夾層不再是「洞 ↔ 西門」穿得過去的房)、有解、卡死 0 (含 R)；鎖扣 / 入口 / 前置繞過無問題', () => {
    expect([r.arrangements, r.states, r.solvable, r.deadlocks, r.needsRestart]).toEqual([720, 107246, true, [], 9892]);
    expect([r.issues, r.lockIssues, r.entryIssues]).toEqual([[], [], []]);
  });

  it('每題最短 / 次短 / 解法數：2-3a 1 (上列 ▶ 或 ◀)；2-3b 最短 2 = 預算 3 − 1；2-3c 最短 3、次短 4、本質不同 27；確定性', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues])).toEqual([
      ['2-1a', 1, 2, 3, 3, 6, []], ['2-3a', 1, 1, 2, 2, 6, []], ['2-3b', 2, 3, 3, 3, 3, []], ['2-3c', 3, 4, 66, 27, 6, []]
    ]);
    expect(validateDial(m)).toEqual(r);
  });

  it('⑥ 預算繞過 (已知項目，規格 2-3「預算繞過」待決)：在鄰房排好再走進印房即可 0 轉完成', () => {
    expect(r.budgetBypass).toEqual(['2-3b: doable with < 2 turns per visit to print (refill by changing rooms)']);
  });

  it('拿掉門牌 (不寫「間」) → 2-3b 無解 (閱覽室沒有北門)；拿掉三行 → 2-3b 無解 (閱覽室到不了下列)', () => {
    expect(validateDial({ ...m, plates: [] }).solvable).toBe(false);
    const noCol = { ...m, cube: { ...m.cube, dial: { ...m.cube.dial!, groups: m.cube.dial!.groups.filter(g => g.kind === 'row') } } };
    expect(validateDial(noCol).solvable).toBe(false);
  });
});

describe('通關腳本 (runScript) 與多解', () => {
  it('解法一 (先做 2-1a)：活字架「日」→ 門牌「間」→ 第 0 行 ⇅ + 上列 ◀ (兩轉) 壓版 → 迴廊轉 下列 ◀ + 第 1 行 ⇅ + 上列 ◀ → 手稿庫 字輪「水水木」→ 2-3 通關', () => {
    let cs = solveA(inPrint(-1, true));
    expect(cs.state.turns!.left).toBe(3);
    cs = solveB(cs, [T('col0'), T('row0', -1)]);
    expect([cs.state.turns!.left, turnBudgetFor(SPEC, cs.state, cs.world)]).toEqual([1, 6]);
    cs = solveC(cs, [T('row1', -1), T('col1'), T('row0', -1)], '水水木');
    expect(clearedRooms(SPEC, cs.state, cs.world)).toContain('print'); // 2-3c 在手稿庫完成 → 印房通關
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(false);          // 手稿庫本身沒有題
    expect(cs.world.msg).toBe('三個字對上了。排字架的抽屜滑開，裡面是一枝銅鑰匙的柄。');
  });

  it('解法二 (不做 2-1a：下列鎖著)：2-3b 用上列 ◀ + 第 1 行 ⇅ + 上列 ◀ (三轉，墨剛好用完)；2-3c 轉 第 0 行 + 上列 ◀ + 第 1 行 + 上列 ◀ → 「水山木」', () => {
    let cs = solveA(inPrint(1, false));
    cs = solveB(cs, [T('row0', -1), T('col1'), T('row0', -1)]);
    expect(cs.state.turns!.left).toBe(0);
    cs = solveC(cs, [T('col0'), T('row0', -1), T('col1'), T('row0', -1)], '水山木');
    expect(cs.state.unlocked).not.toContain('row1');
  });

  it('另一種 2-3b 兩轉解 (第 0 行 ⇅ + 下列 ▶)；確定性：同一輸入兩次執行章節狀態相同', () => {
    const cs = solveB(solveA(inPrint(-1, true)), [T('col0'), T('row1', 1)]);
    expect([pos(cs, 'print'), pos(cs, 'reading'), pos(cs, 'shelf')]).toEqual(['10', '11', '20']);
    const a = captureState(solveB(solveA(inPrint(-1, true)), [T('col0'), T('row0', -1)]));
    const b = captureState(solveB(solveA(inPrint(-1, true)), [T('col0'), T('row0', -1)]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('2-3b 墨只夠三次 (P4)：反例', () => {
  it('條件不成立時壓不下版 (只接上一條)；墨 3 滴用完 → 墨乾了 (回退仍可用、不耗墨)；R 回滿 3 滴', () => {
    let cs = solveA(inPrint(-1, true));
    runScript(cs.world, PRESS);
    expect([get(cs, 'press').used, cs.world.msgKey]).toEqual([false, 'lvl.2-3.press.loose']);
    cs = turns(cs, [T('row0', 1), T('row0', 1), T('row0', 1)]);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(applyChapterCommand(cs, { t: 'turn', turn: T('col0') })).toEqual({ blocked: 'noInk' });
    const back = applyChapterCommand(cs, { t: 'undo' });
    expect('blocked' in back ? back.blocked : back.state.turns!.left).toBe(1);
    cs = restartRoom(cs, OPTS);
    expect(cs.state.turns).toEqual({ left: 3, undo: [] });
  });

  it('盲轉取樣：從 2-3a 剛完成的狀態，所有 3 步轉動序列 (7³ = 343) 只有 < 3% 壓得下版', () => {
    const cs = solveA(inPrint(-1, true));
    const opts = CH2_CUBE.dial!.groups.flatMap(g => turnDirs(CH2_CUBE, g.id).map(dir => ({ group: g.id, dir })));
    const labels = cs.world.ext.labels!;
    const ok = (s: CubeState) => { const ls = chapterLinks(SPEC, s, labels); const to = (d: string) => { const l = ls.find(k => k.from.room === 'print' && k.from.door === d); return l && 'room' in l.to ? l.to.room : null; }; return to('doorE') === 'shelf' && to('archS') === 'reading'; };
    let hit = 0, all = 0;
    const rec = (s: CubeState, n: number) => { if (n === 3) { all++; if (ok(s)) hit++; return; } for (const o of opts) { const r = applyTurn(CH2_CUBE, s, o); if (!isBlocked(r)) rec(r, n + 1); } };
    rec(cs.state.cube!, 0);
    expect(all).toBe(343);
    expect(hit / all).toBeLessThan(0.03);
  });
});

describe('2-3c 沿路的符號 (P11)：反例', () => {
  it('密碼跟著排列變：同一組字在另一種排列下打不開；從手稿庫往回讀 (反序) 打不開', () => {
    let cs = solveB(solveA(inPrint(-1, true)), [T('col0'), T('row0', -1)]);
    cs = play(cs, EXIT_E).cs;
    cs = turns(cs, [T('row1', -1), T('col1'), T('row0', -1)]);
    cs = play(cs, DOOR(-9.3)).cs;
    expect(routeCodes(cs.world, 'print', 'manuscripts', 3).map(c => c.map(k => TEXT(k)).join(''))).toEqual(['水水木']);
    cs = play(cs, dial('木水水')).cs;
    expect([wheelCode(cs.world, get(cs, 'typeLock')).map(k => TEXT(k)).join(''), get(cs, 'typeLock').used]).toEqual(['木水水', false]);
    // 換一種排列 (下列 ▶)：路線斷了 → 「水水木」也不成立
    cs = turns(cs, [T('row1', 1)]);
    expect(routeCodes(cs.world, 'print', 'manuscripts', 3)).toEqual([]);
    runScript(cs.world, spin(2, 4));
    expect(get(cs, 'typeLock').used).toBe(false);
  });

  it('沒有校樣：字輪轉不動 (「排字架上空著三格。不知道要排什麼。」)；字輪只在實景轉得動', () => {
    const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'manuscripts', door: 'doorE' }), OPTS);
    runScript(cs.world, spin(0, 1));
    expect([cs.world.msg, get(cs, 'wheel0').used]).toEqual(['排字架上空著三格。不知道要排什麼。', false]);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(findTarget(cs.world)).toBe(null);
  });
});

describe('R、存檔 v3、進度、音效', () => {
  it('R：門牌、部件卡、活字架、三行鎖扣、墨都回到進房時；魔方儀維持啟動', () => {
    let cs = solveA(inPrint(1, false));
    cs = restartRoom(cs, OPTS);
    expect([get(cs, 'plateS').used, get(cs, 'typeCase').used, hasItem(cs.world, 'card.ri'), cardsOn(cs.world, PLATE), cs.state.unlocked ?? [], cs.state.turns, cs.state.dial, cs.world.ext.cube!.links.archS])
      .toEqual([false, false, false, [], [], { left: 3, undo: [] }, true, { to: 'wall' }]);
  });

  it('存檔：寫入 → 讀回 → 開章：門牌上的「日」、洞的接法、校樣、字輪照舊', () => {
    const cs = solveB(solveA(inPrint(-1, true)), [T('col0'), T('row0', -1)]);
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1', '2-2'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH2.start), OPTS);
    expect([back.state.room, cardsOn(back.world, PLATE), back.world.ext.cube!.links.archS, hasItem(back.world, 'proof'), get(back, 'press').used])
      .toEqual(['print', ['card.ri'], { to: 'room', room: 'reading', door: 'holeN', kind: 'arch' }, true, true]);
  });

  it('2-3 在 2-2 通關後開放；通關記 2-3、「繼續」回到 2-3', () => {
    const s = (cleared: string[]) => ({ ...defaultSave(), cleared });
    const e = levelById('2-3')!;
    expect([levelState(e, s(['1-1', '1-2', '1-3', '2-1'])), levelState(e, s(['1-1', '1-2', '1-3', '2-1', '2-2']))]).toEqual(['locked', 'open']);
    const cs = solveA(inPrint(1, false));
    expect(recordClear(s(['2-2']), '2-3', cs.world, []).cleared).toEqual(['2-2', '2-3']);
    expect(nextAfterClear('2-3', 'room', CHAPTERS)).toBe('2-3');
  });

  it('音效 (audio/events)：活字架 / 排字架打開、印刷機壓版、字輪換字 (兩向)、推鉛字盤', () => {
    const obj = (id: string, type: string, used = false, extra: Partial<ObjSnap> = {}): ObjSnap => ({ id, type, used, gone: false, x: 0, z: 0, ...extra });
    const snap = (objs: ObjSnap[]): LevelSnap => ({ world: OPTS, room: 'print', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: null, mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: '' });
    const o = new LevelObserver();
    o.update(snap([obj('c', 'typeCase'), obj('p', 'press'), obj('w', 'typeWheel'), obj('l', 'typeLock')]));
    const ids = (a: ReturnType<LevelObserver['update']>) => a.map(x => (x.kind === 'sfx' ? x.id : x.kind));
    expect(ids(o.update(snap([obj('c', 'typeCase', true), obj('p', 'press', true), obj('w', 'typeWheel', true), obj('l', 'typeLock', true)])))).toEqual(['sfx.drawer.open', 'sfx.lever.pull', 'sfx.cord.pull', 'sfx.drawer.open']);
    expect(ids(o.update(snap([obj('c', 'typeCase', true), obj('p', 'press', true), obj('w', 'typeWheel', false), obj('l', 'typeLock', true)])))).toEqual(['sfx.cord.pull']);
  });
});

// ── 字條 (規格 7.1.1 H1～H10、7.1.3；story-bible 7.3 的 2-3 版本) ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = print.objects.filter(o => o.type === 'note');
const CUBE_AHA = ['轉', '魔方', '排列', '滑', '對齊', '跟著', '一起', '整列', '整行', '墨', '鎖'];
const PUZZLES = [
  { id: '2-3a', difficulty: 5, notes: ['noteA'], keyObjects: ['typeCase', 'plateS', 'archS'], ahaTerms: ['字', '寫', '改', '日', '間', '門', '牌', '部件', '貼'], area: [-6, -1] as const },
  { id: '2-3b', difficulty: 5.5, notes: ['noteB'], keyObjects: ['press', 'doorE', 'archS'], ahaTerms: [...CUBE_AHA, '迴廊', '閱覽室', '接', '三', '兩'], area: [-1, 2] as const },
  { id: '2-3c', difficulty: 5.5, notes: ['noteC'], keyObjects: ['doorE', 'archS'], ahaTerms: [...CUBE_AHA, '字', '路線', '順序', '密碼', '字輪', '排字'], area: [2, 6] as const }
];

describe('2-3 字條：量表 H1～H4、H9、H10 與預算', () => {
  it('三張字條 = story-bible 7.3 的 2-3 L1 原文 (都一開始就有字)', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual({
      noteA: '缺了一角的東西，我一盒一盒收著。', noteB: '我總是想好了才動手。你總是先動手。', noteC: '出門的時候，我會回頭看一眼門邊。'
    });
    expect(notes.map(o => o.type === 'note' && o.revealAfter)).toEqual([undefined, undefined, undefined]);
  });

  it('H1 ≤ 24；H2 無祈使開頭與禁用動詞；H3 無按鍵名 / 數字；H9 句號 / 問號結尾、無劃線', () => {
    for (const o of notes) {
      const t = noteText(o);
      expect([...t.replace(/\s+/g, '')].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t) || /先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t) || /[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
      expect([t.includes('~~'), /[。？]$/.test(t)]).toEqual([false, true]);
    }
  });

  it('H4 不點名本題關鍵物件；H10 不含 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) { const lk = def(k).labelKey; if (lk) expect([id, k, t.includes(TEXT(lk))]).toEqual([id, k, false]); }
      for (const term of q.ahaTerms) expect([id, term, t.includes(term)]).toEqual([id, term, false]);
    }
  });

  it('預算：每題 L1 一張；總數 3 ≤ 謎題數 + 1；間距 ≥ 3；每張在所屬謎題範圍內、兩模式都讀得到 (且不搶門牌的互動)', () => {
    expect(PUZZLES.map(q => q.id)).toEqual(print.puzzles!.map(q => q.id));
    expect(notes.length).toBeLessThanOrEqual(print.puzzles!.length + 1);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const q of PUZZLES) for (const id of q.notes) expect([id, def(id).x >= q.area[0] && def(id).x <= q.area[1]]).toEqual([id, true]);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'print', door: 'doorE' }), OPTS);
      runScript(cs.world, [{ place: [o.x, 0, o.id === 'noteB' ? o.z - 0.9 : o.z + 0.9], mode }]); // 印刷機背板的字條：站在機器後面讀
      expect([o.id, mode, findTarget(cs.world)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(cs.world);
      expect(cs.world.msg).toBe(noteText(o));
    }
  });
});

describe('夾層 (H1) 與手稿庫：validateLevel 0 issue', () => {
  it('夾層北牆的洞位、手稿庫的排字架與字輪', () => {
    for (const r of [mezz, manuscripts]) expect([r.id, validateLevel(r, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })]).toEqual([r.id, []]);
  });
});
