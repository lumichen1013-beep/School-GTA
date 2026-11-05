import type { AbilityId, World } from '../core/types';
import { LEVELS, type LevelEntry } from '../content/levels';
import { ABILITY_IDS, type Save } from './save';

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
export function isUnlocked(e: LevelEntry, save: Save, levels: readonly LevelEntry[] = LEVELS): boolean {
  if (e.unlock.after.every(id => save.cleared.includes(id)) || save.cleared.includes(e.id)) return true;
  for (const id of dependents(e.id, levels)) if (save.cleared.includes(id)) return true;
  return false;
}

export function levelState(e: LevelEntry, save: Save, levels: readonly LevelEntry[] = LEVELS): LevelState {
  if (save.cleared.includes(e.id)) return 'cleared';
  return isUnlocked(e, save, levels) ? 'open' : 'locked';
}

/** v0.4 選單列不列這一關：隱藏房 (LevelEntry.hidden) 在解鎖前不列 (不劇透)；其餘一律列 */
export const listedInMenu = (e: LevelEntry, save: Save, levels: readonly LevelEntry[] = LEVELS): boolean => !e.hidden || levelState(e, save, levels) !== 'locked';

/**
 * 章門打開 (整章通關) 時一併記為通關的關卡 = 這一章的關卡 (CubeChapter.levels 的鍵) 去掉隱藏房 (v0.4 H1：第二章通關只記 2-1～2-5；
 * 隱藏房只由它自己的房間通關記入)
 */
export const chapterClearAlso = (chapterLevels: Readonly<Record<string, string>>, levels: readonly LevelEntry[] = LEVELS): string[] =>
  Object.keys(chapterLevels).filter(id => !levels.find(l => l.id === id)?.hidden);

/** 開場可用能力 = 關卡白名單 ∩ 存檔已得能力 */
export const startAbilities = (e: LevelEntry, save: Save): AbilityId[] => e.abilities.filter(a => save.abilities.includes(a));

/** 持有物中的許問津手記 (物品 id diary.<頁>) → 頁碼 */
const diaryPages = (w: World): number[] => Object.keys(w.inv).map(id => /^diary\.([1-5])$/.exec(id)).filter((m): m is RegExpExecArray => m !== null && (w.inv[m[0]] ?? 0) > 0).map(m => Number(m[1]));

/** 持有物中的老宅圖殘片 (物品 id scrap.<n>) → 編號 */
const scrapNumbers = (w: World): number[] => Object.keys(w.inv).map(id => /^scrap\.([1-6])$/.exec(id)).filter((m): m is RegExpExecArray => m !== null && (w.inv[m[0]] ?? 0) > 0).map(m => Number(m[1]));

/** 通關的種類：level = 單房關卡的出口 (1-1)；chapter = 魔方章的章門 (整章結束，1-3)；room = 章內的房間通關 (2-1 三題都完成) */
export type ClearKind = 'level' | 'chapter' | 'room';

/**
 * 通關畫面的「繼續」(純函式)：level → 同章登錄的下一關 (章末 → 下一章第一關)；chapter → 下一章登錄的第一關；
 * room → 回到同一關 (接著本章存檔玩)；沒有下一步 = null
 */
export function nextAfterClear(levelId: string, kind: ClearKind, chapters: readonly { id: number; levels: readonly string[] }[], levels: readonly LevelEntry[] = LEVELS): string | null {
  if (kind === 'room') return levelId;
  const e = levels.find(l => l.id === levelId);
  if (!e) return null;
  const known = (id: string) => levels.some(l => l.id === id);
  if (kind === 'level') {
    const own = chapters.find(c => c.id === e.chapter)?.levels ?? [];
    const after = own.slice(own.indexOf(levelId) + 1).find(known);
    if (own.includes(levelId) && after) return after;
  }
  const next = chapters.filter(c => c.id > e.chapter).sort((a, b) => a.id - b.id)[0];
  return next?.levels.find(known) ?? null;
}

/**
 * 通關後的新存檔：記通關 (also = 一併記為通關的關卡，例：章門打開 = 整章的房間都過了)、目前關卡、本關持有的能力 (例：玄關的筆尖)、
 * 持有的手記頁 (收集物，例：1-3a 的手記第一頁)、老宅圖殘片 (例：2-1a 隱藏點的殘片 1)
 */
export function recordClear(save: Save, levelId: string, w: World, also: readonly string[] = []): Save {
  const got = [...w.abilities, ...ABILITY_IDS.filter(a => (w.inv[a] ?? 0) > 0)];
  const cleared = [...save.cleared];
  for (const id of [...also, levelId]) if (!cleared.includes(id)) cleared.push(id);
  const pages = diaryPages(w);
  const scraps = scrapNumbers(w);
  return {
    ...save,
    cleared,
    current: levelId,
    abilities: ABILITY_IDS.filter(a => save.abilities.includes(a) || got.includes(a)),
    ...(pages.length ? { diary: [...new Set([...save.diary, ...pages])].sort((a, b) => a - b) } : {}),
    ...(scraps.length ? { scraps: [...new Set([...save.scraps, ...scraps])].sort((a, b) => a - b) } : {})
  };
}
