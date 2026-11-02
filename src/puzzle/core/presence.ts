import type { Mode, ObjState, Visibility, World } from './types';

/** 可見模式是否涵蓋此模式 */
export const activeIn = (v: Visibility, m: Mode): boolean => v === 'both' || v === m;

/** 已開啟的閘門不再擋路 */
export const isOpenGate = (o: ObjState): boolean => o.def.type === 'gate' && o.used;

/** 有效可見性 (目前即靜態 def.visible；日後由機制覆寫，如 N5 定稿) */
export function effectiveVisibility(_w: World, o: ObjState): Visibility {
  return o.def.visible;
}

/** 單一真相來源：物件在此模式是否存在 (未被拾取且可見模式吻合) */
export function isActiveIn(w: World, o: ObjState, mode: Mode): boolean {
  return !o.gone && activeIn(effectiveVisibility(w, o), mode);
}

/** 世界中所有物件 (日後含推導物件) */
export const allObjs = (w: World): readonly ObjState[] => w.objs;

/** 存在但不擋路 (機制 passable 掛點 OR 合成) */
export function isPassable(w: World, o: ObjState): boolean {
  return isOpenGate(o) || w.rt.mechanics.passable.some(m => m.passable!(w, o));
}

/** 目前模式下生效的實體 (存在、solid、未被機制放行) */
export function solidsFor(w: World, mode: Mode): ObjState[] {
  return w.objs.filter(o => isActiveIn(w, o, mode) && o.def.solid && !isPassable(w, o));
}
