// 樂理小工具 (audio-design 2.2)：調式、級數 → MIDI、和弦；純函式

export type ModeName = 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian';

/** 各調式相對主音的半音數 (一個八度 7 級) */
export const MODES: Readonly<Record<ModeName, readonly number[]>> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10]
};

/** 調式內第 degree 級 (0 = 主音；可為負或 ≥ 7，跨八度) → MIDI 音高 */
export function degreeToMidi(tonic: number, mode: ModeName, degree: number): number {
  const steps = MODES[mode];
  const oct = Math.floor(degree / 7);
  const i = ((degree % 7) + 7) % 7;
  return tonic + oct * 12 + steps[i];
}

/** MIDI → 頻率 (A4 = 69 = 440 Hz) */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 以 root 級為根音的三和弦 (+ 七音) 的級數 */
export const chordDegrees = (root: number, seventh = false): number[] => (seventh ? [root, root + 2, root + 4, root + 6] : [root, root + 2, root + 4]);

/** 把 MIDI 音移進 [lo, hi) 範圍 (以八度) */
export function fold(m: number, lo: number, hi: number): number {
  let x = m;
  while (x < lo) x += 12;
  while (x >= hi) x -= 12;
  return x;
}
