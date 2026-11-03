import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { labelBadge } from './label';
import type { ModelCtx, PropModel } from './types';

// 1-3 衣帽間 / 1-3a 的外觀：衣架與三件大衣 (驚嚇：同時滑落)、玄關西區高處的掛鉤 (銅鑰匙 + 一頁手記)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** 驚嚇：一般 0.45 秒同時落下 (落地輕彈一次)；減弱緊張效果 = 1.8 秒緩緩滑落、不彈 (規格 9.1 平靜版)；亮度不變 (不閃爍) */
const FALL_SEC = 0.45;
const CALM_SEC = 1.8;
/** 進房 1 秒內就已是滑落狀態 (演出過、R、存檔) → 直接擺成倒下，不再演 */
const SETTLED_BEFORE = 1;

/**
 * 衣架：兩根立柱 + 橫桿；三件大衣 (中間那件顏色不同：爸爸的) 掛在橫桿下。
 * 滑落 (used)：三件同時往前滑下、倒在地上；藏寶圖裡另畫標籤「大衣」與空的尺度卡槽 (N22 鋪陳)
 */
export function coatRackModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
  const g = new THREE.Group();
  const h = d.h;
  for (const x of [-d.w / 2 + 0.08, d.w / 2 - 0.08]) {
    const post = p.mesh(box(0.08, h, 0.08), pal.crateDark);
    post.position.set(x, h / 2, -0.15);
    const foot = p.mesh(box(0.4, 0.06, 0.5), pal.crateDark, { outline: false });
    foot.position.set(x, 0.03, -0.1);
    g.add(post, foot);
  }
  const bar = p.mesh(new THREE.CylinderGeometry(0.035, 0.035, d.w - 0.1, 10), pal.brass, { metalness: 0.6, roughness: 0.4 });
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, h - 0.12, -0.15);
  g.add(bar);
  const colors = [pal.coatDark, pal.coat, pal.trousers];
  const coats = [-0.72, 0, 0.72].map((x, i) => {
    const coat = new THREE.Group();
    const hanger = p.mesh(box(0.42, 0.04, 0.04), pal.metal, { outline: false });
    hanger.position.y = -0.06;
    const shoulders = p.mesh(box(0.52, 0.18, 0.22), colors[i]);
    shoulders.position.y = -0.18;
    const body = p.mesh(new THREE.CylinderGeometry(0.24, 0.32, 1.1, 10), colors[i]);
    body.position.y = -0.82;
    const collar = p.mesh(box(0.2, 0.12, 0.05), pal.scarf, { outline: false });
    collar.position.set(0, -0.2, 0.12);
    coat.add(hanger, shoulders, body, collar);
    coat.name = 'coat';
    coat.position.set(x, h - 0.12, -0.05);
    g.add(coat);
    return { coat, x, i };
  });
  const badge = labelBadge(p, d, theme, g, new THREE.Vector3(0, h + 0.42, 0.05), 0.5);
  let fall = -1;      // 0 → 1 進度；-1 = 掛著
  let dur = FALL_SEC;
  const pose = (k: number, calm: boolean) => {
    for (const { coat, x, i } of coats) {
      const e = calm ? k * k * (3 - 2 * k) : Math.min(1, k * k * 1.15);
      const bounce = calm || k < 0.85 ? 0 : Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.06;
      coat.position.set(x + (i - 1) * 0.12 * e, (h - 0.12) - (h - 0.5) * e + bounce, -0.05 + 0.55 * e);
      coat.rotation.x = -1.35 * e;
      coat.rotation.z = (i - 1) * 0.25 * e;
    }
  };
  const update = (c: ModelCtx) => {
    badge(c);
    if (!c.obj.used) { if (fall !== -1) { fall = -1; pose(0, false); } return; }
    if (fall === -1) {
      if (c.world.time < SETTLED_BEFORE) { fall = 1; pose(1, true); return; }
      fall = 0;
      dur = c.calm ? CALM_SEC : FALL_SEC;
    }
    if (fall < 1) { fall = Math.min(1, fall + c.dt / dur); pose(fall, !!c.calm); }
  };
  return { root: g, update };
}

/** 掛鉤 (玄關西區高處)：小木牌 + 黃銅鉤，掛著銅鑰匙與一頁對折的舊手記；取下 (gone) 後整組消失 */
export function hookModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const plate = p.mesh(box(0.34, 0.16, 0.04), pal.crateDark);
  plate.position.set(0, d.h - 0.05, -d.d / 2 + 0.02);
  const hook = p.mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI * 1.3), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false });
  hook.position.set(0, d.h - 0.16, 0);
  hook.rotation.z = Math.PI;
  const ring = p.mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 14), pal.brass, { metalness: 0.75, roughness: 0.3, outline: false });
  ring.position.set(0, d.h - 0.24, 0.02);
  const shaft = p.mesh(box(0.035, 0.18, 0.02), pal.brass, { metalness: 0.75, roughness: 0.3 });
  shaft.position.set(0, d.h - 0.36, 0.02);
  const bit = p.mesh(box(0.07, 0.04, 0.02), pal.brass, { metalness: 0.75, roughness: 0.3, outline: false });
  bit.position.set(0.03, d.h - 0.42, 0.02);
  const page = p.mesh(box(0.16, 0.2, 0.01), pal.paperNote);
  page.position.set(-0.09, d.h - 0.3, 0.03);
  page.rotation.z = 0.18;
  g.add(plate, hook, ring, shaft, bit, page);
  const update = (c: ModelCtx) => { ring.rotation.z = Math.sin(c.t * 1.6) * 0.08; };
  return { root: g, update };
}
