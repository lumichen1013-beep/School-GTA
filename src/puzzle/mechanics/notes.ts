import type { Mechanic } from '../core/registry';
import type { TextKey } from '../core/types';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 紙條：讀出 textKey */
    note: { textKey?: TextKey };
  }
}

/** C14：紙條 */
export const notes: Mechanic = {
  id: 'notes',
  types: { note: { verbKey: 'obj.note.verb', interact: (w, o) => say(w, o.def.type === 'note' ? o.def.textKey ?? '' : '') } }
};
