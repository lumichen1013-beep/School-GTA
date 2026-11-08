// 配樂資料與作曲函式 (audio-design 2)：純函式、確定性 (同 score / 小節 / 種子 → 同一組音符)
import { mulberry32, hashSeed } from './rng';
import { chordDegrees, degreeToMidi, fold, type ModeName } from './theory';

export type Layer = 'pad' | 'bass' | 'melody' | 'arp' | 'texture' | 'pulse';
export const LAYERS: readonly Layer[] = ['pad', 'bass', 'melody', 'arp', 'texture', 'pulse'];

export type Instrument = 'pad' | 'strings' | 'glock' | 'celesta' | 'flute' | 'clarinet' | 'piano' | 'marimba' | 'harp' | 'drone' | 'pulse';
export const INSTRUMENTS: readonly Instrument[] = ['pad', 'strings', 'glock', 'celesta', 'flute', 'clarinet', 'piano', 'marimba', 'harp', 'drone', 'pulse'];

/** 一個音：beat = 相對小節開頭的拍 (可 ≥ 4：跨到下一小節的長音 / 動機)；dur 拍；vel 0～1 */
export interface NoteEvent { layer: Layer; inst: Instrument; beat: number; dur: number; midi: number; vel: number }

/** 動機的一個音：[調式級數, 拍數] */
export type MotifNote = readonly [number, number];

/** 圖紙主題 M (停在第 2 級 = 試煉還沒解開)、還原 M′ (落回主音)、爸爸動機 F */
export const THEME: readonly MotifNote[] = [[4, 1], [3, 0.5], [2, 0.5], [4, 1.5], [0, 0.5], [1, 2]];
export const THEME_RESOLVED: readonly MotifNote[] = [[4, 1], [3, 0.5], [2, 0.5], [4, 1.5], [1, 0.5], [0, 2]];
export const FATHER: readonly MotifNote[] = [[2, 1.5], [1, 0.5], [0, 1], [-1, 1], [0, 2]];

export type ScoreId = 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5' | 'ch6' | 'prologue' | 'endA' | 'endB';
export const SCORE_IDS: readonly ScoreId[] = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'prologue', 'endA', 'endB'];

export type Texture = 'none' | 'flatTwo' | 'droplets' | 'stars';

export interface Score {
  id: ScoreId;
  /** 主音 MIDI (旋律音域的主音；墊音 / 低音由此往下摺) */
  tonic: number;
  mode: ModeName;
  bpm: number;
  /** 每小節和弦根音的級數 (循環) */
  progression: readonly number[];
  /** 過場「轉暖」(pad.warm) 時改用的進行 */
  warmProgression?: readonly number[];
  inst: Readonly<Partial<Record<Layer, Instrument>>>;
  /** 章動機：每 motifEvery 小節的第 0 小節出現 */
  motif?: readonly MotifNote[];
  /** 主題：每 motifEvery × 2 小節的第 motifEvery 小節出現 (章動機的回應) */
  theme?: readonly MotifNote[];
  motifEvery: number;
  /** 零星旋律：每拍出現一個音的機率 */
  density: number;
  /** 琶音每拍幾個音 (1 或 2；≤ 8 分音符，不做快速閃爍式節奏) */
  arpRate: 1 | 2;
  /** 琶音每小節多長一個音 (第三章「生長」) */
  arpGrow?: boolean;
  texture: Texture;
  /** 不放 BGM (第四章)：只剩 bass (drone) 與 pulse */
  noBgm?: boolean;
  /** 脈動低音的音高 (Hz 50～70) 與起始 BPM */
  pulse?: { hz: number; bpm: number };
}

export const SCORES: Readonly<Record<ScoreId, Score>> = {
  // 一 玄關：D 利底亞，好奇安靜
  ch1: {
    id: 'ch1', tonic: 74, mode: 'lydian', bpm: 64, progression: [0, 1, 5, 0],
    inst: { pad: 'pad', bass: 'pad', melody: 'glock', arp: 'flute', texture: 'celesta' },
    motif: [[0, 0.5], [2, 0.5], [4, 1], [3, 0.5], [4, 1.5]], theme: THEME, motifEvery: 4, density: 0.18, arpRate: 1, texture: 'none'
  },
  // 二 書房：A 多利亞，書卷氣 + ♭2 的輕微不安
  ch2: {
    id: 'ch2', tonic: 69, mode: 'dorian', bpm: 58, progression: [0, 3, 0, 6],
    inst: { pad: 'strings', bass: 'pad', melody: 'clarinet', arp: 'piano', texture: 'celesta' },
    motif: [[0, 1], [-1, 0.5], [0, 0.5], [2, 1], [1, 1]], theme: FATHER, motifEvery: 4, density: 0.12, arpRate: 1, texture: 'flatTwo'
  },
  // 三 溫室：F 混合利底亞，水滴與生長，輕脈動
  ch3: {
    id: 'ch3', tonic: 77, mode: 'mixolydian', bpm: 72, progression: [0, 6, 3, 0],
    inst: { pad: 'pad', bass: 'pad', melody: 'flute', arp: 'marimba', texture: 'marimba' },
    motif: [[0, 0.5], [4, 0.5], [5, 1], [6, 1], [4, 1]], theme: THEME, motifEvery: 4, density: 0.1, arpRate: 2, arpGrow: true, texture: 'droplets',
    pulse: { hz: 58, bpm: 60 }
  },
  // 四 地下室：不放 BGM (規格 9.1)，只有 40～80 Hz 低頻持續音；強度 3 加脈動
  ch4: {
    id: 'ch4', tonic: 60, mode: 'phrygian', bpm: 50, progression: [0, 0, 1, 0],
    inst: { bass: 'drone' }, motifEvery: 8, density: 0, arpRate: 1, texture: 'none', noBgm: true,
    pulse: { hz: 55, bpm: 60 }
  },
  // 五 閣樓：E♭ 大調 (後半在關係小調 C 上)，宏大、感傷，分層
  ch5: {
    id: 'ch5', tonic: 75, mode: 'ionian', bpm: 60, progression: [0, 5, 3, 4, 5, 3, 0, 4],
    inst: { pad: 'strings', bass: 'strings', melody: 'celesta', arp: 'harp', texture: 'glock' },
    theme: THEME, motif: THEME, motifEvery: 4, density: 0.1, arpRate: 2, texture: 'stars',
    pulse: { hz: 62, bpm: 60 }
  },
  // 終章 草地：G 大調，黎明收成一個和弦
  ch6: {
    id: 'ch6', tonic: 79, mode: 'ionian', bpm: 54, progression: [0, 0, 3, 0],
    inst: { pad: 'pad', bass: 'strings', melody: 'glock', texture: 'celesta' },
    motif: THEME_RESOLVED.slice(0, 3), motifEvery: 8, density: 0.08, arpRate: 1, texture: 'stars'
  },
  // 序章：D 多利亞；轉暖 = IV – I – IV – V
  prologue: {
    id: 'prologue', tonic: 74, mode: 'dorian', bpm: 60, progression: [0, 6, 3, 0], warmProgression: [3, 0, 6, 3],
    inst: { pad: 'pad', bass: 'pad', melody: 'celesta', texture: 'glock' },
    motif: THEME.slice(0, 3), theme: THEME, motifEvery: 8, density: 0.06, arpRate: 1, texture: 'none'
  },
  // 結局 A：D 大調，主題落回主音
  endA: {
    id: 'endA', tonic: 74, mode: 'ionian', bpm: 60, progression: [0, 3, 0, 4],
    inst: { pad: 'strings', bass: 'strings', melody: 'celesta', arp: 'harp', texture: 'glock' },
    motif: THEME_RESOLVED, theme: THEME_RESOLVED, motifEvery: 4, density: 0.08, arpRate: 1, texture: 'stars'
  },
  // 結局 B：D 多利亞，爸爸動機接主題 (停在 IV)
  endB: {
    id: 'endB', tonic: 74, mode: 'dorian', bpm: 56, progression: [0, 3, 6, 3],
    inst: { pad: 'pad', bass: 'pad', melody: 'piano', arp: 'piano', texture: 'celesta' },
    motif: FATHER, theme: THEME, motifEvery: 4, density: 0.06, arpRate: 1, texture: 'none'
  }
};

/** 章節編號 → 配樂 (1～6；其他 = 第一章) */
export const scoreForChapter = (ch: number): Score => SCORES[(`ch${Math.min(6, Math.max(1, Math.round(ch)))}`) as ScoreId];

/** 作曲選項：transpose 半音 (過場「降半音」)、low = 墊音低八度變暗 (pad.low)、warm = 改用轉暖進行 */
export interface ComposeOpts { transpose?: number; low?: boolean; warm?: boolean }

export const beatSec = (s: Score): number => 60 / s.bpm;
export const barSec = (s: Score): number => 4 * beatSec(s);

/** 動機 → 音符 (從 startBeat 起；音域在主音附近) */
export function motifNotes(s: Score, motif: readonly MotifNote[], inst: Instrument, layer: Layer, startBeat = 0, vel = 0.42, transpose = 0): NoteEvent[] {
  let b = startBeat;
  return motif.map(([deg, beats]) => {
    const n: NoteEvent = { layer, inst, beat: b, dur: beats * 0.95, midi: degreeToMidi(s.tonic, s.mode, deg) + transpose, vel };
    b += beats;
    return n;
  });
}

export const motifBeats = (m: readonly MotifNote[]): number => m.reduce((a, [, b]) => a + b, 0);

/** 一小節的全部音符 (各層；層的音量由 mix.layerMix 決定)。pulse 層不在這裡 (見 pulseTimes) */
export function composeBar(s: Score, bar: number, opts: ComposeOpts = {}): NoteEvent[] {
  const rng = mulberry32(hashSeed(s.id, bar));
  const tr = opts.transpose ?? 0;
  const prog = opts.warm && s.warmProgression ? s.warmProgression : s.progression;
  const root = prog[((bar % prog.length) + prog.length) % prog.length];
  const chord = chordDegrees(root, (bar % 4) === 3);
  const out: NoteEvent[] = [];
  const m = (deg: number) => degreeToMidi(s.tonic, s.mode, deg) + tr;
  const lowShift = opts.low ? -12 : 0;
  // 低音 (第四章 = drone：主音持續；其他 = 根音)
  if (s.inst.bass) {
    const bassMidi = s.noBgm ? fold(m(0), 36, 48) : fold(m(root), 38, 50) + lowShift;
    out.push({ layer: 'bass', inst: s.inst.bass, beat: 0, dur: 4.4, midi: bassMidi, vel: 0.5 });
  }
  if (s.noBgm) return out;
  // 墊音：和弦音摺進 [52, 72)，一整小節 + 一點重疊 (連奏)
  if (s.inst.pad) for (const d of chord.slice(0, 3)) out.push({ layer: 'pad', inst: s.inst.pad, beat: 0, dur: 4.4, midi: fold(m(d), 52, 72) + lowShift, vel: 0.5 });
  // 旋律：章動機 / 主題 / 零星的和弦音
  const phase = ((bar % s.motifEvery) + s.motifEvery) % s.motifEvery;
  const cycle = Math.floor(bar / s.motifEvery);
  const mel = s.inst.melody;
  if (mel) {
    if (phase === 0 && s.motif && cycle % 2 === 0) out.push(...motifNotes(s, s.motif, mel, 'melody', 0, 0.42, tr));
    else if (phase === 0 && s.theme) out.push(...motifNotes(s, s.theme, mel, 'melody', 0, 0.42, tr));
    else if (phase >= 2) {
      for (let beat = 0; beat < 4; beat++) {
        if (rng() >= s.density) continue;
        const d = chord[Math.floor(rng() * chord.length)] + 7;
        out.push({ layer: 'melody', inst: mel, beat: beat + (rng() < 0.3 ? 0.5 : 0), dur: 1 + Math.floor(rng() * 2), midi: fold(m(d), 67, 86), vel: 0.26 + rng() * 0.1 });
      }
    }
  }
  // 琶音：和弦音往上；第三章每小節多長一個音 (2～6 個循環)
  if (s.inst.arp) {
    const step = 1 / s.arpRate;
    const count = s.arpGrow ? 2 + (((bar % 5) + 5) % 5) : 4 * s.arpRate;
    const tones = [...chord, chord[0] + 7, chord[1] + 7, chord[2] + 7];
    for (let i = 0; i < Math.min(count, 4 * s.arpRate); i++) {
      out.push({ layer: 'arp', inst: s.inst.arp, beat: i * step, dur: step * 1.6, midi: fold(m(tones[i % tones.length]), 60, 81), vel: 0.26 + (i === 0 ? 0.06 : 0) });
    }
  }
  // 質感
  if (s.inst.texture) {
    const ti = s.inst.texture;
    if (s.texture === 'flatTwo' && rng() < 0.3) out.push({ layer: 'texture', inst: ti, beat: 1 + Math.floor(rng() * 2), dur: 2.5, midi: fold(s.tonic + 1 + tr, 84, 96), vel: 0.14 });
    if (s.texture === 'droplets') {
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) out.push({ layer: 'texture', inst: ti, beat: Math.floor(rng() * 8) / 2, dur: 0.5, midi: fold(m(chord[Math.floor(rng() * 3)] + 14), 84, 98), vel: 0.18 + rng() * 0.08 });
    }
    if (s.texture === 'stars' && rng() < 0.5) {
      const penta = [0, 1, 2, 4, 5];
      out.push({ layer: 'texture', inst: ti, beat: Math.floor(rng() * 8) / 2, dur: 1, midi: fold(m(penta[Math.floor(rng() * 5)] + 14), 86, 100), vel: 0.16 });
    }
  }
  return out;
}

// ── 脈動低音 (規格 9.1：正弦 50～70 Hz、≤ 96 BPM、變速漸變 ≥ 2 秒) ──

export const PULSE_MAX_BPM = 96;
export const PULSE_MIN_RAMP_SEC = 2;
export const clampPulseBpm = (bpm: number): number => Math.min(PULSE_MAX_BPM, Math.max(40, bpm));
export const clampPulseHz = (hz: number): number => Math.min(70, Math.max(50, hz));

/** 從 from 到 to 的線性變速：t0 開始、ramp 秒 (至少 2 秒) */
export interface BpmRamp { from: number; to: number; t0: number; ramp: number }
export function bpmAt(r: BpmRamp, t: number): number {
  const ramp = Math.max(PULSE_MIN_RAMP_SEC, r.ramp);
  const k = Math.min(1, Math.max(0, (t - r.t0) / ramp));
  return clampPulseBpm(r.from + (r.to - r.from) * k);
}
/** [start, end) 內脈動的拍點 (秒)；first = 第一拍 */
export function pulseTimes(first: number, end: number, r: BpmRamp): number[] {
  const out: number[] = [];
  for (let t = first; t < end && out.length < 10000; t += 60 / bpmAt(r, t)) out.push(t);
  return out;
}

// ── 完成謎題 / 通關的短旋律 (目前章節的調上) ──

export function solvedPhrase(s: Score): NoteEvent[] {
  const head: MotifNote[] = [[4, 0.5], [3, 0.5], [2, 0.5], [4, 1.5]];
  const out = motifNotes(s, head, 'glock', 'melody', 0, 0.5);
  for (const d of [0, 2, 4]) out.push({ layer: 'pad', inst: 'celesta', beat: 1.5, dur: 2, midi: fold(degreeToMidi(s.tonic, s.mode, d), 60, 79), vel: 0.22 });
  return out;
}
export function clearPhrase(s: Score): NoteEvent[] {
  const out = motifNotes(s, THEME_RESOLVED, 'celesta', 'melody', 0, 0.45);
  const end = motifBeats(THEME_RESOLVED) - 2;
  for (const d of [0, 2, 4, 7]) out.push({ layer: 'pad', inst: 'strings', beat: end, dur: 3, midi: fold(degreeToMidi(s.tonic, s.mode, d), 55, 76), vel: 0.3 });
  return out;
}

/** v0.4 第五章 E♭ 分層：三扇窗 (5-2 東窗 / 5-3 西窗 / 5-4 北窗) 的完成旗標 */
export const CH5_WINDOWS: readonly string[] = ['5-2', '5-3', '5-4'];
/** 第五章配樂的層數 = 三扇窗的完成數 (0～3；規格「第五章共用規則」音訊) */
export const ch5Stage = (done: ReadonlySet<string>): number => CH5_WINDOWS.filter(f => done.has(f)).length;

/**
 * v0.4 5-5 最後的機關的 Boss 三階段 (規格 9.1)：分層 (layerMix 的 stage) 與脈動速度——5-5a = 長音墊 + 慢脈動 (層 0、60 BPM)、
 * 5-5b = 脈動加快 (層 0、72 BPM；2 秒漸變)、5-5c = + 琶音 (層 1、72 BPM)、收束之後 = 全部收成一個和弦 (層 3、60 BPM；clearPhrase 由通關播)
 */
export function bossStage(done: ReadonlySet<string>): { stage: number; bpm: number } {
  if (done.has('5-5c')) return { stage: 3, bpm: 60 };
  if (done.has('5-5b')) return { stage: 1, bpm: 72 };
  if (done.has('5-5a')) return { stage: 0, bpm: 72 };
  return { stage: 0, bpm: 60 };
}

// ── 強度 (規格 9.1 強度曲線；moodTypes 建好後改讀 LevelEntry.mood) ──

const INTENSITY: Readonly<Record<string, 0 | 1 | 2 | 3>> = {
  '1-1': 1, '1-2': 1, '1-3': 1, '2-1': 1, '2-2': 1, '2-3': 1, '2-4': 2, '2-5': 2,
  '3-1': 2, '3-2': 2, '3-3': 2, '3-4': 2, '4-1': 2, '4-2': 3, '4-3': 3, '4-4': 3,
  '5-1': 2, '5-2': 3, '5-3': 3, '5-4': 3, '5-5': 3, '6-1': 3, H1: 2, H2: 2, H3: 3
};
export const levelIntensity = (levelId: string): 0 | 1 | 2 | 3 => INTENSITY[levelId] ?? 1;
