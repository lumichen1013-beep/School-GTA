import type { Mode, ObjState, World } from './types';
import { INTERACT_RANGE } from './constants';
import { activeIn, objBox } from './geometry';
import { say } from './world';

export const MSG_KEY = '拿到了「筆尖」。它還帶著一點未乾的墨。';
export const MSG_GATE = '閘門紋絲不動。門軸上沾著墨，像在等紙上的什麼。';

function canUse(o: ObjState, mode: Mode): boolean {
  const d = o.def;
  return !o.gone && !o.used && !!d.interactable && activeIn(d.visible, mode) && activeIn(d.interactIn ?? d.visible, mode);
}

/** 玩家身體中心到物件盒的最近距離；2D 忽略 z */
function distanceTo(w: World, o: ObjState): number {
  const p = w.player;
  const b = objBox(o);
  const c = [p.x, p.y + 0.45, p.z];
  let sum = 0;
  const axes = p.mode === '2d' ? 2 : 3;
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
    if (!canUse(o, w.player.mode)) continue;
    const d = distanceTo(w, o);
    if (d <= bd) { bd = d; best = o; }
  }
  return best;
}

/** E：對最近目標互動，驅動關卡狀態 (筆尖 → 墨水閥 → 出口門) */
export function interact(w: World): void {
  const t = findTarget(w);
  if (!t) {
    const unreachable = w.player.onGround && w.objs.some(o => !o.gone && !o.used && o.def.interactable && activeIn(o.def.visible, w.player.mode)
      && !canUse(o, w.player.mode) && distanceTo(w, o) <= INTERACT_RANGE + 1);
    if (unreachable) say(w, '看得見，卻碰不到。換個角度試試。');
    return;
  }
  switch (t.def.type) {
    case 'note': say(w, t.def.text ?? ''); break;
    case 'key':
      t.gone = true; w.hasKey = true;
      say(w, MSG_KEY);
      break;
    case 'gate': say(w, MSG_GATE); break;
    case 'valve':
      if (!w.hasKey) { say(w, '墨水閥乾涸了。需要一支能引墨的東西。'); break; }
      t.used = true; w.sealed = false;
      say(w, '筆尖點下，墨線像退潮一樣散開了。');
      break;
    case 'door':
      if (w.sealed) { say(w, '門被墨線封印著。圖紙裡似乎有它的機關。'); break; }
      w.cleared = true;
      say(w, '門開了。');
      break;
    default: break;
  }
}
