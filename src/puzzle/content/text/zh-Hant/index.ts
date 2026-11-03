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
import { lvlProto } from './lvl-proto';
import { lvl21 } from './lvl-2-1';
import { lvlCh2 } from './lvl-ch2';
import { uiSound } from './ui-sound';
import { lvl22 } from './lvl-2-2';
import { lvl23 } from './lvl-2-3';

export const zhHant: Readonly<Record<string, string>> = { ...term, ...msg, ...obj, ...ui, ...ch, ...lvl11, ...lvl12, ...lvl13, ...lvlCh1, ...csPrologue, ...lvlProto, ...lvl21, ...lvl22, ...lvl23, ...lvlCh2, ...uiSound };
