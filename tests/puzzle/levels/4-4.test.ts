// 4-4 最後的抽屜 (規格 6「4-4 最後的抽屜（細化）」)：資料、字條、筆記拴著、追逐 2 (預兆 / 爬下 / 追 / 被追上 / 轉開 = 4-4a / calm / 確定性)、
// 墨閘與最後一個抽屜、整段最短 3 (兩步窮舉做不到)、章門 = 第四章通關、validateDial (CH4_ZONE44)、R、音效
import { describe, it, expect } from 'vitest';
import { drawer } from '../../../src/puzzle/content/levels/ch4/4-4-drawer';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH4_CUBE, CH4_ZONE44 } from '../../../src/puzzle/content/cubes/ch4';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { hatchChaseRun } from '../../../src/puzzle/mechanics/drawer';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyTurn, initialCube, isBlocked, links, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { dialTurn, openChapter, restartRoom, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CALM = { ...OPTS, calm: true };
const CH4 = CUBE_CHAPTERS.find(c => c.chapter === 4)!;
const SPEC = chapterSpecOf(CH4);
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
function pump(cs: ChapterSession, opts = OPTS): ChapterSession {
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    const r = applyChapterEvent(cs, e, opts);
    if (r.kind === 'enter') return r.next;
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return cs;
}
const play = (cs: ChapterSession, cmds: Cmd[], opts = OPTS) => { runScript(cs.world, cmds); return pump(cs, opts); };
const spin = (u: number, l: number): CubeState => [...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1))]
  .reduce<CubeState>((s, t) => { const r = applyTurn(CH4_CUBE, s, t); if (isBlocked(r)) throw new Error(r.blocked); return r; }, initialCube(CH4_CUBE));
/** 4-1～4-3 之後 (下層鬆開、墨爐閥開著 (valve)、踏板壓著)，從梯口爬進抽屜；排列 (u, l) */
function inDrawer(u = 1, l = 0, valve = true, opts = OPTS): ChapterSession {
  const rooms: ChapterState['rooms'] = {
    furnace: { objs: [{ id: 'inkValve', x: -3.4, y: 0, z: -3, gone: false, used: valve, touched: false }], flags: [] },
    drawer: { objs: [{ id: 'rootPlate', x: -6, y: 0, z: -2.4, gone: false, used: true, touched: false }], flags: [] }
  };
  const st: ChapterState = { ...chapterStart(defaultSave(), SPEC, CH4.start), room: 'drawer', door: 'hatchU', cube: spin(u, l), dial: true, unlocked: ['L0'], rooms };
  const cs = openChapter(SPEC, st, opts);
  runScript(cs.world, [{ wait: 1 / 30 }]);
  return pump(cs, opts);
}
const takeNotes = (cs: ChapterSession, opts = OPTS) => play(cs, [{ place: [1.6, 0, -0.3], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }], opts);
const turn2d = (cs: ChapterSession, t: Turn, opts = OPTS): ChapterSession => { runScript(cs.world, [{ place: [cs.world.player.x, 0, cs.world.player.z3d], mode: '2d' }, { wait: 0.05 }]); const r = ok(dialTurn(cs, t)); runScript(r.world, [{ wait: 1 / 30 }]); return pump(r, opts); };

describe('4-4 最後的抽屜：資料', () => {
  it('validateLevel / validateEntry 0 issue；謎題 4-4a / 4-4b / 章門；登錄 (前置 4-3)；墨 { base 8, 4-4b: 4 }；擺設三帶', () => {
    expect(validateLevel(drawer, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('4-4')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(drawer.puzzles!.map(q => [q.id, TEXT(q.titleKey)])).toEqual([['4-4a', '4-4a 殘影走的那扇門'], ['4-4b', '4-4b 最後一個抽屜'], ['4-4', '追逐・章門']]);
    expect([levelById('4-4')!.unlock.after, CH4.levels['4-4'], drawer.turnBudget, TEXT(drawer.narrationKey), TEXT(drawer.nextKey)])
      .toEqual([['4-3'], 'drawer', { base: 8, puzzles: { '4-4b': 4 } }, '爸爸的筆記寫到那一晚，就停了。', '地下室往上翻了。']); // 第五章骨架：拿掉「第五章　閣樓——還在路上。」
    expect(layoutDepthIssues(drawer)).toEqual([]);
  });

  it('字條：四張；原文；H1～H4 / H10；間距 ≥ 3、任一 16 單位畫面 ≤ 3 張；兩個視角都讀得到', () => {
    const notes = drawer.objects.filter(o => o.type === 'note');
    const txt = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -12, '跟著你的，只走你走過的路。', undefined], ['noteA2', -8.5, '它下來的那條路，現在還在嗎？', 240],
      ['noteB', 4, '開門要先，關門要後。', undefined], ['noteB2', 8.5, '拿到東西以後，還要從哪裡出去？', 240]
    ]);
    const AHA = ['轉', '層', '梯', '斷', '接', '墨', '流', '追', '影'];
    const KEYS = ['年輪根盤', '梯口', '墨閘', '墨爐閥', '筆記', '抽屜', '殘影'];
    for (const o of notes) {
      const t = txt(o);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t) || /^(把|先|去|到)/.test(t)).toBe(false);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = createWorld(drawer, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
    }
  });
});

describe('4-4a 殘影走的那扇門 (P8 首次；追逐 2)', () => {
  it('梯子沒接著走廊：筆記拉不開 (根繩拴著)', () => {
    const cs = takeNotes(inDrawer(1, 0));
    runScript(cs.world, []);
    const c2 = takeNotes(turn2d(inDrawer(1, 0), T('L1', 1)));
    expect([get(cs, 'notesDesk').used, get(c2, 'notesDesk').used, c2.world.msg]).toEqual([true, false, '抽屜被一條根繩拴在梯子上。梯子接不到上面時，繩子是緊的。']);
  });

  it('拿到筆記 → 預兆 3 秒 → 爬下 4 秒 → 在藏寶圖裡追；被追上 = 回書桌前、重來；轉開梯口 = 拉回梯口 = 4-4a；確定性 (兩次逐幀相同)', () => {
    const runOnce = (): { cs: ChapterSession; xs: number[] } => {
      let cs = takeNotes(inDrawer(1, 0));
      expect([get(cs, 'notesDesk').used, hasItem(cs.world, 'notes.father'), hatchChaseRun(cs.world).phase]).toEqual([true, true, 'omen']);
      const xs: number[] = [];
      runScript(cs.world, [{ place: [8, 0, 0], mode: '2d' }], { onFrame: w => xs.push(w.byId.get('hatchChaser')!.x) });
      runScript(cs.world, [{ wait: 3.1 }], { onFrame: w => xs.push(w.byId.get('hatchChaser')!.x) });
      expect(hatchChaseRun(cs.world).phase).toBe('descend');
      runScript(cs.world, [{ wait: 4.1 }], { onFrame: w => xs.push(w.byId.get('hatchChaser')!.x) });
      expect(hatchChaseRun(cs.world).phase).toBe('run');
      runScript(cs.world, [{ wait: 2 }], { onFrame: w => xs.push(w.byId.get('hatchChaser')!.x) });
      cs = pump(cs);
      return { cs, xs };
    };
    const a = runOnce(), b = runOnce();
    expect(a.xs).toEqual(b.xs);
    expect(a.xs[a.xs.length - 1]).toBeGreaterThan(-6);
    // 一直待在藏寶圖：被追上
    let cs = a.cs;
    runScript(cs.world, [{ wait: 8 }]);
    cs = pump(cs);
    expect([hatchChaseRun(cs.world).caught, cs.world.player.x, cs.world.msg]).toEqual([1, 2.4, '圖面一皺。你回到了書桌前。']);
    // 轉開梯口 (上層 ↻)：殘影拉回梯口 = 4-4a
    cs = turn2d(cs, T('L1', 1));
    expect([get(cs, 'ladderCut').used, hatchChaseRun(cs.world).phase, get(cs, 'hatchChaser').used, cs.world.msg]).toEqual([true, 'idle', false, '梯子斷了。殘影停在上面，下不來了。']);
  });

  it('下層轉也一樣斷得開；calm：殘影不出現，拿筆記後轉開梯口照樣 = 4-4a', () => {
    let cs = takeNotes(inDrawer(1, 0));
    cs = turn2d(cs, T('L0', -1));
    expect(get(cs, 'ladderCut').used).toBe(true);
    let c = takeNotes(inDrawer(1, 0, true, CALM), CALM);
    runScript(c.world, [{ wait: 8 }]);
    expect([hatchChaseRun(c.world).phase, get(c, 'hatchChaser').used]).toEqual(['idle', false]);
    c = turn2d(c, T('L1', 1), CALM);
    expect(get(c, 'ladderCut').used).toBe(true);
  });
});

describe('4-4b 最後一個抽屜 (P4 / P15)', () => {
  it('墨閘乾著 (梯口斷開、或墨爐閥沒開) → 抽屜拉不開；疊回去 → 墨流過墨閘 → 拉開 = 鑰匙 + 手記第四頁 = 4-4b；殘影又會下來 → 轉到章門 (下層 ↺：同時斷開) → 章門 = 第四章通關', () => {
    let cs = turn2d(takeNotes(inDrawer(1, 0)), T('L1', 1)); // 4-4a
    runScript(cs.world, [{ place: [2.4, 0, -3.0], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }]);
    expect([get(cs, 'lastDrawer').used, cs.world.msg]).toEqual([false, '最後一個抽屜被墨閘封著。']);
    cs = turn2d(cs, T('L1', -1)); // 疊回去：墨閘化開、殘影又開始
    expect([get(cs, 'gate').used, hatchChaseRun(cs.world).phase, cs.world.msg]).toEqual([true, 'omen', TEXT('lvl.4-4.gate.solved')]); // 第二次預兆不說話：墨閘那句留著
    cs = play(cs, [{ place: [2.4, 0, -3.0], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }]);
    expect([get(cs, 'lastDrawer').used, hasItem(cs.world, 'key.cellar'), hasItem(cs.world, 'diary.4'), cs.world.msg])
      .toEqual([true, true, true, TEXT('lvl.4-4.drawer.take')]);
    expect(cs.state.turns!.left).toBe(2);
    cs = turn2d(cs, T('L0', -1));
    expect([cs.state.cube!.pos.drawer.slice(0, 2), hatchChaseRun(cs.world).phase, cs.state.turns!.left]).toEqual([[1, 0], 'idle', 1]);
    runScript(cs.world, [{ place: [12.9, 0, 0], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }]);
    expect([cs.world.cleared, get(cs, 'chapterE').used, nextAfterClear('4-4', 'chapter', CHAPTERS)]).toEqual([true, true, '5-1']); // 第五章骨架：前往第五章　閣樓
    const save = recordClear({ ...defaultSave(), cleared: ['3-4'] }, '4-4', cs.world, Object.keys(CH4.levels));
    expect(save.cleared.slice(-4)).toEqual(['4-1', '4-2', '4-3', '4-4']);
  });

  it('墨爐閥沒開：疊回去墨閘照樣乾；章門沒有鑰匙 = 鎖著；抽屜不在北邊 = 門後是牆', () => {
    let cs = turn2d(takeNotes(inDrawer(1, 0, false)), T('L1', 1));
    cs = turn2d(cs, T('L1', -1));
    runScript(cs.world, [{ place: [3.4, 0, -3.0], mode: '3d' }, { wait: 0.05 }]);
    expect(get(cs, 'gate').used).toBe(false);
    runScript(cs.world, [{ place: [12.9, 0, 0], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('門後是牆。');
    const n = turn2d(inDrawer(1, 0), T('L0', -1));
    runScript(n.world, [{ place: [12.9, 0, 0], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }]);
    expect([n.world.msg, n.world.cleared]).toEqual(['門鎖著。鑰匙孔是銅的。', false]);
  });

  it('整段 (拿筆記之後：先斷開 → 疊回 (墨閘) → 最後斷開且抽屜在北邊) 最短 3：兩步的 16 種走法都做不到、三步做得到 → 墨 4 = 最短 + 1', () => {
    const opts = CH4_CUBE.dial!.groups.flatMap(g => [-1, 1].map(dir => ({ group: g.id, dir: dir as 1 | -1 })));
    const doors = SPEC.doors;
    const onDrawer = (s: CubeState) => links(CH4_CUBE, s, doors).some(l => l.from.room === 'hall' && l.from.door === 'hatchD' && 'room' in l.to && l.to.room === 'drawer');
    const done = (path: CubeState[]) => {
      const cut = path.findIndex((s, i) => i > 0 && !onDrawer(s));
      if (cut < 0) return false;
      const gate = path.findIndex((s, i) => i > cut && onDrawer(s));
      const last = path[path.length - 1];
      return gate > 0 && !onDrawer(last) && last.pos.drawer[0] === 1 && last.pos.drawer[1] === 0;
    };
    const search = (n: number): boolean => {
      const go = (path: CubeState[]): boolean => {
        if (path.length === n + 1) return done(path);
        return opts.some(o => { const r = applyTurn(CH4_CUBE, path[path.length - 1], o); return !isBlocked(r) && go([...path, r]); });
      };
      return go([spin(1, 0)]);
    };
    expect([search(2), search(3)]).toEqual([false, true]);
  });
});

describe('validateDial：4-4 區 (CH4_ZONE44)、R、音效', () => {
  // 4-4b 的墨 4 是「每次進抽屜」的量：站到墨爐 / 走廊用那間的墨轉，再走回抽屜，就繞得過 (budgetBypass 如實列出；規格 4-4 實作註記)
  it('16 排列、抽象狀態 26,270、卡死 0、需要 R 148；4-4a 1 / 1 / 4 / 4、gate 1 / 1 / 118 / 46、4-4b 1 / 1 / 10 / 6 (從墨閘開過的狀態起算、墨 4)；預算繞過 = 換房補墨', () => {
    const m = dialModelOf(CH4_ZONE44.cube, CH4.rooms, CH4_ZONE44.puzzles, CH4_ZONE44.start, CH4_ZONE44.finish);
    const r = validateDial(m);
    expect([r.arrangements, r.states, r.needsRestart, r.solvable, r.deadlocks, r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([16, 26270, 148, true, [], [], ['4-4b: doable with < 1 turns per visit to drawer (refill by changing rooms)'], [], []]);
    expect(r.perPuzzle.filter(p => ['4-4a', 'gate', '4-4b'].includes(p.id)).map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues]))
      .toEqual([['4-4a', 1, 1, 4, 4, 8, []], ['gate', 1, 1, 118, 46, 8, []], ['4-4b', 1, 1, 10, 6, 4, []]]);
  });
  it('R：拿筆記後 R → 筆記回桌上、殘影不在', () => {
    const cs = takeNotes(inDrawer(1, 0));
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 0.1 }]);
    expect([get(back, 'notesDesk').used, hatchChaseRun(back.world).phase]).toEqual([false, 'idle']);
  });
  it('USED_ON：筆記 / 最後一個抽屜 / 4-4a 的旗標物件；墨閘 = 墨線鎖', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'drawer', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('n', 'notesDesk', false), o('d', 'lastDrawer', false), o('c', 'chaseMark', false), o('g', 'inkLock', false)]));
    const out = obs.update(s([o('n', 'notesDesk', true), o('d', 'lastDrawer', true), o('c', 'chaseMark', true), o('g', 'inkLock', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.note.read', 'sfx.drawer.open', 'sfx.latch.open', 'sfx.door.unseal']);
  });
});
