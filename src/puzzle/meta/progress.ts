import type { AbilityId, World } from '../core/types';
import type { LevelEntry } from '../content/levels';
import { ABILITY_IDS, type SaveV2 } from './save';

export type LevelState = 'locked' | 'open' | 'cleared';

/** 線性解鎖：前置關卡全部通關 */
export const isUnlocked = (e: LevelEntry, save: SaveV2): boolean => e.unlock.after.every(id => save.cleared.includes(id));

export function levelState(e: LevelEntry, save: SaveV2): LevelState {
  if (save.cleared.includes(e.id)) return 'cleared';
  return isUnlocked(e, save) ? 'open' : 'locked';
}

/** 開場可用能力 = 關卡白名單 ∩ 存檔已得能力 */
export const startAbilities = (e: LevelEntry, save: SaveV2): AbilityId[] => e.abilities.filter(a => save.abilities.includes(a));

/** 通關後的新存檔：記通關、目前關卡、本關持有的能力 (例：玄關的筆尖) */
export function recordClear(save: SaveV2, levelId: string, w: World): SaveV2 {
  const got = [...w.abilities, ...ABILITY_IDS.filter(a => (w.inv[a] ?? 0) > 0)];
  return {
    ...save,
    cleared: save.cleared.includes(levelId) ? save.cleared : [...save.cleared, levelId],
    current: levelId,
    abilities: ABILITY_IDS.filter(a => save.abilities.includes(a) || got.includes(a))
  };
}
