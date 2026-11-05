import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood, bookRow, notePaper } from '../textures';
import { mergeParts, placed } from '../geometry';
import { labelBadge, scaleCorner, scaleRatio } from './label';
import type { ModelCtx, PropModel } from './types';

// H1 夾層 (森林圖書館；規格 6「H1 夾層（細化）」) 的物件外觀：只在實景的書牆 (書背朝牆、頂上的裝飾書 9.1 D)、
// 書牆後面那面書櫃 (雙面書櫃、背板朝洞；依有效尺寸縮放；藏寶圖 = 書櫃 + 層板 + 書的剪影 + 標籤「書櫃」+ 方槽)、
// 爸爸小時候的小書桌 (diaryStand look 'desk'：桌 + 抽屜；抽屜縫露出殘片的一角，拿走 = 抽屜拉開、空了)
// 繪製量：同材質合併 (書牆 = 木框 1 + 背板 1 + 書 1 + 裝飾書每層 1)；共面規則見 tests/puzzle/render/coplanar

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 固定種子亂數 (每次外觀一致) */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** 一排書的平面 (UV 依長度重複貼圖；幾排合成一個網格) */
function rowGeo(len: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(len, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2.4));
  uv.needsUpdate = true;
  return placed(geo, x, y, z);
}

/**
 * 書牆 (只在實景；實體、全寬)：胡桃木框 (立柱 + 三層層板 + 頂蓋，合成一個網格) + 深色背板 + 三排書 (書口朝外 = 書背朝牆；一個貼圖網格)。
 * 頂上的裝飾書 (9.1 D) 是裝飾 decor/library wallTopBooks (每幀都知道模式；物件模型在藏寶圖裡不更新)。人在後面時鏡頭被書牆擋住 → 淡出 (occluders)
 */
export function bookWallModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  // 兩端內縮 2 cm：端面不與側牆的壁紙 / 護牆板相貼
  const W = d.w - 0.04, H = d.h, D = d.d;
  const wood: THREE.BufferGeometry[] = [];
  const posts = [-W / 2 + 0.06, -3.6, -1.2, 1.2, 3.6, W / 2 - 0.06];
  for (const x of posts) wood.push(placed(box(0.12, H - 0.08, D), x, (H - 0.08) / 2, 0));
  for (const y of [0.05, 1.0, 1.95]) wood.push(placed(box(W - 0.02, 0.06, D - 0.04), 0, y, 0));
  wood.push(placed(box(W, 0.08, D + 0.02), 0, H - 0.04, 0));
  const frame = p.mesh(mergeParts(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf, unique: true });
  const back = p.mesh(box(W - 0.04, H - 0.1, 0.04), pal.shelfDark, { outline: false, unique: true });
  back.position.set(0, (H - 0.1) / 2, -D / 2 + 0.03);
  const rows = [[0.08, 0.97], [1.03, 1.92], [1.98, H - 0.08]].map(([a, b]) => rowGeo(W - 0.06, b - a - 0.06, 0, (a + b) / 2, D / 2 - 0.1));
  const books = p.mesh(mergeParts(rows), 0xffffff, { map: bookRow(pal, 77, 'back'), outline: false, shadow: false, unique: true });
  g.add(frame, back, books);
  return { root: g, occluders: [frame, back, books] };
}

/**
 * 後面那面書櫃：高大的雙面書櫃 (背板朝北牆的洞、書朝南的書牆)；本體依有效尺寸縮放 (底部中心；標籤不跟著縮)。
 * 藏寶圖：書櫃 + 層板 + 書的剪影 (扁平色)、標籤「書櫃」+ 方槽、縮放角標「大 / 小」
 */
export function innerShelfModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  // 木框 (三根立柱 + 頂底板 + 兩層層板，合成一個網格) + 背板 (朝洞：從洞看過去是一整片背板) + 書 (三排，一個貼圖網格)
  const W = d.w, H = d.h, D = d.d;
  const wood: THREE.BufferGeometry[] = [];
  for (const x of [-W / 2 + 0.06, 0, W / 2 - 0.06]) wood.push(placed(box(0.12, H, D), x, H / 2, 0));
  const levels = [0.04, H * 0.36, H * 0.68, H - 0.04];
  for (const y of levels) wood.push(placed(box(W - 0.02, 0.06, D - 0.02), 0, y, 0));
  body.add(p.mesh(mergeParts(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf }));
  const panel = p.mesh(box(W - 0.04, H - 0.04, 0.05), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark, outline: false });
  panel.position.set(0, H / 2, -D / 2 + 0.01);
  body.add(panel);
  const rows: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const y0 = levels[i] + 0.03, y1 = levels[i + 1] - 0.15;
    for (const s of [-1, 1]) rows.push(rowGeo(W / 2 - 0.18, y1 - y0, s * (W / 4), (y0 + y1) / 2, D / 2 - 0.12));
  }
  body.add(p.mesh(mergeParts(rows), 0xffffff, { map: bookRow(pal, 83, 'spine'), flat: pal.books[2], outline: false, shadow: false }));
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h + 0.4, d.d / 2), 0.5);
  const corner = scaleCorner(p, d, theme, g, 0.32);
  const at = new THREE.Vector3();
  const update = (c: ModelCtx) => {
    const k = scaleRatio(c);
    body.scale.setScalar(k);
    badge(c);
    corner(c, at.set(d.w * k * 0.5 + 0.18, d.h * k, d.d * k * 0.5));
  };
  return { root: g, update };
}

/**
 * 小書桌 (diaryStand look 'desk')：矮木桌 (桌面 + 桌裙 + 四腳，合成一個網格) + 一格抽屜 (把手黃銅) + 桌上兩本書；
 * 抽屜縫露出殘片的一角 (拿走 = used：抽屜拉開、紙不見)
 */
export function deskModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const D = d.d;
  const wood: THREE.BufferGeometry[] = [placed(box(w, 0.05, D), 0, h - 0.025, 0), placed(box(w - 0.1, 0.12, D - 0.1), 0, h - 0.11, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(placed(box(0.06, h - 0.05, 0.06), sx * (w / 2 - 0.07), (h - 0.05) / 2, sz * (D / 2 - 0.07)));
  g.add(p.mesh(mergeParts(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf }));
  // 抽屜 (正面朝 +z；拉開 = 往 +z 滑 0.28)
  const drawer = new THREE.Group();
  const front = p.mesh(box(0.56, 0.1, 0.03), pal.shelfDark, { outline: false });
  front.position.set(0, h - 0.11, D / 2 - 0.035);
  const tray = p.mesh(box(0.5, 0.06, D - 0.2), pal.crateDark, { outline: false, shadow: false });
  tray.position.set(0, h - 0.13, -0.06);
  const knob = p.mesh(new THREE.SphereGeometry(0.025, 8, 6), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false, shadow: false });
  knob.position.set(0, h - 0.11, D / 2 - 0.01);
  drawer.add(front, tray, knob);
  g.add(drawer);
  // 抽屜縫露出的殘片一角
  const scrap = p.mesh(new THREE.PlaneGeometry(0.16, 0.05), 0xffffff, { map: notePaper(pal), flatMap: true, outline: false, shadow: false });
  scrap.position.set(0.14, h - 0.052, D / 2 - 0.018);
  scrap.rotation.z = 0.12;
  g.add(scrap);
  // 桌上兩本書 (疊著)
  const r = rng(17);
  const stack = [0, 1].map(i => placed(box(0.34 - i * 0.04, 0.05, 0.24 - i * 0.02), -w / 2 + 0.3, h + 0.025 + i * 0.05, -0.08 + (r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.4));
  g.add(p.mesh(mergeParts(stack), pal.books[4 % pal.books.length], { roughness: 0.9, outline: false }));
  return {
    root: g,
    update: (c: ModelCtx) => {
      drawer.position.z = c.obj.used ? 0.28 : 0;
      scrap.visible = !c.obj.used;
    }
  };
}
