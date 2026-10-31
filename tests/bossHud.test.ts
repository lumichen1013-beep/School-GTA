import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy({}, { get: () => () => undefined })
}));

// 無 DOM 環境：以最小假元素驗證 class / style 切換
function fakeEl(): any {
  const classes = new Set<string>();
  const base: any = {
    style: {}, dataset: {}, offsetWidth: 0, textContent: '', children: [],
    classList: {
      add: (...c: string[]) => c.forEach((x) => classes.add(x)),
      remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
      toggle: (c: string, on?: boolean) => { const v = on ?? !classes.has(c); if (v) classes.add(c); else classes.delete(c); return v; },
      contains: (c: string) => classes.has(c)
    }
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : () => null), set: (t, k, v) => { t[k as string] = v; return true; } });
}

let els: Record<string, any>;
let bodyEl: any;

async function makeHud() {
  els = {};
  bodyEl = fakeEl();
  (globalThis as any).document = {
    getElementById: (id: string) => (els[id] ??= fakeEl()),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    addEventListener: () => undefined,
    body: bodyEl,
    documentElement: fakeEl()
  };
  (globalThis as any).window = (globalThis as any).window ?? { addEventListener: () => undefined, matchMedia: () => ({ matches: false, addEventListener: () => undefined }), innerWidth: 1340, innerHeight: 800 };
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
  const { HUD } = await import('../src/ui/HUD');
  return new HUD();
}

describe('花劍客 Boss 戰精簡 HUD', () => {
  beforeEach(() => { vi.resetModules(); });

  it('setBossFightHud 切換 body class，結束後恢復', async () => {
    const hud = await makeHud();
    hud.setBossFightHud(true);
    expect(bodyEl.classList.contains('boss-fight-hud')).toBe(true);
    hud.setBossFightHud(false);
    expect(bodyEl.classList.contains('boss-fight-hud')).toBe(false);
  });

  it('花劍客血條：單條 fill = 整場剩餘，換管閃光一次，結束隱藏', async () => {
    const hud = await makeHud();
    const el = els['boss-hud'];
    hud.setFencerBossHealth(6300, 6300, 0, true);
    expect(el.style.display).toBe('block');
    expect(el.classList.contains('boss-hud-fencer')).toBe(true);
    expect(els['boss-bar-fill'].style.width).toBe('100%');
    expect(el.dataset.bar).toBe('0');
    hud.setFencerBossHealth(4200, 6300, 1, true);
    expect(els['boss-bar-fill'].style.width).toBe('66.5%');
    expect(el.dataset.bar).toBe('1');
    expect(el.classList.contains('bar-flash')).toBe(true);
    hud.setFencerBossHealth(0, 6300, 2, true);
    expect(el.style.display).toBe('none');
  });

  it('其他 Boss 血條不變：沿用名稱與數字文字，並清除花劍客樣式', async () => {
    const hud = await makeHud();
    const el = els['boss-hud'];
    hud.setFencerBossHealth(6300, 6300, 0, true);
    hud.setBossHealth(1000, 1200, true, '總教官 Boss：鐵面總長', '🎖️');
    expect(el.classList.contains('boss-hud-fencer')).toBe(false);
    expect(els['boss-name-text'].textContent).toBe('總教官 Boss：鐵面總長');
    expect(els['boss-hp-text'].textContent).toBe('1000 / 1200');
    expect(els['boss-bar-fill'].style.width).toBe(`${(1000 / 1200) * 100}%`);
  });
});
