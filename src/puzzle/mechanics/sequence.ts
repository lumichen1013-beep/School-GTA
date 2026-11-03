import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { addItem, say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /**
     * 畫像 (1-2d；N27 的資訊來源)：年份分在兩個視角 — carved = 實景畫框上的刻字 (只在 3D 看得到)、
     * ink = 藏寶圖上的墨字 (只在 2D 看得到；`~~ ~~` = 爸爸劃掉的字)；variant = 畫的樣子 (純呈現)
     */
    portrait: { carved?: TextKey; ink?: TextKey; variant: number };
    /** 拉繩 (N27)：屬於順序鎖 lock；3D 拉下後停住 (used = 拉著)，拉錯就全部彈回 */
    cord: { lock: ObjId };
    /** 順序鎖 (N27；1-2d 畫像下的小抽屜)：order = 正確的拉繩順序；全部拉對 → 打開 (used)、取得 reward、說 openText */
    drawer: { order: ObjId[]; reward: ItemId; openText: TextKey };
    /** 燈書 (N27；2-1c)：屬於燈座 lock；3D 點亮後停住 (used = 亮著)，點錯就全部暗下；title = 只畫在藏寶圖上的書名 */
    lampBook: { lock: ObjId; title: TextKey };
    /**
     * 燈座 (N27；2-1c 的順序鎖，不可互動)：order = 正確的點亮順序；全亮 → used、openText (reward 可省略)；
     * stepText / resetText = 點對一本 / 點錯 (全部暗下) 的訊息
     */
    lampLock: { order: ObjId[]; openText: TextKey; reward?: ItemId; stepText: TextKey; resetText: TextKey };
  }
}

const isStep = (o: ObjState): boolean => o.def.type === 'cord' || o.def.type === 'lampBook';
const lockOf = (w: World, o: ObjState): ObjState | undefined => (o.def.type === 'cord' || o.def.type === 'lampBook' ? w.byId.get(o.def.lock) : undefined);

/**
 * 拉一條繩 / 點亮一本燈書：是下一條 → 停住 (全部對了 → 鎖打開並給 reward)；不是 → 這把鎖的繩子全部彈回 (無懲罰，規格 4 N27)。
 * 已拉著的不再是互動目標 (used)，所以「已拉的」恆為 order 的前綴。物件有 doneFlag → 成立時發 done 事件 (清空回退堆疊；v0.4)
 */
export function pullCord(w: World, cord: ObjState): void {
  if (!isStep(cord)) return;
  const lock = lockOf(w, cord);
  if (!lock || (lock.def.type !== 'drawer' && lock.def.type !== 'lampLock') || lock.used) return;
  const def = lock.def;
  const cords = def.order.map(id => w.byId.get(id)).filter((o): o is ObjState => o !== undefined);
  const next = def.order[cords.filter(c => c.used).length];
  if (cord.def.id !== next) {
    for (const c of cords) c.used = false;
    say(w, def.type === 'lampLock' ? def.resetText : 'msg.cord.reset');
    return;
  }
  cord.used = true;
  if (cord.def.doneFlag) w.events.push({ t: 'done', flag: cord.def.doneFlag });
  if (cords.every(c => c.used)) {
    lock.used = true;
    if (def.reward !== undefined) addItem(w, def.reward, 1);
    say(w, def.openText);
    if (def.doneFlag) w.events.push({ t: 'done', flag: def.doneFlag });
  } else say(w, def.type === 'lampLock' ? def.stepText : 'msg.cord.pulled');
}

/** N27 順序鎖：畫像 (只呈現)、拉繩 (3D 拉)、抽屜 (鎖本身，不可互動)；燈書 (3D 點亮)、燈座 (鎖本身) */
export const sequence: Mechanic = {
  id: 'sequence',
  types: {
    portrait: {},
    cord: { verbKey: 'obj.cord.verb', interact: pullCord },
    drawer: {},
    lampBook: { verbKey: 'obj.lampBook.verb', interact: pullCord },
    lampLock: {}
  }
};
