// 5-3 西窗 (規格 6「5-3 西窗（細化）」)：資料 (門位不變、三帶、字條原文與 H 規則、天窗銘文 (西) 與東窗那段矛盾)、墨水瓶 / 羊皮紙拾取 (只在實景)、
// 羊皮紙「大」/「小」拿不走、在東窗合成 = 沒有台 (HUD 不出鈕)、只有一件、在西窗合成 (C 與筆記本 E) = page.blank、5-3、SW 星釘鬆開、房間通關、分層、
// 兩種解法實跑 (天窗間橋 / 樓梯口橋)、5-2 已通關的存檔照樣拿得到紙、窗框 SW 轉一次、R、validateDial (CH5_ZONE53、拿掉要素、東西窗永不直接相連)、USED_ON
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH5_AFTER51, CH5_MIDDLE, CH5_MIDDLE_CUBE, CH5_ZONE53, faceOf } from '../../../src/puzzle/content/cubes/ch5';
import { east, west } from '../../../src/puzzle/content/levels/ch5/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { labelTarget } from '../../../src/puzzle/mechanics/labels';
import { readyRecipe } from '../../../src/puzzle/mechanics/combine';
import { findTarget } from '../../../src/puzzle/core/interact';
import { hasItem } from '../../../src/puzzle/core/world';
import { applyTurn, cubeKey, links, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { clearedRooms, dialBlocked, dialTurn, doneFlags, openChapter, restartRoom, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { ch5Stage } from '../../../src/puzzle/audio/score';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const, 'scale' as const] };
const CH5 = CUBE_CHAPTERS.find(c => c.chapter === 5)!;
const SPEC = chapterSpecOf(CH5);

function pump(cs: ChapterSession): ChapterSession {
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen' && e.t !== 'card');
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
const turn = (cs: ChapterSession, ...ts: Turn[]) => ts.reduce((c, t) => pump(ok(dialTurn(c, t))), cs);
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
const COMBINE: Cmd = { hold: { commands: [{ t: 'combine' }] }, seconds: 1 / 60 };
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });

/** 5-1 完成 (天窗間朝向 1、機關朝向 1)、觀星儀已啟動、人在天窗間 (3D)；章節道具 = 尺度卡 (+ extra) */
function after51(extra: Partial<ChapterState> = {}, items: Record<string, number> = {}): ChapterSession {
  const st = chapterStart(defaultSave(), SPEC, CH5.start);
  return in3d(openChapter(SPEC, { ...st, cube: clone(CH5_AFTER51), room: 'sky', door: 'doorS', dial: true, items: { 'card.da': 1, 'card.xiao': 1, ...items }, ...extra }, OPTS));
}
/** 實景：東窗書架西端的羊皮紙 (3D 按 E) */
const TAKE_PARCHMENT: Cmd[] = [{ wait: 0.1 }, { walkTo: [0.9, -2.6] }, { expect: w => expect(findTarget(w)?.def.id).toBe('parchment'), label: '羊皮紙' }, { act: 'interact' }];
/** 實景：爸爸書桌上的墨水瓶 / 筆記本 */
const TAKE_INK: Cmd[] = [{ wait: 0.1 }, { walkTo: [1.45, -2.6] }, { expect: w => expect(findTarget(w)?.def.id).toBe('inkBottle'), label: '墨水瓶' }, { act: 'interact' }];
const AT_DESK: Cmd[] = [{ walkTo: [2.45, -2.6] }, { expect: w => expect(findTarget(w)?.def.id).toBe('deskBook'), label: '筆記本' }];
/** 東西軸 ↻ → 南北軸 ↻ (天窗間東門 ↔ 東窗北門) → 走進東窗、拿羊皮紙 (3D) */
function inEastWithParchment(extra: Partial<ChapterState> = {}, items: Record<string, number> = {}): ChapterSession {
  const cs = in3d(through(turn(after51(extra, items), T('X1', 1), T('Y1', 1)), 'doorE'));
  expect([cs.state.room, cs.state.door]).toEqual(['east', 'doorN']);
  return play(cs, TAKE_PARCHMENT);
}

describe('5-3 西窗：資料', () => {
  it('validateLevel / validateEntry 0 issue (西窗與加了羊皮紙的東窗)；一題 5-3；墨 10；三帶；門位不變 (南門 / 地板梯口)；通關文字；登錄 (5-1 之後開放)', () => {
    for (const lv of [west, east]) expect(validateLevel(lv, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib', 'scale'] })).toEqual([]);
    expect(validateEntry(levelById('5-3')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect([west.id, west.puzzles!.map(q => [q.id, TEXT(q.titleKey)]), west.turnBudget, TEXT(west.narrationKey), TEXT(west.nextKey), layoutDepthIssues(west), layoutDepthIssues(east)]).toEqual([
      '5-3', [['5-3', '5-3 爸爸的書桌']], { base: 10 }, '從這扇窗看，路都是側面的。', '爸爸的書桌上，墨和紙湊在一起了。這扇窗，現在轉得動了。', [], []
    ]);
    const doors = west.objects.filter(o => o.type === 'cubeDoor').map(o => [o.id, o.x, o.z]);
    expect(doors).toEqual([['doorS', 4, 4.8], ['hatchD', -3, 1.6]]);
    expect([levelById('5-3')!.unlock, levelById('5-3')!.abilities, CH5.levels['5-3'], CHAPTERS.find(c => c.id === 5)!.levels]).toEqual([{ after: ['5-1'] }, ['nib', 'scale'], 'west', ['5-1', '5-2', '5-3']]);
  });

  it('字條：三張 (L1 / L2 / 劇情)；原文；H1～H4 / H10；間距 ≥ 3', () => {
    const notes = west.objects.filter(o => o.type === 'note');
    const txt = (o: (typeof notes)[number]) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteStory', -2, '我只看過這一扇。我以為，每一扇都長這樣。', undefined],
      ['noteA', -7.6, '東邊和西邊，從來碰不到。中間總得有人遞過去。', undefined], ['noteA2', 6, '兩邊都到得了的房間，就是橋。', 240]
    ]);
    const AHA = ['轉', '片', '軸', '面', '外', '小', '縮', '窗', '倒', '讀', '合', '秤', '重', '光', '對', '齊', '符', '陣', '門'];
    const KEYS = ['墨水瓶', '羊皮紙', '書桌', '筆記本', '手記頁', '天窗銘文'];
    for (const o of notes) {
      const t = txt(o);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t) || /^(把|先|去|到)/.test(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(o.id === 'noteA2' ? 30 : o.id === 'noteA' ? 24 : 40);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it('天窗銘文 (西)：爸爸的鉛筆字 (只在實景)；與東窗那段矛盾 (他說三扇都是直的、東窗那段說橫著)', () => {
    const w = west.objects.find(o => o.id === 'inscriptionW')!;
    const e = east.objects.find(o => o.id === 'inscriptionE')!;
    const tw = TEXT(w.type === 'remark' ? w.textKey : '');
    const te = TEXT(e.type === 'remark' ? e.textKey : '');
    expect([w.type, w.visible, tw]).toEqual(['remark', '3d', '窗台上，爸爸用鉛筆寫了一行，劃掉又重寫：『三扇窗的縫，都和這一扇一樣，直的。』']);
    expect([tw.includes('三扇窗的縫') && tw.includes('直的'), te.includes('橫著')]).toEqual([true, true]);
  });
});

describe('5-3 道具：墨水瓶、羊皮紙', () => {
  it('羊皮紙 (東窗；3D 按 E)：沒貼卡 = 收起來；藏寶圖裡拿不了', () => {
    const cs = inEastWithParchment();
    expect([cs.world.msg, hasItem(cs.world, 'parchment'), get(cs, 'parchment').gone]).toEqual(['一捲空白的羊皮紙，用細繩繫著。你把它收了起來。', true, true]);
    const fresh = in2d(in3d(through(turn(after51(), T('X1', 1), T('Y1', 1)), 'doorE')));
    runScript(fresh.world, [{ walkTo: [0.9, null] }]);
    expect([findTarget(fresh.world)?.def.id, labelTarget(fresh.world)?.def.id]).toEqual([undefined, 'parchment']);
  });

  it('羊皮紙標「大」= 帶不動、「小」= 寫不下 (都不給)；取下卡片就拿得到', () => {
    let cs = in2d(in3d(through(turn(after51(), T('X1', 1), T('Y1', 1)), 'doorE')));
    cs = play(cs, [{ walkTo: [0.9, null] }, card('parchment', 'card.da'), { wait: 0.05 }]);
    cs = play(in3d(cs), [{ walkTo: [0.9, -2.6] }, { act: 'interact' }]);
    expect([cs.world.msg, hasItem(cs.world, 'parchment'), get(cs, 'parchment').gone]).toEqual(['羊皮紙捲變得又長又沉，抱不起來——也塞不過門。', false, false]);
    cs = play(in2d(cs), [{ walkTo: [0.9, null] }, uncard('parchment', 'card.da'), card('parchment', 'card.xiao'), { wait: 0.05 }]);
    cs = play(in3d(cs), [{ walkTo: [0.9, -2.6] }, { act: 'interact' }]);
    expect([cs.world.msg, hasItem(cs.world, 'parchment')]).toEqual(['羊皮紙縮得像一根火柴。這麼小，寫不下一頁。', false]);
    cs = play(in2d(cs), [{ walkTo: [0.9, null] }, uncard('parchment', 'card.xiao'), { wait: 0.05 }]);
    cs = play(in3d(cs), TAKE_PARCHMENT);
    expect(hasItem(cs.world, 'parchment')).toBe(true);
  });

  it('在羊皮紙那間就想合成 (墨水瓶先帶到東窗)：沒有台、不合成、HUD 不出鈕；只有一件 = 湊不起來', () => {
    const cs = inEastWithParchment({}, { 'ink.father': 1 });
    expect(readyRecipe(cs.world)).toBe(null);
    runScript(cs.world, [COMBINE, { wait: 0.05 }]);
    expect([cs.world.msg, hasItem(cs.world, 'page.blank'), hasItem(cs.world, 'parchment'), hasItem(cs.world, 'ink.father')]).toEqual(['墨和紙都在手上，可是這裡沒有能攤平紙、放穩墨水瓶的桌面。', false, true, true]);
    const one = inEastWithParchment();
    runScript(one.world, [COMBINE, { wait: 0.05 }]);
    expect(one.world.msg).toBe('手上只有一樣，湊不起來。');
  });
});

/** 從東窗 (手上有羊皮紙) 經天窗間回西窗：回天窗間 → 南北軸 ↺ → 東西軸 ↻ → 天窗間南門 ↔ 西窗地板梯口 */
function routeAHome(cs: ChapterSession): ChapterSession {
  cs = through(cs, 'doorN');
  expect(cs.state.room).toBe('sky');
  cs = in3d(through(turn(cs, T('Y1', -1), T('X1', 1)), 'doorS'));
  expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'west')]).toEqual(['west', 'hatchD', 'W']);
  return cs;
}

describe('5-3 爸爸的書桌 (P13 / P1)', () => {
  it('解法 A (天窗間當橋)：東西軸 ↻ 南北軸 ↻ → 東窗拿紙 → 天窗間 → 南北軸 ↺ 東西軸 ↻ → 西窗：筆記本沒湊齊 → 墨水瓶 → C 合成 = 手記頁、5-3、SW 鬆開、房間通關、分層', () => {
    let cs = routeAHome(inEastWithParchment());
    cs = play(cs, [...AT_DESK, { act: 'interact' }]);
    expect(cs.world.msg).toBe('爸爸的筆記本攤在吸墨墊上，最後一頁是空的。頁邊寫著：『墨我留著。空白的紙，在對面那扇窗。』');
    expect(dialBlocked(cs, T('SW', 1))).toBe('locked');
    cs = play(cs, TAKE_INK);
    expect([cs.world.msg, hasItem(cs.world, 'ink.father'), readyRecipe(cs.world)?.out]).toEqual(['爸爸的墨水瓶，蓋子沒有旋緊。你把它旋緊，收了起來。', true, 'page.blank']);
    cs = play(cs, [COMBINE, { wait: 0.05 }]);
    expect([cs.world.msg, hasItem(cs.world, 'page.blank'), hasItem(cs.world, 'ink.father'), hasItem(cs.world, 'parchment'), get(cs, 'deskBook').used]).toEqual([
      '你把羊皮紙攤在吸墨墊上，旋開墨水瓶。紙吸了墨，浮出淡淡的格線——一頁可以寫字的手記。窗框上的一顆星釘，跟著鬆開了。', true, false, false, true
    ]);
    const flags = doneFlags(cs.spec, cs.state, cs.world);
    expect([flags.has('5-3'), clearedRooms(cs.spec, cs.state, cs.world), ch5Stage(flags), dialBlocked(cs, T('SW', 1))]).toEqual([true, ['west'], 1, null]);
    // 筆記本 (之後)
    cs = play(cs, [...AT_DESK, { act: 'interact' }]);
    expect(cs.world.msg).toBe('吸墨墊上留著一圈羊皮紙的印子。那一頁手記，收在你身上。');
    // 窗框 SW 轉一次：西窗原地轉 (位置不變、朝向變)；手記頁留在章節道具欄
    const before = [cs.state.cube!.pos.west, cs.state.cube!.rot.west];
    cs = turn(in2d(cs), T('SW', 1));
    expect([cs.state.cube!.pos.west, cs.state.cube!.rot.west === before[1]]).toEqual([before[0], false]);
    expect(hasItem(cs.world, 'page.blank')).toBe(true);
  });

  it('解法 B (樓梯口當橋)：樓梯口 → 東西軸 ↺ 上下軸 ↻ → 窄梯進東窗拿紙 → 樓梯口 → 上下軸 ↻ ×2 → 窄梯進西窗；先拿墨水瓶、再對筆記本按 E = 合成', () => {
    let cs = through(after51(), 'doorE');
    expect(cs.state.room).toBe('landing');
    cs = in3d(through(turn(cs, T('X1', -1), T('Z1', 1)), 'hatchU'));
    expect([cs.state.room, cs.state.door]).toEqual(['east', 'hatchD']);
    cs = play(cs, TAKE_PARCHMENT);
    cs = through(cs, 'hatchD');
    expect(cs.state.room).toBe('landing');
    cs = in3d(through(turn(cs, T('Z1', 1), T('Z1', 1)), 'hatchU'));
    expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'west')]).toEqual(['west', 'hatchD', 'S']);
    cs = play(cs, [...TAKE_INK, ...AT_DESK, { act: 'interact' }]);
    expect([hasItem(cs.world, 'page.blank'), doneFlags(cs.spec, cs.state, cs.world).has('5-3')]).toEqual([true, true]);
  });

  it('5-2 已通關的存檔 (東窗快照沒有羊皮紙)：羊皮紙照關卡資料在場、拿得到；5-2 仍記為完成', () => {
    const snap = { objs: [{ id: 'poem', x: 9.6, y: 1.0, z: 0, gone: false, used: true, touched: true }, { id: 'starCase', x: 5.6, y: 0.76, z: -1.0, gone: false, used: true, touched: true }], flags: [] };
    const cs = inEastWithParchment({ rooms: { east: snap } });
    expect([hasItem(cs.world, 'parchment'), get(cs, 'poem').used, doneFlags(cs.spec, cs.state, cs.world).has('5-2')]).toEqual([true, true, true]);
    const home = play(routeAHome(cs), [...TAKE_INK, COMBINE, { wait: 0.05 }]);
    const flags = doneFlags(home.spec, home.state, home.world);
    expect([flags.has('5-2'), flags.has('5-3'), ch5Stage(flags)]).toEqual([true, true, 2]);
  });

  it('R = 回到進房時 (墨水瓶回桌上、筆記本沒用過；從東窗帶來的羊皮紙仍在手上)', () => {
    let cs = play(routeAHome(inEastWithParchment()), [...TAKE_INK, COMBINE, { wait: 0.05 }]);
    expect(get(cs, 'deskBook').used).toBe(true);
    const back = restartRoom(cs, OPTS);
    expect([get(back, 'deskBook').used, get(back, 'inkBottle').gone, hasItem(back.world, 'ink.father'), hasItem(back.world, 'parchment'), hasItem(back.world, 'page.blank')]).toEqual([false, false, false, true, false]);
  });
});

describe('5-3 validateDial (CH5_ZONE53) 與拿掉要素', () => {
  it('中間片 + 西窗的窗框；起點 = 5-1 完成：狀態 1,329,234 (< 2×10⁶)、排列 12,288 (SW 鎖到終點)、卡死 0；parchment 2 / 2、5-3 (從拿到紙起) 2 / 2；本質不同的解 ≥ 2', () => {
    const z = CH5_ZONE53;
    const r = validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube }));
    expect([r.solvable, r.states, r.arrangements, r.deadlocks, r.issues, r.lockIssues, r.entryIssues, r.budgetBypass]).toEqual([true, 1329234, 12288, [], [], [], [], []]);
    expect(r.states).toBeLessThan(2_000_000);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.issues])).toEqual([['parchment', 2, 2, []], ['5-3', 2, 2, []]]);
    for (const p of r.perPuzzle) expect(p.distinct).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('只留一條軸 → 無解；任兩條軸都有解', () => {
    const z = CH5_ZONE53;
    const run = (keep: string[]) => {
      const cube = { ...z.cube, dial: { ...z.cube.dial!, groups: CH5_MIDDLE.filter(g => keep.includes(g.id)), locks: [] } };
      return validateDial(dialModelOf(cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube })).solvable;
    };
    expect([['X1'], ['Y1'], ['Z1'], ['X1', 'Y1'], ['X1', 'Z1'], ['Y1', 'Z1']].map(run)).toEqual([false, false, false, true, true, true]);
  }, 120_000);

  it('任何可達排列裡東窗與西窗都不直接相連 (對面的面心；一定要經過橋房)', () => {
    const doors = chapterDoors(CH5.rooms);
    const seen = new Set<string>([cubeKey(CH5_AFTER51)]);
    const q: CubeState[] = [CH5_AFTER51];
    let direct = 0;
    while (q.length) {
      const s = q.pop()!;
      for (const l of links(CH5_MIDDLE_CUBE, s, doors)) if ('room' in l.to && ((l.from.room === 'east' && l.to.room === 'west') || (l.from.room === 'west' && l.to.room === 'east'))) direct++;
      for (const g of CH5_MIDDLE) for (const dir of [1, -1] as const) {
        const n = applyTurn(CH5_MIDDLE_CUBE, s, { group: g.id, dir });
        if ('blocked' in n) continue;
        const k = cubeKey(n);
        if (!seen.has(k)) { seen.add(k); q.push(n); }
      }
    }
    expect([seen.size > 10_000, direct]).toEqual([true, 0]);
  }, 120_000);
});

describe('5-3 音訊', () => {
  it('USED_ON：在書桌上合成 (星釘鬆開)；羊皮紙 / 墨水瓶的拾取聲', () => {
    const W = {};
    const s = (objs: LevelSnap['objs'], inv: Record<string, number>): LevelSnap => ({
      world: W, room: 'west', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv, objs, cube: '', ink: 10,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('d', 'writingDesk', false)], {}));
    const out = obs.update(s([o('d', 'writingDesk', true)], { 'page.blank': 1 }));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toContain('sfx.latch.open');
  });
});
