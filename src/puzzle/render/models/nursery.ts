import * as THREE from 'three';
import type { ObjDef, ObjState, World } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood } from '../textures';
import { mergeParts, placed } from '../geometry';
import { labelBadge, scaleCorner, scaleRatio, tagLift } from './label';
import type { ModelCtx, PropModel } from './types';

// 3-1 苗圃 (彩繪玻璃溫室；規格 6「3-1 苗圃（細化）」、物件外觀規則) 的物件外觀：
// 花秤 (蜂蜜木底座 + 黃銅立柱 / 秤桿 / 兩個秤盤 + 從東秤臂經滑輪拉到花架門頂的繩)、陶盆 (釘在秤盤上；2D 重量點 + 縮放角標)、
// 花架門 (木格柵纏藤；拉起 = 往上升)、高育苗架 (只在實景)、樹根 (從北牆鑽進來；可量)、建築比例尺 (掛在西牆)、花窗玻璃片。
// 主題材質 (pal.shelf / shelfDark / brass / crate)；同材質零件合成一個網格 (mergeParts) 省繪製次數；共面規則 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const BRASS = { metalness: 0.6, roughness: 0.4 } as const;
const ROOT = 0x5a4636;
const ROOT_DARK = 0x46362a;
const LEAF = 0x5f8a3a;
const SOIL = 0x3b2a1e;
/** 滑輪高度 (繩子從東秤臂上去、橫過頭頂、再垂到花架門頂) */
const PULLEY_Y = 3.4;
/** 花架門拉起來的高度 */
const LIFT = 1.3;
/** 秤桿最大傾角 (弧度) */
const TILT = 0.16;

/** 固定種子亂數 (外觀一致) */
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * 盤上物件此刻的重量 (render 不能 import mechanics 的值：以有效尺寸換算，同 mechanics/scale weightOf——大 3 / 原 2 / 小 1)
 */
export function weightIn(world: World, id: string): number {
  const o = world.byId.get(id);
  if (!o || o.gone) return 0;
  const base = world.level.objects.find(d => d.id === id);
  const r = base && base.w > 0 ? o.def.w / base.w : 1;
  return r > 1.2 ? 3 : r < 0.8 ? 1 : o.def.weight ?? 2;
}

/** 秤桿此刻的傾角 (西重 = 正：西端往下)；balance 模型每幀更新，陶盆讀它跟著秤盤上下 */
const angles = new WeakMap<ObjState, number>();
/** 半座天平 (3-3a；models/night balanceHalfModel) 的秤盤此刻的高低：盤上的物件讀它跟著上下 */
export const halfPanDrop = new WeakMap<ObjState, number>();
/** 陶盆 → 它所在的天平與哪一側 (第一次找到後記住)；side 0 = 半座天平的那一盤 */
const panOf = new WeakMap<ObjState, { balance: ObjState; side: -1 | 0 | 1; arm: number }>();

function findPan(world: World, pot: ObjState): { balance: ObjState; side: -1 | 0 | 1; arm: number } | null {
  const hit = panOf.get(pot);
  if (hit) return hit;
  for (const o of world.objs) {
    if (o.def.type === 'balanceHalf' && o.def.pans.includes(pot.def.id)) {
      const v = { balance: o, side: 0 as const, arm: 0 };
      panOf.set(pot, v);
      return v;
    }
    if (o.def.type !== 'balance') continue;
    const side = o.def.pans.W.includes(pot.def.id) ? -1 : o.def.pans.E.includes(pot.def.id) ? 1 : 0;
    if (!side) continue;
    const v = { balance: o, side: side as -1 | 1, arm: Math.abs(pot.x - o.x) };
    panOf.set(pot, v);
    return v;
  }
  return null;
}

/** 秤盤此刻的高低 (相對水平時)：side = -1 西 / 1 東 */
const panDrop = (angle: number, side: -1 | 1, arm: number): number => side * arm * Math.sin(angle);
/** 盤上物件此刻相對水平時的高低 (兩種天平) */
const dropOf = (pan: { balance: ObjState; side: -1 | 0 | 1; arm: number }): number =>
  pan.side === 0 ? halfPanDrop.get(pan.balance) ?? 0 : panDrop(angles.get(pan.balance) ?? 0, pan.side, pan.arm);

/**
 * 花秤：蜂蜜木底座 (踢腳 + 黃銅包角) + 黃銅立柱與支點 + 秤桿 (依兩盤的重量傾斜，平滑轉過去) + 兩個秤盤 (三根吊桿)；
 * 東秤臂的繩子經兩個滑輪橫過頭頂、垂到花架門頂 (opens 指向的物件：秤往西倒 = 東臂抬起 = 門被拉起來)。兩個視角都看得到秤桿
 */
export function balanceModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const arm = 1.2;
  const beamY = 1.32;
  const panTop = 0.72;
  // 底座：木台 + 黃銅包角 (一個網格)
  const base = p.mesh(box(1.0, 0.14, 0.62), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  base.position.y = 0.07;
  // 黃銅：底座四個包角 + 立柱 + 頂上的支點座 (一個網格)
  const trimParts = [-1, 1].flatMap(sx => [-1, 1].map(sz => placed(box(0.08, 0.16, 0.08), sx * 0.47, 0.08, sz * 0.28)));
  const post = p.mesh(mergeParts([...trimParts, placed(new THREE.CylinderGeometry(0.05, 0.07, beamY - 0.14, 10), 0, 0.14 + (beamY - 0.14) / 2, 0), placed(box(0.16, 0.12, 0.16), 0, beamY - 0.02, 0)]), pal.brass, BRASS);
  g.add(base, post);
  // 秤桿 (支點在原點)：桿 + 兩端的吊鉤
  const beam = new THREE.Group();
  beam.position.y = beamY + 0.08;
  beam.add(p.mesh(mergeParts([placed(box(arm * 2 + 0.2, 0.06, 0.06), 0, 0, 0), placed(new THREE.SphereGeometry(0.05, 8, 6), -arm, 0, 0), placed(new THREE.SphereGeometry(0.05, 8, 6), arm, 0, 0), placed(new THREE.ConeGeometry(0.06, 0.16, 6), 0, 0.1, 0)]), pal.brass, BRASS));
  g.add(beam);
  // 兩個秤盤 (淺盤 + 三根吊桿，一個網格)：跟著秤臂端點上下
  const pans = ([-1, 1] as const).map(side => {
    const pan = new THREE.Group();
    const rodLen = beam.position.y - panTop;
    const rods = [0, 1, 2].map(i => {
      const a = (i / 3) * Math.PI * 2;
      return placed(new THREE.CylinderGeometry(0.008, 0.008, rodLen, 4), Math.cos(a) * 0.15, panTop + rodLen / 2, Math.sin(a) * 0.15);
    });
    pan.add(p.mesh(mergeParts([placed(new THREE.CylinderGeometry(0.34, 0.3, 0.05, 18), 0, panTop - 0.025, 0), ...rods]), pal.brass, BRASS));
    pan.position.x = side * arm;
    g.add(pan);
    return { pan, side };
  });
  // 繩子：東臂上方的滑輪 → 橫過頭頂 → 花架門頂的滑輪 (位置要等世界裡找到花架門才知道；第一次 update 時建)
  let cord: THREE.Object3D | null = null;
  const drop = p.mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), 0xd8c9a0, { outline: false, shadow: false });
  g.add(drop);
  let angle = 0;
  const update = (c: ModelCtx) => {
    const o = c.obj;
    if (o.def.type !== 'balance') return;
    const wW = o.def.pans.W.reduce((n, id) => n + weightIn(c.world, id), 0);
    const wE = o.def.pans.E.reduce((n, id) => n + weightIn(c.world, id), 0);
    const goal = wW > wE ? TILT : wW < wE ? -TILT : 0;
    angle += (goal - angle) * Math.min(1, c.dt * 6);
    angles.set(o, angle);
    beam.rotation.z = angle;
    for (const { pan, side } of pans) pan.position.y = panDrop(angle, side, arm);
    // 東臂端點 → 東滑輪的那一段 (秤臂上下時伸縮)
    const endY = beam.position.y + Math.sin(angle) * arm;
    drop.scale.y = Math.max(0.05, PULLEY_Y - endY);
    drop.position.set(arm, (PULLEY_Y + endY) / 2, 0);
    if (!cord && o.def.opens) {
      const t = c.world.byId.get(o.def.opens);
      if (t) {
        const tx = t.x - o.x, tz = t.z - o.z;
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(arm, PULLEY_Y, 0), new THREE.Vector3((arm + tx) / 2, PULLEY_Y + 0.08, tz / 2), new THREE.Vector3(tx, PULLEY_Y, tz)]);
        const line = p.mesh(new THREE.TubeGeometry(curve, 10, 0.012, 4, false), 0xd8c9a0, { outline: false, shadow: false });
        const wheels = p.mesh(mergeParts([placed(new THREE.TorusGeometry(0.07, 0.02, 6, 12), arm, PULLEY_Y + 0.07, 0), placed(new THREE.TorusGeometry(0.07, 0.02, 6, 12), tx, PULLEY_Y + 0.07, tz)]), pal.brass, { ...BRASS, outline: false });
        cord = new THREE.Group();
        cord.add(line, wheels);
        g.add(cord);
      }
    }
  };
  return { root: g, update };
}

/**
 * 陶盆 (釘在秤盤上)：赤陶盆身 + 盆口 + 土 + 一株苗；本體依有效尺寸縮放 (底部中心；標籤不跟著縮)、跟著秤盤上下。
 * shape 'can' = 澆水壺 (錫色壺身 + 斜上的壺嘴 + 蓮蓬頭 + 弓形把手；3-3a 釘在半座天平的盤上)；'trough' = 長陶槽 (沿 z 的長方槽 + 槽內一排苗；3-3c)。
 * 藏寶圖：標籤 + 方槽 (有 label 才畫)、縮放角標「大 / 小」、在秤盤上時盆上方三個重量點 (實心 = 此刻的重量；規格 7.2 天平顯示重量)
 */
export function potModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shape = d.type === 'pot' ? d.shape : undefined;
  if (shape === 'can') canBody(p, d, body);
  else if (shape === 'trough') troughBody(p, d, theme, body);
  else potBody(p, d, theme, body);
  const badge = d.label ? labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h + (shape === 'trough' ? 0.8 : 1.1), shape === 'trough' ? d.d / 2 : 0.12), 0.42) : null;
  const corner = scaleCorner(p, d, theme, g, 0.26);
  // 重量點 (只在藏寶圖、只在秤盤上)：三格，前 n 格實心、其餘空心；每種重量 (1～3) 一個合併網格，只切可見性
  const dots = new THREE.Group();
  g.add(dots);
  const rows = [1, 2, 3].map(n => {
    const m = p.mesh(mergeParts([0, 1, 2].map(i => placed(i < n ? new THREE.CircleGeometry(0.055, 14) : new THREE.RingGeometry(0.035, 0.055, 14), (i - 1) * 0.16, 0, 0))), pal.inkBlue, { outline: false, shadow: false });
    dots.add(m);
    return m;
  });
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    const pan = findPan(c.world, c.obj);
    const dy = pan ? dropOf(pan) : 0;
    body.position.y = dy;
    badge?.(c);
    const top = d.h * k + dy;
    corner(c, at.set(d.w * k * 0.5 + 0.12, top - 0.05, d.d * k * 0.5 + 0.02));
    dots.visible = c.mode === '2d' && !!pan;
    if (dots.visible) {
      const n = weightIn(c.world, c.obj.def.id);
      rows.forEach((m, i) => { m.visible = i + 1 === n; });
      dots.position.set(0, top + 0.5 + tagLift(d), d.d * k * 0.5 + 0.05);
    }
  };
  return { root: g, update };
}

/** 陶盆的本體 (原尺寸；potModel 依有效尺寸縮放) */
function potBody(p: Painter, d: ObjDef, { pal }: Theme, body: THREE.Group): void {
  const r = rng(Math.round(d.x * 31 + 7));
  const H = d.h * 0.82;
  const shell = p.mesh(new THREE.CylinderGeometry(d.w / 2, d.w * 0.36, H, 16), pal.crate, { roughness: 0.9 });
  shell.position.y = H / 2;
  const rim = p.mesh(new THREE.CylinderGeometry(d.w / 2 + 0.03, d.w / 2 + 0.03, 0.07, 16), pal.crateDark, { roughness: 0.9, outline: false });
  rim.position.y = H - 0.02;
  const soil = p.mesh(new THREE.CylinderGeometry(d.w / 2 - 0.03, d.w / 2 - 0.03, 0.03, 14), SOIL, { outline: false, shadow: false });
  soil.position.y = H - 0.035;
  const leaves: THREE.BufferGeometry[] = [placed(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 5), 0, H + 0.13, 0)];
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.SphereGeometry(0.1, 7, 5);
    leaf.scale(1, 0.5, 0.75);
    leaves.push(placed(leaf, (r() - 0.5) * 0.18, H + 0.2 + r() * 0.16, (r() - 0.5) * 0.14, 0, r() * Math.PI, 0));
  }
  const plant = p.mesh(mergeParts(leaves), LEAF, { roughness: 0.9, outline: false });
  body.add(shell, rim, soil, plant);
}

/** 澆水壺的錫色 */
const PEWTER = 0x8d9592;
/** 澆水壺：壺身 (略收口的圓筒) + 頂蓋 + 從壺身往 +x 斜上的壺嘴與蓮蓬頭 + 往 -x 的弓形把手；一個網格 (同材質) */
function canBody(p: Painter, d: ObjDef, body: THREE.Group): void {
  const R = Math.min(d.d / 2, d.w * 0.3), H = d.h * 0.7;
  const spout = new THREE.CylinderGeometry(0.022, 0.03, d.w * 0.5, 8);
  const rose = new THREE.CylinderGeometry(0.06, 0.03, 0.06, 10);
  const parts = [
    placed(new THREE.CylinderGeometry(R * 0.92, R, H, 16), -d.w * 0.12, H / 2, 0),
    placed(new THREE.CylinderGeometry(R * 0.5, R * 0.92, 0.06, 16), -d.w * 0.12, H + 0.03, 0),
    placed(spout, -d.w * 0.12 + R * 0.6 + d.w * 0.18, H * 0.55 + d.w * 0.16, 0, 0, 0, -0.95),
    placed(rose, d.w * 0.5 - 0.05, H * 0.55 + d.w * 0.34, 0, 0, 0, -0.95),
    placed(new THREE.TorusGeometry(H * 0.42, 0.018, 6, 14, Math.PI), -d.w * 0.12 - R * 0.35, H * 0.62, 0, 0, 0, Math.PI / 2 + 0.5)
  ];
  body.add(p.mesh(mergeParts(parts), PEWTER, { metalness: 0.5, roughness: 0.45 }));
}

/** 長陶槽：沿 z 的長方槽 (底 + 四壁；赤陶) + 土 + 槽內一排苗 */
function troughBody(p: Painter, d: ObjDef, { pal }: Theme, body: THREE.Group): void {
  const r = rng(Math.round(d.z * 29 + 11));
  const t = 0.07, W = d.w, H = d.h, D = d.d;
  const shell = [
    placed(box(W, 0.08, D), 0, 0.04, 0),
    placed(box(t, H - 0.08, D), -W / 2 + t / 2, 0.08 + (H - 0.08) / 2, 0), placed(box(t, H - 0.08, D), W / 2 - t / 2, 0.08 + (H - 0.08) / 2, 0),
    placed(box(W - t * 2, H - 0.08, t), 0, 0.08 + (H - 0.08) / 2, -D / 2 + t / 2), placed(box(W - t * 2, H - 0.08, t), 0, 0.08 + (H - 0.08) / 2, D / 2 - t / 2)
  ];
  body.add(p.mesh(mergeParts(shell), pal.crate, { roughness: 0.9 }));
  // 上緣一圈深色口沿 (比壁寬 1 cm、高出 1 cm：不與壁頂共面)
  const lip = [
    placed(box(t + 0.02, 0.04, D + 0.02), -W / 2 + t / 2, H - 0.01, 0), placed(box(t + 0.02, 0.04, D + 0.02), W / 2 - t / 2, H - 0.01, 0),
    placed(box(W - t * 2 - 0.004, 0.04, t + 0.02), 0, H - 0.01, -D / 2 + t / 2), placed(box(W - t * 2 - 0.004, 0.04, t + 0.02), 0, H - 0.01, D / 2 - t / 2)
  ];
  body.add(p.mesh(mergeParts(lip), pal.crateDark, { roughness: 0.9, outline: false }));
  const soil = p.mesh(box(W - t * 2 - 0.01, 0.04, D - t * 2 - 0.01), SOIL, { outline: false, shadow: false });
  soil.position.y = H - 0.1;
  body.add(soil);
  body.add(p.mesh(mergeParts(sprouts(r, D - 0.3, H - 0.08)), LEAF, { roughness: 0.9, outline: false }));
}

/** 沿 z 一排幼苗 (槽內；長度 len、土面高 y) */
export function sprouts(r: () => number, len: number, y: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(len / 0.4));
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (len * (i + 0.5)) / n;
    out.push(placed(new THREE.CylinderGeometry(0.012, 0.016, 0.18, 4), 0, y + 0.09, z));
    for (let k = 0; k < 2; k++) {
      const lf = new THREE.SphereGeometry(0.08, 6, 4);
      lf.scale(1, 0.45, 0.7);
      out.push(placed(lf, (r() - 0.5) * 0.14, y + 0.17 + r() * 0.06, z + (r() - 0.5) * 0.1, 0, r() * Math.PI, 0));
    }
  }
  return out;
}

/**
 * 花架門：木框 (兩根門柱 + 上下橫檔) + 斜格柵 + 纏繞的藤；門頂的繩往上接到滑輪。拉起來 (used) = 整扇門往上升 (平滑)。
 * 門沿 z 擺 (w = 厚、d = 寬)
 */
export function trellisModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const leaf = new THREE.Group();
  g.add(leaf);
  const W = d.d, H = d.h, T = d.w;
  // 後端離北牆 12 cm (不與牆腳的踢腳 / 護牆板正面共面)
  const z0 = -W / 2 + 0.12, z1 = W / 2, zc = (z0 + z1) / 2, L = z1 - z0;
  const frame: THREE.BufferGeometry[] = [
    placed(box(T, H, 0.1), 0, H / 2, z0 + 0.05), placed(box(T, H, 0.1), 0, H / 2, z1 - 0.05),
    placed(box(T, 0.1, L - 0.2), 0, H - 0.05, zc), placed(box(T, 0.1, L - 0.2), 0, 0.12, zc)
  ];
  leaf.add(p.mesh(mergeParts(frame), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark }));
  // 格柵 (直條 + 橫條，只鋪在門框內；比框薄、比框內緣短 2 cm：不與框共面)
  const lattice: THREE.BufferGeometry[] = [];
  const cols = Math.max(3, Math.round((L - 0.2) / 0.32));
  for (let i = 1; i < cols; i++) lattice.push(placed(box(T - 0.06, H - 0.27, 0.04), 0, 0.17 + (H - 0.27) / 2, z0 + 0.1 + (i * (L - 0.2)) / cols));
  const rows = Math.max(3, Math.round((H - 0.27) / 0.32));
  for (let k = 1; k < rows; k++) lattice.push(placed(box(T - 0.08, 0.04, L - 0.24), 0, 0.17 + (k * (H - 0.27)) / rows, zc));
  leaf.add(p.mesh(mergeParts(lattice), pal.shelf, { outline: false }));
  // 藤 (從門柱纏上門頂)
  const vine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(T / 2 + 0.03, 0.1, -W / 2 + 0.1), new THREE.Vector3(T / 2 + 0.04, H * 0.45, -W / 4), new THREE.Vector3(T / 2 + 0.03, H * 0.7, 0.1),
    new THREE.Vector3(T / 2 + 0.05, H - 0.1, W / 3), new THREE.Vector3(T / 2 + 0.04, H * 0.8, W / 2 - 0.1)
  ]);
  leaf.add(p.mesh(new THREE.TubeGeometry(vine, 24, 0.04, 5, false), 0x6e7f3a, { outline: false, shadow: false }));
  // 門頂到滑輪的繩 (門升起時縮短)
  const rope = p.mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), 0xd8c9a0, { outline: false, shadow: false });
  g.add(rope);
  let lift = -1;
  const update = (c: ModelCtx) => {
    const goal = c.obj.used ? LIFT : 0;
    lift = lift < 0 ? goal : lift + (goal - lift) * Math.min(1, c.dt * 3);
    leaf.position.y = lift;
    const top = H + lift;
    rope.scale.y = Math.max(0.05, PULLEY_Y - top);
    rope.position.set(0, (PULLEY_Y + top) / 2, 0);
  };
  return { root: g, update };
}

/** 高育苗架 (只在實景；擋住實景從南邊繞進樹根角)：四根腳 + 三層板 + 板上一排小陶盆與苗；擋在鏡頭與樹根角之間時淡出 (occluders，材質獨立) */
export function pottingShelfModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const r = rng(Math.round(d.x * 17 + 3));
  const wood: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(placed(box(0.07, d.h, 0.07), sx * (d.w / 2 - 0.05), d.h / 2, sz * (d.d / 2 - 0.05)));
  const levels = [0.45, 1.0, d.h - 0.04];
  for (const y of levels) wood.push(placed(box(d.w, 0.05, d.d), 0, y, 0));
  const frame = p.mesh(mergeParts(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf, unique: true });
  g.add(frame);
  const pots: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  for (const y of levels) {
    const n = Math.floor(d.w / 0.45);
    for (let i = 0; i < n; i++) {
      if (r() < 0.25) continue;
      const x = -d.w / 2 + 0.25 + ((d.w - 0.5) * (i + 0.5)) / n;
      pots.push(placed(new THREE.CylinderGeometry(0.1, 0.075, 0.18, 10), x, y + 0.115, 0));
      for (let k = 0; k < 2; k++) {
        const lf = new THREE.SphereGeometry(0.08, 6, 4);
        lf.scale(1, 0.5, 0.8);
        leaves.push(placed(lf, x + (r() - 0.5) * 0.1, y + 0.27 + r() * 0.08, (r() - 0.5) * 0.1, 0, r() * Math.PI, 0));
      }
    }
  }
  const potMesh = p.mesh(mergeParts(pots), pal.crate, { roughness: 0.9, outline: false, unique: true });
  const leafMesh = p.mesh(mergeParts(leaves), LEAF, { roughness: 0.9, outline: false, unique: true });
  g.add(potMesh, leafMesh);
  return { root: g, occluders: [frame, potMesh, leafMesh] };
}

/**
 * 樹根：從北牆裡鑽出來的一條粗根 (拱起、再扎進地裡) + 兩條細根 + 根瘤；本體依有效尺寸縮放 (底部中心)。
 * 原尺寸時根的後段穿進北牆 (= 伸進軌道)；縮小後整條都在牆內這一側。藏寶圖：標籤「樹根」+ 方槽、縮放角標
 */
export function rootModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const D = d.d, H = d.h;
  const main = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.1, H * 0.55, -D / 2 - 0.1), new THREE.Vector3(0, H * 0.85, -D / 4), new THREE.Vector3(-0.05, H * 0.75, D / 8),
    new THREE.Vector3(0.05, H * 0.35, D * 0.36), new THREE.Vector3(0.1, -0.05, D / 2)
  ]);
  const sideA = new THREE.CatmullRomCurve3([new THREE.Vector3(0, H * 0.7, -D / 6), new THREE.Vector3(-d.w * 0.4, H * 0.4, 0), new THREE.Vector3(-d.w * 0.5, -0.04, D * 0.2)]);
  const sideB = new THREE.CatmullRomCurve3([new THREE.Vector3(0, H * 0.6, D / 10), new THREE.Vector3(d.w * 0.38, H * 0.3, D * 0.18), new THREE.Vector3(d.w * 0.46, -0.04, D * 0.3)]);
  const bark = p.mesh(mergeParts([
    new THREE.TubeGeometry(main, 28, d.w * 0.26, 8, false),
    new THREE.TubeGeometry(sideA, 14, d.w * 0.11, 6, false),
    new THREE.TubeGeometry(sideB, 14, d.w * 0.1, 6, false)
  ]), ROOT, { roughness: 0.95 });
  const knots = p.mesh(mergeParts([placed(new THREE.SphereGeometry(d.w * 0.3, 8, 6), 0, H * 0.8, -D / 5), placed(new THREE.SphereGeometry(d.w * 0.2, 7, 5), 0.02, H * 0.55, D * 0.28)]), ROOT_DARK, { roughness: 0.95, outline: false });
  body.add(bark, knots);
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, H + 0.45, D / 2), 0.46);
  const corner = scaleCorner(p, d, theme, g, 0.3);
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    badge(c);
    corner(c, at.set(d.w * k * 0.5 + 0.15, H * k, D * k * 0.5));
  };
  return { root: g, update };
}

/** 建築比例尺：掛在西牆的黃銅鉤上，兩片木尺 (刻度畫成深色細線) 微微張開成 V；拿走 = 消失 (gone) */
export function rulerModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const L = d.h * 0.9;
  const leaves = p.mesh(mergeParts([placed(box(0.05, L, 0.12), 0.02, d.h - L / 2 - 0.06, -0.05, 0, 0, 0.12), placed(box(0.05, L, 0.12), 0.02, d.h - L / 2 - 0.06, 0.05, 0, 0, -0.04)]), 0xd9b77a, { map: crateWood(pal), flat: 0xd9b77a });
  const ticks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) ticks.push(placed(box(0.012, 0.012, i % 2 ? 0.05 : 0.09), 0.052, d.h - 0.16 - i * (L - 0.12) / 9, 0.05));
  const marks = p.mesh(mergeParts(ticks), pal.outline, { outline: false, shadow: false });
  const hook = p.mesh(mergeParts([placed(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), 0, d.h - 0.02, 0, 0, Math.PI / 2, 0), placed(box(0.04, 0.06, 0.08), -0.05, d.h, 0)]), pal.brass, { ...BRASS, outline: false });
  g.add(leaves, marks, hook);
  return { root: g };
}

/** 花窗玻璃片：斜靠在樹根前的一片彩繪玻璃 (鉛條框 + 兩塊色玻璃)；3-1b 完成才在場 (mechanics/nursery hidden) */
export function paneModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const lean = new THREE.Group();
  lean.rotation.x = -0.35;
  g.add(lean);
  const W = d.w, H = d.h;
  const lead = p.mesh(mergeParts([
    placed(box(W, 0.03, 0.03), 0, H, 0), placed(box(W, 0.03, 0.03), 0, 0.015, 0),
    placed(box(0.03, H, 0.03), -W / 2, H / 2, 0), placed(box(0.03, H, 0.03), W / 2, H / 2, 0), placed(box(0.025, H, 0.025), 0.04, H / 2, 0, 0, 0, 0.3)
  ]), pal.trim, { metalness: 0.4, roughness: 0.6 });
  const glassA = p.mesh(new THREE.PlaneGeometry(W / 2, H - 0.03), 0x3e8a5a, { opacity: 0.7, emissive: 0x3e8a5a, emissiveIntensity: 0.4, outline: false, shadow: false, side: THREE.DoubleSide });
  glassA.position.set(-W / 4, H / 2, 0.004);
  const glassB = p.mesh(new THREE.PlaneGeometry(W / 2, H - 0.03), 0xd9a441, { opacity: 0.7, emissive: 0xd9a441, emissiveIntensity: 0.4, outline: false, shadow: false, side: THREE.DoubleSide });
  glassB.position.set(W / 4, H / 2, 0.006);
  lean.add(lead, glassA, glassB);
  return { root: g };
}
