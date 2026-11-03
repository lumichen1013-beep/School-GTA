// C2：core/chapter.ts ChapterSession (換房、房間快照往返、R = 回到本次進房時、轉動；architecture 4.16、規格 5.4.8)
import { describe, it, expect } from 'vitest';
import { captureState, enterRoom, newChapterState, openChapter, restartRoom, roomLinks, singleRoomSpec, snapshotRoom, turn, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import type { CubeDef } from '../../../src/puzzle/core/cube';
import type { LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { addItem } from '../../../src/puzzle/mechanics/items';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';
import { run, walkTo } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 8, visible: 'both', solid: true };
/** 門位標記 (章節層只看 id 與幾何；門的行為由 mechanics/cube 負責，見 C3) */
const marker = (id: string, x: number, z: number, w: number, d: number): ObjDef => ({ id, type: 'wall', x, y: 0, z, w, h: 2.4, d, visible: 'both', solid: false });
const room = (id: string, extra: ObjDef[]): LevelDef => ({
  id, titleKey: 'lvl.1-2.title', narrationKey: 'lvl.1-2.narration', nextKey: 'lvl.1-2.next',
  bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -4, y: 0, z: 0 }, objects: [floor, ...extra]
});
const crate: ObjDef = { id: 'crate', type: 'crate', x: 0, y: 0, z: 0, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true };
// 1×2：a 在 [0,0]、b 在 [1,0]；a 的東門 ↔ b 的西門；c 在 [0,1] 讓 a 可以往下滑 (斷開)
const CUBE: CubeDef = { id: 't', dims: [2, 2, 1], ops: 'slide', cells: [{ at: [0, 0, 0], room: 'a' }, { at: [1, 0, 0], room: 'b' }], frame: [] };
const SPEC: ChapterSpec = {
  chapter: 9, cube: CUBE,
  rooms: { a: room('a', [crate, marker('aE', 5.8, 0, 0.4, 1.6)]), b: room('b', [{ ...crate, x: 2 }, marker('bW', -5.8, 0, 0.4, 1.6)]) },
  doors: [{ room: 'a', door: 'aE', side: 'E', kind: 'door' }, { room: 'b', door: 'bW', side: 'W', kind: 'door' }]
};
const open = (): ChapterSession => openChapter(SPEC, newChapterState(SPEC, 'a', null), OPTS);
const objs = (cs: ChapterSession) => snapshotRoom(cs.world).objs;

describe('ChapterSession：開章與連接表', () => {
  it('開章：在起點、魔方 S0、ext.cube 寫入當前房的門 (a 東門 ↔ b 西門)', () => {
    const cs = open();
    expect([cs.world.player.x, cs.world.player.z]).toEqual([-4, 0]);
    expect(cs.world.ext.cube!.links).toEqual({ aE: { to: 'room', room: 'b', door: 'bW', kind: 'door' } });
    expect(cs.entry.rooms.a.objs).toEqual(objs(cs));
  });

  it('單房關卡 (singleRoomSpec)：世界與 createWorld 相同、沒有 ext.cube、轉不動 (noCube)', () => {
    const spec = singleRoomSpec(porch);
    const cs = openChapter(spec, newChapterState(spec, porch.id, null), OPTS);
    const plain = createWorld(porch, OPTS);
    expect(snapshotRoom(cs.world)).toEqual(snapshotRoom(plain));
    expect(cs.world.player).toEqual(plain.player);
    expect(cs.world.ext).toEqual({});
    expect(turn(cs, { t: 'slide', room: porch.id, dir: 'N' })).toEqual({ blocked: 'noCube' });
  });
});

describe('ChapterSession：換房往返', () => {
  it('a 推箱 → 從東門進 b (站在西門內側) → b 推箱 → 回 a：兩房物件逐欄等於離開時；道具跟著玩家', () => {
    let cs = open();
    walkTo(cs.world, -1.2, null);
    run(cs.world, { moveX: 1 }, 0.6);
    addItem(cs.world, 'nib', 1);
    const aLeft = objs(cs);
    expect(aLeft.find(o => o.id === 'crate')!.x).toBeGreaterThan(0.5);
    cs = enterRoom(cs, 'b', 'bW', OPTS);
    expect(cs.state.room).toBe('b');
    expect(cs.world.player.x).toBeCloseTo(-5.8 + 0.2 + 0.9, 6);
    expect(cs.world.inv).toEqual({ nib: 1 });
    expect(cs.world.ext.cube!.links.bW).toEqual({ to: 'room', room: 'a', door: 'aE', kind: 'door' });
    walkTo(cs.world, 0.6, null);
    run(cs.world, { moveX: 1 }, 0.4);
    const bLeft = objs(cs);
    cs = enterRoom(cs, 'a', 'aE', OPTS);
    expect(objs(cs)).toEqual(aLeft);
    expect(cs.world.player.x).toBeCloseTo(5.8 - 0.2 - 0.9, 6);
    cs = enterRoom(cs, 'b', 'bW', OPTS);
    expect(objs(cs)).toEqual(bLeft);
  });

  it('從門進來的房間：掉落的重生點 = 門內側', () => {
    let cs = enterRoom(open(), 'b', 'bW', OPTS);
    cs.world.player.y = -6;
    run(cs.world, {}, 1 / 60);
    expect(cs.world.player.x).toBeCloseTo(-4.7, 6);
  });
});

describe('ChapterSession：轉動', () => {
  it('轉自己：別的房 → notHere；出界 → outOfCube；成功 → 連接表即時更新 (a 往下滑 → 東門後是牆)', () => {
    const cs = open();
    expect(turn(cs, { t: 'slide', room: 'b', dir: 'S' })).toEqual({ blocked: 'notHere' });
    expect(turn(cs, { t: 'slide', room: 'a', dir: 'N' })).toEqual({ blocked: 'outOfCube' });
    expect(turn(cs, { t: 'slide', room: 'a', dir: 'E' })).toEqual({ blocked: 'notEmpty' });
    const r = turn(cs, { t: 'slide', room: 'a', dir: 'S' }) as ChapterSession;
    expect(r.state.cube!.pos.a).toEqual([0, 1, 0]);
    expect(cs.state.cube!.pos.a).toEqual([0, 0, 0]); // 舊 session 不變
    expect(r.world.ext.cube!.links).toEqual({ aE: { to: 'wall' } });
    expect(roomLinks(SPEC, r.state)).toEqual({ aE: { to: 'wall' } });
    expect(r.world).toBe(cs.world); // 玩家連同房間一起移動：World 不重建
  });

  it('門口有可推物卡著 → doorway', () => {
    const cs = open();
    const c = cs.world.byId.get('crate')!;
    c.x = 5.4;
    expect(turn(cs, { t: 'slide', room: 'a', dir: 'S' })).toEqual({ blocked: 'doorway' });
  });

  it('確定性：同一序列 (推箱、換房、轉動) 兩次執行，章節狀態逐欄相同', () => {
    const play = () => {
      let cs = open();
      walkTo(cs.world, -1.2, null);
      run(cs.world, { moveX: 1 }, 0.5);
      cs = enterRoom(cs, 'b', 'bW', OPTS);
      cs = enterRoom(cs, 'a', 'aE', OPTS);
      cs = turn(cs, { t: 'slide', room: 'a', dir: 'S' }) as ChapterSession;
      return JSON.stringify(captureState(cs));
    };
    expect(play()).toBe(play());
  });
});

describe('ChapterSession：R 重進房間 (規格 5.4.8：整章狀態回到本次進房時)', () => {
  it('進 b 後推箱、轉動 → R：b 的物件、魔方排列、道具都回到進 b 時；a 的快照不受影響', () => {
    let cs = open();
    addItem(cs.world, 'nib', 1);
    cs = enterRoom(cs, 'b', 'bW', OPTS);
    const entryObjs = objs(cs);
    const entryCube = JSON.stringify(cs.state.cube);
    const aSnap = JSON.stringify(cs.state.rooms.a);
    walkTo(cs.world, 0.6, null);
    run(cs.world, { moveX: 1 }, 0.5);
    addItem(cs.world, 'scrap', 1);
    // b 往下滑 (空格)
    cs = turn(cs, { t: 'slide', room: 'b', dir: 'S' }) as ChapterSession;
    expect(cs.state.cube!.pos.b).toEqual([1, 1, 0]);
    expect(objs(cs)).not.toEqual(entryObjs);
    cs = restartRoom(cs, OPTS);
    expect(objs(cs)).toEqual(entryObjs);
    expect(JSON.stringify(cs.state.cube)).toBe(entryCube);
    expect(cs.world.inv).toEqual({ nib: 1 });
    expect(JSON.stringify(cs.state.rooms.a)).toBe(aSnap);
    expect(cs.world.ext.cube!.links.bW).toEqual({ to: 'room', room: 'a', door: 'aE', kind: 'door' });
    expect([cs.world.player.x, cs.world.player.z]).toEqual([cs.world.level.start.x, cs.world.level.start.z]);
  });

  it('R 兩次結果相同 (entry 不被 R 改寫)', () => {
    let cs = enterRoom(open(), 'b', 'bW', OPTS);
    run(cs.world, { moveX: 1 }, 1);
    cs = restartRoom(cs, OPTS);
    const once = JSON.stringify(captureState(cs));
    run(cs.world, { moveX: 1 }, 1);
    cs = restartRoom(cs, OPTS);
    expect(JSON.stringify(captureState(cs))).toBe(once);
  });
});
