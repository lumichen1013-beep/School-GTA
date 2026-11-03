// 音效配方 (audio-design 3)：純資料。每個音效 = 數個「聲部」(振盪器 / 雜訊 + 濾波 + 包絡 + 音高滑動) 疊加；
// 各聲部的 g 為相對比例 (引擎依總和正規化)，db = 整個音效的峰值設計 (dBFS，sfx 音量 = 1、總音量 = 1 時)
// id 一律帶 sfx. 前綴 (textKeys 測試把 ui. / msg. 開頭的字串當成文字 key)

export type SfxCategory = 'step' | 'ui' | 'action' | 'feedback' | 'ambient' | 'scare' | 'cutscene' | 'phrase';

export type Source = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';

/** 包絡：a 起音、h 持平、d 衰減 (指數趨近 0)；總長 = at + a + h + d */
export interface Env { a: number; h?: number; d: number }
export interface SfxPart {
  src: Source;
  /** 起始 / 結束頻率 (Hz)；glide = 滑音秒數 (預設 = 整段) */
  f?: number; f2?: number; glide?: number;
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; f: number; f2?: number; q?: number };
  g: number;
  env: Env;
  /** 相對音效開始的延遲 (秒) */
  at?: number;
}
export interface SfxDef {
  id: string;
  cat: SfxCategory;
  db: number;
  parts: readonly SfxPart[];
  /** 殘響送出量 0～1 */
  reverb?: number;
  /** 世界音效：經過切換音色的低通 (UI 聲不經過) */
  world?: boolean;
  /** 同一音效最短間隔 (秒；環境類另受 LIMITS.ambientGapSec) */
  gap?: number;
  /** 音高隨機幅度 (比例；種子亂數) */
  jitter?: number;
  /** phrase 類：由目前章節的調作出旋律 (score.solvedPhrase / clearPhrase) */
  phrase?: 'solved' | 'clear';
  /** 低頻衝擊 (calmTension 時降 6 dB) */
  lowImpact?: boolean;
}

const thump = (at = 0, g = 0.5, f = 110): SfxPart => ({ src: 'sine', f, f2: f * 0.75, glide: 0.18, g, env: { a: 0.005, d: 0.28 }, at });
const noise = (type: 'lowpass' | 'highpass' | 'bandpass', f: number, g: number, env: Env, extra: Partial<SfxPart> = {}, f2?: number, q = 0.8): SfxPart =>
  ({ src: 'noise', filter: { type, f, ...(f2 !== undefined ? { f2 } : {}), q }, g, env, ...extra });
const tone = (src: Source, f: number, g: number, env: Env, extra: Partial<SfxPart> = {}): SfxPart => ({ src, f, g, env, ...extra });
/** 鐘音：基音 + 2.76× 泛音 */
const bell = (f: number, g: number, at = 0, d = 1.1): SfxPart[] => [tone('sine', f, g, { a: 0.005, d }, { at }), tone('sine', f * 2.76, g * 0.35, { a: 0.005, d: d * 0.5 }, { at })];

const LIST: SfxDef[] = [
  // ── 移動 ──
  { id: 'sfx.step.wood', cat: 'step', db: -28, world: true, jitter: 0.08, gap: 0.18, parts: [noise('lowpass', 900, 0.6, { a: 0.005, d: 0.09 }), tone('sine', 120, 0.4, { a: 0.005, d: 0.08 }, { f2: 90 })] },
  { id: 'sfx.step.paper', cat: 'step', db: -30, world: true, jitter: 0.1, gap: 0.18, parts: [noise('bandpass', 2400, 0.8, { a: 0.006, d: 0.07 }), tone('sine', 160, 0.2, { a: 0.005, d: 0.05 })] },
  { id: 'sfx.jump', cat: 'action', db: -30, world: true, gap: 0.2, parts: [noise('bandpass', 600, 0.7, { a: 0.01, d: 0.16 }, {}, 1400), tone('sine', 180, 0.3, { a: 0.005, d: 0.12 }, { f2: 260 })] },
  { id: 'sfx.land', cat: 'action', db: -28, world: true, gap: 0.2, parts: [noise('lowpass', 700, 0.6, { a: 0.005, d: 0.14 }), thump(0, 0.4, 95)] },
  { id: 'sfx.crate.push', cat: 'action', db: -30, world: true, gap: 0.35, jitter: 0.06, parts: [noise('lowpass', 500, 1, { a: 0.03, h: 0.12, d: 0.16 }, {}, 380)] },
  // ── 切換 (筆尖輕扣 + 紙張掃頻：往下 = 壓平、往上 = 立起) ──
  { id: 'sfx.switch.to2d', cat: 'action', db: -22, reverb: 0.25, parts: [tone('triangle', 1800, 0.25, { a: 0.005, d: 0.06 }), noise('bandpass', 3200, 0.55, { a: 0.04, h: 0.1, d: 0.4 }, { at: 0.03 }, 700, 1), tone('sine', 520, 0.2, { a: 0.02, d: 0.5 }, { f2: 390, at: 0.03 })] },
  { id: 'sfx.switch.to3d', cat: 'action', db: -22, reverb: 0.25, parts: [tone('triangle', 1800, 0.25, { a: 0.005, d: 0.06 }), noise('bandpass', 700, 0.55, { a: 0.04, h: 0.1, d: 0.4 }, { at: 0.03 }, 3200, 1), tone('sine', 390, 0.2, { a: 0.02, d: 0.5 }, { f2: 520, at: 0.03 })] },
  // ── 拾取 ──
  { id: 'sfx.pickup', cat: 'action', db: -22, reverb: 0.3, parts: [...bell(880, 0.5), ...bell(1318.5, 0.5, 0.09)] },
  { id: 'sfx.pickup.key', cat: 'action', db: -22, reverb: 0.3, parts: [tone('sine', 2093, 0.3, { a: 0.003, d: 0.5 }), tone('sine', 2637, 0.25, { a: 0.003, d: 0.35 }, { at: 0.06 }), tone('sine', 3520, 0.15, { a: 0.003, d: 0.25 }, { at: 0.06 }), ...bell(1046.5, 0.3, 0.12)] },
  { id: 'sfx.pickup.paper', cat: 'action', db: -24, reverb: 0.2, parts: [noise('bandpass', 2600, 0.6, { a: 0.02, h: 0.05, d: 0.25 }, {}, 1800, 1.2), ...bell(1174.7, 0.4, 0.1)] },
  // ── 魔方 ──
  { id: 'sfx.lever.pull', cat: 'action', db: -16, world: true, parts: [noise('lowpass', 800, 0.5, { a: 0.03, h: 0.1, d: 0.2 }, {}, 400), tone('triangle', 1200, 0.25, { a: 0.003, d: 0.05 }, { at: 0.22 }), thump(0.24, 0.25, 100)] },
  { id: 'sfx.cube.turn', cat: 'feedback', db: -18, world: true, reverb: 0.35, lowImpact: true, parts: [noise('bandpass', 300, 0.45, { a: 0.12, h: 0.35, d: 0.4 }, {}, 520, 1.2), tone('sawtooth', 70, 0.12, { a: 0.15, h: 0.3, d: 0.3 }, { filter: { type: 'lowpass', f: 300 } }), thump(0.82, 0.43, 100)] },
  { id: 'sfx.dial.turn', cat: 'feedback', db: -18, world: true, reverb: 0.3, lowImpact: true, parts: [noise('bandpass', 1800, 0.18, { a: 0.03, h: 0.4, d: 0.2 }, {}, 2400, 4), tone('triangle', 2400, 0.08, { a: 0.003, d: 0.04 }, { at: 0.12 }), tone('triangle', 2400, 0.08, { a: 0.003, d: 0.04 }, { at: 0.3 }), noise('bandpass', 320, 0.3, { a: 0.1, h: 0.3, d: 0.35 }, {}, 480), thump(0.72, 0.36, 105)] },
  { id: 'sfx.dial.activate', cat: 'action', db: -20, reverb: 0.45, parts: [...bell(587.3, 0.35, 0, 1.6), ...bell(880, 0.25, 0.15, 1.4), noise('bandpass', 2200, 0.15, { a: 0.05, h: 0.3, d: 0.3 }, {}, 3000, 3)] },
  { id: 'sfx.dial.mode', cat: 'action', db: -26, reverb: 0.2, parts: [noise('bandpass', 1600, 0.5, { a: 0.02, d: 0.25 }), tone('triangle', 1760, 0.5, { a: 0.003, d: 0.12 }, { at: 0.04 })] },
  { id: 'sfx.dial.deny', cat: 'feedback', db: -24, gap: 0.5, lowImpact: true, parts: [thump(0, 0.6, 90), noise('lowpass', 400, 0.4, { a: 0.005, d: 0.12 })] },
  { id: 'sfx.ink.drop', cat: 'action', db: -26, reverb: 0.3, parts: [tone('sine', 1400, 0.8, { a: 0.005, d: 0.22 }, { f2: 600, glide: 0.12 }), tone('sine', 2800, 0.2, { a: 0.005, d: 0.08 }, { at: 0.02 })] },
  { id: 'sfx.latch.open', cat: 'action', db: -22, reverb: 0.25, parts: [tone('triangle', 900, 0.3, { a: 0.003, d: 0.08 }), tone('triangle', 1350, 0.3, { a: 0.003, d: 0.1 }, { at: 0.1 }), ...bell(1174.7, 0.4, 0.14)] },
  // ── 字卡 ──
  { id: 'sfx.card.stick', cat: 'feedback', db: -20, gap: 0.5, parts: [noise('bandpass', 2000, 0.4, { a: 0.01, d: 0.12 }), thump(0.05, 0.6, 105)] },
  { id: 'sfx.card.wrong', cat: 'action', db: -24, parts: [tone('triangle', 494, 0.5, { a: 0.02, d: 0.3 }, { filter: { type: 'lowpass', f: 1500 } }), tone('triangle', 415, 0.5, { a: 0.02, d: 0.45 }, { at: 0.16, filter: { type: 'lowpass', f: 1500 } })] },
  { id: 'sfx.tray.open', cat: 'ui', db: -28, parts: [noise('bandpass', 2800, 1, { a: 0.02, h: 0.04, d: 0.18 }, {}, 1900, 1)] },
  { id: 'sfx.map.open', cat: 'ui', db: -28, parts: [noise('bandpass', 1800, 1, { a: 0.03, h: 0.06, d: 0.22 }, {}, 3200, 1)] },
  { id: 'sfx.map.close', cat: 'ui', db: -30, parts: [noise('bandpass', 3200, 1, { a: 0.02, h: 0.04, d: 0.2 }, {}, 1600, 1)] },
  { id: 'sfx.note.read', cat: 'ui', db: -28, parts: [noise('bandpass', 2400, 0.8, { a: 0.03, h: 0.08, d: 0.25 }, {}, 1500, 1.2), noise('bandpass', 3400, 0.2, { a: 0.02, d: 0.15 }, { at: 0.14 })] },
  // ── 門 / 機關 ──
  { id: 'sfx.door.open', cat: 'action', db: -16, world: true, reverb: 0.35, parts: [tone('sawtooth', 180, 0.18, { a: 0.08, h: 0.2, d: 0.3 }, { f2: 240, filter: { type: 'bandpass', f: 900, q: 3 } }), noise('lowpass', 600, 0.4, { a: 0.05, h: 0.2, d: 0.35 }), thump(0.55, 0.3, 90)] },
  { id: 'sfx.door.unseal', cat: 'action', db: -20, reverb: 0.5, parts: [...bell(392, 0.35, 0, 1.8), ...bell(587.3, 0.25, 0.2, 1.6), noise('lowpass', 500, 0.2, { a: 0.1, h: 0.2, d: 0.4 }, { at: 0.3 })] },
  { id: 'sfx.bookend.fall', cat: 'feedback', db: -18, world: true, reverb: 0.4, lowImpact: true, parts: [noise('bandpass', 1200, 0.25, { a: 0.02, h: 0.12, d: 0.15 }, {}, 600), noise('lowpass', 700, 0.3, { a: 0.004, d: 0.3 }, { at: 0.32 }), thump(0.32, 0.45, 95)] },
  { id: 'sfx.lamp.on', cat: 'action', db: -24, reverb: 0.45, parts: [...bell(659.3, 0.45, 0, 1.6), tone('triangle', 1318.5, 0.15, { a: 0.15, h: 0.2, d: 0.8 })] },
  { id: 'sfx.lamp.off', cat: 'action', db: -26, reverb: 0.35, parts: [tone('sine', 523.3, 0.6, { a: 0.02, d: 0.6 }, { f2: 392 }), noise('bandpass', 900, 0.4, { a: 0.05, d: 0.4 }, {}, 400)] },
  { id: 'sfx.book.pull', cat: 'action', db: -24, world: true, parts: [noise('bandpass', 1500, 0.7, { a: 0.03, h: 0.1, d: 0.2 }, {}, 900, 1.2), tone('sine', 140, 0.3, { a: 0.005, d: 0.1 }, { at: 0.2 })] },
  { id: 'sfx.drawer.open', cat: 'action', db: -22, world: true, reverb: 0.3, parts: [noise('lowpass', 900, 0.4, { a: 0.04, h: 0.2, d: 0.2 }, {}, 600), tone('triangle', 880, 0.2, { a: 0.003, d: 0.08 }, { at: 0.3 }), ...bell(1318.5, 0.3, 0.38)] },
  { id: 'sfx.cord.pull', cat: 'action', db: -24, world: true, parts: [noise('bandpass', 1100, 0.6, { a: 0.03, h: 0.1, d: 0.2 }, {}, 700, 1.5), tone('triangle', 660, 0.3, { a: 0.003, d: 0.12 }, { at: 0.2 })] },
  { id: 'sfx.cord.reset', cat: 'action', db: -26, world: true, parts: [noise('bandpass', 700, 0.6, { a: 0.02, h: 0.15, d: 0.3 }, {}, 1400), tone('triangle', 330, 0.3, { a: 0.01, d: 0.3 }, { at: 0.1 })] },
  { id: 'sfx.plate.press', cat: 'feedback', db: -18, world: true, gap: 0.5, lowImpact: true, parts: [noise('lowpass', 500, 0.3, { a: 0.005, d: 0.15 }), thump(0, 0.7, 100)] },
  { id: 'sfx.gate.open', cat: 'action', db: -22, world: true, reverb: 0.4, parts: [noise('lowpass', 400, 0.5, { a: 0.15, h: 0.4, d: 0.4 }), tone('sawtooth', 60, 0.15, { a: 0.15, h: 0.4, d: 0.3 }, { filter: { type: 'lowpass', f: 200 } })] },
  { id: 'sfx.reset.room', cat: 'action', db: -26, reverb: 0.3, parts: [noise('bandpass', 1500, 0.6, { a: 0.05, h: 0.1, d: 0.35 }, {}, 3000), tone('sine', 440, 0.3, { a: 0.05, d: 0.5 }, { f2: 330 })] },
  // ── 驚嚇 (規格 9.1：≤ 1.2 秒、峰值 ≤ −6 dBFS 經限幅器；平靜版 ≤ −24 dBFS) ──
  {
    id: 'sfx.scare.coats', cat: 'scare', db: -6, world: true, reverb: 0.3, lowImpact: true, parts: [
      tone('sine', 62, 0.55, { a: 0.004, d: 0.9 }, { f2: 38, glide: 0.6 }),
      noise('lowpass', 1100, 0.2, { a: 0.003, d: 0.45 }, {}, 300),
      tone('sawtooth', 233.1, 0.06, { a: 0.008, h: 0.12, d: 0.75 }, { filter: { type: 'lowpass', f: 2200 } }),
      tone('sawtooth', 246.9, 0.06, { a: 0.008, h: 0.12, d: 0.75 }, { filter: { type: 'lowpass', f: 2200 } }),
      tone('sawtooth', 349.2, 0.06, { a: 0.008, h: 0.1, d: 0.7 }, { filter: { type: 'lowpass', f: 2200 } }),
      noise('bandpass', 400, 0.07, { a: 0.003, d: 0.2 }, { at: 0.12 })
    ]
  },
  { id: 'sfx.scare.gentle', cat: 'scare', db: -26, world: true, reverb: 0.4, parts: [noise('bandpass', 700, 0.6, { a: 0.3, h: 0.2, d: 0.6 }, {}, 400, 0.7), tone('sine', 196, 0.4, { a: 0.04, d: 0.8 }, { at: 0.3 })] },
  // ── 旋律 (目前章節的調；score.solvedPhrase / clearPhrase) ──
  { id: 'sfx.puzzle.solved', cat: 'phrase', db: -18, reverb: 0.5, phrase: 'solved', parts: [] },
  { id: 'sfx.level.clear', cat: 'phrase', db: -16, reverb: 0.5, phrase: 'clear', parts: [] },
  // ── UI ──
  { id: 'sfx.ui.click', cat: 'ui', db: -28, gap: 0.04, jitter: 0.04, parts: [tone('triangle', 1250, 0.5, { a: 0.003, d: 0.05 }), noise('bandpass', 3000, 0.5, { a: 0.003, d: 0.03 })] },
  // ── 環境 (規格 9.1：峰值 ≤ −24、起音 ≥ 150 ms、同類 ≥ 20 秒) ──
  { id: 'sfx.amb.page', cat: 'ambient', db: -30, world: true, reverb: 0.5, parts: [noise('bandpass', 2200, 1, { a: 0.18, h: 0.1, d: 0.4 }, {}, 1500, 1)] },
  { id: 'sfx.amb.hinge', cat: 'ambient', db: -30, world: true, reverb: 0.6, parts: [tone('sawtooth', 210, 0.5, { a: 0.2, h: 0.4, d: 0.5 }, { f2: 260, filter: { type: 'bandpass', f: 800, q: 2 } }), noise('lowpass', 400, 0.5, { a: 0.2, h: 0.3, d: 0.4 })] },
  { id: 'sfx.amb.footstep', cat: 'ambient', db: -28, world: true, reverb: 0.7, parts: [noise('lowpass', 500, 0.5, { a: 0.15, d: 0.2 }), noise('lowpass', 500, 0.5, { a: 0.15, d: 0.2 }, { at: 0.55 })] },
  { id: 'sfx.amb.drip', cat: 'ambient', db: -30, world: true, reverb: 0.6, parts: [tone('sine', 1600, 1, { a: 0.15, d: 0.3 }, { f2: 900, glide: 0.2 })] },
  // ── 過場 (分鏡 2.5：總輸出 ≤ −14、環境 ≤ −24、撕紙 ≤ −18、起音 ≥ 150 ms；不放驚嚇) ──
  { id: 'sfx.cs.wind', cat: 'ambient', db: -30, reverb: 0.3, parts: [noise('bandpass', 500, 0.6, { a: 2.0, h: 3, d: 3 }, {}, 900, 0.6), noise('highpass', 3500, 0.4, { a: 2.5, h: 2, d: 3 })] },
  { id: 'sfx.cs.gravel', cat: 'cutscene', db: -28, parts: [0, 0.55, 1.1, 1.65, 2.2, 2.75, 3.3].map((at, i) => noise('bandpass', 1800 + (i % 2) * 400, 1 / 7, { a: 0.006, d: 0.12 }, { at }, undefined, 0.9)) },
  { id: 'sfx.cs.signal', cat: 'cutscene', db: -28, reverb: 0.3, parts: [tone('sine', 1568, 0.34, { a: 0.02, d: 0.25 }), tone('sine', 1318.5, 0.33, { a: 0.02, d: 0.25 }, { at: 1 }), tone('sine', 1046.5, 0.33, { a: 0.02, d: 0.35 }, { at: 2 })] },
  { id: 'sfx.cs.floor.creak', cat: 'ambient', db: -28, reverb: 0.4, parts: [tone('sawtooth', 150, 0.6, { a: 0.18, h: 0.2, d: 0.4 }, { f2: 120, filter: { type: 'bandpass', f: 700, q: 2 } }), noise('lowpass', 500, 0.4, { a: 0.15, d: 0.3 })] },
  { id: 'sfx.cs.paper.rub', cat: 'ambient', db: -30, parts: [noise('bandpass', 2000, 1, { a: 0.2, h: 0.4, d: 0.5 }, {}, 1400, 1)] },
  { id: 'sfx.cs.book.close', cat: 'cutscene', db: -28, reverb: 0.4, parts: [noise('lowpass', 900, 0.6, { a: 0.006, d: 0.15 }, { at: 0.12 }), noise('bandpass', 1800, 0.4, { a: 0.05, d: 0.1 })] },
  { id: 'sfx.cs.rug', cat: 'ambient', db: -28, parts: [noise('lowpass', 700, 1, { a: 0.3, h: 1.2, d: 0.6 }, {}, 450)] },
  { id: 'sfx.cs.circle.hum', cat: 'ambient', db: -25, reverb: 0.6, lowImpact: true, parts: [tone('sine', 73.4, 0.35, { a: 0.4, h: 2.5, d: 2.5 }), tone('sine', 110, 0.25, { a: 0.6, h: 2.3, d: 2.5 }), tone('triangle', 146.8, 0.2, { a: 0.9, h: 2, d: 2.5 }, { filter: { type: 'lowpass', f: 800 } }), tone('sine', 220, 0.2, { a: 1.2, h: 1.8, d: 2.5 })] },
  { id: 'sfx.cs.pen.rise', cat: 'ambient', db: -28, reverb: 0.6, parts: [tone('sine', 587.3, 0.4, { a: 0.4, h: 2.2, d: 1.2 }, { f2: 1174.7, glide: 3 }), tone('sine', 880, 0.3, { a: 0.6, h: 2, d: 1.2 }, { f2: 1760, glide: 3 }), noise('highpass', 5000, 0.3, { a: 1, h: 1.5, d: 1 })] },
  { id: 'sfx.cs.pen.grip', cat: 'cutscene', db: -28, reverb: 0.3, parts: [tone('triangle', 1400, 0.5, { a: 0.004, d: 0.06 }), tone('sine', 220, 0.5, { a: 0.02, d: 0.4 })] },
  { id: 'sfx.cs.wood.groan', cat: 'ambient', db: -26, reverb: 0.6, lowImpact: true, parts: [tone('sawtooth', 55, 0.45, { a: 0.6, h: 2, d: 1.5 }, { f2: 49, filter: { type: 'lowpass', f: 260 } }), noise('bandpass', 260, 0.55, { a: 0.5, h: 2, d: 1.5 }, {}, 200, 1.5)] },
  { id: 'sfx.cs.mechanism', cat: 'cutscene', db: -26, reverb: 0.5, parts: [noise('bandpass', 400, 0.5, { a: 0.3, h: 1.6, d: 0.8 }, {}, 650, 1.3), ...[0.4, 0.9, 1.4, 1.9].map(at => tone('triangle', 1100, 0.125, { a: 0.003, d: 0.05 }, { at }))] },
  { id: 'sfx.cs.click', cat: 'cutscene', db: -26, reverb: 0.4, parts: [noise('lowpass', 600, 0.3, { a: 0.15, h: 0.4, d: 0.4 }), tone('triangle', 1500, 0.35, { a: 0.003, d: 0.06 }, { at: 0.9 }), thump(0.9, 0.35, 105)] },
  { id: 'sfx.cs.door.rattle', cat: 'cutscene', db: -26, reverb: 0.3, parts: [0, 0.14, 0.3].map(at => noise('lowpass', 500, 1 / 3, { a: 0.006, d: 0.1 }, { at })) },
  { id: 'sfx.cs.pen.glow', cat: 'ambient', db: -28, reverb: 0.6, parts: [tone('sine', 2637, 0.6, { a: 0.4, h: 1.2, d: 1.2 }), tone('sine', 3951, 0.4, { a: 0.6, h: 1, d: 1 })] },
  { id: 'sfx.cs.flatten', cat: 'ambient', db: -26, reverb: 0.4, parts: [noise('bandpass', 3000, 0.7, { a: 0.15, h: 0.3, d: 0.8 }, {}, 600, 0.9), tone('sine', 330, 0.3, { a: 0.2, d: 0.9 }, { f2: 220 })] },
  { id: 'sfx.cs.paper.flutter', cat: 'ambient', db: -28, parts: [noise('bandpass', 2500, 1, { a: 0.15, h: 0.15, d: 0.3 }, {}, 1700, 1.2)] },
  { id: 'sfx.cs.paper.tear', cat: 'cutscene', db: -20, parts: [noise('bandpass', 2600, 0.7, { a: 0.16, h: 0.6, d: 0.4 }, {}, 1700, 1.5), noise('highpass', 4000, 0.3, { a: 0.2, h: 0.5, d: 0.3 })] },
  { id: 'sfx.cs.birds', cat: 'cutscene', db: -30, reverb: 0.5, parts: [0, 0.18, 1.2, 1.35].map(at => tone('sine', 3200, 0.25, { a: 0.02, d: 0.1 }, { at, f2: 4200 })) },
  { id: 'sfx.cs.kettle', cat: 'ambient', db: -32, parts: [noise('bandpass', 2400, 0.6, { a: 1.0, h: 1.5, d: 1 }, {}, 3200, 4), tone('sine', 1800, 0.4, { a: 1.2, h: 1, d: 1 })] },
  { id: 'sfx.cs.leaves', cat: 'ambient', db: -34, parts: [noise('highpass', 3000, 1, { a: 0.6, h: 1.5, d: 1.5 })] },
  { id: 'sfx.cs.chime', cat: 'cutscene', db: -24, reverb: 0.6, parts: [...bell(783.99, 0.5, 0, 1.8), ...bell(1174.7, 0.5, 0.25, 1.6)] }
];

export const SFX: Readonly<Record<string, SfxDef>> = Object.fromEntries(LIST.map(d => [d.id, d]));
export const SFX_IDS: readonly string[] = LIST.map(d => d.id);

/**
 * 同時發聲的聲部比例總和的最大值 (引擎以此正規化：先後出現、不重疊的聲部各自用滿音量；重疊的聲部分攤)
 */
export function peakShare(d: SfxDef): number {
  const span = (p: SfxPart): [number, number] => [p.at ?? 0, (p.at ?? 0) + p.env.a + (p.env.h ?? 0) + p.env.d * 0.5];
  let m = 0;
  for (const p of d.parts) {
    const t = (p.at ?? 0) + p.env.a;
    m = Math.max(m, d.parts.reduce((s, q) => { const [a, b] = span(q); return s + (a <= t && t < b ? q.g : 0); }, 0));
  }
  return m || 1;
}

/** 一個音效的總長 (秒；旋律類另由旋律決定，這裡回 0) */
export const sfxDuration = (d: SfxDef): number => d.parts.reduce((m, p) => Math.max(m, (p.at ?? 0) + p.env.a + (p.env.h ?? 0) + p.env.d), 0);
/** 最早出現的聲部起音 (環境類必須 ≥ 150 ms) */
export const sfxAttack = (d: SfxDef): number => d.parts.reduce((m, p) => Math.min(m, p.env.a), Infinity);
