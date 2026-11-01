import * as THREE from 'three';
import type { ObjDef } from '../../logic/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import { PAL } from '../palette';
import { glow, wallpaper } from '../textures';
import type { ModelCtx, PropModel } from './types';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);

/** 隔牆 / 楣牆：壁紙 + 護牆板 + 踢腳線；壁紙層可在擋住鏡頭時淡出 */
export function wallModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  // 圖紙裡隔牆用較深的壁紙色塊 (同色系)，和淡色背景牆分開，一眼看出是擋路的牆
  const paper = p.mesh(box(w, h, dd), 0xffffff, { map: wallpaper(dd / 1.2, h / 1.2), flat: PAL.wall2d, unique: true });
  paper.position.y = h / 2;
  g.add(paper);
  const occluders = [paper];
  if (d.y < 0.5) { // 落地的牆段才有護牆板與踢腳線
    const wains = p.mesh(box(w + 0.04, 1.1, dd), PAL.wainscot, { unique: true, outline: false });
    wains.position.y = 0.55;
    const rail = p.mesh(box(w + 0.08, 0.07, dd), PAL.trim, { unique: true, outline: false });
    rail.position.y = 1.12;
    const base = p.mesh(box(w + 0.08, 0.16, dd), PAL.baseboard, { unique: true, outline: false });
    base.position.y = 0.08;
    g.add(wains, rail, base);
    occluders.push(wains, rail, base);
  } else {
    const trim = p.mesh(box(w + 0.08, 0.12, dd + 0.2), PAL.trim, { outline: false });
    trim.position.y = 0.06;
    g.add(trim);
  }
  return { root: g, occluders };
}

/** 閘門 (僅現實)：門框 + 木條閘板 + 鐵箍 + 鉚釘 + 墨痕；壓板壓下後閘板升進楣牆 */
export function gateModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const leaf = new THREE.Group();
  const { w, h } = d;
  const dd = d.d;
  for (const s of [-1, 1]) {
    const post = p.mesh(box(w + 0.16, h + 0.1, 0.14), PAL.trim);
    post.position.set(0, (h + 0.1) / 2, s * (dd / 2 + 0.07));
    g.add(post);
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const plank = p.mesh(box(w * 0.7, h - 0.06, dd / n - 0.03), PAL.gate);
    plank.position.set(0, h / 2, -dd / 2 + (i + 0.5) * (dd / n));
    leaf.add(plank);
    const tip = p.mesh(new THREE.ConeGeometry(dd / n / 2 - 0.02, 0.0001 + 0.12, 4), PAL.gate, { outline: false });
    tip.position.set(0, 0.05, -dd / 2 + (i + 0.5) * (dd / n));
    tip.rotation.x = Math.PI;
    leaf.add(tip);
  }
  for (const y of [0.55, h - 0.6]) {
    const band = p.mesh(box(w * 0.95, 0.12, dd - 0.02), PAL.iron, { metalness: 0.6, roughness: 0.4 });
    band.position.y = y;
    leaf.add(band);
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const rivet = p.mesh(new THREE.SphereGeometry(0.025, 6, 4), PAL.metal, { outline: false, shadow: false });
      rivet.position.set(s * w * 0.5, y, -dd / 2 + (i + 0.5) * (dd / n));
      leaf.add(rivet);
    }
  }
  // 墨痕：兩側面各一團墨漬 + 垂滴，暗示和圖紙的關聯
  for (const s of [-1, 1]) {
    const blot = p.mesh(new THREE.CircleGeometry(0.26, 18), PAL.sealInk, { outline: false, shadow: false, side: THREE.DoubleSide });
    blot.position.set(s * (w * 0.5 + 0.012), h * 0.62, 0.1);
    blot.rotation.y = Math.PI / 2;
    blot.scale.set(1, 0.8, 1);
    const drip = p.mesh(box(0.01, 0.4, 0.06), PAL.sealInk, { outline: false, shadow: false });
    drip.position.set(s * (w * 0.5 + 0.012), h * 0.62 - 0.32, 0.18);
    leaf.add(blot, drip);
  }
  g.add(leaf);
  const update = (c: ModelCtx) => {
    leaf.position.y = approach(leaf.position.y, c.obj.used ? h - 0.15 : 0, c.dt * 2.2);
  };
  return { root: g, update };
}

/** 墨線封印：門板上的粗筆觸 + 墨漬 + 垂滴 */
function inkSeal(p: Painter, w: number, h: number): THREE.Group {
  const seal = new THREE.Group();
  const strokes: Array<Array<[number, number]>> = [
    [[-0.75, 0.5], [-0.3, 0.9], [0.1, 0.7], [0.75, 1.3]],
    [[-0.7, 1.75], [-0.1, 1.35], [0.3, 1.6], [0.72, 0.6]],
    [[-0.6, 1.15], [0, 1.25], [0.6, 1.05]]
  ];
  strokes.forEach((pts, i) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x * w / 1.6, y * h / 2.4, 0)));
    const tube = p.mesh(new THREE.TubeGeometry(curve, 40, 0.05 + i * 0.012, 6, false), PAL.sealInk, { outline: false, shadow: false, roughness: 0.3 });
    seal.add(tube);
  });
  for (const [x, y, r] of [[-0.35, 1.0, 0.16], [0.42, 1.45, 0.12], [0.05, 0.62, 0.1], [-0.55, 1.62, 0.08]]) {
    const blot = p.mesh(new THREE.SphereGeometry(r, 12, 8), PAL.sealInk, { outline: false, shadow: false, roughness: 0.3 });
    blot.scale.set(1.2, 1, 0.25);
    blot.position.set(x, y, 0.02);
    const drip = p.mesh(new THREE.CylinderGeometry(0.018, 0.03, r * 2.4, 6), PAL.sealInk, { outline: false, shadow: false });
    drip.position.set(x + 0.03, y - r * 1.3, 0.02);
    seal.add(blot, drip);
  }
  return seal;
}

/** 出口門 (後牆)：門框 + 嵌板門扇 + 黃銅門把 + 墨線封印；解封後封印收起，通關時門扇開啟 */
export function doorModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const { w, h } = d;
  const fw = 0.16;
  const frame = (bw: number, bh: number, x: number, y: number) => {
    const m = p.mesh(box(bw, bh, d.d + 0.06), PAL.doorFrame);
    m.position.set(x, y, 0);
    g.add(m);
  };
  frame(fw, h + fw, -w / 2 - fw / 2, (h + fw) / 2);
  frame(fw, h + fw, w / 2 + fw / 2, (h + fw) / 2);
  frame(w + fw * 2 + 0.1, fw, 0, h + fw / 2);
  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, d.d / 2 - 0.05);
  const leaf = p.mesh(box(w, h, 0.08), PAL.door);
  leaf.position.set(w / 2, h / 2, 0);
  hinge.add(leaf);
  for (const [x, y, pw, ph] of [[0.42, 1.7, 0.5, 0.75], [1.18, 1.7, 0.5, 0.75], [0.42, 0.62, 0.5, 0.85], [1.18, 0.62, 0.5, 0.85]]) {
    const panel = p.mesh(box(pw * (w / 1.6), ph, 0.03), PAL.doorPanel, { outline: false });
    panel.position.set(x * (w / 1.6), y, 0.05);
    hinge.add(panel);
  }
  const plate = p.mesh(box(0.08, 0.26, 0.02), PAL.brass, { metalness: 0.7, roughness: 0.35, outline: false });
  plate.position.set(w - 0.16, 1.1, 0.055);
  const knob = p.mesh(new THREE.SphereGeometry(0.06, 12, 10), PAL.brass, { metalness: 0.7, roughness: 0.3 });
  knob.position.set(w - 0.16, 1.1, 0.11);
  hinge.add(plate, knob);
  g.add(hinge);
  const seal = inkSeal(p, w, h);
  seal.position.set(0, 0, d.d / 2 + 0.06);
  g.add(seal);
  const update = (c: ModelCtx) => {
    const k = approach(seal.scale.x, c.world.sealed ? 1 : 0.001, c.dt * 3);
    seal.scale.setScalar(k);
    seal.visible = k > 0.01;
    hinge.rotation.y = approach(hinge.rotation.y, c.world.cleared ? -1.4 : 0, c.dt * 3);
  };
  return { root: g, update };
}

/** 墨水閥 (僅圖紙)：墨藍閥輪 + 輪輻 + 紫色墨瓶 + 脈動光暈；轉開後光暈熄滅、閥輪轉一圈 */
export function valveModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const s = d.w;
  const glowMat = { emissive: PAL.inkBlue, emissiveIntensity: 0.5, roughness: 0.3 };
  const halo = glowSprite(glow(), PAL.inkHalo, 1.8, 0.8);
  halo.position.y = s / 2;
  g.add(halo);
  const pipe = p.mesh(new THREE.CylinderGeometry(0.06, 0.06, s * 1.6, 10), PAL.inkPurple, glowMat);
  pipe.position.set(0, -s * 0.3, -0.05);
  const bottle = p.mesh(new THREE.SphereGeometry(s * 0.32, 16, 12), PAL.inkPurple, glowMat);
  bottle.scale.set(1, 1.15, 0.7);
  bottle.position.set(0, s * 1.15, -0.05);
  const neck = p.mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 10), PAL.inkPurple, glowMat);
  neck.position.set(0, s * 1.5, -0.05);
  g.add(pipe, bottle, neck);
  const wheel = new THREE.Group();
  wheel.position.set(0, s / 2, 0.08);
  const rim = p.mesh(new THREE.TorusGeometry(s * 0.42, 0.045, 10, 26), PAL.inkBlue, glowMat);
  const hub = p.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12).rotateX(Math.PI / 2), PAL.inkGlow, glowMat);
  wheel.add(rim, hub);
  for (let i = 0; i < 4; i++) {
    const spoke = p.mesh(box(s * 0.84, 0.04, 0.04), PAL.inkBlue, { ...glowMat, outline: false });
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  g.add(wheel);
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const drop = p.mesh(new THREE.SphereGeometry(0.045, 8, 6), PAL.inkBlue, { outline: false, shadow: false });
    drop.scale.set(0.8, 1.2, 0.8);
    drops.push(drop);
    g.add(drop);
  }
  const update = (c: ModelCtx) => {
    const used = c.obj.used;
    wheel.rotation.z = approach(wheel.rotation.z, used ? -Math.PI * 2 : Math.sin(c.t * 1.5) * 0.08, c.dt * 2);
    halo.material.opacity = used ? approach(halo.material.opacity, 0, c.dt * 2) : 0.55 + 0.3 * Math.sin(c.t * 3);
    halo.scale.setScalar(1.7 + 0.2 * Math.sin(c.t * 3));
    drops.forEach((dr, i) => {
      const f = (c.t * 0.6 + i / 3) % 1;
      dr.visible = !used;
      dr.position.set(0.18 * Math.sin(i * 2.1), s * 1.5 + f * 0.5, 0.05);
      dr.scale.setScalar(1 - f);
    });
  };
  return { root: g, update };
}

/** 壓板 (僅圖紙)：紫色板 + 墨藍符紋 + 光暈；壓下後下沉並亮成金色 */
export function plateModel(p: Painter, d: ObjDef): PropModel {
  const g = new THREE.Group();
  const top = new THREE.Group();
  const base = p.mesh(box(d.w, d.h, 0.3), PAL.inkPurple, { emissive: PAL.inkPurple, emissiveIntensity: 0.3 });
  base.position.y = d.h / 2;
  top.add(base);
  for (let i = 0; i < 5; i++) {
    const rune = p.mesh(box(0.08, 0.035, 0.31), i % 2 ? PAL.inkGlow : PAL.inkBlue, { outline: false, shadow: false });
    rune.position.set(-d.w / 2 + 0.16 + i * ((d.w - 0.32) / 4), d.h * 0.5, 0);
    top.add(rune);
  }
  const lit = p.mesh(box(d.w * 0.9, 0.04, 0.32), PAL.gold, { outline: false, shadow: false });
  lit.position.y = d.h * 0.6;
  lit.visible = false;
  top.add(lit);
  const halo = glowSprite(glow(), PAL.inkHalo, 1, 0.8);
  halo.scale.set(d.w * 1.9, 0.9, 1);
  halo.position.y = 0.2;
  g.add(top, halo);
  // 指向壓板的墨線箭頭 (浮在上方，提醒玩家這裡要放東西)
  const arrow = p.mesh(new THREE.ConeGeometry(0.12, 0.22, 3), PAL.inkBlue, { shadow: false });
  arrow.rotation.z = Math.PI;
  g.add(arrow);
  const update = (c: ModelCtx) => {
    const used = c.obj.used;
    top.position.y = approach(top.position.y, used ? -d.h * 0.6 : 0, c.dt * 6);
    lit.visible = used;
    const k = 0.5 + 0.5 * Math.sin(c.t * 3.4);
    halo.material.color.set(used ? PAL.gold : PAL.inkHalo);
    halo.material.opacity = used ? 0.45 : 0.45 + 0.35 * k;
    arrow.visible = !used;
    arrow.position.y = 1.55 + 0.12 * k;
  };
  return { root: g, update };
}
