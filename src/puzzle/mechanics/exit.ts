import type { Mechanic } from '../core/registry';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 出口門：被 opens 解封 (used) 後互動即通關 */
    door: {};
  }
}

/** 出口門 → cleared；未解封說 lockedText，解封後說 useText */
export const exit: Mechanic = {
  id: 'exit',
  types: {
    door: {
      usableWhenUsed: true,
      interact: (w, o) => {
        if (!o.used) { say(w, o.def.lockedText ?? ''); return; }
        w.cleared = true;
        say(w, o.def.useText ?? '');
      }
    }
  }
};
