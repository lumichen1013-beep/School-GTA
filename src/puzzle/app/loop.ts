import type { Mode, World } from '../core/types';
import type { WorldAction } from '../core/actions';
import { step } from '../core/step';
import type { Transition } from '../render/transitions';

/** 固定步長 (與測試 DT 相同；決策 Q4) */
export const FIXED_DT = 1 / 60;
/** 單幀最多計入的時間 (沿用舊主迴圈的 1/20 秒上限，分頁切回時不會一次跑太多步) */
export const MAX_FRAME_SEC = 1 / 20;

export interface LoopInput { moveX: number; moveZ: number; jump: boolean; pressed: readonly WorldAction[] }
export interface PlayerPose { x: number; y: number; z: number; mode: Mode }

export interface LoopHooks {
  /** 過場進行到換畫面點 (或沒有過場時切換成功當下)：換渲染模式與鏡頭 */
  onSwap?(): void;
  /** 世界首次通關 */
  onCleared?(): void;
}

/**
 * 關卡主迴圈 (不碰 DOM)：每幀累加真實時間，以固定步長呼叫 step；
 * 本幀新按下的動作只送進下一個固定步；切換成功 → 過場鎖期間不推進世界、丟棄按鍵 (沿用舊 game.ts 語意)。
 */
export class LevelLoop {
  private acc = 0;
  private pending: WorldAction[] = [];
  private locked = false;
  private clearedFired = false;
  /** 最後一個固定步之前的玩家位置 (渲染內插用) */
  readonly prev: PlayerPose;

  constructor(readonly world: World, private transition: Transition | null, private hooks: LoopHooks = {}) {
    const p = world.player;
    this.prev = { x: p.x, y: p.y, z: p.z, mode: p.mode };
  }

  get isLocked(): boolean { return this.locked; }
  /** 距離下一個固定步的進度 (0～1)，供渲染在 prev 與目前位置之間內插 */
  get alpha(): number { return this.acc / FIXED_DT; }

  /** 推進一幀；回傳本幀執行的固定步數 */
  frame(elapsedSec: number, input: LoopInput): number {
    for (const a of input.pressed) if (!this.pending.includes(a)) this.pending.push(a);
    this.acc += Math.min(Math.max(elapsedSec, 0), MAX_FRAME_SEC);
    let n = 0;
    while (this.acc >= FIXED_DT - 1e-9) {
      this.acc = Math.max(this.acc - FIXED_DT, 0);
      n++;
      this.tick(input);
    }
    return n;
  }

  private tick(input: LoopInput): void {
    const w = this.world;
    const p = w.player;
    Object.assign(this.prev, { x: p.x, y: p.y, z: p.z, mode: p.mode });
    if (w.cleared) { this.pending = []; return; }
    if (this.locked) {
      const r = this.transition!.tick(FIXED_DT);
      if (r.swapNow) this.hooks.onSwap?.();
      if (r.done) this.locked = false;
      this.pending = [];
      return;
    }
    const pressed = this.pending;
    this.pending = [];
    step(w, { moveX: input.moveX, moveZ: input.moveZ, jump: input.jump, pressed }, FIXED_DT);
    for (const e of w.events.splice(0)) {
      if (e.t !== 'switch') continue;
      if (this.transition) { this.transition.start(e.to); this.locked = true; } else this.hooks.onSwap?.();
    }
    if (w.cleared && !this.clearedFired) { this.clearedFired = true; this.hooks.onCleared?.(); }
  }
}
