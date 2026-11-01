import { describe, it, expect } from 'vitest';
import { newWorld, run, walkTo, place, DT } from './helpers';
import { stepWorld, MSG_FELL } from '../../src/puzzle/logic/step';
import { trySwitchMode } from '../../src/puzzle/logic/switchMode';
import { findTarget, interact, MSG_GATE } from '../../src/puzzle/logic/interact';
import { pushCrate } from '../../src/puzzle/logic/push';
import { resetCrates, MSG_CRATE_RESET } from '../../src/puzzle/logic/mechanisms';
import { objBox, overlapsXZ, playerBox, solidsFor, supportsOf } from '../../src/puzzle/logic/geometry';
import { foyer } from '../../src/puzzle/levels/foyer';
import type { LevelDef, ObjDef, World } from '../../src/puzzle/logic/types';

const crateOf = (w: World) => w.byId.get('crate')!;

describe('關卡資料', () => {
  it('房間尺寸與物件 id 唯一', () => {
    const b = foyer.bounds;
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(36);
    expect(b.maxZ - b.minZ).toBeGreaterThanOrEqual(12);
    const ids = foyer.objects.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(foyer.objects.find(o => o.type === 'plate')?.opens).toBe('gate');
  });

  it('起點與檢查點在兩種模式下都站得住、不與實體重疊', () => {
    for (const s of [foyer.start, ...(foyer.checkpoints ?? [])]) {
      for (const mode of ['3d', '2d'] as const) {
        const w = newWorld();
        place(w, s.x, s.y, s.z, mode);
        expect(w.player.onGround).toBe(true);
        expect(w.player.y).toBeCloseTo(0, 3);
      }
    }
  });
});

describe('壓平碰撞：缺口與書架', () => {
  it('2D 下書架與地板同一平面，可走過缺口', () => {
    const w = newWorld();
    walkTo(w, -10.3, null);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(w.player.mode).toBe('2d');
    run(w, { moveX: 1 }, 2.2, () => expect(w.player.y).toBeGreaterThan(-0.01));
    expect(w.player.x).toBeGreaterThan(-6);
    expect(w.player.y).toBeCloseTo(0, 3);
  });

  it('3D 無法踏上書架 (木欄擋住)', () => {
    const w = newWorld();
    walkTo(w, -12, -5.5, { zFirst: true });
    run(w, { moveX: 1 }, 3);
    expect(w.player.x).toBeLessThan(-11.1 - 0.3 + 1e-3);
  });

  it('已知問題 (a)：在書架中段切回 3D，不會落在木欄圍住的書架上，而是最近的地板', () => {
    for (const x of [-9.5, -8, -6.5]) {
      for (const z3d of [2, -5.5]) {
        const w = newWorld();
        place(w, x, 0, z3d, '2d');
        expect(w.player.onGround).toBe(true);
        expect(trySwitchMode(w).ok).toBe(true);
        const shelf = objBox(w.byId.get('shelf')!);
        expect(overlapsXZ(playerBox(w.player), shelf)).toBe(false);
        run(w, {}, 0.3);
        expect(w.player.onGround).toBe(true);
        expect(w.player.y).toBeCloseTo(0, 3);
        expect(supportsOf(w, w.player, '3d').some(s => s.def.type === 'floor')).toBe(true);
        // 走得動：往房間前方走得出去
        const z0 = w.player.z;
        run(w, { moveZ: 1 }, 0.5);
        expect(w.player.z).toBeGreaterThan(z0 + 0.5);
      }
    }
  });
});

describe('切換：拒絕與落點', () => {
  it('3D→2D 壓平後與木箱重疊會被推到最近空位', () => {
    const w = newWorld();
    place(w, 4.5, 0, 5);
    expect(trySwitchMode(w).ok).toBe(true);
    const c = crateOf(w);
    expect(w.player.x <= c.x - 0.6 - 0.3 + 1e-6 || w.player.x >= c.x + 0.6 + 0.3 - 1e-6).toBe(true);
    expect(w.player.z).toBe(0);
    expect(w.player.z3d).toBe(5);
  });

  it('2D→3D 還原 z；站在高台上採高台的 z 範圍', () => {
    const w = newWorld();
    place(w, 3, 0, 2.5);
    trySwitchMode(w);
    trySwitchMode(w);
    expect(w.player.z).toBeCloseTo(2.5, 5);
    const w2 = newWorld();
    place(w2, 8.5, 2.5, 3, '2d');
    expect(trySwitchMode(w2).ok).toBe(true);
    expect(w2.player.z).toBeGreaterThanOrEqual(-6);
    expect(w2.player.z).toBeLessThanOrEqual(-3);
    run(w2, {}, 0.2);
    expect(w2.player.y).toBeCloseTo(2.5, 3);
  });

  it('站在木箱上切回 3D 採木箱的 z', () => {
    const w = newWorld();
    place(w, 4.5, 1.1, -3, '2d');
    expect(trySwitchMode(w).ok).toBe(true);
    expect(Math.abs(w.player.z - 2)).toBeLessThanOrEqual(0.3 + 1e-6);
  });

  const solid = (id: string, x: number, z: number, w: number, d: number, visible: ObjDef['visible']): ObjDef =>
    ({ id, type: 'wall', x, y: -2, z, w, h: 10, d, visible, solid: true });
  const tight = (objects: ObjDef[]): LevelDef => ({ ...foyer, bounds: { minX: -8, maxX: 8, minZ: -5, maxZ: 5 }, objects });

  it('3D→2D 塞不下則拒絕並提示', () => {
    const w = newWorld(tight([solid('big', 0, 8, 40, 2, 'both')]));
    w.player.x = 0; w.player.y = 0; w.player.z = 0;
    expect(trySwitchMode(w).ok).toBe(false);
    expect(w.player.mode).toBe('3d');
    expect(w.msg).toBe('這裡塞不下');
  });

  it('2D→3D 落點塞不下則拒絕', () => {
    const w = newWorld(tight([solid('wall3d', 0, 0, 40, 40, '3d')]));
    w.player.mode = '2d'; w.player.z = 0; w.player.z3d = 0; w.player.y = 0;
    expect(trySwitchMode(w).ok).toBe(false);
    expect(w.player.mode).toBe('2d');
    expect(w.msg).toBe('這裡塞不下');
  });
});

describe('推木箱', () => {
  it('3D 走進去即推，沿單軸', () => {
    const w = newWorld();
    place(w, 3.3, 0, 2);
    const x0 = crateOf(w).x, z0 = crateOf(w).z;
    run(w, { moveX: 1 }, 1);
    expect(crateOf(w).x).toBeGreaterThan(x0 + 1);
    expect(crateOf(w).z).toBe(z0);
  });

  it('被高台擋住就停 (z 對齊時)', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.z = -4.5; c.x = 6;
    place(w, 5, 0, -4.5);
    run(w, { moveX: 1 }, 3);
    expect(c.x + 0.6).toBeCloseTo(8, 2);
  });

  it('不能被推出地板邊緣 / 推入缺口', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.x = -4; c.z = 2;
    place(w, -3, 0, 2);
    run(w, { moveX: -1 }, 3);
    expect(c.x).toBeGreaterThanOrEqual(-6 - 1e-6);
    expect(c.y).toBe(0);
  });

  it('2D 不能推木箱', () => {
    const w = newWorld();
    place(w, 3.3, 0, 2, '2d');
    const x0 = crateOf(w).x;
    run(w, { moveX: 1 }, 1);
    expect(crateOf(w).x).toBe(x0);
    expect(w.player.x).toBeLessThan(crateOf(w).x - 0.6);
  });

  it('pushCrate 直接呼叫：出界被夾住', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.z = -5;
    expect(pushCrate(w, c, 2, -5)).toBeGreaterThanOrEqual(-5);
    expect(c.z - 0.6).toBeGreaterThanOrEqual(-6 - 1e-6);
  });

  it('已知問題 (b)：木箱推進死角後按 T 回到原位，壓在身上時玩家被挪開', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.x = 7.4; c.z = -5.4; // 高台與後牆夾成的死角
    place(w, 4.5, 0, 2);   // 站在木箱的原位
    resetCrates(w);
    expect([c.x, c.y, c.z]).toEqual([4.5, 0, 2]);
    expect(w.msg).toBe(MSG_CRATE_RESET);
    expect(overlapsXZ(playerBox(w.player), objBox(c))).toBe(false);
    expect(solidsFor(w, '3d')).toContain(c);
  });
});

describe('狀態機、檢查點與掉落', () => {
  it('掉入坑洞回到起點並提示', () => {
    const w = newWorld();
    w.player.y = -5.5;
    stepWorld(w, { moveX: 0, moveZ: 0, jump: false }, DT);
    expect(w.player.x).toBe(foyer.start.x);
    expect(w.player.y).toBe(0);
    expect(w.msg).toBe(MSG_FELL);
  });

  it('過了缺口之後掉下去，從中庭檢查點重生', () => {
    const w = newWorld();
    place(w, -5, 0, 2);
    expect(w.checkpoint).toBe(0);
    w.player.y = -5.5;
    stepWorld(w, { moveX: 0, moveZ: 0, jump: false }, DT);
    expect(w.player.x).toBe(foyer.checkpoints![0].x);
  });

  it('墨水閥 3D 不可見也不可互動；缺筆尖無效', () => {
    const w = newWorld();
    place(w, 15, 0, -5.2);
    expect(findTarget(w)).toBeNull();
    place(w, 15, 0, -5.2, '2d');
    expect(findTarget(w)?.def.id).toBe('valve');
    interact(w);
    expect(w.sealed).toBe(true);
  });

  it('空中不能互動', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    expect(findTarget(w)?.def.id).toBe('note');
    w.player.onGround = false;
    expect(findTarget(w)).toBeNull();
  });

  it('紙條可讀', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    interact(w);
    expect(w.msg).toBe('看不見的地方，不代表不存在。換個角度，它就在那裡。');
  });

  it('閘門關著時可查看提示，打開後不再互動也不擋路', () => {
    const w = newWorld();
    place(w, 9.6, 0, 0);
    expect(findTarget(w)?.def.id).toBe('gate');
    interact(w);
    expect(w.msg).toBe(MSG_GATE);
    w.byId.get('gate')!.used = true;
    expect(findTarget(w)?.def.id).not.toBe('gate');
    run(w, { moveX: 1 }, 1.5);
    expect(w.player.x).toBeGreaterThan(11);
  });
});
