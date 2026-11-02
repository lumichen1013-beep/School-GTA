import { describe, it, expect } from 'vitest';
import { newWorld, place, DT } from '../helpers';
import { ACTION_ORDER } from '../../../src/puzzle/core/actions';
import { step, stepWorld } from '../../../src/puzzle/core/step';
import { trySwitchMode } from '../../../src/puzzle/core/switchMode';
import { interact } from '../../../src/puzzle/core/interact';
import { resetCrates } from '../../../src/puzzle/core/mechanisms';
import { createWorld } from '../../../src/puzzle/core/world';
import { compileMechanics } from '../../../src/puzzle/core/registry';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import type { World } from '../../../src/puzzle/core/types';

const snap = (w: World) => ({ p: { ...w.player }, msg: w.msg, msgSeq: w.msgSeq, objs: w.objs.map(o => [o.x, o.y, o.z, o.gone, o.used, o.touched]), cleared: w.cleared, time: w.time });

describe('step(ActionFrame)', () => {
  it('ACTION_ORDER 與舊 game.ts 的順序一致：切換 → 歸位 → 互動', () => {
    expect(ACTION_ORDER).toEqual(['flip', 'reset', 'interact']);
  });

  it('同一幀多個動作：不論 pressed 排列，結果等同舊流程 trySwitchMode → resetCrates → interact → stepWorld', () => {
    const a = newWorld(); const b = newWorld();
    for (const w of [a, b]) { place(w, 15, 0, -5.2); w.byId.get('crate')!.x = 3; }
    trySwitchMode(b); resetCrates(b); interact(b);
    stepWorld(b, { moveX: 1, moveZ: 0, jump: false }, DT);
    step(a, { moveX: 1, moveZ: 0, jump: false, pressed: ['interact', 'reset', 'flip'] }, DT);
    expect(snap(a)).toEqual(snap(b));
    expect(a.player.mode).toBe('2d');
    expect(a.msg).toBe('木箱回到了原來的地方。'); // 切換後懸空，互動無效 (同舊流程)
    expect(a.events).toEqual([{ t: 'switch', to: '2d' }]);
  });

  it('歸位先於互動：同幀按 E 與 T，最後的訊息是互動結果', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    const seq = w.msgSeq;
    step(w, { moveX: 0, moveZ: 0, jump: false, pressed: ['interact', 'reset'] }, DT);
    expect(w.msg).toBe('看不見的地方，不代表不存在。換個角度，它就在那裡。');
    expect(w.msgSeq).toBe(seq + 2);
  });

  it('沒有動作時 step 等同 stepWorld；切換失敗送出 switchDenied', () => {
    const a = newWorld(); const b = newWorld();
    for (let i = 0; i < 30; i++) {
      step(a, { moveX: 1, moveZ: -0.5, jump: i % 7 === 0, pressed: [] }, DT);
      stepWorld(b, { moveX: 1, moveZ: -0.5, jump: i % 7 === 0 }, DT);
    }
    expect(snap(a)).toEqual(snap(b));
    const w = newWorld({ ...foyer, bounds: { minX: -8, maxX: 8, minZ: -5, maxZ: 5 }, objects: [{ id: 'big', type: 'wall', x: 0, y: -2, z: 8, w: 40, h: 10, d: 2, visible: 'both', solid: true }] });
    w.player.x = 0; w.player.y = 0; w.player.z = 0;
    step(w, { moveX: 0, moveZ: 0, jump: false, pressed: ['flip'] }, DT);
    expect(w.events).toEqual([{ t: 'switchDenied' }]);
    expect(w.msg).toBe('這裡塞不下');
  });

  it('通關後 step 不再處理動作', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    w.cleared = true;
    const before = snap(w);
    step(w, { moveX: 1, moveZ: 0, jump: true, pressed: ['flip', 'reset', 'interact'] }, DT);
    expect(snap(w)).toEqual(before);
  });
});

describe('機制登錄表', () => {
  it('重複的機制 id 或物件類型會拋錯', () => {
    expect(() => compileMechanics([{ id: 'a' }, { id: 'a' }])).toThrow();
    expect(() => compileMechanics([{ id: 'a', types: { x: {} } }, { id: 'b', types: { x: {} } }])).toThrow();
  });

  it('init / beforePhysics / afterPhysics 依註冊順序呼叫，passable 讓實體不擋路', () => {
    const calls: string[] = [];
    const w = createWorld(foyer, { mechanics: [
      { id: 'm1', init: () => calls.push('init1'), beforePhysics: () => calls.push('before1'), afterPhysics: () => calls.push('after1') },
      { id: 'm2', init: () => calls.push('init2'), afterPhysics: () => calls.push('after2'), passable: (_w, o) => o.def.id === 'gate' }
    ] });
    stepWorld(w, { moveX: 0, moveZ: 0, jump: false }, DT);
    expect(calls).toEqual(['init1', 'init2', 'before1', 'after1', 'after2']);
    place(w, 9.6, 0, 0);
    stepWorld(w, { moveX: 1, moveZ: 0, jump: false }, 1);
    expect(w.player.x).toBeGreaterThan(10.5);
  });
});
