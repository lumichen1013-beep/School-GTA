// zh-Hant 文字表 (純資料)：各分檔合併
import { term } from './term';
import { msg } from './msg';
import { obj } from './obj';
import { ui } from './ui';
import { lvl12 } from './lvl-1-2';

export const zhHant: Readonly<Record<string, string>> = { ...term, ...msg, ...obj, ...ui, ...lvl12 };
