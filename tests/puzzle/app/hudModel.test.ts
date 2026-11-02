import { describe, it, expect } from 'vitest';
import { newWorld, place } from '../helpers';
import { TEXT } from '../msgs';
import { deriveHelp, deriveHud } from '../../../src/puzzle/app/hudModel';
import { DEFAULT_BINDINGS, mergeBindings } from '../../../src/puzzle/input/bindings';
import { interact } from '../../../src/puzzle/core/interact';

const view = { renderMode: '3d' as const, locked: false, bindings: DEFAULT_BINDINGS };

describe('deriveHud (純函式)', () => {
  it('模式文字、無持有物、紙條提示與舊 HUD 相同', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    const m = deriveHud(w, TEXT, view);
    expect(m.mode).toBe('3d');
    expect(m.modeText).toBe('現實');
    expect(m.items).toEqual([]);
    expect(m.prompt).toBe('[E] 閱讀　紙條');
    expect(deriveHud(w, TEXT, { ...view, renderMode: '2d' }).modeText).toBe('圖紙');
  });

  it('各物件動詞與名稱 (筆尖 / 墨水閥 / 出口門 / 閘門)', () => {
    const w = newWorld();
    place(w, 8.5, 2.5, -4.5, '2d');
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 拾取　筆尖');
    interact(w);
    const m = deriveHud(w, TEXT, view);
    expect(m.items).toEqual([{ id: 'nib', n: 1, name: '筆尖' }]);
    expect(m.toast).toEqual({ seq: w.msgSeq, text: '拿到了「筆尖」。它還帶著一點未乾的墨。' });
    place(w, 15, 0, -5.2, '2d');
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 轉動　墨水閥');
    place(w, 18, 0, -4.6);
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 開門　出口門');
    place(w, 9.6, 0, 0);
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 查看　閘門');
  });

  it('過場中、通關後、空中不顯示提示', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    expect(deriveHud(w, TEXT, { ...view, locked: true }).prompt).toBeNull();
    w.player.onGround = false;
    expect(deriveHud(w, TEXT, view).prompt).toBeNull();
    w.player.onGround = true;
    w.cleared = true;
    expect(deriveHud(w, TEXT, view).prompt).toBeNull();
  });

  it('提示的按鍵名跟著重綁', () => {
    const w = newWorld();
    place(w, -17, 0, -5.2);
    expect(deriveHud(w, TEXT, { ...view, bindings: mergeBindings(DEFAULT_BINDINGS, { interact: ['KeyG'] }) }).prompt).toBe('[G] 閱讀　紙條');
  });
});

describe('deriveHelp', () => {
  it('預設按鍵產生與舊 puzzle.html 相同的操作說明', () => {
    expect(deriveHelp(DEFAULT_BINDINGS).map(r => [r.keys, TEXT(r.labelKey)])).toEqual([
      [['WASD'], '移動'], [['Space'], '跳'], [['F', 'Q'], '切換視角'], [['E'], '互動'], [['T'], '木箱歸位'], [['R'], '重新開始']
    ]);
  });

  it('重綁後說明一致', () => {
    const b = mergeBindings(DEFAULT_BINDINGS, { up: ['KeyI'], left: ['KeyJ'], down: ['KeyK'], right: ['KeyL'], flip: ['Digit1'] });
    expect(deriveHelp(b).map(r => r.keys)).toEqual([['IJKL'], ['Space'], ['1'], ['E'], ['T'], ['R']]);
  });
});
