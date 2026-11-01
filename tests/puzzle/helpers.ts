import { foyer } from '../../src/puzzle/levels/foyer';
import { createWorld } from '../../src/puzzle/logic/world';
import { stepWorld } from '../../src/puzzle/logic/step';
import type { InputState, LevelDef, World } from '../../src/puzzle/logic/types';

export const DT = 1 / 60;
export const newWorld = (level: LevelDef = foyer): World => createWorld(level);

export function run(w: World, input: Partial<InputState>, seconds: number, each?: () => void): void {
  const inp: InputState = { moveX: 0, moveZ: 0, jump: false, ...input };
  for (let t = 0; t < seconds; t += DT) { stepWorld(w, inp, DT); each?.(); }
}

/** 簡易控制器：朝目標走，直到進入容差 (3D 先 z 後 x 或相反) */
export function walkTo(w: World, tx: number | null, tz: number | null, opts: { zFirst?: boolean; tol?: number; max?: number } = {}): void {
  const tol = opts.tol ?? 0.03;
  const axes = opts.zFirst ? ['z', 'x'] : ['x', 'z'];
  for (const ax of axes) {
    const target = ax === 'x' ? tx : tz;
    if (target === null) continue;
    for (let i = 0; i < (opts.max ?? 1200); i++) {
      const cur = ax === 'x' ? w.player.x : w.player.z;
      const diff = target - cur;
      if (Math.abs(diff) <= tol) break;
      const dir = Math.sign(diff) * Math.min(1, Math.abs(diff) / (3.2 * DT) + 0.01);
      stepWorld(w, ax === 'x' ? { moveX: dir, moveZ: 0, jump: false } : { moveX: 0, moveZ: dir, jump: false }, DT);
    }
  }
}
