import type { AbilityId } from '../core/types';
import { isRecord, type KeyValueStorage } from './storage';

export const SAVE_KEY = 'puzzle:save';
export const SAVE_CORRUPT_KEY = 'puzzle:save:corrupt';
/** 舊版玄關通關旗標 (遷移後刪除) */
export const LEGACY_FOYER_KEY = 'puzzle:foyer:cleared';
export const ABILITY_IDS: readonly AbilityId[] = ['nib', 'pin', 'section', 'mark'];
export const NAME_MAX = 12;

/** 存檔 v2 (規格 8) */
export interface SaveV2 {
  v: 2;
  cleared: string[];
  current: string;
  abilities: AbilityId[];
  diary: number[];
  scraps: number[];
  endings: { A: boolean; B: boolean };
  /** 玩家暱稱；預設空字串 = 尚未輸入 (開場進暱稱畫面) */
  name: string;
}

export const defaultSave = (): SaveV2 => ({ v: 2, cleared: [], current: '', abilities: [], diary: [], scraps: [], endings: { A: false, B: false }, name: '' });

type Migration = (raw: Record<string, unknown>, s: KeyValueStorage) => Record<string, unknown>;
/** MIGRATIONS[n]：v=n → v=n+1；v0 = 沒有 puzzle:save */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 舊玄關即新 1-2；1-1 門廊視為已通過以免老玩家重教 (規格 8)
  0: (_r, s) => s.get(LEGACY_FOYER_KEY) === '1' ? { v: 1, cleared: ['1-1', '1-2'], abilities: ['nib'] } : { v: 1, cleared: [], abilities: [] },
  1: r => ({ ...defaultSave(), ...r, v: 2 })
};

const strs = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
const ints = (v: unknown, lo: number, hi: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= lo && x <= hi))].sort((a, b) => a - b) : [];

/** 校正 v2 欄位 (型別不符的欄位改回預設值)；不是物件 → null */
export function sanitizeSave(v: unknown): SaveV2 | null {
  if (!isRecord(v) || v.v !== 2) return null;
  const e = isRecord(v.endings) ? v.endings : {};
  return {
    v: 2,
    cleared: strs(v.cleared),
    current: typeof v.current === 'string' ? v.current : '',
    abilities: strs(v.abilities).filter((a): a is AbilityId => (ABILITY_IDS as readonly string[]).includes(a)),
    diary: ints(v.diary, 1, 5),
    scraps: ints(v.scraps, 1, 6),
    endings: { A: e.A === true, B: e.B === true },
    name: typeof v.name === 'string' ? cleanName(v.name) : ''
  };
}

/** 暱稱：去頭尾空白、最多 NAME_MAX 字 */
export const cleanName = (n: string): string => [...n.trim()].slice(0, NAME_MAX).join('');

export function writeSave(s: KeyValueStorage, save: SaveV2): void {
  s.set(SAVE_KEY, JSON.stringify(save));
}

/**
 * 讀存檔：依序套遷移 → 校正 → 有變動才寫回；舊 key 在成功寫回後才刪。
 * 壞資料 (JSON 失敗、不是物件、版本不明)：原字串備份到 puzzle:save:corrupt，回傳並寫入預設存檔，不丟例外。
 */
export function loadSave(s: KeyValueStorage): SaveV2 {
  const raw = s.get(SAVE_KEY);
  let data: unknown = { v: 0 };
  if (raw !== null) {
    try { data = JSON.parse(raw); } catch { return corrupt(s, raw); }
  }
  if (!isRecord(data) || !Number.isInteger(data.v) || (data.v as number) < 0 || (data.v as number) > 2) return corrupt(s, raw ?? '');
  const from = data.v as number;
  let cur: Record<string, unknown> = data;
  for (let v = from; v < 2; v++) cur = MIGRATIONS[v](cur, s);
  const save = sanitizeSave(cur);
  if (!save) return corrupt(s, raw ?? '');
  const text = JSON.stringify(save);
  if (text !== raw) writeSave(s, save);
  if (from === 0) s.remove(LEGACY_FOYER_KEY);
  return save;
}

function corrupt(s: KeyValueStorage, raw: string): SaveV2 {
  s.set(SAVE_CORRUPT_KEY, raw);
  const save = defaultSave();
  writeSave(s, save);
  return save;
}
