import { STUDY_PAL } from './study';
import type { Palette, Theme } from './types';

/**
 * 溫室 (第 3 章) 配色：彩繪玻璃溫室 (story-bible 8.2 / 8.4)——玻璃框後的苔綠牆、陶磚矮牆與墨綠鐵框、石板地、蜂蜜木的架子與工作台、
 * 陶盆、彩繪玻璃透進來的森林綠與琥珀光、淡青螢光；書色、門與紙底沿用書房 (2D 藏寶圖同一張紙)。人物與機關色不變 (規格 D6)
 */
export const GREENHOUSE_PAL: Palette = {
  ...STUDY_PAL,
  wallpaper: 0x5e7a5a, wallStripe: 0x55704f, wallMotif: 0x9fe3d0,
  wainscot: 0x9a5a3e, trim: 0x3e4a3a, baseboard: 0x2f3a2c, wall2d: 0xcfd8b0,
  floorA: 0x8c8470, floorB: 0x7a7360, floorLine: 0x4f4a3c, floorSide: 0x5e584a,
  rug: 0x6e7f3a, rugBorder: 0xd9a441, rugInner: 0x3e8a5a,
  crate: 0xb5623e, crateDark: 0x8a4630,
  shelf: 0xa8743f, shelfDark: 0x6b4a2f,
  table: 0xa8743f, tableTop: 0xb8864f,
  glass: 0x9fd8c0,
  lampShade: 0xd9a441, lampBulb: 0xfff2c8, lampLight: 0xf2c46b,
  bgTop: '#eef3dc', bgBottom: '#dfe6c4', bg3d: 0x16241c
};

export const GREENHOUSE_THEME: Theme = {
  id: 'greenhouse',
  pal: GREENHOUSE_PAL,
  room2d: { paper: 0xf0f4e0, wainscot: 0xdde4c4, trim: 0xc6d0a8, frameGold: 0xf0d58a, canvas: 0xf6f8ea, shade: 0xf0dfa4, bulb: 0xfff7dc },
  lights: {
    hemiSky: 0xd8f0d0, hemiGround: 0x2e3a26, hemiIntensity: 0.8,
    ambient: 0xe0f5d8, ambientIntensity: 0.24,
    sun: 0xf6ffe0, sunIntensity: 1.0
  },
  transition: 'ink'
};
