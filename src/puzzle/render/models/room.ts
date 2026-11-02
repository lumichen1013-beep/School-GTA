import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { floorPlanks } from '../textures';
import type { PropModel } from './types';

// 房間的牆、掛畫、吊燈、地毯、坑洞等裝飾在 render/decor (座標由關卡資料 LevelDef.decor 提供)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 地板：木地板紋理頂面 + 側面；2D 為扁平木色長條 */
export function floorModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const body = p.mesh(box(d.w, d.h, d.d), pal.floorSide, { flat: pal.floorB });
  body.position.y = d.h / 2;
  const top = p.mesh(new THREE.PlaneGeometry(d.w, d.d), 0xffffff, { map: floorPlanks(pal, d.w / 2.6, d.d / 2.6), outline: false });
  top.rotation.x = -Math.PI / 2;
  top.position.y = d.h + 0.002;
  // 前緣飾條兩端各凸出 5mm、頂面低 5mm：不與地板本體端面 / 頂面共面
  const lip = p.mesh(box(d.w + 0.01, 0.12, 0.04), pal.floorA, { outline: false });
  lip.position.set(0, d.h - 0.065, d.d / 2 + 0.01);
  g.add(body, top, lip);
  return { root: g };
}
