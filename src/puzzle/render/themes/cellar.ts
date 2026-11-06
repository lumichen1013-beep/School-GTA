import { STUDY_PAL } from './study';
import type { Palette, Theme } from './types';

/**
 * 地下室 (第 4 章) 配色：根窖書庫 (story-bible 8.4；規格 6「第四章共用規則」地下室主題)——灰褐方石牆與灰縫、石基與鐵飾條、石板地、
 * 根梯與木架、墨爐的暗藍光、油燈；書色、門與紙底沿用書房 (2D 藏寶圖同一張紙)。人物與機關色不變 (規格 D6)
 */
export const CELLAR_PAL: Palette = {
  ...STUDY_PAL,
  wallpaper: 0x6b6258, wallStripe: 0x4e4740, wallMotif: 0x7fa6c9,
  wainscot: 0x5a524a, trim: 0x3a3633, baseboard: 0x2b2826, wall2d: 0xcfc6b4,
  floorA: 0x77706a, floorB: 0x69625c, floorLine: 0x45403b, floorSide: 0x524c46,
  rug: 0x3e4f5c, rugBorder: 0xb08a4a, rugInner: 0x2e3e4a,
  crate: 0x9a7448, crateDark: 0x6e5032,
  shelf: 0x8a6844, shelfDark: 0x553e28,
  table: 0x8a6844, tableTop: 0x9a7650,
  stone: 0x7a7066, stoneDark: 0x4e4740, stoneTop: 0x857a6e,
  lampShade: 0xb08a4a, lampBulb: 0xffe9c0, lampLight: 0xf0b860,
  bgTop: '#efe8d8', bgBottom: '#ded5c0', bg3d: 0x14161a
};

export const CELLAR_THEME: Theme = {
  id: 'cellar',
  pal: CELLAR_PAL,
  room2d: { paper: 0xf2ecde, wainscot: 0xe0d6c2, trim: 0xcbbfa8, frameGold: 0xe8cf8a, canvas: 0xf6f2e6, shade: 0xecdba4, bulb: 0xfff4dc },
  lights: {
    hemiSky: 0xc8d2e0, hemiGround: 0x2a2622, hemiIntensity: 0.7,
    ambient: 0xd8dce6, ambientIntensity: 0.2,
    sun: 0xf2e6d0, sunIntensity: 0.85
  },
  transition: 'ink'
};
