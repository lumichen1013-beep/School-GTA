// core/chapter 光路 (N26；規格 6「第三章共用規則」光路、「3-2 玻璃長廊（細化）」)：lightPaths (天窗 → 逐格玻璃 / 稜鏡傳播、停的地方、via、
// 被蓋住的玻璃、朝向、防迴圈、確定性) 與 lightState (dark / white / weak / lit)；章節層寫入 World.ext.light
import { describe, it, expect } from 'vitest';
import { CH3_CUBE } from '../../../src/puzzle/content/cubes/ch3';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { initialCube, type CubeDef, type CubeState } from '../../../src/puzzle/core/cube';
import { dialTurn, lightPaths, lightState, openChapter, type ChapterSession } from '../../../src/puzzle/core/chapter';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { DEFAULT_MECHANICS, chapterSpecOf } from '../../../src/puzzle/mechanics';
import { TEXT } from '../msgs';

const S0 = initialCube(CH3_CUBE);
const at = (moves: Record<string, [number, number]>): CubeState => ({ pos: { ...S0.pos, ...Object.fromEntries(Object.entries(moves).map(([r, [x, y]]) => [r, [x, y, 0] as const])) }, rot: S0.rot });
/** 光路的簡寫：每扇天窗 → 「房:從哪邊進/via/往哪邊出」…「| 停在 格,那一側」 */
const fmt = (s: CubeState, uncovered?: ReadonlySet<string>) => lightPaths(CH3_CUBE, s, uncovered).beams.map(b =>
  [...b.steps.map(st => `${st.room}:${st.from}${st.via}${st.out ?? '-'}`), b.stop ? `|${b.stop.at.slice(0, 2).join('')}${b.stop.side}` : '|in'].join(' '));

describe('lightPaths：第三章 (CH3_CUBE.glass = CH3_GLASS)', () => {
  it('S0：兩扇天窗底下都是空格 → 光停在牆外 (沒有房被照到)', () => {
    expect(fmt(S0)).toEqual(['|00N', '|10N']);
    expect(lightPaths(CH3_CUBE, S0).hits).toEqual({});
  });

  it('夜溫室 ▲ (天窗下)：白光照進夜溫室 (via 0)、從南邊出去 → 底下是空格，停在 [1,1] 北側', () => {
    expect(fmt(at({ night: [1, 0] }))).toEqual(['|00N', 'night:N0S |11N']);
  });

  it('3-2a 的排列 (夜溫室 [1,0]、長廊 [1,1])：長廊從北邊進來 via 1 (穿過夜溫室)、照直往南 → 溫床 (稜鏡往東) → 深處的苔窗被蓋住 = 停在 [2,2] 西側', () => {
    const s = at({ night: [1, 0], gallery: [1, 1] });
    expect(fmt(s)).toEqual(['|00N', 'night:N0S gallery:N1S bed:N2E |22W']);
    expect(lightPaths(CH3_CUBE, s).hits.gallery).toEqual([{ from: 'N', via: 1, out: 'S', rooms: ['night'] }]);
    // 苔窗露出來 (3-4b 的介面：uncovered)：深處從西邊照進、沒有東窗 → 停在深處裡
    expect(fmt(s, new Set(['depths.W']))).toEqual(['|00N', 'night:N0S gallery:N1S bed:N2E depths:W3- |in']);
  });

  it('3-2b 的排列 (夜溫室 [1,0]、溫床 [1,1]、長廊原格)：L 形——溫床的稜鏡往東、長廊從西窗進來 via 2、長廊的稜鏡往南 → 深處北窗 via 3 (沒有南窗：停在深處裡)', () => {
    const s = at({ night: [1, 0], bed: [1, 1] });
    expect(fmt(s)).toEqual(['|00N', 'night:N0S bed:N1E gallery:W2S depths:N3- |in']);
    expect(lightPaths(CH3_CUBE, s).hits.gallery).toEqual([{ from: 'W', via: 2, out: 'S', rooms: ['night', 'bed'] }]);
  });

  it('長廊直接滑到天窗下 [1,0]：從北窗進來的是白光 (via 0)；苗圃 (木棚、沒有玻璃) 在天窗下 = 停在苗圃北側', () => {
    expect(fmt(at({ night: [0, 0], gallery: [1, 0] }))).toEqual(['night:N0S |01N', 'gallery:N0S |11N']);
    expect(fmt(at({ nursery: [0, 0] }))).toEqual(['|00N', '|10N']);
  });

  it('確定性：同一排列兩次結果相同；輸入不被改動', () => {
    const s = at({ night: [1, 0], bed: [1, 1] });
    const before = JSON.stringify(s);
    expect(lightPaths(CH3_CUBE, s)).toEqual(lightPaths(CH3_CUBE, s));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('lightPaths：朝向、防迴圈、沒有玻璃表', () => {
  // 2×2 的測試魔方：天窗在 [0,0] 北側
  const cube = (glass: CubeDef['glass']): CubeDef => ({ id: 't', dims: [2, 2, 1], ops: 'slide', cells: [{ at: [0, 0, 0], room: 'a' }, { at: [1, 0, 0], room: 'b' }, { at: [1, 1, 0], room: 'c' }, { at: [0, 1, 0], room: 'd' }], frame: [{ at: [0, 0, 0], side: 'N', kind: 'skylight' }], glass });
  it('朝向：本地門位以 rot 換算 (a 轉 1 = 本地 W 朝北)；光從本地 W 進、本地 E 出 = 往南', () => {
    const def = cube({ a: { glass: ['W', 'E'] } });
    const s: CubeState = { ...initialCube(def), rot: { a: 1, b: 0, c: 0, d: 0 } };
    expect(lightPaths(def, s).beams[0].steps.map(st => [st.room, st.from, st.out])).toEqual([['a', 'N', 'S']]);
    expect(lightPaths(def, initialCube(def)).beams[0].steps).toEqual([]); // 不轉 = 本地 N 沒有玻璃
  });
  it('防迴圈：繞一圈回到照過的房 → 停在那間房的門外 (同一條光不進同一房兩次)', () => {
    const def = cube({
      a: { glass: ['N', 'E', 'S'], prism: [['N', 'E'], ['S', 'E']] }, b: { glass: ['W', 'S'], prism: [['W', 'S']] },
      c: { glass: ['N', 'W'], prism: [['N', 'W']] }, d: { glass: ['E', 'N'], prism: [['E', 'N']] }
    });
    const b = lightPaths(def, initialCube(def)).beams[0];
    expect([b.steps.map(st => `${st.room}${st.via}`), b.stop]).toEqual([['a0', 'b1', 'c2', 'd3'], { at: [0, 0, 0], side: 'S' }]);
  });
  it('魔方沒有玻璃表 = 沒有房被照到', () => {
    const def = cube(undefined);
    expect(lightPaths(def, initialCube(def)).hits).toEqual({});
  });
});

describe('lightState (機制、驗證器、展開圖共用)', () => {
  it('dark / white / weak / lit', () => {
    expect(lightState([], 'N', 1)).toBe('dark');
    expect(lightState([{ from: 'W', via: 3 }], 'N', 1)).toBe('dark');
    expect(lightState([{ from: 'N', via: 0 }], 'N', 1)).toBe('white');
    expect(lightState([{ from: 'W', via: 1 }], 'W', 2)).toBe('weak');
    expect(lightState([{ from: 'W', via: 1 }, { from: 'W', via: 2 }], 'W', 2)).toBe('lit');
    expect(lightState([{ from: 'N', via: 0 }], 'N', 0)).toBe('lit');
  });
});

describe('章節層寫入 World.ext.light (進房 / 轉動後重算；只有當前房的那一份)', () => {
  const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
  const SPEC = chapterSpecOf(CH3);
  const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
  it('開章 (苗圃)：ext.light = { hits: [] }；長廊開章、轉兩次 → hits 跟著變；第二章 (沒有玻璃表) 不寫', () => {
    const cs = openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH3.start), OPTS);
    expect(cs.world.ext.light).toEqual({ hits: [] });
    let g: ChapterSession = openChapter(SPEC, { ...chapterStart(defaultSave(), SPEC, { room: 'gallery', door: 'doorW' }), dial: true }, OPTS);
    expect(g.world.ext.light).toEqual({ hits: [] });
    for (const t of [{ group: 'c4', dir: 'N' as const }, { group: 'c5', dir: 'W' as const }]) { const r = dialTurn(g, t); if ('blocked' in r) throw new Error(r.blocked); g = r; }
    expect(g.world.ext.light).toEqual({ hits: [{ from: 'N', via: 1, out: 'S', rooms: ['night'] }] });
    const ch2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
    const s2 = chapterSpecOf(ch2);
    expect('light' in openChapter(s2, chapterStart(defaultSave(), s2, ch2.start), OPTS).world.ext).toBe(false);
  });
});
