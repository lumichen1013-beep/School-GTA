import { foyer } from '../../src/puzzle/levels/foyer';
import { createWorld } from '../../src/puzzle/logic/world';
import { stepWorld } from '../../src/puzzle/logic/step';
import type { InputState, LevelDef, Mode, World } from '../../src/puzzle/logic/types';

export const DT = 1 / 60;
export const newWorld = (level: LevelDef = foyer): World => createWorld(level);

export function run(w: World, input: Partial<InputState>, seconds: number, each?: () => void): void {
  const inp: InputState = { moveX: 0, moveZ: 0, jump: false, ...input };
  for (let t = 0; t < seconds; t += DT) { stepWorld(w, inp, DT); each?.(); }
}

/** 直接把玩家放到某處並落地 (測試用) */
export function place(w: World, x: number, y: number, z: number, mode: Mode = '3d'): void {
  const p = w.player;
  p.mode = mode; p.x = x; p.y = y; p.z = mode === '2d' ? 0 : z; p.z3d = z; p.vy = 0;
  stepWorld(w, { moveX: 0, moveZ: 0, jump: false }, DT);
}

/** 簡易控制器：朝目標走，直到進入容差 (3D 先 x 後 z 或相反) */
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
  run(w, {}, 0.1); // 站穩
}

/** 持續按住方向 + 跳，直到條件成立或逾時；回傳是否成立 */
export function hopUntil(w: World, moveX: number, done: () => boolean, seconds = 10): boolean {
  for (let t = 0; t < seconds; t += DT) {
    if (done()) return true;
    stepWorld(w, { moveX, moveZ: 0, jump: true }, DT);
  }
  return done();
}
