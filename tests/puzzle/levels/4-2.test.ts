// 4-2 墨爐間 (規格 6「4-2 墨爐間（細化）」)：資料與擺設、墨流 inkPaths (四種疊法、閥)、4-2a 墨流 (P15 首次：閥、錯誤嘗試、西門 / 東門、殘片 3)、
// 4-2b 地板縫裡的光 (只轉上層 / 只轉下層 / 兩者；本地方位)、4-2c 記號跑到哪 (顯影、叉本身那格、正解)、房間通關、validateDial (CH4_ZONE42 與拿掉要素)、
// 展開圖的管線圖層、R、舊存檔、字條規則、音效
import { describe, it, expect } from 'vitest';
import { furnace } from '../../../src/puzzle/content/levels/ch4/4-2-furnace';
import { well } from '../../../src/puzzle/content/levels/ch4/rooms';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH4_CUBE, CH4_GLASS, CH4_INK, CH4_ZONE42 } from '../../../src/puzzle/content/cubes/ch4';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyTurn, initialCube, isBlocked, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { clearedRooms, dialTurn, inkPaths, openChapter, restartRoom, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap } from '../../../src/puzzle/app/cubeMapModel';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
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
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind} ${cs.world.msg}`);
  return r.next;
};
const in2d = (cs: ChapterSession): ChapterSession => { runScript(cs.world, [{ place: [cs.state.room === 'furnace' ? 3 : 1, 0, 0], mode: '2d' }, { wait: 0.15 }]); return cs; };
const turns = (cs: ChapterSession, ts: Turn[]): ChapterSession => pump(ts.reduce((c, t) => ok(dialTurn(in2d(c), t)), cs));
/** 4-1 完成之後 (啟動根盤、↻、推木箱落到抽屜的踏板 = 下層鬆開)，走到墨爐間 (根井的根梯)；此刻 u = 1、l = 0 (走廊疊在抽屜上) */
function inFurnace(): ChapterSession {
  let cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH4.start), OPTS);
  cs = play(cs, [{ wait: 0.1 }, { walkTo: [9.0, -2.7] }, { act: 'interact' }]);
  cs = turns(cs, [T('L1', 1)]);
  cs = play(cs, [{ place: [6.0, 0, 1.6], mode: '3d' }, { wait: 0.1 }, { walkTo: [-0.1, null] }, { wait: 0.1 }]);
  cs = through(through(cs, 'doorS'), 'ladderD');
  return cs;
}
const openValve = (cs: ChapterSession): ChapterSession => play(cs, [{ place: [-3.4, 0, -2.2], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
const spin = (...ts: Turn[]): CubeState => ts.reduce<CubeState>((s, t) => { const r = applyTurn(CH4_CUBE, s, t); if (isBlocked(r)) throw new Error(r.blocked); return r; }, initialCube(CH4_CUBE));
const def = (id: string): ObjDef => furnace.objects.find(o => o.id === id)!;

describe('4-2 墨爐間：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 4-2a～4-2c；登錄 (前置 4-1)；旁白 / 通關；擺設三帶；管線 / 玻璃資料', () => {
    for (const l of [furnace, well]) expect(validateLevel(l, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('4-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(furnace.puzzles!.map(q => [q.id, TEXT(q.titleKey)])).toEqual([['4-2a', '4-2a 墨流'], ['4-2b', '4-2b 地板縫裡的光'], ['4-2c', '4-2c 記號跑到哪']]);
    expect([levelById('4-2')!.unlock.after, CH4.levels['4-2'], CH4.rooms.furnace, TEXT(furnace.narrationKey), TEXT(furnace.nextKey)])
      .toEqual([['4-1'], 'furnace', furnace, '牆上的影子，慢了半拍。', '墨爐的藍光穩下來了。牆上的影子，終於跟上了。']);
    for (const l of [furnace, well]) expect([l.id, layoutDepthIssues(l)]).toEqual([l.id, []]);
    expect([CH4_CUBE.ink, CH4_CUBE.glass]).toEqual([CH4_INK, CH4_GLASS]);
    expect(CH4_INK).toEqual({
      furnace: { source: 'U', valve: 'ink.valve', sinks: ['W', 'E'] }, well: { pipes: [['D', 'N']] }, hall: { pipes: [['S', 'D']] }, archive: { pipes: [['U', 'E']] }, drawer: { pipes: [['U', 'W']] }
    });
  });

  it('字條：六張 (L1 × 3、L2 × 3 空白 240 秒)；原文；H1～H4 / H10；間距 ≥ 3、任一 16 單位畫面 ≤ 3 張；兩個視角都讀得到', () => {
    const notes = furnace.objects.filter(o => o.type === 'note');
    const txt = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -12.5, '樹也會喝水。水從腳底，一路爬到樹梢。', undefined], ['noteA2', -9, '爬上去的，要從哪裡回家？', 240],
      ['noteB', -5.5, '月亮也找得到地下室，只要地板有縫。', undefined], ['noteB2', 5.5, '從天窗往下看，先經過誰、再經過誰？', 240],
      ['noteC', 9, '爸爸的圖，總是比房子慢半拍。', undefined], ['noteC2', 12.5, '那個箭頭，指著哪一邊？', 240]
    ]);
    const AHA = ['墨', '管', '流', '接', '轉', '層', '上下', '疊', '光', '照', '稜鏡', '玻璃', '塗', '記號'];
    const KEYS = ['墨爐', '墨爐閥', '墨線鎖', '走廊', '封存書庫', '年輪根盤', '舊圖', '小櫃', '玻璃眼'];
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
      const w = createWorld(furnace, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : txt(o));
    }
  });
});

describe('墨流 inkPaths (core/chapter)', () => {
  const on = new Set(['furnace']);
  it('走廊疊在誰上面 (u − l)：0 土 → 停在走廊的地板梯口；1 抽屜 → 墨爐 E；2 封存室 → 停；3 書庫 → 墨爐 W；閥沒開 = 沒有墨', () => {
    const at = (u: number, l: number) => inkPaths(CH4_CUBE, spin(...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1))), on);
    const sum = (u: number, l: number) => { const p = at(u, l); return [p.sinks, p.flows[0].steps.map(s => s.room), p.flows[0].stop ? 'stop' : 'sink']; };
    expect(sum(0, 0)).toEqual([{}, ['furnace', 'well', 'hall'], 'stop']);
    expect(sum(1, 0)).toEqual([{ furnace: ['E'] }, ['furnace', 'well', 'hall', 'drawer', 'furnace'], 'sink']);
    expect(sum(2, 0)).toEqual([{}, ['furnace', 'well', 'hall'], 'stop']);
    expect(sum(3, 0)).toEqual([{ furnace: ['W'] }, ['furnace', 'well', 'hall', 'archive', 'furnace'], 'sink']);
    // 兩層一起轉同樣的角度：相對位置不變 (墨流只看 u − l)
    expect(sum(2, 1)).toEqual(sum(1, 0));
    expect(inkPaths(CH4_CUBE, initialCube(CH4_CUBE), new Set()).flows).toEqual([]);
  });
});

describe('4-2a 墨流 (P15 首次)', () => {
  it('閥沒開：墨線鎖是乾的；開閥 (走廊疊在抽屜上：u 1) → 東門先化開 (ink.E)、西門照樣乾 → 走廊轉到書庫上 (↻ ×2) → 西門化開 = 4-2a (閂住)、西門通了', () => {
    let cs = inFurnace();
    runScript(cs.world, [{ place: [-12.4, 0, 1.3], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([findTarget(cs.world)?.def.id, cs.world.msg]).toEqual(['lockW', '墨線鎖是乾的。墨沒有流回來。']);
    cs = openValve(cs);
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([get(cs, 'inkValve').used, get(cs, 'lockE').used, get(cs, 'lockW').used, cs.world.ext.ink]).toEqual([true, true, false, { through: true, sinks: ['E'] }]);
    expect(cs.world.msg).toBe('墨沿著樹根繞了一圈，從東邊流回爐邊。東門的墨線鎖化開了。');
    cs = turns(cs, [T('L1', 1), T('L1', 1)]);
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([get(cs, 'lockW').used, cs.world.msg]).toEqual([true, '墨沿著樹根繞了一圈，流回爐邊。西門的墨線鎖化開了。']);
    cs = through(cs, 'doorW');
    expect([cs.state.room, cs.state.door]).toEqual(['archive', 'doorE']);
  });

  it('開閥但走廊下面是土 (↺ 一次：u 0) → 墨停在走廊的梯口，兩扇鎖都乾；殘片 3：墨流過根井 → 墨痕顯出、殘片只在藏寶圖拿', () => {
    let cs = openValve(turns(inFurnace(), [T('L1', -1)]));
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([get(cs, 'lockW').used, get(cs, 'lockE').used, cs.world.ext.ink]).toEqual([false, false, { through: true, sinks: [] }]);
    cs = through(cs, 'ladderU');
    runScript(cs.world, [{ wait: 1 / 30 }]);
    expect([cs.state.room, get(cs, 'inkMark').used]).toEqual(['well', true]);
    runScript(cs.world, [{ place: [-1.6, 0, -3.8], mode: '3d' }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id ?? null).not.toBe('scrap3');
    runScript(cs.world, [{ place: [-1.6, 0, 0], mode: '2d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([hasItem(cs.world, 'scrap.3'), cs.world.msg]).toEqual([true, '墨痕裡夾著一張紙片。是老宅圖的一角。']);
  });
});

describe('4-2b 地板縫裡的光 (P6 / P1)', () => {
  it('只轉上層 (走廊在南、下面是封存室) → 玻璃眼暗；書庫也轉到南邊 (下層 ↺) → 月光穿過走廊、書庫的稜鏡 → 玻璃眼亮 = 4-2b；舊圖 (淡墨) 浮出；方位以本地計 (墨爐轉了 3 次，光從本地西邊進來)', () => {
    let cs = inFurnace();
    cs = turns(cs, [T('L1', 1)]); // u 2：走廊在南
    runScript(cs.world, [{ wait: 1 / 30 }]);
    expect([get(cs, 'eye').used, cs.world.ext.light!.hits]).toEqual([false, []]);
    runScript(cs.world, [{ place: [-12.9, 0, -2.4], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('西牆上嵌著一顆玻璃眼。裡面是暗的。');
    cs = turns(cs, [T('L0', -1)]); // l 3：書庫在南
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([cs.state.cube!.rot.furnace, cs.world.ext.light!.hits.map(h => [h.from, h.via]), get(cs, 'eye').used, cs.world.msg])
      .toEqual([3, [['W', 2]], true, '月光從地板縫落下來，穿過書庫，照進了玻璃眼。牆上的舊圖，浮出一層淡墨。']);
    runScript(cs.world, [{ place: [7.2, 0, 0], mode: '2d' }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('veil');
  });
});

describe('4-2c 記號跑到哪 (P14 / P1)', () => {
  /** 4-2b 完成 (u 2、l 3)、舊圖塗開 */
  function painted(): ChapterSession {
    let cs = turns(inFurnace(), [T('L1', 1), T('L0', -1)]);
    cs = pump(play(cs, [{ wait: 1 / 30 }, { place: [7.2, 0, 0], mode: '2d' }, { wait: 0.1 }, { act: 'interact' }]));
    return cs;
  }
  it('塗開舊圖 (藏寶圖、筆尖) → 叉在南邊、「抽屜，再轉一次」；抽屜轉到叉本身那格 (南：l 1) → 小櫃沒動 (說一次)；轉到叉順時針一次之後那格 (西：l 2) → 小櫃彈開 = 4-2c', () => {
    let cs = painted();
    expect([get(cs, 'veil').used, cs.world.msg]).toEqual([true, '舊圖上畫著下層的四間房。南邊那一格打了叉，旁邊寫著：抽屜，再轉一次。']);
    cs = turns(cs, [T('L0', 1), T('L0', 1)]); // l 3 → 0 → 1：抽屜在南 (順時針走，不經過西邊)
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([cs.state.cube!.pos.drawer.slice(0, 2), get(cs, 'markCase').used, cs.world.msg]).toEqual([[1, 2], false, '小櫃沒有動。叉旁邊，還畫著一個轉的箭頭。']);
    cs = turns(cs, [T('L0', 1)]); // l 2：抽屜在西
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([cs.state.cube!.pos.drawer.slice(0, 2), get(cs, 'markCase').used, cs.world.msg]).toEqual([[0, 1], true, '小櫃彈開了。裡面是爸爸的字：「記號標的，永遠是上一次。」']);
  });

  it('沒塗開舊圖：抽屜在西邊小櫃也不動；三題都完成 = 墨爐間房間通關；R：本次進房後完成的題退回', () => {
    let cs = turns(inFurnace(), [T('L1', 1), T('L0', -1), T('L0', -1)]); // 4-2b 完成後直接轉到 l 2
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    expect([get(cs, 'eye').used, get(cs, 'markCase').used]).toEqual([true, false]);
    // 4-2a：開閥、走廊疊在書庫上 (此刻 u 2、l 2 → 走廊下面是土；上層 ↺ → u 1：u − l = 3 = 書庫)
    cs = openValve(cs);
    cs = turns(cs, [T('L1', -1)]);
    cs = pump(play(cs, [{ wait: 1 / 30 }, { place: [7.2, 0, 0], mode: '2d' }, { wait: 0.1 }, { act: 'interact' }, { wait: 1 / 30 }]));
    expect([get(cs, 'lockW').used, get(cs, 'veil').used, get(cs, 'markCase').used, clearedRooms(SPEC, cs.state, cs.world)]).toEqual([true, true, true, ['furnace']]);
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([get(back, 'eye').used, get(back, 'markCase').used, get(back, 'inkValve').used]).toEqual([false, false, false]);
  });
});

describe('validateDial：4-2 區 (CH4_ZONE42)', () => {
  const m = dialModelOf(CH4_ZONE42.cube, CH4.rooms, CH4_ZONE42.puzzles, CH4_ZONE42.start, CH4_ZONE42.finish);
  const per = (rep: ReturnType<typeof validateDial>) => rep.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues]);
  it('16 排列、抽象狀態 17,326、卡死 0、需要 R 104；4-2a 1 / 3 (教學)、4-2b 3 / 3 / 610 / 22、4-2c 1 / 2 / 718 / 78；預算 8；無問題', () => {
    const r = validateDial(m);
    expect([r.arrangements, r.states, r.needsRestart, r.solvable, r.deadlocks, r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([16, 17326, 104, true, [], [], [], [], []]);
    expect(per(r)).toEqual([
      ['4-1c', 0, null, 1, 1, 8, []], ['4-1b', 1, 3, 3, 3, 8, []], ['ink.E', 1, 3, 3, 3, 8, []], ['4-2a', 1, 3, 3, 3, 8, []],
      ['4-2b', 3, 3, 610, 22, 8, []], ['4-2c', 1, 2, 718, 78, 8, []], ['ch4.furnace', 0, null, 1, 1, 8, []]
    ]);
  });
  it('拿掉要素 → 無解：書庫沒有稜鏡 → 4-2b；書庫沒有管線 → 4-2a；下層一直鎖著 → 4-2b / 4-2c', () => {
    const noPrism = validateDial({ ...m, cube: { ...CH4_CUBE, glass: { ...CH4_GLASS, archive: { glass: ['U', 'E'] } } } });
    expect([noPrism.solvable, noPrism.perPuzzle.find(p => p.id === '4-2b')!.shortest]).toEqual([false, null]);
    const noPipe = validateDial({ ...m, cube: { ...CH4_CUBE, ink: { ...CH4_INK, archive: {} } } });
    expect([noPipe.solvable, noPipe.perPuzzle.find(p => p.id === '4-2a')!.shortest]).toEqual([false, null]);
    const locked = validateDial({ ...m, puzzles: m.puzzles.map(p => (p.id === '4-1c' ? { ...p, goal: () => false } : p)) });
    expect([locked.solvable, locked.arrangements, locked.perPuzzle.find(p => p.id === '4-2b')!.issues]).toEqual([false, 4, ['never available (needs unreachable with dial on)']]);
  });
});

describe('展開圖的管線圖層、舊存檔、音效', () => {
  it('mapInk：每間有管線的房一筆 (並排位移)；有墨流過 = lit、收到墨的匯點 = lit、墨停住的地方 = stop', () => {
    let cs = openValve(inFurnace());
    cs = pump(play(cs, [{ wait: 1 / 30 }]));
    const k = deriveCubeMap(cs, TEXT)!.ink!;
    expect(k.sinks).toEqual([{ x: 5, y: 1, side: 'W', lit: false }, { x: 5, y: 1, side: 'E', lit: true }]);
    expect(k.pipes.filter(p => p.lit).length).toBe(4); // 墨爐的出口 + 根井 + 走廊 + 抽屜
    expect(k.stops).toEqual([]);
    cs = turns(cs, [T('L1', 1)]); // u 2：下面是封存室 → 墨停在走廊的地板梯口
    const k2 = deriveCubeMap(cs, TEXT)!.ink!;
    expect(k2.stops).toEqual([{ x: 1, y: 2, side: 'D' }]);
  });
  it('舊存檔 (骨架版的墨爐間快照：只有門)：照常開章——新物件取關卡初值', () => {
    const legacy: ChapterState = { ...chapterStart(defaultSave(), SPEC, CH4.start), room: 'furnace', door: 'ladderU', dial: true, rooms: { furnace: { objs: [{ id: 'doorW', x: -13.8, y: 0, z: 0, gone: false, used: false, touched: false }], flags: [] } } };
    const cs = openChapter(SPEC, legacy, OPTS);
    expect([cs.state.room, get(cs, 'inkValve').used, get(cs, 'lockW').used, def('eye').doneFlag]).toEqual(['furnace', false, false, '4-2b']);
  });
  it('USED_ON：墨爐閥 / 墨線鎖 / 墨痕 / 爐邊小櫃', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'furnace', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('v', 'inkValve', false), o('l', 'inkLock', false), o('m', 'inkMark', false), o('c', 'markCase', false)]));
    const out = obs.update(s([o('v', 'inkValve', true), o('l', 'inkLock', true), o('m', 'inkMark', true), o('c', 'markCase', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.lever.pull', 'sfx.door.unseal', 'sfx.lamp.on', 'sfx.drawer.open']);
  });
});
