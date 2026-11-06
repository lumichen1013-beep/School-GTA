import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood } from '../textures';
import { mergeParts, placed } from '../geometry';
import type { ModelCtx, PropModel } from './types';

// 控制盤 (v0.4 N32) 的外觀：魔方儀 (閱讀架上的黃銅小魔方：2×3 的小方塊，啟動後慢慢轉)、園丁羅盤 (第三章：工作台上的銅盤、3×3 小陶盆格)
// 與鎖扣開關 (後牆的黃銅把手，拉下 = used)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 魔方儀：胡桃木圓几 (圓盤底座 + 車旋柱 + 圓桌面、黃銅包邊) + 黃銅渾儀環 + 2×3 小方塊；已啟動 (ext.dial.active) → 方塊組慢慢轉、上排不時滑一格 */
export function dialModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  if (d.type === 'dial' && d.chapter === 3) return compassModel(p, d, theme);
  if (d.type === 'dial' && d.chapter === 4) return rootDialModel(p, d, theme);
  const { pal } = theme;
  const g = new THREE.Group();
  const standH = d.h * 0.55;
  const brass = { metalness: 0.7, roughness: 0.3 } as const;
  const foot = p.mesh(new THREE.CylinderGeometry(d.w * 0.3, d.w * 0.36, 0.08, 20), pal.shelfDark);
  foot.position.y = 0.04;
  const col = p.mesh(new THREE.CylinderGeometry(0.06, 0.09, standH - 0.15, 12), pal.shelf, { outline: false });
  col.position.y = 0.08 + (standH - 0.15) / 2;
  const knot = p.mesh(new THREE.SphereGeometry(0.1, 12, 8), pal.shelfDark, { outline: false });
  knot.position.y = standH * 0.45;
  const top = p.mesh(new THREE.CylinderGeometry(d.w * 0.42, d.w * 0.4, 0.07, 24), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  top.position.y = standH - 0.035;
  const rim = p.mesh(new THREE.TorusGeometry(d.w * 0.42, 0.018, 6, 32), pal.brass, { ...brass, outline: false });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = standH - 0.01;
  const ring = p.mesh(new THREE.TorusGeometry(d.w * 0.32, 0.03, 8, 28), pal.brass, brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = standH + 0.06;
  // 渾儀的經環：立在水平環上、包住方塊組
  const meridian = p.mesh(new THREE.TorusGeometry(d.w * 0.36, 0.016, 6, 32), pal.goldDeep, { ...brass, outline: false });
  meridian.position.y = standH + 0.37;
  meridian.rotation.y = 0.6;
  const pin = p.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), pal.brass, { ...brass, outline: false });
  pin.position.y = standH + 0.04;
  g.add(foot, col, knot, top, rim, ring, meridian, pin);
  const cubes = new THREE.Group();
  cubes.position.y = standH + 0.12 + 0.2;
  const s = 0.17;
  const cells: THREE.Mesh[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    const c = p.mesh(box(s, s, s), (x + y) % 2 ? pal.brass : pal.gold, { metalness: 0.65, roughness: 0.35 });
    // 相鄰兩格高低差 4 mm：轉成斜的時頂面 / 底面的包圍框會重疊，錯開才不共面 (z-fighting)
    c.position.set((x - 1) * (s + 0.02), (1 - y) * (s + 0.02) - 0.1 + ((x + y) % 2) * 0.004, 0);
    cubes.add(c);
    cells.push(c);
  }
  g.add(cubes);
  const update = (c: ModelCtx) => {
    const on = !!c.world.ext.dial?.active;
    cubes.rotation.y = on ? c.t * 0.6 : 0.35;
    // 啟動後上排每 3 秒滑一格 (示意列轉；只動畫，不影響邏輯)
    const k = on ? (c.t % 3) / 3 : 0;
    const slide = k > 0.8 ? (k - 0.8) / 0.2 : 0;
    for (let x = 0; x < 3; x++) cells[x].position.x = ((((x + slide) % 3) + 3) % 3 - 1) * (s + 0.02);
  };
  return { root: g, update };
}

/** 鎖扣開關：後牆的黃銅底板 + 把手；拉下 (used) → 把手轉向下 */
export function latchModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const plate = p.mesh(box(d.w, d.h, 0.06), pal.brass, { metalness: 0.6, roughness: 0.4 });
  plate.position.set(0, d.h / 2, -d.d / 2 + 0.03);
  const pivot = new THREE.Group();
  pivot.position.set(0, d.h * 0.55, -d.d / 2 + 0.08);
  const arm = p.mesh(box(0.08, d.h * 0.5, 0.08), pal.metal, { metalness: 0.5, roughness: 0.5 });
  arm.position.y = d.h * 0.25;
  const knob = p.mesh(new THREE.SphereGeometry(0.08, 12, 10), pal.gold, { metalness: 0.7, roughness: 0.3 });
  knob.position.y = d.h * 0.5;
  pivot.add(arm, knob);
  g.add(plate, pivot);
  let angle = 0;
  const update = (c: ModelCtx) => {
    const target = c.obj.used ? Math.PI * 0.85 : 0;
    angle += (target - angle) * Math.min(1, c.dt * 8);
    pivot.rotation.x = angle;
  };
  return { root: g, update };
}

/** 園丁羅盤的植物色 (每間房一種，依房間 id 排序分配) */
const PLANT_COLORS = [0x5f8a3a, 0x3e8a5a, 0x7a9a4a, 0x46705e, 0x6e7f3a, 0x8aa84f] as const;

/**
 * 園丁羅盤 (第三章；story-bible 5.1b)：胡桃木工作台 (桌裙、橫撐、下層一排小陶盆) + 台上的黃銅圓盤，盤上 3 × 3 的格子照此刻的排列擺
 * (每間房 = 一個種著植物的小陶盆、fixedCells = 黃銅方塊、其餘 = 空格)；把手纏著藤。排列改了 (轉動 / 回退) → 小陶盆滑到新格；啟動後把手慢慢轉
 */
export function compassModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const topY = 0.85;
  const W = d.w, D = d.d;
  const brass = { metalness: 0.7, roughness: 0.3 } as const;
  // 工作台 (同材質合成一個網格)
  const wood = [
    placed(box(W, 0.06, D), 0, topY - 0.03, 0),
    placed(box(W - 0.12, 0.12, 0.04), 0, topY - 0.12, D / 2 - 0.06), placed(box(W - 0.12, 0.12, 0.04), 0, topY - 0.12, -D / 2 + 0.06),
    placed(box(W - 0.16, 0.04, D - 0.16), 0, 0.26, 0)
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(placed(box(0.07, topY - 0.06, 0.07), sx * (W / 2 - 0.08), (topY - 0.06) / 2, sz * (D / 2 - 0.08)));
  g.add(p.mesh(mergeParts(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf }));
  // 下層的小陶盆
  const lowPots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) lowPots.push(placed(new THREE.CylinderGeometry(0.09, 0.07, 0.16, 10), -W / 2 + 0.3 + i * 0.32, 0.36, 0.05 * (i % 2)));
  g.add(p.mesh(mergeParts(lowPots), pal.crate, { outline: false, roughness: 0.9 }));
  // 黃銅圓盤 + 外圈 + 3 × 3 格線
  const R = Math.min(W, D) * 0.46;
  const disc = p.mesh(new THREE.CylinderGeometry(R, R * 1.02, 0.05, 32), pal.brass, brass);
  disc.position.set(-0.12, topY + 0.025, 0);
  g.add(disc);
  const cell = (R * 1.3) / 3;
  const lines: THREE.BufferGeometry[] = [placed(new THREE.TorusGeometry(R * 0.98, 0.012, 6, 32), 0, 0.052, 0, Math.PI / 2)];
  for (let k = 0; k <= 3; k++) {
    const o = -1.5 * cell + k * cell;
    lines.push(placed(box(cell * 3, 0.006, 0.008), 0, 0.053, o), placed(box(0.008, 0.006, cell * 3), o, 0.053, 0));
  }
  const grid = p.mesh(mergeParts(lines), pal.goldDeep, { ...brass, outline: false, shadow: false });
  grid.position.copy(disc.position);
  g.add(grid);
  const at = (x: number, y: number) => new THREE.Vector3(disc.position.x + (x - 1) * cell, topY + 0.05, (y - 1) * cell);
  // 實心格：兩塊黃銅方塊
  const fixed = d.type === 'dial' ? d.fixedCells ?? [] : [];
  if (fixed.length) {
    const blocks = fixed.map(([x, y]) => { const v = at(x, y); return placed(box(cell * 0.8, 0.08, cell * 0.8), v.x, v.y + 0.04, v.z); });
    g.add(p.mesh(mergeParts(blocks), pal.goldDeep, { ...brass, outline: false }));
  }
  // 把手 (盤的東側) + 纏在把手上的藤
  const crank = new THREE.Group();
  crank.position.set(disc.position.x + R + 0.02, topY + 0.04, 0);
  const arm = p.mesh(mergeParts([placed(box(0.16, 0.025, 0.03), 0.08, 0, 0), placed(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), 0.16, 0.07, 0)]), pal.brass, { ...brass, outline: false });
  const helix = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(0.16 + 0.03 * Math.cos(i * 1.6), 0.02 + i * 0.016, 0.03 * Math.sin(i * 1.6))));
  const vine = p.mesh(new THREE.TubeGeometry(helix, 24, 0.008, 4, false), 0x6e7f3a, { outline: false, shadow: false });
  crank.add(arm, vine);
  g.add(crank);
  // 每間房一個小陶盆 (盆 + 植物)；位置由 ext.cube.layout 決定，排列改了就滑過去
  const pots = new Map<string, THREE.Group>();
  const potFor = (room: string, i: number): THREE.Group => {
    const pg = new THREE.Group();
    const pot = p.mesh(new THREE.CylinderGeometry(cell * 0.32, cell * 0.24, cell * 0.42, 10), pal.crate, { outline: false, roughness: 0.9 });
    pot.position.y = cell * 0.21;
    const leafG = new THREE.SphereGeometry(cell * 0.3, 8, 6);
    leafG.scale(1, 0.7 + (i % 3) * 0.25, 1);
    const leaf = p.mesh(leafG, PLANT_COLORS[i % PLANT_COLORS.length], { outline: false, roughness: 0.9 });
    leaf.position.y = cell * 0.55;
    pg.add(pot, leaf);
    g.add(pg);
    pots.set(room, pg);
    return pg;
  };
  const update = (c: ModelCtx) => {
    const layout = c.world.ext.cube?.layout;
    const rooms = layout ? Object.keys(layout).sort() : [];
    rooms.forEach((room, i) => {
      const pg = pots.get(room) ?? potFor(room, i);
      const cxy = layout![room];
      const target = at(cxy[0], cxy[1]);
      const fresh = pg.userData.placed !== true;
      pg.position.lerp(target, fresh ? 1 : Math.min(1, c.dt * 6));
      pg.userData.placed = true;
    });
    crank.rotation.y = c.world.ext.dial?.active ? -c.t * 0.8 : 0;
  };
  return { root: g, update };
}

/**
 * 年輪根盤 (第四章；story-bible 5.1b)：一截大樹的橫切面平放在樹根上——盤面兩圈年輪 (外圈 = 上層、內圈 = 下層)，
 * 盤上刻著此刻兩層的房間 (每間房一顆小木塞：外圈的照上層、內圈的照下層；位置與角度跟著 ext.cube.layout 轉)；
 * 下圈被根結住時盤中央纏著一圈根 (鎖扣解開 = 根鬆開、縮回)。啟動後外圈的刻痕慢慢發出墨藍
 */
export function rootDialModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const R = Math.min(d.w, d.d) * 0.5;
  const topY = 0.78;
  // 樹樁 (樹皮 + 根腳)
  const bark = [placed(new THREE.CylinderGeometry(R, R * 1.08, topY, 20), 0, topY / 2, 0)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; bark.push(placed(new THREE.CylinderGeometry(0.06, 0.12, 0.7, 6), Math.cos(a) * R * 1.05, 0.12, Math.sin(a) * R * 1.05, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2)); }
  g.add(p.mesh(mergeParts(bark), 0x5a4636, { roughness: 0.95 }));
  // 切面 (淺木) + 年輪線
  const face = p.mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.96, 0.03, 32), 0xc9a878, { roughness: 0.9 });
  face.position.y = topY + 0.015;
  g.add(face);
  const rings: THREE.BufferGeometry[] = [];
  for (const k of [0.92, 0.78, 0.62, 0.48, 0.3, 0.14]) rings.push(placed(new THREE.TorusGeometry(R * k, 0.006, 4, 40), 0, topY + 0.032, 0, Math.PI / 2));
  g.add(p.mesh(mergeParts(rings), 0x8a6844, { outline: false, shadow: false }));
  // 兩圈之間的分界 (深色刻槽)：外圈 = 上層、內圈 = 下層
  const groove = p.mesh(new THREE.TorusGeometry(R * 0.55, 0.014, 6, 40), 0x3a2a1e, { outline: false, shadow: false });
  groove.rotation.x = Math.PI / 2;
  groove.position.y = topY + 0.034;
  g.add(groove);
  // 根結 (下圈鎖著時纏在中央)
  const knotPts = Array.from({ length: 13 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * R * 0.32, topY + 0.06 + (i % 2) * 0.03, Math.sin(i * 0.9) * R * 0.32));
  const knot = p.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(knotPts, true), 40, 0.025, 5, true), 0x5a4636, { outline: false });
  g.add(knot);
  // 每間房一顆木塞 (上層 = 外圈、下層 = 內圈)
  const pegs = new Map<string, THREE.Mesh>();
  const pegAt = (c: readonly number[]): THREE.Vector3 => {
    const upper = c[2] === 1;
    const rr = upper ? R * 0.74 : R * 0.36;
    const dx = c[0] - 1, dy = c[1] - 1;
    if (dx === 0 && dy === 0) return new THREE.Vector3(0, topY + 0.06, upper ? -R * 0.74 : 0);
    const a = Math.atan2(dy, dx);
    return new THREE.Vector3(Math.cos(a) * rr, topY + 0.06, Math.sin(a) * rr);
  };
  const update = (c: ModelCtx) => {
    const layout = c.world.ext.cube?.layout;
    for (const room of layout ? Object.keys(layout).sort() : []) {
      let m = pegs.get(room);
      if (!m) {
        m = p.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), pal.brass, { metalness: 0.6, roughness: 0.35, outline: false });
        g.add(m);
        pegs.set(room, m);
        m.position.copy(pegAt(layout![room]));
      }
      m.position.lerp(pegAt(layout![room]), Math.min(1, c.dt * 6));
    }
    // 根結：下圈 (L0) 還鎖著才纏著
    knot.visible = !(c.world.ext.unlocked ?? []).includes('L0');
    face.rotation.y = c.world.ext.dial?.active ? -c.t * 0.05 : 0;
  };
  return { root: g, update };
}
