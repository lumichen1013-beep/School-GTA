import type { Mechanic } from '../core/registry';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 紙條：讀出 text */
    note: { text?: string };
  }
}

/** C14：紙條 */
export const notes: Mechanic = {
  id: 'notes',
  types: { note: { interact: (w, o) => say(w, o.def.type === 'note' ? o.def.text ?? '' : '') } }
};
