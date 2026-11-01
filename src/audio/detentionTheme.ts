// 第二世界【第七少年特訓院】專屬 BGM「鐵窗夜行」(純資料 / 純函式，無 Web Audio 依賴，可單元測試)：
// 4/4 拍、一小節 16 個十六分音符，4 小節和聲 Em → F → Em → B7 (E 弗里吉亞色彩 + 屬七回歸)，
// 主旋律「鐵窗動機」E-G-F#-B 下行嘆息；8 小節 128 步一循環 (前半主題、後半留白回聲，長時間循環不膩)。
// 依潛入局勢分段：開場序曲 / 暗夜潛入 / 搜索倒數 / 警戒追捕 / 鐵面進行曲 (總教官戰) / 破曉越獄 (通關，轉 E 大調)。

export type DetentionPhase = 'INTRO' | 'SNEAK' | 'SEARCH' | 'ALERT' | 'BOSS' | 'ESCAPED';

export type DetentionVoice =
  | 'BASS' | 'PBASS' | 'PAD' | 'CHORD' | 'LEAD' | 'BOX' | 'STAB'
  | 'KICK' | 'HKICK' | 'SNARE' | 'HAT' | 'OHAT';

export interface DetentionNote {
  voice: DetentionVoice;
  /** MIDI 音高 (打擊樂忽略) */
  midi: number;
  /** 長度 (秒) */
  dur: number;
  vel: number;
}

export const DET_STEPS_PER_BAR = 16;
export const DET_LOOP_STEPS = DET_STEPS_PER_BAR * 8;

/** 各段速度 (四分音符 BPM) */
export const DET_TEMPO: Readonly<Record<DetentionPhase, number>> = {
  INTRO: 66,
  SNEAK: 84,
  SEARCH: 100,
  ALERT: 152,
  BOSS: 120,
  ESCAPED: 112
};

/** 各段主濾波截止頻率 (Hz)：潛入暗、追捕亮 */
export const DET_FILTER: Readonly<Record<DetentionPhase, number>> = {
  INTRO: 1100,
  SNEAK: 1400,
  SEARCH: 2400,
  ALERT: 6000,
  BOSS: 4800,
  ESCAPED: 5200
};

/** HUD / 橫幅顯示名稱 */
export const DET_LABEL: Readonly<Record<DetentionPhase, string>> = {
  INTRO: '鐵窗序曲',
  SNEAK: '鐵窗夜行',
  SEARCH: '搜索倒數',
  ALERT: '警戒追捕!',
  BOSS: '鐵面進行曲',
  ESCAPED: '破曉越獄'
};

/** 進入此段時從第一小節重來並打一記重音 (突發事件)；其餘段落保留小節位置無縫接續 */
export function detentionNeedsStinger(from: DetentionPhase | null, to: DetentionPhase): boolean {
  if (from === to) return false;
  if (to === 'ALERT') return from !== 'BOSS';
  return to === 'BOSS' || to === 'ESCAPED';
}

/** 狀態判斷 (main 每幀呼叫)：優先序 開場 > 通關 > 總教官戰 > 警戒 > 搜索 / 戒備 > 潛入 */
export function detentionMusicPhase(i: {
  cutscene: boolean;
  escaped: boolean;
  bossEngaged: boolean;
  alertPhase: 'NORMAL' | 'ALERT' | 'EVASION' | 'CAUTION';
}): DetentionPhase {
  if (i.cutscene) return 'INTRO';
  if (i.escaped) return 'ESCAPED';
  if (i.bossEngaged) return 'BOSS';
  if (i.alertPhase === 'ALERT') return 'ALERT';
  if (i.alertPhase === 'EVASION' || i.alertPhase === 'CAUTION') return 'SEARCH';
  return 'SNEAK';
}

// 和聲：Em → F (bII 弗里吉亞) → Em → B7 (破曉：E → A → E → B)
const ROOT = [40, 41, 40, 35];
const ROOT_MAJOR = [40, 45, 40, 35];
const PAD_MINOR = [[55, 59, 64], [57, 60, 65], [55, 59, 64], [54, 57, 63]];
const PAD_MAJOR = [[56, 59, 64], [57, 61, 64], [56, 59, 64], [54, 59, 63]];
// 鐵窗動機 [步, MIDI]
const MOTIF: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 76], [3, 79], [6, 78], [10, 71]],   // E G F# B
  [[0, 77], [6, 76], [10, 72]],            // F E C
  [[0, 76], [3, 79], [6, 83], [12, 82]],   // E G B A# (三全音)
  [[0, 81], [4, 78], [8, 75], [12, 71]]    // A F# D# B
];
/** 小調 → 大調 (G→G#、C→C#、F→F#、A#→B) */
const toMajor = (m: number) => {
  const pc = m % 12;
  return pc === 7 || pc === 0 || pc === 5 || pc === 10 ? m + 1 : m;
};

export function detentionMidiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** 某一步要發的音 (out 重複使用，回傳 out)；stinger = 本步為段落突發重音 */
export function detentionStep(step: number, phase: DetentionPhase, out: DetentionNote[] = [], stinger = false): DetentionNote[] {
  out.length = 0;
  const st = ((step % DET_LOOP_STEPS) + DET_LOOP_STEPS) % DET_LOOP_STEPS;
  const bar = Math.floor(st / DET_STEPS_PER_BAR) % 4;
  const half = st >= DET_LOOP_STEPS / 2 ? 1 : 0; // 0 = 主題、1 = 回聲 / 變奏
  const b = st % DET_STEPS_PER_BAR;
  const spb = 60 / DET_TEMPO[phase] / 4; // 一個十六分音符秒數
  const major = phase === 'ESCAPED';
  const root = (major ? ROOT_MAJOR : ROOT)[bar];
  const pad = (major ? PAD_MAJOR : PAD_MINOR)[bar];
  const m = MOTIF[bar].find(([k]) => k === b);
  const motif = m ? (major ? toMajor(m[1]) : m[1]) : -1;

  if (stinger && b === 0) {
    out.push({ voice: 'HKICK', midi: 0, dur: 0.2, vel: 1 });
    if (phase === 'ESCAPED') {
      out.push({ voice: 'CHORD', midi: 76, dur: 1.2, vel: 1 }, { voice: 'CHORD', midi: 80, dur: 1.2, vel: 1 }, { voice: 'CHORD', midi: 83, dur: 1.2, vel: 1 });
    } else {
      // 三全音警報和弦 E + A#
      out.push({ voice: 'STAB', midi: 76, dur: 0.45, vel: 1 }, { voice: 'STAB', midi: 82, dur: 0.45, vel: 1 });
      out.push({ voice: 'OHAT', midi: 0, dur: 0.3, vel: 0.6 });
    }
  }

  switch (phase) {
    case 'INTRO':
      // 序曲：每小節一記低音長音 + 時鐘滴答 + 音樂盒只奏動機頭兩音
      if (b === 0) out.push({ voice: 'BASS', midi: root, dur: spb * 14, vel: 0.5 });
      if (b % 4 === 0) out.push({ voice: 'HAT', midi: 0, dur: 0.03, vel: b === 0 ? 0.16 : 0.09 });
      if (motif > 0 && b <= 3 && half === 0) out.push({ voice: 'BOX', midi: motif, dur: spb * 10, vel: 0.5 });
      break;

    case 'SNEAK':
      // 心跳低音 (蹦-蹦…蹦) + 四分滴答 + 長和聲墊底；動機前半音樂盒、後半只留頭音低八度回聲
      if (b === 0 || b === 3) out.push({ voice: 'BASS', midi: root, dur: spb * 3, vel: b === 0 ? 0.85 : 0.55 });
      if (b === 8) out.push({ voice: 'BASS', midi: root, dur: spb * 4, vel: 0.5 });
      if (b === 0 && bar === 0) out.push({ voice: 'KICK', midi: 0, dur: 0.12, vel: 0.35 });
      if (b % 4 === 0) out.push({ voice: 'HAT', midi: 0, dur: 0.03, vel: b === 0 ? 0.18 : 0.1 });
      if (b === 0) for (const p of pad) out.push({ voice: 'PAD', midi: p, dur: spb * 15, vel: 0.55 });
      if (motif > 0) {
        if (half === 0) out.push({ voice: 'BOX', midi: motif, dur: spb * 8, vel: 0.55 });
        else if (b === 0) out.push({ voice: 'LEAD', midi: motif - 12, dur: spb * 8, vel: 0.6 });
      }
      break;

    case 'SEARCH':
      // 搜索：八分低音推進 + 十六分滴答 (倒數感)；動機只剩殘片
      if (b % 2 === 0) out.push({ voice: 'BASS', midi: b === 6 || b === 14 ? root + 12 : root, dur: spb * 1.6, vel: b % 8 === 0 ? 0.8 : 0.55 });
      if (b === 0 || b === 10) out.push({ voice: 'KICK', midi: 0, dur: 0.12, vel: 0.55 });
      out.push({ voice: 'HAT', midi: 0, dur: 0.03, vel: b % 4 === 0 ? 0.2 : 0.09 });
      if (b === 0) for (const p of pad) out.push({ voice: 'PAD', midi: p, dur: spb * 15, vel: 0.45 });
      if (motif > 0 && b <= 3 && (bar === 0 || bar === 2)) out.push({ voice: 'LEAD', midi: motif, dur: spb * 3, vel: 0.7 });
      break;

    case 'ALERT':
      // 警戒追捕：重拍底鼓 + 鋸齒低音八度彈跳 + 三全音警報刺擊 + 全段動機
      if (b % 4 === 0 || b === 10 || b === 14) out.push({ voice: 'HKICK', midi: 0, dur: 0.16, vel: b % 4 === 0 ? 1 : 0.7 });
      if (b === 4 || b === 12) out.push({ voice: 'SNARE', midi: 0, dur: 0.13, vel: 0.8 });
      if (b % 2 === 0) out.push({ voice: 'PBASS', midi: b % 4 === 2 ? root + 12 : root, dur: spb * 1.5, vel: b % 4 === 2 ? 0.8 : 1 });
      if (b % 4 === 2) out.push({ voice: 'OHAT', midi: 0, dur: 0.12, vel: 0.35 });
      else if (b % 2 === 1) out.push({ voice: 'HAT', midi: 0, dur: 0.03, vel: 0.25 });
      if ((b === 0 || b === 8) && bar % 2 === 1) out.push({ voice: 'STAB', midi: b === 0 ? 76 : 82, dur: spb * 3, vel: 0.8 });
      if (motif > 0) out.push({ voice: 'LEAD', midi: motif, dur: spb * 3, vel: 1 });
      break;

    case 'BOSS':
      // 鐵面進行曲：軍鼓進行曲節奏 (第四小節滾奏) + 大鼓 1、3 拍 + 根-五低音 + 銅管 (鋸齒) 低八度動機
      if (b === 0 || b === 8) out.push({ voice: 'HKICK', midi: 0, dur: 0.16, vel: 0.95 });
      if (b === 4 || b === 12) out.push({ voice: 'SNARE', midi: 0, dur: 0.13, vel: 0.85 });
      else if (bar === 3 && b >= 8) out.push({ voice: 'SNARE', midi: 0, dur: 0.1, vel: 0.3 + (b - 8) * 0.06 });
      else if (b === 14 || b === 15 || b === 7) out.push({ voice: 'SNARE', midi: 0, dur: 0.08, vel: 0.3 });
      if (b === 0) out.push({ voice: 'BASS', midi: root, dur: spb * 6, vel: 0.95 });
      if (b === 8) out.push({ voice: 'BASS', midi: root + 7, dur: spb * 6, vel: 0.8 });
      if (motif > 0) out.push({ voice: 'STAB', midi: motif - 12, dur: spb * 3, vel: 0.85 });
      if (b === 0 && half === 1) for (const p of pad) out.push({ voice: 'PAD', midi: p + 12, dur: spb * 15, vel: 0.5 });
      break;

    case 'ESCAPED':
      // 破曉越獄：E 大調，琴鍵和弦 + 輕快鼓組 + 動機轉大調
      if (b === 0 || b === 8) out.push({ voice: 'KICK', midi: 0, dur: 0.12, vel: 0.75 });
      if (b === 4 || b === 12) out.push({ voice: 'SNARE', midi: 0, dur: 0.13, vel: 0.5 });
      if (b % 2 === 0) out.push({ voice: 'HAT', midi: 0, dur: 0.03, vel: b % 4 === 0 ? 0.25 : 0.15 });
      if (b === 0 || b === 6 || b === 10) out.push({ voice: 'BASS', midi: root, dur: spb * 3, vel: 0.8 });
      if (b === 0 || b === 8) for (const p of pad) out.push({ voice: 'CHORD', midi: p + 12, dur: spb * 6, vel: 0.8 });
      if (motif > 0) out.push({ voice: half === 0 ? 'LEAD' : 'BOX', midi: motif, dur: spb * 4, vel: 0.9 });
      break;
  }
  return out;
}
