import type { AbilityId, World } from '../core/types';
import { LEVELS, type LevelEntry } from '../content/levels';
import { ABILITY_IDS, type SaveV2 } from './save';

export type LevelState = 'locked' | 'open' | 'cleared';

/** 以 id 為 (遞移) 前置的關卡 id (登錄表 unlock.after 的反向閉包) */
function dependents(id: string, levels: readonly LevelEntry[]): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const l of levels) if (l.unlock.after.includes(cur) && !out.has(l.id)) { out.add(l.id); queue.push(l.id); }
  }
  return out;
}

/**
 * 解鎖：前置關卡全部通關；或本關 / 任何以本關為 (遞移) 前置的後續關已通關 → 保持可玩
 * (新增前置關時，例如 1-1 加在 1-2 之前，已通關 1-2 或之後關卡的存檔不被擋住)
 */
export function isUnlocked(e: LevelEntry, save: SaveV2, levels: readonly LevelEntry[] = LEVELS): boolean {
  if (e.unlock.after.every(id => save.cleared.includes(id)) || save.cleared.includes(e.id)) return true;
  for (const id of dependents(e.id, levels)) if (save.cleared.includes(id)) return true;
  return false;
}

export function levelState(e: LevelEntry, save: SaveV2, levels: readonly LevelEntry[] = LEVELS): LevelState {
  if (save.cleared.includes(e.id)) return 'cleared';
  return isUnlocked(e, save, levels) ? 'open' : 'locked';
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
