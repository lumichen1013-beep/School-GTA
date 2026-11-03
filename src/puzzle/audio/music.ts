// 音樂排程 (audio-design 2.4、5)：兩個 deck 交叉淡化、各層增益、脈動低音、過場的音樂動作。
// 音符一律由 score.composeBar (純函式) 算出；pump(until) 把 until 之前開始的小節排進 Web Audio 時間軸 (即時 = 每 50 ms 往前看 0.3 秒；離線 = 一次排完)
import { glide, type AudioEngine } from './engine';
import { FADES, layerMix, type MusicContext } from './mix';
import { LAYERS, SCORES, barSec, beatSec, bpmAt, clampPulseHz, composeBar, motifNotes, THEME, type BpmRamp, type ComposeOpts, type Layer, type NoteEvent, type Score, type ScoreId } from './score';
import type { MusicOp } from './events';

interface Deck {
  score: Score;
  gain: GainNode;
  layers: Record<Layer, GainNode>;
  /** 主題 / 完成旋律等「前景」句子 (不受情境層影響) */
  feature: GainNode;
  t0: number;
  nextBar: number;
  opts: ComposeOpts;
  /** 停止排程的時間 (淡出完) */
  stopAt: number;
  pulse: { ramp: BpmRamp; next: number } | null;
}

const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

export class MusicDirector {
  private deck: Deck | null = null;
  private old: Deck[] = [];
  private ctxName: MusicContext = 'explore';
  private intensity = 1;
  private calm = false;
  private solvedUntil = -Infinity;

  constructor(private engine: AudioEngine) {}

  get scoreId(): ScoreId | null { return this.deck?.score.id ?? null; }
  get context(): MusicContext { return this.ctxName; }

  /** 換配樂：同一份 → 不動；否則舊 deck 等功率淡出、新 deck 淡入 (fade 秒) */
  play(id: ScoreId, at = this.engine.now, fade: number = FADES.chapterCross, startGain = 1): void {
    if (this.deck && this.deck.score.id === id && this.deck.stopAt === Infinity) return;
    this.retire(at, fade);
    const ctx = this.engine.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    if (startGain > 0) glide(gain.gain, startGain, at, fade);
    gain.connect(this.engine.musicDry);
    const layers = Object.fromEntries(LAYERS.map(l => { const g = ctx.createGain(); g.gain.value = 0; g.connect(gain); return [l, g]; })) as Record<Layer, GainNode>;
    const feature = ctx.createGain();
    feature.gain.value = 0.14;
    feature.connect(gain);
    const score = SCORES[id];
    this.deck = {
      score, gain, layers, feature, t0: at, nextBar: 0, opts: {}, stopAt: Infinity,
      pulse: score.pulse ? { ramp: { from: score.pulse.bpm, to: score.pulse.bpm, t0: at, ramp: 2 }, next: at } : null
    };
    this.applyMix(at, 0.01);
  }

  /** 停止音樂 (fade 秒淡出) */
  stop(at = this.engine.now, fade: number = FADES.cutsceneOut): void { this.retire(at, fade); this.deck = null; }

  private retire(at: number, fade: number): void {
    const d = this.deck;
    if (!d) return;
    d.gain.gain.cancelScheduledValues(at);
    glide(d.gain.gain, 0, at, fade);
    d.stopAt = at + fade;
    this.old.push(d);
    this.deck = null;
  }

  setContext(c: MusicContext, at = this.engine.now): void { this.ctxName = c; this.applyMix(at, 0.8); }
  setIntensity(i: number, at = this.engine.now): void { this.intensity = i; this.applyMix(at, 1.2); }
  setCalm(on: boolean, at = this.engine.now): void { this.calm = on; this.applyMix(at, 0.8); }

  /** 脈動變速 (≥ 2 秒漸變；≤ 96 BPM) */
  setPulseBpm(bpm: number, ramp = 2, at = this.engine.now): void {
    const p = this.deck?.pulse;
    if (!p) return;
    p.ramp = { from: bpmAt(p.ramp, at), to: bpm, t0: at, ramp };
  }

  private mixFor(at: number): Record<Layer, number> {
    const d = this.deck!;
    const c: MusicContext = at < this.solvedUntil ? 'solved' : this.ctxName;
    return layerMix(c, this.intensity, this.calm, !!d.score.pulse && d.score.id === 'ch3');
  }

  private applyMix(at: number, sec: number): void {
    const d = this.deck;
    if (!d) return;
    const m = this.mixFor(at);
    for (const l of LAYERS) glide(d.layers[l].gain, m[l], at, sec);
  }

  /** 過場 / 事件的音樂動作 */
  op(op: MusicOp, at = this.engine.now): void {
    const d = this.deck;
    switch (op) {
      case 'padIn': if (d) { d.gain.gain.cancelScheduledValues(at); d.gain.gain.setValueAtTime(0, at); glide(d.gain.gain, 1, at, 4); } break;
      case 'padWarm': if (d) d.opts = { ...d.opts, warm: true, low: false }; break;
      case 'padLow': if (d) d.opts = { ...d.opts, low: true, warm: false }; break;
      case 'semitoneDown': if (d) d.opts = { ...d.opts, transpose: (d.opts.transpose ?? 0) - 1 }; break;
      case 'viewLow': this.engine.setView('2d', at); break;
      case 'viewOpen': this.engine.setView('3d', at); if (d) d.opts = { ...d.opts, transpose: 0 }; break;
      case 'padOut': this.stop(at, FADES.cutsceneOut); break;
      case 'title': if (d) this.titleTheme(d, at); break;
      case 'solved': {
        this.solvedUntil = at + 2.5;
        this.applyMix(at, 0.3);
        if (d) { const m = layerMix(this.ctxName, this.intensity, this.calm); for (const l of LAYERS) glide(d.layers[l].gain, m[l], at + 2.5, 1.2); }
        break;
      }
      default: break;
    }
  }

  /** 標題卡：圖紙主題全句 (celesta + 弦樂墊)，從下一拍開始 */
  private titleTheme(d: Deck, at: number): void {
    const s = d.score;
    const t = at + 0.2;
    const notes: NoteEvent[] = [
      ...motifNotes(s, THEME, 'celesta', 'melody', 0, 0.55),
      ...motifNotes(s, THEME, 'strings', 'pad', 0, 0.22, -12)
    ];
    for (const n of notes) this.engine.note(n.inst, n.midi, t + n.beat * beatSec(s), n.dur * beatSec(s), n.vel, d.feature, 0.45);
  }

  /** 前景旋律 (完成謎題 / 通關；sfx 匯流排) */
  phrase(notes: readonly NoteEvent[], dest: AudioNode, at = this.engine.now, score: Score | null = this.deck?.score ?? null, gain = 1): void {
    const s = score ?? SCORES.ch1;
    for (const n of notes) this.engine.note(n.inst, n.midi, at + n.beat * beatSec(s), n.dur * beatSec(s), n.vel * gain, dest, 0.5);
  }

  get score(): Score | null { return this.deck?.score ?? null; }

  /** 排程：把 until 之前開始的小節 / 脈動排進時間軸；淡出完的 deck 斷線 */
  pump(until: number): void {
    const now = this.engine.now;
    this.old = this.old.filter(d => {
      if (now > d.stopAt + 6) { for (const g of [...Object.values(d.layers), d.feature, d.gain]) g.disconnect(); return false; }
      this.pumpDeck(d, until);
      return true;
    });
    if (this.deck) this.pumpDeck(this.deck, until);
  }

  private pumpDeck(d: Deck, until: number): void {
    const s = d.score;
    const bar = barSec(s);
    const bs = beatSec(s);
    while (true) {
      const t = d.t0 + d.nextBar * bar;
      if (t >= until || t >= d.stopAt) break;
      for (const n of composeBar(s, d.nextBar, d.opts)) {
        this.engine.note(n.inst, n.midi, t + n.beat * bs, n.dur * bs, n.vel, d.layers[n.layer], n.layer === 'bass' ? 0.05 : 0.35);
      }
      d.nextBar++;
    }
    const p = d.pulse;
    if (p && s.pulse) {
      const midi = hzToMidi(clampPulseHz(s.pulse.hz));
      while (p.next < until && p.next < d.stopAt) {
        this.engine.note('pulse', midi, p.next, 0.3, 0.9, d.layers.pulse, 0);
        p.next += 60 / bpmAt(p.ramp, p.next);
      }
    }
  }
}
