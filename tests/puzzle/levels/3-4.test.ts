// 3-4 溫室深處 (規格 6「3-4 溫室深處（細化）」；第三章第四關 = 章末)：資料與驗證器、擺設深度帶、高度與距離 (D10)、3-4 區 validateDial
// (CH3_ZONE34 / CH3_ZONE34_CORE；cards / jams.unless / card / light.uncovered / refill；拿掉關鍵要素)、花窗架 (缺 0～3 片)、3-4a 兩種解法與兩個錯誤方向、
// 3-4b 唯一的「小」(先縮 / 先排光再縮)、苔窗 (蓋著 / 光不夠 / 閂住)、墨補滿、stayShrunk、章門 (門後是牆 / 鑰匙 / 第三章通關)、
// 反例 (只用 2D / 只用 3D；盲轉取樣)、R、存檔讀檔與舊存檔、展開圖的光路 (uncovered)、音效、字條規則、捷徑掃描；
// 追逐 1 (N19：腳本回放 ①～⑥、走回主室、R 不重演、calm)、章門 = 第三章通關 (記入 3-1～3-4、存檔、房間通關不蓋掉章通關)、柵門的音效
import { describe, it, expect } from 'vitest';
import { depths } from '../../../src/puzzle/content/levels/ch3/3-4-depths';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH3_CARDS34, CH3_CUBE, CH3_GLASS, CH3_ZONE34, CH3_ZONE34_CORE } from '../../../src/puzzle/content/cubes/ch3';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { labelTarget } from '../../../src/puzzle/mechanics/labels';
import { sensorLight } from '../../../src/puzzle/mechanics/light';
import { latticeState } from '../../../src/puzzle/mechanics/depths';
import { turnModeDenied } from '../../../src/puzzle/mechanics/dial';
import { isPassable } from '../../../src/puzzle/core/presence';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { GRAVITY, INTERACT_RANGE, JUMP_V_2D, JUMP_V_3D } from '../../../src/puzzle/core/constants';
import { applyTurn, cellsOf, cubeKey, initialCube, isBlocked, sameCell, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, clearedRooms, dialBlocked, enterRoom, lightPaths, lightState, openChapter, restartRoom, sessionUncovered,
  type ChapterSession, type ChapterState
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef, World } from '../../../src/puzzle/core/types';
import { chaseRun, chaserSpeed } from '../../../src/puzzle/mechanics/chase';
import { recordClear } from '../../../src/puzzle/meta/progress';
import { CUTSCENES } from '../../../src/puzzle/content/cutscenes';
import { cutsceneBeforeLevel } from '../../../src/puzzle/meta/cutscenes';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap } from '../../../src/puzzle/app/cubeMapModel';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear } from '../../../src/puzzle/meta/progress';
import { LevelObserver, SCARE_SFX, type LevelSnap } from '../../../src/puzzle/audio/events';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts } from '../../../src/puzzle/devtools/shortcutScan';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
const SPEC = chapterSpecOf(CH3);
const def = (id: string): ObjDef => depths.objects.find(o => o.id === id)!;
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };

/** 取走事件交給章節層 (同 LevelSession)；換房後同批事件丟棄 */
function pump(cs: ChapterSession): { cs: ChapterSession; done: string[] } {
  const done: string[] = [];
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    if (e.t === 'done') done.push(e.flag);
    const r = applyChapterEvent(cs, e, OPTS);
    if (r.kind === 'enter') return { cs: r.next, done };
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return { cs, done };
}
const play = (cs: ChapterSession, cmds: Cmd[]) => { runScript(cs.world, cmds); return pump(cs); };
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });
const FLIP: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];
const to3d = (w: World): Cmd[] => (w.player.mode === '2d' ? FLIP : []);
const to2d = (w: World): Cmd[] => (w.player.mode === '3d' ? FLIP : []);
/** 轉動 (控制盤) 後走一步：機制讀到新的連接 / 光 */
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
/** 在藏寶圖裡站到 x、對那個標籤貼 / 取卡 */
const label2d = (cs: ChapterSession, x: number, cmd: Cmd) => play(cs, [...to2d(cs.world), { walkTo: [x, null] }, { wait: 0.1 }, cmd, { wait: 1 / 30 }]);
/** 穿過此刻接著 to 的那扇門 (章節層的換房；門要真的接著) */
function walk(cs: ChapterSession, to: string): ChapterSession {
  const l = Object.values(cs.world.ext.cube!.links).find(v => v.to === 'room' && v.room === to);
  if (!l || l.to !== 'room') throw new Error(`${cs.state.room} is not connected to ${to}`);
  return play(enterRoom(cs, to, l.door, OPTS), [{ wait: 1 / 30 }]).cs;
}

// ── 進房狀態 (3-1～3-3 以「三片玻璃到手、『小』在巨盆上」抽象：苗圃的樹根縮回土裡、巨盆被推進軌道、3-3b 完成) ──
type Layout = Record<'nursery' | 'night' | 'gallery' | 'bed' | 'depths', string>;
const S0: Layout = { nursery: '01', night: '11', gallery: '21', bed: '12', depths: '22' };
/** 3-2b 的 L 形 (天窗 → 夜溫室 → 溫床的稜鏡 → 長廊的稜鏡 → 深處北窗)；苗圃在原格 */
const L_SHAPE: Layout = { nursery: '01', night: '10', gallery: '21', bed: '11', depths: '22' };
/** 花窗的圖 + 月光的路 */
const SOLVED: Layout = { nursery: '12', night: '10', gallery: '21', bed: '11', depths: '22' };
const cubeOf = (p: Layout): CubeState => ({
  pos: Object.fromEntries(Object.entries(p).map(([r, s]) => [r, [+s[0], +s[1], 0] as const])),
  rot: { nursery: 0, night: 0, gallery: 0, bed: 0, depths: 0 }
});
const snap = (id: string, extra: Partial<{ x: number; y: number; z: number; gone: boolean; used: boolean }> = {}) => ({ id, x: 0, y: 0, z: 0, gone: false, used: true, touched: false, ...extra });
function stateAt(p: Layout, o: { room?: string; door?: string | null; labels?: Record<string, string[]>; items?: Record<string, number>; depthsObjs?: ReturnType<typeof snap>[] } = {}): ChapterState {
  return {
    chapter: 3, cube: cubeOf(p), room: o.room ?? 'depths', door: o.door === undefined ? 'archN' : o.door,
    rooms: {
      nursery: { objs: [snap('root')], flags: [] },
      night: { objs: [snap('halfN'), snap('bigPot', { z: -4.6 }), snap('flowerMoon'), snap('pane3', { gone: true })], flags: [] },
      ...(o.depthsObjs ? { depths: { objs: o.depthsObjs, flags: [] } } : {})
    },
    items: o.items ?? { 'pane.1': 1, 'pane.2': 1, 'pane.3': 1, 'card.da': 1 },
    flags: ['scare:handprint'], labels: o.labels ?? { 'scale:bigPot': ['card.xiao'] }, moved: {}, dial: true
  };
}
const open = (p: Layout, o: Parameters<typeof stateAt>[1] = {}) => openChapter(SPEC, stateAt(p, o), OPTS);
/** 花窗架嵌上三片玻璃 (實景站在架前按 E) */
const INSTALL: Cmd[] = [{ wait: 0.1 }, { walkTo: [4.0, -3.6] }, { wait: 0.1 }, { act: 'interact' }];
const install = (cs: ChapterSession) => play(cs, [...to3d(cs.world), ...INSTALL]);
/** 從 L 形起點 6 步 / 8 步、從 S0 8 步 (規格 3-4a 的例) */
const A6 = [T('c1', 'W'), T('c4', 'N'), T('c3', 'E'), T('c4', 'S'), T('c1', 'S'), T('c0', 'E')];
const A8 = [T('c1', 'W'), T('c4', 'N'), T('c3', 'E'), T('c4', 'S'), T('c1', 'S'), T('c4', 'W'), T('c0', 'E'), T('c3', 'E')];
const A_S0 = [T('c4', 'N'), T('c1', 'W'), T('c7', 'N'), T('c4', 'N'), T('c3', 'E'), T('c4', 'S'), T('c1', 'S'), T('c0', 'E')];
/** 3-4a 完成 (從 L 形 6 步) 並拿走抽屜：房間的銅鑰匙 + 手記第三頁 */
function after34a(): ChapterSession {
  let cs = install(open(L_SHAPE)).cs;
  const r = turns(cs, A6);
  expect(r.done).toEqual(['3-4a']);
  cs = play(r.cs, [{ walkTo: [4.6, -3.2] }, { wait: 0.1 }, { act: 'interact' }]).cs;
  expect([hasItem(cs.world, 'key.greenhouse'), hasItem(cs.world, 'diary.3')]).toEqual([true, true]);
  // 進房快照 = 3-4a 已完成 (R 不會退回 3-4a)
  return enterRoom(enterRoom(cs, 'gallery', 'doorS', OPTS), 'depths', 'archN', OPTS);
}

describe('3-4 溫室深處：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 3-4a / 3-4b / 章門；登錄表 3-4 (前置 3-3)、房間 depths；尺寸、主題、墨 (3-4b 補滿)；旁白 / 章末文字', () => {
    expect(validateLevel(depths, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('3-4')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(depths.puzzles!.map(q => [q.id, TEXT(q.titleKey)])).toEqual([['3-4a', '3-4a 月下的花窗'], ['3-4b', '3-4b 長進軌道的根'], ['3-4', '追逐・章門']]);
    expect([levelById('3-4')!.unlock.after, levelById('3-4')!.chapter, CH3.levels['3-4'], CH3.rooms.depths, depths.bounds, depths.theme, depths.turnBudget])
      .toEqual([['3-3'], 3, 'depths', depths, { minX: -10, maxX: 62, minZ: -5, maxZ: 5 }, 'greenhouse', { base: 10, refillOn: ['3-4b'], refillText: 'lvl.3-4.refill' }]);
    expect([TEXT(depths.titleKey), TEXT(depths.narrationKey), TEXT(depths.nextKey), nextAfterClear('3-4', 'chapter', CHAPTERS)])
      .toEqual(['溫室深處', '羅盤的把手磨亮了。有人轉過它，很多次。', '溫室往下沉了。第四章　地下室——還在路上。', null]);
    // 3-3c 的高台 / 筆記一頁座標不動；章門 id 不變、在長廊盡頭；彩繪玻璃資料不變
    expect([def('ledge').x, def('ledge').z, def('pageGarden').y, def('chapterS').x, def('chapterS').type === 'cubeDoor' && def('chapterS').key, CH3_GLASS.depths])
      .toEqual([1.85, -4.55, 1.9, 61.0, 'key.greenhouse', { glass: ['N', 'W'], covered: ['W'] }]);
  });

  it('擺設三帶 (layoutDepthIssues = [])；分帶：後 = 北拱門 / 花窗架 / 抽屜 / 高台 / 筆記、中 = 巨根 / 苔窗 / 紙籤 / 舊羅盤架、前 = 四張字條 / 章門；實體 = 地板、高台、柵門、三道墨牆、三道鐵柵', () => {
    expect(layoutDepthIssues(depths)).toEqual([]);
    const band = (z: number) => (z < -2 ? 'back' : z > 2 ? 'front' : 'mid');
    const objs = depths.objects.filter(o => o.interactable || o.label);
    expect(Object.fromEntries(['back', 'mid', 'front'].map(b => [b, objs.filter(o => band(o.z) === b).map(o => o.id)]))).toEqual({
      back: ['archN', 'paneFrame', 'latticeBox', 'ledge', 'pageGarden'], mid: ['giantRoot', 'mossW', 'plaqueRoot', 'oldCompass'],
      front: ['noteB', 'noteB2', 'noteA', 'noteA2', 'chapterS']
    });
    expect(depths.objects.filter(o => o.solid).map(o => o.id)).toEqual(['floor', 'ledge', 'chaseGate', 'inkA', 'barsA', 'inkB', 'barsB', 'inkC', 'barsC']);
    // 家具可穿過：巨根、花窗架、羅盤架不進碰撞
    expect(['giantRoot', 'paneFrame', 'oldCompass', 'lattice', 'mossW'].map(id => def(id).solid)).toEqual([false, false, false, false, false]);
  });

  it('高度與距離 (D10)：柵門 2.6 > 兩個視角的跳躍；墨牆 6 / 鐵柵 4 全深；長廊交替 (間距 7)；字條與巨根標籤不搶 E；實景 E 的優先 (花窗架 / 抽屜 / 苔窗)', () => {
    const h3 = JUMP_V_3D ** 2 / (2 * GRAVITY), h2 = JUMP_V_2D ** 2 / (2 * GRAVITY);
    const gate = def('chaseGate');
    expect([h2 + 0.15 < gate.h, h3 + 0.15 < gate.h, gate.d]).toEqual([true, true, 10]);
    const obstacles = depths.objects.filter(o => o.type === 'inkwall' || o.type === 'bars');
    expect(obstacles.map(o => [o.type, o.x, o.h, o.d, o.visible])).toEqual([
      ['inkwall', 24, 6, 10, '2d'], ['bars', 31, 4, 10, '3d'], ['inkwall', 38, 6, 10, '2d'], ['bars', 45, 4, 10, '3d'], ['inkwall', 52, 6, 10, '2d'], ['bars', 59, 4, 10, '3d']
    ]);
    // 巨根標籤的站位 (根的 x 範圍) 到最近字條的盒緣 > 互動範圍
    const notes = depths.objects.filter(o => o.type === 'note');
    const root = def('giantRoot');
    const near = Math.min(...notes.map(n => Math.abs(n.x - root.x) - n.w / 2));
    expect([near > INTERACT_RANGE, +near.toFixed(2)]).toEqual([true, 2.45]);
    // 實景：花窗架前 = 花窗架；抽屜彈出後 = 抽屜；站進根的範圍 = 苔窗
    let cs = after34a();
    runScript(cs.world, [...to3d(cs.world), { walkTo: [4.0, -3.6] }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('paneFrame');
    cs = install(open(L_SHAPE)).cs;
    cs = turns(cs, A6).cs;
    runScript(cs.world, [{ walkTo: [4.6, -3.2] }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('latticeBox');
    runScript(cs.world, [{ walkTo: [-9.0, 0.6] }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('mossW');
    // 藏寶圖：站在巨根正前 = 巨根的標籤 (3-4a 之後)，不是字條
    runScript(cs.world, [...FLIP, { walkTo: [-9.0, null] }, { wait: 0.1 }]);
    expect([labelTarget(cs.world)?.def.id, findTarget(cs.world)?.def.id ?? null]).toEqual(['giantRoot', null]);
  });
});

describe('validateDial：3-4 區 (CH3_ZONE34_CORE / CH3_ZONE34)', () => {
  const core = dialModelOf(CH3_ZONE34_CORE.cube, CH3.rooms, CH3_ZONE34_CORE.puzzles, CH3_ZONE34_CORE.start, CH3_ZONE34_CORE.finish, { jams: CH3_ZONE34_CORE.jams });
  const full = dialModelOf(CH3_ZONE34.cube, CH3.rooms, CH3_ZONE34.puzzles, CH3_ZONE34.start, CH3_ZONE34.finish, { jams: CH3_ZONE34.jams, cards: CH3_ZONE34.cards });
  const per = (rep: ReturnType<typeof validateDial>) => rep.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues]);
  it('核心 (只要 3-4a；深處一直卡著；深處預算 10)：可達排列 360、狀態 55,684、卡死 0、需要 R / 換房補墨 4,816；3-4a.light 最短 2；3-4a 從 S0 起算 8 / 10 / 37 / 5 / 10 (最短 8 < 預算)', () => {
    const r = validateDial(core);
    expect([r.arrangements, r.states, r.needsRestart, r.solvable, r.deadlocks, r.issues, r.budgetBypass]).toEqual([360, 55684, 4816, true, [], [], []]);
    expect(per(r)).toEqual([['3-4a.light', 2, 3, 119, 26, 10, []], ['3-4a', 8, 10, 37, 5, 10, []], ['ch3.depths.core', 0, null, 1, 1, 10, []]]);
  });
  it('整區 (含 3-4b；「小」的位置進模型；深處預算 10)：可達排列 2,520、狀態 783,538 (< 2×10⁶)、卡死 0；3-4a 從 S0 8 / 10；3-4b 最短 8、次短 9 (列舉上限 10：要換房帶卡)、本質不同 16', () => {
    const r = validateDial(full);
    expect([r.arrangements, r.states, r.needsRestart, r.solvable, r.deadlocks, r.issues, r.budgetBypass]).toEqual([2520, 783538, 104862, true, [], [], []]);
    expect(per(r)).toEqual([
      ['3-4a.light', 2, 3, 430, 63, 10, []], ['3-4a', 8, 10, 40, 5, 10, []], ['3-4b', 8, 9, 105, 16, 10, []], ['ch3.depths', 0, null, 1, 1, 10, []]
    ]);
  });
  it('拿掉關鍵要素 → 無解：長廊沒有稜鏡 / 夜溫室沒有玻璃 → 3-4a；溫床沒有稜鏡 → 3-4a、3-4b；「小」永遠在巨盆 → 3-4b；單調近似 (沒有 cards) 會報假卡死 (記錄)', () => {
    const glass = (g: Partial<typeof CH3_GLASS>) => ({ ...CH3_CUBE, glass: { ...CH3_GLASS, ...g } });
    for (const g of [{ gallery: { glass: ['N', 'W', 'S'] } }, { night: { glass: [] } }] as const) {
      const r = validateDial({ ...core, cube: glass(g) });
      expect([Object.keys(g)[0], r.solvable, r.perPuzzle.find(p => p.id === '3-4a')!.shortest]).toEqual([Object.keys(g)[0], false, null]);
    }
    const noBedPrism = validateDial({ ...core, cube: glass({ bed: { glass: ['N', 'E'] } }) });
    expect([noBedPrism.solvable, noBedPrism.perPuzzle.find(p => p.id === '3-4a.light')!.shortest]).toEqual([false, null]);
    // 3-4b 單獨看 (3-4a 當作已完成的起點)：溫床沒有稜鏡 → 西窗照不到
    const only4b = { ...full, puzzles: full.puzzles.map(p => (p.id === '3-4a' || p.id === '3-4a.light' ? { ...p, light: undefined, goal: undefined, needs: [] } : p)) };
    const noPrismB = validateDial({ ...only4b, cube: glass({ bed: { glass: ['N', 'E'] } }) });
    expect([noPrismB.solvable, noPrismB.perPuzzle.find(p => p.id === '3-4b')!.shortest]).toEqual([false, null]);
    const keepCard = validateDial({ ...full, cards: [{ id: 'xiao', start: 'bigPot', slots: { bigPot: { room: 'night' } } }] });
    expect([keepCard.solvable, keepCard.perPuzzle.find(p => p.id === '3-4b')!.shortest]).toEqual([false, null]);
    const mono = validateDial({ ...full, cards: undefined, puzzles: full.puzzles.map(p => (p.id === '3-4b' ? { ...p, card: undefined } : p)), jams: [{ room: 'depths', until: '3-4b' }, { room: 'night', from: '3-4a' }] });
    expect([mono.solvable, mono.issues]).toEqual([false, ['1482 entry snapshots cannot finish (listed 20)']]);
    expect(CH3_CARDS34).toEqual([{ id: 'xiao', start: 'bigPot', slots: { bigPot: { room: 'night' }, giantRoot: { room: 'depths', after: '3-4a' } } }]);
  });
});

describe('3-4a 月下的花窗 (P5 / P6)：花窗架、九格花窗', () => {
  it('花窗架 (固定動作)：缺三 / 兩 / 一片 → 說缺幾片、不消耗；三片都在 → 嵌上 (各減一、used)；之後按 E = 花窗此刻的樣子；花窗架嵌上之前花窗不會亮', () => {
    const all = { 'pane.1': 1, 'pane.2': 1, 'pane.3': 1 };
    for (const [items, n] of [[{}, '三'], [{ 'pane.1': 1 }, '兩'], [{ 'pane.1': 1, 'pane.3': 1 }, '一']] as const) {
      const cs = install(open(SOLVED, { items })).cs;
      expect([cs.world.msg, get(cs, 'paneFrame').used, get(cs, 'lattice').used, Object.keys(cs.world.inv).filter(k => cs.world.inv[k] > 0).sort()])
        .toEqual([`花窗還缺${n}片玻璃。`, false, false, Object.keys(items).sort()]);
    }
    // 排列已經對 (SOLVED)：嵌上的那一刻 → 下一步花窗就亮
    const r = install(open(L_SHAPE, { items: all }));
    expect([r.cs.world.msg, get(r.cs, 'paneFrame').used, ['pane.1', 'pane.2', 'pane.3'].map(p => hasItem(r.cs.world, p))]).toEqual(['三片玻璃嵌進了花窗。六格畫著東西，三格只有一筆墨線。', true, [false, false, false]]);
    runScript(r.cs.world, [{ act: 'interact' }]);
    expect(r.cs.world.msg).toBe('月光照進花窗了，可是有幾格的圖對不上。'); // L 形：光到了、圖不對
    const s = install(open(SOLVED, { items: all }));
    const t = play(s.cs, [{ wait: 1 / 30 }]);
    expect([s.done.concat(t.done), get(t.cs, 'lattice').used]).toEqual([['3-4a'], true]);
  });

  it('解法一 (從 L 形 6 步：夜溫室 ◀、溫床 ▲、苗圃 ▶、苗圃 ▼、溫床 ▼、夜溫室 ▶) → 「許」字亮、抽屜彈出 (鑰匙 + 手記第三頁)、柵門打開；閂住 (排列改了照樣亮)', () => {
    let cs = install(open(L_SHAPE)).cs;
    expect([latticeState(cs.world, get(cs, 'lattice')), findTarget(cs.world)?.def.id, isPassable(cs.world, get(cs, 'chaseGate'))]).toEqual(['light', 'paneFrame', false]);
    const r = turns(cs, A6);
    cs = r.cs;
    expect([r.done, cs.world.msg, pos(cs, 'nursery'), cs.state.turns!.left, isPassable(cs.world, get(cs, 'chaseGate'))])
      .toEqual([['3-4a'], '月光穿過三間房，落在花窗上。墨線連成一個「許」字。木架彈開一格，長廊的柵門也開了。', '12', 4, true]);
    cs = play(cs, [{ walkTo: [4.6, -3.2] }, { wait: 0.1 }, { act: 'interact' }]).cs;
    expect([hasItem(cs.world, 'key.greenhouse'), hasItem(cs.world, 'diary.3'), get(cs, 'latticeBox').gone, cs.world.msg])
      .toEqual([true, true, true, '木架裡是一把房間的銅鑰匙，和許問津的手記第三頁：「守門的影子，只攔，不傷。」']);
    // 閂住：排列改了 (光走了)，字照樣亮著；花窗架代答
    cs = turns(cs, [T('c1', 'W')]).cs;
    runScript(cs.world, [{ walkTo: [4.0, -3.6] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([get(cs, 'lattice').used, cs.world.msg]).toEqual([true, '「許」字在花窗上亮著。']);
  });

  it('解法二 (從 L 形 8 步：…溫床 ◀、夜溫室 ▶、溫床 ▶)；從 S0 直接排 8 步 (預算 10，剩 2)', () => {
    let r = turns(install(open(L_SHAPE)).cs, A8);
    expect([r.done, pos(r.cs, 'nursery'), pos(r.cs, 'bed'), r.cs.state.turns!.left]).toEqual([['3-4a'], '12', '11', 2]);
    r = turns(install(open(S0)).cs, A_S0);
    expect([r.done, r.cs.state.turns!.left]).toEqual([['3-4a'], 2]);
  });

  it('錯誤嘗試：只接光不管圖 (2 種排列) / 只排圖不管光 (5 種) 各自的回饋；以為玻璃片來自哪間房就放在那格 (苗圃 / 長廊 / 夜溫室) → 圖不對', () => {
    // 只排圖：三間玻璃房的順序錯 (溫床在天窗下：光往東撞上工具間)
    let cs = install(open(S0)).cs;
    const p = turns(cs, [T('c4', 'N'), T('c1', 'W'), T('c7', 'N'), T('c4', 'N'), T('c3', 'E'), T('c4', 'S'), T('c0', 'S'), T('c3', 'E')]);
    cs = p.cs;
    expect([p.done, pos(cs, 'bed'), pos(cs, 'night'), latticeState(cs.world, get(cs, 'lattice')), cs.world.msg])
      .toEqual([[], '10', '11', 'pattern', '窗上的圖都對上了，可是花窗是暗的。']);
    // 只接光：照 3-2b 的 L 形
    cs = install(open(S0)).cs;
    const l = turns(cs, [T('c4', 'N'), T('c7', 'N')]);
    expect([l.done, latticeState(l.cs.world, get(l.cs, 'lattice')), l.cs.world.msg]).toEqual([[], 'light', '月光照進花窗了，可是有幾格的圖對不上。']);
    // 全部排列 (深處卡著、苗圃鬆開的 360 種) 裡：只排圖 5、只接光 2、兩者都成立 1
    const opts = CH3_CUBE.dial!.groups.flatMap(g => turnDirs(CH3_CUBE, g.id).map(dir => ({ group: g.id, dir })));
    const seen = new Map<string, CubeState>([[cubeKey(initialCube(CH3_CUBE)), initialCube(CH3_CUBE)]]);
    const q = [initialCube(CH3_CUBE)];
    while (q.length) {
      const s = q.shift()!;
      for (const o of opts) {
        if (cellsOf(CH3_CUBE, s, o.group).some(c => sameCell(c, s.pos.depths))) continue;
        const n = applyTurn(CH3_CUBE, s, o);
        if (isBlocked(n) || seen.has(cubeKey(n))) continue;
        seen.set(cubeKey(n), n); q.push(n);
      }
    }
    const w = createWorld(depths, OPTS);
    const count = { none: 0, pattern: 0, light: 0, both: 0 };
    for (const s of seen.values()) {
      w.ext = { cube: { links: {}, layout: Object.fromEntries(Object.entries(s.pos).map(([r, c]) => [r, [c[0], c[1], c[2]] as const])) }, light: { hits: lightPaths(CH3_CUBE, s).hits.depths ?? [] } };
      count[latticeState(w, w.byId.get('lattice')!)]++;
    }
    expect([seen.size, count.pattern, count.light, count.both]).toEqual([360, 5, 2, 1]);
  });

  it('R：3-4a 在本次進房後完成 → R 回到進房時 (花窗沒亮、玻璃片回到手上、排列退回)；閂住後換房再回來照樣亮', () => {
    let cs = install(open(L_SHAPE)).cs;
    cs = turns(cs, A6).cs;
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([get(back, 'lattice').used, get(back, 'paneFrame').used, hasItem(back.world, 'pane.1'), pos(back, 'nursery'), pos(back, 'night')]).toEqual([false, false, true, '01', '10']);
    const again = enterRoom(enterRoom(cs, 'gallery', 'doorS', OPTS), 'depths', 'archN', OPTS);
    runScript(again.world, [{ wait: 1 / 30 }]);
    expect([get(again, 'lattice').used, isPassable(again.world, get(again, 'chaseGate'))]).toEqual([true, true]);
  });
});

/** 3-4b 解法一 (先縮；BFS 最短 8)：到長廊 (溫床 ◀、苗圃 ▲) → 到苗圃 (夜溫室 ◀、苗圃 ▲) → 夜溫室取下巨盆的「小」→ 苗圃 ▼ → 回深處貼巨根 → 苗圃 ▲、深處 ◀、深處 ▲ */
function shrinkFirst(base: ChapterSession): { cs: ChapterSession; done: string[]; nightJam: string | null; depthsFree: string | null } {
  let cs = walk(base, 'gallery');
  cs = turns(cs, [T('c4', 'W'), T('c7', 'N')]).cs;
  cs = walk(cs, 'nursery');
  cs = turns(cs, [T('c1', 'W'), T('c4', 'N')]).cs;
  cs = walk(cs, 'night');
  cs = label2d(cs, 0, uncard('scale:bigPot', 'card.xiao')).cs;
  const nightJam = dialBlocked(cs, T('c0', 'E'));
  cs = walk(cs, 'nursery');
  cs = turns(cs, [T('c1', 'S')]).cs;
  cs = walk(walk(cs, 'gallery'), 'depths');
  cs = label2d(cs, -9.0, card('scale:giantRoot', 'card.xiao')).cs;
  const depthsFree = dialBlocked(cs, T('c8', 'W'));
  const r = turns(cs, [T('c4', 'N'), T('c8', 'W'), T('c7', 'N')]);
  return { cs: r.cs, done: r.done, nightJam, depthsFree };
}

describe('3-4b 長進軌道的根 (P3 / P6)：唯一的「小」', () => {
  it('3-4a 之前巨根沒有標籤 (被苔蓋著)；3-4a 之後才露出；苔窗蓋著時 3D 按 E = 「樹根蓋住了窗」；深處一直卡著', () => {
    const before = open(L_SHAPE);
    runScript(before.world, [...FLIP, { walkTo: [-9.0, null] }, { wait: 0.1 }]);
    expect([labelTarget(before.world), dialBlocked(before, T('c8', 'W'))]).toEqual([null, 'jammed']);
    const cs = after34a();
    runScript(cs.world, [...FLIP, { walkTo: [-9.0, null] }, { wait: 0.1 }]);
    expect(labelTarget(cs.world)?.def.id).toBe('giantRoot');
    runScript(cs.world, [...FLIP, { walkTo: [-9.0, 0.6] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([cs.world.msg, sensorLight(cs.world, get(cs, 'mossW'))]).toEqual(['樹根蓋住了窗。窗後面，好像寫著什麼。', 'dark']);
  });

  it('解法一 (先縮)：「小」離開巨盆 → 夜溫室卡住 (楔形)；貼巨根 → 縮離西牆、深處鬆開、苔窗露出 → 深處滑到溫床東邊 → 苔窗亮、爸爸的字、墨補滿；深處 ▼ ▶ 回章門格', () => {
    const r = shrinkFirst(after34a());
    let cs = r.cs;
    expect([r.nightJam, r.depthsFree, r.done, pos(cs, 'depths'), pos(cs, 'bed'), pos(cs, 'night'), cs.state.turns!.left]).toEqual([
      'jammed', null, ['3-4b'], '11', '01', '00', 10
    ]);
    expect(cs.world.msg).toBe('光照透了苔蘚，窗上浮出爸爸的字：「這扇窗，我等了好多年。」字還是濕的。筆尖一碰，墨又滿了。');
    expect([get(cs, 'mossW').used, get(cs, 'giantRoot').used, [...sessionUncovered(cs)]]).toEqual([true, true, ['depths.W']]);
    // 深處不在章門格：章門後是牆
    runScript(cs.world, [...to3d(cs.world), { place: [61.0, 0, 4.0] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([cs.world.msg, cs.world.cleared]).toEqual(['門後是牆。', false]);
    cs = turns(cs, [T('c4', 'S'), T('c7', 'E')]).cs;
    expect([pos(cs, 'depths'), cs.state.turns!.left]).toEqual(['22', 8]);
    runScript(cs.world, [{ act: 'interact' }]);
    expect([cs.world.cleared, get(cs, 'chapterS').used, clearedRooms(SPEC, cs.state, cs.world).includes('depths')]).toEqual([true, true, true]);
  });

  it('解法二 (先排光再縮；深處不動)：「小」還在巨盆上時排成 長廊 [1,0]、夜溫室 [1,1]、溫床 [1,2]、苗圃 [2,1] → 取「小」→ 經苗圃走進深處貼巨根 → 苔窗立刻亮', () => {
    let cs = walk(after34a(), 'gallery');
    cs = turns(cs, [T('c1', 'W'), T('c4', 'W'), T('c5', 'W'), T('c4', 'N')]).cs;
    cs = walk(cs, 'night');
    cs = turns(cs, [T('c7', 'N'), T('c4', 'E'), T('c3', 'E'), T('c0', 'S'), T('c4', 'S'), T('c3', 'E')]).cs;
    expect([pos(cs, 'gallery'), pos(cs, 'night'), pos(cs, 'bed'), pos(cs, 'nursery'), pos(cs, 'depths')]).toEqual(['10', '11', '12', '21', '22']);
    cs = label2d(cs, 0, uncard('scale:bigPot', 'card.xiao')).cs;
    cs = walk(walk(cs, 'nursery'), 'depths');
    const r = label2d(cs, -9.0, card('scale:giantRoot', 'card.xiao'));
    const t = play(r.cs, [{ wait: 1 / 30 }]);
    expect([[...r.done, ...t.done], get(t.cs, 'mossW').used, pos(t.cs, 'depths'), t.cs.state.turns!.left]).toEqual([['3-4b'], true, '22', 10]);
  });

  it('錯誤嘗試：巨根貼「大」(長大了、還卡著)；光只穿過一間房 (溫床在天窗下、深處在它東邊) → 說一次；縮了根 (苔窗露出) 但光還沒排 → 暗', () => {
    let cs = after34a();
    cs = label2d(cs, -9.0, card('scale:giantRoot', 'card.da')).cs;
    expect([cs.world.msg, +get(cs, 'giantRoot').def.w.toFixed(2), dialBlocked(cs, T('c8', 'W')), [...sessionUncovered(cs)]]).toEqual(['量過了。它照著刻度，長大了。', 4.2, 'jammed', []]);
    // 「小」已在巨根上 (深處鬆開)：溫床在 [0,0]、深處 [1,1] → 深處 ▲ (到 [1,0])：光從溫床的稜鏡往東進西窗，只穿過一間房
    const done = [snap('lattice'), snap('paneFrame'), snap('latticeBox', { gone: true })];
    cs = open({ nursery: '01', night: '12', gallery: '21', bed: '00', depths: '11' }, { labels: { 'scale:giantRoot': ['card.xiao'] }, depthsObjs: done });
    runScript(cs.world, [...to3d(cs.world), { walkTo: [-9.0, 0.6] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([cs.world.msg, sensorLight(cs.world, get(cs, 'mossW')), [...sessionUncovered(cs)]]).toEqual(['苔蘚蓋著的窗露出來了，窗後面暗暗的。', 'dark', ['depths.W']]);
    const w = turns(cs, [T('c4', 'N')]);
    expect([w.done, sensorLight(w.cs.world, get(w.cs, 'mossW')), w.cs.world.msg]).toEqual([[], 'weak', '光只穿過一間房。苔蘚亮了一下，又暗了。']);
  });

  it('閂住後 stayShrunk：「小」取回、貼回巨盆 → 巨根仍縮著 (深處不卡、苔窗照樣露出)、夜溫室鬆開', () => {
    let cs = shrinkFirst(after34a()).cs;
    cs = label2d(cs, -9.0, uncard('scale:giantRoot', 'card.xiao')).cs;
    expect([dialBlocked(cs, T('c4', 'S')), get(cs, 'giantRoot').def.w, [...sessionUncovered(cs)], hasItem(cs.world, 'card.xiao')]).toEqual([null, 1.4, ['depths.W'], true]);
    cs = walk(cs, 'nursery'); // 深處 [1,1] 北拱門 ↔ 苗圃 [1,0] 南拱門
    cs = walk(cs, 'night');
    cs = label2d(cs, 0, card('scale:bigPot', 'card.xiao')).cs;
    // 夜溫室鬆開：轉動檢查過了卡榫，只剩旁邊沒有空格 (卡榫在魔方本身的檢查之前)
    expect([dialBlocked(cs, T('c0', 'E')), hasItem(cs.world, 'card.xiao')]).toEqual(['notEmpty', false]);
  });

  it('R：3-4b 在本次進房後完成 → R：苔窗退回、「小」回到進房時的位置 (手上)、深處又卡住、墨 = 進房時', () => {
    const cs = shrinkFirst(after34a()).cs;
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([get(back, 'mossW').used, get(back, 'giantRoot').used, back.state.labels['scale:giantRoot'], hasItem(back.world, 'card.xiao'), dialBlocked(back, T('c8', 'W')), pos(back, 'depths')])
      .toEqual([false, false, undefined, true, 'jammed', '22']);
  });
});

describe('章門：鑰匙、第三章通關', () => {
  it('沒有鑰匙 = 鎖著；有鑰匙、深處在 [2,2] → 打開 = 第三章通關 (3-4b 是擴充題，不擋章門)；cs:ch3 不做 (沒有「前往」)', () => {
    const locked = open(SOLVED);
    runScript(locked.world, [{ place: [61.0, 0, 4.0] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([locked.world.msg, locked.world.cleared]).toEqual(['門鎖著。鑰匙孔是銅的。', false]);
    const cs = after34a();
    runScript(cs.world, [...to3d(cs.world), { place: [61.0, 0, 4.0] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([cs.world.cleared, get(cs, 'mossW').used, nextAfterClear('3-4', 'chapter', CHAPTERS)]).toEqual([true, false, null]);
  });
});

// ── 追逐 1 (N19；規格 4.2 測試策略 ①～⑥ + 走回主室 / R 不重演 / 預兆 ≥ 3 秒) ──
/** 切換 (含 app 的 0.3 秒墨色過場；腳本裡世界照常推進 = 比實際嚴格：app 的過場中殘影不動) */
const FLIP3: Cmd[] = [{ act: 'flip' }, { wait: 0.3 }];
/** 從北拱門內側走到柵門前 (實景，z 0) */
const TO_GATE: Cmd[] = [{ walkTo: [null, 0] }, { walkTo: [11.5, null] }];
/** 交替切換穿過長廊：實景過墨牆 24 → 藏寶圖過鐵柵 31 → 實景過墨牆 38 → 藏寶圖過鐵柵 45 → 實景過墨牆 52 → 藏寶圖過鐵柵 59、過終點 60.5 */
const RUN: Cmd[] = [
  { walkTo: [27, null] }, ...FLIP3, { walkTo: [34.5, null] }, ...FLIP3, { walkTo: [41, null] }, ...FLIP3,
  { walkTo: [48.5, null] }, ...FLIP3, { walkTo: [55, null] }, ...FLIP3, { walkTo: [61.0, null] }
];
/** 章門 (實景、長廊盡頭南側) */
const DOOR: Cmd[] = [...FLIP3, { walkTo: [61.0, 4.0] }, { wait: 0.1 }, { act: 'interact' }];
const CALM = { ...OPTS, calm: true };
interface Pose { x: number; y: number; z: number; vy: number; mode: string }
interface ChaseLog { xs: number[]; events: string[]; gateAt: number | null; endAt: number | null; caughtAt: Pose[] }
/** 跑腳本並逐幀記下殘影位置、追逐事件 (不取走：pump 照常交給章節層)、過柵門與抵達終點的模擬時間、被追上那一幀的玩家 */
function chaseScript(cs: ChapterSession, cmds: Cmd[]): { cs: ChapterSession; log: ChaseLog } {
  const o = get(cs, 'chaser');
  const log: ChaseLog = { xs: [], events: [], gateAt: null, endAt: null, caughtAt: [] };
  let seen = cs.world.events.length;
  runScript(cs.world, cmds, {
    onFrame: w => {
      log.xs.push(+o.x.toFixed(6));
      for (const e of w.events.slice(seen)) {
        if (e.t !== 'chase') continue;
        log.events.push(e.s);
        const p = w.player;
        if (e.s === 'caught') log.caughtAt.push({ x: p.x, y: p.y, z: p.z, vy: p.vy, mode: p.mode });
        if (e.s === 'end' || e.s === 'autoPass') log.endAt = w.time;
      }
      seen = w.events.length;
      if (log.gateAt === null && w.player.x > 12.2) log.gateAt = w.time;
    }
  });
  return { cs: pump(cs).cs, log };
}

describe('追逐 1 (N19，不計題)：守衛殘影、長廊、預兆 / 被追上 / 終點', () => {
  it('資料：殘影只在藏寶圖、不擋路、不可互動、不進快照 (derived)；預兆線 13 / 觸發線 19 / 終點 60.5、出生點 12.0 (落後 6.4)、檢查點 (14, 0, 0)、速度 2.6、3 次後 ×0.8、預兆 3 秒；3-4a 之前柵門關著 = 不追', () => {
    const c = def('chaser');
    expect(c.type === 'chaser' && [c.visible, c.solid, !!c.interactable, c.derived, c.omenX, c.triggerX, c.endX, c.resetX, c.spawnX, c.checkpoint, c.speed, c.assistAfter, c.assistFactor, c.omenSec, c.gate, c.flag, +(c.triggerX - c.spawnX - c.w).toFixed(2)])
      .toEqual(['2d', false, false, true, 13, 19, 60.5, 12.5, 12.0, { x: 14, y: 0, z: 0 }, 2.6, 3, 0.8, 3, 'chaseGate', 'chase:3-4', 6.4]);
    const cs = open(SOLVED);
    runScript(cs.world, [{ place: [13.5, 0, 0], mode: '2d' }, { wait: 4 }]); // 柵門關著 (瞬移到長廊裡)：殘影不動
    expect([chaseRun(get(cs, 'chaser')).phase, get(cs, 'chaser').used, captureState(cs).rooms.depths.objs.some(s => s.id === 'chaser')]).toEqual(['idle', false, false]);
  });

  it('① 交替切換的成功路徑必過 (柵門 → 終點約 16 秒、預兆 ≥ 3 秒)；章節旗標 chase:3-4 (寫進 entry：R 不重演)、殘影離場；之後章門 = 第三章通關', () => {
    let cs = play(after34a(), TO_GATE).cs;
    const r = chaseScript(cs, RUN);
    cs = r.cs;
    const o = get(cs, 'chaser');
    expect(r.log.events).toEqual(['omen', 'start', 'end']);
    const secs = +(r.log.endAt! - r.log.gateAt!).toFixed(1);
    expect([secs >= 15 && secs <= 20, secs]).toEqual([true, 17.3]);
    expect([chaseRun(o).phase, o.used, cs.state.flags.includes('chase:3-4'), cs.entry.flags.includes('chase:3-4'), chaseRun(o).startAt - chaseRun(o).omenAt >= 3]).toEqual(['done', false, true, true, true]);
    // 殘影一直在玩家身後
    expect(Math.max(...r.log.xs)).toBeLessThan(50);
    runScript(cs.world, DOOR);
    expect([cs.world.cleared, cs.world.msg, get(cs, 'chapterS').used]).toEqual([true, '門開了。', true]);
  });

  it('② 一直待在藏寶圖：卡在第一道墨牆、被追上 → 「圖面一皺」、回檢查點 (14, 0, 0；速度清零、還是藏寶圖)、殘影消失；旗標、道具、花窗、柵門、排列都不變；不計失敗', () => {
    let cs = play(after34a(), [...TO_GATE, ...FLIP3]).cs;
    const before = { inv: { ...cs.world.inv }, cube: JSON.stringify(cs.state.cube), flags: [...cs.state.flags] };
    const r = chaseScript(cs, [{ hold: { moveX: 1 }, seconds: 8 }]);
    cs = r.cs;
    const o = get(cs, 'chaser');
    expect(r.log.events).toEqual(['omen', 'start', 'caught']);
    expect(r.log.caughtAt).toEqual([{ x: 14, y: 0, z: 0, vy: 0, mode: '2d' }]);
    expect([chaseRun(o).caught, chaseRun(o).phase, o.used, o.x, cs.world.msg]).toEqual([1, 'wait', false, 12, '圖面一皺。你回到了長廊的起點。']);
    expect([cs.world.inv, JSON.stringify(cs.state.cube), cs.state.flags, get(cs, 'lattice').used, isPassable(cs.world, get(cs, 'chaseGate'))]).toEqual([before.inv, before.cube, before.flags, true, true]);
    // 再過一次觸發線就重新起跑 (不再等預兆)
    const again = chaseScript(cs, [{ walkTo: [19.2, null] }]);
    expect([again.log.events, chaseRun(o).phase, o.used]).toEqual([['start'], 'run', true]);
  });

  it('③ 確定性：同一串輸入兩次 → 殘影逐幀位置相同 (含被追上與重置)', () => {
    const cmds: Cmd[] = [...TO_GATE, { walkTo: [27, null] }, ...FLIP3, { walkTo: [33, null] }, { hold: { moveX: 1 }, seconds: 9 }, { walkTo: [12.0, null] }, { walkTo: [20, null] }];
    const a = chaseScript(after34a(), cmds).log, b = chaseScript(after34a(), cmds).log;
    expect(a.xs.length).toBeGreaterThan(1000);
    expect(a.xs).toEqual(b.xs);
    expect(a.events).toEqual(b.events);
    expect(a.events).toEqual(['omen', 'start', 'caught', 'start', 'caught', 'reset', 'omen']);
  });

  it('④ 減弱緊張效果 (Runtime.calm)：過預兆線即 chase:3-4 + autoPass、殘影從不出現；鐵柵 / 墨牆照樣在 (要切換)', () => {
    let cs = openChapter(SPEC, captureState(after34a()), CALM);
    expect(cs.world.rt.calm).toBe(true);
    const r = chaseScript(cs, [...TO_GATE, { walkTo: [13.2, null] }]);
    cs = r.cs;
    expect([r.log.events, cs.state.flags.includes('chase:3-4'), chaseRun(get(cs, 'chaser')).phase]).toEqual([['autoPass'], true, 'done']);
    let used = false;
    runScript(cs.world, [{ hold: { moveX: 1 }, seconds: 8 }], { onFrame: w => { used ||= w.byId.get('chaser')!.used; } });
    // 實景：墨牆只在藏寶圖 → 走過 24，停在鐵柵 31 之前
    expect([used, +cs.world.player.x.toFixed(2), cs.world.player.mode]).toEqual([false, 30.55, '3d']);
  });

  it('⑤ 同一段被追上 3 次後殘影速度 ×0.8 = 2.08 (確定性計數；R 重算)', () => {
    const cs = play(after34a(), [...TO_GATE, ...FLIP3]).cs;
    const o = get(cs, 'chaser');
    const r = chaseScript(cs, [{ hold: { moveX: 1 }, seconds: 21 }]);
    expect([r.log.events.filter(e => e === 'caught').length, chaserSpeed(o)]).toEqual([3, 2.08]);
    // 第 4 段：每幀前進 2.08 / 60
    const xs: number[] = [];
    runScript(cs.world, [{ walkTo: [19.5, null] }, { wait: 1 }], { onFrame: () => xs.push(o.x) });
    const d = xs[xs.length - 1] - xs[xs.length - 2];
    expect([+(d * 60).toFixed(4), chaseRun(o).caught]).toEqual([2.08, 3]);
    const fresh = restartRoom(r.cs, OPTS);
    expect([chaserSpeed(get(fresh, 'chaser')), chaseRun(get(fresh, 'chaser')).caught]).toEqual([2.6, 0]);
  });

  it('中途走回主室 (x < 12.5) = 本段重置 (殘影淡出、不計失敗)；再進長廊重新預兆；R 不重演已完成的追逐；預兆期間殘影站在出生點不動', () => {
    let cs = play(after34a(), TO_GATE).cs;
    const o = get(cs, 'chaser');
    const omenXs: number[] = [];
    runScript(cs.world, [{ walkTo: [14, null] }, { wait: 1 }], { onFrame: () => omenXs.push(o.x) });
    expect([chaseRun(o).phase, o.used, new Set(omenXs.slice(-30)).size]).toEqual(['omen', true, 1]);
    const back = chaseScript(cs, [{ walkTo: [11.0, null] }]);
    expect([back.log.events, chaseRun(o).phase, o.used, chaseRun(o).caught]).toEqual([['reset'], 'idle', false, 0]);
    cs = chaseScript(back.cs, [{ walkTo: [11.5, null] }, ...RUN]).cs;
    expect(cs.state.flags.includes('chase:3-4')).toBe(true);
    const r = restartRoom(cs, OPTS);
    const replay = chaseScript(r, [...TO_GATE, { walkTo: [22, null] }]);
    expect([replay.log.events, chaseRun(get(r, 'chaser')).phase, isPassable(r.world, get(r, 'chaseGate'))]).toEqual([[], 'done', true]);
  });

  it('⑥ 加入長廊後：3-4a / 3-4b 的腳本照樣成立；人在主室時殘影一直不動 (追逐不在任何謎題的 area 裡)；validateLevel 0 issue', () => {
    const a = after34a();
    expect([chaseRun(get(a, 'chaser')).phase, get(a, 'chaser').used]).toEqual(['idle', false]);
    const b = shrinkFirst(a);
    expect(b.done).toEqual(['3-4b']);
    expect(chaseRun(get(b.cs, 'chaser')).phase).toBe('idle');
    expect(validateLevel(depths, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
  });
});

describe('章門 = 第三章通關 (記入 3-1～3-4；第四章占位)', () => {
  it('追逐 → 章門：記入 3-1～3-4、手記第三頁進存檔、章末文字、沒有「前往」(nextAfterClear = null)、cs:ch3 不觸發；選單 3-1～3-4 = cleared', () => {
    let cs = play(after34a(), TO_GATE).cs;
    cs = chaseScript(cs, [...RUN, ...DOOR]).cs;
    expect(cs.world.cleared).toBe(true);
    const save = recordClear({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4', '2-5'], abilities: ['nib', 'scale'] }, '3-4', cs.world, Object.keys(CH3.levels));
    expect([save.cleared.slice(-4), save.current, save.diary, TEXT(depths.nextKey), nextAfterClear('3-4', 'chapter', CHAPTERS)])
      .toEqual([['3-1', '3-2', '3-3', '3-4'], '3-4', [3], '溫室往下沉了。第四章　地下室——還在路上。', null]);
    expect(['3-1', '3-2', '3-3', '3-4'].map(id => levelState(levelById(id)!, save))).toEqual(['cleared', 'cleared', 'cleared', 'cleared']);
    expect([CUTSCENES.some(c => c.id === 'cs:ch3'), cutsceneBeforeLevel(save, '3-4')]).toEqual([false, undefined]);
  });

  it('房間通關與章通關不互相蓋掉：3-4a、3-4b 都完成 (章門還沒開) → 深處不算房間通關 (章門列在 puzzles 最後)；章門打開 → world.cleared (外殼不再另送房間通關)；3-4b 沒做也能通關', () => {
    const b = shrinkFirst(after34a());
    expect([b.done, clearedRooms(SPEC, b.cs.state, b.cs.world).includes('depths')]).toEqual([['3-4b'], false]);
    let cs = play(after34a(), TO_GATE).cs;
    cs = chaseScript(cs, [...RUN, ...DOOR]).cs;
    expect([cs.world.cleared, get(cs, 'mossW').used, clearedRooms(SPEC, cs.state, cs.world).includes('depths')]).toEqual([true, false, false]);
  });

  it('存檔：通關後重開 → 接著第三章存檔 (深處、章門開過、chase:3-4、殘影不再追、花窗亮、鑰匙)；殘影不進快照；實作一的舊快照 (柵門 used 缺) 照常開：柵門開、殘影 idle', () => {
    let cs = play(after34a(), TO_GATE).cs;
    cs = chaseScript(cs, [...RUN, ...DOOR]).cs;
    const store = memoryStorage();
    writeSave(store, withChapter(recordClear({ ...defaultSave(), cleared: ['2-5', '3-1', '3-2', '3-3'], abilities: ['nib', 'scale'] }, '3-4', cs.world, Object.keys(CH3.levels)), captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH3.start), OPTS);
    const r = chaseScript(back, [{ wait: 1 / 30 }, { walkTo: [56, null] }]);
    expect([back.state.room, get(back, 'chapterS').used, back.state.flags.includes('chase:3-4'), r.log.events, get(back, 'lattice').used, hasItem(back.world, 'key.greenhouse')])
      .toEqual(['depths', true, true, [], true, true]);
    expect(captureState(back).rooms.depths.objs.some(s => s.id === 'chaser')).toBe(false);
    const old = stateAt(L_SHAPE, { depthsObjs: [snap('paneFrame'), snap('lattice'), snap('latticeBox', { gone: true }), snap('chaseGate', { used: false })], items: { 'key.greenhouse': 1, 'diary.3': 1, 'card.da': 1 } });
    const o = openChapter(SPEC, old, OPTS);
    runScript(o.world, [{ wait: 1 / 30 }]);
    expect([isPassable(o.world, get(o, 'chaseGate')), get(o, 'chaseGate').used, chaseRun(get(o, 'chaser')).phase]).toEqual([true, true, 'idle']);
  });
});

describe('音效：柵門打開 (USED_ON chaseGate)', () => {
  it('LevelObserver：chaseGate used → sfx.gate.open (花窗亮的那一刻同時打開)；殘影 (chaser) 本身沒有狀態差的聲音', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'depths', mode: '2d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('g', 'chaseGate', false), o('c', 'chaser', false)]));
    const out = obs.update(s([o('g', 'chaseGate', true), o('c', 'chaser', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.gate.open']);
  });
});

describe('反例：只用 2D / 只用 3D、盲轉取樣', () => {
  it('只用 2D：花窗架與抽屜只在實景按得到、門只在實景穿得過；只用 3D：標籤只在藏寶圖 (巨根)、轉動模式只在藏寶圖', () => {
    const cs = open(SOLVED);
    // 藏寶圖裡高台 (1.9) 擋在北拱門與花窗架之間：直接站到花窗架前
    runScript(cs.world, [{ place: [4.0, 0, -3.6], mode: '2d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([cs.world.player.mode, findTarget(cs.world)?.def.id ?? null, get(cs, 'paneFrame').used]).toEqual(['2d', null, false]);
    runScript(cs.world, [{ walkTo: [4.6, null] }, { wait: 0.1 }, { act: 'interact' }]);
    expect([findTarget(cs.world)?.def.id ?? null, get(cs, 'paneFrame').used]).toEqual([null, false]);
    const a = after34a();
    runScript(a.world, [...to3d(a.world), { walkTo: [-9.0, 0.6] }, { wait: 0.1 }]);
    expect([labelTarget(a.world), turnModeDenied(a.world)]).toEqual([null, 'not2d']);
    runScript(a.world, [...FLIP, { walkTo: [0, null] }, { wait: 0.1 }]);
    expect(findTarget(a.world)?.def.id ?? null).toBe('oldCompass'); // 北拱門只在實景按：藏寶圖裡最近的是舊羅盤架 (資訊物件)
  });

  const opts = CH3_CUBE.dial!.groups.flatMap(g => turnDirs(CH3_CUBE, g.id).map(dir => ({ group: g.id, dir })));
  const legal = (s: CubeState, jam: string[]) => opts.map(o => {
    const cells = cellsOf(CH3_CUBE, s, o.group);
    if (jam.some(r => cells.some(c => sameCell(c, s.pos[r])))) return null;
    const n = applyTurn(CH3_CUBE, s, o);
    return isBlocked(n) ? null : n;
  }).filter((x): x is CubeState => x !== null);
  const rate = (from: CubeState, ink: number, jam: string[], goal: (s: CubeState) => boolean) => {
    let seed = 2468;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    let wins = 0;
    for (let n = 0; n < 1000; n++) { let s = from; for (let k = 0; k < ink; k++) { const L = legal(s, jam); s = L[Math.floor(rnd() * L.length)]; if (goal(s)) { wins++; break; } } }
    return wins / 1000;
  };
  const patternOk = (s: CubeState) => s.pos.nursery[0] === 1 && s.pos.nursery[1] === 2 && !Object.values(s.pos).some(c => c[0] === 0 && c[1] < 2);
  const latticeGoal = (s: CubeState) => patternOk(s) && lightState(lightPaths(CH3_CUBE, s).hits.depths ?? [], 'N', 3) === 'lit';
  const mossGoal = (s: CubeState) => lightState(lightPaths(CH3_CUBE, s, new Set(['depths.W'])).hits.depths ?? [], 'W', 2) === 'lit';
  it('3-4a (盲轉 8 步)：從 L 形起點 < 1%、從 S0 = 0；3-4b 卡已在巨根上 (夜溫室卡住) 隨機轉 8 步 < 1%；不拿卡 (深處一直卡著) = 0', () => {
    const fromL = rate(cubeOf(L_SHAPE), 8, ['depths'], latticeGoal), fromS0 = rate(cubeOf(S0), 8, ['depths'], latticeGoal);
    const moss = rate(cubeOf(SOLVED), 8, ['night'], mossGoal), noCard = rate(cubeOf(SOLVED), 8, ['depths'], s => mossGoal(s) && false);
    expect([fromL, fromS0, moss < 0.01, noCard]).toEqual([0.004, 0, true, 0]);
  });
  it('3-4a (盲轉 10 步 = 深處預算 10)：從 L 形起點 0.001、從 S0 0；3-4b 卡已在巨根上隨機轉 10 步 0.014 (< 2%)', () => {
    const fromL = rate(cubeOf(L_SHAPE), 10, ['depths'], latticeGoal), fromS0 = rate(cubeOf(S0), 10, ['depths'], latticeGoal);
    const moss = rate(cubeOf(SOLVED), 10, ['night'], mossGoal);
    expect([fromL, fromS0, moss]).toEqual([0.001, 0, 0.014]);
  });
});

describe('存檔、舊存檔相容、展開圖', () => {
  it('存檔往返：3-4a 完成、抽屜拿走 → 寫檔 → 讀回：花窗亮著、柵門開、鑰匙與手記第三頁、巨根的標籤露出', () => {
    const cs = after34a();
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['2-5', '3-1', '3-2', '3-3'], abilities: ['nib', 'scale'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH3.start), OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([back.state.room, get(back, 'lattice').used, get(back, 'latticeBox').gone, isPassable(back.world, get(back, 'chaseGate')), hasItem(back.world, 'key.greenhouse'), hasItem(back.world, 'diary.3')])
      .toEqual(['depths', true, true, true, true, true]);
  });

  it('舊存檔 (3-3 版深處的快照：筆記一頁拿走、章門在舊座標 x 3)：照常開章——只覆寫可推物的位置，新物件取關卡初值、章門在新位置；3-4 開放狀態依 3-3', () => {
    const legacy = {
      cube: { pos: { nursery: [0, 1, 0], night: [1, 1, 0], gallery: [2, 1, 0], bed: [1, 2, 0], depths: [2, 2, 0] }, rot: { nursery: 0, night: 0, gallery: 0, bed: 0, depths: 0 } },
      rooms: { depths: { objs: [{ id: 'pageGarden', x: 1.85, y: 1.9, z: -4.55, gone: true, used: true, touched: false }, { id: 'chapterS', x: 3, y: 0, z: 4.8, gone: false, used: false, touched: false }, { id: 'floor', x: 0, y: -1, z: 0, gone: false, used: false, touched: false }], flags: [] } },
      at: { room: 'depths', door: 'archN' }, items: { 'page.garden': 1 }, flags: [], dial: true
    };
    const store = memoryStorage();
    store.set('puzzle:save', JSON.stringify({ ...defaultSave(), cleared: ['2-5', '3-1'], abilities: ['nib'], chapters: { '3': legacy } }));
    const loaded = loadSave(store);
    const cs = openChapter(SPEC, chapterStart(loaded, SPEC, CH3.start), OPTS);
    runScript(cs.world, [{ wait: 1 / 30 }]);
    expect([cs.state.room, get(cs, 'pageGarden').used, get(cs, 'chapterS').x, get(cs, 'floor').def.w, get(cs, 'lattice').used, get(cs, 'paneFrame').used, dialBlocked(cs, T('c8', 'N'))])
      .toEqual(['depths', true, 61.0, 72, false, false, 'jammed']);
    expect([levelState(levelById('3-4')!, loaded), levelState(levelById('3-4')!, { ...loaded, cleared: ['2-5', '3-1', '3-2', '3-3'] })]).toEqual(['locked', 'open']);
  });

  it('展開圖的光路 (mapLight 的 uncovered)：巨根縮小前，深處的西窗沒有窗記號；縮小後 (「小」在巨根上) 有，光照進西窗', () => {
    const covered = open({ nursery: '01', night: '00', gallery: '21', bed: '01', depths: '11' } as Layout);
    const m0 = deriveCubeMap(covered, TEXT)!;
    expect(m0.light!.glass.some(g => g.x === 1 && g.y === 1 && g.side === 'W')).toBe(false);
    const free = open({ nursery: '10', night: '00', gallery: '21', bed: '01', depths: '11' }, { labels: { 'scale:giantRoot': ['card.xiao'] } });
    const m1 = deriveCubeMap(free, TEXT)!;
    expect([m1.light!.glass.some(g => g.x === 1 && g.y === 1 && g.side === 'W'), m1.light!.stops.some(s => s.kind === 'room' && s.x > 1 && s.x < 2 && s.y > 1 && s.y < 2), sensorLight(free.world, get(free, 'mossW'))])
      .toEqual([true, true, 'lit']);
  });
});

describe('音效 (USED_ON)：花窗架、花窗', () => {
  it('LevelObserver：paneFrame → 卡榫打開、lattice → 亮燈；苔窗沿用 sensor；SCARE_SFX 不加', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'depths', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('a', 'paneFrame', false), o('b', 'lattice', false), o('c', 'sensor', false)]));
    const out = obs.update(s([o('a', 'paneFrame', true), o('b', 'lattice', true), o('c', 'sensor', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.latch.open', 'sfx.lamp.on', 'sfx.lamp.on']);
    expect(Object.keys(SCARE_SFX)).toEqual(['scare:coats', 'scare:handprint']);
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = depths.objects.filter(o => o.type === 'note');
describe('3-4 字條：兩題各 L1 + L2 (L2 空白，4 分鐘浮現)', () => {
  it('原文 (story-bible 7.3)；落地木柱；H1 / H2 / H3 / H4 / H10；間距 ≥ 3、任一 16 單位寬的畫面 ≤ 3 張', () => {
    expect(notes.map(o => [o.id, o.x, noteText(o), o.type === 'note' && o.mount, o.type === 'note' && o.revealAfter])).toEqual([
      ['noteB', -6.2, '家裡只有一把傘。借給了你，我就得淋雨。', 'post', undefined],
      ['noteB2', -3.0, '苔窗朝著哪一邊？那一邊此刻接著誰？', 'post', 240],
      ['noteA', 6.8, '爸爸畫窗的時候，總會留白給月亮。', 'post', undefined],
      ['noteA2', 10.6, '月亮來到這扇窗以前，經過了誰家的屋頂？', 'post', 240]
    ]);
    for (const o of notes) {
      const t = noteText(o);
      expect([o.id, [...t].length <= (o.type === 'note' && o.revealAfter ? 30 : 24)]).toEqual([o.id, true]);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t)).toBe(false);
    }
    const AHA = ['大', '小', '縮', '放大', '重', '光', '玻璃', '照', '稜鏡', '轉彎', '轉', '滑', '空格', '排列', '對齊', '一起', '跟著', '軌道', '卡'];
    const KEYS = ['苗圃', '夜溫室', '溫床', '玻璃長廊', '長廊', '園丁羅盤', '控制盤', '彩繪玻璃', '花窗玻璃片', '尺度卡', '巨盆'];
    for (const o of notes) for (const term of [...AHA, ...KEYS]) expect([o.id, term, noteText(o).includes(term)]).toEqual([o.id, term, false]);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
  });

  it('兩個視角都讀得到；L2 一開始是空白，進房 240 秒浮現', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = createWorld(depths, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : noteText(o));
    }
    const w = createWorld(depths, OPTS);
    runScript(w, [{ wait: 241 }, { place: [-3.0, 0, 3.4] }]);
    interact(w);
    expect(w.msg).toBe('苔窗朝著哪一邊？那一邊此刻接著誰？');
    const c = createWorld(depths, OPTS);
    runScript(c, [{ place: [-0.6, 0, 1.6] }, { wait: 0.1 }]);
    interact(c);
    expect(c.msg).toBe('一座舊的羅盤架。盤面不見了，把手磨得發亮。');
  });
});

describe('捷徑掃描 (三個尺度檔 × 站位 × 兩模式 × 探針)', () => {
  it('溫室深處 (沒有玻璃片、標籤上大 / 小 / 無)：花窗不亮、苔窗不閂、抽屜 / 鑰匙拿不到、章門不開、進不了長廊', () => {
    for (const tier of [[], ['card.da'], ['card.xiao']]) {
      const r = scanShortcuts({
        level: depths, mechanics: DEFAULT_MECHANICS, text: TEXT,
        setup: w => { w.ext = { labels: tier.length ? { 'scale:giantRoot': tier } : {} }; },
        movable: [],
        playerAt: [{ x: -1.5, y: 0, z: 1.5 }, { x: 4.0, y: 0, z: -3.6 }, { x: -9.0, y: 0, z: 0.6 }, { x: 11.5, y: 0, z: 0 }, { x: 11.5, y: 0, z: 4.4 }],
        probes: [
          [{ hop: 1, until: () => false, seconds: 2.5, optional: true }], [{ hold: { moveX: 1, jump: true }, seconds: 2.5 }],
          [{ act: 'interact' }, { act: 'flip' }, { wait: 0.2 }, { act: 'interact' }],
          [{ act: 'flip' }, { wait: 0.2 }, { hold: { moveX: 1, jump: true }, seconds: 2 }, { act: 'flip' }, { wait: 0.2 }, { hold: { moveX: 1 }, seconds: 1 }]
        ],
        forbidden: ['used:lattice', 'used:mossW', 'used:paneFrame', 'item:key.greenhouse', 'used:chapterS', { id: 'corridor', holds: (w: World) => w.player.x > 12.4 }, { id: 'chaser', holds: (w: World) => w.byId.get('chaser')!.used }]
      });
      expect([tier, r.hits, r.runs > 0]).toEqual([tier, [], true]);
    }
  });
});
