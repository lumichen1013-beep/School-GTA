import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import type { ModelCtx, PropModel } from './types';

// 控制盤 (v0.4 N32) 的外觀：魔方儀 (閱讀架上的黃銅小魔方：2×3 的小方塊，啟動後慢慢轉) 與鎖扣開關 (後牆的黃銅把手，拉下 = used)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 魔方儀：木頭閱讀架 + 黃銅底座 + 2×3 小方塊；已啟動 (ext.dial.active) → 方塊組慢慢轉、上排不時滑一格 */
export function dialModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const standH = d.h * 0.55;
  const top = p.mesh(box(d.w, 0.08, d.d), pal.crateDark);
  top.position.y = standH;
  const leg = p.mesh(box(0.16, standH, 0.16), pal.crateDark);
  leg.position.y = standH / 2;
  const foot = p.mesh(box(d.w * 0.7, 0.06, d.d * 0.7), pal.crateDark, { outline: false });
  foot.position.y = 0.03;
  const ring = p.mesh(new THREE.TorusGeometry(d.w * 0.32, 0.03, 8, 28), pal.brass, { metalness: 0.7, roughness: 0.3 });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = standH + 0.06;
  g.add(top, leg, foot, ring);
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
