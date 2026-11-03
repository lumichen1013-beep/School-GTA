// C3：mechanics/cube.ts 拉桿 / 魔方門 (門後是牆、轉不動訊息) + app/chapterEvents (事件 → 章節層)；規格 5.4.1、6 的 1-2c 驗證重點
import { describe, it, expect } from 'vitest';
import { newChapterState, openChapter, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import type { CubeDef } from '../../../src/puzzle/core/cube';
import type { LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors, leverOp, WORD_SIDE } from '../../../src/puzzle/mechanics/cube';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { place } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 8, visible: 'both', solid: true };
const door = (id: string, side: 'N' | 'S' | 'E' | 'W', kind: 'door' | 'arch' | 'chapter', x: number, z: number): ObjDef =>
  ({ id, type: 'cubeDoor', side, kind, x, y: 0, z, w: side === 'E' || side === 'W' ? 0.4 : 1.6, h: 2.4, d: side === 'E' || side === 'W' ? 1.6 : 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d' });
const lever: ObjDef = { id: 'lever', type: 'lever', word: 'up', x: 0, y: 0, z: -3.6, w: 0.6, h: 1.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d' };
const room = (id: string, objects: ObjDef[]): LevelDef => ({
  id, titleKey: 'lvl.1-2.title', narrationKey: 'lvl.1-2.narration', nextKey: 'lvl.1-2.next',
  bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -4, y: 0, z: 0 }, objects: [floor, ...objects]
});
// 迷你第一章：a 在左下 [0,1]、b 在右上 [1,0]、左上空格；a 的東門面對空的右下 → 門後是牆；a 往上滑後東門對上 b 的西門
const CUBE: CubeDef = { id: 't', dims: [2, 2, 1], ops: 'slide', cells: [{ at: [0, 1, 0], room: 'a' }, { at: [1, 0, 0], room: 'b' }], frame: [{ at: [0, 1, 0], side: 'S', kind: 'porch' }, { at: [1, 0, 0], side: 'E', kind: 'chapterExit' }] };
const ROOMS = {
  a: room('a', [door('aE', 'E', 'door', 5.8, 0), door('aS', 'S', 'arch', -3, 3.8), lever]),
  b: room('b', [door('bW', 'W', 'door', -5.8, 0), door('bE', 'E', 'chapter', 5.8, 0)])
};
const SPEC: ChapterSpec = { chapter: 9, cube: CUBE, rooms: ROOMS, doors: chapterDoors(ROOMS) };
const open = (): ChapterSession => openChapter(SPEC, newChapterState(SPEC, 'a', null), OPTS);

describe('chapterDoors / leverOp', () => {
  it('門位依房間、物件順序整理；方向字 → 滑動方向 (上 = 北)', () => {
    expect(SPEC.doors).toEqual([
      { room: 'a', door: 'aE', side: 'E', kind: 'door' }, { room: 'a', door: 'aS', side: 'S', kind: 'arch' },
      { room: 'b', door: 'bW', side: 'W', kind: 'door' }, { room: 'b', door: 'bE', side: 'E', kind: 'chapter' }
    ]);
    expect(WORD_SIDE).toEqual({ up: 'N', down: 'S', left: 'W', right: 'E' });
    expect(leverOp('a', 'left')).toEqual({ t: 'slide', room: 'a', dir: 'W' });
  });
});

describe('魔方門：兩種狀態', () => {
  it('門後是牆：3D 開東門 →「門後是牆。」、沒有換房事件、仍在原房；提示「開門」', () => {
    const cs = open();
    place(cs.world, 5.2, 0, 0);
    expect(findTarget(cs.world)?.def.id).toBe('aE');
    interact(cs.world);
    expect(cs.world.msg).toBe('門後是牆。');
    expect(cs.world.events).toEqual([]);
  });

  it('接通：拉桿後同一扇門 emit door → enterRoom 到 b、站在西門內側；回頭開西門回 a', () => {
    let cs = open();
    place(cs.world, 0, 0, -2.8);
    interact(cs.world);
    const r = applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS);
    expect(r.kind).toBe('turn');
    cs = (r as { cs: ChapterSession }).cs;
    place(cs.world, 5.2, 0, 0);
    interact(cs.world);
    expect(cs.world.events).toEqual([{ t: 'door', door: 'aE' }]);
    const e = applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS);
    expect(e.kind).toBe('enter');
    cs = (e as { next: ChapterSession }).next;
    expect(cs.state.room).toBe('b');
    expect(cs.world.player.x).toBeCloseTo(-4.7, 6);
    place(cs.world, -5.2, 0, 0);
    interact(cs.world);
    const back = applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS);
    expect(back.kind === 'enter' && back.next.state.room).toBe('a');
  });

  it('屋框：大門 → 門廊訊息；章門 → 鎖著 (C8 前沒有鑰匙)；兩者都不換房', () => {
    const cs = open();
    place(cs.world, -3, 0, 3.2);
    expect(findTarget(cs.world)?.def.id).toBe('aS');
    interact(cs.world);
    expect(cs.world.msgKey).toBe('msg.cube.porch');
    const b = openChapter(SPEC, newChapterState(SPEC, 'b', null), OPTS);
    place(b.world, 5.2, 0, 0);
    interact(b.world);
    expect(b.world.msgKey).toBe('msg.cube.chapterLocked');
    expect([cs.world.events, b.world.events]).toEqual([[], []]);
  });

  it('單房關卡 (沒有章節層) 的魔方門：一律門後是牆', () => {
    const w = createWorld(ROOMS.a, OPTS);
    place(w, 5.2, 0, 0);
    interact(w);
    expect(w.msg).toBe('門後是牆。');
  });

  it('門只在 3D 能開：2D 站在門前按 E 不換房 (看得見、碰不到)', () => {
    const cs = open();
    place(cs.world, 5.2, 0, 0, '2d');
    expect(findTarget(cs.world)).toBeNull();
    interact(cs.world);
    expect(cs.world.events).toEqual([]);
    expect(cs.world.msgKey).toBe('msg.unreachable');
  });
});

describe('拉桿：轉動與轉不動', () => {
  it('3D 拉 → turnRequest；轉成功：連接表更新、World 不重建、玩家位置不變', () => {
    const cs = open();
    place(cs.world, 0, 0, -2.8);
    expect(findTarget(cs.world)?.def.id).toBe('lever');
    interact(cs.world);
    expect(cs.world.events).toEqual([{ t: 'turnRequest', lever: 'lever' }]);
    const before = { ...cs.world.player };
    const r = applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS);
    expect(r.kind === 'turn' && [r.dir, r.cs.state.cube!.pos.a, r.cs.world === cs.world]).toEqual(['N', [0, 0, 0], true]);
    expect(cs.world.player).toEqual(before);
    expect(cs.world.ext.cube!.links.aE).toEqual({ to: 'room', room: 'b', door: 'bW', kind: 'door' });
  });

  it('2D 拉不動 (只在 3D)：看得見、碰不到，不發轉動事件', () => {
    const cs = open();
    place(cs.world, 0, 0, 0, '2d');
    interact(cs.world);
    expect(cs.world.events).toEqual([]);
    expect(cs.world.msgKey).toBe('msg.unreachable');
  });

  it('轉不動說明原因：出界 (再拉一次「上」)、門口有箱子卡著；魔方不變', () => {
    let cs = open();
    place(cs.world, 0, 0, -2.8);
    interact(cs.world);
    cs = (applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS) as { cs: ChapterSession }).cs;
    interact(cs.world);
    expect(applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS)).toEqual({ kind: 'blocked' });
    expect(cs.world.msg).toBe('拉桿拉不動。再過去就是屋外了。');
    expect(cs.state.cube!.pos.a).toEqual([0, 0, 0]);
    const cs2 = openChapter({ ...SPEC, rooms: { ...ROOMS, a: { ...ROOMS.a, objects: [...ROOMS.a.objects, { id: 'crate', type: 'crate', x: 5.3, y: 0, z: 0, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true }] } } }, newChapterState(SPEC, 'a', null), OPTS);
    place(cs2.world, 0, 0, -2.8);
    interact(cs2.world);
    expect(applyChapterEvent(cs2, cs2.world.events.splice(0)[0], OPTS)).toEqual({ kind: 'blocked' });
    expect(cs2.world.msg).toBe('門口有東西卡著。');
  });

  it('目標格有房間 → 拉不動 (那一邊有房間擋著)', () => {
    const left: ObjDef = { ...lever, id: 'lever2', word: 'right', x: 3 };
    const rooms = { ...ROOMS, a: { ...ROOMS.a, objects: [...ROOMS.a.objects, left] } };
    const cube: CubeDef = { ...CUBE, cells: [...CUBE.cells, { at: [1, 1, 0], room: 'solid' }] };
    const cs = openChapter({ ...SPEC, cube, rooms }, newChapterState({ ...SPEC, cube }, 'a', null), OPTS);
    place(cs.world, 3, 0, -2.8);
    interact(cs.world);
    expect(applyChapterEvent(cs, cs.world.events.splice(0)[0], OPTS)).toEqual({ kind: 'blocked' });
    expect(cs.world.msgKey).toBe('msg.cube.notEmpty');
  });
});
