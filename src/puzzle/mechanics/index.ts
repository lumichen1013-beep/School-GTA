import type { Mechanic } from '../core/registry';
import { basics } from './basics';
import { items } from './items';
import { links } from './links';
import { plates } from './plates';
import { notes } from './notes';
import { exit } from './exit';
import { cube } from './cube';
import { sequence } from './sequence';

/** 預設機制表：陣列順序即執行順序 (afterPhysics：plates 必須在 links 之前) */
export const DEFAULT_MECHANICS: readonly Mechanic[] = [basics, items, links, plates, notes, exit, cube, sequence];
