// 文字系統 (L2')：key → 字串；純函式，不 import 任何其他層

/** 文字表：key → 原文 (可含 {param} 插值與 [[term.*]] 詞彙引用) */
export type TextBundle = Readonly<Record<string, string>>;
export type TextParams = Readonly<Record<string, string | number>>;

export interface Text {
  (key: string, params?: TextParams): string;
  has(key: string): boolean;
}

const TERM_RE = /\[\[([\w.-]+)\]\]/g;
const PARAM_RE = /\{(\w+)\}/g;

/**
 * 建立解析器：bundle 找不到 → fallback → 回傳 key 本身 (未登錄的字面值原樣顯示)。
 * 插值 {name}；詞彙引用 [[term.nib]] 展開為該 key 的字串 (只展開一層)。
 */
export function createText(bundle: TextBundle, fallback: TextBundle = {}): Text {
  const raw = (key: string): string | undefined => bundle[key] ?? fallback[key];
  const t = ((key: string, params?: TextParams): string => {
    const s = raw(key);
    if (s === undefined) return key;
    const expanded = s.replace(TERM_RE, (m, ref: string) => raw(ref) ?? m);
    return params ? expanded.replace(PARAM_RE, (m, p: string) => (p in params ? String(params[p]) : m)) : expanded;
  }) as Text;
  t.has = (key: string): boolean => raw(key) !== undefined;
  return t;
}
