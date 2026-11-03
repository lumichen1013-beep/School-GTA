// M-Cube C6：第一章魔方 (玄關 + 樓梯間 / 衣帽間占位房) — 從頭玩到 1-2c「門後是牆」(規格 6 1-2c 驗證重點、10 M-Cube 列)
import { describe, it, expect } from 'vitest';
import { CUBE_CHAPTERS, cubeChapterOf } from '../../../src/puzzle/content/cubes';
import { CH1_MODEL } from '../../../src/puzzle/content/cubes/ch1';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { captureState, openChapter, restartRoom, snapshotRoom, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { findTarget } from '../../../src/puzzle/core/interact';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap, previewFor } from '../../../src/puzzle/app/cubeMapModel';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { chapterOneModel, validateCube } from '../../../src/puzzle/devtools/validateCube';
import { CH1_CUBE } from '../../../src/puzzle/content/cubes/ch1';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const CH1 = CUBE_CHAPTERS[0];
const SPEC: ChapterSpec = { chapter: CH1.chapter, cube: CH1.cube, rooms: CH1.rooms, doors: chapterDoors(CH1.rooms) };
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH1.start, CH1.legacy), OPTS);
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
/** 取走世界送出的章節事件並交給章節層 (同 LevelSession；切換事件略過) */
function pump(cs: ChapterSession): { cs: ChapterSession; kind: string } {
  const e = cs.world.events.splice(0).filter(x => x.t === 'door' || x.t === 'turnRequest');
  if (e.length === 0) return { cs, kind: 'none' };
  const r = applyChapterEvent(cs, e[0], OPTS);
  return { cs: r.kind === 'enter' ? r.next : r.kind === 'turn' ? r.cs : cs, kind: r.kind };
}

// 路段 (缺口) → 1-2a (筆尖) → 1-2b (踏板) 的同一路線 (levels/1-2.test 的 ROUTE_GAP / SOLVE_A / SOLVE_B，此處只走路線)；從南拱門進來，先走到原起點
const TO_EXIT_AREA: Cmd[] = [
  { wait: 0.2 }, { walkTo: [-18, 2] },
  { walkTo: [-10.3, 2], zFirst: true }, { act: 'flip' }, { walkTo: [-4.5, null] }, { act: 'flip' }, { wait: 0.2 },
  { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 2] }, { walkTo: [6.1, null] },
  { act: 'flip' }, { hop: 1, until: w => w.player.onGround && w.player.y > 2.4 && w.player.x > 8.1 }, { walkTo: [8.5, null] }, { act: 'interact' },
  { act: 'flip' }, { walkTo: [null, 2] }, { walkTo: [5.4, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] },
  { walkTo: [null, -4.5] }, { hold: { moveZ: -1 }, seconds: 0.3 }, { walkTo: [5.6, null] }, { walkTo: [null, -5.4] }, { walkTo: [-0.1, null] },
  { act: 'flip' }, { wait: 0.1 }, { act: 'flip' },
  { walkTo: [1.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] },
  { expect: w => { expect(w.byId.get('gate')!.used).toBe(true); expect(hasItem(w, 'nib')).toBe(true); expect(w.player.x).toBeGreaterThan(11.5); }, label: '路段、1-2a、1-2b (踏板) 完成、在出口區' }
];
const AT_DOOR_E: Cmd[] = [{ walkTo: [19.3, 0] }, { expect: w => expect(findTarget(w)?.def.id).toBe('doorE'), label: '東門' }];
const AT_LEVER: Cmd[] = [{ walkTo: [15, -5.1] }, { expect: w => expect(findTarget(w)?.def.id).toBe('lever'), label: '拉桿' }];

describe('第一章魔方：資料', () => {
  it('房間的魔方門 = 抽象模型的門位表 (BFS 驗的就是實際內容)；關卡 1-2 屬於玄關', () => {
    const key = (d: { room: string; door: string }) => `${d.room}/${d.door}`;
    expect([...SPEC.doors].sort((a, b) => key(a).localeCompare(key(b)))).toEqual([...CH1_MODEL.doors].sort((a, b) => key(a).localeCompare(key(b))));
    expect(cubeChapterOf('1-2')?.levels['1-2']).toBe('foyer');
    expect(cubeChapterOf('1-1')).toBeUndefined();
    const lever = SPEC.rooms.foyer.objects.find(o => o.type === 'lever');
    expect(lever?.type === 'lever' && lever.word).toBe(CH1_MODEL.levers.foyer);
    expect(validateCube(chapterOneModel(CH1_CUBE, CH1_MODEL)).deadEnds).toBe(0);
  });

  it('validateLevel：玄關、樓梯間、衣帽間占位房都 0 issue', () => {
    for (const level of Object.values(SPEC.rooms)) expect([level.id, validateLevel(level, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })]).toEqual([level.id, []]);
  });
});

describe('1-2c 門後是牆 (P1 首次)', () => {
  it('開章：從南拱門進玄關 (站在拱門內側)；南拱門接大門、東門門後是牆', () => {
    const cs = start();
    expect([cs.state.room, cs.state.door]).toEqual(['foyer', 'archS']);
    expect(cs.world.player.z).toBeCloseTo(5.8 - 0.2 - 0.9, 6);
    expect(cs.world.ext.cube!.links).toEqual({ doorE: { to: 'wall' }, archS: { to: 'frame', frame: 'porch' } });
  });

  it('從頭打到 1-2c：東門「門後是牆。」→ 2D 展開圖預覽 (不改狀態) → 2D 拉不動 → 3D 拉「上」→ 東門接通樓梯間 → 走進樓梯間 → 走回玄關物件不變', () => {
    let cs = start();
    runScript(cs.world, [...TO_EXIT_AREA, ...AT_DOOR_E, { act: 'interact' }]);
    expect(cs.world.msg).toBe('門後是牆。');
    expect(pump(cs).kind).toBe('none');
    // 2D：站在拉桿旁 → 展開圖預覽「玄關滑到 A 後，東門對上 B 格樓梯間的西門」；預覽不改狀態
    runScript(cs.world, [...AT_LEVER, { act: 'flip' }, { wait: 0.1 }]);
    expect(cs.world.player.mode).toBe('2d');
    const before = JSON.stringify(captureState(cs));
    const map = deriveCubeMap(cs, TEXT, previewFor(cs))!;
    expect(map.cells.filter(c => c.kind === 'room').map(c => [c.name, c.x, c.y, c.current])).toEqual([['樓梯間', 1, 0, false], ['玄關', 0, 1, true], ['衣帽間', 1, 1, false]]);
    expect(map.doors.find(d => d.door === 'doorE')!.link).toBe('wall');
    expect(map.preview!.moved).toEqual({ room: 'foyer', name: '玄關', from: [0, 1], to: [0, 0] });
    expect(map.preview!.doors.filter(d => d.link === 'room').map(d => d.door).sort()).toEqual(['doorE', 'doorW']);
    expect(JSON.stringify(captureState(cs))).toBe(before);
    // 2D 拉不動 (只在 3D)
    runScript(cs.world, [{ act: 'interact' }]);
    expect(pump(cs).kind).toBe('none');
    expect(cs.world.msgKey).toBe('msg.unreachable');
    // 3D 拉「上」→ 玄關 (連同玩家與房內一切) 滑到 A
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    const p = { ...cs.world.player };
    const objs = snapshotRoom(cs.world);
    const t = pump(cs);
    expect(t.kind).toBe('turn');
    cs = t.cs;
    expect(cs.state.cube!.pos.foyer).toEqual([0, 0, 0]);
    expect([cs.world.player.x, cs.world.player.z]).toEqual([p.x, p.z]);
    expect(snapshotRoom(cs.world)).toEqual(objs);
    expect(cs.world.ext.cube!.links).toEqual({ doorE: { to: 'room', room: 'stair', door: 'doorW', kind: 'door' }, archS: { to: 'wall' } });
    // 東門接通 → 走進樓梯間 (站在西門內側)
    runScript(cs.world, [...AT_DOOR_E, { act: 'interact' }]);
    const leftFoyer = snapshotRoom(cs.world);
    const e = pump(cs);
    expect(e.kind).toBe('enter');
    cs = e.cs;
    expect([cs.state.room, cs.state.door, cs.world.level.id]).toEqual(['stair', 'doorW', 'stair']);
    expect(cs.world.player.x).toBeCloseTo(-5.8 + 0.2 + 0.9, 6);
    expect(hasItem(cs.world, 'nib')).toBe(true);
    // 走回玄關：房內物件 (踏板、鐵柵門、木箱、筆尖) 逐欄等於離開時
    runScript(cs.world, [{ wait: 0.1 }, { walkTo: [-5.3, 0] }, { act: 'interact' }]);
    const back = pump(cs);
    expect(back.kind).toBe('enter');
    cs = back.cs;
    expect(cs.state.room).toBe('foyer');
    expect(snapshotRoom(cs.world)).toEqual(leftFoyer);
    expect(cs.world.player.x).toBeCloseTo(19.8 - 0.2 - 0.9, 6);
  });

  it('S1：樓梯間南門 → 衣帽間 (北拱門內側)；章門鎖著；玄關再拉「上」拉不動 (再過去是屋外)', () => {
    let cs = start();
    cs.world.byId.get('gate')!.used = true;
    runScript(cs.world, [{ place: [15, 0, -5.1] }, { act: 'interact' }]);
    cs = pump(cs).cs;
    runScript(cs.world, [{ act: 'interact' }]);
    expect(pump(cs).kind).toBe('blocked');
    expect(cs.world.msg).toBe('拉桿拉不動。再過去就是屋外了。');
    runScript(cs.world, [{ place: [19.3, 0, 0] }, { act: 'interact' }]);
    cs = pump(cs).cs;
    runScript(cs.world, [{ wait: 0.1 }, { walkTo: [1.5, 4.3] }, { act: 'interact' }]);
    const r = pump(cs);
    expect(r.kind).toBe('enter');
    cs = r.cs;
    expect([cs.state.room, cs.state.door]).toEqual(['closet', 'archN']);
    runScript(cs.world, [{ wait: 0.1 }, { walkTo: [6.3, 0] }, { act: 'interact' }]);
    expect(cs.world.msgKey).toBe('msg.cube.chapterLocked');
    expect(pump(cs).kind).toBe('none');
  });

  it('R 重進房間：整章狀態 (含魔方排列) 回到本次進房時 — 玄關拉桿後 R：魔方回 S0、東門又是牆、房內回到進房時', () => {
    let cs = start();
    const entry = snapshotRoom(cs.world);
    cs.world.byId.get('gate')!.used = true;
    cs.world.byId.get('crate')!.x = 15;
    runScript(cs.world, [{ place: [15, 0, -5.1] }, { act: 'interact' }]);
    cs = pump(cs).cs;
    expect(cs.state.cube!.pos.foyer).toEqual([0, 0, 0]);
    cs = restartRoom(cs, OPTS);
    expect(cs.state.cube!.pos.foyer).toEqual([0, 1, 0]);
    expect(cs.world.ext.cube!.links.doorE).toEqual({ to: 'wall' });
    expect(snapshotRoom(cs.world)).toEqual(entry);
    expect([cs.state.room, cs.state.door]).toEqual(['foyer', 'archS']);
  });

  it('R 在樓梯間：回到進樓梯間時 (魔方 S1，玄關的快照保留)，不會回到 S0', () => {
    let cs = start();
    cs.world.byId.get('gate')!.used = true;
    runScript(cs.world, [{ place: [15, 0, -5.1] }, { act: 'interact' }]);
    cs = pump(cs).cs;
    runScript(cs.world, [{ place: [19.3, 0, 0] }, { act: 'interact' }]);
    cs = pump(cs).cs;
    expect(cs.state.room).toBe('stair');
    runScript(cs.world, [{ hold: { moveX: 1 }, seconds: 1 }]);
    cs = restartRoom(cs, OPTS);
    expect(cs.state.cube!.pos.foyer).toEqual([0, 0, 0]);
    expect(cs.state.rooms.foyer.objs.find(o => o.id === 'gate')!.used).toBe(true);
    expect(cs.world.player.x).toBeCloseTo(-4.7, 6);
  });

  it('確定性：同一輸入序列 (一路到樓梯間) 兩次執行，章節狀態逐欄相同', () => {
    const play = () => {
      let cs = start();
      runScript(cs.world, [...TO_EXIT_AREA, ...AT_LEVER, { act: 'interact' }]);
      cs = pump(cs).cs;
      runScript(cs.world, [...AT_DOOR_E, { act: 'interact' }]);
      cs = pump(cs).cs;
      return JSON.stringify(captureState(cs));
    };
    expect(play()).toBe(play());
  });
});

describe('舊存檔 (已通關 1-2)：不需重做 1-2a / 1-2b', () => {
  it('開章：筆尖已拿、踏板已壓、鐵柵門已開 → 直接穿門洞走到拉桿、拉「上」、東門接通', () => {
    let cs = openChapter(SPEC, chapterStart({ ...defaultSave(), cleared: ['1-1', '1-2'], abilities: ['nib'] }, SPEC, CH1.start, CH1.legacy), OPTS);
    expect([get(cs, 'key').gone, get(cs, 'plate').used, get(cs, 'gate').used, hasItem(cs.world, 'nib')]).toEqual([true, true, true, true]);
    runScript(cs.world, [{ wait: 0.2 }, { walkTo: [-18, 2] }, { walkTo: [-10.3, 2], zFirst: true }, { act: 'flip' }, { walkTo: [-4.5, null] }, { act: 'flip' }, { wait: 0.2 },
      { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] }, ...AT_LEVER, { act: 'interact' }]);
    cs = pump(cs).cs;
    expect(cs.world.ext.cube!.links.doorE).toEqual({ to: 'room', room: 'stair', door: 'doorW', kind: 'door' });
  });
});
