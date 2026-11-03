import { isRecord, readJson, type KeyValueStorage } from './storage';

export const SETTINGS_KEY = 'puzzle:settings';

/** 設定 (規格 8)；calmTension 只預留欄位，效果於氛圍 / 追逐實作時接上 */
export interface Settings {
  hints: 'timed' | 'always' | 'off';
  guideMode: boolean;
  calmTension: boolean;
  noteScale: number;
  inkPalette: 'default' | 'blueOrange' | 'mono';
  reduceMotion: boolean;
  /** 過場自動播放 (預設關：手動推進) */
  autoAdvance: boolean;
  /** 過場文字速度：一般每秒 6 字、慢 4.5 字 */
  textSpeed: 'normal' | 'slow';
  /** 跳過過場前確認 (預設開) */
  skipConfirm: boolean;
  /** 按鍵覆寫：動作 / 軸名稱 → KeyboardEvent.code 清單 (由 input 的 mergeBindings 合併) */
  keys: Record<string, string[]>;
  /** 操作說明面板展開 (預設收合：只留「H：操作說明」小鈕；H / 點小鈕切換) */
  helpOpen: boolean;
  /** 已顯示過的一次性操作小提示 (app/helpModel 的 TipId；第一次遇到新操作時說一次) */
  tipsSeen: string[];
  /** 音量 0～1 (總 / 音樂 / 音效；audio-design 4) 與靜音 */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mute: boolean;
}

export const defaultSettings = (): Settings => ({
  hints: 'timed', guideMode: false, calmTension: false, noteScale: 1, inkPalette: 'default', reduceMotion: false,
  autoAdvance: false, textSpeed: 'normal', skipConfirm: true, keys: {}, helpOpen: false, tipsSeen: [],
  masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.8, mute: false
});

const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts as readonly unknown[]).includes(v) ? v as T : d;
const bool = (v: unknown, d: boolean): boolean => typeof v === 'boolean' ? v : d;
/** 0～1 的音量：不是有限數字 → 預設；越界 → 夾住 */
const unit = (v: unknown, d: number): number => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;

/** 校正：不認得 / 型別不符的欄位回預設值 */
export function sanitizeSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!isRecord(v)) return d;
  const keys: Record<string, string[]> = {};
  if (isRecord(v.keys)) {
    for (const [k, codes] of Object.entries(v.keys)) {
      if (Array.isArray(codes) && codes.length && codes.every(c => typeof c === 'string')) keys[k] = [...codes];
    }
  }
  return {
    hints: oneOf(v.hints, ['timed', 'always', 'off'] as const, d.hints),
    guideMode: bool(v.guideMode, d.guideMode),
    calmTension: bool(v.calmTension, d.calmTension),
    noteScale: typeof v.noteScale === 'number' && v.noteScale >= 0.8 && v.noteScale <= 1.6 ? v.noteScale : d.noteScale,
    inkPalette: oneOf(v.inkPalette, ['default', 'blueOrange', 'mono'] as const, d.inkPalette),
    reduceMotion: bool(v.reduceMotion, d.reduceMotion),
    autoAdvance: bool(v.autoAdvance, d.autoAdvance),
    textSpeed: oneOf(v.textSpeed, ['normal', 'slow'] as const, d.textSpeed),
    skipConfirm: bool(v.skipConfirm, d.skipConfirm),
    keys,
    helpOpen: bool(v.helpOpen, d.helpOpen),
    tipsSeen: Array.isArray(v.tipsSeen) ? [...new Set(v.tipsSeen.filter((t): t is string => typeof t === 'string'))] : d.tipsSeen,
    masterVolume: unit(v.masterVolume, d.masterVolume),
    musicVolume: unit(v.musicVolume, d.musicVolume),
    sfxVolume: unit(v.sfxVolume, d.sfxVolume),
    mute: bool(v.mute, d.mute)
  };
}

export function loadSettings(s: KeyValueStorage): Settings {
  const r = readJson(s, SETTINGS_KEY);
  return sanitizeSettings(r === 'corrupt' ? undefined : r);
}

export function writeSettings(s: KeyValueStorage, v: Settings): void {
  s.set(SETTINGS_KEY, JSON.stringify(sanitizeSettings(v)));
}
