import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { crateWood } from '../textures';
import type { ModelCtx, PropModel } from './types';

// 2-5 書房深處 (森林圖書館) 的物件外觀：章門平台 (木台 + 欄杆)、鑰匙台 (四個凹槽；組好後空了)、手記架 (小書架上一頁手記)
// 共面規則：同一模型內不同外觀的面不共面 (tests/puzzle/render/coplanar)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 章門平台：厚木台 (側面木紋) + 頂面的地板 + 靠牆一側的欄杆柱 */
export function landingModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h - 0.08, d.d), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  body.position.y = (d.h - 0.08) / 2;
  const top = p.mesh(box(d.w + 0.06, 0.08, d.d + 0.06), pal.shelf, { outline: false });
  top.position.y = d.h - 0.04;
  g.add(body, top);
  for (const z of [-d.d / 2 + 0.05, d.d / 2 - 0.05]) {
    const post = p.mesh(box(0.08, 0.9, 0.08), pal.shelf, { outline: false });
    post.position.set(-d.w / 2 + 0.05, d.h + 0.45, z);
    g.add(post);
  }
  return { root: g };
}

/** 鑰匙台：小木桌 + 黃銅托盤上四個凹槽 (柄 + 三枚齒)；組好 (used) 托盤上的銅鑰匙消失 */
export function keyBenchModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = p.mesh(box(0.07, d.h - 0.06, 0.07), pal.shelfDark, { outline: false }); leg.position.set(sx * (d.w / 2 - 0.08), (d.h - 0.06) / 2, sz * (d.d / 2 - 0.08)); g.add(leg); }
  const top = p.mesh(box(d.w, 0.06, d.d), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  top.position.y = d.h - 0.03;
  const tray = p.mesh(box(d.w * 0.7, 0.03, d.d * 0.6), pal.brass, { metalness: 0.6, roughness: 0.4, outline: false });
  tray.position.y = d.h + 0.015;
  g.add(top, tray);
  const slots: THREE.Mesh[] = [];
  [-0.36, -0.12, 0.12, 0.36].forEach((x, i) => {
    const s = p.mesh(box(i === 0 ? 0.18 : 0.1, 0.02, i === 0 ? 0.22 : 0.12), pal.outline, { outline: false, shadow: false });
    s.position.set(x * d.w * 0.7, d.h + 0.04, 0);
    slots.push(s); g.add(s);
  });
  return { root: g, update: (c: ModelCtx) => { for (const s of slots) s.visible = !c.obj.used; } };
}

/** 手記架：小書架 + 斜放的一頁手記 (拿走 = used 後只剩書架) */
export function diaryStandModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const shelf = p.mesh(box(d.w, d.h * 0.5, d.d), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
  shelf.position.y = d.h * 0.25;
  const page = p.mesh(new THREE.PlaneGeometry(d.w * 0.7, d.h * 0.6), pal.paperNote, { outline: true, shadow: false });
  page.position.set(0, d.h * 0.72, 0);
  page.rotation.x = -0.4;
  g.add(shelf, page);
  return { root: g, update: (c: ModelCtx) => { page.visible = !c.obj.used; } };
}
