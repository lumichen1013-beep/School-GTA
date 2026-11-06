// 深度打架 (z-fighting) 回歸：以真實 PuzzleScene 建出玄關 3D 場景，找「同平面、同朝向、重疊、外觀不同、鏡頭看得到」的面對
// 曾發生：閘門門柱 vs 隔牆端面 (壁紙 / 護牆板 / 腰線 / 踢腳線同深度)、出口門門把座板 vs 嵌板、書架飾條 vs 頂板、側牆飾條端面、紙條 vs 護牆板
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import type { ObjDef } from '../../../src/puzzle/core/types';
import { FOYER_V02, newWorld } from '../helpers';
import { PuzzleScene } from '../../../src/puzzle/render/scene';
import { PuzzleCameras } from '../../../src/puzzle/render/cameras';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';
import { shelf } from '../../../src/puzzle/content/levels/ch2/2-1-shelf';
import { deep, mezz, print, reading } from '../../../src/puzzle/content/levels/ch2/rooms';
import { THEMES } from '../../../src/puzzle/render/themes';
import { bed, depths, gallery, night, nursery } from '../../../src/puzzle/content/levels/ch3/rooms';
import { archive, drawer, furnace, hall, sealed, well } from '../../../src/puzzle/content/levels/ch4/rooms';

/** node 沒有 canvas：程序化紋理畫在吞掉所有呼叫的假 2D context 上 */
function stubCanvas(): void {
  const sink: unknown = new Proxy(function () { /* noop */ }, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink),
    apply: () => sink,
    set: () => true
  });
  (globalThis as { document?: unknown }).document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => sink })
  };
}

interface Face { ax: 'x' | 'y' | 'z'; c: number; dir: number; u0: number; u1: number; w0: number; w1: number; look: string; name: string; mesh: THREE.Mesh }

const AXES = ['x', 'y', 'z'] as const;

/** 網格中所有軸向平面 (依軸 / 座標 / 朝向合併三角形成包圍矩形) */
function facesOf(m: THREE.Mesh, look: string): Face[] {
  const pos = m.geometry.attributes.position as THREE.BufferAttribute;
  const idx = m.geometry.index;
  const n = idx ? idx.count : pos.count;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const planes = new Map<string, Face>();
  for (let i = 0; i < n; i += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
    const nn = e1.subVectors(v[1], v[0]).cross(e2.subVectors(v[2], v[0]));
    if (nn.length() < 1e-9) continue;
    nn.normalize();
    const ax = AXES.find(a => Math.abs(nn[a]) > 0.9999);
    if (!ax) continue;
    const [u, w] = AXES.filter(a => a !== ax);
    const dir = Math.sign(nn[ax]);
    const key = `${ax}|${v[0][ax].toFixed(4)}|${dir}`;
    const f = planes.get(key) ?? { ax, c: v[0][ax], dir, u0: Infinity, u1: -Infinity, w0: Infinity, w1: -Infinity, look, name: m.geometry.type, mesh: m };
    for (const p of v) { f.u0 = Math.min(f.u0, p[u]); f.u1 = Math.max(f.u1, p[u]); f.w0 = Math.min(f.w0, p[w]); f.w1 = Math.max(f.w1, p[w]); }
    planes.set(key, f);
  }
  return [...planes.values()];
}

/** 3D 跟隨鏡頭可到的範圍 (cameras.ts：水平限制在房間內縮 3 / 2、偏移 (0, 5.4, 8.2)) 看得到這個面的正面嗎；camX = 鏡頭 x 範圍 (預設玄關 [-17, 17]) */
function seenBy3dCamera(f: Face, camX: readonly [number, number] = [-17, 17]): boolean {
  if (f.ax === 'z') return f.dir > 0 ? true : false; // 鏡頭 z ≥ 4.2，看 -z 面只會看到背面
  if (f.ax === 'y') return f.dir > 0; // 鏡頭在上方 (y ≥ 6.2)
  return f.dir > 0 ? f.c < camX[1] : f.c > camX[0]; // 鏡頭 x ∈ camX
}

function lookOf(m: THREE.Mesh): string | null {
  const mat = m.material as THREE.MeshStandardMaterial;
  if (mat.side === THREE.BackSide) return null; // 2D 描邊
  return `${mat.color.getHexString()}|${mat.map?.uuid ?? ''}|${mat.emissive?.getHexString() ?? ''}|${mat.metalness}|${mat.roughness}`;
}

interface Rect { ax: 'x' | 'y' | 'z'; c: number; dir: number; u0: number; u1: number; w0: number; w1: number }
const E = 1e-4;

/** 重疊區是否被擋住：前方緊貼一個實心盒 (例如藏在柱子 / 頂板裡)，或前方 1cm 內有另一個完整蓋住的平行面 (例如地板紋理面) */
function hidden(r: Rect, boxes: THREE.Box3[], faces: Face[]): boolean {
  const [u, w] = AXES.filter(a => a !== r.ax);
  const lateral = (min: THREE.Vector3, max: THREE.Vector3) => min[u] <= r.u0 + E && max[u] >= r.u1 - E && min[w] <= r.w0 + E && max[w] >= r.w1 - E;
  for (const b of boxes) {
    const ahead = r.dir > 0 ? b.min[r.ax] <= r.c + E && b.max[r.ax] >= r.c + 1e-3 : b.max[r.ax] >= r.c - E && b.min[r.ax] <= r.c - 1e-3;
    if (ahead && lateral(b.min, b.max)) return true;
  }
  return faces.some(f => f.ax === r.ax && f.dir === r.dir && (f.c - r.c) * r.dir > E && (f.c - r.c) * r.dir <= 0.01
    && f.u0 <= r.u0 + E && f.u1 >= r.u1 - E && f.w0 <= r.w0 + E && f.w1 >= r.w1 - E);
}

function zFightPairs(scene: THREE.Scene, camX?: readonly [number, number]): string[] {
  scene.updateMatrixWorld(true);
  const faces: Face[] = [];
  const boxes: THREE.Box3[] = [];
  scene.traverseVisible(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const look = lookOf(m);
    if (!look) return;
    faces.push(...facesOf(m, look).filter(f => seenBy3dCamera(f, camX)));
    if (m.geometry.type === 'BoxGeometry' && !(m.material as THREE.Material).transparent) {
      // 只取網格本身 (setFromObject 會把子物件 2D 描邊的放大盒算進去)
      m.geometry.computeBoundingBox();
      boxes.push(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    }
  });
  const out: string[] = [];
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i], b = faces[j];
    if (a.mesh === b.mesh || a.ax !== b.ax || a.dir !== b.dir || Math.abs(a.c - b.c) > 1e-4 || a.look === b.look) continue;
    const ou = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0);
    const ow = Math.min(a.w1, b.w1) - Math.max(a.w0, b.w0);
    if (ou <= 1e-4 || ow <= 1e-4) continue;
    const r: Rect = { ax: a.ax, c: a.c, dir: a.dir, u0: Math.max(a.u0, b.u0), u1: Math.min(a.u1, b.u1), w0: Math.max(a.w0, b.w0), w1: Math.min(a.w1, b.w1) };
    if (hidden(r, boxes, faces)) continue;
    const at = (f: Face) => f.mesh.getWorldPosition(new THREE.Vector3()).toArray().map(x => x.toFixed(2)).join(',');
    out.push(`${a.ax}=${a.c.toFixed(3)} 重疊 ${ou.toFixed(3)}x${ow.toFixed(3)}：${a.name}@(${at(a)}) / ${b.name}@(${at(b)})`);
  }
  return out;
}

describe('渲染：深度打架 (共面)', () => {
  beforeAll(stubCanvas);

  it('玄關 3D 場景中，鏡頭看得到的面沒有「同平面、外觀不同」的重疊 (z-fighting)', () => {
    const w = newWorld();
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    view.update('3d', 1 / 60, 0, cams.active('3d'));
    expect(zFightPairs(view.scene)).toEqual([]);
    view.dispose();
  });

  it('閘門升起後 (壓板壓下) 也沒有共面', () => {
    const w = newWorld();
    w.byId.get('gate')!.used = true;
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    for (let i = 0; i < 300; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
    expect(zFightPairs(view.scene)).toEqual([]);
    view.dispose();
  });

  it('魔方 (M-Cube)：東門接通後 (門扇微開、門縫透光) 與拉桿擺動中也沒有共面；兩模式都畫得出來', () => {
    const w = newWorld();
    w.ext = { cube: { links: { doorE: { to: 'room', room: 'stair', door: 'doorW', kind: 'door' }, archS: { to: 'wall' } } } };
    w.msgKey = 'msg.cube.turned';
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    for (let i = 0; i < 300; i++) { if (i === 10) w.msgSeq++; view.update('3d', 1 / 60, i / 60, cams.active('3d')); }
    expect(zFightPairs(view.scene)).toEqual([]);
    view.update('2d', 1 / 60, 5, cams.active('2d'));
    expect(view.modelRoot('lever')!.visible && view.modelRoot('doorE')!.visible).toBe(true);
    expect(view.modelRoot('archS')!.visible).toBe(false); // 前緣的拱門只在實景
    view.dispose();
  });

  it('3D 鏡頭 near / far 比值不超過 200 (深度精度)', () => {
    const cams = new PuzzleCameras(newWorld());
    expect(cams.persp.far / cams.persp.near).toBeLessThanOrEqual(200);
  });
});

describe('渲染：深度打架 (共面)：1-1 門廊', () => {
  beforeAll(stubCanvas);

  /** 門廊跟隨鏡頭的 x 範圍 (cameras.ts follow：[minX + 3, maxX - 3]) */
  const CAM_X = [porch.bounds.minX + 3, porch.bounds.maxX - 3] as const;

  it('門廊 3D 場景 (鐵柵、台階、木板橋、隔牆、玻璃牆、石階、字條、門) 鏡頭看得到的面沒有共面', () => {
    const w = newWorld(porch);
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    view.update('3d', 1 / 60, 0, cams.active('3d'));
    expect(zFightPairs(view.scene, CAM_X)).toEqual([]);
    view.dispose();
  });

  it('門廊通關開門後 (門扇轉開) 也沒有共面', () => {
    const w = newWorld(porch);
    w.cleared = true;
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    for (let i = 0; i < 300; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
    expect(zFightPairs(view.scene, CAM_X)).toEqual([]);
    view.dispose();
  });
});

describe('渲染：深度打架 (共面)：1-2 玄關改版 (1-2d；v0.2 玄關固定場景)', () => {
  beforeAll(stubCanvas);

  it('1-2d 完成時的配置 (閘門開、木箱推到出口區閥下、閥轉開、門解封) 3D 鏡頭看得到的面沒有共面', () => {
    const w = newWorld(FOYER_V02);
    for (const id of ['plate', 'gate', 'valve', 'door']) w.byId.get(id)!.used = true;
    const c = w.byId.get('crate')!;
    c.x = 15; c.z = 0;
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    for (let i = 0; i < 300; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
    expect(zFightPairs(view.scene)).toEqual([]);
    view.dispose();
  });

  it('藏寶圖 (正交鏡頭從 +z 看)：高處墨水閥的網格 (含新增墨點) 彼此、與其他物件的朝前面都不共面', () => {
    const w = newWorld(FOYER_V02);
    const c = w.byId.get('crate')!;
    c.x = 15; c.z = 0;
    w.player.mode = '2d';
    const view = new PuzzleScene(w);
    const cams = new PuzzleCameras(w);
    view.update('2d', 1 / 60, 0, cams.active('2d'));
    view.scene.updateMatrixWorld(true);
    const valveRoot = view.modelRoot('valve')!;
    const inValve = (m: THREE.Object3D) => { for (let o: THREE.Object3D | null = m; o; o = o.parent) if (o === valveRoot) return true; return false; };
    const faces: Face[] = [];
    view.scene.traverseVisible(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const look = lookOf(m);
      if (look) faces.push(...facesOf(m, look).filter(f => f.ax === 'z' && f.dir > 0));
    });
    const mine = faces.filter(f => inValve(f.mesh));
    expect(mine.length).toBeGreaterThan(8);
    const bad = mine.flatMap(a => faces.filter(b => b.mesh !== a.mesh && Math.abs(a.c - b.c) <= 1e-4 && a.look !== b.look
      && Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > 1e-4 && Math.min(a.w1, b.w1) - Math.max(a.w0, b.w0) > 1e-4).map(b => `${a.name}@${a.c.toFixed(3)} / ${b.name}`));
    expect(bad).toEqual([]);
  });
});

describe('渲染：深度打架 (共面)：2-1 書架迴廊 (第二章；森林圖書館)', () => {
  beforeAll(stubCanvas);

  /** 2-1 跟隨鏡頭的 x 範圍 */
  const CAM_X = [shelf.bounds.minX + 3, shelf.bounds.maxX - 3] as const;

  it('三段書牆 (2-1 在第 0 / 1 / 2 行) 各自的 3D 場景：鏡頭看得到的面沒有共面；背後只有那一段的物件', () => {
    for (const c of [0, 1, 2]) {
      const w = newWorld(shelf);
      w.ext = { cube: { links: {}, at: [c, 0, 0] } };
      const view = new PuzzleScene(w, THEMES.study);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 30; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([c, zFightPairs(view.scene, CAM_X)]).toEqual([c, []]);
      expect(['bay0', 'bay1', 'bay2'].map(id => view.modelRoot(id)!.visible)).toEqual([0, 1, 2].map(k => k === c));
      view.dispose();
    }
  });

  it('全部完成後 (書擋倒下、暗格打開、D 抽出、三盞燈亮、書背轉過來) 也沒有共面；藏寶圖畫得出來 (墨字書名只在藏寶圖)', () => {
    const w = newWorld(shelf);
    w.ext = { cube: { links: {}, at: [2, 0, 0] } };
    for (const id of ['bookend', 'bookLock', 'bookD', 'lampLin', 'lampShu', 'lampMen', 'lampLock']) w.byId.get(id)!.used = true;
    const view = new PuzzleScene(w, THEMES.study);
    const cams = new PuzzleCameras(w);
    for (let i = 0; i < 300; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
    expect(zFightPairs(view.scene, CAM_X)).toEqual([]);
    w.player.mode = '2d';
    view.update('2d', 1 / 60, 5, cams.active('2d'));
    expect([view.modelRoot('bookYing')!.visible, view.modelRoot('remark1')!.visible, view.modelRoot('remark2')!.visible]).toEqual([true, true, false]);
    view.dispose();
  });

  it('占位房 (書櫃、樹根) 的 3D 場景沒有共面', () => {
    for (const room of [reading, deep]) {
      const w = newWorld(room);
      const view = new PuzzleScene(w, THEMES.study);
      const cams = new PuzzleCameras(w);
      view.update('3d', 1 / 60, 0, cams.active('3d'));
      expect([room.id, zFightPairs(view.scene, [room.bounds.minX + 3, room.bounds.maxX - 3])]).toEqual([room.id, []]);
      view.dispose();
    }
  });
});

describe('渲染：深度打架 (共面)：2-2 閱覽室與印房的活字桌 (第二章)', () => {
  beforeAll(stubCanvas);

  it('2-2 開場與全部完成後 (書翻頁、淡墨塗開、對聯櫃打開、目錄櫃拉出、書脊讀過) 3D 鏡頭看得到的面沒有共面；藏寶圖畫得出淡墨與下聯', () => {
    for (const done of [false, true]) {
      const w = newWorld(reading);
      if (done) for (const id of ['book', 'veil', 'lower', 'cabinet', 'catalog', 'spine']) w.byId.get(id)!.used = true;
      const view = new PuzzleScene(w, THEMES.study);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 120; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([done, zFightPairs(view.scene, [reading.bounds.minX + 3, reading.bounds.maxX - 3])]).toEqual([done, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 3, cams.active('2d'));
      expect([view.modelRoot('veil')!.visible, view.modelRoot('lower')!.visible]).toEqual([done, true]);
      view.dispose();
    }
  });

  it('印房 (活字桌與鏡片) 的 3D 場景沒有共面', () => {
    const w = newWorld(print);
    const view = new PuzzleScene(w, THEMES.study);
    const cams = new PuzzleCameras(w);
    view.update('3d', 1 / 60, 0, cams.active('3d'));
    expect(zFightPairs(view.scene, [print.bounds.minX + 3, print.bounds.maxX - 3])).toEqual([]);
    view.dispose();
  });
});

describe('渲染：深度打架 (共面)：第三章溫室的五間占位房 (彩繪玻璃窗、育苗床、陶盆、園丁羅盤)', () => {
  beforeAll(stubCanvas);

  it('五間房的 3D 場景 (溫室主題) 鏡頭看得到的面沒有共面 (含已啟動、照排列擺好小陶盆的園丁羅盤)；藏寶圖畫得出來', () => {
    for (const room of [nursery, gallery, night, depths, bed]) {
      const w = newWorld(room);
      w.ext = { cube: { links: {}, at: [0, 1, 0], layout: { nursery: [0, 1, 0], night: [1, 1, 0], gallery: [2, 1, 0], bed: [1, 2, 0], depths: [2, 2, 0] } }, dial: { active: true } };
      const view = new PuzzleScene(w, THEMES.greenhouse);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 30; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([room.id, zFightPairs(view.scene, [room.bounds.minX + 3, room.bounds.maxX - 3])]).toEqual([room.id, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 1, cams.active('2d'));
      view.dispose();
    }
  });
  it('3-3 的各種狀態 (半座天平接上 / 閂住、巨盆被推進軌道與手印、陶槽放大、溫室深處伸過來的那一截) 3D 鏡頭看得到的面沒有共面；藏寶圖畫得出來', () => {
    const layout = { nursery: [1, 0, 0], night: [1, 1, 0], gallery: [2, 1, 0], bed: [1, 2, 0], depths: [2, 2, 0] } as const;
    for (const [room, prep] of [
      [night, (w: ReturnType<typeof newWorld>) => {
        w.ext = { ...w.ext, balance: { halfN: { other: 2 } } };
        const pot = w.byId.get('bigPot')!; pot.used = true; pot.z = -4.6;
        const tr = w.byId.get('trough')!; tr.def = { ...tr.def, w: 1.2, h: 0.9, d: 4.8 };
      }],
      [night, (w: ReturnType<typeof newWorld>) => { w.byId.get('halfN')!.used = true; }],
      [depths, (w: ReturnType<typeof newWorld>) => {
        const def = { id: 'protrude:trough', type: 'protrudeStep', source: 'trough', from: 'night', x: 0, y: 0, z: -4.6, w: 1.2, h: 0.9, d: 0.8, visible: 'both', solid: true, derived: true } as unknown as ObjDef;
        const o = { def, x: 0, y: 0, z: -4.6, gone: false, used: false, touched: false };
        w.objs.push(o); w.byId.set(def.id, o);
      }]
    ] as const) {
      const w = newWorld(room);
      w.ext = { cube: { links: {}, at: [1, 1, 0], layout }, dial: { active: true } };
      prep(w);
      const view = new PuzzleScene(w, THEMES.greenhouseNight);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 240; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([room.id, zFightPairs(view.scene, [room.bounds.minX + 3, room.bounds.maxX - 3])]).toEqual([room.id, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 1, cams.active('2d'));
      view.dispose();
    }
  });
  it('3-4 的各種狀態 (玻璃片嵌上、「許」字亮與抽屜彈出、巨根小 / 原 / 大、苔窗閂住、柵門打開) 3D 鏡頭看得到的面沒有共面；藏寶圖畫得出來', () => {
    const layout = { nursery: [1, 2, 0], night: [1, 0, 0], gallery: [2, 1, 0], bed: [1, 1, 0], depths: [2, 2, 0] } as const;
    for (const k of [0.5, 1, 1.5]) {
      const w = newWorld(depths);
      w.ext = { cube: { links: {}, at: [2, 2, 0], layout }, dial: { active: true } };
      w.byId.get('paneFrame')!.used = true;
      w.byId.get('lattice')!.used = k !== 1;
      w.byId.get('mossW')!.used = k === 0.5;
      const root = w.byId.get('giantRoot')!;
      root.def = { ...root.def, w: 2.8 * k, h: 2.6 * k, d: 2.4 * k };
      const view = new PuzzleScene(w, THEMES.greenhouse);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 240; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([k, zFightPairs(view.scene, [depths.bounds.minX + 3, depths.bounds.maxX - 3])]).toEqual([k, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 1, cams.active('2d'));
      view.dispose();
    }
  });
  it('追逐 1：長廊 (柵門開、殘影在追) 3D 鏡頭看得到的面沒有共面；殘影只在藏寶圖、1 秒緩入到 0.4、離場 1 秒淡出後不畫；鐵柵一道 = 2 個網格 (鐵條 + 尖頭、橫檔合併)', () => {
    const w = newWorld(depths);
    w.byId.get('lattice')!.used = true;
    w.byId.get('chaseGate')!.used = true;
    const c = w.byId.get('chaser')!;
    c.used = true;
    c.x = 30;
    w.player.x = 33;
    const view = new PuzzleScene(w, THEMES.greenhouse);
    const cams = new PuzzleCameras(w);
    for (let i = 0; i < 120; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
    expect(zFightPairs(view.scene, [depths.bounds.minX + 3, depths.bounds.maxX - 3])).toEqual([]);
    const figure = (): THREE.Mesh => { let m: THREE.Mesh | null = null; view.modelRoot('chaser')!.traverse(o => { if ((o as THREE.Mesh).isMesh) m = o as THREE.Mesh; }); return m!; };
    expect(view.modelRoot('chaser')!.visible).toBe(false); // 實景：不在場
    w.player.mode = '2d';
    const alpha = () => +((figure().material as THREE.MeshBasicMaterial).opacity).toFixed(3);
    view.update('2d', 1 / 60, 3, cams.active('2d'));
    const first = alpha();
    for (let i = 0; i < 70; i++) view.update('2d', 1 / 60, 3 + i / 60, cams.active('2d'));
    expect([view.modelRoot('chaser')!.visible, first > 0 && first < 0.02, alpha(), figure().visible]).toEqual([true, true, 0.4, true]);
    c.used = false;
    for (let i = 0; i < 70; i++) view.update('2d', 1 / 60, 5 + i / 60, cams.active('2d'));
    expect([alpha(), figure().visible]).toEqual([0, false]);
    let meshes = 0;
    view.modelRoot('barsA')!.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; });
    expect(meshes).toBe(2);
    view.dispose();
  });
});

describe('渲染：深度打架 (共面)：H1 夾層 (書牆、後面那面書櫃、小書桌)', () => {
  beforeAll(stubCanvas);

  it('書櫃三檔 (小 / 原 / 大) × 書桌拿過與否、書牆頂的裝飾書三層都出現：3D 鏡頭看得到的面沒有共面；藏寶圖畫得出書櫃、書牆只在實景', () => {
    for (const k of [0.5, 1, 1.5]) {
      const w = newWorld(mezz);
      w.ext = { labels: k === 1 ? {} : { 'scale:innerShelf': [k < 1 ? 'card.xiao' : 'card.da'] } };
      const shelf = w.byId.get('innerShelf')!;
      shelf.def = { ...shelf.def, w: 3.6 * k, h: 2.6 * k, d: 1.4 * k };
      w.byId.get('desk')!.used = k !== 1;
      const view = new PuzzleScene(w, THEMES.study);
      const cams = new PuzzleCameras(w);
      // 切三次藏寶圖 → 實景：書牆頂的裝飾書長到三層
      for (let n = 0; n < 3; n++) { w.player.mode = '2d'; view.update('2d', 1 / 60, n, cams.active('2d')); w.player.mode = '3d'; view.update('3d', 1 / 60, n + 0.5, cams.active('3d')); }
      for (let i = 0; i < 60; i++) view.update('3d', 1 / 60, 2 + i / 60, cams.active('3d'));
      expect([k, zFightPairs(view.scene, [mezz.bounds.minX + 3, mezz.bounds.maxX - 3])]).toEqual([k, []]);
      let walls = 0;
      view.modelRoot('bookWall')!.traverse(o => { if ((o as THREE.Mesh).isMesh && o.parent === view.modelRoot('bookWall')) walls++; });
      // 書牆 = 木框 + 背板 + 書 (3 個網格)；頂上的裝飾書 (decor wallTopBooks) 三層都出現
      let tops = 0;
      view.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.parent?.children.length === 3 && m.parent.position.z === -2.7 && m.parent.parent?.type === 'Group' && !view.modelRoot('bookWall')!.children.includes(m)) tops++; });
      expect([k, walls, tops]).toEqual([k, 3, 3]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 9, cams.active('2d'));
      expect([view.modelRoot('innerShelf')!.visible, view.modelRoot('bookWall')!.visible, view.modelRoot('desk')!.visible]).toEqual([true, false, true]);
      view.dispose();
    }
  });
});

describe('渲染：深度打架 (共面)：第四章地下室的六間占位房 (石砌牆、天花板的根、銅管、墨爐、檔案櫃、梯口、年輪根盤)', () => {
  beforeAll(stubCanvas);

  it('六間房的 3D 場景 (地下室主題) 鏡頭看得到的面沒有共面 (含已啟動的年輪根盤、接通 / 沒接通的梯口)；藏寶圖畫得出來', () => {
    const layout = { hall: [1, 0, 1], well: [1, 1, 1], furnace: [1, 1, 0], archive: [0, 1, 0], drawer: [2, 1, 0], sealed: [1, 2, 0] } as const;
    for (const [room, link] of [[hall, 'wall'], [hall, 'room'], [well, 'room'], [furnace, 'room'], [archive, 'room'], [drawer, 'wall'], [sealed, 'wall']] as const) {
      const w = newWorld(room);
      const links = Object.fromEntries(room.objects.filter(o => o.type === 'cubeDoor').map(o => [o.id, link === 'room' ? { to: 'room' as const, room: 'x', door: 'y', kind: 'door' as const } : { to: 'wall' as const }]));
      w.ext = { cube: { links, at: [1, 0, 1], layout }, dial: { active: true }, unlocked: [] };
      const view = new PuzzleScene(w, THEMES.cellar);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 30; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([room.id, link, zFightPairs(view.scene, [room.bounds.minX + 3, room.bounds.maxX - 3])]).toEqual([room.id, link, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 1, cams.active('2d'));
      view.dispose();
    }
  });

  it('4-1 的狀態 (拉繩拉下 / 折疊梯放下、根結踏板壓下與落在上面的木箱) 3D 鏡頭看得到的面沒有共面；藏寶圖 (只畫在圖上的台階) 畫得出來', () => {
    const layout = { hall: [2, 1, 1], well: [1, 1, 1], furnace: [1, 1, 0], archive: [0, 1, 0], drawer: [2, 1, 0], sealed: [1, 2, 0] } as const;
    for (const [room, prep] of [[archive, (w: ReturnType<typeof newWorld>) => { w.byId.get('foldCord')!.used = true; }], [drawer, (w: ReturnType<typeof newWorld>) => { w.byId.get('rootPlate')!.used = true; }]] as const) {
      const w = newWorld(room);
      w.ext = { cube: { links: {}, at: [0, 1, 0], layout }, dial: { active: true }, unlocked: ['L0'] };
      prep(w);
      const view = new PuzzleScene(w, THEMES.cellar);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 30; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([room.id, zFightPairs(view.scene, [room.bounds.minX + 3, room.bounds.maxX - 3])]).toEqual([room.id, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 1, cams.active('2d'));
      view.dispose();
    }
  });

  it('4-2 的狀態 (墨爐閥開、墨流過 / 東西匯點、玻璃眼亮、舊圖與小櫃、根井的墨痕) 3D 鏡頭看得到的面沒有共面；藏寶圖畫得出來', () => {
    const layout = { hall: [1, 2, 1], well: [1, 1, 1], furnace: [1, 1, 0], archive: [1, 2, 0], drawer: [1, 0, 0], sealed: [0, 1, 0] } as const;
    for (const [room, used] of [[furnace, ['inkValve', 'lockW', 'lockE', 'eye', 'veil', 'markCase']], [well, ['inkMark']], [hall, []], [archive, []], [drawer, []]] as const) {
      const w = newWorld(room);
      w.ext = { cube: { links: {}, at: [1, 1, 0], layout }, dial: { active: true }, unlocked: ['L0'], ink: { through: true, sinks: ['W', 'E'] }, light: { hits: [{ from: 'W', via: 2, out: null, rooms: ['hall', 'archive'] }] } };
      for (const id of used) w.byId.get(id)!.used = true;
      const view = new PuzzleScene(w, THEMES.cellar);
      const cams = new PuzzleCameras(w);
      for (let i = 0; i < 60; i++) view.update('3d', 1 / 60, i / 60, cams.active('3d'));
      expect([room.id, zFightPairs(view.scene, [room.bounds.minX + 3, room.bounds.maxX - 3])]).toEqual([room.id, []]);
      w.player.mode = '2d';
      view.update('2d', 1 / 60, 1, cams.active('2d'));
      view.dispose();
    }
  });
});
