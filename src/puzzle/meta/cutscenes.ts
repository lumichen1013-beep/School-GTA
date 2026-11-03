// 過場紀錄與回憶頁規則 (cutscenes-v0.1 2.3、3；純函式)
import { CUTSCENES, PROLOGUE_ID } from '../content/cutscenes';
import type { CutsceneDef } from '../content/cutsceneTypes';
import { seenCutscenes, skippedCutscenes, type SaveV2 } from './save';

/**
 * 輸入暱稱後是否自動播序章：有暱稱、沒看過、而且還沒有任何通關進度
 * (M1C 之前就有進度的存檔不自動播，但仍可從回憶頁看)
 */
export const shouldAutoPlayPrologue = (s: SaveV2): boolean =>
  s.name !== '' && !seenCutscenes(s).includes(PROLOGUE_ID) && s.cleared.length === 0;

/**
 * 記錄一次過場結束：看完或跳過都記進 seenCutscenes；
 * 跳過且從沒看完過 → skippedCutscenes (未看完)；看完 → 從 skippedCutscenes 移除 (重看跳過不會把「已看完」降級)
 */
export function recordCutscene(s: SaveV2, id: string, skipped: boolean): SaveV2 {
  const seen = seenCutscenes(s);
  const sk = skippedCutscenes(s);
  const completedBefore = seen.includes(id) && !sk.includes(id);
  const nextSkipped = skipped ? (completedBefore || sk.includes(id) ? [...sk] : [...sk, id]) : sk.filter(x => x !== id);
  return { ...s, seenCutscenes: seen.includes(id) ? [...seen] : [...seen, id], skippedCutscenes: nextSkipped };
}

export type MemoryStatus = 'seen' | 'unfinished' | 'unseen';
export interface MemoryEntry { id: string; titleKey: string; status: MemoryStatus }

/** 觸發條件已達成 (序章：有暱稱即可；章末：該關已通關；結局：已達成) */
function reached(def: CutsceneDef, s: SaveV2): boolean {
  const t = def.trigger;
  if (t.ending) return s.endings[t.ending];
  if (t.afterClear) return s.cleared.includes(t.afterClear);
  return s.name !== '';
}

/** 回憶頁：看過 (含跳過) 或觸發條件已達成的過場；未看完 / 未看過分別標示 */
export function memoryEntries(s: SaveV2, defs: readonly CutsceneDef[] = CUTSCENES): MemoryEntry[] {
  const seen = seenCutscenes(s), sk = skippedCutscenes(s);
  return defs
    .filter(d => seen.includes(d.id) || reached(d, s))
    .map(d => ({ id: d.id, titleKey: d.titleKey, status: sk.includes(d.id) ? 'unfinished' : seen.includes(d.id) ? 'seen' : 'unseen' }));
}
