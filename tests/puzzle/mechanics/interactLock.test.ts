import { describe, it, expect } from 'vitest';
import { newWorld, place, run } from '../helpers';
import { onCrateAtValve } from '../helpers';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { resetCrates } from '../../../src/puzzle/core/push';
import type { World } from '../../../src/puzzle/core/types';

// S4 行為鎖定：鑰匙 / 閥 / 門 / 閘門 / 字條在各狀態下的訊息與結果 (只看行為，不看內部旗標)
const MSG_KEY = '拿到了「鋼筆筆尖」。筆尖還是濕的。像有人剛用過。';
const MSG_VALVE_DRY = '墨水閥乾涸了。需要一支能引墨的東西。';
const MSG_VALVE_OPEN = '鋼筆筆尖點下，墨線像退潮一樣散開了。';
const MSG_DOOR_SEALED = '門被墨線封印著。藏寶圖裡似乎有它的機關。';
const MSG_DOOR_OPEN = '門開了。';
const MSG_GATE = '鐵柵門紋絲不動。門軸上沾著墨，像在等藏寶圖上的什麼。';
const MSG_UNREACHABLE = '看得見，卻碰不到。換個角度試試。';

const get = (w: World, id: string) => w.byId.get(id)!;
function takeKey(w: World): void {
  place(w, 8.5, 2.5, -4.5, '2d');
  interact(w);
}
function openValve(w: World): void {
  takeKey(w);
  onCrateAtValve(w);
  interact(w);
}

describe('行為鎖定：筆尖 (key)', () => {
  it('3D 站在高台上看得見卻拿不到：提示換角度，筆尖仍在', () => {
    const w = newWorld();
    place(w, 8.5, 2.5, -4.5);
    expect(findTarget(w)).toBeNull();
    const seq = w.msgSeq;
    interact(w);
    expect(w.msg).toBe(MSG_UNREACHABLE);
    expect(w.msgSeq).toBe(seq + 1);
    expect(get(w, 'key').gone).toBe(false);
  });

  it('2D 拾取：訊息、筆尖消失、之後不再是互動目標', () => {
    const w = newWorld();
    place(w, 8.5, 2.5, -4.5, '2d');
    expect(findTarget(w)?.def.id).toBe('key');
    interact(w);
    expect(w.msg).toBe(MSG_KEY);
    expect(get(w, 'key').gone).toBe(true);
    expect(findTarget(w)).toBeNull();
    const seq = w.msgSeq;
    interact(w);
    expect(w.msgSeq).toBe(seq);
  });
});

describe('行為鎖定：墨水閥 (valve)', () => {
  it('沒有筆尖：乾涸訊息、閥未轉、仍可再互動', () => {
    const w = newWorld();
    onCrateAtValve(w);
    interact(w);
    expect(w.msg).toBe(MSG_VALVE_DRY);
    expect(get(w, 'valve').used).toBe(false);
    expect(findTarget(w)?.def.id).toBe('valve');
    interact(w);
    expect(w.msg).toBe(MSG_VALVE_DRY);
  });

  it('有筆尖：解封訊息、閥已轉、之後不再是互動目標；筆尖不被消耗', () => {
    const w = newWorld();
    openValve(w);
    expect(w.msg).toBe(MSG_VALVE_OPEN);
    expect(get(w, 'valve').used).toBe(true);
    expect(findTarget(w)).toBeNull();
    const seq = w.msgSeq;
    interact(w);
    expect(w.msgSeq).toBe(seq);
    expect(get(w, 'key').gone).toBe(true);
  });

  it('3D 看不見閥：不可互動、也沒有換角度提示', () => {
    const w = newWorld();
    takeKey(w);
    place(w, 15, 0, -5.2);
    const seq = w.msgSeq;
    interact(w);
    expect(w.msgSeq).toBe(seq);
    expect(get(w, 'valve').used).toBe(false);
  });
});

describe('行為鎖定：出口門 (door)', () => {
  it('未解封：封印訊息、未通關、仍是互動目標 (3D 與 2D 皆同)', () => {
    for (const mode of ['3d', '2d'] as const) {
      const w = newWorld();
      place(w, 18, 0, -4.6, mode);
      expect(findTarget(w)?.def.id).toBe('door');
      interact(w);
      expect(w.msg).toBe(MSG_DOOR_SEALED);
      expect(w.cleared).toBe(false);
      expect(findTarget(w)?.def.id).toBe('door');
    }
  });

  it('只拿筆尖未轉閥：門仍封印', () => {
    const w = newWorld();
    takeKey(w);
    place(w, 18, 0, -4.6);
    interact(w);
    expect(w.msg).toBe(MSG_DOOR_SEALED);
    expect(w.cleared).toBe(false);
  });

  it('轉閥之後：門仍是互動目標，開門即通關 (3D 與 2D 皆同)', () => {
    for (const mode of ['3d', '2d'] as const) {
      const w = newWorld();
      openValve(w);
      place(w, 18, 0, -4.6, mode);
      expect(findTarget(w)?.def.id).toBe('door');
      interact(w);
      expect(w.msg).toBe(MSG_DOOR_OPEN);
      expect(w.cleared).toBe(true);
    }
  });

  it('通關後木箱歸位無效', () => {
    const w = newWorld();
    openValve(w);
    place(w, 18, 0, -4.6);
    interact(w);
    const c = get(w, 'crate');
    c.x = 0;
    const seq = w.msgSeq;
    resetCrates(w);
    expect(c.x).toBe(0);
    expect(w.msgSeq).toBe(seq);
  });
});

describe('行為鎖定：閘門與字條', () => {
  it('閘門關著：查看訊息；壓板壓下後閘門開啟、不再互動', () => {
    const w = newWorld();
    place(w, 9.6, 0, 0);
    interact(w);
    expect(w.msg).toBe(MSG_GATE);
    const c = get(w, 'crate');
    c.x = -1; c.z = -5.4;
    place(w, 3, 0, 2, '2d');
    run(w, {}, 0.1);
    expect(get(w, 'plate').used).toBe(true);
    expect(get(w, 'gate').used).toBe(true);
    place(w, 9.6, 0, 0);
    expect(findTarget(w)?.def.id).not.toBe('gate');
  });

  it('字條可重複閱讀，每次都送出訊息', () => {
    const w = newWorld();
    place(w, 6, 0, -5.2);
    interact(w);
    const seq = w.msgSeq;
    interact(w);
    expect(w.msg).toBe('想要高一點？我小時候都踩著朋友的肩膀。');
    expect(w.msgSeq).toBe(seq + 1);
  });
});
