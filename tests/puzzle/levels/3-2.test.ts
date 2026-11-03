// 3-2 玻璃長廊 (規格 6「3-2 玻璃長廊（細化）」；第三章第二關，光路 N26 / P6 首次)：資料與驗證器、擺設深度帶、高度與距離 (D10)、
// 3-2 區 validateDial (CH3_ZONE32；3-1b 之前 / 之後；拿掉玻璃或稜鏡 → 無解)、通關腳本 (兩種解法：先 3-2a 再改排 / 從 S0 直接排 L 形)、
// 錯誤嘗試 (白光、只排直線、光不夠)、閂住、進房才閂、反例 (只用 2D / 只用 3D；3-2a 教學題豁免盲轉、3-2b 盲轉取樣)、R、存檔、舊存檔相容、
// 展開圖光路圖層 (現況與轉動預覽)、音效、字條量表
import { describe, it, expect } from 'vitest';
import { gallery } from '../../../src/puzzle/content/levels/ch3/3-2-gallery';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH3_CUBE, CH3_GLASS, CH3_ZONE32 } from '../../../src/puzzle/content/cubes/ch3';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { sensorLight } from '../../../src/puzzle/mechanics/light';
import { turnModeDenied } from '../../../src/puzzle/mechanics/dial';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { INTERACT_RANGE } from '../../../src/puzzle/core/constants';
import { applyTurn, cellsOf, initialCube, isBlocked, sameCell, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, clearedRooms, dialBlocked, enterRoom, lightPaths, lightState, openChapter, restartRoom, roomCleared, type ChapterSession
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap, deriveTurnMode, mapLight } from '../../../src/puzzle/app/cubeMapModel';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
const SPEC = chapterSpecOf(CH3);
const def = (id: string): ObjDef => gallery.objects.find(o => o.id === id)!;
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };

/** 取走事件交給章節層 (同 LevelSession)；換房後同批事件丟棄 */
function pump(cs: ChapterSession): { cs: ChapterSession; kinds: string[]; done: string[] } {
  const kinds: string[] = [];
  const done: string[] = [];
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    if (e.t === 'done') done.push(e.flag);
    const r = applyChapterEvent(cs, e, OPTS);
    kinds.push(r.kind);
    if (r.kind === 'enter') return { cs: r.next, kinds, done };
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return { cs, kinds, done };
}
const play = (cs: ChapterSession, cmds: Cmd[]) => { runScript(cs.world, cmds); return pump(cs); };
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH3.start), OPTS);
const FLIP: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];

// ── 路線 (實景) ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-3.6, -2.8] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '園丁羅盤' }, { act: 'interact' }];
/** 苗圃 → 夜溫室 (東拱門) → 長廊 (夜溫室東拱門 = 長廊西門；S0 才接得上) */
const TO_NIGHT: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [7.3, null] }, { act: 'interact' }];
const TO_GALLERY: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [11.3, null] }, { act: 'interact' }];

/** 開章 → 啟動羅盤 → 經夜溫室走進長廊 (西門內側)，切到藏寶圖 */
function inGallery(): ChapterSession {
  let cs = play(start(), ACTIVATE).cs;
  cs = play(cs, TO_NIGHT).cs;
  expect(cs.state.room).toBe('night');
  cs = play(cs, TO_GALLERY).cs;
  expect([cs.state.room, cs.state.door, cs.state.turns!.left]).toEqual(['gallery', 'doorW', 8]);
  return play(cs, FLIP).cs;
}
/** 轉動 (控制盤；藏寶圖裡) 後走一步：感光花讀到新的光 */
function turns(cs: ChapterSession, ts: Turn[]): { cs: ChapterSession; done: string[] } {
  const done: string[] = [];
  for (const t of ts) {
    cs = ok(applyChapterCommand(cs, { t: 'turn', turn: t }));
    const r = play(cs, [{ wait: 1 / 30 }]);
    cs = r.cs;
    done.push(...r.done);
  }
  return { cs, done };
}
/** 3-2a：夜溫室 ▲ (天窗下)、長廊 ◀ (到它正下方) */
const SOLVE_A = [T('c4', 'N'), T('c5', 'W')];
/** 3-2b：夜溫室 ▲、溫床 ▲ (長廊留在原格) */
const SOLVE_B = [T('c4', 'N'), T('c7', 'N')];
/** 實景拿花窗玻璃片二 (盆腳)；藏寶圖拿殘片 2 (窗台) */
const TAKE_PANE: Cmd[] = [...FLIP, { walkTo: [3.05, null] }, { walkTo: [null, -2.9] }, { expect: w => expect(findTarget(w)?.def.id).toBe('pane2'), label: '花窗玻璃片二' }, { act: 'interact' }];
const TAKE_SCRAP: Cmd[] = [{ walkTo: [-8.4, null] }, { wait: 0.1 }, { expect: w => expect(findTarget(w)?.def.id).toBe('scrap2'), label: '殘片 2' }, { act: 'interact' }];

describe('3-2 玻璃長廊：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 3-2a / 3-2b；登錄表 3-2 (前置 3-1)、房間 gallery；旁白 / 通關文字 (story-bible 7.3)', () => {
    expect(validateLevel(gallery, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('3-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(gallery.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['3-2a 彩繪玻璃', '3-2b 光要轉彎']);
    expect([levelById('3-2')!.unlock.after, levelById('3-2')!.chapter, CH3.levels['3-2'], CH3.rooms.gallery, gallery.turnBudget, gallery.bounds])
      .toEqual([['3-1'], 3, 'gallery', gallery, { base: 8 }, { minX: -10, maxX: 10, minZ: -5, maxZ: 5 }]);
    expect([TEXT(gallery.titleKey), TEXT(gallery.narrationKey), TEXT(gallery.nextKey)]).toEqual(['玻璃長廊', '彩繪玻璃的光穿過了兩面牆。玻璃上不只你一個影子。', '光拐了一個彎。窗台上，多了一片紙。']);
    expect([nextAfterClear('3-2', 'room', CHAPTERS), CH3_CUBE.glass]).toEqual(['3-2', CH3_GLASS]);
  });

  it('擺設三帶 (layoutDepthIssues = [])；分帶：後 = 北窗感光花 / 玻璃片 / 紙籤 / 西窗感光花、中 = 西門 / 殘片、前 = 南門 / 四張字條；擋路的只有地板 (家具可穿過)', () => {
    expect(layoutDepthIssues(gallery)).toEqual([]);
    const band = (z: number) => (z < -2 ? 'back' : z > 2 ? 'front' : 'mid');
    const objs = gallery.objects.filter(o => o.interactable || o.label);
    expect(Object.fromEntries(['back', 'mid', 'front'].map(b => [b, objs.filter(o => band(o.z) === b).map(o => o.id)]))).toEqual({
      back: ['flowerN', 'pane2', 'plaqueN', 'flowerW'], mid: ['doorW', 'scrap2'], front: ['doorS', 'noteB', 'noteB2', 'noteA', 'noteA2']
    });
    expect(gallery.objects.filter(o => o.solid).map(o => o.id)).toEqual(['floor']);
    const fw = def('flowerW'), fn = def('flowerN');
    expect([fw.type === 'sensor' && [fw.from, fw.via, fw.mount], fn.type === 'sensor' && [fn.from, fn.via, fn.mount]]).toEqual([['W', 2, 'stand'], ['N', 1, 'floor']]);
  });

  it('高度與距離 (D10)：藏寶圖站在窗台下搆得到殘片、字條不搶 E (餘裕 ≥ 0.5)；實景站在窗台花架前 E = 西窗感光花 (比西門近)；北窗感光花前 E = 花', () => {
    let cs = inGallery();
    const w = cs.world;
    // 花開前：殘片不在場 (藏寶圖 E 不會拿到)；字條在範圍內就讀字條
    runScript(w, [{ walkTo: [-8.4, null] }, { wait: 0.1 }]);
    expect([isActiveIn(w, get(cs, 'scrap2'), '2d'), findTarget(w)?.def.id ?? null]).toEqual([false, 'noteB']);
    cs = turns(cs, SOLVE_B).cs;
    runScript(cs.world, [{ wait: 0.1 }]);
    const dist = (id: string) => { const o = get(cs, id); const b = { x0: o.x - o.def.w / 2, x1: o.x + o.def.w / 2, y0: o.y, y1: o.y + o.def.h }; const p = cs.world.player; const cy = p.y + 0.45; return Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - cy, 0, cy - b.y1)); };
    expect([findTarget(cs.world)?.def.id, dist('scrap2') <= INTERACT_RANGE, dist('noteB') - dist('scrap2') >= 0.5]).toEqual(['scrap2', true, true]);
    runScript(cs.world, [...FLIP, { walkTo: [-8.4, null] }, { walkTo: [null, -1.6] }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('flowerW');
    runScript(cs.world, [{ walkTo: [2.4, null] }, { walkTo: [null, -2.9] }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('flowerN');
  });
});

describe('validateDial：3-2 區 (CH3_ZONE32；DialPuzzle.light = 同一個 lightPaths)', () => {
  const m = dialModelOf(CH3_ZONE32.cube, CH3.rooms, CH3_ZONE32.puzzles, CH3_ZONE32.start, CH3_ZONE32.finish, { jams: CH3_ZONE32.jams });
  const r = validateDial(m);
  const per = (rep: typeof r) => rep.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues]);
  it('3-1b 之前 (苗圃、深處都卡著)：可達排列 20、抽象狀態 2,563、有解、卡死 0 (含 R)、需要 R 的狀態 391；無問題 → 3-2 不需要 3-1b', () => {
    expect([r.arrangements, r.states, r.solvable, r.deadlocks, r.needsRestart]).toEqual([20, 2563, true, [], 391]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
  });
  it('每題 (最短 / 次短 / 序列 / 本質不同)：3-2a 2 / 4 / 4 / 4 (教學)；3-2b 2 / 4 / 3 / 3 (≥ 2，D16 ③)；預算 8', () => {
    expect(per(r)).toEqual([['3-2a', 2, 4, 4, 4, 8, []], ['3-2b', 2, 4, 3, 3, 8, []], ['ch3.gallery', 0, null, 1, 1, 8, []]]);
  });
  it('苗圃鬆開後 (3-1b 之後)：360 排列、48,649 狀態、卡死 0；3-2a 2 / 3 / 69 / 27、3-2b 2 / 3 / 37 / 16', () => {
    const free = validateDial({ ...m, jams: [{ room: 'depths' }] });
    expect([free.arrangements, free.states, free.solvable, free.deadlocks, free.needsRestart]).toEqual([360, 48649, true, [], 4971]);
    expect(per(free)).toEqual([['3-2a', 2, 3, 69, 27, 8, []], ['3-2b', 2, 3, 37, 16, 8, []], ['ch3.gallery', 0, null, 1, 1, 8, []]]);
  });
  it('拿掉玻璃 / 稜鏡 (捷徑檢查 ④)：夜溫室沒有玻璃 → 兩題都無解；溫床沒有稜鏡、長廊沒有西窗 → 3-2b 無解 (3-2a 照樣可解)', () => {
    const without = (room: string, patch: object) => validateDial({ ...m, cube: { ...CH3_CUBE, glass: { ...CH3_GLASS, [room]: { ...CH3_GLASS[room], ...patch } } } });
    const short = (rep: ReturnType<typeof validateDial>) => [rep.solvable, ...rep.perPuzzle.slice(0, 2).map(p => p.shortest)];
    expect(short(without('night', { glass: [] }))).toEqual([false, null, null]);
    expect(short(without('bed', { prism: [] }))).toEqual([false, 2, null]);
    expect(short(without('gallery', { glass: ['N', 'S'], prism: [] }))).toEqual([false, 2, null]);
  });
});

describe('通關腳本 (runScript + 控制盤)', () => {
  it('解法一：啟動羅盤 → 走進長廊 → 夜溫室 ▲ (仍 dark：長廊北邊是工具間) → 長廊 ◀ → 3-2a (北窗花開) → 花窗玻璃片二 → 長廊 ▶、溫床 ▲ → 3-2b → 房間通關 → 殘片 2', () => {
    let cs = inGallery();
    expect([sensorLight(cs.world, get(cs, 'flowerN')), sensorLight(cs.world, get(cs, 'flowerW'))]).toEqual(['dark', 'dark']);
    let r = turns(cs, [SOLVE_A[0]]);
    expect([sensorLight(r.cs.world, get(r.cs, 'flowerN')), r.done]).toEqual(['dark', []]);
    r = turns(r.cs, [SOLVE_A[1]]);
    cs = r.cs;
    expect([r.done, get(cs, 'flowerN').used, cs.world.msg, pos(cs, 'gallery'), cs.state.turns!.left]).toEqual([['3-2a'], true, '穿過玻璃的光落在花上。花開了，花盆邊靠著一片彩繪玻璃。', '11', 6]);
    // 只排直線：西窗那盆沒有光
    expect([sensorLight(cs.world, get(cs, 'flowerW')), roomCleared(SPEC, cs.state, cs.world)]).toEqual(['dark', false]);
    cs = play(cs, TAKE_PANE).cs;
    expect([hasItem(cs.world, 'pane.2'), cs.world.msg]).toEqual([true, '一片彩繪玻璃，邊緣有一筆墨線。']);
    cs = play(cs, FLIP).cs;
    r = turns(cs, [T('c4', 'E'), T('c7', 'N')]);
    cs = r.cs;
    expect([r.done, get(cs, 'flowerW').used, get(cs, 'flowerN').used, cs.world.msg, roomCleared(SPEC, cs.state, cs.world), clearedRooms(SPEC, cs.state, cs.world)])
      .toEqual([['3-2b'], true, true, '光在窗台上拐了個彎。花開了，花瓣底下露出一角紙。', true, ['gallery']]);
    cs = play(cs, TAKE_SCRAP).cs;
    expect([hasItem(cs.world, 'scrap.2'), cs.world.msg]).toEqual([true, '又一角老宅圖。背面有一筆，像是字的一部分。']);
    const save = recordClear({ ...defaultSave(), cleared: ['2-5', '3-1'], abilities: ['nib', 'scale'] }, '3-2', cs.world);
    expect([save.cleared, save.scraps]).toEqual([['2-5', '3-1', '3-2'], [2]]);
  });

  it('解法二 (不照教學順序)：從 S0 直接排 L 形 (夜溫室 ▲、溫床 ▲) → 3-2b 先完成；再溫床 ▼、長廊 ◀ → 3-2a；長廊的西門此刻面對溫床 = 牆、只接深處', () => {
    let r = turns(inGallery(), SOLVE_B);
    expect([r.done, r.cs.world.ext.cube!.links]).toEqual([['3-2b'], { doorW: { to: 'wall' }, doorS: { to: 'room', room: 'depths', door: 'archN', kind: 'door' } }]);
    r = turns(r.cs, [T('c4', 'S'), T('c5', 'W')]);
    expect([r.done, roomCleared(SPEC, r.cs.state, r.cs.world), r.cs.state.turns!.left]).toEqual([['3-2a'], true, 4]);
  });

  it('人在別間排好、走進長廊的第一步就閂住：人在深處 → 夜溫室 ▲、溫床 ▲ → 經深處北拱門走進長廊 → 3-2b', () => {
    let cs = play(inGallery(), [...FLIP, { walkTo: [-2.4, null] }, { walkTo: [null, 3.9] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('depths');
    cs = play(cs, FLIP).cs;
    cs = ok(applyChapterCommand(cs, { t: 'turn', turn: SOLVE_B[0] }));
    cs = ok(applyChapterCommand(cs, { t: 'turn', turn: SOLVE_B[1] }));
    expect(cs.state.rooms.gallery.objs.find(o => o.id === 'flowerW')!.used).toBe(false);
    const r = pump((() => { cs = enterRoom(cs, 'gallery', 'doorS', OPTS); runScript(cs.world, [{ wait: 1 / 30 }]); return cs; })());
    expect([r.cs.state.room, r.done, get(r.cs, 'flowerW').used]).toEqual(['gallery', ['3-2b'], true]);
  });
});

describe('3-2a 彩繪玻璃 (P6 首次)：錯誤嘗試與反例', () => {
  it('長廊直接滑到天窗下 (夜溫室 ▲、夜溫室 ◀、長廊 ◀、長廊 ▲)：白光從北窗照在花上 →「白光照在花上，花沒有動。」、花不開；3D 按 E 也這麼說', () => {
    const r = turns(inGallery(), [T('c4', 'N'), T('c1', 'W'), T('c5', 'W'), T('c4', 'N')]);
    const cs = r.cs;
    expect([pos(cs, 'gallery'), sensorLight(cs.world, get(cs, 'flowerN')), get(cs, 'flowerN').used, r.done, cs.world.msg]).toEqual(['10', 'white', false, [], '白光照在花上，花沒有動。']);
    expect(lightPaths(CH3_CUBE, cs.state.cube!).hits.gallery).toEqual([{ from: 'N', via: 0, out: 'S', rooms: [] }]);
    runScript(cs.world, [...FLIP, { walkTo: [2.0, null] }, { walkTo: [null, -2.9] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('白光照在花上，花沒有動。');
  });

  it('閂住：花開之後把長廊移走 (光沒了) 花照樣開著；R 回到進房時 (花閉著、玻璃片不在場、排列回 S0、墨 8)', () => {
    let cs = turns(inGallery(), SOLVE_A).cs;
    cs = turns(cs, [T('c4', 'E')]).cs;
    expect([sensorLight(cs.world, get(cs, 'flowerN')), get(cs, 'flowerN').used, isActiveIn(cs.world, get(cs, 'pane2'), '3d')]).toEqual(['dark', true, true]);
    runScript(cs.world, [...FLIP, { walkTo: [2.0, null] }, { walkTo: [null, -2.9] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('花開著，朝著北窗。');
    cs = restartRoom(cs, OPTS);
    runScript(cs.world, [{ wait: 1 / 30 }]);
    expect([get(cs, 'flowerN').used, isActiveIn(cs.world, get(cs, 'pane2'), '3d'), pos(cs, 'night'), pos(cs, 'gallery'), cs.state.turns, cs.state.dial]).toEqual([false, false, '11', '21', { left: 8, undo: [] }, true]);
  });

  it('只用 2D：園丁羅盤只在實景啟動 (沒啟動就轉不動)、門只在實景穿得過 → 走不進長廊；只用 3D：轉動模式只在藏寶圖', () => {
    const cs = start();
    runScript(cs.world, [{ walkTo: [-3.6, -2.8] }, ...FLIP, { act: 'interact' }]);
    expect([cs.state.dial, dialBlocked(cs, T('c4', 'N'))]).toEqual([undefined, 'noDial']);
    const lit = play(start(), ACTIVATE).cs;
    runScript(lit.world, [...FLIP, { walkTo: [7.3, null] }, { act: 'interact' }, { wait: 0.1 }]);
    expect([findTarget(lit.world)?.def.id !== 'archE', lit.world.events.some(e => e.t === 'door'), lit.state.room]).toEqual([true, false, 'nursery']); // 藏寶圖裡東拱門不是互動目標 (E 讀到旁邊的字條)
    const g = turns(inGallery(), []).cs;
    runScript(g.world, FLIP);
    expect(turnModeDenied(g.world)).toBe('not2d');
  });

  it('教學題 (P6 首次)：豁免盲轉反例 (D2 v0.4)——驗證器允許唯一解；這裡只確認不需要 3-1b、也不需要比例尺', () => {
    const cs = inGallery();
    expect([hasItem(cs.world, 'card.xiao'), dialBlocked(cs, T('c3', 'N'))]).toEqual([false, 'jammed']);
    expect(turns(cs, SOLVE_A).done).toEqual(['3-2a']);
  });
});

describe('3-2b 光要轉彎 (P6)：錯誤嘗試、反例、盲轉取樣', () => {
  it('光不夠 (weak：從西邊進來、只穿過一間房)：花苞動了一下 (說一次)、花不開；3D 按 E 也這麼說 (苗圃鬆開後才排得出：機制層驗)', () => {
    const w = createWorld(gallery, OPTS);
    runScript(w, [{ wait: 1 / 30 }]);
    w.ext = { ...w.ext, light: { hits: [{ from: 'W', via: 1, out: 'S', rooms: ['bed'] }] } };
    runScript(w, [{ wait: 1 / 30 }]);
    const fw = w.byId.get('flowerW')!;
    expect([sensorLight(w, fw), fw.used, w.msg]).toEqual(['weak', false, '光只穿過一間房。花苞動了一下，又闔上了。']);
    runScript(w, [{ place: [-8.4, 0, -1.6] }, { wait: 0.1 }, { act: 'interact' }]);
    expect(w.msg).toBe('光只穿過一間房。花苞動了一下，又闔上了。');
    // 進房的第一步只記不說 (已經是白光的房間走進來，不說話)
    const w2 = createWorld(gallery, OPTS);
    w2.ext = { light: { hits: [{ from: 'N', via: 0, out: 'S', rooms: [] }] } };
    runScript(w2, [{ wait: 1 / 30 }]);
    expect([w2.msgKey, w2.byId.get('flowerN')!.used]).toEqual(['', false]);
  });

  it('殘片只在 2D 拿得到：花開前不在場；花開後實景按 E =「看得見，卻碰不到」(殘片不是實景的互動目標)', () => {
    const cs = turns(inGallery(), SOLVE_B).cs;
    runScript(cs.world, [...FLIP, { walkTo: [-8.4, null] }, { walkTo: [null, -2.0] }, { wait: 0.1 }]);
    expect([findTarget(cs.world)?.def.id ?? null, isActiveIn(cs.world, get(cs, 'scrap2'), '3d')]).toEqual(['flowerW', true]);
    runScript(cs.world, [{ walkTo: [null, -0.4] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([hasItem(cs.world, 'scrap.2')]).toEqual([false]);
  });

  it('盲轉取樣 (D2；不看預覽、人在長廊、隨機滑動到墨用完)：3-1b 之前 (20 種排列) 成功率約 0.4～0.6——高於第二章的 < 25%，規格列為待決 (結構性：S0 只有夜溫室能滑、下一步四選一就是溫床 ▲)；苗圃鬆開後 < 0.4', () => {
    const opts = CH3_CUBE.dial!.groups.flatMap(g => turnDirs(CH3_CUBE, g.id).map(dir => ({ group: g.id, dir })));
    const legal = (s: CubeState, jam: string[]) => opts.map(o => {
      const cells = cellsOf(CH3_CUBE, s, o.group);
      if (jam.some(r => cells.some(c => sameCell(c, s.pos[r])))) return null;
      const n = applyTurn(CH3_CUBE, s, o);
      return isBlocked(n) ? null : n;
    }).filter((x): x is CubeState => x !== null);
    const litW = (s: CubeState) => lightState(lightPaths(CH3_CUBE, s).hits.gallery ?? [], 'W', 2) === 'lit';
    const rate = (jam: string[], from: CubeState, ink: number) => {
      let seed = 12345;
      const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      let wins = 0;
      for (let n = 0; n < 1000; n++) { let s = from; for (let k = 0; k < ink; k++) { const L = legal(s, jam); s = L[Math.floor(rnd() * L.length)]; if (litW(s)) { wins++; break; } } }
      return wins / 1000;
    };
    const s0 = initialCube(CH3_CUBE);
    const afterA: CubeState = { pos: { ...s0.pos, night: [1, 0, 0], gallery: [1, 1, 0] }, rot: s0.rot };
    const pre = rate(['nursery', 'depths'], s0, 8), preA = rate(['nursery', 'depths'], afterA, 6), post = rate(['depths'], s0, 8);
    expect([pre > 0.4 && pre < 0.65, preA > 0.3 && preA < 0.6, post < 0.4]).toEqual([true, true, true]);
  });
});

describe('R、存檔、舊存檔相容', () => {
  it('存檔往返：3-2a 完成 → 寫檔 → 讀回 (房內讀檔)：花開著、玻璃片在場、排列、墨、ext.light 重算', () => {
    const cs = turns(inGallery(), SOLVE_A).cs;
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['2-5', '3-1'], abilities: ['nib'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH3.start), OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([back.state.room, get(back, 'flowerN').used, isActiveIn(back.world, get(back, 'pane2'), '3d'), pos(back, 'gallery'), back.state.turns!.left, back.world.ext.light])
      .toEqual(['gallery', true, true, '11', 6, { hits: [{ from: 'N', via: 1, out: 'S', rooms: ['night'] }] }]);
  });

  it('舊存檔 (骨架版長廊的快照：紙籤在 x 2.4、沒有感光花)：照常開章，紙籤的位置取關卡資料 (只覆寫可推物)、兩朵花閉著；3-2 開放狀態依 3-1', () => {
    const legacy = {
      cube: { pos: { nursery: [0, 1, 0], night: [1, 1, 0], gallery: [2, 1, 0], bed: [1, 2, 0], depths: [2, 2, 0] }, rot: { nursery: 0, night: 0, gallery: 0, bed: 0, depths: 0 } },
      rooms: { gallery: { objs: [{ id: 'floor', x: 0, y: -1, z: 0, gone: false, used: false, touched: false }, { id: 'plaqueN', x: 2.4, y: 0.95, z: -4.88, gone: false, used: false, touched: false }], flags: [] } },
      at: { room: 'gallery', door: 'doorW' }, items: {}, flags: [], dial: true
    };
    const store = memoryStorage();
    store.set('puzzle:save', JSON.stringify({ ...defaultSave(), cleared: ['2-5'], abilities: ['nib'], chapters: { '3': legacy } }));
    const loaded = loadSave(store);
    const cs = openChapter(SPEC, chapterStart(loaded, SPEC, CH3.start), OPTS);
    runScript(cs.world, [{ wait: 1 / 30 }]);
    expect([cs.state.room, get(cs, 'plaqueN').x, get(cs, 'floor').def.w, get(cs, 'flowerN').used, get(cs, 'flowerW').used, levelState(levelById('3-2')!, loaded), levelState(levelById('3-2')!, { ...loaded, cleared: ['2-5', '3-1'] })])
      .toEqual(['gallery', 6.6, 20, false, false, 'locked', 'open']);
  });
});

describe('展開圖的光路圖層 (MapLight；現況與轉動預覽)', () => {
  it('S0：兩段白光停在天窗下的空格北側；窗記號 = 長廊 N / W / S、夜溫室 N / S、溫床 N / E、深處 N (苔窗被蓋住不畫)；稜鏡 = 長廊 W↔S、溫床 N↔E；圖例兩項', () => {
    const m = deriveCubeMap(inGallery(), TEXT)!;
    expect([m.light!.segs.map(s => s.white), m.light!.stops.map(s => [s.x, s.y, s.kind])]).toEqual([[true, true], [[0.72, 0, 'wall'], [1.72, 0, 'wall']]]);
    expect(m.light!.glass.map(g => `${g.x}${g.y}${g.side}`).sort()).toEqual(['11N', '11S', '12E', '12N', '21N', '21S', '21W', '22N'].sort());
    expect(m.light!.prisms).toEqual([{ x: 2, y: 1, a: 'W', b: 'S' }, { x: 1, y: 2, a: 'N', b: 'E' }]);
    expect([m.legend.stained, m.legend.white]).toEqual(['穿過玻璃的光', '白光']);
  });

  it('3-2a 的排列：白光進夜溫室、穿過玻璃的光 (虛線) 進長廊 → 溫床 → 停在深處西側 (苔窗)；轉動模式選「溫床往上滑」→ 預覽畫轉後的光路 (L 形進長廊西窗)', () => {
    let cs = turns(inGallery(), SOLVE_A).cs;
    const l = mapLight(CH3_CUBE, cs.state.cube!, 0)!;
    expect([l.segs.filter(s => s.white).length, l.segs.filter(s => !s.white).length, l.stops.at(-1)]).toEqual([3, 5, { x: 2, y: 2.72, kind: 'wall', side: 'W' }]);
    cs = turns(cs, [T('c4', 'E')]).cs;
    const t = deriveTurnMode(cs, TEXT, T('c7', 'N'));
    const pv = t.preview!.light!;
    // 轉後：夜溫室 (白光) → 溫床 (往東) → 長廊西窗 → 長廊稜鏡往南 → 深處 (停在房內：圓點)
    expect(pv.stops.at(-1)).toEqual({ x: 2.72, y: 2.72, kind: 'room', side: 'N' });
    expect(pv.segs.some(s => s.x0 === 2 && s.y0 === 1.72 && !s.white)).toBe(true); // 從長廊的西邊進來
    expect(deriveCubeMap(cs, TEXT)!.light!.stops.at(-1)).toEqual({ x: 1.72, y: 1, kind: 'wall', side: 'N' }); // 現況 (還沒轉) 不變
  });

  it('第二章沒有彩繪玻璃：展開圖不給光路、圖例沒有光', () => {
    const ch2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
    const s2 = chapterSpecOf(ch2);
    const m = deriveCubeMap(openChapter(s2, chapterStart(defaultSave(), s2, ch2.start), OPTS), TEXT)!;
    expect(['light' in m, 'white' in m.legend]).toEqual([false, false]);
  });
});

describe('音效 (USED_ON)：感光花開', () => {
  it('LevelObserver：sensor used → 亮燈聲；拿玻璃片 / 殘片 = 撿東西 / 紙聲', () => {
    const snap = (objs: LevelSnap['objs'], inv: Record<string, number> = {}): LevelSnap => ({
      world: W, room: 'gallery', mode: '2d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const W = {};
    const o = (id: string, used: boolean) => ({ id, type: 'sensor', used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(snap([o('a', false)]));
    const out = obs.update(snap([o('a', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.lamp.on']);
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = gallery.objects.filter(o => o.type === 'note');
describe('3-2 字條：3-2a / 3-2b 各 L1 + L2 (L2 空白，4 分鐘浮現)、量表', () => {
  it('原文 (story-bible 7.3)；落地木柱；H1 (L1 ≤ 24、L2 ≤ 30) / H2 / H3 / H4 / H10；間距 ≥ 3、任一 16 單位寬的畫面 ≤ 3 張', () => {
    expect(notes.map(o => [o.id, noteText(o), o.type === 'note' && o.mount, o.type === 'note' && o.revealAfter])).toEqual([
      ['noteB', '西邊的窗，只認走過遠路的。', 'post', undefined],
      ['noteB2', '進不去的房間，擋得住什麼？', 'post', 240],
      ['noteA', '這朵花不肯曬太陽。它在等穿過森林的那一種。', 'post', undefined],
      ['noteA2', '北窗外面，現在接著的是哪一間？', 'post', 240]
    ]);
    for (const o of notes) {
      const t = noteText(o);
      expect([o.id, [...t].length <= (o.type === 'note' && o.revealAfter ? 30 : 24)]).toEqual([o.id, true]);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t)).toBe(false);
    }
    // H10 (ahaTerms：光題 + 魔方題) + H4 (keyObjects 的顯示名)
    const AHA = ['光', '玻璃', '稜鏡', '轉彎', '照', '轉', '滑', '空格', '排列', '對齊', '一起', '跟著'];
    const KEYS = ['夜溫室', '溫床', '園丁羅盤', '控制盤', '彩繪玻璃', '天窗'];
    for (const o of notes) for (const term of [...AHA, ...KEYS]) expect([o.id, term, noteText(o).includes(term)]).toEqual([o.id, term, false]);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    // 每關提示字條 4 = 第三章預算 (每題 L1 + 難度 ≥ 5 的 L2)；總數 ≤ 謎題數 + 3
    expect([notes.length, notes.length <= gallery.puzzles!.length + 3]).toEqual([4, true]);
  });

  it('兩個視角都讀得到；L2 一開始是空白 (「紙上還是空白的。」)，進房 240 秒浮現', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = createWorld(gallery, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : noteText(o));
      if (o.type === 'note' && o.revealAfter) { w.time = o.revealAfter; interact(w); expect(w.msg).toBe(noteText(o)); }
    }
  });
});

