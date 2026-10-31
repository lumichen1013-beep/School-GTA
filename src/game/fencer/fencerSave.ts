// 花劍客劇情進度存檔 (localStorage，獨立鍵；專案原本沒有 Progression 存檔，零用錢等仍為單次遊玩)：
// 開戰次數 (= 任務揭露段)、首勝、勝場、上場結果、10 句進度、溫情句已播、閃身步老師彩蛋已看。
// 解析容錯：缺欄位 / 型別錯 / 壞 JSON 一律回預設值 (舊存檔或首次啟動 = 全新進度)。

import type { FightResult } from './fencerRules';
import { FENCER, fencerQuestStage } from './fencerRules';

export const FENCER_SAVE_KEY = 'school-gta.fencer-story';

export interface FencerSave {
  fightsStarted: number;
  defeated: boolean;
  wins: number;
  lastResult: FightResult;
  pokes: number;
  warmLineShown: boolean;
  dodgeEggShown: boolean;
  /** 已發現怪苗 (第一次戳到)；發現前大地圖 / 任務看板不顯示 */
  discovered: boolean;
}

export function defaultFencerSave(): FencerSave {
  return { fightsStarted: 0, defeated: false, wins: 0, lastResult: 'NONE', pokes: 0, warmLineShown: false, dodgeEggShown: false, discovered: false };
}

const int = (v: unknown, max: number): number => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0);
const bool = (v: unknown): boolean => v === true;

export function parseFencerSave(raw: string | null | undefined): FencerSave {
  const s = defaultFencerSave();
  if (!raw) return s;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return s;
    o = parsed as Record<string, unknown>;
  } catch {
    return s;
  }
  s.defeated = bool(o.defeated);
  s.wins = int(o.wins, 1e6);
  s.fightsStarted = int(o.fightsStarted, 1e6);
  s.pokes = int(o.pokes, FENCER.TAUNT_COUNT);
  s.warmLineShown = bool(o.warmLineShown);
  s.dodgeEggShown = bool(o.dodgeEggShown);
  s.discovered = bool(o.discovered);
  s.lastResult = o.lastResult === 'WIN' || o.lastResult === 'LOSS' ? o.lastResult : 'NONE';
  // 一致性：贏過 → 至少開戰 1 次、勝場 ≥ 1；開戰過但沒結果 (中途關閉) → 視為敗；從未開戰 → 無結果
  if (s.defeated) {
    s.wins = Math.max(1, s.wins);
    s.fightsStarted = Math.max(1, s.fightsStarted);
  }
  if (s.fightsStarted > 0 && s.lastResult === 'NONE') s.lastResult = s.defeated ? 'WIN' : 'LOSS';
  if (s.fightsStarted === 0) s.lastResult = 'NONE';
  if (!s.defeated) s.warmLineShown = false;
  // 舊存檔 (無 discovered 欄位)：戳過 / 開過戰 / 贏過必定已發現
  if (s.pokes > 0 || s.fightsStarted > 0 || s.defeated) s.discovered = true;
  return s;
}

export function serializeFencerSave(s: FencerSave): string {
  return JSON.stringify({
    v: 1, fightsStarted: s.fightsStarted, defeated: s.defeated, wins: s.wins, lastResult: s.lastResult,
    pokes: s.pokes, warmLineShown: s.warmLineShown, dodgeEggShown: s.dodgeEggShown, discovered: s.discovered
  });
}

export function questStageOf(s: FencerSave): 0 | 1 | 2 {
  return fencerQuestStage(s.fightsStarted, s.defeated);
}

export function loadFencerSave(): FencerSave {
  try {
    return parseFencerSave(typeof window !== 'undefined' ? window.localStorage.getItem(FENCER_SAVE_KEY) : null);
  } catch {
    return defaultFencerSave();
  }
}

export function storeFencerSave(s: FencerSave) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(FENCER_SAVE_KEY, serializeFencerSave(s));
  } catch { /* 無痕模式等無法寫入時僅本次生效 */ }
}
