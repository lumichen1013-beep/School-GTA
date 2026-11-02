import { describe, it, expect } from 'vitest';
import { newWorld, place } from '../helpers';
import { trySwitchMode } from '../../../src/puzzle/core/switchMode';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import type { LevelDef, ObjDef } from '../../../src/puzzle/core/types';

const solid = (id: string, x: number, z: number, w: number, d: number, visible: ObjDef['visible']): ObjDef =>
  ({ id, type: 'wall', x, y: -2, z, w, h: 10, d, visible, solid: true });
const tight = (objects: ObjDef[]): LevelDef => ({ ...foyer, bounds: { minX: -8, maxX: 8, minZ: -5, maxZ: 5 }, objects });

describe('切換：z3d 記錄與還原 (H10)', () => {
  it('3D→2D 成功時記下切換前的 z', () => {
    const w = newWorld();
    place(w, 3, 0, -2.5);
    w.player.z3d = 4;
    expect(trySwitchMode(w).ok).toBe(true);
    expect(w.player.z3d).toBe(-2.5);
  });

  it('3D→2D 切換失敗時 z3d 還原為切換前的值，位置與模式不變', () => {
    const w = newWorld(tight([solid('big', 0, 8, 40, 2, 'both')]));
    w.player.x = 0; w.player.y = 0; w.player.z = 1.5; w.player.z3d = -3;
    expect(trySwitchMode(w).ok).toBe(false);
    expect(w.player.z3d).toBe(-3);
    expect([w.player.x, w.player.y, w.player.z]).toEqual([0, 0, 1.5]);
    expect(w.player.mode).toBe('3d');
  });

  it('2D→3D 切換失敗時 z3d 不變、仍在 2D', () => {
    const w = newWorld(tight([solid('wall3d', 0, 0, 40, 40, '3d')]));
    w.player.mode = '2d'; w.player.x = 0; w.player.y = 0; w.player.z = 0; w.player.z3d = 2.25;
    expect(trySwitchMode(w).ok).toBe(false);
    expect(w.player.z3d).toBe(2.25);
    expect([w.player.x, w.player.z]).toEqual([0, 0]);
    expect(w.player.mode).toBe('2d');
  });
});
