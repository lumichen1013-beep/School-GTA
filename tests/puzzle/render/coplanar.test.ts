// 深度打架 (z-fighting) 回歸：以真實 PuzzleScene 建出玄關 3D 場景，找「同平面、同朝向、重疊、外觀不同、鏡頭看得到」的面對
// 曾發生：閘門門柱 vs 隔牆端面 (壁紙 / 護牆板 / 腰線 / 踢腳線同深度)、出口門門把座板 vs 嵌板、書架飾條 vs 頂板、側牆飾條端面、紙條 vs 護牆板
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { newWorld } from '../helpers';
import { PuzzleScene } from '../../../src/puzzle/render/scene';
import { PuzzleCameras } from '../../../src/puzzle/render/cameras';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';

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

describe('渲染：深度打架 (共面)：1-2 玄關改版 (1-2d)', () => {
  beforeAll(stubCanvas);

  it('1-2d 完成時的配置 (閘門開、木箱推到出口區閥下、閥轉開、門解封) 3D 鏡頭看得到的面沒有共面', () => {
    const w = newWorld();
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
    const w = newWorld();
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
