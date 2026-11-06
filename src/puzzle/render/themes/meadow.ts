import { STUDY_PAL } from './study';
import type { Palette, Theme } from './types';

/**
 * 林心草地 (終章 6-1；story-bible 8.4)：老宅最深處——古樹撐開屋頂、草地、黎明的金光從枝葉間落下。
 * 骨架版只定配色與燈光 (6-1 實作時細化)；書色、門與紙底沿用書房 (2D 藏寶圖同一張紙)。人物與機關色不變 (規格 D6)
 */
export const MEADOW_PAL: Palette = {
  ...STUDY_PAL,
  wallpaper: 0x6e7a52, wallStripe: 0x5a6644, wallMotif: 0xe8c878,
  wainscot: 0x5a4a34, trim: 0x46402c, baseboard: 0x34301f, wall2d: 0xd8dcb8,
  floorA: 0x6f8a4a, floorB: 0x637c42, floorLine: 0x445a2e, floorSide: 0x4e5e34,
  rug: 0x6f8a4a, rugBorder: 0xe8c878, rugInner: 0x445a2e,
  crate: 0x7a5a3a, crateDark: 0x5a4028,
  stone: 0x8a8670, stoneDark: 0x5e5a48, stoneTop: 0x9a967e,
  lampShade: 0xe8c878, lampBulb: 0xfff4d0, lampLight: 0xf6d690,
  bgTop: '#f2eed6', bgBottom: '#e2e2c2', bg3d: 0x2a2a22
};

export const MEADOW_THEME: Theme = {
  id: 'meadow',
  pal: MEADOW_PAL,
  room2d: { paper: 0xf2f2de, wainscot: 0xe0e2c6, trim: 0xccd0aa, frameGold: 0xf0d58a, canvas: 0xf8f8ea, shade: 0xf0dfa4, bulb: 0xfff7dc },
  lights: {
    hemiSky: 0xf6e6c0, hemiGround: 0x3a3a24, hemiIntensity: 0.85,
    ambient: 0xf0e8d0, ambientIntensity: 0.26,
    sun: 0xffe2a8, sunIntensity: 1.05
  },
  transition: 'ink'
};
