// 5-1 天窗間 (規格 6「5-1 天窗間（細化）」)：資料、字條、標籤「你」(縮小 0.4、碰撞箱與跳高、讓位、搆不到、只收「小」)、縮影 (鑽進 / 鑽出、ext.mini、
// 轉動模式只列縮影的頂 / 底、天窗間不在頂面心 = 楔形)、5-1a (頂層 ↻ 一次 / ↺ 三次、刻度盤的四種說明、只用中間片永遠做不到)、
// 5-1b (齒輪卡住 SB、齒輪量「小」閂住、只有一張「小」、底層轉一次 = 5-1b、房間通關)、縮小時穿門、R、validateDial 兩個子模型與拿掉要素、
// cs:attic (房間通關的「繼續探索」才播)、第五章 E♭ 分層音訊、USED_ON、觸控不顯示鍵盤小提示
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH5_ALIGN, CH5_CUBE, CH5_MIDDLE_CUBE, CH5_SKY_CUBE, CH5_ZONE51, CH5_ZONE51_MIDDLE, skyAligned } from '../../../src/puzzle/content/cubes/ch5';
import { sky } from '../../../src/puzzle/content/levels/ch5/5-1-sky';
import * as ROOMS5 from '../../../src/puzzle/content/levels/ch5/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { labelTarget } from '../../../src/puzzle/mechanics/labels';
import { alignState, SELF_SCALE } from '../../../src/puzzle/mechanics/attic';
import { findTarget } from '../../../src/puzzle/core/interact';
import { playerBox } from '../../../src/puzzle/core/geometry';
import { applyTurn, cubeKey, initialCube, isBlocked, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import { clearedRooms, dialBlocked, dialTurn, doneFlags, openChapter, restartRoom, type ChapterSession } from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveTurnMode, dialBlockKey } from '../../../src/puzzle/app/cubeMapModel';
import { pendingTip } from '../../../src/puzzle/app/helpModel';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { cutsceneBeforeLevel, memoryEntries, recordCutscene } from '../../../src/puzzle/meta/cutscenes';
import { nextAfterClear } from '../../../src/puzzle/meta/progress';
import { cutsceneById } from '../../../src/puzzle/content/cutscenes';
import { validateCutscene } from '../../../src/puzzle/devtools/validateCutscene';
import { planCutscene } from '../../../src/puzzle/app/cutscene';
import { LevelObserver, CUTSCENE_SCORE, type LevelSnap } from '../../../src/puzzle/audio/events';
import { ch5Stage } from '../../../src/puzzle/audio/score';
import { layerMix } from '../../../src/puzzle/audio/mix';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const, 'scale' as const] };
const CH5 = CUBE_CHAPTERS.find(c => c.chapter === 5)!;
const SPEC = chapterSpecOf(CH5);
const ROOMS = { landing: ROOMS5.landing, sky: ROOMS5.sky, east: ROOMS5.east, west: ROOMS5.west, north: ROOMS5.north, engine: ROOMS5.engine, meadow: ROOMS5.meadow, walkA: ROOMS5.walkA, walkB: ROOMS5.walkB, walkC: ROOMS5.walkC, walkD: ROOMS5.walkD };

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
const card = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'card', label, card: c }] }, seconds: 1 / 60 });
const uncard = (label: string, c: string): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card: c }] }, seconds: 1 / 60 });
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const flip: Cmd[] = [{ act: 'flip' }, { wait: 0.15 }];

/** 第五章開章 → 窄梯 → 天窗間 → 3D 啟動觀星儀；章節道具 = 尺度卡「大」「小」(開章補發) */
function activated(): ChapterSession {
  const st = chapterStart(defaultSave(), SPEC, CH5.start);
  let cs = openChapter(SPEC, { ...st, items: { 'card.da': 1, 'card.xiao': 1 } }, OPTS);
  const r = applyChapterEvent(cs, { t: 'door', door: 'hatchU' }, OPTS);
  if (r.kind !== 'enter') throw new Error(r.kind);
  cs = play(r.next, [{ wait: 0.1 }, { walkTo: [-3.0, -2.4] }, { act: 'interact' }]);
  return cs;
}
/** 2D、離桌子遠一點 (x = −6) 把「小」貼在自己身上 */
const SHRINK: Cmd[] = [{ walkTo: [-3.2, 1] }, ...flip, card('self', 'card.xiao'), { wait: 0.1 }];
const UNSHRINK: Cmd[] = [{ walkTo: [-3.2, null] }, uncard('self', 'card.xiao'), { wait: 0.1 }];
/** 實景走到桌前、對縮影按 E (縮小 = 鑽進去) */
const ENTER: Cmd[] = [...flip, { walkTo: [3.4, -0.5] }, { expect: w => expect(findTarget(w)?.def.id).toBe('mini'), label: '縮影' }, { act: 'interact' }, { wait: 0.1 }];
/** 原尺寸、藏寶圖、站在桌子右邊把「小」貼在齒輪上 */
const GEAR: Cmd[] = [{ walkTo: [5.8, 0] }, ...flip, { walkTo: [5.6, null] }, { expect: w => expect(labelTarget(w)?.def.id).toBe('gear'), label: '齒輪的標籤' }, card('gear', 'card.xiao'), { wait: 0.1 }];

describe('5-1 天窗間：資料', () => {
  it('validateLevel / validateEntry 0 issue；謎題 5-1a / 5-1b；墨 10；擺設三帶；通關文字', () => {
    expect(validateLevel(sky, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib', 'scale'] })).toEqual([]);
    expect(validateEntry(levelById('5-1')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(sky.puzzles!.map(q => [q.id, TEXT(q.titleKey)])).toEqual([['5-1a', '5-1a 桌上的魔方'], ['5-1b', '5-1b 縮影裡的卡榫']]);
    expect([sky.turnBudget, TEXT(sky.narrationKey), TEXT(sky.nextKey), layoutDepthIssues(sky)]).toEqual([{ base: 10 }, '天花板是一整片星圖。星圖下，立著觀星儀。', '天窗的星圖對上了。三扇窗，各在一個方向等你。', []]);
    expect(CH5_CUBE.dial!.miniOnly).toEqual(['ST', 'SB']);
    expect([CH5_CUBE.dial!.jams!.map(j => [j.group, j.until ?? null, j.home?.room ?? null]), CH5_CUBE.dial!.marks]).toEqual([[['ST', null, 'sky'], ['SB', null, 'sky'], ['SB', 'gear', null]], [{ group: 'SB', obj: 'mini' }]]);
  });

  it('字條：四張 (5-1a L1 / L2、5-1b L1 / L2)；原文；H1～H4 / H10；間距 ≥ 3、任一 16 單位畫面 ≤ 3 張；兩個視角都讀得到', () => {
    const notes = sky.objects.filter(o => o.type === 'note');
    const txt = (id: string) => { const o = notes.find(n => n.id === id)!; return TEXT(o.type === 'note' ? o.textKey ?? '' : ''); };
    expect(notes.map(o => [o.id, o.x, txt(o.id), o.type === 'note' && o.revealAfter])).toEqual([
      ['noteA', -9.6, '桌上那一棟，我始終進不去。', undefined], ['noteA2', -6.4, '標籤，只能貼在東西上嗎？', 240],
      ['noteB', 8, '卡住它的東西，常常不在它身上。', undefined], ['noteB2', 11, '家裡只有一份的東西，要先給誰？', 240]
    ]);
    const AHA = ['轉', '片', '軸', '面', '外', '小', '縮', '窗', '倒', '讀', '合', '秤', '重', '光', '對', '齊', '符', '陣', '門'];
    const KEYS = ['觀星儀', '縮影', '齒輪', '星圖', '刻度', '尺度卡'];
    for (const o of notes) {
      const t = txt(o.id);
      expect(/[A-Za-z]|按|[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]|正下方|最右邊|左邊第/.test(t) || /^(把|先|去|到)/.test(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(40);
      for (const term of [...AHA, ...KEYS]) expect([o.id, term, t.includes(term)]).toEqual([o.id, term, false]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (const x0 of xs) expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
  });
});

describe('5-1 標籤「你」(P10：玩家自己的名詞標籤，只收尺度卡「小」)', () => {
  it('離桌子遠 (2D)：範圍內只有自己的標籤 → 貼「小」= 縮小 0.4 (碰撞箱、跳高照比例)；「大」貼不上 (無效字)；取下 = 原尺寸', () => {
    const cs = activated();
    runScript(cs.world, [{ walkTo: [-3.2, 1] }, ...flip]);
    expect([labelTarget(cs.world)?.def.id, findTarget(cs.world)]).toEqual(['self', null]);
    runScript(cs.world, [card('self', 'card.da'), { wait: 0.05 }]);
    expect([cs.world.msg, cs.world.player.scale ?? 1]).toEqual(['字抖了一下，墨色淡了。卡片退了回來。', 1]);
    runScript(cs.world, [card('self', 'card.xiao'), { wait: 0.05 }]);
    const b = playerBox(cs.world.player);
    expect([cs.world.msg, cs.world.player.scale, +(b.max[1] - b.min[1]).toFixed(3), +(b.max[0] - b.min[0]).toFixed(3), cs.world.ext.labels!.self]).toEqual(['量過了。你照著刻度，縮小了。', SELF_SCALE, 0.36, 0.24, ['card.xiao']]);
    // 跳高照比例 (實景：1.25 × 0.4 = 0.5)
    let top = 0;
    runScript(cs.world, [...flip, { hold: { jump: true }, seconds: 1 / 60 }, { hop: 0, until: w => { top = Math.max(top, w.player.y); return w.player.onGround && w.player.vy === 0 && top > 0.1; }, seconds: 2 }]);
    expect(+top.toFixed(2)).toBeCloseTo(0.5, 1);
    runScript(cs.world, [...flip, ...UNSHRINK]);
    expect([cs.world.msg, cs.world.player.scale]).toEqual(['尺度卡取了下來。你回到原來的大小。', 1]);
  });

  it('站在桌邊 (2D)：自己的標籤讓位 (齒輪 / 縮影的標籤優先)；縮小時桌上的標籤搆不到 → 「太小了」', () => {
    const cs = activated();
    runScript(cs.world, [{ walkTo: [5.8, 0] }, ...flip, { walkTo: [5.6, null] }]);
    expect(labelTarget(cs.world)?.def.id).toBe('gear');
    runScript(cs.world, [...flip, ...SHRINK, ...flip, { walkTo: [5.6, 0] }, ...flip, { walkTo: [5.6, null] }]);
    expect(labelTarget(cs.world)).toBeNull();
    runScript(cs.world, [{ act: 'interact' }]);
    expect(cs.world.msg).toBe('你太小了，搆不到桌上。走遠一點，才看得到自己的標籤。');
  });

  it('縮小時穿門：門把搆不到 (不換房)', () => {
    let cs = play(activated(), [...SHRINK, ...flip, { walkTo: [-8, 3.9] }, { act: 'interact' }]);
    expect([cs.state.room, cs.world.msg]).toEqual(['sky', '縮成這樣，門把搆不到。']);
    cs = pump(cs);
    expect(cs.state.room).toBe('sky');
  });
});

describe('5-1 縮影 (鑽進 / 鑽出；轉動模式只列縮影的頂 / 底)', () => {
  it('原尺寸對縮影按 E = 看 (側門太窄)；把縮影本身標「小」= 不收 (卡片退回)', () => {
    const cs = activated();
    runScript(cs.world, [{ walkTo: [3.4, -0.5] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('和這棟房子一模一樣，只是很小。側面的小門，比你的手指還窄。');
    runScript(cs.world, [{ walkTo: [2.2, 0] }, ...flip, { walkTo: [2.3, null] }]);
    expect(labelTarget(cs.world)?.def.id).toBe('mini');
    runScript(cs.world, [card('mini', 'card.xiao'), { wait: 0.05 }]);
    expect([cs.world.msg, cs.world.inv['card.xiao'], cs.world.ext.labels?.mini]).toEqual(['縮影已經夠小了。再縮下去，連門都看不見。', 1, undefined]);
  });

  it('縮小 → 鑽進去 (站在縮影頂上、ext.mini)；轉動模式只列「縮影的頂層 / 底層」(底層：齒輪卡住 = 楔形)；縮影外不列；縮影裡取不下「小」；E = 鑽出來', () => {
    const cs = play(activated(), [...SHRINK, ...ENTER]);
    expect([cs.world.msg, +cs.world.player.y.toFixed(2), cs.world.ext.mini]).toEqual(['你從側面的小門鑽了進去，站在縮影的屋頂上。', 1.68, true]);
    runScript(cs.world, flip);
    const m = deriveTurnMode(cs, TEXT, null);
    expect([m.rings!.map(r => r.name), m.headers.map(h => `${h.group}${h.dir}:${h.state}`), m.caption]).toEqual([
      ['縮影的頂層', '縮影的底層'], ['ST-1:ok', 'ST1:ok', 'SB-1:jammed', 'SB1:jammed'], '你在縮影裡：轉得到的，只有縮影的頂層和底層。'
    ]);
    expect([dialBlocked(cs, T('X1', 1)), dialBlocked(cs, T('SB', 1)), TEXT(dialBlockKey(cs, 'SB', 'jammed'))]).toEqual(['noGroup', 'jammed', '縮影的底層被一顆齒輪卡住了。']);
    runScript(cs.world, [uncard('self', 'card.xiao'), { wait: 0.05 }]);
    expect([cs.world.msg, cs.world.player.scale]).toEqual(['這裡太窄，變不回去。先離開縮影。', SELF_SCALE]);
    runScript(cs.world, [...flip, { act: 'interact' }, { wait: 0.1 }]);
    expect([cs.world.msg, cs.world.ext.mini, cs.world.player.y]).toEqual(['你從縮影裡鑽了出來。', false, 0]);
    expect([dialBlocked(cs, T('ST', 1)), dialBlocked(cs, T('X1', 1))]).toEqual(['noGroup', null]);
    runScript(cs.world, flip);
    expect(deriveTurnMode(cs, TEXT, null).rings!.map(r => r.name)).toEqual(['東西軸', '南北軸', '上下軸']);
  });

  it('天窗間不在頂面心 (先用中間片轉走)：縮影的頂 / 底都是楔形「天窗間不在最上面，縮影對不上這棟房子。」', () => {
    let cs = activated();
    runScript(cs.world, flip);
    cs = ok(dialTurn(cs, T('X1', 1)));
    cs = play(cs, [...flip, ...SHRINK, ...ENTER, ...flip]);
    expect([cs.world.ext.mini, dialBlocked(cs, T('ST', 1)), TEXT(dialBlockKey(cs, 'ST', 'jammed'))]).toEqual([true, 'jammed', '天窗間不在最上面，縮影對不上這棟房子。']);
  });
});

describe('5-1a 桌上的魔方 (P10 首次)', () => {
  it('縮影裡頂層 ↻ 一次 (墨 9) → 天窗間原地轉 (朝向 1) → 星圖對上刻度 = 5-1a', () => {
    let cs = play(activated(), [...SHRINK, ...ENTER, ...flip]);
    cs = ok(dialTurn(cs, T('ST', 1)));
    expect([cs.state.cube!.rot.sky, cs.state.cube!.pos.sky, cs.state.turns!.left]).toEqual([1, [1, 1, 2], 9]);
    cs = play(cs, [{ wait: 0.05 }]);
    expect([get(cs, 'starScale').used, cs.world.msg, doneFlags(cs.spec, cs.state, cs.world).has('5-1a')]).toEqual([true, '天窗的星圖，慢慢對上了觀星儀的刻度。', true]);
    // 轉了之後東門朝南：接上走道 A → 樓梯口 (回得去)
    expect(cs.world.ext.cube!.links.doorE).toEqual({ to: 'room', room: 'landing', door: 'hatchU', kind: 'door' });
  });

  it('另一解：頂層 ↺ 三次 (墨 7)；只轉兩次 (半圈) = 還沒對上', () => {
    let cs = play(activated(), [...SHRINK, ...ENTER, ...flip]);
    cs = play(ok(dialTurn(ok(dialTurn(cs, T('ST', -1))), T('ST', -1))), [{ wait: 0.05 }]);
    expect([cs.state.cube!.rot.sky, get(cs, 'starScale').used]).toEqual([2, false]);
    cs = play(ok(dialTurn(cs, T('ST', -1))), [{ wait: 0.05 }]);
    expect([cs.state.cube!.rot.sky, cs.state.turns!.left, get(cs, 'starScale').used]).toEqual([1, 7, true]);
  });

  it('刻度盤 (3D 按 E) 的說明：天窗朝別處 / 差一點 / 星圖對了但樓梯與三扇窗不在刻度上 / 對上了', () => {
    const cs = activated();
    const o = get(cs, 'starScale');
    const say = (layout: Record<string, readonly [number, number, number]>, rots: Record<string, number>) => {
      cs.world.ext = { ...cs.world.ext, cube: { ...cs.world.ext.cube!, layout, rots } };
      return TEXT(o.def.type === 'starScale' ? o.def[({ away: 'awayText', off: 'offText', near: 'nearText', done: 'doneText' } as const)[alignState(cs.world, o)]] : '');
    };
    const S0 = initialCube(CH5_CUBE).pos;
    expect([
      say({ ...S0, sky: [1, 0, 1] }, {}), say(S0, {}), say(S0, { sky: 2 }), say(S0, { sky: 1, east: 3 }), say(S0, { sky: 1 })
    ]).toEqual([
      '天窗朝著別的方向，星圖看不見了。', '刻度上的北，和天窗星圖的北，差了一點。', '刻度上的北，和天窗星圖的北，差了一點。',
      '星圖對上了。可是樓梯和三扇窗，都不在刻度上。', '天窗的星圖，對上了刻度。'
    ]);
    runScript(cs.world, [{ walkTo: [-0.9, -2.6] }, { expect: w => expect(findTarget(w)?.def.id).toBe('starScale'), label: '刻度盤' }]);
  });

  it('只用中間片：可達 12,288 種排列中沒有一種對上 (不限墨 = 拿掉縮影則無解)；中間片 + 縮影 (天窗間在頂面心才轉得動) 98,304 種、最少 1 步', () => {
    const bfs = (def: typeof CH5_CUBE, groups: readonly string[]) => {
      const s0 = initialCube(def);
      const seen = new Map<string, number>([[cubeKey(s0, def), 0]]);
      const q: Array<[CubeState, number]> = [[s0, 0]];
      let hit = -1;
      for (let h = 0; h < q.length; h++) {
        const [s, d] = q[h];
        if (hit < 0 && skyAligned(s)) hit = d;
        for (const g of groups) for (const dir of [1, -1] as const) {
          if ((g === 'ST' || g === 'SB') && s.pos.sky.join() !== '1,1,2') continue;
          const n = applyTurn(def, s, { group: g, dir });
          if (isBlocked(n)) continue;
          const k = cubeKey(n, def);
          if (!seen.has(k)) { seen.set(k, d + 1); q.push([n, d + 1]); }
        }
      }
      return [seen.size, Math.max(...seen.values()), hit];
    };
    expect(bfs(CH5_MIDDLE_CUBE, ['X1', 'Y1', 'Z1'])).toEqual([12288, 10, -1]);
    expect(bfs(CH5_SKY_CUBE, ['X1', 'Y1', 'Z1', 'ST', 'SB'])).toEqual([98304, 11, 1]);
    expect(CH5_ALIGN).toEqual({ room: 'sky', at: [1, 1, 2], rot: 1, home: { landing: [1, 2, 1], east: [2, 1, 1], west: [0, 1, 1], north: [1, 0, 1] } });
  }, 60_000);
});

describe('5-1b 縮影裡的卡榫 (P3 / P10)', () => {
  it('原尺寸把齒輪量「小」→ 掉出軌道 (閂住、pushTo)；取下「小」它也不回去；「小」貼在齒輪上時自己的標籤缺卡 (只有一張「小」)', () => {
    const cs = play(activated(), GEAR);
    const g = get(cs, 'gear');
    expect([cs.world.msg, g.used, g.x, g.z, +g.def.w.toFixed(2)]).toEqual(['齒輪縮小，從軌道上掉了出來。', true, 4.9, -0.95, 0.28]);
    expect(dialBlocked(cs, T('SB', 1))).toBe('noGroup'); // 縮影外：不列
    runScript(cs.world, [...flip, { walkTo: [-3.2, 1] }, ...flip, { act: 'interact' }]);
    expect(cs.world.msg).toBe('尺度卡「小」還貼在別的標籤上。先去把它取下來。');
    runScript(cs.world, [...flip, { walkTo: [5.8, 0] }, ...flip, { walkTo: [5.6, null] }, uncard('gear', 'card.xiao'), { wait: 0.1 }]);
    expect([g.used, +g.def.w.toFixed(2), cs.world.inv['card.xiao']]).toEqual([true, 0.28, 1]);
  });

  it('先縮齒輪、再縮自己、鑽進縮影：底層轉一次 (↻ 或 ↺) = 5-1b；兩題都完成 = 天窗間通關', () => {
    let cs = play(activated(), [...GEAR, uncard('gear', 'card.xiao'), ...flip, ...SHRINK, ...ENTER, ...flip]);
    expect(dialBlocked(cs, T('SB', -1))).toBeNull();
    cs = pump(ok(dialTurn(cs, T('SB', -1))));
    expect([get(cs, 'mini').used, cs.state.cube!.rot.engine, doneFlags(cs.spec, cs.state, cs.world).has('5-1b'), clearedRooms(cs.spec, cs.state, cs.world)]).toEqual([true, 3, true, []]);
    cs = play(ok(dialTurn(cs, T('ST', 1))), [{ wait: 0.05 }]);
    expect(clearedRooms(cs.spec, cs.state, cs.world)).toEqual(['sky']);
  });

  it('先做 5-1b 再做 5-1a 也行 (底層轉過，刻度只看樓梯口與三扇窗)；R = 回到進房時 (標籤、齒輪、魔方)', () => {
    let cs = play(activated(), [...SHRINK, ...ENTER, ...flip]);
    cs = play(ok(dialTurn(cs, T('ST', 1))), [{ wait: 0.05 }]);
    expect(get(cs, 'starScale').used).toBe(true);
    const back = restartRoom(cs, OPTS);
    runScript(back.world, [{ wait: 0.05 }]);
    expect([back.world.player.scale ?? 1, back.world.ext.labels?.self, back.state.cube!.rot.sky, get(back, 'starScale').used, get(back, 'gear').used]).toEqual([1, undefined, 0, false, false]);
  });
});

describe('5-1 validateDial (兩個子模型 + 拿掉要素)', () => {
  const model = (cards = CH5_ZONE51.cards, mini: typeof CH5_ZONE51.mini | null = CH5_ZONE51.mini) =>
    dialModelOf(CH5_ZONE51.cube, ROOMS, CH5_ZONE51.puzzles, CH5_ZONE51.start, CH5_ZONE51.finish, { cards, ...(mini ? { mini } : {}) });
  it('縮影子模型：16 種排列、卡死 0；5-1a 1 / 3 (ST↻；ST↺ ×3)、5-1b 1 / 1 (SB↻ / SB↺)', () => {
    const r = validateDial(model());
    expect([r.solvable, r.arrangements, r.states, r.deadlocks, r.issues, r.lockIssues, r.entryIssues]).toEqual([true, 16, 2074, [], [], [], []]);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.distinct, p.issues])).toEqual([
      ['5-1a', 1, 3, 2, []], ['gear', 0, null, 1, []], ['5-1b', 1, 1, 14, []], ['ch5.sky', 0, null, 1, []]
    ]);
  });
  it('拿掉縮影 (mini 不給) → 5-1a / 5-1b 都無解；齒輪沒有槽 (「小」只能貼自己) → 5-1b 無解', () => {
    const noMini = validateDial(model(CH5_ZONE51.cards, null));
    expect([noMini.solvable, noMini.perPuzzle.find(p => p.id === '5-1a')!.shortest, noMini.perPuzzle.find(p => p.id === '5-1b')!.shortest]).toEqual([false, null, null]);
    const noGear = validateDial(model([{ id: 'xiao', start: 'hand', slots: { self: { room: 'sky' } } }]));
    expect([noGear.solvable, noGear.perPuzzle.find(p => p.id === '5-1a')!.shortest, noGear.perPuzzle.find(p => p.id === '5-1b')!.shortest]).toEqual([false, 1, null]);
  });
  it('中間片 + 縮影 (房 = 樓梯口、天窗間；卡片不進模型)：可達排列 49,152、狀態 867,960 (< 2×10⁶)、卡死 0；5-1a 1 / 3', () => {
    const z = CH5_ZONE51_MIDDLE;
    const r = validateDial({ ...dialModelOf(z.cube, { landing: ROOMS.landing, sky: ROOMS.sky }, z.puzzles, z.start, z.finish, { mini: z.mini }), maxSolutions: 1000 });
    expect([r.solvable, r.arrangements, r.states, r.deadlocks, r.issues]).toEqual([true, 49152, 867960, [], []]);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second])).toEqual([['5-1a', 1, 3]]);
  }, 120_000);
});

describe('5-1 cs:attic、分層音訊、USED_ON、手機小提示', () => {
  it('cs:attic：5-1 房間通關畫面的「繼續探索」才播 (前往下一章 / 選單進關不播)、只播一次；四鏡剪紙、總長約 29.6 秒；逐字稿照 cutscenes-v0.1；回憶頁列出', () => {
    const cut = cutsceneById('cs:attic')!;
    expect([cut.trigger, cut.shots.map(s => s.art.sceneId), CUTSCENE_SCORE['cs:attic']]).toEqual([{ afterClear: '5-1', onRoom: true }, ['attic.beams', 'attic.note', 'attic.map', 'attic.stamp'], 'ch5']);
    expect(cut.shots.flatMap(s => s.lines.map(k => TEXT(k)))).toEqual([
      '閣樓有三扇天窗。', '三道光，落在三個不同的地方。', '梁上一張爸爸的字條：', '「東邊是他，西邊是我。北邊……是誰？」', '天窗外是星圖，不是夜空。', '三扇窗的門，錯開了一格。', '第二天，深夜。'
    ]);
    const plan = planCutscene(cut, TEXT, { speed: 'normal', reduceMotion: false, name: '阿青' });
    const DOC = [8.2, 9.1, 8.3, 4.0];
    plan.shots.forEach((s, i) => expect([i + 1, Math.abs(s.sec - DOC[i]) < 0.15]).toEqual([i + 1, true]));
    expect([Math.abs(plan.totalSec - 29.6) < 0.5, validateCutscene(cut, { bundle: zhHant, levelIds: LEVELS.map(e => e.id) })]).toEqual([true, []]);
    const save = { ...defaultSave(), cleared: ['4-1', '4-2', '4-3', '4-4', '5-1'], seenCutscenes: ['cs:night'] };
    expect([nextAfterClear('5-1', 'room', CHAPTERS), cutsceneBeforeLevel(save, '5-1', undefined, undefined, 'room')?.id, cutsceneBeforeLevel(save, '5-1')?.id]).toEqual(['5-1', 'cs:attic', undefined]);
    expect(cutsceneBeforeLevel({ ...save, cleared: ['4-4'] }, '5-1', undefined, undefined, 'room')).toBeUndefined();
    expect(cutsceneBeforeLevel(recordCutscene(save, 'cs:attic', false), '5-1', undefined, undefined, 'room')).toBeUndefined();
    expect(memoryEntries(save).map(e => e.id)).toContain('cs:attic');
  });

  it('第五章 E♭ 分層：層數 = 三扇窗的完成數；0 = 墊音 + 低音、1 + 琶音、2 + 質感、3 + 旋律 (不在第五章 = 照強度)', () => {
    expect([ch5Stage(new Set()), ch5Stage(new Set(['5-1a', '5-1b'])), ch5Stage(new Set(['5-2', '5-4'])), ch5Stage(new Set(['5-2', '5-3', '5-4']))]).toEqual([0, 0, 2, 3]);
    const on = (stage: number | null) => Object.entries(layerMix('explore', 2, false, false, stage)).filter(([, v]) => v > 0).map(([k]) => k);
    expect([on(0), on(1), on(2), on(3), on(null)]).toEqual([['pad', 'bass'], ['pad', 'bass', 'arp'], ['pad', 'bass', 'arp', 'texture'], ['pad', 'bass', 'melody', 'arp', 'texture'], ['pad', 'bass', 'melody', 'arp', 'texture']]);
  });

  it('USED_ON：星圖對上刻度 / 齒輪掉出軌道 / 縮影的底層轉過', () => {
    const W = {};
    const s = (objs: LevelSnap['objs']): LevelSnap => ({
      world: W, room: 'sky', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs, cube: '', ink: 10,
      mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: ''
    });
    const o = (id: string, type: string, used: boolean) => ({ id, type, used, gone: false, x: 0, z: 0 });
    const obs = new LevelObserver();
    obs.update(s([o('a', 'starScale', false), o('g', 'miniGear', false), o('m', 'miniCube', false)]));
    const out = obs.update(s([o('a', 'starScale', true), o('g', 'miniGear', true), o('m', 'miniCube', true)]));
    expect(out.filter(a => a.kind === 'sfx').map(a => a.kind === 'sfx' && a.id)).toEqual(['sfx.lamp.on', 'sfx.latch.open', 'sfx.dial.turn']);
  });

  it('手機 (觸控)：鍵盤的一次性小提示不出 (轉動模式的「方向鍵選一排…」會壓住模式標籤)', () => {
    const ctx = { inLevel: true, mapOpen: true, trayOpen: false, turnMode: true, busy: false };
    expect([pendingTip([], ctx), pendingTip([], { ...ctx, touch: true }), pendingTip([], { ...ctx, turnMode: false, mapOpen: false, touch: true })]).toEqual(['turn', null, null]);
  });
});

