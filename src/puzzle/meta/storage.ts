/** 鍵值儲存介面 (app 注入 localStorage 包裝；測試用記憶體版) */
export interface KeyValueStorage {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
  /** 目前存著的鍵 (重置記錄用；沒提供 = 只清已知的鍵) */
  keys?(): string[];
  /** false = 記憶體版 (localStorage 不可用：關掉頁面就沒了，重置後要提醒) */
  persistent?: boolean;
}

/** 記憶體儲存 (測試 / localStorage 不可用時) */
export function memoryStorage(init: Readonly<Record<string, string>> = {}): KeyValueStorage & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(init));
  return {
    get: k => m.get(k) ?? null,
    set: (k, v) => { m.set(k, v); },
    remove: k => { m.delete(k); },
    keys: () => [...m.keys()],
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
