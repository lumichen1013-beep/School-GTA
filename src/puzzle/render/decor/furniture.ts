import * as THREE from 'three';
import { glowSprite } from '../materials';
import { mergeParts, placed } from '../geometry';
import { crateWood, glow } from '../textures';
import { num } from './fields';
import type { DecorFactory } from './types';

// 房間的家具裝飾 (擺設規則 ①：用椅子、落地燈、書堆、書梯收邊)：純呈現、不進碰撞、不可互動，只在實景 (藏寶圖只畫和謎題有關的東西，
// 不擋 2D 判讀)。比例以玩家身高約 1.7 為準：椅座 0.45、扶手 0.65、椅背 1.05、落地燈 1.75、書梯靠到第三層書。
// 擺的位置由關卡資料決定 (不得壓在謎題物件上、不與謎題物件共面)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 同材質的零件合併成一個網格 (家具零件多，合併以省繪製次數) */
const part = placed;
const merge = mergeParts;

/** 固定種子亂數 (每次外觀一致) */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * armchair：皮革扶手椅 (胡桃木短腳、座墊、椅背微微後仰、兩側扶手)；欄位 x、z、rot (繞 y 的角度，弧度；0 = 面向鏡頭 +z)、tone (書色表的第幾色，預設 0 = 酒紅皮革)
 */
export const armchairDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const leather = pal.books[num(item, 'tone', 0) % pal.books.length];
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(part(box(0.07, 0.14, 0.07), sx * 0.36, 0.07, sz * 0.32));
  // 皮革部分 (座、座墊、椅背、扶手與扶手捲邊) 合成一個網格
  const hide: THREE.BufferGeometry[] = [
    part(box(0.86, 0.22, 0.8), 0, 0.25, 0),
    part(box(0.6, 0.09, 0.62), 0, 0.405, 0.06),
    part(box(0.86, 0.7, 0.18), 0, 0.7, -0.33, -0.12)
  ];
  for (const s of [-1, 1]) {
    hide.push(part(box(0.14, 0.3, 0.78), s * 0.37, 0.51, 0.01));
    hide.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.78, 10), s * 0.37, 0.665, 0.012, Math.PI / 2));
  }
  g.add(p.mesh(merge(legs), pal.shelfDark, { outline: false }), p.mesh(merge(hide), leather, { roughness: 0.7, outline: false }));
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  return { root: g, only3d: [g] };
};

/** floorLamp：落地燈 (黃銅圓座 + 細桿 + 布燈罩，燈罩透出暖光)；欄位 x、z */
export const floorLampDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const brass = { metalness: 0.6, roughness: 0.4 } as const;
  const base = p.mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 16), pal.brass, brass);
  base.position.y = 0.025;
  const pole = p.mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 8), pal.brass, { ...brass, outline: false });
  pole.position.y = 0.05 + 0.725;
  const shade = p.mesh(new THREE.CylinderGeometry(0.15, 0.26, 0.3, 16, 1, true), pal.lampShade, { emissive: pal.lampShade, emissiveIntensity: 0.35, side: THREE.DoubleSide, outline: false });
  shade.position.y = 1.6;
  const bulb = p.mesh(new THREE.SphereGeometry(0.06, 10, 8), pal.lampBulb, { emissive: pal.lampLight, emissiveIntensity: 1.2, outline: false, shadow: false });
  bulb.position.y = 1.52;
  const halo = glowSprite(glow(), pal.lampLight, 1.4, 0.35, true);
  halo.position.y = 1.55;
  g.add(base, pole, shade, bulb, halo);
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  return { root: g, only3d: [g] };
};

/** bookPile：地上的一疊書 (每本略轉一點角度)；欄位 x、z、n (本數，預設 6)、seed */
export const bookPileDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  const r = rng(num(item, 'seed', 1));
  let y = 0;
  const n = num(item, 'n', 6);
  // 同色的書合成一個網格
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  for (let i = 0; i < n; i++) {
    const bh = 0.07 + r() * 0.06;
    const bw = 0.52 - r() * 0.16, bd = 0.38 - r() * 0.1;
    const color = pal.books[Math.floor(r() * pal.books.length)];
    const x = (r() - 0.5) * 0.06, z = (r() - 0.5) * 0.06, ry = (r() - 0.5) * 0.7;
    const list = byColor.get(color) ?? [];
    list.push(part(box(bw, bh, bd), x, y + bh / 2, z, 0, ry));
    byColor.set(color, list);
    y += bh;
  }
  for (const [color, parts] of byColor) g.add(p.mesh(merge(parts), color, { roughness: 0.9, outline: false }));
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = r() * Math.PI;
  return { root: g, only3d: [g] };
};

/**
 * ladder：靠在後牆書櫃上的書梯 (兩根側桿 + 橫檔，頂端掛在書櫃上緣的鉤子)；欄位 x、top (靠到的高度，預設 3.4)、
 * wall (書櫃正面的 z，預設 = 房間後牆 + 0.53：書櫃裝飾 / 屋框書牆的正面)
 */
export const ladderDecor: DecorFactory = (p, item, { level, theme: { pal } }) => {
  const g = new THREE.Group();
  const top = num(item, 'top', 3.4);
  const wall = num(item, 'wall', level.bounds.minZ + 0.53);
  const foot = 0.9;
  const len = Math.hypot(top, foot);
  const tilt = Math.atan2(foot, top);
  const frame = new THREE.Group();
  const rails = [-1, 1].map(s => part(box(0.06, len, 0.08), s * 0.24, len / 2, 0));
  const rungs: THREE.BufferGeometry[] = [];
  for (let y = 0.3; y < len - 0.15; y += 0.32) rungs.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.48, 6), 0, y, 0.01, 0, 0, Math.PI / 2));
  const hook = p.mesh(box(0.56, 0.05, 0.12), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false });
  hook.position.set(0, len - 0.03, -0.05);
  frame.add(p.mesh(merge(rails), pal.shelf, { map: crateWood(pal), flat: pal.shelf, outline: false }), p.mesh(merge(rungs), pal.shelfDark, { outline: false }), hook);
  frame.rotation.x = -tilt;
  frame.position.set(0, 0, wall + foot);
  g.add(frame);
  g.position.x = num(item, 'x');
  return { root: g, only3d: [g] };
};
