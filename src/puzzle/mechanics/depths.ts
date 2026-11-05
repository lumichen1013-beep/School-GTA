// 3-4 溫室深處 (規格 6「3-4 溫室深處（細化）」；architecture 7.4.7)：花窗架、九格花窗、花窗架的抽屜、巨根、長廊柵門、舊羅盤架
// - paneFrame：花窗架 (固定動作，不計題；同 2-5 鑰匙台)。parts 全部持有 → 各減一、used、okText；缺 → missingText ({n} = 缺幾片：term.num.<n>)；
//   裝好之後 3D 按 E = 花窗此刻的樣子 (lattice 的 readText / patternText / lightText / doneText)
// - lattice：九格花窗 (不可互動)。cells (列優先 x + 3y：'empty' | 'solid' | 'any' | 房間 id) 比對 World.ext.cube.layout，
//   light = 這間房要有從 from 進來、穿過至少 via 間房的光 (core/chapter lightState)。frame (花窗架) used 之後兩者都成立的那一刻 → used (閂住)、
//   solvedText、doneFlag → done；只有圖對 / 只有光到時說一次 patternText / lightText (進房的第一步只記不說；同 mechanics/light 的寫法)
// - latticeBox：花窗架彈出的抽屜 (拾取物：grants + also；revealedBy 'lattice' = 字亮了才在場，mechanics/light hidden)
// - giantRoot：巨根 (卡榫物件：jam、名詞標籤 + 方槽 (label.after 'lattice')、stayShrunk、covers = 蓋住的那扇玻璃；縮放與卡榫在 mechanics/scale)；
//   usedWhen 指向的物件 (苔窗) used 的那一刻 → used (= 縮回土裡：之後一直以「小」計)
// - chaseGate：長廊的鐵柵門 (實體)；opensWhen 指向的物件 (花窗) used 之後 = 不擋路 (passable)；used 跟著 opensWhen (音訊 USED_ON 的「柵門打開」)
// - oldCompass：舊的羅盤架 (資訊物件；開場旁白「羅盤的把手磨亮了」的依據)：3D / 2D 按 E = readText
// - uncoveredQuery = ChapterSpec.uncovered 的實作 (app 以 mechanics/index chapterSpecOf 注入)
import type { Mechanic } from '../core/registry';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import type { ChapterState } from '../core/chapter';
import type { Side } from '../core/cube';
import { lightState } from '../core/chapter';
import { addItem, hasItem, say } from '../core/world';
import { SCALE_CARDS, effectiveFactor, type CrossRooms } from './scale';

declare module '../core/types' {
  interface ObjBase {
    /** v0.4 3-4b 卡榫物件蓋住的那扇彩繪玻璃 (本地門位)：有效尺寸是「小」時露出 (ChapterSpec.uncovered → 'room.side') */
    covers?: Side;
  }
  interface ObjKinds {
    /** 花窗架：parts = 要嵌上的玻璃片；okText = 嵌上的那一刻；missingText = 缺幾片 ({n})；lattice = 它代答的花窗 */
    paneFrame: { parts: readonly ItemId[]; okText: TextKey; missingText: TextKey; lattice: ObjId };
    /**
     * 九格花窗：cells = 九格要的內容 (列優先)；light = 要的光；frame = 花窗架 (used 之後才算)；
     * readText = 都不成立、patternText = 只有圖對、lightText = 只有光到、solvedText = 成立的那一刻、doneText = 已解 (花窗架代答)
     */
    lattice: {
      cells: readonly string[]; light: { from: Side; via: number }; frame: ObjId;
      readText: TextKey; patternText: TextKey; lightText: TextKey; solvedText: TextKey; doneText: TextKey;
    };
    /** 花窗架的抽屜 (拾取物)：also = 一併取得的物品 (手記第三頁) */
    latticeBox: { also?: readonly ItemId[] };
    /** 巨根：usedWhen = 這個物件 used 的那一刻縮回土裡 */
    giantRoot: { usedWhen: ObjId };
    /** 長廊柵門 (實體)：opensWhen 的物件 used 之後不擋路 */
    chaseGate: { opensWhen: ObjId };
    /** 舊的羅盤架 (資訊物件)：readText = 按 E */
    oldCompass: { readText: TextKey };
  }
}

/** 花窗此刻的狀態：none = 都不成立、pattern = 只有圖對、light = 只有光到、both = 都成立 */
export type LatticeState = 'none' | 'pattern' | 'light' | 'both';

/** 花窗的圖此刻對不對：非 'any' 的格都對 ('empty' / 'solid' = 那一格沒有房間；房間 id = 那一格是那間房) */
export function latticePattern(w: World, o: ObjState): boolean {
  if (o.def.type !== 'lattice') return false;
  const layout = w.ext.cube?.layout;
  if (!layout) return false;
  const at = new Map<number, string>();
  for (const [room, c] of Object.entries(layout)) at.set(c[0] + 3 * c[1], room);
  return o.def.cells.every((want, i) => want === 'any' || (want === 'empty' || want === 'solid' ? !at.has(i) : at.get(i) === want));
}

export function latticeState(w: World, o: ObjState): LatticeState {
  if (o.def.type !== 'lattice') return 'none';
  const pattern = latticePattern(w, o);
  const lit = lightState(w.ext.light?.hits ?? [], o.def.light.from, o.def.light.via) === 'lit';
  return pattern && lit ? 'both' : pattern ? 'pattern' : lit ? 'light' : 'none';
}

/** 花窗此刻的樣子 (花窗架裝好之後按 E) */
function latticeText(w: World, o: ObjState): TextKey | null {
  if (o.def.type !== 'lattice') return null;
  if (o.used) return o.def.doneText;
  const s = latticeState(w, o);
  return s === 'pattern' ? o.def.patternText : s === 'light' ? o.def.lightText : o.def.readText;
}

/** 缺幾片的數字 (一 / 兩 / 三) */
const NUM_KEYS: readonly TextKey[] = ['term.num.1', 'term.num.2', 'term.num.3'];

/** 上一步的花窗狀態 (只用來決定要不要說話；換房 / R = 新的 World、重新記) */
const last = new WeakMap<ObjState, LatticeState>();

function update(w: World): void {
  for (const o of w.objs) {
    if (o.def.type === 'giantRoot') {
      if (!o.used && w.byId.get(o.def.usedWhen)?.used) o.used = true;
      continue;
    }
    if (o.def.type === 'chaseGate') { o.used = !!w.byId.get(o.def.opensWhen)?.used; continue; }
    if (o.def.type !== 'lattice' || o.gone) continue;
    const s = latticeState(w, o);
    const prev = last.get(o);
    last.set(o, s);
    if (o.used || !w.byId.get(o.def.frame)?.used) continue;
    if (s === 'both') {
      o.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    } else if (prev !== undefined && s !== prev && s !== 'none') say(w, s === 'pattern' ? o.def.patternText : o.def.lightText);
  }
}

/** ChapterSpec.uncovered (app 注入)：每間房裡帶 covers 的物件，有效尺寸是「小」(含 stayShrunk 的 used，讀快照) → 'room.side' */
export const uncoveredQuery = (c: CrossRooms) => (state: ChapterState, labels: Readonly<Record<string, readonly string[]>>): string[] => {
  const out: string[] = [];
  for (const [room, level] of Object.entries(c.rooms)) {
    const used = new Set((state.rooms[room]?.objs ?? []).filter(s => s.used).map(s => s.id));
    for (const d of level.objects) {
      if (!d.covers) continue;
      if (effectiveFactor(d, labels, used.has(d.id)) <= SCALE_CARDS['card.xiao'] + 1e-6) out.push(`${room}.${d.covers}`);
    }
  }
  return out;
};

export const depths: Mechanic = {
  id: 'depths',
  types: {
    paneFrame: {
      verbKey: 'obj.paneFrame.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'paneFrame') return;
        if (o.used) { const l = w.byId.get(o.def.lattice); const t = l && latticeText(w, l); if (t) say(w, t); return; }
        const missing = o.def.parts.filter(p => !hasItem(w, p)).length;
        if (missing) { say(w, o.def.missingText, { n: w.rt.text(NUM_KEYS[Math.min(missing, NUM_KEYS.length) - 1]) }); return; }
        for (const p of o.def.parts) addItem(w, p, -1);
        o.used = true;
        say(w, o.def.okText);
      }
    },
    lattice: {},
    latticeBox: { verbKey: 'obj.key.verb', interact: (w, o) => { if (o.def.type === 'latticeBox') for (const i of o.def.also ?? []) addItem(w, i, 1); } },
    giantRoot: {},
    chaseGate: {},
    oldCompass: { verbKey: 'obj.sensor.verb', usableWhenUsed: true, interact: (w, o) => { if (o.def.type === 'oldCompass') say(w, o.def.readText); } }
  },
  /** 花窗亮了 = 柵門打開 */
  passable: (w, o) => o.def.type === 'chaseGate' && !!w.byId.get(o.def.opensWhen)?.used,
  afterPhysics: update
};
