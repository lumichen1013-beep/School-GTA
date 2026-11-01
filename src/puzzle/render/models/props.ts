import * as THREE from 'three';
import type { ObjDef } from '../../logic/types';
import type { Painter } from '../materials';
import { PAL } from '../palette';
import { crateWood, notePaper } from '../textures';
import type { PropModel } from './types';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 固定種子亂數 (書本高度 / 顏色每次一致) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** 木箱：板材紋理主體 + 深色木框 + 斜撐 + 金屬包角 + 釘頭 */
export function crateModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const body = p.mesh(box(w - 0.06, h - 0.06, dd - 0.06), 0xffffff, { map: crateWood(), flat: PAL.crate });
  body.position.y = h / 2;
  g.add(body);
  const t = 0.09;
  const frame = (bw: number, bh: number, bd: number, x: number, y: number, z: number) => {
    const m = p.mesh(box(bw, bh, bd), PAL.crateDark, { outline: false });
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame(t, h, t, sx * (w / 2 - t / 2), h / 2, sz * (dd / 2 - t / 2));
  for (const y of [t / 2, h - t / 2]) {
    for (const s of [-1, 1]) {
      frame(w, t, t, 0, y, s * (dd / 2 - t / 2));
      frame(t, t, dd, s * (w / 2 - t / 2), y, 0);
    }
  }
  // 斜撐：四個側面各一根
  const diagLen = Math.hypot(w - 2 * t, h - 2 * t);
  const ang = Math.atan2(h - 2 * t, w - 2 * t);
  for (const s of [-1, 1]) {
    const a = frame(diagLen, t * 0.9, 0.04, 0, h / 2, s * (dd / 2 + 0.005));
    a.rotation.z = s * ang;
    const b = frame(0.04, t * 0.9, Math.hypot(dd - 2 * t, h - 2 * t), s * (w / 2 + 0.005), h / 2, 0);
    b.rotation.x = s * Math.atan2(h - 2 * t, dd - 2 * t);
  }
  // 金屬包角 + 釘頭
  const cap = 0.14;
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const m = p.mesh(box(cap, cap, cap), PAL.metal, { metalness: 0.6, roughness: 0.4, outline: false });
    m.position.set(sx * (w / 2 - cap / 2 + 0.01), sy ? h - cap / 2 + 0.01 : cap / 2 - 0.01, sz * (dd / 2 - cap / 2 + 0.01));
    g.add(m);
    const nail = p.mesh(new THREE.SphereGeometry(0.018, 6, 4), PAL.iron, { outline: false, shadow: false });
    nail.position.set(sx * (w / 2 - 0.04), sy ? h - 0.04 : 0.04, sz * (dd / 2 + 0.02));
    g.add(nail);
  }
  return { root: g };
}

/** 在 [x0,x1] 排一排不同顏色的書 */
function bookRow(p: Painter, parent: THREE.Object3D, x0: number, x1: number, y: number, z: number, maxH: number, seed: number, depth = 0.26): void {
  const r = rng(seed);
  let x = x0;
  let i = 0;
  while (x < x1 - 0.05) {
    const bw = 0.06 + r() * 0.06;
    if (x + bw > x1) break;
    const bh = maxH * (0.72 + r() * 0.26);
    const color = PAL.books[(seed + i * 3 + Math.floor(r() * 3)) % PAL.books.length];
    const lean = r() < 0.08 ? 0.18 : 0;
    const b = p.mesh(box(bw, bh, depth), color, { outline: false, roughness: 0.9 });
    b.position.set(x + bw / 2, y + bh / 2, z);
    b.rotation.z = -lean;
    parent.add(b);
    if (r() < 0.5) { // 書脊上的金色細帶
      const band = p.mesh(box(bw + 0.004, 0.018, depth + 0.004), PAL.gold, { outline: false, shadow: false });
      band.position.copy(b.position);
      band.position.y += bh * 0.3;
      band.rotation.z = -lean;
      parent.add(band);
    }
    x += bw + 0.008 + (lean ? 0.06 : 0);
    i++;
  }
}

/** 書架平台：頂面與地板同高的層板，下方懸掛一座橫放的書櫃 (兩層五格，塞滿彩色書) */
export function shelfModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const top = p.mesh(box(w, h, dd), PAL.shelf, { map: crateWood(), flat: PAL.shelf });
  top.position.y = h / 2;
  g.add(top);
  const bodyH = 1.0;
  const bodyD = 0.5;
  const zf = dd / 2 - bodyD / 2;
  const back = p.mesh(box(w - 0.1, bodyH, 0.05), PAL.shelfDark);
  back.position.set(0, -bodyH / 2, zf - bodyD / 2 + 0.03);
  const bottom = p.mesh(box(w - 0.1, 0.07, bodyD), PAL.shelf);
  bottom.position.set(0, -bodyH + 0.035, zf);
  const mid = p.mesh(box(w - 0.1, 0.05, bodyD), PAL.shelf, { outline: false });
  mid.position.set(0, -bodyH / 2, zf);
  g.add(back, bottom, mid);
  const cols = 5;
  for (let i = 0; i <= cols; i++) {
    const x = -w / 2 + 0.05 + (i * (w - 0.1)) / cols;
    const post = p.mesh(box(0.07, bodyH, bodyD), PAL.shelf, { outline: i === 0 || i === cols });
    post.position.set(x, -bodyH / 2, zf);
    g.add(post);
    if (i < cols) {
      const x0 = x + 0.05;
      const x1 = x + (w - 0.1) / cols - 0.04;
      bookRow(p, g, x0, x1, -bodyH / 2 + 0.03, zf + 0.06, 0.4, i * 7 + 1);
      bookRow(p, g, x0, x1, -bodyH + 0.08, zf + 0.06, 0.38, i * 11 + 5);
    }
  }
  // 頂面前緣的飾條
  const lip = p.mesh(box(w, 0.06, 0.06), PAL.shelfDark, { outline: false });
  lip.position.set(0, h - 0.02, dd / 2 - 0.03);
  g.add(lip);
  return { root: g };
}

/** 高台：底座線腳 + 主體 (前側內凹飾板) + 頂蓋 */
export function plinthModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const shaft = p.mesh(box(w, h - 0.36, dd), PAL.plinth);
  shaft.position.y = h / 2;
  const base = p.mesh(box(w + 0.14, 0.2, dd + 0.14), PAL.plinthTrim);
  base.position.y = 0.1;
  const base2 = p.mesh(box(w + 0.06, 0.08, dd + 0.06), PAL.plinthTrim, { outline: false });
  base2.position.y = 0.24;
  const cap = p.mesh(box(w + 0.14, 0.16, dd + 0.14), PAL.plinthTrim);
  cap.position.y = h - 0.08;
  const capTop = p.mesh(box(w + 0.04, 0.02, dd + 0.04), PAL.plinthTop, { outline: false });
  capTop.position.y = h + 0.0;
  g.add(shaft, base, base2, cap, capTop);
  for (const zc of [-dd / 4, dd / 4]) {
    const panel = p.mesh(box(w + 0.02, h - 0.9, dd / 2 - 0.3), PAL.plinthTrim, { outline: false });
    panel.position.set(0, h / 2, zc);
    g.add(panel);
  }
  const front = p.mesh(box(w - 0.3, h - 0.9, 0.03), PAL.plinthTrim, { outline: false });
  front.position.set(0, h / 2, dd / 2 + 0.005);
  g.add(front);
  return { root: g };
}

/** 木欄 (僅現實)：立柱 + 橫木 + 尖頭木條 */
export function railModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const alongX = d.w >= d.d;
  const len = alongX ? d.w : d.d;
  const h = d.h;
  const place = (m: THREE.Mesh, a: number, y: number) => { if (alongX) m.position.set(a, y, 0); else m.position.set(0, y, a); g.add(m); };
  const n = Math.max(1, Math.round(len / 1.4));
  for (let i = 0; i <= n; i++) {
    const post = p.mesh(box(0.15, h, 0.15), PAL.railDark);
    place(post, -len / 2 + 0.075 + (i * (len - 0.15)) / n, h / 2);
    const knob = p.mesh(new THREE.SphereGeometry(0.1, 10, 8), PAL.railDark, { outline: false });
    place(knob, -len / 2 + 0.075 + (i * (len - 0.15)) / n, h + 0.06);
  }
  for (const y of [0.3, h * 0.55, h - 0.18]) {
    const rail = p.mesh(alongX ? box(len, 0.09, 0.08) : box(0.08, 0.09, len), PAL.rail);
    place(rail, 0, y);
  }
  for (let a = -len / 2 + 0.25; a < len / 2 - 0.15; a += 0.24) {
    const picket = p.mesh(alongX ? box(0.07, h - 0.4, 0.04) : box(0.04, h - 0.4, 0.07), PAL.rail, { outline: false });
    place(picket, a, (h - 0.4) / 2 + 0.05);
    const tip = p.mesh(new THREE.ConeGeometry(0.05, 0.12, 4), PAL.rail, { outline: false });
    place(tip, a, h - 0.29);
  }
  return { root: g };
}

/** 長桌 (僅現實)：桌面 + 桌裙 + 桌腳，上面放書堆、攤開的書、墨水瓶與紙張 */
export function tableModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const top = p.mesh(box(w, 0.09, dd), 0xf0c8a0, { map: crateWood(), flat: PAL.tableTop });
  top.position.y = h - 0.045;
  const apron = p.mesh(box(w - 0.2, 0.12, dd - 0.2), PAL.table);
  apron.position.y = h - 0.15;
  g.add(top, apron);
  const legsZ = [-dd / 2 + 0.15, -dd / 6, dd / 6, dd / 2 - 0.15];
  for (const z of legsZ) for (const s of [-1, 1]) {
    const leg = p.mesh(box(0.13, h - 0.09, 0.13), PAL.table);
    leg.position.set(s * (w / 2 - 0.15), (h - 0.09) / 2, z);
    g.add(leg);
  }
  const r = rng(42);
  for (const z of [-3.8, -0.5, 2.6]) { // 書堆
    let y = h;
    for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
      const bh = 0.07 + r() * 0.04;
      const b = p.mesh(box(0.5 + r() * 0.15, bh, 0.36 + r() * 0.08), PAL.books[Math.floor(r() * PAL.books.length)], { roughness: 0.9 });
      b.position.set(-0.6 + r() * 0.2, y + bh / 2, z + (r() - 0.5) * 0.1);
      b.rotation.y = (r() - 0.5) * 0.5;
      g.add(b);
      y += bh;
    }
  }
  for (const z of [-2, 1.2, 4]) { // 攤開的書 + 紙張
    const open = p.mesh(box(0.6, 0.03, 0.42), PAL.paperNote, { outline: false });
    open.position.set(0.5, h + 0.015, z);
    open.rotation.y = 0.2;
    const spine = p.mesh(box(0.025, 0.04, 0.42), PAL.books[1], { outline: false });
    spine.position.set(0.5, h + 0.02, z);
    spine.rotation.y = 0.2;
    const sheet = p.mesh(box(0.34, 0.006, 0.46), 0xfffaf0, { outline: false, shadow: false });
    sheet.position.set(-0.2, h + 0.003, z + 0.9);
    sheet.rotation.y = -0.4;
    g.add(open, spine, sheet);
  }
  const bottle = p.mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), PAL.inkBlue, { roughness: 0.25 });
  bottle.position.set(0.9, h + 0.08, 0.2);
  const cork = p.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), PAL.shelf, { outline: false });
  cork.position.set(0.9, h + 0.185, 0.2);
  g.add(bottle, cork);
  return { root: g };
}

/** 紙條：釘在牆上的紙 + 紅色圖釘 */
export function noteModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const paper = p.mesh(box(d.w * 0.82, d.h * 0.82, 0.02), 0xffffff, { map: notePaper(), flatMap: true });
  paper.position.y = d.h / 2;
  paper.rotation.z = 0.06;
  const pin = p.mesh(new THREE.SphereGeometry(0.05, 10, 8), PAL.pin, { outline: false });
  pin.position.set(0, d.h * 0.86, 0.04);
  g.add(paper, pin);
  return { root: g };
}
