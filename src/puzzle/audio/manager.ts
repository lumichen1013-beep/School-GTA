// AudioManager (audio-design 5)：對外介面；自動播放政策 (第一次手勢才建立 / resume)、頁面隱藏淡出暫停、
// 限流、驚嚇閘門、環境音、過場模式。建立前的設定只記狀態，建立後套用；沒有 Web Audio → 無聲空殼，不拋錯
import type { Mode } from '../core/types';
import { AudioEngine } from './engine';
import { MusicDirector } from './music';
import { DEFAULT_VOLUMES, FADES, LIMITS, dbToGain, type MusicContext, type Volumes } from './mix';
import { SCORES, clearPhrase, scoreForChapter, solvedPhrase, type ScoreId } from './score';
import { SFX, type SfxDef } from './sfx';
import { AMBIENCE, AmbientClock, CALM_HALF, CHASE_QUIET_SEC, CUE_MAP, CUTSCENE_SCORE, SHOT_MUSIC, ScareGate, Throttle, ambientSeed, type AudioAction } from './events';
import { hashSeed } from './rng';

export interface AudioStats { state: string; score: ScoreId | null; context: MusicContext; active: number; dropped: number; played: number; cutscene: string | null }

export interface AudioManager {
  /** 建立 AudioContext (應在使用者手勢內呼叫)；成功 = true */
  init(): boolean;
  resume(): Promise<void>;
  /** 章節 (1～6) 或配樂 id；fade = 交叉淡化秒數 */
  setChapter(ch: number | ScoreId, fade?: number): void;
  setIntensity(i: number): void;
  setContext(c: MusicContext): void;
  setView(mode: Mode): void;
  setCalm(on: boolean): void;
  /** v0.4 第五章 E♭ 分層：三扇窗的完成數 (null = 不分層) */
  setStage(n: number | null): void;
  play(id: string, opt?: { pitch?: number }): void;
  /** 事件映射的結果 (events.ts) */
  apply(actions: readonly AudioAction[]): void;
  /** 過場：開始 / 鏡頭開始 (1 起算) / 提示 / 結束 */
  cutsceneStart(id: string): void;
  cutsceneShot(id: string, shot: number): void;
  cue(name: string): void;
  cutsceneEnd(): void;
  /** 進關卡：章節的環境音時鐘 (房間 id 作種子) */
  levelStart(room: string): void;
  levelEnd(): void;
  stopMusic(fade?: number): void;
  setVolumes(v: Partial<Volumes>): void;
  mute(on: boolean): void;
  dispose(): void;
  stats(): AudioStats;
}

export interface ManagerOptions {
  volumes?: Volumes;
  calm?: boolean;
  /** 指定 context (離線渲染 / 測試)；未給 = 第一次 init 時 new AudioContext() */
  context?: BaseAudioContext;
  /** 即時模式：排程計時器、手勢解鎖、頁面隱藏 (預設 = 沒有指定 context 時開) */
  realtime?: boolean;
  /** 限幅器之後的補償 (engine.makeupComp) */
  makeupComp?: number;
}

/** 追逐預兆：tension 情境的漸強秒數 (規格 9.1：開始前 ≥ 3 秒預兆) */
export const CHASE_OMEN_FADE = 3;
/** 過場時限幅器前的整體增益 (分鏡 2.5：過場總輸出 ≤ −14 dBFS) */
export const CUTSCENE_TRIM = 0.8;
const LOOKAHEAD = 0.3;
const PUMP_MS = 50;

export class WebAudioManager implements AudioManager {
  private ctx: BaseAudioContext | null = null;
  private engine: AudioEngine | null = null;
  private director: MusicDirector | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private volumes: Volumes;
  private calm: boolean;
  private score: ScoreId | null = null;
  private intensity = 1;
  private stage: number | null = null;
  private context: MusicContext = 'explore';
  private view: Mode = '3d';
  private hidden = false;
  private throttle = new Throttle();
  private gate = new ScareGate();
  private ambient: AmbientClock | null = null;
  private cutscene: string | null = null;
  /** 關卡中的房間 (環境音時鐘的種子；null = 不在關卡) */
  private room: string | null = null;
  private quietRestore: { until: number; context: MusicContext } | null = null;
  /** 追逐中 (預兆起～抵達終點 / 走回主室 / 離開關卡)：外殼每幀要的情境先記在這裡，追逐結束再切 */
  private chaseBack: MusicContext | null = null;
  private phraseBus = new Map<string, GainNode>();
  private readonly realtime: boolean;
  private failed = false;
  private listeners: Array<() => void> = [];

  constructor(private opt: ManagerOptions = {}) {
    this.volumes = { ...(opt.volumes ?? DEFAULT_VOLUMES) };
    this.calm = opt.calm ?? false;
    this.realtime = opt.realtime ?? !opt.context;
  }

  get audioContext(): BaseAudioContext | null { return this.ctx; }
  get audioEngine(): AudioEngine | null { return this.engine; }

  init(): boolean {
    if (this.ctx) return true;
    if (this.failed) return false;
    try {
      const Ctor = typeof AudioContext === 'function' ? AudioContext : null;
      this.ctx = this.opt.context ?? (Ctor ? new Ctor({ latencyHint: 'interactive' }) : null);
    } catch { this.ctx = null; }
    if (!this.ctx) { this.failed = true; return false; }
    this.engine = new AudioEngine(this.ctx, this.opt.makeupComp !== undefined ? { makeupComp: this.opt.makeupComp } : {});
    this.director = new MusicDirector(this.engine);
    this.engine.setVolumes(this.volumes);
    this.engine.setView(this.view);
    this.director.setCalm(this.calm);
    this.director.setIntensity(this.intensity);
    this.director.setStage(this.stage);
    this.director.setContext(this.context);
    if (this.cutscene) this.engine.setTrim(CUTSCENE_TRIM, this.engine.now, 0.01);
    if (this.score) this.director.play(this.score, this.engine.now, FADES.enter);
    if (this.realtime) this.timer = setInterval(() => this.pump(), PUMP_MS);
    this.pump();
    return true;
  }

  async resume(): Promise<void> {
    const c = this.ctx;
    if (c && 'resume' in c && c.state === 'suspended' && !this.hidden) await (c as AudioContext).resume();
  }

  /** 即時模式：第一次手勢建立 / resume；頁面隱藏 / 失焦淡出暫停，回來淡入 */
  attach(doc: Document, win: Window): void {
    const unlock = (): void => { if (this.init()) void this.resume().catch(() => undefined); };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) {
      doc.addEventListener(ev, unlock, { capture: true });
      this.listeners.push(() => doc.removeEventListener(ev, unlock, { capture: true }));
    }
    const vis = (): void => (doc.hidden ? this.hide() : this.show());
    const blur = (): void => this.hide();
    const focus = (): void => { if (!doc.hidden) this.show(); };
    doc.addEventListener('visibilitychange', vis);
    win.addEventListener('blur', blur);
    win.addEventListener('focus', focus);
    this.listeners.push(() => doc.removeEventListener('visibilitychange', vis), () => win.removeEventListener('blur', blur), () => win.removeEventListener('focus', focus));
  }

  private hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    const e = this.engine, c = this.ctx as AudioContext | null;
    if (!e || !c || typeof c.suspend !== 'function') return;
    e.setTrim(0, e.now, FADES.hideOut);
    setTimeout(() => { if (this.hidden && c.state === 'running') void c.suspend().catch(() => undefined); }, FADES.hideOut * 1000 + 60);
  }

  private show(): void {
    if (!this.hidden) return;
    this.hidden = false;
    const e = this.engine, c = this.ctx as AudioContext | null;
    if (!e || !c || typeof c.resume !== 'function') return;
    void c.resume().then(() => e.setTrim(this.cutscene ? CUTSCENE_TRIM : 1, e.now, FADES.showIn)).catch(() => undefined);
  }

  /** 排程一次 (即時模式由計時器呼叫；離線渲染由外部以 until 呼叫) */
  pump(until?: number): void {
    const e = this.engine, d = this.director;
    if (!e || !d) return;
    const now = e.now;
    d.pump(until ?? now + LOOKAHEAD);
    if (this.quietRestore && now >= this.quietRestore.until) {
      const c = this.quietRestore.context;
      this.quietRestore = null;
      this.setContext(c);
    }
    if (!this.ambient && this.room !== null && this.score && !this.cutscene) {
      const list = AMBIENCE[this.score];
      if (list) this.ambient = new AmbientClock(list, ambientSeed(this.score, this.room), now);
    }
    if (this.ambient && !this.cutscene) {
      const id = this.ambient.tick(now, this.gate.quiet(now));
      if (id) this.play(id);
    }
  }

  setChapter(ch: number | ScoreId, fade: number = FADES.chapterCross): void {
    const id = typeof ch === 'number' ? scoreForChapter(ch).id : ch;
    if (this.score !== id) this.ambient = null;
    this.score = id;
    if (this.director && this.director.scoreId !== id) this.director.play(id, this.engine!.now, fade);
  }

  setIntensity(i: number): void { this.intensity = i; this.director?.setIntensity(i); }

  setContext(c: MusicContext): void {
    // 追逐中：維持 tension，先記下外殼要的情境
    if (this.chaseBack !== null && c !== 'tension') { this.chaseBack = c; return; }
    // 驚嚇 / 追逐後的安靜期：先記下，期滿再切
    if (this.quietRestore && c !== 'quiet') { this.quietRestore.context = c; return; }
    this.context = c;
    this.director?.setContext(c);
  }

  setView(mode: Mode): void { this.view = mode; this.engine?.setView(mode); }
  setCalm(on: boolean): void { this.calm = on; this.director?.setCalm(on); }
  setStage(n: number | null): void { this.stage = n; this.director?.setStage(n); }

  play(id: string, opt: { pitch?: number } = {}): void {
    const e = this.engine, d = this.director;
    const def = SFX[id];
    if (!e || !d || !def || this.hidden) return;
    const now = e.now;
    const gap = def.cat === 'ambient' && !this.cutscene ? LIMITS.ambientGapSec : def.cat === 'feedback' ? Math.max(LIMITS.feedbackGapSec, def.gap ?? 0) : (def.gap ?? 0.03);
    if (!this.throttle.allow(id, now, gap)) return;
    if (def.cat === 'ambient' && !this.cutscene && this.gate.quiet(now)) return;
    if (def.phrase) { this.phrase(def); return; }
    let gain = 1;
    if (this.calm && (def.lowImpact || (this.cutscene && CALM_HALF.includes(id)))) gain *= 0.5;
    e.playSfx(def, { gain, ...(opt.pitch !== undefined ? { pitch: opt.pitch } : {}), seed: hashSeed(id, e.stats().played) });
  }

  private phrase(def: SfxDef): void {
    const e = this.engine!, d = this.director!;
    let bus = this.phraseBus.get(def.id);
    if (!bus) {
      bus = e.ctx.createGain();
      bus.gain.value = dbToGain(def.db) * 1.4;
      bus.connect(e.uiDry);
      this.phraseBus.set(def.id, bus);
    }
    const s = d.score ?? SCORES[this.score ?? 'ch1'];
    d.phrase(def.phrase === 'clear' ? clearPhrase(s) : solvedPhrase(s), bus, e.now + 0.05, s);
  }

  apply(actions: readonly AudioAction[]): void {
    for (const a of actions) {
      if (a.kind === 'sfx') this.play(a.id, a.pitch !== undefined ? { pitch: a.pitch } : {});
      else if (a.kind === 'view') this.setView(a.mode);
      else if (a.kind === 'music') this.director?.op(a.op);
      else if (a.kind === 'scare') this.scare(a.flag);
      else if (a.kind === 'chase') this.chase(a.op);
    }
  }

  /** 追逐情境 (規格 9.1：預兆 ≥ 3 秒漸強、結束後 ≥ 20 秒安靜)：on → tension；quiet → quiet 20 秒後回原情境；off → 直接回原情境 */
  chase(op: 'on' | 'quiet' | 'off'): void {
    if (op === 'on') {
      if (this.chaseBack !== null) return;
      this.chaseBack = this.quietRestore?.context ?? this.context;
      this.quietRestore = null;
      this.context = 'tension';
      if (this.director && this.engine) this.director.setContext('tension', this.engine.now, CHASE_OMEN_FADE);
      return;
    }
    if (this.chaseBack === null) return;
    const back = this.chaseBack;
    this.chaseBack = null;
    if (op === 'off') { this.setContext(back); return; }
    this.context = 'quiet';
    this.director?.setContext('quiet');
    this.quietRestore = { until: (this.engine?.now ?? 0) + CHASE_QUIET_SEC, context: back };
  }

  get chasing(): boolean { return this.chaseBack !== null; }

  /** 驚嚇 (規格 9.1)：一般 / 平靜版；之後 15 秒進 quiet，不播環境音 */
  private scare(flag: string): void {
    const e = this.engine;
    if (!e || this.cutscene) return;
    const id = this.gate.scare(flag, e.now, this.calm);
    const def = SFX[id];
    if (def) e.playSfx(def, { seed: hashSeed(id) });
    const back = this.quietRestore?.context ?? this.context;
    this.context = 'quiet';
    this.director?.setContext('quiet');
    this.quietRestore = { until: e.now + LIMITS.scareQuietAfterSec, context: back };
  }

  cutsceneStart(id: string): void {
    this.cutscene = id;
    this.ambient = null;
    this.engine?.setTrim(CUTSCENE_TRIM, this.engine.now, 0.5);
    const sc = CUTSCENE_SCORE[id];
    if (sc) this.setChapter(sc, 1.5);
    this.setIntensity(1);
    this.setContext(sc ? 'explore' : 'quiet');
  }

  cutsceneShot(id: string, shot: number): void {
    for (const op of SHOT_MUSIC[id]?.[shot] ?? []) this.director?.op(op);
  }

  cue(name: string): void { this.apply(CUE_MAP[name] ?? []); }

  cutsceneEnd(): void {
    this.cutscene = null;
    const e = this.engine;
    if (e) { e.setTrim(1, e.now, 1); e.setView(this.view); }
  }

  levelStart(room: string): void { this.room = room; this.ambient = null; this.chase('off'); }
  levelEnd(): void { this.room = null; this.ambient = null; this.chase('off'); }

  stopMusic(fade: number = FADES.cutsceneOut): void {
    this.score = null;
    this.director?.stop(this.engine!.now, fade);
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...v };
    this.engine?.setVolumes(this.volumes);
  }

  mute(on: boolean): void { this.setVolumes({ mute: on }); }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const off of this.listeners) off();
    this.listeners = [];
    const c = this.ctx as AudioContext | null;
    if (c && this.realtime && typeof c.close === 'function') void c.close().catch(() => undefined);
    this.ctx = null;
    this.engine = null;
    this.director = null;
  }

  stats(): AudioStats {
    const s = this.engine?.stats() ?? { active: 0, dropped: 0, played: 0 };
    return { state: this.ctx ? this.ctx.state : 'none', score: this.director?.scoreId ?? null, context: this.context, cutscene: this.cutscene, ...s };
  }
}
