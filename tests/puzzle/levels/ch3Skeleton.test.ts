// 第三章骨架 (規格 6「第三章骨架與銜接（v0.4 細化）」)：登錄表、魔方 CH3_CUBE 與彩繪玻璃資料、五間占位房 (門位、驗證器、擺設三帶)、
// S0 連接表、園丁羅盤啟動、滑動一次的 dialTurn / undoTurn、轉不動的原因、validateDial (無卡榫：2,520 排列)、換房、第二章存檔接著第三章
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH3_CUBE, CH3_GLASS } from '../../../src/puzzle/content/cubes/ch3';
import { bed, depths, gallery, night, nursery } from '../../../src/puzzle/content/levels/ch3/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { THEMES } from '../../../src/puzzle/render/themes';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { turnModeDenied } from '../../../src/puzzle/mechanics/dial';
import { findTarget } from '../../../src/puzzle/core/interact';
import { initialCube, links, type Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, dialBlocked, dialTurn, openChapter, undoTurn, type ChapterSession, type ChapterSpec
} from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart, entryNarrationKey, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { place } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
const SPEC: ChapterSpec = { chapter: 3, cube: CH3.cube, rooms: CH3.rooms, doors: chapterDoors(CH3.rooms) };
const ROOMS = { nursery, gallery, night, depths, bed };

/** 新玩家開第三章 (從來時的走廊 → 苗圃西門) */
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH3.start), OPTS);
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');
/** 取走事件交給章節層 (同 LevelSession)；換房後同批事件丟棄 */
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
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-3.6, -2.8] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '園丁羅盤' }, { act: 'interact' }];
const activated = (): ChapterSession => play(start(), ACTIVATE);
/** 3-1 細化起苗圃開場被樹根卡住 (卡榫)：骨架的滑動測試先把樹根貼上「小」(3-1b 的解法；章節標籤寫在當前房的 World) */
const unjam = (cs: ChapterSession): ChapterSession => { cs.world.ext = { ...cs.world.ext, labels: { ...cs.world.ext.labels, 'scale:root': ['card.xiao'] } }; return cs; };
/** 切到藏寶圖、站穩 */
const in2d = (cs: ChapterSession): ChapterSession => { runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]); return cs; };
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
/** 穿過一扇此刻接通的門 (門的事件直接交給章節層) */
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind}`);
  return r.next;
};

describe('第三章骨架：登錄表與魔方', () => {
  it('CHAPTERS 第三章 (溫室主題、levels 3-1)；LevelEntry 3-1 (筆尖、前置 2-5)；CUBE_CHAPTERS chapter 3 (五間房、從苗圃西門進)', () => {
    expect(CHAPTERS.find(c => c.id === 3)).toEqual({ id: 3, titleKey: 'ch.3.title', theme: 'greenhouse', levels: ['3-1', '3-2'] }); // 3-2 登錄
    expect([TEXT('ch.3.title'), THEMES.greenhouse.id]).toEqual(['第三章　溫室', 'greenhouse']);
    const e = levelById('3-1')!;
    expect([e.chapter, e.abilities, e.unlock.after, e.load(), TEXT(e.titleKey)]).toEqual([3, ['nib'], ['2-5'], nursery, '苗圃']);
    expect(validateEntry(e, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect([cubeChapterOf('3-1'), CH3.cube, CH3.start, CH3.levels, Object.keys(CH3.rooms).sort()]).toEqual([CH3, CH3_CUBE, { room: 'nursery', door: 'doorW' }, { '3-1': 'nursery', '3-2': 'gallery' }, ['bed', 'depths', 'gallery', 'night', 'nursery']]);
  });

  it('CH3_CUBE：3×3 滑動、控制盤；S0 (北列 空｜空｜工具間、中列 苗圃｜夜溫室｜長廊、南列 水塔｜溫床｜深處)；屋框；九個 slideCell 組、沒有鎖扣', () => {
    expect([CH3_CUBE.dims, CH3_CUBE.ops, CH3_CUBE.control]).toEqual([[3, 3, 1], 'slide', 'dial']);
    const grid = [0, 1, 2].map(y => [0, 1, 2].map(x => CH3_CUBE.cells.find(c => c.at[0] === x && c.at[1] === y)?.room ?? '·').join(' '));
    expect(grid).toEqual(['· · solid', 'nursery night gallery', 'solid bed depths']);
    expect(CH3_CUBE.cells.filter(c => c.room === 'solid').map(c => TEXT(c.label!))).toEqual(['工具間', '水塔']);
    expect(CH3_CUBE.frame.map(f => [f.at.slice(0, 2).join(''), f.side, f.kind, f.to ?? null])).toEqual([['01', 'W', 'porch', 'study'], ['00', 'N', 'skylight', null], ['10', 'N', 'skylight', null], ['22', 'S', 'chapterExit', 'cellar']]);
    expect([CH3_CUBE.dial!.entry, CH3_CUBE.dial!.locks]).toEqual([{ room: 'nursery', obj: 'dial' }, []]);
    expect(CH3_CUBE.dial!.groups.map(g => [g.id, g.kind, g.index])).toEqual(Array.from({ length: 9 }, (_, i) => [`c${i}`, 'slideCell', i]));
  });

  it('彩繪玻璃資料 (規格房間表)：苗圃沒有；長廊 N / W / S + 稜鏡 W↔S；夜溫室 N / S；深處 N / W；溫床 N / E + 稜鏡 N↔E', () => {
    expect(CH3_GLASS).toEqual({
      nursery: { glass: [] }, gallery: { glass: ['N', 'W', 'S'], prism: [['W', 'S']] }, night: { glass: ['N', 'S'] },
      depths: { glass: ['N', 'W'], covered: ['W'] }, bed: { glass: ['N', 'E'], prism: [['N', 'E']] } // 3-2：深處的苔窗被巨根蓋住 (3-4b 才露出)
    });
    expect(CH3_CUBE.glass).toBe(CH3_GLASS);
    expect(Object.keys(CH3_GLASS).sort()).toEqual(Object.keys(CH3.rooms).sort());
  });
});

describe('第三章骨架：五間占位房', () => {
  it('門位 (型別、本地門位、座標)：苗圃 W 門 / E 拱門 / S 拱門；長廊 W 門 / S 門；夜溫室四個拱門；深處 N 拱門 / S 章門 (key.greenhouse)；溫床沒有門', () => {
    const doors = (l: typeof nursery) => l.objects.filter(o => o.type === 'cubeDoor').map(o => o.type === 'cubeDoor' && [o.id, o.side, o.kind, o.x, o.z, o.visible]);
    expect(doors(nursery)).toEqual([['doorW', 'W', 'door', -5.8, 0, 'both'], ['archE', 'E', 'arch', 7.8, 0, 'both'], ['archS', 'S', 'arch', 3, 4.8, '3d']]);
    expect(doors(gallery)).toEqual([['doorW', 'W', 'door', -9.8, 0, 'both'], ['doorS', 'S', 'door', -2.4, 4.8, '3d']]); // 3-2 細化：長廊加寬到 [-10, 10]，西門貼西牆
    expect(doors(night)).toEqual([['archN', 'N', 'arch', -3, -4.8, 'both'], ['archW', 'W', 'arch', -11.8, 0, 'both'], ['archE', 'E', 'arch', 11.8, 0, 'both'], ['archS', 'S', 'arch', 3, 4.8, '3d']]);
    expect(doors(depths)).toEqual([['archN', 'N', 'arch', 0, -4.8, 'both'], ['chapterS', 'S', 'chapter', 3, 4.8, '3d']]);
    expect(doors(bed)).toEqual([]);
    const S = depths.objects.find(o => o.id === 'chapterS')!;
    expect(S.type === 'cubeDoor' && S.key).toBe('key.greenhouse');
    expect(Object.values(ROOMS).map(l => [l.bounds.minX, l.bounds.maxX, l.turnBudget, l.theme])).toEqual([
      [-6, 8, { base: 8 }, 'greenhouse'], [-10, 10, { base: 8 }, 'greenhouse'], [-12, 12, { base: 8 }, 'greenhouse'], [-8, 8, { base: 8 }, 'greenhouse'], [-6, 6, { base: 8 }, 'greenhouse']
    ]);
  });

  it('validateLevel：四間走得進去的房 0 issue；溫床只有 level.noExit (本版沒有門，有意)；擺設三帶 (layoutDepthIssues) 四間都齊', () => {
    for (const l of [nursery, gallery, night, depths]) expect([l.id, validateLevel(l, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })]).toEqual([l.id, []]);
    expect(validateLevel(bed, { mechanics: DEFAULT_MECHANICS, bundle: zhHant }).map(i => i.code)).toEqual(['level.noExit']);
    for (const l of [nursery, gallery, night, depths]) expect([l.id, layoutDepthIssues(l)]).toEqual([l.id, []]);
    expect([TEXT(nursery.narrationKey), TEXT(gallery.titleKey), TEXT(night.titleKey), TEXT(depths.titleKey), TEXT(bed.titleKey)])
      .toEqual(['比例尺掛在門邊。爸爸在旁邊畫了個問號。', '玻璃長廊', '夜溫室', '溫室深處', '溫床']); // 3-1 細化：苗圃的旁白換成 story-bible 7.3 的 3-1 開場
  });
});

describe('第三章骨架：S0 連接表', () => {
  it('入口 → 苗圃西門；苗圃 E ↔ 夜溫室 W (拱門)；夜溫室 E ↔ 長廊 W (門)；長廊 S ↔ 深處 N (門)；深處 S 章門 → 地下室走廊；其餘門後是牆', () => {
    const ls = links(CH3_CUBE, initialCube(CH3_CUBE), SPEC.doors);
    const fmt = ls.map(l => `${l.from.room}.${l.from.door}→${'frame' in l.to ? `[${l.to.frame}]` : `${l.to.room}.${l.to.door}`}:${l.kind}`);
    expect(fmt).toEqual([
      'nursery.doorW→[study]:door', 'nursery.archE→night.archW:arch',
      'night.archW→nursery.archE:arch', 'night.archE→gallery.doorW:door',
      'gallery.doorW→night.archE:door', 'gallery.doorS→depths.archN:door',
      'depths.archN→gallery.doorS:door', 'depths.chapterS→[cellar]:door'
    ]);
    const cs = start();
    expect([cs.state.room, cs.state.door, Math.round(cs.world.player.x * 10) / 10, cs.world.ext.cube!.links]).toEqual(['nursery', 'doorW', -4.7, {
      doorW: { to: 'frame', frame: 'study' }, archE: { to: 'room', room: 'night', door: 'archW', kind: 'arch' }, archS: { to: 'wall' }
    }]);
    expect(entryNarrationKey(SPEC, cs.state)).toBe('lvl.3-1.narration');
  });

  it('換房：苗圃 → 夜溫室 → 長廊 → 深處；深處的章門沒有鑰匙打不開 (鎖著)；入口的門只說明來時的走廊', () => {
    let cs = play(start(), [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [7.3, null] }, { act: 'interact' }]);
    expect([cs.state.room, cs.state.door]).toEqual(['night', 'archW']);
    cs = through(through(cs, 'archE'), 'doorS');
    expect([cs.state.room, cs.state.door, cs.state.turns!.left]).toEqual(['depths', 'archN', 8]);
    cs = play(cs, [{ wait: 0.1 }, { walkTo: [3.0, 4.0] }, { act: 'interact' }]);
    expect([cs.state.room, cs.world.cleared, cs.world.msgKey]).toEqual(['depths', false, 'msg.cube.chapterLocked']);
    const back = play(start(), [{ wait: 0.1 }, { walkTo: [-5.3, 0] }, { act: 'interact' }]);
    expect([back.state.room, back.world.msg]).toEqual(['nursery', '門外是來時的走廊。這一趟，只能往溫室裡走。']);
  });
});

describe('第三章骨架：園丁羅盤與滑動', () => {
  it('沒啟動：進不了轉動模式、轉不動 (noDial)；3D 按 E 啟動 → 「九個花盆格，空了兩格。」、墨 8；再按 → 已經啟動了', () => {
    const cs = in2d(start());
    expect([turnModeDenied(cs.world), dialBlocked(cs, T('c3', 'N'))]).toEqual(['noDial', 'noDial']);
    const on = activated();
    expect([on.state.dial, on.state.turns, on.world.msg]).toEqual([true, { left: 8, undo: [] }, '九個花盆格，空了兩格。切到藏寶圖，就能把房間滑進空格。']);
    runScript(on.world, [{ act: 'interact' }]);
    expect(on.world.msg).toBe('園丁羅盤已經啟動了。');
    expect(turnModeDenied(in2d(on).world)).toBeNull();
  });

  it('滑一次：苗圃往北滑進空格 (連你一起；墨 8 → 7)；門接法跟著變；回退 → 回到原格、墨回 8，章節狀態與沒轉時相同 (回退堆疊除外)', () => {
    const cs = unjam(in2d(activated()));
    const before = captureState(cs);
    const moved = ok(dialTurn(cs, T('c3', 'N')));
    expect([pos(moved, 'nursery'), moved.state.turns]).toEqual(['00', { left: 7, undo: [{ group: 'c3', dir: 'N' }] }]);
    expect(moved.world.ext.cube!.links).toEqual({ doorW: { to: 'wall' }, archE: { to: 'wall' }, archS: { to: 'wall' } });
    const back = ok(undoTurn(moved));
    const after = captureState(back);
    expect([pos(back, 'nursery'), back.state.turns, back.world.ext.cube!.links.archE]).toEqual(['01', { left: 8, undo: [] }, { to: 'room', room: 'night', door: 'archW', kind: 'arch' }]);
    expect(JSON.stringify({ ...after, turns: undefined })).toBe(JSON.stringify({ ...before, turns: undefined }));
    // 不在你所在房的滑動：夜溫室往北 (苗圃的東拱門接不上了)
    const n = ok(applyChapterCommand(cs, { t: 'turn', turn: T('c4', 'N') }));
    expect([pos(n, 'night'), pos(n, 'nursery'), n.world.ext.cube!.links.archE]).toEqual(['10', '01', { to: 'wall' }]);
  });

  it('轉不動的原因：往屋外 (outOfCube)、往房間 / 實心格 (notEmpty)、空格那一組 (noRoom)、站在門口 (doorway)、墨乾 (noInk)；3-1 細化：樹根沒縮 = 卡住 (jammed)', () => {
    expect(dialBlocked(in2d(activated()), T('c3', 'N'))).toBe('jammed');
    const cs = unjam(in2d(activated()));
    expect([dialBlocked(cs, T('c3', 'W')), dialBlocked(cs, T('c3', 'E')), dialBlocked(cs, T('c5', 'N')), dialBlocked(cs, T('c0', 'S')), dialBlocked(cs, T('c3', 'N'))])
      .toEqual(['outOfCube', 'notEmpty', 'notEmpty', 'noRoom', null]);
    const door = unjam(activated());
    place(door.world, -5.5, 0, 0, '3d');
    expect(dialBlocked(door, T('c3', 'N'))).toBe('doorway');
    const dry = { ...cs, state: { ...cs.state, turns: { left: 0, undo: [] } } };
    expect(dialBlocked(dry, T('c3', 'N'))).toBe('noInk');
  });
});

describe('validateDial：第三章 (無卡榫)', () => {
  it('苗圃、深處都鬆開時可達排列 2,520 (規格 5.4.9)；終點「苗圃滑到天窗下」有解、抽象狀態 80,621、卡死 0；無問題', () => {
    const goal = { id: 'ch3.skel', room: 'nursery', needs: [], teaching: true, goal: (s: { pos: Record<string, readonly number[]> }) => s.pos.nursery[0] === 0 && s.pos.nursery[1] === 0 };
    const r = validateDial(dialModelOf(CH3_CUBE, CH3.rooms, [goal], 'nursery', 'ch3.skel'));
    expect([r.arrangements, r.states, r.solvable, r.deadlocks]).toEqual([2520, 80621, true, []]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.budget])).toEqual([['ch3.skel', 1, 2, 8]]);
  });
});

describe('第二章存檔接著第三章', () => {
  it('第二章存檔 (chapters[2]) 讀入後開第三章 = 新章 (S0、苗圃西門)；第三章另存 chapters[3]，第二章的存檔不動；3-1 在 2-5 通關後開放', () => {
    const ch2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
    const spec2: ChapterSpec = { chapter: 2, cube: ch2.cube, rooms: ch2.rooms, doors: chapterDoors(ch2.rooms) };
    const cs2 = openChapter(spec2, chapterStart(defaultSave(), spec2, ch2.start), OPTS);
    const store = memoryStorage();
    const save2 = withChapter({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4', '2-5'], abilities: ['nib'] }, captureState(cs2));
    writeSave(store, save2);
    const loaded = loadSave(store);
    expect(levelState(levelById('3-1')!, loaded)).toBe('open');
    expect(levelState(levelById('3-1')!, { ...loaded, cleared: ['2-4'] })).toBe('locked');
    const st = chapterStart(loaded, SPEC, CH3.start);
    expect([st.room, st.door, st.cube, st.dial]).toEqual(['nursery', 'doorW', initialCube(CH3_CUBE), undefined]);
    const cs3 = play(openChapter(SPEC, st, OPTS), ACTIVATE);
    const both = withChapter(loaded, captureState(ok(dialTurn(unjam(in2d(cs3)), T('c3', 'N')))));
    writeSave(store, both);
    const again = loadSave(store);
    expect([Object.keys(again.chapters).sort(), again.chapters['2'], chapterStart(again, SPEC, CH3.start).cube!.pos.nursery]).toEqual([['2', '3'], loaded.chapters['2'], [0, 0, 0]]);
  });
});
