// 3-3 夜溫室 (規格 6「3-3 夜溫室（細化）」；第三章第三關)：資料與驗證器、擺設深度帶、高度與距離 (D10)、3-3 區 validateDial (CH3_ZONE33；拿掉量 / 對齊)、
// 跨房天平 (ChapterSpec.derive → ext.balance)、驚嚇與巨盆被推進軌道、跨房伸出 (ext.protrude、推導實體、兩房都卡住)、樹根縮回土裡 (stayShrunk)、
// 通關腳本 (每題兩種解法)、錯誤嘗試、反例 (只用 2D / 只用 3D；盲轉取樣)、R、存檔讀檔與舊存檔、音效、字條規則、捷徑掃描取樣
import { describe, it, expect } from 'vitest';
import { night } from '../../../src/puzzle/content/levels/ch3/3-3-night';
import { nursery } from '../../../src/puzzle/content/levels/ch3/3-1-nursery';
import { depths } from '../../../src/puzzle/content/levels/ch3/rooms';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH3_CUBE, CH3_ZONE33 } from '../../../src/puzzle/content/cubes/ch3';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { labelTarget } from '../../../src/puzzle/mechanics/labels';
import { halfTilt } from '../../../src/puzzle/mechanics/balance';
import { sensorLight } from '../../../src/puzzle/mechanics/light';
import { turnModeDenied } from '../../../src/puzzle/mechanics/dial';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { GRAVITY, INTERACT_RANGE, JUMP_V_2D, JUMP_V_3D } from '../../../src/puzzle/core/constants';
import { applyTurn, cellsOf, isBlocked, links, sameCell, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, clearedRooms, dialBlocked, enterRoom, lightPaths, lightState, openChapter, restartRoom, roomCleared, type ChapterSession
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef, World } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear } from '../../../src/puzzle/meta/progress';
import { LevelObserver, SCARE_SFX, type LevelSnap } from '../../../src/puzzle/audio/events';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts } from '../../../src/puzzle/devtools/shortcutScan';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
const SPEC = chapterSpecOf(CH3);
const def = (id: string): ObjDef => night.objects.find(o => o.id === id)!;
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };

/** 取走事件交給章節層 (同 LevelSession)；換房後同批事件丟棄 */
function pump(cs: ChapterSession): { cs: ChapterSession; kinds: string[]; done: string[]; flags: string[] } {
  const kinds: string[] = [];
  const done: string[] = [];
  const flags: string[] = [];
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    if (e.t === 'done') done.push(e.flag);
    if (e.t === 'flag') flags.push(e.flag);
    const r = applyChapterEvent(cs, e, OPTS);
    kinds.push(r.kind);
    if (r.kind === 'enter') return { cs: r.next, kinds, done, flags };
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return { cs, kinds, done, flags };
}
const play = (cs: ChapterSession, cmds: Cmd[]) => { runScript(cs.world, cmds); return pump(cs); };
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH3.start), OPTS);
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });
const FLIP: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];
const to3d = (w: World): Cmd[] => (w.player.mode === '2d' ? FLIP : []);
const to2d = (w: World): Cmd[] => (w.player.mode === '3d' ? FLIP : []);
/** 藏寶圖裡走到 x */
const WALK2D = (x: number): Cmd[] => [{ walkTo: [x, null] }, { wait: 0.1 }];
/** 轉動 (控制盤；藏寶圖裡) 後走一步：機制讀到新的連接 / 光 */
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
const label2d = (cs: ChapterSession, x: number, cmd: Cmd) => play(cs, [...to2d(cs.world), ...WALK2D(x), cmd, { wait: 1 / 30 }]);
/** 實景走到 (x, z) 按 E 穿門 (先走 z 再走 x，或反過來) */
const door3d = (cs: ChapterSession, x: number, z: number, zFirst = true) =>
  play(cs, [...to3d(cs.world), { wait: 0.1 }, ...(zFirst ? [{ walkTo: [null, z] as [null, number] }, { walkTo: [x, null] as [number, null] }] : [{ walkTo: [x, null] as [number, null] }, { walkTo: [null, z] as [null, number] }]), { walkTo: [x, z] }, { act: 'interact' }]);

// ── 3-1 (前置；同 levels/3-1)：啟動羅盤 → 比例尺 → 西盆「大」→ 樹根「小」→ 苗圃 ▲ ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-3.6, -2.8] }, { act: 'interact' }];
const RULER: Cmd[] = [{ wait: 0.1 }, { walkTo: [-5.3, -1.7] }, { act: 'interact' }];
function after31(): ChapterSession {
  let cs = play(play(start(), ACTIVATE).cs, RULER).cs;
  cs = play(cs, [{ wait: 0.1 }, { walkTo: [null, 0.6] }, { walkTo: [0.4, null] }, ...FLIP, card('scale:potW', 'card.da')]).cs;
  cs = label2d(cs, 7.2, card('scale:root', 'card.xiao')).cs;
  const r = turns(cs, [T('c3', 'N')]);
  expect([pos(r.cs, 'nursery'), r.done, hasItem(r.cs.world, 'card.da'), hasItem(r.cs.world, 'card.xiao')]).toEqual(['00', ['3-1b'], false, false]);
  return r.cs;
}
/** 苗圃 → 夜溫室：苗圃南拱門 (苗圃在夜溫室正上方) / 東拱門 (S0 那樣並排) */
const nurseryToNightS = (cs: ChapterSession) => door3d(cs, 2.3, 4.45);
const nightToNurseryN = (cs: ChapterSession) => door3d(cs, -3.0, -4.45, false);
/** 3-3a 解法一：苗圃 ▶ (苗圃 [1,0] 在夜溫室 [1,1] 正上方)、取回西盆的「大」貼到苗圃南拱門的陶盆 (3 = 3) */
function solveA1(cs: ChapterSession): { cs: ChapterSession; done: string[] } {
  cs = turns(cs, [T('c0', 'E')]).cs;
  cs = label2d(cs, 0.4, uncard('scale:potW', 'card.da')).cs;
  const r = label2d(cs, 3.3, card('scale:potS', 'card.da'));
  return { cs: r.cs, done: r.done };
}
/** 3-3a 解法二：夜溫室 ◀ (夜溫室 [0,1] 在苗圃 [0,0] 正下方)、取下樹根的「小」(縮回土裡、苗圃不再卡住)、走進夜溫室貼到這裡的陶盆 (1 + 1 = 2) */
function solveA2(cs: ChapterSession): { cs: ChapterSession; done: string[] } {
  cs = turns(cs, [T('c4', 'W')]).cs;
  cs = label2d(cs, 7.2, uncard('scale:root', 'card.xiao')).cs;
  cs = nurseryToNightS(cs).cs;
  expect([cs.state.room, cs.state.door]).toEqual(['night', 'archN']);
  const r = label2d(cs, -3.25, card('scale:potN', 'card.xiao'));
  return { cs: r.cs, done: r.done };
}
/** 驚嚇：人在夜溫室、3-3a 之後安靜 2.5 秒 → 巨盆被推進北邊的軌道 */
function waitPush(cs: ChapterSession): { cs: ChapterSession; flags: string[] } {
  const r = play(cs, [{ wait: 3.0 }]);
  return { cs: r.cs, flags: r.flags };
}

describe('3-3 夜溫室：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 3-3a / 3-3b / 3-3c；登錄表 3-3 (前置 3-1)、房間 night；旁白 / 通關文字 (story-bible 7.3)；墨 8、3-3b 4', () => {
    expect(validateLevel(night, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateLevel(depths, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('3-3')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(night.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['3-3a 隔牆的天平', '3-3b 墨只夠四步', '3-3c 故意卡住']);
    expect([levelById('3-3')!.unlock.after, levelById('3-3')!.chapter, CH3.levels['3-3'], CH3.rooms.night, night.turnBudget, night.bounds, night.theme])
      .toEqual([['3-1'], 3, 'night', night, { base: 8, puzzles: { '3-3b': 4 } }, { minX: -12, maxX: 12, minZ: -5, maxZ: 5 }, 'greenhouseNight']);
    expect([TEXT(night.titleKey), TEXT(night.narrationKey), TEXT(night.nextKey), nextAfterClear('3-3', 'room', CHAPTERS)]).toEqual(['夜溫室', '燈熄了，有一個影子沒跟著走。', '秤停在正中間。燈沒亮，花卻開了。', '3-3']);
  });

  it('擺設三帶 (layoutDepthIssues = [])；分帶：後 = 北拱門 / 半座天平 / 陶盆 / 澆水壺 / 玻璃片三 / 巨盆、中 = 東西拱門 / 月下美人、前 = 南拱門 / 陶槽 / 六張字條；擋路的只有地板', () => {
    expect([layoutDepthIssues(night), layoutDepthIssues(depths)]).toEqual([[], []]);
    const band = (z: number) => (z < -2 ? 'back' : z > 2 ? 'front' : 'mid');
    const objs = night.objects.filter(o => o.interactable || o.label);
    expect(Object.fromEntries(['back', 'mid', 'front'].map(b => [b, objs.filter(o => band(o.z) === b).map(o => o.id)]))).toEqual({
      back: ['archN', 'potN', 'can', 'pane3', 'bigPot'], mid: ['archW', 'archE', 'flowerMoon'],
      front: ['archS', 'trough', 'noteB2', 'noteA2', 'noteA', 'noteC', 'noteB', 'noteC2']
    });
    expect(night.objects.filter(o => o.solid).map(o => o.id)).toEqual(['floor']);
    expect(depths.objects.filter(o => o.solid && o.type !== 'floor').map(o => o.id)).toEqual(['ledge', 'chaseGate', 'inkA', 'barsA', 'inkB', 'barsB', 'inkC', 'barsC']); // 3-4 細化：長廊的柵門與六道障礙
  });

  it('高度與距離 (D10)：高台 1.9 > 藏寶圖跳 1.6 + 0.15 / 實景 1.25；陶槽放大 = 0.9 (地板 → 槽頂、槽頂 → 高台都跳得上)；字條與標籤不搶 E；苗圃 potS 與 3-1 東盆分得開', () => {
    const h3 = JUMP_V_3D ** 2 / (2 * GRAVITY), h2 = JUMP_V_2D ** 2 / (2 * GRAVITY);
    const ledge = depths.objects.find(o => o.id === 'ledge')!, trough = def('trough');
    const step = trough.h * 1.5;
    expect([h2 + 0.15 <= ledge.h, h3 + 0.15 <= ledge.h, step + 0.15 <= h3, ledge.h - step + 0.1 <= h3, +step.toFixed(2)]).toEqual([true, true, true, true, 0.9]);
    // 藏寶圖：站在標籤正前時最近的字條 > 互動範圍
    const notes = night.objects.filter(o => o.type === 'note');
    for (const id of ['potN', 'bigPot', 'trough']) {
      const o = def(id);
      const near = Math.min(...notes.map(n => Math.abs(n.x - o.x) - n.w / 2));
      expect([id, near > INTERACT_RANGE]).toEqual([id, true]);
    }
    // 苗圃：站在 3.3 = potS、站在 2.8 = 3-1 東盆 (3-1 的測試不變)；3-1b 字條 (5.2) 不搶
    const w = createWorld(nursery, OPTS);
    for (const [x, id] of [[3.3, 'potS'], [2.8, 'potE'], [0.4, 'potW']] as const) {
      runScript(w, [{ place: [x, 0, 0], mode: '2d' }, { wait: 0.1 }]);
      expect([x, labelTarget(w)?.def.id, findTarget(w)?.def.id ?? null]).toEqual([x, id, null]);
    }
  });
});

describe('validateDial：3-3 區 (CH3_ZONE33)', () => {
  const m = dialModelOf(CH3_ZONE33.cube, CH3.rooms, CH3_ZONE33.puzzles, CH3_ZONE33.start, CH3_ZONE33.finish, { jams: CH3_ZONE33.jams });
  const r = validateDial(m);
  const per = (rep: typeof r) => rep.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues]);
  it('可達排列 360、抽象狀態 < 2×10⁶、有解、卡死 0 (含 R)；預算繞過 = 3-3b (暗房型仍可在苗圃先轉好再走進來；同 2-3b 列為已知)', () => {
    expect([r.arrangements, r.states < 2e6, r.solvable, r.deadlocks, r.issues, r.lockIssues, r.entryIssues]).toEqual([360, true, true, [], [], [], []]);
    expect([r.states, r.needsRestart]).toEqual([98735, 12211]);
    expect(r.budgetBypass).toEqual(['3-3b: doable with < 3 turns per visit to night (refill by changing rooms)']);
  });
  it('每題 (最短 / 次短 / 序列 / 本質不同 / 預算)：3-3a 1 / 1 / 96 / 34 / 8；3-3b 3 / 3 / 6 / 4 / 4 (預算 = 3 + 1)；3-3c.grow 6 / 6 / 23 / 12 / 8', () => {
    expect(per(r)).toEqual([
      ['3-1b.shrink', 0, null, 1, 1, 8, []], ['3-1b', 1, 2, 22, 16, 8, []], ['3-3a', 1, 1, 96, 34, 8, []], ['3-3b.shrink', 0, null, 1, 1, 8, []],
      ['3-3b', 3, 3, 6, 4, 4, []], ['3-3c.grow', 6, 6, 23, 12, 8, []], ['3-3c', 0, null, 1, 1, 8, []], ['ch3.night', 0, null, 1, 1, 8, []]
    ]);
  });
  it('拿掉量 (巨盆不縮：夜溫室從 3-3a 起一直卡著) → 3-3b 無解 (excluded = 不縮 = 無解)；拿掉對齊 (苗圃一直卡著) → 3-3a 無解', () => {
    const noShrink = validateDial({ ...m, jams: [{ room: 'nursery', until: '3-1b.shrink' }, { room: 'depths' }, { room: 'night', from: '3-3a' }] });
    expect([noShrink.solvable, noShrink.perPuzzle.find(p => p.id === '3-3b')!.shortest]).toEqual([false, null]);
    const noAlign = validateDial({ ...m, jams: [{ room: 'nursery' }, { room: 'depths' }] });
    expect([noAlign.solvable, noAlign.perPuzzle.find(p => p.id === '3-3a')!.issues]).toEqual([false, ['never available (needs unreachable with dial on)']]);
    expect(CH3_ZONE33.puzzles.find(p => p.id === '3-3b')!.excluded).toEqual({ name: 'no-shrink (bigPot)', minSteps: Infinity });
  });
});

describe('3-3a 隔牆的天平 (P17 / P1)：跨房天平', () => {
  it('解法一：苗圃 ▶ (苗圃在夜溫室正上方) → 苗圃的陶盆「大」(3 = 3) → 秤停在正中間 (在苗圃完成)；走回夜溫室：這一半安靜地閂住、玻璃片三在場 → 3D 拿', () => {
    const base = after31();
    // 對齊前：秤桿垂著 (沒有 other)；3D 按 E =「伸進牆裡就斷了」
    expect([base.world.ext.balance, halfTilt(base.world, get(base, 'halfS'))]).toEqual([{ halfS: {} }, null]);
    let r = solveA1(base);
    let cs = r.cs;
    expect([r.done, get(cs, 'halfS').used, cs.world.msg, cs.world.ext.balance]).toEqual([['3-3a'], true, '秤停在正中間。秤盤底下滑出一片花窗玻璃。', { halfS: { other: 3 } }]);
    r = nurseryToNightS(cs);
    cs = play(r.cs, [{ wait: 1 / 30 }]).cs;
    expect([cs.state.room, cs.world.ext.balance, get(cs, 'halfN').used, isActiveIn(cs.world, get(cs, 'pane3'), '3d'), cs.world.msgKey === 'lvl.3-3.half.solved']).toEqual(['night', { halfN: { other: 3, done: true } }, true, true, false]);
    cs = play(cs, [{ walkTo: [-1.3, -2.4] }, { walkTo: [-1.3, -3.0] }, { wait: 0.1 }, { expect: w => expect(findTarget(w)?.def.id).toBe('pane3'), label: '玻璃片三' }, { act: 'interact' }]).cs;
    expect([hasItem(cs.world, 'pane.3'), cs.world.msg]).toEqual([true, '一片彩繪玻璃，邊緣有一筆墨線。']);
  });

  it('解法二：夜溫室 ◀ (夜溫室在苗圃正下方) → 樹根的「小」取下 (3-1b 之後根縮回土裡：苗圃照樣滑得動) → 夜溫室的陶盆「小」(1 + 1 = 2 = 2)', () => {
    const r = solveA2(after31());
    const cs = r.cs;
    expect([r.done, get(cs, 'halfN').used, cs.world.msg, cs.world.ext.balance, pos(cs, 'nursery'), pos(cs, 'night')]).toEqual([['3-3a'], true, '秤停在正中間。秤盤底下滑出一片花窗玻璃。', { halfN: { other: 2 } }, '00', '01']);
    // 樹根縮回土裡 (stayShrunk)：標籤上沒有「小」也不再伸出牆外 → 苗圃不卡住
    expect([cs.state.rooms.nursery.objs.find(o => o.id === 'root')!.used, cs.state.labels['scale:root'], dialBlocked(cs, T('c0', 'E'))]).toEqual([true, undefined, null]);
  });

  it('錯誤嘗試：沒對齊就貼卡 (秤桿垂著、不閂住)；照 3-1a 的習慣讓秤倒向一邊 (苗圃「小」3 > 1、夜溫室「大」4 > 1) → 說「等兩邊一樣重」、不閂住', () => {
    let cs = after31();
    cs = label2d(cs, 0.4, uncard('scale:potW', 'card.da')).cs;
    cs = label2d(cs, 3.3, card('scale:potS', 'card.da')).cs; // 苗圃在 [0,0]、夜溫室在 [1,1]：沒接上
    expect([get(cs, 'halfS').used, halfTilt(cs.world, get(cs, 'halfS'))]).toEqual([false, null]);
    runScript(cs.world, [...FLIP, { walkTo: [3.3, 3.0] }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('秤桿的另一頭，伸進牆裡就斷了。');
    cs = label2d(cs, 3.3, uncard('scale:potS', 'card.da')).cs;
    // 對齊 (苗圃 ▶)：接上的那一刻倒向夜溫室那邊 (3 > 2) → 說「等兩邊一樣重」
    let r = turns(cs, [T('c0', 'E')]);
    expect([get(r.cs, 'halfS').used, halfTilt(r.cs.world, get(r.cs, 'halfS')), r.done, r.cs.world.msg]).toEqual([false, 'other', [], '秤往一邊倒了。這一座秤，像是在等兩邊一樣重。']);
    runScript(r.cs.world, [...FLIP, { walkTo: [3.3, 3.0] }, { wait: 0.1 }, { act: 'interact' }]);
    expect(r.cs.world.msg).toBe('陶盆釘在秤盤上，搬不動。'); // 接上了：秤桿不再斷在牆裡
    // 苗圃的盆「小」(3 > 1)：更歪
    cs = label2d(r.cs, 7.2, uncard('scale:root', 'card.xiao')).cs;
    cs = label2d(cs, 3.3, card('scale:potS', 'card.xiao')).cs;
    expect([get(cs, 'halfS').used, halfTilt(cs.world, get(cs, 'halfS')), cs.world.msg]).toEqual([false, 'other', '秤往一邊倒了。這一座秤，像是在等兩邊一樣重。']);
    // 走進夜溫室，夜溫室的陶盆貼「大」(4 > 1)：倒向這一邊
    cs = play(nurseryToNightS(cs).cs, [{ wait: 1 / 30 }]).cs;
    cs = label2d(cs, -3.25, card('scale:potN', 'card.da')).cs;
    expect([get(cs, 'halfN').used, halfTilt(cs.world, get(cs, 'halfN')), cs.world.msg]).toEqual([false, 'mine', '秤往一邊倒了。這一座秤，像是在等兩邊一樣重。']);
    runScript(cs.world, [...FLIP, { walkTo: [-2.4, -2.6] }, { walkTo: [-2.4, -3.0] }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('澆水壺也釘在秤盤上，搬不動。');
  });
});

/** 3-3a (解法一) 之後走進夜溫室、等驚嚇：巨盆被推進北邊的軌道 */
function pushed(): ChapterSession {
  const a = solveA1(after31()).cs;
  let cs = nurseryToNightS(a).cs;
  const r = waitPush(cs);
  cs = r.cs;
  expect([r.flags, get(cs, 'bigPot').used, cs.world.msg, +get(cs, 'bigPot').z.toFixed(2), dialBlocked(cs, T('c4', 'W'))])
    .toEqual([['scare:handprint'], true, '北邊的彩繪玻璃上，多了一個手印。回頭時，巨盆被推進了北邊的軌道。', -4.6, 'jammed']);
  return cs;
}
/** 取下樹根的「小」(苗圃不再卡住：根縮回土裡)，回夜溫室貼到巨盆 (縮回牆內 → 夜溫室鬆開) */
function shrinkBigPot(cs: ChapterSession): ChapterSession {
  cs = nightToNurseryN(cs).cs;
  expect(cs.state.room).toBe('nursery');
  cs = label2d(cs, 7.2, uncard('scale:root', 'card.xiao')).cs;
  cs = nurseryToNightS(cs).cs;
  cs = label2d(cs, 0, card('scale:bigPot', 'card.xiao')).cs;
  expect([cs.state.room, +(get(cs, 'bigPot').z - get(cs, 'bigPot').def.d / 2).toFixed(2), dialBlocked(cs, T('c4', 'W')), cs.state.turns!.left]).toEqual(['night', -5, null, 4]);
  return cs;
}

describe('3-3b 墨只夠四步 (P4 / P3)：驚嚇、巨盆、月下美人', () => {
  it('3-3a 之前巨盆站在房內 (不卡；3-2 的轉動照常)；3-3a 之後人在夜溫室、安靜 2.5 秒 → 手印 + 巨盆被推進軌道 (scare:handprint)、夜溫室卡住；不在場的房也卡 (ChapterSpec.jammed)', () => {
    const before = enterRoom(after31(), 'night', 'archW', OPTS);
    runScript(before.world, [{ wait: 3.0 }]);
    expect([get(before, 'bigPot').used, dialBlocked(before, T('c4', 'W'))]).toEqual([false, null]);
    const cs = pushed();
    expect(cs.state.flags).toEqual(['scare:handprint']);
    // 人在苗圃 (隔壁) 時夜溫室照樣卡住 (快照的 used = 被推過)
    const away = nightToNurseryN(cs).cs;
    expect([away.state.room, dialBlocked(away, T('c4', 'W')), dialBlocked(away, T('c1', 'W'))]).toEqual(['nursery', 'jammed', null]);
    // R 之後：推過的狀態退回進房時，但驚嚇不重演 (旗標在) → 一看到就安靜地推過去
    const again = restartRoom(cs, OPTS);
    const r = play(again, [{ wait: 1 / 30 }]);
    expect([r.flags, get(r.cs, 'bigPot').used, r.cs.state.flags]).toEqual([[], true, ['scare:handprint']]);
  });

  it('解法一 (3-3a 解法一的排列：苗圃 [1,0]、夜溫室 [1,1])：巨盆「小」→ 苗圃 ◀、夜溫室 ▲、苗圃 ▼ (墨 4 → 1) → 月光、四面不接 → 月下美人開', () => {
    let cs = shrinkBigPot(pushed());
    expect(sensorLight(cs.world, get(cs, 'flowerMoon'))).toBe('dark');
    let r = turns(cs, [T('c1', 'W'), T('c4', 'N')]);
    // 月光照到了，但西邊 [0,0] 的苗圃東拱門接著夜溫室西拱門
    expect([sensorLight(r.cs.world, get(r.cs, 'flowerMoon')), r.cs.world.msg, r.done]).toEqual(['crowd', '月光照到花苞了。可是拱門外接著別的房間，它又闔上了。', []]);
    r = turns(r.cs, [T('c0', 'S')]);
    cs = r.cs;
    expect([r.done, get(cs, 'flowerMoon').used, cs.world.msg, pos(cs, 'night'), cs.state.turns!.left, Object.values(cs.world.ext.cube!.links).map(l => l.to)])
      .toEqual([['3-3b'], true, '月光落在花上，四面拱門都對著牆。月下美人開了。', '10', 1, ['frame', 'wall', 'wall', 'wall']]);
  });

  it('解法二 (另一條：夜溫室 ◀、夜溫室 ▲ (到 [0,0])、苗圃 ▼)；3-3a 解法二的排列 (苗圃 [0,0]、夜溫室 [0,1]) 也是 3 步：夜溫室 ▶、夜溫室 ▲、苗圃 ▼', () => {
    let r = turns(shrinkBigPot(pushed()), [T('c4', 'W'), T('c3', 'N'), T('c1', 'S')]);
    expect([r.done, pos(r.cs, 'night'), r.cs.state.turns!.left]).toEqual([['3-3b'], '00', 1]);
    // 3-3a 解法二：小在夜溫室的陶盆上 → 閂住後取回來給巨盆
    let cs = solveA2(after31()).cs;
    cs = waitPush(cs).cs;
    cs = label2d(cs, -3.25, uncard('scale:potN', 'card.xiao')).cs;
    cs = label2d(cs, 0, card('scale:bigPot', 'card.xiao')).cs;
    expect([get(cs, 'halfN').used, dialBlocked(cs, T('c3', 'E'))]).toEqual([true, null]);
    r = turns(cs, [T('c3', 'E'), T('c4', 'N'), T('c0', 'S')]);
    expect([r.done, pos(r.cs, 'night'), r.cs.state.turns!.left]).toEqual([['3-3b'], '10', 1]);
  });

  it('錯誤嘗試：不縮就轉 (轉不動，墨不少)；縮錯盆 (夜溫室陶盆 / 陶槽貼「小」→ 照樣卡住)；墨只有 4：來回試四步就沒墨；以為要點燈 (吊燈是裝飾)', () => {
    let cs = pushed();
    for (let i = 0; i < 3; i++) expect(applyChapterCommand(cs, { t: 'turn', turn: T('c4', 'W') })).toEqual({ blocked: 'jammed' });
    expect(cs.state.turns!.left).toBe(4);
    cs = nightToNurseryN(cs).cs;
    cs = label2d(cs, 7.2, uncard('scale:root', 'card.xiao')).cs;
    cs = nurseryToNightS(cs).cs;
    cs = label2d(cs, 3.0, card('scale:trough', 'card.xiao')).cs;
    expect(dialBlocked(cs, T('c4', 'W'))).toBe('jammed');
    cs = label2d(cs, 3.0, uncard('scale:trough', 'card.xiao')).cs;
    cs = label2d(cs, 0, card('scale:bigPot', 'card.xiao')).cs;
    // 不看預覽來回試：四滴墨用完還沒排好 → 第五步沒墨 (R 或穿門才補滿)
    const r = turns(cs, [T('c4', 'W'), T('c3', 'E'), T('c4', 'W'), T('c3', 'E')]);
    expect([r.cs.state.turns!.left, dialBlocked(r.cs, T('c3', 'S'))]).toEqual([0, 'noInk']);
    expect(night.decor!.filter(d => d.kind === 'pendant').length).toBe(2);
    expect(night.objects.some(o => o.type === 'lamp' || o.type === 'lampBook')).toBe(false);
  });

  it('閂住：花開之後夜溫室再接上別的房，花照樣開著；做完之後墨上限回到 8 (穿門補滿)', () => {
    let cs = turns(shrinkBigPot(pushed()), [T('c1', 'W'), T('c4', 'N'), T('c0', 'S')]).cs;
    cs = turns(cs, [T('c3', 'N')]).cs; // 苗圃回到 [0,0]：又接上夜溫室西拱門
    expect([sensorLight(cs.world, get(cs, 'flowerMoon')), get(cs, 'flowerMoon').used]).toEqual(['crowd', true]);
    runScript(cs.world, [...FLIP, { walkTo: [6.6, 0.8] }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('月下美人開著。');
    const back = enterRoom(enterRoom(cs, 'nursery', 'archE', OPTS), 'night', 'archW', OPTS);
    expect(back.state.turns!.left).toBe(8);
  });
});

/** 3-3b 做完 (解法一) → 夜溫室 ▼ (= S0 的排列；西拱門接苗圃) */
function after33b(): ChapterSession {
  const r = turns(shrinkBigPot(pushed()), [T('c1', 'W'), T('c4', 'N'), T('c0', 'S')]);
  expect(r.done).toEqual(['3-3b']);
  return turns(r.cs, [T('c1', 'S')]).cs;
}
/** 夜溫室 → 苗圃 (西拱門 ↔ 苗圃東拱門)、苗圃 → 夜溫室 (東拱門) */
const nightToNurseryW = (cs: ChapterSession) => door3d(cs, -11.3, 0);
const nurseryToNightE = (cs: ChapterSession) => door3d(cs, 7.3, 0);
/** 從 S0 把夜溫室滑到 [2,1] (南拱門對溫室深處北拱門)：BFS 最短 6 */
const TO_DEPTHS = [T('c3', 'N'), T('c4', 'N'), T('c5', 'W'), T('c4', 'W'), T('c1', 'S'), T('c4', 'E')];
/** 溫室深處：從北拱門內側踩上伸進來的陶槽 → 跳上高台 → 拿筆記 */
const CLIMB: Cmd[] = [
  { wait: 0.1 }, { walkTo: [0, null] }, { walkTo: [null, -3.95] }, { hold: { moveZ: -1, jump: true }, seconds: 0.5 }, { wait: 0.3 },
  { hop: 1, until: w => w.player.y > 1.8 && w.player.onGround, seconds: 3, label: '跳上高台' }, { walkTo: [1.85, null] }, { wait: 0.1 }
];

describe('3-3c 故意卡住 (P3)：跨房伸出 (ext.protrude)', () => {
  it('解法：取回「大」→ 夜溫室滑到 [2,1] → 陶槽「大」(從南拱門伸進深處：兩房都卡住) → 深處踩著陶槽上高台 → 筆記一頁 (3-3c，房間通關) → 回夜溫室取下「大」才轉得動', () => {
    let cs = after33b();
    cs = nightToNurseryW(cs).cs;
    expect(cs.state.room).toBe('nursery');
    cs = label2d(cs, 3.3, uncard('scale:potS', 'card.da')).cs; // 3-3a 閂住：取回「大」
    cs = nurseryToNightE(cs).cs;
    expect([cs.state.room, cs.state.turns!.left]).toEqual(['night', 8]);
    cs = turns(cs, TO_DEPTHS).cs;
    expect([pos(cs, 'night'), cs.world.ext.cube!.links.archS]).toEqual(['21', { to: 'room', room: 'depths', door: 'archN', kind: 'arch' }]);
    cs = label2d(cs, 3.0, card('scale:trough', 'card.da')).cs;
    expect([cs.world.msg, +(get(cs, 'trough').z + get(cs, 'trough').def.d / 2).toFixed(2), dialBlocked(cs, T('c5', 'W'))]).toEqual(['量過了。它照著刻度，長大了。', 5.8, 'jammed']);
    cs = door3d(cs, 2.0, 4.45).cs;
    expect([cs.state.room, cs.state.door]).toEqual(['depths', 'archN']);
    runScript(cs.world, [{ wait: 1 / 30 }]);
    const step = get(cs, 'protrude:trough');
    expect([step.def.type, step.def.solid, step.def.derived, [step.x, step.z, step.def.w, step.def.d, step.def.h].map(v => +v.toFixed(2)), cs.world.ext.protrude!.length])
      .toEqual(['protrudeStep', true, true, [0, -4.6, 1.2, 0.8, 0.9], 1]);
    // 人在深處：夜溫室 (其他房) 卡住、深處自己也卡 (伸進來的 + 巨根)
    expect([dialBlocked(cs, T('c5', 'W')), dialBlocked(cs, T('c8', 'N'))]).toEqual(['jammed', 'jammed']);
    const r = play(cs, [...CLIMB, { expect: w => expect(findTarget(w)?.def.id).toBe('pageGarden'), label: '筆記' }, { act: 'interact' }]);
    cs = r.cs;
    expect([r.done, hasItem(cs.world, 'page.garden'), cs.world.msg, clearedRooms(SPEC, cs.state, cs.world)])
      .toEqual([['3-3c'], true, '爸爸的園藝筆記，撕下來的一頁：「你小時候說，溫室像一座會轉的迷宮。」', ['nursery', 'night']]);
    // 推導實體不進快照
    expect(captureState(cs).rooms.depths.objs.some(o => o.id === 'protrude:trough')).toBe(false);
    // 回夜溫室取下「大」→ 陶槽縮回、深處的那一截消失、夜溫室轉得動
    cs = play(cs, [{ walkTo: [0.0, null] }, { hop: -1, until: w => w.player.y < 0.05 && w.player.onGround, seconds: 3 }, { walkTo: [0, -3.95] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('night');
    cs = label2d(cs, 3.0, uncard('scale:trough', 'card.da')).cs;
    expect([dialBlocked(cs, T('c5', 'W')), roomCleared(SPEC, cs.state, cs.world)]).toEqual([null, true]);
    const d2 = enterRoom(cs, 'depths', 'archN', OPTS);
    runScript(d2.world, [{ wait: 1 / 30 }]);
    expect([d2.world.ext.protrude, d2.world.byId.has('protrude:trough')]).toEqual([undefined, false]);
  });

  it('錯誤嘗試：先放大再想轉 (S0 的南拱門對著溫室床 = 牆：「這裡放不下。」、卡片退回)；放大之後才想把夜溫室滑過去 (轉不動)；在深處徒手上不去高台', () => {
    // 3-3b 做完 (夜溫室的墨回到 8)、排列 = S0：南拱門對著溫床 (沒有門 = 牆)
    let cs = after33b();
    cs = nightToNurseryW(cs).cs;
    cs = label2d(cs, 3.3, uncard('scale:potS', 'card.da')).cs;
    cs = nurseryToNightE(cs).cs;
    expect(cs.world.ext.cube!.links.archS).toEqual({ to: 'wall' });
    cs = label2d(cs, 3.0, card('scale:trough', 'card.da')).cs;
    expect([cs.world.msg, hasItem(cs.world, 'card.da'), cs.world.ext.labels!['scale:trough']]).toEqual(['這裡放不下。', true, undefined]);
    // 轉到位 → 放大 → 再想轉：卡住
    cs = turns(cs, TO_DEPTHS).cs;
    cs = label2d(cs, 3.0, card('scale:trough', 'card.da')).cs;
    for (const t of [T('c5', 'W'), T('c5', 'N')]) expect(dialBlocked(cs, t)).toBe('jammed');
    // 深處沒有陶槽：徒手跳不上高台 (兩個視角)
    const bare = enterRoom(openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH3.start), OPTS), 'depths', 'archN', OPTS);
    for (const mode of ['3d', '2d'] as const) {
      const w = bare.world;
      runScript(w, [{ place: [0.4, 0, -4.55], mode }, { hop: 1, until: ww => ww.player.y > 1.8 && ww.player.onGround, seconds: 3, optional: true }, { wait: 1 }]);
      expect([mode, w.player.y < 1.0, hasItem(w, 'page.garden')]).toEqual([mode, true, false]);
    }
  });
});

describe('反例：只用 2D / 只用 3D、盲轉取樣', () => {
  it('只用 2D：羅盤只在實景啟動 (轉不動)、比例尺只在實景拿 (沒有尺度卡)、門只在實景穿得過；只用 3D：標籤只在藏寶圖 (labelTarget = null)、轉動模式只在藏寶圖', () => {
    const cs = start();
    runScript(cs.world, [{ walkTo: [-3.6, -2.8] }, ...FLIP, { act: 'interact' }, { walkTo: [-5.3, null] }, { act: 'interact' }]);
    expect([cs.state.dial, dialBlocked(cs, T('c3', 'N')), hasItem(cs.world, 'card.da')]).toEqual([undefined, 'noDial', false]);
    const a = solveA1(after31()).cs;
    const n = play(nurseryToNightS(a).cs, [{ wait: 0.1 }]).cs; // 實景
    runScript(n.world, [{ walkTo: [0, -1.2] }, { wait: 0.1 }]);
    expect([n.world.player.mode, labelTarget(n.world), turnModeDenied(n.world)]).toEqual(['3d', null, 'not2d']);
  });

  // 隨機滑動 (不看預覽)：從題目開始時的排列、人在夜溫室，墨用完為止
  const opts = CH3_CUBE.dial!.groups.flatMap(g => turnDirs(CH3_CUBE, g.id).map(dir => ({ group: g.id, dir })));
  const doors = chapterDoors(CH3.rooms);
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
  const at = (n: string, c: string, g = '21', b = '12'): CubeState => {
    const p = (x: string) => [+x[0], +x[1], 0] as const;
    return { pos: { nursery: p(n), night: p(c), gallery: p(g), bed: p(b), depths: [2, 2, 0] }, rot: { nursery: 0, night: 0, gallery: 0, bed: 0, depths: 0 } };
  };
  const moonGoal = (s: CubeState) => lightState(lightPaths(CH3_CUBE, s).hits.night ?? [], 'N', 0) === 'lit' && !links(CH3_CUBE, s, doors).some(l => l.from.room === 'night' && 'room' in l.to);
  it('3-3b (盲轉 4 步，巨盆縮小後)：從 3-3a 的兩個排列成功率 < 25% (第二章上限)；巨盆沒縮 = 0', () => {
    const r1 = rate(at('10', '11'), 4, ['depths'], moonGoal), r2 = rate(at('00', '01'), 4, ['depths'], moonGoal);
    expect([r1 < 0.25, r2 < 0.25, r1 > 0, r2 > 0, rate(at('10', '11'), 4, ['night', 'depths'], moonGoal)]).toEqual([true, true, true, true, 0]);
  });
  it('3-3a (盲轉 8 步，只算排列：苗圃到夜溫室正上方)：結構上高 (3-1b 剛完成時離對齊只差 1 步；同 3-2b 的待決)，記錄區間；配平還要量 (標籤只在藏寶圖)', () => {
    const r = rate(at('00', '11'), 8, ['depths'], s => s.pos.nursery[0] === s.pos.night[0] && s.pos.nursery[1] === s.pos.night[1] - 1);
    expect(r > 0.4 && r < 0.95).toBe(true);
  });
});

describe('R、存檔、舊存檔相容', () => {
  it('R：3-3b 轉了兩步 → R 回到本次進房時 (排列、墨 4、巨盆仍被推著、尺度卡回到進房時的位置)', () => {
    const cs0 = shrinkBigPot(pushed());
    const cs = turns(cs0, [T('c1', 'W'), T('c4', 'N')]).cs;
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([pos(back, 'night'), pos(back, 'nursery'), back.state.turns, get(back, 'bigPot').used, back.state.labels['scale:bigPot'] ?? [], get(back, 'flowerMoon').used])
      .toEqual(['11', '10', { left: 4, undo: [] }, true, [], false]);
  });

  it('存檔往返：3-3a 完成、巨盆被推、巨盆貼「小」→ 寫檔 → 讀回 (房內讀檔)：天平閂住、巨盆的位置 / 尺寸、ext.balance、夜溫室不卡、墨', () => {
    const cs = shrinkBigPot(pushed());
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['2-5', '3-1'], abilities: ['nib', 'scale'] }, captureState(cs)));
    const back = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH3.start), OPTS);
    runScript(back.world, [{ wait: 1 / 30 }]);
    expect([back.state.room, get(back, 'halfN').used, get(back, 'bigPot').used, +get(back, 'bigPot').z.toFixed(2), get(back, 'bigPot').def.d, back.world.ext.balance, dialBlocked(back, T('c4', 'W')), back.state.turns!.left])
      .toEqual(['night', true, true, -4.6, 0.8, { halfN: { other: 3, done: true } }, null, 4]);
  });

  it('舊存檔 (骨架版夜溫室的快照：只有地板 / 四個拱門)：照常開章，新物件取關卡初值 (天平沒閂、巨盆站著、月下美人閉著)；3-3 開放狀態依 3-1', () => {
    const legacy = {
      cube: { pos: { nursery: [0, 1, 0], night: [1, 1, 0], gallery: [2, 1, 0], bed: [1, 2, 0], depths: [2, 2, 0] }, rot: { nursery: 0, night: 0, gallery: 0, bed: 0, depths: 0 } },
      rooms: { night: { objs: [{ id: 'floor', x: 0, y: -1, z: 0, gone: false, used: false, touched: false }, { id: 'archN', x: -3, y: 0, z: -4.8, gone: false, used: false, touched: false }], flags: [] } },
      at: { room: 'night', door: 'archW' }, items: {}, flags: [], dial: true
    };
    const store = memoryStorage();
    store.set('puzzle:save', JSON.stringify({ ...defaultSave(), cleared: ['2-5'], abilities: ['nib'], chapters: { '3': legacy } }));
    const loaded = loadSave(store);
    const cs = openChapter(SPEC, chapterStart(loaded, SPEC, CH3.start), OPTS);
    runScript(cs.world, [{ wait: 3 }]);
    expect([cs.state.room, get(cs, 'halfN').used, get(cs, 'bigPot').used, get(cs, 'flowerMoon').used, get(cs, 'floor').def.w, levelState(levelById('3-3')!, loaded), levelState(levelById('3-3')!, { ...loaded, cleared: ['2-5', '3-1'] })])
      .toEqual(['night', false, false, false, 24, 'locked', 'open']);
  });
});

describe('音效 (USED_ON / SCARE_SFX)：半座天平、巨盆被推、筆記一頁', () => {
  it('LevelObserver：balanceHalf → 秤盤落定、bigPot → 拖過石板、page → 讀紙；驚嚇 scare:handprint 有對映', () => {
    const W = {};
    const snap = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'night', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(snap([o('a', 'balanceHalf', false), o('b', 'bigPot', false), o('c', 'page', false)]));
    const out = obs.update(snap([o('a', 'balanceHalf', true), o('b', 'bigPot', true), o('c', 'page', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.plate.press', 'sfx.crate.push', 'sfx.note.read']);
    expect(SCARE_SFX['scare:handprint']).toBeDefined();
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = night.objects.filter(o => o.type === 'note');
describe('3-3 字條：三題各 L1 + L2 (L2 空白，4 分鐘浮現)、量表', () => {
  it('原文 (story-bible 7.3)；落地木柱；H1 / H2 / H3 / H4 / H10；間距 ≥ 3、任一 16 單位寬的畫面 ≤ 3 張', () => {
    expect(notes.map(o => [o.id, noteText(o), o.type === 'note' && o.mount, o.type === 'note' && o.revealAfter])).toEqual([
      ['noteB2', '那一盆，一直都那麼高嗎？', 'post', 240],
      ['noteA2', '這回，別讓誰先落地。', 'post', 240],
      ['noteA', '蹺蹺板的另一頭，有時候在隔壁。', 'post', undefined],
      ['noteC', '隔壁的窗台太高。爸爸的花，總是長得過頭。', 'post', undefined],
      ['noteB', '月下美人怕吵。它只在沒人經過的夜裡開。', 'post', undefined],
      ['noteC2', '它伸過去的時候，哪裡也去不了。', 'post', 240]
    ]);
    for (const o of notes) {
      const t = noteText(o);
      expect([o.id, [...t].length <= (o.type === 'note' && o.revealAfter ? 30 : 24)]).toEqual([o.id, true]);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t)).toBe(false);
    }
    const AHA = ['大', '小', '縮', '放大', '重', '秤', '光', '玻璃', '照', '轉', '滑', '空格', '軌道', '卡', '對齊', '一起'];
    const KEYS = ['苗圃', '天平', '比例尺', '尺度卡', '園丁羅盤', '控制盤', '天窗', '溫室深處', '陶槽', '拱門'];
    for (const o of notes) for (const term of [...AHA, ...KEYS]) expect([o.id, term, noteText(o).includes(term)]).toEqual([o.id, term, false]);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    expect([notes.length, notes.length <= night.puzzles!.length + 3]).toEqual([6, true]);
  });

  it('兩個視角都讀得到；L2 一開始是空白，進房 240 秒浮現', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = createWorld(night, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : noteText(o));
    }
    const w = createWorld(night, OPTS);
    runScript(w, [{ wait: 241 }, { place: [-11.4, 0, 3.4] }]);
    interact(w);
    expect(w.msg).toBe('那一盆，一直都那麼高嗎？');
  });
});

describe('捷徑掃描 (取樣)', () => {
  it('夜溫室 (S0、三種尺度檔)：不接上苗圃，半座天平不會閂住、玻璃片三 / 月下美人不出現；溫室深處 (沒有陶槽)：拿不到高台上的筆記', () => {
    for (const tier of [[], ['card.da'], ['card.xiao']]) {
      const r = scanShortcuts({
        level: night, mechanics: DEFAULT_MECHANICS, text: TEXT,
        setup: w => { w.ext = { labels: tier.length ? { 'scale:potN': tier, 'scale:bigPot': tier } : {} }; },
        movable: [],
        playerAt: [{ x: 0, y: 0, z: 1.5 }, { x: -3, y: 0, z: -2.4 }, { x: 6.6, y: 0, z: 0.8 }, { x: 3, y: 0, z: 4.2 }],
        probes: [
          [{ walkTo: [-3.0, null] }, { walkTo: [null, -4.4] }],
          [{ hop: 1, until: () => false, seconds: 2.5, optional: true }],
          [{ act: 'interact' }, { act: 'flip' }, { wait: 0.2 }, { act: 'interact' }]
        ],
        forbidden: ['used:halfN', 'used:flowerMoon', 'item:pane.3', 'used:bigPot']
      });
      expect([tier, r.hits, r.runs > 0]).toEqual([tier, [], true]);
    }
    const d = scanShortcuts({
      level: depths, mechanics: DEFAULT_MECHANICS, text: TEXT, movable: [],
      playerAt: [{ x: 0, y: 0, z: -3.6 }, { x: 0.5, y: 0, z: -4.5 }, { x: 3.2, y: 0, z: -3.6 }, { x: 1.8, y: 0, z: -3.5 }],
      probes: [
        [{ hop: 1, until: () => false, seconds: 2.5, optional: true }], [{ hop: -1, until: () => false, seconds: 2.5, optional: true }],
        [{ hold: { moveZ: -1, jump: true }, seconds: 2 }, { act: 'interact' }],
        [{ act: 'flip' }, { wait: 0.2 }, { hop: 1, until: () => false, seconds: 2, optional: true }, { act: 'interact' }]
      ],
      forbidden: ['item:page.garden', { id: 'onLedge', holds: (w: World) => w.player.y > 1.8 }]
    });
    expect([d.hits, d.runs > 0]).toEqual([[], true]);
  });
});
