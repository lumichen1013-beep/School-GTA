// 4-1 根窖走廊 (規格 6「4-1 根窖走廊（細化）」)：資料與驗證器、擺設三帶、高度與距離 (D10)、validateDial (CH4_ZONE41)、
// 4-1a 整層一起轉 (兩種轉法、土、入口轉走)、4-1b 圖上相鄰，腳下不通 (折疊梯收著、實景搆不到、藏寶圖台階 + 拉繩、展開圖照畫接通)、
// 4-1c 從天花板落下的箱子 (窄梯口 / 土 / 往上推、落在踏板上 → 下層立刻鬆開)、房間通關、R、存檔與舊存檔、字條規則、音效
import { describe, it, expect } from 'vitest';
import { hall } from '../../../src/puzzle/content/levels/ch4/4-1-hall';
import { archive, drawer } from '../../../src/puzzle/content/levels/ch4/rooms';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH4_CUBE, CH4_ZONE41 } from '../../../src/puzzle/content/cubes/ch4';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { createWorld } from '../../../src/puzzle/core/world';
import { INTERACT_RANGE, JUMP_V_2D, JUMP_V_3D, GRAVITY } from '../../../src/puzzle/core/constants';
import type { Turn } from '../../../src/puzzle/core/cube';
import {
  captureState, clearedRooms, dialBlocked, dialTurn, openChapter, restartRoom, type ChapterSession, type ChapterState
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap } from '../../../src/puzzle/app/cubeMapModel';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH4 = CUBE_CHAPTERS.find(c => c.chapter === 4)!;
const SPEC = chapterSpecOf(CH4);
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const def = (l: typeof hall, id: string): ObjDef => l.objects.find(o => o.id === id)!;
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
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH4.start), OPTS);
/** 啟動年輪根盤、切到藏寶圖 (轉動在 2D) */
const activated = (): ChapterSession => {
  const cs = play(start(), [{ wait: 0.1 }, { walkTo: [9.0, -2.7] }, { act: 'interact' }]);
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
};
/** 穿過一扇門 (門的事件直接交給章節層) */
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind} ${cs.world.msg}`);
  return r.next;
};
const turns = (cs: ChapterSession, ts: Turn[]): ChapterSession => ts.reduce((c, t) => ok(dialTurn(c, t)), cs);
/** 3D 站到地板梯口前按 E */
const hatchDown = (cs: ChapterSession): ChapterSession => play(cs, [{ place: [-2.0, 0, 2.6], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
/** 藏寶圖：在書庫跳上只畫在圖上的台階、按 E 拉繩 */
const pullCord = (cs: ChapterSession): ChapterSession => play(cs, [{ place: [-1.4, 0, 0], mode: '2d' }, { wait: 0.1 }, { hop: -1, until: w => w.player.y > 1.3 && w.player.onGround, seconds: 3 }, { wait: 0.2 }, { act: 'interact' }]);
/** 推木箱往西進地板梯口 (3D)：站到箱子東側、沿 z 1.6 往西走 */
const pushCrate = (cs: ChapterSession): ChapterSession => play(cs, [{ place: [6.0, 0, 1.6], mode: '3d' }, { wait: 0.1 }, { walkTo: [-0.1, null] }, { wait: 0.1 }]);

describe('4-1 根窖走廊：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 4-1a / 4-1b / 4-1c；登錄 (前置 3-4)；通關文字；擺設三帶', () => {
    expect(validateLevel(hall, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    for (const l of [archive, drawer]) expect(validateLevel(l, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('4-1')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(hall.puzzles!.map(q => [q.id, TEXT(q.titleKey)])).toEqual([['4-1a', '4-1a 整層一起轉'], ['4-1b', '4-1b 圖上相鄰，腳下不通'], ['4-1c', '4-1c 從天花板落下的箱子']]);
    expect([TEXT(hall.nextKey), levelById('4-1')!.unlock.after]).toEqual(['下圈年輪鬆開了。墨爐間的爐火，好像亮了一點。', ['3-4']]);
    for (const l of [hall, archive, drawer]) expect([l.id, layoutDepthIssues(l)]).toEqual([l.id, []]);
    // 4-1 的物件：梯口閂住 4-1a、木箱、書庫的折疊梯 / 拉繩 / 台階、抽屜的根結踏板
    const hd = def(hall, 'hatchD');
    expect([hd.doneFlag, hd.type === 'cubeDoor' && TEXT(hd.passText!), def(hall, 'crate').pushable, def(hall, 'crate').z]).toEqual(['4-1a', '整層樓轉了過去。梯口底下，換成了一間房。', true, 1.6]);
    const hu = def(archive, 'hatchU');
    expect([hu.type === 'cubeDoor' && hu.sealed, def(archive, 'foldCord').doneFlag, def(archive, 'foldCord').interactIn, def(archive, 'inkStep').visible, def(drawer, 'rootPlate').doneFlag])
      .toEqual([{ until: '4-1b', text: 'lvl.4-1.ladder.folded' }, '4-1b', '2d', '2d', '4-1c']);
  });

  it('高度與距離 (D10)：台階 1.4 < 藏寶圖跳 1.6 − 0.15、> 實景跳 1.25；拉繩下緣 2.6：站在地板 (兩個視角) 超出互動距離，站上台階才搆得到；台階只在藏寶圖', () => {
    const jump2d = JUMP_V_2D ** 2 / (2 * GRAVITY), jump3d = JUMP_V_3D ** 2 / (2 * GRAVITY);
    const step = def(archive, 'inkStep'), cord = def(archive, 'foldCord');
    expect([jump2d - step.h >= 0.15, jump3d < step.h, cord.y - 0.45 > INTERACT_RANGE, cord.y - (step.h + 0.45) < INTERACT_RANGE]).toEqual([true, true, true, true]);
    const w = createWorld(archive, OPTS);
    for (const mode of ['3d', '2d'] as const) {
      runScript(w, [{ place: [-3.0, 0, -3.3], mode }, { wait: 0.1 }]);
      expect([mode, findTarget(w)?.def.id ?? null]).not.toEqual([mode, 'foldCord']);
    }
  });

  it('字條：五張 (L1 × 3、L2 × 2 空白 240 秒)；原文；落地木柱；H1～H4 / H10；間距 ≥ 3、任一 16 單位畫面 ≤ 3 張；兩個視角都讀得到', () => {
    const notes = hall.objects.filter(o => o.type === 'note');
    const txt = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -10.8, '樓下的房間，有時候不在樓下。', undefined], ['noteB', -7.6, '爸爸說：紙上的人，比較輕。', undefined],
      ['noteB2', -4.4, '搆不著的時候，牆上畫的東西也算數嗎？', 240], ['noteC', 7.4, '箱子自己不會走，可是地板會。', undefined],
      ['noteC2', 10.4, '哪一間的入口，寬得讓箱子通過？', 240]
    ]);
    const AHA = ['轉', '層', '上下', '梯', '對齊', '疊', '跳', '推', '墨', '光'];
    const KEYS = ['年輪根盤', '控制盤', '木箱', '踏板', '拉繩', '封存書庫', '最後的抽屜'];
    for (const o of notes) {
      const t = txt(o);
      expect([o.id, [...t].length <= (o.type === 'note' && o.revealAfter ? 30 : 24)]).toEqual([o.id, true]);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t)).toBe(false);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = createWorld(hall, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : txt(o));
    }
  });
});

describe('validateDial：4-1 區 (CH4_ZONE41)', () => {
  const m = dialModelOf(CH4_ZONE41.cube, CH4.rooms, CH4_ZONE41.puzzles, CH4_ZONE41.start, CH4_ZONE41.finish);
  const per = (rep: ReturnType<typeof validateDial>) => rep.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues]);
  it('可達排列 16 (4-1c 之後下層才轉)、抽象狀態 1,851、卡死 0 (含 R)、需要 R 24；4-1a 1 / 1 / 2 / 2 (教學)、4-1b 1 / 3 / 3 / 3、4-1c 2 / 2 / 2 / 2；預算 8；無問題', () => {
    const r = validateDial(m);
    expect([r.arrangements, r.states, r.needsRestart, r.solvable, r.deadlocks, r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([16, 1851, 24, true, [], [], [], [], []]);
    expect(per(r)).toEqual([['4-1a', 1, 1, 2, 2, 8, []], ['4-1b', 1, 3, 3, 3, 8, []], ['4-1c', 2, 2, 2, 2, 8, []], ['ch4.hall', 0, null, 1, 1, 8, []]]);
    expect(m.doorLocks).toContainEqual({ room: 'archive', door: 'hatchU', until: '4-1b' });
  });
  it('拿掉要素 → 無解：沒有拉繩 (4-1b 永不成立) → 走進書庫就卡死 (87 個進房快照)；抽屜梯口改窄 (4-1c 永不成立) → 根結解不開 (鎖扣自我等待)', () => {
    const noCord = validateDial({ ...m, puzzles: m.puzzles.map(p => (p.id === '4-1b' ? { ...p, goal: () => false } : p)) });
    expect([noCord.solvable, noCord.issues]).toEqual([false, ['87 entry snapshots cannot finish (listed 20)']]);
    const narrow = validateDial({ ...m, puzzles: m.puzzles.map(p => (p.id === '4-1c' ? { ...p, goal: () => false } : p)) });
    expect([narrow.solvable, narrow.arrangements, narrow.lockIssues]).toEqual([false, 4, ['lock L0: 4-1c unreachable while L0 stays locked']]);
  });
});

describe('4-1a 整層一起轉 (P1 教學)', () => {
  it('S0：地板梯口下面是土；↺ → 疊在書庫上 (門)、入口轉走 (門後是牆) → 爬下 = 4-1a (閂住、到了下面說一句)；↻ → 疊在抽屜上 (拱門) → 爬下也一樣', () => {
    let cs = activated();
    expect(cs.world.ext.cube!.links.hatchD).toEqual({ to: 'wall' });
    cs = turns(cs, [T('L1', -1)]);
    expect([cs.world.ext.cube!.links.hatchD, cs.world.ext.cube!.links.doorN]).toEqual([{ to: 'room', room: 'archive', door: 'hatchU', kind: 'door' }, { to: 'wall' }]);
    cs = hatchDown(cs);
    expect([cs.state.room, cs.world.msg, cs.state.rooms.hall.objs.find(s => s.id === 'hatchD')!.used, clearedRooms(SPEC, cs.state, cs.world)]).toEqual(['archive', '整層樓轉了過去。梯口底下，換成了一間房。', true, []]);
    let b = turns(activated(), [T('L1', 1)]);
    expect(b.world.ext.cube!.links.hatchD).toEqual({ to: 'room', room: 'drawer', door: 'hatchU', kind: 'arch' });
    b = hatchDown(b);
    expect([b.state.room, b.world.msg]).toEqual(['drawer', '整層樓轉了過去。梯口底下，換成了一間房。']);
    // 第二次爬下：不再說
    b = hatchDown(through(b, 'hatchU'));
    expect([b.state.room, b.world.msg]).toEqual(['drawer', '']);
  });
});

describe('4-1b 圖上相鄰，腳下不通 (P9)', () => {
  const inArchive = (): ChapterSession => hatchDown(turns(activated(), [T('L1', -1)]));
  it('書庫：展開圖照畫「梯口接通」，實景按 E = 折疊梯收著 (不換房)；東門被墨線封著；實景站在拉繩下搆不到', () => {
    const cs = inArchive();
    const m = deriveCubeMap(cs, TEXT)!;
    expect(m.doors.find(d => d.room === 'archive' && d.door === 'hatchU')!.link).toBe('room');
    const r = applyChapterEvent(cs, { t: 'door', door: 'hatchU' }, OPTS);
    expect([r.kind, cs.world.msg, cs.state.room]).toEqual(['blocked', '折疊梯收在天花板上，搆不到。', 'archive']);
    expect([applyChapterEvent(cs, { t: 'door', door: 'doorE' }, OPTS).kind, cs.world.msg]).toEqual(['blocked', '門縫纏著乾掉的墨線。']);
    runScript(cs.world, [{ walkTo: [-3.0, -3.3] }, { hop: 0, until: w => w.player.y > 1.0, seconds: 1, optional: true }, { wait: 0.5 }]);
    expect(findTarget(cs.world)?.def.id ?? null).not.toBe('foldCord');
  });
  it('藏寶圖：跳上畫在牆上的台階 → 按 E 拉繩 → 4-1b (閂住)、折疊梯放下 → 爬得上去回到走廊', () => {
    let cs = pullCord(inArchive());
    expect([cs.world.player.y > 1.3, get(cs, 'foldCord').used, cs.world.msg]).toEqual([true, true, '拉繩一扯，折疊梯放了下來。']);
    cs = play(cs, [{ place: [-4.0, 0, -3.3], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([cs.state.room, cs.state.door]).toEqual(['hall', 'hatchD']);
  });
});

describe('4-1c 從天花板落下的箱子 (P2)', () => {
  it('錯誤嘗試：梯口疊在土上推 →「梯口下面是土。」；疊在書庫上推 →「梯口太窄，箱子下不去。」(箱子留在走廊)', () => {
    let cs = pushCrate(activated());
    expect([cs.world.msg, cs.world.byId.has('crate')]).toEqual(['梯口下面是土。', true]);
    cs = pushCrate(turns(activated(), [T('L1', -1)]));
    expect([cs.world.msg, cs.world.byId.has('crate')]).toEqual(['梯口太窄，箱子下不去。', true]);
  });

  it('走廊轉到抽屜上 (↻) → 推進地板梯口 → 箱子落在抽屜的根結踏板上 → 4-1c、下層立刻鬆開 (不必走進抽屜)；抽屜裡往上推 =「箱子推不上去。」', () => {
    let cs = pushCrate(turns(activated(), [T('L1', 1)]));
    const mv = cs.state.moved.crate;
    expect([cs.world.byId.has('crate'), mv.room, +mv.x.toFixed(3), +mv.z.toFixed(3), cs.world.msg]).toEqual([false, 'drawer', -5.2, -2.4, '木箱落在踏板上。纏著年輪的樹根鬆開了——下層轉得動了。']);
    expect([cs.state.rooms.drawer.objs.find(s => s.id === 'rootPlate')!.used, cs.state.unlocked, dialBlocked(cs, T('L0', 1))]).toEqual([true, ['L0'], null]);
    cs = hatchDown(cs);
    expect([cs.state.room, get(cs, 'rootPlate').used, get(cs, 'crate').x]).toEqual(['drawer', true, -5.2]);
    // 繞到箱子南側 (不碰到它)，再往北把它推向梯子
    runScript(cs.world, [{ walkTo: [-3.6, null] }, { walkTo: [null, -1.0] }, { walkTo: [-5.2, null] }, { walkTo: [null, -3.4] }, { wait: 0.1 }]);
    cs = pump(cs);
    expect([cs.world.msg, cs.world.byId.has('crate')]).toEqual(['箱子推不上去。', true]);
  });

  it('三題都完成 = 走廊房間通關 (題在書庫 / 抽屜完成)；R：在走廊推落箱子後 R → 箱子回到走廊、踏板與鎖扣退回', () => {
    let cs = pullCord(hatchDown(turns(activated(), [T('L1', -1)])));
    cs = play(cs, [{ place: [-4.0, 0, -3.3], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]); // 回走廊
    runScript(cs.world, [{ place: [0, 0, 0], mode: '2d' }, { wait: 0.15 }]);
    cs = pushCrate(turns(cs, [T('L1', 1), T('L1', 1)]));
    expect(clearedRooms(SPEC, cs.state, cs.world)).toEqual(['hall']);
    const back = restartRoom(cs, OPTS);
    expect([back.world.byId.has('crate'), back.state.moved.crate, back.state.unlocked ?? [], back.state.rooms.drawer?.objs.find(s => s.id === 'rootPlate')?.used ?? false]).toEqual([true, undefined, [], false]);
  });
});

describe('存檔與舊存檔、音效', () => {
  it('存檔往返：箱子落進抽屜、鎖扣解開 → 寫檔 → 讀回：箱子在抽屜、踏板壓著、下層轉得動', () => {
    const cs = pushCrate(turns(activated(), [T('L1', 1)]));
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['3-4'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH4.start), OPTS);
    expect([back.state.room, back.state.moved.crate?.room, back.state.unlocked, back.world.byId.has('crate')]).toEqual(['hall', 'drawer', ['L0'], false]);
  });
  it('舊存檔 (骨架版的走廊快照：沒有木箱與字條)：照常開章——新物件取關卡初值', () => {
    const legacy: ChapterState = { ...chapterStart(defaultSave(), SPEC, CH4.start), dial: true, rooms: { hall: { objs: [{ id: 'hatchD', x: -2, y: 0, z: 1.6, gone: false, used: false, touched: false }], flags: [] } } };
    const cs = openChapter(SPEC, legacy, OPTS);
    expect([cs.world.byId.get('crate')!.x, cs.world.byId.has('noteA'), cs.state.dial]).toEqual([4.5, true, true]);
  });
  it('USED_ON：拉繩 = sfx.cord.pull、根結踏板 = sfx.plate.press (LevelObserver：used 由 false 變 true 的那一刻)', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'archive', mode: '2d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('c', 'foldCord', false), o('p', 'rootPlate', false)]));
    const out = obs.update(s([o('c', 'foldCord', true), o('p', 'rootPlate', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.cord.pull', 'sfx.plate.press']);
  });
});

void CH4_CUBE;
