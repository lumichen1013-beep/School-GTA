// 2-1 書架迴廊 (規格 6「第二章魔方與門位」「2-1 書架迴廊（細化）」；M1 第二章第一關)：
// 魔方與門位、2-1 區 validateDial、通關腳本 (runScript，從章門入口打到三題全完成)、兩種不同解法、每題反例 (規格列的錯誤嘗試)、
// 屋框書牆的段 (frameBay)、跨房快照往返、補墨、R、存檔 v3 往返、舊存檔、選單解鎖、字條量表與預算
import { describe, it, expect } from 'vitest';
import { ISLAND_Z, shelf } from '../../../src/puzzle/content/levels/ch2/2-1-shelf';
import { deep, manuscripts, mezz, print, reading } from '../../../src/puzzle/content/levels/ch2/rooms';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH2_CUBE, CH2_ZONE21 } from '../../../src/puzzle/content/cubes/ch2';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { canEnterTurnMode } from '../../../src/puzzle/mechanics/dial';
import { offBay, shelfColumn } from '../../../src/puzzle/mechanics/shelf';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { applyTurn, cubeKey, initialCube, isBlocked, links, turnDirs, type CubeState } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, dialBlocked, openChapter, restartRoom, roomCleared,
  type ChapterSession, type ChapterSpec
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterSave, chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { isUnlocked, levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';
import { CH1, SPEC as CH1_SPEC } from './ch1Routes';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC: ChapterSpec = { chapter: 2, cube: CH2.cube, rooms: CH2.rooms, doors: chapterDoors(CH2.rooms) };
const def = (id: string): ObjDef => shelf.objects.find(o => o.id === id)!;
const TOOTH = 'tooth.shelf';

/** 新玩家開第二章 (從來時的走廊 → 2-1 西門) */
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH2.start), OPTS);
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const col = (cs: ChapterSession) => cs.state.cube!.pos.shelf[0];

/** 取走事件交給章節層 (同 LevelSession：dial / state / turn / enter)；換房後同批事件丟棄 */
function pump(cs: ChapterSession): { cs: ChapterSession; kinds: string[]; events: GameEvent[] } {
  const kinds: string[] = [];
  const events = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied');
  for (const e of events) {
    const r = applyChapterEvent(cs, e, OPTS);
    kinds.push(r.kind);
    if (r.kind === 'enter') return { cs: r.next, kinds, events };
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return { cs, kinds, events };
}
function play(cs: ChapterSession, cmds: Cmd[]): { cs: ChapterSession; kinds: string[] } {
  runScript(cs.world, cmds);
  const r = pump(cs);
  return { cs: r.cs, kinds: r.kinds };
}

/** 轉動模式的一步：2D、站穩 (canEnterTurnMode) → ChapterCommand；回傳新 session (轉不動 → 丟錯) */
function dial(cs: ChapterSession, dir: 1 | -1, group = 'row0'): ChapterSession {
  expect(canEnterTurnMode(cs.world)).toBe(true);
  const r = applyChapterCommand(cs, { t: 'turn', turn: { group, dir } });
  if ('blocked' in r) throw new Error(`turn ${group} ${dir} blocked: ${r.blocked}`);
  return r;
}
/** 切到藏寶圖、站穩 → 依序轉 dirs → 切回實景 */
function turnIn2d(cs: ChapterSession, dirs: Array<1 | -1>, group = 'row0'): ChapterSession {
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  for (const d of dirs) cs = dial(cs, d, group);
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
}

// ── 路線 (runScript；座標見 2-1-shelf.ts) ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-6.5, -2.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '魔方儀' }, { act: 'interact' }];
/** 走到某物件前 (先退到 z=-2.4 的走道再橫移，避開書梯) */
const goTo = (x: number, z: number, target: string): Cmd[] => [
  { walkTo: [null, -2.4] }, { walkTo: [x, null] }, { walkTo: [null, z] },
  { expect: w => expect(findTarget(w)?.def.id).toBe(target), label: target }
];
const BOOKEND: Cmd[] = [...goTo(8.7, -3.6, 'bookend'), { act: 'interact' }];
/** 抽書：站在前景書架島正面 (書架島中心 z = ISLAND_Z，站在 +1.0) */
const PULL = (id: string, x: number): Cmd[] => [...goTo(x, ISLAND_Z + 1.0, id), { act: 'interact' }];
const LAMP = (id: string): Cmd[] => [...goTo(3.5, -3.3, id), { act: 'interact' }];

/** 開章 → 啟動魔方儀 */
function activated(): ChapterSession {
  const r = play(start(), ACTIVATE);
  expect(r.kinds).toEqual(['dial']);
  expect(r.cs.state.dial).toBe(true);
  return r.cs;
}
/** 2-1a：dirs = 上列的轉法 (◀ 一次或 ▶ 兩次) → 推倒書擋 */
function solveA(cs: ChapterSession, dirs: Array<1 | -1> = [-1]): ChapterSession {
  cs = turnIn2d(cs, dirs);
  expect(col(cs)).toBe(2);
  const r = play(cs, BOOKEND);
  expect(r.kinds).toEqual(['state']);
  expect(r.cs.state.unlocked).toEqual(['row1']);
  return r.cs;
}
function solveB(cs: ChapterSession): ChapterSession {
  const r = play(cs, PULL('bookD', -1));
  expect(r.kinds).toEqual(['state']);
  expect(hasItem(r.cs.world, TOOTH)).toBe(true);
  return r.cs;
}
/** 2-1c：三步各自的轉法 (林 → 書 → 門) */
function solveC(cs: ChapterSession, steps: Array<Array<1 | -1>>): ChapterSession {
  const lamps = ['lampLin', 'lampShu', 'lampMen'];
  steps.forEach((dirs, i) => {
    cs = turnIn2d(cs, dirs);
    const r = play(cs, LAMP(lamps[i]));
    expect(r.kinds).toEqual(['state']);
    cs = r.cs;
    expect(get(cs, lamps[i]).used).toBe(true);
  });
  return cs;
}

describe('第二章魔方與門位 (規格 6「第二章魔方與門位（v0.4 細化）」)', () => {
  it('2×3：上列 2-1 / 2-2 / 2-3、下列 H1 / 2-4 / 2-5；格數 6 ≥ 本章關卡 5；控制盤 = 2-1 的魔方儀；鎖扣 row1 ← 2-1a、三行 ← 2-3a', () => {
    expect(CH2_CUBE.dims).toEqual([3, 2, 1]);
    expect(CH2_CUBE.cells.map(c => [c.at[0], c.at[1], c.room])).toEqual([[0, 0, 'shelf'], [1, 0, 'reading'], [2, 0, 'print'], [0, 1, 'mezz'], [1, 1, 'manuscripts'], [2, 1, 'deep']]);
    expect(CH2_CUBE.dial!.entry).toEqual({ room: 'shelf', obj: 'dial' });
    expect(CH2_CUBE.dial!.locks.map(l => `${l.group}<-${l.until}`)).toEqual(['row1<-2-1a', 'col0<-2-3a', 'col1<-2-3a', 'col2<-2-3a']);
    expect(CH2.levels).toEqual({ '2-1': 'shelf', '2-2': 'reading', '2-3': 'print', '2-4': 'manuscripts', '2-5': 'deep', H1: 'mezz' });
    expect(CH2.start).toEqual({ room: 'shelf', door: 'doorW' });
    expect(cubeChapterOf('2-1')).toBe(CH2);
  });

  it('門位 (本地) 與 S0 的接法：入口 → 2-1 西門；2-1 東 ↔ 2-2 西；2-2 南 ↔ 2-4 北；2-4 東 ↔ 2-5 西；2-3、H1 孤立', () => {
    expect(SPEC.doors.map(d => `${d.room}.${d.side}:${d.kind}`)).toEqual([
      'shelf.W:door', 'shelf.E:door', 'reading.W:door', 'reading.S:door', 'reading.N:arch', 'print.E:door', 'print.S:arch', 'mezz.W:door', 'mezz.N:arch', 'manuscripts.N:door', 'manuscripts.E:door', 'deep.W:door', 'deep.N:arch', 'deep.E:chapter'
    ]);
    // 2-3 起：北牆的 N:arch 是洞位 (平常不在場；上方印房的門牌讀作「間」時才接上)；印房南拱門有門牌
    expect(SPEC.doors.filter(d => d.hole).map(d => d.room)).toEqual(['reading', 'mezz', 'deep']);
    expect(SPEC.doors.filter(d => d.plate).map(d => `${d.room}.${d.door}`)).toEqual(['print.archS']);
    const ls = links(CH2_CUBE, initialCube(CH2_CUBE), SPEC.doors).map(l => `${l.from.room}.${l.from.door}→${'frame' in l.to ? `frame:${l.to.frame}` : `${l.to.room}.${l.to.door}`}`);
    expect(ls).toEqual([
      'shelf.doorW→frame:hall', 'shelf.doorE→reading.doorW', 'reading.doorW→shelf.doorE', 'reading.doorS→manuscripts.doorN',
      'manuscripts.doorN→reading.doorS', 'manuscripts.doorE→deep.doorW', 'deep.doorW→manuscripts.doorE', 'deep.chapterE→frame:greenhouse'
    ]);
  });

  it('「2-3 要先列轉一次才接得上」：上列往左或往右任一次，2-3 東門就接上 2-1 西門', () => {
    for (const dir of [1, -1] as const) {
      const s = applyTurn(CH2_CUBE, initialCube(CH2_CUBE), { group: 'row0', dir }) as CubeState;
      const l = links(CH2_CUBE, s, SPEC.doors).find(k => k.from.door === 'doorE' && k.from.room === 'print');
      expect(l?.to).toEqual({ room: 'shelf', door: 'doorW' });
    }
  });

  it('可達排列 (BFS 實算，規格 5.4.9)：只開上列 3、兩列 9、兩列 + 三行 720', () => {
    const count = (groups: string[]) => {
      const seen = new Map<string, CubeState>([[cubeKey(initialCube(CH2_CUBE)), initialCube(CH2_CUBE)]]);
      const q = [...seen.values()];
      while (q.length) {
        const s = q.shift()!;
        for (const g of groups) for (const dir of turnDirs(CH2_CUBE, g)) {
          const r = applyTurn(CH2_CUBE, s, { group: g, dir });
          if (isBlocked(r) || seen.has(cubeKey(r))) continue;
          seen.set(cubeKey(r), r); q.push(r);
        }
      }
      return seen.size;
    };
    expect([count(['row0']), count(['row0', 'row1']), count(['row0', 'row1', 'col0', 'col1', 'col2'])]).toEqual([3, 9, 720]);
  });

  it('夾層 (H1 隱藏房，已是完整關卡：levels/H1.test.ts)：validateLevel 0 issue、題 = H1、每房預算 6、門位同占位版 (西門 + 北牆洞位)；2-5 東章門要的鑰匙本章取不到 (此版本一律鎖著)', () => {
    // 2-2～2-5、H1 都已是完整關卡 (levels/2-2～2-5.test.ts、levels/H1.test.ts)；占位房已全部退役
    expect([print.id, print.turnBudget, manuscripts.id, deep.id]).toEqual(['2-3', { base: 6, puzzles: { '2-3b': 3 } }, '2-4', '2-5']);
    for (const r of [mezz]) {
      expect([r.id, validateLevel(r, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })]).toEqual([r.id, []]);
      expect([r.id, r.puzzles?.map(p => p.id), r.turnBudget, r.objects.filter(o => o.type === 'cubeDoor').map(o => o.id)]).toEqual([r.id, ['H1'], { base: 6 }, ['doorW', 'holeN']]);
      expect(r.objects.filter(o => o.type !== 'floor' && o.type !== 'cubeDoor' && o.type !== 'note').map(o => o.type)).toEqual(['bookWall', 'innerShelf', 'diaryStand']);
    }
    expect([reading.id, reading.turnBudget]).toEqual(['2-2', { base: 6 }]);
    const E = deep.objects.find(o => o.id === 'chapterE')!;
    expect(E.type === 'cubeDoor' && [E.kind, E.key]).toEqual(['chapter', 'key.study']);
  });
});

describe('2-1 書架迴廊：資料與驗證器', () => {
  it('擺設規則：可互動物件同時落在後 / 中 / 前三帶 (layoutDepthIssues)；2-1b 的書架島在前景、書牆的東西在後景', () => {
    expect(layoutDepthIssues(shelf)).toEqual([]);
    const band = (id: string) => (def(id).z < -2 ? 'back' : def(id).z > 2 ? 'front' : 'mid');
    expect(['lowShelf', 'bookA', 'bookD', 'bookLock', 'remark2', 'noteB'].map(band)).toEqual(Array(6).fill('front'));
    expect(['dial', 'lampLock', 'lampLin', 'bookend', 'scrap', 'step', 'noteA', 'noteC'].map(band)).toEqual(Array(8).fill('back'));
  });

  it('validateLevel / validateEntry 0 issue；謎題 2-1a～2-1c；登錄表 2-1 前置 1-3、第二章、能力白名單 = 筆尖；預算 6', () => {
    expect(validateLevel(shelf, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })).toEqual([]);
    expect(validateEntry(levelById('2-1')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(shelf.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['2-1a 整列一起走', '2-1b 那年的推測', '2-1c 書名的順序']);
    const e = levelById('2-1')!;
    expect([e.chapter, e.unlock.after, e.abilities]).toEqual([2, ['1-3'], ['nib']]);
    expect(CHAPTERS.find(c => c.id === 2)).toEqual({ id: 2, titleKey: 'ch.2.title', theme: 'study', levels: ['2-1', '2-2', '2-3', '2-4', '2-5', 'H1'] });
    expect([TEXT('ch.2.title'), shelf.theme, shelf.turnBudget]).toEqual(['第二章　書房', 'study', { base: 6 }]);
  });

  it('開場旁白 / 通關文字 (story-bible 7.3)；魔方儀的顯示名 (story-bible 5.1b)', () => {
    expect([TEXT(shelf.narrationKey), TEXT(shelf.nextKey), TEXT(def('dial').labelKey!)]).toEqual(['書都背對著你，像在躲什麼。', '書背上的書名，換了一本。', '黃銅魔方儀']);
  });

  it('與抽象模型一致：書擋 doneFlag 2-1a、暗格 2-1b、燈座 2-1c；燈書第 0 / 1 / 2 段 = 門 / 林 / 書，順序 林 → 書 → 門 = 書擋底座的字', () => {
    expect([def('bookend').doneFlag, def('bookLock').doneFlag, def('lampLock').doneFlag]).toEqual(['2-1a', '2-1b', '2-1c']);
    const lamps = ['lampMen', 'lampLin', 'lampShu'].map(def);
    expect(lamps.map(l => [l.frameBay, l.type === 'lampBook' && TEXT(l.title)])).toEqual([[0, '門'], [1, '林'], [2, '書']]);
    const L = def('lampLock');
    expect(L.type === 'lampLock' && L.order).toEqual(['lampLin', 'lampShu', 'lampMen']);
    expect(TEXT('lvl.2-1.bookend.read')).toBe('書擋的底座刻著：「林中有書，書後有門。」');
    expect([def('bookend').frameBay, def('scrap').frameBay]).toEqual([2, 1]);
    expect(CH2_ZONE21.puzzles.map(p => p.id)).toEqual(['2-1a', '2-1b', '2-1c.1', '2-1c.2', '2-1c']);
    expect([def('lampLin').doneFlag, def('lampShu').doneFlag]).toEqual(['2-1c.1', '2-1c.2']);
  });
});

describe('validateDial：2-1 區 (兩列；三行的解鎖在 2-3 區，規格 5.4.9 分區)', () => {
  const m = dialModelOf(CH2_ZONE21.cube, CH2.rooms, CH2_ZONE21.puzzles, CH2_ZONE21.start, CH2_ZONE21.finish);
  const r = validateDial(m);

  it('可達排列 9、抽象狀態 2,098、有解、卡死 0 (含 R)；沒有任何問題 (預算繞過、鎖扣、入口)', () => {
    // 2-3 起印房多了南拱門 (印房在第 1 行時正對手稿庫北門 → 接通)：狀態 2,086 → 2,098、needsRestart 64 → 52
    expect([r.arrangements, r.states, r.solvable, r.deadlocks]).toEqual([9, 2098, true, []]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
    expect(r.needsRestart).toBe(52); // 墨用完困在房裡：R 回到進房快照、或穿門補墨即可再解
  });

  it('每題最短 / 次短 / 預算：2-1a 教學 1 + 3 ≤ 6；2-1c 三步各最短 1、本質不同的解 ≥ 2 (往左或往右都行，D16)', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.budget, p.issues])).toEqual([
      ['2-1a', 1, 2, 6, []], ['2-1b', 0, null, 6, []], ['2-1c.1', 1, 2, 6, []], ['2-1c.2', 1, 2, 6, []], ['2-1c', 1, 2, 6, []]
    ]);
    expect(r.perPuzzle.map(p => [p.id, p.solutions, p.distinct, p.sampled])).toEqual([
      ['2-1a', 3, 3, false], ['2-1b', 1, 1, false], ['2-1c.1', 110, 41, false], ['2-1c.2', 131, 43, false], ['2-1c', 110, 41, false]
    ]);
    expect(validateDial(m)).toEqual(r); // 確定性
  });

  it('整題 2-1c (2-1a 之後 2-1 在第 2 行：依序到第 1 / 2 / 0 行) 最短 3 轉；2-1a + 2-1c 最短 4 ≤ 每次進房的墨 6', () => {
    // 只開上列時的 BFS：狀態 = (排列, 已點到第幾本)
    const goals = [1, 2, 0];
    const s0 = applyTurn(CH2_CUBE, initialCube(CH2_CUBE), { group: 'row0', dir: -1 }) as CubeState;
    const key = (s: CubeState, k: number) => `${cubeKey(s)}#${k}`;
    const dist = new Map([[key(s0, 0), 0]]);
    const q: Array<[CubeState, number]> = [[s0, 0]];
    let best = -1;
    while (q.length && best < 0) {
      const [s, k0] = q.shift()!;
      let k = k0;
      while (k < 3 && s.pos.shelf[0] === goals[k]) k++;
      const d = dist.get(key(s, k0))!;
      if (k === 3) { best = d; break; }
      for (const dir of [1, -1] as const) {
        const t = applyTurn(CH2_CUBE, s, { group: 'row0', dir }) as CubeState;
        if (dist.has(key(t, k))) continue;
        dist.set(key(t, k), d + 1); q.push([t, k]);
      }
    }
    expect(best).toBe(3);
    expect(1 + best).toBeLessThanOrEqual(shelf.turnBudget!.base);
  });
});

describe('2-1 通關路徑 (章門入口 → 魔方儀 → 2-1a → 2-1b → 2-1c)', () => {
  it('解法一：◀ 推倒書擋 → 抽 D → ◀ 林、▶ 書、▶ 門 (轉 4 次、墨剩 2)；三題完成 = 2-1 通關、殘片在第 1 行時拿到', () => {
    let cs = start();
    expect([cs.state.room, cs.state.door, col(cs), cs.state.turns]).toEqual(['shelf', 'doorW', 0, { left: 6, undo: [] }]);
    cs = activated();
    cs = solveA(cs, [-1]);
    expect(TEXT(cs.world.msgKey)).toBe('書擋倒了下來，下列的書擋扣跟著鬆開。底座刻著：「林中有書，書後有門。」');
    cs = solveB(cs);
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(false);
    // 2-1c 第一步 (到第 1 行點林) 之後，順手拿中段書架上的殘片 (2D 跳上書梯)
    cs = turnIn2d(cs, [-1]);
    let r = play(cs, LAMP('lampLin'));
    cs = r.cs;
    runScript(cs.world, [{ walkTo: [5.6, null] }, { act: 'flip' }, { wait: 0.15 }, { hop: 1, until: w => w.player.onGround && w.player.y > 1.05, label: '跳上書梯' }, { walkTo: [6.6, null] },
      { expect: w => expect(findTarget(w)?.def.id).toBe('scrap'), label: '殘片' }, { act: 'interact' }, { act: 'flip' }, { wait: 0.2 }]);
    expect(hasItem(cs.world, 'scrap.1')).toBe(true);
    for (const [dirs, lamp] of [[[1], 'lampShu'], [[1], 'lampMen']] as const) {
      cs = turnIn2d(cs, [...dirs]);
      r = play(cs, LAMP(lamp));
      cs = r.cs;
    }
    expect(get(cs, 'lampLock').used).toBe(true);
    expect(TEXT(cs.world.msgKey)).toBe('三盞燈都亮了。書架上的書，一本一本轉過身來。');
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(true);
    expect(cs.state.turns!.left).toBe(2);
    expect(col(cs)).toBe(0);
  });

  it('解法二 (本質不同的轉法)：▶▶ 推倒書擋 → 2-1c 用 ▶▶ 林、▶ 書、▶ 門；先做 2-1b 也行 (不需轉動，任何時候都可做)', () => {
    let cs = solveB(start());
    cs = activated2(cs);
    cs = solveA(cs, [1, 1]);
    cs = solveC(cs, [[1, 1], [1], [1]]);
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(true);
    expect([col(cs), cs.state.turns!.left]).toEqual([0, 0]);
  });

  it('解法三：每一步都往左 (◀ 書擋；◀ 林、◀◀ 書墨不夠 → 走西門去 2-3 補墨再回來 → ◀◀ 門)', () => {
    let cs = solveA(activated(), [-1]);
    cs = solveC(cs, [[-1]]);
    cs = turnIn2d(cs, [-1, -1]);              // 第 1 → 0 → 2 行：墨 6 − 1 − 1 − 2 = 2
    let r = play(cs, LAMP('lampShu'));
    cs = r.cs;
    expect(cs.state.turns!.left).toBe(2);
    // 2-1 在第 2 行：西門接 2-3 印房東門 → 穿過去再回來 = 墨補滿
    r = play(cs, [{ walkTo: [null, 0] }, { walkTo: [-9.3, null] }, { act: 'interact' }]);
    expect([r.kinds, r.cs.state.room]).toEqual([['enter'], 'print']);
    r = play(r.cs, [{ wait: 0.1 }, { walkTo: [5.3, 0] }, { act: 'interact' }]);
    expect([r.kinds, r.cs.state.room, r.cs.state.turns]).toEqual([['enter'], 'shelf', { left: 6, undo: [] }]);
    cs = r.cs;
    expect(get(cs, 'lampLin').used && get(cs, 'lampShu').used).toBe(true); // 跨房往返：已亮的燈不變
    cs = turnIn2d(cs, [-1, -1]);
    r = play(cs, LAMP('lampMen'));
    expect(get(r.cs, 'lampLock').used).toBe(true);
    expect(roomCleared(SPEC, r.cs.state, r.cs.world)).toBe(false); // 2-1b 還沒做：房間還沒通關
    expect(roomCleared(SPEC, solveB(r.cs).state, r.cs.world)).toBe(true);
  });

  it('確定性：同一輸入序列 (解法二全程) 兩次執行，章節狀態逐欄相同', () => {
    const once = () => captureState(solveC(solveA(activated(), [1, 1]), [[1, 1], [1], [1]]));
    expect(once()).toEqual(once());
  });
});

/** 先做 2-1b 再啟動 (人在矮書架前)：走回魔方儀 */
function activated2(cs: ChapterSession): ChapterSession {
  const r = play(cs, [{ walkTo: [null, -2.4] }, { walkTo: [-6.5, null] }, { act: 'interact' }]);
  expect(r.kinds).toEqual(['dial']);
  return r.cs;
}

describe('魔方儀與控制盤 (不計題；規格 5.4.1、5.4.2)', () => {
  it('啟動前轉不動 (控制盤還沒啟動)；只在 3D 啟動 (2D 按 E 不啟動)；已啟動再按 → 已經在轉了', () => {
    const cs = start();
    expect(dialBlocked(cs, { group: 'row0', dir: 1 })).toBe('noDial');
    runScript(cs.world, [{ walkTo: [-6.5, -2.4] }, { act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect(pump(cs).kinds).toEqual([]);
    expect(canEnterTurnMode(cs.world)).toBe(false);
    const on = activated();
    runScript(on.world, [{ act: 'interact' }]);
    expect([pump(on).kinds, on.world.msg]).toEqual([[], '魔方儀已經在轉了。']);
  });

  it('啟動時：上列可轉、下列與三行鎖著 (這一排鎖著)；2-1a 完成 → 下列解開、三行仍鎖 (2-3a 不在本版本)', () => {
    let cs = activated();
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(['row0', 'row1', 'col0', 'col1', 'col2'].map(g => dialBlocked(cs, { group: g, dir: 1 }))).toEqual([null, 'locked', 'locked', 'locked', 'locked']);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    cs = solveA(cs);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(['row1', 'col0'].map(g => dialBlocked(cs, { group: g, dir: 1 }))).toEqual([null, 'locked']);
  });

  it('轉的是一整列 (沒有空格也能轉)：◀ 之後 2-1 (連同你) 在第 2 行、2-2 在第 0 行、2-3 在第 1 行；你在房裡的位置不變', () => {
    let cs = activated();
    const p0 = { x: cs.world.player.x, z: cs.world.player.z };
    cs = turnIn2d(cs, [-1]);
    expect([cs.state.cube!.pos.shelf, cs.state.cube!.pos.reading, cs.state.cube!.pos.print]).toEqual([[2, 0, 0], [0, 0, 0], [1, 0, 0]]);
    expect([cs.world.player.x, cs.world.player.z]).toEqual([p0.x, p0.z]);
    expect(cs.world.ext.cube!.at).toEqual([2, 0, 0]);
  });

  it('墨：每次進房 6 滴；用完 → 墨乾了 (回退仍可用、不耗墨)；穿門 / R 補滿', () => {
    let cs = activated();
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    for (let i = 0; i < 6; i++) cs = dial(cs, 1);
    expect([cs.state.turns!.left, dialBlocked(cs, { group: 'row0', dir: 1 })]).toEqual([0, 'noInk']);
    const back = applyChapterCommand(cs, { t: 'undo' });
    expect('blocked' in back ? back.blocked : back.state.turns!.left).toBe(1);
    const r = restartRoom(cs, OPTS);
    expect([r.state.turns, r.state.dial, cubeKey(r.state.cube!)]).toEqual([{ left: 6, undo: [] }, true, cubeKey(initialCube(CH2_CUBE))]);
  });
});

describe('2-1a 整列一起走：規格列的錯誤嘗試與驗證重點', () => {
  it('書擋只在 2-1 位於第 2 行時在場：第 0 / 1 行兩模式都找不到它 (書牆東段在別的行背後)；第 2 行才找得到', () => {
    let cs = activated();
    for (const c of [0, 1]) {
      if (c === 1) cs = turnIn2d(cs, [1]);
      expect(col(cs)).toBe(c);
      runScript(cs.world, goTo(8.7, -3.6, 'doorE').slice(0, 3));
      expect([c, findTarget(cs.world)?.def.id ?? null, isActiveIn(cs.world, get(cs, 'bookend'), '3d')]).toEqual([c, null, false]);
      runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
      expect(isActiveIn(cs.world, get(cs, 'bookend'), '2d')).toBe(false);
      runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { walkTo: [null, -2.4] }]);
    }
    cs = turnIn2d(cs, [1]);
    runScript(cs.world, goTo(8.7, -3.6, 'bookend'));
  });

  it('轉一次 ▶ 到第 1 行：背後是中段 (只有殘片與燈書「林」)；書擋不在', () => {
    const cs = turnIn2d(activated(), [1]);
    const here = shelf.objects.filter(o => o.frameBay !== undefined && !offBay(cs.world, get(cs, o.id))).map(o => o.id);
    expect(here).toEqual(['bay1', 'lampLin', 'scrap']);
    expect(shelfColumn(cs.world)).toBe(1);
  });

  it('2D 推不動書擋 (只在 3D)：第 2 行切到藏寶圖站在書擋前按 E → 不倒下 (看得見，卻碰不到)', () => {
    const cs = turnIn2d(activated(), [-1]);
    runScript(cs.world, [...goTo(8.7, -3.6, 'bookend'), { act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect([get(cs, 'bookend').used, pump(cs).kinds, cs.world.msg]).toEqual([false, [], '看得見，卻碰不到。換個角度試試。']);
  });

  it('倒下後再按 E：讀底座的字 (不再發旗標)；R 不會讓魔方儀熄掉，但書擋與下列的鎖扣回到進房時', () => {
    let cs = solveA(activated());
    runScript(cs.world, [{ act: 'interact' }]);
    expect([pump(cs).kinds, cs.world.msg]).toEqual([[], '書擋的底座刻著：「林中有書，書後有門。」']);
    cs = restartRoom(cs, OPTS);
    expect([cs.state.dial, get(cs, 'bookend').used, cs.state.unlocked ?? [], col(cs)]).toEqual([true, false, [], 0]);
  });

  it('隱藏點：殘片只在第 1 行在場；站地板兩模式都拿不到 (2D 身體中心差 2.05 > 1.5、3D 只在 2D 拿)；書梯上 2D 才拿得到', () => {
    const cs = turnIn2d(activated(), [1]);
    runScript(cs.world, [{ walkTo: [null, -2.4] }, { walkTo: [5.6, null] }, { act: 'interact' }]);
    expect(hasItem(cs.world, 'scrap.1')).toBe(false);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { walkTo: [5.7, null] }, { act: 'interact' }]);
    expect(hasItem(cs.world, 'scrap.1')).toBe(false);
    runScript(cs.world, [{ hop: 1, until: w => w.player.onGround && w.player.y > 1.05 }, { walkTo: [6.6, null] }, { act: 'interact' }]);
    expect([hasItem(cs.world, 'scrap.1'), cs.world.msg]).toEqual([true, '一角泛黃的紙，畫著老宅的一小塊。是爸爸的筆跡。']);
  });
});

describe('2-1b 那年的推測 (P12 首次 / P9)：規格列的錯誤嘗試', () => {
  const books = [['bookA', -4], ['bookB', -3], ['bookC', -2], ['bookD', -1], ['bookE', 0]] as const;

  it('五本實書逐一抽：只有 D 打開暗格 (取得銅鑰匙的齒・一)；抽錯「書抽出一半，又滑了回去。」無懲罰、可重試', () => {
    for (const [id, x] of books) {
      const cs = start();
      const r = play(cs, PULL(id, x));
      expect([id, hasItem(r.cs.world, TOOTH), get(r.cs, 'bookLock').used]).toEqual([id, id === 'bookD', id === 'bookD']);
      if (id !== 'bookD') {
        expect(r.cs.world.msg).toBe('書抽出一半，又滑了回去。');
        expect(solveB(r.cs).world.msg).toBe('書後面喀的一聲，暗格彈開了。裡面躺著一枚銅鑰匙的齒。');
      }
    }
  });

  it('照眉批三去抽「影」：實景那一格是空的 (3D 不在場)；藏寶圖按 E = 「這本只畫在圖上。手指碰到的是紙。」(抽不出來)', () => {
    const cs = start();
    runScript(cs.world, [...goTo(1, ISLAND_Z + 1.0, 'bookE').slice(0, 3)]);
    expect(isActiveIn(cs.world, get(cs, 'bookYing'), '3d')).toBe(false);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { walkTo: [1, null] }, { expect: w => expect(findTarget(w)?.def.id).toBe('bookYing') }, { act: 'interact' }]);
    expect([cs.world.msg, get(cs, 'bookLock').used]).toEqual(['這本只畫在圖上。手指碰到的是紙。', false]);
  });

  it('兩個視角各看一半：眉批一 / 三只在藏寶圖讀得到、眉批二只在實景；兩模式反例 (另一個模式不在場)', () => {
    const cs = start();
    const at = (id: string) => isActiveIn(cs.world, get(cs, id), '2d') ? '2d' : isActiveIn(cs.world, get(cs, id), '3d') ? '3d' : '-';
    expect(['remark1', 'remark2', 'remark3'].map(at)).toEqual(['2d', '3d', '2d']);
    for (const id of ['remark1', 'remark3']) expect(isActiveIn(cs.world, get(cs, id), '3d')).toBe(false);
    expect(isActiveIn(cs.world, get(cs, 'remark2'), '2d')).toBe(false);
    // 實際讀：2D 站在眉批下、3D 站在板緣前
    runScript(cs.world, [{ walkTo: [null, -2.4] }, { act: 'flip' }, { wait: 0.15 }, { walkTo: [-2, null] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('是最高的那本。');
    runScript(cs.world, [{ walkTo: [2.8, null] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('那年我~~很確定~~猜：是書名寫著「影」的那本。');
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { walkTo: [2.0, null] }, { walkTo: [null, ISLAND_Z + 1.0] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('它不肯和旁邊的書站齊。');
  });

  it('線索互相對照：最高 = B、D、影；站不齊 (往外凸) = A、D；影在實景不存在 → 唯一 = D (資料驗算)', () => {
    const real = shelf.objects.filter(o => o.type === 'spine' && o.visible === 'both');
    const tallest = Math.max(...shelf.objects.filter(o => o.type === 'spine').map(o => o.h));
    const tall = shelf.objects.filter(o => o.type === 'spine' && o.h === tallest).map(o => o.id);
    const out = real.filter(o => o.z > ISLAND_Z).map(o => o.id);
    expect([tall, out]).toEqual([['bookB', 'bookD', 'bookYing'], ['bookA', 'bookD']]);
    expect(tall.filter(id => out.includes(id))).toEqual(['bookD']);
    expect(def('bookLock').type === 'bookLock' && def('bookLock')).toMatchObject({ answer: 'bookD', reward: TOOTH });
  });

  it('2D 抽不動實書 (只在 3D)；暗格開了之後再抽任何一本 → 暗格已經空了', () => {
    let cs = start();
    runScript(cs.world, [...goTo(-1, ISLAND_Z + 1.0, 'bookD'), { act: 'flip' }, { wait: 0.15 }]);
    expect(findTarget(cs.world)?.def.type).not.toBe('spine'); // 藏寶圖裡這一帶的 E 是讀眉批一
    runScript(cs.world, [{ act: 'interact' }]);
    expect([hasItem(cs.world, TOOTH), get(cs, 'bookLock').used, cs.world.msg]).toEqual([false, false, '是最高的那本。']);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    cs = solveB(pump(cs).cs);
    runScript(cs.world, [{ act: 'interact' }]);
    expect([cs.world.msg, cs.world.inv[TOOTH]]).toEqual(['暗格已經空了。', 1]);
  });
});

describe('2-1c 書名的順序 (P16)：規格列的錯誤嘗試', () => {
  it('先點面前那本 (2-1a 後的「書」) → 燈全暗 (無懲罰)；照書牆由西到東 (門 → 林 → 書) 也不行', () => {
    let cs = solveA(activated());
    let r = play(cs, LAMP('lampShu'));
    cs = r.cs;
    expect([get(cs, 'lampShu').used, cs.world.msg]).toEqual([false, '燈一盞接一盞，全暗了下去。']);
    // 由西到東：第 0 段「門」→ 全暗
    cs = turnIn2d(cs, [1]);
    r = play(cs, LAMP('lampMen'));
    expect([get(r.cs, 'lampMen').used, r.cs.world.msg]).toEqual([false, '燈一盞接一盞，全暗了下去。']);
  });

  it('點對一本 → 燈座多一點光 (停住)；之後點錯 → 已亮的也全暗；點亮 = done (清空回退堆疊：不能點了再退回去省墨)', () => {
    let cs = solveA(activated());
    cs = turnIn2d(cs, [-1]);
    expect(cs.state.turns!.undo.length).toBe(1);
    const r = play(cs, LAMP('lampLin'));
    cs = r.cs;
    expect([get(cs, 'lampLin').used, cs.world.msg, cs.state.turns!.undo]).toEqual([true, '燈亮了。燈座上多了一點光。', []]);
    cs = turnIn2d(cs, [1, 1]);  // 第 1 → 2 → 0 行：「門」(點錯)
    cs = play(cs, LAMP('lampMen')).cs;
    expect([get(cs, 'lampLin').used, get(cs, 'lampMen').used]).toEqual([false, false]);
  });

  it('燈書只在 3D 點得亮 (2D 看得見、碰不到)；一次只有一本在場 (三段書牆各一本)', () => {
    const cs = activated();
    runScript(cs.world, [...goTo(3.5, -3.3, 'lampMen'), { act: 'flip' }, { wait: 0.15 }]);
    expect(findTarget(cs.world)?.def.id).not.toBe('lampMen');
    for (const x of [3.5, 4.2, 2.9]) {
      runScript(cs.world, [{ walkTo: [x, null] }, { act: 'interact' }]);
      expect([x, findTarget(cs.world)?.def.id === 'lampMen', get(cs, 'lampMen').used]).toEqual([x, false, false]);
    }
    expect(['lampMen', 'lampLin', 'lampShu'].filter(id => isActiveIn(cs.world, get(cs, id), '2d'))).toEqual(['lampMen']);
  });

  it('不讀書擋也能亂點 (資訊順序只是設計上的先後)：六種順序窮舉只有 林 → 書 → 門 全亮', () => {
    const lamps = { lampMen: 0, lampLin: 1, lampShu: 2 } as const;
    const perms = [['lampLin', 'lampShu', 'lampMen'], ['lampLin', 'lampMen', 'lampShu'], ['lampShu', 'lampLin', 'lampMen'], ['lampShu', 'lampMen', 'lampLin'], ['lampMen', 'lampLin', 'lampShu'], ['lampMen', 'lampShu', 'lampLin']] as const;
    const ok = perms.filter(order => {
      let cs = activated();
      for (const id of order) {
        const target = lamps[id];
        const steps = ((target - col(cs)) % 3 + 3) % 3;
        cs = turnIn2d(cs, Array(steps).fill(1));
        cs = play(cs, LAMP(id)).cs;
        if (cs.state.turns!.left === 0 && id !== order[2]) cs = restartRoom(cs, OPTS); // 墨用完：R (順序取樣只看燈)
      }
      return get(cs, 'lampLock').used;
    });
    expect(ok).toEqual([['lampLin', 'lampShu', 'lampMen']]);
  });

  it('盲轉取樣 (D2 v0.4：不看書名、不看書擋)：預算內隨機轉 + 點面前那本，200 次取樣成功率 < 25%', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    let wins = 0;
    for (let n = 0; n < 200; n++) {
      // 抽象：在第 c 行點亮燈書 (第 0 / 1 / 2 段 = 門 / 林 / 書)；順序鎖：點錯全暗
      let c = 2, lit = 0, ink = 6 - 1;
      const order = [1, 2, 0];
      for (let step = 0; step < 12 && ink >= 0 && lit < 3; step++) {
        if (rnd() < 0.5 && ink > 0) { c = (c + (rnd() < 0.5 ? 1 : 2)) % 3; ink--; continue; }
        lit = order[lit] === c ? lit + 1 : 0;
      }
      if (lit === 3) wins++;
    }
    expect(wins / 200).toBeLessThan(0.25);
  });
});

describe('跨房快照往返、R、存檔 v3', () => {
  it('2-1 → 2-2 (東門) → 回 2-1：書擋、暗格、燈、殘片逐欄相同；墨補滿、回退堆疊清空', () => {
    let cs = solveB(solveA(activated(), [1, 1]));
    cs = turnIn2d(cs, [1, 1]);              // 第 2 → 0 → 1 行 (2-1 東門 ↔ 2-2 西門)
    cs = play(cs, LAMP('lampLin')).cs;
    expect(col(cs)).toBe(1);
    const before = JSON.stringify(captureState(cs).rooms.shelf);
    let r = play(cs, [{ walkTo: [null, 0] }, { walkTo: [9.3, null] }, { act: 'interact' }]);
    expect([r.kinds, r.cs.state.room, r.cs.state.door]).toEqual([['enter'], 'reading', 'doorW']);
    r = play(r.cs, [{ wait: 0.1 }, { walkTo: [-5.3, 0] }, { act: 'interact' }]);
    expect([r.kinds, r.cs.state.room, r.cs.state.door, r.cs.state.turns]).toEqual([['enter'], 'shelf', 'doorE', { left: 6, undo: [] }]);
    expect(JSON.stringify(captureState(r.cs).rooms.shelf.objs.filter(o => o.id !== 'floor'))).toBe(JSON.stringify(JSON.parse(before).objs.filter((o: { id: string }) => o.id !== 'floor')));
    expect([hasItem(r.cs.world, TOOTH), get(r.cs, 'lampLin').used, get(r.cs, 'bookend').used]).toEqual([true, true, true]);
  });

  it('R 重進房間：魔方排列、燈、暗格、墨都回到進房時；魔方儀維持啟動 (R 不還原)', () => {
    let cs = activated();
    const entry = JSON.stringify(cs.entry.cube);
    cs = solveB(solveA(cs));
    cs = turnIn2d(cs, [-1]);
    cs = play(cs, LAMP('lampLin')).cs;
    cs = restartRoom(cs, OPTS);
    expect([JSON.stringify(cs.state.cube), get(cs, 'lampLin').used, get(cs, 'bookLock').used, hasItem(cs.world, TOOTH), cs.state.turns, cs.state.dial]).toEqual([entry, false, false, false, { left: 6, undo: [] }, true]);
  });

  it('存檔：寫入 → 讀回 → 開章 (房內讀檔不補墨)：排列、魔方儀、鎖扣、墨、燈、道具照舊；第一章的章節存檔原樣', () => {
    let cs = solveA(activated());
    cs = turnIn2d(cs, [-1]);
    cs = play(cs, LAMP('lampLin')).cs;
    const ch1 = { cube: CH1_SPEC.cube ? initialCube(CH1_SPEC.cube) : null };
    const base = { ...defaultSave(), cleared: ['1-1', '1-2', '1-3'], chapters: { 1: { ...chapterSave({ ...captureState(openChapter(CH1_SPEC, chapterStart(defaultSave(), CH1_SPEC, CH1.start, CH1.legacy), OPTS)) }), cube: ch1.cube! } } };
    const save = withChapter(base, captureState(cs));
    const s = memoryStorage();
    writeSave(s, save);
    const back = loadSave(s);
    expect(back).toEqual(save);
    expect(back.chapters!['1']).toEqual(base.chapters[1]);
    const c2 = back.chapters!['2'];
    expect([c2.dial, c2.unlocked, c2.turns, c2.at]).toEqual([true, ['row1'], { left: 4, undo: [] }, { room: 'shelf', door: 'doorW' }]);
    const again = openChapter(SPEC, chapterStart(back, SPEC, CH2.start), OPTS);
    expect([col(again), again.state.turns!.left, get(again, 'lampLin').used, get(again, 'bookend').used, again.world.ext.dial]).toEqual([1, 4, true, true, { active: true }]);
  });

  it('舊存檔不受影響：只有第一章 (或 v2) 的存檔開第二章 = 全新 (S0、魔方儀未啟動、墨 6)；第一章存檔不被改寫', () => {
    const old = { ...defaultSave(), cleared: ['1-1', '1-2', '1-3'], chapters: { 1: chapterSave(captureState(openChapter(CH1_SPEC, chapterStart(defaultSave(), CH1_SPEC, CH1.start, CH1.legacy), OPTS))) } };
    const st = chapterStart(old, SPEC, CH2.start);
    expect([cubeKey(st.cube!), st.room, st.door, st.dial, st.turns, st.items]).toEqual([cubeKey(initialCube(CH2_CUBE)), 'shelf', 'doorW', undefined, undefined, {}]);
    const cs = openChapter(SPEC, st, OPTS);
    expect([cs.state.turns, cs.world.ext.dial]).toEqual([{ left: 6, undo: [] }, { active: false }]);
    expect(withChapter(old, captureState(cs)).chapters!['1']).toEqual(old.chapters[1]);
  });
});

describe('進度：選單解鎖、通關記錄、繼續', () => {
  const s = (cleared: string[]) => ({ ...defaultSave(), cleared });
  it('2-1 在第一章通關 (1-3) 後開放；全新 / 只通關 1-2 的存檔仍鎖著；通關後 = cleared', () => {
    const e = levelById('2-1')!;
    expect([levelState(e, defaultSave()), levelState(e, s(['1-1', '1-2'])), levelState(e, s(['1-1', '1-2', '1-3'])), levelState(e, s(['1-1', '1-2', '1-3', '2-1']))]).toEqual(['locked', 'locked', 'open', 'cleared']);
    expect(isUnlocked(e, s(['1-3']))).toBe(true);
  });

  it('房間通關 (2-1 三題都完成) 只記 2-1、殘片寫進 save.scraps；之後「繼續」回到 2-1 (本章)', () => {
    const cs = solveC(solveB(solveA(activated(), [1, 1])), [[1, 1], [1], [1]]);
    cs.world.inv['scrap.1'] = 1;
    const save = recordClear(s(['1-1', '1-2', '1-3']), '2-1', cs.world, []);
    expect([save.cleared, save.scraps, save.current]).toEqual([['1-1', '1-2', '1-3', '2-1'], [1], '2-1']);
    expect(nextAfterClear('2-1', 'room', CHAPTERS)).toBe('2-1');
  });

  it('第一章章門打開 (1-3) 的「繼續」= 第二章第一關 2-1；1-1 門廊的「繼續」= 1-2；第一章不是控制盤章 → 房間不會「通關」', () => {
    expect([nextAfterClear('1-3', 'chapter', CHAPTERS), nextAfterClear('1-1', 'level', CHAPTERS), nextAfterClear('2-1', 'chapter', CHAPTERS)]).toEqual(['2-1', '1-2', '3-1']); // 第三章登錄後：第二章的章末 → 第三章第一關
    const ch1 = openChapter(CH1_SPEC, chapterStart(defaultSave(), CH1_SPEC, CH1.start, CH1.legacy), OPTS);
    expect(roomCleared(CH1_SPEC, ch1.state, ch1.world)).toBe(false);
  });
});

// ── 字條 (規格 7.1.1 H1～H10、7.1.3 預算；story-bible 7.3 的 2-1 版本) ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = shelf.objects.filter(o => o.type === 'note');
const CUBE_AHA = ['轉', '魔方', '排列', '滑', '對齊', '跟著', '一起', '整列', '整行', '墨', '鎖'];
const PUZZLES = [
  { id: '2-1a', difficulty: 3.5, notes: ['noteA'], keyObjects: ['dial', 'bookend', 'bay2'], ahaTerms: [...CUBE_AHA, '書擋', '盤面'], area: [-10, 10] as const },
  { id: '2-1b', difficulty: 4, notes: ['noteB'], keyObjects: ['bookD', 'bookYing', 'bookLock', 'remark1', 'remark2', 'remark3'], ahaTerms: ['視角', '藏寶圖', '實景', '劃掉', '假的', '騙', '最高', '凸', '影'], area: [-5, 3] as const },
  { id: '2-1c', difficulty: 4.5, notes: ['noteC'], keyObjects: ['lampLock', 'lampLin', 'lampShu', 'lampMen', 'bookend'], ahaTerms: [...CUBE_AHA, '順序', '密碼', '林', '門', '點亮'], area: [2, 7] as const }
];

describe('2-1 字條：量表 H1～H4、H9、H10 與預算', () => {
  it('三張字條 = story-bible 7.3 的 2-1a / 2-1b / 2-1c L1 原文；都是一開始就有字 (L1)', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual({
      noteA: '這排書架，比這間房還長。', noteB: '那年我很確定。現在看，不太確定了。', noteC: '書名照什麼排？我和你，永遠吵這個。'
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

  it('H9 口吻：沒有劃掉的字；每張是一句完整的話 (句號 / 問號結尾)；2-1c 是觀察問題 (問句)', () => {
    for (const o of notes) expect([o.id, noteText(o).includes('~~'), /[。？]$/.test(noteText(o))]).toEqual([o.id, false, true]);
    expect(noteText(def('noteC')).includes('？')).toBe(true);
  });

  it('H4 不點名本題關鍵物件 (顯示名)；H10 不含本題 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) { const lk = def(k).labelKey; if (lk) expect([id, k, t.includes(TEXT(lk))]).toEqual([id, k, false]); }
      for (const term of q.ahaTerms) expect([id, term, t.includes(term)]).toEqual([id, term, false]);
    }
  });

  it('預算 (7.1.3)：難度 3～4.5 → 每題 L1 一張、沒有 L2；每關提示 3 ≤ 謎題數 + 1；字條總數 (提示 + 劇情) ≤ 謎題數 + 3；眉批不是字條', () => {
    for (const q of PUZZLES) expect([q.id, q.notes.length]).toEqual([q.id, 1]);
    expect(PUZZLES.map(q => q.id)).toEqual(shelf.puzzles!.map(q => q.id));
    expect(notes.length).toBeLessThanOrEqual(shelf.puzzles!.length + 1);
    expect(notes.length).toBeLessThanOrEqual(shelf.puzzles!.length + 3);
    expect(shelf.objects.filter(o => o.type === 'remark').every(o => o.labelKey === 'lvl.2-1.remark')).toBe(true);
  });

  it('位置：每張在所屬謎題範圍內；兩張間距 ≥ 3；任一 16 單位寬畫面 ≤ 3 張；兩模式都讀得到', () => {
    for (const q of PUZZLES) for (const id of q.notes) expect(def(id).x >= q.area[0] && def(id).x <= q.area[1]).toBe(true);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const cs = start();
      runScript(cs.world, [{ place: [o.x, 0, o.z + 0.5], mode }]);
      expect([o.id, mode, findTarget(cs.world)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(cs.world);
      expect(cs.world.msg).toBe(noteText(o));
    }
  });
});
