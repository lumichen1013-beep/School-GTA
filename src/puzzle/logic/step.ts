import type { InputState, World } from './types';
import { GRAVITY, JUMP_V_2D, JUMP_V_3D, SPEED, PLAYER_HW } from './constants';
import { clamp, playerBox, solidsFor, sweepAxis } from './geometry';
import { pushCrate } from './push';
import { updatePlates } from './mechanisms';
import { respawn, updateCheckpoint } from './world';

export const MSG_FELL = '你掉進了縫隙裡……醒來時，又回到了熟悉的地方。';

function moveAxis(w: World, axis: 0 | 2, delta: number): void {
  const p = w.player;
  let remaining = delta;
  for (let i = 0; i < 3 && Math.abs(remaining) > 1e-6; i++) {
    const { allowed, hit } = sweepAxis(playerBox(p), axis, remaining, solidsFor(w, p.mode), p.mode);
    if (axis === 0) p.x += allowed; else p.z += allowed;
    remaining -= allowed;
    if (!hit) return;
    // 3D 走進木箱即推；2D 不能推
    if (p.mode !== '3d' || !hit.def.pushable) return;
    const pushed = pushCrate(w, hit, axis, remaining);
    if (pushed === 0) return;
    if (axis === 0) p.x += pushed; else p.z += pushed;
    remaining -= pushed;
  }
}

/** 推進一個固定時間步；input 為已解析的移動意圖 (moveX/moveZ ∈ [-1,1]，moveZ 向 +z 為正) */
export function stepWorld(w: World, input: InputState, dt: number): void {
  if (w.cleared) return;
  const p = w.player;
  w.time += dt;
  let mx = input.moveX;
  let mz = p.mode === '3d' ? input.moveZ : 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (len > 0.01) p.facing = Math.atan2(mx, mz);

  moveAxis(w, 0, mx * SPEED * dt);
  if (p.mode === '3d') moveAxis(w, 2, mz * SPEED * dt);

  if (input.jump && p.onGround) {
    p.vy = p.mode === '2d' ? JUMP_V_2D : JUMP_V_3D;
    p.onGround = false;
  }
  p.vy = Math.max(p.vy - GRAVITY * dt, -40);
  const dy = p.vy * dt;
  const { allowed, hit } = sweepAxis(playerBox(p), 1, dy, solidsFor(w, p.mode), p.mode);
  p.y += allowed;
  if (hit) { if (dy < 0) p.onGround = true; p.vy = 0; } else if (dy < 0) p.onGround = false;

  const b = w.level.bounds;
  p.x = clamp(p.x, b.minX + PLAYER_HW, b.maxX - PLAYER_HW);
  if (p.mode === '3d') p.z = clamp(p.z, b.minZ + PLAYER_HW, b.maxZ - PLAYER_HW);

  updatePlates(w);
  updateCheckpoint(w);
  if (p.y < w.level.voidY) respawn(w, MSG_FELL);
}
