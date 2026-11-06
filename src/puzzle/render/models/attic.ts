import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import { crateWood } from '../textures';
import { labelBadge, scaleCorner, scaleRatio } from './label';
import type { ModelCtx, PropModel } from './types';

// 第五章 5-1 天窗間的機關外觀 (規格 6「5-1 天窗間（細化）」)：桌上的縮影 (3×3×3 小方塊 + 頂 / 底黃銅把手；頂層 / 底層跟著房子的朝向轉)、
// 卡在縮影底層的齒輪 (直立咬著 → 縮小後平躺在桌上)、觀星儀的刻度盤 (指針 = 天窗間此刻的朝向；對上 = 金線亮起，不閃爍)、標籤「你」(只有徽章)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const BRASS = { metalness: 0.7, roughness: 0.3 } as const;
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
/** 房間朝向 (0～3 = 從上往下看順時針幾次) → 繞 y 的角度 (three 的 +y 旋轉是逆時針) */
const yawOf = (rot: number | undefined) => (rot !== undefined && rot < 4 ? -rot * Math.PI / 2 : 0);

/** 一層 3×3 的小方塊 (留縫：2D 剪影看得出九宮格)；s = 縮影邊長、y0 = 這一層的底 */
function layerCubes(s: number, y0: number): THREE.BufferGeometry {
  const c = s / 3;
  const k = c * 0.9;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) parts.push(placed(box(k, k, k), (i - 1) * c, y0 + c / 2, (j - 1) * c));
  return mergeParts(parts);
}

/** 縮影：三層小方塊 (木)；頂層一根黃銅把手 + 北邊的金色星點 (轉了看得出來)、底層一圈黃銅軌道與缺口；中層側面 (朝觀眾) 一扇小門 */
export function miniCubeModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const s = d.w;
  const c = s / 3;
  const wood = { map: crateWood(pal), flat: 0xd9bf8a } as const;
  const bottom = new THREE.Group();
  const top = new THREE.Group();
  bottom.add(p.mesh(layerCubes(s, 0), 0xc9a878, wood));
  bottom.add(p.mesh(mergeParts([placed(new THREE.TorusGeometry(s * 0.56, 0.018, 6, 28), 0, c * 0.5, 0, Math.PI / 2, 0, 0), placed(box(0.05, 0.05, 0.1), 0, c * 0.5, s * 0.56)]), pal.brass, { ...BRASS, outline: false }));
  const mid = p.mesh(layerCubes(s, c), 0xbfa070, wood);
  top.add(p.mesh(layerCubes(s, 2 * c), 0xd4b484, wood));
  top.add(p.mesh(mergeParts([placed(box(s * 0.82, 0.04, 0.05), 0, s + 0.03, 0), placed(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), 0, s + 0.06, 0)]), pal.brass, { ...BRASS, outline: false }));
  top.add(p.mesh(mergeParts([placed(new THREE.ConeGeometry(0.035, 0.06, 4), 0, s + 0.02, -s * 0.38)]), pal.gold, { ...BRASS, outline: false, shadow: false }));
  const door = p.mesh(box(c * 0.42, c * 0.62, 0.01), 0x3a2618, { outline: false, shadow: false });
  door.position.set(0, c + c * 0.36, s / 2 + 0.005);
  g.add(bottom, top, mid, door);
  const badge = labelBadge(p, d, { pal } as Theme, g, new THREE.Vector3(-s * 0.2, s + 0.45, s / 2), 0.42);
  let yt = 0, yb = 0;
  const update = (c: ModelCtx) => {
    const layout = c.world.ext.cube?.layout ?? {};
    const rots = c.world.ext.cube?.rots ?? {};
    const at = (z: number) => Object.keys(layout).find(r => { const p3 = layout[r]; return p3[0] === 1 && p3[1] === 1 && p3[2] === z; });
    // 縮影跟著房子：頂層 = 此刻在頂面心的房的朝向、底層 = 底面心的房
    const tr = at(2), br = at(0);
    const k = c.dt * 4;
    yt = approach(yt, tr ? yawOf(rots[tr]) : 0, k);
    yb = approach(yb, br ? yawOf(rots[br]) : 0, k);
    top.rotation.y = yt;
    bottom.rotation.y = yb;
    badge(c);
  };
  return { root: g, update };
}

/** 齒輪的輪廓 (n 齒；r = 外半徑) */
function gearShape(r: number, n: number): THREE.Shape {
  const sh = new THREE.Shape();
  const inner = r * 0.78;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2;
    const rr = i % 4 === 1 || i % 4 === 2 ? r : inner;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return sh;
}

/** 卡在縮影底層的齒輪：直立 (齒面朝觀眾) 咬在縮影的底層軌道上；縮小 (used) 後平躺在桌上。尺寸照有效尺寸 (標籤「小」) */
export function miniGearModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const r = d.w / 2;
  const geo = new THREE.ExtrudeGeometry(gearShape(r, 10), { depth: d.d * 0.7, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, 0, -d.d * 0.35);
  const gear = p.mesh(geo, theme.pal.brass, { ...BRASS, flat: 0xc9a050 });
  const axle = p.mesh(placed(new THREE.CylinderGeometry(r * 0.16, r * 0.16, d.d, 8), 0, 0, 0, Math.PI / 2, 0, 0), 0x6b5038, { outline: false });
  body.add(gear, axle);
  g.add(body);
  // 標籤跟著齒輪：掉到桌上之後一起降下來 (平躺的齒輪很矮)
  const tag = new THREE.Group();
  g.add(tag);
  const badge = labelBadge(p, d, theme, tag, new THREE.Vector3(0, d.h + 0.1, d.d / 2), 0.38);
  const corner = scaleCorner(p, d, theme, g, 0.26);
  const at = new THREE.Vector3();
  let lie = 0;
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    lie = approach(lie, c.obj.used ? 1 : 0, c.dt * 3);
    body.scale.setScalar(k);
    body.rotation.x = -lie * Math.PI / 2;
    body.position.y = (1 - lie) * r * k + lie * (d.d * 0.35 * k + 0.006);
    // 卡著的時候慢慢晃一下 (被軌道咬住、轉不動)；減弱動態不需要另處理 (幅度極小)
    body.rotation.z = c.obj.used ? 0 : Math.sin(c.t * 1.3) * 0.02;
    tag.position.y = -lie * (d.h - 0.2);
    badge(c);
    corner(c, at.set(r * k + 0.12, (1 - lie) * 2 * r * k + lie * 0.2, d.d / 2));
  };
  return { root: g, update };
}

/** 觀星儀的刻度盤：木座 + 斜放的黃銅圓盤 (外環四個刻度、指針 = 天窗間此刻的朝向)；星圖對上 (used) = 外環金線亮起 */
export function starScaleModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const R = d.w * 0.46;
  const cy = d.h * 0.62;
  g.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(0.08, 0.14, cy, 8), 0, cy / 2, 0), placed(box(d.w * 0.7, 0.08, d.d * 0.8), 0, 0.04, 0)]), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark }));
  const face = new THREE.Group();
  face.position.set(0, cy + R * 0.7, 0);
  face.rotation.x = -0.5;
  const ticks: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(R, R, 0.04, 28)];
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; ticks.push(placed(box(0.05, 0.05, 0.14), Math.sin(a) * R * 0.78, 0.03, -Math.cos(a) * R * 0.78, 0, -a, 0)); }
  const disc = p.mesh(mergeParts(ticks), pal.brass, { ...BRASS, flat: 0xd9b46a });
  disc.rotation.x = Math.PI / 2;
  const ring = p.mesh(new THREE.TorusGeometry(R * 1.02, 0.025, 6, 32), pal.goldDeep, { metalness: 0.6, roughness: 0.35, emissive: pal.gold, emissiveIntensity: 0, unique: true, outline: false });
  const needle = new THREE.Group();
  needle.add(p.mesh(mergeParts([placed(new THREE.ConeGeometry(0.05, R * 0.8, 4), 0, R * 0.4, 0), placed(new THREE.SphereGeometry(0.05, 6, 4), 0, 0, 0)]), 0x2c3fb0, { outline: false, shadow: false }));
  needle.position.z = 0.04;
  face.add(disc, ring, needle);
  g.add(face);
  const ringMat = ring.material as THREE.MeshStandardMaterial;
  let a = 0;
  const update = (c: ModelCtx) => {
    const lay = c.world.ext.cube?.layout?.sky;
    const rot = c.world.ext.cube?.rots?.sky ?? 0;
    // 天窗間在頂面心：指針 = 它此刻的朝向 (順時針一格 = −90°)；不在頂面心 = 指針垂下
    const target = lay && lay[2] === 2 && rot < 4 ? -rot * Math.PI / 2 : Math.PI;
    a = approach(a, target, c.dt * 3);
    needle.rotation.z = a;
    if (ringMat.emissiveIntensity !== undefined) ringMat.emissiveIntensity = approach(ringMat.emissiveIntensity, c.obj.used ? 0.8 : 0, c.dt * 1.5);
  };
  return { root: g, update };
}

/** 工作桌：桌面 + 四腳 + 橫撐 (一個合併網格，木紋) 與桌邊一排黃銅工具 (一個網格)；桌面高 = d.h */
export function workbenchModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const top = 0.08;
  const legH = d.h - top;
  const parts = [placed(box(d.w, top, d.d), 0, d.h - top / 2, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(placed(box(0.1, legH, 0.1), sx * (d.w / 2 - 0.12), legH / 2, sz * (d.d / 2 - 0.12)));
  for (const sz of [-1, 1]) parts.push(placed(box(d.w - 0.24, 0.06, 0.05), 0, legH * 0.3, sz * (d.d / 2 - 0.12)));
  g.add(p.mesh(mergeParts(parts), 0x6e4a30, { map: crateWood(pal), flat: 0x8a6440 }));
  // 桌邊的黃銅工具 (圓規、放大鏡的柄)：靠後緣、不擋縮影
  g.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6), d.w / 2 - 0.35, d.h + 0.015, -d.d / 2 + 0.16, 0, 0, Math.PI / 2), placed(new THREE.TorusGeometry(0.06, 0.012, 6, 16), d.w / 2 - 0.15, d.h + 0.013, -d.d / 2 + 0.16, Math.PI / 2, 0, 0)]), pal.brass, { ...BRASS, outline: false, shadow: false }));
  return { root: g };
}

/** 標籤「你」：只有標籤徽章 (只在藏寶圖)；畫在玩家頭頂右側 (縮小時跟著降低) */
export function selfTagModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  g.add(holder);
  const badge = labelBadge(p, d, theme, holder, new THREE.Vector3(0, 0, 0), 0.4);
  const update = (c: ModelCtx) => {
    const k = c.world.player.scale ?? 1;
    holder.position.set(0.55 * k + 0.2, 0.9 * k + 0.3, 0);
    badge(c);
  };
  return { root: g, update };
}
