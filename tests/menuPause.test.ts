import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorldPause, RESUME_MAX_DT } from '../src/core/worldPause';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

// 模擬 main.tick：暫停幀 (enter / hold) 不推進世界時間，恢復第一幀 delta 夾制
function simulate(frames: { open: boolean; dt: number }[]) {
  const wp = new WorldPause();
  let worldTime = 0;
  const steps: string[] = [];
  const deltas: number[] = [];
  for (const f of frames) {
    const step = wp.step(f.open);
    steps.push(step);
    if (step === 'enter' || step === 'hold') continue;
    const d = step === 'resume' ? WorldPause.clampResumeDelta(f.dt) : f.dt;
    deltas.push(d);
    worldTime += d;
  }
  return { steps, deltas, worldTime, wp };
}

describe('WorldPause：選單暫停狀態機', () => {
  it('開啟 → enter，持續 → hold，關閉 → resume，之後 run', () => {
    const { steps } = simulate([
      { open: false, dt: 1 / 60 }, { open: true, dt: 1 / 60 }, { open: true, dt: 1 / 60 },
      { open: false, dt: 1 / 60 }, { open: false, dt: 1 / 60 },
    ]);
    expect(steps).toEqual(['run', 'enter', 'hold', 'resume', 'run']);
  });

  it('暫停期間世界時間不前進 (選單開 10 秒，世界只走未暫停的幀)', () => {
    const frames = [{ open: false, dt: 0.016 }];
    for (let i = 0; i < 600; i++) frames.push({ open: true, dt: 1 / 60 });
    frames.push({ open: false, dt: 0.016 });
    const { worldTime } = simulate(frames);
    expect(worldTime).toBeCloseTo(0.016 + 0.016, 6);
  });

  it('恢復第一幀 delta 夾制到 RESUME_MAX_DT (不因暫停累積而跳幀)', () => {
    const { deltas } = simulate([{ open: true, dt: 0.016 }, { open: false, dt: 0.1 }, { open: false, dt: 0.1 }]);
    expect(deltas[0]).toBe(RESUME_MAX_DT);
    expect(deltas[1]).toBe(0.1); // 之後恢復一般 delta
    expect(WorldPause.clampResumeDelta(0.005)).toBe(0.005);
  });

  it('paused 旗標隨狀態切換', () => {
    const wp = new WorldPause();
    expect(wp.step(true)).toBe('enter');
    expect(wp.paused).toBe(true);
    expect(wp.step(false)).toBe('resume');
    expect(wp.step(false)).toBe('run');
    expect(wp.paused).toBe(false);
  });

  it('暫停中 3D 只在進入後第一幀與繪圖緩衝尺寸改變時重繪', () => {
    const wp = new WorldPause();
    wp.step(true);
    expect(wp.needsRender('800x600')).toBe(true);
    wp.step(true);
    expect(wp.needsRender('800x600')).toBe(false);
    expect(wp.needsRender('600x800')).toBe(true); // 翻轉 / 畫質改像素比
    expect(wp.needsRender('600x800')).toBe(false);
    wp.step(false);
    wp.step(true); // 再次開啟：重新繪製一幀
    expect(wp.needsRender('600x800')).toBe(true);
  });
});

// ---------------- 輸入狀態清除 ----------------

type Listener = (e: any) => void;
function installFakeDom() {
  const listeners = new Map<string, Listener[]>();
  const add = (type: string, fn: Listener) => {
    const arr = listeners.get(type) ?? [];
    arr.push(fn);
    listeners.set(type, arr);
  };
  vi.stubGlobal('window', { addEventListener: add, innerWidth: 1280, innerHeight: 720 });
  vi.stubGlobal('document', { addEventListener: () => {}, getElementById: () => null, pointerLockElement: null });
  vi.stubGlobal('navigator', { maxTouchPoints: 0 });
  const fire = (type: string, e: any) => { for (const fn of listeners.get(type) ?? []) fn(e); };
  return { fire };
}

describe('InputManager.releaseAll：關閉選單後按鍵 / 搖桿不殘留', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('清空按鍵、滑鼠鍵、虛擬搖桿 / 衝刺 / 跳躍與累積視角，並通知手機搖桿歸位', async () => {
    const { fire } = installFakeDom();
    const { InputManager } = await import('../src/core/InputManager');
    const input = new InputManager({ addEventListener: () => {} } as unknown as HTMLCanvasElement);
    const onRelease = vi.fn();
    input.onReleaseAll(onRelease);

    fire('keydown', { code: 'KeyW', repeat: false });
    fire('keydown', { code: 'ShiftLeft', repeat: false });
    input.mouseButtons.left = true;
    input.setVirtualAxis(0, -1);
    input.setVirtualSprint(true);
    input.setVirtualJump(true);
    input.mouseDeltaX = 30;
    expect(input.forward && input.sprint && input.jump).toBe(true);

    input.releaseAll();
    expect(input.forward).toBe(false);
    expect(input.sprint).toBe(false);
    expect(input.jump).toBe(false);
    expect(input.mouseButtons.left).toBe(false);
    expect(input.virtualAxisMagnitude).toBe(0);
    expect(input.consumeMouseDelta().x).toBe(0);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('開選單前按住的鍵：之後的自動重複 keydown 不再視為按住，放開重按才生效', async () => {
    const { fire } = installFakeDom();
    const { InputManager } = await import('../src/core/InputManager');
    const input = new InputManager({ addEventListener: () => {} } as unknown as HTMLCanvasElement);
    fire('keydown', { code: 'KeyW', repeat: false });
    input.releaseAll();
    fire('keydown', { code: 'KeyW', repeat: true });
    expect(input.forward).toBe(false);
    fire('keyup', { code: 'KeyW' });
    fire('keydown', { code: 'KeyW', repeat: false });
    expect(input.forward).toBe(true);
  });
});

// ---------------- 主迴圈接線 ----------------

describe('main.tick：選單暫停經由單一暫停路徑', () => {
  const main = read('src/main.ts');
  const tick = main.slice(main.indexOf('private tick = '));

  it('暫停幀在任何世界更新 (含 hitstop scaleDelta) 之前 return，恢復幀夾制 delta', () => {
    const pauseAt = tick.indexOf("pauseStep === 'enter' || pauseStep === 'hold'");
    expect(pauseAt).toBeGreaterThan(0);
    expect(pauseAt).toBeLessThan(tick.indexOf('this.combat.scaleDelta(rawDelta)'));
    expect(tick).toContain('WorldPause.clampResumeDelta(rawDelta)');
  });

  it('動態解析度於暫停 (含恢復幀) 停止取樣', () => {
    expect(tick).toMatch(/qualityManager\.onFrame\(now, pauseStep !== 'run'/);
  });

  it('暫停 / 恢復時放開輸入、BGM 壓低 / 淡回、畫質量測中止 / 重排', () => {
    const paused = main.slice(main.indexOf('private tickMenuPaused'), main.indexOf('private readonly diag'));
    expect(paused.match(/this\.input\.releaseAll\(\)/g)?.length).toBe(2);
    expect(paused).toContain('bgmManager.setMenuDuck(true)');
    expect(paused).toContain('bgmManager.setMenuDuck(false)');
    expect(paused).toContain('qualityManager.setWorldPaused(true)');
    expect(paused).toContain('qualityManager.setWorldPaused(false)');
  });

  it('選單開啟中攻擊 / 互動 / 技能 / 投籃出手不觸發', () => {
    const bindings = main.slice(main.indexOf('private setupInputBindings'), main.indexOf('private toggleBGM'));
    expect(bindings.match(/this\.isMenuOpen/g)?.length).toBeGreaterThanOrEqual(3);
    expect(main).toMatch(/releaseBasketballShot = \(\) => \{\s*if \(!this\.isGameRunning \|\| this\.isMenuOpen\)/);
  });
});

describe('worldClock：實際時間計時於選單暫停期間不前進', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function freshClock() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.resetModules();
    return import('../src/core/worldClock');
  }

  it('worldNow：暫停期間停住，恢復後扣除暫停時長接續', async () => {
    const c = await freshClock();
    const t0 = c.worldNow();
    vi.advanceTimersByTime(1000);
    expect(c.worldNow() - t0).toBe(1000);
    c.setWorldClockPaused(true);
    vi.advanceTimersByTime(5000);
    expect(c.worldNow() - t0).toBe(1000);
    c.setWorldClockPaused(false);
    vi.advanceTimersByTime(250);
    expect(c.worldNow() - t0).toBe(1250);
  });

  it('worldTimeout：暫停期間不觸發 (如死亡 3 秒復活)，恢復後只等剩餘時間', async () => {
    const c = await freshClock();
    const fn = vi.fn();
    c.worldTimeout(fn, 3000);
    vi.advanceTimersByTime(1000);
    c.setWorldClockPaused(true);
    vi.advanceTimersByTime(10000);
    expect(fn).not.toHaveBeenCalled();
    c.setWorldClockPaused(false);
    vi.advanceTimersByTime(1999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('暫停中排程的計時從恢復後才開始走；clearWorldTimeout 可取消 (暫停中亦可)', async () => {
    const c = await freshClock();
    c.setWorldClockPaused(true);
    const a = vi.fn();
    const b = vi.fn();
    c.worldTimeout(a, 500);
    const idB = c.worldTimeout(b, 500);
    vi.advanceTimersByTime(2000);
    c.clearWorldTimeout(idB);
    c.setWorldClockPaused(false);
    vi.advanceTimersByTime(499);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('重複呼叫暫停 / 恢復不重複累計', async () => {
    const c = await freshClock();
    const t0 = c.worldNow();
    c.setWorldClockPaused(true);
    c.setWorldClockPaused(true);
    vi.advanceTimersByTime(300);
    c.setWorldClockPaused(false);
    c.setWorldClockPaused(false);
    vi.advanceTimersByTime(100);
    expect(c.worldNow() - t0).toBe(100);
  });
});

describe('遊戲邏輯的實際時間計時皆改用 worldClock', () => {
  const files: [string, RegExp][] = [
    ['src/main.ts', /worldTimeout\(\(\) => \{\n\s*\/\/ 復活點/],                               // 死亡 3 秒復活
    ['src/main.ts', /if \(fencerNote\) worldTimeout\(/],                                         // 復活後向陽之心打氣
    ['src/game/InteractionSystem.ts', /worldTimeout\(\(\) => \{ player\.sprintSpeed = 10\.0; \}, 8000\)/], // 輪胎特訓 8 秒衝刺
    ['src/game/InteractionSystem.ts', /player\.jumpStrength = 8\.5;/],                           // 寶箱超級跳躍
    ['src/world/EcologicalGarden.ts', /worldTimeout\(step, 50\)/],                               // 食人花王死亡傾倒
    ['src/game/fencer/FencerBossFight.ts', /this\.taunt\.poke\(worldNow\(\) \/ 1000\)/],          // 向日葵再戳時窗
    ['src/systems/WantedSystem.ts', /this\.bannerTimeout = worldTimeout\(/],                     // 提示橫幅
    ['src/game/DetentionMode.ts', /\(worldNow\(\) - this\.escapeStartTime\)/],                   // 越獄計時
    ['src/game/CombatSystem.ts', /this\.qteStartMs = worldNow\(\)/],                             // 處決計量表
  ];
  it.each(files)('%s', (file, re) => {
    expect(read(file)).toMatch(re);
  });

  it('上述檔案不再以 setTimeout / setInterval / performance.now 計時遊戲邏輯', () => {
    for (const f of ['src/game/InteractionSystem.ts', 'src/world/EcologicalGarden.ts', 'src/systems/WantedSystem.ts', 'src/game/DetentionMode.ts', 'src/game/Progression.ts', 'src/systems/BasketballGame.ts']) {
      expect(read(f)).not.toMatch(/\bsetTimeout\(|setInterval\(|performance\.now\(\)|Date\.now\(\)/);
    }
    const combat = read('src/game/CombatSystem.ts');
    expect(combat).not.toMatch(/performance\.now\(\)/);
  });

  it('main 於進入 / 結束選單暫停時停住 / 恢復世界時鐘', () => {
    const main = read('src/main.ts');
    const paused = main.slice(main.indexOf('private tickMenuPaused'), main.indexOf('private readonly diag'));
    expect(paused).toContain('setWorldClockPaused(true)');
    expect(paused).toContain('setWorldClockPaused(false)');
  });
});
