import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { inscription, portraitCanvas } from '../textures';
import type { ModelCtx, PropModel } from './types';

// 順序鎖 (N27；1-2d 三代的年份) 的外觀：畫像 (年份：實景 = 畫框上方的黃銅刻字牌、藏寶圖 = 同位置的墨字紙籤)、拉繩、畫像下的小抽屜

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
/** 年份牌的中心高度 (畫框頂上方) 與尺寸 */
const TAG_W = 0.66;
const TAG_H = 0.21;

/**
 * 畫像：木框 + 畫布 (variant 決定畫的人)；年份牌在畫框上方 —
 * 實景每幅都有黃銅牌 (carved 有字、沒有就是空白牌)，藏寶圖只有寫了 ink 的畫像有墨字紙籤 (含劃掉的字)。
 * 牌上的字要文字解析器，第一次 update 才建 (ModelCtx.world.rt.text)
 */
export function portraitModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const frame = p.mesh(box(d.w + 0.14, d.h + 0.14, 0.06), pal.doorFrame, { outline: true });
  frame.position.set(0, d.h / 2, 0);
  const inner = p.mesh(box(d.w + 0.03, d.h + 0.03, 0.065), pal.gold, { outline: false, metalness: 0.4, roughness: 0.4 });
  inner.position.set(0, d.h / 2, 0);
  const canvasMesh = p.mesh(new THREE.PlaneGeometry(d.w * 0.9, d.h * 0.9), 0xffffff, {
    map: portraitCanvas(d.type === 'portrait' ? d.variant : 0), flatMap: true, outline: false, shadow: false
  });
  canvasMesh.position.set(0, d.h / 2, 0.037);
  g.add(frame, inner, canvasMesh);
  const tagY = d.h + 0.07 + 0.06 + TAG_H / 2;
  let carved: THREE.Mesh | null = null;
  let ink: THREE.Mesh | null = null;
  const build = (text: (key: string) => string): void => {
    if (d.type !== 'portrait') return;
    carved = p.mesh(box(TAG_W, TAG_H, 0.03), pal.brass, {
      map: inscription(pal, d.carved ? text(d.carved) : '', 'carved'), metalness: 0.5, roughness: 0.45, outline: false
    });
    carved.name = 'carved';
    carved.position.set(0, tagY, -0.02);
    g.add(carved);
    if (d.ink) {
      ink = p.mesh(new THREE.PlaneGeometry(TAG_W * 1.15, TAG_H * 1.2), 0xffffff, { map: inscription(pal, text(d.ink), 'ink'), flatMap: true, outline: true, shadow: false });
      ink.name = 'ink';
      ink.position.set(0, tagY, 0.01);
      g.add(ink);
    }
  };
  const update = (c: ModelCtx) => {
    if (!carved) build(key => c.world.rt.text(key));
    if (carved) carved.visible = c.mode === '3d';
    if (ink) ink.visible = c.mode === '2d';
  };
  return { root: g, update };
}

/** 拉繩：頂端黃銅環 + 繩 + 木把手；拉著 (used) 時繩與把手往下停住，彈回時慢慢回升 */
export function cordModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const ring = p.mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false });
  ring.position.set(0, d.h - 0.04, 0);
  g.add(ring);
  const pull = new THREE.Group();
  const ropeLen = d.h - 0.22;
  const rope = p.mesh(new THREE.CylinderGeometry(0.022, 0.022, ropeLen, 8), pal.cord, { roughness: 0.95 });
  rope.position.y = 0.2 + ropeLen / 2;
  const handle = p.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 12), pal.crateDark, { roughness: 0.6 });
  handle.position.y = 0.1;
  const tassel = p.mesh(new THREE.ConeGeometry(0.07, 0.12, 10), pal.scarf, { outline: false });
  tassel.position.y = -0.02;
  tassel.rotation.x = Math.PI;
  pull.add(rope, handle, tassel);
  g.add(pull);
  const update = (c: ModelCtx) => {
    pull.position.y = approach(pull.position.y, c.obj.used ? -0.28 : 0, c.dt * 6);
  };
  return { root: g, update };
}

/** 小抽屜 (順序鎖本身)：貼牆的木櫃 + 抽屜面板 + 黃銅把手；打開 (used) 後抽屜滑出 */
export function drawerModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  // 櫃體只占邏輯盒的前 0.24 (背面離後牆 0.06)：不與護牆板 / 踢腳線的正面共面
  const depth = Math.min(d.d, 0.24);
  const body = p.mesh(box(d.w, d.h, depth), pal.crateDark);
  body.position.set(0, d.h / 2, d.d / 2 - depth / 2);
  const top = p.mesh(box(d.w + 0.06, 0.04, depth + 0.04), pal.shelf, { outline: false });
  top.position.set(0, d.h + 0.02, d.d / 2 - depth / 2 + 0.01);
  g.add(body, top);
  const front = new THREE.Group();
  const panel = p.mesh(box(d.w * 0.8, d.h * 0.55, 0.04), pal.shelf);
  panel.position.set(0, d.h * 0.48, 0);
  const knob = p.mesh(new THREE.SphereGeometry(0.045, 10, 8), pal.brass, { metalness: 0.7, roughness: 0.3, outline: false });
  knob.position.set(0, d.h * 0.48, 0.04);
  front.add(panel, knob);
  front.position.z = d.d / 2 + 0.021;
  g.add(front);
  const closedZ = front.position.z;
  const update = (c: ModelCtx) => {
    front.position.z = approach(front.position.z, closedZ + (c.obj.used ? 0.2 : 0), c.dt * 5);
  };
  return { root: g, update };
}
