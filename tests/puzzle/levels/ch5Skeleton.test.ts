// 第五章骨架 (規格 6「第五章骨架與銜接（v0.4 細化）」骨架的驗證)：登錄表、24 種朝向 (表唯一、0～3 = 舊 yaw、三軸 ↻ 四次回原樣、↻↺ 互反)、
// 切片轉的朝向、走廊格的接通、S0 連接表、七間占位房與四格走道 (門位、封門、validateLevel、擺設三帶)、觀星儀啟動、dialTurn / undoTurn、
// 窗框 (星釘鎖、不在窗房不列)、validateDial (中間片 12,288 種排列、直徑 10、卡死 0、到三扇窗的最少轉數)、三層並排的展開圖與星環盤、
// 第四章存檔接第五章、尺度卡補發、cs:night 的觸發、舊存檔 (朝向 0～3) 照常讀
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH5_CUBE, CH5_MIDDLE_CUBE, CH5_ZONE_SKELETON, faceOf } from '../../../src/puzzle/content/cubes/ch5';
import { east, engine, landing, meadow, north, sky, walkA, walkB, walkC, walkD, west } from '../../../src/puzzle/content/levels/ch5/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { THEMES } from '../../../src/puzzle/render/themes';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { findTarget } from '../../../src/puzzle/core/interact';
import {
  applyTurn, cubeKey, initialCube, isBlocked, links, localSide, ORIENTS, rotateSide, SIDES, turnDirs, turnRot, type CubeState, type Side, type Turn
} from '../../../src/puzzle/core/cube';
import { captureState, dialBlocked, dialTurn, openChapter, undoTurn, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap, deriveTurnMode, reduceTurnMode } from '../../../src/puzzle/app/cubeMapModel';
import { chapterStart, grantScaleCards, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, sanitizeChapter, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { levelState, nextAfterClear } from '../../../src/puzzle/meta/progress';
import { cutsceneBeforeLevel, recordCutscene } from '../../../src/puzzle/meta/cutscenes';
import { CUTSCENES, cutsceneById } from '../../../src/puzzle/content/cutscenes';
import { validateCutscene } from '../../../src/puzzle/devtools/validateCutscene';
import { planCutscene } from '../../../src/puzzle/app/cutscene';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { layoutDepthIssues, validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { dialModelOf, validateDial } from '../../../src/puzzle/devtools/validateCube';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const, 'scale' as const] };
const CH5 = CUBE_CHAPTERS.find(c => c.chapter === 5)!;
const SPEC: ChapterSpec = { chapter: 5, cube: CH5.cube, rooms: CH5.rooms, doors: chapterDoors(CH5.rooms) };
const ROOMS = { landing, sky, east, west, north, engine, meadow, walkA, walkB, walkC, walkD };
const WALKS = ['walkA', 'walkB', 'walkC', 'walkD'];

/** 新玩家開第五章 (從地下室的木梯 → 樓梯口南門) */
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH5.start), OPTS);
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
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind}`);
  return r.next;
};
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [-3.0, -2.4] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '觀星儀' }, { act: 'interact' }];
/** 樓梯口 → 窄梯 → 天窗間 → 啟動觀星儀 */
const activated = (): ChapterSession => play(through(start(), 'hatchU'), ACTIVATE);
const in2d = (cs: ChapterSession): ChapterSession => { runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]); return cs; };
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const linkTable = (s: CubeState) => links(CH5_CUBE, s, SPEC.doors).map(l => `${l.from.room}.${l.from.door}>${'room' in l.to ? `${l.to.room}.${l.to.door}` : l.to.frame}`);
/** 從 S0 依序轉 (純魔方運算，不檢查鎖扣) */
const spin = (...ts: Turn[]): CubeState => ts.reduce<CubeState>((s, t) => { const r = applyTurn(CH5_CUBE, s, t); if (isBlocked(r)) throw new Error(r.blocked); return r; }, initialCube(CH5_CUBE));

describe('第五章骨架：登錄表與魔方', () => {
  it('CHAPTERS 第五章 (閣樓主題、levels 5-1)；LevelEntry 5-1 (筆尖 + 比例尺、前置 4-4)；CUBE_CHAPTERS chapter 5 (七間房 + 四格走道、從樓梯口南門進、要尺度卡)', () => {
    expect(CHAPTERS.find(c => c.id === 5)).toEqual({ id: 5, titleKey: 'ch.5.title', theme: 'attic', levels: ['5-1', '5-2', '5-3'] }); // 5-2 東窗登錄；5-3 西窗登錄
    expect([TEXT('ch.5.title'), THEMES.attic.id, THEMES.meadow.id]).toEqual(['第五章　閣樓', 'attic', 'meadow']);
    const e = levelById('5-1')!;
    expect([e.chapter, e.abilities, e.unlock.after, e.load(), TEXT(e.titleKey)]).toEqual([5, ['nib', 'scale'], ['4-4'], sky, '天窗間']);
    expect(validateEntry(e, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect([cubeChapterOf('5-1'), CH5.cube, CH5.start, CH5.levels, CH5.scaleCards, Object.keys(CH5.rooms).sort()]).toEqual([
      CH5, CH5_CUBE, { room: 'landing', door: 'doorS' }, { '5-1': 'sky', '5-2': 'east', '5-3': 'west' }, true,
      ['east', 'engine', 'landing', 'meadow', 'north', 'sky', 'walkA', 'walkB', 'walkC', 'walkD', 'west']
    ]);
    expect(CHAPTERS.find(c => c.id === 6)).toBeUndefined(); // 終章在 6-1 實作時登錄
  });

  it('CH5_CUBE：3×3×3 切片轉、控制盤；S0 三層 (頂：天窗間 / 走道 A；中：走道 C、北窗、西窗、林心、東窗、樓梯口、走道 D；底：走道 B、機關)；屋框；走廊格；組 X1 / Y1 / Z1 / SE / SW / SN 與星釘鎖', () => {
    expect([CH5_CUBE.dims, CH5_CUBE.ops, CH5_CUBE.control, CH5_CUBE.corridors]).toEqual([[3, 3, 3], 'slice', 'dial', WALKS]);
    const grid = (z: number) => [0, 1, 2].map(y => [0, 1, 2].map(x => CH5_CUBE.cells.find(c => c.at[0] === x && c.at[1] === y && c.at[2] === z)?.room ?? '·').join(' '));
    expect([grid(2), grid(1), grid(0)]).toEqual([
      ['· · ·', '· sky ·', '· walkA ·'],
      ['walkC north ·', 'west meadow east', '· landing walkD'],
      ['· · ·', 'walkB engine ·', '· · ·']
    ]);
    expect(CH5_CUBE.frame.map(f => [f.at.join(''), f.side, f.kind, f.to ?? null, !!f.wall])).toEqual([
      ['121', 'S', 'porch', 'cellarLadder', false], ['112', 'U', 'skylight', null, true], ['211', 'E', 'skylight', 'starE', true], ['011', 'W', 'skylight', 'starW', true], ['101', 'N', 'skylight', 'starN', true]
    ]);
    // 窗 (wall) 不是門：樓梯口被轉到西面時，它的南門 (入口) 朝著西窗外的星空 = 門後是牆
    expect(linkTable(spin(T('Z1', 1))).filter(x => x.startsWith('landing.doorS'))).toEqual([]);
    // 5-1：加縮影的頂 / 底 (ST / SB，miniOnly)
    expect(CH5_CUBE.dial!.groups.map(g => [g.id, g.kind, g.axis ?? g.room])).toEqual([['X1', 'slice', 'x'], ['Y1', 'slice', 'y'], ['Z1', 'slice', 'z'], ['SE', 'spin', 'east'], ['SW', 'spin', 'west'], ['SN', 'spin', 'north'], ['ST', 'spin', 'z'], ['SB', 'spin', 'z']]);
    expect(CH5_CUBE.dial!.locks).toEqual([
      { group: 'SE', until: '5-2', rooms: ['east'], text: 'lvl.ch5.locked' }, { group: 'SW', until: '5-3', rooms: ['west'], text: 'lvl.ch5.locked' }, { group: 'SN', until: '5-4', rooms: ['north'], text: 'lvl.ch5.locked' }
    ]);
    expect([CH5_CUBE.dial!.entry, TEXT('lvl.ch5.locked'), turnDirs(CH5_CUBE, 'X1'), turnDirs(CH5_CUBE, 'SE')]).toEqual([{ room: 'sky', obj: 'dial' }, '外圈的星環被銀釘釘住了。', [-1, 1], [-1, 1]]);
  });
});

describe('第五章骨架：24 種朝向與切片轉', () => {
  it('ORIENTS：24 種、彼此不同、每一種都是 N E S W U D 的排列；0～3 = 舊的 yaw (rotateSide 順時針 rot 次、U / D 不變)；localSide = rotateSide 的反查', () => {
    expect(ORIENTS.length).toBe(24);
    expect(new Set(ORIENTS.map(o => o.join(''))).size).toBe(24);
    for (const o of ORIENTS) expect([...o].sort()).toEqual([...SIDES].sort());
    const RING: Side[] = ['N', 'E', 'S', 'W'];
    const oldYaw = (s: Side, r: number): Side => (RING.includes(s) ? RING[(RING.indexOf(s) + r) % 4] : s);
    for (let r = 0; r < 4; r++) for (const s of SIDES) expect([r, s, rotateSide(s, r)]).toEqual([r, s, oldYaw(s, r)]);
    for (let r = 0; r < 24; r++) for (const s of SIDES) expect(localSide(rotateSide(s, r), r)).toBe(s);
    expect([ORIENTS[0].join(''), ORIENTS[1].join(''), ORIENTS[4].join('')]).toEqual(['NESWUD', 'ESWNUD', 'DEUWNS']); // 4 = 第一個傾倒的朝向 (東西軸 ↻ 一次)
  });

  it('三軸 ↻ 四次回原樣、↻ 再 ↺ 互反；繞上下軸的 0～3 = (rot + dir) mod 4 (第一～四章的數字不變)；三軸生成全部 24 種', () => {
    for (let r = 0; r < 24; r++) for (const ax of ['x', 'y', 'z'] as const) {
      let k = r;
      for (let i = 0; i < 4; i++) k = turnRot(k, ax, 1);
      expect(k).toBe(r);
      expect(turnRot(turnRot(r, ax, 1), ax, -1)).toBe(r);
    }
    for (let r = 0; r < 4; r++) expect([turnRot(r, 'z', 1), turnRot(r, 'z', -1)]).toEqual([(r + 1) % 4, (r + 3) % 4]);
    const seen = new Set([0]);
    const q = [0];
    while (q.length) { const r = q.pop()!; for (const ax of ['x', 'y', 'z'] as const) { const n = turnRot(r, ax, 1); if (!seen.has(n)) { seen.add(n); q.push(n); } } }
    expect(seen.size).toBe(24);
  });

  it('東西軸 ↻ 一次 (上 → 北 → 下 → 南)：天窗間從頂面到北面、它的 U (天窗) 此刻朝 N (朝外永遠朝外)；核心原地只轉朝向；東 / 西窗不動；四次回到 S0', () => {
    const s1 = spin(T('X1', 1));
    expect([s1.pos.sky, rotateSide('U', s1.rot.sky), rotateSide('S', s1.rot.sky), s1.pos.north, s1.pos.engine, s1.pos.landing, s1.pos.meadow, s1.rot.meadow === s1.rot.sky]).toEqual([[1, 0, 1], 'N', 'U', [1, 1, 0], [1, 2, 1], [1, 1, 2], [1, 1, 1], true]);
    expect([s1.pos.east, s1.rot.east, s1.pos.west, s1.rot.west]).toEqual([[2, 1, 1], 0, [0, 1, 1], 0]);
    expect(cubeKey(spin(T('X1', 1), T('X1', 1), T('X1', 1), T('X1', 1)))).toBe(cubeKey(initialCube(CH5_CUBE)));
    // 中間片只搬動面心：每間有窗的房，朝外的那一側 (本地) 永遠是此刻所在的那一面
    const OUT = { sky: 'U', east: 'E', west: 'W', north: 'N', engine: 'D', landing: 'S' } as const;
    let s = initialCube(CH5_CUBE);
    const seq: Turn[] = [T('X1', 1), T('Y1', -1), T('Z1', 1), T('Y1', 1), T('X1', -1), T('Z1', -1), T('Z1', -1), T('X1', 1)];
    for (const t of seq) {
      s = applyTurn(CH5_CUBE, s, t) as CubeState;
      for (const [room, out] of Object.entries(OUT)) expect([t.group, room, rotateSide(out, s.rot[room])]).toEqual([t.group, room, faceOf(s, room)]);
    }
  });

  it('窗框 (spin)：那一間房原地繞朝外的軸轉 (位置、朝外不變，四周的門換方向)；走廊格不動；不是面心 (被轉到核心以外的地方不會發生) 時 outOfCube', () => {
    const s0 = initialCube(CH5_CUBE);
    const r = applyTurn(CH5_CUBE, s0, T('SE', 1)) as CubeState;
    // 從房外 (東邊) 看順時針：上 → 北 → 下 → 南 → 本地的 N 此刻朝下
    expect([r.pos.east, rotateSide('E', r.rot.east), rotateSide('N', r.rot.east), cubeKey({ pos: r.pos, rot: { ...r.rot, east: 0 } })]).toEqual([[2, 1, 1], 'E', 'D', cubeKey(s0)]);
    expect(cubeKey(applyTurn(CH5_CUBE, r, T('SE', -1)) as CubeState)).toBe(cubeKey(s0));
    // 北窗被轉到頂面後，北窗的窗框轉的仍是北窗自己 (在頂面原地轉)
    const top = spin(T('X1', -1));
    expect(faceOf(top, 'north')).toBe('U');
    const tr = applyTurn(CH5_CUBE, top, T('SN', 1)) as CubeState;
    expect([tr.pos.north, rotateSide('N', tr.rot.north), tr.rot.north !== top.rot.north]).toEqual([[1, 1, 2], 'U', true]);
  });
});

describe('第五章骨架：走廊格與連接表', () => {
  it('S0 連接表：入口 → 樓梯口南門；樓梯口的窄梯 ↔ (走道 A) ↔ 天窗間南門；天窗間地板 ↔ 林心、機關天花板 ↔ 林心 (封著，連接表照列)；其餘的門後是牆', () => {
    expect(linkTable(initialCube(CH5_CUBE))).toEqual([
      'landing.doorS>cellarLadder', 'landing.hatchU>sky.doorS', 'sky.doorS>landing.hatchU', 'sky.hatchD>meadow.hatchU',
      'engine.hatchU>meadow.hatchD', 'meadow.hatchD>engine.hatchU', 'meadow.hatchU>sky.hatchD'
    ]);
  });

  it('走廊格：穿過去 = 走道另一頭的房 (型別 = 門)；轉開走道 A (南北軸 ↻：天窗間到西面、走道 A 留在原地) 就斷；東西軸 ↻ 連走道 A 一起轉 → 照樣接著', () => {
    const viaA = (s: CubeState) => linkTable(s).filter(x => x.startsWith('landing.hatchU') || x.startsWith('sky.doorS'));
    expect(viaA(spin(T('Y1', 1)))).toEqual([]);
    expect(viaA(spin(T('X1', 1))).sort()).toEqual(['landing.hatchU>sky.doorS', 'sky.doorS>landing.hatchU']);
    expect(links(CH5_CUBE, initialCube(CH5_CUBE), SPEC.doors).find(l => l.from.room === 'landing' && l.from.door === 'hatchU')?.kind).toBe('door');
    // 西窗：南北軸 ↺ 一次 → 西窗轉到頂面、南門朝走道 A → 接上樓梯口的窄梯 (要站在樓梯口轉)
    expect(linkTable(spin(T('Y1', -1)))).toContain('landing.hatchU>west.doorS');
  });

  it('走廊格不能進去 (沒有門；只在展開圖)；光、墨都不經走廊格 (本章沒有玻璃 / 管線)', () => {
    for (const w of WALKS) expect([w, ROOMS[w as keyof typeof ROOMS].objects.filter(o => o.type === 'cubeDoor')]).toEqual([w, []]);
    expect([CH5_CUBE.glass, CH5_CUBE.ink]).toEqual([undefined, undefined]);
  });
});

describe('第五章骨架：七間占位房', () => {
  it('門位 (id、型別、本地門位、座標、封門)：樓梯口 S 門 / U 窄梯；天窗間 S / E 門、D 地板梯口 (封到 5-5c)；東窗 N / D；西窗 S / D；北窗 E / D；機關 N / S (星釘、兩面都封) / U (封到 5-5c)；林心六個門位都封到 5-5c', () => {
    const doors = (l: typeof sky) => l.objects.filter(o => o.type === 'cubeDoor').map(o => o.type === 'cubeDoor' && [o.id, o.side, o.kind, o.x, o.z, o.sealed?.until ?? null]);
    expect(doors(landing)).toEqual([['doorS', 'S', 'door', -2, 4.8, null], ['hatchU', 'U', 'door', 2.6, -4.4, null]]);
    expect(doors(sky)).toEqual([['doorS', 'S', 'door', -8, 4.8, null], ['doorE', 'E', 'door', 11.8, 0, null], ['hatchD', 'D', 'door', 0, 1.6, '5-5c']]);
    expect(doors(east)).toEqual([['doorN', 'N', 'door', -4, -4.8, null], ['hatchD', 'D', 'door', 3, 1.6, null]]);
    expect(doors(west)).toEqual([['doorS', 'S', 'door', 4, 4.8, null], ['hatchD', 'D', 'door', -3, 1.6, null]]);
    expect(doors(north)).toEqual([['doorE', 'E', 'door', 9.8, 0, null], ['hatchD', 'D', 'door', -3, 1.6, null]]);
    expect(doors(engine)).toEqual([['doorN', 'N', 'door', -6, -4.8, 'ch5.windows'], ['doorS', 'S', 'door', 6, 4.8, 'ch5.windows'], ['hatchU', 'U', 'door', 0, -4.4, '5-5c']]);
    expect(engine.objects.filter(o => o.type === 'cubeDoor' && o.sealed?.both).map(o => o.id)).toEqual(['doorN', 'doorS']);
    expect(doors(meadow).map(d => d && [d[0], d[1], d[5]])).toEqual([['hatchD', 'D', '5-5c'], ['hatchU', 'U', '5-5c'], ['doorN', 'N', '5-5c'], ['doorE', 'E', '5-5c'], ['doorS', 'S', '5-5c'], ['doorW', 'W', '5-5c']]);
    expect([TEXT('lvl.5-1.floorSealed'), TEXT('lvl.ch5.engine.nailed')]).toEqual(['地板下透著綠光，打不開。', '門上釘著三顆星釘。']);
  });

  it('各房 validateLevel 0 issue (四格走道只有 level.noExit，有意)；擺設三帶都有可互動物件 (走道進不去，不檢查)；主題 attic (林心 meadow)、墨 10 (林心 8)；尺寸', () => {
    for (const [id, l] of Object.entries(ROOMS)) {
      const issues = validateLevel(l, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib', 'scale'] });
      expect([id, issues.map(i => i.code)]).toEqual([id, WALKS.includes(id) ? ['level.noExit'] : []]);
      if (!WALKS.includes(id)) expect([id, layoutDepthIssues(l)]).toEqual([id, []]);
      expect([id, l.theme, l.turnBudget]).toEqual([id, id === 'meadow' ? 'meadow' : 'attic', { base: id === 'meadow' ? 8 : 10 }]);
    }
    expect(Object.values(ROOMS).map(l => [l.bounds.minX, l.bounds.maxX])).toEqual([[-6, 6], [-12, 12], [-10, 10], [-10, 10], [-10, 10], [-14, 14], [-10, 10], [-6, 6], [-6, 6], [-6, 6], [-6, 6]]);
    expect([sky.id, east.id, west.id, north.id, engine.id, meadow.id, landing.id, walkA.id]).toEqual(['5-1', '5-2', '5-3', '5-4', '5-5', '6-1', 'landing', 'walkA']);
    expect([TEXT(landing.narrationKey), TEXT(sky.narrationKey), TEXT(east.narrationKey)]).toEqual(['三扇天窗，三種看法。爸爸只看過其中一扇。', '天花板是一整片星圖。星圖下，立著觀星儀。', '從這扇窗看，整棟房子像一個方塊。']);
  });

  it('換房：樓梯口南門 = 回地下室的木梯 (只說明)；樓梯口 → 窄梯 → 天窗間 (墨 10)；天窗間東門後是牆、地板梯口封著 (地板下透著綠光)', () => {
    let cs = start();
    expect([cs.state.room, cs.state.door, TEXT(cs.world.level.narrationKey)]).toEqual(['landing', 'doorS', '三扇天窗，三種看法。爸爸只看過其中一扇。']);
    runScript(cs.world, [{ wait: 0.1 }, { walkTo: [-2.0, 3.6] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('木梯往下回地下室。這一趟，只能往上走。');
    cs = through(cs, 'hatchU');
    expect([cs.state.room, cs.state.door, cs.state.turns?.left]).toEqual(['sky', 'doorS', 10]); // 進房就補滿 (啟動前也記著)
    expect(cs.world.ext.cube!.links).toEqual({ doorS: { to: 'room', room: 'landing', door: 'hatchU', kind: 'door' }, doorE: { to: 'wall' }, hatchD: { to: 'room', room: 'meadow', door: 'hatchU', kind: 'door' } });
    const r = applyChapterEvent(cs, { t: 'door', door: 'hatchD' }, OPTS);
    expect([r.kind, cs.world.msg]).toEqual(['blocked', '地板下透著綠光，打不開。']);
    cs = through(cs, 'doorS');
    expect([cs.state.room, cs.state.door]).toEqual(['landing', 'hatchU']);
  });
});

describe('第五章骨架：觀星儀與切片轉', () => {
  it('啟動 (3D 按 E)：dial = true、說明「三個環，轉得動的只有中間。…」、墨 10；中間片可轉、窗框鎖著 (星釘)；已啟動再按 = readyText', () => {
    const cs = activated();
    expect([cs.state.room, cs.state.dial, cs.world.msg, cs.state.turns, cs.world.ext.unlocked]).toEqual(['sky', true, '三個環，轉得動的只有中間。切到藏寶圖，就能轉中間那三片。', { left: 10, undo: [] }, []]);
    in2d(cs);
    expect(['X1', 'Y1', 'Z1', 'SE', 'SW', 'SN'].map(g => dialBlocked(cs, T(g, 1)))).toEqual([null, null, null, 'locked', 'locked', 'locked']);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('觀星儀已經啟動了。');
  });

  it('東西軸 ↻ 一次 (人在天窗間：連人一起轉到北面) → 墨 10 → 9；回退 = 沒轉 (墨回 10、朝向互反、狀態等價)', () => {
    const cs = in2d(activated());
    const before = captureState(cs);
    const a = ok(dialTurn(cs, T('X1', 1)));
    expect([a.state.cube!.pos.sky, rotateSide('U', a.state.cube!.rot.sky), a.state.turns!.left, a.world.ext.cube!.at, a.world.ext.cube!.links.doorS]).toEqual([[1, 0, 1], 'N', 9, [1, 0, 1], { to: 'room', room: 'landing', door: 'hatchU', kind: 'door' }]);
    const b = ok(undoTurn(a));
    expect([cubeKey(b.state.cube!), b.state.cube!.rot.sky, b.state.turns!.left, b.state.turns!.undo]).toEqual([cubeKey(before.cube!), 0, 10, []]);
  });

  it('轉兩次接到東窗 (兩種)：東西軸 ↻ (天窗間連人轉到北面) → 南北軸 ↻ (東窗轉到頂面) → 天窗間南門 ↔ 走道 A ↔ 東窗北門；或 東西軸 ↺ → 上下軸 ↻ (樓梯口的窄梯 ↔ 東窗的地板梯口)；走過去 = 東窗 (墨 10)', () => {
    let cs = ok(dialTurn(in2d(activated()), T('X1', 1)));
    cs = ok(dialTurn(cs, T('Y1', 1)));
    expect([faceOf(cs.state.cube!, 'sky'), faceOf(cs.state.cube!, 'east'), cs.state.turns!.left]).toEqual(['N', 'U', 8]);
    expect(linkTable(cs.state.cube!)).toContain('sky.doorS>east.doorN');
    cs = through(cs, 'doorS');
    expect([cs.state.room, cs.state.door, cs.state.turns!.left]).toEqual(['east', 'doorN', 10]);
    expect(linkTable(spin(T('X1', -1), T('Z1', 1)))).toContain('landing.hatchU>east.hatchD');
  });

  it('轉不動的原因：沒啟動 / 窗框鎖著 (星釘：外圈的星環被銀釘釘住了。) / 墨乾；機關的門釘著星釘 (兩面都封：從接到它的門也走不進去)', () => {
    expect(dialBlocked(start(), T('X1', 1))).toBe('noDial');
    const cs = in2d(activated());
    const m = deriveTurnMode(cs, TEXT, { group: 'SE', dir: 1 });
    expect([m.blocked, m.blockedText]).toEqual([null, null]); // 不在東窗：窗框不列 (選不到)
    const dry = { ...cs, state: { ...cs.state, turns: { left: 0, undo: [] } } };
    expect(dialBlocked(dry, T('X1', 1))).toBe('noInk');
    // 南北軸 ↺ → 東西軸 ↺：東窗的地板梯口接到機關的北門
    const s = spin(T('Y1', -1), T('X1', -1));
    const toEngine = links(CH5_CUBE, s, SPEC.doors).find(l => 'room' in l.to && l.to.room === 'engine' && l.from.room !== 'meadow')!;
    expect(toEngine).toBeDefined();
    // 人在那一間房、按那扇門：門本身沒封，但對面是機關的星釘門 (兩面都封) → 說「門上釘著三顆星釘。」、不換房
    const there = openChapter(SPEC, { ...chapterStart(defaultSave(), SPEC, CH5.start), cube: s, room: toEngine.from.room, door: null }, OPTS);
    const r = applyChapterEvent(there, { t: 'door', door: toEngine.from.door }, OPTS);
    expect([r.kind, there.world.msg, there.state.room]).toEqual(['blocked', '門上釘著三顆星釘。', toEngine.from.room]);
  });
});

describe('第五章骨架：窗框 (星釘) 與星環盤', () => {
  it('天窗間的星環盤：三列 (東西軸 / 南北軸 / 上下軸) × 中片 ↺ ↻；窗框不在窗房不列；鍵盤 ↑↓ 換列、←→ 換鈕；選一片 → 三層裡該片的 9 格描框、預覽；確認 = 一個 turn 指令', () => {
    const cs = in2d(activated());
    const m = deriveTurnMode(cs, TEXT, null);
    expect(m.rings).toEqual([{ name: '東西軸', kind: 'axis' }, { name: '南北軸', kind: 'axis' }, { name: '上下軸', kind: 'axis' }]);
    expect(m.headers.map(h => [h.group, h.dir, h.at.side, h.ring, h.sub, h.glyph, h.state, h.label])).toEqual([
      ['X1', -1, 'ring', { row: 0, col: 0 }, '中片', '↺', 'ok', '東西軸中片逆時針'], ['X1', 1, 'ring', { row: 0, col: 1 }, '中片', '↻', 'ok', '東西軸中片順時針'],
      ['Y1', -1, 'ring', { row: 1, col: 0 }, '中片', '↺', 'ok', '南北軸中片逆時針'], ['Y1', 1, 'ring', { row: 1, col: 1 }, '中片', '↻', 'ok', '南北軸中片順時針'],
      ['Z1', -1, 'ring', { row: 2, col: 0 }, '中片', '↺', 'ok', '上下軸中片逆時針'], ['Z1', 1, 'ring', { row: 2, col: 1 }, '中片', '↻', 'ok', '上下軸中片順時針']
    ]);
    expect([m.caption, m.text.keys]).toEqual(['在星環盤上點一片的箭頭看預覽，按「確認」才會轉。', '↑↓ 換一環　←→ 換一片　Enter 確認　Z 回退　Esc 離開']);
    const first = reduceTurnMode(null, { t: 'step', axis: 'v', d: 1 }, m).sel;
    const second = reduceTurnMode(first, { t: 'step', axis: 'v', d: 1 }, m).sel;
    const right = reduceTurnMode(second, { t: 'step', axis: 'h', d: 1 }, m).sel;
    const wrap = reduceTurnMode(right, { t: 'step', axis: 'h', d: 1 }, m).sel;
    const up = reduceTurnMode(first, { t: 'step', axis: 'v', d: -1 }, m).sel;
    expect([first, second, right, wrap, up]).toEqual([{ group: 'X1', dir: -1 }, { group: 'Y1', dir: -1 }, { group: 'Y1', dir: 1 }, { group: 'Y1', dir: -1 }, { group: 'Z1', dir: -1 }]);
    const p = deriveTurnMode(cs, TEXT, { group: 'X1', dir: 1 });
    expect([p.caption, p.preview!.slab!.length, p.preview!.slab!.slice(0, 3)]).toEqual(['預覽：東西軸中片順時針（還沒轉）', 9, [[9, 0], [9, 1], [9, 2]]]);
    expect(p.preview!.moves.map(v => v.room).sort()).toEqual(['engine', 'landing', 'meadow', 'north', 'sky', 'walkA']);
    expect(reduceTurnMode({ group: 'X1', dir: 1 }, { t: 'confirm' }, p).command).toEqual({ t: 'turn', turn: { group: 'X1', dir: 1 } });
  });

  it('到了東窗：星環盤多一列「東窗的窗框」(星釘：鎖著；選了 = 外圈的星環被銀釘釘住了。)；西窗 / 北窗的窗框不列', () => {
    let cs = ok(dialTurn(in2d(activated()), T('X1', 1)));
    cs = in2d(through(ok(dialTurn(cs, T('Y1', 1))), 'doorS'));
    const m = deriveTurnMode(cs, TEXT, { group: 'SE', dir: 1 });
    expect(m.rings!.map(r => r.name)).toEqual(['東西軸', '南北軸', '上下軸', '東窗的窗框']);
    expect(m.headers.filter(h => h.kind === 'spin').map(h => [h.group, h.dir, h.state, h.mark, h.ring!.row, h.label])).toEqual([
      ['SE', -1, 'locked', '✦', 3, '東窗的窗框逆時針（鎖著）'], ['SE', 1, 'locked', '✦', 3, '東窗的窗框順時針（鎖著）']
    ]);
    expect([m.blocked, m.blockedText, m.caption]).toEqual(['locked', '外圈的星環被銀釘釘住了。', '東窗的窗框順時針：外圈的星環被銀釘釘住了。']);
    expect(reduceTurnMode({ group: 'SE', dir: 1 }, { t: 'confirm' }, m).command).toBeNull();
  });
});

describe('第五章骨架：三層並排的展開圖', () => {
  it('展開圖：11 欄 × 3 列 (頂層在左、中層、底層在右，各空一欄)；層名；走廊格畫成木梁 (連到兩頭的面心格)；門的方向用世界方位 (傾倒的房間也對)；東 / 西屋框寫在格內', () => {
    const m = deriveCubeMap(activated(), TEXT)!;
    expect([m.cols, m.rows, m.layers]).toEqual([11, 3, [{ x: 0, w: 3, name: '頂層' }, { x: 4, w: 3, name: '中層' }, { x: 8, w: 3, name: '底層' }]]);
    const at = (x: number, y: number) => m.cells.find(c => c.x === x && c.y === y);
    expect([at(1, 1)?.name, at(1, 1)?.current, at(5, 0)?.name, at(4, 1)?.name, at(5, 1)?.name, at(6, 1)?.name, at(5, 2)?.name, at(9, 1)?.name]).toEqual(['天窗間', true, '北窗', '西窗', '林心草地', '東窗', '樓梯口', '最後的機關']);
    expect(m.cells.filter(c => c.kind === 'corridor').map(c => [c.room, c.x, c.y, c.short, c.beam])).toEqual([
      ['walkA', 1, 2, '梁', ['N', 'D']], ['walkC', 4, 0, '梁', ['E', 'S']], ['walkD', 6, 2, '梁', ['N', 'W']], ['walkB', 8, 1, '梁', ['E', 'U']]
    ]);
    expect(m.frames.map(f => [f.x, f.y, f.side, f.name, !!f.inCell])).toEqual([
      [5, 2, 'S', '地下室的木梯', false], [1, 1, 'U', '天窗', false], [6, 1, 'E', '東邊的星空', true], [4, 1, 'W', '西邊的星空', true], [5, 0, 'N', '北邊的星空', false]
    ]);
    // 東西軸 ↻ 之後：天窗間在北面，它的南門此刻朝上 (U)、地板梯口朝南 (S)
    const t = deriveCubeMap(ok(dialTurn(in2d(activated()), T('X1', 1))), TEXT)!;
    expect(t.doors.filter(d => d.room === 'sky').map(d => [d.door, d.x, d.y, d.side, d.link])).toEqual([['doorS', 5, 0, 'U', 'room'], ['doorE', 5, 0, 'E', 'wall'], ['hatchD', 5, 0, 'S', 'room']]);
  });
});

describe('第五章骨架：validateDial (骨架區：只開中間片)', () => {
  it('中間片三條：可達排列 12,288 (走廊格同類合併)、直徑 10', () => {
    const def = CH5_MIDDLE_CUBE;
    const opts = def.dial!.groups.flatMap(g => turnDirs(def, g.id).map(dir => ({ group: g.id, dir })));
    const s0 = initialCube(def);
    const seen = new Set([cubeKey(s0, def)]);
    let frontier = [s0];
    let depth = 0;
    while (frontier.length) {
      const next: CubeState[] = [];
      for (const s of frontier) for (const o of opts) { const r = applyTurn(def, s, o) as CubeState; const k = cubeKey(r, def); if (!seen.has(k)) { seen.add(k); next.push(r); } }
      if (next.length) depth++;
      frontier = next;
    }
    expect([seen.size, depth]).toEqual([12288, 10]);
  });

  it('從樓梯口開章、天窗間啟動：到東 / 西 / 北窗最少 2 / 1 / 3 轉 (西窗 = 站在樓梯口轉南北軸 ↺；只算天窗間 2 / 2 / 3)；卡死 0；排列 12,288；封門 (星釘兩面都封、林心) 由 cubeDoor.sealed 組出', () => {
    const results = (['east', 'west', 'north'] as const).map(room => {
      const z = CH5_ZONE_SKELETON.reach(room);
      const m = dialModelOf(CH5_ZONE_SKELETON.cube, CH5.rooms, z.puzzles, z.start, z.finish);
      const r = validateDial(m);
      return [room, r.arrangements, r.solvable, r.deadlocks, r.issues, r.lockIssues, r.entryIssues, r.perPuzzle[0].shortest, r.perPuzzle[0].budget, r.perPuzzle[0].issues];
    });
    expect(results).toEqual([
      ['east', 12288, true, [], [], [], [], 2, 10, []],
      ['west', 12288, true, [], [], [], [], 1, 10, []],
      ['north', 12288, true, [], [], [], [], 3, 10, []]
    ]);
    const m = dialModelOf(CH5_CUBE, CH5.rooms, [], 'landing', 'x');
    expect(m.doorLocks!.filter(k => k.room === 'engine')).toEqual([
      { room: 'engine', door: 'doorN', until: 'ch5.windows', both: true }, { room: 'engine', door: 'doorS', until: 'ch5.windows', both: true }, { room: 'engine', door: 'hatchU', until: '5-5c' }
    ]);
  });
});

describe('第四章存檔接著第五章、尺度卡、舊存檔、cs:night', () => {
  it('第四章存檔 (chapters[4]) 讀入後開第五章 = 新章 (S0、樓梯口南門)；第五章另存 chapters[5]；5-1 在 4-4 通關後開放、之前鎖著', () => {
    const ch4 = CUBE_CHAPTERS.find(c => c.chapter === 4)!;
    const spec4: ChapterSpec = { chapter: 4, cube: ch4.cube, rooms: ch4.rooms, doors: chapterDoors(ch4.rooms) };
    const s4 = openChapter(spec4, chapterStart(defaultSave(), spec4, ch4.start), OPTS);
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['4-1', '4-2', '4-3', '4-4'] }, captureState(s4)));
    const save = loadSave(store);
    const cs = openChapter(SPEC, chapterStart(save, SPEC, CH5.start), OPTS);
    expect([cs.state.chapter, cs.state.room, cs.state.door, cubeKey(cs.state.cube!), Object.keys(save.chapters)]).toEqual([5, 'landing', 'doorS', cubeKey(initialCube(CH5_CUBE)), ['4']]);
    const saved = withChapter(save, captureState(cs));
    expect([Object.keys(saved.chapters).sort(), saved.chapters['4']]).toEqual([['4', '5'], save.chapters['4']]);
    expect([levelState(levelById('5-1')!, save), levelState(levelById('5-1')!, defaultSave())]).toEqual(['open', 'locked']);
  });

  it('尺度卡：第五章 scaleCards = true → 帶著比例尺 (能力 scale) 開章時補發「大」「小」各一張 (已有就不補)', () => {
    const save = { ...defaultSave(), abilities: ['nib', 'scale'] as const };
    const st = chapterStart({ ...save, abilities: [...save.abilities] }, SPEC, CH5.start);
    const g = grantScaleCards({ ...save, abilities: [...save.abilities] }, CH5, st);
    expect([g.granted, g.state.items]).toEqual([['card.da', 'card.xiao'], { 'card.da': 1, 'card.xiao': 1 }]);
    expect(grantScaleCards({ ...save, abilities: [...save.abilities] }, CH5, g.state).granted).toEqual([]);
    expect(grantScaleCards(defaultSave(), CH5, st).granted).toEqual([]); // 沒有比例尺 = 不補
  });

  it('存檔的朝向：接受 0～23 (第五章的傾倒朝向照存)；舊存檔 (0～3) 照讀；不合法 (24、-1、1.5、字串) = 0', () => {
    const s = spin(T('X1', 1), T('Y1', 1));
    expect(s.rot.sky).toBeGreaterThan(3);
    const raw = { cube: s, rooms: {}, at: { room: 'sky', door: 'doorS' }, items: {}, flags: [] };
    expect(sanitizeChapter(JSON.parse(JSON.stringify(raw)))!.cube.rot).toEqual(s.rot);
    const bad = { ...raw, cube: { pos: { a: [0, 0, 0], b: [1, 0, 0], c: [2, 0, 0], d: [0, 1, 0], e: [1, 1, 0] }, rot: { a: 24, b: -1, c: 1.5, d: '2', e: 3 } } };
    expect(sanitizeChapter(bad)!.cube.rot).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 3 });
  });

  it('cs:night：觸發 = 4-4 通關後第一次前往 5-1 (看過就不再播)；六鏡剪紙、總長約 43.8 秒 (20～45)；逐字稿照 cutscenes-v0.1；撕紙聲只在鏡 4', () => {
    const cut = cutsceneById('cs:night')!;
    expect([cut.trigger, cut.shots.map(s => s.art.sceneId), cut.shots.map(s => s.transitionIn), CUTSCENES.map(c => c.id)]).toEqual([
      { afterClear: '4-4' }, ['night.notes', 'night.study', 'night.dawn', 'night.tear', 'night.morning', 'night.flip'],
      ['pageTurn', 'inkBleed', 'cut', 'paperTear', 'cut', 'inkBleed'], ['cs:prologue', 'cs:ch2', 'cs:ch3', 'cs:night', 'cs:attic']
    ]);
    expect(cut.shots.flatMap(s => s.lines.map(k => TEXT(k)))).toEqual([
      '抽屜裡，是爸爸沒寫完的筆記。', '「那天晚上，我又站上了那個圖案——」', '很多年前的一個晚上，爸爸站在圖案中央。', '圖案沒有亮。', '他等到天亮，什麼都沒有發生。',
      '他把畫了好多年的圖，撕成了六塊。', '第二天早上，他照常叫你起床。', '像什麼事都沒發生過。', '筆記的邊緣，有撕過的痕跡。', '老宅又轉了，這次是往上翻。'
    ]);
    const plan = planCutscene(cut, TEXT, { speed: 'normal', reduceMotion: false, name: '阿青' });
    const DOC = [8.8, 5.9, 7.1, 5.6, 7.5, 8.9];
    plan.shots.forEach((s, i) => expect([i + 1, Math.abs(s.sec - DOC[i]) < 0.15]).toEqual([i + 1, true]));
    expect([plan.totalSec >= 20 && plan.totalSec <= 45, Math.abs(plan.totalSec - 43.8) < 0.5, validateCutscene(cut, { bundle: zhHant, levelIds: LEVELS.map(e => e.id) })]).toEqual([true, true, []]);
    expect(cut.shots.map((s, i) => (s.audio ?? []).some(a => a.cue === 'paper.tear') ? i + 1 : 0).filter(Boolean)).toEqual([4]);
    const save = { ...defaultSave(), cleared: ['4-1', '4-2', '4-3', '4-4'] };
    expect([nextAfterClear('4-4', 'chapter', CHAPTERS), cutsceneBeforeLevel(save, '5-1')?.id, cutsceneBeforeLevel(defaultSave(), '5-1')]).toEqual(['5-1', 'cs:night', undefined]);
    expect(cutsceneBeforeLevel(recordCutscene(save, 'cs:night', false), '5-1')).toBeUndefined();
    expect(TEXT('lvl.4-4.next')).toBe('地下室往上翻了。');
  });
});
