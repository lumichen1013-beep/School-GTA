// 捷徑掃描器 (devtools，純函式)：規格 M1「每個可推物網格取樣 × 兩模式，斷言關鍵旗標不成立」
// 是取樣器而非求解器：只能證明「取樣到的配置 × 探針」沒有捷徑 (架構 4.12、T12)
import type { LevelDef, Mode, ObjId, TextKey, TextParams, World } from '../core/types';
import type { Mechanic } from '../core/registry';
import { createWorld, hasItem } from '../core/world';
import { boxAt, objBox, overlaps } from '../core/geometry';
import { solidsFor } from '../core/presence';
import { type Cmd, runScript } from './runScript';

/** 旗標：'item:<id>' 持有物品、'used:<objId>' 物件已觸發、'gone:<objId>' 物件已消失、'cleared' 通關；或自訂判斷式 */
export type FlagSpec = string | { id: string; holds: (w: World) => boolean };

export interface ScanSpec {
  level: LevelDef;
  mechanics: readonly Mechanic[];
  text?: (key: TextKey, params?: TextParams) => string;
  /** 每個取樣開始前 (建立世界後、擺放前) 推進狀態，例如先給筆尖 */
  setup?: (w: World) => void;
  /** 可推物取樣格；多個可推物時取笛卡兒積 */
  movable: ReadonlyArray<{ id: ObjId; xs: readonly number[]; zs: readonly number[] }>;
  /** 玩家起始取樣點 (2D 時忽略 z，z 仍作為 z3d)；on = 站在該可推物取樣位置的頂面 (dx / dz 為相對偏移) */
  playerAt: ReadonlyArray<PlayerAt>;
  /** 模式 (預設兩模式都掃) */
  modes?: readonly Mode[];
  /** 每個取樣點要嘗試的短操作 */
  probes: ReadonlyArray<readonly Cmd[]>;
  /** 不得成立的旗標 (逐幀檢查) */
  forbidden: readonly FlagSpec[];
}

export type PlayerAt = { x: number; y: number; z: number } | { on: ObjId; dx?: number; dz?: number };

export interface ScanHit { sample: string; probe: number; flag: string }
export interface ScanReport {
  hits: ScanHit[];
  /** 實際跑過的 (配置 × 玩家點 × 模式 × 探針) 數 */
  runs: number;
  /** 不合法而略過的配置 (可推物與實體重疊、玩家起點被擋) */
  skipped: number;
}

/** 把旗標字串解析成判斷式；未知格式拋錯 (避免打錯字讓掃描恆過) */
export function resolveFlag(f: FlagSpec): { id: string; holds: (w: World) => boolean } {
  if (typeof f !== 'string') return f;
  if (f === 'cleared') return { id: f, holds: w => w.cleared };
  const m = /^(item|used|gone):(.+)$/.exec(f);
  if (!m) throw new Error(`unknown flag "${f}"`);
  const [, kind, arg] = m;
  if (kind === 'item') return { id: f, holds: w => hasItem(w, arg) };
  const get = (w: World) => {
    const o = w.byId.get(arg);
    if (!o) throw new Error(`flag "${f}": no object "${arg}"`);
    return o;
  };
  return kind === 'used' ? { id: f, holds: w => get(w).used } : { id: f, holds: w => get(w).gone };
}

function product<T>(lists: readonly (readonly T[])[]): T[][] {
  return lists.reduce<T[][]>((acc, l) => acc.flatMap(a => l.map(v => [...a, v])), [[]]);
}

/** 執行掃描；hits 為空 = 取樣範圍內沒有捷徑 */
export function scanShortcuts(spec: ScanSpec): ScanReport {
  const flags = spec.forbidden.map(resolveFlag);
  const modes = spec.modes ?? (['3d', '2d'] as const);
  const cells = product(spec.movable.map(m => product([m.xs, m.zs]).map(([x, z]) => ({ id: m.id, x, z }))));
  const report: ScanReport = { hits: [], runs: 0, skipped: 0 };
  const fresh = (): World => {
    const w = createWorld(spec.level, { mechanics: spec.mechanics, text: spec.text });
    spec.setup?.(w);
    return w;
  };

  for (const cell of cells) {
    const tag = cell.map(c => `${c.id}@(${c.x},${c.z})`).join(' ');
    // 可推物重疊其他 3D 實體 = 不可能的配置
    const probe = fresh();
    for (const c of cell) { const o = probe.byId.get(c.id)!; o.x = c.x; o.z = c.z; }
    const solids3d = solidsFor(probe, '3d');
    if (cell.some(c => solids3d.some(s => s.def.id !== c.id && overlaps(objBox(probe.byId.get(c.id)!), objBox(s), '3d')))) {
      report.skipped++;
      continue;
    }
    for (const pa of spec.playerAt) {
      const at = playerPoint(probe, pa);
      for (const mode of modes) {
        const sample = `${tag} player@(${at.x},${at.y},${at.z}) ${mode}`;
        spec.probes.forEach((cmds, pi) => {
          const w = fresh();
          for (const c of cell) { const o = w.byId.get(c.id)!; o.x = c.x; o.z = c.z; }
          const p = w.player;
          p.mode = mode; p.x = at.x; p.y = at.y; p.z = mode === '2d' ? 0 : at.z; p.z3d = at.z; p.vy = 0;
          if (overlapsAny(w, mode)) { report.skipped++; return; }
          report.runs++;
          const seen = new Set<string>();
          const check = (ww: World): void => {
            for (const f of flags) if (!seen.has(f.id) && f.holds(ww)) { seen.add(f.id); report.hits.push({ sample, probe: pi, flag: f.id }); }
          };
          check(w);
          runScript(w, [{ place: [at.x, at.y, at.z], mode }, ...cmds], { onFrame: check });
        });
      }
    }
  }
  return report;
}

/** 取樣點的絕對座標 (on：可推物已擺到取樣位置的世界) */
function playerPoint(w: World, pa: PlayerAt): { x: number; y: number; z: number } {
  if (!('on' in pa)) return pa;
  const o = w.byId.get(pa.on);
  if (!o) throw new Error(`playerAt.on: no object "${pa.on}"`);
  return { x: o.x + (pa.dx ?? 0), y: o.y + o.def.h, z: o.z + (pa.dz ?? 0) };
}

/** 玩家起點與目前模式的實體重疊 */
function overlapsAny(w: World, mode: Mode): boolean {
  const p = w.player;
  const pb = boxAt(p.x, p.y, p.z);
  return solidsFor(w, mode).some(s => overlaps(pb, objBox(s), mode));
}
