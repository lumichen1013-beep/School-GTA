import * as THREE from 'three';
import type { ObjDef, World } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood, glyphGlow, notePaper } from '../textures';
import { mergeParts, placed } from '../geometry';
import { labelBadge, scaleCorner, scaleRatio } from './label';
import { rng } from './nursery';
import type { ModelCtx, PropModel } from './types';

// 3-4 溫室深處 (規格 6「3-4 溫室深處（細化）」) 的物件外觀：
// - 九格花窗 (lattice)：北牆上 3 × 3 的鐵框花窗。六格畫著那一格該有的東西的剪影 (彩繪玻璃畫，只在實景：月亮 ×2、磚 ×2、幼苗、樹根)；
//   三格空著，花窗架裝好後嵌上玻璃片 (只有一筆墨線)。藏寶圖只畫鐵框格線、嵌上的三格的墨線與解開後的「許」字 (1 秒緩入，不閃爍：9.1 光敏)
// - 花窗架 (paneFrame)：蜂蜜木的窗台下木架，正面三個玻璃片形的空槽 (嵌上 = 槽裡亮一片玻璃)；東端的小抽屜在「許」字亮了之後彈出
// - 抽屜裡的東西 (latticeBox)：銅鑰匙 + 摺起來的手記一頁 (拿走 = 消失；抽屜本身畫在花窗架上)
// - 巨根 (giantRoot)：從西牆鑽進來的樹幹粗根 + 爬滿苔窗的根鬚 + 苔；依有效尺寸以底部中心縮放 (縮小 = 根鬚離開窗、苔窗露出)
// - 舊的羅盤架 (oldCompass)：石墩 + 只剩黃銅外圈的羅盤架 (盤面不見了) + 磨亮的把手；藏寶圖裡一道淡灰藍的殘影在轉那根把手 (9.1 手法 A，純裝飾)
// - 長廊的柵門 (chaseGate)：兩扇鐵柵門 (直條 + 尖頭 + 橫檔)；花窗亮了 = 往長廊那一側開
// 同材質零件合成一個網格 (mergeParts)；共面規則 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const IRON = { metalness: 0.5, roughness: 0.55, outline: false } as const;
const BRASS = { metalness: 0.6, roughness: 0.4 } as const;
const BARK = 0x5a4636;
const BARK_DARK = 0x46362a;
const MOSS = 0x5f7d3a;
const STONE = 0x8c8470;
/** 花窗的彩繪玻璃色 (夜色裡的苔綠 / 琥珀 / 淡青；story-bible 8.2) 與剪影的墨色、玻璃片的色 */
const PANE_COLORS = [0x3e8a5a, 0xd9a441, 0x6aa84f, 0x9fe3d0, 0x3e8a5a, 0xd9a441] as const;
const SILHOUETTE = 0x24302a;
const SLOT_GLASS = 0x9fd8c0;
/** 「許」字的光色、最亮時的不透明度與緩入秒數 */
const GLYPH = 0xffe7a0;
const GLYPH_ALPHA = 0.9;
const GLYPH_SEC = 1;
/** 殘影的色與不透明度 (同 cs:ch2 的殘影) */
const SHADE = 0x8a96b0;
const SHADE_ALPHA = 0.4;

/** 一個圓 (ShapeGeometry；剪影零件) */
const disc = (r: number, x: number, y: number, z: number) => placed(new THREE.CircleGeometry(r, 18), x, y, z);

/**
 * 一格的剪影 (彩繪玻璃上的墨畫；格中心為原點、格寬 s)：empty = 月亮 (新月：亮盤 + 暗弧)、solid = 磚 (三排錯縫)、nursery = 幼苗、depths = 樹根
 */
function silhouette(kind: string, s: number, z: number): THREE.BufferGeometry[] {
  const k = s / 1.0;
  if (kind === 'empty') {
    // 新月：外弧 (環的一半) + 兩顆小星
    return [placed(new THREE.RingGeometry(0.2 * k, 0.3 * k, 18, 1, Math.PI * 0.35, Math.PI * 1.1), 0.04 * k, 0.04 * k, z), disc(0.03 * k, 0.28 * k, 0.28 * k, z), disc(0.025 * k, -0.3 * k, -0.25 * k, z)];
  }
  if (kind === 'solid') {
    const out: THREE.BufferGeometry[] = [];
    for (let row = 0; row < 3; row++) {
      const off = row % 2 ? 0.17 : 0;
      for (let i = -1; i <= 1; i++) {
        const x = (i * 0.34 + off) * k;
        if (Math.abs(x) > 0.36 * k) continue;
        out.push(placed(new THREE.PlaneGeometry(0.28 * k, 0.16 * k), x, (row - 1) * 0.22 * k, z));
      }
    }
    return out;
  }
  if (kind === 'nursery') {
    const leaf = (rz: number, x: number, y: number) => { const g = new THREE.CircleGeometry(0.1 * k, 12); g.scale(1.6, 0.6, 1); return placed(g, x, y, z, 0, 0, rz); };
    return [placed(new THREE.PlaneGeometry(0.04 * k, 0.42 * k), 0, -0.12 * k, z), leaf(0.5, 0.13 * k, 0.06 * k), leaf(-0.5, -0.13 * k, 0.14 * k), placed(new THREE.PlaneGeometry(0.5 * k, 0.06 * k), 0, -0.34 * k, z)];
  }
  // depths：樹根 (三條往下分岔的根)
  return [
    placed(new THREE.PlaneGeometry(0.1 * k, 0.4 * k), 0, 0.12 * k, z),
    placed(new THREE.PlaneGeometry(0.06 * k, 0.36 * k), -0.14 * k, -0.18 * k, z, 0, 0, -0.6),
    placed(new THREE.PlaneGeometry(0.06 * k, 0.36 * k), 0.14 * k, -0.18 * k, z, 0, 0, 0.6),
    placed(new THREE.PlaneGeometry(0.05 * k, 0.3 * k), 0, -0.26 * k, z)
  ];
}

/** 嵌上的玻璃片的一筆墨線 (三格各一筆：橫 / 斜 / 豎；藏寶圖也畫) */
const STROKES: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.06, 0.2], [0.42, 0.06, -0.7], [0.06, 0.48, 0]];

export function latticeModel(p: Painter, d: ObjDef, { pal, room2d }: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'lattice') return { root: g };
  const W = d.w, H = d.h, cs = W / 3, bar = 0.08;
  const cy = H / 2;
  // 鐵框 (外框 + 兩直兩橫)：兩個視角都畫 (藏寶圖的格線)
  const frame: THREE.BufferGeometry[] = [
    placed(box(W + bar, bar, 0.08), 0, H, 0.04), placed(box(W + bar, bar, 0.08), 0, 0, 0.04),
    placed(box(bar, H, 0.08), -W / 2, cy, 0.04), placed(box(bar, H, 0.08), W / 2, cy, 0.04)
  ];
  for (let i = 1; i < 3; i++) {
    frame.push(placed(box(bar * 0.8, H - bar, 0.07), -W / 2 + i * cs, cy, 0.045));
    frame.push(placed(box(W - bar, bar * 0.8, 0.07), 0, i * cs, 0.045));
  }
  g.add(p.mesh(mergeParts(frame), pal.iron, { metalness: 0.5, roughness: 0.55, flat: pal.outline }));
  // 窗外的夜色 (玻璃後面)
  const back = p.mesh(new THREE.PlaneGeometry(W, H), 0x1a2a22, { emissive: 0x1a2a22, emissiveIntensity: 0.4, outline: false, shadow: false, flat: room2d.paper });
  back.position.set(0, cy, 0.012);
  g.add(back);
  // 六格的彩繪玻璃 + 剪影 (只在實景)；三格玻璃片 (嵌上後才有；墨線兩邊都畫)
  const center = (i: number) => ({ x: -W / 2 + ((i % 3) + 0.5) * cs, y: H - (Math.floor(i / 3) + 0.5) * cs });
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  const ink: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  const strokes: THREE.BufferGeometry[] = [];
  let n = 0;
  d.cells.forEach((kind, i) => {
    const c = center(i);
    if (kind === 'any') {
      panes.push(placed(new THREE.PlaneGeometry(cs - bar, cs - bar), c.x, c.y, 0.026));
      const [sw, sh, rz] = STROKES[n++ % STROKES.length];
      strokes.push(placed(new THREE.PlaneGeometry(sw * cs, sh * cs), c.x, c.y, 0.041, 0, 0, rz));
      return;
    }
    const color = PANE_COLORS[i % PANE_COLORS.length];
    const list = byColor.get(color) ?? [];
    list.push(placed(new THREE.PlaneGeometry(cs - bar, cs - bar), c.x, c.y, 0.03));
    byColor.set(color, list);
    for (const s of silhouette(kind, cs * 0.9, 0)) ink.push(s.translate(c.x, c.y, 0.036));
  });
  const real = new THREE.Group();
  g.add(real);
  [...byColor].forEach(([color, parts], i) => {
    const m = p.mesh(mergeParts(parts), color, { opacity: 0.6, emissive: color, emissiveIntensity: 0.5, outline: false, shadow: false });
    m.position.z = i * 0.001;
    real.add(m);
  });
  real.add(p.mesh(mergeParts(ink), SILHOUETTE, { outline: false, shadow: false }));
  const installed = new THREE.Group();
  g.add(installed);
  const paneMesh = p.mesh(mergeParts(panes), SLOT_GLASS, { opacity: 0.55, emissive: SLOT_GLASS, emissiveIntensity: 0.35, outline: false, shadow: false, flat: room2d.paper });
  const strokeMesh = p.mesh(mergeParts(strokes), pal.outline, { outline: false, shadow: false, flat: pal.inkBlue });
  installed.add(paneMesh, strokeMesh);
  // 「許」字 (加色、不寫深度；1 秒緩入)
  let glyphMat: THREE.MeshBasicMaterial | null = null;
  let glyph: THREE.Mesh | null = null;
  let alpha = -1;
  const update = (c: ModelCtx) => {
    const is3d = c.mode === '3d';
    real.visible = is3d;
    paneMesh.visible = is3d;
    installed.visible = !!c.world.byId.get(d.frame)?.used;
    const goal = c.obj.used ? 1 : 0;
    if (goal && !glyph) {
      glyphMat = new THREE.MeshBasicMaterial({ map: glyphGlow(c.world.rt.text('lvl.3-4.lattice.glyph'), GLYPH), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      glyph = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, H * 0.9), glyphMat);
      glyph.position.set(0, cy, 0.06);
      glyph.renderOrder = 3;
      g.add(glyph);
    }
    // 第一次 = 直接到位 (讀檔 / 換房不重播)；之後每秒最多 1 / GLYPH_SEC
    alpha = alpha < 0 ? goal : alpha + Math.max(-c.dt / GLYPH_SEC, Math.min(c.dt / GLYPH_SEC, goal - alpha));
    if (glyph && glyphMat) { glyph.visible = alpha > 0.01; glyphMat.opacity = GLYPH_ALPHA * alpha; }
  };
  return { root: g, update };
}

/** 花窗架：蜂蜜木的窗台下木架 (台面 + 側板 + 背板 + 踢腳)、正面三個玻璃片形的空槽、東端會彈出的抽屜 */
export function paneFrameModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'paneFrame') return { root: g };
  const W = d.w, H = d.h, D = d.d;
  const wood = { map: crateWood(pal), flat: pal.shelf } as const;
  const body = p.mesh(mergeParts([
    placed(box(W, 0.06, D), 0, H - 0.03, 0),
    placed(box(0.06, H - 0.06, D - 0.04), -W / 2 + 0.03, (H - 0.06) / 2, 0), placed(box(0.06, H - 0.06, D - 0.04), W / 2 - 0.03, (H - 0.06) / 2, 0),
    placed(box(W - 0.12, H - 0.06, 0.04), 0, (H - 0.06) / 2, -D / 2 + 0.04),
    placed(box(W - 0.12, 0.1, 0.05), 0, 0.05, D / 2 - 0.05),
    placed(box(W - 0.12, 0.05, D - 0.1), 0, H * 0.45, 0)
  ]), pal.shelf, wood);
  g.add(body);
  // 正面板 (槽在上半部；抽屜口在東端) + 三個玻璃片形的空槽 (深色內凹) + 嵌上後的玻璃
  const front = p.mesh(placed(box(W - 0.14, H * 0.42, 0.03), 0, H * 0.7, D / 2 - 0.06), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  g.add(front);
  const slotX = [-0.55, -0.15, 0.25];
  const slots = p.mesh(mergeParts(slotX.map(x => placed(box(0.26, 0.32, 0.02), x, H * 0.7, D / 2 - 0.035))), 0x2a2018, { outline: false, shadow: false });
  const glass = p.mesh(mergeParts(slotX.map(x => placed(new THREE.PlaneGeometry(0.22, 0.28), x, H * 0.7, D / 2 - 0.023))), SLOT_GLASS, { emissive: SLOT_GLASS, emissiveIntensity: 0.45, outline: false, shadow: false });
  g.add(slots, glass);
  // 抽屜 (東端；關著 = 面板與正面板齊、彈出 = 往前 0.42)
  const drawer = new THREE.Group();
  const dx = 0.6, dy = 0.6;
  drawer.add(p.mesh(mergeParts([
    placed(box(0.5, 0.26, 0.03), 0, 0.13, 0.2), placed(box(0.5, 0.03, 0.4), 0, 0.015, 0),
    placed(box(0.03, 0.2, 0.4), -0.235, 0.1, 0), placed(box(0.03, 0.2, 0.4), 0.235, 0.1, 0)
  ]), pal.shelf, wood));
  const knob = p.mesh(new THREE.SphereGeometry(0.03, 8, 6), pal.brass, { ...BRASS, outline: false });
  knob.position.set(0, 0.14, 0.235);
  drawer.add(knob);
  drawer.position.set(dx, dy - 0.3, D / 2 - 0.27);
  g.add(drawer);
  const closedZ = D / 2 - 0.27;
  const openZ = closedZ + 0.42;
  let z = Number.NaN;
  const update = (c: ModelCtx) => {
    glass.visible = c.obj.used;
    const lat = c.obj.def.type === 'paneFrame' ? c.world.byId.get(c.obj.def.lattice) : undefined;
    const goal = lat?.used ? openZ : closedZ;
    z = Number.isNaN(z) ? goal : z + (goal - z) * Math.min(1, c.dt * 3);
    drawer.position.z = z;
  };
  return { root: g, update };
}

/** 抽屜裡的東西：一把銅鑰匙 + 摺起來的手記一頁 (原點 = 抽屜底) */
export function latticeBoxModel(p: Painter, _d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const key = p.mesh(mergeParts([
    placed(new THREE.TorusGeometry(0.05, 0.014, 6, 14), -0.12, 0.03, 0.02, Math.PI / 2, 0, 0),
    placed(box(0.16, 0.02, 0.025), 0.0, 0.03, 0.02), placed(box(0.02, 0.02, 0.05), 0.07, 0.03, 0.04), placed(box(0.02, 0.02, 0.035), 0.04, 0.03, 0.035)
  ]), pal.brass, BRASS);
  const page = p.mesh(placed(box(0.22, 0.012, 0.16), 0.08, 0.016, -0.06, 0, 0.25, 0), pal.paperNote, { map: notePaper(pal), flat: pal.paperNote, outline: false });
  g.add(key, page);
  return { root: g };
}

/**
 * 巨根：從西牆鑽進來 (根的西端伸進牆裡 = 卡榫)，粗如樹幹，往東彎進地裡；背後一束根鬚往上爬滿苔窗；根上的苔。
 * 本體依有效尺寸縮放 (以底部中心；scaleRatio)；名詞標籤 + 方槽 (2D)
 */
export function giantRootModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const W = d.w, H = d.h, D = d.d;
  const r = rng(131);
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-W / 2 - 0.2, H * 0.62, 0), new THREE.Vector3(-W * 0.25, H * 0.6, D * 0.05), new THREE.Vector3(W * 0.05, H * 0.42, D * 0.12),
    new THREE.Vector3(W * 0.3, H * 0.18, D * 0.08), new THREE.Vector3(W * 0.45, -0.05, 0)
  ]);
  const parts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(trunk, 30, H * 0.17, 10, false)];
  // 往下扎進土裡的兩條側根、往上爬滿窗的根鬚 (貼著西牆、蓋住苔窗：x ≈ 牆前)
  for (const [z0, z1] of [[-D * 0.35, -D * 0.5], [D * 0.35, D * 0.5]]) {
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-W * 0.2, H * 0.5, 0), new THREE.Vector3(-W * 0.05, H * 0.25, z0), new THREE.Vector3(W * 0.05, -0.04, z1)]), 14, H * 0.07, 7, false));
  }
  for (let i = 0; i < 6; i++) {
    const z = -D * 0.42 + (i / 5) * D * 0.84;
    const top = H * (1.25 + r() * 0.25);
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-W / 2 + 0.25, H * 0.6, z * 0.4), new THREE.Vector3(-W / 2 + 0.2, H * 0.95, z * 0.8), new THREE.Vector3(-W / 2 + 0.16 + r() * 0.05, top, z)
    ]), 10, 0.035 + r() * 0.02, 5, false));
  }
  body.add(p.mesh(mergeParts(parts), BARK, { roughness: 0.95 }));
  const knots: THREE.BufferGeometry[] = [placed(new THREE.SphereGeometry(H * 0.2, 9, 7), -W * 0.28, H * 0.62, 0), placed(new THREE.SphereGeometry(H * 0.12, 8, 6), W * 0.12, H * 0.38, D * 0.1)];
  body.add(p.mesh(mergeParts(knots), BARK_DARK, { roughness: 0.95, outline: false }));
  const moss: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const t = r();
    const pt = trunk.getPoint(0.1 + t * 0.7);
    const s = new THREE.SphereGeometry(0.12 + r() * 0.1, 7, 5);
    s.scale(1.4, 0.5, 1.2);
    moss.push(placed(s, pt.x, pt.y + H * 0.15, pt.z + (r() - 0.5) * 0.3));
  }
  body.add(p.mesh(mergeParts(moss), MOSS, { roughness: 1, outline: false }));
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, H + 0.45, D / 2), 0.5);
  const corner = scaleCorner(p, d, theme, g, 0.3);
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    badge(c);
    corner(c, at.set(W * k * 0.5 + 0.15, H * k, D * k * 0.5));
  };
  return { root: g, update };
}

/** 舊的羅盤架：石墩 + 黃銅外圈 (盤面不見了) + 磨亮的把手；藏寶圖裡一道殘影在轉把手 (純裝飾) */
export function oldCompassModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const H = d.h;
  const plinth = p.mesh(mergeParts([placed(new THREE.CylinderGeometry(0.3, 0.36, H * 0.62, 12), 0, H * 0.31, 0), placed(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 12), 0, H * 0.65, 0)]), STONE, { roughness: 0.95 });
  const ring = p.mesh(mergeParts([
    placed(new THREE.TorusGeometry(0.3, 0.035, 8, 24), 0, H * 0.72, 0, Math.PI / 2, 0, 0),
    placed(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), 0, H * 0.72, 0, 0, 0, Math.PI / 2),
    placed(box(0.06, 0.06, 0.06), 0, H * 0.7, 0)
  ]), pal.brass, BRASS);
  g.add(plinth, ring);
  const handle = new THREE.Group();
  handle.position.set(0, H * 0.74, 0);
  handle.add(p.mesh(mergeParts([placed(box(0.34, 0.035, 0.035), 0.17, 0.02, 0), placed(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), 0.33, 0.09, 0)]), 0xe8c070, { metalness: 0.8, roughness: 0.2 }));
  g.add(handle);
  // 殘影 (只在藏寶圖)：站在羅盤架東側、手搭在把手上
  const shadeMat = new THREE.MeshBasicMaterial({ color: SHADE, transparent: true, opacity: SHADE_ALPHA, depthWrite: false });
  const figure = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), shadeMat);
  head.position.set(0, 1.55, 0);
  const torso = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.8), shadeMat);
  torso.position.set(0, 1.0, 0);
  const legs = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.6), shadeMat);
  legs.position.set(0, 0.3, 0);
  const arm = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08), shadeMat);
  arm.position.set(-0.2, 0.86, 0);
  figure.add(head, torso, legs, arm);
  figure.position.set(0.7, 0, d.d / 2 + 0.12);
  g.add(figure);
  const update = (c: ModelCtx) => {
    const is2d = c.mode === '2d';
    figure.visible = is2d;
    // 把手慢慢轉 (殘影在轉；只在藏寶圖動，實景靜止)
    if (is2d && !c.calm) handle.rotation.y = c.t * 0.8;
  };
  return { root: g, update };
}

/** 長廊的柵門：兩扇鐵柵門 (各半個長廊寬；直條 + 尖頭 + 三道橫檔)，門柱在南北兩端；opensWhen 的物件 used = 往東 (長廊) 開 */
export function chaseGateModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  if (d.type !== 'chaseGate') return { root: g };
  const H = d.h, L = d.d / 2 - 0.12;
  const leaf = (dir: 1 | -1): THREE.Group => {
    const hinge = new THREE.Group();
    hinge.position.set(0, 0, dir * (d.d / 2 - 0.06));
    const parts: THREE.BufferGeometry[] = [];
    const n = Math.floor(L / 0.3);
    for (let i = 0; i <= n; i++) {
      const z = -dir * (0.08 + (i * (L - 0.16)) / n);
      parts.push(placed(new THREE.CylinderGeometry(0.03, 0.03, H - 0.25, 6), 0, (H - 0.25) / 2 + 0.06, z), placed(new THREE.ConeGeometry(0.06, 0.2, 6), 0, H - 0.1, z));
    }
    for (const y of [0.2, H * 0.5, H - 0.45]) parts.push(placed(box(0.08, 0.08, L - 0.04), 0, y, -dir * L / 2));
    hinge.add(p.mesh(mergeParts(parts), pal.iron, IRON));
    return hinge;
  };
  const north = leaf(-1), south = leaf(1);
  g.add(north, south);
  const posts = p.mesh(mergeParts([placed(box(0.22, H + 0.3, 0.22), 0, (H + 0.3) / 2, -d.d / 2 + 0.11), placed(box(0.22, H + 0.3, 0.22), 0, (H + 0.3) / 2, d.d / 2 - 0.11)]), STONE, { roughness: 0.9 });
  g.add(posts);
  let open = -1;
  const update = (c: ModelCtx) => {
    const target = c.obj.def.type === 'chaseGate' && isOpen(c.world, c.obj.def.opensWhen) ? 1 : 0;
    open = open < 0 ? target : open + (target - open) * Math.min(1, c.dt * 2);
    north.rotation.y = -open * 1.4;
    south.rotation.y = open * 1.4;
  };
  return { root: g, update };
}

const isOpen = (w: World, id: string): boolean => !!w.byId.get(id)?.used;
