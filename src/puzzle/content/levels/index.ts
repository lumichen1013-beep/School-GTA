import type { AbilityId, LevelDef } from '../../core/types';
import { foyer } from './ch1/1-2-foyer';

/** 線性解鎖：after 中的關卡全部通關才開放 (規格 8；5-5 = after ['5-2','5-3','5-4']) */
export interface Unlock { after: readonly string[] }

/** 關卡登錄表的一筆 (id 用規格編號) */
export interface LevelEntry {
  id: string;
  chapter: number;
  titleKey: string;
  /** 本關開場允許的能力白名單 (重玩規則：防新能力破解舊關) */
  abilities: readonly AbilityId[];
  unlock: Unlock;
  load(): LevelDef;
}

/**
 * 已實作的關卡 (順序 = 選單順序)。
 * 1-2 玄關：現有關卡 (規格 6「1-2 玄關 (levels/foyer.ts)」、8 節遷移「舊玄關即新 1-2」)。
 * 1-1 門廊尚未實作，所以 1-2 暫無前置；加入 1-1 時改為 after: ['1-1']。
 */
export const LEVELS: readonly LevelEntry[] = [
  { id: '1-2', chapter: 1, titleKey: 'lvl.1-2.title', abilities: [], unlock: { after: [] }, load: () => foyer }
];

export const levelById = (id: string): LevelEntry | undefined => LEVELS.find(e => e.id === id);
