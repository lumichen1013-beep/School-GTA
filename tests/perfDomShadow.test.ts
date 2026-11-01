import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { ShadowScheduler, shouldUpdateShadow, SHADOW_MAX_STALE_FRAMES } from '../src/core/shadowScheduler';
import { DynamicResolutionController, DYN_RES } from '../src/core/dynamicResolution';
import { dynamicResolutionAllowed, shadowThrottled } from '../src/core/quality';
import { CONCEALED_CLASS, setConcealed } from '../src/ui/uiConceal';
import { freezeStatic } from '../src/world/sceneUtils';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

// ---------------- HUD 隱藏改 opacity 後仍不可點擊 ----------------

describe('uiConceal：大型容器以 opacity 隱藏且不可點擊', () => {
  function fakeEl() {
    const classes = new Set<string>();
    const attrs = new Map<string, string>();
    return {
      classes, attrs, inert: false,
      classList: { toggle: (c: string, on?: boolean) => { const v = on ?? !classes.has(c); if (v) classes.add(c); else classes.delete(c); return v; } },
      setAttribute: (k: string, v: string) => { attrs.set(k, v); },
      removeAttribute: (k: string) => { attrs.delete(k); },
    };
  }

  it('隱藏：加 class、inert、aria-hidden；顯示：全部移除', () => {
    const el = fakeEl();
    setConcealed(el, true);
    expect(el.classes.has(CONCEALED_CLASS)).toBe(true);
    expect(el.inert).toBe(true);
    expect(el.attrs.get('aria-hidden')).toBe('true');
    setConcealed(el, false);
    expect(el.classes.has(CONCEALED_CLASS)).toBe(false);
    expect(el.inert).toBe(false);
    expect(el.attrs.has('aria-hidden')).toBe(false);
  });

  it('CSS：隱藏時自身與所有子孫 pointer-events:none !important (子元素自設 auto 亦無效)，且只動 opacity', () => {
    const css = read('src/style.css').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.ui-concealed, \.ui-concealed \* \{ pointer-events: none !important; \}/);
    expect(css).toMatch(/\.ui-concealed \{ opacity: 0 !important;/);
    // 過場短暫隱藏的 HUD / 觸控按鍵保留不可見的極小 opacity (< 1/255) 讓合成層貼圖常駐
    const eps = css.match(/#hud-overlay\.ui-concealed, #mobile-controls-container\.ui-concealed \{ opacity: ([\d.]+) !important; \}/);
    expect(eps).not.toBeNull();
    expect(Number(eps![1])).toBeGreaterThan(0);
    expect(Number(eps![1]) * 255).toBeLessThan(1.1);
    // 常駐合成層只加在少數大型容器上
    const m = css.match(/((?:#[\w-]+, )*#[\w-]+) \{ will-change: opacity; \}/);
    expect(m).not.toBeNull();
    const ids = m![1].split(', ');
    expect(ids).toEqual(expect.arrayContaining(['#hud-overlay', '#mobile-controls-container', '#minimap-wrapper', '#cutscene-overlay']));
    expect(ids.length).toBeLessThanOrEqual(8);
  });

  it('字幕遮罩開局即為隱藏狀態 (inert、不可點擊)，不再以 display 切換', () => {
    const html = read('index.html');
    expect(html).toMatch(/<div id="cutscene-overlay" class="ui-concealed" aria-hidden="true" inert>/);
    expect(read('src/main.ts')).not.toMatch(/cutsceneOverlay\.style\.display/);
  });

  it('過場 / 雷達暫停不再切換大型容器的 visibility / display', () => {
    const boss = read('src/game/fencer/FencerBossFight.ts');
    const hud = read('src/ui/HUD.ts');
    const det = read('src/world/DetentionCutscene.ts');
    for (const src of [boss, det]) expect(src).not.toMatch(/style\.visibility/);
    const radar = hud.slice(hud.indexOf('public setRadarSuspended'), hud.indexOf('public setRadarSuspended') + 600);
    expect(radar).not.toMatch(/style\.visibility/);
    expect(radar).toMatch(/radar-offline/);
    expect(radar).not.toMatch(/setConcealedById/);
    expect(boss).toMatch(/setConcealedById\('hud-overlay', on\)/);
    expect(boss).toMatch(/setConcealedById\('mobile-controls-container', on\)/);
  });

  it('閃白層於預熱時預先建立且常駐 will-change:opacity、不可點擊', () => {
    const boss = read('src/game/fencer/FencerBossFight.ts');
    const prewarm = boss.slice(boss.indexOf('public prewarm('));
    expect(prewarm).toMatch(/this\.ensureFlashEl\(\)/);
    expect(boss).toMatch(/pointer-events:none;z-index:9000;will-change:opacity;/);
  });
});

// ---------------- 陰影降頻 ----------------

describe('shouldUpdateShadow', () => {
  const base = { framesSinceUpdate: 5, mapMissing: false, invalidated: false, casterChanged: false, focusMoved: false };
  it('無變化不重繪；任一變化即重繪', () => {
    expect(shouldUpdateShadow(base)).toBe(false);
    expect(shouldUpdateShadow({ ...base, casterChanged: true })).toBe(true);
    expect(shouldUpdateShadow({ ...base, focusMoved: true })).toBe(true);
    expect(shouldUpdateShadow({ ...base, invalidated: true })).toBe(true);
  });
  it('最多隔幀一次：上一幀剛重繪則本幀不重繪', () => {
    expect(shouldUpdateShadow({ ...base, framesSinceUpdate: 1, casterChanged: true, focusMoved: true })).toBe(false);
    expect(shouldUpdateShadow({ ...base, framesSinceUpdate: 2, casterChanged: true })).toBe(true);
  });
  it('貼圖遺失立即重建；過久未重繪保險重繪', () => {
    expect(shouldUpdateShadow({ ...base, framesSinceUpdate: 1, mapMissing: true })).toBe(true);
    expect(shouldUpdateShadow({ ...base, framesSinceUpdate: SHADOW_MAX_STALE_FRAMES })).toBe(true);
  });
});

describe('ShadowScheduler', () => {
  function setup() {
    const scene = new THREE.Scene();
    const staticGroup = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    wall.castShadow = true;
    staticGroup.add(wall);
    const world = new THREE.Group();
    world.add(staticGroup);
    scene.add(world);
    freezeStatic(world);
    const npc = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    npc.castShadow = true;
    scene.add(npc);
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    (light.shadow as any).map = {}; // 已有貼圖
    const renderer = { shadowMap: { autoUpdate: true, needsUpdate: false } } as unknown as THREE.WebGLRenderer;
    const s = new ShadowScheduler();
    s.setThrottled(true);
    s.setFocusCell(0, 0);
    const frame = (): boolean => {
      s.beforeRender(renderer, light);
      const upd = renderer.shadowMap.needsUpdate;
      scene.updateMatrixWorld(); // 模擬 render 內更新世界矩陣
      s.afterRender(scene);
      return upd;
    };
    return { scene, staticGroup, npc, light, renderer, s, frame };
  }

  it('靜止場景：首幀重繪後不再重繪 (直到保險間隔)', () => {
    const { frame, renderer } = setup();
    expect(frame()).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(false);
    let n = 0;
    for (let i = 0; i < 30; i++) if (frame()) n++;
    expect(n).toBe(0);
  });

  it('動態投影物每幀移動：最多隔幀重繪一次', () => {
    const { frame, npc } = setup();
    frame();
    const hits: boolean[] = [];
    for (let i = 0; i < 20; i++) { npc.position.x += 0.05; hits.push(frame()); }
    expect(hits.filter(Boolean).length).toBe(10);
    for (let i = 1; i < hits.length; i++) expect(hits[i] && hits[i - 1]).toBe(false);
  });

  it('單次移動後停下：下一個允許的幀重繪一次即停止', () => {
    const { frame, npc } = setup();
    frame();
    frame(); frame();
    npc.position.x += 1;
    const seq = [frame(), frame(), frame(), frame()];
    expect(seq.filter(Boolean).length).toBe(1);
  });

  it('焦點移動超過一個貼圖像素才重繪', () => {
    const { frame, s } = setup();
    frame(); frame(); frame();
    expect(frame()).toBe(false);
    s.setFocusCell(1, 0);
    expect(frame()).toBe(true);
    expect(frame()).toBe(false);
  });

  it('凍結子樹整片隱藏 (結界戰卸載校園) 也會重繪', () => {
    const { frame, staticGroup } = setup();
    frame(); frame(); frame();
    staticGroup.visible = false;
    expect(frame() || frame()).toBe(true); // render 後才比對，最多晚 1 幀
  });

  it('自場景移除投影物會重繪', () => {
    const { frame, npc, scene } = setup();
    frame(); frame(); frame();
    scene.remove(npc);
    expect(frame() || frame()).toBe(true);
  });

  it('貼圖遺失立即重建；高檔 (不降頻) 維持每幀 autoUpdate', () => {
    const { frame, light, s, renderer } = setup();
    frame();
    (light.shadow as any).map = null;
    expect(frame()).toBe(true);
    s.setThrottled(false);
    frame();
    expect(renderer.shadowMap.autoUpdate).toBe(true);
  });

  it('檔位：中 / 低檔與觸控裝置降頻，桌機高檔每幀', () => {
    expect(shadowThrottled('high', false)).toBe(false);
    expect(shadowThrottled('high', true)).toBe(true);
    expect(shadowThrottled('medium', false)).toBe(true);
    expect(shadowThrottled('low', false)).toBe(true);
  });
});

// ---------------- 動態解析度 ----------------

describe('DynamicResolutionController', () => {
  // 以固定幀間隔推進 ms 毫秒，回傳過程中所有像素比變化
  function run(c: DynamicResolutionController, clock: { t: number }, fps: number, ms: number): number[] {
    const dt = 1000 / fps;
    const out: number[] = [];
    for (let e = 0; e < ms; e += dt) {
      clock.t += dt;
      const r = c.onFrame(clock.t, dt);
      if (r !== null) out.push(r);
    }
    return out;
  }
  function make(max = 1.33) {
    const c = new DynamicResolutionController(max);
    const clock = { t: 0 };
    c.reset(max, 0);
    run(c, clock, 60, DYN_RES.SETTLE_MS); // 暖機
    return { c, clock };
  }

  it('< 55 持續 2 秒才降 0.1；不足 2 秒不降', () => {
    const { c, clock } = make();
    expect(run(c, clock, 45, 1500)).toEqual([]);
    run(c, clock, 60, 600); // 中斷
    expect(run(c, clock, 45, 1900)).toEqual([]);
    expect(run(c, clock, 45, 600)).toEqual([1.23]);
  });

  it('過場期間低 FPS 不降級；結束後 2 秒緩衝不降級；之後正常降級', () => {
    const { c, clock } = make();
    const runP = (fps: number, ms: number, paused: boolean) => {
      const dt = 1000 / fps; const out: number[] = [];
      for (let e = 0; e < ms; e += dt) { clock.t += dt; const r = c.onFrame(clock.t, dt, paused); if (r !== null) out.push(r); }
      return out;
    };
    expect(runP(30, 8000, true)).toEqual([]);
    expect(c.ratio).toBe(1.33);
    // 緩衝 2 秒內低 FPS 不計入 (略少於 2 秒，之後的累計不應被緩衝期污染)
    expect(runP(30, DYN_RES.RESUME_QUIET_MS - 100, false)).toEqual([]);
    // 緩衝結束後仍需完整 2 秒才降
    expect(runP(30, 1500, false)).toEqual([]);
    expect(runP(30, 1000, false)).toEqual([1.23]);
  });

  it('死區 55~58 不升不降；下限 1.0', () => {
    const { c, clock } = make();
    expect(run(c, clock, 56.5, 20000)).toEqual([]);
    expect(run(c, clock, 40, 30000)).toEqual([1.23, 1.13, 1.03, 1]);
    expect(c.ratio).toBe(1);
  });

  it('> 58 持續 5 秒升 0.1，上限為該檔原值', () => {
    const { c, clock } = make();
    run(c, clock, 40, 30000);
    expect(c.ratio).toBe(1);
    expect(run(c, clock, 60, 4400)).toEqual([]);
    expect(run(c, clock, 60, 1000)).toEqual([1.1]);
    expect(run(c, clock, 60, 60000)).toEqual([1.2, 1.3, 1.33]);
    expect(run(c, clock, 60, 20000)).toEqual([]);
  });

  it('遲滯：升級後 10 秒內又降級，60 秒內不再升回該級', () => {
    const { c, clock } = make();
    run(c, clock, 40, 7000); // 1.33 → 1.23 → 1.13
    expect(c.ratio).toBe(1.13);
    expect(run(c, clock, 60, 6000)).toEqual([1.23]);
    expect(run(c, clock, 45, 3500)).toEqual([1.13]); // 剛升就撐不住
    expect(run(c, clock, 60, 50000)).toEqual([]);   // 鎖住
    expect(run(c, clock, 60, 15000)).toEqual([1.23]); // 解鎖後才再升
  });

  it('長間隔 (切分頁) 重新累計', () => {
    const { c, clock } = make();
    run(c, clock, 45, 1800);
    clock.t += 1000;
    expect(c.onFrame(clock.t, 1000)).toBeNull();
    expect(run(c, clock, 45, 1800)).toEqual([]);
  });

  it('只在觸控中檔、未鎖幀、非偵測中、無強制像素比時啟用', () => {
    const ok = { touch: true, tier: 'medium' as const, probing: false, fpsCap: 0, forcedRatio: null };
    expect(dynamicResolutionAllowed(ok)).toBe(true);
    expect(dynamicResolutionAllowed({ ...ok, touch: false })).toBe(false);
    expect(dynamicResolutionAllowed({ ...ok, tier: 'high' })).toBe(false);
    expect(dynamicResolutionAllowed({ ...ok, tier: 'low' })).toBe(false);
    expect(dynamicResolutionAllowed({ ...ok, probing: true })).toBe(false);
    expect(dynamicResolutionAllowed({ ...ok, fpsCap: 30 })).toBe(false);
    expect(dynamicResolutionAllowed({ ...ok, forcedRatio: 1 })).toBe(false);
  });
});
