// Web Audio 合成引擎 (audio-design 4、5)：匯流排、限幅器 + 柔性削波、殘響、聲部 (樂器 / 音效配方)、節點上限
// 只用 BaseAudioContext 的 API，即時 (AudioContext) 與離線渲染 (OfflineAudioContext) 走同一條路
import type { Mode } from '../core/types';
import { mulberry32, hashSeed } from './rng';
import { mtof } from './theory';
import { CLIP_CEIL, FADES, LIMITER, LIMITS, VIEW_CUTOFF, VIEW_RAMP_SEC, busGains, clipCurve, compressorMakeup, dbToGain, type Volumes } from './mix';
import type { Instrument } from './score';
import { peakShare, type SfxDef, type SfxPart } from './sfx';

export interface EngineOptions {
  /** 同時發聲上限 (聲部；超過 → 丟棄新的聲音並計數) */
  maxVoices?: number;
  /**
   * 限幅器之後的補償 (抵消 DynamicsCompressor 的自動補償增益)；預設依 Web Audio 規格公式計算。
   * 實測值見 audio-design 8 的量測報告
   */
  makeupComp?: number;
}

interface Voice { start: number; end: number; nodes: AudioNode[] }

/** 平滑改變參數 (setTargetAtTime；時間常數 = 秒數 / 4，約在 sec 秒內到 98%)；不硬切 → 無 pop */
export function glide(p: AudioParam, target: number, at: number, sec: number): void {
  p.setTargetAtTime(target, at, Math.max(0.005, sec / 4));
}

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  /** 限幅器之前 (過場的響度修整、頁面隱藏的淡出) */
  readonly pre: GainNode;
  readonly muteGain: GainNode;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly clip: WaveShaperNode;
  /** 最後一個節點 (接 destination；量測時可再接 analyser) */
  readonly output: AudioNode;
  readonly musicDry: GainNode;
  readonly musicWet: GainNode;
  readonly sfxWet: GainNode;
  readonly uiDry: GainNode;
  readonly viewFilter: BiquadFilterNode;
  private readonly sfxWorld: GainNode;
  private readonly noise: AudioBuffer;
  private voices: Voice[] = [];
  private dropped = 0;
  private played = 0;
  private readonly maxVoices: number;
  private seedN = 0;

  constructor(ctx: BaseAudioContext, opt: EngineOptions = {}) {
    this.ctx = ctx;
    this.maxVoices = opt.maxVoices ?? 64;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.pre = g();
    this.muteGain = g();
    this.master = g();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = LIMITER.threshold;
    this.limiter.knee.value = LIMITER.knee;
    this.limiter.ratio.value = LIMITER.ratio;
    this.limiter.attack.value = LIMITER.attack;
    this.limiter.release.value = LIMITER.release;
    const comp = g(opt.makeupComp ?? 1 / compressorMakeup(LIMITER.threshold, LIMITER.ratio));
    this.clip = ctx.createWaveShaper();
    this.clip.curve = clipCurve();
    this.clip.oversample = 'none';
    this.pre.connect(this.muteGain).connect(this.master).connect(this.limiter).connect(comp).connect(this.clip).connect(ctx.destination);
    this.output = this.clip;
    // 切換音色：音樂與世界音效經低通 (UI 聲不經過)
    this.viewFilter = ctx.createBiquadFilter();
    this.viewFilter.type = 'lowpass';
    this.viewFilter.frequency.value = VIEW_CUTOFF['3d'];
    this.viewFilter.Q.value = 0.5;
    this.viewFilter.connect(this.pre);
    // 殘響 (種子雜訊的指數衰減脈衝響應)
    const rev = ctx.createConvolver();
    rev.buffer = this.impulse(2.4);
    const revOut = g(0.32);
    rev.connect(revOut).connect(this.viewFilter);
    this.musicDry = g(); this.musicDry.connect(this.viewFilter);
    this.musicWet = g(); this.musicWet.connect(rev);
    this.sfxWorld = g(); this.sfxWorld.connect(this.viewFilter);
    this.sfxWet = g(); this.sfxWet.connect(rev);
    this.uiDry = g(); this.uiDry.connect(this.pre); // 非世界音效 (UI、拾取、過場)：不經切換音色
    this.noise = this.noiseBuffer(2);
  }

  get now(): number { return this.ctx.currentTime; }

  /** 三條音量 + 靜音 (50 ms / 120 ms 平滑) */
  setVolumes(v: Volumes, at = this.now): void {
    const b = busGains(v);
    glide(this.master.gain, b.master, at, FADES.volume);
    for (const n of [this.musicDry, this.musicWet]) glide(n.gain, b.music, at, FADES.volume);
    for (const n of [this.sfxWorld, this.sfxWet, this.uiDry]) glide(n.gain, b.sfx, at, FADES.volume);
    glide(this.muteGain.gain, v.mute ? 0 : 1, at, FADES.mute);
  }

  /** 切換音色 (藏寶圖低通 1.2 kHz / 實景 4 kHz，0.3 秒) */
  setView(mode: Mode, at = this.now): void {
    glide(this.viewFilter.frequency, VIEW_CUTOFF[mode], at, VIEW_RAMP_SEC);
  }

  /** 限幅器前的整體增益 (過場修整、頁面隱藏淡出) */
  setTrim(v: number, at = this.now, sec = 0.3): void { glide(this.pre.gain, v, at, sec); }

  stats(): { active: number; dropped: number; played: number } {
    this.prune();
    return { active: this.voices.length, dropped: this.dropped, played: this.played };
  }

  // ── 聲部管理 ──

  private prune(): void {
    const t = this.now;
    if (this.voices.some(v => v.end < t)) this.voices = this.voices.filter(v => v.end >= t);
  }

  /** 新聲部 [start, end) 是否還有位置 (以時間重疊計，離線預排也正確)；low = 低優先 (音樂的音、腳步、UI)：只用到上限的 3/4，剩下留給音效 */
  private admit(start: number, end: number, low: boolean): boolean {
    this.prune();
    const overlap = this.voices.reduce((n, v) => n + (v.start < end && v.end > start ? 1 : 0), 0);
    if (overlap >= (low ? Math.floor(this.maxVoices * 0.75) : this.maxVoices)) { this.dropped++; return false; }
    return true;
  }

  private track(v: Voice, src: AudioScheduledSourceNode): void {
    this.voices.push(v);
    this.played++;
    src.onended = () => {
      for (const n of v.nodes) n.disconnect();
      const i = this.voices.indexOf(v);
      if (i >= 0) this.voices.splice(i, 1);
    };
  }

  private impulse(sec: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sec * sr);
    const b = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = mulberry32(hashSeed('ir', ch));
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 3) * Math.exp(-3 * i / len);
    }
    return b;
  }

  private noiseBuffer(sec: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, Math.floor(sec * sr), sr);
    const d = b.getChannelData(0);
    const r = mulberry32(hashSeed('noise'));
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return b;
  }

  // ── 樂器 (音樂的音) ──

  /**
   * 一個音：inst 樂器、midi 音高、when 開始、dur 秒、vel 0～1；dest = 層的增益節點；wet = 殘響送出 (0～1)。
   * 回傳是否有播 (超過聲部上限 → false)
   */
  note(inst: Instrument, midi: number, when: number, dur: number, vel: number, dest: AudioNode, wet = 0.3): boolean {
    const ctx = this.ctx;
    const f = mtof(midi);
    const spec = INSTRUMENT_SPECS[inst];
    const sustain = spec.kind === 'sustain';
    const a = Math.max(LIMITS.minAttackSec, spec.a);
    const end = sustain ? when + Math.max(dur, a) + spec.r : when + a + spec.r;
    if (!this.admit(when, end, true)) return false;
    const peak = vel * spec.gain;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + a);
    const tail = Math.max(1e-5, peak * 1e-3);
    if (sustain) {
      const relAt = when + Math.max(dur, a);
      env.gain.setValueAtTime(peak, relAt);
      env.gain.exponentialRampToValueAtTime(tail, end - LIMITS.minReleaseSec);
    } else {
      env.gain.exponentialRampToValueAtTime(tail, end - LIMITS.minReleaseSec);
    }
    env.gain.linearRampToValueAtTime(0, end);
    const nodes: AudioNode[] = [env];
    let head: AudioNode = env;
    if (spec.filter) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = Math.min(spec.filter, ctx.sampleRate / 2.2);
      flt.Q.value = 0.5;
      env.connect(flt);
      head = flt;
      nodes.push(flt);
    }
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.max(-0.4, Math.min(0.4, (midi - 66) / 40)); head.connect(pan); head = pan; nodes.push(pan); }
    head.connect(dest);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; head.connect(w).connect(this.musicWet); nodes.push(w); }
    let first: OscillatorNode | null = null;
    for (const p of spec.partials) {
      const o = ctx.createOscillator();
      o.type = p.type;
      o.frequency.value = Math.min(f * p.ratio, ctx.sampleRate / 2.2);
      if (p.detune) o.detune.value = p.detune;
      const pg = ctx.createGain();
      pg.gain.value = p.gain;
      o.connect(pg).connect(env);
      if (spec.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = spec.vibrato.hz;
        const lg = ctx.createGain();
        lg.gain.value = spec.vibrato.cents;
        lfo.connect(lg).connect(o.detune);
        lfo.start(when); lfo.stop(end);
        nodes.push(lfo, lg);
      }
      o.start(when);
      o.stop(end + 0.02);
      nodes.push(o, pg);
      first ??= o;
    }
    if (first) this.track({ start: when, end, nodes }, first);
    return true;
  }

  // ── 音效配方 ──

  /**
   * 播一個音效配方：when 開始；gain = 額外倍率 (calm / 過場減半)；pitch 半音；ui = 不經切換音色
   * 回傳是否有播
   */
  playSfx(def: SfxDef, opt: { when?: number; gain?: number; pitch?: number; seed?: number } = {}): boolean {
    const ctx = this.ctx;
    const when = opt.when ?? this.now;
    if (!def.parts.length) return false;
    const total = peakShare(def);
    const level = dbToGain(def.db) * (opt.gain ?? 1);
    const rng = mulberry32(opt.seed ?? hashSeed(def.id, this.seedN++));
    const ratio = Math.pow(2, (opt.pitch ?? 0) / 12) * (1 + (def.jitter ?? 0) * (rng() * 2 - 1));
    const dur = def.parts.reduce((m, p) => Math.max(m, (p.at ?? 0) + p.env.a + (p.env.h ?? 0) + p.env.d), 0);
    const low = def.cat === 'step' || def.cat === 'ui';
    if (!this.admit(when, when + dur + LIMITS.minReleaseSec, low)) return false;
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(def.world ? this.sfxWorld : this.uiDry);
    const nodes: AudioNode[] = [out];
    if (def.reverb) { const w = ctx.createGain(); w.gain.value = def.reverb; out.connect(w).connect(this.sfxWet); nodes.push(w); }
    let last: AudioScheduledSourceNode | null = null;
    let lastEnd = -1;
    for (const p of def.parts) {
      const r = this.part(p, when, (p.g / total), ratio, rng, out, nodes);
      if (r.end > lastEnd) { lastEnd = r.end; last = r.src; }
    }
    if (last) this.track({ start: when, end: lastEnd, nodes }, last);
    return true;
  }

  private part(p: SfxPart, t0: number, g: number, ratio: number, rng: () => number, dest: AudioNode, nodes: AudioNode[]): { src: AudioScheduledSourceNode; end: number } {
    const ctx = this.ctx;
    const start = t0 + (p.at ?? 0);
    const a = Math.max(LIMITS.minAttackSec, p.env.a);
    const h = p.env.h ?? 0;
    const end = start + a + h + p.env.d + LIMITS.minReleaseSec;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(g, start + a);
    env.gain.setValueAtTime(g, start + a + h);
    env.gain.exponentialRampToValueAtTime(Math.max(1e-5, g * 1e-3), start + a + h + p.env.d);
    env.gain.linearRampToValueAtTime(0, end);
    nodes.push(env);
    let src: AudioScheduledSourceNode;
    const nyq = ctx.sampleRate / 2.2;
    if (p.src === 'noise') {
      const b = ctx.createBufferSource();
      b.buffer = this.noise;
      b.loop = true;
      b.start(start, rng() * 1.5);
      src = b;
    } else {
      const o = ctx.createOscillator();
      o.type = p.src;
      const f = Math.min(nyq, (p.f ?? 440) * ratio);
      o.frequency.setValueAtTime(f, start);
      if (p.f2 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.min(nyq, Math.max(1, p.f2 * ratio)), start + (p.glide ?? (a + h + p.env.d)));
      o.start(start);
      src = o;
    }
    src.stop(end + 0.02);
    nodes.push(src);
    let head: AudioNode = src;
    if (p.filter) {
      const flt = ctx.createBiquadFilter();
      flt.type = p.filter.type;
      flt.Q.value = p.filter.q ?? 0.7;
      const ff = Math.min(nyq, p.filter.f * (p.src === 'noise' ? 1 : ratio));
      flt.frequency.setValueAtTime(ff, start);
      if (p.filter.f2 !== undefined) flt.frequency.exponentialRampToValueAtTime(Math.min(nyq, p.filter.f2), start + a + h + p.env.d);
      head.connect(flt);
      head = flt;
      nodes.push(flt);
    }
    head.connect(env).connect(dest);
    return { src, end };
  }
}

// ── 樂器規格 (audio-design 2.1) ──

interface InstrumentSpec {
  kind: 'sustain' | 'perc';
  partials: ReadonlyArray<{ type: OscillatorType; ratio: number; gain: number; detune?: number }>;
  /** 起音、釋音 (sustain) / 衰減 (perc) 秒 */
  a: number; r: number;
  gain: number;
  filter?: number;
  vibrato?: { hz: number; cents: number };
}

export const INSTRUMENT_SPECS: Readonly<Record<Instrument, InstrumentSpec>> = {
  pad: { kind: 'sustain', partials: [{ type: 'triangle', ratio: 1, gain: 0.4, detune: 7 }, { type: 'triangle', ratio: 1, gain: 0.4, detune: -7 }, { type: 'sine', ratio: 0.5, gain: 0.3 }], a: 1.6, r: 2.4, gain: 1, filter: 950 },
  strings: { kind: 'sustain', partials: [{ type: 'sawtooth', ratio: 1, gain: 0.3, detune: 6 }, { type: 'sawtooth', ratio: 1, gain: 0.3, detune: -6 }, { type: 'sawtooth', ratio: 1, gain: 0.25 }], a: 0.5, r: 1.2, gain: 0.8, filter: 1800, vibrato: { hz: 4.8, cents: 6 } },
  glock: { kind: 'perc', partials: [{ type: 'sine', ratio: 1, gain: 0.7 }, { type: 'sine', ratio: 2.76, gain: 0.22 }, { type: 'sine', ratio: 5.4, gain: 0.08 }], a: 0.004, r: 1.2, gain: 1 },
  celesta: { kind: 'perc', partials: [{ type: 'sine', ratio: 1, gain: 0.8 }, { type: 'sine', ratio: 4, gain: 0.2 }], a: 0.005, r: 1.6, gain: 1 },
  flute: { kind: 'sustain', partials: [{ type: 'triangle', ratio: 1, gain: 0.85 }, { type: 'sine', ratio: 2, gain: 0.12 }], a: 0.08, r: 0.25, gain: 0.9, filter: 3000, vibrato: { hz: 4.5, cents: 12 } },
  clarinet: { kind: 'sustain', partials: [{ type: 'square', ratio: 1, gain: 0.5 }], a: 0.06, r: 0.2, gain: 0.8, filter: 1200 },
  piano: { kind: 'perc', partials: [{ type: 'triangle', ratio: 1, gain: 0.7 }, { type: 'sine', ratio: 2, gain: 0.25 }, { type: 'sine', ratio: 3, gain: 0.06 }], a: 0.004, r: 2, gain: 1 },
  marimba: { kind: 'perc', partials: [{ type: 'sine', ratio: 1, gain: 0.8 }, { type: 'sine', ratio: 4, gain: 0.2 }], a: 0.004, r: 0.5, gain: 1 },
  harp: { kind: 'perc', partials: [{ type: 'triangle', ratio: 1, gain: 0.8 }, { type: 'sine', ratio: 2, gain: 0.2 }], a: 0.005, r: 1.4, gain: 1 },
  drone: { kind: 'sustain', partials: [{ type: 'sine', ratio: 1, gain: 0.75 }, { type: 'sine', ratio: 2, gain: 0.25 }], a: 2, r: 2, gain: 1 },
  pulse: { kind: 'perc', partials: [{ type: 'sine', ratio: 1, gain: 1 }], a: 0.02, r: 0.35, gain: 1 }
};

/** 削波器的上限 (供量測報告引用) */
export const OUTPUT_CEIL = CLIP_CEIL;
