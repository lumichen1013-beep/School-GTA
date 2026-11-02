import { describe, it, expect } from 'vitest';
import { CONFIRM_GUARD_MS, RestartConfirm, routeFrame } from '../../../src/puzzle/app/restartConfirm';
import { LevelLoop } from '../../../src/puzzle/app/loop';
import { KeyboardSource } from '../../../src/puzzle/input/keyboard';
import { DEFAULT_BINDINGS } from '../../../src/puzzle/input/bindings';
import { newWorld } from '../helpers';

describe('RestartConfirm', () => {
  it('關閉時 press 無作用；開窗後再按 R 不會確認', () => {
    const c = new RestartConfirm();
    expect(c.press(['confirm'], 1000)).toBeNull();
    c.open(1000);
    expect(c.isOpen).toBe(true);
    expect(c.press(['restart'], 1016)).toBeNull();
    expect(c.press(['restart'], 2000)).toBeNull();
    expect(c.isOpen).toBe(true);
  });

  it('Enter 在保護時間內被忽略，之後才確認並關窗', () => {
    const c = new RestartConfirm();
    c.open(1000);
    expect(c.press(['confirm'], 1000 + CONFIRM_GUARD_MS - 1)).toBeNull();
    expect(c.isOpen).toBe(true);
    expect(c.press(['confirm'], 1000 + CONFIRM_GUARD_MS)).toBe('confirm');
    expect(c.isOpen).toBe(false);
  });

  it('Esc 隨時取消 (含保護時間內)；同幀 Esc 優先於 Enter', () => {
    const c = new RestartConfirm();
    c.open(0);
    expect(c.press(['cancel'], 10)).toBe('cancel');
    expect(c.isOpen).toBe(false);
    c.open(0);
    expect(c.press(['confirm', 'cancel'], 5000)).toBe('cancel');
  });
});

describe('開窗期間世界暫停 / 取消後無卡鍵', () => {
  it('routeFrame：R→開窗→再按 R/Enter(300ms 內) 皆 wait，期間不是 update (世界不推進)；Enter 於 300ms 後 → confirm', () => {
    const g = new RestartConfirm();
    expect(routeFrame(g, 'level', [], 0)).toBe('update');
    expect(routeFrame(g, 'level', ['restart'], 100)).toBe('open');
    expect(routeFrame(g, 'level', [], 116)).toBe('wait');
    expect(routeFrame(g, 'level', ['restart'], 132)).toBe('wait');
    expect(routeFrame(g, 'level', ['confirm'], 200)).toBe('wait');
    expect(routeFrame(g, 'level', ['flip', 'reset', 'interact'], 250)).toBe('wait');
    expect(routeFrame(g, 'level', ['confirm'], 100 + CONFIRM_GUARD_MS)).toBe('confirm');
    expect(routeFrame(g, 'level', [], 500)).toBe('update');
  });

  it('routeFrame：Esc 取消後恢復 update；通關畫面 R 直接 restart 不開窗', () => {
    const g = new RestartConfirm();
    routeFrame(g, 'level', ['restart'], 0);
    expect(routeFrame(g, 'level', ['cancel'], 50)).toBe('cancel');
    expect(routeFrame(g, 'level', [], 66)).toBe('update');
    expect(routeFrame(g, 'clear', ['restart'], 80)).toBe('restart');
    expect(g.isOpen).toBe(false);
    expect(routeFrame(g, 'menu', ['confirm'], 90)).toBe('update');
  });

  it('開窗期間不呼叫 loop.frame，世界不動；恢復後才推進', () => {
    const w = newWorld();
    const loop = new LevelLoop(w, null);
    const g = new RestartConfirm();
    const x0 = w.player.x;
    const held = { moveX: 1, moveZ: 0, jump: false, pressed: [] as never[] };
    routeFrame(g, 'level', ['restart'], 0);
    for (let t = 16; t < 1000; t += 16) if (routeFrame(g, 'level', [], t) === 'update') loop.frame(0.016, held);
    expect(w.player.x).toBe(x0);
    routeFrame(g, 'level', ['cancel'], 1000);
    for (let t = 1016; t < 1500; t += 16) if (routeFrame(g, 'level', [], t) === 'update') loop.frame(0.016, held);
    expect(w.player.x).not.toBe(x0);
  });

  it('releaseAll 讓按著的鍵全部放開，並丟棄未取走的按鍵', () => {
    type H = (e: unknown) => void;
    const h: Record<string, H[]> = {};
    const target = { addEventListener: (t: string, f: H) => { (h[t] ??= []).push(f); }, removeEventListener: () => {} } as unknown as Window;
    const fire = (t: string, code: string, repeat = false) => (h[t] ?? []).forEach(f => f({ code, repeat, target: { tagName: 'BODY' }, preventDefault: () => {} }));
    const k = new KeyboardSource(DEFAULT_BINDINGS, target);
    fire('keydown', 'KeyD'); fire('keydown', 'Space'); fire('keydown', 'KeyE');
    k.releaseAll();
    const f = k.poll();
    expect([f.moveX, f.jump, f.pressed, f.anyKey]).toEqual([0, false, [], false]);
    fire('keydown', 'Enter'); fire('keydown', 'Escape');
    expect(k.poll().pressed).toEqual(['confirm', 'cancel']);
  });
});

describe('確認窗文字與說明', () => {
  it('文字表有確認窗四個 key；操作說明的 R 列帶「需確認」標示且原標籤不變', async () => {
    const { TEXT } = await import('../msgs');
    const { deriveHelp } = await import('../../../src/puzzle/app/hudModel');
    expect([TEXT('ui.confirm.restart.title'), TEXT('ui.confirm.restart.body'), TEXT('ui.confirm.restart.ok'), TEXT('ui.confirm.restart.cancel')])
      .toEqual(['要重新開始這一關嗎？', '這一關的進度會歸零。', '重新開始', '繼續玩']);
    const row = deriveHelp(DEFAULT_BINDINGS).find(r => r.labelKey === 'ui.help.restart')!;
    expect(TEXT(row.noteKey!)).toBe('（需確認）');
  });
});
