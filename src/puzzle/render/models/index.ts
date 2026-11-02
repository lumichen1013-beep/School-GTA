import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import { NibKeyModel } from './key';
import { crateModel, noteModel, plinthModel, railModel, shelfModel, tableModel } from './props';
import { doorModel, gateModel, plateModel, valveModel, wallModel } from './devices';
import { floorModel } from './room';
import type { PropModel } from './types';
import type { Theme } from '../themes';

/** 物件類型 → 模型工廠：同一份物件資料產生 3D / 2D 兩種外觀 (Painter 每個網格兩套材質) */
export type ModelFactory = (paint: Painter, def: ObjDef, theme: Theme) => PropModel;

/** 筆尖鑰匙：旋轉漂浮 + 微光 (類別模型包成工廠) */
export const keyModel: ModelFactory = (p, _d, theme) => {
  const key = new NibKeyModel(p, theme.pal);
  return { root: key.root, update: c => key.update(c.t, c.mode === '2d') };
};

/**
 * 模型登錄表 (architecture 4.5)：新增物件類型 = 新增模型檔 + 這裡加一行。
 * 鍵為 ObjDef.type (字串，機制以 declaration merging 擴充的類型也適用)
 */
export const MODELS: Readonly<Partial<Record<string, ModelFactory>>> = {
  floor: floorModel, shelf: shelfModel, crate: crateModel, plinth: plinthModel, rail: railModel, table: tableModel,
  note: noteModel, wall: wallModel, gate: gateModel, door: doorModel, valve: valveModel, plate: plateModel, key: keyModel
};

/** 未登錄類型的後備外觀：洋紅盒 (開發期一眼看出缺模型，不會隱形) */
export const boxModel: ModelFactory = (p, d) => {
  const g = new THREE.Group();
  const m = p.mesh(new THREE.BoxGeometry(d.w, d.h, d.d), 0xff00ff);
  m.position.y = d.h / 2;
  g.add(m);
  return { root: g };
};

/** 依類型取模型工廠 (找不到 → boxModel) */
export const modelFor = (type: string): ModelFactory => MODELS[type] ?? boxModel;
