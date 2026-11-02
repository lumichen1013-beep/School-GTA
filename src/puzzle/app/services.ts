import type { KeyValueStorage } from '../meta/storage';
import { memoryStorage } from '../meta/storage';

/** 本作在 localStorage 只用這個前綴 (與 GTA 主遊戲隔離) */
export const STORAGE_PREFIX = 'puzzle:';

/** localStorage 包裝：只允許 puzzle: 前綴；不可用 (隱私模式等) 時退回記憶體 */
export function browserStorage(): KeyValueStorage {
  let ls: Storage;
  try {
    ls = window.localStorage;
    ls.getItem(STORAGE_PREFIX + 'probe');
  } catch {
    return memoryStorage();
  }
  const guard = (k: string): string => {
    if (!k.startsWith(STORAGE_PREFIX)) throw new Error(`storage key must start with ${STORAGE_PREFIX}: ${k}`);
    return k;
  };
  return {
    get: k => ls.getItem(guard(k)),
    set: (k, v) => { try { ls.setItem(guard(k), v); } catch { /* 配額已滿：本次不存 */ } },
    remove: k => ls.removeItem(guard(k))
  };
}
