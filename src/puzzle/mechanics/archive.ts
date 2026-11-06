// 4-3 封存書庫的機關 (規格 6「4-3 封存書庫（細化）」)：
// - 符號鍵 (symbolKey) / 符號櫃 (symbolLock)：3D 按四塊鍵 (書 / 屜 / 封 / 空)；按滿四下 → 和「此刻的讀法」比 (從走廊正下方那一格開始、順時針讀下層四個邊格)；
//   對 = 櫃開 (used + done + grants 道具)、錯 = 說一句、重來。按過的順序只在本次 World (R / 換房重來)
// - 爸爸畫到一半的展開圖 (chartBoard)：資訊物件 (readText)
// - 封存櫃 (sealCabinet)：needs 的旗標此刻都成立 (World.ext.done，章節層寫入) → 閂住 + done + solvedText
// - 驚嚇 (archiveScare)：after 物件 used 之後、人在房間相對安靜 SCARE_DELAY 秒 → used + 章節旗標 scare:<id> (R 不重演) + scareText；只影響呈現
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, TextKey, World } from '../core/types';
import { addItem, say } from '../core/world';
import { SCARE_DELAY, scareFlag } from './coats';

/** 下層邊格上的字 (書庫 = 書、抽屜 = 屜、封存室 = 封、空格 = 空) */
export type ArchiveSym = 'book' | 'drawer' | 'seal' | 'empty';
const ROOM_SYM: Readonly<Record<string, ArchiveSym>> = { archive: 'book', drawer: 'drawer', sealed: 'seal' };

declare module '../core/types' {
  interface ObjKinds {
    /** 符號鍵：sym = 這塊鍵的字；lock = 它屬於哪個符號櫃 */
    symbolKey: { sym: ArchiveSym; lock: ObjId };
    /** 符號櫃：hall = 決定起點的上層房 (走廊)；grants (ObjBase) = 打開時給的道具；solvedText / wrongText / closedText / openText */
    symbolLock: { hall: string; solvedText: TextKey; wrongText: TextKey; closedText: TextKey; openText: TextKey };
    /** 爸爸畫到一半的展開圖 (資訊物件) */
    chartBoard: { readText: TextKey };
    /** 封存櫃：needs = 要成立的旗標 (都成立才開)；halfText = 只成立一部分時按 E */
    sealCabinet: { needs: readonly string[]; solvedText: TextKey; closedText: TextKey; halfText: TextKey; openText: TextKey };
    /** 驚嚇：after = 這個物件 used 之後；scare = 驚嚇 id；scareText = 演出時的話 */
    archiveScare: { after: ObjId; scare: string; scareText: TextKey };
  }
}

/** 下層 (z = 0) 四個邊格的順時針順序：北 → 東 → 南 → 西 */
const RING: ReadonlyArray<readonly [number, number]> = [[1, 0], [2, 1], [1, 2], [0, 1]];

/**
 * 此刻的讀法 (純函式；機制、測試共用)：layout = 各房格位 (ext.cube.layout)；從 hall 的格位 (上層) 正下方那一格開始，順時針讀下層四個邊格的字。
 * hall 不在邊格 (不會發生) = null
 */
export function archiveReading(layout: Readonly<Record<string, readonly [number, number, number]>>, hall: string): ArchiveSym[] | null {
  const h = layout[hall];
  if (!h) return null;
  const start = RING.findIndex(([x, y]) => x === h[0] && y === h[1]);
  if (start < 0) return null;
  const at = (x: number, y: number): ArchiveSym => {
    const r = Object.entries(layout).find(([, c]) => c[0] === x && c[1] === y && c[2] === 0);
    return (r && ROOM_SYM[r[0]]) || 'empty';
  };
  return [0, 1, 2, 3].map(k => { const [x, y] = RING[(start + k) % 4]; return at(x, y); });
}

/** 每個符號櫃本次按過的字 */
const pressed = new WeakMap<World, Map<ObjId, ArchiveSym[]>>();
/** 驚嚇的計時：after 物件變成 used 的那一刻 (本次 World 的時間；進房時已 used = 0) */
const since = new WeakMap<World, Map<ObjId, number>>();

function pressKey(w: World, key: { sym: ArchiveSym; lock: ObjId }): void {
  const lock = w.byId.get(key.lock);
  if (!lock || lock.def.type !== 'symbolLock') return;
  if (lock.used) { say(w, lock.def.openText); return; }
  const m = pressed.get(w) ?? new Map<ObjId, ArchiveSym[]>();
  pressed.set(w, m);
  const seq = [...(m.get(lock.def.id) ?? []), key.sym];
  if (seq.length < 4) { m.set(lock.def.id, seq); say(w, 'lvl.4-3.key.pressed', { n: String(seq.length) }); return; }
  m.set(lock.def.id, []);
  const want = archiveReading(w.ext.cube?.layout ?? {}, lock.def.hall);
  if (!want || want.some((s, i) => s !== seq[i])) { say(w, lock.def.wrongText); return; }
  lock.used = true;
  if (lock.def.grants) addItem(w, lock.def.grants as ItemId, 1);
  say(w, lock.def.solvedText);
  if (lock.def.doneFlag) w.events.push({ t: 'done', flag: lock.def.doneFlag });
}

function update(w: World): void {
  for (const o of w.objs) {
    if (o.gone) continue;
    if (o.def.type === 'sealCabinet' && !o.used && o.def.needs.every(f => (w.ext.done ?? []).includes(f))) {
      o.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    } else if (o.def.type === 'archiveScare' && !o.used) {
      const flag = scareFlag(o.def.scare);
      if (w.ext.flags?.includes(flag)) { o.used = true; continue; }
      const after = w.byId.get(o.def.after);
      if (!after?.used) continue;
      const m = since.get(w) ?? new Map<ObjId, number>();
      since.set(w, m);
      if (!m.has(o.def.id)) m.set(o.def.id, w.time);
      if (w.time - m.get(o.def.id)! < SCARE_DELAY) continue;
      o.used = true;
      w.events.push({ t: 'flag', flag });
      say(w, o.def.scareText);
    }
  }
}

export const archive: Mechanic = {
  id: 'archive',
  types: {
    symbolKey: { verbKey: 'obj.symbolKey.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'symbolKey') pressKey(w, o.def); } },
    symbolLock: { verbKey: 'obj.inkLock.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'symbolLock') say(w, o.used ? o.def.openText : o.def.closedText); } },
    chartBoard: { verbKey: 'obj.remark.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'chartBoard') say(w, o.def.readText); } },
    sealCabinet: {
      verbKey: 'obj.inkLock.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'sealCabinet') return;
        const n = o.def.needs.filter(f => (w.ext.done ?? []).includes(f)).length;
        say(w, o.used ? o.def.openText : n > 0 ? o.def.halfText : o.def.closedText);
      }
    },
    archiveScare: {}
  },
  afterPhysics: update
};
