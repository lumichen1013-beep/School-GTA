import type { TransitionId } from '../transitions';

/** 材質配色：3D (有光影) 與 2D (扁平描邊色塊) 用同一套顏色，同一物件兩邊對應 */
export interface Palette {
  readonly outline: number;
  // 房間
  readonly wallpaper: number; readonly wallStripe: number; readonly wallMotif: number;
  readonly wainscot: number; readonly trim: number; readonly baseboard: number; readonly wall2d: number;
  readonly floorA: number; readonly floorB: number; readonly floorLine: number; readonly floorSide: number;
  readonly pit: number;
  readonly rug: number; readonly rugBorder: number; readonly rugInner: number;
  // 物件
  readonly crate: number; readonly crateDark: number; readonly metal: number;
  readonly shelf: number; readonly shelfDark: number;
  readonly books: readonly number[];
  readonly plinth: number; readonly plinthTrim: number; readonly plinthTop: number;
  readonly rail: number; readonly railDark: number;
  readonly table: number; readonly tableTop: number;
  readonly gate: number; readonly iron: number;
  // 門廊 (1-1)：石階、玻璃牆
  readonly stone: number; readonly stoneDark: number; readonly stoneTop: number; readonly glass: number;
  readonly door: number; readonly doorPanel: number; readonly doorFrame: number; readonly brass: number;
  readonly sealInk: number;
  readonly paperNote: number; readonly pin: number;
  readonly gold: number; readonly goldDeep: number;
  // 圖紙專屬機關：墨水藍 / 紫，發光
  readonly inkBlue: number; readonly inkPurple: number; readonly inkGlow: number; readonly inkHalo: number;
  // 製圖員
  readonly coat: number; readonly coatDark: number; readonly scarf: number; readonly beret: number;
  readonly trousers: number; readonly shoes: number; readonly skin: number; readonly cheek: number; readonly hair: number;
  readonly eye: number; readonly pen: number; readonly tube: number; readonly tubeCap: number;
  // 燈
  readonly lampShade: number; readonly lampBulb: number; readonly lampLight: number; readonly cord: number;
  // 2D 背景 (紙張漸層) / 3D 背景
  readonly bgTop: string; readonly bgBottom: string; readonly bg3d: number;
}

/** 圖紙裡的房間背景 (同色系但更淡，讓前景物件跳出來) */
export interface Room2dPalette {
  readonly paper: number; readonly wainscot: number; readonly trim: number;
  /** 掛畫金框 / 畫布、吊燈燈罩 / 燈泡在圖紙裡的淡色 */
  readonly frameGold: number; readonly canvas: number; readonly shade: number; readonly bulb: number;
}

/** 場景燈光 (氛圍切換點；色溫 / 亮度) */
export interface ThemeLights {
  readonly hemiSky: number; readonly hemiGround: number; readonly hemiIntensity: number;
  readonly ambient: number; readonly ambientIntensity: number;
  readonly sun: number; readonly sunIntensity: number;
}

/**
 * 主題 (architecture 4.5)：一章一個 (玄關 / 書房 / 溫室…)；主題切換 = 重建場景。
 * 模型 / 裝飾 / 紋理一律從主題取色，不直接 import 某個主題的常數
 */
export interface Theme {
  readonly id: string;
  readonly pal: Palette;
  readonly room2d: Room2dPalette;
  readonly lights: ThemeLights;
  /** 切換視角的過場 (render/transitions.ts 的 TRANSITIONS 鍵) */
  readonly transition: TransitionId;
}
