// 通關腳本回放器 (devtools，純函式)：以 ActionFrame 序列驅動 core/step (固定步長 1/60)
// 不 import three / DOM；只供測試與開發使用 (正式入口不 import 本檔)
import type { ActionFrame, WorldAction } from '../core/actions';
import type { Mode, World } from '../core/types';
import { step } from '../core/step';

export const SCRIPT_DT = 1 / 60;

/** 一幀的輸入 (省略欄位 = 不動、不跳、無動作) */
export type FrameInput = Partial<ActionFrame>;

export const frame = (f: FrameInput = {}): ActionFrame => ({ moveX: 0, moveZ: 0, jump: false, pressed: [], ...f });

/** 每幀推進後的回呼 (捷徑掃描用來逐幀檢查旗標) */
export type FrameHook = (w: World, f: ActionFrame) => void;

export interface Driver {
  readonly w: World;
  readonly dt: number;
  /** 推進一幀 */
  tick(f: ActionFrame): void;
}

export function driver(w: World, opts: { dt?: number; onFrame?: FrameHook; record?: ActionFrame[] } = {}): Driver {
  const dt = opts.dt ?? SCRIPT_DT;
  return {
    w, dt,
    tick(f) {
      opts.record?.push(f);
      step(w, f, dt);
      opts.onFrame?.(w, f);
    }
  };
}

// ── 基本操作 (tests/puzzle/helpers.ts 的 run / place / walkTo / hopUntil 以此為實作；迴圈與步數與原 helpers 相同) ──

/** 以固定輸入持續 seconds 秒；each 於每幀之後呼叫 */
export function hold(d: Driver, input: FrameInput, seconds: number, each?: () => void): void {
  const f = frame(input);
  for (let t = 0; t < seconds; t += d.dt) { d.tick(f); each?.(); }
}

/** 直接把玩家放到某處並推進一幀落地 (測試 / 掃描用的瞬移) */
export function placePlayer(d: Driver, x: number, y: number, z: number, mode: Mode = '3d'): void {
  const p = d.w.player;
  p.mode = mode; p.x = x; p.y = y; p.z = mode === '2d' ? 0 : z; p.z3d = z; p.vy = 0;
  d.tick(frame());
}

export interface WalkOpts { zFirst?: boolean; tol?: number; max?: number }

/** 簡易控制器：朝目標走，直到進入容差 (3D 先 x 後 z 或相反)；最後站穩 0.1 秒 */
export function walk(d: Driver, tx: number | null, tz: number | null, opts: WalkOpts = {}): void {
  const w = d.w;
  const tol = opts.tol ?? 0.03;
  const axes = opts.zFirst ? ['z', 'x'] : ['x', 'z'];
  for (const ax of axes) {
    const target = ax === 'x' ? tx : tz;
    if (target === null) continue;
    for (let i = 0; i < (opts.max ?? 1200); i++) {
      const cur = ax === 'x' ? w.player.x : w.player.z;
      const diff = target - cur;
      if (Math.abs(diff) <= tol) break;
      const dir = Math.sign(diff) * Math.min(1, Math.abs(diff) / (3.2 * d.dt) + 0.01);
      d.tick(frame(ax === 'x' ? { moveX: dir } : { moveZ: dir }));
    }
  }
  hold(d, {}, 0.1); // 站穩
}

/** 持續按住方向 + 跳，直到條件成立或逾時；回傳是否成立 */
export function hop(d: Driver, moveX: number, done: () => boolean, seconds = 10): boolean {
  for (let t = 0; t < seconds; t += d.dt) {
    if (done()) return true;
    d.tick(frame({ moveX, jump: true }));
  }
  return done();
}

/** 單次動作 (切換 / 歸位 / 互動)：一幀內先處理動作再跑物理，與遊戲主迴圈相同 */
export function act(d: Driver, a: WorldAction): void {
  d.tick(frame({ pressed: [a] }));
}

// ── 腳本 ──

/** 腳本指令 (架構 4.12)；label 用於失敗訊息 */
export type Cmd =
  | { walkTo: [number | null, number | null]; zFirst?: boolean; tol?: number; label?: string }
  | { hop: number; until: (w: World) => boolean; seconds?: number; label?: string; /** 逾時不算失敗 (捷徑掃描的探針) */ optional?: boolean }
  | { hold: FrameInput; seconds: number }
  | { act: WorldAction }
  | { wait: number }
  | { place: [number, number, number]; mode?: Mode }
  | { expect: (w: World) => void; label?: string };

export interface ScriptOpts { dt?: number; onFrame?: FrameHook; record?: ActionFrame[] }

/** 腳本中某一步失敗 (含指令索引與 label) */
export class ScriptError extends Error {
  constructor(readonly index: number, readonly label: string, cause: unknown) {
    super(`script step #${index}${label ? ` (${label})` : ''}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** 依序執行指令；expect 失敗或 hop 逾時 → ScriptError；回傳推進的幀數 */
export function runScript(w: World, cmds: readonly Cmd[], opts: ScriptOpts = {}): number {
  let frames = 0;
  const onFrame: FrameHook = (ww, f) => { frames++; opts.onFrame?.(ww, f); };
  const d = driver(w, { dt: opts.dt, onFrame, record: opts.record });
  cmds.forEach((c, i) => {
    const label = 'label' in c ? c.label ?? '' : '';
    try {
      if ('walkTo' in c) walk(d, c.walkTo[0], c.walkTo[1], { zFirst: c.zFirst, tol: c.tol });
      else if ('hop' in c) { if (!hop(d, c.hop, () => c.until(w), c.seconds) && !c.optional) throw new Error('hop condition not reached'); }
      else if ('hold' in c) hold(d, c.hold, c.seconds);
      else if ('act' in c) act(d, c.act);
      else if ('wait' in c) hold(d, {}, c.wait);
      else if ('place' in c) placePlayer(d, c.place[0], c.place[1], c.place[2], c.mode);
      else c.expect(w);
    } catch (e) {
      throw e instanceof ScriptError ? e : new ScriptError(i, label, e);
    }
  });
  return frames;
}

/** 回放錄下的 ActionFrame 序列 (確定性：同一世界初值 + 同一序列 → 同一結果) */
export function playFrames(w: World, frames: Iterable<ActionFrame>, dt = SCRIPT_DT): void {
  for (const f of frames) step(w, f, dt);
}
