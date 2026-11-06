// 4-3 封存書庫 (規格 6「4-3 封存書庫（細化）」)：資料與擺設、讀法表 (16 種排列)、4-3a (讀錯 / 照 S0 讀完再轉 / 正解、展開圖道具)、
// 4-3b (只化開一道 / 兩道)、驚嚇 (安靜 2.5 秒、旗標、R 不重演)、房間通關、validateDial (CH4_ZONE43)、R、舊存檔、字條規則、音效
import { describe, it, expect } from 'vitest';
import { archive } from '../../../src/puzzle/content/levels/ch4/4-3-archive';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH4_CUBE, CH4_INK, CH4_ZONE43 } from '../../../src/puzzle/content/cubes/ch4';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { archiveReading } from '../../../src/puzzle/mechanics/archive';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyTurn, initialCube, isBlocked, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { clearedRooms, openChapter, restartRoom, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { LevelObserver, SCARE_SFX, type LevelSnap } from '../../../src/puzzle/audio/events';
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
const spin = (u: number, l: number): CubeState => [...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1))]
  .reduce<CubeState>((s, t) => { const r = applyTurn(CH4_CUBE, s, t); if (isBlocked(r)) throw new Error(r.blocked); return r; }, initialCube(CH4_CUBE));
/** 在某個排列 (u, l) 開進封存書庫 (章節狀態直接給；下層已鬆開、魔方儀已啟動)；snaps = 其他房的快照 (例：墨爐間的墨線鎖已化開) */
function inArchive(u: number, l: number, snaps: ChapterState['rooms'] = {}): ChapterSession {
  const st: ChapterState = { ...chapterStart(defaultSave(), SPEC, CH4.start), room: 'archive', door: 'hatchU', cube: spin(u, l), dial: true, unlocked: ['L0'], rooms: snaps };
  return openChapter(SPEC, st, OPTS);
}
const layoutOf = (s: CubeState) => Object.fromEntries(Object.entries(s.pos).map(([r, c]) => [r, [c[0], c[1], c[2]] as const]));
const press = (cs: ChapterSession, syms: string[]): ChapterSession => {
  for (const s of syms) { const o = get(cs, `key.${s}`); runScript(cs.world, [{ place: [o.x, 0, -3.5], mode: '3d' }, { wait: 0.05 }, { act: 'interact' }]); }
  return pump(cs);
};
const furnaceLocks = (w: boolean, e: boolean): ChapterState['rooms'] => ({
  furnace: { objs: [{ id: 'lockW', x: -13.5, y: 0.9, z: 1.3, gone: false, used: w, touched: false }, { id: 'lockE', x: 13.5, y: 0.9, z: 1.3, gone: false, used: e, touched: false }], flags: [] }
});

describe('4-3 封存書庫：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 4-3a / 4-3b；登錄 (前置 4-2)；旁白 / 通關；擺設三帶；4-1b 的物件還在', () => {
    expect(validateLevel(archive, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('4-3')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(archive.puzzles!.map(q => [q.id, TEXT(q.titleKey)])).toEqual([['4-3a', '4-3a 爸爸的展開圖'], ['4-3b', '4-3b 兩股墨']]);
    expect([levelById('4-3')!.unlock.after, CH4.levels['4-3'], CH4.rooms.archive, TEXT(archive.narrationKey), TEXT(archive.nextKey)])
      .toEqual([['4-2'], 'archive', archive, '抽屜裡，是爸爸畫到一半的展開圖。', '抽屜牆安靜下來了。爸爸的圖，停在最後一格。']);
    expect(layoutDepthIssues(archive)).toEqual([]);
    expect(['hatchU', 'foldCord', 'inkStep', 'doorE'].every(id => archive.objects.some(o => o.id === id))).toBe(true);
  });

  it('字條：四張 (L1 × 2、L2 × 2 空白 240 秒)；原文；H1～H4 / H10；間距 ≥ 3、任一 16 單位畫面 ≤ 3 張；兩個視角都讀得到', () => {
    const notes = archive.objects.filter(o => o.type === 'note');
    const txt = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -8.5, '同一張地圖，每天早上的路都不一樣。', undefined], ['noteA2', -5, '爸爸說的那個洞，此刻在誰的頭頂？', 240],
      ['noteB', 4, '兩隻水桶，一根扁擔。挑完這桶，再挑那桶。', undefined], ['noteB2', 8, '已經開了的鎖，還需要什麼？', 240]
    ]);
    const AHA = ['轉', '層', '上下', '順', '讀', '字', '順時針', '墨', '管', '流', '接'];
    const KEYS = ['符號櫃', '符號鍵', '展開圖', '封存櫃', '墨線鎖', '走廊', '抽屜'];
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
      const w = createWorld(archive, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : txt(o));
    }
  });
});

describe('4-3a 爸爸的展開圖 (P11 兩層)', () => {
  it('讀法表：16 種排列 = 4 組答案 (只看相對角度 u − l：起點跟著上層、順序跟著下層)；S0 = 空屜封書、u 1 l 0 = 屜封書空', () => {
    const tab = new Map<string, string>();
    for (let u = 0; u < 4; u++) for (let l = 0; l < 4; l++) {
      const r = archiveReading(layoutOf(spin(u, l)), 'hall')!.join(' ');
      const k = String((u - l + 4) % 4);
      if (tab.has(k)) expect([u, l, r]).toEqual([u, l, tab.get(k)]);
      tab.set(k, r);
    }
    expect([...tab.entries()].sort()).toEqual([['0', 'empty drawer seal book'], ['1', 'drawer seal book empty'], ['2', 'seal book empty drawer'], ['3', 'book empty drawer seal']]);
  });

  it('展開圖寫著讀法；按錯 (照並排的左右讀) → 櫃門不動、重來；照此刻的讀法 → 符號櫃開、拿到爸爸的展開圖；之後安靜 2.5 秒 → 燈暗一瞬 (scare:archive，R 不重演)', () => {
    let cs = inArchive(3, 0); // 走廊疊在書庫上 (u − l = 3)：書 空 屜 封
    runScript(cs.world, [{ place: [1.6, 0, 0.2], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe(TEXT('lvl.4-3.chart.read'));
    cs = press(cs, ['book', 'drawer', 'seal', 'empty']);
    expect([get(cs, 'symbolLock').used, cs.world.msg]).toEqual([false, '四個字按完了，櫃門沒有動。']);
    cs = press(cs, ['book', 'empty', 'drawer', 'seal']);
    expect([get(cs, 'symbolLock').used, hasItem(cs.world, 'chart'), cs.world.msg]).toEqual([true, true, '喀。符號櫃開了。裡面是爸爸的展開圖——畫到一半，筆停在抽屜那一格。']);
    cs = play(cs, [{ wait: 2.0 }]);
    expect([get(cs, 'archiveScare').used, cs.state.flags]).toEqual([false, []]);
    cs = play(cs, [{ wait: 0.7 }]);
    expect([get(cs, 'archiveScare').used, cs.state.flags, cs.world.msg]).toEqual([true, ['scare:archive'], '燈暗了一下。剛才，好像有人站在那裡。']);
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 0.1 }]);
    expect([get(back, 'symbolLock').used, get(back, 'archiveScare').used, back.state.flags]).toEqual([false, true, ['scare:archive']]);
  });

  it('照 S0 讀 (空屜封書) 但此刻是 u 1：不對；按此刻的 (屜封書空) 才開', () => {
    let cs = inArchive(1, 0);
    cs = press(cs, ['empty', 'drawer', 'seal', 'book']);
    expect(get(cs, 'symbolLock').used).toBe(false);
    cs = press(cs, ['drawer', 'seal', 'book', 'empty']);
    expect(get(cs, 'symbolLock').used).toBe(true);
  });
});

describe('4-3b 兩股墨 (P15)', () => {
  it('兩道都乾：封存櫃說乾著；只化開一道：說一股化開；兩道都化開 → 走進書庫就開 = 4-3b；兩題都完成 = 房間通關', () => {
    let cs = inArchive(0, 0);
    runScript(cs.world, [{ place: [7.4, 0, -1.6], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('封存櫃的扣子纏著兩股墨線，都還乾著。');
    cs = inArchive(0, 0, furnaceLocks(true, false));
    runScript(cs.world, [{ place: [7.4, 0, -1.6], mode: '3d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([get(cs, 'sealCabinet').used, cs.world.msg]).toEqual([false, '一股墨線化開了，另一股還乾著。']);
    cs = pump(play(inArchive(3, 0, furnaceLocks(true, true)), [{ wait: 0.1 }]));
    expect([get(cs, 'sealCabinet').used, cs.world.msg]).toEqual([true, '兩道墨線都化開了。封存櫃自己鬆開了扣子。裡面是爸爸寫給自己的一張便條：「一次只走一條，兩條都會到。」']);
    cs = press(cs, ['book', 'empty', 'drawer', 'seal']);
    expect(clearedRooms(SPEC, cs.state, cs.world)).toContain('archive');
  });
});

describe('validateDial：4-3 區 (CH4_ZONE43)', () => {
  const m = dialModelOf(CH4_ZONE43.cube, CH4.rooms, CH4_ZONE43.puzzles, CH4_ZONE43.start, CH4_ZONE43.finish);
  it('16 排列、抽象狀態 13,001、卡死 0、需要 R 55；第二股墨 (ink.E，需 4-2a) 2 / 2 / 2 / 2；無問題；抽屜沒有管線 → 無解', () => {
    const r = validateDial(m);
    expect([r.arrangements, r.states, r.needsRestart, r.solvable, r.deadlocks, r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([16, 13001, 55, true, [], [], [], [], []]);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues])).toEqual([
      ['4-1c', 0, null, 1, 1, 8, []], ['4-1b', 1, 3, 3, 3, 8, []], ['4-2a', 1, 3, 3, 3, 8, []], ['ink.E', 2, 2, 2, 2, 8, []],
      ['4-3a', 1, 3, 3, 3, 8, []], ['4-3b', 0, null, 1, 1, 8, []], ['ch4.archive', 0, null, 1, 1, 8, []]
    ]);
    const noPipe = validateDial({ ...m, cube: { ...CH4_CUBE, ink: { ...CH4_INK, drawer: {} } } });
    expect([noPipe.solvable, noPipe.perPuzzle.find(p => p.id === 'ink.E')!.shortest]).toEqual([false, null]);
  });
});

describe('舊存檔、音效', () => {
  it('舊存檔 (骨架 / 4-1 版的書庫快照：只有門與拉繩)：照常開章——拉繩照存檔、新物件取關卡初值', () => {
    const cs = inArchive(3, 0, { archive: { objs: [{ id: 'foldCord', x: -3, y: 2.6, z: -3.9, gone: false, used: true, touched: false }], flags: [] } });
    expect([get(cs, 'foldCord').used, get(cs, 'symbolLock').used, cs.world.byId.has('sealCabinet')]).toEqual([true, false, true]);
  });
  it('USED_ON：符號櫃 / 封存櫃；SCARE_SFX scare:archive = sfx.scare.dim', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'archive', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('l', 'symbolLock', false), o('c', 'sealCabinet', false)]));
    const out = obs.update(s([o('l', 'symbolLock', true), o('c', 'sealCabinet', true)]));
    expect([out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id), SCARE_SFX['scare:archive']]).toEqual([['sfx.drawer.open', 'sfx.latch.open'], 'sfx.scare.dim']);
  });
});
