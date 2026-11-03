import type { Mechanic } from '../core/registry';
import type { ObjState, TextKey, World } from '../core/types';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /**
     * 紙條：讀出 textKey。revealAfter = L2 / L3 提示字條 (規格 7.1)：一開始是空白的，進房 revealAfter 秒後才浮現字跡
     * (計時以房間為單位：World.time，換房 / R 重新計)
     */
    note: { textKey?: TextKey; revealAfter?: number };
  }
}

/** 字跡是否已浮現 (一般字條恆為 true) */
export const noteRevealed = (w: World, o: ObjState): boolean => o.def.type !== 'note' || o.def.revealAfter === undefined || w.time >= o.def.revealAfter;

/** C14：紙條 (空白的提示字條：還沒浮現時讀到「紙上還是空白的。」) */
export const notes: Mechanic = {
  id: 'notes',
  types: {
    note: {
      verbKey: 'obj.note.verb',
      interact: (w, o) => say(w, o.def.type !== 'note' ? '' : noteRevealed(w, o) ? o.def.textKey ?? '' : 'msg.note.blank')
    }
  }
};
