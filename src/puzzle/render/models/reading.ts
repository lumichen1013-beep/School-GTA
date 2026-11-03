import * as THREE from 'three';
import type { ObjDef, World } from '../../core/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { crateWood, glow, inscription, notePaper } from '../textures';
import { labelBadge } from './label';
import type { ModelCtx, PropModel } from './types';

// 2-2 閱覽室 (森林圖書館) 的物件外觀：書檯與攤開的書、淡墨 (顯影)、閱覽桌、厚書的書脊、對聯櫃、下聯 (字謎標籤)、卡片目錄櫃、鏡片
// 共面規則：同一模型內不同外觀的面不共面 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);

/** 模型第一次 update 時才拿得到文字解析器：只建一次的延遲建構 */
function lazy(build: (text: (key: string) => string) => void): (w: World) => void {
  let done = false;
  return w => { if (!done) { done = true; build(key => w.rt.text(key)); } };
}

/** 書檯：一根柱子 + 斜放的頂板 (書攤在上面；頂板頂面約在 y = h) */
export function lecternModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const foot = p.mesh(box(d.w * 0.7, 0.08, d.d * 0.7), pal.shelfDark);
  foot.position.y = 0.04;
  const post = p.mesh(box(0.16, d.h - 0.2, 0.16), pal.shelf, { outline: false });
  post.position.y = 0.08 + (d.h - 0.2) / 2;
  const top = p.mesh(box(d.w, 0.06, d.d * 0.7), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  top.position.set(0, d.h - 0.05, 0);
  top.rotation.x = 0.35;
  g.add(foot, post, top);
  return { root: g };
}

/** 攤開的書：左右兩頁 (開頭那頁有字；翻頁後 = 兩頁空白)；斜放在書檯上 */
export function openBookModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.35;
  tilt.position.set(0, 0.05, 0);
  const cover = p.mesh(box(d.w, 0.04, d.d * 0.75), pal.books[2]);
  const pageW = d.w / 2 - 0.04;
  const written = p.mesh(new THREE.PlaneGeometry(pageW, d.d * 0.65), 0xffffff, { map: notePaper(pal), flatMap: true, outline: false, shadow: false });
  written.rotation.x = -Math.PI / 2;
  written.position.set(-pageW / 2 - 0.01, 0.032, 0);
  const blankL = p.mesh(new THREE.PlaneGeometry(pageW, d.d * 0.65), pal.paperNote, { outline: false, shadow: false });
  blankL.rotation.x = -Math.PI / 2;
  blankL.position.set(-pageW / 2 - 0.01, 0.034, 0);
  const blankR = p.mesh(new THREE.PlaneGeometry(pageW, d.d * 0.65), pal.paperNote, { outline: false, shadow: false });
  blankR.rotation.x = -Math.PI / 2;
  blankR.position.set(pageW / 2 + 0.01, 0.032, 0);
  tilt.add(cover, written, blankL, blankR);
  g.add(tilt);
  const update = (c: ModelCtx) => { written.visible = !c.obj.used; blankL.visible = c.obj.used; };
  return { root: g, update };
}

/** 淡墨 (只畫在藏寶圖上)：塗開前 = 一塊淡淡的墨暈；塗開後 = 小圖 (兩間房、門的接法、一片鏡片) */
export function inkveilModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  // 藏寶圖是扁平色：淡墨 = 偏藍的淡色底 + 兩道筆刷痕
  const wash = new THREE.Group();
  const base = p.mesh(new THREE.PlaneGeometry(d.w, d.h), 0xd3dbf4, { outline: false, shadow: false });
  base.position.set(0, d.h / 2, 0.01);
  wash.add(base);
  [0.32, 0.62].forEach((k, i) => {
    const stroke = p.mesh(new THREE.PlaneGeometry(d.w * (0.8 - i * 0.2), d.h * 0.1), 0xb8c4ec, { outline: false, shadow: false });
    stroke.position.set((i - 0.5) * d.w * 0.1, d.h * k, 0.015);
    stroke.rotation.z = 0.06 - i * 0.1;
    wash.add(stroke);
  });
  g.add(wash);
  const sketch = new THREE.Group();
  sketch.visible = false;
  g.add(sketch);
  const build = lazy(text => {
    if (d.type !== 'inkveil') return;
    const paper = p.mesh(new THREE.PlaneGeometry(d.w, d.h), pal.paperNote, { outline: true, shadow: false });
    paper.position.set(0, d.h / 2, 0.01);
    const cap = p.mesh(new THREE.PlaneGeometry(d.w * 0.95, d.h * 0.3), 0xffffff, { map: inscription(pal, text(d.sketch ?? d.revealText), 'ink', 384), flatMap: true, outline: false, shadow: false });
    cap.position.set(0, d.h * 0.2, 0.02);
    // 兩間房 (左：只有東門的房、裡面一片鏡片；右：迴廊) 與門的接點
    const room = (x: number) => {
      const r = p.mesh(new THREE.PlaneGeometry(d.w * 0.34, d.h * 0.42), pal.inkBlue, { outline: false, shadow: false });
      r.position.set(x, d.h * 0.66, 0.02);
      const inner = p.mesh(new THREE.PlaneGeometry(d.w * 0.3, d.h * 0.36), pal.paperNote, { outline: false, shadow: false });
      inner.position.set(x, d.h * 0.66, 0.03);
      sketch.add(r, inner);
    };
    room(-d.w * 0.2);
    room(d.w * 0.2);
    const door = p.mesh(new THREE.PlaneGeometry(d.w * 0.08, d.h * 0.12), pal.paperNote, { outline: false, shadow: false });
    door.position.set(-d.w * 0.03, d.h * 0.66, 0.04);
    const lens = p.mesh(new THREE.RingGeometry(d.h * 0.06, d.h * 0.09, 20), pal.inkBlue, { outline: false, shadow: false });
    lens.position.set(-d.w * 0.2, d.h * 0.66, 0.05);
    sketch.add(paper, cap, door, lens);
  });
  const update = (c: ModelCtx) => {
    build(c.world);
    sketch.visible = c.obj.used;
    wash.visible = !c.obj.used;
  };
  return { root: g, update };
}

/** 閱覽桌：桌面 + 四腳 (純呈現；也用在印房的活字桌) */
export function readingTableModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const top = p.mesh(box(d.w, 0.08, d.d), pal.tableTop, { map: crateWood(pal), flat: pal.tableTop });
  top.position.y = d.h - 0.04;
  g.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = p.mesh(box(0.1, d.h - 0.08, 0.1), pal.table, { outline: false });
    leg.position.set(sx * (d.w / 2 - 0.12), (d.h - 0.08) / 2, sz * (d.d / 2 - 0.12));
    g.add(leg);
  }
  const stack = p.mesh(box(0.42, 0.12, 0.3), pal.books[3]);
  stack.position.set(-d.w / 2 + 0.4, d.h + 0.06, -0.1);
  stack.rotation.y = 0.2;
  g.add(stack);
  return { root: g };
}

/** 厚書 (書脊朝外，有一行細細的小字)；讀到之後書脊縫裡的齒拿走，小字旁多一點光 */
export function smallPrintModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const book = p.mesh(box(d.w, d.h, d.d), pal.books[0]);
  book.position.y = d.h / 2;
  const band = p.mesh(box(d.w * 0.7, 0.012, 0.01), pal.gold, { outline: false, shadow: false });
  band.position.set(0, d.h * 0.62, d.d / 2 + 0.006);
  const line = p.mesh(new THREE.PlaneGeometry(0.03, d.h * 0.42), pal.paperNote, { outline: false, shadow: false });
  line.position.set(0, d.h * 0.32, d.d / 2 + 0.004);
  const halo = glowSprite(glow(), pal.lampLight, 0.5, 0, true);
  halo.position.set(0, d.h * 0.4, d.d / 2 + 0.05);
  g.add(book, band, line, halo);
  let k = 0;
  const update = (c: ModelCtx) => { k = approach(k, c.obj.used ? 1 : 0, c.dt * 3); halo.material.opacity = 0.45 * k; halo.visible = c.mode === '3d' && k > 0.02; };
  return { root: g, update };
}

/** 對聯櫃：高櫃 + 兩扇門 (左扇刻上聯：只在實景)；打開 (used) 後兩扇門往外轉開 */
export function coupletCabinetModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h, d.d - 0.06), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  body.position.set(0, d.h / 2, -0.03);
  const crown = p.mesh(box(d.w + 0.12, 0.1, d.d + 0.04), pal.shelfDark);
  crown.position.set(0, d.h + 0.05, 0);
  const inside = p.mesh(box(d.w - 0.16, 0.04, d.d - 0.2), pal.shelfDark, { outline: false });
  inside.position.set(0, d.h * 0.45, 0);
  g.add(body, crown, inside);
  const hinges: THREE.Group[] = [];
  const doorW = d.w / 2 - 0.04;
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(s * (d.w / 2 - 0.02), 0.06, d.d / 2 - 0.02);
    const leaf = p.mesh(box(doorW, d.h - 0.16, 0.04), pal.shelfDark);
    leaf.position.set(-s * doorW / 2, (d.h - 0.16) / 2, 0.02);
    const pull = p.mesh(new THREE.SphereGeometry(0.04, 8, 6), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false });
    pull.position.set(-s * (doorW - 0.1), d.h * 0.48, 0.07);
    h.add(leaf, pull);
    hinges.push(h);
    g.add(h);
  }
  let carved: THREE.Mesh | null = null;
  const build = lazy(text => {
    if (d.type !== 'coupletCabinet') return;
    carved = p.mesh(new THREE.PlaneGeometry(doorW * 0.9, 0.3), 0xffffff, { map: inscription(pal, text(d.upper), 'carved', 384), outline: false, shadow: false });
    carved.position.set(doorW / 2, d.h * 0.62, 0.045);
    hinges[0].add(carved);
  });
  let a = 0;
  const update = (c: ModelCtx) => {
    build(c.world);
    if (carved) carved.visible = c.mode === '3d';
    a = approach(a, c.obj.used ? 1.3 : 0, c.dt * (c.calm ? 2 : 5));
    hinges[0].rotation.y = -a;
    hinges[1].rotation.y = a;
  };
  return { root: g, update };
}

/** 下聯 (只在藏寶圖)：墨框紙籤上的「窗＿萬卷書」= 可寫的標籤 (labelBadge 依貼著的詞卡顯示) */
export function coupletModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h / 2, 0.02), 0.62);
  return { root: g, update: badge };
}

/** 卡片目錄櫃：一格格小抽屜 (黃銅拉環)；拉過 (used) 中間那格抽屜拉出來 */
export function cardCatalogModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h, d.d - 0.04), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  body.position.set(0, d.h / 2, -0.02);
  g.add(body);
  const cols = 3, rows = 4;
  const cw = (d.w - 0.12) / cols, rh = (d.h - 0.16) / rows;
  let pulled: THREE.Group | null = null;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const dr = new THREE.Group();
    dr.position.set(-d.w / 2 + 0.06 + cw * (c + 0.5), 0.08 + rh * (r + 0.5), d.d / 2 - 0.04);
    const front = p.mesh(box(cw - 0.04, rh - 0.04, 0.04), pal.shelfDark, { outline: false });
    front.position.z = 0.02;
    const pull = p.mesh(box(0.08, 0.025, 0.02), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false, shadow: false });
    pull.position.set(0, -rh * 0.15, 0.05);
    dr.add(front, pull);
    g.add(dr);
    if (r === 2 && c === 1) pulled = dr;
  }
  const z0 = pulled!.position.z;
  const update = (c: ModelCtx) => { pulled!.position.z = approach(pulled!.position.z, z0 + (c.obj.used ? 0.25 : 0), c.dt * 6); };
  return { root: g, update };
}

/** 鏡片：黃銅細框裡的一片圓玻璃 (平躺在活字桌上；微光提示) */
export function lensModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const ring = p.mesh(new THREE.TorusGeometry(d.w * 0.4, 0.018, 8, 24), pal.brass, { metalness: 0.7, roughness: 0.3 });
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const glass = p.mesh(new THREE.CircleGeometry(d.w * 0.38, 24), 0xcfe8f0, { opacity: 0.55, outline: false, shadow: false, unique: true });
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.025;
  const halo = glowSprite(glow(), pal.lampLight, 0.6, 0.3, true);
  halo.position.y = 0.12;
  g.add(ring, glass, halo);
  return { root: g, update: c => { halo.visible = c.mode === '3d'; halo.material.opacity = 0.24 + (c.calm ? 0 : 0.08 * Math.sin(c.t * 2)); } };
}
