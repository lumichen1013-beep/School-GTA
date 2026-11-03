import { describe, it, expect } from 'vitest';
import { FOYER_V02, newWorld, place } from '../helpers';
import { onCrateAtValve } from '../helpers';
import { TEXT } from '../msgs';
import { deriveHelp, deriveHud } from '../../../src/puzzle/app/hudModel';
import { DEFAULT_BINDINGS, mergeBindings } from '../../../src/puzzle/input/bindings';
import { interact } from '../../../src/puzzle/core/interact';

const view = { renderMode: '3d' as const, locked: false, bindings: DEFAULT_BINDINGS };

describe('deriveHud (純函式)', () => {
  it('模式文字、無持有物、紙條提示與舊 HUD 相同', () => {
    const w = newWorld(FOYER_V02); // 字條在 x=-17 的凍結場景 (C7 起正式玄關的西區是 1-2d 拉繩)
    place(w, -17, 0, -5.2);
    const m = deriveHud(w, TEXT, view);
    expect(m.mode).toBe('3d');
    expect(m.modeText).toBe('實景');
    expect(m.items).toEqual([]);
    expect(m.prompt).toBe('[E] 閱讀　爸爸的筆記');
    expect(deriveHud(w, TEXT, { ...view, renderMode: '2d' }).modeText).toBe('藏寶圖');
  });

  it('各物件動詞與名稱 (筆尖 / 墨水閥 / 出口門 / 閘門)', () => {
    const w = newWorld(FOYER_V02);
    place(w, 8.5, 2.5, -4.5, '2d');
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 拾取　鋼筆筆尖');
    interact(w);
    const m = deriveHud(w, TEXT, view);
    expect(m.items).toEqual([{ id: 'nib', n: 1, name: '鋼筆筆尖' }]);
    expect(m.toast).toEqual({ seq: w.msgSeq, text: '拿到了「鋼筆筆尖」。筆尖還是濕的。像有人剛用過。' });
    onCrateAtValve(w);
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 轉動　墨水閥');
    place(w, 18, 0, -4.6);
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 開門　出口門');
    place(w, 9.6, 0, 0);
    expect(deriveHud(w, TEXT, view).prompt).toBe('[E] 查看　鐵柵門');
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
    const w = newWorld(FOYER_V02); // 字條在 x=-17 的凍結場景 (C7 起正式玄關的西區是 1-2d 拉繩)
    place(w, -17, 0, -5.2);
    expect(deriveHud(w, TEXT, { ...view, bindings: mergeBindings(DEFAULT_BINDINGS, { interact: ['KeyG'] }) }).prompt).toBe('[G] 閱讀　爸爸的筆記');
  });
});

describe('deriveHelp', () => {
  it('預設按鍵產生與舊 puzzle.html 相同的操作說明', () => {
    expect(deriveHelp(DEFAULT_BINDINGS).map(r => [r.keys, TEXT(r.labelKey)])).toEqual([
      [['WASD'], '移動'], [['Space'], '跳'], [['F', 'Q'], '點鋼筆（切換）'], [['E'], '互動'], [['T'], '物歸原處'], [['R'], '重新進房']
    ]);
  });

  it('重綁後說明一致', () => {
    const b = mergeBindings(DEFAULT_BINDINGS, { up: ['KeyI'], left: ['KeyJ'], down: ['KeyK'], right: ['KeyL'], flip: ['Digit1'] });
    expect(deriveHelp(b).map(r => r.keys)).toEqual([['IJKL'], ['Space'], ['1'], ['E'], ['T'], ['R']]);
  });
});
