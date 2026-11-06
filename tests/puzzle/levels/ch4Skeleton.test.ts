// 第四章骨架 (規格 6「第四章骨架與銜接（v0.4 細化）」)：登錄表、魔方 CH4_CUBE (3×3×2 層轉、根結鎖扣)、六間占位房 (門位、梯口、封住的門、驗證器、擺設三帶)、
// S0 連接表、層轉是剛體旋轉 (層內的門不變)、梯口疊放 (u − l) mod 4、梯口穿行、年輪根盤啟動、層轉一次的 dialTurn / undoTurn、轉不動的原因、
// validateDial (只開上層 4 種、全開 16 種、直徑 4)、兩層並排的展開圖與層轉標頭、第三章存檔接著第四章、cs:ch3 的觸發
import { describe, it, expect } from 'vitest';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH4_CUBE } from '../../../src/puzzle/content/cubes/ch4';
import { archive, drawer, furnace, hall, sealed, well } from '../../../src/puzzle/content/levels/ch4/rooms';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { THEMES } from '../../../src/puzzle/render/themes';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { findTarget } from '../../../src/puzzle/core/interact';
import { applyTurn, cubeKey, initialCube, isBlocked, links, turnDirs, type CubeState, type Turn } from '../../../src/puzzle/core/cube';
import {
  captureState, dialBlocked, dialTurn, doorSpawn, openChapter, undoTurn, type ChapterSession, type ChapterSpec
} from '../../../src/puzzle/core/chapter';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap, deriveTurnMode, reduceTurnMode } from '../../../src/puzzle/app/cubeMapModel';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
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

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH4 = CUBE_CHAPTERS.find(c => c.chapter === 4)!;
const SPEC: ChapterSpec = { chapter: 4, cube: CH4.cube, rooms: CH4.rooms, doors: chapterDoors(CH4.rooms) };
const ROOMS = { hall, well, furnace, archive, drawer, sealed };

/** 新玩家開第四章 (從溫室的石階 → 根窖走廊北門) */
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH4.start), OPTS);
const cell = (cs: ChapterSession, room: string) => cs.state.cube!.pos[room].join('');
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
const ACTIVATE: Cmd[] = [{ wait: 0.1 }, { walkTo: [9.0, -2.7] }, { expect: w => expect(findTarget(w)?.def.id).toBe('dial'), label: '年輪根盤' }, { act: 'interact' }];
const activated = (): ChapterSession => play(start(), ACTIVATE);
const in2d = (cs: ChapterSession): ChapterSession => { runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]); return cs; };
const T = (group: string, dir: Turn['dir']): Turn => ({ group, dir });
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const through = (cs: ChapterSession, door: string): ChapterSession => {
  const r = applyChapterEvent(cs, { t: 'door', door }, OPTS);
  if (r.kind !== 'enter') throw new Error(`${cs.state.room}.${door}: ${r.kind}`);
  return r.next;
};
/** 每一間房此刻的接法 (房.門 → 房.門 / 屋框) */
const linkTable = (s: CubeState) => links(CH4_CUBE, s, SPEC.doors).map(l => `${l.from.room}.${l.from.door}>${'room' in l.to ? `${l.to.room}.${l.to.door}` : l.to.frame}${l.kind === 'arch' ? '=' : ''}`);
/** 從 S0 依序轉 (不檢查鎖扣：純魔方運算) */
const spin = (...ts: Turn[]): CubeState => ts.reduce<CubeState>((s, t) => { const r = applyTurn(CH4_CUBE, s, t); if (isBlocked(r)) throw new Error(r.blocked); return r; }, initialCube(CH4_CUBE));

describe('第四章骨架：登錄表與魔方', () => {
  it('CHAPTERS 第四章 (地下室主題、levels 4-1)；LevelEntry 4-1 (筆尖、前置 3-4)；CUBE_CHAPTERS chapter 4 (六間房、從走廊北門進)', () => {
    expect(CHAPTERS.find(c => c.id === 4)).toEqual({ id: 4, titleKey: 'ch.4.title', theme: 'cellar', levels: ['4-1', '4-2'] }); // 4-2 登錄
    expect([TEXT('ch.4.title'), THEMES.cellar.id]).toEqual(['第四章　地下室', 'cellar']);
    const e = levelById('4-1')!;
    expect([e.chapter, e.abilities, e.unlock.after, e.load(), TEXT(e.titleKey)]).toEqual([4, ['nib'], ['3-4'], hall, '根窖走廊']);
    expect(validateEntry(e, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect([cubeChapterOf('4-1'), CH4.cube, CH4.start, CH4.levels, Object.keys(CH4.rooms).sort()])
      .toEqual([CH4, CH4_CUBE, { room: 'hall', door: 'doorN' }, { '4-1': 'hall', '4-2': 'furnace' }, ['archive', 'drawer', 'furnace', 'hall', 'sealed', 'well']]);
  });

  it('CH4_CUBE：3×3×2 層轉、控制盤；S0 (上層：走廊在北邊、根井在中心；下層：書庫 西 / 墨爐 中 / 抽屜 東 / 封存室 南)；沒有實心格；屋框；L0 / L1、L0 鎖到 4-1c', () => {
    expect([CH4_CUBE.dims, CH4_CUBE.ops, CH4_CUBE.control]).toEqual([[3, 3, 2], 'layer', 'dial']);
    const grid = (z: number) => [0, 1, 2].map(y => [0, 1, 2].map(x => CH4_CUBE.cells.find(c => c.at[0] === x && c.at[1] === y && c.at[2] === z)?.room ?? '·').join(' '));
    expect([grid(1), grid(0)]).toEqual([['· hall ·', '· well ·', '· · ·'], ['· · ·', 'archive furnace drawer', '· sealed ·']]);
    expect(CH4_CUBE.cells.some(c => c.room === 'solid')).toBe(false);
    expect(CH4_CUBE.frame.map(f => [f.at.join(''), f.side, f.kind, f.to ?? null])).toEqual([['101', 'N', 'porch', 'greenhouseStair'], ['121', 'U', 'skylight', null], ['100', 'N', 'chapterExit', 'attic']]);
    expect([CH4_CUBE.dial!.entry, CH4_CUBE.dial!.groups, CH4_CUBE.dial!.locks]).toEqual([
      { room: 'hall', obj: 'dial' }, [{ id: 'L0', kind: 'layer', index: 0 }, { id: 'L1', kind: 'layer', index: 1 }], [{ group: 'L0', until: '4-1c', text: 'lvl.ch4.locked' }]
    ]);
    expect([turnDirs(CH4_CUBE, 'L0'), turnDirs(CH4_CUBE, 'L1'), TEXT('lvl.ch4.locked')]).toEqual([[-1, 1], [-1, 1], '下圈年輪被樹根結住了。']);
  });

  it('層轉 ↻：上層 北 → 東 → 南 → 西、朝向 +1；中心格不換位置只換朝向；四次回到原樣；可達排列 16', () => {
    const s1 = spin(T('L1', 1));
    expect([s1.pos.hall, s1.rot.hall, s1.pos.well, s1.rot.well, s1.pos.drawer, s1.rot.drawer]).toEqual([[2, 1, 1], 1, [1, 1, 1], 1, [2, 1, 0], 0]);
    expect(cubeKey(spin(T('L1', 1), T('L1', 1), T('L1', 1), T('L1', 1)))).toBe(cubeKey(initialCube(CH4_CUBE)));
    expect(cubeKey(spin(T('L0', -1), T('L0', 1)))).toBe(cubeKey(initialCube(CH4_CUBE)));
    const seen = new Set<string>();
    for (let u = 0; u < 4; u++) for (let l = 0; l < 4; l++) seen.add(cubeKey(spin(...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1)))));
    expect(seen.size).toBe(16);
  });
});

describe('第四章骨架：六間占位房', () => {
  it('門位 (id、型別、本地門位、座標)：走廊 N 門 / S 門 / D 地板梯口 (拱門形)；根井 N 門 / D 根梯；墨爐 U 根梯 / W・E 門 (墨線鎖)；書庫 E 門 (墨線鎖) / U 梯口 (窄)；抽屜 W 門 (墨線鎖) / U 梯口 (寬) / E 章門；封存室沒有門', () => {
    const doors = (l: typeof hall) => l.objects.filter(o => o.type === 'cubeDoor').map(o => o.type === 'cubeDoor' && [o.id, o.side, o.kind, o.x, o.z, o.sealed?.until ?? null]);
    expect(doors(hall)).toEqual([['doorN', 'N', 'door', -9, -4.8, null], ['doorS', 'S', 'door', 6, 4.8, null], ['hatchD', 'D', 'arch', -2, 1.6, null]]);
    expect(doors(well)).toEqual([['doorN', 'N', 'door', 0, -4.8, null], ['ladderD', 'D', 'door', 2, 1.2, null]]);
    expect(doors(furnace)).toEqual([['ladderU', 'U', 'door', 0, -4.4, null], ['doorW', 'W', 'door', -13.8, 0, '4-2a'], ['doorE', 'E', 'door', 13.8, 0, 'ink.E']]);
    expect(doors(archive)).toEqual([['doorE', 'E', 'door', 9.8, 0, '4-2a'], ['hatchU', 'U', 'door', -4, -4.4, '4-1b']]); // 4-1 細化：書庫的折疊梯收著 (4-1b 拉下前爬不上去)
    expect(doors(drawer)).toEqual([['doorW', 'W', 'door', -13.8, 0, 'ink.E'], ['hatchU', 'U', 'arch', -6, -4.4, null], ['chapterE', 'E', 'chapter', 13.8, 0, null]]);
    expect(doors(sealed)).toEqual([]);
    const ch = drawer.objects.find(o => o.id === 'chapterE')!;
    expect(ch.type === 'cubeDoor' && ch.key).toBe('key.cellar');
  });

  it('各房 validateLevel 0 issue (封存室只有 level.noExit)；擺設三帶都有可互動物件 (封存室進不去，不檢查)；主題 cellar、墨 8；尺寸', () => {
    for (const [id, l] of Object.entries(ROOMS)) {
      const issues = validateLevel(l, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, abilities: ['nib'] });
      expect([id, issues.map(i => i.code)]).toEqual([id, id === 'sealed' ? ['level.noExit'] : []]);
      if (id !== 'sealed') expect([id, layoutDepthIssues(l)]).toEqual([id, []]);
      expect([id, l.theme, l.turnBudget]).toEqual([id, 'cellar', { base: 8 }]);
    }
    expect(Object.values(ROOMS).map(l => [l.bounds.minX, l.bounds.maxX])).toEqual([[-12, 12], [-5, 5], [-14, 14], [-10, 10], [-14, 14], [-6, 6]]);
    expect([TEXT(hall.narrationKey), TEXT(furnace.narrationKey), TEXT(drawer.nextKey)]).toEqual(['一模一樣的書架，排得太整齊了。', '牆上的影子，慢了半拍。', '地下室往上翻了。第五章　閣樓——還在路上。']); // 4-2 細化：墨爐間的旁白
  });

  it('梯口的進房站位 (doorSpawn)：梯口前方 0.9 (往觀眾)；地板梯口站在活板門前、梯子站在梯子前', () => {
    expect(doorSpawn(hall, 'hatchD', 'D')).toEqual({ x: -2, y: 0, z: 1.6 + 0.7 + 0.9 });
    expect(doorSpawn(archive, 'hatchU', 'U')).toEqual({ x: -4, y: 0, z: -4.4 + 0.2 + 0.9 });
  });
});

describe('第四章骨架：連接表與梯口', () => {
  it('S0 連接表：入口 → 走廊 N 門；走廊 S ↔ 根井 N；根井 D ↔ 墨爐 U (梯子)；墨爐 W ↔ 書庫 E、墨爐 E ↔ 抽屜 W (封著，連接表照列)；走廊地板梯口下面是土；章門不接 (抽屜不在北邊)', () => {
    expect(linkTable(initialCube(CH4_CUBE))).toEqual([
      'hall.doorN>greenhouseStair', 'hall.doorS>well.doorN', 'well.doorN>hall.doorS', 'well.ladderD>furnace.ladderU',
      'furnace.ladderU>well.ladderD', 'furnace.doorW>archive.doorE', 'furnace.doorE>drawer.doorW', 'archive.doorE>furnace.doorW', 'drawer.doorW>furnace.doorE'
    ]);
  });

  it('層轉是剛體旋轉：16 種排列下，同一層兩間房之間的門一律照舊接通 (會變的只有梯口與屋框)', () => {
    const inLayer = (s: CubeState) => linkTable(s).filter(x => !x.includes('hatch') && !x.includes('ladder') && !/>(greenhouseStair|attic)/.test(x)).sort();
    const base = inLayer(initialCube(CH4_CUBE));
    for (let u = 0; u < 4; u++) for (let l = 0; l < 4; l++) {
      const s = spin(...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1)));
      expect([u, l, inLayer(s)]).toEqual([u, l, base]);
      // 中心疊中心：根井的根梯永遠接墨爐
      expect(linkTable(s)).toContain('well.ladderD>furnace.ladderU');
    }
  });

  it('梯口對到誰 = (u − l) mod 4：0 → 土、1 → 抽屜 (拱門對拱門)、2 → 封存室 (沒有梯口 = 土)、3 → 書庫 (門)；入口要 u = 0、章門要 l = 3', () => {
    const below = (u: number, l: number) => linkTable(spin(...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1)))).find(x => x.startsWith('hall.hatchD')) ?? 'soil';
    const table = [0, 1, 2, 3].map(u => [0, 1, 2, 3].map(l => below(u, l)));
    const expectAt = (d: number) => ['soil', 'hall.hatchD>drawer.hatchU=', 'soil', 'hall.hatchD>archive.hatchU'][d];
    for (let u = 0; u < 4; u++) for (let l = 0; l < 4; l++) expect([u, l, table[u][l]]).toEqual([u, l, expectAt((u - l + 4) % 4)]);
    const exits = (u: number, l: number) => linkTable(spin(...Array<Turn>(u).fill(T('L1', 1)), ...Array<Turn>(l).fill(T('L0', 1)))).filter(x => /greenhouseStair|attic/.test(x));
    expect([exits(0, 0), exits(1, 0), exits(0, 3), exits(2, 3)]).toEqual([['hall.doorN>greenhouseStair'], [], ['hall.doorN>greenhouseStair', 'drawer.chapterE>attic'], ['drawer.chapterE>attic']]);
  });

  it('換房：走廊北門 = 回溫室的石階 (只說明)；走廊 → 根井 → 墨爐 (梯子) → 回根井；墨爐 W / E 門封著 (門縫纏著乾掉的墨線，不換房)；地板梯口下面是土', () => {
    let cs = start();
    expect([cs.state.room, cs.state.door, TEXT(cs.world.level.narrationKey)]).toEqual(['hall', 'doorN', '一模一樣的書架，排得太整齊了。']);
    runScript(cs.world, [{ wait: 0.1 }, { walkTo: [-9.0, -3.6] }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('石階往上回溫室。這一趟，只能往下走。');
    runScript(cs.world, [{ walkTo: [-2.0, 2.6] }, { wait: 0.1 }, { expect: w => expect(findTarget(w)?.def.id).toBe('hatchD'), label: '地板梯口' }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('梯口下面是土。');
    cs = through(cs, 'doorS');
    expect([cs.state.room, cs.state.door]).toEqual(['well', 'doorN']);
    cs = through(cs, 'ladderD');
    expect([cs.state.room, cs.state.door, cs.state.turns!.left]).toEqual(['furnace', 'ladderU', 8]);
    for (const d of ['doorW', 'doorE']) {
      const r = applyChapterEvent(cs, { t: 'door', door: d }, OPTS);
      expect([d, r.kind, cs.world.msg, cs.state.room]).toEqual([d, 'blocked', '門縫纏著乾掉的墨線。', 'furnace']);
    }
    cs = through(cs, 'ladderU');
    expect([cs.state.room, cs.state.door]).toEqual(['well', 'ladderD']);
  });
});

describe('第四章骨架：年輪根盤與層轉', () => {
  it('啟動 (3D 按 E)：dial = true、說明「兩圈年輪。…」、墨 8；只開上層 (下層鎖著：根結)；已啟動再按 = readyText', () => {
    const cs = activated();
    expect([cs.state.dial, cs.world.msg, cs.state.turns, cs.world.ext.unlocked]).toEqual([true, '兩圈年輪。整層樓，跟著它轉。切到藏寶圖，就能轉上面那一層。', { left: 8, undo: [] }, []]);
    in2d(cs);
    expect([dialBlocked(cs, T('L0', 1)), dialBlocked(cs, T('L1', 1)), dialBlocked(cs, T('L1', -1))]).toEqual(['locked', null, null]);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('年輪根盤已經啟動了。');
  });

  it('上層 ↻ 一次 (人在走廊：連人一起轉) → 地板梯口疊在抽屜上 (拱門對拱門)、入口門對著牆；回退 = 沒轉 (墨 8 → 7 → 8、狀態等價)', () => {
    const cs = in2d(activated());
    const before = captureState(cs);
    const a = ok(dialTurn(cs, T('L1', 1)));
    expect([cell(a, 'hall'), a.state.cube!.rot.hall, a.state.turns!.left, a.world.ext.cube!.links.hatchD, a.world.ext.cube!.links.doorN])
      .toEqual(['211', 1, 7, { to: 'room', room: 'drawer', door: 'hatchU', kind: 'arch' }, { to: 'wall' }]);
    const b = ok(undoTurn(a));
    expect([cubeKey(b.state.cube!), b.state.turns!.left, b.state.turns!.undo]).toEqual([cubeKey(before.cube!), 8, []]);
  });

  it('梯口穿行：↻ → 爬下到抽屜 (站在梯子前) → 從抽屜爬上回走廊；↺ → 爬下到封存書庫 (門：窄梯)；轉不動的原因：沒啟動 / 下層鎖著 / 墨乾', () => {
    let cs = ok(dialTurn(in2d(activated()), T('L1', 1)));
    cs = through(cs, 'hatchD');
    expect([cs.state.room, cs.state.door, cs.world.player.x, +cs.world.player.z.toFixed(3), cs.state.turns!.left]).toEqual(['drawer', 'hatchU', -6, -3.3, 8]);
    cs = through(cs, 'hatchU');
    expect([cs.state.room, cs.state.door]).toEqual(['hall', 'hatchD']);
    cs = ok(dialTurn(ok(dialTurn(in2d(cs), T('L1', -1))), T('L1', -1)));
    expect(cs.world.ext.cube!.links.hatchD).toEqual({ to: 'room', room: 'archive', door: 'hatchU', kind: 'door' });
    cs = through(cs, 'hatchD');
    expect([cs.state.room, cs.state.door]).toEqual(['archive', 'hatchU']);
    expect(dialBlocked(start(), T('L1', 1))).toBe('noDial');
    const dry = { ...cs, state: { ...cs.state, turns: { left: 0, undo: [] } } };
    expect([dialBlocked(in2d(cs), T('L0', 1)), dialBlocked(dry, T('L1', 1))]).toEqual(['locked', 'noInk']);
  });

  it('站在梯口上不能轉 (人跨在梯口 = 門口卡著)；4-1c 之前下層一直鎖著 (轉動模式的說明：下圈年輪被樹根結住了。)', () => {
    const cs = in2d(activated());
    runScript(cs.world, [{ place: [-2.0, 0, 1.6], mode: '2d' }, { wait: 0.1 }]);
    expect(dialBlocked(cs, T('L1', 1))).toBe('doorway');
    const m = deriveTurnMode(cs, TEXT, { group: 'L0', dir: 1 });
    expect([m.blocked, m.blockedText, m.caption]).toEqual(['locked', '下圈年輪被樹根結住了。', '下層順時針：下圈年輪被樹根結住了。']);
  });
});

describe('第四章骨架：兩層並排的展開圖與層轉標頭', () => {
  it('展開圖：7 欄 × 3 列 (上層在左、空一欄、下層在右)；層名「上層・根窖」「下層・墨爐」；梯口 (U / D) 列在門裡；屋框依層位移', () => {
    const m = deriveCubeMap(activated(), TEXT)!;
    expect([m.cols, m.rows, m.layers]).toEqual([7, 3, [{ x: 0, w: 3, name: '上層・根窖' }, { x: 4, w: 3, name: '下層・墨爐' }]]);
    const at = (x: number, y: number) => m.cells.find(c => c.x === x && c.y === y);
    expect([at(1, 0)?.name, at(1, 0)?.current, at(1, 1)?.name, at(4, 1)?.name, at(5, 1)?.name, at(6, 1)?.name, at(5, 2)?.name, at(3, 1)]).toEqual(['根窖走廊', true, '根井', '封存書庫', '墨爐間', '最後的抽屜', '封存室', undefined]);
    expect(m.doors.filter(d => d.side === 'U' || d.side === 'D').map(d => [d.room, d.door, d.x, d.y, d.side, d.link])).toEqual([
      ['hall', 'hatchD', 1, 0, 'D', 'wall'], ['well', 'ladderD', 1, 1, 'D', 'room'], ['furnace', 'ladderU', 5, 1, 'U', 'room'], ['archive', 'hatchU', 4, 1, 'U', 'wall'], ['drawer', 'hatchU', 6, 1, 'U', 'wall']
    ]);
    expect(m.frames.map(f => [f.x, f.y, f.side, f.name])).toEqual([[1, 0, 'N', '溫室的石階'], [1, 2, 'U', '天窗'], [5, 0, 'N', '閣樓的木梯']]);
  });

  it('轉動模式：每層下方 ↺ ↻ (上層在左、下層在右)；下層鎖著；選 上層 ↻ → 預覽 = 上層兩間房換位 / 換朝向 (框起來)、走廊的地板梯口接上抽屜；確認 = 一個 turn 指令；↑↓ 換層、←→ 選方向', () => {
    const cs = in2d(activated());
    const m = deriveTurnMode(cs, TEXT, null);
    expect(m.headers.map(h => [h.group, h.dir, h.at.side, h.at.i, h.glyph, h.state, h.label])).toEqual([
      ['L0', -1, 'bottom', 4.4, '↺', 'locked', '下層逆時針（鎖著）'], ['L0', 1, 'bottom', 5.6, '↻', 'locked', '下層順時針（鎖著）'],
      ['L1', -1, 'bottom', 0.4, '↺', 'ok', '上層逆時針'], ['L1', 1, 'bottom', 1.6, '↻', 'ok', '上層順時針']
    ]);
    const p = deriveTurnMode(cs, TEXT, { group: 'L1', dir: 1 });
    expect(p.preview!.moves.map(v => [v.room, v.from, v.to])).toEqual([['hall', [1, 0], [2, 1]], ['well', [1, 1], [1, 1]]]);
    expect(p.preview!.doors.find(d => d.door === 'hatchD')).toMatchObject({ room: 'hall', x: 2, y: 1, link: 'room', via: 'arch' });
    expect(reduceTurnMode({ group: 'L1', dir: 1 }, { t: 'confirm' }, p).command).toEqual({ t: 'turn', turn: { group: 'L1', dir: 1 } });
    const first = reduceTurnMode(null, { t: 'step', axis: 'v', d: 1 }, m).sel;
    expect([first, reduceTurnMode(first, { t: 'step', axis: 'v', d: 1 }, m).sel]).toEqual([{ group: 'L0', dir: 1 }, { group: 'L1', dir: 1 }]);
    expect(reduceTurnMode({ group: 'L1', dir: 1 }, { t: 'step', axis: 'h', d: -1 }, m).sel).toEqual({ group: 'L1', dir: -1 });
  });
});

describe('第四章骨架：validateDial', () => {
  const model = (puzzles: Parameters<typeof dialModelOf>[2], finish: string) => dialModelOf(CH4_CUBE, CH4.rooms, puzzles, 'hall', finish);
  it('只開上層 (下層一直鎖著)：可達排列 4；終點「走廊在抽屜正上方」有解、卡死 0；封住的門由 cubeDoor.sealed 組出 (doorLocks)', () => {
    const goal = { id: 'ch4.skel', room: 'hall', needs: [], teaching: true, goal: (s: CubeState) => s.pos.hall[0] === s.pos.drawer[0] && s.pos.hall[1] === s.pos.drawer[1] };
    // 4-1 細化：書庫的折疊梯 (4-1b) 收著時爬不上去 → 模型加上 4-1b (走進書庫即可拉下)
    const m = model([goal, { id: '4-1b', room: 'archive', needs: [], teaching: true }], 'ch4.skel');
    expect(m.doorLocks).toEqual([
      { room: 'furnace', door: 'doorW', until: '4-2a' }, { room: 'furnace', door: 'doorE', until: 'ink.E' }, { room: 'archive', door: 'doorE', until: '4-2a' },
      { room: 'archive', door: 'hatchU', until: '4-1b' }, { room: 'drawer', door: 'doorW', until: 'ink.E' } // 4-1 細化：書庫的折疊梯
    ]);
    const r = validateDial(m);
    expect([r.arrangements, r.solvable, r.deadlocks, r.issues, r.entryIssues]).toEqual([4, true, [], [], []]);
    expect(r.lockIssues).toEqual(['lock L0: condition 4-1c is not a puzzle in the model']);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.second, p.budget])).toEqual([['ch4.skel', 1, 3, 8], ['4-1b', 1, 3, 8]]);
  });
  it('4-1c 解開下層 (骨架以「走廊在抽屜正上方、人在走廊」代表)：兩層全開 16 種排列；終點「抽屜轉到北邊 (章門)」有解、卡死 0；直徑 4', () => {
    const unlock = { id: '4-1c', room: 'hall', needs: [], teaching: true, goal: (s: CubeState) => s.pos.hall[0] === s.pos.drawer[0] && s.pos.hall[1] === s.pos.drawer[1] };
    const exit = { id: 'ch4.exit', room: 'hall', needs: ['4-1c'], teaching: true, goal: (s: CubeState, f: ReadonlySet<string>) => f.has('4-1c') && s.pos.drawer[0] === 1 && s.pos.drawer[1] === 0 };
    // 4-1 細化：書庫的折疊梯 (4-1b) 收著時從書庫爬不上去 → 模型要有 4-1b (走進書庫即可拉下)，否則走進書庫 = 卡死
    const ladder = { id: '4-1b', room: 'archive', needs: [], teaching: true };
    const r = validateDial(model([unlock, ladder, exit], 'ch4.exit'));
    expect([r.arrangements, r.solvable, r.deadlocks, r.issues, r.lockIssues, r.entryIssues]).toEqual([16, true, [], [], [], []]);
    expect(r.perPuzzle.map(p => [p.id, p.shortest, p.budget])).toEqual([['4-1c', 1, 8], ['4-1b', 1, 8], ['ch4.exit', 1, 8]]);
    // 直徑：從 S0 到任一排列最多 4 步 (每層最多 2)
    let worst = 0;
    for (let u = 0; u < 4; u++) for (let l = 0; l < 4; l++) worst = Math.max(worst, Math.min(u, 4 - u) + Math.min(l, 4 - l));
    expect(worst).toBe(4);
  });
});

describe('第三章存檔接著第四章、cs:ch3', () => {
  it('第三章存檔 (chapters[3]) 讀入後開第四章 = 新章 (S0、走廊北門)；第四章另存 chapters[4]；4-1 在 3-4 通關後開放、之前鎖著', () => {
    const ch3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
    const spec3: ChapterSpec = { chapter: 3, cube: ch3.cube, rooms: ch3.rooms, doors: chapterDoors(ch3.rooms) };
    const s3 = openChapter(spec3, chapterStart(defaultSave(), spec3, ch3.start), OPTS);
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['3-1', '3-2', '3-3', '3-4'] }, captureState(s3)));
    const save = loadSave(store);
    const cs = openChapter(SPEC, chapterStart(save, SPEC, CH4.start), OPTS);
    expect([cs.state.chapter, cs.state.room, cs.state.door, cubeKey(cs.state.cube!), Object.keys(save.chapters)]).toEqual([4, 'hall', 'doorN', cubeKey(initialCube(CH4_CUBE)), ['3']]);
    const saved = withChapter(save, captureState(cs));
    expect([Object.keys(saved.chapters).sort(), saved.chapters['3']]).toEqual([['3', '4'], save.chapters['3']]);
    expect([levelState(levelById('4-1')!, save), levelState(levelById('4-1')!, defaultSave())]).toEqual(['open', 'locked']);
  });

  it('cs:ch3：觸發 = 3-4 通關後第一次前往 4-1 (看過就不再播)；三鏡、總長 20～45 秒；逐字稿照 cutscenes-v0.1', () => {
    const cut = cutsceneById('cs:ch3')!;
    expect([cut.trigger, cut.shots.map(s => s.art.kind === 'paper' && s.art.sceneId), CUTSCENES.map(c => c.id)]).toEqual([
      { afterClear: '3-4' }, ['ch3.depths', 'ch3.diary', 'ch3.sink'], ['cs:prologue', 'cs:ch2', 'cs:ch3']
    ]);
    expect(cut.shots.flatMap(s => s.lines.map(k => TEXT(k)))).toEqual(['燈架停了。人影沒有再追來。', '手記第三頁：', '「守門的影子，只攔，不傷。」', '老宅轉了第三次，整個往下沉。', '樹根，從天花板垂了下來。']);
    const sec = planCutscene(cut, TEXT, { speed: 'normal', reduceMotion: false, name: '阿青' }).totalSec;
    expect([sec >= 20 && sec <= 45, Math.abs(sec - 21.4) < 0.5, validateCutscene(cut, { bundle: zhHant, levelIds: LEVELS.map(e => e.id) })]).toEqual([true, true, []]);
    const save = { ...defaultSave(), cleared: ['3-1', '3-2', '3-3', '3-4'] };
    expect([nextAfterClear('3-4', 'chapter', CHAPTERS), cutsceneBeforeLevel(save, '4-1')?.id, cutsceneBeforeLevel(defaultSave(), '4-1')]).toEqual(['4-1', 'cs:ch3', undefined]);
    expect(cutsceneBeforeLevel(recordCutscene(save, 'cs:ch3', false), '4-1')).toBeUndefined();
    expect(nextAfterClear('4-1', 'chapter', CHAPTERS)).toBeNull(); // 第五章占位：第四章通關沒有「前往」
  });
});
