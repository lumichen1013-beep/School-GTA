import type { Mechanic } from '../core/registry';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 出口門：被 opens 解封 (used) 後互動即通關；unsealed = 沒有封印的門 (開場即解封，例：1-1 門廊) */
    door: { unsealed?: boolean };
  }
}

/** 出口門 → cleared；未解封說 lockedText，解封後說 useText；unsealed 的門建立世界時即解封 */
export const exit: Mechanic = {
  id: 'exit',
  types: {
    door: {
      verbKey: 'obj.door.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (!o.used) { say(w, o.def.lockedText ?? ''); return; }
        w.cleared = true;
        say(w, o.def.useText ?? '');
      }
    }
  },
  init: w => {
    for (const o of w.objs) if (o.def.type === 'door' && o.def.unsealed) o.used = true;
  }
};
