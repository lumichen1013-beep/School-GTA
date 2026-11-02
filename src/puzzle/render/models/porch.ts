import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood, stoneBlocks } from '../textures';
import type { ModelCtx, PropModel } from './types';

// 門廊 (1-1) 的物件：鐵柵 (僅現實)、圖上的墨牆 (僅藏寶圖)、玻璃牆 (僅現實)、木板橋 (僅現實)、石階 (兩邊都有)
// 只在一邊存在的物件靠「形狀」區分 (P4)：鐵柵 = 直條 + 尖頭、玻璃 = 窗框 + 反光斜紋、木板橋 = 一片片木板、墨牆 = 墨點 + 毛邊

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 鐵柵 (僅現實)：沿長邊排列的鐵條 + 尖頭 + 三道橫檔；原點在底面中心 */
export function barsModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const alongZ = d.d >= d.w;
  const len = alongZ ? d.d : d.w;
  const h = d.h;
  const place = (m: THREE.Mesh, a: number, y: number) => { if (alongZ) m.position.set(0, y, a); else m.position.set(a, y, 0); g.add(m); };
  const iron = { metalness: 0.6, roughness: 0.45, outline: false };
  const barLen = h - 0.25;
  const n = Math.floor((len - 0.1) / 0.3);
  for (let i = 0; i <= n; i++) {
    const a = -len / 2 + 0.05 + (i * (len - 0.1)) / n;
    const bar = p.mesh(new THREE.CylinderGeometry(0.035, 0.035, barLen, 8), pal.iron, iron);
    place(bar, a, barLen / 2);
    const tip = p.mesh(new THREE.ConeGeometry(0.07, 0.25, 6), pal.iron, iron);
    place(tip, a, h - 0.125);
  }
  // 橫檔兩端內縮 1cm (不與後牆 / 前緣共面)；不落地 (底面離地，避免與地板頂面重疊)
  const railLen = len - 0.02;
  for (const y of [0.18, h * 0.5, h - 0.5]) {
    const rail = p.mesh(alongZ ? box(0.14, 0.1, railLen) : box(railLen, 0.1, 0.14), pal.metal, iron);
    place(rail, 0, y);
  }
  return { root: g };
}

/** 圖上的墨牆 (僅藏寶圖)：墨水藍的牆身 + 毛邊筆觸 + 兩排亮色墨點 (只在藏寶圖存在的符號) + 底部垂滴 */
export function inkwallModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const body = p.mesh(box(w, h, 0.3), pal.inkBlue, { emissive: pal.inkBlue, emissiveIntensity: 0.3, shadow: false });
  body.position.y = h / 2;
  g.add(body);
  // 毛邊：左右凸出的短筆觸 (高度固定錯開，形狀每次一致)
  for (const [y, s, k] of [[0.7, 1, 0.12], [1.6, -1, 0.1], [2.5, 1, 0.08], [3.3, -1, 0.13], [4.2, 1, 0.1], [5.1, -1, 0.09]]) {
    const stroke = p.mesh(box(k, 0.22, 0.26), pal.inkBlue, { shadow: false });
    stroke.position.set(s * (w / 2 + k / 2 - 0.01), y, 0);
    g.add(stroke);
  }
  const dots: THREE.Mesh[] = [];
  for (let y = 0.45; y < h - 0.2; y += 0.5) {
    for (const s of [-1, 1]) {
      const dot = p.mesh(new THREE.CircleGeometry(0.075, 14), pal.inkGlow, { outline: false, shadow: false });
      dot.position.set(s * w * 0.22, y + (s > 0 ? 0.25 : 0), 0.151);
      dots.push(dot);
      g.add(dot);
    }
  }
  for (const x of [-w * 0.3, w * 0.15]) {
    const drip = p.mesh(new THREE.SphereGeometry(0.07, 10, 8), pal.inkPurple, { outline: false, shadow: false });
    drip.scale.set(1, 1.5, 0.6);
    drip.position.set(x, 0.12, 0.16);
    g.add(drip);
  }
  // 墨點緩慢明暗 (提示這面牆是畫上去的)
  const update = (c: ModelCtx) => {
    dots.forEach((m, i) => m.scale.setScalar(0.85 + 0.15 * Math.sin(c.t * 2 + i * 0.7)));
  };
  return { root: g, update };
}

/** 玻璃牆 (僅現實)：半透明玻璃 + 木窗框 (窗台、楣框、直櫺) + 每格兩道反光斜紋 */
export function glassModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const alongX = d.w >= d.d;
  const len = (alongX ? d.w : d.d) - 0.01; // 兩端各內縮 5mm：不與相接的隔牆 / 側牆頂面、端面共面
  const h = d.h;
  const t = Math.min(d.w, d.d);
  const orient = (m: THREE.Mesh, a: number, y: number, off = 0) => {
    if (alongX) m.position.set(a, y, off); else { m.position.set(off, y, a); m.rotation.y = Math.PI / 2; }
    g.add(m);
  };
  const frame = { outline: false };
  const sill = p.mesh(box(len, 0.15, t), pal.trim, frame);
  orient(sill, 0, 0.075);
  const head = p.mesh(box(len, 0.1, t), pal.trim, frame);
  orient(head, 0, h - 0.05);
  const paneH = h - 0.25;
  const bays = Math.max(1, Math.round(len / 1.6));
  for (let i = 1; i < bays; i++) {
    const mull = p.mesh(box(0.08, paneH, t), pal.trim, frame);
    orient(mull, -len / 2 + (i * len) / bays, 0.15 + paneH / 2);
  }
  const pane = p.mesh(box(len, paneH, 0.02), pal.glass, { opacity: 0.22, roughness: 0.05, metalness: 0.1, outline: false, shadow: false });
  orient(pane, 0, 0.15 + paneH / 2);
  for (let i = 0; i < bays; i++) {
    const cx = -len / 2 + ((i + 0.5) * len) / bays;
    for (const [dx, dy, sl] of [[-0.25, 2.2, 1.3], [0.2, 3.4, 0.8]]) {
      const streak = p.mesh(box(0.06, sl, 0.004), 0xffffff, { opacity: 0.55, outline: false, shadow: false });
      streak.rotation.z = 0.6;
      orient(streak, cx + dx, dy, 0.014);
      if (!alongX) streak.rotation.set(0, Math.PI / 2, 0.6);
    }
  }
  return { root: g };
}

/** 木板橋 (僅現實)：兩根縱樑 + 一片片橫鋪的木板 (板頂 = 邏輯頂面)；原點在底面中心 */
export function plankModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  for (const s of [-1, 1]) {
    const beam = p.mesh(box(w - 0.02, 0.12, 0.14), pal.shelfDark, { outline: false });
    beam.position.set(0, 0.06, s * (dd / 2 - 0.25));
    g.add(beam);
  }
  // 木板從兩端各內縮 5cm 起排：不與相接平台 (台階頂蓋) 的頂面重疊共面
  const n = 10;
  const span = w - 0.1;
  const pw = span / n - 0.04;
  for (let i = 0; i < n; i++) {
    const plank = p.mesh(box(pw, 0.08, dd - 0.04), 0xffffff, { map: crateWood(pal), flat: pal.crate, outline: false });
    plank.position.set(-span / 2 + (i + 0.5) * (span / n), h - 0.04, 0);
    plank.rotation.y = (i % 3 - 1) * 0.015;
    g.add(plank);
  }
  return { root: g };
}

/** 石階 / 台階 (兩邊都有)：砌石主體 + 淺色頂蓋 (頂蓋頂面 = 邏輯頂面，主體頂面在其下，不共面) */
export function stoneModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const capH = Math.min(0.1, h / 4);
  const body = p.mesh(box(w, h - capH, dd), 0xffffff, { map: stoneBlocks(pal, Math.max(1, w / 2), Math.max(1, (h - capH) / 0.9)), flat: pal.stone });
  body.position.y = (h - capH) / 2;
  const cap = p.mesh(box(w + 0.03, capH, dd + 0.03), pal.stoneTop, { flat: pal.stoneTop });
  cap.position.y = h - capH / 2;
  g.add(body, cap);
  return { root: g };
}
