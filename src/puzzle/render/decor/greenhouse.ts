import * as THREE from 'three';
import { glowSprite } from '../materials';
import { mergeParts, placed } from '../geometry';
import { crateWood, glow } from '../textures';
import { num } from './fields';
import type { DecorFactory } from './types';

// 彩繪玻璃溫室 (第三章；story-bible 8.1 / 8.4) 的裝飾：牆上的彩繪玻璃窗、育苗床、陶盆、靠牆的育苗架、螢光蕨、長椅、稜鏡吊飾。
// 純呈現 (不進碰撞、不可互動)，只在實景 (藏寶圖只畫和謎題有關的東西)；同材質零件合成一個網格以省繪製次數 (擺設規則 ①、物件外觀規則 ⑤)。
// 比例以玩家身高約 1.7 為準：育苗床高 0.5、長椅座 0.45、育苗架兩層 0.7 / 1.4

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const part = placed;
const merge = mergeParts;

/** 固定種子亂數 (每次外觀一致) */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** 彩繪玻璃的色 (森林綠 / 琥珀 / 嫩綠 / 淡青；story-bible 8.2) */
const GLASS = [0x3e8a5a, 0xd9a441, 0x6aa84f, 0x9fe3d0] as const;
const LEAF = 0x5f8a3a;
const LEAF_DARK = 0x46703a;
const SOIL = 0x3b2a1e;

/** 一株植物 (幾片葉子 = 壓扁的球 + 一根莖)：回傳幾何零件 (合併用) */
function plant(r: () => number, x: number, y: number, z: number, s: number, fern: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  if (fern) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.4;
      out.push(part(new THREE.ConeGeometry(0.07 * s, 0.55 * s, 4), x + Math.cos(a) * 0.12 * s, y + 0.22 * s, z + Math.sin(a) * 0.12 * s, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7));
    }
    return out;
  }
  out.push(part(new THREE.CylinderGeometry(0.015 * s, 0.02 * s, 0.3 * s, 5), x, y + 0.15 * s, z));
  for (let i = 0; i < 3; i++) {
    const leafG = new THREE.SphereGeometry(0.11 * s, 7, 5);
    leafG.scale(1, 0.55, 0.8);
    out.push(part(leafG, x + (r() - 0.5) * 0.16 * s, y + (0.26 + r() * 0.14) * s, z + (r() - 0.5) * 0.16 * s, 0, r() * Math.PI, 0));
  }
  return out;
}

/**
 * glassPane：牆上的彩繪玻璃窗 (鐵框 + 色玻璃格 + 窗外的暗綠 + 框上的一條藤)；欄位 side (N 後牆 / W 左牆 / E 右牆)、at (後牆 = 窗中心 x；側牆 = 窗中心 z)、
 * y (窗中心高)、w、h、cols、rows、missing (缺的格「行,列;行,列」：只剩鐵框，例 3-4 的九格花窗缺三片)、seed
 */
export const glassPaneDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const g = new THREE.Group();
  const w = num(item, 'w'), h = num(item, 'h');
  const cols = num(item, 'cols', 3), rows = num(item, 'rows', 3);
  const r = rng(num(item, 'seed', 1));
  const missing = new Set(typeof item.missing === 'string' && item.missing ? item.missing.split(';').map(s => s.trim()) : []);
  const bar = 0.07;
  // 鐵框：外框 + 直櫺 + 橫櫺 (一個網格)
  const frame: THREE.BufferGeometry[] = [
    part(box(w + bar, bar, 0.08), 0, h / 2, 0.04), part(box(w + bar, bar, 0.08), 0, -h / 2, 0.04),
    part(box(bar, h, 0.08), -w / 2, 0, 0.04), part(box(bar, h, 0.08), w / 2, 0, 0.04)
  ];
  for (let c = 1; c < cols; c++) frame.push(part(box(bar * 0.7, h - bar, 0.07), -w / 2 + (c * w) / cols, 0, 0.045));
  for (let k = 1; k < rows; k++) frame.push(part(box(w - bar, bar * 0.7, 0.07), 0, -h / 2 + (k * h) / rows, 0.045));
  g.add(p.mesh(merge(frame), pal.trim, { metalness: 0.4, roughness: 0.6, outline: false }));
  // 窗外：暗綠的夜色 (在玻璃後面，玻璃半透明才有「窗」的感覺)
  const back = p.mesh(new THREE.PlaneGeometry(w, h), 0x1d3426, { emissive: 0x1d3426, emissiveIntensity: 0.4, outline: false, shadow: false });
  back.position.z = 0.012;
  g.add(back);
  // 色玻璃：同色的格合成一個網格
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  const cw = w / cols, ch = h / rows;
  for (let k = 0; k < rows; k++) for (let c = 0; c < cols; c++) {
    if (missing.has(`${c},${k}`)) continue;
    const color = GLASS[Math.floor(r() * GLASS.length)];
    const list = byColor.get(color) ?? [];
    list.push(part(new THREE.PlaneGeometry(cw - bar * 0.7, ch - bar * 0.7), -w / 2 + (c + 0.5) * cw, -h / 2 + (k + 0.5) * ch, 0.035));
    byColor.set(color, list);
  }
  // 每種色的玻璃錯開 2 mm (合併後的網格互相不共面)
  [...byColor].forEach(([color, parts], i) => {
    const m = p.mesh(merge(parts), color, { opacity: 0.62, emissive: color, emissiveIntensity: 0.45, outline: false, shadow: false });
    m.position.z = i * 0.002;
    g.add(m);
  });
  // 框上的一條藤 (從一角垂下)
  const vine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-w / 2 - 0.05, h / 2 + 0.05, 0.09), new THREE.Vector3(-w / 4, h / 2 + 0.12, 0.1),
    new THREE.Vector3(w / 6, h / 2 - 0.05, 0.1), new THREE.Vector3(w / 2 + 0.04, h / 4, 0.1), new THREE.Vector3(w / 2 + 0.08, -h / 3, 0.1)
  ]);
  g.add(p.mesh(new THREE.TubeGeometry(vine, 20, 0.035, 5, false), 0x6e7f3a, { outline: false, shadow: false }));
  const b = level.bounds;
  const y = num(item, 'y');
  const at = num(item, 'at');
  if (item.side === 'W') { g.position.set(b.minX + 0.02, y, at); g.rotation.y = Math.PI / 2; }
  else if (item.side === 'E') { g.position.set(b.maxX - 0.02, y, at); g.rotation.y = -Math.PI / 2; }
  else g.position.set(at, y, b.minZ + 0.02);
  return { root: g, only3d: [g] };
};

/** planter：木框育苗床 (高 0.5；土 + 一排幼苗)；欄位 x、z、w、d、rot、seed */
export const planterDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const w = num(item, 'w', 2.4), d = num(item, 'd', 1.0);
  const r = rng(num(item, 'seed', 1));
  const H = 0.5, t = 0.08;
  const wood = [
    part(box(w, H, t), 0, H / 2, -d / 2 + t / 2), part(box(w, H, t), 0, H / 2, d / 2 - t / 2),
    part(box(t, H, d - t * 2), -w / 2 + t / 2, H / 2, 0), part(box(t, H, d - t * 2), w / 2 - t / 2, H / 2, 0),
    // 上緣的壓條 (比側板寬一點)
    part(box(w + 0.04, 0.05, 0.14), 0, H + 0.02, -d / 2 + t / 2), part(box(w + 0.04, 0.05, 0.14), 0, H + 0.02, d / 2 - t / 2)
  ];
  g.add(p.mesh(merge(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf, outline: false }));
  // 土比框內緣小 1 cm (不與側板內面共面)
  const soil = p.mesh(box(w - t * 2 - 0.01, 0.06, d - t * 2 - 0.01), SOIL, { outline: false, shadow: false });
  soil.position.y = H - 0.06;
  g.add(soil);
  const sprouts: THREE.BufferGeometry[] = [];
  const n = Math.max(3, Math.round(w / 0.45));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.25 + ((w - 0.5) * (i + 0.5)) / n;
    sprouts.push(...plant(r, x, H - 0.03, (r() - 0.5) * (d - 0.4), 0.7 + r() * 0.5, false));
  }
  g.add(p.mesh(merge(sprouts), LEAF, { outline: false, roughness: 0.9 }));
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  return { root: g, only3d: [g] };
};

/** pots：一簇大小不一的陶盆與植物；欄位 x、z、n (盆數，預設 3)、seed、fern (1 = 蕨類) */
export const potsDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const r = rng(num(item, 'seed', 1));
  const n = num(item, 'n', 3);
  const fern = num(item, 'fern', 0) === 1;
  const pots: THREE.BufferGeometry[] = [];
  const rims: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const s = 0.7 + r() * 0.7;
    const a = (i / n) * Math.PI * 2 + r();
    const rad = i === 0 ? 0 : 0.35 + r() * 0.25;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const ph = 0.32 * s;
    pots.push(part(new THREE.CylinderGeometry(0.17 * s, 0.12 * s, ph, 12), x, ph / 2, z));
    rims.push(part(new THREE.CylinderGeometry(0.19 * s, 0.19 * s, 0.05 * s, 12), x, ph - 0.01, z));
    leaves.push(...plant(r, x, ph, z, s * (fern ? 1.3 : 1.1), fern));
  }
  g.add(
    p.mesh(merge(pots), pal.crate, { outline: false, roughness: 0.9 }),
    p.mesh(merge(rims), pal.crateDark, { outline: false, roughness: 0.9 }),
    p.mesh(merge(leaves), fern ? LEAF_DARK : LEAF, { outline: false, roughness: 0.9 })
  );
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: g, only3d: [g] };
};

/** pottingRack：靠後牆的育苗架 (兩層木板 + 四根腳；架上一排小陶盆與幼苗)；欄位 x (中心)、w、seed */
export const pottingRackDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const g = new THREE.Group();
  const w = num(item, 'w', 2.4);
  const r = rng(num(item, 'seed', 1));
  const d = 0.5;
  const wood: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) wood.push(part(box(0.07, 1.5, 0.07), sx * (w / 2 - 0.05), 0.75, d / 2 - 0.05), part(box(0.07, 1.5, 0.07), sx * (w / 2 - 0.05), 0.75, -d / 2 + 0.05));
  for (const y of [0.7, 1.4]) wood.push(part(box(w, 0.05, d), 0, y, 0));
  g.add(p.mesh(merge(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf, outline: false }));
  const pots: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (const y of [0.725, 1.425]) {
    const n = Math.max(2, Math.floor(w / 0.42));
    for (let i = 0; i < n; i++) {
      if (r() < 0.2) continue;
      const x = -w / 2 + 0.22 + ((w - 0.44) * (i + 0.5)) / n;
      pots.push(part(new THREE.CylinderGeometry(0.1, 0.075, 0.18, 10), x, y + 0.09, 0));
      leaves.push(...plant(r, x, y + 0.18, 0, 0.55 + r() * 0.3, false));
    }
  }
  g.add(p.mesh(merge(pots), pal.crate, { outline: false, roughness: 0.9 }), p.mesh(merge(leaves), LEAF, { outline: false, roughness: 0.9 }));
  g.position.set(num(item, 'x'), 0, level.bounds.minZ + 0.13 + d / 2);
  return { root: g, only3d: [g] };
};

/** glowPlants：夜溫室的螢光蕨 (淡青、微微發光；不閃爍——規格 9.1 光敏)；欄位 x、z、n (株數)、seed */
export const glowPlantsDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const r = rng(num(item, 'seed', 1));
  const n = num(item, 'n', 5);
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = r() * 0.9;
    leaves.push(...plant(r, Math.cos(a) * rad, 0, Math.sin(a) * rad, 1.1 + r() * 0.8, true));
  }
  g.add(p.mesh(merge(leaves), 0x4f8a6a, { emissive: pal.wallMotif, emissiveIntensity: 0.55, outline: false, roughness: 0.8 }));
  const halo = glowSprite(glow(), pal.wallMotif, 2.2, 0.22, true);
  halo.position.y = 0.6;
  g.add(halo);
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: g, only3d: [g] };
};

/** bench：木長椅 (座面板條 + 椅背 + 鑄鐵腳；座高 0.45)；欄位 x、z、w、rot */
export const benchDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const w = num(item, 'w', 1.6);
  const slats: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) slats.push(part(box(w, 0.04, 0.12), 0, 0.45, -0.15 + i * 0.15));
  for (let i = 0; i < 2; i++) slats.push(part(box(w, 0.1, 0.03), 0, 0.68 + i * 0.16, -0.24, -0.15));
  const iron: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    iron.push(part(box(0.05, 0.45, 0.05), sx * (w / 2 - 0.12), 0.225, 0.14), part(box(0.05, 0.9, 0.05), sx * (w / 2 - 0.12), 0.45, -0.22, -0.12));
    iron.push(part(box(0.05, 0.05, 0.42), sx * (w / 2 - 0.12), 0.2, -0.04));
  }
  g.add(p.mesh(merge(slats), pal.shelf, { map: crateWood(pal), flat: pal.shelf, outline: false }), p.mesh(merge(iron), pal.trim, { metalness: 0.4, roughness: 0.6, outline: false }));
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  return { root: g, only3d: [g] };
};

/** prism：吊在角落的玻璃稜鏡 (細鏈 + 八面體玻璃 + 一圈淡光)；欄位 x、y (稜鏡中心高)、z */
export const prismDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const y = num(item, 'y', 2.6);
  const chain = p.mesh(new THREE.CylinderGeometry(0.01, 0.01, 6 - y, 4), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false, shadow: false });
  chain.position.y = y + (6 - y) / 2;
  const crystal = p.mesh(new THREE.OctahedronGeometry(0.22, 0), pal.glass, { opacity: 0.6, emissive: pal.wallMotif, emissiveIntensity: 0.35, outline: false, shadow: false });
  crystal.position.y = y;
  crystal.scale.set(0.8, 1.4, 0.8);
  const halo = glowSprite(glow(), pal.wallMotif, 1.2, 0.25, true);
  halo.position.y = y;
  g.add(chain, crystal, halo);
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: g, only3d: [g] };
};

/** stake：插在地上的木樁 (紙籤的依託；物件外觀規則 ②「字條有依託」)；欄位 x、z (木樁中心，放在紙籤正後方)、h (樁頂高，預設 1.15) */
export const stakeDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const h = num(item, 'h', 1.15);
  const m = p.mesh(merge([part(box(0.08, h, 0.06), 0, h / 2, 0), part(box(0.5, 0.05, 0.05), 0, h - 0.32, 0.03)]), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark, outline: false });
  m.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/**
 * toolBoard：西牆上的工具掛板 (木板 + 一排黃銅鉤 + 掛著的鏟子 / 剪刀 / 一捆麻繩；3-1 建築比例尺掛在它旁邊)；欄位 z (板中心)、w (沿 z 的寬)、y (板中心高，預設 1.45)
 */
export const toolBoardDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const g = new THREE.Group();
  const w = num(item, 'w', 1.6), y = num(item, 'y', 1.45);
  g.add(p.mesh(box(0.04, 0.9, w), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark, outline: false }));
  const pegs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) pegs.push(part(box(0.1, 0.03, 0.03), 0.06, 0.32, -w / 2 + 0.2 + (i * (w - 0.4)) / 3));
  g.add(p.mesh(merge(pegs), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false }));
  // 鏟子 (把手 + 鏟頭)、剪刀 (兩片)、麻繩 (一圈)：掛在鉤上 (鐵色 / 木色 / 麻色)
  const tools: THREE.BufferGeometry[] = [
    part(box(0.03, 0.42, 0.05), 0.07, 0.08, -w / 2 + 0.2 + (w - 0.4) / 3), part(box(0.02, 0.2, 0.14), 0.07, -0.2, -w / 2 + 0.2 + (w - 0.4) / 3),
    part(box(0.02, 0.3, 0.04), 0.07, 0.12, -w / 2 + 0.2 + (2 * (w - 0.4)) / 3, 0.25, 0, 0), part(box(0.02, 0.3, 0.04), 0.075, 0.12, -w / 2 + 0.2 + (2 * (w - 0.4)) / 3, -0.25, 0, 0)
  ];
  g.add(p.mesh(merge(tools), pal.trim, { metalness: 0.4, roughness: 0.6, outline: false }));
  const twine = p.mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 14), 0xc9b07a, { outline: false, roughness: 0.95 });
  twine.rotation.y = Math.PI / 2;
  twine.position.set(0.08, 0.12, w / 2 - 0.2);
  g.add(twine);
  // 板背離牆 5.5 cm (不與西門門框的側面共面)
  g.position.set(level.bounds.minX + 0.075, y, num(item, 'z'));
  return { root: g, only3d: [g] };
};
