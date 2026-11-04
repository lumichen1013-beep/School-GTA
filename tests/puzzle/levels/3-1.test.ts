// 3-1 苗圃 (規格 6「3-1 苗圃（細化）」；第三章第一關)：資料與驗證器、擺設深度帶、高度與距離 (D10)、3-1 區 validateDial (卡榫 jams)、
// 通關腳本 (runScript：比例尺 → 3-1a 兩種解法 → 3-1b 縮小樹根 → 苗圃滑出原格 → 花窗玻璃片)、每題反例 (只用 2D / 只用 3D；
// 兩題都是教學題、3-1a 不需轉動：豁免盲轉)、錯誤嘗試、閂住、卡榫 (所在房 / 不在場的房)、R / T、存檔讀檔、舊存檔相容、進度、音效、字條量表、捷徑掃描取樣
import { describe, it, expect } from 'vitest';
import { nursery } from '../../../src/puzzle/content/levels/ch3/3-1-nursery';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH3_ZONE31 } from '../../../src/puzzle/content/cubes/ch3';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { labelTarget, promptLabelTarget } from '../../../src/puzzle/mechanics/labels';
import { weightOf } from '../../../src/puzzle/mechanics/scale';
import { tiltOf } from '../../../src/puzzle/mechanics/balance';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { JUMP_V_2D, JUMP_V_3D, GRAVITY, INTERACT_RANGE } from '../../../src/puzzle/core/constants';
import type { Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, captureState, clearedRooms, dialBlocked, enterRoom, openChapter, restartRoom, roomCleared, type ChapterSession
} from '../../../src/puzzle/core/chapter';
import type { GameEvent, ObjDef, World } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveTurnMode } from '../../../src/puzzle/app/cubeMapModel';
import { deriveCardTray } from '../../../src/puzzle/app/cardTrayModel';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, sanitizeSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { LevelObserver, type LevelSnap } from '../../../src/puzzle/audio/events';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts } from '../../../src/puzzle/devtools/shortcutScan';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
const SPEC = chapterSpecOf(CH3);
const def = (id: string): ObjDef => nursery.objects.find(o => o.id === id)!;
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
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });
const FLIP: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];

// ── 路線 (3D：先走 z 再走 x，繞開實體) ──
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-3.6, -2.8] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '園丁羅盤' }, { act: 'interact' }];
const RULER: Cmd[] = [{ wait: 0.1 }, { walkTo: [-5.3, -1.7] }, { expect: w => expect(findTarget(w)?.def.id).toBe('ruler'), label: '比例尺' }, { act: 'interact' }];
/** 3D 走到花秤前 (z 0.6)、站到 x，切到藏寶圖 */
const AT_POT = (x: number): Cmd[] => [{ wait: 0.1 }, { walkTo: [null, 0.6] }, { walkTo: [x, null] }, ...FLIP];
/** 藏寶圖裡走到 x (花架門開了才走得過 4.5) */
const WALK2D = (x: number): Cmd[] => [{ walkTo: [x, null] }, { wait: 0.1 }];
/** 實景：從花秤前繞到花架門西側，穿過 (拉起的) 花架門走進樹根角，站到玻璃片前 */
const TO_PANE: Cmd[] = [{ wait: 0.1 }, { walkTo: [4.0, null] }, { walkTo: [null, -3.0] }, { walkTo: [7.2, null] }];

/** 開章 → 啟動羅盤 → 拿比例尺 */
function withRuler(): ChapterSession {
  let cs = play(start(), ACTIVATE).cs;
  expect(cs.state.dial).toBe(true);
  cs = play(cs, RULER).cs;
  return cs;
}
/** 3-1a 解法：side = 'W' 貼「大」/ 'E' 貼「小」 */
function solveA(cs: ChapterSession, side: 'W' | 'E'): ChapterSession {
  const r = play(cs, side === 'W' ? [...AT_POT(0.4), card('scale:potW', 'card.da')] : [...AT_POT(2.8), card('scale:potE', 'card.xiao')]);
  expect([r.done, get(r.cs, 'balance').used, get(r.cs, 'trellis').used, r.cs.world.msg]).toEqual([['3-1a'], true, true, '秤往西倒了下去。繩子一緊，花架門被拉了起來。']);
  return r.cs;
}
/** 3-1b：藏寶圖走進花架門後 → 樹根貼「小」→ 苗圃 ▲ → 完成 */
function solveB(cs: ChapterSession): ChapterSession {
  let r = play(cs, [...WALK2D(7.2), { expect: w => expect(labelTarget(w)?.def.id).toBe('root'), label: '樹根的標籤' }, card('scale:root', 'card.xiao')]);
  expect([r.cs.world.msg, get(r.cs, 'root').def.d, dialBlocked(r.cs, T('c3', 'N'))]).toEqual(['量過了。它照著刻度，縮小了。', 0.8, null]);
  cs = ok(applyChapterCommand(r.cs, { t: 'turn', turn: T('c3', 'N') }));
  r = play(cs, [{ wait: 0.1 }]);
  expect([pos(r.cs, 'nursery'), r.done, get(r.cs, 'root').used, r.cs.world.msg]).toEqual(['00', ['3-1b'], true, '苗圃滑了出去。縮小的樹根從土裡鬆開，底下壓著一片花窗玻璃。']);
  return r.cs;
}
/** 實景拿花窗玻璃片一 */
function takePane(cs: ChapterSession): ChapterSession {
  const r = play(cs, [...FLIP, ...TO_PANE, { expect: w => expect(findTarget(w)?.def.id).toBe('pane1'), label: '花窗玻璃片' }, { act: 'interact' }]);
  expect([hasItem(r.cs.world, 'pane.1'), r.cs.world.msg]).toEqual([true, '一片彩繪玻璃，邊緣有一筆墨線。']);
  return r.cs;
}

describe('3-1 苗圃：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 3-1a / 3-1b；登錄表 3-1 (前置 2-5)；旁白 / 通關文字 (story-bible 7.3)', () => {
    expect(validateLevel(nursery, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('3-1')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(nursery.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['3-1a 一大一小', '3-1b 卡住的軌道']);
    expect([levelById('3-1')!.unlock.after, CH3.levels['3-1'], nursery.turnBudget]).toEqual([['2-5'], 'nursery', { base: 8 }]);
    expect([TEXT(nursery.narrationKey), TEXT(nursery.nextKey)]).toEqual(['比例尺掛在門邊。爸爸在旁邊畫了個問號。', '根縮回土裡。苗圃第一次，自己挪了位置。']);
    expect(nextAfterClear('3-1', 'room', CHAPTERS)).toBe('3-1');
  });

  it('擺設三帶 (layoutDepthIssues = [])；分帶：後 = 羅盤 / 劇情字條 / 花架門 / 樹根 / 玻璃片、中 = 比例尺 / 陶盆 / 門、前 = 兩張提示字條 / 南拱門', () => {
    expect(layoutDepthIssues(nursery)).toEqual([]);
    const band = (z: number) => (z < -2 ? 'back' : z > 2 ? 'front' : 'mid');
    const objs = nursery.objects.filter(o => o.interactable || o.label);
    expect(Object.fromEntries(['back', 'mid', 'front'].map(b => [b, objs.filter(o => band(o.z) === b).map(o => o.id)]))).toEqual({
      back: ['dial', 'trellis', 'root', 'pane1', 'noteStory'], mid: ['doorW', 'archE', 'ruler', 'potW', 'potE'], front: ['archS', 'potS', 'noteA', 'noteB'] // 3-3a：南拱門內側半座天平上的陶盆
    });
  });

  it('量的數字 (N23)：陶盆 大 0.84 / 小 0.28、重 3 / 1；樹根 小 = 縮回牆內 (z∈[−4.8, −4.0])、大 = 伸出更多', () => {
    const w = createWorld(nursery, OPTS);
    const potW = w.byId.get('potW')!, root = w.byId.get('root')!;
    const at = (labels: Record<string, string[]>) => { w.ext = { labels }; runScript(w, [{ wait: 1 / 60 }]); };
    at({ 'scale:potW': ['card.da'], 'scale:root': ['card.xiao'] });
    expect([+potW.def.w.toFixed(2), +potW.def.h.toFixed(2), weightOf(w, potW), +(root.z - root.def.d / 2).toFixed(2), +(root.z + root.def.d / 2).toFixed(2)]).toEqual([0.84, 0.75, 3, -4.8, -4]);
    at({ 'scale:potW': ['card.xiao'], 'scale:root': ['card.da'] });
    expect([+potW.def.w.toFixed(2), weightOf(w, potW), +(root.z - root.def.d / 2).toFixed(2), +root.def.h.toFixed(2)]).toEqual([0.28, 1, -5.6, 2.1]);
    at({});
    expect([potW.def.w, weightOf(w, potW), root.def.d, potW.x, potW.y, root.y]).toEqual([0.56, 2, 1.6, 0.4, 0.72, 0]); // 底部中心不動
  });

  it('高度與距離 (D10)：花架門 2.0 > 藏寶圖跳 1.6 / 實景 1.25；高育苗架 1.6 > 實景跳 + 0.15；藏寶圖門沒開時最東站位到樹根 > 互動範圍 (餘裕 ≥ 0.5)；陶盆標籤站在地板上搆得到', () => {
    const h3 = JUMP_V_3D ** 2 / (2 * GRAVITY), h2 = JUMP_V_2D ** 2 / (2 * GRAVITY);
    const gate = def('trellis'), shelfS = def('shelfS'), root = def('root');
    expect([h2 + 0.15 <= gate.h, h3 + 0.15 <= gate.h, h3 + 0.15 <= shelfS.h, shelfS.visible]).toEqual([true, true, true, '3d']);
    const east2d = gate.x - gate.w / 2 - 0.3;
    expect(root.x - root.w / 2 - east2d - INTERACT_RANGE).toBeGreaterThanOrEqual(0.5);
    // 擋路的只有花架門與高育苗架 (家具可穿過)
    expect(nursery.objects.filter(o => o.solid && o.type !== 'floor').map(o => o.id)).toEqual(['trellis', 'shelfS']);
    // 花架門與高育苗架在實景圍住樹根角 (z 重疊、x 重疊：沒有縫)
    expect([gate.z + gate.d / 2 > shelfS.z - shelfS.d / 2, shelfS.x - shelfS.w / 2 < gate.x + gate.w / 2, gate.z - gate.d / 2 <= nursery.bounds.minZ]).toEqual([true, true, true]);
  });

  it('字條與標籤不搶 E (藏寶圖)：站在西盆 / 東盆 / 樹根正前時，E = 開字卡匣 (沒有更近的可互動物)', () => {
    const cs = withRuler();
    const r = play(solveA(cs, 'W'), []);
    for (const [x, id] of [[0.4, 'potW'], [2.8, 'potE'], [7.2, 'root']] as const) {
      runScript(r.cs.world, WALK2D(x));
      expect([id, findTarget(r.cs.world)?.def.id ?? null, labelTarget(r.cs.world)?.def.id]).toEqual([id, null, id]);
    }
  });
});

describe('validateDial：3-1 區 (卡榫 jams)', () => {
  const m = dialModelOf(CH3_ZONE31.cube, CH3.rooms, CH3_ZONE31.puzzles, CH3_ZONE31.start, CH3_ZONE31.finish, { jams: CH3_ZONE31.jams });
  const r = validateDial(m);
  it('可達排列 360 (苗圃鬆開後；鬆開前 20)、抽象狀態 15,139、有解、卡死 0 (含 R)、需要 R 的狀態 1,347；無問題', () => {
    expect([r.arrangements, r.states, r.solvable, r.deadlocks, r.needsRestart]).toEqual([360, 15139, true, [], 1347]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
  });
  it('每題 (最短 / 次短 / 序列 / 本質不同)：3-1a、3-1b.shrink 不需轉動；3-1b 最短 1 (苗圃 ▲)、次短 2、序列 22、本質不同 16；預算 8', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues])).toEqual([
      ['3-1a', 0, null, 1, 1, 8, []], ['3-1b.shrink', 0, null, 1, 1, 8, []], ['3-1b', 1, 2, 22, 16, 8, []]
    ]);
  });
  it('拿掉「小」(苗圃一直卡著) → 3-1b 無解，可達排列只剩 20；拿掉卡榫 (深處也鬆開) = 2,520 (規格 5.4.9)', () => {
    const stuck = validateDial({ ...m, jams: [{ room: 'nursery' }, { room: 'depths' }] });
    expect([stuck.solvable, stuck.arrangements]).toEqual([false, 20]);
    expect(validateDial({ ...m, jams: [] }).arrangements).toBe(2520);
  });
});

describe('通關腳本 (runScript)', () => {
  it('解法一：啟動羅盤 → 拿比例尺 → 西盆貼「大」(3 > 2) → 花架門拉起 → 樹根貼「小」→ 苗圃 ▲ (第一次滑出原格) → 房間通關 → 花窗玻璃片一', () => {
    let cs = withRuler();
    expect([hasItem(cs.world, 'scale'), hasItem(cs.world, 'card.da'), hasItem(cs.world, 'card.xiao'), cs.world.msg])
      .toEqual([true, true, true, '刻度只有大和小。量過的東西，就照它長。字卡匣裡多了「大」「小」兩張尺度卡。']);
    cs = solveA(cs, 'W');
    expect([tiltOf(cs.world, get(cs, 'balance')), roomCleared(SPEC, cs.state, cs.world)]).toEqual(['W', false]);
    cs = solveB(cs);
    expect([roomCleared(SPEC, cs.state, cs.world), clearedRooms(SPEC, cs.state, cs.world), cs.state.turns!.left]).toEqual([true, ['nursery'], 7]);
    cs = takePane(cs);
    // 苗圃在 [0,0]：三扇門都接牆；滑回原格 (▼) 就接回入口與夜溫室
    expect(cs.world.ext.cube!.links).toEqual({ doorW: { to: 'wall' }, archE: { to: 'wall' }, archS: { to: 'wall' } });
    cs = play(cs, FLIP).cs;
    cs = ok(applyChapterCommand(cs, { t: 'turn', turn: T('c0', 'S') }));
    expect([pos(cs, 'nursery'), cs.world.ext.cube!.links.archE, cs.state.turns!.left]).toEqual(['01', { to: 'room', room: 'night', door: 'archW', kind: 'arch' }, 6]);
    const save = recordClear({ ...defaultSave(), cleared: ['2-5'], abilities: ['nib'] }, '3-1', cs.world);
    expect([save.cleared, save.abilities]).toEqual([['2-5', '3-1'], ['nib', 'scale']]); // 比例尺 = 能力 scale (同筆尖)
  });

  it('解法二：東盆貼「小」(2 > 1) 也一樣拉起花架門；「小」只有一張 → 取回來 (花秤閂住，門不關) 再拿去縮樹根', () => {
    let cs = solveA(withRuler(), 'E');
    expect(weightOf(cs.world, get(cs, 'potE'))).toBe(1);
    cs = play(cs, [uncard('scale:potE', 'card.xiao')]).cs;
    expect([hasItem(cs.world, 'card.xiao'), get(cs, 'trellis').used]).toEqual([true, true]);
    cs = solveB(cs);
    expect(roomCleared(SPEC, cs.state, cs.world)).toBe(true);
  });

  it('閂住：3-1a 之後取下尺度卡 → 秤回到平，花架門照樣開著 (used 不退)；之後再貼「大」到東盆 → 不再說「壓得更緊」', () => {
    let cs = solveA(withRuler(), 'W');
    cs = play(cs, [uncard('scale:potW', 'card.da')]).cs;
    expect([tiltOf(cs.world, get(cs, 'balance')), get(cs, 'trellis').used, get(cs, 'balance').used, cs.world.msg]).toEqual(['level', true, true, '尺度卡取了下來。它回到原來的大小。']);
    cs = play(cs, [...WALK2D(2.8), card('scale:potE', 'card.da')]).cs;
    expect([tiltOf(cs.world, get(cs, 'balance')), get(cs, 'trellis').used, cs.world.msgKey]).toEqual(['E', true, 'msg.scale.da']);
  });
});

describe('3-1a 一大一小 (P17)：錯誤嘗試與反例', () => {
  it('東盆貼「大」→ 秤往東倒、花架門壓得更緊 (不開)；西盆再貼「小」(1 < 3) 照樣往東；兩盆都沒貼 = 平 (不動)', () => {
    let cs = withRuler();
    expect(tiltOf(cs.world, get(cs, 'balance'))).toBe('level');
    cs = play(cs, [...AT_POT(2.8), card('scale:potE', 'card.da')]).cs;
    expect([tiltOf(cs.world, get(cs, 'balance')), get(cs, 'trellis').used, cs.world.msg]).toEqual(['E', false, '秤往東倒了。花架門被壓得更緊。']);
    cs = play(cs, [...WALK2D(0.4), card('scale:potW', 'card.xiao')]).cs;
    expect([tiltOf(cs.world, get(cs, 'balance')), get(cs, 'trellis').used]).toEqual(['E', false]);
  });

  it('實景想搬陶盆 → 「釘在秤盤上」；實景對花架門按 E → 說明 (繩子連著花秤)；花架門擋路 (實景走不進樹根角)', () => {
    const cs = withRuler();
    runScript(cs.world, [{ walkTo: [null, 0.4] }, { walkTo: [2.8, null] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('陶盆釘在秤盤上，搬不動。');
    runScript(cs.world, [{ walkTo: [4.0, null] }, { walkTo: [null, -3.4] }, { act: 'interact' }, { walkTo: [7.2, null] }]);
    expect([cs.world.msg, cs.world.player.x < 4.3]).toEqual(['花架門被藤纏著，壓得死緊。門頂的繩子，連著花秤。', true]);
  });

  it('只用 2D：比例尺在藏寶圖拿不到 (只在實景) → 沒有尺度卡；陶盆前按 E = 說明缺卡 (方槽空著、門邊的尺)', () => {
    const cs = play(start(), ACTIVATE).cs;
    runScript(cs.world, [{ walkTo: [-5.6, -1.7] }, ...FLIP, { act: 'interact' }]);
    // 藏寶圖裡比例尺不是互動目標 (只在實景拿)；E 讀到旁邊的劇情字條，尺還掛著
    expect([findTarget(cs.world)?.def.id, get(cs, 'ruler').gone, hasItem(cs.world, 'card.da')]).toEqual(['noteStory', false, false]);
    runScript(cs.world, [...WALK2D(0.4), { expect: w => expect(promptLabelTarget(w)?.def.id).toBe('potW'), label: '缺卡也提示「寫」' }, { act: 'interact' }]);
    expect([cs.world.msg, cs.world.events.some(e => e.t === 'labelOpen')]).toEqual(['標籤旁有一格空的方槽。門邊好像掛著一把能量東西的尺。', false]);
  });

  it('只用 3D：標籤只在藏寶圖 (實景 labelTarget = null、按 E 是搬陶盆)；字卡匣的標題 = 「大陶盆」、方槽填著「大」', () => {
    const cs = withRuler();
    runScript(cs.world, [{ walkTo: [null, 0.6] }, { walkTo: [0.4, null] }]);
    expect(labelTarget(cs.world)).toBeNull();
    runScript(cs.world, [...FLIP, card('scale:potW', 'card.da'), { wait: 0.05 }]);
    const tray = deriveCardTray(cs.world, TEXT, 0)!;
    expect([tray.title, tray.scale, tray.attached.map(a => a.glyph), tray.slots.map(s => s.glyph)]).toEqual(['大陶盆', true, ['大'], ['小', '', '']]);
  });
});

describe('3-1b 卡住的軌道 (P3)：卡榫、錯誤嘗試與反例', () => {
  it('S0：苗圃卡住 (所在房 = 機制掛點)：轉動模式的苗圃標頭 = 楔形 jammed、說「軌道卡住了。」、確認反灰；夜溫室照常', () => {
    const cs = play(withRuler(), FLIP).cs;
    expect(dialBlocked(cs, T('c3', 'N'))).toBe('jammed');
    const m = deriveTurnMode(cs, TEXT, T('c3', 'N'));
    expect([m.headers.map(h => [h.group, h.dir, h.state]), m.caption]).toEqual([[['c3', 'N', 'jammed'], ['c4', 'N', 'ok']], '苗圃往上滑：軌道卡住了。']);
  });

  it('不在場的房也卡 (ChapterSpec.jammed)：人在夜溫室 → 苗圃 ▲ = jammed；苗圃的樹根貼了「小」再過去 → 滑得動 (「從夜溫室滑走」不算 3-1b)', () => {
    let cs = play(withRuler(), [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [7.3, null] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('night');
    runScript(cs.world, FLIP);
    expect(dialBlocked(cs, T('c3', 'N'))).toBe('jammed');
    expect(dialBlocked({ ...cs, spec: { ...SPEC, jammed: undefined } }, T('c3', 'N'))).toBeNull(); // 沒注入 = 只查所在房 (骨架的行為)
    cs = solveB(solveA(withRuler(), 'W'));
    // 從夜溫室把苗圃滑出原格：要人在苗圃裡才算 (完成判定)
    let other = solveA(withRuler(), 'W');
    other = play(other, [...WALK2D(7.2), card('scale:root', 'card.xiao'), ...WALK2D(6.0), ...FLIP, { walkTo: [null, 0] }, { walkTo: [7.3, null] }, { act: 'interact' }]).cs;
    expect([other.state.room, other.state.labels['scale:root']]).toEqual(['night', ['card.xiao']]);
    runScript(other.world, FLIP);
    expect(dialBlocked(other, T('c3', 'N'))).toBeNull();
    other = ok(applyChapterCommand(other, { t: 'turn', turn: T('c3', 'N') }));
    expect([pos(other, 'nursery'), other.state.rooms.nursery.objs.find(o => o.id === 'root')!.used]).toEqual(['00', false]);
    expect(cs.state.room).toBe('nursery');
  });

  it('樹根貼「大」→ 長大了 (伸得更深)、仍卡住；狂點苗圃 = 一直說卡住了，墨不少', () => {
    let cs = solveA(withRuler(), 'W');
    cs = play(cs, [uncard('scale:potW', 'card.da'), ...WALK2D(7.2), card('scale:root', 'card.da')]).cs; // 「大」只有一張：從陶盆取回來 (閂住)
    expect([cs.world.msg, +(get(cs, 'root').z - get(cs, 'root').def.d / 2).toFixed(2), dialBlocked(cs, T('c3', 'N'))]).toEqual(['量過了。它照著刻度，長大了。', -5.6, 'jammed']);
    for (let i = 0; i < 5; i++) expect(applyChapterCommand(cs, { t: 'turn', turn: T('c3', 'N') })).toEqual({ blocked: 'jammed' });
    expect(cs.state.turns!.left).toBe(8);
  });

  it('只用 2D / 繞路：花架門沒開時藏寶圖走不過、樹根的標籤被花架蓋住 (實景走東側走道到樹根的 x 再切藏寶圖也貼不到)；花窗玻璃片只在實景拿', () => {
    const cs = withRuler();
    runScript(cs.world, [...AT_POT(0.4), ...WALK2D(7.2)]);
    expect([cs.world.player.x < 4.3, labelTarget(cs.world)?.def.id]).toEqual([true, 'potS']); // 最近的標籤是南拱門半座天平的陶盆 (3-3a；原為東盆)，不是樹根
    const around = withRuler();
    runScript(around.world, [{ walkTo: [null, 0] }, { walkTo: [7.2, null] }, ...FLIP, { act: 'interact' }]);
    expect([around.world.player.x > 7, labelTarget(around.world), around.world.events.some(e => e.t === 'labelOpen')]).toEqual([true, null, false]);
    let done = solveB(solveA(withRuler(), 'W'));
    done = play(done, [...WALK2D(7.2)]).cs;
    expect([findTarget(done.world)?.def.id ?? null, hasItem(done.world, 'pane.1')]).toEqual([null, false]); // 玻璃片在藏寶圖不是互動目標
  });

  it('只用 3D：樹根標籤只在藏寶圖、控制盤只在藏寶圖；3D 按 E 樹根 = 此刻的樣子 (伸出牆外 / 縮在牆內 / 縮回土裡)', () => {
    let cs = solveA(withRuler(), 'W');
    cs = play(cs, [...FLIP, ...TO_PANE, { walkTo: [7.2, -3.0] }]).cs;
    expect([labelTarget(cs.world), findTarget(cs.world)?.def.id]).toEqual([null, 'root']);
    runScript(cs.world, [{ act: 'interact' }]);
    expect(cs.world.msg).toBe('樹根從北牆鑽了出去，長進牆外的軌道。');
    cs = play(cs, [...FLIP, card('scale:root', 'card.xiao'), ...FLIP, { walkTo: [7.2, -3.0] }, { act: 'interact' }]).cs;
    expect(cs.world.msg).toBe('樹根縮在牆裡這一側。');
  });
});

describe('R / T、存檔、舊存檔相容', () => {
  it('R：回到本次進房時 (尺度卡回到字卡匣、花架門關上、樹根卡住)；T (物歸原處) 不影響 (沒有可推物)', () => {
    let cs = solveA(withRuler(), 'W');
    runScript(cs.world, [{ act: 'reset' }, { wait: 0.05 }]);
    expect(get(cs, 'trellis').used).toBe(true);
    cs = restartRoom(cs, OPTS);
    runScript(cs.world, [{ wait: 0.05 }]);
    // 羅盤已啟動 (R 不還原；同 noteFlag)；比例尺在進房之後才拿 → 退回掛板上
    expect([get(cs, 'trellis').used, hasItem(cs.world, 'card.da'), get(cs, 'ruler').gone, get(cs, 'potW').def.w, dialBlocked(cs, T('c3', 'N'))]).toEqual([false, false, false, 0.56, 'jammed']);
  });

  it('存檔往返：3-1a 完成、樹根貼「小」→ 寫檔 → 讀回：標籤、閂住的花秤、拉起的花架門、縮小的樹根 (第一步重算)、能力白名單含 scale', () => {
    let cs = solveA(withRuler(), 'W');
    cs = play(cs, [...WALK2D(7.2), card('scale:root', 'card.xiao')]).cs;
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['2-5'], abilities: ['nib', 'scale'] }, captureState(cs)));
    const loaded = loadSave(store);
    expect(loaded.abilities).toEqual(['nib', 'scale']);
    const back = openChapter(SPEC, chapterStart(loaded, SPEC, CH3.start), OPTS);
    runScript(back.world, [{ wait: 1 / 60 }]);
    expect([back.state.labels, get(back, 'balance').used, get(back, 'trellis').used, get(back, 'root').def.d, get(back, 'potW').def.w, dialBlocked(back, T('c3', 'N'))])
      .toEqual([{ 'scale:potW': ['card.da'], 'scale:root': ['card.xiao'] }, true, true, 0.8, 0.56 * 1.5, null]);
    expect(sanitizeSave({ ...defaultSave(), abilities: ['nib', 'scale', 'fly'] })!.abilities).toEqual(['nib', 'scale']);
  });

  it('舊存檔 (骨架版苗圃的快照：只有地板 / 門 / 羅盤，沒有標籤)：照常開章，新物件取關卡初值 (樹根卡住、花架門關著)；3-1 開放狀態不變', () => {
    const legacy = {
      cube: { pos: { nursery: [0, 1, 0], night: [1, 1, 0], gallery: [2, 1, 0], bed: [1, 2, 0], depths: [2, 2, 0] }, rot: { nursery: 0, night: 0, gallery: 0, bed: 0, depths: 0 } },
      rooms: { nursery: { objs: [{ id: 'floor', x: 0, y: -1, z: 0, gone: false, used: false, touched: false }, { id: 'dial', x: -3.6, y: 0, z: -3.7, gone: false, used: false, touched: false }], flags: [] } },
      at: { room: 'nursery', door: 'doorW' }, items: {}, flags: [], dial: true
    };
    const store = memoryStorage();
    store.set('puzzle:save', JSON.stringify({ ...defaultSave(), cleared: ['2-5'], abilities: ['nib'], chapters: { '3': legacy } }));
    const loaded = loadSave(store);
    const cs = openChapter(SPEC, chapterStart(loaded, SPEC, CH3.start), OPTS);
    runScript(cs.world, [{ wait: 1 / 60 }]);
    expect([cs.state.room, cs.state.dial, get(cs, 'floor').x, get(cs, 'trellis').used, cs.state.labels, levelState(levelById('3-1')!, loaded)]).toEqual(['nursery', true, 1, false, {}, 'open']);
    runScript(cs.world, FLIP);
    expect(dialBlocked(cs, T('c3', 'N'))).toBe('jammed');
  });

  it('換房往返：苗圃 (3-1a 完成) → 夜溫室 → 回苗圃：花架門還開著、標籤還在 (章節標籤)', () => {
    let cs = solveA(withRuler(), 'W');
    cs = play(cs, [...FLIP, { walkTo: [null, 0] }, { walkTo: [7.3, null] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('night');
    cs = enterRoom(cs, 'nursery', 'archE', OPTS);
    runScript(cs.world, [{ wait: 1 / 60 }]);
    expect([get(cs, 'trellis').used, cs.world.ext.labels, get(cs, 'potW').def.w]).toEqual([true, { 'scale:potW': ['card.da'] }, 0.56 * 1.5]);
  });
});

describe('音效 (USED_ON)：花秤閂住、花架門拉起、樹根鬆開', () => {
  it('LevelObserver：balance → 秤盤落下、trellis → 柵門聲、root → 木頭摩擦', () => {
    const snap = (objs: LevelSnap['objs']): LevelSnap => ({
      world: {}, room: 'nursery', mode: '2d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 8,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    const W = snap([]).world;
    obs.update({ ...snap([o('b', 'balance', false), o('t', 'trellis', false), o('r', 'root', false)]), world: W });
    const out = obs.update({ ...snap([o('b', 'balance', true), o('t', 'trellis', true), o('r', 'root', true)]), world: W });
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.plate.press', 'sfx.gate.open', 'sfx.crate.push']);
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = nursery.objects.filter(o => o.type === 'note');
describe('3-1 字條：3-1a / 3-1b L1 + 劇情字條「問號」(第三章預算：每關三張)、量表', () => {
  it('原文 (story-bible 7.3)；都有依託 (落地木柱)；提示字條 ≤ 謎題數 + 1、總數 ≤ 謎題數 + 3；H1 / H2 / H3 / H4 / H10；間距 ≥ 3', () => {
    expect(notes.map(o => [o.id, noteText(o), o.type === 'note' && o.mount, o.type === 'note' && o.revealAfter])).toEqual([
      ['noteStory', '這把尺，我量了很久。量出來的只有問號。', 'post', undefined],
      ['noteA', '坐蹺蹺板時，總是我那頭先落地。', 'post', undefined],
      ['noteB', '樹根不知道牆在哪裡。', 'post', undefined]
    ]);
    const hints = notes.filter(o => o.id !== 'noteStory');
    expect([hints.length <= nursery.puzzles!.length + 1, notes.length <= nursery.puzzles!.length + 3]).toEqual([true, true]);
    for (const o of notes) {
      const t = noteText(o);
      expect([...t].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
    }
    // H4 (keyObjects 的顯示名) + H10 (ahaTerms：量題 + 3-1b 的魔方題)
    const AHA = ['大', '小', '縮', '放大', '重', '秤', '滑', '空格', '轉', '軌道', '卡'];
    const KEYS = ['陶盆', '花秤', '比例尺', '尺度卡', '園丁羅盤', '控制盤', '花架門'];
    for (const o of hints) for (const term of [...AHA, ...KEYS]) expect([o.id, term, noteText(o).includes(term)]).toEqual([o.id, term, false]);
    for (const term of ['大', '小', '貼', '縮']) expect([term, noteText(def('noteStory')).includes(term)]).toEqual([term, false]);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it('兩個視角都讀得到 (3-1b 的字條：藏寶圖裡花架門關著也讀得到)', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const cs = start();
      runScript(cs.world, mode === '3d' ? [{ place: [o.x, 0, o.z + 0.6] }] : [{ place: [o.id === 'noteB' ? 4.1 : o.x, 0, 0], mode: '2d' }]);
      expect([o.id, mode, findTarget(cs.world)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(cs.world);
      expect(cs.world.msg).toBe(noteText(o));
    }
  });
});

describe('捷徑掃描 (取樣；每個尺度檔)', () => {
  // 花架門關著時：實景 / 藏寶圖都走不進樹根角、花架門不會自己開、玻璃片不出現 (樹根 / 陶盆的每一檔各掃一次)
  // 實景走不進樹根角；藏寶圖裡樹根的標籤不出現 (花架門關著 = 被蓋住)
  const inNook = { id: 'nook3d', holds: (w: World) => w.player.mode === '3d' && w.player.x > 4.75 && w.player.z < -2.6 };
  const rootLabel = { id: 'rootLabel', holds: (w: World) => labelTarget(w)?.def.id === 'root' };
  for (const tier of [[], ['card.da'], ['card.xiao']]) {
    it(`樹根 / 西盆 = ${tier[0] ?? '原尺寸'}、東盆同檔 (秤持平)：沒有捷徑`, () => {
      const r = scanShortcuts({
        level: nursery, mechanics: DEFAULT_MECHANICS, text: TEXT,
        setup: w => { w.ext = { labels: tier.length ? { 'scale:root': tier, 'scale:potW': tier, 'scale:potE': tier } : {} }; },
        movable: [],
        playerAt: [{ x: -3, y: 0, z: 1.5 }, { x: 3.8, y: 0, z: -3.4 }, { x: 4.1, y: 0, z: -1.6 }, { x: 7.2, y: 0, z: -1.5 }, { x: 6.0, y: 0, z: 0 }],
        probes: [
          [{ walkTo: [7.4, null] }, { walkTo: [null, -3.6] }],
          [{ walkTo: [null, -3.6] }, { walkTo: [7.4, null] }],
          [{ hop: 1, until: () => false, seconds: 2.5, optional: true }],
          [{ hold: { moveZ: -1, jump: true }, seconds: 2 }, { hop: 1, until: () => false, seconds: 1.5, optional: true }],
          [{ act: 'interact' }, { act: 'flip' }, { wait: 0.2 }, { act: 'interact' }]
        ],
        forbidden: ['used:trellis', 'used:root', 'item:pane.1', inNook, rootLabel]
      });
      expect([r.hits, r.runs > 0]).toEqual([[], true]);
    });
  }
});

describe('validateDial：卡榫 jams 的語意 (until / from)', () => {
  it('until = 那一題完成前卡住、from = 完成後卡住；轉動與多解列舉都跳過卡住的房', () => {
    const goal = (id: string, needs: string[] = []) => ({ id, room: 'nursery', needs, teaching: true });
    const away = { id: 'away', room: 'nursery', needs: ['key'], teaching: true, goal: (s: { pos: Record<string, readonly number[]> }, f: ReadonlySet<string>) => f.has('key') && !(s.pos.nursery[0] === 0 && s.pos.nursery[1] === 1) };
    const home = (s: { pos: Record<string, readonly number[]> }) => s.pos.nursery[0] === 0 && s.pos.nursery[1] === 1;
    const base = dialModelOf(CH3_ZONE31.cube, CH3.rooms, [{ ...goal('key'), goal: home }, away], 'nursery', 'away');
    expect(validateDial({ ...base, jams: [{ room: 'nursery', until: 'key' }] }).perPuzzle.find(p => p.id === 'away')!.shortest).toBe(1);
    expect(validateDial({ ...base, jams: [{ room: 'nursery', from: 'key' }] }).solvable).toBe(false);
    expect(validateDial({ ...base, jams: [{ room: 'night', from: 'key' }] }).solvable).toBe(true);
  });
});
