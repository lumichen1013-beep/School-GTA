// 花劍客戰專屬 BGM「向日圓舞曲」(純資料 / 純函式，無 Web Audio 依賴，可單元測試)：3/4 拍華爾滋，
// 一小節 12 個十六分音符 (蹦 = 0、恰 = 4、恰 = 8)，4 小節 48 步一循環；三樂章換速度與配器，終樂章黎明轉大調，換樂章過場只剩音樂盒。

export type DuelVoice = 'BASS' | 'CHORD' | 'LEAD' | 'BOX' | 'TIMPANI' | 'BRUSH';

export interface DuelNote {
  voice: DuelVoice;
  /** MIDI 音高 (TIMPANI / BRUSH 忽略) */
  midi: number;
  /** 長度 (秒) */
  dur: number;
  vel: number;
}

/** 音樂狀態：movement 0 行禮 / 1 舊夢 / 2 落日；dawn = 終樂章黎明 (大調)；interlude = 過場 (只剩音樂盒) */
export interface DuelState {
  movement: number;
  dawn: boolean;
  interlude: boolean;
}

export const DUEL_STEPS_PER_BAR = 12;
export const DUEL_LOOP_STEPS = DUEL_STEPS_PER_BAR * 4;
/** 各樂章速度 (四分音符 BPM) */
export const DUEL_TEMPO = [138, 104, 156] as const;
/** 過場 (音樂盒) 速度 */
export const DUEL_INTERLUDE_TEMPO = 96;

// 和聲：Dm → Gm → A7 → Dm (黎明：D → G → A7 → D)
const BASS = [38, 43, 45, 38];
const CHORD_MINOR = [[62, 65, 69], [62, 67, 70], [61, 64, 67], [62, 65, 69]];
const CHORD_MAJOR = [[62, 66, 69], [62, 67, 71], [61, 64, 67], [62, 66, 69]];
// 主旋律 [步, MIDI]：一小節 3~4 個音
const LEAD_MINOR: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 81], [4, 77], [8, 74], [10, 77]],
  [[0, 82], [4, 79], [8, 74], [10, 79]],
  [[0, 81], [4, 79], [8, 76], [10, 73]],
  [[0, 74], [4, 77], [8, 81]]
];
/** 小調 → 大調 (F→F#、Bb→B) */
const toMajor = (m: number) => (m % 12 === 5 ? m + 1 : m % 12 === 10 ? m + 1 : m);

export function duelMidiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function duelTempo(s: DuelState): number {
  if (s.interlude) return DUEL_INTERLUDE_TEMPO;
  return DUEL_TEMPO[Math.max(0, Math.min(2, s.movement))];
}

/** 某一步要發的音 (out 重複使用，回傳 out) */
export function duelStep(step: number, s: DuelState, out: DuelNote[] = []): DuelNote[] {
  out.length = 0;
  const st = ((step % DUEL_LOOP_STEPS) + DUEL_LOOP_STEPS) % DUEL_LOOP_STEPS;
  const bar = Math.floor(st / DUEL_STEPS_PER_BAR);
  const b = st % DUEL_STEPS_PER_BAR;
  const major = s.dawn && !s.interlude;
  const spb = 60 / duelTempo(s) / 4; // 一個十六分音符秒數
  const lead = LEAD_MINOR[bar].find(([k]) => k === b);
  const leadMidi = lead ? (major ? toMajor(lead[1]) : lead[1]) : -1;
  if (s.interlude) {
    // 過場：音樂盒高八度主旋律 + 每小節第一拍輕低音
    if (leadMidi > 0) out.push({ voice: 'BOX', midi: leadMidi + 12, dur: spb * 6, vel: 0.55 });
    if (b === 0) out.push({ voice: 'BASS', midi: BASS[bar] + 12, dur: spb * 10, vel: 0.25 });
    return out;
  }
  const mv = Math.max(0, Math.min(2, s.movement));
  const chord = (major ? CHORD_MAJOR : CHORD_MINOR)[bar];
  // 蹦 (低音) — 恰 — 恰 (和弦)
  if (b === 0) out.push({ voice: 'BASS', midi: BASS[bar], dur: spb * 4, vel: mv === 1 ? 0.6 : 0.85 });
  if (b === 4 || b === 8) for (const m of chord) out.push({ voice: 'CHORD', midi: m, dur: spb * 3, vel: mv === 1 ? 0.5 : 0.75 });
  if (leadMidi > 0) {
    if (mv === 1) out.push({ voice: 'BOX', midi: leadMidi + 12, dur: spb * 6, vel: 0.6 });
    else out.push({ voice: 'LEAD', midi: leadMidi, dur: spb * (b === 0 ? 4 : 2), vel: mv === 2 ? 1 : 0.8 });
  }
  if (mv === 0 && (b === 4 || b === 8)) out.push({ voice: 'BRUSH', midi: 0, dur: 0.05, vel: 0.35 });
  if (mv === 2) {
    // 終樂章：定音鼓第一拍，第四小節滾奏
    if (b === 0) out.push({ voice: 'TIMPANI', midi: 0, dur: 0.3, vel: major ? 0.7 : 0.9 });
    if (bar === 3 && b >= 6 && b % 2 === 0) out.push({ voice: 'TIMPANI', midi: 0, dur: 0.15, vel: 0.45 });
    if (b === 4 || b === 8) out.push({ voice: 'BRUSH', midi: 0, dur: 0.05, vel: 0.45 });
  }
  return out;
}
