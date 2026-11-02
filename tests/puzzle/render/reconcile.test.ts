// S7 scene 對帳：依 allObjs(world) 以 id 新增 / 拆除模型；只讀世界、不改世界 (architecture 4.5)
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { newWorld, place } from '../helpers';
import { PuzzleScene } from '../../../src/puzzle/render/scene';
import { PuzzleCameras } from '../../../src/puzzle/render/cameras';
import type { ObjState, World } from '../../../src/puzzle/core/types';
import { stubCanvas } from './stubCanvas';

/** 世界中可序列化的部分 (排除 rt；byId 以 objs 代表) */
const dump = (w: World): string => JSON.stringify({
  objs: w.objs.map(o => ({ id: o.def.id, def: o.def, x: o.x, y: o.y, z: o.z, gone: o.gone, used: o.used, touched: o.touched })),
  player: w.player, checkpoint: w.checkpoint, inv: w.inv, abilities: w.abilities, cleared: w.cleared,
  msg: w.msg, msgKey: w.msgKey, msgSeq: w.msgSeq, time: w.time, events: w.events, ids: [...w.byId.keys()]
});

const inScene = (view: PuzzleScene, root: THREE.Object3D | undefined): boolean => !!root && root.parent === view.scene;

describe('渲染：scene 對帳', () => {
  beforeAll(stubCanvas);

  it('只讀世界：兩種模式各畫多幀 (含閘門升起、門解封、通關動畫)，世界狀態逐欄不變', () => {
    const w = newWorld();
    place(w, 15, 0, -4.6);
    for (const id of ['gate', 'valve', 'door']) w.byId.get(id)!.used = true;
    w.byId.get('key')!.gone = true;
    w.cleared = true;
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    const before = dump(w);
    for (let i = 0; i < 120; i++) {
      const mode = i < 60 ? '3d' : '2d';
      cams.follow(0.12, mode);
      view.update(mode, 1 / 60, i / 60, cams.active(mode));
    }
    expect(dump(w)).toBe(before);
    view.dispose();
  });

  it('執行期新增的物件 (推導 / 生成) 下一幀出現模型；移出 allObjs 後模型拆除', () => {
    const w = newWorld();
    const view = new PuzzleScene(w);
    const cam = new THREE.PerspectiveCamera();
    view.update('3d', 1 / 60, 0, cam);
    const crate = w.byId.get('crate')!;
    const spawned: ObjState = { def: { ...crate.def, id: 'crate:spawned', x: 0 }, x: 0, y: 0, z: 2, gone: false, used: false, touched: false };
    w.objs.push(spawned);
    expect(view.modelRoot('crate:spawned')).toBeUndefined();
    view.update('3d', 1 / 60, 0, cam);
    const root = view.modelRoot('crate:spawned');
    expect(inScene(view, root)).toBe(true);
    expect(root!.position.toArray()).toEqual([0, 0, 2]);
    expect(root!.visible).toBe(true);
    spawned.x = 1.5;
    view.update('2d', 1 / 60, 0, cam);
    expect(root!.position.x).toBe(1.5);
    w.objs.pop();
    view.update('3d', 1 / 60, 0, cam);
    expect(view.modelRoot('crate:spawned')).toBeUndefined();
    expect(root!.parent).toBeNull();
    expect(inScene(view, view.modelRoot('crate'))).toBe(true); // 其他模型不受影響
    view.dispose();
  });

  it('拆除的模型不再跟著切換模式換材質 (Painter 釋放)', () => {
    const w = newWorld();
    const view = new PuzzleScene(w);
    const cam = new THREE.PerspectiveCamera();
    const crate = w.byId.get('crate')!;
    w.objs.push({ def: { ...crate.def, id: 'tmp' }, x: 0, y: 0, z: 0, gone: false, used: false, touched: false });
    view.update('3d', 1 / 60, 0, cam);
    const meshes: THREE.Mesh[] = [];
    view.modelRoot('tmp')!.traverse(o => { if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).side !== THREE.BackSide) meshes.push(o as THREE.Mesh); });
    const mats = meshes.map(m => m.material);
    w.objs.pop();
    view.update('3d', 1 / 60, 0, cam);
    view.update('2d', 1 / 60, 0, cam);
    expect(meshes.map(m => m.material)).toEqual(mats);
    view.dispose();
  });

  it('可見性與位置：拾取後 (gone) 隱藏；圖紙專屬物件在 2D 畫在最前層', () => {
    const w = newWorld();
    const view = new PuzzleScene(w);
    const cam = new THREE.PerspectiveCamera();
    view.update('2d', 1 / 60, 0, cam);
    expect(view.modelRoot('key')!.visible).toBe(true);
    expect(view.modelRoot('plate')!.visible).toBe(true);
    expect(view.modelRoot('plate')!.position.z).toBe(6.3);
    expect(view.modelRoot('table')!.visible).toBe(false);
    w.byId.get('key')!.gone = true;
    view.update('3d', 1 / 60, 0, cam);
    expect(view.modelRoot('key')!.visible).toBe(false);
    expect(view.modelRoot('plate')!.visible).toBe(false);
    expect(view.modelRoot('table')!.visible).toBe(true);
    view.dispose();
  });
});
