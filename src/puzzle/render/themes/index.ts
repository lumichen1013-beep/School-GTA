import { FOYER_THEME } from './foyer';
import type { Theme } from './types';

export type { Palette, Room2dPalette, Theme, ThemeLights } from './types';

/** 主題登錄表：新章節 = themes/<id>.ts + 這裡加一行 (architecture 5) */
export const THEMES: Readonly<Record<string, Theme>> = { foyer: FOYER_THEME };

/** 預設主題 (找不到主題 id 時) */
export const DEFAULT_THEME: Theme = FOYER_THEME;

/** 關卡 theme ?? 章節 theme → 主題；未登錄 id 回預設 */
export const resolveTheme = (id: string | undefined): Theme => (id !== undefined ? THEMES[id] : undefined) ?? DEFAULT_THEME;
