// 2-2 閱覽室 (規格 6「2-2 閱覽室（細化）」；M1 第二章第二關)：
// 資料與驗證器、2-1 + 2-2 區 validateDial、通關腳本 (runScript：從章門入口啟動魔方儀 → 閱覽室三題全完成)、多解 (下聯「內」/「前」、上列 ▶ / ◀▶)、
// 每題反例 (規格列的錯誤嘗試、兩模式反例)、跨房快照往返、R、存檔 v3 往返、進度解鎖、字條量表與預算
import { describe, it, expect } from 'vitest';
import { reading } from '../../../src/puzzle/content/levels/ch2/2-2-reading';
import { print } from '../../../src/puzzle/content/levels/ch2/rooms';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH2_CUBE, CH2_ZONE22 } from '../../../src/puzzle/content/cubes/ch2';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { canEnterTurnMode } from '../../../src/puzzle/mechanics/dial';
import { accepts, CARDS, cardsOn, missingCardTarget, writableTarget } from '../../../src/puzzle/mechanics/labels';
import { readyRecipe, RECIPES } from '../../../src/puzzle/mechanics/combine';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { initialCube, links } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, clearUndo, openChapter, restartRoom, roomCleared,
  type ChapterSession, type ChapterSpec
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCardTray } from '../../../src/puzzle/app/cardTrayModel';
import { deriveHud } from '../../../src/puzzle/app/hudModel';
import { DEFAULT_BINDINGS } from '../../../src/puzzle/input/bindings';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { isUnlocked, levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC: ChapterSpec = { chapter: 2, cube: CH2.cube, rooms: CH2.rooms, doors: chapterDoors(CH2.rooms) };
const def = (id: string): ObjDef => reading.objects.find(o => o.id === id)!;
const TOOTH = 'tooth.reading';
const LABEL = 'couplet:reading';

const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH2.start), OPTS);
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;

/** 取走事件交給章節層 (同 LevelSession)；換房後同批事件丟棄 */
function pump(cs: ChapterSession): { cs: ChapterSession; kinds: string[] } {
  const kinds: string[] = [];
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen' && e.t !== 'card'); // 字卡匣事件由外殼處理 (LevelSession)
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
/** 切到藏寶圖、站穩 → 依序轉上列 → 切回實景 */
function turnIn2d(cs: ChapterSession, dirs: Array<1 | -1>, group = 'row0'): ChapterSession {
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  for (const dir of dirs) {
    expect(canEnterTurnMode(cs.world)).toBe(true);
    const r = applyChapterCommand(cs, { t: 'turn', turn: { group, dir } });
    if ('blocked' in r) throw new Error(`turn ${group} ${dir} blocked: ${r.blocked}`);
    cs = r;
  }
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
}
const col = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room][0];

// ── 路線 (座標見 2-2-reading.ts) ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-6.5, -2.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '魔方儀' }, { act: 'interact' }];
const DOOR = (x: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [x, null] }, { act: 'interact' }];
const at = (x: number, z: number, target: string): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [x, null] }, { walkTo: [null, z] }, { expect: w => expect(findTarget(w)?.def.id).toBe(target), label: target }];
const TURN_PAGE: Cmd[] = [...at(-1, -0.7, 'book'), { act: 'interact' }];
const BRUSH: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }, { expect: w => expect(findTarget(w)?.def.id).toBe('veil'), label: '淡墨' }, { act: 'interact' }, { act: 'flip' }, { wait: 0.15 }];
const CATALOG: Cmd[] = [...at(12.6, 0.0, 'catalog'), { act: 'interact' }];
const write = (card: string): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [9, null] }, { act: 'flip' }, { wait: 0.15 }, { act: 'interact' },
  { hold: { commands: [{ t: 'card', label: LABEL, card }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }];
const COMBINE: Cmd[] = [{ hold: { commands: [{ t: 'combine' }] }, seconds: 1 / 60 }];
const SPINE: Cmd[] = [...at(3.4, 1.6, 'spine'), { act: 'interact' }];
const LENS: Cmd[] = [...at(2.5, -2.8, 'lens'), { act: 'interact' }];

/** 開章 → 啟動魔方儀 → 2-1 東門 → 閱覽室 */
function inReading(): ChapterSession {
  let r = play(start(), ACTIVATE);
  expect(r.kinds).toEqual(['dial']);
  r = play(r.cs, DOOR(9.3));
  expect([r.kinds, r.cs.state.room, r.cs.state.door]).toEqual([['enter'], 'reading', 'doorW']);
  return r.cs;
}
function solveA(cs: ChapterSession): ChapterSession {
  cs = play(cs, TURN_PAGE).cs;
  const r = play(cs, BRUSH);
  expect([r.kinds, get(r.cs, 'veil').used]).toEqual([['state'], true]);
  return r.cs;
}
function solveB(cs: ChapterSession, card = 'card.nei'): ChapterSession {
  cs = play(cs, CATALOG).cs;
  const r = play(cs, write(card));
  expect(r.kinds).toEqual(['state']);
  expect([get(r.cs, 'lower').used, get(r.cs, 'cabinet').used, hasItem(r.cs.world, 'frame')]).toEqual([true, true, true]);
  return r.cs;
}
/** 2-2c：在閱覽室依 dirs 轉上列 → 經迴廊去印房拿鏡片 → 回閱覽室 (back = 回程前要再轉的) → 合成 → 讀書脊 */
function solveC(cs: ChapterSession, dirs: Array<1 | -1>, back: Array<1 | -1> = []): ChapterSession {
  cs = turnIn2d(cs, dirs);
  let r = play(cs, DOOR(-5.3));
  expect(r.cs.state.room).toBe('shelf');
  r = play(r.cs, DOOR(-9.3));
  expect(r.cs.state.room).toBe('print');
  r = play(r.cs, LENS);
  expect(hasItem(r.cs.world, 'lens')).toBe(true);
  r = play(r.cs, DOOR(5.3));
  expect(r.cs.state.room).toBe('shelf');
  if (back.length) r = { cs: turnIn2d(r.cs, back), kinds: [] };
  r = play(r.cs, DOOR(9.3));
  expect(r.cs.state.room).toBe('reading');
  runScript(r.cs.world, COMBINE);
  expect([hasItem(r.cs.world, 'magnifier'), hasItem(r.cs.world, 'frame'), hasItem(r.cs.world, 'lens')]).toEqual([true, false, false]);
  r = play(r.cs, SPINE);
  expect([r.kinds, hasItem(r.cs.world, TOOTH), get(r.cs, 'spine').used]).toEqual([['state'], true, true]);
  return r.cs;
}

describe('2-2 閱覽室：資料與驗證器', () => {
  it('擺設規則：可互動物件同時落在後 / 中 / 前三帶 (layoutDepthIssues)；書檯 / 閱覽桌 / 目錄櫃離開後牆 (中景)', () => {
    expect(layoutDepthIssues(reading)).toEqual([]);
    const z = (id: string) => reading.objects.find(o => o.id === id)!.z;
    expect(['lectern', 'book', 'table', 'spine', 'catalog', 'noteC'].map(id => z(id) >= -2 && z(id) <= 2)).toEqual(Array(6).fill(true));
    expect([z('cabinet') < -2, z('doorS') > 2]).toEqual([true, true]);
  });

  it('validateLevel / validateEntry 0 issue (2-2、印房)；謎題 2-2a～2-2c；登錄表 2-2 前置 2-1、第二章、能力白名單 = 筆尖；預算 6', () => {
    expect(validateLevel(reading, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateLevel(print, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })).toEqual([]);
    expect(validateEntry(levelById('2-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(reading.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['2-2a 塗過才看得見', '2-2b 下聯', '2-2c 放大鏡']);
    const e = levelById('2-2')!;
    expect([e.chapter, e.unlock.after, e.abilities, reading.turnBudget, reading.theme]).toEqual([2, ['2-1'], ['nib'], { base: 6 }, 'study']);
    expect([CH2.levels['2-2'], cubeChapterOf('2-2')]).toEqual(['reading', CH2]);
  });

  it('門位與占位版相同 (西門 x=-5.8、南門前緣只在 3D)；S0：西門 ↔ 2-1 東門、南門 ↔ 2-4 北門；印房孤立、任一次上列轉動後接上 2-1 西門', () => {
    expect(['doorW', 'doorS'].map(id => [def(id).x, def(id).type === 'cubeDoor' && def(id).side, def(id).visible])).toEqual([[-5.8, 'W', 'both'], [-1.5, 'S', '3d']]);
    const s0 = links(CH2_CUBE, initialCube(CH2_CUBE), SPEC.doors).filter(l => l.from.room === 'reading' || l.from.room === 'print').map(l => `${l.from.room}.${l.from.door}→${'room' in l.to ? `${l.to.room}.${l.to.door}` : l.to.frame}`);
    expect(s0).toEqual(['reading.doorW→shelf.doorE', 'reading.doorS→manuscripts.doorN']);
  });

  it('開場旁白 / 通關文字 (story-bible 7.3)；物件與模型一致：淡墨 doneFlag 2-2a、下聯 2-2b、書脊 2-2c', () => {
    expect([TEXT(reading.narrationKey), TEXT(reading.nextKey)]).toEqual(['桌上攤著一本只寫了開頭的書。', '書的下一頁，有人接著寫了一句。']);
    expect([def('veil').doneFlag, def('lower').doneFlag, def('spine').doneFlag]).toEqual(['2-2a', '2-2b', '2-2c']);
    expect(RECIPES).toEqual([
      { parts: ['frame', 'lens'], out: 'magnifier', text: 'msg.combine.magnifier' },
      // 5-3 西窗 (第五章；合成台 = 爸爸的書桌)
      { parts: ['ink.father', 'parchment'], out: 'page.blank', text: 'msg.combine.page', station: 'writingDesk', stationText: 'msg.combine.noDesk' }
    ]);
  });
});

describe('validateDial：2-1 + 2-2 區 (兩列；三行的解鎖在 2-3 區)', () => {
  const m = dialModelOf(CH2_ZONE22.cube, CH2.rooms, CH2_ZONE22.puzzles, CH2_ZONE22.start, CH2_ZONE22.finish);
  const r = validateDial(m);

  it('可達排列 9、抽象狀態 18,788、有解、卡死 0 (含 R)；沒有任何問題 (預算繞過、鎖扣、入口、前置繞過)', () => {
    // 2-3 起印房多了南拱門 (印房在第 1 行時接手稿庫北門)：狀態 18,676 → 18,788、needsRestart 576 → 464
    expect([r.arrangements, r.states, r.solvable, r.deadlocks]).toEqual([9, 18788, true, []]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
    expect(r.needsRestart).toBe(464);
  });

  it('每題最短 / 次短 / 解法數：2-2a / 2-2b 不需轉動；2-2c 拿鏡片最短 1 轉 (▶ 或 ◀ 兩種，P1 真的需要轉)；2-1 區數字不變；確定性', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues])).toEqual([
      ['2-1a', 1, 2, 3, 3, 6, []], ['2-1b', 0, null, 1, 1, 6, []], ['2-1c.1', 1, 2, 110, 41, 6, []], ['2-1c.2', 1, 2, 131, 43, 6, []], ['2-1c', 1, 2, 110, 41, 6, []],
      ['2-2a', 0, null, 1, 1, 6, []], ['2-2b', 0, null, 1, 1, 6, []], ['2-2c.lens', 1, 1, 2, 2, 6, []], ['2-2c', 1, 1, 2, 2, 6, []], ['ch2.top', 0, null, 1, 1, 6, []]
    ]);
    expect(validateDial(m)).toEqual(r);
  });

  it('拿掉轉動 (控制盤沒有上列) → 2-2c 無解：印房只靠轉動接上 (副範式 P1)', () => {
    const noRow = { ...m, cube: { ...m.cube, dial: { ...m.cube.dial!, groups: [] } } };
    expect(validateDial(noRow).solvable).toBe(false);
  });
});

describe('通關腳本 (runScript) 與多解', () => {
  it('解法一：翻頁 → 塗開淡墨 → 目錄櫃拿卡 → 下聯貼「內」→ 上列 ▶ 一次 → 迴廊 → 印房拿鏡片 → 回閱覽室 → 合成 → 讀書脊 = 2-2 通關 (轉 1 次)', () => {
    let cs = solveB(solveA(inReading()));
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(false);
    cs = solveC(cs, [1]);
    expect([col(cs, 'print'), col(cs, 'shelf'), col(cs, 'reading')]).toEqual([0, 1, 2]);
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(true);
    expect(cs.world.msg).toBe('放大鏡底下，書脊上的小字是：「印房門邊的那一個，是第一個。」書脊的縫裡，卡著一枚銅鑰匙的齒。');
  });

  it('解法二 (另一種下聯與轉法)：下聯貼「前」；上列 ◀ (閱覽室被甩到第 0 行、和迴廊斷開) → 在閱覽室再 ◀ 一次接回 → 去印房 → 回程在迴廊再 ◀ 一次 (回到 S0) 接回閱覽室 (全程只往左)', () => {
    let cs = solveB(solveA(inReading()), 'card.qian');
    cs = turnIn2d(cs, [-1]);
    // ◀ 之後：閱覽室｜印房｜迴廊 → 閱覽室的西門面對來時的走廊 (只說明，不是死局)
    let r = play(cs, DOOR(-5.3));
    expect([r.kinds, r.cs.state.room, r.cs.world.msg]).toEqual([[], 'reading', '門外是來時的走廊。這一趟，只能往書房裡走。']);
    cs = solveC(r.cs, [-1], [-1]);
    expect([col(cs, 'shelf'), col(cs, 'reading'), col(cs, 'print')]).toEqual([0, 1, 2]);
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(true);
    expect(cardsOn(cs.world, LABEL)).toEqual(['card.qian']);
  });

  it('先做 2-2c 的轉動也行 (2-2a、2-2b 不需轉動、任何時候都可做)；三題順序不同結果相同', () => {
    let cs = solveA(inReading());
    cs = turnIn2d(cs, [1]);
    cs = solveB(cs);
    cs = solveC(cs, []);
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(true);
  });

  it('確定性：同一輸入序列 (解法一全程) 兩次執行，章節狀態逐欄相同', () => {
    const a = captureState(solveC(solveB(solveA(inReading())), [1]));
    const b = captureState(solveC(solveB(solveA(inReading())), [1]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('2-2a 塗過才看得見 (P14)：反例', () => {
  it('翻頁前淡墨兩模式都不在場 (只用 2D：書在藏寶圖翻不了 → 無解)', () => {
    const cs = inReading();
    for (const mode of ['3d', '2d'] as const) expect([mode, isActiveIn(cs.world, get(cs, 'veil'), mode)]).toEqual([mode, false]);
    runScript(cs.world, [...at(-1, -0.7, 'book'), { act: 'flip' }, { wait: 0.15 }]);
    expect(findTarget(cs.world)).toBe(null); // 藏寶圖裡：書不能翻、淡墨還不在
    runScript(cs.world, [{ act: 'interact' }]);
    expect([get(cs, 'book').used, get(cs, 'veil').used]).toEqual([false, false]);
  });

  it('翻頁後：淡墨只在藏寶圖 (只用 3D：實景盯著空白頁沒有淡墨)；實景再按 E = 重讀開頭', () => {
    const cs = play(inReading(), TURN_PAGE).cs;
    expect(cs.world.msg).toBe('開頭只有一句：「這間房的門，會自己換地方。」翻到下一頁——空白。');
    expect([isActiveIn(cs.world, get(cs, 'veil'), '3d'), isActiveIn(cs.world, get(cs, 'veil'), '2d')]).toEqual([false, true]);
    interact(cs.world);
    expect([cs.world.msg, get(cs, 'veil').used]).toEqual(['開頭只有一句：「這間房的門，會自己換地方。」後面都是空白。', false]);
  });

  it('塗開 = done (清空回退堆疊)、顯出小圖；再按 E 重讀小圖 (不再發旗標)；沒有筆尖塗不開', () => {
    let cs = turnIn2d(play(inReading(), TURN_PAGE).cs, [1]);
    expect(cs.state.turns!.undo.length).toBe(1);
    cs = play(cs, BRUSH).cs;
    expect([cs.state.turns!.undo, cs.world.msg]).toEqual([[], '淡墨底下浮出一幅小圖：一間只有東門的房，東門貼著迴廊的西門；房裡畫著一片圓圓的鏡片。']);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect(pump(cs).kinds).toEqual([]);
    const noNib = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'reading', door: 'doorW' }), { ...OPTS, abilities: [] });
    runScript(noNib.world, [...TURN_PAGE, { act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect([get(noNib, 'veil').used, noNib.world.msg]).toEqual([false, '少了筆尖，塗不開。']);
  });
});

describe('2-2b 下聯 (P18)：反例與多解', () => {
  it('上聯只刻在實景 (對聯櫃 3D 讀)、下聯只在藏寶圖；目錄櫃只在 3D 拉得開 (只用 2D：沒有卡 → 無解)', () => {
    let cs = inReading();
    runScript(cs.world, [...at(8.5, -3.2, 'cabinet'), { act: 'interact' }]);
    expect(cs.world.msg).toBe('櫃門扣得很緊。左扇刻著一行字：「門外千棵樹」；右扇空著。');
    expect([isActiveIn(cs.world, get(cs, 'lower'), '3d'), isActiveIn(cs.world, get(cs, 'lower'), '2d')]).toEqual([false, true]);
    runScript(cs.world, [{ walkTo: [12.6, null] }, { act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect([get(cs, 'catalog').used, hasItem(cs.world, 'card.nei')]).toEqual([false, false]);
    // 2D 在下聯前：字卡匣是空的 → 說明缺卡 (不開匣)
    cs = pump(cs).cs;
    runScript(cs.world, [{ walkTo: [9, null] }, { wait: 0.1 }]);
    expect(missingCardTarget(cs.world)?.def.id).toBe('lower');
    interact(cs.world);
    expect([cs.world.msg, cs.world.events.some(e => e.t === 'labelOpen')]).toEqual(['下聯少了一個字。字卡匣是空的——這間房裡，總有放卡片的地方。', false]);
  });

  it('貼「外」(照抄上聯同位置的字) → 無效：字顫動、卡片退回匣裡、櫃門不開；詞典：內 / 前 / 裡 / 邊 收、外不收', () => {
    let cs = play(inReading(), CATALOG).cs;
    expect([cs.world.msg, ['card.wai', 'card.nei', 'card.qian'].map(c => hasItem(cs.world, c))]).toEqual(['抽屜裡夾著三張詞卡：「外」「內」「前」。', [true, true, true]]);
    const r = play(cs, write('card.wai'));
    cs = r.cs;
    expect([r.kinds, get(cs, 'lower').used, get(cs, 'cabinet').used, hasItem(cs.world, 'card.wai'), cardsOn(cs.world, LABEL), cs.world.msgKey]).toEqual([[], false, false, true, [], 'msg.label.invalid']);
    const lower = get(cs, 'lower');
    expect(['card.wai', 'card.nei', 'card.qian', 'card.li', 'card.bian', 'card.right'].map(c => accepts(lower, c))).toEqual([false, true, true, true, true, false]);
    expect(Object.keys(CARDS)).toEqual(expect.arrayContaining(['card.li', 'card.bian']));
  });

  it('字卡匣：標題 = 下聯 (空格「＿」)，貼上後填進去；寫對 = done (清空回退堆疊)、取得空鏡框；之後換卡 / 取下不再給', () => {
    let cs = turnIn2d(play(inReading(), CATALOG).cs, [1]);
    runScript(cs.world, [{ walkTo: [9, null] }, { act: 'flip' }, { wait: 0.15 }]);
    expect(writableTarget(cs.world)?.def.id).toBe('lower');
    expect(deriveCardTray(cs.world, TEXT, 0)!.title).toBe('窗＿萬卷書');
    runScript(cs.world, [{ hold: { commands: [{ t: 'card', label: LABEL, card: 'card.nei' }] }, seconds: 1 / 60 }]);
    expect([deriveCardTray(cs.world, TEXT, 0)!.title, cs.world.msg, cs.world.inv.frame]).toEqual(['窗內萬卷書', '字補上了。櫃門喀的一聲彈開，裡面只有一個空鏡框。', 1]);
    cs = pump(cs).cs;
    expect(cs.state.turns!.undo).toEqual([]);
    runScript(cs.world, [{ hold: { commands: [{ t: 'card', label: LABEL, card: 'card.qian' }] }, seconds: 1 / 60 }, { hold: { commands: [{ t: 'uncard', label: LABEL, card: 'card.qian' }] }, seconds: 1 / 60 }]);
    expect([cs.world.inv.frame, get(cs, 'cabinet').used, cardsOn(cs.world, LABEL)]).toEqual([1, true, []]);
  });
});

describe('2-2c 放大鏡 (P13 / P1)：反例', () => {
  it('不轉動，印房到不了 (S0 孤立：迴廊西門 = 來時的走廊)；手稿庫 (南門，最順路) 沒有鏡片', () => {
    let cs = solveB(solveA(inReading()));
    let r = play(cs, DOOR(-5.3));
    r = play(r.cs, DOOR(-9.3));
    expect([r.kinds, r.cs.state.room]).toEqual([[], 'shelf']);
    // 回閱覽室 → 南門 → 手稿庫：只有門
    r = play(play(r.cs, DOOR(9.3)).cs, [{ wait: 0.1 }, { walkTo: [-1.5, 3.6] }, { act: 'interact' }]);
    expect(r.cs.state.room).toBe('manuscripts');
    expect(r.cs.world.objs.some(o => o.def.grants === 'lens')).toBe(false);
    cs = r.cs;
  });

  it('只有空鏡框 / 只有鏡片 / 什麼都沒有：書脊讀不到；合成失敗有回饋', () => {
    const cs = solveB(solveA(inReading()));
    runScript(cs.world, [...SPINE]);
    expect([cs.world.msg, get(cs, 'spine').used]).toEqual(['書脊上有一行小字，細得像頭髮，看不清。', false]);
    runScript(cs.world, COMBINE);
    expect([cs.world.msg, hasItem(cs.world, 'frame')]).toEqual(['手上只有一樣，湊不起來。', true]);
    const empty = inReading();
    runScript(empty.world, COMBINE);
    expect(empty.world.msg).toBe('手上沒有能湊在一起的東西。');
    expect(readyRecipe(cs.world)).toBe(null);
  });

  it('合成鈕：手上有一組配方時 HUD 才出現「[C] 合成：空鏡框 ＋ 鏡片」', () => {
    const cs = solveB(solveA(inReading()));
    const view = { renderMode: '3d' as const, locked: false, bindings: DEFAULT_BINDINGS };
    expect(deriveHud(cs.world, TEXT, view).combine).toBeUndefined();
    cs.world.inv.lens = 1;
    expect(deriveHud(cs.world, TEXT, view).combine).toBe('[C] 合成：空鏡框 ＋ 鏡片');
    expect(DEFAULT_BINDINGS.combine).toEqual(['KeyC']);
  });

  it('鏡片只在 3D 拿得到；拿到 = 道具 (本段結束：外殼以道具增加清空回退堆疊)', () => {
    let cs = turnIn2d(inReading(), [1]);
    cs = play(play(cs, DOOR(-5.3)).cs, DOOR(-9.3)).cs;
    expect(cs.state.room).toBe('print');
    runScript(cs.world, [...at(2.5, -2.8, 'lens'), { act: 'flip' }, { wait: 0.15 }]);
    expect(findTarget(cs.world)).toBe(null);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    cs = turnIn2d(cs, [1]);
    expect(cs.state.turns!.undo.length).toBe(1);
    runScript(cs.world, [...LENS]);
    expect(hasItem(cs.world, 'lens')).toBe(true);
    expect(clearUndo(cs, [], true).state.turns!.undo).toEqual([]);
  });
});

describe('跨房快照往返、R、存檔 v3、進度', () => {
  it('閱覽室 → 迴廊 → 回閱覽室：淡墨、下聯、對聯櫃、目錄櫃逐欄相同；道具跟著走；墨補滿', () => {
    let cs = turnIn2d(solveB(solveA(inReading())), [1]);
    const before = JSON.stringify(captureState(cs).rooms.reading.objs.filter(o => o.id !== 'floor'));
    cs = play(cs, DOOR(-5.3)).cs;
    expect([cs.state.room, hasItem(cs.world, 'frame')]).toEqual(['shelf', true]);
    cs = play(cs, DOOR(9.3)).cs;
    expect([cs.state.room, cs.state.turns]).toEqual(['reading', { left: 6, undo: [] }]);
    expect(JSON.stringify(captureState(cs).rooms.reading.objs.filter(o => o.id !== 'floor'))).toBe(before);
    expect([get(cs, 'veil').used, get(cs, 'cabinet').used, cardsOn(cs.world, LABEL)]).toEqual([true, true, ['card.nei']]);
  });

  it('R 重進房間：淡墨、櫃門、卡、空鏡框、排列、墨都回到進房時；魔方儀維持啟動', () => {
    let cs = inReading();
    const entry = JSON.stringify(cs.entry.cube);
    cs = turnIn2d(solveB(solveA(cs)), [1]);
    cs = restartRoom(cs, OPTS);
    expect([JSON.stringify(cs.state.cube), get(cs, 'veil').used, get(cs, 'book').used, get(cs, 'cabinet').used, hasItem(cs.world, 'frame'), hasItem(cs.world, 'card.nei'), cardsOn(cs.world, LABEL), cs.state.turns, cs.state.dial])
      .toEqual([entry, false, false, false, false, false, [], { left: 6, undo: [] }, true]);
  });

  it('存檔：寫入 → 讀回 → 開章 (房內讀檔不補墨)：所在房、排列、道具 (空鏡框 / 鏡片)、標籤上的卡、物件照舊', () => {
    let cs = solveB(solveA(inReading()));
    cs = turnIn2d(cs, [1]);
    cs = play(play(cs, DOOR(-5.3)).cs, DOOR(-9.3)).cs;
    cs = play(cs, LENS).cs;
    cs = play(play(cs, DOOR(5.3)).cs, DOOR(9.3)).cs;
    cs = turnIn2d(cs, [1, -1]);
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH2.start), OPTS);
    expect([back.state.room, back.state.turns!.left, JSON.stringify(back.state.cube), back.world.inv, cardsOn(back.world, LABEL), get(back, 'veil').used, get(back, 'cabinet').used])
      .toEqual(['reading', 4, JSON.stringify(cs.state.cube), { 'card.wai': 1, 'card.qian': 1, frame: 1, lens: 1 }, ['card.nei'], true, true]);
    runScript(back.world, [...COMBINE, ...SPINE]);
    expect(roomCleared(SPEC, pump(back).cs.state, back.world)).toBe(true);
  });

  it('2-2 在 2-1 通關後開放 (選單；章內開場就走得到)；通關記 2-2、「繼續」回到 2-2 (本章)', () => {
    const s = (cleared: string[]) => ({ ...defaultSave(), cleared });
    const e = levelById('2-2')!;
    expect([levelState(e, s(['1-1', '1-2', '1-3'])), levelState(e, s(['1-1', '1-2', '1-3', '2-1'])), levelState(e, s(['1-1', '1-2', '1-3', '2-1', '2-2']))]).toEqual(['locked', 'open', 'cleared']);
    expect(isUnlocked(e, s(['2-1']))).toBe(true);
    const cs = solveC(solveB(solveA(inReading())), [1]);
    const save = recordClear(s(['1-1', '1-2', '1-3', '2-1']), '2-2', cs.world, []);
    expect([save.cleared, save.current]).toEqual([['1-1', '1-2', '1-3', '2-1', '2-2'], '2-2']);
    expect(nextAfterClear('2-2', 'room', CHAPTERS)).toBe('2-2');
  });
});

// ── 字條 (規格 7.1.1 H1～H10、7.1.3 預算；story-bible 7.3 的 2-2 版本) ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = reading.objects.filter(o => o.type === 'note');
const CUBE_AHA = ['轉', '魔方', '排列', '滑', '對齊', '跟著', '一起', '整列', '整行', '墨', '鎖'];
const PUZZLES = [
  { id: '2-2a', difficulty: 4, notes: ['noteA'], keyObjects: ['book', 'veil', 'lectern'], ahaTerms: ['塗', '淡墨', '墨', '顯', '藏寶圖', '實景', '鋼筆', '筆'], area: [-6, 2] as const },
  { id: '2-2b', difficulty: 4, notes: ['noteB'], keyObjects: ['cabinet', 'lower', 'catalog'], ahaTerms: ['對聯', '上聯', '下聯', '對仗', '照抄', '外', '內', '前', '字', '寫', '卡'], area: [6, 14] as const },
  { id: '2-2c', difficulty: 4.5, notes: ['noteC'], keyObjects: ['spine', 'table'], ahaTerms: [...CUBE_AHA, '合成', '湊', '鏡', '放大', '印房', '帶'], area: [1, 6] as const }
];

describe('2-2 字條：量表 H1～H4、H9、H10 與預算', () => {
  it('三張字條 = story-bible 7.3 的 2-2a / 2-2b / 2-2c L1 原文；都是一開始就有字 (L1)', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual({
      noteA: '空白的那幾頁，我一直捨不得翻過去。', noteC: '我的東西，總是一半在這間，一半在別間。', noteB: '一扇刻著，一扇空著。我們總是各說一半。'
    });
    expect(notes.map(o => o.type === 'note' && o.revealAfter)).toEqual([undefined, undefined, undefined]);
  });

  it('H1 字數 ≤ 24；H2 無祈使開頭與禁用動詞；H3 無按鍵名 / 「按」/ 方位精確詞 / 數字', () => {
    for (const o of notes) {
      const t = noteText(o);
      expect([...t.replace(/\s+/g, '')].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t)).toBe(false);
      expect(/先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t)).toBe(false);
      expect(/[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
    }
  });

  it('H9 口吻：沒有劃掉的字；每張是一句完整的話 (句號 / 問號結尾)', () => {
    for (const o of notes) expect([o.id, noteText(o).includes('~~'), /[。？]$/.test(noteText(o))]).toEqual([o.id, false, true]);
  });

  it('H4 不點名本題關鍵物件 (顯示名)；H10 不含本題 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) { const lk = def(k).labelKey; if (lk) expect([id, k, t.includes(TEXT(lk))]).toEqual([id, k, false]); }
      for (const term of q.ahaTerms) expect([id, term, t.includes(term)]).toEqual([id, term, false]);
    }
  });

  it('預算 (7.1.3)：難度 4～4.5 → 每題 L1 一張、沒有 L2；每關提示 3 ≤ 謎題數 + 1；字條總數 ≤ 謎題數 + 3', () => {
    for (const q of PUZZLES) expect([q.id, q.notes.length, q.difficulty < 5]).toEqual([q.id, 1, true]);
    expect(PUZZLES.map(q => q.id)).toEqual(reading.puzzles!.map(q => q.id));
    expect(notes.length).toBeLessThanOrEqual(reading.puzzles!.length + 1);
  });

  it('位置：每張在所屬謎題範圍內；兩張間距 ≥ 3；任一 16 單位寬畫面 ≤ 3 張；兩模式都讀得到', () => {
    for (const q of PUZZLES) for (const id of q.notes) expect([id, def(id).x >= q.area[0] && def(id).x <= q.area[1]]).toEqual([id, true]);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'reading', door: 'doorW' }), OPTS);
      runScript(cs.world, [{ place: [o.x, 0, o.z + 0.5], mode }]);
      expect([o.id, mode, findTarget(cs.world)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(cs.world);
      expect(cs.world.msg).toBe(noteText(o));
    }
  });
});
