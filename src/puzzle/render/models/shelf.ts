import * as THREE from 'three';
import type { ObjDef, World } from '../../core/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { crateWood, glow, inscription, notePaper } from '../textures';
import { buildBookcase } from '../library';
import type { ModelCtx, PropModel } from './types';

// 2-1 書架迴廊 (森林圖書館) 的物件外觀：屋框書牆的一段、矮書架與書、暗格、眉批、燈書與燈座、書擋、書梯、老宅圖殘片
// 共面規則：同一模型內不同外觀的面不共面 (tests/puzzle/render/coplanar)；書是貼圖平面 (render/library)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);

/** 模型第一次 update 時才拿得到文字解析器：只建一次的延遲建構 */
function lazy(build: (text: (key: string) => string) => void): (w: World) => void {
  let done = false;
  return w => { if (!done) { done = true; build(key => w.rt.text(key)); } };
}

/** 三段書牆在藏寶圖裡的淡色 (轉過去之後一眼看得出背後換了一段；形狀另有段名紙籤，不只靠顏色) */
const BAY_TINT: readonly number[] = [0xeee2c4, 0xdfe6c6, 0xeed9c9];

/** 屋框書牆的一段：整面書櫃 (書背朝牆；turnWhen 物件 used 後書背轉過來)；藏寶圖裡是淡色背景 + 段名 (labelKey) 的墨字紙籤 */
export function bayShelfModel(p: Painter, d: ObjDef, { pal, room2d }: Theme): PropModel {
  const variant = d.type === 'bayShelf' ? d.variant : 0;
  const gaps = d.type === 'bayShelf' ? (d.gaps ?? []).map(x => x - d.x) : [];
  const bc = buildBookcase(p, pal, { w: d.w, h: d.h, d: d.d, seed: 11 + variant * 5, gaps, backs: true, pale: { board: room2d.trim, row: BAY_TINT[variant % BAY_TINT.length] } });
  let tag: THREE.Mesh | null = null;
  const build = lazy(text => {
    if (!d.labelKey) return;
    tag = p.mesh(new THREE.PlaneGeometry(2.4, 0.5), 0xffffff, { map: inscription(pal, text(d.labelKey), 'ink', 384), flatMap: true, outline: true, shadow: false });
    tag.position.set(-6.5 - d.x, d.h - 0.2, d.d / 2 + 0.02);
    bc.root.add(tag);
  });
  const turnWhen = d.type === 'bayShelf' ? d.turnWhen : undefined;
  let turned: boolean | null = null;
  const update = (c: ModelCtx) => {
    build(c.world);
    if (tag) tag.visible = c.mode === '2d';
    const now = !!turnWhen && !!c.world.byId.get(turnWhen)?.used;
    if (now === turned) return;
    turned = now;
    for (const m of bc.backs) m.visible = !now;
    for (const m of bc.spines) m.visible = now;
  };
  return { root: bc.root, update };
}

/** 矮書架 (不擋路)：木頭箱體 + 頂板；書另有物件 (spine) */
export function lowShelfModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h - 0.05, d.d), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  body.position.y = (d.h - 0.05) / 2;
  const top = p.mesh(box(d.w + 0.06, 0.05, d.d + 0.04), pal.shelfDark);
  top.position.y = d.h - 0.025;
  const kick = p.mesh(box(d.w - 0.2, 0.12, 0.02), pal.shelfDark, { outline: false });
  kick.position.set(0, 0.06, d.d / 2 + 0.01);
  g.add(body, top, kick);
  return { root: g };
}

/** 書梯：三階木台階 (實體，頂面 = 邏輯盒頂) */
export function libraryStepModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const top = p.mesh(box(d.w, 0.08, d.d), pal.tableTop);
  top.position.y = d.h - 0.04;
  g.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = p.mesh(box(0.1, d.h - 0.08, 0.1), pal.shelfDark, { outline: false });
    leg.position.set(sx * (d.w / 2 - 0.08), (d.h - 0.08) / 2, sz * (d.d / 2 - 0.08));
    g.add(leg);
  }
  const rung = p.mesh(box(d.w - 0.26, 0.06, d.d * 0.5), pal.shelf, { outline: false });
  rung.position.set(0, d.h * 0.45, d.d * 0.2);
  g.add(rung);
  return { root: g };
}

/** 一本書 (2-1b)：書背朝牆 (正面 = 米白書口)；title = 只畫在藏寶圖上的書名 (墨字)；抽對了 (used) 往外滑出一截 */
export function spineModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const seed = Math.abs(Math.round(d.x * 7 + d.h * 13));
  const cover = pal.books[seed % pal.books.length];
  const body = new THREE.Group();
  const shell = p.mesh(box(d.w, d.h, d.d), cover);
  shell.position.y = d.h / 2;
  const pages = p.mesh(box(d.w - 0.05, d.h - 0.05, 0.02), pal.paperNote, { outline: false, shadow: false });
  pages.position.set(0, d.h / 2, d.d / 2 + 0.005);
  body.add(shell, pages);
  g.add(body);
  let tag: THREE.Mesh | null = null;
  const build = lazy(text => {
    if (d.type !== 'spine' || !d.title) return;
    tag = p.mesh(new THREE.PlaneGeometry(0.42, 0.24), 0xffffff, { map: inscription(pal, text(d.title), 'ink', 128), flatMap: true, outline: true, shadow: false });
    tag.position.set(0, d.h + 0.16, 0.02);
    g.add(tag);
  });
  const update = (c: ModelCtx) => {
    build(c.world);
    body.position.z = approach(body.position.z, c.obj.used ? 0.22 : 0, c.dt * 5);
    if (tag) tag.visible = c.mode === '2d';
  };
  return { root: g, update };
}

/** 暗格 (2-1b 的鎖)：書架正面的黃銅鎖眼小門；打開 (used) 後門片翻下 */
export function bookLockModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const frame = p.mesh(box(d.w, d.h, 0.02), pal.brass, { metalness: 0.6, roughness: 0.4 });
  frame.position.set(0, d.h / 2, 0);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.02, 0.02);
  const leaf = p.mesh(box(d.w - 0.08, d.h - 0.08, 0.02), pal.gold, { metalness: 0.65, roughness: 0.35, outline: false });
  leaf.position.set(0, (d.h - 0.08) / 2 + 0.02, 0);
  const hole = p.mesh(new THREE.CircleGeometry(0.035, 12), pal.sealInk, { outline: false, shadow: false });
  hole.position.set(0, (d.h - 0.08) / 2 + 0.02, 0.011);
  hinge.add(leaf, hole);
  g.add(frame, hinge);
  let a = 0;
  const update = (c: ModelCtx) => { a = approach(a, c.obj.used ? Math.PI * 0.55 : 0, c.dt * 6); hinge.rotation.x = a; };
  return { root: g, update };
}

/** 眉批：爸爸寫在書架上的一行字 (ink = 藏寶圖的墨字紙籤；否則實景的鉛筆字紙條) */
export function remarkModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const build = lazy(text => {
    if (d.type !== 'remark') return;
    const px = Math.max(128, Math.min(512, Math.round(d.w / d.h * 80 / 32) * 32));
    const m = p.mesh(new THREE.PlaneGeometry(d.w, d.h), 0xffffff, { map: inscription(pal, text(d.textKey), d.ink ? 'ink' : 'pencil', px), flatMap: true, outline: !!d.ink, shadow: false });
    m.position.set(0, d.h / 2, d.d / 2);
    g.add(m);
  });
  return { root: g, update: c => build(c.world) };
}

/** 燈書 (2-1c)：書背朝牆的一本書 + 書上的小油燈 (點亮 = used：燈芯發光)；書名只在藏寶圖上 (墨字紙籤) */
export function lampBookModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const bookH = d.h * 0.62;
  const shell = p.mesh(box(d.w * 0.5, bookH, d.d), pal.books[1]);
  shell.position.set(0, bookH / 2, 0);
  const pages = p.mesh(box(d.w * 0.5 - 0.05, bookH - 0.05, 0.02), pal.paperNote, { outline: false, shadow: false });
  pages.position.set(0, bookH / 2, d.d / 2 + 0.005);
  const cup = p.mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.06, 12), pal.brass, { metalness: 0.6, roughness: 0.4 });
  cup.position.set(0, bookH + 0.03, 0);
  const flame = p.mesh(new THREE.SphereGeometry(0.05, 10, 8), pal.lampBulb, { emissive: pal.lampLight, emissiveIntensity: 0, outline: false, shadow: false, unique: true });
  flame.position.set(0, bookH + 0.11, 0);
  const halo = glowSprite(glow(), pal.lampLight, 0.7, 0, true);
  halo.position.set(0, bookH + 0.12, 0.05);
  g.add(shell, pages, cup, flame, halo);
  let tag: THREE.Mesh | null = null;
  const build = lazy(text => {
    if (d.type !== 'lampBook') return;
    tag = p.mesh(new THREE.PlaneGeometry(0.5, 0.3), 0xffffff, { map: inscription(pal, text(d.title), 'ink', 128), flatMap: true, outline: true, shadow: false });
    tag.position.set(0, d.h + 0.3, 0.02);
    g.add(tag);
  });
  const mat = flame.material as THREE.MeshStandardMaterial;
  let k = 0;
  const update = (c: ModelCtx) => {
    build(c.world);
    if (tag) tag.visible = c.mode === '2d';
    k = approach(k, c.obj.used ? 1 : 0, c.dt * 4);
    mat.emissiveIntensity = 1.6 * k;
    halo.material.opacity = 0.7 * k;
    halo.visible = c.mode === '3d' && k > 0.02;
  };
  return { root: g, update };
}

/** 燈座 (2-1c 的鎖)：黃銅底盤上三盞小燈；依順序鎖的進度點亮 (第 i 盞 = order 的前 i 本已亮)；全亮 = used */
export function lampLockModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const base = p.mesh(box(d.w, 0.1, d.d * 0.8), pal.brass, { metalness: 0.6, roughness: 0.4 });
  base.position.y = 0.05;
  const stem = p.mesh(new THREE.CylinderGeometry(0.05, 0.07, d.h - 0.2, 10), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false });
  stem.position.y = 0.1 + (d.h - 0.2) / 2;
  const bar = p.mesh(box(d.w * 0.9, 0.05, 0.08), pal.goldDeep, { metalness: 0.6, roughness: 0.4 });
  bar.position.y = d.h - 0.1;
  g.add(base, stem, bar);
  const flames: THREE.MeshStandardMaterial[] = [];
  const halos: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * d.w * 0.36;
    const cup = p.mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.08, 10), pal.gold, { metalness: 0.6, roughness: 0.4 });
    cup.position.set(x, d.h - 0.035, 0);
    const f = p.mesh(new THREE.SphereGeometry(0.045, 10, 8), pal.lampBulb, { emissive: pal.lampLight, emissiveIntensity: 0, outline: false, shadow: false, unique: true });
    f.position.set(x, d.h + 0.04, 0);
    const h = glowSprite(glow(), pal.lampLight, 0.55, 0, true);
    h.position.set(x, d.h + 0.06, 0.04);
    g.add(cup, f, h);
    flames.push(f.material as THREE.MeshStandardMaterial);
    halos.push(h);
  }
  const lit = [0, 0, 0];
  const update = (c: ModelCtx) => {
    const order = c.obj.def.type === 'lampLock' ? c.obj.def.order : [];
    const n = c.obj.used ? 3 : order.filter(id => c.world.byId.get(id)?.used).length;
    for (let i = 0; i < 3; i++) {
      lit[i] = approach(lit[i], i < n ? 1 : 0, c.dt * 4);
      flames[i].emissiveIntensity = 1.6 * lit[i];
      halos[i].material.opacity = 0.75 * lit[i];
      halos[i].visible = c.mode === '3d' && lit[i] > 0.02;
    }
  };
  return { root: g, update };
}

/** 書擋 (2-1a)：直立的木書擋 (背面朝牆貼著黃銅刻字牌)；推倒 (used) 後往前倒在層板上，背面朝上、刻字露出來 (實景) */
export function bookendModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  const t = 0.1;
  const upright = p.mesh(box(d.w, d.h, t), pal.shelfDark);
  upright.position.set(0, d.h / 2, 0);
  const cap = p.mesh(box(d.w + 0.04, 0.05, t + 0.04), pal.shelf, { outline: false });
  cap.position.set(0, d.h - 0.025 + 0.001, 0);
  pivot.add(upright, cap);
  pivot.position.z = t / 2;
  upright.position.z = -t / 2; cap.position.z = -t / 2;
  g.add(pivot);
  // 底座的刻字牌 (貼在朝牆的背面；倒下後朝上)：字取自 plateText (文字表)
  const build = lazy(text => {
    if (d.type !== 'bookend') return;
    const plate = p.mesh(new THREE.PlaneGeometry(d.w * 0.8, d.h * 0.3), 0xffffff, { map: inscription(pal, text(d.plateText), 'carved', 384), outline: false, shadow: false });
    plate.position.set(0, d.h * 0.5, -t - 0.002);
    plate.rotation.y = Math.PI;
    pivot.add(plate);
  });
  let a = 0;
  const update = (c: ModelCtx) => {
    build(c.world);
    a = approach(a, c.obj.used ? Math.PI * 0.47 : 0, c.dt * (c.calm ? 2 : 6));
    pivot.rotation.x = a;
  };
  return { root: g, update };
}

/** 老宅圖殘片：塞在書縫裡的一角泛黃圖紙 + 小圖釘 (微光提示：兩模式都看得到) */
export function scrapModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const paper = p.mesh(new THREE.PlaneGeometry(d.w, d.h), 0xffffff, { map: notePaper(pal), flatMap: true, outline: true, shadow: false });
  paper.position.set(0, d.h / 2, d.d / 2);
  paper.rotation.z = 0.12;
  const pin = p.mesh(new THREE.SphereGeometry(0.035, 8, 6), pal.pin, { outline: false, shadow: false });
  pin.position.set(-d.w * 0.3, d.h * 0.8, d.d / 2 + 0.02);
  const halo = glowSprite(glow(), pal.lampLight, 0.9, 0.35, true);
  halo.position.set(0, d.h / 2, d.d / 2 + 0.03);
  g.add(paper, pin, halo);
  return { root: g, update: c => { halo.visible = c.mode === '3d'; halo.material.opacity = 0.28 + 0.08 * Math.sin(c.t * 2); } };
}
