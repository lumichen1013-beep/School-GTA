// 2-4 手稿庫 (規格 6「2-4 手稿庫（細化）」)：手稿櫃 (P5：此刻的排列 = 櫃門上那張圖的排列才打開；讀章節層寫入的 ext.cube.layout)、
// 閉櫃 (2-4c：櫃身；門牌是 labels 的 kind 'strip'，拆掉「才」→ opens 打開)、手稿捆 (2-4b：同 2-1b 的書 / 暗格流程，mechanics/shelf pullSpine)、手稿架 (呈現)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { addItem, say } from '../core/world';
import { pullSpine } from './shelf';

declare module '../core/types' {
  interface ObjKinds {
    /**
     * 手稿櫃：target = 房間 → 該在的格 [行, 列]；drawing = 櫃門上那張圖 (折線，外觀)；此刻排列對了 → used、reward、okText、done；
     * 不對 = notText；打開之後 = readText
     */
    patternCabinet: { target: Readonly<Record<string, readonly [number, number]>>; drawing: string; reward?: ItemId; okText: TextKey; notText: TextKey; readText: TextKey };
    /** 閉櫃的櫃身：還關著 = lockedRead；打開了 (門牌拆成「門」，labels opens) = openRead */
    smallCabinet: { lockedRead: TextKey; openRead: TextKey };
    /** 手稿捆 (2-4b)：lock = 鎖 (bookLock)；tie = 紅繩 / 封蠟 / 素面 (外觀；厚薄 = d) */
    bundle: { lock: ObjId; tie?: 'red' | 'wax' };
    /** 手稿架 (呈現，不擋路) */
    bundleRack: {};
  }
}

/** 此刻的排列是否就是 target (讀 ext.cube.layout；沒有魔方資訊 = 不成立) */
export function patternMatches(w: World, o: ObjState): boolean {
  if (o.def.type !== 'patternCabinet') return false;
  const layout = w.ext.cube?.layout;
  if (!layout) return false;
  return Object.entries(o.def.target).every(([room, at]) => { const c = layout[room]; return !!c && c[0] === at[0] && c[1] === at[1]; });
}

export const manuscripts: Mechanic = {
  id: 'manuscripts',
  types: {
    patternCabinet: {
      verbKey: 'obj.patternCabinet.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'patternCabinet') return;
        if (o.used) { say(w, o.def.readText); return; }
        if (!patternMatches(w, o)) { say(w, o.def.notText); return; }
        o.used = true;
        if (o.def.reward) addItem(w, o.def.reward, 1);
        say(w, o.def.okText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    },
    smallCabinet: {
      verbKey: 'obj.smallCabinet.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'smallCabinet') say(w, o.used ? o.def.openRead : o.def.lockedRead); }
    },
    bundle: { verbKey: 'obj.bundle.verb', usableWhenUsed: true, interact: pullSpine },
    bundleRack: {}
  }
};
