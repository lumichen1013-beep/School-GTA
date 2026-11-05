import * as THREE from 'three';
import { glowSprite } from '../materials';
import { glow } from '../textures';
import { buildBookcase } from '../library';
import { mergeParts, placed } from '../geometry';
import { num, str } from './fields';
import { drawingTexture } from '../models/manuscripts';
import type { DecorFactory } from './types';

// 森林圖書館 (第二章；story-bible 8.1 / 8.4) 的裝飾：穿牆的樹根、彩繪玻璃透進來的森林綠光、半浮的書、靠牆的書櫃。
// 純呈現 (不進碰撞、不可互動)；樹根 / 光 / 浮書只在實景 (圖紙裡不像平台，也不遮謎題物件)

/** 固定種子亂數 (每次外觀一致) */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * roots：從側牆縫鑽出來、沿牆角爬到地板的樹根 (只在實景)；欄位 x (牆的位置)、side ('W' | 'E'：根往房內長的方向反向)、seed
 */
export const rootsDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const g = new THREE.Group();
  const r = rng(num(item, 'seed', 1));
  const inward = item.side === 'E' ? -1 : 1;
  const x0 = num(item, 'x');
  const b = level.bounds;
  for (let i = 0; i < 4; i++) {
    const z = b.minZ + 0.4 + r() * (b.maxZ - b.minZ - 1.2);
    const y = 1.2 + r() * 3.6;
    const pts = [
      new THREE.Vector3(x0, y, z),
      new THREE.Vector3(x0 + inward * (0.15 + r() * 0.25), y * 0.6, z + (r() - 0.5) * 0.8),
      new THREE.Vector3(x0 + inward * (0.3 + r() * 0.5), 0.05 + r() * 0.08, z + (r() - 0.5) * 1.2),
      new THREE.Vector3(x0 + inward * (0.6 + r() * 0.9), 0.04, z + (r() - 0.5) * 1.4)
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = p.mesh(new THREE.TubeGeometry(curve, 18, 0.06 + r() * 0.07, 7, false), i % 2 ? pal.wallMotif : 0x5a4636, { outline: false, roughness: 0.95 });
    g.add(tube);
    // 苔蘚：根上幾顆苔綠的小團
    for (let k = 0; k < 3; k++) {
      const at = curve.getPoint(0.25 + k * 0.25);
      const moss = p.mesh(new THREE.SphereGeometry(0.09 + r() * 0.05, 7, 5), 0x7a9a4a, { outline: false, shadow: false });
      moss.position.copy(at);
      moss.rotation.set(r(), r(), r());
      g.add(moss);
    }
  }
  return { root: g, only3d: [g] };
};

/**
 * stainedGlass：彩繪玻璃透進來的森林綠 / 琥珀光，落在地板上的光斑與一道斜光 (只在實景；半透明、不寫深度)；欄位 x、z (光斑中心)
 */
export const stainedGlassDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const x = num(item, 'x');
  const z = num(item, 'z');
  const colors = [0x3e8a5a, 0xd9a441, 0x3e8a5a, 0x6aa84f];
  colors.forEach((c, i) => {
    const patch = p.mesh(new THREE.PlaneGeometry(0.9, 0.9), c, { opacity: 0.22, emissive: c, emissiveIntensity: 0.35, outline: false, shadow: false, unique: true });
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = 0.35;
    patch.position.set(x + (i % 2) * 0.95 - 0.45, 0.011 + i * 0.001, z + Math.floor(i / 2) * 0.95 - 0.45);
    g.add(patch);
  });
  const shaft = p.mesh(new THREE.PlaneGeometry(1.9, 6.2), 0x9fe3d0, { opacity: 0.07, outline: false, shadow: false, side: THREE.DoubleSide, unique: true });
  shaft.position.set(x - 1.6, 3.1, z - 0.2);
  shaft.rotation.set(0, 0.5, 0.45);
  const halo = glowSprite(glow(), pal.lampLight, 2.4, 0.12, true);
  halo.position.set(x, 0.3, z);
  g.add(shaft, halo);
  return { root: g, only3d: [g], update: t => { (shaft.material as THREE.Material).opacity = 0.06 + 0.015 * Math.sin(t * 0.7); } };
};

/**
 * floatBooks：半浮在空中的書與羊皮紙 (2～4 cm 緩慢上下浮動；只在實景、不擋路；減弱動態時靜止，story-bible 8.3)；欄位 x、y、z (中心)、w (散布寬)、seed
 */
export const floatBooksDecor: DecorFactory = (p, item, { theme: { pal }, still }) => {
  const g = new THREE.Group();
  const r = rng(num(item, 'seed', 3));
  const cx = num(item, 'x'), cy = num(item, 'y'), cz = num(item, 'z'), w = num(item, 'w', 6);
  const items: Array<{ m: THREE.Object3D; y: number; ph: number }> = [];
  for (let i = 0; i < 7; i++) {
    const parchment = i % 3 === 2;
    const m = parchment
      ? p.mesh(new THREE.PlaneGeometry(0.38, 0.5), pal.paperNote, { outline: false, side: THREE.DoubleSide, shadow: false })
      : p.mesh(new THREE.BoxGeometry(0.34, 0.07, 0.26), pal.books[i % pal.books.length], { outline: false });
    const y = cy + (r() - 0.5) * 1.2;
    m.position.set(cx + (r() - 0.5) * w, y, cz + (r() - 0.5) * 1.6);
    m.rotation.set(0.2 + r() * 0.5, r() * Math.PI, 0.15 + r() * 0.4);
    g.add(m);
    items.push({ m, y, ph: r() * Math.PI * 2 });
  }
  if (still) return { root: g, only3d: [g] };
  return { root: g, only3d: [g], update: t => { for (const it of items) it.m.position.y = it.y + 0.03 * Math.sin(t * 0.8 + it.ph); } };
};

/**
 * bookcase：靠後牆的高書櫃 (書背朝外；圖紙裡是淡色背景、不像平台)；欄位 x (中心)、w、seed
 */
export const bookcaseDecor: DecorFactory = (p, item, { level, theme: { pal, room2d } }) => {
  const d = 0.4;
  const bc = buildBookcase(p, pal, { w: num(item, 'w'), h: 5.4, d, seed: num(item, 'seed', 0), pale: { board: room2d.trim, row: room2d.wainscot } });
  bc.root.position.set(num(item, 'x'), 0, level.bounds.minZ + 0.13 + d / 2);
  return { root: bc.root };
};

/**
 * floorPiece：地板上畫著的老宅立面圖的一角 (2-4a；只在現實——藏寶圖改看展開圖格子裡的同一角)；
 * 欄位 x、z (中心)、w (邊長)、px / py (這一角在整張圖上的格)、drawing (整張圖的折線，content/levels/ch2/drawing)
 */
export const floorPieceDecor: DecorFactory = (p, item) => {
  const w = num(item, 'w', 2.6);
  const map = drawingTexture(str(item, 'drawing'), num(item, 'px'), num(item, 'py'), 1, 1, 256, '#eadcb8', '#2c2016');
  const m = p.mesh(new THREE.PlaneGeometry(w, w), 0xffffff, { map, flatMap: true, outline: false, shadow: false, unique: true });
  m.rotation.x = -Math.PI / 2;
  m.position.set(num(item, 'x'), 0.009, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/**
 * wallTopBooks：書牆頂的裝飾書 (H1 夾層；規格 9.1 D 手法「書櫃後的書櫃在切換後多一層」做在書牆頂)：三層，每次從藏寶圖切回實景多一層、最多三層；
 * 減弱緊張效果 (calm) 時不出現；純裝飾、只在實景。欄位 x、z (書牆中心)、y (書牆頂)、w (書牆寬)、seed。每層一個合併網格 (一種書色)
 */
export const wallTopBooksDecor: DecorFactory = (p, item, { theme: { pal }, calm }) => {
  const g = new THREE.Group();
  const r = rng(num(item, 'seed', 91));
  const W = num(item, 'w'), Y = num(item, 'y');
  const layers = [0, 1, 2].map(i => {
    const parts: THREE.BufferGeometry[] = [];
    for (let x = -W / 2 + 0.3 + i * 0.37; x < W / 2 - 0.3; x += 0.9 + r() * 0.5) {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const bh = 0.2 + r() * 0.14, bw = 0.05 + r() * 0.03;
        parts.push(placed(new THREE.BoxGeometry(bw, bh, 0.12 + r() * 0.02), x + k * 0.075, Y + bh / 2 + 0.002, -0.17 + i * 0.17 + (r() - 0.5) * 0.01, 0, (r() - 0.5) * 0.2, k === n - 1 ? 0.18 : 0));
      }
    }
    const m = p.mesh(mergeParts(parts), pal.books[(i * 2 + 1) % pal.books.length], { roughness: 0.9, outline: false, unique: true });
    m.visible = false;
    g.add(m);
    return m;
  });
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  let shown = 0;
  let last: boolean | null = null;
  const update = (_t: number, is2d: boolean) => {
    if (last === true && !is2d) shown = Math.min(layers.length, shown + 1);
    last = is2d;
    layers.forEach((m, i) => { m.visible = !calm && i < shown; });
  };
  return { root: g, only3d: [g], occluders: layers, update };
};
