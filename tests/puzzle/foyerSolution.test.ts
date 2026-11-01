import { describe, it, expect } from 'vitest';
import { newWorld, run, walkTo, hopUntil, place } from './helpers';
import { trySwitchMode } from '../../src/puzzle/logic/switchMode';
import { findTarget, interact } from '../../src/puzzle/logic/interact';
import { MSG_PLATE_LIGHT, MSG_PLATE_ON } from '../../src/puzzle/logic/mechanisms';
import type { World } from '../../src/puzzle/logic/types';

const get = (w: World, id: string) => w.byId.get(id)!;

/** ① 書架過缺口：3D 走到缺口邊 → 2D 沿書架走過 → 回 3D */
function solveShelf(w: World): void {
  walkTo(w, -10.3, 2, { zFirst: true });
  expect(trySwitchMode(w).ok).toBe(true);
  walkTo(w, -4.5, null);
  expect(w.player.y).toBeCloseTo(0, 3);
  expect(trySwitchMode(w).ok).toBe(true);
  run(w, {}, 0.2);
  expect(w.player.mode).toBe('3d');
  expect(w.player.x).toBeGreaterThan(-6);
  expect(w.checkpoint).toBe(0);
}

/** ② 從後方窄道繞過長桌，把木箱往右推到高台旁 (中心 x=7)，切 2D 踩木箱跳上高台取筆尖 */
function solveKey(w: World): void {
  walkTo(w, null, -5.3);
  walkTo(w, 2.5, null);
  walkTo(w, null, 2);
  walkTo(w, 6.1, null);
  expect(get(w, 'crate').x).toBeCloseTo(7, 1);
  expect(trySwitchMode(w).ok).toBe(true);
  expect(hopUntil(w, 1, () => w.player.onGround && w.player.y > 2.4 && w.player.x > 8.1)).toBe(true);
  walkTo(w, 8.5, null);
  expect(findTarget(w)?.def.id).toBe('key');
  interact(w);
  expect(w.hasKey).toBe(true);
}

/** ③ 木箱推回、沿 -z 推進後方窄道、從右側沿窄道推到長桌後方的壓板 x；切 2D 壓下 → 閘門升起 → 3D 穿門洞 */
function solveGate(w: World): void {
  expect(trySwitchMode(w).ok).toBe(true); // 高台上回 3D
  walkTo(w, null, 2);
  walkTo(w, 5.4, null);                    // 從右側把木箱推回 x=4.5
  walkTo(w, null, 3.5);
  walkTo(w, 4.5, null);
  walkTo(w, null, -4.5);                   // 往後推到底：木箱 z=-5.4，落在窄道
  run(w, { moveZ: -1 }, 0.3);
  const c = get(w, 'crate');
  expect(c.z).toBeCloseTo(-5.4, 3);
  walkTo(w, 5.6, null);
  walkTo(w, null, -5.4);
  walkTo(w, -0.1, null);                   // 沿窄道往左推到壓板 (x∈[-1.6,-0.4])
  expect(c.x).toBeGreaterThan(-1.6);
  expect(c.x).toBeLessThan(-0.4);
  expect(get(w, 'gate').used).toBe(false); // 現實裡壓板不存在
  expect(trySwitchMode(w).ok).toBe(true);
  run(w, {}, 0.1);
  expect(get(w, 'plate').used).toBe(true);
  expect(get(w, 'gate').used).toBe(true);
  expect(w.msg).toBe(MSG_PLATE_ON);
  expect(trySwitchMode(w).ok).toBe(true);
  walkTo(w, 1.5, null);
  walkTo(w, null, 0);
  walkTo(w, 12, null);
  expect(w.player.x).toBeCloseTo(12, 1);
}

/** 終章：2D 墨水閥 → 出口門 */
function solveExit(w: World): void {
  expect(trySwitchMode(w).ok).toBe(true);
  walkTo(w, 15, null);
  expect(findTarget(w)?.def.id).toBe('valve');
  interact(w);
  expect(w.sealed).toBe(false);
  expect(trySwitchMode(w).ok).toBe(true);
  walkTo(w, 18, -4.6);
  expect(findTarget(w)?.def.id).toBe('door');
  interact(w);
  expect(w.cleared).toBe(true);
}

describe('完整解謎路徑', () => {
  it('合成輸入從起點一路通關 (三個謎題 + 墨水閥)', () => {
    const w = newWorld();
    run(w, {}, 0.2);
    solveShelf(w);
    solveKey(w);
    solveGate(w);
    solveExit(w);
  });
});

describe('謎題 ① 反例：書架', () => {
  it('3D 走 / 跳 / 貼後方都過不了缺口', () => {
    for (const z of [2, -3.5, -5.5]) {
      const w = newWorld();
      place(w, -12, 0, z);
      let maxGroundX = -99;
      run(w, { moveX: 1, jump: true }, 8, () => { if (w.player.onGround) maxGroundX = Math.max(maxGroundX, w.player.x); });
      expect(maxGroundX).toBeLessThan(-9.69);
    }
  });

  it('3D 從另一側站上貼著木欄的木箱也跳不過木欄 (欄高 2.6)', () => {
    const w = newWorld();
    const c = get(w, 'crate');
    c.x = -4.3; c.z = -5.4;
    place(w, -4.3, 1.1, -5.4);
    let maxY = 0;
    run(w, { moveX: -1, jump: true }, 4, () => { maxY = Math.max(maxY, w.player.y); });
    expect(maxY).toBeLessThan(2.6);
    expect(w.player.x).toBeGreaterThan(-4.9);
  });
});

describe('謎題 ② 反例：高台與筆尖', () => {
  it('木箱沒推 (起點) 時，2D 從箱頂跳不上高台、也搆不到筆尖', () => {
    const w = newWorld();
    place(w, 5.0, 1.1, 2, '2d');
    let onPlinth = false;
    run(w, { moveX: 1, jump: true }, 3, () => { if (w.player.onGround && w.player.y > 2.4) onPlinth = true; });
    expect(onPlinth).toBe(false);
    place(w, 5.4, 1.1, 2, '2d');
    interact(w);
    expect(w.hasKey).toBe(false);
  });

  it('3D 站上緊貼高台的木箱也跳不上去、拿不到筆尖', () => {
    const w = newWorld();
    const c = get(w, 'crate');
    c.x = 7.4; c.z = -4.5;
    place(w, 7.4, 1.1, -4.5);
    let maxY = 0;
    run(w, { moveX: 1, jump: true }, 3, () => { maxY = Math.max(maxY, w.player.y); });
    expect(maxY).toBeLessThan(2.4);
    place(w, 7.7, 1.1, -4.5);
    interact(w);
    expect(w.hasKey).toBe(false);
  });

  it('2D 地面貼著高台跳起，空中按 E 也拿不到 (需站穩)', () => {
    const w = newWorld();
    place(w, 7.7, 0, 0, '2d');
    run(w, { jump: true }, 0.2, () => interact(w));
    run(w, {}, 1, () => interact(w));
    expect(w.hasKey).toBe(false);
  });
});

describe('謎題 ③ 反例：壓板與閘門', () => {
  it('從長桌前方怎麼推，木箱都到不了壓板的 x 範圍', () => {
    for (const z of [-4, -1, 2, 5.2]) {
      const w = newWorld();
      const c = get(w, 'crate');
      c.x = 3; c.z = z;
      place(w, 4.2, 0, z);
      run(w, { moveX: -1 }, 4);
      expect(c.x).toBeGreaterThanOrEqual(0.5 + 0.6 - 1e-6);
    }
  });

  it('只在 3D 把木箱推到壓板上：閘門不開，現實裡穿不過門洞', () => {
    const w = newWorld();
    const c = get(w, 'crate');
    c.x = -1; c.z = -5.4;
    place(w, 8, 0, 0);
    run(w, { moveX: 1 }, 3);
    expect(get(w, 'gate').used).toBe(false);
    expect(w.player.x).toBeLessThan(10.05 - 0.3 + 1e-3);
  });

  it('玩家自己站上圖紙壓板壓不下去 (太輕)', () => {
    const w = newWorld();
    place(w, -1, 0, -5.3, '2d');
    run(w, {}, 0.5);
    expect(get(w, 'plate').used).toBe(false);
    expect(w.msg).toBe(MSG_PLATE_LIGHT);
  });

  it('圖紙裡隔牆是一整面：走不過、從高台頂跳也越不過 (即使閘門已開)', () => {
    for (const open of [false, true]) {
      const w = newWorld();
      get(w, 'gate').used = open;
      place(w, 9.5, 0, 0, '2d');
      run(w, { moveX: 1, jump: true }, 3);
      expect(w.player.x).toBeLessThan(9.71);
      place(w, 8.7, 2.5, -4.5, '2d');
      run(w, { moveX: 1, jump: true }, 3);
      expect(w.player.x).toBeLessThan(9.71);
    }
  });

  it('現實裡閘門關著：站上木箱跳也越不過閘門 / 楣牆', () => {
    const w = newWorld();
    const c = get(w, 'crate');
    c.x = 9.2; c.z = 0;
    place(w, 9.2, 1.1, 0);
    let maxY = 0;
    run(w, { moveX: 1, jump: true }, 4, () => { maxY = Math.max(maxY, w.player.y); });
    expect(maxY).toBeLessThan(3);
    expect(w.player.x).toBeLessThan(10.05);
  });

  it('隔牆邊來回切換視角不會被擠到牆的另一側', () => {
    for (let z = -5.5; z <= 5.5; z += 0.5) {
      const w = newWorld();
      place(w, 9.69, 0, z);
      for (let k = 0; k < 4; k++) { trySwitchMode(w); run(w, {}, 0.1); }
      expect(w.player.x).toBeLessThan(10);
    }
  });

  it('從高台下方切到圖紙不會被擠上高台頂', () => {
    for (let x = 8; x <= 9; x += 0.1) {
      const w = newWorld();
      place(w, x, 0, 2);
      expect(trySwitchMode(w).ok).toBe(true);
      expect(w.player.y).toBeLessThan(0.1);
    }
  });
});

describe('終章反例', () => {
  it('沒有筆尖轉不動墨水閥；封印未解門不開', () => {
    const w = newWorld();
    place(w, 15, 0, 0, '2d');
    interact(w);
    expect(w.sealed).toBe(true);
    place(w, 18, 0, -4.6);
    expect(findTarget(w)?.def.id).toBe('door');
    interact(w);
    expect(w.cleared).toBe(false);
    expect(w.msg).toContain('封印');
  });
});
