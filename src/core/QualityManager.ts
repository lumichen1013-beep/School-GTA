import type { Engine } from './Engine';
import { isTouchDevice } from './device';
import {
  PROBE, QUALITY_PRESETS, QUALITY_STORAGE_KEY, FPS_LOCK_STORAGE_KEY, MODE_LABELS,
  analyzeFrames, areaChangedSignificantly, decideFromHigh, decideFromMedium, makeDeviceKey,
  parseStoredQuality, resolveAntialias, resolveFpsCap, resolvePixelRatio, resolveStartupTier, serializeStoredQuality,
  dynamicResolutionAllowed, shadowThrottled,
  type QualityMode, type QualityTier, type StoredQuality,
} from './quality';
import { getDiagFlags } from './diagFlags';
import { setFxTier } from '../effects/fxQuality';
import { setNpcLodDistanceScale } from '../entities/npc/lod';
import { DynamicResolutionController } from './dynamicResolution';

type ProbePhase = 'idle' | 'waiting' | 'settle-medium' | 'measure-medium' | 'settle-high' | 'measure-high';

// 畫質管理：讀寫設定 (localStorage)、套用檔位 (像素比 / 陰影 / 特效 / NPC 分級距離)、自動模式開局實測 FPS
class QualityManager {
  private engine: Engine | null = null;
  private stored: StoredQuality = { mode: 'auto', auto: null };
  private _tier: QualityTier = 'medium';
  private deviceKey = '';
  private gpu = '';
  private blurOff = false; // 本次頁面是否已關閉 backdrop-filter (觸控裝置或 ?diag=&blur=0)；偵測結果以此為條件
  private needProbe = false;
  private lastFps: number | null = null;

  private phase: ProbePhase = 'idle';
  private phaseUntil = 0;
  private phaseStart = 0;
  private intervals: number[] = [];
  private lastFrameAt = 0;
  private probeRaf = 0;
  private probeTimer = 0;
  private mediumFps = 0;
  private areaCheckTimer = 0;
  private probeArmed = false; // 已進入世界 (開始畫面期間不量測)
  private fpsLockUser: boolean | null = null; // 使用者手動「鎖定 30 FPS」開關 (null = 跟隨檔位)
  private aaNoticeShown = false;
  // 動態解析度 (觸控中檔備援)
  private readonly dynRes = new DynamicResolutionController(1);
  private dynResActive = false;
  private dynLastFrameAt = 0;
  private dynTransition = false;

  private listeners = new Set<() => void>();
  // 自動偵測完成時的簡短提示 (由 main 接到 HUD 橫幅)
  public onNotify?: (text: string) => void;
  // 陰影開關切換 (材質需重新編譯) 後通知 main 重新預熱特效 shader
  public onShaderStateChange?: () => void;

  get mode(): QualityMode { return this.stored.mode; }
  get tier(): QualityTier { return this._tier; }
  get measuredFps(): number | null { return this.lastFps; }
  get isProbing(): boolean { return this.phase !== 'idle'; }
  get gpuRenderer(): string { return this.gpu; }

  // 目前生效的幀率上限 (0 = 不限)；開局偵測期間暫時解除
  get fpsCap(): number {
    return resolveFpsCap(QUALITY_PRESETS[this._tier].fpsCap, this.fpsLockUser, this.isProbing, getDiagFlags().fps);
  }
  // 設定 UI 開關狀態：使用者設定優先，否則跟隨檔位預設
  get fpsLocked(): boolean {
    return this.fpsLockUser ?? QUALITY_PRESETS[this._tier].fpsCap > 0;
  }
  // 本次 context 的抗鋸齒設定，與下次啟動將採用的設定是否不同 (需重新整理才生效)
  get aaRestartNeeded(): boolean {
    if (!this.engine || getDiagFlags().aa !== null) return false;
    return resolveAntialias(this.stored) !== this.engine.antialias;
  }
  get antialias(): boolean { return this.engine?.antialias ?? true; }

  // 綁定引擎並套用啟動檔位 (須在第一次 compile / render 前呼叫，陰影開關不額外產生重新編譯)
  public attach(engine: Engine) {
    this.engine = engine;
    this.stored = parseStoredQuality(this.readStorage());
    // 觸控裝置不分檔位一律關閉毛玻璃 (style.css 的 .no-blur)，須在第一次偵測前就生效，
    // 否則偵測會把毛玻璃造成的低幀率誤判為低檔。桌機偵測時維持原狀 (毛玻璃開啟，與中、高檔最終狀態一致)。
    // 診斷面板僅在 ?diag= 時建立，一般玩家偵測不受其影響。
    this.blurOff = isTouchDevice() || getDiagFlags().blur === false;
    document.body.classList.toggle('no-blur', isTouchDevice());
    this.fpsLockUser = this.readFpsLock();
    this.gpu = readGpuRenderer(engine);
    this.deviceKey = makeDeviceKey({
      screenW: window.screen?.width || window.innerWidth,
      screenH: window.screen?.height || window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      touch: isTouchDevice(),
      gpu: this.gpu,
    });
    const start = resolveStartupTier(this.stored, this.deviceKey, viewportArea(), this.blurOff);
    this.needProbe = start.needProbe;
    if (!start.needProbe && this.stored.mode === 'auto' && this.stored.auto) this.lastFps = this.stored.auto.fps;
    this.applyTier(start.tier);
    document.addEventListener('visibilitychange', () => {
      // 量測中切到背景：中止並於回到前景後重新開始 (背景分頁 rAF 停擺，數據無效)
      if (document.hidden && this.isProbing) {
        this.cancelProbe();
        this.needProbe = true;
      } else if (!document.hidden && this.needProbe && this.probeArmed) {
        this.scheduleProbe(PROBE.START_DELAY_MS);
      }
    });
  }

  /** 選單暫停開關 (同 visibilitychange)：暫停時世界不渲染，量測中則中止，恢復後重新開始 */
  private worldPaused = false;
  public setWorldPaused(paused: boolean) {
    this.worldPaused = paused;
    if (paused && this.isProbing) {
      this.cancelProbe();
      this.needProbe = true;
    } else if (!paused && this.needProbe && this.probeArmed && this.phase === 'idle') {
      this.scheduleProbe(PROBE.START_DELAY_MS);
    }
  }

  // 進入世界且 shader 預熱完成後呼叫：自動模式且尚無有效結果時，延遲後開始量測
  public startAutoProbeIfNeeded() {
    this.probeArmed = true;
    if (this.stored.mode === 'auto' && this.needProbe && !this.isProbing) this.scheduleProbe(PROBE.START_DELAY_MS);
  }

  public onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // 手動選擇 (含切回自動)：存檔並立即套用
  public setMode(mode: QualityMode) {
    this.stored.mode = mode;
    this.writeStorage();
    if (mode !== 'auto') {
      this.cancelProbe();
      this.needProbe = false;
      this.applyTier(mode);
    } else {
      const start = resolveStartupTier(this.stored, this.deviceKey, viewportArea(), this.blurOff);
      this.lastFps = start.needProbe ? this.lastFps : this.stored.auto?.fps ?? null;
      this.applyTier(start.tier);
      this.needProbe = start.needProbe;
      if (start.needProbe && this.probeArmed) this.scheduleProbe(PROBE.SETTLE_MS);
    }
    this.emit();
  }

  // 「鎖定 30 FPS」手動開關：存檔並優先於檔位預設
  public setFpsLock(on: boolean) {
    this.fpsLockUser = on;
    try { window.localStorage.setItem(FPS_LOCK_STORAGE_KEY, on ? '1' : '0'); } catch { /* 無法寫入時僅本次生效 */ }
    this.emit();
  }

  // 重新偵測：切回自動模式並清除舊結果，立即開始量測
  public redetect() {
    this.stored.mode = 'auto';
    this.stored.auto = null;
    this.writeStorage();
    this.cancelProbe();
    this.needProbe = true;
    this.probeArmed = true;
    this.scheduleProbe(0);
    this.emit();
  }

  // 視窗尺寸改變 (Engine resize 後呼叫)：自動模式下面積與偵測時差異過大 (全螢幕、分割畫面) 時延遲重新偵測
  public onViewportChange() {
    if (this.stored.mode !== 'auto' || !this.stored.auto || this.isProbing) return;
    clearTimeout(this.areaCheckTimer);
    this.areaCheckTimer = window.setTimeout(() => {
      const a = this.stored.auto;
      if (this.stored.mode !== 'auto' || !a || this.isProbing) return;
      if (areaChangedSignificantly(a.area, viewportArea())) {
        this.needProbe = true;
        if (this.probeArmed) this.scheduleProbe(PROBE.START_DELAY_MS);
      }
    }, 1500);
  }

  public statusText(): string {
    const label = QUALITY_PRESETS[this._tier].label;
    const src = this.stored.mode === 'auto' ? '自動' : '手動';
    if (this.isProbing) return `${label}・${src}偵測中…`;
    const fps = this.lastFps !== null ? `・${Math.round(this.lastFps)} FPS` : '';
    return `${label}・${src}${fps}`;
  }

  // ---------------- 套用 ----------------

  private applyTier(tier: QualityTier) {
    this._tier = tier;
    const p = QUALITY_PRESETS[tier];
    // 低檔關閉 backdrop-filter (見 style.css 的 .q-low；觸控裝置另由 .no-blur 一律關閉)
    document.body.classList.toggle('q-low', tier === 'low');
    setFxTier(tier);
    setNpcLodDistanceScale(p.npcLodScale);
    if (this.engine) {
      this.disableDynRes(false); // 換檔解除動態像素比 (由下方 setQualityParams 一併套用)，動態解析度依新檔位重新開始
      const shaderChanged = this.engine.setQualityParams(p.pixelRatioMax, p.shadowMapSize);
      this.engine.shadowScheduler.setThrottled(shadowThrottled(tier, isTouchDevice()));
      if (shaderChanged && this.onShaderStateChange) this.onShaderStateChange();
    }
    this.emit();
  }

  // ---------------- 動態解析度 ----------------

  /** 每個實際執行幀呼叫 (main.tick)：觸控中檔、未鎖幀、非偵測中時依實測 FPS 微調像素比 */
  public onFrame(now: number, paused: boolean = false) {
    if (!this.engine) return;
    const allowed = dynamicResolutionAllowed({
      touch: isTouchDevice(), tier: this._tier, probing: this.isProbing, fpsCap: this.fpsCap, forcedRatio: getDiagFlags().rs,
    });
    if (!allowed) { this.disableDynRes(); return; }
    if (!this.dynResActive) {
      this.dynResActive = true;
      this.dynRes.reset(this.expectedPixelRatio(), now);
      this.dynLastFrameAt = now;
      return;
    }
    const dt = now - this.dynLastFrameAt;
    this.dynLastFrameAt = now;
    const next = this.dynRes.onFrame(now, dt, paused || this.dynTransition);
    this.dynTransition = false;
    if (next !== null) {
      this.engine.setDynamicPixelRatio(next);
      this.emit();
    }
  }

  /** 場景切換 (切世界等一次性事件)：下一幀起暫停動態解析度取樣並緩衝 */
  public noteSceneTransition() { this.dynTransition = true; }

  private disableDynRes(apply: boolean = true) {
    if (!this.dynResActive) return;
    this.dynResActive = false;
    this.engine?.setDynamicPixelRatio(null, apply);
  }

  /** 診斷：動態解析度狀態 */
  public dynResInfo(): { active: boolean; ratio: number; max: number } {
    return { active: this.dynResActive, ratio: this.dynRes.ratio, max: this.dynRes.max };
  }

  // ---------------- 開局實測 ----------------

  private scheduleProbe(delay: number) {
    this.cancelProbe();
    this.phase = 'waiting';
    this.probeTimer = window.setTimeout(() => {
      this.probeTimer = 0;
      if (document.hidden || this.worldPaused) { this.phase = 'idle'; this.needProbe = true; this.emit(); return; }
      this.beginPhase('settle-medium', PROBE.SETTLE_MS);
      if (this._tier !== 'medium') this.applyTier('medium');
      this.lastFrameAt = 0;
      this.probeRaf = requestAnimationFrame(this.onProbeFrame);
    }, delay);
    this.emit();
  }

  private cancelProbe() {
    if (this.probeTimer) { clearTimeout(this.probeTimer); this.probeTimer = 0; }
    if (this.probeRaf) { cancelAnimationFrame(this.probeRaf); this.probeRaf = 0; }
    const was = this.phase !== 'idle';
    this.phase = 'idle';
    this.intervals.length = 0;
    if (was) this.emit();
  }

  private beginPhase(phase: ProbePhase, durationMs: number) {
    this.phase = phase;
    this.phaseStart = performance.now();
    this.phaseUntil = this.phaseStart + durationMs;
    this.intervals.length = 0;
  }

  private onProbeFrame = (now: number) => {
    this.probeRaf = 0;
    if (this.phase === 'idle' || this.phase === 'waiting') return;
    if (this.lastFrameAt > 0 && (this.phase === 'measure-medium' || this.phase === 'measure-high')) {
      this.intervals.push(now - this.lastFrameAt);
    }
    this.lastFrameAt = now;
    if (now >= this.phaseUntil) this.advance(now);
    if ((this.phase as ProbePhase) !== 'idle') this.probeRaf = requestAnimationFrame(this.onProbeFrame); // advance 可能結束量測
  };

  private advance(now: number) {
    switch (this.phase) {
      case 'settle-medium':
        this.beginPhase('measure-medium', PROBE.MEDIUM_MS);
        return;
      case 'settle-high':
        this.beginPhase('measure-high', PROBE.HIGH_MS);
        return;
      case 'measure-medium':
      case 'measure-high': {
        const stats = analyzeFrames(this.intervals);
        // 樣本不足 (極低幀率) 時延長量測，超過延長上限仍以現有樣本判斷
        if (stats.frames < PROBE.MIN_FRAMES && now - this.phaseStart < (this.phase === 'measure-medium' ? PROBE.MEDIUM_MS : PROBE.HIGH_MS) + PROBE.MAX_EXTEND_MS) {
          this.phaseUntil = now + 500;
          return;
        }
        if (this.phase === 'measure-medium') {
          this.mediumFps = stats.fps;
          const next = decideFromMedium(stats);
          if (next === 'high') {
            this.applyTier('high');
            this.beginPhase('settle-high', PROBE.SETTLE_MS);
            this.emit();
            return;
          }
          this.finishProbe(next, stats.fps);
        } else {
          const keep = decideFromHigh(stats);
          this.finishProbe(keep, keep === 'high' ? stats.fps : this.mediumFps);
        }
        return;
      }
    }
  }

  private finishProbe(tier: QualityTier, fps: number) {
    this.phase = 'idle';
    this.intervals.length = 0;
    this.needProbe = false;
    this.lastFps = fps;
    this.stored.auto = { tier, fps: Math.round(fps * 10) / 10, key: this.deviceKey, area: viewportArea(), blurOff: this.blurOff, at: Date.now() };
    this.writeStorage();
    if (this.stored.mode === 'auto') {
      if (tier !== this._tier) this.applyTier(tier);
      if (this.onNotify) this.onNotify(`已自動調整畫質：${MODE_LABELS[tier]}`);
      // 抗鋸齒只能在建立 context 時決定：提示一次，下次啟動才套用
      if (this.aaRestartNeeded && !this.aaNoticeShown && this.onNotify) {
        this.aaNoticeShown = true;
        this.onNotify('抗鋸齒變更將於重新整理後生效');
      }
    }
    this.emit();
  }

  // ---------------- 儲存 ----------------

  private readStorage(): string | null {
    try { return window.localStorage.getItem(QUALITY_STORAGE_KEY); } catch { return null; }
  }

  private readFpsLock(): boolean | null {
    try {
      const v = window.localStorage.getItem(FPS_LOCK_STORAGE_KEY);
      return v === '1' ? true : v === '0' ? false : null;
    } catch { return null; }
  }

  private writeStorage() {
    try { window.localStorage.setItem(QUALITY_STORAGE_KEY, serializeStoredQuality(this.stored)); } catch { /* 無痕模式等無法寫入時僅本次生效 */ }
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  // 診斷用：目前像素比與繪圖解析度，以及上一次 render 的 draw calls / 三角形 / shader programs 數
  public rendererInfo(): { pixelRatio: number; width: number; height: number; shadow: number; calls: number; triangles: number; programs: number } {
    const r = this.engine?.renderer;
    if (!r) return { pixelRatio: 0, width: 0, height: 0, shadow: 0, calls: 0, triangles: 0, programs: 0 };
    return {
      pixelRatio: r.getPixelRatio(), width: r.domElement.width, height: r.domElement.height, shadow: this.engine!.getShadowMapSize(),
      calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs?.length ?? 0,
    };
  }

  public shadowInfo(): { isThrottled: boolean; recentUpdates: number; recentFrames: number; watchedCount: number } {
    const s = this.engine?.shadowScheduler;
    return { isThrottled: s?.isThrottled ?? false, recentUpdates: s?.recentUpdates ?? 0, recentFrames: s?.recentFrames ?? 0, watchedCount: s?.watchedCount ?? 0 };
  }

  public expectedPixelRatio(): number {
    return resolvePixelRatio(window.devicePixelRatio || 1, this._tier);
  }
}

function viewportArea(): number {
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  return Math.max(1, Math.round(w * h));
}

function readGpuRenderer(engine: Engine): string {
  try {
    const gl = engine.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const v = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

export const qualityManager = new QualityManager();
