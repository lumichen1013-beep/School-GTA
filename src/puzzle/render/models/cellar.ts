import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { mergeParts, placed } from '../geometry';
import { crateWood } from '../textures';
import type { PropModel } from './types';

// 第四章 地下室的機關外觀 (規格 6「4-1 根窖走廊（細化）」)：拉繩、只畫在圖上的台階、根結踏板 (折疊梯 = render/models/cube 的梯口)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ROOT = 0x5a4636;

/** 拉繩：從天花板垂下的一條麻繩，末端一個木把手 (兩個視角都畫；只在藏寶圖按)；拉下 = 繩子收短、把手停在高處 */
export function foldCordModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const rope = p.mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), 0xb89a68, { outline: false });
  const handle = p.mesh(mergeParts([placed(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8), 0, 0, 0, 0, 0, Math.PI / 2)]), pal.shelfDark, { map: crateWood(pal), flat: pal.shelfDark });
  g.add(rope, handle);
  // 繩子從天花板 (y 5.6 − 物件底) 垂到把手
  const top = 5.6 - d.y;
  const set = (low: number) => { rope.scale.y = top - low; rope.position.y = (top + low) / 2; handle.position.y = low; };
  set(0.12);
  let last = false;
  return {
    root: g,
    update: c => {
      if (c.obj.used === last) return;
      last = c.obj.used;
      set(last ? 0.9 : 0.12);
    }
  };
}

/** 只畫在圖上的台階：墨線描的石階 (紙色面 + 墨描邊 + 斜線陰影)；visible '2d' 由場景處理 (實景不畫) */
export function inkStepModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h, d.d), 0xf2ead8, { flat: 0xf2ead8 });
  body.position.y = d.h / 2;
  g.add(body);
  const hatch: THREE.BufferGeometry[] = [];
  for (let k = -d.w / 2 + 0.3; k < d.w / 2 - 0.25; k += 0.22) hatch.push(placed(box(0.03, d.h * 0.55, 0.02), k, d.h * 0.42, d.d / 2 + 0.012, 0, 0, 0.35));
  g.add(p.mesh(mergeParts(hatch), pal.inkBlue, { flat: pal.inkBlue, outline: false, shadow: false }));
  const lip = p.mesh(box(d.w + 0.06, 0.06, d.d + 0.06), pal.inkBlue, { flat: pal.inkBlue, outline: false });
  lip.position.y = d.h - 0.02;
  g.add(lip);
  return { root: g };
}

/** 根結踏板：地上一塊石板，四周的細根纏住年輪的方向 (壓下 = 石板下沉 4 cm、根縮回)；兩個視角都畫 */
export function rootPlateModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const slab = p.mesh(box(d.w * 0.8, 0.08, d.d * 0.8), pal.stone, { roughness: 0.95 });
  slab.position.y = 0.045;
  g.add(slab);
  const roots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const pts = [new THREE.Vector3(Math.cos(a) * d.w * 0.5, 0.02, Math.sin(a) * d.d * 0.5), new THREE.Vector3(Math.cos(a) * d.w * 0.35, 0.09, Math.sin(a) * d.d * 0.32), new THREE.Vector3(Math.cos(a + 0.6) * d.w * 0.2, 0.1, Math.sin(a + 0.6) * d.d * 0.2)];
    roots.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.025, 5, false));
  }
  const root = p.mesh(mergeParts(roots), ROOT, { outline: false });
  g.add(root);
  let last = false;
  return {
    root: g,
    update: c => {
      if (c.obj.used === last) return;
      last = c.obj.used;
      slab.position.y = last ? 0.005 : 0.045;
      root.scale.setScalar(last ? 0.55 : 1);
    }
  };
}
