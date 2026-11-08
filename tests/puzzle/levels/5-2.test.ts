// 5-2 東窗 (規格 6「5-2 東窗（細化）」)：資料 (門位不變、三帶、字條原文與 H 規則、字條離窗)、星表匣 (三張詞卡)、窗框的四種說明 (順讀 / 側影 / 倒影 / 讀通)、
// 換讀法 (label.flip：不在底面一張都不收、朝下「抬」無效、「低」/「垂」讀通 = 5-2、SE 星釘鬆開、房間通關)、兩種解法實跑、窗框 SE 轉一次、R、
// validateDial (CH5_ZONE52、只留一條軸無解)、faceOfCell、分層音訊、USED_ON
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH5_AFTER51, CH5_MIDDLE, CH5_ZONE52, faceOf } from '../../../src/puzzle/content/cubes/ch5';
import { east } from '../../../src/puzzle/content/levels/ch5/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { accepts, cardsOn, labelTarget } from '../../../src/puzzle/mechanics/labels';
import { windowView } from '../../../src/puzzle/mechanics/windows';
import { findTarget } from '../../../src/puzzle/core/interact';
import { hasItem } from '../../../src/puzzle/core/world';
import { faceOfCell, type Turn } from '../../../src/puzzle/core/cube';
import { clearedRooms, dialBlocked, dialTurn, doneFlags, openChapter, restartRoom, type ChapterSession } from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCardTray } from '../../../src/puzzle/app/cardTrayModel';
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
const LABEL = 'poem:east';

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
/** 切到藏寶圖 / 實景 (已經是就不切) */
const as = (m: '2d' | '3d') => (cs: ChapterSession): ChapterSession => { if (cs.world.player.mode !== m) runScript(cs.world, flip); return cs; };
const in2d = as('2d');
const in3d = as('3d');
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const card = (c: string): Cmd => ({ hold: { commands: [{ t: 'card', label: LABEL, card: c }] }, seconds: 1 / 60 });
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));

/** 5-1 完成 (天窗間朝向 1、機關朝向 1)、觀星儀已啟動、人在天窗間 (2D)；章節道具 = 尺度卡 */
function after51(): ChapterSession {
  const st = chapterStart(defaultSave(), SPEC, CH5.start);
  return in2d(openChapter(SPEC, { ...st, cube: clone(CH5_AFTER51), room: 'sky', door: 'doorS', dial: true, items: { 'card.da': 1, 'card.xiao': 1 } }, OPTS));
}
/** 實景：走到書案前打開星表匣 (三張詞卡) */
const TAKE_CARDS: Cmd[] = [{ wait: 0.1 }, { walkTo: [5.0, -0.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('starCase'), label: '星表匣' }, { act: 'interact' }];
/** 藏寶圖：站到窗前 (詩的標籤；先切到藏寶圖) */
const AT_WINDOW: Cmd[] = [{ walkTo: [9.0, null] }, { expect: w => expect(labelTarget(w)?.def.id).toBe('poem'), label: '詩的標籤' }];
/** 3D 對窗框按 E */
const READ_WINDOW: Cmd[] = [{ walkTo: [9.2, 0] }, { expect: w => expect(findTarget(w)?.def.id).toBe('poem'), label: '窗框' }, { act: 'interact' }];
/** 東西軸 ↻ → 南北軸 ↻：東窗轉到頂面、天窗間東門 ↔ 東窗北門 → 走進東窗 (2D、在窗前、手上有詞卡) */
function inEastUp(): ChapterSession {
  const cs = in3d(through(turn(after51(), T('X1', 1), T('Y1', 1)), 'doorE'));
  return play(cs, TAKE_CARDS);
}

describe('5-2 東窗：資料', () => {
  it('validateLevel / validateEntry 0 issue；一題 5-2；墨 10；三帶；門位不變 (北門 / 地板梯口)；通關文字；登錄 (5-1 之後開放)', () => {
    expect(validateLevel(east, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib', 'scale'] })).toEqual([]);
    expect(validateEntry(levelById('5-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect([east.id, east.puzzles!.map(q => [q.id, TEXT(q.titleKey)]), east.turnBudget, TEXT(east.narrationKey), TEXT(east.nextKey), layoutDepthIssues(east)]).toEqual([
      '5-2', [['5-2', '5-2 倒過來的詩']], { base: 10 }, '從這扇窗看，整棟房子像一個方塊。', '東窗的詩讀通了。這扇窗，現在轉得動了。', []
    ]);
    expect([levelById('5-2')!.unlock, levelById('5-2')!.abilities, CH5.levels['5-2'], CHAPTERS.find(c => c.id === 5)!.levels]).toEqual([{ after: ['5-1'] }, ['nib', 'scale'], 'east', ['5-1', '5-2']]);
  });

  it('字條：三張 (L1 / L2 / 劇情)；原文；H1～H4 / H10；間距 ≥ 3、離窗 ≥ 2.6；天窗銘文 (東) 只在實景', () => {
    const notes = east.objects.filter(o => o.type === 'note');
    const txt = (o: (typeof notes)[number]) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -8.6, '他的字，好像不是寫給站直的人看的。', undefined], ['noteA2', -2, '水裡的星星，要從哪一邊才看得見？', 240],
      ['noteStory', 6.6, '他在這裡看了一輩子的星星。我在玻璃上，只看見自己。', undefined]
    ]);
    const AHA = ['轉', '片', '軸', '面', '外', '小', '縮', '窗', '倒', '讀', '合', '秤', '重', '光', '對', '齊', '符', '陣', '門'];
    const KEYS = ['窗框', '詩', '字卡', '星表匣', '倒影', '天窗銘文'];
    for (const o of notes) {
      const t = txt(o);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t) || /^(把|先|去|到)/.test(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(o.id === 'noteA2' ? 30 : o.id === 'noteA' ? 24 : 40);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
      expect(9.6 - o.x).toBeGreaterThanOrEqual(2.6);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    const ins = east.objects.find(o => o.id === 'inscriptionE')!;
    expect([ins.type, ins.visible, TEXT(ins.type === 'remark' ? ins.textKey : '')]).toEqual(['remark', '3d', '窗台角上刻著一行字：「東窗的縫，橫著，和地平線一樣。」']);
  });

  it('faceOfCell：3×3×3 的六個面心 → 方位，其餘 null；與 content faceOf 一致', () => {
    expect([[2, 1, 1], [0, 1, 1], [1, 0, 1], [1, 2, 1], [1, 1, 2], [1, 1, 0], [1, 1, 1], [0, 0, 1], undefined].map(c => faceOfCell(c))).toEqual(['E', 'W', 'N', 'S', 'U', 'D', null, null, null]);
    expect(faceOf(CH5_AFTER51, 'east')).toBe(faceOfCell(CH5_AFTER51.pos.east));
  });
});

describe('5-2 星表匣與窗框的說明', () => {
  it('星表匣 (3D 按 E)：三張詞卡「抬」「低」「垂」；再按 = 空了；藏寶圖裡打不開', () => {
    const cs = inEastUp();
    expect([cs.state.room, cs.world.msg, ['card.tai', 'card.di', 'card.chui'].map(c => hasItem(cs.world, c))]).toEqual(['east', '匣裡是一疊手抄的星表，夾著三張字卡：「抬」「低」「垂」。', [true, true, true]]);
    runScript(cs.world, [{ act: 'interact' }]);
    expect(cs.world.msg).toBe('匣裡只剩手抄的星表。');
    in2d(cs);
    expect(findTarget(cs.world)?.def.id).not.toBe('starCase');
  });

  it('窗框 (3D 按 E)：水平 = 順讀不通、朝上 = 側影、朝下 = 倒影 (windowView level / up / flip)', () => {
    const cs = inEastUp();
    const o = get(cs, 'poem');
    const say = (at: readonly [number, number, number]) => {
      cs.world.ext = { ...cs.world.ext, cube: { ...cs.world.ext.cube!, at } };
      runScript(cs.world, READ_WINDOW);
      return [windowView(cs.world, o), cs.world.msg];
    };
    expect([say([2, 1, 1]), say([1, 1, 2]), say([1, 1, 0]), say([1, 2, 1])]).toEqual([
      ['level', '窗框兩側各刻著一行直書的字：「上在星首仰」「下在星頭」，最後一格是空的。順著讀，讀不通。'],
      ['up', '窗朝上了。天頂的星光直直灌進來，把兩行字的影子照得橫躺在地上——側著，還是讀不通。'],
      ['flip', '窗朝下了。窗外一片黑，玻璃像一池靜水，兩行字上下顛倒地倒映在裡面。'],
      ['level', '窗框兩側各刻著一行直書的字：「上在星首仰」「下在星頭」，最後一格是空的。順著讀，讀不通。']
    ]);
  });
});

describe('5-2 倒過來的詩 (P18 / P1)', () => {
  it('東窗在頂面 (朝上)：標籤讀作「下在星頭＿」、貼對的「低」也退回 (順著刻的這一行)；字卡匣照順讀顯示', () => {
    const cs = play(in2d(inEastUp()), AT_WINDOW);
    expect([faceOf(cs.state.cube!, 'east'), deriveCardTray(cs.world, TEXT, 0)!.text.head]).toEqual(['U', expect.stringContaining('下在星頭＿')]);
    runScript(cs.world, [card('card.di'), { wait: 0.05 }]);
    expect([cs.world.msg, hasItem(cs.world, 'card.di'), cardsOn(cs.world, LABEL), get(cs, 'poem').used]).toEqual(['字貼上去，又滑了下來。順著刻的這一行，貼什麼都讀不通。', true, [], false]);
  });

  it('在東窗裡轉到底面 (南北軸 ↻ 兩次)：讀作「＿頭星在下」；「抬」無效；「低」讀通 = 5-2、SE 鬆開 (人在東窗才列)、房間通關', () => {
    let cs = in2d(inEastUp());
    cs = in2d(turn(cs, T('Y1', 1), T('Y1', 1)));
    expect([faceOf(cs.state.cube!, 'east'), cs.state.turns!.left, dialBlocked(cs, T('SE', 1))]).toEqual(['D', 8, 'locked']);
    runScript(cs.world, AT_WINDOW);
    expect(deriveCardTray(cs.world, TEXT, 0)!.text.head).toContain('＿頭星在下');
    runScript(cs.world, [card('card.tai'), { wait: 0.05 }]);
    expect([cs.world.msgKey, get(cs, 'poem').used]).toEqual(['msg.label.invalid', false]);
    expect(['card.di', 'card.chui', 'card.fu', 'card.tai'].map(c => accepts(get(cs, 'poem'), c))).toEqual([true, true, true, false]);
    cs = play(cs, [card('card.di'), { wait: 0.05 }]);
    expect([cs.world.msg, get(cs, 'poem').used, doneFlags(cs.spec, cs.state, cs.world).has('5-2'), clearedRooms(cs.spec, cs.state, cs.world)]).toEqual([
      '字沉進了倒影裡。兩行詩一起讀通了——窗框上的一顆星釘，鬆開了。', true, true, ['east']
    ]);
    expect([dialBlocked(cs, T('SE', 1)), ch5Stage(doneFlags(cs.spec, cs.state, cs.world))]).toEqual([null, 1]);
    // 窗框 SE 轉一次：東窗原地轉 (位置不變、朝向變)
    const before = [cs.state.cube!.pos.east, cs.state.cube!.rot.east];
    cs = turn(cs, T('SE', 1));
    expect([cs.state.cube!.pos.east, cs.state.cube!.rot.east === before[1]]).toEqual([before[0], false]);
    runScript(in3d(cs).world, READ_WINDOW);
    expect(cs.world.msg).toBe('兩行詩讀通了：抬頭，星在上；低頭，星在下。窗框的星釘已經鬆開。');
  });

  it('解法 A (南北軸)：東西軸 ↻ ×2 → 走到樓梯口 → 南北軸 ↺ (樓梯口窄梯 ↔ 東窗北門) → 爬進東窗 (朝下) → 「垂」讀通', () => {
    let cs = turn(after51(), T('X1', 1), T('X1', 1));
    cs = in2d(through(cs, 'doorE'));
    expect(cs.state.room).toBe('landing');
    cs = in2d(through(turn(cs, T('Y1', -1)), 'hatchU'));
    expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'east')]).toEqual(['east', 'doorN', 'D']);
    cs = play(in3d(cs), TAKE_CARDS);
    cs = play(in2d(cs), [...AT_WINDOW, card('card.chui'), { wait: 0.05 }]);
    expect([get(cs, 'poem').used, doneFlags(cs.spec, cs.state, cs.world).has('5-2')]).toEqual([true, true]);
  });

  it('解法 B (上下軸 + 東西軸)：走到樓梯口 → 東西軸 ↺ → 上下軸 ↻ (窄梯 ↔ 東窗地板梯口) → 進東窗 (朝南：順讀，退回) → 東西軸 ↺ (連人轉到底面) → 「低」讀通', () => {
    let cs = in2d(through(after51(), 'doorE'));
    cs = in2d(through(turn(cs, T('X1', -1), T('Z1', 1)), 'hatchU'));
    expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'east')]).toEqual(['east', 'hatchD', 'S']);
    cs = play(in3d(cs), TAKE_CARDS);
    cs = play(in2d(cs), [...AT_WINDOW, card('card.di'), { wait: 0.05 }]);
    expect([cs.world.msgKey, get(cs, 'poem').used]).toEqual(['lvl.5-2.poem.wrong', false]);
    cs = in2d(turn(cs, T('X1', -1)));
    expect(faceOf(cs.state.cube!, 'east')).toBe('D');
    cs = play(cs, [...AT_WINDOW, card('card.di'), { wait: 0.05 }]);
    expect([get(cs, 'poem').used, cs.world.ext.cube!.links.hatchD]).toEqual([true, { to: 'room', room: 'landing', door: 'hatchU', kind: 'door' }]);
  });

  it('R = 回到進房時 (詞卡回匣、詩沒讀通)', () => {
    let cs = in2d(inEastUp());
    cs = in2d(turn(cs, T('Y1', 1), T('Y1', 1)));
    cs = play(cs, [...AT_WINDOW, card('card.di'), { wait: 0.05 }]);
    expect(get(cs, 'poem').used).toBe(true);
    const back = restartRoom(cs, OPTS);
    expect([get(back, 'poem').used, get(back, 'starCase').used, back.world.ext.labels?.[LABEL]]).toEqual([false, false, undefined]);
  });
});

describe('5-2 validateDial (CH5_ZONE52) 與拿掉要素', () => {
  it('中間片 + 東窗的窗框；起點 = 5-1 完成：狀態 1,425,618 (< 2×10⁶)、卡死 0；5-2 3 / 3、SE.turn 1', () => {
    const z = CH5_ZONE52;
    const r = validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube }));
    expect([r.solvable, r.states, r.arrangements, r.deadlocks, r.issues, r.lockIssues, r.entryIssues]).toEqual([true, 1425618, 36864, [], [], [], []]);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.issues])).toEqual([['5-2', 3, 3, []], ['SE.turn', 1, 1, []]]);
  }, 120_000);

  it('只留一條軸 → 無解；任兩條軸都有解 (兩類轉法互為備援)', () => {
    const z = CH5_ZONE52;
    const only52 = z.puzzles.slice(0, 1);
    const run = (keep: string[]) => {
      const cube = { ...z.cube, dial: { ...z.cube.dial!, groups: CH5_MIDDLE.filter(g => keep.includes(g.id)), locks: [] } };
      const r = validateDial(dialModelOf(cube, CH5.rooms, only52, z.start, '5-2', { startCube: z.startCube }));
      return [keep.join('+'), r.solvable, r.perPuzzle[0].shortest];
    };
    const res = [['X1'], ['Y1'], ['Z1'], ['X1', 'Y1'], ['X1', 'Z1'], ['Y1', 'Z1']].map(run);
    expect(res.slice(0, 3).map(r => r[1])).toEqual([false, false, false]);
    expect(res.slice(3).map(r => r[1])).toEqual([true, true, true]);
  }, 120_000);
});

describe('5-2 音訊', () => {
  it('USED_ON：詩讀通 (星釘鬆開)、打開星表匣；分層 = 1 扇窗', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'east', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 10,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('p', 'poemWindow', false), o('c', 'starCase', false)]));
    const out = obs.update(s([o('p', 'poemWindow', true), o('c', 'starCase', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.latch.open', 'sfx.drawer.open']);
    expect(ch5Stage(new Set(['5-1a', '5-1b', '5-2']))).toBe(1);
  });
});
