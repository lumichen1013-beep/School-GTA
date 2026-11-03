import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood } from '../textures';
import { booksPlane } from '../library';
import type { ModelCtx, PropModel } from './types';

// 2-5 書房深處 (森林圖書館) 的物件外觀：章門平台 (木台 + 欄杆)、鑰匙台 (四個凹槽；組好後空了)、手記架 (小書架上一頁手記)
// 共面規則：同一模型內不同外觀的面不共面 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/**
 * 章門平台：書房深處的夾層平台——厚木台 (側面木紋 + 鑲板) + 頂面的地板 + 出簷收邊；朝鏡頭的正面嵌兩層書格 (書背朝外)。
 * 不畫欄杆 (欄杆會讓平台看起來四面都圍住；玩家要從北側 / 西側墊腳爬上去)
 */
export function landingModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const body = p.mesh(box(w, h - 0.08, dd), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  body.position.y = (h - 0.08) / 2;
  const top = p.mesh(box(w + 0.08, 0.08, dd + 0.08), pal.shelf, { outline: false });
  top.position.y = h - 0.04;
  const skirt = p.mesh(box(w + 0.04, 0.14, dd + 0.04), pal.baseboard, { outline: false });
  skirt.position.y = 0.07;
  g.add(body, top, skirt);
  // 正面 (+z) 的書格：兩層書 + 外框 + 中間隔板
  const zf = dd / 2;
  const rowH = (h - 0.5) / 2 - 0.06;
  const frame = (fw: number, fh: number, x: number, y: number) => {
    const m = p.mesh(box(fw, fh, 0.06), pal.shelf, { outline: false });
    m.position.set(x, y, zf + 0.03);
    g.add(m);
  };
  frame(0.1, h - 0.3, -w / 2 + 0.05, 0.14 + (h - 0.3) / 2);
  // 東側 (貼牆) 的框柱內縮 2 cm：側面不與側牆腰線的正面 (牆 - 0.1) 共面
  frame(0.1, h - 0.3, w / 2 - 0.07, 0.14 + (h - 0.3) / 2);
  frame(0.1, h - 0.3, 0, 0.14 + (h - 0.3) / 2);
  for (const y of [0.17, 0.17 + rowH + 0.08, h - 0.2]) frame(w - 0.2, 0.06, 0, y);
  for (let r = 0; r < 2; r++) for (const s of [-1, 1]) {
    const row = booksPlane(p, pal, 61 + r * 3 + (s > 0 ? 1 : 0), w / 2 - 0.15, rowH);
    row.position.set(s * (w / 4 - 0.0), 0.2 + r * (rowH + 0.08) + rowH / 2, zf + 0.012);
    g.add(row);
  }
  // 西側 (-x) 的兩塊鑲板
  for (const z of [-dd / 4, dd / 4]) {
    const panel = p.mesh(box(0.03, h - 0.6, dd / 2 - 0.3), pal.shelf, { outline: false, shadow: false });
    panel.position.set(-w / 2 - 0.015, h / 2, z);
    g.add(panel);
  }
  return { root: g };
}

/** 鑰匙台：工作台 (厚桌面、桌裙、下層橫撐上一個工具盒、桌角的小虎鉗) + 黃銅托盤上刻著鑰匙形的凹槽 (圓柄 + 三枚齒)；組好 (used) 凹槽隱去 */
export function keyBenchModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const brass = { metalness: 0.6, roughness: 0.4 } as const;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = p.mesh(box(0.08, d.h - 0.07, 0.08), pal.shelfDark, { outline: false }); leg.position.set(sx * (d.w / 2 - 0.08), (d.h - 0.07) / 2, sz * (d.d / 2 - 0.08)); g.add(leg); }
  const top = p.mesh(box(d.w, 0.07, d.d), pal.tableTop, { map: crateWood(pal), flat: pal.tableTop });
  top.position.y = d.h - 0.035;
  const apron = p.mesh(box(d.w - 0.12, 0.1, d.d - 0.12), pal.shelfDark, { outline: false });
  apron.position.y = d.h - 0.12;
  const stretcher = p.mesh(box(d.w - 0.14, 0.04, d.d - 0.14), pal.shelf, { outline: false });
  stretcher.position.y = 0.18;
  const toolbox = p.mesh(box(0.42, 0.16, 0.26), pal.books[0], { outline: false });
  toolbox.position.set(-d.w * 0.2, 0.28, 0);
  g.add(top, apron, stretcher, toolbox);
  // 桌角的小虎鉗 (鐵)
  const vise = p.mesh(box(0.14, 0.12, 0.2), pal.iron, { metalness: 0.5, roughness: 0.5 });
  vise.position.set(d.w / 2 - 0.12, d.h + 0.06, d.d / 2 - 0.16);
  const screw = p.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), pal.metal, { metalness: 0.6, roughness: 0.4, outline: false });
  screw.rotation.x = Math.PI / 2;
  screw.position.set(d.w / 2 - 0.12, d.h + 0.05, d.d / 2 - 0.02);
  g.add(vise, screw);
  const tray = p.mesh(box(d.w * 0.62, 0.03, d.d * 0.6), pal.brass, { ...brass, outline: false });
  tray.position.set(-0.08, d.h + 0.015, 0);
  g.add(tray);
  // 凹槽：一枝鑰匙的形狀 (圓柄 + 柄身 + 三枚齒)
  const slots: THREE.Object3D[] = [];
  const ink = (m: THREE.Mesh) => { slots.push(m); g.add(m); return m; };
  const bow = ink(p.mesh(new THREE.TorusGeometry(0.08, 0.022, 6, 18), pal.outline, { outline: false, shadow: false }));
  bow.rotation.x = Math.PI / 2;
  bow.position.set(-0.08 - d.w * 0.2, d.h + 0.032, 0);
  const shaft = ink(p.mesh(box(d.w * 0.34, 0.012, 0.04), pal.outline, { outline: false, shadow: false }));
  shaft.position.set(-0.08 + d.w * 0.04, d.h + 0.036, 0);
  [0, 1, 2].forEach(i => {
    const tooth = ink(p.mesh(box(0.04, 0.012, 0.07), pal.outline, { outline: false, shadow: false }));
    tooth.position.set(-0.08 + d.w * (0.06 + i * 0.06), d.h + 0.036, 0.05);
  });
  return { root: g, update: (c: ModelCtx) => { for (const s of slots) s.visible = !c.obj.used; } };
}

/** 手記架：小小的木製書托 (底座 + 斜靠板 + 托邊) + 斜放的一頁手記 (拿走 = used 後只剩書托) */
export function diaryStandModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const base = p.mesh(box(d.w, 0.05, d.d), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  base.position.y = 0.025;
  const rest = p.mesh(box(d.w * 0.9, d.h * 0.7, 0.04), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  rest.position.set(0, 0.05 + d.h * 0.32, -d.d * 0.12);
  rest.rotation.x = -0.35;
  const ledge = p.mesh(box(d.w * 0.84, 0.04, 0.06), pal.shelfDark, { outline: false });
  ledge.position.set(0, 0.07, d.d * 0.12);
  const page = p.mesh(new THREE.PlaneGeometry(d.w * 0.66, d.h * 0.56), pal.paperNote, { outline: true, shadow: false, side: THREE.DoubleSide });
  page.position.set(0, 0.07 + d.h * 0.3, -d.d * 0.02);
  page.rotation.x = -0.35;
  g.add(base, rest, ledge, page);
  return { root: g, update: (c: ModelCtx) => { page.visible = !c.obj.used; } };
}
