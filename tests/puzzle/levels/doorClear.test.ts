// 門前淨空區 (使用者回報「印房 (2-3) 進不去，門口有東西卡著」)：鉛字盤被推到印房東門前 (x 5.4、z 0.28；壓在門位上、占住穿門站位)，
// 涉及印房的轉動一律「門口有東西卡著」、從迴廊西門進印房「門的另一邊被堵住了」，印房從此進不去。
// 修正：(1) 門 / 章門前 1.5 的淨空區推不進去 (mechanics/cube pushKeepOut)；(2) 開章 / 進房 / 讀檔時壓在門位或穿門站位上的可推物歸位 (core/chapter clearDoorways)。
// 通用檢查涵蓋所有魔方章節的每一間房、每一扇門 (含洞位、梯口)
import { describe, it, expect } from 'vitest';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { chapterSpecOf, DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import {
  applyChapterCommand, captureState, dialBlocked, doorArrival, doorClearBox, doorSpawn, newChapterState, openChapter,
  type ChapterSession, type ChapterSpec, type ChapterState
} from '../../../src/puzzle/core/chapter';
import type { CubeState, Turn } from '../../../src/puzzle/core/cube';
import { boxAt, objBox, overlaps } from '../../../src/puzzle/core/geometry';
import { pushCrate } from '../../../src/puzzle/core/push';
import type { Box, GameEvent, LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const specOf = (c: (typeof CUBE_CHAPTERS)[number]): ChapterSpec => ({ chapter: c.chapter, cube: c.cube, rooms: c.rooms, doors: chapterDoors(c.rooms) });
const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
const SPEC = specOf(CH2);
const defBox = (o: ObjDef): Box => ({ min: [o.x - o.w / 2, o.y, o.z - o.d / 2], max: [o.x + o.w / 2, o.y + o.h, o.z + o.d / 2] });
/** 所有魔方章節的每一扇門：所在房、門的定義、淨空區、穿門站位 */
const ALL_DOORS = CUBE_CHAPTERS.flatMap(c => chapterDoors(c.rooms).map(d => {
  const level: LevelDef = c.rooms[d.room];
  const o = level.objects.find(x => x.id === d.door)!;
  const at = doorSpawn(level, d.door, d.side);
  return { chapter: c.chapter, level, info: d, o, zone: doorClearBox(o, d.side), spawn: boxAt(at.x, at.y, at.z) };
}));
/** 牆上只有人過得去的門 (門 / 章門；淨空區推不進去) */
const PERSON_DOORS = ALL_DOORS.filter(d => d.info.kind !== 'arch' && !d.info.hole && d.info.side !== 'U' && d.info.side !== 'D');

function pump(cs: ChapterSession): { cs: ChapterSession; kinds: string[] } {
  const kinds: string[] = [];
  const events: GameEvent[] = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied' && e.t !== 'labelOpen');
  for (const e of events) {
    const r = applyChapterEvent(cs, e, OPTS);
    kinds.push(r.kind);
    if (r.kind === 'enter') return { cs: r.next, kinds };
    if (r.kind === 'turn' || r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return { cs, kinds };
}
const play = (cs: ChapterSession, cmds: Cmd[]): { cs: ChapterSession; kinds: string[] } => { runScript(cs.world, cmds); return pump(cs); };
function turns(cs: ChapterSession, ts: Turn[]): ChapterSession {
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  for (const t of ts) {
    const r = applyChapterCommand(cs, { t: 'turn', turn: t });
    if ('blocked' in r) throw new Error(`turn ${t.group} ${t.dir} blocked: ${r.blocked}`);
    cs = r;
  }
  runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
  return cs;
}

/** 使用者的存檔 (第二章；2-3a 已完成、門牌貼著「日」、三行解鎖)：鉛字盤在印房東門前，人在迴廊東門 */
const USER_CUBE: CubeState = {
  pos: { shelf: [1, 1, 0], reading: [0, 1, 0], mezz: [2, 1, 0], print: [0, 0, 0], manuscripts: [1, 0, 0], deep: [2, 0, 0] },
  rot: { shelf: 0, reading: 0, mezz: 0, print: 0, manuscripts: 0, deep: 0 }
};
function userState(): ChapterState {
  const st = newChapterState(SPEC, 'shelf', 'doorE');
  return {
    ...st, cube: USER_CUBE, dial: true, unlocked: ['row1', 'col0', 'col1', 'col2'], turns: { left: 6, undo: [] },
    labels: { 'plate:print': ['card.ri'] }, items: { 'tooth.shelf': 1 },
    rooms: {
      print: {
        flags: [], objs: [
          { id: 'tray', x: 5.4, y: 0, z: 0.28, gone: false, used: false, touched: true },
          { id: 'lens', x: 2.5, y: 0.85, z: -3.6, gone: true, used: false, touched: false },
          { id: 'typeCase', x: -3.2, y: 0, z: -4.4, gone: false, used: true, touched: false },
          { id: 'plateS', x: -2.6, y: 1.6, z: 4.4, gone: false, used: true, touched: false }
        ]
      }
    }
  };
}
const DOOR_W: Cmd[] = [{ wait: 0.1 }, { walkTo: [null, 0] }, { walkTo: [-9.3, null] }, { act: 'interact' }];

describe('門前淨空區：關卡資料 (所有魔方章節的每一扇門)', () => {
  it('穿門站位不被實體占住 (例外只有刻意的：有 blockText，H1 夾層後面那面書櫃)', () => {
    const hits = ALL_DOORS.flatMap(d => d.level.objects.filter(s => s.solid && s.id !== d.o.id && overlaps(defBox(s), d.spawn, '3d')).map(s => `${d.info.room}.${d.info.door}:${s.id}:${s.blockText ? 'blockText' : '-'}`));
    expect(hits).toEqual(['mezz.holeN:innerShelf:blockText']);
  });

  it('門前 1.5 的淨空區裡沒有實體 (同上例外)；可推物的原位離所有門 (含拱門、梯口、洞位) 的淨空區都遠', () => {
    const hits = ALL_DOORS.flatMap(d => d.level.objects.filter(s => s.solid && s.id !== d.o.id && overlaps(defBox(s), d.zone, '3d')).map(s => `${d.info.room}.${d.info.door}:${s.id}`));
    expect(hits).toEqual(['mezz.holeN:innerShelf']);
    const pushables = ALL_DOORS.flatMap(d => d.level.objects.filter(s => s.pushable).map(s => ({ d, s })));
    expect(pushables.length).toBeGreaterThan(0);
    expect(pushables.filter(({ d, s }) => overlaps(defBox(s), d.zone, '3d')).map(({ d, s }) => `${d.info.room}.${s.id}`)).toEqual([]);
  });

  it('每一扇只有人過得去的門：房裡的每個可推物從正前方往門推 (pushCrate) → 停在淨空區外；側面滑過去也進不了', () => {
    let cases = 0;
    for (const d of PERSON_DOORS) {
      const c = CUBE_CHAPTERS.find(x => x.chapter === d.chapter)!;
      for (const p of d.level.objects.filter(s => s.pushable)) {
        const cs = openChapter(specOf(c), newChapterState(specOf(c), d.info.room, null), OPTS);
        const crate = cs.world.byId.get(p.id)!;
        const ew = d.info.side === 'E' || d.info.side === 'W';
        const axis = ew ? 0 : 2;
        const toward = d.info.side === 'E' || d.info.side === 'S' ? 1 : -1;
        const half = ew ? p.w / 2 : p.d / 2;
        const edge = toward > 0 ? d.zone.min[axis] - half - 0.5 : d.zone.max[axis] + half + 0.5;
        // 正前方 (橫向對準門中心)
        crate.x = ew ? edge : d.o.x; crate.z = ew ? d.o.z : edge;
        pushCrate(cs.world, crate, axis, toward * 6);
        expect(overlaps(objBox(crate), d.zone, '3d'), `${d.info.room}.${d.info.door} ← ${p.id} 正推`).toBe(false);
        // 側面：與門同一深度 (貼著牆)、橫向在門外 → 沿牆滑向門
        const lat = ew ? 2 : 0;
        const latHalf = ew ? p.d / 2 : p.w / 2;
        const depth = toward > 0 ? d.zone.max[axis] - half : d.zone.min[axis] + half;
        const from = (ew ? d.o.z : d.o.x) - ((ew ? d.o.d : d.o.w) / 2 + latHalf + 0.5);
        crate.x = ew ? depth : from; crate.z = ew ? from : depth;
        pushCrate(cs.world, crate, lat as 0 | 2, 3);
        expect(overlaps(objBox(crate), d.zone, '3d'), `${d.info.room}.${d.info.door} ← ${p.id} 側推`).toBe(false);
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(0);
  });
});

describe('印房東門 (使用者回報的狀態)', () => {
  it('回歸：讀使用者的存檔 → 鉛字盤歸位到原處 (4.0, 2.4)；col0 轉得動、迴廊西門進得了印房，落點不與實體重疊；再從印房東門出來', () => {
    const store = memoryStorage();
    writeSave(store, withChapter({ ...defaultSave(), cleared: ['1-1', '1-2', '1-3', '2-1', '2-2'] }, userState()));
    let cs = openChapter(SPEC, chapterStart(loadSave(store), SPEC, CH2.start), OPTS);
    expect([cs.state.room, cs.state.door]).toEqual(['shelf', 'doorE']);
    expect(cs.state.rooms.print.objs.find(o => o.id === 'tray')).toMatchObject({ x: 4.0, y: 0, z: 2.4, touched: true });
    expect(cs.state.rooms.print.objs.find(o => o.id === 'lens')!.gone).toBe(true); // 其他物件照存檔
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    expect(dialBlocked(cs, { group: 'col0', dir: 1 })).toBe(null);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.15 }]);
    cs = turns(cs, [{ group: 'col0', dir: 1 }]);
    expect(cs.world.ext.cube!.links.doorW).toEqual({ to: 'room', room: 'print', door: 'doorE', kind: 'door' });
    expect(doorArrival(cs, 'doorW')).toBe(null);
    let r = play(cs, DOOR_W);
    expect([r.kinds, r.cs.state.room, r.cs.state.door]).toEqual([['enter'], 'print', 'doorE']);
    const w = r.cs.world;
    const pb = boxAt(w.player.x, w.player.y, w.player.z);
    expect(w.objs.filter(o => o.def.solid && !o.gone && overlaps(objBox(o), pb, '3d')).map(o => o.def.id)).toEqual([]);
    expect([w.byId.get('tray')!.x, w.byId.get('tray')!.z]).toEqual([4.0, 2.4]);
    r = play(r.cs, [{ wait: 0.1 }, { walkTo: [5.3, null] }, { act: 'interact' }]);
    expect([r.cs.state.room, r.cs.state.door]).toEqual(['shelf', 'doorW']);
  });

  it('沒存檔過的壞狀態也一樣：開章前 (到達處校正) 就先歸位 → 存檔站在印房東門內側時照樣進印房 (不被改到開章入口)', () => {
    const st = { ...userState(), room: 'print', door: 'doorE', cube: { ...USER_CUBE, pos: { ...USER_CUBE.pos, print: [0, 1, 0] as const, reading: [0, 0, 0] as const } } };
    const store = memoryStorage();
    writeSave(store, withChapter(defaultSave(), st));
    const spec = chapterSpecOf(SPEC);
    expect(spec.arrival!({ ...st, cube: st.cube })).toBe(null);
    const loaded = chapterStart(loadSave(store), spec, CH2.start);
    expect([loaded.room, loaded.door]).toEqual(['print', 'doorE']);
    const cs = openChapter(SPEC, loaded, OPTS);
    expect([cs.world.byId.get('tray')!.x, cs.world.byId.get('tray')!.z]).toEqual([4.0, 2.4]);
  });

  it('推不進門口：在印房把鉛字盤沿 z 0.28 往東門推 → 停在淨空區外 (x ≤ 3.5)、說「門口得留給人走」；印房轉得動、從迴廊進得來', () => {
    const st = { ...userState(), room: 'print', door: 'doorE', rooms: {}, cube: { ...USER_CUBE, pos: { ...USER_CUBE.pos, print: [0, 1, 0] as const, reading: [0, 0, 0] as const } } };
    let cs = openChapter(SPEC, st, OPTS);
    // 使用者當時的推法：鉛字盤在 z 0.28 那一列 (印刷機東側)，人從西側沿 z 0.28 往東門走 → 一路推
    const tray = cs.world.byId.get('tray')!;
    tray.x = 2.4; tray.z = 0.28;
    runScript(cs.world, [{ place: [1.5, 0, 0.28], mode: '3d' }, { wait: 0.1 }, { walkTo: [5.5, null] }, { wait: 0.3 }]);
    expect(Math.abs(tray.z - 0.28)).toBeLessThan(0.05);
    expect(tray.x).toBeLessThanOrEqual(3.5 + 1e-6);
    expect(tray.x).toBeGreaterThan(3.4);
    expect(cs.world.msgKey).toBe('msg.cube.doorClear');
    expect(TEXT('msg.cube.doorClear')).toBe('門口得留給人走，箱子推不過去。');
    cs = pump(cs).cs;
    runScript(cs.world, [{ walkTo: [2.0, null] }, { act: 'flip' }, { wait: 0.15 }]);
    expect(dialBlocked(cs, { group: 'col0', dir: 1 })).toBe(null);
    // 離開再從迴廊西門回來：到達處空著
    const back = openChapter(SPEC, { ...captureState(cs), room: 'shelf', door: 'doorE' }, OPTS);
    expect(back.world.ext.cube!.links.doorW).toEqual({ to: 'room', room: 'print', door: 'doorE', kind: 'door' });
    expect(doorArrival(back, 'doorW')).toBe(null);
  });
});
