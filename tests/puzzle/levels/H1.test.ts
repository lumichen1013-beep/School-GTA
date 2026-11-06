// H1 夾層 (規格 6「H1 夾層（細化）」；第二章隱藏房，第三章取得比例尺後回來做)：資料與驗證器、擺設、高度與距離 (D10)、H1 區 validateDial、
// 兩種轉法 (列先 / 行先)、錯誤嘗試與沒有比例尺、只用 2D / 3D、盲轉、補發尺度卡、字卡匣分頁、R、存檔與舊存檔、字條、捷徑掃描、選單、音效
import { describe, it, expect } from 'vitest';
import { mezz } from '../../../src/puzzle/content/levels/ch2/H1-mezz';
import { print } from '../../../src/puzzle/content/levels/ch2/2-3-print';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH2_CUBE, CH2_ZONEH1, MEZZ_BACK } from '../../../src/puzzle/content/cubes/ch2';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { chapterSpecOf, DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { CARDS, isCard, labelTarget, promptLabelTarget, TRAY_SLOTS } from '../../../src/puzzle/mechanics/labels';
import { effectiveFactor } from '../../../src/puzzle/mechanics/scale';
import { turnModeDenied } from '../../../src/puzzle/mechanics/dial';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { isActiveIn } from '../../../src/puzzle/core/presence';
import { GRAVITY, JUMP_V_2D, JUMP_V_3D } from '../../../src/puzzle/core/constants';
import { applyTurn, cubeKey, initialCube, isBlocked, links, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import {
  applyChapterCommand, arrivalBlocker, captureState, doorArrival, newChapterState, openChapter, restartRoom, roomCleared,
  type ChapterSession, type ChapterState
} from '../../../src/puzzle/core/chapter';
import { createWorld } from '../../../src/puzzle/core/world';
import type { GameEvent, ObjDef, World } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCardTray, labelTab, shiftTab, slotCommand } from '../../../src/puzzle/app/cardTrayModel';
import { chapterSave, chapterStart, grantScaleCards, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave, type Save } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { chapterClearAlso, levelState, listedInMenu, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts } from '../../../src/puzzle/devtools/shortcutScan';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { areaPairs, dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { GAME_EVENT_TYPES, LevelObserver, SCARE_SFX, worldEventActions, type LevelSnap } from '../../../src/puzzle/audio/events';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC = chapterSpecOf(CH2);
const def = (id: string): ObjDef => mezz.objects.find(o => o.id === id)!;
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const pos = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].slice(0, 2).join('');
const T = (group: string, dir: 1 | -1 = 1): Turn => ({ group, dir });
const SLOT = 'scale:innerShelf';
const FLIP: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];
const to3d = (w: World): Cmd[] => (w.player.mode === '2d' ? FLIP : []);
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });

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
/** 切到藏寶圖、站穩 → 依序轉 (控制盤) → 切回實景 */
function turns(cs: ChapterSession, ts: Turn[]): ChapterSession {
  runScript(cs.world, [...(cs.world.player.mode === '3d' ? FLIP : [])]);
  for (const t of ts) { const r = applyChapterCommand(cs, { t: 'turn', turn: t }); if ('blocked' in r) throw new Error(`${t.group} ${t.dir}: ${r.blocked}`); cs = r; }
  runScript(cs.world, FLIP);
  return cs;
}
/** 實景站到門內側 0.3、對門按 E (門要是最近的目標) */
function door(cs: ChapterSession, id: string): { cs: ChapterSession; kinds: string[] } {
  const o = get(cs, id);
  const side = SPEC.doors.find(d => d.room === cs.state.room && d.door === id)!.side;
  const k = 0.3;
  const x = side === 'W' ? o.x + o.def.w / 2 + k : side === 'E' ? o.x - o.def.w / 2 - k : o.x;
  const z = side === 'N' ? o.z + o.def.d / 2 + k : side === 'S' ? o.z - o.def.d / 2 - k : o.z;
  return play(cs, [...to3d(cs.world), { place: [x, o.y, z] }, { wait: 0.1 }, { expect: w => expect(findTarget(w)?.def.id).toBe(id), label: `${cs.state.room}.${id}` }, { act: 'interact' }]);
}
const through = (cs: ChapterSession, id: string, room: string): ChapterSession => {
  const r = door(cs, id);
  expect([r.kinds, r.cs.state.room]).toEqual([['enter'], room]);
  return r.cs;
};
/** 前廳：走到書櫃標籤前 (x −1.0；藏寶圖裡書櫃擋在 x ≥ −0.7)、切到藏寶圖、按 E 開字卡匣、貼卡 → 切回實景 */
const LABEL_SPOT: Cmd[] = [{ wait: 0.1 }, { walkTo: [-1.0, -1.9] }, ...FLIP, { expect: w => expect(labelTarget(w)?.def.id).toBe('innerShelf'), label: '書櫃標籤' }];
const shrink = (cs: ChapterSession, c = 'card.xiao') => play(cs, [...LABEL_SPOT, { act: 'interact' }, card(SLOT, c), { wait: 1 / 30 }, ...FLIP]);
/** 後面：走到小書桌前 (實景) 按 E */
const DESK: Cmd[] = [{ wait: 0.1 }, { walkTo: [-4.0, -3.7] }, { expect: w => expect(findTarget(w)?.def.id).toBe('desk'), label: '小書桌' }, { act: 'interact' }];

const snapObj = (id: string) => ({ id, x: 0, y: 0, z: 0, gone: false, used: true, touched: false });
/** 第二章通關時的章節狀態 (S0、人在書房深處；鎖扣全開、門牌「間」、2-2b 貼著「內」；手上：外、前、才) */
function ch2Cleared(o: { cube?: CubeState; room?: string; door?: string | null; items?: Record<string, number>; labels?: Record<string, string[]>; rooms?: ChapterState['rooms'] } = {}): ChapterState {
  const st = newChapterState(SPEC, o.room ?? 'deep', o.door === undefined ? 'doorW' : o.door);
  return {
    ...st, cube: o.cube ?? initialCube(CH2_CUBE), dial: true, unlocked: ['row1', 'col0', 'col1', 'col2'],
    labels: o.labels ?? { 'plate:print': ['card.ri'], 'couplet:reading': ['card.nei'] },
    rooms: o.rooms ?? { print: { objs: [snapObj('plateS'), snapObj('typeCase')], flags: [] }, shelf: { objs: [snapObj('bookend')], flags: [] }, reading: { objs: [snapObj('lower')], flags: [] } },
    items: o.items ?? { 'card.wai': 1, 'card.qian': 1, 'card.cai': 1, 'key.study': 1, 'scrap.1': 1 }
  };
}
const CH2_DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4', '2-5'];
const saveOf = (st: ChapterState, scale = true): Save => ({ ...defaultSave(), cleared: scale ? [...CH2_DONE, '3-1'] : CH2_DONE, abilities: scale ? ['nib', 'scale'] : ['nib'], scraps: [1], chapters: { '2': chapterSave(st) } });
/** 從存檔回到第二章 (選單選 H1 / 第二章任一關 = 接著 chapters['2'])：開章 → 補發尺度卡 → 建房 */
function back(save: Save): { cs: ChapterSession; granted: string[] } {
  const g = grantScaleCards(save, CH2, chapterStart(save, SPEC, CH2.start));
  return { cs: openChapter(SPEC, g.state, OPTS), granted: g.granted };
}

describe('H1 夾層：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；登錄表 H1 (hidden、前置 3-1、第二章)、CH2.levels.H1 = mezz、CHAPTERS 第二章排在 2-5 之後；尺寸、主題、墨；puzzles = [H1]；旁白 / 通關', () => {
    expect(validateLevel(mezz, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] })).toEqual([]);
    expect(validateEntry(levelById('H1')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    const e = levelById('H1')!;
    expect([e.chapter, e.unlock.after, e.abilities, e.hidden, e.load()]).toEqual([2, ['3-1'], ['nib'], true, mezz]);
    expect([CH2.levels.H1, cubeChapterOf('H1'), CH2.scaleCards, CHAPTERS.find(c => c.id === 2)!.levels.slice(-2)]).toEqual(['mezz', CH2, true, ['2-5', 'H1']]);
    expect([mezz.id, mezz.bounds, mezz.theme, mezz.turnBudget, mezz.puzzles!.map(p => [p.id, TEXT(p.titleKey)])]).toEqual(['H1', { minX: -6, maxX: 6, minZ: -5, maxZ: 5 }, 'study', { base: 6 }, [['H1', 'H1 書櫃後面']]]);
    expect([TEXT(mezz.titleKey), TEXT(mezz.narrationKey), TEXT(mezz.nextKey)]).toEqual(['夾層', '書櫃後面，還有一面書櫃。', '老宅圖又多了一角。圖上，這間夾層一直都在。']);
    // 門位與占位版相同：西門 x −5.8 (門旁活字 火)、北牆洞位 (0, −4.8)
    const W = def('doorW'), N = def('holeN');
    expect([W.type === 'cubeDoor' && [W.side, W.kind, W.glyph], W.x, W.z, N.type === 'cubeDoor' && [N.side, N.kind, N.hole], N.x, N.z]).toEqual([['W', 'door', 'term.glyph.huo'], -5.8, 0, ['N', 'arch', true], 0, -4.8]);
    expect([def('desk').doneFlag, def('desk').type === 'diaryStand' && [def('desk').gives, def('desk').look], def('innerShelf').blockText]).toEqual(['H1', ['scrap.4', 'desk'], 'lvl.H1.shelf.block']);
  });

  it('擺設：layoutDepthIssues = []；分帶 (後 = 書牆 / 書櫃 / 書桌、中 = 西門、前 = 字條)；實體 = 地板、書牆 (只在實景)、書櫃；2-4a 屋頂右那一角不動', () => {
    expect(layoutDepthIssues(mezz)).toEqual([]);
    const band = (o: ObjDef) => (o.z < -2 ? 'back' : o.z > 2 ? 'front' : 'mid');
    expect(['bookWall', 'innerShelf', 'desk', 'holeN'].map(id => band(def(id)))).toEqual(Array(4).fill('back'));
    expect([band(def('doorW')), ...['noteA', 'noteA2', 'noteS'].map(id => band(def(id)))]).toEqual(['mid', 'front', 'front', 'front']);
    expect(mezz.objects.filter(o => o.solid).map(o => [o.id, o.visible])).toEqual([['floor', 'both'], ['bookWall', '3d'], ['innerShelf', 'both']]);
    expect(mezz.objects.filter(o => o.pushable)).toEqual([]);
    expect(mezz.decor!.find(d => d.kind === 'floorPiece')).toMatchObject({ x: 2.6, z: 2.4, px: 2, py: 0 });
    // 家具成組、有朝向：扶手椅面向北邊的書牆 (rot π)、落地燈在椅旁；小凳 / 壁燈在小書桌旁
    expect(mezz.decor!.filter(d => ['armchair', 'floorLamp', 'bookCart', 'stool', 'wallLamp', 'bookPile'].includes(d.kind)).map(d => d.kind)).toEqual(['armchair', 'floorLamp', 'bookCart', 'stool', 'wallLamp', 'bookPile', 'bookPile']);
    expect(mezz.decor!.find(d => d.kind === 'armchair')!.rot).toBeCloseTo(Math.PI);
  });

  it('高度與距離 (D10)：書牆 3.0 > 實景跳 1.25、藏寶圖跳 1.6 + 0.15 < 書櫃 2.6；洞的到達處 (0, −3.7)：原尺寸堵住、「小」讓開 0.2；「大」壓進書牆；前廳到書桌 1.85 > 1.5', () => {
    const h3 = JUMP_V_3D ** 2 / (2 * GRAVITY), h2 = JUMP_V_2D ** 2 / (2 * GRAVITY);
    expect([h3 < def('bookWall').h, h2 + 0.15 < def('innerShelf').h]).toEqual([true, true]);
    const st = ch2Cleared({ room: 'mezz', door: 'holeN' });
    expect(arrivalBlocker(SPEC, st, OPTS)).toBe('innerShelf');
    expect(arrivalBlocker(SPEC, { ...st, labels: { ...st.labels, [SLOT]: ['card.xiao'] } }, OPTS)).toBe(null);
    const s = def('innerShelf');
    expect([+(s.x - (s.w * 0.5) / 2 - 0.3).toFixed(3), +(s.x - s.w / 2).toFixed(3)]).toEqual([0.2, -0.4]); // 小：西緣 0.5 − 玩家半寬 0.3 = 讓開 0.2；原尺寸西緣 −0.4 (玩家盒 x ≤ 0.3)
    expect([+(s.z - (s.d * 1.5) / 2).toFixed(3), +(s.z + (s.d * 1.5) / 2).toFixed(3)]).toEqual([-4.85, -2.75]);   // 大：z∈[−4.85, −2.75] 與書牆 z∈[−3.0, −2.4] 重疊
    // 前廳最靠北的站位 (書牆 z −2.4 − 玩家半寬) 到書桌盒 (z ≤ −3.95)
    const w = createWorld(mezz, OPTS);
    runScript(w, [{ place: [-4.4, 0, 1] }, { wait: 0.1 }, { walkTo: [-4.4, -4.5] }]);
    expect([+w.player.z.toFixed(2), +(w.player.z - (def('desk').z + def('desk').d / 2)).toFixed(2), findTarget(w)?.def.id]).toEqual([-2.1, 1.85, 'bookWall']);
    interact(w);
    expect([w.msg, hasItem(w, 'scrap.4')]).toEqual(['一整面書牆，書背都朝著牆。牆後面，好像還有一點空間。', false]);
  });

  it('字條與標籤不搶 E：前廳在藏寶圖貼標籤的站位 x∈[−1.55, −0.7] 最近的是書櫃標籤、不是字條；L1 盒離得 1.5 以上', () => {
    for (const x of [-1.55, -1.0, -0.7]) {
      const w = createWorld(mezz, OPTS);
      runScript(w, [{ place: [x, 0, -1.9], mode: '2d' }, { wait: 0.1 }]);
      expect([x, findTarget(w)?.def.id ?? null, labelTarget(w)?.def.id]).toEqual([x, null, 'innerShelf']);
    }
    const w = createWorld(mezz, OPTS);
    runScript(w, [{ place: [-1.55, 0, -1.9], mode: '2d' }, { wait: 0.1 }, { hold: { moveX: 1 }, seconds: 1 }]);
    expect(w.player.x).toBeCloseTo(-0.7, 3); // 藏寶圖裡書櫃 (原尺寸) 擋在 x ≥ −0.7
  });
});

describe('validateDial：H1 區 (CH2_ZONEH1；夾層的前廳 / 後面以 areas 表示)', () => {
  const m = { ...dialModelOf(CH2_ZONEH1.cube, CH2.rooms, CH2_ZONEH1.puzzles, CH2_ZONEH1.start, CH2_ZONEH1.finish, { areas: CH2_ZONEH1.areas }), plates: CH2_ZONEH1.plates };
  const r = validateDial(m);
  it('可達排列 720、抽象狀態 127,432、卡死 0 (含 R)、需要 R / 補墨 9,790；預算繞過 / 鎖扣 / 入口 / 前置繞過無問題', () => {
    expect([r.arrangements, r.states, r.solvable, r.deadlocks, r.needsRestart]).toEqual([720, 127432, true, [], 9790]);
    expect([r.issues, r.budgetBypass, r.lockIssues, r.entryIssues]).toEqual([[], [], [], []]);
    expect(m.rooms.mezzBack).toEqual({ budget: 6 }); // 區的預算 = 所在房
  });
  it('每題 (最短 / 次短 / 序列 / 本質不同 / 預算)：2-1a 1/2/3/3/6、2-3a 1/1/2/2/6、H1.shrink 2/2/710/115/6、H1 2/3/466/153/6；確定性', () => {
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.solutions, p.distinct, p.budget, p.issues])).toEqual([
      ['2-1a', 1, 2, 3, 3, 6, []], ['2-3a', 1, 1, 2, 2, 6, []], ['H1.shrink', 2, 2, 710, 115, 6, []], ['H1', 2, 3, 466, 153, 6, []]
    ]);
    expect(validateDial(m)).toEqual(r);
  });
  it('拿掉關鍵要素 → 無解：門牌 (不讀作「間」)、不量 (後面一直進不來)、夾層沒有西門、只有列轉 (827 個狀態)', () => {
    expect(validateDial({ ...m, plates: [] }).solvable).toBe(false);
    expect(validateDial({ ...m, areas: [{ ...MEZZ_BACK, opensWhen: 'never' }] }).solvable).toBe(false);
    expect(validateDial({ ...m, doors: m.doors.filter(d => !(d.room === 'mezz' && d.door === 'doorW')) }).solvable).toBe(false);
    const rows = validateDial({ ...m, cube: { ...m.cube, dial: { ...m.cube.dial!, groups: m.cube.dial!.groups.filter(g => g.kind === 'row') } } });
    expect([rows.solvable, rows.states]).toEqual([false, 827]);
  });

  // 720 種排列 (列 + 行)
  const opts = CH2_CUBE.dial!.groups.flatMap(g => turnDirs(CH2_CUBE, g.id).map(dir => ({ group: g.id, dir })));
  const all = (() => {
    const seen = new Map<string, CubeState>([[cubeKey(initialCube(CH2_CUBE)), initialCube(CH2_CUBE)]]);
    const q = [...seen.values()];
    while (q.length) { const s = q.shift()!; for (const o of opts) { const n = applyTurn(CH2_CUBE, s, o); if (!isBlocked(n) && !seen.has(cubeKey(n))) { seen.set(cubeKey(n), n); q.push(n); } } }
    return [...seen.values()];
  })();
  const plates = new Set(['print.archS']);
  const pairs = (s: CubeState, open: boolean) => areaPairs(m, links(CH2_CUBE, s, m.doors, plates), new Set(open ? ['H1.shrink'] : []));
  const reach = (s: CubeState, from: string, open: boolean): Set<string> => {
    const ps = pairs(s, open), seen = new Set([from]), q = [from];
    while (q.length) { const x = q.shift()!; for (const [a, b] of ps) if (a === x && !seen.has(b)) { seen.add(b); q.push(b); } }
    return seen;
  };
  it('前廳 ↔ 後面同時接通的排列 0 / 720 (西門接著別的房 288、洞接著印房 72)：不存在「一次排好、走一圈」的解', () => {
    const west = all.filter(s => links(CH2_CUBE, s, m.doors, plates).some(l => l.from.room === 'mezz' && l.from.door === 'doorW' && 'room' in l.to)).length;
    const hole = all.filter(s => links(CH2_CUBE, s, m.doors, plates).some(l => l.from.room === 'mezz' && l.from.door === 'holeN' && 'room' in l.to)).length;
    const both = all.filter(s => reach(s, 'mezz', true).has('mezzBack')).length;
    expect([all.length, west, hole, both]).toEqual([720, 288, 72, 0]);
  });

  it('回到第二章 (書房深處在 [2,1] 的 120 種排列、人在深處、全解鎖、不計墨)：量 + 進洞的總轉動最少 2～5 (2：10、3：51、4：57、5：2；平均 3.42)；S0 = 4', () => {
    const index = new Map(all.map((s, i) => [cubeKey(s), i]));
    const next = all.map(s => opts.map(o => { const n = applyTurn(CH2_CUBE, s, o); return isBlocked(n) ? -1 : index.get(cubeKey(n))!; }));
    // 0-1 BFS：節點 = (排列, 所在節點, 是否已量)；走路 0、轉動 1
    const minTurns = (a0: number): number => {
      const key = (a: number, at: string, shrunk: boolean) => `${a}|${at}|${shrunk ? 1 : 0}`;
      const dist = new Map<string, number>([[key(a0, 'deep', false), 0]]);
      const dq: Array<[number, string, boolean]> = [[a0, 'deep', false]];
      while (dq.length) {
        const [a, at, sh] = dq.shift()!;
        const d = dist.get(key(a, at, sh))!;
        if (sh && at === 'mezzBack') return d;
        const zero: Array<[number, string, boolean]> = [...reach(all[a], at, sh)].map(x => [a, x, sh] as [number, string, boolean]);
        if (at === 'mezz' && !sh) zero.push([a, at, true]);
        for (const n of zero) { const k = key(...n); if (!dist.has(k) || dist.get(k)! > d) { dist.set(k, d); dq.unshift(n); } }
        for (const a2 of next[a]) { if (a2 < 0) continue; const k = key(a2, at, sh); if (!dist.has(k) || dist.get(k)! > d + 1) { dist.set(k, d + 1); dq.push([a2, at, sh]); } }
      }
      return Infinity;
    };
    const starts = all.map((s, i) => [s, i] as const).filter(([s]) => s.pos.deep[0] === 2 && s.pos.deep[1] === 1);
    const counts: Record<number, number> = {};
    let sum = 0;
    for (const [, i] of starts) { const t = minTurns(i); counts[t] = (counts[t] ?? 0) + 1; sum += t; }
    expect([starts.length, counts, +(sum / starts.length).toFixed(2), minTurns(0)]).toEqual([120, { 2: 10, 3: 51, 4: 57, 5: 2 }, 3.42, 4]);
  });

  it('盲轉取樣 (1,000 次、墨 6)：剛量完、人留在前廳隨機轉 = 0；每轉一次前隨機走到一間走得到的房 = 0.115 (記錄)', () => {
    let seed = 2468;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const legal = (s: CubeState) => opts.map(o => applyTurn(CH2_CUBE, s, o)).filter((n): n is CubeState => !isBlocked(n));
    // 起點 = 列先的量完 (上列 ▶、下列 ◀、第 1 行 ⇅：夾層在 [2,1]、西門接迴廊)
    let s0 = initialCube(CH2_CUBE);
    for (const t of [T('row0', 1), T('row1', -1), T('col1', 1)]) s0 = applyTurn(CH2_CUBE, s0, t) as CubeState;
    const sample = (wander: boolean) => {
      let wins = 0;
      for (let n = 0; n < 1000; n++) {
        let s = s0, at = 'mezz', won = false;
        for (let k = 0; k <= 6 && !won; k++) {
          // 每轉一次前：隨機走到一間此刻走得到的房 (含原地)；走到後面 = 成功
          if (wander) { const rs = [...reach(s, at, true)].sort(); at = rs[Math.floor(rnd() * rs.length)]; }
          won = at === 'mezzBack';
          if (won || k === 6) break;
          const L = legal(s); s = L[Math.floor(rnd() * L.length)];
        }
        if (won) wins++;
      }
      return wins / 1000;
    };
    const stay = sample(false), wander = sample(true);
    // 設計原型記錄 0.083 (取樣方式不同：這裡每一步都可以原地不走、走到後面即算成功)；確定性取樣值鎖定
    expect([stay, wander]).toEqual([0, 0.115]);
  });
});

describe('H1 書櫃後面：兩種轉法 (從第二章通關的存檔、S0、人在書房深處、能力 scale)', () => {
  /** 量小 + 拿殘片 (共同的後半段) */
  function finish(cs: ChapterSession): ChapterSession {
    const r = play(cs, DESK);
    expect([r.done, hasItem(r.cs.world, 'scrap.4'), get(r.cs, 'desk').used, r.cs.world.msg]).toEqual([['H1'], true, true, '又一角老宅圖。背面有一筆，和一行小字：「我小時候，躲在這裡。」']);
    expect(roomCleared(SPEC, r.cs.state, r.cs.world)).toBe(true);
    return r.cs;
  }
  function measure(cs: ChapterSession): ChapterSession {
    const r = shrink(cs);
    expect([r.cs.world.msg, r.cs.world.ext.labels![SLOT], hasItem(r.cs.world, 'card.xiao'), +get(r.cs, 'innerShelf').def.w.toFixed(2)]).toEqual(['量過了。它照著刻度，縮小了。', ['card.xiao'], false, 1.8]);
    // 量小之後前廳照樣過不去 (書牆擋著)
    runScript(r.cs.world, [{ walkTo: [-1.0, -4.5] }]);
    expect(r.cs.world.player.z).toBeGreaterThan(-2.2);
    return r.cs;
  }
  const record = (cs: ChapterSession, save: Save) => {
    const s = recordClear(save, 'H1', cs.world);
    expect([s.cleared.includes('H1'), s.scraps, nextAfterClear('H1', 'room', CHAPTERS)]).toEqual([true, [1, 4], 'H1']);
    // 之後章門再打開一次 (整章通關)：記入的關卡不含 H1
    const again = recordClear({ ...save, cleared: CH2_DONE }, '2-5', cs.world, chapterClearAlso(CH2.levels));
    expect(again.cleared.includes('H1')).toBe(false);
  };

  it('列先 (4 轉)：上列 ▶、下列 ◀、第 1 行 ⇅ → 深處 → 印房 → 南拱門 → 手稿庫 → 迴廊 → 前廳 → 量 → 走回印房、下列 ▶ → 南拱門穿洞 → 書桌 = 殘片 4、房間通關', () => {
    const save = saveOf(ch2Cleared());
    let { cs, granted } = back(save);
    expect([cs.state.room, granted, hasItem(cs.world, 'card.da'), hasItem(cs.world, 'card.xiao')]).toEqual(['deep', ['card.da', 'card.xiao'], true, true]);
    cs = turns(cs, [T('row0', 1), T('row1', -1), T('col1', 1)]);
    expect([pos(cs, 'mezz'), pos(cs, 'shelf'), cs.state.turns!.left]).toEqual(['21', '11', 3]);
    cs = through(cs, 'doorW', 'print');
    cs = through(cs, 'archS', 'manuscripts');
    cs = through(cs, 'doorE', 'shelf');
    cs = through(cs, 'doorE', 'mezz');
    expect(cs.state.door).toBe('doorW');
    cs = measure(cs);
    cs = through(cs, 'doorW', 'shelf');
    cs = through(cs, 'doorW', 'manuscripts');
    cs = through(cs, 'doorN', 'print');
    cs = turns(cs, [T('row1', 1)]);
    expect([pos(cs, 'mezz'), pos(cs, 'print'), cs.world.ext.cube!.links.archS]).toEqual(['01', '00', { to: 'room', room: 'mezz', door: 'holeN', kind: 'arch' }]);
    cs = through(cs, 'archS', 'mezz');
    expect([cs.state.door, cs.world.player.z < -3.0]).toEqual(['holeN', true]);
    record(finish(cs), save);
  });

  it('行先 (4 轉)：第 0 行 ⇅、上列 ◀ → 深處 → 手稿庫 → 印房 → 前廳 → 量 → 走回書房深處、第 2 行 ⇅、下列 ◀ → 深處西門 → 印房 → 南拱門穿洞 → 書桌', () => {
    const save = saveOf(ch2Cleared());
    let { cs } = back(save);
    cs = turns(cs, [T('col0', 1), T('row0', -1)]);
    expect([pos(cs, 'mezz'), pos(cs, 'print')]).toEqual(['20', '10']);
    cs = through(cs, 'doorW', 'manuscripts');
    cs = through(cs, 'doorN', 'print');
    cs = through(cs, 'doorE', 'mezz');
    cs = measure(cs);
    cs = through(cs, 'doorW', 'print');
    cs = through(cs, 'archS', 'manuscripts');
    cs = through(cs, 'doorE', 'deep');
    cs = turns(cs, [T('col2', 1), T('row1', -1)]);
    expect([pos(cs, 'deep'), pos(cs, 'mezz'), pos(cs, 'print')]).toEqual(['20', '11', '10']);
    cs = through(cs, 'doorW', 'print');
    cs = through(cs, 'archS', 'mezz');
    record(finish(cs), save);
  });
});

/** 夾層在 [0,1]、印房在正上方 [0,0] (S0 + 上列 ▶) 的印房 (從東門進)；scale = 有比例尺 (補發)；shrunk = 書櫃已貼「小」 */
function printAbove(o: { scale?: boolean; shrunk?: boolean } = {}): ChapterSession {
  const cube = applyTurn(CH2_CUBE, initialCube(CH2_CUBE), T('row0', 1)) as CubeState;
  const base = ch2Cleared({ cube, room: 'print', door: 'doorE' });
  const st = o.shrunk ? { ...base, labels: { ...base.labels, [SLOT]: ['card.xiao'] } } : base;
  return back(saveOf(st, o.scale ?? true)).cs;
}
/** 夾層的前廳 (西門接迴廊：S0 + 上列 ▶ + 下列 ◀ + 第 1 行 ⇅)，從西門進 */
function front(o: { scale?: boolean } = {}): ChapterSession {
  let cube = initialCube(CH2_CUBE);
  for (const t of [T('row0', 1), T('row1', -1), T('col1', 1)]) cube = applyTurn(CH2_CUBE, cube, t) as CubeState;
  return back(saveOf(ch2Cleared({ cube, room: 'mezz', door: 'doorW' }), o.scale ?? true)).cs;
}

describe('錯誤嘗試與沒有比例尺', () => {
  it('第二章時 (沒有比例尺 = 不補發)：無解，兩個入口都有回饋——書櫃標籤缺卡 (手上只有詞卡 / 部件卡也不開匣)、洞被書櫃的背板堵住', () => {
    const cs = front({ scale: false });
    expect([hasItem(cs.world, 'card.da'), hasItem(cs.world, 'card.xiao'), hasItem(cs.world, 'card.cai')]).toEqual([false, false, true]);
    let r = play(cs, [...LABEL_SPOT, { act: 'interact' }]);
    expect([promptLabelTarget(r.cs.world)?.def.id, r.cs.world.msgKey, r.cs.world.msg, r.cs.world.events.length]).toEqual(['innerShelf', 'lvl.H1.slot.empty', '書櫃旁邊有一格空的方槽。像在等一把尺。', 0]);
    expect(deriveCardTray(r.cs.world, TEXT, 0)).toBeNull();
    const p = printAbove({ scale: false });
    r = door(p, 'archS');
    expect([r.kinds, r.cs.state.room, r.cs.world.msg]).toEqual([['blocked'], 'print', '洞的另一邊，貼著一面書櫃的背板。過不去。']);
    expect(doorArrival(r.cs, 'archS')).toEqual({ by: 'innerShelf', blockText: 'lvl.H1.shelf.block' });
  });

  it('貼「大」：壓進書牆 → 「這裡放不下。」、卡片退回 (字卡匣播無效字回饋)；量小之前從洞進 = 還是堵著', () => {
    const cs = front();
    runScript(cs.world, [...LABEL_SPOT, { act: 'interact' }, card(SLOT, 'card.da'), { wait: 1 / 30 }]);
    expect([cs.world.msg, hasItem(cs.world, 'card.da'), cs.world.ext.labels![SLOT], get(cs, 'innerShelf').def.w, cs.world.events.filter(e => e.t === 'card')]).toEqual(['這裡放不下。', true, undefined, 3.6, [{ t: 'card', label: SLOT, ok: false }]]);
    expect(door(printAbove(), 'archS').kinds).toEqual(['blocked']);
  });

  it('量小了就在前廳找路 (書牆照樣擋著；藏寶圖裡站在書櫃頂上切回實景也落回前廳)、在藏寶圖拿殘片 (看得見，卻碰不到)', () => {
    const cs = shrink(front()).cs;
    runScript(cs.world, [{ walkTo: [-3, -4.5] }, { hop: 1, until: () => false, seconds: 1.5, optional: true }]);
    expect(cs.world.player.z).toBeGreaterThan(-2.2);
    // 藏寶圖：跳上量小的書櫃 (1.3 < 1.6) → 切回實景 (書櫃 noLand3d：不採用它的深度)
    runScript(cs.world, [{ place: [1.4, 1.3, -1.9], mode: '2d' }, { wait: 0.2 }]);
    expect(cs.world.player.y).toBeCloseTo(1.3, 2);
    runScript(cs.world, [...FLIP, { wait: 1 }]);
    expect([cs.world.player.mode, cs.world.player.z > -2.2, cs.world.player.y]).toEqual(['3d', true, 0]);
    // 藏寶圖裡書牆不在、書桌看得到：按 E = 碰不到 (只在實景拿)
    runScript(cs.world, [{ place: [-5.5, 0, -1.9], mode: '2d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([isActiveIn(cs.world, get(cs, 'desk'), '2d'), findTarget(cs.world), cs.world.msgKey, hasItem(cs.world, 'scrap.4')]).toEqual([true, null, 'msg.unreachable', false]);
  });

  it('印房的「日」被取下：南拱門門後是牆 (洞不在)；鉛字盤推進南拱門 = 拱門那一頭被擋住了 (第二章時與量小之後都是)', () => {
    let cs = printAbove({ shrunk: true });
    expect(door(cs, 'archS').kinds).toEqual(['enter']);
    cs = printAbove({ shrunk: true });
    cs = play(cs, [{ place: [-2.6, 0, -2.2] }, { wait: 0.1 }, ...FLIP, uncard('plate:print', 'card.ri'), { wait: 1 / 30 }, ...FLIP]).cs;
    expect(cs.world.ext.cube!.links.archS).toEqual({ to: 'wall' });
    runScript(cs.world, [{ place: [-2.6, 0, 4.15] }, { wait: 0.1 }]);
    expect(findTarget(cs.world)?.def.id).toBe('archS');
    const r = play(cs, [{ act: 'interact' }]);
    expect([r.kinds, r.cs.world.msgKey, r.cs.state.room]).toEqual([[], 'msg.cube.wall', 'print']);
    // 鉛字盤：推到拱門前、往南推進拱門 (2-5 的路線)
    const PUSH_TRAY: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 1.2] }, { walkTo: [5.4, null] }, { walkTo: [null, 2.4] }, { walkTo: [-1.7, null] }, { walkTo: [null, 1.0] }, { walkTo: [-2.6, null] }, { walkTo: [null, 4.2] }];
    for (const shrunk of [false, true]) {
      const p = printAbove({ shrunk });
      const q = play(p, [{ place: [2.2, 0, 1.5] }, ...PUSH_TRAY]);
      expect([shrunk, q.kinds, q.cs.world.msgKey, q.cs.world.byId.has('tray'), q.cs.state.moved.tray]).toEqual([shrunk, ['blocked'], 'msg.cube.archBlocked', true, undefined]);
    }
  });

  it('只用 2D：門與抽屜只在實景 (藏寶圖對西門按 E 不出門、書桌碰不到)；只用 3D：標籤只在藏寶圖、轉動模式只在藏寶圖', () => {
    const cs = front();
    runScript(cs.world, [{ place: [-5.3, 0, 0], mode: '2d' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([findTarget(cs.world)?.def.id ?? null, cs.world.events.some(e => e.t === 'door')]).toEqual([null, false]);
    runScript(cs.world, [...FLIP, { walkTo: [-1.0, -1.9] }, { wait: 0.1 }]);
    expect([cs.world.player.mode, labelTarget(cs.world), turnModeDenied(cs.world)]).toEqual(['3d', null, 'not2d']);
  });
});

describe('補發尺度卡 (grantScaleCards)', () => {
  it('有 scale → 第二章道具多「大」「小」各一 (只補一次：補完寫進存檔就不再補)；卡已貼在書櫃標籤上 → 不重複補；沒有 scale / 第一章 / 第三章 → 不補', () => {
    const st = ch2Cleared();
    const save = saveOf(st);
    const g = grantScaleCards(save, CH2, chapterStart(save, SPEC, CH2.start));
    expect([g.granted, g.state.items['card.da'], g.state.items['card.xiao'], st.items['card.da']]).toEqual([['card.da', 'card.xiao'], 1, 1, undefined]);
    const again = withChapter(save, g.state);
    expect(grantScaleCards(again, CH2, chapterStart(again, SPEC, CH2.start)).granted).toEqual([]);
    const onShelf = { ...st, items: { ...st.items, 'card.da': 1 }, labels: { ...st.labels, [SLOT]: ['card.xiao'] } };
    expect(grantScaleCards(saveOf(onShelf), CH2, onShelf).granted).toEqual([]);
    expect(grantScaleCards(saveOf(st, false), CH2, st).granted).toEqual([]);
    const ch1 = CUBE_CHAPTERS.find(c => c.chapter === 1)!, ch3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
    expect([ch1.scaleCards, ch3.scaleCards, grantScaleCards(save, ch1, st).granted, grantScaleCards(save, ch3, st).granted]).toEqual([undefined, undefined, [], []]);
    expect(TEXT('msg.cards.scaleBack')).toBe('建築比例尺也跟來了。字卡匣裡多了「大」「小」。');
  });

  it('第二章帶方槽 (label.scale) 的標籤只有夾層的書櫃 → 尺度卡破不了 2-1～2-5；每章每組可得的卡 ≤ 3 (TRAY_SLOTS)', () => {
    const scaleLabels = Object.values(CH2.rooms).flatMap(l => l.objects.filter(o => o.label?.scale).map(o => o.id));
    expect(scaleLabels).toEqual(['innerShelf']);
    const cardsIn = (v: unknown): string[] => (typeof v === 'string' ? (isCard(v) ? [v] : []) : Array.isArray(v) ? v.flatMap(cardsIn) : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => !['answers', 'forms'].includes(k)).flatMap(([, x]) => cardsIn(x)) : []);
    for (const cc of CUBE_CHAPTERS) {
      const got = new Set(Object.values(cc.rooms).flatMap(l => l.objects.flatMap(cardsIn)));
      if (cc.scaleCards) { got.add('card.da'); got.add('card.xiao'); }
      for (const slot of ['word', 'part', 'scale'] as const) expect([cc.chapter, slot, [...got].filter(c => CARDS[c].slot === slot).length <= TRAY_SLOTS]).toEqual([cc.chapter, slot, true]);
    }
  });
});

describe('字卡匣分頁 (詞卡 / 部件卡 / 尺度卡；TRAY_SLOTS 3 不變)', () => {
  it('第二章手上 + 貼著共 7 張：書櫃標籤停在尺度卡頁 (1 = 大、2 = 小)、印房門牌停在部件卡頁、2-2b 停在詞卡頁；← / → 換頁、1～3 = 本頁', () => {
    const cs = front();
    runScript(cs.world, [...LABEL_SPOT]);
    const m = deriveCardTray(cs.world, TEXT, 0)!;
    expect([m.tabs, m.tab, m.slots.map(s => s.glyph), m.text.tabs, slotCommand(m, 1)]).toEqual([['word', 'part', 'scale'], 'scale', ['大', '小', ''], { word: '詞卡', part: '部件卡', scale: '尺度卡' }, { t: 'card', label: SLOT, card: 'card.da' }]);
    expect(m.text.howto).toContain('換頁：點頁籤，或按 ← / →');
    expect([shiftTab(m, 1), shiftTab(m, -1)]).toEqual(['word', 'part']);
    const word = deriveCardTray(cs.world, TEXT, 0, 'word')!;
    expect([word.tab, word.slots.map(s => s.glyph), slotCommand(word, 1)]).toEqual(['word', ['前', '外', ''], { t: 'card', label: SLOT, card: 'card.qian' }]);
    // 別組的卡照樣能貼 (無效字的回饋不變)
    runScript(cs.world, [card(SLOT, 'card.qian'), { wait: 1 / 30 }]);
    expect([cs.world.msgKey, hasItem(cs.world, 'card.qian')]).toEqual(['msg.label.invalid', true]);
    // 印房門牌 = 部件卡頁 (「日」貼著、「才」在手上)；2-2b = 詞卡頁
    const p = printAbove();
    runScript(p.world, [{ place: [-2.6, 0, -2.2] }, { wait: 0.1 }, ...FLIP]);
    const plate = deriveCardTray(p.world, TEXT, 0)!;
    expect([plate.tab, plate.slots.map(s => s.glyph), plate.attached.map(a => a.glyph), labelTab(get(p, 'plateS'))]).toEqual(['part', ['才', '', ''], ['日'], 'part']);
    const rd = back(saveOf(ch2Cleared({ room: 'reading', door: 'doorW' }))).cs;
    runScript(rd.world, [{ place: [9, 0, -2.4], mode: '2d' }, { wait: 0.1 }]);
    const couplet = deriveCardTray(rd.world, TEXT, 0)!;
    expect([couplet.label, couplet.tab, couplet.slots.map(s => s.glyph)]).toEqual(['couplet:reading', 'word', ['前', '外', '']]);
  });

  it('只有一組 (第三章只有尺度卡；第一章只有詞卡)：tabs 一個、不畫頁籤、不說換頁、slots 不變', () => {
    const w = createWorld(mezz, OPTS);
    w.inv = { 'card.da': 1, 'card.xiao': 1 };
    runScript(w, [{ place: [-1.0, 0, -1.9], mode: '2d' }, { wait: 0.1 }]);
    const m = deriveCardTray(w, TEXT, 0)!;
    expect([m.tabs, m.tab, m.slots.map(s => s.glyph), m.text.howto.some(h => h.startsWith('換頁'))]).toEqual([['scale'], 'scale', ['大', '小', ''], false]);
    expect(shiftTab(m, 1)).toBe('scale');
  });
});

describe('R、存檔與舊存檔', () => {
  it('在後面 R = 回到從洞進來時 (書櫃仍「小」、人在洞內側)；量小後在前廳 R = 「小」回到字卡匣', () => {
    let cs = through(printAbove({ shrunk: true }), 'archS', 'mezz');
    runScript(cs.world, [{ walkTo: [-4.0, -3.7] }]);
    cs = restartRoom(cs, OPTS);
    runScript(cs.world, [{ wait: 1 / 30 }]);
    expect([cs.state.room, cs.state.door, cs.world.player.z < -3.0, effectiveFactor(get(cs, 'innerShelf').def, cs.world.ext.labels, false)]).toEqual(['mezz', 'holeN', true, 0.5]);
    let f = shrink(front()).cs;
    expect(hasItem(f.world, 'card.xiao')).toBe(false);
    f = restartRoom(f, OPTS);
    expect([hasItem(f.world, 'card.xiao'), f.world.ext.labels![SLOT], f.state.door]).toEqual([true, undefined, 'doorW']);
  });

  it('章節存檔往返：在後面 (書櫃「小」) 寫檔 → 讀回 → 還在後面；書桌拿過 = 抽屜空了', () => {
    let cs = through(printAbove({ shrunk: true }), 'archS', 'mezz');
    cs = play(cs, DESK).cs;
    const store = memoryStorage();
    writeSave(store, withChapter(saveOf(ch2Cleared()), captureState(cs)));
    const b = back(loadSave(store));
    // 補發過的「大」在章節道具、「小」貼在書櫃上 → 不再補
    expect([b.granted, b.cs.state.room, b.cs.state.door, b.cs.world.ext.labels![SLOT], get(b.cs, 'desk').used, hasItem(b.cs.world, 'scrap.4'), hasItem(b.cs.world, 'card.da')]).toEqual([[], 'mezz', 'holeN', ['card.xiao'], true, true, true]);
    const r = play(b.cs, DESK);
    expect(r.cs.world.msg).toBe('抽屜空了。');
  });

  it('舊存檔相容：占位版夾層的快照 (只有地板 / 門 / 洞) 照常開章——快照只覆寫可推物，新物件取關卡初值；舊存檔站在夾層洞內側 → 改從開章入口進；第二章舊存檔沒有 mezz 快照 = 關卡初值', () => {
    const old = { objs: ['floor', 'doorW', 'holeN'].map(id => ({ id, x: 0, y: 0, z: 0, gone: false, used: false, touched: false })), flags: [] };
    let cube = initialCube(CH2_CUBE);
    for (const t of [T('row0', 1), T('row1', -1), T('col1', 1)]) cube = applyTurn(CH2_CUBE, cube, t) as CubeState;
    const atWest = ch2Cleared({ cube, room: 'mezz', door: 'doorW', rooms: { mezz: old } });
    const a = back(saveOf(atWest, false)).cs;
    expect([a.state.room, get(a, 'innerShelf').x, get(a, 'bookWall').def.h, get(a, 'desk').used, get(a, 'floor').def.w]).toEqual(['mezz', 1.4, 3.0, false, 12]);
    // 舊存檔站在洞內側 (占位版夾層的洞是空的；現在是書櫃) → 從開章入口 (2-1 西門) 進
    const atHole = chapterStart(saveOf(ch2Cleared({ room: 'mezz', door: 'holeN', rooms: { mezz: old } }), false), SPEC, CH2.start);
    expect([atHole.room, atHole.door, atHole.turns]).toEqual(['shelf', 'doorW', undefined]);
    // 量小過的存檔站在洞內側 = 到達處空著 → 照存檔
    const ok = chapterStart(saveOf(ch2Cleared({ room: 'mezz', door: 'holeN', labels: { 'plate:print': ['card.ri'], [SLOT]: ['card.xiao'] } })), SPEC, CH2.start);
    expect([ok.room, ok.door]).toEqual(['mezz', 'holeN']);
    const none = back(saveOf(ch2Cleared({ cube, room: 'mezz', door: 'doorW', rooms: {} }))).cs;
    expect([none.state.room, get(none, 'desk').used, get(none, 'innerShelf').def.w]).toEqual(['mezz', false, 3.6]);
  });
});

// ── 字條 ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = mezz.objects.filter(o => o.type === 'note');
describe('H1 字條：L1 + L2 (空白，4 分鐘浮現) + 劇情字條 (只在實景)', () => {
  it('原文 (story-bible 7.3)；H1 / H2 / H3 / H4 / H10；間距 ≥ 3、任一 16 單位寬的畫面 ≤ 3；7.1.3 提示 2 ≤ 謎題數 + 1、總數 3 ≤ 4', () => {
    expect(notes.map(o => [o.id, o.x, noteText(o), o.type === 'note' && o.mount, o.type === 'note' && o.revealAfter, o.visible])).toEqual([
      ['noteA', -3.4, '你小時候，總愛從後面溜進來。', 'post', undefined, 'both'],
      ['noteA2', 4.4, '書牆背後，此刻接著誰？', 'post', 240, 'both'],
      ['noteS', 0.2, '小時候，我在書房裡迷路過。', 'pile', undefined, '3d']
    ]);
    const hints = notes.filter(o => o.id !== 'noteS');
    expect([hints.length <= mezz.puzzles!.length + 1, notes.length <= mezz.puzzles!.length + 3]).toEqual([true, true]);
    const AHA = ['大', '小', '縮', '放大', '量', '間', '日', '洞', '門牌', '轉', '排列', '對齊', '正上方', '上面', '圖上', '藏寶圖', '隔著', '穿過'];
    const KEYS = ['尺度卡', '比例尺', '印房', '門牌', '控制盤', '魔方儀', '字卡匣'];
    for (const o of hints) {
      const t = noteText(o);
      expect([o.id, [...t].length <= (o.type === 'note' && o.revealAfter ? 30 : 24)]).toEqual([o.id, true]);
      expect(/^(把|先|去|到)/.test(t) || /推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t)).toBe(false);
      // 「小時候」是時間詞，不是尺度卡的「小」(H10 以詞判)
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.replace(/小時候/g, '').includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
  });

  it('L1 / L2 兩個視角都讀得到 (L2 一開始空白、240 秒浮現)；劇情字條只在實景', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = createWorld(mezz, OPTS);
      runScript(w, mode === '3d' ? [{ place: [o.x, 0, o.z - 0.7] }, { wait: 0.1 }] : [{ place: [o.x, 0, 0], mode: '2d' }, { wait: 0.1 }]);
      if (o.visible === '3d' && mode === '2d') { expect(findTarget(w)?.def.id === o.id).toBe(false); continue; }
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(o.type === 'note' && o.revealAfter ? TEXT('msg.note.blank') : noteText(o));
    }
    const w = createWorld(mezz, OPTS);
    runScript(w, [{ wait: 241 }, { place: [4.4, 0, 2.1] }, { wait: 0.1 }]);
    interact(w);
    expect(w.msg).toBe('書牆背後，此刻接著誰？');
  });
});

describe('捷徑掃描 (三個尺度檔 × 站位 × 兩模式 × 探針)', () => {
  it('前廳 (書櫃標籤上 無 / 大 / 小)：書桌 / 殘片拿不到、走不進後面 (只量不轉、前廳貼牆跳、藏寶圖站上書櫃再切回實景)', () => {
    for (const tier of [[], ['card.da'], ['card.xiao']]) {
      const r = scanShortcuts({
        level: mezz, mechanics: DEFAULT_MECHANICS, text: TEXT,
        setup: w => { w.ext = { labels: tier.length ? { [SLOT]: tier } : {} }; },
        movable: [],
        playerAt: [{ x: -4.7, y: 0, z: 0 }, { x: -1.0, y: 0, z: -2.0 }, { x: 0, y: 0, z: -2.05 }, { x: 1.4, y: 0, z: -2.05 }, { x: 4.0, y: 0, z: -2.05 }, { x: -4.4, y: 0, z: -2.05 }],
        probes: [
          [{ hop: 1, until: () => false, seconds: 2.5, optional: true }], [{ hold: { moveZ: -1, jump: true }, seconds: 2.5 }],
          [{ act: 'interact' }, { act: 'flip' }, { wait: 0.2 }, { act: 'interact' }],
          [{ act: 'flip' }, { wait: 0.2 }, { hold: { moveX: 1, jump: true }, seconds: 1.2 }, { act: 'flip' }, { wait: 0.2 }, { hold: { moveZ: -1 }, seconds: 1 }],
          [{ act: 'flip' }, { wait: 0.2 }, { hold: { moveX: -1, jump: true }, seconds: 1.2 }, { act: 'flip' }, { wait: 0.2 }, { hold: { moveZ: -1 }, seconds: 1 }]
        ],
        forbidden: ['used:desk', 'item:scrap.4', { id: 'back', holds: (w: World) => w.player.mode === '3d' && w.player.z < -3.0 }]
      });
      expect([tier, r.hits, r.runs > 0]).toEqual([tier, [], true]);
    }
  });
});

describe('選單與音效', () => {
  it('選單：3-1 通關前不列 H1 (locked)、之後列在 2-5 之後 (open)；通關後 cleared；房間通關「繼續探索」= 回到 H1 (接著第二章存檔)', () => {
    const e = levelById('H1')!;
    const s = (cleared: string[]) => ({ ...defaultSave(), cleared });
    expect([levelState(e, s(CH2_DONE)), listedInMenu(e, s(CH2_DONE)), levelState(e, s([...CH2_DONE, '3-1'])), listedInMenu(e, s([...CH2_DONE, '3-1'])), levelState(e, s([...CH2_DONE, '3-1', 'H1']))]).toEqual(['locked', false, 'open', true, 'cleared']);
    const listed = (save: Save) => CHAPTERS.find(c => c.id === 2)!.levels.map(levelById).filter(x => !!x && listedInMenu(x, save)).map(x => x!.id);
    expect([listed(s(CH2_DONE)), listed(s([...CH2_DONE, '3-1']))]).toEqual([['2-1', '2-2', '2-3', '2-4', '2-5'], ['2-1', '2-2', '2-3', '2-4', '2-5', 'H1']]);
    expect(LEVELS.filter(l => l.hidden).map(l => l.id)).toEqual(['H1']);
    expect([listedInMenu(levelById('2-5')!, defaultSave()), nextAfterClear('H1', 'room', CHAPTERS)]).toEqual([true, 'H1']);
  });

  it('音效：量小 / 放不下 = card 事件 (sfx.card.stick / wrong)；書桌 = USED_ON diaryStand (sfx.note.read) + 殘片的紙聲；沒有新的事件類型、SCARE_SFX 不加', () => {
    expect([worldEventActions({ t: 'card', label: SLOT, ok: true }), worldEventActions({ t: 'card', label: SLOT, ok: false })].map(a => a.map(x => x.kind === 'sfx' && x.id))).toEqual([['sfx.card.stick'], ['sfx.card.wrong']]);
    const W = {};
    const s = (used: boolean, inv: Record<string, number>): LevelSnap => ({
      world: W, room: 'mezz', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv, objs: [{ id: 'desk', type: 'diaryStand', used, gone: false, x: 0, z: 0 }], cube: '', ink: 6,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const obs = new LevelObserver();
    obs.update(s(false, {}));
    const out = obs.update(s(true, { 'scrap.4': 1 }));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id).sort()).toEqual(['sfx.note.read', 'sfx.pickup.paper']);
    expect([GAME_EVENT_TYPES, Object.keys(SCARE_SFX)]).toEqual([['switch', 'switchDenied', 'door', 'turnRequest', 'objCross', 'labelOpen', 'card', 'flag', 'dialActivate', 'done', 'chase'], ['scare:coats', 'scare:handprint', 'scare:archive']]); // H1 不加；第四章 4-3 加 scare:archive
  });
});
