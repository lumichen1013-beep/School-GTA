// 3-1 苗圃 (規格 6「3-1 苗圃（細化）」)：建築比例尺、花架門、只在實景的高育苗架、樹根 (卡榫；3-1b)、花窗玻璃片
// - ruler：3D 拿 (grants = 道具 / 能力 scale) → 一併取得 also (尺度卡「大」「小」)
// - trellis：花架門 (天平的 opens 指向它)；used = 拉起來 (不擋路、不可互動)；關著時 3D 按 E = lockedRead
// - pottingShelf：實體的高育苗架 (只在實景；純擋路)
// - root：樹根 (jam、名詞標籤 + 方槽；縮放在 mechanics/scale)。玩家在這間房裡、此刻房間不在 home 格 (World.ext.cube.at) 的那一刻 → used、
//   freedText、doneFlag → done (3-1b「苗圃第一次滑出原格」)；3D 按 E = 此刻的樣子 (伸出牆外 / 縮在牆內 / 已縮回土裡)
// - pane：花窗玻璃片 (grants 指定 pane.<n>)；under 指向的物件 used 之後才在場 (3-1b：根底下壓著)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { addItem, say } from '../core/world';
import { worldJammed } from './scale';

declare module '../core/types' {
  interface ObjKinds {
    /** 建築比例尺 (掛在牆上)：also = 一併取得的道具 (尺度卡) */
    ruler: { also: readonly ItemId[] };
    /** 花架門 (木格柵)：lockedRead = 還關著時 3D 按 E 的說明 */
    trellis: { lockedRead: TextKey };
    /** 高育苗架 (實體；只在實景) */
    pottingShelf: {};
    /** 樹根：home = 房間的原格 [行, 列]；jamText / freeText / doneText = 3D 按 E (伸出牆外 / 縮在牆內 / 已完成)；freedText = 房間第一次滑出原格時 */
    root: { home: readonly [number, number]; jamText: TextKey; freeText: TextKey; doneText: TextKey; freedText: TextKey };
    /** 花窗玻璃片 (拾取物；grants 指定)：under = 這個物件 used 之後才在場 */
    pane: { under: ObjId };
  }
}

/** 房間此刻不在 home 格 (沒有魔方資訊 = 在原格) */
const awayFromHome = (w: World, o: ObjState): boolean => {
  if (o.def.type !== 'root') return false;
  const at = w.ext.cube?.at;
  return !!at && (at[0] !== o.def.home[0] || at[1] !== o.def.home[1]);
};

/** 花窗玻璃片此刻不在場 (壓著它的東西還沒完成) */
export const paneHidden = (w: World, o: ObjState): boolean => o.def.type === 'pane' && !w.byId.get(o.def.under)?.used;

export const nursery: Mechanic = {
  id: 'nursery',
  types: {
    ruler: { verbKey: 'obj.ruler.verb', interact: (w, o) => { if (o.def.type === 'ruler') for (const i of o.def.also) addItem(w, i, 1); } },
    trellis: { verbKey: 'obj.trellis.verb', interact: (w, o) => { if (o.def.type === 'trellis') say(w, o.def.lockedRead); } },
    pottingShelf: {},
    root: {
      verbKey: 'obj.root.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'root') say(w, o.used ? o.def.doneText : worldJammed(w) ? o.def.jamText : o.def.freeText); }
    },
    pane: { verbKey: 'obj.pane.verb' }
  },
  /** 花架門拉起來了 = 不擋路 */
  passable: (_w, o) => o.def.type === 'trellis' && o.used,
  hidden: paneHidden,
  afterPhysics: w => {
    for (const o of w.objs) {
      if (o.def.type !== 'root' || o.used || !awayFromHome(w, o)) continue;
      o.used = true;
      say(w, o.def.freedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    }
  }
};
