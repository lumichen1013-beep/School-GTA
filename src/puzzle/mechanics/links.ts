import type { Mechanic } from '../core/registry';
import type { ObjState } from '../core/types';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 閘門：被 opens 觸發 (used) 後不再擋路、不可互動 */
    gate: {};
  }
}

/** 已開啟的閘門不再擋路 */
export const isOpenGate = (o: ObjState): boolean => o.def.type === 'gate' && o.used;

/** C7：閘門 (opens 連結的目標) */
export const links: Mechanic = {
  id: 'links',
  types: { gate: { verbKey: 'obj.gate.verb', interact: w => say(w, 'msg.gate') } },
  passable: (_w, o) => isOpenGate(o)
};
