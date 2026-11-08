// N29 天平 (P17；規格 6「第三章共用規則」天平、「3-1 苗圃（細化）」3-1a；architecture 4.19、7.4.7)
// - balance：pans = 兩個秤盤上的固定物件 id (W / E)；重量 = 盤上物件重量的和 (mechanics/scale weightOf：尺度卡決定)；玩家不算重量
// - 秤桿傾向 = 兩盤比較 (W 重 / 平 / E 重)；want 成立的那一刻 → used (閂住：之後取下尺度卡，打開的東西不再關上)、opens 指向的物件 used、
//   solvedText、doneFlag → done；傾向變成「不是 want 的那一邊」時說 wrongText (每次變過去說一次)
// - pot：秤盤上的陶盆 (固定，不能推)：3D 按 E = fixedText
// - 跨房半座天平 (3-3a；規格「3-3 夜溫室（細化）」)：balanceHalf = 帶 door 的半座 (pans = 本盤的物件、pair = 另一半的 id)；
//   章節層 (ChapterSpec.derive → mechanics/cross) 依拱門連接寫 World.ext.balance[id] = { other?, done? }：other = 接上時對面那盤的重量、
//   done = 另一半已閂住。接上：傾向 = 本盤 − other；want 成立的那一刻閂住；done → 安靜地閂住；沒接上 = 秤桿垂著 (3D 按 E = unjoinedText)
// - v0.4 第五章 吊秤 (5-4；規格「5-4 北窗（細化）」)：hangScale = 秤繩從本地 hook 那一側穿出去 (北窗 = 地板)，另一盤 = 那格稜另一頭的面心房
//   (core/cube acrossEdge)，秤的是那一整間房裡的重物 (ObjBase.ballast)。章節層寫 ext.balance[id] = { other, room, titleKey, at }；
//   傾向 = 本盤 − other (同半座天平)；那一頭換了房 / 兩盤差變了 → 說此刻的狀態句 (mine / other / near，{room} = 那間房的名字)；
//   本房的格變了而那一頭沒換 (轉了帶著你的那一片) → sameText；want 成立的那一刻閂住。3D 按 E = 狀態句 (閂住後 doneText)
// - backpack：吊秤盤上的背包 (釘在盤上；3D 按 E = fixedText)；ballastBox：秤繩那一頭計重的箱子 (實體、推不動；3D 按 E = fixedText)
import type { Mechanic } from '../core/registry';
import type { ObjId, ObjState, TextKey, World } from '../core/types';
import type { Side } from '../core/cube';
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
    /** 秤盤上的陶盆 (固定)：fixedText = 3D 按 E 的說明；shape = 外觀 (can 澆水壺、trough 長陶槽；預設陶盆) */
    pot: { fixedText: TextKey; shape?: 'can' | 'trough' };
    /**
     * v0.4 半座天平 (3-3a)：door = 秤桿穿出去的那扇拱門、pans = 本盤上的物件、pair = 另一半 (別的房)；want = 'level' (要平)；
     * unjoinedText = 沒接上時 3D 對盤上的東西按 E；wrongText = 接上後倒向一邊；solvedText = 平的那一刻
     */
    balanceHalf: { door: ObjId; pans: readonly ObjId[]; pair: ObjId; want: Tilt; unjoinedText: TextKey; wrongText: TextKey; solvedText: TextKey };
    /**
     * v0.4 吊秤 (5-4)：hook = 秤繩穿出去的本地方位、pans = 本盤上的物件、want = 'level'；mineText / otherText / nearText = 本盤重 /
     * 那一頭重 / 那一頭只重 1 ({room})；sameText = 本房被搬走、那一頭沒換 ({room})；solvedText = 平的那一刻；doneText = 閂住後按 E
     */
    hangScale: {
      hook: Side; pans: readonly ObjId[]; want: Tilt;
      mineText: TextKey; otherText: TextKey; nearText: TextKey; sameText: TextKey; solvedText: TextKey; doneText: TextKey;
    };
    /** v0.4 吊秤盤上的背包 (5-4；釘在盤上)：fixedText = 3D 按 E 的說明 */
    backpack: { fixedText: TextKey };
    /** v0.4 秤繩那一頭計重的箱子 (5-4；ballast)：look = 外觀 (皮箱 / 書箱)、fixedText = 3D 按 E 的說明 */
    ballastBox: { look: 'trunk' | 'books'; fixedText: TextKey };
  }
  interface WorldExt {
    /**
     * v0.4 跨房天平 (3-3a；章節層寫入)：半座天平 id → other = 此刻接上時對面那盤的重量 (沒接上 = 沒有)、done = 另一半已閂住；
     * 吊秤 (5-4) 另有 room = 秤繩那一頭的房、titleKey = 那間房的名字、at = 本房此刻的格 (以 '1,0,1' 記)
     */
    balance?: Readonly<Record<ObjId, { other?: number; done?: boolean; room?: string; titleKey?: TextKey; at?: string }>>;
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

/** 半座天平 / 吊秤本盤的重量 */
export const halfWeight = (w: World, o: ObjState): number =>
  o.def.type !== 'balanceHalf' && o.def.type !== 'hangScale' ? 0 : o.def.pans.reduce((n, id) => { const p = w.byId.get(id); return p && !p.gone ? n + weightOf(w, p) : n; }, 0);

/** 半座天平此刻的傾向：沒接上 = null (秤桿垂著)；接上 = 本盤 (mine) / 對面 (other) / 平 */
export function halfTilt(w: World, o: ObjState): 'mine' | 'other' | 'level' | null {
  const other = w.ext.balance?.[o.def.id]?.other;
  if ((o.def.type !== 'balanceHalf' && o.def.type !== 'hangScale') || other === undefined) return null;
  const d = halfWeight(w, o) - other;
  return d > 0 ? 'mine' : d < 0 ? 'other' : 'level';
}
/** 上一步的兩盤差 (沒接上 = 'none')：差變了 (接上、改了尺度卡) 而結果不平 → 說 wrongText */
const lastHalf = new WeakMap<ObjState, string>();

function updateHalves(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'balanceHalf' || o.gone) continue;
    const t = halfTilt(w, o);
    const other = w.ext.balance?.[o.def.id]?.other;
    const key = other === undefined ? 'none' : String(halfWeight(w, o) - other);
    const prev = lastHalf.get(o);
    lastHalf.set(o, key);
    if (o.used) continue;
    if (w.ext.balance?.[o.def.id]?.done) { o.used = true; const target = o.def.opens ? w.byId.get(o.def.opens) : undefined; if (target) target.used = true; continue; }
    if (t === o.def.want) {
      o.used = true;
      const target = o.def.opens ? w.byId.get(o.def.opens) : undefined;
      if (target) target.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    } else if (prev !== undefined && prev !== key && (t === 'mine' || t === 'other')) say(w, o.def.wrongText);
  }
}

/** 吊秤此刻的狀態句 (閂住 = doneText；那一頭只重 1 = nearText)；room = 那間房的名字 */
export function hangText(w: World, o: ObjState): { key: TextKey; room: string } | null {
  if (o.def.type !== 'hangScale') return null;
  const e = w.ext.balance?.[o.def.id];
  const room = e?.titleKey ? w.rt.text(e.titleKey) : '';
  if (o.used) return { key: o.def.doneText, room };
  const t = halfTilt(w, o);
  if (t === null || t === 'level') return null;
  const d = halfWeight(w, o) - (e?.other ?? 0);
  return { key: t === 'mine' ? o.def.mineText : d === -1 ? o.def.nearText : o.def.otherText, room };
}

/** 上一步的 (那一頭的房, 本房的格, 兩盤差)：換了房 / 差變了 → 狀態句；只換了格 → sameText */
const lastHang = new WeakMap<ObjState, { room?: string; at?: string; diff?: number }>();

function updateHangs(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'hangScale' || o.gone) continue;
    const e = w.ext.balance?.[o.def.id];
    const diff = e?.other === undefined ? undefined : halfWeight(w, o) - e.other;
    const prev = lastHang.get(o);
    lastHang.set(o, { room: e?.room, at: e?.at, diff });
    if (o.used || diff === undefined) continue;
    if (diff === 0 && o.def.want === 'level') {
      o.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      continue;
    }
    if (!prev) continue;
    const room = e?.titleKey ? w.rt.text(e.titleKey) : '';
    if (prev.room !== e?.room || prev.diff !== diff) { const h = hangText(w, o); if (h) say(w, h.key, { room: h.room }); }
    else if (prev.at !== e?.at) say(w, o.def.sameText, { room });
  }
}

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
    // 陶盆 / 澆水壺：釘在盤上；在半座天平上而且此刻沒接上 = 說秤桿斷在牆裡 (半座天平本身不是互動目標：盤上的東西才是)
    pot: {
      verbKey: 'obj.pot.verb', usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'pot') return;
        const half = w.objs.find(h => h.def.type === 'balanceHalf' && h.def.pans.includes(o.def.id));
        say(w, half && half.def.type === 'balanceHalf' && !half.used && halfTilt(w, half) === null ? half.def.unjoinedText : o.def.fixedText);
      }
    },
    balanceHalf: {},
    // 吊秤 (5-4)：3D 按 E = 此刻的狀態句
    hangScale: {
      verbKey: 'obj.hangScale.verb', usableWhenUsed: true,
      interact: (w, o) => { const h = hangText(w, o); if (h) say(w, h.key, { room: h.room }); }
    },
    backpack: {
      verbKey: 'obj.backpack.verb', usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'backpack') say(w, o.def.fixedText); }
    },
    ballastBox: {
      verbKey: 'obj.ballastBox.verb', usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'ballastBox') say(w, o.def.fixedText); }
    }
  },
  afterPhysics: w => { update(w); updateHalves(w); updateHangs(w); }
};
