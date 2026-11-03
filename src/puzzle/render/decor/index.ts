import * as THREE from 'three';
import type { DecorItem, LevelDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { paintingDecor, pendantDecor, pitsDecor, rugDecor, wallShelfDecor, wallsDecor } from './room';
import { bookcaseDecor, floatBooksDecor, floorPieceDecor, rootsDecor, stainedGlassDecor } from './library';
import type { DecorFactory } from './types';

export type { DecorCtx, DecorFactory, DecorPart } from './types';

/**
 * 裝飾登錄表 (architecture 4.5)：LevelDef.decor[].kind → 工廠。
 * 新增一種裝飾 = decor/<name>.ts 寫工廠 + 這裡加一行；關卡資料只放座標與參數
 */
export const DECOR: Readonly<Partial<Record<string, DecorFactory>>> = {
  walls: wallsDecor, painting: paintingDecor, wallShelf: wallShelfDecor, rug: rugDecor, pendant: pendantDecor, pits: pitsDecor,
  // 森林圖書館 (第二章)
  roots: rootsDecor, stainedGlass: stainedGlassDecor, floatBooks: floatBooksDecor, bookcase: bookcaseDecor,
  // 2-4a：地板上的老宅圖一角
  floorPiece: floorPieceDecor
};

/** 整個房間的裝飾：root = 全部；only3d = 僅現實顯示；occluders = 擋視線時淡出 */
export interface Decor { root: THREE.Group; only3d: THREE.Object3D[]; occluders: THREE.Mesh[]; update(t: number, is2d: boolean): void }

/** 依 level.decor 的順序建出全部裝飾 (未登錄的 kind 略過並警告) */
export function buildDecor(p: Painter, level: LevelDef, theme: Theme, opts: { still?: boolean } = {}): Decor {
  const root = new THREE.Group();
  const only3d: THREE.Object3D[] = [];
  const occluders: THREE.Mesh[] = [];
  const updates: Array<(t: number, is2d: boolean) => void> = [];
  const counts = new Map<string, number>();
  for (const item of level.decor ?? ([] as readonly DecorItem[])) {
    const make = DECOR[item.kind];
    if (!make) { console.warn(`[puzzle] unknown decor kind: ${item.kind}`); continue; }
    const nth = counts.get(item.kind) ?? 0;
    counts.set(item.kind, nth + 1);
    const part = make(p, item, { level, theme, nth, still: !!opts.still });
    root.add(part.root);
    if (part.only3d) only3d.push(...part.only3d);
    if (part.occluders) occluders.push(...part.occluders);
    if (part.update) updates.push(part.update);
  }
  let last: boolean | null = null;
  const update = (t: number, is2d: boolean) => {
    if (last !== is2d) {
      last = is2d;
      for (const o of only3d) o.visible = !is2d;
    }
    for (const u of updates) u(t, is2d);
  };
  return { root, only3d, occluders, update };
}
