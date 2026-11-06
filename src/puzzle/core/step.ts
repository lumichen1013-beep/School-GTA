import type { InputState, World } from './types';
import type { ActionFrame, WorldAction } from './actions';
import { ACTION_ORDER } from './actions';
import { GRAVITY, SPEED, PLAYER_HW } from './constants';
import { clamp, playerBox, sweepAxis } from './geometry';
import { MODES } from './modes';
import { solidsFor } from './presence';
import { pushCrate, resetCrates } from './push';
import { trySwitchMode } from './switchMode';
import { interact } from './interact';
import { respawn, updateCheckpoint } from './world';

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

/** 核心動作 (F/Q 切換、T 歸位、E 互動) */
const CORE_ACTIONS: Readonly<Record<WorldAction, (w: World) => void>> = {
  flip: w => {
    const ok = trySwitchMode(w).ok;
    w.events.push(ok ? { t: 'switch', to: w.player.mode } : { t: 'switchDenied' });
  },
  reset: resetCrates,
  interact
};

/** 推進一個固定時間步：先依 ACTION_ORDER 處理本幀動作，再交指令給機制 (第一個處理的為準)，再跑物理 */
export function step(w: World, f: ActionFrame, dt: number): void {
  if (w.cleared) return;
  for (const a of ACTION_ORDER) if (f.pressed.includes(a)) CORE_ACTIONS[a](w);
  for (const c of f.commands ?? []) w.rt.mechanics.command.some(m => m.command!(w, c));
  stepWorld(w, f, dt);
}

/** 物理步進 (相容包裝：不含動作)；input 為已解析的移動意圖 (moveX/moveZ ∈ [-1,1]，moveZ 向 +z 為正) */
export function stepWorld(w: World, input: InputState, dt: number): void {
  if (w.cleared) return;
  const p = w.player;
  const spec = MODES[p.mode];
  w.time += dt;
  for (const m of w.rt.mechanics.beforePhysics) m.beforePhysics!(w, dt);
  let mx = input.moveX;
  let mz = spec.moveZ ? input.moveZ : 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (len > 0.01) p.facing = Math.atan2(mx, mz);

  moveAxis(w, 0, mx * SPEED * dt);
  if (spec.moveZ) moveAxis(w, 2, mz * SPEED * dt);

  if (input.jump && p.onGround) {
    // v0.4 第五章 縮小時跳躍照比例 (跳高 ∝ v²：速度 × √倍率)
    p.vy = spec.jumpV * Math.sqrt(p.scale ?? 1);
    p.onGround = false;
  }
  p.vy = Math.max(p.vy - GRAVITY * dt, -40);
  const dy = p.vy * dt;
  const { allowed, hit } = sweepAxis(playerBox(p), 1, dy, solidsFor(w, p.mode), p.mode);
  p.y += allowed;
  if (hit) { if (dy < 0) p.onGround = true; p.vy = 0; } else if (dy < 0) p.onGround = false;

  const b = w.level.bounds;
  const hw = PLAYER_HW * (p.scale ?? 1);
  p.x = clamp(p.x, b.minX + hw, b.maxX - hw);
  if (spec.boundsZ) p.z = clamp(p.z, b.minZ + hw, b.maxZ - hw);

  for (const m of w.rt.mechanics.afterPhysics) m.afterPhysics!(w, dt);
  updateCheckpoint(w);
  if (p.y < w.level.voidY) respawn(w, 'msg.fell');
}
