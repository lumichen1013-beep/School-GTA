import { describe, it, expect } from 'vitest';
import { newWorld, run, walkTo, DT } from './helpers';
import { stepWorld } from '../../src/puzzle/logic/step';
import { trySwitchMode } from '../../src/puzzle/logic/switchMode';
import { findTarget, interact } from '../../src/puzzle/logic/interact';
import { pushCrate } from '../../src/puzzle/logic/push';
import { foyer } from '../../src/puzzle/levels/foyer';
import type { LevelDef, ObjDef } from '../../src/puzzle/logic/types';

const crateOf = (w: ReturnType<typeof newWorld>) => w.byId.get('crate')!;

describe('壓平碰撞：缺口與書架', () => {
  it('2D 下書架與地板同一平面，可走過缺口', () => {
    const w = newWorld();
    walkTo(w, -2.4, null);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(w.player.mode).toBe('2d');
    run(w, { moveX: 1 }, 2.2, () => expect(w.player.y).toBeGreaterThan(-0.01));
    expect(w.player.x).toBeGreaterThan(2.4); // 被木箱 (2D 不能推) 擋在箱前
    expect(w.player.y).toBeCloseTo(0, 3);
  });

  it('3D 下過不去：走 / 跳 / 貼後牆都會掉回起點或被擋', () => {
    for (const z of [0, -2.5, -4.5]) {
      const w = newWorld();
      w.player.z = z;
      let maxGroundX = -99;
      run(w, { moveX: 1, jump: true }, 8, () => { if (w.player.y > -0.5) maxGroundX = Math.max(maxGroundX, w.player.x); });
      expect(maxGroundX).toBeLessThan(0);
    }
  });

  it('3D 無法踏上書架 (木欄擋住)', () => {
    const w = newWorld();
    walkTo(w, null, -4.5);
    run(w, { moveX: 1 }, 3);
    expect(w.player.x).toBeLessThan(-3.3);
  });
});

describe('切換：拒絕與落點', () => {
  it('3D→2D 壓平後與木箱重疊會被推到最近空位', () => {
    const w = newWorld();
    w.player.x = 3.4; w.player.z = 2.5;
    expect(trySwitchMode(w).ok).toBe(true);
    const c = crateOf(w);
    expect(w.player.x <= c.x - 0.6 - 0.3 + 1e-6 || w.player.x >= c.x + 0.6 + 0.3 - 1e-6).toBe(true);
    expect(w.player.z).toBe(0);
    expect(w.player.z3d).toBe(2.5);
  });

  it('2D→3D 還原 z；站在高台上採高台的 z 範圍', () => {
    const w = newWorld();
    w.player.x = 5; w.player.z = 2.5;
    trySwitchMode(w); // 2D
    trySwitchMode(w); // 回 3D
    expect(w.player.z).toBeCloseTo(2.5, 5);
    const w2 = newWorld();
    w2.player.x = 6.85; w2.player.y = 2.5; w2.player.z = -3; w2.player.mode = '2d'; w2.player.z3d = -3;
    expect(trySwitchMode(w2).ok).toBe(true);
    expect(w2.player.z).toBeGreaterThanOrEqual(1.5);
    expect(w2.player.z).toBeLessThanOrEqual(4.5);
  });

  it('站在書架上切回 3D 採書架的 z', () => {
    const w = newWorld();
    w.player.x = 0; w.player.y = 0; w.player.mode = '2d'; w.player.z = 0; w.player.z3d = 0;
    expect(trySwitchMode(w).ok).toBe(true);
    expect(w.player.z).toBeLessThan(-3.3);
  });

  const solid = (id: string, x: number, z: number, w: number, d: number, visible: ObjDef['visible']): ObjDef =>
    ({ id, type: 'prop' as never, x, y: -2, z, w, h: 10, d, visible, solid: true });
  const tight = (objects: ObjDef[]): LevelDef => ({ ...foyer, objects });

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
    w.player.x = 2.3; w.player.z = -0.5;
    const x0 = crateOf(w).x, z0 = crateOf(w).z;
    run(w, { moveX: 1 }, 1);
    expect(crateOf(w).x).toBeGreaterThan(x0 + 1);
    expect(crateOf(w).z).toBe(z0);
  });

  it('被高台擋住就停 (z 對齊時)', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.z = 2.5; c.x = 4;
    w.player.x = 3; w.player.z = 2.5;
    run(w, { moveX: 1 }, 3);
    expect(c.x + 0.6).toBeCloseTo(6.4, 2);
  });

  it('不能被推出地板邊緣 / 推入缺口', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.x = 3; w.player.x = 4.5; w.player.z = c.z;
    run(w, { moveX: -1 }, 3);
    expect(c.x).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(c.y).toBe(0);
  });

  it('不能推進書架木欄區', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.z = -1.5; w.player.x = c.x; w.player.z = 0;
    run(w, { moveZ: -1 }, 3);
    expect(c.z - 0.6).toBeGreaterThanOrEqual(-3.0 - 1e-6);
  });

  it('2D 不能推木箱', () => {
    const w = newWorld();
    walkTo(w, 2.3, null);
    trySwitchMode(w);
    const x0 = crateOf(w).x;
    run(w, { moveX: 1 }, 1);
    expect(crateOf(w).x).toBe(x0);
    expect(w.player.x).toBeLessThan(crateOf(w).x - 0.6);
  });

  it('pushCrate 直接呼叫：出界被夾住', () => {
    const w = newWorld();
    const c = crateOf(w);
    c.z = -4; // 木欄之外也不會出牆
    expect(pushCrate(w, c, 2, -5)).toBeGreaterThanOrEqual(-5);
  });
});

describe('狀態機與掉落', () => {
  it('掉入坑洞回到起點並提示', () => {
    const w = newWorld();
    w.player.y = -5.5;
    stepWorld(w, { moveX: 0, moveZ: 0, jump: false }, DT);
    expect(w.player.x).toBe(foyer.start.x);
    expect(w.player.y).toBe(0);
    expect(w.msg).toContain('回到');
  });

  it('墨水閥 3D 不可見也不可互動；缺筆尖無效', () => {
    const w = newWorld();
    w.player.x = 4.6; w.player.z = -2.5;
    expect(findTarget(w)).toBeNull();
    w.player.mode = '2d'; w.player.z = 0;
    expect(findTarget(w)?.def.id).toBe('valve');
    interact(w);
    expect(w.sealed).toBe(true);
  });

  it('封印未解時門不開', () => {
    const w = newWorld();
    w.player.x = 7.5; w.player.z = -2;
    expect(findTarget(w)?.def.id).toBe('door');
    interact(w);
    expect(w.cleared).toBe(false);
    expect(w.msg).toContain('封印');
  });

  it('紙條可讀', () => {
    const w = newWorld();
    w.player.x = -6.5; w.player.z = -4.4;
    interact(w);
    expect(w.msg).toBe('看不見的地方，不代表不存在。換個角度，它就在那裡。');
  });
});

describe('無捷徑', () => {
  const crateAdjacent = () => {
    const w = newWorld();
    const c = crateOf(w);
    c.x = 5.8; c.z = 3; // 緊貼高台 (最有利的位置)
    return w;
  };

  it('3D 站上緊貼高台的木箱也跳不上去、拿不到筆尖', () => {
    const w = crateAdjacent();
    w.player.x = 5.8; w.player.y = 1.1; w.player.z = 3;
    let maxY = 0;
    run(w, { moveX: 1, jump: true }, 3, () => { maxY = Math.max(maxY, w.player.y); });
    expect(maxY).toBeLessThan(2.4);
    interact(w);
    expect(w.hasKey).toBe(false);
  });

  it('3D 從地面跳不上高台', () => {
    const w = newWorld();
    w.player.x = 5; w.player.z = 3;
    let maxY = 0;
    run(w, { moveX: 1, jump: true }, 3, () => { maxY = Math.max(maxY, w.player.y); });
    expect(maxY).toBeLessThan(2);
    expect(w.hasKey).toBe(false);
  });

  it('2D 木箱未推動 (在起點) 時，從箱頂也跳不上高台', () => {
    const w = newWorld();
    w.player.mode = '2d'; w.player.z = 0;
    w.player.x = 3.9; w.player.y = 1.1; // 箱頂右緣
    let onPlinth = false;
    run(w, { moveX: 1, jump: true }, 3, () => { if (w.player.onGround && w.player.y > 2.4) onPlinth = true; });
    expect(onPlinth).toBe(false);
    expect(w.player.x).toBeLessThan(6.4);
  });
});

describe('完整解謎路徑', () => {
  it('合成輸入從起點一路通關', () => {
    const w = newWorld();
    // 1. 3D 走到缺口邊，切 2D 走書架過缺口，到右側地板再切回
    walkTo(w, -2.4, 0);
    expect(trySwitchMode(w).ok).toBe(true);
    run(w, { moveX: 1 }, 2.1);
    walkTo(w, 2.4, null);
    expect(w.player.y).toBeCloseTo(0, 3);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(w.player.mode).toBe('3d');
    expect(w.player.x).toBeCloseTo(2.4, 1);
    // 2. 3D 先沿 z 推木箱到高台 z 範圍，再沿 x 推到頂住高台
    walkTo(w, 3.4, -1.8, { tol: 0.05, zFirst: true });
    run(w, { moveZ: 1 }, 1.4);
    const c = crateOf(w);
    expect(c.z).toBeGreaterThan(1.5);
    walkTo(w, 2.3, c.z);
    run(w, { moveX: 1 }, 3);
    expect(c.x + 0.6).toBeCloseTo(6.4, 2);
    // 3. 切 2D：跳上木箱再跳上高台，取筆尖
    expect(trySwitchMode(w).ok).toBe(true);
    for (let i = 0; i < 600 && !(w.player.onGround && w.player.y > 2.4 && w.player.x > 6.4); i++) {
      stepWorld(w, { moveX: 1, moveZ: 0, jump: true }, DT);
    }
    expect(w.player.y).toBeCloseTo(2.5, 2);
    walkTo(w, 6.85, null);
    interact(w);
    expect(w.hasKey).toBe(true);
    // 4. 回到墨水閥，2D 下引墨
    for (let i = 0; i < 600 && !(w.player.x < 4.7 && w.player.onGround && w.player.y < 0.01); i++) {
      stepWorld(w, { moveX: -1, moveZ: 0, jump: false }, DT);
    }
    expect(findTarget(w)?.def.id).toBe('valve');
    interact(w);
    expect(w.sealed).toBe(false);
    // 5. 回 3D 走到門前通關
    expect(trySwitchMode(w).ok).toBe(true);
    walkTo(w, 4.6, -2, { zFirst: true });
    walkTo(w, 7.7, null);
    expect(findTarget(w)?.def.id).toBe('door');
    interact(w);
    expect(w.cleared).toBe(true);
  });
});
