/** 鍵值儲存介面 (app 注入 localStorage 包裝；測試用記憶體版) */
export interface KeyValueStorage {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
}

/** 記憶體儲存 (測試 / localStorage 不可用時) */
export function memoryStorage(init: Readonly<Record<string, string>> = {}): KeyValueStorage & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get: k => m.get(k) ?? null,
    set: (k, v) => { m.set(k, v); },
    remove: k => { m.delete(k); },
    dump: () => Object.fromEntries(m)
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 讀 JSON：不存在 → undefined；解析失敗 → 'corrupt' */
export function readJson(s: KeyValueStorage, key: string): Record<string, unknown> | undefined | 'corrupt' {
  const raw = s.get(key);
  if (raw === null) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    return isRecord(v) ? v : 'corrupt';
  } catch {
    return 'corrupt';
  }
}

export { isRecord };
