// 章節抽象模型驗證 (v0.3；規格 5.4.8、architecture 6.6)：廣度優先搜尋所有可達狀態。
// 檢查：① 有解 ② 任一可達狀態都能到終點 (卡死 = 0) ③ 最短解的轉動次數 ④ 拿掉任一必要步驟就無解 (捷徑檢查)。純函式
import { applyOp, applyTurn, cellsOf, cubeKey, sameCell, initialCube, isBlocked, links, localSide, turnDirs, type CubeDef, type CubeState, type DoorInfo, type Link, type Side, type Turn } from '../core/cube';
import { inkPaths, jamActive, lightPaths, lightState, type LightHit } from '../core/chapter';
import type { LevelDef } from '../core/types';
import { chapterDoors, leverOp } from '../mechanics/cube';
import type { CH1_MODEL } from '../content/cubes/ch1';

/** 一步：tag = 動作種類 (捷徑檢查以 tag 停用)；turn = 是否為魔方轉動 (計入最短轉動次數) */
export interface ModelMove<S> { label: string; tag: string; turn: boolean; next: S }
export interface ChapterModel<S> {
  initial: S;
  key(s: S): string;
  /** 魔方排列 (統計可達排列數) */
  arrangement(s: S): string;
  moves(s: S): ModelMove<S>[];
  isGoal(s: S): boolean;
}

export interface CubeReport {
  /** 可達抽象狀態數 (含終點) */
  states: number;
  /** 可達魔方排列數 */
  arrangements: number;
  /** 到不了終點的可達狀態數 (卡死) */
  deadEnds: number;
  solvable: boolean;
  /** 最短解的轉動次數 (無解 = null) 與該解的步驟 (同轉動次數取步數最少者) */
  minTurns: number | null;
  path: string[];
}

/** BFS (without = 停用的動作 tag) */
export function validateCube<S>(m: ChapterModel<S>, without: readonly string[] = []): CubeReport {
  const off = new Set(without);
  const seen = new Map<string, S>();
  const edges = new Map<string, Array<{ to: string; turn: boolean; label: string }>>();
  const queue: S[] = [m.initial];
  seen.set(m.key(m.initial), m.initial);
  while (queue.length) {
    const s = queue.shift()!;
    const k = m.key(s);
    const out: Array<{ to: string; turn: boolean; label: string }> = [];
    if (!m.isGoal(s)) {
      for (const mv of m.moves(s)) {
        if (off.has(mv.tag)) continue;
        const nk = m.key(mv.next);
        out.push({ to: nk, turn: mv.turn, label: mv.label });
        if (!seen.has(nk)) { seen.set(nk, mv.next); queue.push(mv.next); }
      }
    }
    edges.set(k, out);
  }
  // 反向可達：能到終點的狀態
  const goals = [...seen].filter(([, s]) => m.isGoal(s)).map(([k]) => k);
  const back = new Map<string, string[]>();
  for (const [from, es] of edges) for (const e of es) (back.get(e.to) ?? back.set(e.to, []).get(e.to)!).push(from);
  const good = new Set(goals);
  const stack = [...goals];
  while (stack.length) for (const p of back.get(stack.pop()!) ?? []) if (!good.has(p)) { good.add(p); stack.push(p); }
  // 最短解：先比轉動次數、再比步數 (成本 = 轉動 × 1000 + 1；狀態數小，用排序佇列即可)
  const start = m.key(m.initial);
  const cost = (turns: number, steps: number): number => turns * 1000 + steps;
  const dist = new Map<string, { turns: number; steps: number }>([[start, { turns: 0, steps: 0 }]]);
  const prev = new Map<string, { from: string; label: string }>();
  const open = [start];
  const done = new Set<string>();
  while (open.length) {
    open.sort((a, b) => cost(dist.get(a)!.turns, dist.get(a)!.steps) - cost(dist.get(b)!.turns, dist.get(b)!.steps) || (a < b ? -1 : 1));
    const k = open.shift()!;
    if (done.has(k)) continue;
    done.add(k);
    const d = dist.get(k)!;
    for (const e of edges.get(k) ?? []) {
      const nd = { turns: d.turns + (e.turn ? 1 : 0), steps: d.steps + 1 };
      const cur = dist.get(e.to);
      if (cur && cost(cur.turns, cur.steps) <= cost(nd.turns, nd.steps)) continue;
      dist.set(e.to, nd);
      prev.set(e.to, { from: k, label: e.label });
      open.push(e.to);
    }
  }
  let best: string | null = null;
  const total = (k: string): number => cost(dist.get(k)!.turns, dist.get(k)!.steps);
  for (const g of goals) if (dist.has(g) && (best === null || total(g) < total(best))) best = g;
  const path: string[] = [];
  for (let k = best; k !== null && k !== start;) { const p = prev.get(k)!; path.unshift(p.label); k = p.from; }
  return {
    states: seen.size,
    arrangements: new Set([...seen.values()].map(s => m.arrangement(s))).size,
    deadEnds: seen.size - good.size,
    solvable: goals.length > 0,
    minTurns: best === null ? null : dist.get(best)!.turns,
    path
  };
}

// ── 第一章模型 ──

/**
 * 第一章抽象狀態：魔方 × 玩家所在房 × 詞卡 (null = 還沒拿、'hand' = 在字卡匣、房間 id = 貼在那間房的拉桿上) × 木箱在哪房 × 鑰匙 × 是否已出章門
 */
export interface Ch1State { cube: CubeState; at: string; card: string | null; crate: string; key: boolean; done: boolean }

/**
 * 第一章模型 (content/cubes/ch1 的 CH1_MODEL)：動作 = 穿過接通的門 (walk)、拉所在房的拉桿 (lever:<房>，方向字依標籤上的詞卡)、
 * 取詞卡 (card)、在所在房的拉桿標籤貼 / 取詞卡 (write；card.levers 每一支都可貼)、經拱門對拱門推箱 (crate)、箱子在場時取鑰匙 (key)、
 * 帶鑰匙穿過章門 (exit)
 */
export function chapterOneModel(def: CubeDef, data: typeof CH1_MODEL): ChapterModel<Ch1State> {
  const doors: readonly DoorInfo[] = data.doors;
  const linksFrom = (s: Ch1State, room: string) => links(def, s.cube, doors).filter(l => l.from.room === room);
  return {
    initial: { cube: initialCube(def), at: data.start.room, card: null, crate: data.crate.room, key: false, done: false },
    key: s => `${cubeKey(s.cube)}|${s.at}|${s.card ?? '-'}|${s.crate}|${s.key ? 1 : 0}|${s.done ? 1 : 0}`,
    arrangement: s => cubeKey(s.cube),
    isGoal: s => s.done,
    moves: s => {
      const out: ModelMove<Ch1State>[] = [];
      for (const l of linksFrom(s, s.at)) {
        if ('room' in l.to) out.push({ label: `walk ${s.at}→${l.to.room}`, tag: 'walk', turn: false, next: { ...s, at: l.to.room } });
        else if (l.to.frame === data.exit.frame && l.from.door === data.exit.door && s.key) out.push({ label: 'exit', tag: 'exit', turn: false, next: { ...s, done: true } });
      }
      const word = data.levers[s.at];
      if (word) {
        const w = s.card === s.at ? data.card.word : word;
        const r = applyOp(def, s.cube, leverOp(s.at, w));
        if (!isBlocked(r)) out.push({ label: `lever ${s.at}:${w}`, tag: `lever:${s.at}`, turn: true, next: { ...s, cube: r } });
      }
      if (s.at === data.card.room && s.card === null) out.push({ label: 'card', tag: 'card', turn: false, next: { ...s, card: 'hand' } });
      const writable = (data.card.levers as readonly string[]).includes(s.at);
      if (writable && s.card === 'hand') out.push({ label: s.at === 'closet' ? 'write' : `write ${s.at}`, tag: `write:${s.at}`, turn: false, next: { ...s, card: s.at } });
      if (writable && s.card === s.at) out.push({ label: s.at === 'closet' ? 'unwrite' : `unwrite ${s.at}`, tag: `write:${s.at}`, turn: false, next: { ...s, card: 'hand' } });
      if (s.crate === s.at) {
        for (const l of linksFrom(s, s.at)) {
          if (l.kind === 'arch' && 'room' in l.to) out.push({ label: `crate ${s.at}→${l.to.room}`, tag: 'crate', turn: false, next: { ...s, crate: l.to.room } });
        }
      }
      if (s.at === data.key.room && s.crate === data.key.room && !s.key) out.push({ label: 'key', tag: 'key', turn: false, next: { ...s, key: true } });
      return out;
    }
  };
}

// ── v0.4 控制盤章節：validateDial (規格 5.4.8 ⑥～⑪、D16；architecture 4.16.1；決策 Q13：回退不另建模) ──

/** 題目條件可用的跨房資訊：此刻的連接表 (含此組旗標下讀作「間」的門) */
export interface GoalCtx { links(): readonly Link[] }

/** 一題 (抽象)：在 room 完成；needs = 設計上的前置題 (多解列舉從「前置剛湊齊」的狀態出發)；goal = 魔方排列的條件 (沒給 = 走到那間房即可完成) */
export interface DialPuzzle {
  id: string;
  room: string;
  needs: readonly string[];
  goal?: (s: CubeState, flags: ReadonlySet<string>, ctx: GoalCtx) => boolean;
  /** 教學題 (範式 / 新操作首次)：允許唯一解 (D16 ③) */
  teaching?: boolean;
  /** 刻意排除的較長策略 (例：不縮小要 5 步)：其步數必須 > 預算 */
  excluded?: { name: string; minSteps: number };
  /**
   * v0.4 第三章 光路 (N26)：這間房 (p.room) 此刻要有從 from 進來、穿過至少 via 間房的光 (core/chapter lightPaths + lightState = lit；
   * 與 goal 同時成立才算)。內容層只能 import 核心型別，光路條件以資料宣告，由這裡以同一個純函式判定；
   * v0.4 3-4b uncovered = 光路以這幾扇露出來的被蓋住的玻璃計 (`room.side`；同 ChapterSpec.uncovered)
   */
  light?: { from: Side; via: number; uncovered?: readonly string[] };
  /** v0.4 第四章 墨流 (P15)：這間房 (p.room) 的這個匯點 (本地門位) 此刻收到墨 (core/chapter inkPaths；模型裡閥一律視為已開) */
  ink?: { side: Side };
  /** v0.4 3-4b 題的條件：這張卡此刻貼在這個槽 ('card@slot'；DialModel.cards) */
  card?: string;
  /** v0.4 3-4b 完成的那一刻本房墨補滿 (LevelDef.turnBudget.refillOn) */
  refill?: boolean;
  /**
   * v0.4 ⑦ 多解列舉的步數上限 (沒給 = 房間預算 / P4 預算)：解法本身要換房 (穿門 = 墨補滿) 的題，總轉動數可以超過一次進房的墨
   * (3-4b：「小」要從夜溫室親手帶到深處；規格「≤ 10 步內閂住時的排列」)
   */
  span?: number;
  /** v0.4 第五章 這一組轉成功的那一刻完成 (5-1b：縮影的底層第一次轉；人在 p.room、前置齊、卡片條件成立) */
  turn?: string;
}

/**
 * v0.4 3-4 尺度卡的位置 (規格「3-4 溫室深處（細化）」3-4 區抽象模型)：狀態多一維「每張卡在哪個槽 / 手上」；
 * 動作 (不耗墨、不改排列) = 人在 slot.room 時「槽 → 手」或「手 → 槽」(after = 那一題完成後才貼得上；同一個槽只貼一張)
 */
export interface DialCard { id: string; start: string; slots: Readonly<Record<string, { room: string; after?: string }>> }

export interface DialModel {
  cube: CubeDef;
  doors: readonly DoorInfo[];
  /** 章門入口房 (開章時所在) */
  start: string;
  /** 每間房的墨量預算 (base) 與 P4 題的預算 (p4[題 id]，該題未完成時用) */
  rooms: Readonly<Record<string, { budget: number; p4?: Readonly<Record<string, number>> }>>;
  puzzles: readonly DialPuzzle[];
  /** 完成這一題 = 本章 (或本區) 的終點 */
  finish: string;
  /** 抽象狀態上限 (規格 5.4.9：2×10⁶)；超過 → 停止並報錯，不卡住 */
  maxStates?: number;
  /** 多解列舉：每題最多記錄的解法數 (超過 = 依深度分層取樣；規格 5.4.8 ⑦ 10⁴) */
  maxSolutions?: number;
  /** v0.4 門牌「間」：when 這一題完成之後，room.door 讀作「間」(對面沒有門也接到洞位；規格「門牌「間」」) */
  plates?: ReadonlyArray<{ room: string; door: string; when: string }>;
  /**
   * v0.4 第三章 卡榫 (P3；規格「第三章共用規則」驗證)：room 卡住時，牽涉這間房的轉動一律轉不動。
   * until = 這一題完成之前卡住 (之後鬆開)；from = 這一題完成之後卡住；兩者都沒給 = 本區一直卡著 (例：深處的巨根在 3-4b 才縮)；
   * v0.4 unless = 'card@slot'：那張卡此刻在那個槽時不卡 (3-4：巨盆貼著「小」→ 夜溫室不卡)
   */
  jams?: ReadonlyArray<DialJam>;
  /** v0.4 3-4 尺度卡的位置 (沒給 = 卡片不進模型，旗標的階段近似照舊) */
  cards?: readonly DialCard[];
  /**
   * v0.4 H1 房內被隔開的區 (規格「H1 夾層（細化）」H1 區抽象模型)：room 裡只從 doors 進出的一區 = 一個節點 (id；墨量 = 那間房的預算、
   * 轉動時跟著房間走；題的 room 可以寫區 id)。opensWhen = 那一題完成前從門的另一側進不來 (已在區內的人照樣出得去；不在模型裡的題 = 一直進不來)
   */
  areas?: readonly DialArea[];
  /**
   * v0.4 第四章 封住的門 (cubeDoor.sealed：墨線鎖、收起來的折疊梯)：until 這一題完成前，人不能從 room 經 door 走出去
   * (兩側都封 = 兩扇門各一筆)；dialModelOf 由各房的 cubeDoor 自動組出
   */
  doorLocks?: readonly DialDoorLock[];
  /**
   * v0.4 第五章 縮影 (P10；規格「5-1 天窗間（細化）」抽象模型)：card 此刻成立 (例 'xiao@self' = 「小」貼在你身上) = 縮小——
   * 穿不過門；人在 room 時轉得到 DialDef.miniOnly 的組 (沒有 mini = miniOnly 的組不進模型)。DialDef.jams (組被卡住) 依旗標判定
   */
  mini?: { room: string; card?: string };
}

/** both = 兩面都封 (cubeDoor.sealed.both)：人也不能從對面經這扇門走進來 */
export interface DialDoorLock { room: string; door: string; until: string; both?: boolean }

export interface DialArea { id: string; room: string; doors: readonly string[]; opensWhen?: string }

/**
 * 連接表 → 節點對 (房 / 區；walks 與 ⑦ 的 reach 共用)：門所在的區 (沒有 = 房) → 對面門所在的區；
 * 對面的區此刻還沒開 (opensWhen 不在 flags 裡) → 這一對不列 (只出不進)
 */
export function areaPairs(m: Pick<DialModel, 'areas' | 'doorLocks'>, ls: readonly Link[], flags: ReadonlySet<string>): Array<[string, string]> {
  const areas = m.areas ?? [];
  const sealed = (room: string, door: string): boolean => (m.doorLocks ?? []).some(k => k.room === room && k.door === door && !flags.has(k.until));
  const sealedIn = (room: string, door: string): boolean => (m.doorLocks ?? []).some(k => k.both && k.room === room && k.door === door && !flags.has(k.until));
  const areaOf = (room: string, door: string): DialArea | undefined => areas.find(a => a.room === room && a.doors.includes(door));
  const out: Array<[string, string]> = [];
  for (const l of ls) {
    if (!('room' in l.to)) continue;
    if (sealed(l.from.room, l.from.door) || sealedIn(l.to.room, l.to.door)) continue;
    const to = areaOf(l.to.room, l.to.door);
    if (to?.opensWhen !== undefined && !flags.has(to.opensWhen)) continue;
    out.push([areaOf(l.from.room, l.from.door)?.id ?? l.from.room, to?.id ?? l.to.room]);
  }
  return out;
}

/** 區的墨量預算 = 所在房 (m.rooms 沒列的區自動補上) */
function withAreaRooms(m: DialModel): DialModel {
  const missing = (m.areas ?? []).filter(a => !(a.id in m.rooms) && a.room in m.rooms);
  return missing.length ? { ...m, rooms: { ...m.rooms, ...Object.fromEntries(missing.map(a => [a.id, m.rooms[a.room]])) } } : m;
}

export interface DialJam { room: string; until?: string; from?: string; unless?: string }

/** 卡片位置的編碼 (每張卡：0 = 手上、1… = 依 slots 的鍵順序；多張卡 = 混合進位)；沒有卡 = 只有一個位置 */
interface CardSpace {
  size: number;
  start: number;
  /** 'card@slot' 此刻成立 */
  at(c: number, ref: string): boolean;
  /** 人在 room、這組旗標下的拿 / 放 (不耗墨) → 新位置 */
  moves(c: number, room: string, flags: ReadonlySet<string>): number[];
}
function cardSpaceOf(m: DialModel): CardSpace {
  const cards = m.cards ?? [];
  const slots = cards.map(k => Object.keys(k.slots));
  const base = slots.map(ss => ss.length + 1);
  const mul = base.map((_, j) => base.slice(0, j).reduce((a, b) => a * b, 1));
  const size = base.reduce((a, b) => a * b, 1);
  const pos = (c: number, j: number): number => Math.floor(c / mul[j]) % base[j];
  const start = cards.reduce((acc, k, j) => acc + (slots[j].indexOf(k.start) + 1) * mul[j], 0);
  const at = (c: number, ref: string): boolean => {
    const [id, slot] = ref.split('@');
    const j = cards.findIndex(k => k.id === id);
    if (j < 0) return false;
    if (slot === 'hand') return pos(c, j) === 0;
    const i = slots[j].indexOf(slot);
    return i >= 0 && pos(c, j) === i + 1;
  };
  const moves = (c: number, room: string, flags: ReadonlySet<string>): number[] => {
    const out: number[] = [];
    cards.forEach((k, j) => {
      const p = pos(c, j);
      if (p > 0) { if (k.slots[slots[j][p - 1]].room === room) out.push(c - p * mul[j]); return; }
      slots[j].forEach((sl, i) => {
        const def = k.slots[sl];
        if (def.room !== room || (def.after !== undefined && !flags.has(def.after))) return;
        if (cards.some((_, q) => q !== j && pos(c, q) > 0 && slots[q][pos(c, q) - 1] === sl)) return;
        out.push(c + (i + 1) * mul[j]);
      });
    });
    return out;
  };
  return { size, start, at, moves };
}

/** 這組旗標 (與卡片位置) 下卡住的房 */
function jammedRooms(m: DialModel, flags: ReadonlySet<string>, card: (ref: string) => boolean = () => false): Set<string> {
  return new Set((m.jams ?? []).filter(j => (j.until === undefined || !flags.has(j.until)) && (j.from === undefined || flags.has(j.from)) && (j.unless === undefined || !card(j.unless))).map(j => j.room));
}

/** 這一個轉動 (組) 在排列 s 下牽涉到的房 (組內格子上的房) */
function roomsIn(def: CubeDef, s: CubeState, group: string): string[] {
  const cells = cellsOf(def, s, group);
  return Object.keys(s.pos).filter(r => cells.some(c => sameCell(c, s.pos[r])));
}

/** 這組旗標下讀作「間」的門 (`room.door`) */
function platesFor(m: DialModel, flags: ReadonlySet<string>): Set<string> {
  return new Set((m.plates ?? []).filter(p => flags.has(p.when)).map(p => `${p.room}.${p.door}`));
}

/** 每個排列 (× 露出來的玻璃) 的光路 (只算一次；沒有彩繪玻璃的魔方 = 空)；以魔方定義分開記 (同一個排列物件可能被不同玻璃表的變體共用) */
const lightMemo = new WeakMap<CubeDef, WeakMap<CubeState, Map<string, Record<string, LightHit[]>>>>();
function hitsAt(def: CubeDef, s: CubeState, uncovered: readonly string[] = []): Record<string, LightHit[]> {
  const key = [...uncovered].sort().join(',');
  let byDef = lightMemo.get(def);
  if (!byDef) { byDef = new WeakMap(); lightMemo.set(def, byDef); }
  let byKey = byDef.get(s);
  if (!byKey) { byKey = new Map(); byDef.set(s, byKey); }
  let h = byKey.get(key);
  if (!h) { h = def.glass ? lightPaths(def, s, new Set(uncovered)).hits : {}; byKey.set(key, h); }
  return h;
}

/** 光的方位 (魔方方位) → 房間本地 (core/cube localSide：同一張朝向表) */
const localHits = (hits: readonly LightHit[], rot: number): LightHit[] => (rot ? hits.map(h => ({ ...h, from: localSide(h.from, rot) })) : [...hits]);
/** 每個排列的墨流匯點 (所有源頭都開著；以魔方定義分開記) */
const inkMemo = new WeakMap<CubeDef, WeakMap<CubeState, Record<string, Side[]>>>();
function inkAt(def: CubeDef, s: CubeState): Record<string, Side[]> {
  let byDef = inkMemo.get(def);
  if (!byDef) { byDef = new WeakMap(); inkMemo.set(def, byDef); }
  let h = byDef.get(s);
  if (!h) { h = def.ink ? inkPaths(def, s, new Set(Object.keys(def.ink))).sinks : {}; byDef.set(s, h); }
  return h;
}

/** 題目的排列條件此刻是否成立：卡片條件 (沒給 = 成立)、goal (沒給 = 成立) 且光路條件 (沒給 = 成立) */
function goalHolds(m: DialModel, p: DialPuzzle, s: CubeState, flags: ReadonlySet<string>, card: (ref: string) => boolean = () => false): boolean {
  if (p.card && !card(p.card)) return false;
  // 光的方位換成房間本地 (第四章房間會轉；第三章朝向恆 0)
  if (p.light && lightState(localHits(hitsAt(m.cube, s, p.light.uncovered)[p.room] ?? [], s.rot[p.room] ?? 0), p.light.from, p.light.via) !== 'lit') return false;
  if (p.ink && !(inkAt(m.cube, s)[p.room] ?? []).includes(p.ink.side)) return false;
  return !p.goal || p.goal(s, flags, { links: () => links(m.cube, s, m.doors, platesFor(m, flags)) });
}

export interface DialPuzzleReport {
  id: string;
  /** 最短解的轉動步數 (null = 步數上限內無解) 與次短 (本質不同的解中最短者) */
  shortest: number | null;
  second: number | null;
  /** 序列數 (狀態不重複的轉動序列) 與本質不同的解 (轉動多重集合) 數 */
  solutions: number;
  distinct: number;
  sampled: boolean;
  /** 本題的步數上限 (P4 預算或房間基礎預算) */
  budget: number;
  issues: string[];
}

export interface DialReport {
  /** 可達抽象狀態數 (魔方排列 × 所在房 × 已完成的題 × 魔方儀 × 剩餘墨) 與可達魔方排列數 */
  states: number;
  arrangements: number;
  solvable: boolean;
  /** 卡死 (含 R)：進房快照本身就到不了終點的狀態 (R 救不回來)；只列前 20 個 */
  deadlocks: string[];
  /** 不靠 R 到不了終點的可達狀態數 (墨用完困在房裡等；R 回到進房快照即可再解) */
  needsRestart: number;
  perPuzzle: DialPuzzleReport[];
  budgetBypass: string[];
  lockIssues: string[];
  entryIssues: string[];
  /** 整體問題 (狀態超量、題號錯誤、題目可在前置之前完成) */
  issues: string[];
}

const DEFAULT_MAX_STATES = 2_000_000;
const DEFAULT_MAX_SOLUTIONS = 10_000;

interface Arrangements {
  states: CubeState[];
  /** opts[i] = 控制盤上的第 i 個 (組, 方向) */
  opts: Array<{ group: string; dir: Turn['dir'] }>;
  /** next[a * opts + i] = 轉後的排列 (−1 = 轉不動) */
  next: Int32Array;
  overflow: boolean;
}

/** 控制盤能轉到的所有魔方排列 (不管鎖扣；BFS)；超過 limit → overflow */
function arrangementsOf(def: CubeDef, limit: number, withMini = false): Arrangements {
  const groups = (def.dial?.groups ?? []).filter(g => withMini || !def.dial?.miniOnly?.includes(g.id));
  const opts = groups.flatMap(g => turnDirs(def, g.id).map(dir => ({ group: g.id, dir })));
  const s0 = initialCube(def);
  // 第五章 走廊格同類合併 (cubeKey 帶 def)；沒有走廊格的魔方 = 原樣
  const index = new Map<string, number>([[cubeKey(s0, def), 0]]);
  const states = [s0];
  const next: number[] = [];
  // v0.4 第五章 只看排列的卡住 (DialDef.jams 的 home，沒有 until)：那個排列下這一組轉不動 (縮影對不上房子)
  const homeJams = (def.dial?.jams ?? []).filter(j => j.home && j.until === undefined);
  for (let a = 0; a < states.length; a++) {
    for (const o of opts) {
      if (homeJams.some(j => j.group === o.group && jamActive(j, states[a], () => false))) { next.push(-1); continue; }
      const r = applyTurn(def, states[a], o);
      if (isBlocked(r)) { next.push(-1); continue; }
      const k = cubeKey(r, def);
      let i = index.get(k);
      if (i === undefined) {
        if (states.length >= limit) return { states, opts, next: Int32Array.from(next), overflow: true };
        i = states.length; index.set(k, i); states.push(r);
      }
      next.push(i);
    }
  }
  return { states, opts, next: Int32Array.from(next), overflow: false };
}

interface DialGraph {
  states: number;
  arrangements: Set<number>;
  /** 每個可達狀態 (編碼) → 序號；succ = 後繼 (CSR)；entry = 進房快照 (開章、穿門、進房快照上啟動) */
  order: number[];
  succStart: Int32Array;
  succ: Int32Array;
  entry: Uint8Array;
  goal: Uint8Array;
  flagsReached: number;
  /** 前置未齊就完成的題 */
  early: Set<string>;
  overflow: boolean;
}

/** 抽象模型的 BFS (budgetOf / forcedLocked 用來做變體：預算繞過、鎖扣自我等待) */
function dialGraph(m: DialModel, arr: Arrangements, budgetOf: (room: string, flags: number) => number, forcedLocked: ReadonlySet<string>, limit: number): DialGraph {
  const def = m.cube;
  const rooms = Object.keys(m.rooms);
  const R = rooms.length;
  const P = m.puzzles.length;
  const F = 1 << P;
  const pid = new Map(m.puzzles.map((p, i) => [p.id, i]));
  const maxInk = Math.max(0, ...rooms.map(r => Math.max(m.rooms[r].budget, ...Object.values(m.rooms[r].p4 ?? {}))));
  const K = maxInk + 1;
  const cs = cardSpaceOf(m);
  const C = cs.size;
  const enc = (a: number, r: number, f: number, d: number, k: number, c = 0): number => ((((a * R + r) * F + f) * C + c) * 2 + d) * K + k;
  const dec = (x: number) => { const k = x % K; x = (x - k) / K; const d = x % 2; x = (x - d) / 2; const c = x % C; x = (x - c) / C; const f = x % F; x = (x - f) / F; const r = x % R; return { a: (x - r) / R, r, f, d, k, c }; };
  // 每個排列 (× 讀作「間」的門)：各房穿門可到的房 (只算房 ↔ 房的接通)
  const plateIdx = (m.plates ?? []).map(p => pid.get(p.when) ?? -1);
  const plateMask = (f: number): number => plateIdx.reduce((acc, i, j) => (i >= 0 && f & (1 << i) ? acc | (1 << j) : acc), 0);
  // 已開的區 (opensWhen 的題已完成；快取鍵的一部分)
  const areaIdx = (m.areas ?? []).map(x => (x.opensWhen === undefined ? -2 : pid.get(x.opensWhen) ?? -1));
  const areaMask = (f: number): number => areaIdx.reduce((acc, i, j) => (i === -2 || (i >= 0 && f & (1 << i)) ? acc | (1 << j) : acc), 0);
  // 已解開的封門 (doorLocks 的 until 已完成；快取鍵的一部分)
  const lockIdx = (m.doorLocks ?? []).map(k => pid.get(k.until) ?? -1);
  const lockMask = (f: number): number => lockIdx.reduce((acc, i, j) => (i >= 0 && f & (1 << i) ? acc | (1 << j) : acc), 0);
  const walkMemo = new Map<number, number[][]>();
  const walks = (a: number, f: number): number[][] => {
    const pm = plateMask(f);
    const am = areaMask(f);
    const lm = lockMask(f);
    const key = ((a * (1 << plateIdx.length) + pm) * (1 << areaIdx.length) + am) * (1 << lockIdx.length) + lm;
    let w = walkMemo.get(key);
    if (!w) {
      w = rooms.map(() => [] as number[]);
      const plates = new Set((m.plates ?? []).filter((_, j) => pm & (1 << j)).map(p => `${p.room}.${p.door}`));
      const open = new Set((m.areas ?? []).filter((x, j) => am & (1 << j) && x.opensWhen !== undefined).map(x => x.opensWhen!));
      for (const [j, k] of (m.doorLocks ?? []).entries()) if (lm & (1 << j)) open.add(k.until);
      for (const [fr, tr] of areaPairs(m, links(def, arr.states[a], m.doors, plates), open)) {
        const from = rooms.indexOf(fr);
        const to = rooms.indexOf(tr);
        if (from >= 0 && to >= 0 && !w[from].includes(to)) w[from].push(to);
      }
      walkMemo.set(key, w);
    }
    return w;
  };
  const locks = def.dial?.locks ?? [];
  // v0.4 第五章 DialLock.rooms：人不在那幾間房 = 鎖著 (解開了也一樣)
  const optLocked = (o: number, f: number, r: number): boolean => {
    const g = arr.opts[o].group;
    if (forcedLocked.has(g)) return true;
    const ls = locks.filter(l => l.group === g);
    if (ls.some(l => l.rooms && !l.rooms.includes(rooms[r]))) return true;
    return ls.length > 0 && !ls.some(l => { const i = pid.get(l.until); return i !== undefined && (f & (1 << i)) !== 0; });
  };
  const flagSet = (f: number): Set<string> => new Set(m.puzzles.filter((_, i) => f & (1 << i)).map(p => p.id));
  // 卡榫：依旗標決定哪些房卡住 (旗標組合 → 卡住的房；沒有 jams = 永遠空)
  const jamMemo = new Map<number, Set<string>>();
  const jamsAt = (f: number, c: number): Set<string> => { const key = f * C + c; let j = jamMemo.get(key); if (!j) { j = jammedRooms(m, flagSet(f), ref => cs.at(c, ref)); jamMemo.set(key, j); } return j; };
  // v0.4 第五章 組被卡住 (DialDef.jams；旗標還沒成立)
  const groupJams = (def.dial?.jams ?? []).map(j => ({ j, i: j.until === undefined ? -2 : pid.get(j.until) ?? -1 }));
  const optJammed = (a: number, o: number, f: number, c: number): boolean => {
    if (groupJams.some(({ j, i }) => j.group === arr.opts[o].group && jamActive(j, arr.states[a], () => i === -1 || (i >= 0 && (f & (1 << i)) === 0)))) return true;
    const j = jamsAt(f, c);
    return j.size > 0 && roomsIn(def, arr.states[a], arr.opts[o].group).some(r => j.has(r));
  };
  // v0.4 第五章 縮影：縮小 (mini.card 成立) = 穿不過門；miniOnly 的組只在縮小、人在 mini.room 時轉得到
  const miniOnly = new Set(def.dial?.miniOnly ?? []);
  const small = (c: number): boolean => !!m.mini?.card && cs.at(c, m.mini.card);
  const optOutOfReach = (o: number, r: number, c: number): boolean => miniOnly.has(arr.opts[o].group) && !((small(c) || !m.mini?.card) && rooms[r] === m.mini?.room);
  const turnPuzzles = m.puzzles.map((p, i) => ({ p, i })).filter(x => x.p.turn !== undefined);
  const finish = pid.get(m.finish) ?? -1;
  const dialRoom = rooms.indexOf(def.dial?.entry.room ?? '');
  const start = rooms.indexOf(m.start);
  const s0 = enc(0, start, 0, 0, budgetOf(m.start, 0), cs.start);
  const index = new Map<number, number>([[s0, 0]]);
  const order = [s0];
  const entry: number[] = [1];
  const succStart: number[] = [];
  const succ: number[] = [];
  const early = new Set<string>();
  let flagsReached = 0;
  let overflow = false;
  const visit = (x: number, isEntry: boolean): number => {
    let i = index.get(x);
    if (i === undefined) {
      if (order.length >= limit) { overflow = true; return -1; }
      i = order.length; index.set(x, i); order.push(x); entry.push(isEntry ? 1 : 0);
    } else if (isEntry) entry[i] = 1;
    return i;
  };
  for (let n = 0; n < order.length && !overflow; n++) {
    const { a, r, f, d, k, c } = dec(order[n]);
    flagsReached |= f;
    succStart.push(succ.length);
    if (finish >= 0 && f & (1 << finish)) continue;
    const add = (x: number, isEntry = false) => { const i = visit(x, isEntry); if (i >= 0) succ.push(i); };
    if (!small(c)) for (const r2 of walks(a, f)[r]) add(enc(a, r2, f, d, budgetOf(rooms[r2], f), c), true);
    if (!d && r === dialRoom) add(enc(a, r, f, 1, budgetOf(rooms[r], f), c), entry[n] === 1);
    const flags = flagSet(f);
    m.puzzles.forEach((p, i) => {
      if (f & (1 << i) || rooms[r] !== p.room || p.turn !== undefined) return;
      if (!goalHolds(m, p, arr.states[a], flags, ref => cs.at(c, ref))) return;
      if (!p.needs.every(q => flags.has(q))) early.add(p.id);
      const f2 = f | (1 << i);
      add(enc(a, r, f2, d, p.refill ? budgetOf(rooms[r], f2) : k, c));
    });
    if (d && k > 0) {
      for (let o = 0; o < arr.opts.length; o++) {
        const a2 = arr.next[a * arr.opts.length + o];
        if (a2 < 0 || optLocked(o, f, r) || optJammed(a, o, f, c) || optOutOfReach(o, r, c)) continue;
        // v0.4 第五章 轉成功即完成的題 (p.turn)：人在 p.room、前置齊、卡片條件成立
        let f2 = f;
        for (const { p, i } of turnPuzzles) {
          if (f & (1 << i) || p.turn !== arr.opts[o].group || rooms[r] !== p.room || (p.card && !cs.at(c, p.card))) continue;
          if (!p.needs.every(q => flags.has(q))) { early.add(p.id); continue; }
          f2 |= 1 << i;
        }
        add(enc(a2, r, f2, d, k - 1, c));
      }
    }
    // 拿 / 放尺度卡 (不耗墨、不改排列；同一房內)
    for (const c2 of cs.moves(c, rooms[r], flags)) add(enc(a, r, f, d, k, c2));
  }
  succStart.push(succ.length);
  const goal = new Uint8Array(order.length);
  if (finish >= 0) order.forEach((x, i) => { if (dec(x).f & (1 << finish)) goal[i] = 1; });
  return {
    states: order.length, arrangements: new Set(order.map(x => dec(x).a)), order, succStart: Int32Array.from(succStart), succ: Int32Array.from(succ),
    entry: Uint8Array.from(entry), goal, flagsReached, early, overflow
  };
}

/** 能到終點的狀態 (反向 BFS) */
function canFinish(g: DialGraph): Uint8Array {
  const n = g.states;
  const pred: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let e = g.succStart[i]; e < g.succStart[i + 1]; e++) pred[g.succ[e]].push(i);
  const good = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) if (g.goal[i]) { good[i] = 1; stack.push(i); }
  while (stack.length) for (const p of pred[stack.pop()!]) if (!good[p]) { good[p] = 1; stack.push(p); }
  return good;
}

/**
 * ⑦ 多解列舉：從 start (排列 a0、玩家可在 rooms0 任一房) 出發，步數 ≤ budget 的轉動序列 (中間可自由穿門；同一序列內狀態不重複)，
 * 第一次能走進 p.room 且 goal 成立即算一解 (不再延長)。依深度分層：每層最多 cap / budget 條，超過 = 取樣
 */
function enumerate(m: DialModel, arr: Arrangements, p: DialPuzzle, a0: number, room0: string, card0: number, flags: ReadonlySet<string>, budget: number, cap: number) {
  const def = m.cube;
  const locks = def.dial?.locks ?? [];
  const usable = arr.opts.map(o => { const ls = locks.filter(l => l.group === o.group); return ls.length === 0 || ls.some(l => flags.has(l.until)); });
  // v0.4 第五章 DialLock.rooms：這一組只在人在那幾間房時轉得動 (null = 不限)
  const lockRooms = arr.opts.map(o => { const ls = locks.filter(l => l.group === o.group && l.rooms); return ls.length ? new Set(ls.flatMap(l => l.rooms!)) : null; });
  const cs = cardSpaceOf(m);
  const jamMemo = new Map<number, Set<string>>();
  const jamsOf = (c: number): Set<string> => { let j = jamMemo.get(c); if (!j) { j = jammedRooms(m, flags, ref => cs.at(c, ref)); jamMemo.set(c, j); } return j; };
  const jammed = (a: number, o: number, c: number): boolean => { const jams = jamsOf(c); return jams.size > 0 && roomsIn(def, arr.states[a], arr.opts[o].group).some(r => jams.has(r)); };
  const plates = platesFor(m, flags);
  // v0.4 第五章 組被卡住 (DialDef.jams) / 縮影 (miniOnly 只在縮小、人在 mini.room 時；縮小穿不過門)
  const groupJammed = (a: number, o: number): boolean => (def.dial?.jams ?? []).some(j => j.group === arr.opts[o].group && jamActive(j, arr.states[a], () => !flags.has(j.until!)));
  const miniOnly = new Set(def.dial?.miniOnly ?? []);
  const small = (c: number): boolean => !!m.mini?.card && cs.at(c, m.mini.card);
  // 不耗步數的動作可達的 (房, 卡片位置) 組合：穿門 + 拿放尺度卡 (編碼 'room#c'，排序)
  const conf = (room: string, c: number): string => `${room}#${c}`;
  const split = (x: string): [string, number] => { const i = x.lastIndexOf('#'); return [x.slice(0, i), Number(x.slice(i + 1))]; };
  const reach = (a: number, from: readonly string[]): string[] => {
    const ls = links(def, arr.states[a], m.doors, plates);
    const seen = new Set(from);
    const q = [...from];
    while (q.length) {
      const [r, c] = split(q.shift()!);
      const next = [...(small(c) ? [] : areaPairs(m, ls, flags).filter(([fr]) => fr === r).map(([, tr]) => conf(tr, c))), ...cs.moves(c, r, flags).map(c2 => conf(r, c2))];
      for (const x of next) if (!seen.has(x)) { seen.add(x); q.push(x); }
    }
    return [...seen].sort();
  };
  const solved = (a: number, rs: readonly string[]) => p.turn === undefined && rs.some(x => { const [r, c] = split(x); return r === p.room && goalHolds(m, p, arr.states[a], flags, ref => cs.at(c, ref)); });
  // v0.4 第五章 轉成功即完成 (p.turn)：這一步轉的就是那一組、轉的時候人在 p.room (卡片條件成立)
  const solvedBy = (o: number, free: readonly string[]) => p.turn === arr.opts[o].group && free.some(x => { const [r, c] = split(x); return r === p.room && (!p.card || cs.at(c, p.card)); });
  const perDepth = Math.max(1, Math.floor(cap / Math.max(1, budget)));
  const lengths: number[] = [];
  const multisets = new Map<string, number>();
  let sampled = false;
  const start = reach(a0, [conf(room0, card0)]);
  if (solved(a0, start)) return { lengths: [0], multisets: new Map([['', 0]]), sampled: false };
  for (let depth = 1; depth <= budget; depth++) {
    let found = 0;
    const seq: number[] = [];
    const onPath = new Set<string>([`${a0}|${start.join(',')}`]);
    let lastFree: readonly string[] = [];
    const dfs = (a: number, rs: string[]): boolean => {
      if (seq.length === depth) {
        if (!solved(a, rs) && !(seq.length > 0 && solvedBy(seq[seq.length - 1], lastFree))) return true;
        lengths.push(depth);
        const ms = seq.map(o => `${arr.opts[o].group}:${arr.opts[o].dir}`).sort().join(' ');
        if (!multisets.has(ms)) multisets.set(ms, depth);
        found++;
        if (found >= perDepth) { sampled = true; return false; }
        return true;
      }
      if (seq.length > 0 && (solved(a, rs) || solvedBy(seq[seq.length - 1], lastFree))) return true; // 較短就解開了：屬於較淺的層
      for (let o = 0; o < arr.opts.length; o++) {
        if (!usable[o] || groupJammed(a, o)) continue;
        const mo = miniOnly.has(arr.opts[o].group);
        const free = rs.filter(x => !jammed(a, o, split(x)[1]) && (!lockRooms[o] || lockRooms[o]!.has(split(x)[0])) && (!mo || (split(x)[0] === m.mini?.room && (small(split(x)[1]) || !m.mini?.card))));
        if (!free.length) continue;
        const a2 = arr.next[a * arr.opts.length + o];
        if (a2 < 0) continue;
        const rs2 = reach(a2, free);
        const key = `${a2}|${rs2.join(',')}`;
        if (onPath.has(key)) continue;
        onPath.add(key); seq.push(o);
        const prevFree = lastFree;
        lastFree = free;
        const go = dfs(a2, rs2);
        lastFree = prevFree;
        seq.pop(); onPath.delete(key);
        if (!go) return false;
      }
      return true;
    };
    dfs(a0, start);
  }
  return { lengths, multisets, sampled };
}

/** ⑥～⑪：控制盤章節的抽象模型驗證 (純函式、確定性) */
export function validateDial(model: DialModel): DialReport {
  const m = withAreaRooms(model);
  const limit = m.maxStates ?? DEFAULT_MAX_STATES;
  const cap = m.maxSolutions ?? DEFAULT_MAX_SOLUTIONS;
  const issues: string[] = [];
  const empty: DialReport = { states: 0, arrangements: 0, solvable: false, deadlocks: [], needsRestart: 0, perPuzzle: [], budgetBypass: [], lockIssues: [], entryIssues: [], issues };
  const def = m.cube;
  if (def.control !== 'dial' || !def.dial) { issues.push('cube has no dial'); return empty; }
  const ids = new Set(m.puzzles.map(p => p.id));
  for (const p of m.puzzles) for (const q of p.needs) if (!ids.has(q)) issues.push(`puzzle ${p.id} needs unknown ${q}`);
  if (!ids.has(m.finish)) issues.push(`finish ${m.finish} is not a puzzle`);
  const arr = arrangementsOf(def, limit, !!m.mini);
  if (arr.overflow) { issues.push(`arrangements exceed maxStates (${limit}): factor = cube arrangements`); return { ...empty, arrangements: arr.states.length }; }
  const pid = new Map(m.puzzles.map((p, i) => [p.id, i]));
  const budgetOf = (room: string, f: number): number => {
    const r = m.rooms[room];
    if (!r) return 0;
    const cur = Object.keys(r.p4 ?? {}).find(id => { const i = pid.get(id); return i !== undefined && (f & (1 << i)) === 0; });
    return cur ? r.p4![cur] : r.budget;
  };
  const g = dialGraph(m, arr, budgetOf, new Set(), limit);
  if (g.overflow) {
    const P = m.puzzles.length;
    issues.push(`abstract states exceed maxStates (${limit}): arrangements ${arr.states.length} × rooms ${Object.keys(m.rooms).length} × flag sets ${1 << P} × dial 2 × ink`);
    return { ...empty, states: g.states, arrangements: g.arrangements.size };
  }
  for (const id of g.early) issues.push(`puzzle ${id} can be done before its needs`);
  const good = canFinish(g);
  const solvable = good[0] === 1;
  const deadlocks: string[] = [];
  let needsRestart = 0;
  for (let i = 0; i < g.states; i++) {
    if (good[i]) continue;
    needsRestart++;
    if (g.entry[i] && deadlocks.length < 20) deadlocks.push(String(g.order[i]));
  }
  let deadCount = 0;
  for (let i = 0; i < g.states; i++) if (!good[i] && g.entry[i]) deadCount++;
  if (deadCount > deadlocks.length) issues.push(`${deadCount} entry snapshots cannot finish (listed 20)`);

  // ⑦ 多解：每題從「前置剛湊齊」的第一個可達狀態出發 (BFS 順序)
  const rooms = Object.keys(m.rooms);
  const R = rooms.length;
  const F = 1 << m.puzzles.length;
  const maxInk = Math.max(0, ...rooms.map(r => Math.max(m.rooms[r].budget, ...Object.values(m.rooms[r].p4 ?? {}))));
  const K = maxInk + 1;
  const C = cardSpaceOf(m).size;
  const dec = (x: number) => { const k = x % K; x = (x - k) / K; const d = x % 2; x = (x - d) / 2; const c = x % C; x = (x - c) / C; const f = x % F; x = (x - f) / F; const r = x % R; return { a: (x - r) / R, r, f, d, k, c }; };
  const perPuzzle: DialPuzzleReport[] = m.puzzles.map((p, i) => {
    const needMask = p.needs.reduce((acc, q) => acc | (1 << (pid.get(q) ?? 0)), 0);
    const startIdx = g.order.findIndex(x => { const s = dec(x); return s.d === 1 && (s.f & needMask) === needMask && (s.f & (1 << i)) === 0; });
    const roomCfg = m.rooms[p.room];
    const budget = p.span ?? roomCfg?.p4?.[p.id] ?? roomCfg?.budget ?? 0;
    const out: DialPuzzleReport = { id: p.id, shortest: null, second: null, solutions: 0, distinct: 0, sampled: false, budget, issues: [] };
    if (startIdx < 0) { out.issues.push('never available (needs unreachable with dial on)'); return out; }
    const s = dec(g.order[startIdx]);
    const flags = new Set(m.puzzles.filter((_, j) => s.f & (1 << j)).map(q => q.id));
    const e = enumerate(m, arr, p, s.a, rooms[s.r], s.c, flags, budget, cap);
    out.solutions = e.lengths.length;
    out.distinct = e.multisets.size;
    out.sampled = e.sampled;
    if (e.lengths.length) {
      const sorted = [...e.multisets.entries()].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
      out.shortest = sorted[0][1];
      out.second = sorted.length > 1 ? sorted[1][1] : null;
    }
    if (out.shortest === null) out.issues.push('no solution within budget');
    else if (out.shortest === budget && budget > 0) out.issues.push('no slack (shortest = budget)');
    if (!p.teaching && out.shortest !== null && out.distinct < 2) out.issues.push('unique solution (D16: non-teaching puzzles need >= 2 distinct)');
    if (p.excluded && p.excluded.minSteps <= budget) out.issues.push(`excluded strategy "${p.excluded.name}" fits in budget`);
    return out;
  });

  // ⑥ 預算繞過：P4 題所在房每次進房只給 (最短 − 1) 滴仍能完成 → 可換房補墨繞過
  const budgetBypass: string[] = [];
  for (const [room, cfg] of Object.entries(m.rooms)) {
    for (const id of Object.keys(cfg.p4 ?? {})) {
      const rep = perPuzzle.find(r => r.id === id);
      const i = pid.get(id);
      if (!rep || rep.shortest === null || i === undefined || rep.shortest < 1) continue;
      const tight = (r: string, f: number) => (r === room && (f & (1 << i)) === 0 ? rep.shortest! - 1 : budgetOf(r, f));
      const v = dialGraph(m, arr, tight, new Set(), limit);
      if (v.flagsReached & (1 << i)) budgetBypass.push(`${id}: doable with < ${rep.shortest} turns per visit to ${room} (refill by changing rooms)`);
    }
  }

  // ⑨ 鎖扣：每個鎖在「它一直鎖著」的子模型中，解開條件仍可達；鎖之間的等待圖無環
  const lockIssues: string[] = [];
  const locks = def.dial.locks;
  const lockGroups = [...new Set(locks.map(l => l.group))];
  const waits = new Map<string, Set<string>>();
  for (const l of locks) {
    if (!pid.has(l.until)) { lockIssues.push(`lock ${l.group}: condition ${l.until} is not a puzzle in the model`); continue; }
    const i = pid.get(l.until)!;
    const w = new Set<string>();
    for (const other of lockGroups) {
      const v = dialGraph(m, arr, budgetOf, new Set([other]), limit);
      if (!(v.flagsReached & (1 << i))) w.add(other);
    }
    waits.set(l.group, w);
    if (w.has(l.group)) lockIssues.push(`lock ${l.group}: ${l.until} unreachable while ${l.group} stays locked`);
  }
  const seen = new Set<string>();
  for (const [a, ws] of waits) for (const b of ws) {
    if (a === b || !waits.get(b)?.has(a)) continue;
    const key = [a, b].sort().join(' <-> ');
    if (!seen.has(key)) { seen.add(key); lockIssues.push(`locks wait on each other: ${key}`); }
  }

  // ⑩ 魔方儀入口：從入口房不轉動、只穿門走得到
  const entryIssues: string[] = [];
  const walkable = new Set([m.start]);
  const q = [m.start];
  const ls = areaPairs(m, links(def, arr.states[0], m.doors), new Set());
  while (q.length) { const r = q.shift()!; for (const [fr, tr] of ls) if (fr === r && !walkable.has(tr)) { walkable.add(tr); q.push(tr); } }
  if (!walkable.has(def.dial.entry.room)) entryIssues.push(`dial room ${def.dial.entry.room} is not reachable from ${m.start} without turning`);

  return { states: g.states, arrangements: g.arrangements.size, solvable, deadlocks, needsRestart, perPuzzle, budgetBypass, lockIssues, entryIssues, issues };
}

/** 由內容組出控制盤章節的抽象模型 (門位 = 各房 cubeDoor、預算 = LevelDef.turnBudget) */
export function dialModelOf(cube: CubeDef, rooms: Readonly<Record<string, LevelDef>>, puzzles: readonly DialPuzzle[], start: string, finish: string, extra: Pick<DialModel, 'plates' | 'jams' | 'cards' | 'areas' | 'doorLocks' | 'mini'> = {}): DialModel {
  const budgets: Record<string, { budget: number; p4?: Readonly<Record<string, number>> }> = {};
  for (const [id, lv] of Object.entries(rooms)) budgets[id] = { budget: lv.turnBudget?.base ?? 0, ...(lv.turnBudget?.puzzles ? { p4: lv.turnBudget.puzzles } : {}) };
  // 區 (areas) 的預算 = 所在房的基礎預算 (validateDial 也會自動補)
  for (const a of extra.areas ?? []) if (!(a.id in budgets) && budgets[a.room]) budgets[a.id] = { budget: budgets[a.room].budget };
  // 封住的門 (cubeDoor.sealed)：沒另給 doorLocks 時由關卡資料組出
  const doorLocks: DialDoorLock[] = [];
  for (const [id, lv] of Object.entries(rooms)) for (const o of lv.objects) if (o.type === 'cubeDoor' && o.sealed) doorLocks.push({ room: id, door: o.id, until: o.sealed.until, ...(o.sealed.both ? { both: true } : {}) });
  return { cube, doors: chapterDoors(rooms), start, rooms: budgets, puzzles, finish, ...(doorLocks.length ? { doorLocks } : {}), ...extra };
}
