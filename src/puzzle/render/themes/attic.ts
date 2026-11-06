import { STUDY_PAL } from './study';
import type { Palette, Theme } from './types';

/**
 * 閣樓 (第 5 章) 配色：觀星閣樓 (story-bible 8.4；規格 6「第五章共用規則」閣樓主題色板)——舊木板牆與板縫、星圖金線、斜屋頂與椽樑、
 * 寬木板地板、皮面舊箱與銅箱角、帆布、天窗外的深靛夜色、燈火；書色、門與紙底沿用書房 (2D 藏寶圖同一張紙)。人物與機關色不變 (規格 D6)
 */
export const ATTIC_PAL: Palette = {
  ...STUDY_PAL,
  wallpaper: 0x7a6650, wallStripe: 0x5a4a3a, wallMotif: 0xc9b27f,
  wainscot: 0x6b5038, trim: 0x4a3828, baseboard: 0x3a2c20, wall2d: 0xd8ccb2,
  floorA: 0x8a7258, floorB: 0x7c664e, floorLine: 0x4e3e30, floorSide: 0x5c4a3a,
  rug: 0x5e4b3a, rugBorder: 0xb08a4a, rugInner: 0x1f2547,
  crate: 0x6e4a30, crateDark: 0x4e3422,
  shelf: 0x6b5038, shelfDark: 0x4a3828,
  table: 0x6b5038, tableTop: 0x8a6a48,
  brass: 0xb08a4a,
  lampShade: 0xb08a4a, lampBulb: 0xfff0c8, lampLight: 0xf2c46b,
  bgTop: '#f1e7d2', bgBottom: '#e2d6bc', bg3d: 0x1a1c26
};

export const ATTIC_THEME: Theme = {
  id: 'attic',
  pal: ATTIC_PAL,
  room2d: { paper: 0xf3ead6, wainscot: 0xe4d8be, trim: 0xd0c2a4, frameGold: 0xe8cf8a, canvas: 0xf8f2e2, shade: 0xecdba4, bulb: 0xfff6de },
  lights: {
    hemiSky: 0xb8c4e6, hemiGround: 0x2e2620, hemiIntensity: 0.65,
    ambient: 0xd6d8e8, ambientIntensity: 0.22,
    sun: 0xf2e2c8, sunIntensity: 0.85
  },
  transition: 'ink'
};
