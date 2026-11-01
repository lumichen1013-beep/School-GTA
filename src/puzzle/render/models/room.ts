import * as THREE from 'three';
import type { LevelDef, ObjDef } from '../../logic/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import { PAL } from '../palette';
import { floorPlanks, glow, painting, rug, wallpaper } from '../textures';
import type { PropModel } from './types';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const WALL_H = 6;
/** 圖紙裡的房間背景：同色系但更淡，讓前景物件跳出來 */
const BG2D = { paper: 0xfff9ef, wainscot: 0xead0ae, trim: 0xd9b48c } as const;

/** 地板：木地板紋理頂面 + 側面；2D 為扁平木色長條 */
export function floorModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h, d.d), PAL.floorSide, { flat: PAL.floorB });
  body.position.y = d.h / 2;
  const top = p.mesh(new THREE.PlaneGeometry(d.w, d.d), 0xffffff, { map: floorPlanks(d.w / 2.6, d.d / 2.6), outline: false });
  top.rotation.x = -Math.PI / 2;
  top.position.y = d.h + 0.002;
  const lip = p.mesh(box(d.w, 0.12, 0.04), PAL.floorA, { outline: false });
  lip.position.set(0, d.h - 0.06, d.d / 2 + 0.01);
  g.add(body, top, lip);
  return { root: g };
}

/** root = 全部裝飾；only3d = 僅現實顯示 (側牆、地毯、牆上書架、坑洞、燈光)；其餘 (後牆、掛畫、燈罩) 在圖紙裡當淡色背景 */
export interface Decor { root: THREE.Group; only3d: THREE.Object3D[]; occluders: THREE.Mesh[]; update(t: number, is2d: boolean): void }

/** 牆上的書架 (高於跳躍可及高度，純裝飾) */
function wallShelf(p: Painter, x: number, y: number, z: number, w: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const board = p.mesh(box(w, 0.06, 0.3), PAL.shelf);
  const brackets = [-w / 2 + 0.2, w / 2 - 0.2].map(bx => {
    const b = p.mesh(box(0.05, 0.2, 0.25), PAL.shelfDark, { outline: false });
    b.position.set(bx, -0.12, -0.02);
    return b;
  });
  g.add(board, ...brackets);
  let bx = -w / 2 + 0.08;
  let i = 0;
  while (bx < w / 2 - 0.15) {
    const bw = 0.07 + ((seed * 7 + i * 13) % 5) * 0.012;
    const bh = 0.26 + ((seed + i * 5) % 4) * 0.035;
    const b = p.mesh(box(bw, bh, 0.22), PAL.books[(seed + i) % PAL.books.length], { outline: false });
    b.position.set(bx + bw / 2, 0.03 + bh / 2, 0);
    g.add(b);
    bx += bw + 0.01;
    i++;
  }
  return g;
}

function framedPainting(p: Painter, x: number, y: number, z: number, w: number, h: number, variant: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const frame = p.mesh(box(w + 0.16, h + 0.16, 0.06), PAL.trim, { flat: BG2D.trim, outline: false });
  const inner = p.mesh(box(w + 0.05, h + 0.05, 0.065), PAL.gold, { flat: 0xf3d58a, outline: false, metalness: 0.4, roughness: 0.4 });
  const canvasMesh = p.mesh(new THREE.PlaneGeometry(w, h), 0xffffff, { map: painting(variant), flat: 0xfff6ea, flatMap: true, outline: false, shadow: false });
  canvasMesh.position.z = 0.036;
  g.add(frame, inner, canvasMesh);
  return g;
}

function pendantLamp(p: Painter, x: number, z: number, only3d: THREE.Object3D[], halos: THREE.Sprite[], occluders: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const cord = p.mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6), PAL.cord, { flat: BG2D.trim, outline: false, shadow: false, unique: true });
  cord.position.y = WALL_H - 0.7;
  const shade = p.mesh(new THREE.ConeGeometry(0.42, 0.38, 20, 1, true), PAL.lampShade, { flat: 0xf7d79a, outline: false, side: THREE.DoubleSide, emissive: PAL.lampShade, emissiveIntensity: 0.25, shadow: false, unique: true });
  shade.position.y = WALL_H - 1.55;
  const cap = p.mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.1, 10), PAL.trim, { flat: BG2D.trim, outline: false, shadow: false, unique: true });
  cap.position.y = WALL_H - 1.36;
  const bulb = p.mesh(new THREE.SphereGeometry(0.11, 12, 10), PAL.lampBulb, { flat: 0xfff7dc, emissive: PAL.lampBulb, emissiveIntensity: 1.2, outline: false, shadow: false, unique: true });
  bulb.position.y = WALL_H - 1.72;
  const halo = glowSprite(glow(), PAL.lampLight, 1.3, 0.5, true);
  halo.position.y = WALL_H - 1.75;
  halos.push(halo);
  const light = new THREE.PointLight(PAL.lampLight, 9, 11, 1.4);
  light.position.y = WALL_H - 1.9;
  only3d.push(light, halo);
  // 吊燈在鏡頭與玩家之間時淡出
  occluders.push(cord, shade, cap, bulb);
  g.add(cord, shade, cap, bulb, halo, light);
  return g;
}

/** 房間裝飾 (僅現實)：後牆 / 側牆壁紙 + 護牆板 + 踢腳線、掛畫、牆上書架、地毯、吊燈、坑洞 */
export function buildDecor(p: Painter, level: LevelDef): Decor {
  const root = new THREE.Group();
  const only3d: THREE.Object3D[] = [];
  const occluders: THREE.Mesh[] = [];
  const halos: THREE.Sprite[] = [];
  const b = level.bounds;
  const W = b.maxX - b.minX;
  const D = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2;
  const wallSide = (len: number) => {
    const g = new THREE.Group();
    const paper = p.mesh(new THREE.PlaneGeometry(len, WALL_H), 0xffffff, { map: wallpaper(len / 1.2, WALL_H / 1.2), flat: BG2D.paper, flatMap: true, outline: false });
    paper.position.y = WALL_H / 2;
    const wains = p.mesh(box(len, 1.1, 0.06), PAL.wainscot, { flat: BG2D.wainscot, outline: false });
    wains.position.set(0, 0.55, 0.03);
    const rail = p.mesh(box(len, 0.07, 0.1), PAL.trim, { flat: BG2D.trim, outline: false });
    rail.position.set(0, 1.12, 0.05);
    const base = p.mesh(box(len, 0.16, 0.1), PAL.baseboard, { flat: BG2D.trim, outline: false });
    base.position.set(0, 0.08, 0.05);
    const crown = p.mesh(box(len, 0.12, 0.12), PAL.trim, { flat: BG2D.trim, outline: false });
    crown.position.set(0, WALL_H - 0.06, 0.06);
    g.add(paper, wains, rail, base, crown);
    // 護牆板分格
    for (let a = -len / 2 + 0.9; a < len / 2 - 0.4; a += 1.6) {
      const panel = p.mesh(box(1.2, 0.7, 0.02), PAL.trim, { flat: BG2D.trim, outline: false, shadow: false });
      panel.position.set(a + 0.4, 0.58, 0.065);
      const inset = p.mesh(box(1.08, 0.58, 0.022), PAL.wainscot, { flat: BG2D.wainscot, outline: false, shadow: false });
      inset.position.set(a + 0.4, 0.58, 0.068);
      g.add(panel, inset);
    }
    return g;
  };
  const back = wallSide(W);
  back.position.set(cx, 0, b.minZ);
  const left = wallSide(D);
  left.position.set(b.minX, 0, (b.minZ + b.maxZ) / 2);
  left.rotation.y = Math.PI / 2;
  const right = wallSide(D);
  right.position.set(b.maxX, 0, (b.minZ + b.maxZ) / 2);
  right.rotation.y = -Math.PI / 2;
  root.add(back, left, right);
  only3d.push(left, right);

  const wz = b.minZ + 0.05;
  const paintings = [framedPainting(p, -14, 3.1, wz, 1.6, 1.2, 0), framedPainting(p, -1, 3.2, wz, 2.0, 1.4, 1), framedPainting(p, 14.2, 3.1, wz, 1.5, 1.1, 2)];
  root.add(...paintings);
  // 牆上書架在圖紙裡容易被誤認成平台，只在現實顯示
  const shelves = [wallShelf(p, -12.6, 2.75, b.minZ + 0.15, 2.2, 1), wallShelf(p, 4.3, 2.8, b.minZ + 0.15, 2.0, 4), wallShelf(p, 16.4, 2.75, b.minZ + 0.15, 1.8, 6)];
  root.add(...shelves);
  only3d.push(...shelves);
  for (const [x, z, w, d] of [[-15, 1.5, 5, 3.4], [15, 1.2, 5.2, 3.6]]) {
    const r = p.mesh(new THREE.PlaneGeometry(w, d), 0xffffff, { map: rug(), outline: false });
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.006, z);
    root.add(r);
    only3d.push(r);
  }
  for (const x of [-15, -1, 5.5, 15]) root.add(pendantLamp(p, x, 0.5, only3d, halos, occluders));
  // 地板之間的缺口底下放一塊暗色，看起來深不見底
  const floors = level.objects.filter(o => o.type === 'floor').sort((a, c) => a.x - c.x);
  for (let i = 0; i + 1 < floors.length; i++) {
    const x0 = floors[i].x + floors[i].w / 2;
    const x1 = floors[i + 1].x - floors[i + 1].w / 2;
    if (x1 - x0 < 0.1) continue;
    const pit = p.mesh(new THREE.PlaneGeometry(x1 - x0, D), PAL.pit, { outline: false, shadow: false });
    pit.rotation.x = -Math.PI / 2;
    pit.position.set((x0 + x1) / 2, -3.2, (b.minZ + b.maxZ) / 2);
    root.add(pit);
    only3d.push(pit);
  }
  let last: boolean | null = null;
  const update = (t: number, is2d: boolean) => {
    if (last !== is2d) {
      last = is2d;
      for (const o of only3d) o.visible = !is2d;
      // 圖紙裡把背景牆往後推，貼牆物件 (高台、門、紙條) 的描邊才不會被牆面蓋住
      const push = is2d ? -0.8 : 0;
      back.position.z = b.minZ + push;
      for (const pt of paintings) pt.position.z = wz + push;
    }
    halos.forEach((h, i) => { h.material.opacity = 0.42 + 0.06 * Math.sin(t * 2 + i); });
  };
  return { root, only3d, occluders, update };
}
