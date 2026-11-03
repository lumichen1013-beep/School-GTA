// N29 天平 (P17；規格 6「第三章共用規則」天平、「3-1 苗圃（細化）」3-1a；architecture 4.19、7.4.7)
// - balance：pans = 兩個秤盤上的固定物件 id (W / E)；重量 = 盤上物件重量的和 (mechanics/scale weightOf：尺度卡決定)；玩家不算重量
// - 秤桿傾向 = 兩盤比較 (W 重 / 平 / E 重)；want 成立的那一刻 → used (閂住：之後取下尺度卡，打開的東西不再關上)、opens 指向的物件 used、
//   solvedText、doneFlag → done；傾向變成「不是 want 的那一邊」時說 wrongText (每次變過去說一次)
// - pot：秤盤上的陶盆 (固定，不能推)：3D 按 E = fixedText
// - 跨房半座天平 (3-3a) 的介面 (本步不實作)：balanceHalf = 帶 door 的半座；章節層依拱門連接合成兩半、寫入 World.ext.balance，
//   balance 的傾向改讀 ext (規格「第三章共用規則」天平)
import type { Mechanic } from '../core/registry';
import type { ObjId, ObjState, TextKey, World } from '../core/types';
import { say } from '../core/world';
import { weightOf } from './scale';

export type BalanceSide = 'W' | 'E';
/** 秤桿傾向：W = 西盤較重 (往西倒)、E = 東盤較重、level = 平 */
export type Tilt = BalanceSide | 'level';

declare module '../core/types' {
  interface ObjKinds {
    /**
     * 天平 (花秤)：pans = 兩個秤盤上的物件；want = 要往哪邊倒；opens (ObjBase) = 成立時打開的物件；
     * solvedText = 成立時的訊息；wrongText = 倒向另一邊時的訊息
     */
    balance: { pans: Readonly<Record<BalanceSide, readonly ObjId[]>>; want: Tilt; solvedText: TextKey; wrongText?: TextKey };
    /** 秤盤上的陶盆 (固定)：fixedText = 3D 按 E 的說明 */
    pot: { fixedText: TextKey };
  }
  interface WorldExt {
    /** v0.4 跨房天平 (3-3a；章節層寫入，本步不用)：天平 id → 對面那一半此刻接上時的重量 (沒接上 = 不列出) */
    balance?: Readonly<Record<ObjId, { other: number }>>;
  }
}

/** 一個秤盤此刻的重量 (盤上不在場的物件不算) */
export function panWeight(w: World, o: ObjState, side: BalanceSide): number {
  if (o.def.type !== 'balance') return 0;
  return o.def.pans[side].reduce((n, id) => { const p = w.byId.get(id); return p && !p.gone ? n + weightOf(w, p) : n; }, 0);
}

/** 秤桿此刻的傾向 */
export function tiltOf(w: World, o: ObjState): Tilt {
  const d = panWeight(w, o, 'W') - panWeight(w, o, 'E');
  return d > 0 ? 'W' : d < 0 ? 'E' : 'level';
}

/** 上一步的傾向 (只用來決定要不要說話；換房 / R = 新的 World、重新記) */
const last = new WeakMap<ObjState, Tilt>();

function update(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'balance' || o.gone) continue;
    const t = tiltOf(w, o);
    const prev = last.get(o);
    last.set(o, t);
    if (t === o.def.want) {
      if (o.used) continue;
      o.used = true;
      const target = o.def.opens ? w.byId.get(o.def.opens) : undefined;
      if (target) target.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    } else if (!o.used && prev !== undefined && t !== prev && t !== 'level' && o.def.wrongText) say(w, o.def.wrongText);
  }
}

export const balance: Mechanic = {
  id: 'balance',
  types: {
    balance: {},
    pot: { verbKey: 'obj.pot.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'pot') say(w, o.def.fixedText); } }
  },
  afterPhysics: update
};
