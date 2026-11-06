import * as THREE from 'three';
import { glowSprite } from '../materials';
import { mergeParts, placed } from '../geometry';
import { crateWood, glow } from '../textures';
import { WALL_H } from './room';
import { num } from './fields';
import type { DecorFactory } from './types';

// 根窖書庫 (第四章；story-bible 8.4、規格 6「第四章共用規則」地下室主題) 的裝飾：天花板垂下的粗根、盤滿石壁的根、沿牆的銅管與閥、
// 鑄鐵墨爐、墨槽、鐵架、檔案櫃與抽屜牆、長桌、書桌、封條、積水、吊在根上的油燈、井口與石欄、往上的石階 / 木梯、木箱堆、兩排一模一樣的書架。
// 純呈現 (不進碰撞、不可互動)，只在實景 (藏寶圖只畫和謎題有關的東西)；同材質零件合成一個網格以省繪製次數 (擺設規則 ①、物件外觀規則 ⑤)；
// 重複的面板 (檔案櫃抽屜、書架的書) 用 InstancedMesh。比例以玩家身高約 1.7 為準

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const part = placed;
const merge = mergeParts;

/** 固定種子亂數 (每次外觀一致) */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const ROOT = 0x5a4636;
const ROOT_DARK = 0x463628;
const MOSS = 0x6f8a4a;
const IRON = 0x34322f;
const COPPER = 0x9a5c38;
const INK_GLOW = 0x3d63c8;
const FILE_GREEN = 0x55604f;

/** 一段根 (Catmull-Rom 管)；回傳幾何 (合併用) */
function rootTube(pts: THREE.Vector3[], r: number): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 6, false);
}

/**
 * rootCeiling：天花板 (牆頂 y ≈ 5.6) 沿 x 垂下的粗根——幾條主根橫過、每條垂下兩三條細根到 3 m 左右 (玩家頭上，不擋視線)；
 * 欄位 x (中心)、w (跨幅)、seed。一個網格 (根) + 一個網格 (苔)
 */
export const rootCeilingDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), w = num(item, 'w');
  const b = level.bounds;
  const roots: THREE.BufferGeometry[] = [];
  const moss: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(w / 6));
  for (let i = 0; i < n; i++) {
    const xa = x0 - w / 2 + (i + 0.2 + r() * 0.6) * (w / n);
    const z = b.minZ + 1.2 + r() * 4.5;
    const top = 5.4 + r() * 0.3;
    const main = [new THREE.Vector3(xa - 2.4, top, z - 0.8), new THREE.Vector3(xa - 0.8, top - 0.25, z), new THREE.Vector3(xa + 0.9, top - 0.15, z + 0.5), new THREE.Vector3(xa + 2.6, top + 0.1, z + 0.2)];
    roots.push(rootTube(main, 0.11 + r() * 0.05));
    for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
      const hx = xa - 1.6 + k * 1.4 + r() * 0.4;
      const low = 3.0 + r() * 0.9;
      roots.push(rootTube([new THREE.Vector3(hx, top - 0.1, z), new THREE.Vector3(hx + (r() - 0.5) * 0.3, (top + low) / 2, z + (r() - 0.5) * 0.3), new THREE.Vector3(hx + (r() - 0.5) * 0.4, low, z + (r() - 0.5) * 0.4)], 0.03 + r() * 0.025));
      moss.push(part(new THREE.SphereGeometry(0.08 + r() * 0.04, 6, 4), hx, top - 0.18, z));
    }
  }
  const g = new THREE.Group();
  g.add(p.mesh(merge(roots), ROOT, { outline: false, roughness: 0.95, shadow: false }));
  g.add(p.mesh(merge(moss), MOSS, { outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/** rootWall：後牆上盤繞的粗根 (爬滿石壁，從牆頂往下鑽進地板)；欄位 x、w、seed */
export const rootWallDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), w = num(item, 'w');
  const z = level.bounds.minZ + 0.18;
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(3, Math.round(w / 2));
  for (let i = 0; i < n; i++) {
    const x = x0 - w / 2 + (i + 0.5) * (w / n) + (r() - 0.5) * 0.6;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) pts.push(new THREE.Vector3(x + Math.sin(k * 1.3 + i) * 0.5, WALL_H - 0.2 - k * ((WALL_H - 0.1) / 5), z + Math.cos(k + i) * 0.08));
    parts.push(rootTube(pts, 0.07 + r() * 0.06));
  }
  const m = p.mesh(merge(parts), ROOT_DARK, { outline: false, roughness: 0.95, shadow: false });
  return { root: m, only3d: [m] };
};

/** rootKnot：纏住年輪根盤的樹根 (從後牆鑽出、繞過盤座兩圈鑽進地板)；欄位 x、z */
export const rootKnotDecor: DecorFactory = (p, item) => {
  const x = num(item, 'x'), z = num(item, 'z');
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const pts: THREE.Vector3[] = [new THREE.Vector3(x - 0.6 + i * 0.5, 3.2 - i * 0.3, z - 1.2)];
    for (let k = 0; k <= 8; k++) { const a = k * 0.85 + i; pts.push(new THREE.Vector3(x + Math.cos(a) * (0.95 - k * 0.03), 1.0 - k * 0.11, z + Math.sin(a) * 0.62)); }
    pts.push(new THREE.Vector3(x + 0.9 - i * 0.6, 0.02, z + 0.9));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.07 + i * 0.015, 6, false));
  }
  const m = p.mesh(merge(parts), ROOT, { outline: false, roughness: 0.95 });
  return { root: m, only3d: [m] };
};

/** wallPipes：沿後牆的銅管 (兩條水平管 + 幾段垂直管 + 閥輪)；欄位 x、w、y (上管高)、seed */
export const wallPipesDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), w = num(item, 'w'), y = num(item, 'y', 2.6);
  const z = level.bounds.minZ + 0.22;
  const pipes: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];
  for (const [yy, rad] of [[y, 0.07], [y - 0.42, 0.05]] as const) {
    const g = new THREE.CylinderGeometry(rad, rad, w, 10);
    g.rotateZ(Math.PI / 2);
    pipes.push(part(g, x0, yy, z));
  }
  for (let x = x0 - w / 2 + 1.5; x < x0 + w / 2 - 1; x += 3 + r() * 2.5) {
    pipes.push(part(new THREE.CylinderGeometry(0.05, 0.05, y - 0.4, 8), x, (y - 0.4) / 2 + 0.2, z));
    iron.push(part(box(0.2, 0.08, 0.2), x, y, z), part(box(0.16, 0.06, 0.16), x, y - 0.42, z));
    if (r() < 0.55) {
      const wheel = new THREE.TorusGeometry(0.14, 0.022, 6, 14);
      iron.push(part(wheel, x, 1.3, z + 0.12));
      iron.push(part(box(0.26, 0.02, 0.02), x, 1.3, z + 0.12), part(box(0.02, 0.26, 0.02), x, 1.3, z + 0.12));
    }
  }
  const g = new THREE.Group();
  g.add(p.mesh(merge(pipes), COPPER, { metalness: 0.6, roughness: 0.45, outline: false }));
  g.add(p.mesh(merge(iron), IRON, { metalness: 0.5, roughness: 0.6, outline: false }));
  return { root: g, only3d: [g] };
};

/** inkFurnace：鑄鐵墨爐 (圓肚爐身、爐腳、往天花板的煙管、爐口暗藍光緩緩呼吸)；欄位 x、z */
export const inkFurnaceDecor: DecorFactory = (p, item, { still }) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  const body = [
    part(new THREE.CylinderGeometry(0.9, 1.0, 1.6, 18), 0, 1.0, 0),
    part(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.8, 0),
    part(new THREE.CylinderGeometry(0.16, 0.16, 3.6, 10), 0.3, 4.2, -0.2)
  ];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; body.push(part(box(0.14, 0.3, 0.14), Math.cos(a) * 0.75, 0.15, Math.sin(a) * 0.75)); }
  g.add(p.mesh(merge(body), IRON, { metalness: 0.55, roughness: 0.55 }));
  const bands = [part(new THREE.TorusGeometry(0.97, 0.03, 6, 24), 0, 0.55, 0, Math.PI / 2), part(new THREE.TorusGeometry(0.92, 0.03, 6, 24), 0, 1.75, 0, Math.PI / 2)];
  g.add(p.mesh(merge(bands), COPPER, { metalness: 0.6, roughness: 0.4, outline: false }));
  const mouth = p.mesh(new THREE.CircleGeometry(0.34, 18), INK_GLOW, { emissive: INK_GLOW, emissiveIntensity: 0.9, outline: false, shadow: false });
  mouth.position.set(0, 1.0, 0.99);
  const halo = glowSprite(glow(), INK_GLOW, 2.2, 0.35, true);
  halo.position.set(0, 1.0, 1.15);
  g.add(mouth, halo);
  return { root: g, only3d: [g], update: (t: number) => { if (!still) halo.material.opacity = 0.3 + 0.08 * Math.sin(t * 0.9); } };
};

/** inkTrough：地上的長墨槽 (石槽 + 槽裡的墨面，微微發光)；欄位 x、z、w、rot */
export const inkTroughDecor: DecorFactory = (p, item) => {
  const w = num(item, 'w', 3);
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  const stone = [part(box(w, 0.12, 0.8), 0, 0.06, 0), part(box(w, 0.4, 0.1), 0, 0.3, 0.35), part(box(w, 0.4, 0.1), 0, 0.3, -0.35), part(box(0.1, 0.4, 0.8), -w / 2, 0.3, 0), part(box(0.1, 0.4, 0.8), w / 2, 0.3, 0)];
  g.add(p.mesh(merge(stone), 0x5e5750, { roughness: 0.95 }));
  const ink = p.mesh(new THREE.PlaneGeometry(w - 0.12, 0.58), 0x1c2a52, { emissive: INK_GLOW, emissiveIntensity: 0.25, outline: false, shadow: false });
  ink.rotation.x = -Math.PI / 2;
  ink.position.y = 0.42;
  g.add(ink);
  return { root: g, only3d: [g] };
};

/** ironRack：靠後牆的鐵架 (三層，擺著墨瓶與捲起的圖)；欄位 x、z、w */
export const ironRackDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const w = num(item, 'w', 2);
  const r = rng(Math.round(num(item, 'x') * 7 + 31));
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  const frame: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(part(box(0.05, 2.0, 0.05), sx * (w / 2 - 0.03), 1.0, sz * 0.25));
  for (const y of [0.3, 0.95, 1.6]) frame.push(part(box(w, 0.04, 0.55), 0, y, 0));
  g.add(p.mesh(merge(frame), IRON, { metalness: 0.5, roughness: 0.6 }));
  const bottles: THREE.BufferGeometry[] = [];
  const rolls: THREE.BufferGeometry[] = [];
  for (const y of [0.32, 0.97, 1.62]) {
    for (let x = -w / 2 + 0.2; x < w / 2 - 0.15; x += 0.22 + r() * 0.2) {
      if (r() < 0.55) bottles.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 8), x, y + 0.1, (r() - 0.5) * 0.2));
      else { const c = new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8); c.rotateX(Math.PI / 2); rolls.push(part(c, x, y + 0.05, 0)); }
    }
  }
  if (bottles.length) g.add(p.mesh(merge(bottles), 0x23305a, { emissive: INK_GLOW, emissiveIntensity: 0.15, outline: false, roughness: 0.3 }));
  if (rolls.length) g.add(p.mesh(merge(rolls), pal.paperNote, { outline: false }));
  return { root: g, only3d: [g] };
};

/** cabinets：一排鐵皮檔案櫃 (n 座，每座四個抽屜；抽屜面板 = InstancedMesh)；欄位 x、z、n、rot、seed */
export const cabinetsDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const n = num(item, 'n', 2);
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  const W = 0.62, H = 1.5, D = 0.6;
  const bodies: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) bodies.push(part(box(W, H, D), (i - (n - 1) / 2) * (W + 0.04), H / 2, 0));
  g.add(p.mesh(merge(bodies), FILE_GREEN, { metalness: 0.35, roughness: 0.6 }));
  // 抽屜面板與把手 (每座四格)：InstancedMesh 兩個
  const front = p.mesh(box(W - 0.08, H / 4 - 0.06, 0.02), 0x66705e, { metalness: 0.35, roughness: 0.55, outline: false });
  const handle = p.mesh(box(0.18, 0.03, 0.03), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false });
  const fronts = new THREE.InstancedMesh(front.geometry, front.material as THREE.Material, n * 4);
  const handles = new THREE.InstancedMesh(handle.geometry, handle.material as THREE.Material, n * 4);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const x = (i - (n - 1) / 2) * (W + 0.04), y = H / 8 + (k * H) / 4;
    fronts.setMatrixAt(i * 4 + k, m4.makeTranslation(x, y, D / 2 + 0.01));
    handles.setMatrixAt(i * 4 + k, m4.makeTranslation(x, y + 0.05, D / 2 + 0.035));
  }
  g.add(fronts, handles);
  return { root: g, only3d: [g] };
};

/** drawerWall：後牆整面的鐵皮小抽屜 (格線 + 每格一個小銅把手 = InstancedMesh；樹根貼著抽屜牆垂下)；欄位 x、w、h、seed */
export const drawerWallDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const w = num(item, 'w'), h = num(item, 'h', 3);
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, level.bounds.minZ + 0.32);
  g.add(p.mesh(merge([part(box(w, h, 0.5), 0, h / 2, 0)]), FILE_GREEN, { metalness: 0.3, roughness: 0.65 }));
  const cols = Math.round(w / 0.45), rows = Math.round(h / 0.36);
  const cw = w / cols, ch = h / rows;
  const front = p.mesh(box(cw - 0.05, ch - 0.05, 0.02), 0x66705e, { metalness: 0.3, roughness: 0.55, outline: false });
  const handle = p.mesh(box(0.1, 0.025, 0.025), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false });
  const fronts = new THREE.InstancedMesh(front.geometry, front.material as THREE.Material, cols * rows);
  const handles = new THREE.InstancedMesh(handle.geometry, handle.material as THREE.Material, cols * rows);
  const m4 = new THREE.Matrix4();
  let i = 0;
  for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++, i++) {
    const x = -w / 2 + (c + 0.5) * cw, y = (k + 0.5) * ch;
    fronts.setMatrixAt(i, m4.makeTranslation(x, y, 0.26));
    handles.setMatrixAt(i, m4.makeTranslation(x, y, 0.285));
  }
  g.add(fronts, handles);
  return { root: g, only3d: [g] };
};

/** longTable：長桌 (桌面 + 四腳 + 桌上幾疊文件)；欄位 x、z、w、rot */
export const longTableDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const w = num(item, 'w', 3);
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  const wood = [part(box(w, 0.08, 1.0), 0, 0.82, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(part(box(0.08, 0.78, 0.08), sx * (w / 2 - 0.12), 0.39, sz * 0.38));
  g.add(p.mesh(merge(wood), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark }));
  const papers = [part(box(0.42, 0.06, 0.3), -w * 0.25, 0.89, 0.1), part(box(0.38, 0.1, 0.28), w * 0.1, 0.91, -0.15), part(box(0.4, 0.04, 0.32), w * 0.3, 0.88, 0.12)];
  g.add(p.mesh(merge(papers), pal.paperNote, { outline: false }));
  return { root: g, only3d: [g] };
};

/** desk：爸爸的書桌 (桌面、一側三個抽屜、桌上的檯燈與一疊筆記)；欄位 x、z、rot (π = 面向後牆) */
export const deskDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  const wood = [part(box(1.6, 0.07, 0.8), 0, 0.76, 0), part(box(0.5, 0.72, 0.74), 0.52, 0.36, 0), part(box(0.06, 0.72, 0.7), -0.74, 0.36, 0)];
  g.add(p.mesh(merge(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf }));
  const knobs = [0.18, 0.4, 0.62].map(y => part(box(0.12, 0.025, 0.03), 0.52, y, -0.39));
  g.add(p.mesh(merge(knobs), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false }));
  g.add(p.mesh(merge([part(box(0.5, 0.05, 0.36), -0.2, 0.82, 0.05)]), pal.paperNote, { outline: false }));
  const lamp = p.mesh(merge([part(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 10), -0.55, 0.81, -0.2), part(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), -0.55, 1.0, -0.2), part(new THREE.CylinderGeometry(0.06, 0.13, 0.12, 12, 1, true), -0.55, 1.2, -0.2)]), pal.lampShade, { outline: false });
  g.add(lamp);
  return { root: g, only3d: [g] };
};

/** seals：散落的封條 (一疊撕開的紙條與幾個火漆)；欄位 x、z、seed */
export const sealsDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const r = rng(num(item, 'seed', 1));
  const strips: THREE.BufferGeometry[] = [];
  const wax: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    strips.push(part(box(0.5, 0.008, 0.09), (r() - 0.5) * 1.4, 0.006 + i * 0.002, (r() - 0.5) * 0.9, 0, r() * Math.PI, 0));
    if (i % 2 === 0) wax.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), (r() - 0.5) * 1.4, 0.016 + i * 0.001, (r() - 0.5) * 0.9));
  }
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.add(p.mesh(merge(strips), pal.paperNote, { outline: false, shadow: false }));
  g.add(p.mesh(merge(wax), pal.sealInk, { outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/** puddle：地上的一攤積水 (深色、微反光，一圈很淡的漣漪)；欄位 x、z、w、d */
export const puddleDecor: DecorFactory = (p, item, { still }) => {
  const w = num(item, 'w', 1.5), d = num(item, 'd', 1);
  const geo = new THREE.CircleGeometry(0.5, 24);
  geo.scale(w, d, 1);
  const water = p.mesh(geo, 0x2a3036, { metalness: 0.2, roughness: 0.08, opacity: 0.85, outline: false, shadow: false, unique: true });
  water.rotation.x = -Math.PI / 2;
  water.position.set(num(item, 'x'), 0.008, num(item, 'z'));
  const ring = p.mesh(new THREE.RingGeometry(0.18, 0.2, 24), 0x8fa0b0, { opacity: 0.25, outline: false, shadow: false, unique: true });
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(num(item, 'x') + w * 0.12, 0.012, num(item, 'z'));
  const g = new THREE.Group();
  g.add(water, ring);
  return {
    root: g, only3d: [g],
    update: (t: number) => { if (still) return; const k = (t * 0.25) % 1; ring.scale.setScalar(1 + k * 2.2); (ring.material as THREE.MeshStandardMaterial).opacity = 0.25 * (1 - k); }
  };
};

/** lantern：吊在根上的油燈 (鐵框 + 玻璃燈罩 + 火光光暈；吊繩到天花板)；欄位 x、y (燈中心高)、z */
export const lanternDecor: DecorFactory = (p, item, { theme: { pal }, nth, still }) => {
  const g = new THREE.Group();
  const y = num(item, 'y', 3.4);
  g.position.set(num(item, 'x'), y, num(item, 'z'));
  const frame = [part(box(0.26, 0.03, 0.26), 0, 0.2, 0), part(box(0.22, 0.03, 0.22), 0, -0.2, 0), part(new THREE.CylinderGeometry(0.008, 0.008, WALL_H - y, 4), 0, (WALL_H - y) / 2 + 0.2, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(part(box(0.025, 0.4, 0.025), sx * 0.11, 0, sz * 0.11));
  g.add(p.mesh(merge(frame), IRON, { metalness: 0.5, roughness: 0.6, outline: false }));
  const glass = p.mesh(box(0.2, 0.36, 0.2), pal.lampBulb, { emissive: pal.lampLight, emissiveIntensity: 0.7, opacity: 0.75, outline: false, shadow: false });
  const halo = glowSprite(glow(), pal.lampLight, 1.6, 0.4, true);
  g.add(glass, halo);
  return { root: g, only3d: [g], update: (t: number) => { if (!still) halo.material.opacity = 0.36 + 0.05 * Math.sin(t * 1.3 + nth * 2.1); } };
};

/** wellMouth：根井的井口 (地上的石圈 + 往下的黑洞 + 根盤成的梯子頂端)；欄位 x、z */
export const wellMouthDecor: DecorFactory = (p, item) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  const ring = p.mesh(new THREE.TorusGeometry(1.0, 0.16, 8, 24), 0x6b6258, { roughness: 0.95 });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  const hole = p.mesh(new THREE.CircleGeometry(0.9, 24), 0x0c0b0a, { outline: false, shadow: false });
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.006;
  const rungs = merge([0, 1, 2].map(i => part(box(0.7, 0.05, 0.08), 0, 0.02 - i * 0.02, -0.4 + i * 0.3)));
  g.add(ring, hole, p.mesh(rungs, ROOT, { outline: false }));
  return { root: g, only3d: [g] };
};

/** stoneRail：石欄 (矮石牆 + 頂石)；欄位 x、z、w */
export const stoneRailDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const w = num(item, 'w', 3);
  const m = p.mesh(merge([part(box(w, 0.7, 0.35), 0, 0.35, 0), part(box(w + 0.1, 0.1, 0.45), 0, 0.75, 0)]), pal.stone, { roughness: 0.95 });
  m.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/** greenhouseStair：通往溫室的石階 (沿後牆往上，入口北門的後面)；欄位 x、z */
export const greenhouseStairDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const steps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) steps.push(part(box(1.6, 0.22, 0.5), 0, 0.11 + i * 0.22, 0.6 - i * 0.28));
  const m = p.mesh(merge(steps), pal.stone, { roughness: 0.95 });
  m.position.set(num(item, 'x') + 2.0, 0, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/** atticStair：往上的木梯 (章門旁，靠前景；往閣樓)；欄位 x、z */
export const atticStairDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const parts: THREE.BufferGeometry[] = [part(box(0.08, 3.4, 0.08), -0.45, 1.7, 0, 0.25), part(box(0.08, 3.4, 0.08), 0.45, 1.7, 0, 0.25)];
  for (let i = 0; i < 8; i++) parts.push(part(box(0.9, 0.05, 0.12), 0, 0.3 + i * 0.4, -i * 0.1));
  const m = p.mesh(merge(parts), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  m.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/** crateStack：木箱堆 (三個大小不一的箱子疊放)；欄位 x、z、seed */
export const crateStackDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const r = rng(num(item, 'seed', 1));
  const parts = [part(box(0.8, 0.6, 0.7), 0, 0.3, 0, 0, r() * 0.3, 0), part(box(0.7, 0.55, 0.6), 0.75, 0.275, 0.1, 0, -r() * 0.3, 0), part(box(0.6, 0.45, 0.55), 0.3, 0.825, 0.05, 0, r() * 0.4, 0)];
  const m = p.mesh(merge(parts), pal.crate, { map: crateWood(pal), flat: pal.crate });
  m.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/**
 * shelfRow：靠後牆一排一模一樣的書架 (n 座並排；同一個 seed = 書的排法完全一樣——「排得太整齊了」)：
 * 書架框一個網格、書 = 一個 InstancedMesh (每座的書位置相同)；欄位 x (中心)、z、n、seed
 */
export const shelfRowDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const n = num(item, 'n', 3);
  const r = rng(num(item, 'seed', 1));
  const W = 1.6, H = 2.6, D = 0.42;
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  const frame: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (W + 0.06);
    frame.push(part(box(0.06, H, D), x - W / 2, H / 2, 0), part(box(0.06, H, D), x + W / 2, H / 2, 0), part(box(W, 0.05, D), x, H, 0), part(box(W, H, 0.03), x, H / 2, -D / 2 + 0.015));
    for (const y of [0.05, 0.7, 1.35, 1.95]) frame.push(part(box(W, 0.04, D), x, y, 0));
  }
  g.add(p.mesh(merge(frame), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark }));
  // 一座書架上的書 (位置)；每座照抄
  const slots: Array<[number, number, number, number]> = [];
  for (const y of [0.07, 0.72, 1.37]) {
    let bx = -W / 2 + 0.08;
    while (bx < W / 2 - 0.12) { const bw = 0.07 + r() * 0.05, bh = 0.42 + r() * 0.16; slots.push([bx + bw / 2, y + bh / 2, bw, bh]); bx += bw + 0.012; }
  }
  const book = p.mesh(box(1, 1, 0.3), pal.books[1], { outline: false });
  const books = new THREE.InstancedMesh(book.geometry, book.material as THREE.Material, slots.length * n);
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x0 = (i - (n - 1) / 2) * (W + 0.06);
    for (const [x, y, bw, bh] of slots) { books.setMatrixAt(k++, m4.makeTranslation(x0 + x, y, 0.02).multiply(sc.makeScale(bw, bh, 1))); }
  }
  g.add(books);
  return { root: g, only3d: [g] };
};
