import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood, inscription } from '../textures';
import { labelBadge } from './label';
import type { ModelCtx, PropModel } from './types';

// 2-3 印房 (森林圖書館) 的物件外觀：活字架、印刷機、鉛字盤、門牌 (藏寶圖的標籤)、排字架與字輪 (2-3c，在手稿庫)
// 共面規則：同一模型內不同外觀的面不共面 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 活字架 (靠牆的高櫃)：櫃身 + 一格格斜放的活字盒 + 腳；拿過 (used) 中間一格空了 */
export function typeCaseModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const legs = [-1, 1].map(s => { const m = p.mesh(box(0.1, 0.18, d.d - 0.1), pal.shelfDark, { outline: false }); m.position.set(s * (d.w / 2 - 0.08), 0.09, 0); return m; });
  const body = p.mesh(box(d.w, d.h - 0.18, d.d - 0.06), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  body.position.set(0, 0.18 + (d.h - 0.18) / 2, -0.03);
  g.add(...legs, body);
  const rows = 5, cols = 4;
  const cw = (d.w - 0.16) / cols, rh = (d.h - 0.4) / rows;
  let gap: THREE.Mesh | null = null;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tray = p.mesh(box(cw - 0.05, rh - 0.06, 0.05), r % 2 ? pal.shelfDark : pal.crateDark, { outline: false });
    tray.position.set(-d.w / 2 + 0.08 + cw * (c + 0.5), 0.28 + rh * (r + 0.5), d.d / 2 - 0.02);
    tray.rotation.x = -0.18;
    g.add(tray);
    // 活字：每盒前緣一排小鉛塊 (金屬灰)
    const lead = p.mesh(box(cw - 0.14, 0.05, 0.05), pal.iron, { metalness: 0.5, roughness: 0.5, outline: false, shadow: false });
    lead.position.set(tray.position.x, tray.position.y - rh * 0.28, d.d / 2 + 0.03);
    g.add(lead);
    if (r === 2 && c === 1) gap = lead;
  }
  return { root: g, update: (c: ModelCtx) => { if (gap) gap.visible = !c.obj.used; } };
}

/** 印刷機：鑄鐵底座 + 木台 + 壓板 + 頂上的大轉輪；側板 (朝鏡頭) 刻兩行字；壓過 (used) 壓板落下、台上多一張紙 */
export function pressModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const base = p.mesh(box(d.w, 0.35, d.d), pal.iron, { metalness: 0.4, roughness: 0.6 });
  base.position.y = 0.175;
  const bed = p.mesh(box(d.w * 0.9, 0.12, d.d * 0.85), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  bed.position.y = 0.41;
  g.add(base, bed);
  for (const s of [-1, 1]) {
    const col = p.mesh(box(0.14, d.h - 0.35, 0.14), pal.iron, { metalness: 0.5, roughness: 0.5 });
    col.position.set(s * (d.w / 2 - 0.12), 0.35 + (d.h - 0.35) / 2, 0);
    g.add(col);
  }
  const beam = p.mesh(box(d.w - 0.1, 0.14, 0.2), pal.iron, { metalness: 0.5, roughness: 0.5 });
  beam.position.y = d.h - 0.07;
  const platen = new THREE.Group();
  const plate = p.mesh(box(d.w * 0.6, 0.1, d.d * 0.6), pal.metal, { metalness: 0.6, roughness: 0.4 });
  platen.add(plate);
  const wheel = p.mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 20), pal.brass, { metalness: 0.7, roughness: 0.35 });
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = d.h + 0.08;
  const sheet = p.mesh(new THREE.PlaneGeometry(d.w * 0.5, d.d * 0.5), pal.paperNote, { outline: false, shadow: false });
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.475;
  g.add(beam, platen, wheel, sheet);
  let side: THREE.Mesh | null = null;
  const update = (c: ModelCtx) => {
    if (!side && d.type === 'press') {
      side = p.mesh(new THREE.PlaneGeometry(d.w * 0.86, 0.26), 0xffffff, { map: inscription(pal, c.world.rt.text(d.side), 'carved', 512), flatMap: true, outline: false, shadow: false, unique: true });
      side.position.set(0, 0.2, d.d / 2 + 0.012);
      g.add(side);
    }
    if (side) side.visible = c.mode === '3d';
    platen.position.y = c.obj.used ? 0.6 : d.h - 0.3;
    sheet.visible = c.obj.used;
    wheel.rotation.z = c.obj.used ? 0.6 : 0;
  };
  return { root: g, update };
}

/** 鉛字盤 (可推)：活字推車 = 胡桃木矮櫃 (四個鐵腳輪、正面三層淺抽屜與黃銅拉手) + 頂上一圈木框裡排滿的鉛字 + 兩側黃銅提把 */
export function typeTrayModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  const brass = { metalness: 0.6, roughness: 0.4 } as const;
  const wheel = 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const caster = p.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), pal.iron, { metalness: 0.5, roughness: 0.5, outline: false });
    caster.rotation.z = Math.PI / 2;
    caster.position.set(sx * (w / 2 - 0.12), 0.05, sz * (dd / 2 - 0.12));
    g.add(caster);
  }
  const top = h - 0.08;
  const body = p.mesh(box(w - 0.04, top - wheel, dd - 0.04), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  body.position.y = wheel + (top - wheel) / 2;
  g.add(body);
  // 正面三層淺抽屜
  const rows = 3;
  const rh = (top - wheel - 0.08) / rows;
  for (let r = 0; r < rows; r++) {
    const y = wheel + 0.04 + rh * (r + 0.5);
    const front = p.mesh(box(w - 0.16, rh - 0.05, 0.03), pal.shelf, { outline: false });
    front.position.set(0, y, (dd - 0.04) / 2 + 0.015);
    const pull = p.mesh(box(0.18, 0.03, 0.03), pal.brass, { ...brass, outline: false, shadow: false });
    pull.position.set(0, y, (dd - 0.04) / 2 + 0.045);
    g.add(front, pull);
  }
  // 頂上的木框 (淺盤) 與鉛字
  const tray = p.mesh(box(w, 0.04, dd), pal.shelf, { outline: false });
  tray.position.y = top + 0.02;
  g.add(tray);
  for (const s of [-1, 1]) {
    const rimX = p.mesh(box(w, h - top - 0.04, 0.05), pal.shelf, { outline: false });
    rimX.position.set(0, top + 0.04 + (h - top - 0.04) / 2, s * (dd / 2 - 0.025));
    const rimZ = p.mesh(box(0.05, h - top - 0.04, dd - 0.1), pal.shelf, { outline: false });
    rimZ.position.set(s * (w / 2 - 0.025), top + 0.04 + (h - top - 0.04) / 2, 0);
    g.add(rimX, rimZ);
  }
  const n = 4;
  const cw = (w - 0.1) / n, cd = (dd - 0.1) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const lead = p.mesh(box(cw - 0.05, 0.025, cd - 0.05), (i + j) % 2 ? pal.iron : pal.metal, { metalness: 0.5, roughness: 0.5, outline: false, shadow: false });
    lead.position.set(-w / 2 + 0.05 + (i + 0.5) * cw, top + 0.0525, -dd / 2 + 0.05 + (j + 0.5) * cd);
    g.add(lead);
  }
  for (const s of [-1, 1]) {
    const handle = p.mesh(box(0.05, 0.05, dd * 0.4), pal.brass, { ...brass, outline: false });
    handle.position.set(s * (w / 2 + 0.03), top - 0.12, 0);
    g.add(handle);
    for (const k of [-1, 1]) {
      const lug = p.mesh(box(0.05, 0.05, 0.05), pal.brass, { ...brass, outline: false, shadow: false });
      lug.position.set(s * (w / 2 - 0.005), top - 0.12, k * dd * 0.2);
      g.add(lug);
    }
  }
  return { root: g };
}

/** 門牌 (只在藏寶圖)：墨框紙籤，字 = 「門」或貼了「日」的「間」 */
export function doorPlateModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const g = new THREE.Group();
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h / 2, 0.02), 0.6);
  return { root: g, update: badge };
}

/** 排字架 (2-3c 的鎖；手稿庫)：斜面木架 + 三個槽；打開 (used) 下方抽屜滑出 */
export function typeLockModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = p.mesh(box(0.1, d.h - 0.1, 0.1), pal.shelfDark, { outline: false });
    leg.position.set(s * (d.w / 2 - 0.1), (d.h - 0.1) / 2, 0);
    g.add(leg);
  }
  const top = p.mesh(box(d.w, 0.1, d.d), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  top.position.y = d.h - 0.05;
  top.rotation.x = 0.12;
  const drawer = p.mesh(box(d.w * 0.5, 0.18, d.d * 0.8), pal.shelfDark, { outline: false });
  drawer.position.y = d.h - 0.26;
  g.add(top, drawer);
  return { root: g, update: (c: ModelCtx) => { drawer.position.z = c.obj.used ? 0.4 : 0; } };
}

/** 字輪：黃銅小鼓 + 朝外的字 (此刻的字；換字時換貼圖) */
export function typeWheelModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const drum = p.mesh(new THREE.CylinderGeometry(d.h / 2, d.h / 2, d.w * 0.8, 16), pal.brass, { metalness: 0.7, roughness: 0.35 });
  drum.rotation.z = Math.PI / 2;
  drum.position.y = d.h / 2;
  g.add(drum);
  const faces = new Map<number, THREE.Mesh>();
  const update = (c: ModelCtx) => {
    if (d.type !== 'typeWheel') return;
    const lock = c.world.byId.get(d.lock);
    if (!lock || lock.def.type !== 'typeLock') return;
    const i = (c.obj.used ? 1 : 0) + (c.obj.touched ? 2 : 0);
    if (!faces.has(i)) {
      const m = p.mesh(new THREE.PlaneGeometry(d.w * 0.7, d.h * 0.7), 0xffffff, { map: inscription(pal, c.world.rt.text(lock.def.glyphs[i]), 'ink', 96), flatMap: true, outline: false, shadow: false, unique: true });
      m.position.set(0, d.h / 2, d.d / 2 + 0.012);
      g.add(m);
      faces.set(i, m);
    }
    for (const [k, m] of faces) m.visible = k === i;
  };
  return { root: g, update };
}
