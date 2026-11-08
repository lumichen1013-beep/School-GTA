// 重置記錄 (2026-11-08)：清除本作的存檔 (puzzle: 前綴；進度、章節存檔、道具、筆記、暱稱、已看過的過場、統計、舊版鍵…)。
// 設定 (puzzle:settings：音量、轉動方式、按鍵、小提示) 預設保留，withSettings = 一起清；不碰其他前綴 (GTA 主遊戲)
import type { KeyValueStorage } from './storage';
import { LEGACY_FOYER_KEY, SAVE_CORRUPT_KEY, SAVE_KEY } from './save';
import { SETTINGS_KEY } from './settings';
import { STATS_KEY } from './stats';

export const RECORD_PREFIX = 'puzzle:';
/** storage 沒有 keys() 時至少清這些 */
const KNOWN_KEYS: readonly string[] = [SAVE_KEY, SAVE_CORRUPT_KEY, LEGACY_FOYER_KEY, STATS_KEY, SETTINGS_KEY];

/** ok：cleared = 清掉的鍵；memory = 記憶體版 (不持久，提醒玩家)。failed：刪不掉的鍵 */
export type ResetResult = { ok: true; cleared: string[]; memory: boolean } | { ok: false; failed: string[] };

export function resetRecords(s: KeyValueStorage, opts: { withSettings: boolean }): ResetResult {
  const all = s.keys ? s.keys() : KNOWN_KEYS.filter(k => s.get(k) !== null);
  const targets = all.filter(k => k.startsWith(RECORD_PREFIX) && (opts.withSettings || k !== SETTINGS_KEY));
  const failed: string[] = [];
  for (const k of targets) {
    try { s.remove(k); } catch { failed.push(k); continue; }
    if (s.get(k) !== null) failed.push(k);
  }
  return failed.length ? { ok: false, failed } : { ok: true, cleared: targets, memory: s.persistent === false };
}
