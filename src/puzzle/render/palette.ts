// 《圖紙之間》共用配色：3D (有光影) 與 2D (扁平描邊色塊) 用同一套顏色，同一物件兩邊對應
export const PAL = {
  outline: 0x3a2618,
  // 房間
  wallpaper: 0xf0dcb8, wallStripe: 0xe4c795, wallMotif: 0xd99a6c,
  wainscot: 0x9a6440, trim: 0x704426, baseboard: 0x5e3a22, wall2d: 0xdcae78,
  floorA: 0xd39c5f, floorB: 0xbb8247, floorLine: 0x7d5230, floorSide: 0x8a5a33,
  pit: 0x2a1d14,
  rug: 0xc0503f, rugBorder: 0xf0c27a, rugInner: 0x2f6f73,
  // 物件
  crate: 0xd9a462, crateDark: 0x9f6b39, metal: 0x8d96a0,
  shelf: 0x8b5a2b, shelfDark: 0x6a4120,
  books: [0xd9534f, 0x3f88c5, 0xf2b134, 0x6aa84f, 0x9b59b6, 0xe67e22, 0x2a9d8f, 0xf06292],
  plinth: 0x7fb0a0, plinthTrim: 0x5a8a7b, plinthTop: 0xe8d9b5,
  rail: 0xb07440, railDark: 0x84522b,
  table: 0xa8693a, tableTop: 0xc2844e,
  gate: 0x8a5531, iron: 0x4d4f5c,
  door: 0x4f8a72, doorPanel: 0x3f735e, doorFrame: 0x704426, brass: 0xf0c050,
  sealInk: 0x15110f,
  paperNote: 0xfff6de, pin: 0xd64545,
  gold: 0xf5c242, goldDeep: 0xd99a1e,
  // 圖紙專屬機關：墨水藍 / 紫，發光
  inkBlue: 0x3d63ff, inkPurple: 0x9a4dff, inkGlow: 0x8fd6ff, inkHalo: 0x6f8dff,
  // 製圖員
  coat: 0xe7a83d, coatDark: 0xc4862a, scarf: 0xd94b45, beret: 0x2f7a80,
  trousers: 0x55657a, shoes: 0x5d3b24, skin: 0xf6caa4, cheek: 0xf09a8a, hair: 0x5b3a26,
  eye: 0x2a1d14, pen: 0x3049a8, tube: 0x6fa8c8, tubeCap: 0x8b5a2b,
  // 燈
  lampShade: 0xf2b84b, lampBulb: 0xfff2c0, lampLight: 0xffc27a, cord: 0x3a2a1e,
  // 2D 背景 (奶油色紙張漸層)
  bgTop: '#fcf3df', bgBottom: '#f4d9b6', bg3d: 0x3b2a1d
} as const;

export const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
