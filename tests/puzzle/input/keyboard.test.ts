import { describe, it, expect } from 'vitest';
import { KeyboardSource } from '../../../src/puzzle/input/keyboard';
import { DEFAULT_BINDINGS, keyLabel, mergeBindings } from '../../../src/puzzle/input/bindings';

type Handler = (e: unknown) => void;
/** 假視窗：記錄監聽器，手動派送事件 */
function fakeWindow() {
  const h: Record<string, Handler[]> = {};
  const target = {
    addEventListener: (t: string, f: Handler) => { (h[t] ??= []).push(f); },
    removeEventListener: (t: string, f: Handler) => { h[t] = (h[t] ?? []).filter(x => x !== f); }
  };
  const fire = (t: string, code = '', repeat = false, tagName = 'BODY') => {
    let prevented = false;
    for (const f of h[t] ?? []) f({ code, repeat, target: { tagName }, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { target: target as unknown as Window, fire, count: () => Object.values(h).flat().length };
}

describe('bindings', () => {
  it('mergeBindings 只覆蓋認得的名稱與合法清單', () => {
    const b = mergeBindings(DEFAULT_BINDINGS, { flip: ['KeyG'], bogus: ['KeyX'], reset: [], interact: [1] });
    expect(b.flip).toEqual(['KeyG']);
    expect(b.reset).toEqual(['KeyT']);
    expect(b.interact).toEqual(['KeyE']);
    expect('bogus' in b).toBe(false);
    expect(DEFAULT_BINDINGS.flip).toEqual(['KeyF', 'KeyQ']);
  });

  it('keyLabel', () => {
    expect(['KeyF', 'Digit3', 'Space', 'ArrowUp'].map(keyLabel)).toEqual(['F', '3', 'Space', 'ArrowUp']);
  });
});

describe('KeyboardSource', () => {
  it('持續軸與舊 input.ts 相同 (W 往 -z、S 往 +z)；新按下的動作取走即清空；repeat 不算新按', () => {
    const fw = fakeWindow();
    const k = new KeyboardSource(DEFAULT_BINDINGS, fw.target);
    fw.fire('keydown', 'KeyD'); fw.fire('keydown', 'KeyW');
    expect(fw.fire('keydown', 'Space')).toBe(true);
    let f = k.poll();
    expect([f.moveX, f.moveZ, f.jump, f.anyKey]).toEqual([1, -1, true, true]);
    expect(f.pressed).toEqual([]);
    fw.fire('keydown', 'KeyE'); fw.fire('keydown', 'KeyQ'); fw.fire('keydown', 'KeyR');
    f = k.poll();
    // 2026-11-08：R 不再是重新進房 (改用畫面上方的「重置」鈕)；重綁回 R 照樣是 restart
    expect(f.pressed).toEqual(['flip', 'interact']);
    expect(DEFAULT_BINDINGS.restart).toEqual([]);
    const kr = new KeyboardSource(mergeBindings(DEFAULT_BINDINGS, { restart: ['KeyR'] }), fw.target);
    fw.fire('keydown', 'KeyR');
    expect(kr.poll().pressed).toEqual(['restart']);
    kr.dispose();
    k.poll();
    fw.fire('keydown', 'KeyE', true);
    f = k.poll();
    expect([f.pressed, f.anyKey]).toEqual([[], true]);
    fw.fire('keyup', 'KeyD'); fw.fire('keydown', 'ArrowLeft');
    expect(k.poll().moveX).toBe(-1);
    fw.fire('blur');
    expect(k.poll().moveX).toBe(0);
  });

  it('jumpPressed：跳躍鍵新按下 (同一幀內按下又放開也抓得到；過場用空白鍵推進)', () => {
    const fw = fakeWindow();
    const k = new KeyboardSource(DEFAULT_BINDINGS, fw.target);
    fw.fire('keydown', 'Space'); fw.fire('keyup', 'Space');
    let f = k.poll();
    expect([f.jump, f.jumpPressed, f.pressed]).toEqual([false, true, []]);
    f = k.poll();
    expect(f.jumpPressed).toBe(false);
    fw.fire('keydown', 'Space');
    fw.fire('keydown', 'Space', true);
    k.poll();
    expect(k.poll().jumpPressed).toBe(false); // 按住 (repeat) 不算新按
  });

  it('clear 丟棄未取走的按鍵；dispose 移除監聽', () => {
    const fw = fakeWindow();
    const k = new KeyboardSource(mergeBindings(DEFAULT_BINDINGS, { interact: ['KeyG'] }), fw.target);
    fw.fire('keydown', 'KeyE');
    fw.fire('keydown', 'KeyG');
    k.clear();
    expect(k.poll().pressed).toEqual([]);
    fw.fire('keydown', 'KeyG');
    expect(k.poll().pressed).toEqual(['interact']);
    k.dispose();
    expect(fw.count()).toBe(0);
  });

  it('輸入框中的按鍵 (暱稱) 不當成遊戲操作、也不阻擋空白鍵', () => {
    const fw = fakeWindow();
    const k = new KeyboardSource(DEFAULT_BINDINGS, fw.target);
    expect(fw.fire('keydown', 'Space', false, 'INPUT')).toBe(false);
    fw.fire('keydown', 'KeyR', false, 'INPUT');
    const f = k.poll();
    expect([f.pressed, f.jump, f.anyKey]).toEqual([[], false, false]);
  });
});
