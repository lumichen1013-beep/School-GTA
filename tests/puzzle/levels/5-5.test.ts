import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH5_AFTER51, CH5_CUBE, CH5_MIDDLE_CUBE, CH5_REDRAW, CH5_ZONE55A, ch5Zone55a, ch5Zone55b, ch5Zone55c, faceOf } from '../../../src/puzzle/content/cubes/ch5';
import { engineChaseRun } from '../../../src/puzzle/mechanics/engine';
import { east, engine, landing, north, sky, west } from '../../../src/puzzle/content/levels/ch5/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { findTarget } from '../../../src/puzzle/core/interact';
import { applyTurn, cubeKey, initialCube, isBlocked, links, slitOf, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { activePlates, chapterLinks, clearedRooms, dialBlocked, dialTurn, doneFlags, groupHidden, openChapter, restartRoom, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { bossStage } from '../../../src/puzzle/audio/score';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const, 'scale' as const] };
const CH5 = CUBE_CHAPTERS.find(c => c.chapter === 5)!;
const SPEC = chapterSpecOf(CH5);

/** 世界事件 → 章節層 (同 LevelSession；貼卡 / 取卡也重算門的接法) */
function pump(cs: ChapterSession): ChapterSession {
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    const r = applyChapterEvent(cs, e, OPTS);
    if (r.kind === 'enter') return r.next;
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return cs;
}
const play = (cs: ChapterSession, cmds: Cmd[]) => { runScript(cs.world, cmds); return pump(cs); };
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
/** 轉 (每轉完走一步：光槽在 afterPhysics 讀章節層寫入的星光) */
const turn = (cs: ChapterSession, ...ts: Turn[]) => ts.reduce((c, t) => play(pump(ok(dialTurn(c, t))), [{ wait: 0.05 }]), cs);
const seq = (s: string): Turn[] => s.split(' ').filter(Boolean).map(x => T(x.slice(0, 2), x[2] === '+' ? 1 : -1));
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind}`);
  return r.next;
};
const flip: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];
const as = (m: '2d' | '3d') => (cs: ChapterSession): ChapterSession => { if (cs.world.player.mode !== m) runScript(cs.world, flip); return cs; };
const in2d = as('2d');
const in3d = as('3d');
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });
const apply = (s: CubeState, ts: Turn[]): CubeState => ts.reduce<CubeState>((c, t) => { const r = applyTurn(CH5_CUBE, c, t); if (isBlocked(r)) throw new Error(r.blocked); return r; }, s);

/** 三扇窗都完成 (各房快照裡的題物件 used)：東窗的詩、西窗的書桌、北窗的吊秤 */
const WINDOWS_DONE: ChapterState['rooms'] = {
  east: { objs: [{ id: 'poem', x: 9.6, y: 1, z: 0, gone: false, used: true, touched: false }], flags: [] },
  west: { objs: [{ id: 'deskBook', x: 2.35, y: 0.76, z: -3.3, gone: false, used: true, touched: false }], flags: [] },
  north: { objs: [{ id: 'scale', x: 3.6, y: 0, z: -1, gone: false, used: true, touched: false }], flags: [] }
};
/** 三扇窗都完成、5-1 完成後的排列 (機關南門 ↔ 梁上走道 B ↔ 西窗地板梯口)、人在西窗；章節道具 = 尺度卡 + 可寫的手記頁 */
function windowsDone(extra: Partial<ChapterState> = {}): ChapterSession {
  const st = chapterStart(defaultSave(), SPEC, CH5.start);
  return in3d(openChapter(SPEC, { ...st, cube: clone(CH5_AFTER51), room: 'west', door: 'hatchD', dial: true, rooms: clone(WINDOWS_DONE), items: { 'card.da': 1, 'card.xiao': 1, 'page.blank': 1 }, ...extra }, OPTS));
}
/** 走進機關 (第一次 = 地板被重畫) */
const intoEngine = (): ChapterSession => in3d(through(windowsDone(), 'hatchD'));
/** 實景：工具箱拿「日」；藏寶圖：北門 / 南門門牌貼 / 取「日」 */
const TAKE_RI: Cmd[] = [{ walkTo: [-8.4, 2.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('toolbox'), label: '工具箱' }, { act: 'interact' }, { wait: 0.05 }];
const PLATE = (door: 'N' | 'S'): Cmd[] => [{ walkTo: [door === 'N' ? -6.0 : 6.0, null] }, card(`plate:engine${door}`, 'card.ri'), { wait: 0.05 }];
const UNPLATE = (door: 'N' | 'S'): Cmd[] => [{ walkTo: [door === 'N' ? -6.0 : 6.0, null] }, uncard(`plate:engine${door}`, 'card.ri'), { wait: 0.05 }];
/** 實景：對光槽按 E */
const SLOTS: Cmd[] = [{ walkTo: [3.2, -3.6] }, { expect: w => expect(findTarget(w)?.def.id).toBe('slots'), label: '光槽' }, { act: 'interact' }];
const SOLVED = '三扇窗的光，一扇接一扇，從那道門縫流了進來。齒輪牆上的三道光槽同時亮了——機關醒了。';
const A = 'Y1- X1- Z1- Z1- X1- Z1+';
const B = 'Y1+ Z1+ X1- Y1- Y1- X1-';
/** 5-5a 的 13 種 6 轉解 (探索腳本 / validateDial 列舉) */
const ALL_A = ['X1+ Y1- X1- Y1- X1+ Z1+', A, 'Y1- X1- Z1+ Z1+ X1- Z1+', 'Y1- X1+ Z1- Z1- X1+ Z1+', 'Y1- X1+ Z1+ Z1+ X1+ Z1+', 'Y1+ X1- Y1- Y1- X1- Z1-', 'Y1+ X1- Y1+ Y1+ X1- Z1-',
  'Y1+ X1+ Y1- Y1- X1+ Z1-', 'Y1+ X1+ Y1+ Y1+ X1+ Z1-', B, 'Y1+ Z1+ X1- Y1+ Y1+ X1-', 'Y1+ Z1+ X1+ Y1- Y1- X1+', 'Y1+ Z1+ X1+ Y1+ Y1+ X1+'];
/** 5-5a 完成 (解法 A)、人在機關 (藏寶圖)；殘影還沒出來 */
const after55a = (calm = false): ChapterSession => {
  const cs = in2d(play(in2d(play(intoEngine(), TAKE_RI)), PLATE('N')));
  if (calm) cs.world.rt.calm = true;
  return turn(cs, ...seq(A));
};
/** 沿此刻接通的門走到 room (最短的一串門；封住的門照樣擋) */
function walk(cs: ChapterSession, room: string): ChapterSession {
  const ls = chapterLinks(cs.spec, cs.state.cube!, cs.world.ext.labels ?? cs.state.labels).filter(l => 'room' in l.to && l.from.room !== 'meadow' && l.to.room !== 'meadow');
  const prev = new Map<string, { from: string; door: string }>([[cs.state.room, { from: '', door: '' }]]);
  const q = [cs.state.room];
  while (q.length) { const r = q.shift()!; for (const l of ls) if (l.from.room === r && 'room' in l.to && !prev.has(l.to.room)) { prev.set(l.to.room, { from: r, door: l.from.door }); q.push(l.to.room); } }
  if (!prev.has(room)) throw new Error(`${cs.state.room} -> ${room}: no path`);
  const doors: string[] = [];
  for (let r = room; r !== cs.state.room; r = prev.get(r)!.from) doors.unshift(prev.get(r)!.door);
  return doors.reduce((c, d) => through(c, d), cs);
}
/** 實景：對焦點按 E */
const FOCUS: Cmd[] = [{ walkTo: [0, 1.6] }, { expect: w => expect(findTarget(w)?.def.id).toBe('focus'), label: '焦點' }, { act: 'interact' }];
/** 5-5b 完成 (解法 A 的終局 → 東西軸 ↻ → 上下軸 ↺：北窗的光從北門的「間」照進來)、人在機關 */
const after55b = (calm = false): ChapterSession => turn(after55a(calm), T('X1', 1), T('Z1', -1));
/** 藏寶圖裡原地等 (秒) */
const wait = (cs: ChapterSession, sec: number) => play(cs, [{ wait: sec }]);

describe('5-5 最後的機關：資料', () => {
  it('validateLevel / validateEntry 0 issue；三題；墨 10 (5-5a 進行中 7、完成補滿)；三帶；門位不變 + 門牌；通關文字；登錄 (三扇窗都通關後開放)', () => {
    expect(validateLevel(engine, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib', 'scale'] })).toEqual([]);
    expect(validateEntry(levelById('5-5')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(layoutDepthIssues(engine)).toEqual([]);
    expect([engine.id, engine.puzzles!.map(p => [p.id, TEXT(p.titleKey)]), engine.turnBudget, TEXT(engine.narrationKey), TEXT(engine.nextKey), engine.bounds.minX, engine.bounds.maxX]).toEqual([
      '5-5', [['5-5a', '5-5a 地板被重畫'], ['5-5b', '5-5b 殘影守門'], ['5-5c', '5-5c 收束']], { base: 10, puzzles: { '5-5a': 7 }, refillOn: ['5-5a'] },
      '三道光要落在同一點。', '三道光落在同一點。魔方收束了——頭頂的梯口，通往最深處。', -14, 14
    ]);
    const doors = engine.objects.filter(o => o.type === 'cubeDoor').map(o => o.type === 'cubeDoor' && [o.id, o.x, o.z, o.sealed?.until, o.sealed?.both ?? false, o.plate ?? null]);
    expect(doors).toEqual([['doorN', -6, -4.8, 'ch5.windows', true, 'plate:engineN'], ['doorS', 6, 4.8, 'ch5.windows', true, 'plate:engineS'], ['hatchU', 0, -4.4, '5-5c', false, null]]);
    const plates = engine.objects.filter(o => o.type === 'doorPlate').map(o => [o.id, o.x, o.z, o.visible, o.label?.id, o.label?.answers]);
    expect(plates).toEqual([['plateN', -6, -4.4, '2d', 'plate:engineN', ['card.ri']], ['plateS', 6, 4.4, '2d', 'plate:engineS', ['card.ri']]]);
    const tb = engine.objects.find(o => o.id === 'toolbox')!;
    expect([tb.type, tb.type === 'typeCase' && tb.gives, TEXT(tb.useText ?? ''), tb.z > 2]).toEqual(['typeCase', ['card.ri'], '工具箱裡有一盒拆開的活字。盒底只剩一個「日」。', true]);
    expect([levelById('5-5')!.unlock, levelById('5-5')!.abilities, CH5.levels['5-5'], CHAPTERS.find(c => c.id === 5)!.levels]).toEqual([{ after: ['5-2', '5-3', '5-4'] }, ['nib', 'scale'], 'engine', ['5-1', '5-2', '5-3', '5-4', '5-5']]);
  });

  it('洞位 (只在側牆、平常不在場)：天窗間 N / W、樓梯口 E / W、東窗 S、西窗 N、北窗 W', () => {
    const holes = (l: typeof sky) => l.objects.filter(o => o.type === 'cubeDoor' && o.hole).map(o => o.type === 'cubeDoor' && [o.id, o.side, o.x, o.z]);
    expect([holes(sky), holes(landing), holes(east), holes(west), holes(north), holes(engine)]).toEqual([
      [['holeN', 'N', 7.6, -4.8], ['holeW', 'W', -11.8, 0]], [['holeE', 'E', 5.8, 0], ['holeW', 'W', -5.8, 0]], [['holeS', 'S', 0.6, 4.8]], [['holeN', 'N', -7.6, -4.8]], [['holeW', 'W', -9.8, 0]], []
    ]);
  });

  it('字條：六張 (三題各 L1 + 空白 L2)；原文；H1～H4 / H10；間距 ≥ 3', () => {
    const notes = engine.objects.filter(o => o.type === 'note');
    const txt = (o: (typeof notes)[number]) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -12.4, '墨不多。想好哪個字該補，再動手。', undefined], ['noteB', 12.4, '攔路的那一位，是從亮處走來的。', undefined],
      ['noteC', -9.4, '三段話裡，有一段是只看過一扇的人寫的。', undefined],
      ['noteA2', -4.0, '缺的那一筆，補在自己這一頭。', 240], ['noteC2', 2.0, '聽另兩段的。他們看過的，比我多。', 240], ['noteB2', 9.4, '斷掉他的來路，也別斷了自己的亮。', 240]
    ]);
    const AHA = ['轉', '片', '軸', '面', '外', '小', '縮', '窗', '倒', '讀', '合', '秤', '重', '光', '對', '齊', '符', '陣', '門'];
    const KEYS = ['門牌', '活字', '工具箱', '底盤', '展開圖', '光槽', '殘影', '焦點', '手記', '天窗銘文', '窗縫'];
    for (const o of notes) {
      const t = txt(o);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t) || /^(把|先|去|到)/.test(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(o.type === 'note' && o.revealAfter ? 30 : 24);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    // 門牌 (藏寶圖) 與字條在 2D 至少隔 1.5 (站在門牌下按 E 開的是門牌的標籤)
    for (const px of [-6, 6]) for (const x of xs) expect(Math.abs(px - x)).toBeGreaterThanOrEqual(1.5);
  });
});

describe('5-5 地板被重畫與星光', () => {
  it('ch5.windows = 5-2 && 5-3 && 5-4 (推導旗標)；CH5_REDRAW = 5-1 完成 → SW↻ → SB↺ → X1↺ Z1↺ X1↺ Z1↻ X1↻', () => {
    const cs = windowsDone();
    expect(['5-2', '5-3', '5-4', 'ch5.windows'].map(f => doneFlags(cs.spec, cs.state, cs.world).has(f))).toEqual([true, true, true, true]);
    const two = windowsDone({ rooms: { east: WINDOWS_DONE.east, west: WINDOWS_DONE.west } });
    expect(doneFlags(two.spec, two.state, two.world).has('ch5.windows')).toBe(false);
    const d0 = apply(CH5_AFTER51, [T('SW', 1), T('SB', -1), ...seq('X1- Z1- X1- Z1+ X1+')]);
    expect(cubeKey(d0)).toBe(cubeKey(CH5_REDRAW));
    expect(['sky', 'engine', 'east', 'west', 'north', 'landing'].map(r => faceOf(CH5_REDRAW, r))).toEqual(['U', 'D', 'N', 'S', 'W', 'E']);
  });

  it('第一次走進機關 = 地板被重畫 (墨 7)；R 不重演；走出去再進來不重演；讀檔 (人就在機關) 也照樣重畫一次', () => {
    let cs = intoEngine();
    expect([cs.state.room, cubeKey(cs.state.cube!), cs.state.flags.includes('ch5.redraw'), cs.world.msg, cs.state.turns!.left]).toEqual([
      'engine', cubeKey(CH5_REDRAW), true, '你一踏進來，地板上的展開圖就自己動了起來——整棟閣樓，被重畫成圖上的樣子。三扇窗，全都背過身去。', 7
    ]);
    cs = turn(cs, T('Y1', -1));
    cs = restartRoom(cs, OPTS);
    expect([cubeKey(cs.state.cube!), cs.state.turns!.left]).toEqual([cubeKey(CH5_REDRAW), 7]);
    // 重畫後：機關南門 ↔ 梁上走道 ↔ 西窗南門 → 走出去、再走回來 (不重演)
    cs = through(cs, 'doorS');
    expect([cs.state.room, cs.state.door]).toEqual(['west', 'doorS']);
    cs = through(cs, 'doorS');
    expect([cs.state.room, cubeKey(cs.state.cube!)]).toEqual(['engine', cubeKey(CH5_REDRAW)]);
    // 讀檔：三扇窗都完成、人就在機關、還沒重畫過 → 重畫
    const st = chapterStart(defaultSave(), SPEC, CH5.start);
    const load = openChapter(SPEC, { ...st, cube: clone(CH5_AFTER51), room: 'engine', door: 'doorS', dial: true, rooms: clone(WINDOWS_DONE) }, OPTS);
    expect([cubeKey(load.state.cube!), load.state.flags]).toEqual([cubeKey(CH5_REDRAW), ['ch5.redraw']]);
  });

  it('門牌「間」穿過梁上走道：走道那一頭沒有門朝這裡 → 接到洞位 (兩邊都穿得過)；取下「日」→ 洞消失', () => {
    const s = apply(CH5_REDRAW, seq(A));
    const plates = activePlates(SPEC, { 'plate:engineN': ['card.ri'] });
    const ls = links(CH5_CUBE, s, SPEC.doors, plates);
    // (天花板梯口 ↔ 林心 = 封到 5-5c 的梯口，另由 sealed 擋)
    const viaDoors = ls.filter(l => 'room' in l.to && l.from.room !== 'meadow' && !('room' in l.to && l.to.room === 'meadow'));
    expect(viaDoors.filter(l => 'room' in l.to && (l.from.room === 'engine' || l.to.room === 'engine')).map(l => [l.from.room, l.from.door, 'room' in l.to && l.to.room, 'room' in l.to && l.to.door])).toEqual([
      ['engine', 'doorN', 'east', 'holeS'], ['east', 'holeS', 'engine', 'doorN']
    ]);
    expect(links(CH5_CUBE, s, SPEC.doors).some(l => (l.from.room === 'engine' && l.from.door !== 'hatchU') || ('room' in l.to && l.to.room === 'engine' && l.to.door !== 'hatchU'))).toBe(false);
  });
});

describe('5-5a 地板被重畫 (P4 / P7)', () => {
  it('解法 A：工具箱拿「日」→ 北門門牌貼「日」=「間」→ 南北軸 ↺ → 東西軸 ↺ → 上下軸 ↺ ×2 → 東西軸 ↺ → 上下軸 ↻ = 三道光槽同時亮 (5-5a)；墨 7 → 用了 6 → 完成補滿 10', () => {
    let cs = play(intoEngine(), TAKE_RI);
    expect([cs.world.inv['card.ri'], cs.world.msg]).toEqual([1, '工具箱裡有一盒拆開的活字。盒底只剩一個「日」。']);
    cs = play(in3d(cs), SLOTS);
    expect(cs.world.msg).toBe('三道光槽都還是暗的。');
    cs = play(in2d(cs), PLATE('N'));
    expect([cs.world.msg, [...activePlates(cs.spec, cs.world.ext.labels ?? {})]]).toEqual(['門牌多了一個「日」。門縫裡，透出了光。', ['engine.doorN']]);
    const steps = seq(A);
    cs = turn(cs, ...steps.slice(0, 5));
    expect([get(cs, 'slots').used, cs.state.turns!.left]).toEqual([false, 2]);
    cs = turn(cs, steps[5]);
    expect([get(cs, 'slots').used, cs.world.msg, cs.world.ext.starlight!.reach]).toEqual([true, SOLVED, ['east', 'west', 'north']]);
    expect([doneFlags(cs.spec, cs.state, cs.world).has('5-5a'), cs.state.turns!.left]).toEqual([true, 10]);
    // 光路：東窗 →「間」→ 機關；東窗 ↔ 北窗 (地板梯口)；北窗 ↔ 天窗間 ↔ 西窗；北窗在頂面看著天窗
    expect(['east', 'west', 'north', 'engine'].map(r => faceOf(cs.state.cube!, r))).toEqual(['W', 'E', 'U', 'S']);
    cs = play(in3d(cs), SLOTS);
    expect(cs.world.msg).toBe('機關醒著。此刻：光槽亮了3道：東、北、西。');
  });

  it('解法 B (先上下軸、最後兩次南北軸)；先轉後寫 = 光槽暗 (門外亮著卻進不來)、墨乾；「日」貼在南門 = 湊不出', () => {
    let cs = play(in2d(play(intoEngine(), TAKE_RI)), PLATE('N'));
    cs = turn(cs, ...seq(B));
    expect([get(cs, 'slots').used, doneFlags(cs.spec, cs.state, cs.world).has('5-5a')]).toEqual([true, true]);
    // 先轉後寫：不貼「日」照解法 A 轉完 → 光槽暗 (東窗那一頭亮著，門板後面是牆)；墨剩 1
    let w = turn(play(intoEngine(), TAKE_RI), ...seq(A));
    expect([get(w, 'slots').used, w.state.turns!.left, w.world.ext.starlight!.behind]).toEqual([false, 1, ['east', 'west', 'north']]);
    w = play(in3d(w), SLOTS);
    expect(w.world.msg).toBe('三道光槽都還是暗的。門外那一頭亮著，可是門板後面是牆——光進不來。');
    // 這時才貼 = 完成 (門牌不耗墨)；但若墨已用完、排列不對，就只能 R
    w = play(play(in2d(w), PLATE('N')), [{ wait: 0.05 }]);
    expect(get(w, 'slots').used).toBe(true);
    // 貼在南門：解法 A / B 都湊不出
    let s = play(in2d(play(intoEngine(), TAKE_RI)), PLATE('S'));
    s = turn(s, ...seq(A));
    expect([get(s, 'slots').used, s.world.ext.starlight!.reach.length < 3]).toEqual([false, true]);
    expect(dialTurn(turn(s, T('X1', 1)), T('X1', 1))).toEqual({ blocked: 'noInk' });
    s = play(s, UNPLATE('S'));
    expect(s.world.inv['card.ri']).toBe(1);
  });

  it('星光：看得見星星 = 東 / 西 / 北面或頂面；重畫後東窗、北窗看得見、西窗 (南面) 看不見；窗縫的世界方位', () => {
    const cs = intoEngine();
    const st = cs.world.ext.starlight!;
    expect([st.lit, st.reach, st.faces, st.converge]).toEqual([['east', 'north'], [], { east: 'N', west: 'S', north: 'W' }, false]);
    expect(['east', 'west', 'north'].map(r => slitOf(CH5_REDRAW, r))).toEqual([st.slits.east, st.slits.west, st.slits.north]);
    // S0：三扇窗都在原面、窗縫都是直的 (爸爸那段的樣子)
    const s0 = apply(CH5_AFTER51, []);
    expect(['east', 'west', 'north'].map(r => slitOf(s0, r))).toEqual(['v', 'v', 'v']);
  });
});

describe('5-5a validateDial (CH5_ZONE55A) 與拿掉要素', () => {
  it('中間片；起點 = 重畫後、人在機關：狀態 < 2×10⁶、排列 12,288、卡死 0；5-5a 最短 6 / 次短 6 (13 種，預算 7)；預算繞過如實列出', () => {
    const z = CH5_ZONE55A;
    const r = validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube, plates: z.plates, dialOn: z.dialOn }));
    expect([r.solvable, r.states, r.arrangements, r.deadlocks, r.issues, r.lockIssues, r.entryIssues, r.budgetBypass]).toEqual([
      true, 1430646, 12288, [], [], [], [], ['5-5a: doable with < 6 turns per visit to engine (refill by changing rooms)']
    ]);
    expect(r.states).toBeLessThan(2_000_000);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues])).toEqual([
      ['ch5.windows', 0, null, 1, 1, 10, []], ['plate', 0, null, 1, 1, 10, []], ['5-5a', 6, 6, 13, 13, 7, []]
    ]);
  }, 180_000);

  it('不改門牌 → 無解；「日」貼在南門 → 無解', () => {
    for (const p of [null, 'doorS'] as const) {
      const z = ch5Zone55a(p);
      expect([p, validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube, plates: z.plates, dialOn: z.dialOn })).solvable]).toEqual([p, false]);
    }
  }, 180_000);
});

describe('5-5b 殘影守門 (P8 / P6；追逐 3)', () => {
  it('5-5a 完成 → 靜 2 秒 → 預兆 3 秒 (殘影出現在北門：東窗從北門的「間」連過來) → 出門 2 秒 → 在藏寶圖追；一直待在藏寶圖 = 被追上回檢查點 (不扣墨、不退旗標)；確定性', () => {
    const go = () => {
      let cs = after55a();
      const t0 = cs.world.time;
      cs.world.player.x = 8; // 離北門遠一點 (在藏寶圖裡等)
      const trace: Array<[string, number, number]> = [];
      for (let i = 0; i < 100; i++) { cs = wait(cs, 0.1); const r = engineChaseRun(cs.world); trace.push([r.phase, Math.round((cs.world.time - t0) * 10) / 10, Math.round(get(cs, 'chaser').x * 100) / 100]); }
      return { cs, trace };
    };
    const a = go();
    const first = (ph: string) => a.trace.find(t => t[0] === ph)!;
    // 靜 2 秒 → 預兆 (殘影出現在北門 x −6) → 3 秒 → 出門 → 2 秒 → 追
    expect([first('omen')[1], first('omen')[2], first('enter')[1] - first('omen')[1], first('run')[1] - first('enter')[1]]).toEqual([2, -6, 3, 2]);
    expect(go().trace).toEqual(a.trace);
    let cs = a.cs;
    for (let i = 0; i < 40 && engineChaseRun(cs.world).caught === 0; i++) cs = wait(cs, 0.5);
    expect([engineChaseRun(cs.world).caught, cs.world.player.x, cs.world.msg, doneFlags(cs.spec, cs.state, cs.world).has('5-5a'), cs.state.turns!.left]).toEqual([
      1, 11, '圖面一皺。你回到了齒輪牆的另一頭。', true, 10
    ]);
  });

  it('東西軸 ↻ → 上下軸 ↺：東窗斷開、北窗的光從北門的「間」照進來 = 5-5b (殘影被拉回)；只斷開不接光 = 殘影退回、光槽全暗；取下「日」也算斷開', () => {
    let cs = wait(after55a(), 6);
    expect(engineChaseRun(cs.world).phase).not.toBe('idle');
    cs = turn(cs, T('X1', 1), T('Z1', -1));
    const st = cs.world.ext.starlight!;
    expect([st.linked.includes('east'), st.reach, get(cs, 'chaseCut').used, cs.world.msg, engineChaseRun(cs.world).phase, get(cs, 'chaser').used]).toEqual([
      false, ['north'], true, '殘影被拉回東窗那頭。另一扇窗的光接了上來——第二道光，落進機關。', 'idle', false
    ]);
    expect(doneFlags(cs.spec, cs.state, cs.world).has('5-5b')).toBe(true);
    // 只斷開、沒有第二道光：取下北門的「日」(東窗的洞消失)
    let d = wait(after55a(), 6);
    d = play(d, UNPLATE('N'));
    d = wait(d, 0.1);
    expect([d.world.ext.starlight!.linked, get(d, 'chaseCut').used, d.world.msg, engineChaseRun(d.world).phase]).toEqual([[], false, '殘影退回去了。可是光槽全暗——光也跟著斷了。', 'idle']);
    // 再貼回去 → 東窗又接上：殘影又來
    d = wait(play(d, PLATE('N')), 2.5);
    expect(engineChaseRun(d.world).phase).toBe('omen');
  });

  it('減弱緊張效果：殘影不出現，但仍要完成轉動', () => {
    let cs = wait(after55a(true), 8);
    expect([engineChaseRun(cs.world).phase, get(cs, 'chaser').used, get(cs, 'chaseCut').used]).toEqual(['idle', false, false]);
    cs = turn(cs, T('X1', 1), T('X1', 1));
    expect([get(cs, 'chaseCut').used, doneFlags(cs.spec, cs.state, cs.world).has('5-5b')]).toEqual([true, true]);
  });

  it('5-5a 的 13 種解都成立、終局只有兩種 (機關在南面 / 北面、北窗在頂面)；CH5_ZONE55B 從兩種終局各自最短 2、卡死 0', () => {
    const ends = new Map<string, CubeState>();
    for (const q of ALL_A) {
      const s = apply(CH5_REDRAW, seq(q));
      expect([q, faceOf(s, 'north')]).toEqual([q, 'U']);
      ends.set(cubeKey(s, CH5_CUBE), s);
    }
    expect([...ends.values()].map(s => faceOf(s, 'engine')).sort()).toEqual(['N', 'S']);
    for (const s of ends.values()) {
      const z = ch5Zone55b(s);
      const r = validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube, plates: z.plates, dialOn: z.dialOn }));
      expect([faceOf(s, 'engine'), r.solvable, r.deadlocks, r.issues, r.states < 2_000_000, r.arrangements]).toEqual([faceOf(s, 'engine'), true, [], [], true, 12288]);
      const p = r.perPuzzle.find(x => x.id === '5-5b')!;
      expect([p.shortest, p.second, p.issues]).toEqual([2, 2, []]);
      expect(p.distinct).toBeGreaterThanOrEqual(2);
    }
  }, 300_000);
});

describe('5-5c 收束 (P12 / P1)、驚嚇、第五次轉動', () => {
  it('焦點：5-5b 之前光還沒落下 (只說淺槽)；之後放上可寫的手記頁 → 每扇窗一句；照爸爸那段 (三扇都直、在原面) = 東西兩扇偏一格', () => {
    let cs = play(in3d(after55a()), FOCUS);
    expect([cs.world.msg, cs.world.inv['page.blank'], get(cs, 'focus').touched]).toEqual(['底盤中央有一個淺淺的槽，像是放一張紙的大小。', 1, false]);
    cs = play(in3d(after55b()), FOCUS);
    expect([cs.world.msg, cs.world.inv['page.blank'] ?? 0, get(cs, 'focus').touched]).toEqual(['你把那頁手記攤在底盤正中央。東窗沒有光落下來。西窗的光落在紙上。北窗的光落在紙邊，偏了一格。', 0, true]);
    // 爸爸那段 = S0 的樣子 (三扇窗都在原面、窗縫都是直的)：只有北窗對
    const st = chapterStart(defaultSave(), SPEC, CH5.start);
    const engineSnap = { objs: [['slots', true, false], ['chaseCut', true, false], ['focus', false, true]].map(([id, used, touched]) => ({ id: id as string, x: 0, y: 0, z: 0, gone: false, used: used as boolean, touched: touched as boolean })), flags: [] };
    const dad = in3d(openChapter(SPEC, { ...st, cube: initialCube(CH5_CUBE), room: 'engine', door: null, dial: true, flags: ['ch5.redraw'], rooms: { ...clone(WINDOWS_DONE), engine: engineSnap } }, OPTS));
    const d = play(dad, FOCUS);
    expect([d.world.msg, get(d, 'focus').used]).toEqual(['東窗的光落在紙邊，偏了一格。西窗的光落在紙邊，偏了一格。北窗的光落在紙上。', false]);
  });

  it('解法：東西軸 ↻ → 南北軸 ↺ → 走到西窗、窗框 ↺ (窗縫儀「…橫著」) → 走回機關 → 東西軸 ↻ = 三道光落在同一點 → 手記第五頁、5-5c、房間通關；第五次轉動 = 排回 S0、轉動模式收起、頭頂的梯口通往林心', () => {
    let cs = play(in3d(after55b()), FOCUS);
    cs = turn(cs, T('X1', 1), T('Y1', -1));
    cs = walk(cs, 'west');
    cs = turn(cs, T('SW', -1));
    cs = play(in3d(cs), [{ walkTo: [-8.6, -2.8] }, { expect: w => expect(findTarget(w)?.def.id).toBe('slitPane'), label: '窗縫儀' }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('窗縫和窗外的地平線疊在一起，橫著。');
    cs = in3d(walk(cs, 'engine'));
    cs = turn(cs, T('X1', 1));
    cs = play(cs, [{ wait: 0.1 }]);
    const flags = doneFlags(cs.spec, cs.state, cs.world);
    expect([get(cs, 'focus').used, cs.world.inv['diary.5'], flags.has('5-5c'), clearedRooms(cs.spec, cs.state, cs.world)[0]]).toEqual([true, 1, true, 'engine']);
    expect(cs.world.msg).toBe('三道光落在同一點。紙上慢慢浮出字來——許問津的手記，第五頁。');
    // 第五次轉動：所有房間與走道回到 S0；轉動模式收起
    expect(cubeKey(cs.state.cube!)).toBe(cubeKey(initialCube(CH5_CUBE)));
    expect([dialBlocked(cs, T('X1', 1)), groupHidden(cs.spec, cs.state, 'X1', cs.world), TEXT('msg.dial.frozen')]).toEqual(['locked', true, '魔方已經收束了。']);
    // S0：機關的南北門朝著空格 (門後是牆)，唯一的路是頭頂的梯口 → 林心 (到達時說終章的旁白)
    expect([cs.world.ext.cube!.links.doorN, cs.world.ext.cube!.links.doorS]).toEqual([{ to: 'wall' }, { to: 'wall' }]);
    const m = through(cs, 'hatchU');
    expect([m.state.room, m.world.msg]).toEqual(['meadow', '天快亮了。最深處，是一片草地。']);
    expect([engine.clearAlso, levelById('5-5')!.unlock.after]).toEqual([['5-1', '5-2', '5-3', '5-4'], ['5-2', '5-3', '5-4']]);
  });

  it('驚嚇 (本章唯一一次)：5-5b 完成後在藏寶圖安靜 20 秒 → 三道殘影 (scare:engine 記在章節旗標；R 不重演)；不到 20 秒不演出', () => {
    let cs = wait(after55b(), 15);
    expect(get(cs, 'scare').used).toBe(false);
    cs = wait(cs, 6);
    expect([get(cs, 'scare').used, cs.state.flags.includes('scare:engine')]).toEqual([true, true]);
    const r = wait(restartRoom(cs, OPTS), 25);
    expect([r.state.flags.includes('scare:engine'), get(r, 'scare').used]).toEqual([true, false]);
  });

  it('窗縫儀：5-1 完成後的排列 = 三扇窗都在原面、窗縫直 (「…地平線，橫著穿過它」)；看不見星星 / 朝天上的說法', () => {
    const at = (cube: CubeState, room: string) => {
      const st = chapterStart(defaultSave(), SPEC, CH5.start);
      const cs = in3d(openChapter(SPEC, { ...st, cube: clone(cube), room, door: null, dial: true }, OPTS));
      const p = get(cs, 'slitPane');
      const r = play(cs, [{ walkTo: [p.x, p.z + 0.8] }, { act: 'interact' }]);
      return r.world.msg;
    };
    expect(at(CH5_AFTER51, 'east')).toBe('窗縫直直地立著；窗外的地平線，橫著穿過它。');
    // 重畫後：西窗在南面 (看不見星星)；北窗在西面
    expect([at(CH5_REDRAW, 'west'), faceOf(CH5_REDRAW, 'west')]).toEqual(['窗外是暗的，看不見星星。', 'S']);
    // 5-5a 完成時北窗在頂面 (朝著天上)
    expect(at(apply(CH5_REDRAW, seq(A)), 'north')).toBe('窗朝著天上，窗外只有星星。');
  });
});

describe('5-5c validateDial (CH5_ZONE55C) 與拿掉要素', () => {
  const B_END = () => apply(CH5_REDRAW, seq(`${A} X1+ Z1-`));
  const run = (z: ReturnType<typeof ch5Zone55c>) => validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube, plates: z.plates, dialOn: z.dialOn, inkless: z.inkless }));
  it('中間片 + 東西兩窗的窗框 (只在窗房)；墨不進模型：排列 98,304、狀態 < 2×10⁶、卡死 0；5-5c 最短 4 / 次短 4、本質不同 ≥ 2', () => {
    const r = run(ch5Zone55c(B_END()));
    expect([r.solvable, r.arrangements, r.deadlocks, r.needsRestart, r.issues, r.lockIssues, r.entryIssues]).toEqual([true, 98304, [], 0, [], [], []]);
    expect(r.states).toBeLessThan(2_000_000);
    const p = r.perPuzzle.find(x => x.id === '5-5c')!;
    expect([p.shortest, p.second, p.issues]).toEqual([4, 4, []]);
    expect(p.distinct).toBeGreaterThanOrEqual(2);
  }, 300_000);

  it('只有中間片 → 無解；照爸爸那段 (三扇都看得見星星、三扇都直) 排得出來 (陷阱是真的)，但和「三道光」沒有交集', () => {
    expect(run(ch5Zone55c(B_END(), CH5_MIDDLE_CUBE)).solvable).toBe(false);
    expect(run(ch5Zone55c(B_END(), undefined, (_s, _f, ctx) => ctx.star().lit.length === 3 && ['east', 'west', 'north'].every(w => ctx.slit!(w) === 'v'))).solvable).toBe(true);
    expect(run(ch5Zone55c(B_END(), undefined, (_s, _f, ctx) => ctx.converge() && ['east', 'west', 'north'].every(w => ctx.slit!(w) === 'v'))).solvable).toBe(false);
  }, 600_000);
});

describe('5-5 音訊', () => {
  it('Boss 三階段：5-5a 長音墊 + 慢脈動 → 5-5b 脈動加快 → 5-5c + 琶音 → 收束 (全部)', () => {
    expect([[], ['5-5a'], ['5-5a', '5-5b'], ['5-5a', '5-5b', '5-5c']].map(f => bossStage(new Set(f)))).toEqual([
      { stage: 0, bpm: 60 }, { stage: 0, bpm: 72 }, { stage: 1, bpm: 72 }, { stage: 3, bpm: 60 }
    ]);
  });
  it('USED_ON：三道光槽同時亮、三道光落在同一點', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'engine', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 10,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    for (const [type, id] of [['starSlots', 'sfx.lamp.on'], ['starFocus', 'sfx.puzzle.solved']]) {
      const o = (used: boolean) => ({ id: 'x', type, used, gone: false, x: 0, z: 0 });
      const ob = new LevelObserver();
      ob.update(s([o(false)]));
      expect(ob.update(s([o(true)])).filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toContain(id);
    }
  });
});
