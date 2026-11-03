// 章節抽象模型驗證 (v0.3；規格 5.4.8、architecture 6.6)：廣度優先搜尋所有可達狀態。
// 檢查：① 有解 ② 任一可達狀態都能到終點 (卡死 = 0) ③ 最短解的轉動次數 ④ 拿掉任一必要步驟就無解 (捷徑檢查)。純函式
import { applyOp, cubeKey, initialCube, isBlocked, links, type CubeDef, type CubeState, type DoorInfo } from '../core/cube';
import { leverOp } from '../mechanics/cube';
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
