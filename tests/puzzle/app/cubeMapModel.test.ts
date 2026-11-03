// C4：app/cubeMapModel.ts 展開圖資料 (規格 5.4.1：接通 / 門後是牆 / 拱門、站在機關旁顯示預覽且不執行)
import { describe, it, expect } from 'vitest';
import { captureState, newChapterState, openChapter, singleRoomSpec, turn, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import type { CubeDef } from '../../../src/puzzle/core/cube';
import type { LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors, leverOp } from '../../../src/puzzle/mechanics/cube';
import { deriveCubeMap, previewFor, previewLever } from '../../../src/puzzle/app/cubeMapModel';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';
import { place } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 8, visible: 'both', solid: true };
const door = (id: string, side: 'N' | 'S' | 'E' | 'W', kind: 'door' | 'arch', x: number, z: number): ObjDef =>
  ({ id, type: 'cubeDoor', side, kind, x, y: 0, z, w: 0.4, h: 2.4, d: 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d' });
const lever: ObjDef = { id: 'lever', type: 'lever', word: 'up', x: 0, y: 0, z: -3.6, w: 0.6, h: 1.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d' };
const room = (id: string, titleKey: string, objects: ObjDef[]): LevelDef => ({
  id, titleKey, narrationKey: 'lvl.1-2.narration', nextKey: 'lvl.1-2.next',
  bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -4, y: 0, z: 0 }, objects: [floor, ...objects]
});
const CUBE: CubeDef = { id: 't', dims: [2, 2, 1], ops: 'slide', cells: [{ at: [0, 1, 0], room: 'a' }, { at: [1, 0, 0], room: 'b' }, { at: [1, 1, 0], room: 'solid' }], frame: [{ at: [0, 1, 0], side: 'S', kind: 'porch' }] };
const ROOMS = { a: room('a', 'lvl.1-2.title', [door('aE', 'E', 'door', 5.8, 0), door('aS', 'S', 'arch', -3, 3.8), lever]), b: room('b', 'lvl.1-1.title', [door('bW', 'W', 'door', -5.8, 0)]) };
const SPEC: ChapterSpec = { chapter: 9, cube: CUBE, rooms: ROOMS, doors: chapterDoors(ROOMS) };
const open = (): ChapterSession => openChapter(SPEC, newChapterState(SPEC, 'a', null), OPTS);

describe('deriveCubeMap', () => {
  it('格：房名走文字表、空格 / 實心、目前所在房；門：接通 / 門後是牆 / 屋框；屋框名稱', () => {
    const m = deriveCubeMap(open(), TEXT)!;
    expect([m.title, m.cols, m.rows]).toEqual(['展開圖', 2, 2]);
    expect(m.cells.map(c => [c.x, c.y, c.kind, c.name, c.current])).toEqual([
      [0, 0, 'empty', '空格', false], [1, 0, 'room', '門廊', false], [0, 1, 'room', '玄關', true], [1, 1, 'solid', '實心', false]
    ]);
    expect(m.doors.map(d => [d.door, d.x, d.y, d.side, d.kind, d.link])).toEqual([
      ['aE', 0, 1, 'E', 'door', 'wall'], ['aS', 0, 1, 'S', 'arch', 'frame'], ['bW', 1, 0, 'W', 'door', 'wall']
    ]);
    expect(m.frames).toEqual([{ x: 0, y: 1, side: 'S', kind: 'porch', name: '大門（門廊）' }]);
    expect(m.preview).toBeNull();
    expect(m.hint).toBe(TEXT('ui.map.hint'));
  });

  it('預覽 (拉「上」)：玄關 (0,1) → (0,0)、轉後東門接上 b 的西門 (只列有變化的門)；只算不寫，session 逐欄不變', () => {
    const cs = open();
    const before = JSON.stringify(captureState(cs));
    const m = deriveCubeMap(cs, TEXT, { op: leverOp('a', 'up'), word: 'up' })!;
    expect(m.preview).toEqual({
      caption: '預覽：拉「上」之後（還沒拉）', blocked: null,
      moved: { room: 'a', name: '玄關', from: [0, 1], to: [0, 0] },
      doors: [
        { room: 'a', door: 'aE', x: 0, y: 0, side: 'E', kind: 'door', link: 'room', via: 'door' },
        { room: 'a', door: 'aS', x: 0, y: 0, side: 'S', kind: 'arch', link: 'wall' },
        { room: 'b', door: 'bW', x: 1, y: 0, side: 'W', kind: 'door', link: 'room', via: 'door' }
      ]
    });
    expect(JSON.stringify(captureState(cs))).toBe(before);
    expect(cs.world.ext.cube!.links.aE).toEqual({ to: 'wall' });
  });

  it('預覽也照實顯示轉不動 (再往上就是屋外)', () => {
    const cs = turn(open(), leverOp('a', 'up')) as ChapterSession;
    const pv = deriveCubeMap(cs, TEXT, { op: leverOp('a', 'up'), word: 'up' })!.preview!;
    expect([pv.caption, pv.blocked, pv.moved, pv.doors]).toEqual(['預覽：拉「上」', '拉桿拉不動。再過去就是屋外了。', null, []]);
  });

  it('沒有魔方的關卡 → null', () => {
    const spec = singleRoomSpec(porch);
    expect(deriveCubeMap(openChapter(spec, newChapterState(spec, porch.id, null), OPTS), TEXT)).toBeNull();
  });
});

describe('previewLever / previewFor：2D 站在機關旁才預覽', () => {
  it('2D 靠近拉桿 (任何深度、空中也算) → 預覽它的轉向；3D 或離太遠 → 無', () => {
    const cs = open();
    place(cs.world, 0.5, 0, 0, '2d');
    expect(previewLever(cs.world)?.def.id).toBe('lever');
    expect(previewFor(cs)).toEqual({ op: { t: 'slide', room: 'a', dir: 'N' }, word: 'up' });
    cs.world.player.onGround = false;
    expect(previewLever(cs.world)?.def.id).toBe('lever');
    place(cs.world, 2.6, 0, 0, '2d');
    expect(previewLever(cs.world)).toBeNull();
    place(cs.world, 0, 0, -2.8, '3d');
    expect(previewFor(cs)).toBeNull();
  });
});
