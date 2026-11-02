import type { DecorItem } from '../../core/types';

/** 讀裝飾的數值欄位 (缺漏 / 非有限數 → 用預設；沒有預設就丟錯，關卡資料寫錯時開發期立刻看到) */
export function num(item: DecorItem, key: string, fallback?: number): number {
  const v = item[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new Error(`decor ${item.kind}: field "${key}" must be a finite number`);
}
