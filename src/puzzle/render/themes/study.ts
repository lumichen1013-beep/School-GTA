import { FOYER_PAL } from './foyer';
import type { Palette, Theme } from './types';

/**
 * 書房 (第 2 章) 配色：森林中的圖書館 (story-bible 8.2 / 8.4「高聳書庫」)——胡桃 / 蜂蜜木的書架、苔綠與橄欖的樹根、
 * 暖黃燈火、彩繪玻璃的森林綠光；紙底與描邊沿用玄關 (2D 藏寶圖同一張紙)。人物與機關色不變 (同外觀 = 同規則，規格 D6)
 */
export const STUDY_PAL: Palette = {
  ...FOYER_PAL,
  wallpaper: 0x5f6a46, wallStripe: 0x56603f, wallMotif: 0x7a9a4a,
  wainscot: 0x6b4a2f, trim: 0x4e3420, baseboard: 0x3e2a1a, wall2d: 0xc9c08f,
  floorA: 0x8a5e38, floorB: 0x734c2c, floorLine: 0x4a3020, floorSide: 0x5a3c24,
  rug: 0x3e6a4a, rugBorder: 0xd9a441, rugInner: 0x7a2f2a,
  shelf: 0x6b4a2f, shelfDark: 0x4a321f,
  books: [0x8c3b2e, 0x2f5d4a, 0xb8873a, 0x3e4f7a, 0x6e7f3a, 0x7a4a6a, 0xa8743f, 0x46705e],
  table: 0x6b4a2f, tableTop: 0x8a5e38,
  lampShade: 0xf2c46b, lampBulb: 0xfff2c8, lampLight: 0xf2c46b,
  bgTop: '#f6eed8', bgBottom: '#ebdcb8', bg3d: 0x1f2a1e
};

export const STUDY_THEME: Theme = {
  id: 'study',
  pal: STUDY_PAL,
  room2d: { paper: 0xf6f0de, wainscot: 0xe3d6b2, trim: 0xd2c194, frameGold: 0xf0d58a, canvas: 0xfaf3e2, shade: 0xf5dc9e, bulb: 0xfff7dc },
  lights: {
    hemiSky: 0xe8f0d0, hemiGround: 0x3e2a1a, hemiIntensity: 0.75,
    ambient: 0xffe2b0, ambientIntensity: 0.22,
    sun: 0xfff0cf, sunIntensity: 1.05
  },
  transition: 'ink'
};
