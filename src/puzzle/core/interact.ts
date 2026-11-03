import type { ItemReq, Mode, ObjState, World } from './types';
import { INTERACT_RANGE } from './constants';
import { objBox } from './geometry';
import { MODES } from './modes';
import { activeIn, effectiveVisibility, isActiveIn } from './presence';
import { addItem, hasItem, openLinks, say } from './world';

/** 未觸發，或類型允許觸發後仍可互動 (出口門) */
function usable(w: World, o: ObjState): boolean {
  return !o.used || !!w.rt.mechanics.types.get(o.def.type)?.spec.usableWhenUsed;
}

function canUse(w: World, o: ObjState, mode: Mode): boolean {
  const d = o.def;
  return isActiveIn(w, o, mode) && usable(w, o) && !!d.interactable && activeIn(d.interactIn ?? effectiveVisibility(w, o), mode);
}

/** 玩家身體中心到物件盒的最近距離；2D 忽略 z (機制判斷「範圍內」也用它，例：標籤) */
export function distanceTo(w: World, o: ObjState): number {
  const p = w.player;
  const b = objBox(o);
  const c = [p.x, p.y + 0.45, p.z];
  let sum = 0;
  const axes = MODES[p.mode].axes;
  for (let i = 0; i < axes; i++) {
    const d = Math.max(b.min[i] - c[i], 0, c[i] - b.max[i]);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** 範圍 (約 1.5) 內最近、目前模式可互動的物件；必須雙腳站穩 (空中不能互動，避免跳躍途中搆到高處) */
export function findTarget(w: World): ObjState | null {
  if (!w.player.onGround) return null;
  let best: ObjState | null = null;
  let bd = INTERACT_RANGE;
  for (const o of w.objs) {
    if (!canUse(w, o, w.player.mode)) continue;
    const d = distanceTo(w, o);
    if (d <= bd) { bd = d; best = o; }
  }
  return best;
}

const reqOf = (r: ItemReq): { item: string; consume: boolean } =>
  typeof r === 'string' ? { item: r, consume: false } : { item: r.item, consume: !!r.consume };

/**
 * E：對最近目標互動。通用前置 (資料驅動，N9)：requires 不滿足 → lockedText 並中止；
 * 滿足 → 消耗 / grants (取得並消失) / opens (自身與目標 used) → useText；之後交給類型 handler。
 */
export function interact(w: World): void {
  const t = findTarget(w);
  if (!t) {
    if (w.rt.mechanics.interactFallback.some(m => m.interactFallback!(w))) return;
    const unreachable = w.player.onGround && w.objs.some(o => isActiveIn(w, o, w.player.mode) && usable(w, o) && o.def.interactable
      && !canUse(w, o, w.player.mode) && distanceTo(w, o) <= INTERACT_RANGE + 1);
    if (unreachable) say(w, 'msg.unreachable');
    return;
  }
  const d = t.def;
  let acted = false;
  if (d.requires !== undefined) {
    const req = reqOf(d.requires);
    if (!hasItem(w, req.item)) { if (d.lockedText !== undefined) say(w, d.lockedText); return; }
    if (req.consume) addItem(w, req.item, -1);
    acted = true;
  }
  if (d.grants !== undefined) { t.gone = true; addItem(w, d.grants, 1); acted = true; }
  if (d.opens !== undefined) { t.used = true; openLinks(w, t); acted = true; }
  if (acted && d.useText !== undefined) say(w, d.useText);
  w.rt.mechanics.types.get(d.type)?.spec.interact?.(w, t);
}
