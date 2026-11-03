import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood } from '../textures';
import type { ModelCtx, PropModel } from './types';

// 2-4 手稿庫 (森林圖書館) 的物件外觀：手稿櫃 (櫃門上釘著老宅立面圖)、閉櫃 (矮櫃)、手稿架、手稿捆 (紅繩 / 封蠟 / 素面；厚薄 = d)
// 共面規則：同一模型內不同外觀的面不共面 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 折線字串 (「x,y x,y;…」) → 點陣列 (content/levels/ch2/drawing 的格式) */
export const polylines = (s: string): Array<Array<[number, number]>> =>
  s.split(';').map(l => l.trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number]));

/** 把整張圖 (3 × 2 格) 的 [x0, y0]～[x0 + cw, y0 + ch] 範圍畫到畫布 (墨線、紙底) */
export function drawingTexture(drawing: string, x0: number, y0: number, cw: number, ch: number, px = 256, paper = '#f4e9cf', ink = '#3a2b1c'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * ch / cw);
  const g = c.getContext('2d')!;
  g.fillStyle = paper; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = ink; g.lineWidth = Math.max(3, px / 60); g.lineCap = 'round'; g.lineJoin = 'round';
  const sx = c.width / cw, sy = c.height / ch;
  for (const line of polylines(drawing)) {
    g.beginPath();
    line.forEach(([x, y], i) => { const X = (x - x0) * sx, Y = (y - y0) * sy; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.stroke();
  }
  g.strokeStyle = 'rgba(58,43,28,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, c.width - 2, c.height - 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 手稿櫃：高櫃 + 腳 + 黃銅把手；櫃門上釘著整張老宅立面圖 (兩個視角都看得到)；打開 (used) 右扇櫃門轉開 */
export function patternCabinetModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const leg = p.mesh(box(0.12, 0.16, d.d - 0.1), pal.shelfDark, { outline: false }); leg.position.set(s * (d.w / 2 - 0.1), 0.08, 0); g.add(leg); }
  const body = p.mesh(box(d.w, d.h - 0.16, d.d - 0.08), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  body.position.set(0, 0.16 + (d.h - 0.16) / 2, -0.04);
  const crown = p.mesh(box(d.w + 0.12, 0.1, d.d), pal.shelfDark, { outline: false });
  crown.position.y = d.h - 0.045; // 頂面高出櫃身 5 mm (不與櫃身頂面共面)
  g.add(body, crown);
  const door = new THREE.Group();
  door.position.set(d.w / 2 - 0.04, 0, d.d / 2 - 0.02);
  const leaf = p.mesh(box(d.w / 2 - 0.06, d.h - 0.4, 0.04), pal.shelfDark, { outline: false });
  leaf.position.set(-(d.w / 2 - 0.06) / 2, d.h / 2, 0);
  const knob = p.mesh(box(0.05, 0.14, 0.04), pal.brass, { metalness: 0.7, roughness: 0.35, outline: false });
  knob.position.set(-(d.w / 2 - 0.06) + 0.1, d.h * 0.5, 0.04);
  door.add(leaf, knob);
  g.add(door);
  if (d.type === 'patternCabinet') {
    const pic = p.mesh(new THREE.PlaneGeometry(d.w * 0.7, d.w * 0.7 * 2 / 3), 0xffffff, { map: drawingTexture(d.drawing, 0, 0, 3, 2, 384), flatMap: true, outline: true, shadow: false, unique: true });
    pic.position.set(0, d.h * 0.62, d.d / 2 + 0.03);
    g.add(pic);
  }
  return { root: g, update: (c: ModelCtx) => { door.rotation.y = c.obj.used ? 1.2 : 0; } };
}

/** 閉櫃 (矮櫃)：胡桃木櫃身 + 出簷頂板 + 兩扇鑲板小門 (黃銅圓鈕，沒有鎖孔) + 短腳；打開 (used) 左扇轉開 */
export function smallCabinetModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const brass = { metalness: 0.7, roughness: 0.35 } as const;
  for (const s of [-1, 1]) { const leg = p.mesh(box(0.08, 0.14, 0.08), pal.shelfDark, { outline: false }); leg.position.set(s * (d.w / 2 - 0.08), 0.07, 0); g.add(leg); }
  const body = p.mesh(box(d.w, d.h - 0.19, d.d - 0.06), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  body.position.set(0, 0.14 + (d.h - 0.19) / 2, -0.03);
  const top = p.mesh(box(d.w + 0.08, 0.05, d.d + 0.02), pal.shelfDark);
  top.position.y = d.h - 0.025;
  g.add(body, top);
  const leafW = d.w / 2 - 0.06, leafH = d.h - 0.34;
  const leafY = 0.14 + (d.h - 0.19) / 2;
  const leaf = (parent: THREE.Object3D, x: number, z: number, knobX: number) => {
    const m = p.mesh(box(leafW, leafH, 0.04), pal.shelfDark, { outline: false });
    m.position.set(x, leafY, z);
    const panel = p.mesh(box(leafW - 0.14, leafH - 0.16, 0.02), pal.shelf, { outline: false, shadow: false });
    panel.position.set(x, leafY, z + 0.03);
    const knob = p.mesh(new THREE.SphereGeometry(0.035, 8, 6), pal.brass, { ...brass, outline: false, shadow: false });
    knob.position.set(knobX, leafY, z + 0.05);
    parent.add(m, panel, knob);
  };
  const door = new THREE.Group();
  door.position.set(-d.w / 2 + 0.04, 0, d.d / 2 - 0.01);
  leaf(door, leafW / 2, 0, leafW - 0.06);
  leaf(g, d.w / 4, d.d / 2 - 0.01, d.w / 4 - leafW / 2 + 0.06);
  g.add(door);
  return { root: g, update: (c: ModelCtx) => { door.rotation.y = c.obj.used ? -1.3 : 0; } };
}

/** 手稿架：低矮的長木架 (兩端框板、上層板放手稿捆、後側橫檔、下層板堆著散的紙疊) */
export function bundleRackModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const end = p.mesh(box(0.08, d.h - 0.06, d.d), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
    end.position.set(s * (d.w / 2 - 0.04), (d.h - 0.06) / 2, 0);
    g.add(end);
  }
  const top = p.mesh(box(d.w, 0.06, d.d), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  top.position.y = d.h - 0.03;
  const low = p.mesh(box(d.w - 0.16, 0.04, d.d - 0.1), pal.shelfDark, { outline: false });
  low.position.y = 0.16;
  const rail = p.mesh(box(d.w - 0.16, 0.06, 0.04), pal.shelfDark, { outline: false });
  rail.position.set(0, d.h - 0.2, -d.d / 2 + 0.06);
  g.add(top, low, rail);
  // 下層的紙疊 (避開正中央的暗格)
  [-0.38, -0.2, 0.2, 0.36].forEach((k, i) => {
    const sh = 0.12 + (i % 2) * 0.08;
    const stack = p.mesh(box(0.5, sh, d.d * 0.55), i % 2 ? pal.paperNote : 0xe8dcbc, { outline: false, roughness: 0.95 });
    stack.position.set(k * d.w, 0.18 + sh / 2, -0.06);
    stack.rotation.y = (i - 1.5) * 0.06;
    g.add(stack);
  });
  return { root: g };
}

/** 手稿捆：一疊紙 + 兩道繩 (紅繩 / 麻繩) 或封蠟；抽出 (used) 往前滑 */
export function bundleModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const paper = p.mesh(box(d.w, d.h, d.d), pal.paperNote);
  paper.position.y = d.h / 2;
  body.add(paper);
  const tie = d.type === 'bundle' ? d.tie : undefined;
  for (const x of [-d.w * 0.25, d.w * 0.25]) {
    const band = p.mesh(box(0.04, d.h + 0.02, d.d + 0.02), tie === 'red' ? 0xb03a2e : 0x9c8a62, { outline: false, shadow: false });
    band.position.set(x, d.h / 2, 0);
    body.add(band);
  }
  if (tie === 'wax') {
    const seal = p.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), 0x7a1f1f, { outline: false, shadow: false });
    seal.rotation.x = Math.PI / 2;
    seal.position.set(0, d.h / 2, d.d / 2 + 0.02);
    body.add(seal);
  }
  g.add(body);
  return { root: g, update: (c: ModelCtx) => { body.position.z = c.obj.used ? 0.25 : 0; } };
}
