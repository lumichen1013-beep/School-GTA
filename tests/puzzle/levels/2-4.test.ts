// 2-4 手稿庫 (規格 6「2-4 手稿庫（細化）」；M1 第二章第四關)：資料與驗證器、擺設深度帶、地板老宅圖 (各房一角 / 展開圖)、2-4 區 validateDial、
// 通關腳本 (2-4c → 2-4b (跨三房的線索) → 2-4a (排成手稿櫃的圖))、多解 (2-4a 兩種四步解)、每題反例、R、存檔、進度、音效、字條量表
import { describe, it, expect } from 'vitest';
import { manuscripts } from '../../../src/puzzle/content/levels/ch2/2-4-manuscripts';
import { HOUSE_TARGET } from '../../../src/puzzle/content/levels/ch2/drawing';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH2_CUBE, CH2_ZONE24 } from '../../../src/puzzle/content/cubes/ch2';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { attachedCards } from '../../../src/puzzle/mechanics/labels';
import { patternMatches } from '../../../src/puzzle/mechanics/manuscripts';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { applyTurn, cubeKey, initialCube, isBlocked, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { applyChapterCommand, captureState, openChapter, restartRoom, roomCleared, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCardTray } from '../../../src/puzzle/app/cardTrayModel';
import { deriveCubeMap } from '../../../src/puzzle/app/cubeMapModel';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { LevelObserver, type LevelSnap, type ObjSnap } from '../../../src/puzzle/audio/events';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC: ChapterSpec = { chapter: 2, cube: CH2.cube, rooms: CH2.rooms, doors: chapterDoors(CH2.rooms) };
const def = (id: string): ObjDef => manuscripts.objects.find(o => o.id === id)!;
const STRIP = 'strip:manuscripts';

const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH2.start), OPTS);
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;

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
  for (const t of ts) {
    const r = applyChapterCommand(cs, { t: 'turn', turn: t });
    if ('blocked' in r) throw new Error(`turn ${t.group} ${t.dir} blocked: ${r.blocked}`);
    cs = r;
  }
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
}
const T = (group: string, dir: 1 | -1 = 1): Turn => ({ group, dir });
const OPTS_TURN = CH2_CUBE.dial!.groups.flatMap(g => turnDirs(CH2_CUBE, g.id).map(dir => ({ group: g.id, dir })));
const isHouse = (s: CubeState) => Object.entries(HOUSE_TARGET).every(([r, at]) => s.pos[r][0] === at[0] && s.pos[r][1] === at[1]);
/** BFS：從此刻的排列到手稿櫃的圖的最短轉法 */
function toHouse(s0: CubeState): Turn[] {
  const prev = new Map<string, [string, Turn] | null>([[cubeKey(s0), null]]);
  const q: CubeState[] = [s0];
  while (q.length) {
    const s = q.shift()!;
    if (isHouse(s)) { const out: Turn[] = []; let k = cubeKey(s); for (let p = prev.get(k); p; p = prev.get(k)) { out.unshift(p[1]); k = p[0]; } return out; }
    for (const o of OPTS_TURN) { const r = applyTurn(CH2_CUBE, s, o); if (isBlocked(r) || prev.has(cubeKey(r))) continue; prev.set(cubeKey(r), [cubeKey(s), o]); q.push(r); }
  }
  throw new Error('unreachable');
}

// ── 路線 ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-6.5, -2.4] }, { act: 'interact' }];
const DOOR = (x: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [x, null] }, { act: 'interact' }];
const lane = (x: number, z: number, target: string): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [x, null] }, { walkTo: [null, z] }, { expect: w => expect(findTarget(w)?.def.id).toBe(target), label: target }];
/** 印房：活字架 → 門牌貼「日」(2-3a)；南拱門 (前緣) */
const CASE: Cmd[] = [...lane(-3.2, -3.6, 'typeCase'), { act: 'interact' }];
const PLATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, -2.2] }, { walkTo: [-2.6, null] }, { act: 'flip' }, { wait: 0.15 }, { act: 'interact' },
  { hold: { commands: [{ t: 'card', label: 'plate:print', card: 'card.ri' }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }];
const ARCH_S: Cmd[] = [{ wait: 0.1 }, { walkTo: [-2.6, null] }, { walkTo: [null, 3.9] }, { act: 'interact' }];
const CLUE_THICK: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 2.2] }, { walkTo: [-5.0, null] }, { walkTo: [null, 2.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('clueThick'), label: '線索②' }, { act: 'interact' }];
/** 手稿庫：北門 (x 1.5)、閉櫃門牌 (2D)、手稿捆 (3D)、手稿櫃 (3D) */
const DOOR_N: Cmd[] = [{ wait: 0.1 }, { walkTo: [1.5, null] }, { walkTo: [null, -3.6] }, { act: 'interact' }];
const STRIP_OFF: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 2.2] }, { walkTo: [-3.6, null] }, { act: 'flip' }, { wait: 0.15 }, { act: 'interact' },
  { hold: { commands: [{ t: 'uncard', label: STRIP, card: 'card.cai' }] }, seconds: 1 / 60 }, { act: 'flip' }, { wait: 0.15 }];
const PULL = (id: string, x: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, 1.3] }, { walkTo: [x, null] }, { expect: w => expect(findTarget(w)?.def.id).toBe(id), label: id }, { act: 'interact' }];
const CABINET: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, -2.4] }, { walkTo: [5.2, null] }, { walkTo: [null, -3.3] }, { expect: w => expect(findTarget(w)?.def.id).toBe('patternCab'), label: '手稿櫃' }, { act: 'interact' }];

/** 開章 → 啟動 → 上列 ◀ (印房到第 1 行，正下方是手稿庫) → 迴廊西門 → 印房 → 2-3a */
function printDone(): ChapterSession {
  let cs = play(start(), ACTIVATE).cs;
  cs = turns(cs, [T('row0', -1)]);
  cs = play(cs, DOOR(-9.3)).cs;
  expect(cs.state.room).toBe('print');
  cs = play(play(cs, CASE).cs, PLATE).cs;
  expect(get(cs, 'plateS').used).toBe(true);
  return cs;
}
/** 印房南拱門 → 手稿庫北門 */
function down(cs: ChapterSession): ChapterSession {
  const r = play(cs, ARCH_S);
  expect([r.cs.state.room, r.cs.state.door]).toEqual(['manuscripts', 'doorN']);
  return r.cs;
}
function solveC(cs: ChapterSession): ChapterSession {
  const r = play(cs, STRIP_OFF);
  expect([r.kinds, get(r.cs, 'cabPlate').used, get(r.cs, 'stripCab').used, hasItem(r.cs.world, 'card.cai')]).toEqual([['state', 'state'], true, true, true]);
  return r.cs;
}

describe('2-4 手稿庫：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 2-4a～2-4c；登錄表 2-4 前置 2-3；預算 6；門位北 1.5 / 東 9.8', () => {
    expect(validateLevel(manuscripts, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('2-4')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(manuscripts.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['2-4a 手稿拼圖', '2-4b 三份手稿', '2-4c 拆掉一半']);
    const e = levelById('2-4')!;
    expect([e.chapter, e.unlock.after, e.abilities, manuscripts.turnBudget, CH2.levels['2-4'], cubeChapterOf('2-4')]).toEqual([2, ['2-3'], ['nib'], { base: 6 }, 'manuscripts', CH2]);
    expect([def('doorN').x, def('doorE').x, manuscripts.bounds]).toEqual([1.5, 9.8, { minX: -6, maxX: 10, minZ: -5, maxZ: 5 }]);
    expect([TEXT(manuscripts.narrationKey), TEXT(manuscripts.nextKey)]).toEqual(['每份手稿都畫著這棟房子，格局都不一樣。', '手稿櫃裡的那張圖，終於和房子對上了。']);
    expect([def('patternCab').doneFlag, def('bundleLock').doneFlag, def('cabPlate').doneFlag]).toEqual(['2-4a', '2-4b', '2-4c']);
  });

  it('擺設規則：可互動物件落在後 / 中 / 前三帶 (layoutDepthIssues)', () => {
    expect(layoutDepthIssues(manuscripts)).toEqual([]);
  });

  it('地板老宅圖：六間房各帶一角 (floorPiece 的格 = 目標排列)；展開圖格子裡畫著同一角', () => {
    const pieces = Object.fromEntries(Object.entries(CH2.rooms).map(([r, lv]) => { const d = lv.decor?.find(x => x.kind === 'floorPiece'); return [r, d ? [d.px, d.py] : null]; }));
    expect(pieces).toEqual({ shelf: [1, 0], reading: [0, 0], print: [0, 1], mezz: [2, 0], manuscripts: [1, 1], deep: [2, 1] });
    expect(pieces).toEqual(Object.fromEntries(Object.keys(pieces).map(r => [r, [...HOUSE_TARGET[r]]])));
    const cs = start();
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    const map = deriveCubeMap(cs, TEXT);
    expect(map!.cells.map(c => [c.room, c.piece ? [c.piece.px, c.piece.py] : null])).toEqual([
      ['shelf', [1, 0]], ['reading', [0, 0]], ['print', [0, 1]], ['mezz', [2, 0]], ['manuscripts', [1, 1]], ['deep', [2, 1]]
    ]);
  });
});

describe('validateDial：2-4 區 (兩列 + 三行；門牌 plates)', () => {
  const m = { ...dialModelOf(CH2_ZONE24.cube, CH2.rooms, CH2_ZONE24.puzzles, CH2_ZONE24.start, CH2_ZONE24.finish), plates: CH2_ZONE24.plates };
  const r = validateDial(m);

  it('可達排列 720、抽象狀態 571,172 (< 2×10⁶)、有解、卡死 0 (含 R)；預算繞過 / 鎖扣 / 入口 / 前置繞過無問題', () => {
    expect([r.arrangements, r.states, r.solvable, r.deadlocks, r.needsRestart]).toEqual([720, 571172, true, [], 43377]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
  });

  it('每題：2-4b 的線索② 要轉一次 (▶ / ◀ 兩種，副範式 P1)；2-4a 最短 3、次短 4、本質不同 11；確定性', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.issues])).toEqual([
      ['2-1a', 1, 2, 3, 3, []], ['2-3a', 1, 1, 2, 2, []], ['2-4c', 0, null, 1, 1, []], ['2-4b.clue', 1, 1, 2, 2, []],
      ['2-4b', 0, null, 1, 1, []], ['2-4a', 3, 4, 21, 11, []], ['ch2.mid', 0, null, 1, 1, []]
    ]);
    expect(validateDial(m)).toEqual(r);
  });

  it('S0 到手稿櫃的圖：最短 4、本質不同的四步解 2 種 (上列 ◀◀ / ▶▶ 與第 0 行 ⇅ 兩次)；只用兩列 → 到不了', () => {
    const sols = new Set<string>();
    const rec = (s: CubeState, seq: string[]) => { if (seq.length === 4) { if (isHouse(s)) sols.add([...seq].sort().join(' ')); return; } for (const o of OPTS_TURN) { const n = applyTurn(CH2_CUBE, s, o); if (!isBlocked(n)) rec(n, [...seq, `${o.group}${o.dir}`]); } };
    rec(initialCube(CH2_CUBE), []);
    expect([toHouse(initialCube(CH2_CUBE)).length, [...sols].sort()]).toEqual([4, ['col01 col01 row0-1 row0-1', 'col01 col01 row01 row01']]);
    const noCol = { ...m, cube: { ...m.cube, dial: { ...m.cube.dial!, groups: m.cube.dial!.groups.filter(g => g.kind === 'row') } } };
    expect(validateDial(noCol).solvable).toBe(false);
  });
});

describe('通關腳本 (runScript)', () => {
  it('2-4c 拆「才」→ 閉櫃 (線索①) → 印房讀線索② (實景) → 書房深處的線索③只在藏寶圖 → 抽 B → 排成手稿櫃的圖 → 2-4 通關', () => {
    let cs = down(printDone());
    cs = solveC(cs);
    expect(cs.world.msg).toBe('「才」拆下來，只剩一個「門」。櫃門順手就開了，裡面是一張折起來的手稿：「綁紅繩的那幾捆，是我那年寫的。」');
    // 線索②：回到印房 (北門 ↔ 印房南拱門)
    let r = play(cs, DOOR_N);
    expect(r.cs.state.room).toBe('print');
    r = play(r.cs, CLUE_THICK);
    expect(r.cs.world.msg).toBe('厚的那幾捆，才是我留下的。');
    cs = down(r.cs);
    // 2-4b：抽 B
    r = play(cs, PULL('bundleB', 0));
    expect([r.kinds, hasItem(r.cs.world, 'ms.father'), r.cs.world.msg]).toEqual([['state'], true, '抽出來的那捆手稿，扉頁寫著：「給你。等你看得懂這棟房子的時候。」']);
    cs = r.cs;
    // 2-4a：人在手稿庫，照 BFS 的最短轉法排成圖 (墨 6 內)
    const ts = toHouse(cs.state.cube!);
    expect(ts.length).toBeLessThanOrEqual(6);
    cs = turns(cs, ts);
    expect(patternMatches(cs.world, get(cs, 'patternCab'))).toBe(true);
    r = play(cs, CABINET);
    expect([r.kinds, hasItem(r.cs.world, 'tooth.manuscripts'), r.cs.world.msg]).toEqual([['state'], true, '圖對上了。櫃門的鎖舌自己退了回去，抽屜裡躺著一枚銅鑰匙的齒。']);
    expect(roomCleared(SPEC, r.cs.state, r.cs.world)).toBe(true);
  });

  it('2-4a 另一種解：從 S0 (開場就在手稿庫的人) 全程往右 — 第 0 行 ⇅ / 上列 ▶ 交錯兩次', () => {
    let cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'manuscripts', door: 'doorN' }), OPTS);
    cs = { ...cs, state: { ...cs.state, dial: true, unlocked: ['row1', 'col0', 'col1', 'col2'] } };
    cs = turns(cs, [T('col0'), T('row0', 1), T('col0'), T('row0', 1)]);
    expect(isHouse(cs.state.cube!)).toBe(true);
    const r = play(cs, CABINET);
    expect(get(r.cs, 'patternCab').used).toBe(true);
  });
});

describe('反例', () => {
  it('2-4a：圖不對 → 櫃門不動；只有藏寶圖 (2D) 開不了櫃；三行沒解鎖 → 行轉鎖著', () => {
    let cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'manuscripts', door: 'doorN' }), OPTS);
    runScript(cs.world, CABINET);
    expect([cs.world.msgKey, get(cs, 'patternCab').used]).toEqual(['lvl.2-4.cab.not', false]);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(findTarget(cs.world)?.def.id).not.toBe('patternCab');
    cs = { ...cs, state: { ...cs.state, dial: true } };
    expect(applyChapterCommand(cs, { t: 'turn', turn: T('col0') })).toEqual({ blocked: 'locked' });
  });

  it('2-4b：照劃掉的線索抽 D / 只看紅繩抽 A / 抽 C → 「這捆只是草稿」；線索③只在藏寶圖、線索②只在實景；厚薄只在 z (藏寶圖上一樣寬)', () => {
    const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'manuscripts', door: 'doorN' }), OPTS);
    for (const [id, x] of [['bundleD', 2], ['bundleA', -1], ['bundleC', 1]] as const) {
      runScript(cs.world, PULL(id, x));
      expect([id, cs.world.msgKey, get(cs, 'bundleLock').used]).toEqual([id, 'lvl.2-4.bundle.wrong', false]);
    }
    expect(['bundleA', 'bundleB', 'bundleC', 'bundleD'].map(id => [def(id).w, def(id).d])).toEqual([[0.6, 0.25], [0.6, 0.6], [0.6, 0.6], [0.6, 0.25]]);
    const deep = CH2.rooms.deep.objects.find(o => o.id === 'clueWax')!;
    const thick = CH2.rooms.print.objects.find(o => o.id === 'clueThick')!;
    expect([deep.visible, thick.visible, TEXT(deep.type === 'remark' ? deep.textKey : '')]).toEqual(['2d', '3d', '那年我~~很確定~~猜：是封著蠟的那一捆。']);
  });

  it('2-4c：閉櫃在實景拉不開；門牌只在藏寶圖；貼「日」無效；拆過之後再貼「才」也無效 (只收拆)', () => {
    let cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'manuscripts', door: 'doorN' }), OPTS);
    runScript(cs.world, [{ walkTo: [null, 2.2] }, { walkTo: [-3.6, null] }, { act: 'interact' }]);
    expect(cs.world.msgKey).toBe('lvl.2-4.strip.locked');
    expect([isActiveIn(cs.world, get(cs, 'cabPlate'), '3d'), isActiveIn(cs.world, get(cs, 'cabPlate'), '2d')]).toEqual([false, true]);
    cs.world.inv['card.ri'] = 1;
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(deriveCardTray(cs.world, TEXT, 0)!.title).toBe('閉');
    expect(attachedCards(cs.world, get(cs, 'cabPlate'))).toEqual(['card.cai']);
    runScript(cs.world, [{ hold: { commands: [{ t: 'card', label: STRIP, card: 'card.ri' }] }, seconds: 1 / 60 }]);
    expect([cs.world.msgKey, get(cs, 'cabPlate').used]).toEqual(['msg.label.invalid', false]);
    runScript(cs.world, [{ hold: { commands: [{ t: 'uncard', label: STRIP, card: 'card.cai' }] }, seconds: 1 / 60 }]);
    cs = pump(cs).cs;
    expect([deriveCardTray(cs.world, TEXT, 0)!.title, get(cs, 'cabPlate').used]).toEqual(['門', true]);
    runScript(cs.world, [{ hold: { commands: [{ t: 'card', label: STRIP, card: 'card.cai' }] }, seconds: 1 / 60 }]);
    expect([cs.world.msgKey, hasItem(cs.world, 'card.cai')]).toEqual(['msg.label.invalid', true]);
  });
});

describe('R、存檔 v3、進度、音效', () => {
  it('R：閉櫃 / 門牌 / 才 / 手稿捆回到進房時', () => {
    let cs = solveC(down(printDone()));
    cs = restartRoom(cs, OPTS);
    expect([get(cs, 'cabPlate').used, get(cs, 'stripCab').used, hasItem(cs.world, 'card.cai'), attachedCards(cs.world, get(cs, 'cabPlate'))]).toEqual([false, false, false, ['card.cai']]);
  });

  it('存檔：寫入 → 讀回 → 開章：拆過的門牌、閉櫃照舊', () => {
    const cs = solveC(down(printDone()));
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH2.start), OPTS);
    expect([back.state.room, get(back, 'cabPlate').used, get(back, 'stripCab').used, hasItem(back.world, 'card.cai')]).toEqual(['manuscripts', true, true, true]);
  });

  it('2-4 在 2-3 通關後開放；「繼續」回到 2-4', () => {
    const s = (cleared: string[]) => ({ ...defaultSave(), cleared });
    const e = levelById('2-4')!;
    expect([levelState(e, s(['2-2'])), levelState(e, s(['2-3']))]).toEqual(['locked', 'open']);
    expect(nextAfterClear('2-4', 'room', CHAPTERS)).toBe('2-4');
  });

  it('音效：手稿櫃 / 閉櫃打開、抽出手稿捆', () => {
    const obj = (id: string, type: string, used = false): ObjSnap => ({ id, type, used, gone: false, x: 0, z: 0 });
    const snap = (objs: ObjSnap[]): LevelSnap => ({ world: OPTS, room: 'manuscripts', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: null, mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: '' });
    const o = new LevelObserver();
    o.update(snap([obj('a', 'patternCabinet'), obj('b', 'smallCabinet'), obj('c', 'bundle')]));
    expect(o.update(snap([obj('a', 'patternCabinet', true), obj('b', 'smallCabinet', true), obj('c', 'bundle', true)])).map(x => (x.kind === 'sfx' ? x.id : x.kind))).toEqual(['sfx.drawer.open', 'sfx.drawer.open', 'sfx.book.pull']);
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = manuscripts.objects.filter(o => o.type === 'note');
const CUBE_AHA = ['轉', '魔方', '排列', '滑', '對齊', '跟著', '一起', '整列', '整行', '墨', '鎖'];
const PUZZLES = [
  { id: '2-4a', notes: ['noteA'], keyObjects: ['patternCab'], ahaTerms: [...CUBE_AHA, '拼', '地板', '展開圖', '排'], area: [4, 10] as const },
  { id: '2-4b', notes: ['noteB'], keyObjects: ['rack', 'bundleB', 'bundleLock'], ahaTerms: ['紅繩', '厚', '蠟', '捆', '劃掉', '線索'], area: [-2, 4] as const },
  { id: '2-4c', notes: ['noteC'], keyObjects: ['stripCab', 'cabPlate'], ahaTerms: ['拆', '部件', '才', '字', '門', '閉', '寫'], area: [-6, 0] as const }
];

describe('2-4 字條：量表 H1～H4、H9、H10 與預算', () => {
  it('三張 = story-bible 7.3 的 2-4 L1；H1 ≤ 24；H2 / H3；H9', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual({
      noteC: '有時候，多出來的那一點，正是麻煩。', noteB: '我寫給自己的話，不一定都對。', noteA: '每一份，都只畫對了一角。'
    });
    for (const o of notes) {
      const t = noteText(o);
      expect([...t.replace(/\s+/g, '')].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t) || /先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t) || /[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
      expect([t.includes('~~'), /[。？]$/.test(t)]).toEqual([false, true]);
    }
  });

  it('H4 / H10；位置在題目範圍內、間距 ≥ 3、兩模式都讀得到', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) { const lk = def(k).labelKey; if (lk) expect([id, k, t.includes(TEXT(lk))]).toEqual([id, k, false]); }
      for (const term of q.ahaTerms) expect([id, term, t.includes(term)]).toEqual([id, term, false]);
      expect([id, def(id).x >= q.area[0] && def(id).x <= q.area[1]]).toEqual([id, true]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, { room: 'manuscripts', door: 'doorN' }), OPTS);
      runScript(cs.world, [{ place: [o.x, 0, o.z + 0.9], mode }]);
      expect([o.id, mode, findTarget(cs.world)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(cs.world);
      expect(cs.world.msg).toBe(noteText(o));
    }
  });
});
