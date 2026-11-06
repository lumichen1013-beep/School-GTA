// 第四章 墨流的機關 (P15；規格 6「第四章共用規則」墨流、「4-2 墨爐間（細化）」)：墨的路線由章節層算 (core/chapter inkPaths → World.ext.ink)，這裡只讀
// - 墨爐閥 (inkValve)：3D 按 E 轉開 = used + done (doneFlag = 源頭的 valve 旗標；章節層隨即重算墨)
// - 墨線鎖 (inkLock)：side (本地) 收到墨 → 閂住 (used) + done + solvedText；3D 按 E 說此刻的樣子 (乾的 / 化開了)
// - 墨痕 (inkMark)：墨流過這間房 → used (閂住；殘片 3 以 revealedBy 指向它)
// - 爐邊小櫃 (markCase)：veil (淡墨) 已塗開、room 此刻在 at 那一格 (ext.cube.layout) → 閂住 + done + solvedText；在 wrongAt → 說 wrongText 一次
// - 根管線 (inkPipe)：外觀 (when = 'through' 墨流過這間房 / 匯點的本地門位) ；沒有互動
import type { Mechanic } from '../core/registry';
import type { ObjId, TextKey, World } from '../core/types';
import type { Side } from '../core/cube';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 墨爐閥：useText = 轉開時、usedText = 已經開著時 */
    inkValve: { usedText: TextKey };
    /** 墨線鎖：side = 收墨的匯點 (本地門位)；dryText = 還沒收到墨時按 E 的說明；after = 這個物件 used 之後才收得到墨 (4-4b 墨閘：梯子斷過一次、根繩鬆了) */
    inkLock: { side: Side | 'through'; solvedText: TextKey; dryText: TextKey; openText: TextKey; after?: ObjId };
    /** 墨痕：墨流過這間房就顯出 (used) */
    inkMark: {};
    /** 爐邊小櫃：veil = 要先塗開的淡墨；room 在 at [行, 列] → 彈開；wrongAt = 錯的那一格 (說 wrongText) */
    markCase: { veil: ObjId; room: string; at: readonly [number, number]; wrongAt?: readonly [number, number]; solvedText: TextKey; wrongText: TextKey; closedText: TextKey; openText: TextKey };
    /** 根管線 (外觀)：path = 折線 (x,y,z 以空白分隔)；when = 'through' (墨流過這間房就亮) 或匯點的本地門位 (那個匯點收到墨才亮) */
    inkPipe: { path: string; when: 'through' | Side };
  }
}

/** 根管線此刻有沒有墨 (外觀與測試共用) */
export function pipeLit(w: World, when: 'through' | Side): boolean {
  const ink = w.ext.ink;
  if (!ink) return false;
  return when === 'through' ? ink.through : ink.sinks.includes(when);
}

/** 爐邊小櫃的格位此刻 (ext.cube.layout)：在 at = 'ok'、在 wrongAt = 'wrong'、其他 = null */
function caseAt(w: World, room: string, at: readonly [number, number], wrongAt?: readonly [number, number]): 'ok' | 'wrong' | null {
  const c = w.ext.cube?.layout?.[room];
  if (!c) return null;
  if (c[0] === at[0] && c[1] === at[1]) return 'ok';
  if (wrongAt && c[0] === wrongAt[0] && c[1] === wrongAt[1]) return 'wrong';
  return null;
}

/** 墨流過這間房 (side 'through' 的墨線鎖 = 4-4b 抽屜的墨閘) */
const inkPassed = (w: World): boolean => !!w.ext.ink?.through;

/** 每間房的「錯格」已說過 (同一個世界、同一次停在錯格只說一次) */
const wrongSaid = new WeakMap<World, Set<ObjId>>();

function update(w: World): void {
  for (const o of w.objs) {
    if (o.gone) continue;
    if (o.def.type === 'inkLock' && !o.used && (!o.def.after || !!w.byId.get(o.def.after)?.used) && (o.def.side === 'through' ? inkPassed(w) : (w.ext.ink?.sinks ?? []).includes(o.def.side))) {
      o.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    } else if (o.def.type === 'inkMark' && !o.used && w.ext.ink?.through) {
      o.used = true;
    } else if (o.def.type === 'markCase' && !o.used) {
      const veil = w.byId.get(o.def.veil);
      const st = veil?.used ? caseAt(w, o.def.room, o.def.at, o.def.wrongAt) : null;
      const said = wrongSaid.get(w) ?? new Set<ObjId>();
      if (st === 'ok') {
        o.used = true;
        say(w, o.def.solvedText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      } else if (st === 'wrong' && !said.has(o.def.id)) {
        said.add(o.def.id);
        say(w, o.def.wrongText);
      } else if (st !== 'wrong') said.delete(o.def.id);
      wrongSaid.set(w, said);
    }
  }
}

export const ink: Mechanic = {
  id: 'ink',
  types: {
    inkValve: {
      verbKey: 'obj.inkValve.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'inkValve') return;
        if (o.used) { say(w, o.def.usedText); return; }
        o.used = true;
        say(w, o.def.useText ?? o.def.usedText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    },
    inkLock: { verbKey: 'obj.inkLock.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'inkLock') say(w, o.used ? o.def.openText : o.def.dryText); } },
    inkMark: {},
    markCase: { verbKey: 'obj.markCase.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'markCase') say(w, o.used ? o.def.openText : o.def.closedText); } },
    inkPipe: {}
  },
  afterPhysics: update
};
