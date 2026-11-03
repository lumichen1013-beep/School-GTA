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
  }
}

/**
 * 拉一條繩：是下一條 → 停住 (全部拉對 → 抽屜打開並給 reward)；不是 → 這把鎖的繩子全部彈回 (無懲罰，規格 4 N27)。
 * 已拉著的繩子不再是互動目標 (used)，所以「已拉的」恆為 order 的前綴
 */
export function pullCord(w: World, cord: ObjState): void {
  if (cord.def.type !== 'cord') return;
  const lock = w.byId.get(cord.def.lock);
  if (!lock || lock.def.type !== 'drawer' || lock.used) return;
  const cords = lock.def.order.map(id => w.byId.get(id)).filter((o): o is ObjState => o !== undefined);
  const next = lock.def.order[cords.filter(c => c.used).length];
  if (cord.def.id !== next) {
    for (const c of cords) c.used = false;
    say(w, 'msg.cord.reset');
    return;
  }
  cord.used = true;
  if (cords.every(c => c.used)) {
    lock.used = true;
    addItem(w, lock.def.reward, 1);
    say(w, lock.def.openText);
  } else say(w, 'msg.cord.pulled');
}

/** N27 順序鎖：畫像 (只呈現)、拉繩 (3D 拉)、抽屜 (鎖本身，不可互動) */
export const sequence: Mechanic = {
  id: 'sequence',
  types: {
    portrait: {},
    cord: { verbKey: 'obj.cord.verb', interact: pullCord },
    drawer: {}
  }
};
