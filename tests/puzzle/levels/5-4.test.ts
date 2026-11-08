// 5-4 北窗 (規格 6「5-4 北窗（細化）」)：資料 (門位不變、三帶、字條原文與 H 規則、天窗銘文 (北) 與三段的唯一正解)、acrossEdge (秤繩那一頭)、
// 重量表 (CH5_BALLAST 與關卡資料一致、窮舉只有「西窗 + 大」平)、吊秤 (狀態句、差一格、轉錯軸、平了 = 5-4、SN 星釘鬆開、房間通關、分層、閂住)、
// 背包與重物箱的說明、兩種解法與常見路線實跑、窗框 SN 轉一次、R、舊存檔 (西窗 / 東窗快照沒有重物箱)、validateDial (CH5_ZONE54、拿掉要素)、USED_ON
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH5_AFTER51, CH5_BAG, CH5_BALLAST, CH5_CUBE, CH5_HANG, CH5_MIDDLE, CH5_MIDDLE_CUBE, CH5_ZONE54, ch5Zone54, faceOf, hangWeight } from '../../../src/puzzle/content/cubes/ch5';
import { east, north, west } from '../../../src/puzzle/content/levels/ch5/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { findTarget } from '../../../src/puzzle/core/interact';
import { acrossEdge, applyTurn, cubeKey, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { clearedRooms, dialBlocked, dialTurn, doneFlags, openChapter, restartRoom, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
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
/** 轉 (每轉完走一步：吊秤在 afterPhysics 讀章節層寫入的那一頭) */
const turn = (cs: ChapterSession, ...ts: Turn[]) => ts.reduce((c, t) => play(pump(ok(dialTurn(c, t))), [{ wait: 0.05 }]), cs);
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind}`);
  return r.next;
};
const flip: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];
const as = (m: '2d' | '3d') => (cs: ChapterSession): ChapterSession => { if (cs.world.player.mode !== m) runScript(cs.world, flip); return cs; };
const in2d = as('2d');
const in3d = as('3d');
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });
const hanged = (cs: ChapterSession) => acrossEdge(CH5_CUBE, cs.state.cube!, 'north', 'D');

/** 5-1 完成 (天窗間朝向 1、機關朝向 1)、觀星儀已啟動、人在天窗間 (3D)；章節道具 = 尺度卡 */
function after51(extra: Partial<ChapterState> = {}): ChapterSession {
  const st = chapterStart(defaultSave(), SPEC, CH5.start);
  return in3d(openChapter(SPEC, { ...st, cube: clone(CH5_AFTER51), room: 'sky', door: 'doorS', dial: true, items: { 'card.da': 1, 'card.xiao': 1 }, ...extra }, OPTS));
}
/** 藏寶圖：背包貼 / 取尺度卡 */
const BAG = (c: string): Cmd[] => [{ walkTo: [2.0, null] }, card('scale:bag', c), { wait: 0.05 }];
const UNBAG = (c: string): Cmd[] => [{ walkTo: [2.0, null] }, uncard('scale:bag', c), { wait: 0.05 }];
/** 實景：對吊秤按 E */
const READ: Cmd[] = [{ walkTo: [4.0, -0.2] }, { expect: w => expect(findTarget(w)?.def.id).toBe('scale'), label: '吊秤' }, { act: 'interact' }];
/** 解法 A 的去程：上下軸 ↺ → 東西軸 ↺ ×2 → 天窗間南門 ↔ 北窗地板梯口 (北窗在西面；繩子吊著天窗間) */
function routeA(): ChapterSession {
  const cs = through(turn(after51(), T('Z1', -1), T('X1', -1), T('X1', -1)), 'doorS');
  expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'north'), hanged(cs)]).toEqual(['north', 'hatchD', 'W', 'sky']);
  return cs;
}
/** 常見路線的去程：東西軸 ↻ → 上下軸 ↻ → 東西軸 ↺ → 天窗間南門 ↔ 北窗東門 (北窗回到北面、東窗在底面：繩子吊著東窗) */
function routeCommon(): ChapterSession {
  const cs = through(turn(after51(), T('X1', 1), T('Z1', 1), T('X1', -1)), 'doorS');
  expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'north'), faceOf(cs.state.cube!, 'east'), hanged(cs)]).toEqual(['north', 'doorE', 'N', 'D', 'east']);
  return cs;
}
const S = {
  mine: (r: string) => `秤繩從地板的小洞垂下去，吊著「${r}」。你的背包比較沉。`,
  other: (r: string) => `秤繩從地板的小洞垂下去，吊著「${r}」。那一頭比較沉，你的背包被抬了起來。`,
  near: (r: string) => `秤繩從地板的小洞垂下去，吊著「${r}」。秤桿幾乎平了——那一頭還重那麼一點點。`,
  same: (r: string) => `整片房間連你一起轉了過去。秤繩那一頭，還是吊著「${r}」。`,
  solved: '秤停在正中間。繩子那一頭吊著的，是爸爸的房間——你的背包，和他留下的箱子一樣重了。窗框上的一顆星釘，跟著鬆開了。',
  done: '秤停在正中間。繩子那一頭，吊著爸爸的房間。'
};

describe('5-4 北窗：資料', () => {
  it('validateLevel / validateEntry 0 issue (北窗與加了重物箱的西窗 / 東窗)；一題 5-4；墨 10；三帶；門位不變 (東門 / 地板梯口)；通關文字；登錄 (5-1 之後開放)', () => {
    for (const lv of [north, west, east]) expect(validateLevel(lv, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib', 'scale'] })).toEqual([]);
    expect(validateEntry(levelById('5-4')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect([north.id, north.puzzles!.map(q => [q.id, TEXT(q.titleKey)]), north.turnBudget, TEXT(north.narrationKey), TEXT(north.nextKey), layoutDepthIssues(north), layoutDepthIssues(west), layoutDepthIssues(east)]).toEqual([
      '5-4', [['5-4', '5-4 吊秤']], { base: 10 }, '從這扇窗看，只看得見自己那一面。', '北窗的秤平了。這扇窗，現在轉得動了。', [], [], []
    ]);
    expect(north.objects.filter(o => o.type === 'cubeDoor').map(o => [o.id, o.x, o.z])).toEqual([['doorE', 9.8, 0], ['hatchD', -3, 1.6], ['holeW', -9.8, 0]]); // 5-5a 洞位 (平常不在場)
    expect([levelById('5-4')!.unlock, levelById('5-4')!.abilities, CH5.levels['5-4'], CHAPTERS.find(c => c.id === 5)!.levels]).toEqual([{ after: ['5-1'] }, ['nib', 'scale'], 'north', ['5-1', '5-2', '5-3', '5-4', '5-5']]);
    // 空的房間：骨架的舊箱與帆布箱堆退役
    expect(north.decor!.map(d => d.kind)).toEqual(['walls', 'atticRoof', 'atticWindow', 'posts']);
  });

  it('字條：三張 (L1 / L2 / 劇情)；原文；H1～H4 / H10；間距 ≥ 3', () => {
    const notes = north.objects.filter(o => o.type === 'note');
    const txt = (o: (typeof notes)[number]) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
    expect(notes.map(o => [o.id, o.x, txt(o), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteStory', -2.6, '這一扇，我一直空著。北邊……是誰？', undefined],
      ['noteA', -7.4, '差的那一點，這間房裡沒有。', undefined], ['noteA2', 6.6, '想換掉那一頭，就別把自己也帶走。', 240]
    ]);
    const AHA = ['轉', '片', '軸', '面', '外', '小', '縮', '窗', '倒', '讀', '合', '秤', '重', '光', '對', '齊', '符', '陣', '門'];
    const KEYS = ['吊秤', '秤繩', '背包', '皮箱', '書箱', '天窗銘文'];
    for (const o of notes) {
      const t = txt(o);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t) || /^(把|先|去|到)/.test(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(o.id === 'noteA2' ? 30 : o.id === 'noteA' ? 24 : 40);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it('天窗銘文 (北)：許問津的刻字 (只在實景)；三段合起來的唯一正解 = 東橫、西橫、北直 (排除爸爸那段；三段恰好一段錯時也只有這一組)', () => {
    const n = north.objects.find(o => o.id === 'inscriptionN')!;
    expect([n.type, n.visible, TEXT(n.type === 'remark' ? n.textKey : '')]).toEqual(['remark', '3d', '窗台角上刻著一行字：「北窗的縫，和另外兩扇都不同向。」']);
    type Dir = '橫' | '直';
    const all: Array<[Dir, Dir, Dir]> = [];
    for (const e of ['橫', '直'] as Dir[]) for (const w of ['橫', '直'] as Dir[]) for (const nn of ['橫', '直'] as Dir[]) all.push([e, w, nn]);
    const says = ([e, w, nn]: [Dir, Dir, Dir]) => ({ east: e === '橫', west: e === '直' && w === '直' && nn === '直', north: nn !== e && nn !== w });
    // 排除爸爸那段 (西)：東與北兩段都成立
    expect(all.filter(a => { const s = says(a); return s.east && s.north; })).toEqual([['橫', '橫', '直']]);
    // 三段恰好一段錯：也只有這一組，錯的那段 = 西 (爸爸)
    const one = all.filter(a => Object.values(says(a)).filter(v => !v).length === 1);
    expect([one, one.map(a => Object.entries(says(a)).find(([, v]) => !v)![0])]).toEqual([[['橫', '橫', '直']], ['west']]);
  });
});

describe('5-4 秤繩那一頭 (acrossEdge) 與重量表', () => {
  it('S0 / 5-1 完成：繩子吊著機關；中間片的任何排列都吊著北窗的四個鄰面之一 (天窗間 / 東窗 / 西窗 / 機關)；帶著北窗的兩片轉了不換、另一片換', () => {
    expect([acrossEdge(CH5_CUBE, CH5_AFTER51, 'north', 'D'), CH5_HANG]).toEqual(['engine', { room: 'north', hook: 'D' }]);
    const seen = new Set<string>([cubeKey(CH5_AFTER51)]);
    const q: CubeState[] = [CH5_AFTER51];
    const tally = { same: 0, changed: 0, wrong: 0 };
    const hooked = new Set<string | null>();
    while (q.length) {
      const s = q.pop()!;
      const h = acrossEdge(CH5_CUBE, s, 'north', 'D');
      hooked.add(h);
      for (const g of CH5_MIDDLE) for (const dir of [1, -1] as const) {
        const n = applyTurn(CH5_MIDDLE_CUBE, s, { group: g.id, dir });
        if ('blocked' in n) continue;
        const carries = s.pos.north['xyz'.indexOf(g.axis!)] === 1;
        const h2 = acrossEdge(CH5_CUBE, n, 'north', 'D');
        if (carries && h2 === h) tally.same++; else if (!carries && h2 !== h) tally.changed++; else tally.wrong++;
        const k = cubeKey(n);
        if (!seen.has(k)) { seen.add(k); q.push(n); }
      }
    }
    expect([seen.size > 10_000, [...hooked].sort(), tally.wrong, tally.same > 0, tally.changed > 0]).toEqual([true, ['east', 'engine', 'sky', 'west'], 0, true, true]);
  });

  it('CH5_BALLAST 與關卡資料一致 (西窗爸爸的舊皮箱 3、東窗許問津的書箱 4)；背包 1 / 2 / 3 × 四間：只有「西窗 + 大」平', () => {
    const fromData = Object.fromEntries(Object.entries(CH5.rooms).map(([id, lv]) => [id, lv.objects.filter(o => o.ballast).reduce((n, o) => n + (o.weight ?? 2), 0)]).filter(([, n]) => n));
    expect(fromData).toEqual(CH5_BALLAST);
    expect(CH5_BALLAST).toEqual({ west: 3, east: 4 });
    const level = ['sky', 'east', 'west', 'engine'].flatMap(r => CH5_BAG.filter(b => b === hangWeight(r)).map(b => [r, b]));
    expect(level).toEqual([['west', 3]]);
    expect(['sky', 'east', 'west', 'engine'].map(r => hangWeight(r, {}))).toEqual([0, 0, 0, 0]);
  });
});

describe('5-4 吊秤 (P17 / P1)', () => {
  it('解法 A (從天窗間爬上來)：繩子吊著天窗間 = 背包重 → 背包「大」→ 東西軸 ↻ (西窗轉到地板下) = 平：5-4、SN 鬆開、房間通關、分層；閂住後取下「大」/ 轉走西窗仍平', () => {
    let cs = play(in3d(routeA()), READ);
    expect(cs.world.msg).toBe(S.mine('天窗間'));
    expect(dialBlocked(cs, T('SN', 1))).toBe('locked');
    cs = play(in2d(cs), BAG('card.da'));
    expect([get(cs, 'bag').def.w > 0.5, get(cs, 'scale').used]).toEqual([true, false]);
    cs = turn(cs, T('X1', 1));
    expect([hanged(cs), faceOf(cs.state.cube!, 'north'), cs.world.msg, get(cs, 'scale').used]).toEqual(['west', 'W', S.solved, true]);
    const flags = doneFlags(cs.spec, cs.state, cs.world);
    expect([flags.has('5-4'), clearedRooms(cs.spec, cs.state, cs.world), ch5Stage(flags), dialBlocked(cs, T('SN', 1))]).toEqual([true, ['north'], 1, null]);
    // 閂住：取下「大」、再轉走西窗，秤照樣停在正中間
    cs = turn(play(cs, UNBAG('card.da')), T('X1', 1));
    cs = play(in3d(cs), READ);
    expect([hanged(cs), get(cs, 'scale').used, cs.world.msg]).toEqual(['engine', true, S.done]);
    // 窗框 SN 轉一次：北窗原地轉 (位置不變、朝向變)；秤繩那一頭跟著地板換了方向 (已閂住)
    const before = [cs.state.cube!.pos.north, cs.state.cube!.rot.north];
    cs = turn(in2d(cs), T('SN', 1));
    expect([cs.state.cube!.pos.north, cs.state.cube!.rot.north === before[1], doneFlags(cs.spec, cs.state, cs.world).has('5-4')]).toEqual([before[0], false, true]);
  });

  it('解法 B (樓梯口 → 西窗 → 北窗)：南北軸 ↺ → 西窗 (皮箱與銅環) → 南北軸 ↺ 東西軸 ↺ → 北窗東門 (北窗在頂面) → 背包「大」→ 上下軸 ↺ = 平', () => {
    let cs = through(after51(), 'doorE');
    expect(cs.state.room).toBe('landing');
    cs = in3d(through(turn(cs, T('Y1', -1)), 'hatchU'));
    expect([cs.state.room, cs.state.door]).toEqual(['west', 'doorS']);
    cs = play(cs, [{ walkTo: [5.4, 2.9] }, { expect: w => expect(findTarget(w)?.def.id).toBe('trunkDad'), label: '皮箱' }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('爸爸的舊皮箱，塞得滿滿的，搬不動。箱蓋上釘著一個銅環，像是讓什麼鉤住的。');
    cs = through(turn(cs, T('Y1', -1), T('X1', -1)), 'hatchD');
    expect([cs.state.room, cs.state.door, faceOf(cs.state.cube!, 'north'), hanged(cs)]).toEqual(['north', 'doorE', 'U', 'sky']);
    cs = turn(play(in2d(cs), BAG('card.da')), T('Z1', -1));
    expect([hanged(cs), cs.world.msg, doneFlags(cs.spec, cs.state, cs.world).has('5-4')]).toEqual(['west', S.solved, true]);
  });

  it('常見路線：繩子吊著東窗 → 背包「大」只差一格 (只在房內調大小) → 東西軸 ↻ = 轉錯軸 (自己被搬走) → 回去 → 南北軸 ↻ (機關：背包重) → 南北軸 ↻ (西窗) = 平', () => {
    let cs = play(in3d(routeCommon()), READ);
    expect(cs.world.msg).toBe(S.other('東窗'));
    cs = play(in2d(cs), BAG('card.da'));
    expect(cs.world.msg).toBe(S.near('東窗'));
    cs = play(cs, [...UNBAG('card.da'), ...BAG('card.xiao')]);
    expect(cs.world.msg).toBe(S.other('東窗'));
    cs = play(cs, [...UNBAG('card.xiao'), ...BAG('card.da')]);
    // 帶著北窗的兩片 (東西軸：北窗與東窗都在裡面；上下軸：繞著東窗那一軸轉)：自己被搬走、繩子那一頭不換
    for (const t of [T('X1', 1), T('X1', -1), T('Z1', 1), T('Z1', -1)]) {
      cs = turn(cs, t);
      expect([t.group, hanged(cs), cs.world.msg]).toEqual([t.group, 'east', S.same('東窗')]);
    }
    cs = turn(cs, T('Y1', 1));
    expect([hanged(cs), cs.world.msg]).toEqual(['engine', S.mine('最後的機關')]);
    cs = turn(cs, T('Y1', 1));
    expect([hanged(cs), cs.world.msg, doneFlags(cs.spec, cs.state, cs.world).has('5-4')]).toEqual(['west', S.solved, true]);
  });

  it('背包 / 東窗的書箱：3D 按 E 的說明；背包釘在盤上 (推不動、拿不走)', () => {
    let cs = play(in3d(routeA()), [{ walkTo: [2.0, -0.2] }, { expect: w => expect(findTarget(w)?.def.id).toBe('bag'), label: '背包' }, { act: 'interact' }]);
    expect([cs.world.msg, get(cs, 'bag').gone, get(cs, 'bag').x]).toEqual(['你的背包。一路背上來，現在放在秤盤上。', false, 2.0]);
    cs = in3d(through(turn(after51(), T('X1', 1), T('Y1', 1)), 'doorE'));
    expect(cs.state.room).toBe('east');
    cs = play(cs, [{ walkTo: [-4.4, 2.9] }, { expect: w => expect(findTarget(w)?.def.id).toBe('chestBooks'), label: '書箱' }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('一箱古籍，塞得一本也放不進去，搬不動。箱蓋上也釘著一個銅環。');
  });

  it('R = 回到進房時 (吊秤沒閂住；背包上的「大」是章節標籤，照舊貼著)；西窗 / 東窗已通關的存檔 (快照沒有重物箱)：箱子照關卡資料在場、照樣計重', () => {
    let cs = play(in2d(routeA()), BAG('card.da'));
    cs = turn(cs, T('X1', 1));
    expect(get(cs, 'scale').used).toBe(true);
    const back = restartRoom(cs, OPTS);
    expect([get(back, 'scale').used, hanged(back)]).toEqual([false, 'sky']);
    const snap = { objs: [{ id: 'deskBook', x: 2.35, y: 0.76, z: -3.3, gone: false, used: true, touched: true }], flags: [] };
    cs = play(in2d(routeA()), []);
    cs = in2d(openChapter(SPEC, { ...cs.state, rooms: { ...cs.state.rooms, west: snap } }, OPTS));
    cs = turn(play(cs, BAG('card.da')), T('X1', 1));
    expect([hanged(cs), doneFlags(cs.spec, cs.state, cs.world).has('5-4'), doneFlags(cs.spec, cs.state, cs.world).has('5-3')]).toEqual(['west', true, true]);
  });
});

describe('5-4 validateDial (CH5_ZONE54) 與拿掉要素', () => {
  it('中間片 + 北窗的窗框；起點 = 5-1 完成：狀態 1,427,754 (< 2×10⁶)、排列 36,864、卡死 0；5-4 最短 4 / 次短 4；本質不同的解 ≥ 2；SN.turn 1', () => {
    const z = CH5_ZONE54;
    const r = validateDial(dialModelOf(z.cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube }));
    expect([r.solvable, r.states, r.arrangements, r.deadlocks, r.issues, r.lockIssues, r.entryIssues, r.budgetBypass]).toEqual([true, 1427754, 36864, [], [], [], [], []]);
    expect(r.states).toBeLessThan(2_000_000);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.issues])).toEqual([['5-4', 4, 4, []], ['SN.turn', 1, 1, []]]);
    expect(r.perPuzzle[0].distinct).toBeGreaterThanOrEqual(2);
  }, 180_000);

  it('只留一條軸 → 無解；任兩條軸都有解；拿掉尺度卡 (背包只有 2) / 拿掉皮箱 → 無解', () => {
    const run = (keep: string[], bag = CH5_BAG, ballast = CH5_BALLAST) => {
      const z = ch5Zone54(bag, ballast, false, 1);
      const cube = { ...z.cube, dial: { ...z.cube.dial!, groups: CH5_MIDDLE.filter(g => keep.includes(g.id)), locks: [] } };
      return validateDial(dialModelOf(cube, CH5.rooms, z.puzzles, z.start, z.finish, { startCube: z.startCube })).solvable;
    };
    expect([['X1'], ['Y1'], ['Z1'], ['X1', 'Y1'], ['X1', 'Z1'], ['Y1', 'Z1']].map(k => run(k))).toEqual([false, false, false, true, true, true]);
    expect([run(['X1', 'Y1', 'Z1'], [2]), run(['X1', 'Y1', 'Z1'], CH5_BAG, { east: 4 })]).toEqual([false, false]);
  }, 180_000);
});

describe('5-4 音訊', () => {
  it('USED_ON：吊秤平了 (星釘鬆開)', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'north', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 10,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (used: boolean) => ({ id: 'scale', type: 'hangScale', used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o(false)]));
    expect(obs.update(s([o(true)])).filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toContain('sfx.latch.open');
  });
});
