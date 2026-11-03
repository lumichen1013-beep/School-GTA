// zh-Hant 文字表 (純資料)：各分檔合併
import { term } from './term';
import { msg } from './msg';
import { obj } from './obj';
import { ui } from './ui';
import { lvl11 } from './lvl-1-1';
import { lvl12 } from './lvl-1-2';
import { lvl13 } from './lvl-1-3';
import { lvlCh1 } from './lvl-ch1';
import { ch } from './ch';
import { csPrologue } from './cs-prologue';

export const zhHant: Readonly<Record<string, string>> = { ...term, ...msg, ...obj, ...ui, ...ch, ...lvl11, ...lvl12, ...lvl13, ...lvlCh1, ...csPrologue };
