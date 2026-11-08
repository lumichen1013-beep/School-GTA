import * as THREE from 'three';
import { glowSprite } from '../materials';
import { mergeParts, placed } from '../geometry';
import { crateWood, glow } from '../textures';
import { WALL_H } from './room';
import { num, str } from './fields';
import type { DecorFactory } from './types';

// 觀星閣樓 (第五章；story-bible 8.4、規格 6「第五章共用規則」閣樓主題) 的裝飾：斜屋頂 (後牆上半斜進來的屋面) 與椽樑、立柱、天窗與斜落的塵光、
// 星圖天花板、牆上的方窗 (窗外深靛星空)、梁上掛的羊皮紙星表、黃銅望遠鏡、皮面舊箱 / 帆布蓋著的箱堆、欄杆、摺好的毯子、齒輪牆與光槽 (5-5)、
// 地板上重畫的展開圖 (5-5)；林心草地 (6-1，meadow 主題骨架版)：古樹、草地、石台、落葉。
// 純呈現 (不進碰撞、不可互動)；屋頂、塵光、星點只在實景 (藏寶圖照舊是平的牆)。同材質零件合成一個網格 (椽與柱一個網格)、
// 舊箱 = InstancedMesh、星點 / 灰塵 = Points (省繪製次數)；減弱動態 (still) 時塵光與灰塵靜止。比例以玩家身高約 1.7 為準

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const part = placed;
const merge = mergeParts;

/** 固定種子亂數 (每次外觀一致) */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// 色板 (規格「閣樓主題」表)：屋頂斜面 / 椽與樑 / 立柱、舊箱 (皮) / 箱角 (銅) / 帆布、天窗外夜色 / 星點 / 塵光、星圖金線
const ROOF = 0x5e4b3a;
const BEAM = 0x4a3828;
const POST = 0x6b5038;
const LEATHER = 0x6e4a30;
const CORNER = 0xb08a4a;
const CANVAS = 0xb8ac94;
const NIGHT = 0x1f2547;
const STAR = 0xe6e9f2;
const DUST = 0xf2dda6;
const GOLD_LINE = 0xc9b27f;
const PARCHMENT = 0xe8d8b0;
const BRASS = 0xb08a4a;

/** 斜屋頂：從後牆 y = EAVE 往觀眾斜上到 (RIDGE_Z, RIDGE_Y)；屋面下緣蓋住後牆的上半 (後牆上半斜進來) */
export const EAVE = 3.4;
export const RIDGE_Y = 6.4;
export const RIDGE_Z = -2.6;
/** 屋面在 z 處的高度 (z ∈ [後牆, RIDGE_Z]) */
export function roofY(z: number, minZ = -5): number {
  return EAVE + ((z - minZ) / (RIDGE_Z - minZ)) * (RIDGE_Y - EAVE);
}
const SLOPE = (minZ: number) => Math.atan2(RIDGE_Y - EAVE, RIDGE_Z - minZ);

/** 一片貼在屋面上的平面 (中心 x, z；寬 w、沿斜面長 len)；off = 往屋內 (下方) 推的距離 */
function onRoof(geo: THREE.BufferGeometry, x: number, z: number, minZ: number, off = 0): THREE.BufferGeometry {
  const a = SLOPE(minZ);
  // 平面預設在 xy 平面、法線 +z → 先轉成躺平 (法線 -y：朝下看得到) 再沿 x 軸傾斜到屋面角度
  geo.rotateX(Math.PI / 2 - a);
  geo.translate(x, roofY(z, minZ) - off * Math.cos(a), z + off * Math.sin(a));
  return geo;
}

/**
 * atticRoof：斜屋頂 (屋面木板一個網格；椽、中脊、牆頂的橫樑一個網格)；只在實景。欄位 seed。
 * 屋面沿 x 鋪滿房間、從後牆上半 (y 3.4) 斜到中脊 (y 6.4、z −2.6)
 */
export const atticRoofDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const b = level.bounds;
  const W = b.maxX - b.minX;
  const len = Math.hypot(RIDGE_Z - b.minZ, RIDGE_Y - EAVE);
  const boards: THREE.BufferGeometry[] = [];
  // 屋面木板：沿斜面一條一條 (寬 0.5)，長度 = 房間寬
  const n = Math.ceil(len / 0.5);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const z = b.minZ + t * (RIDGE_Z - b.minZ);
    boards.push(onRoof(new THREE.BoxGeometry(W + 0.4, len / n - 0.03, 0.06), (b.minX + b.maxX) / 2, z, b.minZ, 0.0));
  }
  const beams: THREE.BufferGeometry[] = [];
  // 椽：每 2.2 m 一根，沿斜面
  for (let x = b.minX + 1.0; x < b.maxX - 0.5; x += 2.2 + r() * 0.2) {
    const g = new THREE.BoxGeometry(0.16, len, 0.2);
    beams.push(onRoof(g, x, (b.minZ + RIDGE_Z) / 2, b.minZ, 0.13));
  }
  // 中脊 (屋頂最高處) 與牆頂的橫樑 (後牆與屋面的交界)
  beams.push(part(box(W + 0.4, 0.32, 0.32), (b.minX + b.maxX) / 2, RIDGE_Y - 0.2, RIDGE_Z + 0.1));
  beams.push(part(box(W + 0.4, 0.26, 0.3), (b.minX + b.maxX) / 2, EAVE - 0.1, b.minZ + 0.15));
  const g = new THREE.Group();
  g.add(p.mesh(merge(boards), ROOF, { outline: false, roughness: 0.9, side: THREE.DoubleSide }));
  g.add(p.mesh(merge(beams), BEAM, { outline: false, roughness: 0.9 }));
  return { root: g, only3d: [g] };
};

/** posts：靠後牆的立柱 (從地板頂到屋面；成組)；欄位 xs ('−2,2' 逗號分隔)、z */
export const postsDecor: DecorFactory = (p, item, { level }) => {
  const z = num(item, 'z', level.bounds.minZ + 0.5);
  const xs = str(item, 'xs').split(',').map(Number).filter(Number.isFinite);
  const top = roofY(z, level.bounds.minZ);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of xs) {
    parts.push(part(box(0.26, top, 0.26), x, top / 2, z));
    // 斜撐 (柱頂往兩側)
    parts.push(part(box(0.1, 1.1, 0.1), x - 0.34, top - 0.5, z, 0, 0, -0.7), part(box(0.1, 1.1, 0.1), x + 0.34, top - 0.5, z, 0, 0, 0.7));
  }
  const m = p.mesh(merge(parts), POST, { outline: false, roughness: 0.9 });
  return { root: m, only3d: [m] };
};

/**
 * skyWindow：屋面上的天窗 (窗框 + 窗外深靛夜色與星點) 與斜落的塵光 (半透明光柱 ≤ 0.18 + 緩慢浮動的灰塵 Points；減弱動態時靜止)；
 * 欄位 x (天窗中心、光柱落點)、z (光柱落點)、w (天窗寬)
 */
export const skyWindowDecor: DecorFactory = (p, item, { level, still }) => {
  const b = level.bounds;
  const x = num(item, 'x'), z0 = num(item, 'z'), w = num(item, 'w', 2.6);
  const wz = b.minZ + (RIDGE_Z - b.minZ) * 0.55;
  const g = new THREE.Group();
  // 窗外夜色 (貼在屋面外側) 與窗框
  g.add(p.mesh(onRoof(new THREE.PlaneGeometry(w, 1.8), x, wz, b.minZ, 0.07), NIGHT, { outline: false, shadow: false, emissive: NIGHT, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  const frame = [
    onRoof(box(w + 0.2, 0.12, 0.14), x, wz, b.minZ, 0.16), onRoof(box(0.12, 1.9, 0.14), x - w / 2, wz, b.minZ, 0.16),
    onRoof(box(0.12, 1.9, 0.14), x + w / 2, wz, b.minZ, 0.16), onRoof(box(0.08, 1.9, 0.1), x, wz, b.minZ, 0.16)
  ];
  g.add(p.mesh(merge(frame), BEAM, { outline: false }));
  // 窗外的星點
  const r = rng(Math.round(x * 13 + 7));
  const stars: number[] = [];
  const a = SLOPE(b.minZ);
  for (let i = 0; i < 26; i++) {
    const u = (r() - 0.5) * w * 0.95, v = (r() - 0.5) * 1.7;
    // 貼著夜色、往屋內一點點 (屋面法線朝下前方)
    stars.push(x + u, roofY(wz, b.minZ) + v * Math.sin(a) - 0.09 * Math.cos(a), wz + v * Math.cos(a) + 0.09 * Math.sin(a));
  }
  g.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)), new THREE.PointsMaterial({ color: STAR, size: 0.07, sizeAttenuation: true })));
  // 塵光：從天窗斜落到觀星儀上的光柱 (一個半透明的錐台；不寫深度)
  const top = new THREE.Vector3(x, roofY(wz, b.minZ) - 0.1, wz);
  const bottom = new THREE.Vector3(x + 0.4, 0.05, z0 + 0.6);
  const len = top.distanceTo(bottom);
  const shaft = new THREE.CylinderGeometry(w * 0.32, w * 0.5, len, 12, 1, true);
  const mid = top.clone().add(bottom).multiplyScalar(0.5);
  const beam = p.mesh(shaft, DUST, { opacity: 0.12, emissive: DUST, emissiveIntensity: 0.4, outline: false, shadow: false, side: THREE.DoubleSide, unique: true });
  beam.position.copy(mid);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
  g.add(beam);
  // 光柱裡的灰塵 (Points；緩慢浮動)
  const dust: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < 60; i++) {
    const t = r();
    const pt = bottom.clone().lerp(top, t);
    dust.push(pt.x + (r() - 0.5) * w * 0.7, pt.y, pt.z + (r() - 0.5) * w * 0.5);
    seeds.push(r() * 6.28);
  }
  const dustGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  const base = Float32Array.from(dust);
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: DUST, size: 0.05, transparent: true, opacity: 0.18, depthWrite: false }));
  g.add(motes);
  const update = (t: number) => {
    if (still) return;
    const pos = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < seeds.length; i++) {
      pos.setY(i, base[i * 3 + 1] + Math.sin(t * 0.3 + seeds[i]) * 0.12);
      pos.setX(i, base[i * 3] + Math.cos(t * 0.2 + seeds[i]) * 0.06);
    }
    pos.needsUpdate = true;
  };
  return { root: g, only3d: [g], update };
};

/** starCeiling：屋面上畫的星圖 (金線連成的星座 + 星點，Points 與一個線段網格)；只在實景。欄位 x (中心)、w (跨幅)、seed */
export const starCeilingDecor: DecorFactory = (_p, item, { level }) => {
  const b = level.bounds;
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), w = num(item, 'w');
  const pts: number[] = [];
  const lines: number[] = [];
  const at = (x: number, z: number): [number, number, number] => [x, roofY(z, b.minZ) - 0.04, z + 0.02];
  for (let c = 0; c < Math.max(3, Math.round(w / 4)); c++) {
    const cx = x0 - w / 2 + (c + 0.5) * (w / Math.max(3, Math.round(w / 4)));
    let prev: [number, number, number] | null = null;
    for (let k = 0; k < 5; k++) {
      const p3 = at(cx + (r() - 0.5) * 2.4, b.minZ + 0.4 + r() * (RIDGE_Z - b.minZ - 0.8));
      pts.push(...p3);
      if (prev) lines.push(...prev, ...p3);
      prev = p3;
    }
  }
  for (let i = 0; i < 40; i++) pts.push(...at(x0 + (r() - 0.5) * w, b.minZ + 0.3 + r() * (RIDGE_Z - b.minZ - 0.5)));
  const g = new THREE.Group();
  g.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: STAR, size: 0.08 })));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), new THREE.LineBasicMaterial({ color: GOLD_LINE, transparent: true, opacity: 0.7 })));
  return { root: g, only3d: [g] };
};

/**
 * atticWindow：牆上的方窗 (窗框 + 十字窗櫺 + 窗外深靛星空與星點)；side N = 後牆 (x 位置)、E / W = 側牆 (中心 z = x 欄位)；欄位 side、x、w、h、y。
 * 窗框與夜色兩個視角都畫 (藏寶圖裡是淡色的窗)，星點只在實景
 */
export const atticWindowDecor: DecorFactory = (p, item, { level, theme: { room2d } }) => {
  const b = level.bounds;
  const side = str(item, 'side');
  const c = num(item, 'x'), w = num(item, 'w', 2.4), h = num(item, 'h', 2.0), y = num(item, 'y', 2.8);
  const g = new THREE.Group();
  if (side === 'N') g.position.set(c, y, b.minZ + 0.06);
  else { g.position.set(side === 'E' ? b.maxX - 0.06 : b.minX + 0.06, y, c); g.rotation.y = side === 'E' ? -Math.PI / 2 : Math.PI / 2; }
  g.add(p.mesh(new THREE.PlaneGeometry(w, h), NIGHT, { flat: room2d.trim, outline: false, shadow: false, emissive: NIGHT, emissiveIntensity: 0.5 }));
  const frame = [
    part(box(w + 0.24, 0.14, 0.12), 0, h / 2 + 0.05, 0.04), part(box(w + 0.24, 0.18, 0.2), 0, -h / 2 - 0.06, 0.08),
    part(box(0.14, h + 0.2, 0.12), -w / 2 - 0.05, 0, 0.04), part(box(0.14, h + 0.2, 0.12), w / 2 + 0.05, 0, 0.04),
    part(box(0.06, h, 0.06), 0, 0, 0.04), part(box(w, 0.06, 0.06), 0, 0, 0.04)
  ];
  g.add(p.mesh(merge(frame), BEAM, { flat: room2d.wainscot, outline: false }));
  const r = rng(Math.round(c * 31 + h * 7 + 3));
  const stars: number[] = [];
  for (let i = 0; i < 22; i++) stars.push((r() - 0.5) * w * 0.94, (r() - 0.5) * h * 0.94, 0.02);
  const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)), new THREE.PointsMaterial({ color: STAR, size: 0.06 }));
  g.add(pts);
  return { root: g, only3d: [pts] };
};

/** starChart：梁上掛的羊皮紙星表 (n 張；細繩 + 紙 + 紙上的星點)；只在實景。欄位 x、z、n、seed */
export const starChartDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), z = num(item, 'z'), n = Math.max(1, Math.round(num(item, 'n', 2)));
  const top = Math.min(WALL_H - 0.4, roofY(Math.min(z, RIDGE_Z), level.bounds.minZ) - 0.2);
  const sheets: THREE.BufferGeometry[] = [];
  const cords: THREE.BufferGeometry[] = [];
  const dots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + (i - (n - 1) / 2) * 1.1, tilt = (r() - 0.5) * 0.16, hgt = 0.9 + r() * 0.3;
    sheets.push(part(box(0.8, hgt, 0.01), x, top - 0.6 - hgt / 2, z, 0, (r() - 0.5) * 0.3, tilt));
    cords.push(part(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), x, top - 0.3, z));
    for (let k = 0; k < 5; k++) dots.push(part(new THREE.SphereGeometry(0.025, 4, 3), x + (r() - 0.5) * 0.6, top - 0.7 - r() * (hgt - 0.2), z + 0.02));
  }
  const g = new THREE.Group();
  g.add(p.mesh(merge(sheets), PARCHMENT, { outline: false, side: THREE.DoubleSide }));
  g.add(p.mesh(merge(cords), BEAM, { outline: false, shadow: false }));
  g.add(p.mesh(merge(dots), 0x3a2618, { outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/** telescope：黃銅望遠鏡 (三腳架 + 斜指天窗的鏡筒)；欄位 x、z、rot */
export const telescopeDecor: DecorFactory = (p, item) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.rotation.y = num(item, 'rot', 0);
  const legs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    legs.push(part(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 6), Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, Math.sin(a) * 0.36, 0, -Math.cos(a) * 0.36));
  }
  g.add(p.mesh(merge(legs), BEAM, { outline: false }));
  const tube = merge([
    part(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 14), 0, 1.65, -0.2, -0.9, 0, 0),
    part(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 14), 0, 1.92, -0.72, -0.9, 0, 0),
    part(new THREE.SphereGeometry(0.07, 10, 8), 0, 1.45, 0)
  ]);
  g.add(p.mesh(tube, BRASS, { metalness: 0.7, roughness: 0.3, outline: false }));
  return { root: g, only3d: [g] };
};

/** trunks：皮面舊箱 (n 個疊放；箱身 = InstancedMesh、銅箱角一個網格、皮帶一個網格)；欄位 x、z、n、seed */
export const trunksDecor: DecorFactory = (p, item) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), z0 = num(item, 'z'), n = Math.max(1, Math.round(num(item, 'n', 3)));
  const body = p.mesh(box(1, 1, 1), LEATHER, { roughness: 0.75, outline: false });
  const inst = new THREE.InstancedMesh(body.geometry, body.material as THREE.Material, n);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const corners: THREE.BufferGeometry[] = [];
  const straps: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = 1.1 - i * 0.18 + r() * 0.1, h = 0.5 - i * 0.05, d = 0.62 - i * 0.06;
    const x = x0 + (r() - 0.5) * 0.2 + (i === 1 ? 0.15 : 0), z = z0 + (r() - 0.5) * 0.12;
    // 每個箱子都斜放一點 (|yaw| ≥ 0.05：側面不與別的軸向面共面)
    const yaw = (i % 2 ? -1 : 1) * (0.05 + r() * 0.12);
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    inst.setMatrixAt(i, m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(w, h, d)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(part(box(0.1, 0.1, 0.1), x + Math.cos(yaw) * sx * (w / 2 - 0.03) + Math.sin(yaw) * sz * (d / 2 - 0.03), y + h - 0.03, z - Math.sin(yaw) * sx * (w / 2 - 0.03) + Math.cos(yaw) * sz * (d / 2 - 0.03)));
    for (const sx of [-0.25, 0.25]) straps.push(part(box(0.06, h + 0.01, d + 0.02), x + Math.cos(yaw) * sx * w, y + h / 2, z - Math.sin(yaw) * sx * w, 0, yaw, 0));
    y += h;
  }
  inst.instanceMatrix.needsUpdate = true;
  const g = new THREE.Group();
  g.add(inst);
  g.add(p.mesh(merge(corners), CORNER, { metalness: 0.6, roughness: 0.4, outline: false, shadow: false }));
  g.add(p.mesh(merge(straps), 0x3a2618, { outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/** canvasPile：帆布蓋著的箱堆 (三個箱子 + 一塊披下來的帆布)；欄位 x、z、seed */
export const canvasPileDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const r = rng(num(item, 'seed', 1));
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.add(p.mesh(merge([part(box(1.0, 0.7, 0.8), 0, 0.35, 0), part(box(0.8, 0.6, 0.7), 0.9, 0.3, 0.1, 0, r() * 0.3, 0)]), pal.crate, { map: crateWood(pal), flat: pal.crate, outline: false }));
  const cloth = new THREE.SphereGeometry(0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cloth.scale(1.25, 1.05, 0.75);
  g.add(p.mesh(merge([part(cloth, 0.3, 0.55, 0), part(box(2.0, 0.04, 1.1), 0.4, 0.02, 0.05)]), CANVAS, { roughness: 0.95, outline: false, side: THREE.DoubleSide }));
  return { root: g, only3d: [g] };
};

/** railing：樓板開口旁的木欄杆 (扶手 + 欄柱一個網格；開口 = 地上的一塊暗色)；欄位 x、z、w */
export const railingDecor: DecorFactory = (p, item) => {
  const x = num(item, 'x'), z = num(item, 'z'), w = num(item, 'w', 3);
  const parts: THREE.BufferGeometry[] = [part(box(w, 0.08, 0.1), x, 1.0, z - 0.7)];
  for (let k = 0; k <= Math.round(w / 0.4); k++) parts.push(part(box(0.06, 1.0, 0.06), x - w / 2 + k * (w / Math.round(w / 0.4)), 0.5, z - 0.7));
  parts.push(part(box(0.08, 1.0, 1.2), x - w / 2, 0.5, z - 0.1), part(box(0.08, 0.08, 1.2), x - w / 2, 1.0, z - 0.1));
  const g = new THREE.Group();
  g.add(p.mesh(merge(parts), POST, { outline: false }));
  g.add(p.mesh(part(box(w - 0.2, 0.02, 1.2), x, 0.011, z), 0x241a12, { outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/** blanket：摺好的毯子 (疊在箱上；兩層)；欄位 x、z */
export const blanketDecor: DecorFactory = (p, item) => {
  const m = p.mesh(merge([part(box(0.7, 0.08, 0.5), 0, 0, 0), part(box(0.66, 0.08, 0.46), 0, 0.08, 0, 0, 0.1, 0)]), 0x7a3a3a, { outline: false, roughness: 0.95 });
  m.position.set(num(item, 'x'), 0.92, num(item, 'z'));
  return { root: m, only3d: [m] };
};

/** gearWall：機關的黃銅齒輪牆 (後牆上大小不一的齒輪 + 三道光槽)；欄位 x、w、seed。齒輪一個網格、光槽一個網格 */
export const gearWallDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), w = num(item, 'w');
  const z = level.bounds.minZ + 0.2;
  const gears: THREE.BufferGeometry[] = [];
  for (let i = 0; i < Math.round(w / 3); i++) {
    const R = 0.5 + r() * 0.7;
    const gx = x0 - w / 2 + 1.2 + i * 3 + r() * 0.8, gy = 1.0 + r() * 1.6;
    gears.push(part(new THREE.TorusGeometry(R, 0.09, 6, 22), gx, gy, z));
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; gears.push(part(box(0.14, 0.18, 0.1), gx + Math.cos(a) * (R + 0.1), gy + Math.sin(a) * (R + 0.1), z, 0, 0, a)); }
    gears.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), gx, gy, z, Math.PI / 2, 0, 0));
  }
  const slots: THREE.BufferGeometry[] = [];
  for (const k of [-1, 0, 1]) slots.push(part(box(0.18, 2.4, 0.04), x0 + k * 3.4, 2.0, z + 0.11));
  const g = new THREE.Group();
  g.add(p.mesh(merge(gears), BRASS, { metalness: 0.65, roughness: 0.35, outline: false }));
  g.add(p.mesh(merge(slots), 0xf2dda6, { emissive: 0xf2dda6, emissiveIntensity: 0.35, outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/** floorDrawing：地板上被重畫的展開圖 (墨線方格與幾道重描的線；一個線段網格)；欄位 x、z、w、d、seed */
export const floorDrawingDecor: DecorFactory = (_p, item) => {
  const r = rng(num(item, 'seed', 1));
  const x0 = num(item, 'x'), z0 = num(item, 'z'), w = num(item, 'w'), d = num(item, 'd');
  const v: number[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number) => v.push(ax, 0.012, az, bx, 0.012, bz);
  for (let i = 0; i <= 4; i++) { const x = x0 - w / 2 + (i * w) / 4; seg(x, z0 - d / 2, x, z0 + d / 2); }
  for (let i = 0; i <= 3; i++) { const z = z0 - d / 2 + (i * d) / 3; seg(x0 - w / 2, z, x0 + w / 2, z); }
  for (let i = 0; i < 6; i++) seg(x0 + (r() - 0.5) * w, z0 + (r() - 0.5) * d, x0 + (r() - 0.5) * w, z0 + (r() - 0.5) * d);
  const m = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3)), new THREE.LineBasicMaterial({ color: 0x2c3fb0, transparent: true, opacity: 0.55 }));
  return { root: m, only3d: [m] };
};

// ── 林心草地 (終章 6-1；meadow 主題骨架版) ──

/** ancientTree：撐開屋頂的古樹 (粗幹 + 往上的枝 + 樹冠，黎明的光暈)；欄位 x、z、seed */
export const ancientTreeDecor: DecorFactory = (p, item, { still }) => {
  const r = rng(num(item, 'seed', 1));
  const x = num(item, 'x'), z = num(item, 'z');
  const wood: THREE.BufferGeometry[] = [part(new THREE.CylinderGeometry(0.7, 1.1, 6.4, 12), x, 3.2, z)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    wood.push(part(new THREE.CylinderGeometry(0.18, 0.32, 3.0, 8), x + Math.cos(a) * 1.0, 6.0, z + Math.sin(a) * 0.6, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6));
    wood.push(part(new THREE.CylinderGeometry(0.12, 0.3, 1.6, 6), x + Math.cos(a) * 1.2, 0.3, z + Math.sin(a) * 1.0, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1));
  }
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) leaves.push(part(new THREE.SphereGeometry(1.2 + r() * 0.8, 10, 8), x + (r() - 0.5) * 6, 7.0 + r() * 1.4, z + (r() - 0.5) * 3));
  const g = new THREE.Group();
  g.add(p.mesh(merge(wood), 0x5a4636, { roughness: 0.95 }));
  g.add(p.mesh(merge(leaves), 0x5f8a3a, { roughness: 0.9, outline: false }));
  const halo = glowSprite(glow(), 0xffe2a8, 7, 0.28, true);
  halo.position.set(x + 2, 5.6, z + 1);
  g.add(halo);
  return { root: g, only3d: [g], update: (t: number) => { if (!still) halo.material.opacity = 0.26 + 0.03 * Math.sin(t * 0.4); } };
};

/** grass：草地 (地板上的草叢 = InstancedMesh)；欄位 w (跨幅)、seed */
export const grassDecor: DecorFactory = (p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const w = num(item, 'w');
  const b = level.bounds;
  const tuft = p.mesh(new THREE.ConeGeometry(0.12, 0.4, 5), 0x6f8a4a, { outline: false, roughness: 0.95 });
  const n = Math.round(w * 6);
  const inst = new THREE.InstancedMesh(tuft.geometry, tuft.material as THREE.Material, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const s = 0.6 + r() * 0.8;
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3));
    inst.setMatrixAt(i, m.compose(new THREE.Vector3((r() - 0.5) * w, 0.15 * s, b.minZ + 0.4 + r() * (b.maxZ - b.minZ - 0.8)), q, new THREE.Vector3(s, s, s)));
  }
  inst.instanceMatrix.needsUpdate = true;
  return { root: inst, only3d: [inst] };
};

/** stoneTable：草地上的石台 (石座 + 台面 + 苔)；欄位 x、z */
export const stoneTableDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  g.add(p.mesh(merge([part(new THREE.CylinderGeometry(0.4, 0.55, 0.7, 10), 0, 0.35, 0), part(new THREE.CylinderGeometry(0.9, 0.85, 0.14, 16), 0, 0.77, 0)]), pal.stone, { roughness: 0.95 }));
  g.add(p.mesh(merge([part(new THREE.SphereGeometry(0.22, 6, 4), 0.5, 0.84, 0.2), part(new THREE.SphereGeometry(0.18, 6, 4), -0.4, 0.84, -0.3)]), 0x6f8a4a, { outline: false }));
  return { root: g, only3d: [g] };
};

/** leaves：草地上的落葉 (Points)；欄位 w、seed */
export const leavesDecor: DecorFactory = (_p, item, { level }) => {
  const r = rng(num(item, 'seed', 1));
  const w = num(item, 'w');
  const b = level.bounds;
  const v: number[] = [];
  for (let i = 0; i < 80; i++) v.push((r() - 0.5) * w, 0.03, b.minZ + 0.5 + r() * (b.maxZ - b.minZ - 1));
  const m = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3)), new THREE.PointsMaterial({ color: 0xc98a3a, size: 0.12 }));
  return { root: m, only3d: [m] };
};

/** quill：書案上的墨壺與羽毛筆 (5-2 許問津的書案)；欄位 x、y (桌面高)、z；只在實景 */
export const quillDecor: DecorFactory = (p, item) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), num(item, 'y', 0.76), num(item, 'z'));
  g.add(p.mesh(merge([part(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), 0, 0.04, 0), part(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), 0, 0.09, 0)]), 0x1e2230, { outline: false }));
  // 羽毛：細長的扁錐，斜插在墨壺裡
  g.add(p.mesh(merge([part(new THREE.ConeGeometry(0.035, 0.42, 6).scale(1, 1, 0.25), 0.06, 0.26, 0, 0, 0, -0.45)]), 0xe8e0cc, { outline: false, shadow: false }));
  return { root: g, only3d: [g] };
};

/**
 * dadDesk：爸爸的書桌 (5-3 西窗；靠後牆、長邊朝房內)：桌面 + 抽屜櫃 + 桌腳 (木，一個網格)、抽屜把手與檯燈座 / 燈桿 (黃銅，一個網格)、
 * 燈罩、一疊筆記 (紙)、白瓷咖啡杯與杯碟 (一個網格)；桌面高 0.76 (同 decor desk)。物件 (筆記本、墨水瓶) 放在桌面西半；欄位 x、z
 */
export const dadDeskDecor: DecorFactory = (p, item, { theme: { pal } }) => {
  const g = new THREE.Group();
  g.position.set(num(item, 'x'), 0, num(item, 'z'));
  const W = 2.0, D = 0.8;
  g.add(p.mesh(merge([
    part(box(W, 0.07, D), 0, 0.76, 0), part(box(0.56, 0.72, D - 0.06), W / 2 - 0.3, 0.36, 0),
    part(box(0.06, 0.72, D - 0.1), -W / 2 + 0.05, 0.36, 0), part(box(W - 0.6, 0.06, 0.04), -0.25, 0.68, D / 2 - 0.05)
  ]), pal.shelf, { map: crateWood(pal), flat: pal.shelf }));
  g.add(p.mesh(merge([
    ...[0.18, 0.42, 0.62].map(y => part(box(0.14, 0.025, 0.03), W / 2 - 0.3, y, D / 2 - 0.02)),
    part(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 12), 0.75, 0.81, -0.2), part(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 6), 0.75, 1.03, -0.2)
  ]), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false }));
  g.add(p.mesh(part(new THREE.CylinderGeometry(0.07, 0.15, 0.14, 14, 1, true), 0.75, 1.26, -0.2), pal.lampShade, { outline: false, side: THREE.DoubleSide }));
  const papers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) papers.push(part(box(0.3, 0.012, 0.22), 0.45 + i * 0.006, 0.8 + i * 0.013, -0.12 + i * 0.004, 0, (i - 1.5) * 0.08, 0));
  g.add(p.mesh(merge(papers), pal.paperNote, { outline: false }));
  g.add(p.mesh(merge([
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 14), 0.55, 0.8, 0.25), part(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 12), 0.55, 0.85, 0.25),
    part(new THREE.TorusGeometry(0.025, 0.007, 5, 10), 0.605, 0.855, 0.25)
  ]), 0xede6d8, { outline: false }));
  return { root: g, only3d: [g] };
};
